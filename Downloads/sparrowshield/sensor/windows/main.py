#!/usr/bin/env python3
"""
SparrowShield — Windows Sensor Orchestrator (Day 5)
Wires all subsystems together:
  ETWKernelProcessSensor → ProcessTree → OCSF → SupabaseShipper
  ETWFileSensor          → FileEventProcessor → ResponseEngine
  VSSGuard               → ResponseEngine
  ETWNetworkSensor       → NetworkEventProcessor → ResponseEngine

Run standalone:  python main.py
Run as service:  python windows_service.py start
"""

import json
import logging
import os
import queue
import socket
import sys
import threading
import time
import uuid
from pathlib import Path

# ── Sensor imports ─────────────────────────────────────────────────────────

from etw_sensor        import ETWKernelProcessSensor, EventDispatcher, ProcessEvent, ProcessTree, RingBuffer
from etw_file_sensor   import ETWFileSensor, FileEventProcessor
from etw_network_sensor import ETWNetworkSensor, NetworkEventProcessor
from vss_guard         import VSSGuard
from response_engine   import ResponseEngine
from ocsf_builder      import process_activity, file_activity, network_activity
from supabase_shipper  import SupabaseShipper

# ── Config ─────────────────────────────────────────────────────────────────

CONFIG_PATH    = Path(os.environ.get("PROGRAMDATA", "C:\\ProgramData")) / "SparrowShield" / "config.json"
LOG_PATH       = Path(os.environ.get("PROGRAMDATA", "C:\\ProgramData")) / "SparrowShield" / "sensor.log"
SUPABASE_URL   = os.environ.get("SUPABASE_URL",      "https://YOUR_PROJECT.supabase.co")
SUPABASE_ANON  = os.environ.get("SUPABASE_ANON_KEY", "")

SCORE_TERMINATE = 0.80
SCORE_ALERT     = 0.50


def _register_device(cfg: dict) -> None:
    """Upsert this device into the Supabase devices table so it appears in the dashboard."""
    import platform, requests
    url      = cfg.get("supabase_url", "")
    anon_key = cfg.get("anon_key", "")
    if not url or not anon_key:
        return
    try:
        payload = {
            "device_uid":   cfg["device_uid"],
            "hostname":     cfg.get("hostname", socket.gethostname()),
            "os_type":      "windows",
            "os_version":   platform.version(),
            "status":       "online",
            "agent_version":"2.0.0",
        }
        headers = {
            "apikey":        anon_key,
            "Authorization": f"Bearer {anon_key}",
            "Content-Type":  "application/json",
            "Prefer":        "resolution=merge-duplicates",
        }
        requests.post(
            f"{url}/rest/v1/devices",
            json=payload, headers=headers, timeout=10
        )
        logging.info("Device registered in dashboard: %s", cfg["device_uid"])
    except Exception as exc:
        logging.warning("Device registration failed (non-fatal): %s", exc)


def _load_config() -> dict:
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    if CONFIG_PATH.exists():
        try:
            return json.loads(CONFIG_PATH.read_text())
        except Exception:
            pass
    cfg = {
        "device_uid":   str(uuid.uuid4()),
        "hostname":     socket.gethostname(),
        "supabase_url": SUPABASE_URL,
        "anon_key":     SUPABASE_ANON,
    }
    CONFIG_PATH.write_text(json.dumps(cfg, indent=2))
    return cfg


def _setup_logging():
    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
        handlers=[
            logging.FileHandler(LOG_PATH, encoding="utf-8"),
            logging.StreamHandler(sys.stdout),
        ],
    )


# ── Process event handler (wired into EventDispatcher) ─────────────────────

def _make_process_handler(
    ship_q:      queue.Queue,
    alert_q:     queue.Queue,
    response:    ResponseEngine,
    cfg:         dict,
    threat_score_fn,
):
    def handler(evt: ProcessEvent, tree: ProcessTree):
        if evt.event_type != "ProcessStart":
            return

        ancestry = tree.ancestry(evt.pid)
        score    = threat_score_fn(evt, ancestry)

        ocsf_evt = process_activity(
            activity_id  = 1,
            pid          = evt.pid,
            ppid         = evt.ppid,
            image_path   = evt.image_path,
            cmdline      = evt.cmdline,
            user         = evt.user,
            session_id   = evt.session_id,
            device_uid   = cfg["device_uid"],
            hostname     = cfg["hostname"],
            threat_score = score,
            ancestry     = ancestry,
        )
        ship_q.put(ocsf_evt)

        if score >= SCORE_TERMINATE or score >= SCORE_ALERT:
            response.evaluate(evt.pid, evt.image_path, score)

    return handler


def _make_alert_dispatcher(ship_q: queue.Queue, cfg: dict):
    """Converts raw alert dicts from subsystems into OCSF and ships them."""
    def dispatch(alert: dict):
        class_uid  = alert.get("ocsf_class_uid", 1007)
        alert_type = alert.get("alert_type", "GENERIC_ALERT")
        pid        = alert.get("pid", 0)

        if class_uid == 1001 or "FILE" in alert_type or "VSS" in alert_type:
            ocsf = file_activity(
                activity_id  = 3,
                pid          = pid,
                path         = alert.get("path", ""),
                device_uid   = cfg["device_uid"],
                hostname     = cfg["hostname"],
                threat_score = alert.get("severity", 3) / 5.0,
                alert_type   = alert_type,
            )
        elif class_uid == 4001 or "NET" in alert_type or "C2" in alert_type or "MINER" in alert_type:
            target = alert.get("target", "0.0.0.0:0").split(":")
            ocsf = network_activity(
                activity_id  = 1,
                pid          = pid,
                src_ip       = "0.0.0.0",
                src_port     = 0,
                dst_ip       = target[0],
                dst_port     = int(target[1]) if len(target) > 1 else 0,
                protocol     = "tcp",
                device_uid   = cfg["device_uid"],
                hostname     = cfg["hostname"],
                threat_score = alert.get("severity", 3) / 5.0,
                alert_type   = alert_type,
            )
        else:
            ocsf = process_activity(
                activity_id  = 4,
                pid          = pid,
                ppid         = 0,
                image_path   = alert.get("path", alert.get("process", "")),
                cmdline      = alert.get("cmdline", ""),
                user         = "",
                session_id   = 0,
                device_uid   = cfg["device_uid"],
                hostname     = cfg["hostname"],
                threat_score = alert.get("severity", 3) / 5.0,
            )

        ocsf["unmapped"]["alert_type"]  = alert_type
        ocsf["unmapped"]["alert_detail"] = alert.get("detail", "")
        ship_q.put(ocsf)

    return dispatch


def _placeholder_threat_score(evt: ProcessEvent, ancestry: list[str]) -> float:
    """
    ONNX-backed threat scorer; falls back to inline rules when model unavailable.
    Returns 0.0–1.0.
    """
    if not hasattr(_placeholder_threat_score, "_scorer"):
        try:
            import sys as _sys
            import os as _os
            ml_dir = _os.path.join(_os.path.dirname(__file__), "..", "ml")
            if ml_dir not in _sys.path:
                _sys.path.insert(0, ml_dir)
            from onnx_scorer import OnnxThreatScorer
            _placeholder_threat_score._scorer = OnnxThreatScorer()
        except Exception:
            _placeholder_threat_score._scorer = None
    scorer = _placeholder_threat_score._scorer
    if scorer:
        event = {
            "image_path":   evt.image_path,
            "cmdline":      evt.cmdline,
            "pid":          evt.pid,
            "ppid":         evt.ppid,
            "process_name": os.path.basename(evt.image_path or ""),
            "ancestry":     ancestry,
        }
        return scorer.score(event)
    # inline fallback
    score = 0.0
    cmd  = (evt.cmdline    or "").lower()
    path = (evt.image_path or "").lower()
    if any(x in path for x in ["/tmp/", "\\temp\\", "%appdata%"]):       score += 0.3
    if any(x in cmd  for x in ["-enc", "-encodedcommand"]):              score += 0.5
    if any(x in cmd  for x in ["vssadmin", "wbadmin", "diskshadow"]):    score += 0.6
    if any(x in cmd  for x in ["mimikatz", "sekurlsa", "lsass"]):        score += 0.7
    return min(score, 1.0)


# ── Orchestrator ───────────────────────────────────────────────────────────

class SparrowShieldSensorOrchestrator:

    def __init__(self):
        _setup_logging()
        self._cfg     = _load_config()
        self._running = threading.Event()

        # Shared queues
        self._process_q = queue.Queue(maxsize=50_000)
        self._file_q    = queue.Queue(maxsize=50_000)
        self._net_q     = queue.Queue(maxsize=50_000)
        self._alert_q   = queue.Queue(maxsize=10_000)
        self._ship_q    = queue.Queue(maxsize=100_000)

        # Core components
        self._ring_buf  = RingBuffer(maxlen=10_000)
        self._tree      = ProcessTree()
        self._response  = ResponseEngine(self._alert_q)
        self._dispatch  = _make_alert_dispatcher(self._ship_q, self._cfg)

        # Sensors
        self._proc_sensor = ETWKernelProcessSensor(self._process_q)
        self._file_sensor = ETWFileSensor(self._file_q)
        self._net_sensor  = ETWNetworkSensor(self._net_q)
        self._vss_guard   = VSSGuard(self._alert_q)
        self._shipper     = SupabaseShipper(
            self._ship_q,
            supabase_url = self._cfg.get("supabase_url", SUPABASE_URL),
            anon_key     = self._cfg.get("anon_key", SUPABASE_ANON),
            device_uid   = self._cfg["device_uid"],
        )

        # Dispatcher wired to process sensor
        self._evt_dispatcher = EventDispatcher(self._process_q, self._ring_buf, self._tree)
        self._evt_dispatcher.add_handler(
            _make_process_handler(
                self._ship_q, self._alert_q, self._response,
                self._cfg, _placeholder_threat_score
            )
        )

        # File + network processors
        self._file_proc = FileEventProcessor(self._file_q, self._alert_q)
        self._net_proc  = NetworkEventProcessor(self._net_q, self._alert_q)

        # Alert dispatcher thread
        self._alert_thread = threading.Thread(
            target=self._alert_loop, daemon=True, name="AlertDispatch"
        )

    def start(self):
        self._running.set()
        logging.info("=== SparrowShield Windows Sensor v2.0 starting ===")
        logging.info("Device: %s (%s)", self._cfg["hostname"], self._cfg["device_uid"])
        _register_device(self._cfg)

        self._evt_dispatcher.start()
        self._file_proc.start()
        self._net_proc.start()
        self._alert_thread.start()
        self._shipper.start()

        self._proc_sensor.start()
        self._file_sensor.start()
        self._net_sensor.start()
        self._vss_guard.start()

        logging.info("All subsystems online.")

    def stop(self):
        self._running.clear()
        self._proc_sensor.stop()
        self._file_sensor.stop()
        self._net_sensor.stop()
        self._vss_guard.stop()
        logging.info("SparrowShield sensor stopped.")

    def _alert_loop(self):
        """Consume alerts from all subsystems and dispatch to OCSF + Supabase."""
        while True:
            try:
                alert = self._alert_q.get(timeout=1)
                self._dispatch(alert)
            except queue.Empty:
                continue
            except Exception as exc:
                logging.error("Alert dispatch error: %s", exc)


# ── Standalone entry point ─────────────────────────────────────────────────

def main():
    import ctypes
    try:
        is_admin = ctypes.windll.shell32.IsUserAnAdmin()
    except Exception:
        is_admin = False

    if not is_admin:
        sys.exit("Run as Administrator — ETW kernel providers require elevation.")

    orch = SparrowShieldSensorOrchestrator()
    orch.start()

    try:
        while True:
            time.sleep(30)
            logging.info(
                "Status — process_q=%d file_q=%d net_q=%d alert_q=%d ship_q=%d",
                orch._process_q.qsize(),
                orch._file_q.qsize(),
                orch._net_q.qsize(),
                orch._alert_q.qsize(),
                orch._ship_q.qsize(),
            )
    except KeyboardInterrupt:
        orch.stop()


if __name__ == "__main__":
    main()
