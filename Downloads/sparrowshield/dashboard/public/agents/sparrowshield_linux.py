#!/usr/bin/env python3
"""
SparrowShield — Linux Sensor Orchestrator
Wires all subsystems together:
  LinuxProcessSensor (proc + netlink) → OCSF → SupabaseShipper
  LinuxFileSensor    (inotify / poll) → OCSF → SupabaseShipper
  LinuxNetworkSensor (/proc/net poll) → OCSF → SupabaseShipper

Run as root:  python3 /opt/sparrowshield/main.py
Managed by:   systemd sparrowshield.service
"""

import json
import logging
import os
import platform
import queue
import signal
import socket
import sys
import threading
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

from netlink_sensor  import LinuxProcessSensor, ProcessEvent
from file_sensor     import LinuxFileSensor, FileEvent
from net_sensor      import LinuxNetworkSensor, NetworkEvent
from ocsf_builder    import process_activity, file_activity, network_activity
from supabase_shipper import SupabaseShipper

# ── Paths & constants ─────────────────────────────────────────────────────────

CONFIG_PATH = Path("/etc/sparrowshield/config.json")
LOG_DIR     = Path("/var/log/sparrowshield")
LOG_PATH    = LOG_DIR / "sensor.log"

SUPABASE_URL  = "https://hevcfhxmjgbpozqtescm.supabase.co"
SUPABASE_ANON = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"
    ".eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhldmNmaHhtamdicG96cXRlc2NtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyMjk4NDYsImV4cCI6MjA4NjgwNTg0Nn0"
    ".CaXbG8F54bXV0_biNka7vp6Cl1s7vvQsRogNoz7jB28"
)

SCORE_ALERT     = 0.50
SCORE_TERMINATE = 0.80

# Suspicious process names (Linux equivalents of red-team / malware tools)
SUSPICIOUS_NAMES = {
    "nc", "ncat", "netcat",
    "nmap",
    "xmrig", "minerd", "cpuminer", "ethminer",
    "mimipenguin", "mimikatz",
    "pspy",
    "socat",
    "cryptominer",
    "masscan",
    "hydra", "medusa", "thc-hydra",
    "john", "hashcat",
    "sqlmap",
    "metasploit", "msfconsole", "msfvenom",
    "weevely",
    "beef",
}


# ── Logging ────────────────────────────────────────────────────────────────────

def _setup_logging():
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
        handlers=[
            logging.FileHandler(str(LOG_PATH), encoding="utf-8"),
            logging.StreamHandler(sys.stdout),
        ],
    )


# ── Config ────────────────────────────────────────────────────────────────────

def _load_config() -> dict:
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    if CONFIG_PATH.exists():
        try:
            cfg = json.loads(CONFIG_PATH.read_text())
            # Backfill credentials if missing
            cfg.setdefault("supabase_url", SUPABASE_URL)
            cfg.setdefault("anon_key", SUPABASE_ANON)
            return cfg
        except Exception:
            pass
    cfg = {
        "device_uid":   str(uuid.uuid4()),
        "hostname":     socket.gethostname(),
        "supabase_url": SUPABASE_URL,
        "anon_key":     SUPABASE_ANON,
    }
    CONFIG_PATH.write_text(json.dumps(cfg, indent=2))
    logging.info("Created new config at %s with device_uid=%s", CONFIG_PATH, cfg["device_uid"])
    return cfg


# ── Device registration ───────────────────────────────────────────────────────

def _register_device(cfg: dict) -> None:
    """Upsert this device into the Supabase devices table."""
    import requests as _req
    url      = cfg.get("supabase_url", "")
    anon_key = cfg.get("anon_key", "")
    if not url or not anon_key:
        return
    try:
        payload = {
            "id":         cfg["device_uid"],
            "hostname":   cfg.get("hostname", socket.gethostname()),
            "os_type":    "linux",
            "os_version": platform.version(),
            "status":     "online",
            "last_seen":  datetime.utcnow().isoformat() + "Z",
        }
        headers = {
            "apikey":        anon_key,
            "Authorization": f"Bearer {anon_key}",
            "Content-Type":  "application/json",
            "Prefer":        "resolution=merge-duplicates",
        }
        _req.post(
            f"{url}/rest/v1/devices?on_conflict=id",
            json=payload, headers=headers, timeout=10
        )
        logging.getLogger(__name__).info(
            "Device registered: %s (%s)", cfg["hostname"], cfg["device_uid"]
        )
    except Exception as exc:
        logging.getLogger(__name__).warning("Device registration failed (non-fatal): %s", exc)


# ── Inline threat scorer ──────────────────────────────────────────────────────

def _threat_score(evt: ProcessEvent) -> float:
    """
    Rule-based threat scorer. Returns 0.0–1.0.
    No ONNX dependency required.
    """
    score = 0.0
    cmd   = (evt.cmdline    or "").lower()
    path  = (evt.image_path or "").lower()
    name  = os.path.basename(path)

    # Execution from temp/world-writable directories
    if any(x in path for x in ["/tmp/", "/dev/shm/", "/var/tmp/"]):
        score += 0.4

    # Base64 / encoded command patterns
    if any(x in cmd for x in ["base64 ", "base64 -d", "echo | base64", "|base64"]):
        score += 0.4

    # Shell download-and-execute patterns
    if any(x in cmd for x in ["curl", "wget"]) and any(x in cmd for x in ["|sh", "| sh", "|bash", "| bash"]):
        score += 0.6

    # Suspicious process name (exact match against known tools)
    if name in SUSPICIOUS_NAMES:
        score += 0.5

    # Reverse shell indicators
    if any(x in cmd for x in ["/dev/tcp/", "/dev/udp/", "bash -i"]):
        score += 0.7

    # Credential harvesting
    if any(x in cmd for x in ["mimipenguin", "/etc/shadow", "cat /etc/passwd"]):
        score += 0.7

    # Python/ruby/perl -e one-liners (often used for shells)
    if any(x in path for x in ["python", "ruby", "perl", "php"]) and "-e " in cmd:
        score += 0.3

    # LD_PRELOAD injection
    if "ld_preload" in cmd or "ld_preload" in " ".join(
        os.environ.get(k, "").lower() for k in ["LD_PRELOAD"]
    ):
        score += 0.5

    return min(score, 1.0)


# ── Alert type helpers ────────────────────────────────────────────────────────

_MINER_PORTS: set[int] = {3333, 14444, 45700, 7777, 45560, 3032, 5730, 20536, 14433, 3256}
_C2_PORTS:    set[int] = {4444, 1337, 9001, 31337, 4445, 5555, 6666, 4443, 8443, 50050}


def _net_alert_type(evt: NetworkEvent) -> str:
    if evt.dst_port in _MINER_PORTS:
        return "MINER_PORT"
    if evt.dst_port in _C2_PORTS:
        return "C2_PORT"
    if evt.suspicious:
        return "SUSPICIOUS_PORT"
    return ""


def _file_alert_type(path: str) -> str:
    p = path.lower()
    if "/tmp/" in p or "/dev/shm/" in p or "/var/tmp/" in p:
        return "TEMP_FILE_ACTIVITY"
    if "/.ssh/" in p:
        return "SSH_KEY_ACTIVITY"
    if "/etc/cron" in p or "/etc/passwd" in p or "/etc/shadow" in p or "/etc/sudoers" in p:
        return "SENSITIVE_FILE_MODIFIED"
    return ""


def _file_threat_score(path: str, event_type: str) -> float:
    score = 0.0
    alert = _file_alert_type(path)
    if alert == "SSH_KEY_ACTIVITY":
        score += 0.6
    elif alert == "SENSITIVE_FILE_MODIFIED":
        score += 0.7
    elif alert == "TEMP_FILE_ACTIVITY" and event_type in ("created", "modified"):
        score += 0.2
    return min(score, 1.0)


def _net_threat_score(evt: NetworkEvent) -> float:
    if evt.dst_port in _MINER_PORTS:
        return 0.85
    if evt.dst_port in _C2_PORTS:
        return 0.90
    if evt.suspicious:
        return 0.60
    return 0.1


# ── Orchestrator ──────────────────────────────────────────────────────────────

class SparrowShieldLinuxOrchestrator:

    def __init__(self):
        _setup_logging()
        self._log = logging.getLogger(self.__class__.__name__)
        self._cfg = _load_config()

        self._proc_q = queue.Queue(maxsize=50_000)
        self._file_q = queue.Queue(maxsize=50_000)
        self._net_q  = queue.Queue(maxsize=50_000)
        self._ship_q = queue.Queue(maxsize=100_000)

        self._proc_sensor = LinuxProcessSensor(self._proc_q)
        self._file_sensor = LinuxFileSensor(self._file_q)
        self._net_sensor  = LinuxNetworkSensor(self._net_q)

        self._shipper = SupabaseShipper(
            self._ship_q,
            supabase_url=self._cfg.get("supabase_url", SUPABASE_URL),
            anon_key=self._cfg.get("anon_key", SUPABASE_ANON),
            device_uid=self._cfg["device_uid"],
        )

        self._running = threading.Event()

    def start(self):
        self._running.set()
        self._log.info("=== SparrowShield Linux Sensor v1.0 starting ===")
        self._log.info("Device: %s (%s)", self._cfg["hostname"], self._cfg["device_uid"])

        _register_device(self._cfg)

        self._proc_sensor.start()
        self._file_sensor.start()
        self._net_sensor.start()
        self._shipper.start()

        # Consumer threads
        threading.Thread(target=self._proc_loop, daemon=True, name="ProcConsumer").start()
        threading.Thread(target=self._file_loop, daemon=True, name="FileConsumer").start()
        threading.Thread(target=self._net_loop,  daemon=True, name="NetConsumer").start()

        self._log.info("All subsystems online.")

    def stop(self):
        self._running.clear()
        self._proc_sensor.stop()
        self._file_sensor.stop()
        self._net_sensor.stop()
        self._log.info("SparrowShield Linux sensor stopped.")

    # ── Consumer loops ───────────────────────────────────────────────────────

    def _proc_loop(self):
        cfg = self._cfg
        while True:
            try:
                evt: ProcessEvent = self._proc_q.get(timeout=1)
            except queue.Empty:
                continue
            try:
                score = _threat_score(evt)
                ocsf  = process_activity(
                    activity_id  = 1,
                    pid          = evt.pid,
                    ppid         = evt.ppid,
                    image_path   = evt.image_path,
                    cmdline      = evt.cmdline,
                    user         = evt.user,
                    device_uid   = cfg["device_uid"],
                    hostname     = cfg["hostname"],
                    threat_score = score,
                )
                self._ship_q.put_nowait(ocsf)

                if score >= SCORE_ALERT:
                    self._log.warning(
                        "ALERT pid=%d score=%.2f image=%s cmd=%s",
                        evt.pid, score, evt.image_path, evt.cmdline[:120]
                    )
            except queue.Full:
                pass
            except Exception as exc:
                self._log.error("ProcConsumer error: %s", exc)

    def _file_loop(self):
        cfg = self._cfg
        while True:
            try:
                evt: FileEvent = self._file_q.get(timeout=1)
            except queue.Empty:
                continue
            try:
                score      = _file_threat_score(evt.path, evt.event_type)
                alert_type = _file_alert_type(evt.path)
                activity   = {"created": 1, "modified": 3, "deleted": 4}.get(evt.event_type, 3)
                ocsf       = file_activity(
                    activity_id  = activity,
                    pid          = evt.pid,
                    path         = evt.path,
                    device_uid   = cfg["device_uid"],
                    hostname     = cfg["hostname"],
                    threat_score = score,
                    alert_type   = alert_type,
                )
                self._ship_q.put_nowait(ocsf)

                if score >= SCORE_ALERT:
                    self._log.warning(
                        "FILE ALERT %s path=%s score=%.2f",
                        evt.event_type.upper(), evt.path, score
                    )
            except queue.Full:
                pass
            except Exception as exc:
                self._log.error("FileConsumer error: %s", exc)

    def _net_loop(self):
        cfg = self._cfg
        while True:
            try:
                evt: NetworkEvent = self._net_q.get(timeout=1)
            except queue.Empty:
                continue
            try:
                score      = _net_threat_score(evt)
                alert_type = _net_alert_type(evt)
                ocsf       = network_activity(
                    activity_id  = 1,
                    pid          = evt.pid,
                    src_ip       = evt.src_ip,
                    src_port     = evt.src_port,
                    dst_ip       = evt.dst_ip,
                    dst_port     = evt.dst_port,
                    protocol     = evt.protocol,
                    device_uid   = cfg["device_uid"],
                    hostname     = cfg["hostname"],
                    threat_score = score,
                    alert_type   = alert_type,
                )
                self._ship_q.put_nowait(ocsf)

                if score >= SCORE_ALERT:
                    self._log.warning(
                        "NET ALERT %s -> %s:%d score=%.2f alert=%s",
                        evt.src_ip, evt.dst_ip, evt.dst_port, score, alert_type
                    )
            except queue.Full:
                pass
            except Exception as exc:
                self._log.error("NetConsumer error: %s", exc)


# ── Entry point ───────────────────────────────────────────────────────────────

def main():
    if os.geteuid() != 0:
        sys.stderr.write(
            "SparrowShield requires root — run with sudo or via systemd service.\n"
        )
        # Don't hard-exit; /proc polling still works without root for own processes
        # Netlink AUDIT socket will gracefully fail.

    orch = SparrowShieldLinuxOrchestrator()
    orch.start()

    # Handle SIGTERM gracefully (systemd sends SIGTERM on stop)
    def _sigterm(signo, frame):
        orch.stop()
        sys.exit(0)

    signal.signal(signal.SIGTERM, _sigterm)

    log = logging.getLogger("main")
    try:
        while True:
            time.sleep(30)
            log.info(
                "Status — proc_q=%d file_q=%d net_q=%d ship_q=%d",
                orch._proc_q.qsize(),
                orch._file_q.qsize(),
                orch._net_q.qsize(),
                orch._ship_q.qsize(),
            )
    except KeyboardInterrupt:
        orch.stop()


if __name__ == "__main__":
    main()
