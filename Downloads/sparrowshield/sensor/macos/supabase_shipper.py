#!/usr/bin/env python3
"""
SparrowShield — Supabase Shipper (macOS)
Batches OCSF events and ships them to Supabase every 5 seconds.
Retries on failure with exponential backoff. Works fully offline —
events queue locally until connectivity is restored.
"""

from __future__ import annotations

import json
import logging
import queue
import threading
import time
from collections import deque
from datetime import datetime, timezone

import requests

log = logging.getLogger(__name__)

SHIP_INTERVAL_S = 5
BATCH_MAX       = 200       # max events per POST
OFFLINE_MAX     = 50_000    # local deque cap
RETRY_MAX       = 5
RETRY_BASE_S    = 2.0


class SupabaseShipper(threading.Thread):
    """
    Daemon thread: drains an OCSF event queue every SHIP_INTERVAL_S seconds,
    batches up to BATCH_MAX rows, and POSTs to Supabase `edr_events`.
    Failed batches are held in an offline deque and retried on the next cycle.
    """

    def __init__(
        self,
        ship_queue:   queue.Queue,
        supabase_url: str = "",
        anon_key:     str = "",
        device_uid:   str = "",
    ):
        super().__init__(daemon=True, name="SupabaseShipper")
        self._q          = ship_queue
        self._url        = supabase_url.rstrip("/")
        self._anon       = anon_key
        self._device_uid = device_uid
        self._offline:   deque = deque(maxlen=OFFLINE_MAX)
        self._session    = requests.Session()
        self._session.headers.update({
            "apikey":        anon_key,
            "Authorization": f"Bearer {anon_key}",
            "Content-Type":  "application/json",
            "Prefer":        "return=minimal",
        })

    def run(self) -> None:
        while True:
            time.sleep(SHIP_INTERVAL_S)
            try:
                self._drain_and_ship()
            except Exception as exc:
                log.error("SupabaseShipper loop error: %s", exc)

    # ── Internal ──────────────────────────────────────────────────────────────

    def _drain_and_ship(self) -> None:
        batch: list[dict] = []

        # Drain live queue first
        while len(batch) < BATCH_MAX:
            try:
                batch.append(self._q.get_nowait())
            except queue.Empty:
                break

        # Prepend offline buffer (oldest first) to fill remaining capacity
        if self._offline:
            prepend: list[dict] = []
            while self._offline and len(prepend) + len(batch) < BATCH_MAX:
                prepend.append(self._offline.popleft())
            batch = prepend + batch

        if not batch:
            return

        rows    = [self._to_row(evt) for evt in batch]
        success = self._post_with_retry(rows)

        if not success:
            for row in rows:
                self._offline.append(row)
            log.warning(
                "Ship failed — %d events parked offline (buffer=%d).",
                len(rows), len(self._offline),
            )

    def _to_row(self, evt: dict) -> dict:
        process_block = evt.get("process") or evt.get("actor", {}).get("process", {})
        file_block    = (evt.get("process") or {}).get("file") or evt.get("file") or {}

        return {
            "device_uid":     self._device_uid,
            "ocsf_class_uid": evt.get("class_uid"),
            "activity_id":    evt.get("activity_id"),
            "severity_id":    evt.get("severity_id", 1),
            "threat_score":   evt.get("unmapped", {}).get("threat_score", 0.0),
            "alert_type":     evt.get("unmapped", {}).get("alert_type", ""),
            "pid":            process_block.get("pid"),
            "process_name":   process_block.get("name", ""),
            "cmdline":        process_block.get("cmd_line", ""),
            "image_path":     file_block.get("path", ""),
            "src_ip":         (evt.get("src_endpoint") or {}).get("ip", ""),
            "dst_ip":         (evt.get("dst_endpoint") or {}).get("ip", ""),
            "dst_port":       (evt.get("dst_endpoint") or {}).get("port"),
            "file_path":      (evt.get("file") or {}).get("path", ""),
            "ocsf_json":      json.dumps(evt),
            "event_time":     datetime.now(timezone.utc).isoformat(),
        }

    def _post_with_retry(self, rows: list[dict]) -> bool:
        if not self._url or not self._anon:
            log.debug("Supabase not configured — skipping ship.")
            return False

        endpoint = f"{self._url}/rest/v1/edr_events"
        body     = json.dumps(rows).encode()

        for attempt in range(1, RETRY_MAX + 1):
            try:
                resp = self._session.post(endpoint, data=body, timeout=10)
                if resp.status_code in (200, 201):
                    log.debug("Shipped %d events (attempt %d).", len(rows), attempt)
                    return True
                log.warning(
                    "Supabase returned %d on attempt %d: %s",
                    resp.status_code, attempt, resp.text[:200],
                )
            except requests.RequestException as exc:
                log.warning("Ship attempt %d failed: %s", attempt, exc)

            if attempt < RETRY_MAX:
                delay = RETRY_BASE_S * (2 ** (attempt - 1))
                time.sleep(delay)

        return False

    def enqueue(self, ocsf_event: dict) -> None:
        """Convenience method — put one OCSF event on the ship queue."""
        try:
            self._q.put_nowait(ocsf_event)
        except queue.Full:
            # Drop the oldest to make room
            try:
                self._q.get_nowait()
            except queue.Empty:
                pass
            try:
                self._q.put_nowait(ocsf_event)
            except queue.Full:
                pass
