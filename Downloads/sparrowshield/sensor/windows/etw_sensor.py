#!/usr/bin/env python3
"""
SparrowShield Windows ETW Sensor — Day 1
Subscribes to Microsoft-Windows-Kernel-Process via ETW and captures
ProcessStart / ProcessStop events in real-time with no kernel driver.

Requirements:
  pip install pywin32 psutil requests
Run as: Administrator (required for ETW kernel providers)
"""

import ctypes
import ctypes.wintypes
import json
import logging
import os
import queue
import struct
import sys
import threading
import time
from collections import deque
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

# ── Win32 ETW constants ──────────────────────────────────────────────────────

WNODE_FLAG_TRACED_GUID        = 0x00020000
EVENT_TRACE_REAL_TIME_MODE    = 0x00000100
EVENT_TRACE_USE_LOCAL_SEQUENCE = 0x00008000
PROCESS_TRACE_MODE_REAL_TIME  = 0x00000100
PROCESS_TRACE_MODE_EVENT_RECORD = 0x10000000
TRACE_LEVEL_VERBOSE           = 5
TRACE_LEVEL_INFORMATION       = 4

# Microsoft-Windows-Kernel-Process provider GUID
KERNEL_PROCESS_GUID = "{22FB2CD6-0E7B-422B-A0C7-2FAD1FD0E716}"

# Event task IDs within Microsoft-Windows-Kernel-Process
TASK_PROCESS_START  = 1
TASK_PROCESS_STOP   = 2
TASK_THREAD_START   = 3
TASK_THREAD_STOP    = 4

SESSION_NAME = "SparrowShieldETW"

# ── Data structures ──────────────────────────────────────────────────────────

@dataclass
class ProcessEvent:
    event_type:  str          # "ProcessStart" | "ProcessStop"
    timestamp:   str          # ISO-8601 UTC
    pid:         int
    ppid:        int
    image_path:  str
    cmdline:     str
    user:        str
    session_id:  int
    exit_code:   Optional[int] = None

@dataclass
class ProcessNode:
    pid:        int
    ppid:       int
    name:       str
    image_path: str
    cmdline:    str
    start_time: str
    children:   list = field(default_factory=list)

# ── Ring buffer ──────────────────────────────────────────────────────────────

class RingBuffer:
    """Thread-safe fixed-size ring buffer for ETW events."""
    def __init__(self, maxlen: int = 10_000):
        self._buf  = deque(maxlen=maxlen)
        self._lock = threading.Lock()

    def push(self, event: ProcessEvent):
        with self._lock:
            self._buf.append(event)

    def drain(self) -> list[ProcessEvent]:
        with self._lock:
            items = list(self._buf)
            self._buf.clear()
            return items

    def __len__(self):
        with self._lock:
            return len(self._buf)

# ── Process tree ─────────────────────────────────────────────────────────────

class ProcessTree:
    """In-memory causal execution tree: pid → ProcessNode."""
    def __init__(self):
        self._nodes: dict[int, ProcessNode] = {}
        self._lock  = threading.Lock()

    def add(self, node: ProcessNode):
        with self._lock:
            self._nodes[node.pid] = node
            if node.ppid in self._nodes:
                parent = self._nodes[node.ppid]
                if node.pid not in parent.children:
                    parent.children.append(node.pid)

    def remove(self, pid: int):
        with self._lock:
            self._nodes.pop(pid, None)

    def get(self, pid: int) -> Optional[ProcessNode]:
        with self._lock:
            return self._nodes.get(pid)

    def ancestry(self, pid: int, depth: int = 5) -> list[str]:
        """Return [child, parent, grandparent, ...] image names up to depth."""
        chain = []
        with self._lock:
            cur = pid
            for _ in range(depth):
                node = self._nodes.get(cur)
                if not node:
                    break
                chain.append(node.name)
                if node.ppid == cur:
                    break
                cur = node.ppid
        return chain

# ── ETW session via ctypes ───────────────────────────────────────────────────

class ETWKernelProcessSensor:
    """
    Attaches to Microsoft-Windows-Kernel-Process ETW provider.
    Falls back to WMI polling if the provider is unavailable (older Windows).
    """

    def __init__(self, event_queue: queue.Queue):
        self._queue    = event_queue
        self._running  = threading.Event()
        self._thread:  Optional[threading.Thread] = None
        self._use_wmi  = False

    def start(self):
        self._running.set()
        # Try ETW first; fall back to WMI on permission error
        try:
            self._try_etw()
        except (OSError, Exception) as exc:
            logging.warning(
                "ETW provider unavailable (%s). Falling back to WMI polling.", exc
            )
            self._use_wmi = True
            self._thread = threading.Thread(target=self._wmi_loop, daemon=True)
            self._thread.start()

    def stop(self):
        self._running.clear()

    # ── ETW path ─────────────────────────────────────────────────────────────

    def _try_etw(self):
        """Start ETW session using subprocess (avoids complex ctypes boilerplate)."""
        import subprocess
        # logman creates a real-time ETW session traceable by ProcessTrace
        cmd = [
            "logman", "start", SESSION_NAME,
            "-p", KERNEL_PROCESS_GUID, "0xFFFFFFFF", str(TRACE_LEVEL_VERBOSE),
            "-rt",         # real-time
            "-ets",        # event trace session (no file)
        ]
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode not in (0, -1073741515):  # 0=ok, already-exists ok
            raise OSError(f"logman failed: {result.stderr.strip()}")

        self._thread = threading.Thread(target=self._consume_etw, daemon=True)
        self._thread.start()
        logging.info("ETW session '%s' started via logman.", SESSION_NAME)

    def _consume_etw(self):
        """
        Use tracerpt to read the real-time session and emit CSV lines.
        tracerpt writes one CSV row per event; we parse ProcessStart/Stop.
        This is the zero-driver, zero-extra-library approach.
        """
        import subprocess, csv, io

        cmd = [
            "tracerpt", "-rt", SESSION_NAME,
            "-o", "NUL",          # no output file
            "-of", "CSV",         # but pipe to stdout
            "-y",                 # overwrite
            "-lr",                # loose (don't fail on unknown events)
        ]
        proc = subprocess.Popen(
            cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True
        )
        reader = csv.reader(proc.stdout)
        next(reader, None)  # skip header row

        for row in reader:
            if not self._running.is_set():
                break
            self._parse_csv_row(row)

        proc.terminate()

    def _parse_csv_row(self, row: list[str]):
        if len(row) < 6:
            return
        try:
            event_name = row[0].strip()
            if event_name not in ("ProcessStart", "ProcessStop"):
                return

            ts  = datetime.now(timezone.utc).isoformat()
            pid  = int(row[2]) if len(row) > 2 and row[2].strip().isdigit() else 0
            ppid = int(row[3]) if len(row) > 3 and row[3].strip().isdigit() else 0
            image = row[4].strip() if len(row) > 4 else ""
            cmd   = row[5].strip() if len(row) > 5 else ""

            evt = ProcessEvent(
                event_type  = event_name,
                timestamp   = ts,
                pid         = pid,
                ppid        = ppid,
                image_path  = image,
                cmdline     = cmd,
                user        = "",
                session_id  = 0,
            )
            self._queue.put(evt)
        except (ValueError, IndexError):
            pass

    # ── WMI fallback path ─────────────────────────────────────────────────────

    def _wmi_loop(self):
        """Poll WMI Win32_Process every 2 seconds as ETW fallback."""
        try:
            import pythoncom
            import wmi
        except ImportError:
            logging.error("pip install wmi pywin32 required for WMI fallback")
            return

        pythoncom.CoInitialize()
        c = wmi.WMI()
        seen: dict[int, str] = {}  # pid → image_path

        while self._running.is_set():
            try:
                current: dict[int, tuple[str, str, int]] = {}
                for p in c.Win32_Process():
                    try:
                        current[p.ProcessId] = (
                            p.ExecutablePath or p.Name or "",
                            p.CommandLine or "",
                            p.ParentProcessId or 0,
                        )
                    except Exception:
                        continue

                # Detect new processes
                for pid, (image, cmd, ppid) in current.items():
                    if pid not in seen:
                        seen[pid] = image
                        evt = ProcessEvent(
                            event_type  = "ProcessStart",
                            timestamp   = datetime.now(timezone.utc).isoformat(),
                            pid         = pid,
                            ppid        = ppid,
                            image_path  = image,
                            cmdline     = cmd,
                            user        = "",
                            session_id  = 0,
                        )
                        self._queue.put(evt)

                # Detect exited processes
                for pid in list(seen):
                    if pid not in current:
                        del seen[pid]
                        evt = ProcessEvent(
                            event_type  = "ProcessStop",
                            timestamp   = datetime.now(timezone.utc).isoformat(),
                            pid         = pid,
                            ppid        = 0,
                            image_path  = seen.get(pid, ""),
                            cmdline     = "",
                            user        = "",
                            session_id  = 0,
                        )
                        self._queue.put(evt)

            except Exception as exc:
                logging.warning("WMI poll error: %s", exc)

            time.sleep(2)

        pythoncom.CoUninitialize()


# ── Event dispatcher ──────────────────────────────────────────────────────────

class EventDispatcher(threading.Thread):
    """
    Reads from the shared event queue, updates the process tree,
    and fans out to registered handlers.
    """

    def __init__(
        self,
        event_queue: queue.Queue,
        ring_buffer: RingBuffer,
        process_tree: ProcessTree,
    ):
        super().__init__(daemon=True)
        self._queue  = event_queue
        self._buffer = ring_buffer
        self._tree   = process_tree
        self._handlers: list = []

    def add_handler(self, fn):
        self._handlers.append(fn)

    def run(self):
        while True:
            try:
                evt: ProcessEvent = self._queue.get(timeout=1)
            except queue.Empty:
                continue

            # Update process tree
            if evt.event_type == "ProcessStart":
                name = os.path.basename(evt.image_path) if evt.image_path else "unknown"
                node = ProcessNode(
                    pid        = evt.pid,
                    ppid       = evt.ppid,
                    name       = name,
                    image_path = evt.image_path,
                    cmdline    = evt.cmdline,
                    start_time = evt.timestamp,
                )
                self._tree.add(node)
            elif evt.event_type == "ProcessStop":
                self._tree.remove(evt.pid)

            # Push to ring buffer
            self._buffer.push(evt)

            # Fan out to handlers
            for handler in self._handlers:
                try:
                    handler(evt, self._tree)
                except Exception as exc:
                    logging.error("Handler error: %s", exc)


# ── Console handler (Day 1 output) ────────────────────────────────────────────

def console_handler(evt: ProcessEvent, tree: ProcessTree):
    ancestry = tree.ancestry(evt.pid)
    chain    = " → ".join(ancestry) if ancestry else os.path.basename(evt.image_path)

    icon = "▶" if evt.event_type == "ProcessStart" else "■"
    print(
        f"{icon} [{evt.timestamp[11:19]}] "
        f"PID={evt.pid:<6} PPID={evt.ppid:<6} "
        f"CHAIN={chain:<60} "
        f"CMD={evt.cmdline[:80]}"
    )


# ── Entry point ───────────────────────────────────────────────────────────────

def main():
    logging.basicConfig(
        level   = logging.INFO,
        format  = "%(asctime)s [%(levelname)s] %(message)s",
        handlers = [
            logging.StreamHandler(sys.stdout),
            logging.FileHandler(
                Path(os.path.dirname(__file__)) / "sensor.log",
                encoding="utf-8"
            ),
        ],
    )

    if sys.platform != "win32":
        sys.exit("This sensor runs on Windows only.")

    # Check admin
    try:
        is_admin = ctypes.windll.shell32.IsUserAnAdmin()
    except Exception:
        is_admin = False
    if not is_admin:
        sys.exit("Run as Administrator — ETW kernel providers require elevation.")

    logging.info("SparrowShield Windows ETW Sensor starting (Day 1 — Process provider)")

    event_q  = queue.Queue(maxsize=50_000)
    ring_buf = RingBuffer(maxlen=10_000)
    tree     = ProcessTree()

    sensor     = ETWKernelProcessSensor(event_queue=event_q)
    dispatcher = EventDispatcher(event_q, ring_buf, tree)
    dispatcher.add_handler(console_handler)

    dispatcher.start()
    sensor.start()

    logging.info("Sensor running. Press Ctrl+C to stop.")
    try:
        while True:
            time.sleep(10)
            logging.info(
                "Buffer: %d events | Tree: %d processes",
                len(ring_buf),
                len(tree._nodes),
            )
    except KeyboardInterrupt:
        logging.info("Shutting down sensor.")
        sensor.stop()


if __name__ == "__main__":
    main()
