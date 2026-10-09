#!/usr/bin/env python3
"""
SparrowShield — macOS OpenBSM Real-Time Sensor
Reads kernel audit events from /dev/auditpipe via `praudit -l` (line XML),
parses them, and feeds structured dicts into a thread-safe queue.

Supported event types:
  AUE_EXECVE   (43)  — process exec
  AUE_FORK     (2)   — fork
  AUE_OPEN_RWT (35)  — file open/write (and close variants 3/4/6/7)
  AUE_KILL     (37)  — signal send
  AUE_CONNECT  (98)  — network connect
"""

from __future__ import annotations

import logging
import os
import queue
import re
import subprocess
import threading
import time
import xml.etree.ElementTree as ET
from collections import deque
from datetime import datetime, timezone
from typing import Optional

log = logging.getLogger(__name__)

# BSM event-type numbers (from /usr/include/security/audit_kevents.h)
AUE_FORK      = 2
AUE_OPEN_RWT  = 35    # open for read+write+truncate (close variants 3,4,6,7 also captured)
AUE_EXECVE    = 43
AUE_KILL      = 37
AUE_CONNECT   = 98

OPEN_EVENTS   = {2, 3, 4, 6, 7, 35, 36}   # open / creat variants
WATCH_EVENTS  = {AUE_FORK, AUE_EXECVE, AUE_KILL, AUE_CONNECT} | OPEN_EVENTS

PS_POLL_INTERVAL = 2.0   # seconds between ps polls in fallback mode


# ── Ring Buffer ───────────────────────────────────────────────────────────────

class RingBuffer:
    """Thread-safe fixed-length circular buffer."""

    def __init__(self, maxlen: int = 10_000):
        self._buf: deque = deque(maxlen=maxlen)
        self._lock = threading.Lock()

    def append(self, item: object) -> None:
        with self._lock:
            self._buf.append(item)

    def snapshot(self) -> list:
        with self._lock:
            return list(self._buf)

    def __len__(self) -> int:
        with self._lock:
            return len(self._buf)


# ── Process Tree ──────────────────────────────────────────────────────────────

class ProcessTree:
    """
    In-memory tree of live processes.
    Each entry: {ppid, name, image_path, start_time, children: set[pid]}
    """

    def __init__(self):
        self._tree: dict[int, dict] = {}
        self._lock = threading.RLock()

    def update_exec(self, pid: int, ppid: int, image_path: str,
                    name: str, start_time: float) -> None:
        with self._lock:
            self._tree[pid] = {
                "ppid":       ppid,
                "name":       name,
                "image_path": image_path,
                "start_time": start_time,
                "children":   set(),
            }
            # Register as child of parent
            if ppid and ppid in self._tree:
                self._tree[ppid]["children"].add(pid)

    def update_fork(self, pid: int, ppid: int) -> None:
        with self._lock:
            if pid not in self._tree:
                parent = self._tree.get(ppid, {})
                self._tree[pid] = {
                    "ppid":       ppid,
                    "name":       parent.get("name", ""),
                    "image_path": parent.get("image_path", ""),
                    "start_time": time.time(),
                    "children":   set(),
                }
            if ppid and ppid in self._tree:
                self._tree[ppid]["children"].add(pid)

    def remove(self, pid: int) -> None:
        with self._lock:
            entry = self._tree.pop(pid, None)
            if entry:
                ppid = entry.get("ppid")
                if ppid and ppid in self._tree:
                    self._tree[ppid]["children"].discard(pid)

    def get(self, pid: int) -> Optional[dict]:
        with self._lock:
            return self._tree.get(pid)

    def ancestry_chain(self, pid: int, max_depth: int = 8) -> list[str]:
        """Return [root_name, ..., parent_name, self_name] for display."""
        chain = []
        seen: set[int] = set()
        current = pid
        with self._lock:
            while current and current not in seen and len(chain) < max_depth:
                seen.add(current)
                entry = self._tree.get(current)
                if not entry:
                    break
                chain.append(entry.get("name") or str(current))
                current = entry.get("ppid", 0)
        chain.reverse()
        return chain

    def seed_from_ps(self) -> None:
        """Populate tree from a `ps` snapshot (used at startup and in fallback)."""
        try:
            out = subprocess.run(
                ["ps", "-axo", "pid,ppid,comm,args"],
                capture_output=True, text=True, timeout=10
            )
            for line in out.stdout.splitlines()[1:]:
                parts = line.split(None, 3)
                if len(parts) < 2:
                    continue
                try:
                    pid  = int(parts[0])
                    ppid = int(parts[1])
                    name = parts[2] if len(parts) > 2 else ""
                    args = parts[3] if len(parts) > 3 else ""
                    self.update_exec(pid, ppid, args.split()[0] if args else name,
                                     name, time.time())
                except (ValueError, IndexError):
                    continue
        except Exception as exc:
            log.warning("ps seed failed: %s", exc)


# ── BSM XML Parser ────────────────────────────────────────────────────────────

def _safe_int(val: Optional[str], default: int = 0) -> int:
    try:
        return int(val or default)
    except (ValueError, TypeError):
        return default


def _parse_bsm_xml(xml_text: str) -> Optional[dict]:
    """
    Parse one line of praudit -l XML output into a structured dict.
    Returns None if the event type is not in WATCH_EVENTS or parse fails.
    """
    xml_text = xml_text.strip()
    if not xml_text or not xml_text.startswith("<record"):
        return None

    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError:
        return None

    event_type = _safe_int(root.get("event"))
    if event_type not in WATCH_EVENTS:
        return None

    # Timestamp
    msec_str  = root.get("msec", "0 msec").split()[0]
    time_str  = root.get("time", "")
    try:
        ts = datetime.strptime(time_str, "%a %b %d %H:%M:%S %Y").replace(
            tzinfo=timezone.utc).timestamp() if time_str else time.time()
    except ValueError:
        ts = time.time()

    event: dict = {
        "event_type": event_type,
        "timestamp":  ts,
        "pid":        0,
        "ppid":       0,
        "uid":        0,
        "path":       "",
        "args":       [],
        "src_addr":   "",
        "src_port":   0,
        "dst_addr":   "",
        "dst_port":   0,
    }

    for child in root:
        tag = child.tag.lower()

        if tag == "subject":
            event["pid"]  = _safe_int(child.get("pid"))
            event["ppid"] = _safe_int(child.get("ppid"))
            event["uid"]  = _safe_int(child.get("ruid"))

        elif tag == "argument" and child.get("num") == "1":
            # EXECVE: arg[1] is the executable path
            if event_type == AUE_EXECVE:
                event["path"] = child.get("value", "")

        elif tag == "exec_args":
            event["args"] = [a.text or "" for a in child if a.tag == "arg"]

        elif tag == "path":
            if not event["path"]:
                event["path"] = child.text or ""

        elif tag == "attribute":
            # file attribute block often has the path
            pass

        elif tag in ("socket-inet", "socket-inet6"):
            event["src_addr"] = child.get("local-addr", "")
            event["src_port"] = _safe_int(child.get("local-port"))
            event["dst_addr"] = child.get("remote-addr", "")
            event["dst_port"] = _safe_int(child.get("remote-port"))

        elif tag == "in_addr":
            if not event["dst_addr"]:
                event["dst_addr"] = child.get("addr", "")

        elif tag == "signal" and event_type == AUE_KILL:
            event["signal_num"] = _safe_int(child.get("signal"))

    # Derive name from path
    event["name"] = os.path.basename(event["path"]) if event["path"] else ""

    return event


# ── Console Formatter ─────────────────────────────────────────────────────────

_ICON = {
    AUE_EXECVE:  "\U0001f680",  # 🚀
    AUE_FORK:    "\U0001f33f",  # 🌿
    AUE_KILL:    "\U0001f480",  # 💀
    AUE_CONNECT: "\U0001f310",  # 🌐
}

def _console_print(evt: dict, chain: list[str]) -> None:
    ts = datetime.fromtimestamp(evt["timestamp"]).strftime("%H:%M:%S")
    icon = _ICON.get(evt["event_type"], "\U0001f4c4")  # 📄 default
    chain_str = " → ".join(chain) if chain else "?"
    cmd = " ".join(evt["args"]) or evt["path"] or "(unknown)"
    print(
        f"{icon} [{ts}] PID={evt['pid']} PPID={evt['ppid']} "
        f"CHAIN={chain_str} CMD={cmd[:120]}"
    )


# ── BSM Sensor ────────────────────────────────────────────────────────────────

class BSMSensor(threading.Thread):
    """
    Opens /dev/auditpipe and spawns `praudit -l` to consume kernel audit
    events. Parsed events are placed on `event_queue` and recorded in
    `ring_buffer`. Maintains a live `process_tree`.

    Falls back to polling `ps` every PS_POLL_INTERVAL seconds if
    /dev/auditpipe is not available (e.g. running without root or inside a VM).
    """

    def __init__(
        self,
        event_queue:  Optional[queue.Queue] = None,
        ring_buffer:  Optional[RingBuffer]  = None,
        process_tree: Optional[ProcessTree] = None,
        verbose:      bool                  = False,
    ):
        super().__init__(daemon=True, name="BSMSensor")
        self.event_queue  = event_queue  or queue.Queue(maxsize=50_000)
        self.ring_buffer  = ring_buffer  or RingBuffer(maxlen=10_000)
        self.process_tree = process_tree or ProcessTree()
        self.verbose      = verbose
        self._stop_event  = threading.Event()

    def stop(self) -> None:
        self._stop_event.set()

    def run(self) -> None:
        self.process_tree.seed_from_ps()

        if os.path.exists("/dev/auditpipe"):
            log.info("BSMSensor: /dev/auditpipe available — using OpenBSM mode.")
            self._run_bsm()
        else:
            log.warning(
                "BSMSensor: /dev/auditpipe not available — falling back to ps polling."
            )
            self._run_ps_fallback()

    # ── OpenBSM mode ─────────────────────────────────────────────────────────

    def _run_bsm(self) -> None:
        cmd = ["praudit", "-l", "-r", "/dev/auditpipe"]
        proc: Optional[subprocess.Popen] = None

        while not self._stop_event.is_set():
            try:
                proc = subprocess.Popen(
                    cmd,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.DEVNULL,
                    bufsize=1,
                    text=True,
                )
                log.info("praudit started (pid=%d).", proc.pid)

                for line in proc.stdout:  # type: ignore[union-attr]
                    if self._stop_event.is_set():
                        break
                    evt = _parse_bsm_xml(line)
                    if evt is None:
                        continue
                    self._process_event(evt)

            except Exception as exc:
                log.error("BSMSensor error: %s — restarting in 3 s.", exc)

            finally:
                if proc and proc.poll() is None:
                    proc.terminate()
                    try:
                        proc.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        proc.kill()

            if not self._stop_event.is_set():
                time.sleep(3)

    # ── ps polling fallback ───────────────────────────────────────────────────

    def _run_ps_fallback(self) -> None:
        known_pids: set[int] = set()

        while not self._stop_event.is_set():
            try:
                out = subprocess.run(
                    ["ps", "-axo", "pid,ppid,uid,comm,args"],
                    capture_output=True, text=True, timeout=10
                )
                current_pids: set[int] = set()

                for line in out.stdout.splitlines()[1:]:
                    parts = line.split(None, 4)
                    if len(parts) < 2:
                        continue
                    try:
                        pid  = int(parts[0])
                        ppid = int(parts[1])
                        uid  = int(parts[2]) if len(parts) > 2 else 0
                        name = parts[3] if len(parts) > 3 else ""
                        args_str = parts[4] if len(parts) > 4 else ""
                    except (ValueError, IndexError):
                        continue

                    current_pids.add(pid)

                    if pid not in known_pids:
                        # New process discovered
                        image = args_str.split()[0] if args_str else name
                        args  = args_str.split() if args_str else []
                        evt = {
                            "event_type": AUE_EXECVE,
                            "timestamp":  time.time(),
                            "pid":        pid,
                            "ppid":       ppid,
                            "uid":        uid,
                            "path":       image,
                            "name":       os.path.basename(image),
                            "args":       args,
                            "src_addr":   "",
                            "src_port":   0,
                            "dst_addr":   "",
                            "dst_port":   0,
                        }
                        self.process_tree.update_exec(pid, ppid, image, name, time.time())
                        self._enqueue(evt)

                # Detect exits
                for gone in known_pids - current_pids:
                    self.process_tree.remove(gone)

                known_pids = current_pids

            except Exception as exc:
                log.warning("ps fallback error: %s", exc)

            time.sleep(PS_POLL_INTERVAL)

    # ── Shared event processing ───────────────────────────────────────────────

    def _process_event(self, evt: dict) -> None:
        etype = evt["event_type"]
        pid   = evt["pid"]
        ppid  = evt["ppid"]

        if etype == AUE_EXECVE:
            self.process_tree.update_exec(
                pid, ppid, evt["path"], evt["name"], evt["timestamp"]
            )
        elif etype == AUE_FORK:
            self.process_tree.update_fork(pid, ppid)

        chain = self.process_tree.ancestry_chain(pid)
        evt["ancestry"] = chain

        if self.verbose:
            _console_print(evt, chain)

        self._enqueue(evt)

    def _enqueue(self, evt: dict) -> None:
        self.ring_buffer.append(evt)
        try:
            self.event_queue.put_nowait(evt)
        except queue.Full:
            # Drop oldest to make room
            try:
                self.event_queue.get_nowait()
            except queue.Empty:
                pass
            try:
                self.event_queue.put_nowait(evt)
            except queue.Full:
                pass
