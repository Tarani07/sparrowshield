#!/usr/bin/env python3
"""
SparrowShield — ETW File Sensor (Day 2)
Monitors Microsoft-Windows-Kernel-File for write bursts, extension pivots,
and document-targeting patterns indicative of ransomware.
"""

import collections
import logging
import os
import queue
import subprocess
import threading
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

# Extensions targeted by ransomware families
RANSOM_TARGETS = {
    ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".pdf",
    ".jpg", ".jpeg", ".png", ".mp4", ".mov", ".zip", ".rar",
    ".sql", ".db", ".mdb", ".accdb", ".bak", ".pst", ".ost",
    ".key", ".pem", ".pfx", ".p12", ".wallet", ".dat",
}

# Known ransomware-dropped note filenames
RANSOM_NOTE_NAMES = {
    "readme.txt", "how_to_decrypt.txt", "recover_files.txt",
    "!!!restore!!!.txt", "your_files_are_encrypted.txt",
    "decrypt_instructions.html", "ransom_note.txt",
}

BURST_WINDOW_SECS   = 5      # rolling window for write-rate measurement
BURST_WRITE_THRESH  = 50     # writes/sec to unique extensions → alert
EXT_PIVOT_THRESH    = 8      # unique extensions touched in burst window → alert
KERNEL_FILE_GUID    = "{EDD08927-9CC4-4E65-B970-C2560FB5C289}"
SESSION_NAME        = "SparrowShieldFileETW"


@dataclass
class FileEvent:
    event_type:  str          # "FileCreate" | "FileWrite" | "FileRename" | "FileDelete"
    timestamp:   str
    pid:         int
    path:        str
    extension:   str
    size_bytes:  int = 0
    rename_dest: str = ""


class WriteRateTracker:
    """
    Sliding-window tracker per PID.
    Fires ransomware alert when a single PID writes to >BURST_WRITE_THRESH
    unique paths across >EXT_PIVOT_THRESH distinct extensions within the window.
    """

    def __init__(self, on_alert):
        self._on_alert = on_alert
        self._lock     = threading.Lock()
        # pid → deque of (timestamp_float, path, extension)
        self._windows: dict[int, collections.deque] = {}

    def record(self, evt: FileEvent):
        if evt.event_type not in ("FileWrite", "FileCreate"):
            return
        now = time.monotonic()
        with self._lock:
            if evt.pid not in self._windows:
                self._windows[evt.pid] = collections.deque()
            win = self._windows[evt.pid]
            win.append((now, evt.path, evt.extension))
            # Evict entries outside the rolling window
            cutoff = now - BURST_WINDOW_SECS
            while win and win[0][0] < cutoff:
                win.popleft()

            unique_paths = {e[1] for e in win}
            unique_exts  = {e[2] for e in win if e[2]}

            if (len(unique_paths) >= BURST_WRITE_THRESH and
                    len(unique_exts) >= EXT_PIVOT_THRESH):
                self._on_alert(evt.pid, unique_paths, unique_exts)
                # Reset so we don't spam alerts for same PID
                self._windows[evt.pid] = collections.deque()

    def cleanup(self):
        """Evict PIDs with no activity in the last 30s (called periodically)."""
        now = time.monotonic()
        with self._lock:
            dead = [
                pid for pid, win in self._windows.items()
                if not win or now - win[-1][0] > 30
            ]
            for pid in dead:
                del self._windows[pid]


class ETWFileSensor:
    """
    Subscribes to Microsoft-Windows-Kernel-File via logman + tracerpt.
    Falls back to directory watcher on older Windows builds.
    """

    def __init__(self, event_queue: queue.Queue):
        self._queue   = event_queue
        self._running = threading.Event()
        self._thread: Optional[threading.Thread] = None

    def start(self):
        self._running.set()
        try:
            self._start_etw()
        except Exception as exc:
            logging.warning("File ETW unavailable (%s), using FSWatcher fallback.", exc)
            self._thread = threading.Thread(target=self._fs_watcher_loop, daemon=True)
            self._thread.start()

    def stop(self):
        self._running.clear()
        subprocess.run(
            ["logman", "stop", SESSION_NAME, "-ets"],
            capture_output=True
        )

    def _start_etw(self):
        subprocess.run(
            ["logman", "start", SESSION_NAME,
             "-p", KERNEL_FILE_GUID, "0xFFFFFFFF", "5",
             "-rt", "-ets"],
            capture_output=True, check=False
        )
        self._thread = threading.Thread(target=self._consume, daemon=True)
        self._thread.start()
        logging.info("File ETW session started.")

    def _consume(self):
        import csv
        proc = subprocess.Popen(
            ["tracerpt", "-rt", SESSION_NAME, "-o", "NUL",
             "-of", "CSV", "-y", "-lr"],
            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True
        )
        reader = csv.reader(proc.stdout)
        next(reader, None)
        for row in reader:
            if not self._running.is_set():
                break
            self._parse_row(row)
        proc.terminate()

    def _parse_row(self, row: list[str]):
        if len(row) < 5:
            return
        try:
            etype = row[0].strip()
            if etype not in ("FileCreate", "FileWrite", "FileRename", "FileDelete"):
                return
            pid  = int(row[2]) if row[2].strip().isdigit() else 0
            path = row[4].strip() if len(row) > 4 else ""
            ext  = Path(path).suffix.lower() if path else ""
            dest = row[5].strip() if etype == "FileRename" and len(row) > 5 else ""

            self._queue.put(FileEvent(
                event_type  = etype,
                timestamp   = datetime.now(timezone.utc).isoformat(),
                pid         = pid,
                path        = path,
                extension   = ext,
                rename_dest = dest,
            ))
        except (ValueError, IndexError):
            pass

    def _fs_watcher_loop(self):
        """
        Fallback: watch common user directories with ReadDirectoryChangesW
        via pywin32. Covers Documents, Desktop, Downloads.
        """
        try:
            import win32file, win32con
        except ImportError:
            logging.error("pywin32 required. Run: pip install pywin32")
            return

        watch_dirs = [
            os.path.expanduser("~/Documents"),
            os.path.expanduser("~/Desktop"),
            os.path.expanduser("~/Downloads"),
        ]
        threads = []
        for d in watch_dirs:
            if os.path.isdir(d):
                t = threading.Thread(
                    target=self._watch_dir, args=(d, win32file, win32con), daemon=True
                )
                t.start()
                threads.append(t)
        for t in threads:
            t.join()

    def _watch_dir(self, directory: str, win32file, win32con):
        handle = win32file.CreateFile(
            directory,
            win32con.GENERIC_READ,
            win32con.FILE_SHARE_READ | win32con.FILE_SHARE_WRITE | win32con.FILE_SHARE_DELETE,
            None,
            win32con.OPEN_EXISTING,
            win32con.FILE_FLAG_BACKUP_SEMANTICS,
            None,
        )
        while self._running.is_set():
            try:
                changes = win32file.ReadDirectoryChangesW(
                    handle,
                    65536,
                    True,  # recursive
                    win32con.FILE_NOTIFY_CHANGE_FILE_NAME |
                    win32con.FILE_NOTIFY_CHANGE_LAST_WRITE |
                    win32con.FILE_NOTIFY_CHANGE_SIZE,
                    None, None,
                )
                for action, filename in changes:
                    full = os.path.join(directory, filename)
                    ext  = Path(full).suffix.lower()
                    act_map = {1: "FileCreate", 2: "FileDelete", 3: "FileWrite",
                               4: "FileRename", 5: "FileRename"}
                    etype = act_map.get(action, "FileWrite")
                    self._queue.put(FileEvent(
                        event_type = etype,
                        timestamp  = datetime.now(timezone.utc).isoformat(),
                        pid        = 0,
                        path       = full,
                        extension  = ext,
                    ))
            except Exception:
                time.sleep(1)
        win32file.CloseHandle(handle)


class FileEventProcessor(threading.Thread):
    """
    Consumes FileEvents, runs ransomware heuristics,
    and emits alerts to the shared output queue.
    """

    def __init__(self, file_queue: queue.Queue, alert_queue: queue.Queue):
        super().__init__(daemon=True)
        self._file_q  = file_queue
        self._alert_q = alert_queue
        self._tracker = WriteRateTracker(on_alert=self._on_burst_alert)

    def run(self):
        cleanup_tick = time.monotonic()
        while True:
            try:
                evt: FileEvent = self._file_q.get(timeout=1)
            except queue.Empty:
                if time.monotonic() - cleanup_tick > 30:
                    self._tracker.cleanup()
                    cleanup_tick = time.monotonic()
                continue

            self._check_ransom_note(evt)
            self._check_target_extension(evt)
            self._tracker.record(evt)

            # Log all file events at DEBUG level
            logging.debug(
                "[FILE] %s PID=%-6d %s", evt.event_type, evt.pid, evt.path
            )

    def _check_ransom_note(self, evt: FileEvent):
        name = os.path.basename(evt.path).lower()
        if name in RANSOM_NOTE_NAMES:
            self._emit_alert(
                "RANSOMWARE_NOTE_DROPPED",
                evt.pid, evt.path,
                f"Ransom note filename detected: {name}",
                severity=5,
            )

    def _check_target_extension(self, evt: FileEvent):
        if evt.extension in RANSOM_TARGETS and evt.event_type in ("FileWrite", "FileRename"):
            # Single write to a target extension is low-signal; log only
            logging.debug("[RANSOM_TARGET] PID=%d wrote to %s", evt.pid, evt.path)

    def _on_burst_alert(self, pid: int, paths: set, exts: set):
        sample = list(paths)[:5]
        self._emit_alert(
            "RANSOMWARE_WRITE_BURST",
            pid,
            str(sample),
            f"{len(paths)} unique file writes across {len(exts)} extensions "
            f"in {BURST_WINDOW_SECS}s window. Extensions: {sorted(exts)}",
            severity=5,
        )

    def _emit_alert(self, alert_type: str, pid: int, path: str, detail: str, severity: int):
        alert = {
            "alert_type":  alert_type,
            "timestamp":   datetime.now(timezone.utc).isoformat(),
            "pid":         pid,
            "path":        path,
            "detail":      detail,
            "severity":    severity,
        }
        self._alert_q.put(alert)
        logging.warning("[ALERT] %s PID=%d — %s", alert_type, pid, detail)
