#!/usr/bin/env python3
"""
SparrowShield — VSS Guard (Day 2)
Monitors WMI for processes attempting to delete Volume Shadow Copies.
Terminates the attacker process before the delete completes.
"""

import ctypes
import logging
import os
import queue
import subprocess
import threading
import time
from datetime import datetime, timezone
from typing import Optional

# Process names and command-line fragments that indicate VSS deletion
VSS_KILLER_PROCESSES = {
    "vssadmin.exe",
    "wmic.exe",
    "wbadmin.exe",
    "diskshadow.exe",
    "bcdedit.exe",
}

VSS_KILL_CMDLINE_FRAGMENTS = [
    "delete shadows",
    "deleteshadows",
    "shadowcopy delete",
    "shadowcopy where",
    "delete catalog",
    "delete systemstatebackup",
    "/set {default} recoveryenabled no",
    "/set {default} bootstatuspolicy ignoreallfailures",
]


def _is_vss_attack(process_name: str, cmdline: str) -> bool:
    name_lower = process_name.lower()
    cmd_lower  = (cmdline or "").lower()
    if name_lower not in VSS_KILLER_PROCESSES:
        return False
    return any(frag in cmd_lower for frag in VSS_KILL_CMDLINE_FRAGMENTS)


def _terminate_pid(pid: int) -> bool:
    """Terminate a process by PID using TerminateProcess via ctypes."""
    try:
        PROCESS_TERMINATE = 0x0001
        kernel32 = ctypes.windll.kernel32
        handle = kernel32.OpenProcess(PROCESS_TERMINATE, False, pid)
        if not handle:
            # Fallback to taskkill
            subprocess.run(
                ["taskkill", "/F", "/PID", str(pid)],
                capture_output=True, timeout=5
            )
            return True
        result = kernel32.TerminateProcess(handle, 1)
        kernel32.CloseHandle(handle)
        return bool(result)
    except Exception as exc:
        logging.error("TerminateProcess failed for PID %d: %s", pid, exc)
        return False


class VSSGuard(threading.Thread):
    """
    WMI-based VSS deletion guard.
    Uses Win32_ProcessStartTrace to intercept suspicious processes
    before their shadow copy deletion command completes.
    """

    def __init__(self, alert_queue: queue.Queue):
        super().__init__(daemon=True, name="VSSGuard")
        self._alert_q  = alert_queue
        self._running  = threading.Event()
        self._blocked: set[int] = set()
        self._lock     = threading.Lock()

    def start(self):
        self._running.set()
        super().start()
        logging.info("VSS Guard started — monitoring for shadow copy deletion.")

    def stop(self):
        self._running.clear()

    def run(self):
        try:
            self._wmi_watch()
        except Exception as exc:
            logging.error("VSSGuard WMI loop failed: %s", exc)
            # Fallback: ETW Security event 4688 polling
            self._event_log_fallback()

    def _wmi_watch(self):
        import pythoncom
        import wmi

        pythoncom.CoInitialize()
        c = wmi.WMI()

        # Win32_ProcessStartTrace fires synchronously on each new process
        watcher = c.Win32_ProcessStartTrace.watch_for("creation")
        logging.info("VSSGuard WMI watcher active.")

        while self._running.is_set():
            try:
                event = watcher(timeout_ms=2000)
            except wmi.x_wmi_timed_out:
                continue
            except Exception as exc:
                logging.warning("WMI watcher error: %s — restarting.", exc)
                time.sleep(2)
                watcher = c.Win32_ProcessStartTrace.watch_for("creation")
                continue

            pid  = event.ProcessID
            name = event.ProcessName or ""
            cmd  = event.CommandLine or ""

            if _is_vss_attack(name, cmd):
                self._respond(pid, name, cmd)

        pythoncom.CoUninitialize()

    def _respond(self, pid: int, name: str, cmd: str):
        with self._lock:
            if pid in self._blocked:
                return
            self._blocked.add(pid)

        logging.critical(
            "[VSS BLOCK] Terminating PID=%d (%s) — VSS deletion attempt: %s",
            pid, name, cmd[:120]
        )

        killed = _terminate_pid(pid)

        alert = {
            "alert_type": "VSS_DELETION_BLOCKED",
            "timestamp":  datetime.now(timezone.utc).isoformat(),
            "pid":        pid,
            "process":    name,
            "cmdline":    cmd,
            "killed":     killed,
            "severity":   5,
        }
        self._alert_q.put(alert)

        # Take an emergency VSS snapshot to protect current state
        self._take_emergency_snapshot()

    def _take_emergency_snapshot(self):
        """Create a VSS snapshot of C: immediately after blocking the attacker."""
        try:
            result = subprocess.run(
                ["wmic", "shadowcopy", "call", "create", "Volume='C:\\\\'"],
                capture_output=True, text=True, timeout=30
            )
            if "ReturnValue = 0" in result.stdout:
                logging.info("Emergency VSS snapshot created successfully.")
            else:
                logging.warning(
                    "VSS snapshot creation returned: %s", result.stdout.strip()
                )
        except subprocess.TimeoutExpired:
            logging.error("VSS snapshot timed out.")
        except Exception as exc:
            logging.error("VSS snapshot failed: %s", exc)

    def _event_log_fallback(self):
        """
        Fallback: poll Windows Security Event Log (Event ID 4688 — process creation)
        every second. Slower than WMI but works when WMI is unavailable.
        """
        import win32evtlog
        import win32evtlogutil

        seen_record_ids: set[int] = set()
        server = "localhost"
        log    = "Security"

        while self._running.is_set():
            try:
                handle = win32evtlog.OpenEventLog(server, log)
                flags  = win32evtlog.EVENTLOG_BACKWARDS_READ | win32evtlog.EVENTLOG_SEQUENTIAL_READ
                events = win32evtlog.ReadEventLog(handle, flags, 0)
                win32evtlog.CloseEventLog(handle)

                for evt in (events or []):
                    if evt.EventID != 4688:
                        continue
                    if evt.RecordNumber in seen_record_ids:
                        continue
                    seen_record_ids.add(evt.RecordNumber)

                    data = win32evtlogutil.SafeFormatMessage(evt, log)
                    data_lower = (data or "").lower()
                    # Check for VSS deletion patterns in the event message
                    if any(frag in data_lower for frag in VSS_KILL_CMDLINE_FRAGMENTS):
                        logging.critical("[VSS FALLBACK] Suspicious 4688 event: %s", data[:200])
                        self._alert_q.put({
                            "alert_type": "VSS_DELETION_DETECTED_EVENTLOG",
                            "timestamp":  datetime.now(timezone.utc).isoformat(),
                            "pid":        0,
                            "detail":     data[:500],
                            "severity":   5,
                        })
            except Exception as exc:
                logging.debug("Event log fallback error: %s", exc)

            time.sleep(1)
            # Keep seen set bounded
            if len(seen_record_ids) > 50_000:
                seen_record_ids.clear()
