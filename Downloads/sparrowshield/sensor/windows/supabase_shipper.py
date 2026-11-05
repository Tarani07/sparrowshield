#!/usr/bin/env python3
"""
SparrowShield — Supabase Shipper (Day 5)
Batches OCSF events and ships them to Supabase every 5 seconds.
Retries on failure with exponential backoff. Works fully offline —
events queue locally until connectivity is restored.
"""

import gzip
import json
import logging
import os
import queue
import threading
import time
from collections import deque
from datetime import datetime, timezone
from typing import Optional

import requests

SUPABASE_URL     = os.environ.get("SUPABASE_URL", "")
SUPABASE_ANON    = os.environ.get("SUPABASE_ANON_KEY", "")
SHIP_INTERVAL_S  = 5
BATCH_MAX        = 200      # max events per POST
OFFLINE_MAX      = 50_000   # local queue cap before oldest events are dropped
RETRY_MAX        = 5
RETRY_BASE_S     = 2.0


class SupabaseShipper(threading.Thread):
    """
    Consumes OCSF dicts from ship_queue, batches them, and POSTs
    to Supabase `edr_events` table every SHIP_INTERVAL_S seconds.
    """

    def __init__(
        self,
        ship_queue: queue.Queue,
        supabase_url: str = SUPABASE_URL,
        anon_key:     str = SUPABASE_ANON,
        device_uid:   str = "",
    ):
        super().__init__(daemon=True, name="SupabaseShipper")
        self._q           = ship_queue
        self._url         = supabase_url.rstrip("/")
        self._anon        = anon_key
        self._device_uid  = device_uid
        self._offline_buf: deque = deque(maxlen=OFFLINE_MAX)
        self._session     = requests.Session()
        self._session.headers.update({
            "apikey":        anon_key,
            "Authorization": f"Bearer {anon_key}",
            "Content-Type":  "application/json",
            "Prefer":        "return=minimal",
        })

    def run(self):
        while True:
            time.sleep(SHIP_INTERVAL_S)
            self._drain_and_ship()

    def _drain_and_ship(self):
        # Collect from live queue
        batch: list[dict] = []
        while len(batch) < BATCH_MAX:
            try:
                batch.append(self._q.get_nowait())
            except queue.Empty:
                break

        # Prepend offline buffer (oldest first)
        if self._offline_buf:
            prepend = []
            while self._offline_buf and len(prepend) + len(batch) < BATCH_MAX:
                prepend.append(self._offline_buf.popleft())
            batch = prepend + batch

        if not batch:
            return

        rows = [self._to_row(evt) for evt in batch]
        success = self._post_with_retry(rows)

        if not success:
            # Park events back in offline buffer (right side = newest)
            for row in rows:
                self._offline_buf.append(row)
            logging.warning(
                "Ship failed — %d events parked offline (buffer=%d).",
                len(rows), len(self._offline_buf)
            )

    def _to_row(self, evt: dict) -> dict:
        return {
            "device_uid":    self._device_uid,
            "ocsf_class_uid": evt.get("class_uid"),
            "activity_id":   evt.get("activity_id"),
            "severity_id":   evt.get("severity_id", 1),
            "threat_score":  evt.get("unmapped", {}).get("threat_score", 0.0),
            "alert_type":    evt.get("unmapped", {}).get("alert_type", ""),
            "pid":           (evt.get("process") or evt.get("actor", {}).get("process", {})).get("pid"),
            "process_name":  (evt.get("process") or {}).get("name", ""),
            "cmdline":       (evt.get("process") or {}).get("cmd_line", ""),
            "image_path":    ((evt.get("process") or {}).get("file") or {}).get("path", ""),
            "src_ip":        (evt.get("src_endpoint") or {}).get("ip", ""),
            "dst_ip":        (evt.get("dst_endpoint") or {}).get("ip", ""),
            "dst_port":      (evt.get("dst_endpoint") or {}).get("port"),
            "file_path":     (evt.get("file") or {}).get("path", ""),
            "ocsf_json":     json.dumps(evt),
            "event_time":    datetime.now(timezone.utc).isoformat(),
        }

    def _post_with_retry(self, rows: list[dict]) -> bool:
        endpoint = f"{self._url}/rest/v1/edr_events"
        body     = json.dumps(rows).encode()

        for attempt in range(1, RETRY_MAX + 1):
            try:
                resp = self._session.post(
                    endpoint,
                    data=body,
                    timeout=10,
                )
                if resp.status_code in (200, 201):
                    logging.debug("Shipped %d events (attempt %d).", len(rows), attempt)
                    return True
                logging.warning(
                    "Supabase returned %d on attempt %d: %s",
                    resp.status_code, attempt, resp.text[:200]
                )
            except requests.RequestException as exc:
                logging.warning("Ship attempt %d failed: %s", attempt, exc)

            if attempt < RETRY_MAX:
                time.sleep(RETRY_BASE_S * (2 ** (attempt - 1)))

        return False
