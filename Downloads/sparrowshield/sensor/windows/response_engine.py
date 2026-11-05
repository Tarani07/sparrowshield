#!/usr/bin/env python3
"""
SparrowShield — Response Engine (Day 4)
Terminates malicious processes and moves binaries to quarantine.
"""

import ctypes
import ctypes.wintypes
import hashlib
import json
import logging
import os
import queue
import shutil
import struct
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

QUARANTINE_DIR = Path(os.environ.get("PROGRAMDATA", "C:\\ProgramData")) / "SparrowShield" / "quarantine"
QUARANTINE_LOG = Path(os.environ.get("PROGRAMDATA", "C:\\ProgramData")) / "SparrowShield" / "quarantine.jsonl"

# Processes that must never be terminated (critical system processes)
PROTECTED_NAMES = {
    "system", "smss.exe", "csrss.exe", "wininit.exe", "winlogon.exe",
    "services.exe", "lsass.exe", "svchost.exe", "dwm.exe",
    "sparrowshield_sensor.exe",
}

SCORE_TERMINATE = 0.80   # kill immediately
SCORE_ALERT     = 0.50   # alert only, monitor


class ResponseEngine:

    def __init__(self, alert_queue: queue.Queue):
        self._alert_q    = alert_queue
        self._lock       = threading.Lock()
        self._terminated: set[int] = set()
        QUARANTINE_DIR.mkdir(parents=True, exist_ok=True)

    def evaluate(
        self,
        pid:         int,
        image_path:  str,
        threat_score: float,
        alert_type:  str = "HIGH_THREAT_SCORE",
    ):
        name = os.path.basename(image_path).lower() if image_path else ""

        if name in PROTECTED_NAMES:
            logging.debug("Skipping protected process: %s (PID=%d)", name, pid)
            return

        if threat_score >= SCORE_TERMINATE:
            self._terminate_and_quarantine(pid, image_path, threat_score, alert_type)
        elif threat_score >= SCORE_ALERT:
            self._emit_alert(pid, image_path, threat_score, "SUSPICIOUS", killed=False)

    def terminate_by_alert(self, alert: dict):
        """Called directly when VSSGuard / FileProcessor emits an alert."""
        pid        = alert.get("pid", 0)
        image_path = alert.get("path", "")
        severity   = alert.get("severity", 3)
        score      = severity / 5.0
        self.evaluate(pid, image_path, score, alert.get("alert_type", "ALERT"))

    # ── Internal ─────────────────────────────────────────────────────────────

    def _terminate_and_quarantine(
        self, pid: int, image_path: str, score: float, alert_type: str
    ):
        with self._lock:
            if pid in self._terminated:
                return
            self._terminated.add(pid)

        killed = self._kill(pid)

        if killed and image_path and os.path.isfile(image_path):
            q_path = self._quarantine(image_path)
        else:
            q_path = None

        self._emit_alert(pid, image_path, score, alert_type,
                         killed=killed, quarantine_path=q_path)

    def _kill(self, pid: int) -> bool:
        PROCESS_TERMINATE = 0x0001
        try:
            kernel32 = ctypes.windll.kernel32
            handle   = kernel32.OpenProcess(PROCESS_TERMINATE, False, pid)
            if not handle:
                return self._taskkill(pid)
            result = kernel32.TerminateProcess(handle, 1)
            kernel32.CloseHandle(handle)
            if result:
                logging.info("Terminated PID=%d via TerminateProcess.", pid)
                return True
            return self._taskkill(pid)
        except Exception as exc:
            logging.error("Kill failed PID=%d: %s", pid, exc)
            return self._taskkill(pid)

    def _taskkill(self, pid: int) -> bool:
        import subprocess
        r = subprocess.run(
            ["taskkill", "/F", "/PID", str(pid)],
            capture_output=True, timeout=5
        )
        ok = r.returncode == 0
        if ok:
            logging.info("Terminated PID=%d via taskkill.", pid)
        return ok

    def _quarantine(self, image_path: str) -> Optional[str]:
        try:
            sha256 = self._sha256(image_path)
            dest   = QUARANTINE_DIR / f"{sha256[:16]}_{os.path.basename(image_path)}.quar"
            shutil.move(image_path, dest)
            # Write zero-length stub so the path still exists but is inert
            Path(image_path).write_bytes(b"")
            logging.info("Quarantined %s → %s", image_path, dest)
            return str(dest)
        except Exception as exc:
            logging.error("Quarantine failed for %s: %s", image_path, exc)
            return None

    def _sha256(self, path: str) -> str:
        h = hashlib.sha256()
        try:
            with open(path, "rb") as f:
                for chunk in iter(lambda: f.read(65536), b""):
                    h.update(chunk)
        except OSError:
            pass
        return h.hexdigest()

    def _emit_alert(
        self, pid: int, image_path: str, score: float,
        alert_type: str, killed: bool, quarantine_path: Optional[str] = None
    ):
        record = {
            "alert_type":      alert_type,
            "timestamp":       datetime.now(timezone.utc).isoformat(),
            "pid":             pid,
            "image_path":      image_path,
            "threat_score":    round(score, 4),
            "action":          "TERMINATE+QUARANTINE" if killed else "ALERT",
            "killed":          killed,
            "quarantine_path": quarantine_path,
            "severity":        5 if score >= 0.8 else 3,
        }
        self._alert_q.put(record)
        level = logging.CRITICAL if killed else logging.WARNING
        logging.log(level, "[RESPONSE] %s PID=%d score=%.2f killed=%s",
                    alert_type, pid, score, killed)

        # Append to quarantine log
        try:
            with open(QUARANTINE_LOG, "a", encoding="utf-8") as f:
                f.write(json.dumps(record) + "\n")
        except OSError:
            pass
