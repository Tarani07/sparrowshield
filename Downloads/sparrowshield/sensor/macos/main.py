#!/usr/bin/env python3
"""
SparrowShield — macOS Sensor Orchestrator
Requires root. Wires together:
  BSMSensor → ProcessTree → ThreatScorer → ResponseEngine → OCSFBuilder → SupabaseShipper
"""

from __future__ import annotations

import json
import logging
import os
import queue
import signal
import socket
import sys
import threading
import time
from pathlib import Path

# ── Validate root before any other import ────────────────────────────────────
if os.geteuid() != 0:
    print(
        "ERROR: SparrowShield sensor must run as root.\n"
        "  sudo python3 main.py\n"
        "  or load via launchd (see com.sparrowshield.sensor.plist).",
        file=sys.stderr,
    )
    sys.exit(1)

from bsm_sensor      import BSMSensor, ProcessTree, RingBuffer, AUE_EXECVE, AUE_CONNECT
from threat_scorer   import score as threat_score
from response_engine import evaluate
import ocsf_builder  as ocsf
from supabase_shipper import SupabaseShipper

# ── Paths ─────────────────────────────────────────────────────────────────────

CONFIG_PATH = Path.home() / "Library" / "Application Support" / \
              "SparrowShield" / "config.json"
LOG_DIR     = Path("/var/log")
LOG_FILE    = LOG_DIR / "sparrowshield-sensor.log"

# ── Logging setup ─────────────────────────────────────────────────────────────

def _setup_logging(log_path: Path) -> None:
    log_path.parent.mkdir(parents=True, exist_ok=True)
    handlers = [
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(str(log_path)),
    ]
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)-8s %(threadName)s  %(message)s",
        handlers=handlers,
    )

log = logging.getLogger(__name__)


# ── Config loading ────────────────────────────────────────────────────────────

_DEFAULT_CONFIG = {
    "supabase_url":  "https://hevcfhxmjgbpozqtescm.supabase.co",
    "anon_key":      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhldmNmaHhtamdicG96cXRlc2NtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyMjk4NDYsImV4cCI6MjA4NjgwNTg0Nn0.CaXbG8F54bXV0_biNka7vp6Cl1s7vvQsRogNoz7jB28",
    "device_uid":    "",
    "hostname":      socket.gethostname(),
    "verbose":       False,
}


def _load_config() -> dict:
    cfg = dict(_DEFAULT_CONFIG)
    if CONFIG_PATH.exists():
        try:
            with open(CONFIG_PATH) as f:
                on_disk = json.load(f)
            cfg.update(on_disk)
            log.info("Loaded config from %s.", CONFIG_PATH)
        except Exception as exc:
            log.warning("Could not parse config.json: %s — using defaults.", exc)
    else:
        log.warning("config.json not found at %s — using built-in defaults.", CONFIG_PATH)

    if not cfg.get("device_uid"):
        import subprocess
        try:
            result = subprocess.run(
                ["ioreg", "-rd1", "-c", "IOPlatformExpertDevice"],
                capture_output=True, text=True, timeout=5
            )
            for line in result.stdout.splitlines():
                if "IOPlatformUUID" in line:
                    cfg["device_uid"] = line.split('"')[-2]
                    break
        except Exception:
            pass
        if not cfg["device_uid"]:
            import uuid
            cfg["device_uid"] = str(uuid.uuid4())

    return cfg


# ── Event dispatcher ──────────────────────────────────────────────────────────

class EventDispatcher(threading.Thread):
    """
    Reads raw BSM events from the sensor queue, scores them, triggers
    responses, builds OCSF objects, and feeds the shipper.
    """

    def __init__(
        self,
        source_queue: queue.Queue,
        shipper:      SupabaseShipper,
        process_tree: ProcessTree,
        device_uid:   str,
        hostname:     str,
    ):
        super().__init__(daemon=True, name="EventDispatcher")
        self._q      = source_queue
        self._ship   = shipper
        self._ptree  = process_tree
        self._uid    = device_uid
        self._host   = hostname

    def run(self) -> None:
        while True:
            try:
                evt = self._q.get(timeout=1.0)
            except queue.Empty:
                continue
            except Exception as exc:
                log.error("Dispatcher queue error: %s", exc)
                continue

            try:
                self._handle(evt)
            except Exception as exc:
                log.error("Dispatcher handle error: %s", exc)

    def _handle(self, evt: dict) -> None:
        pid        = evt.get("pid", 0)
        ppid       = evt.get("ppid", 0)
        image_path = evt.get("path", "")
        cmdline    = " ".join(evt.get("args", [])) or image_path
        user       = str(evt.get("uid", ""))
        ancestry   = evt.get("ancestry", [])
        etype      = evt.get("event_type", 0)

        # Score the event
        sc = threat_score(pid, image_path, cmdline, ancestry)

        # Build the OCSF event
        if etype == AUE_CONNECT:
            ocsf_evt = ocsf.network_activity(
                activity_id  = 1,
                pid          = pid,
                src_ip       = evt.get("src_addr", ""),
                src_port     = evt.get("src_port", 0),
                dst_ip       = evt.get("dst_addr", ""),
                dst_port     = evt.get("dst_port", 0),
                device_uid   = self._uid,
                hostname     = self._host,
                threat_score = sc,
            )
        elif image_path and etype not in {AUE_CONNECT}:
            ocsf_evt = ocsf.process_activity(
                activity_id  = 1,
                pid          = pid,
                ppid         = ppid,
                image_path   = image_path,
                cmdline      = cmdline,
                user         = user,
                device_uid   = self._uid,
                hostname     = self._host,
                threat_score = sc,
                ancestry     = ancestry,
            )
        else:
            # File/other events
            ocsf_evt = ocsf.file_activity(
                activity_id  = 3,
                pid          = pid,
                path         = evt.get("path", ""),
                device_uid   = self._uid,
                hostname     = self._host,
                threat_score = sc,
            )

        # Ship to Supabase
        self._ship.enqueue(ocsf_evt)

        # Only invoke response engine for process exec events above threshold
        if etype == AUE_EXECVE and sc >= 0.50:
            name = evt.get("name", os.path.basename(image_path))
            evaluate(pid, image_path, sc, process_name=name)


# ── Signal handling ───────────────────────────────────────────────────────────

_shutdown = threading.Event()


def _handle_signal(signum, frame):
    log.info("Received signal %d — shutting down.", signum)
    _shutdown.set()


# ── Entry point ───────────────────────────────────────────────────────────────

def main() -> None:
    _setup_logging(LOG_FILE)
    log.info("=" * 60)
    log.info("SparrowShield macOS sensor starting (pid=%d).", os.getpid())

    cfg        = _load_config()
    device_uid = cfg["device_uid"]
    hostname   = cfg["hostname"]
    verbose    = cfg.get("verbose", False)

    log.info("device_uid=%s  hostname=%s", device_uid, hostname)

    # Queues
    raw_queue  = queue.Queue(maxsize=50_000)
    ship_queue = queue.Queue(maxsize=50_000)
    ring       = RingBuffer(maxlen=10_000)
    ptree      = ProcessTree()

    # Sensor
    sensor = BSMSensor(
        event_queue  = raw_queue,
        ring_buffer  = ring,
        process_tree = ptree,
        verbose      = verbose,
    )

    # Shipper
    shipper = SupabaseShipper(
        ship_queue   = ship_queue,
        supabase_url = cfg.get("supabase_url", ""),
        anon_key     = cfg.get("anon_key", ""),
        device_uid   = device_uid,
    )

    # Dispatcher
    dispatcher = EventDispatcher(
        source_queue = raw_queue,
        shipper      = shipper,
        process_tree = ptree,
        device_uid   = device_uid,
        hostname     = hostname,
    )

    # Wire signals
    signal.signal(signal.SIGTERM, _handle_signal)
    signal.signal(signal.SIGINT,  _handle_signal)

    # Start threads
    sensor.start()
    shipper.start()
    dispatcher.start()

    log.info("All threads running. Waiting for shutdown signal.")

    # Block until signal
    _shutdown.wait()

    log.info("Shutdown initiated — stopping sensor.")
    sensor.stop()
    sensor.join(timeout=10)
    log.info("SparrowShield macOS sensor stopped.")


if __name__ == "__main__":
    main()
