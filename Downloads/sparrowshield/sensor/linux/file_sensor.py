#!/usr/bin/env python3
"""
SparrowShield — Linux File Sensor
Monitors sensitive paths using inotify (via inotify_simple) with a polling fallback.
Emits FileEvent objects into a queue.
"""

from __future__ import annotations

import logging
import os
import queue
import threading
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

log = logging.getLogger(__name__)

# Paths to watch
WATCH_PATHS = [
    "/tmp",
    "/var/tmp",
    "/dev/shm",
    str(Path.home() / ".ssh"),
    "/etc/cron.d",
    "/etc/cron.daily",
    "/etc/cron.hourly",
    "/etc/cron.monthly",
    "/etc/cron.weekly",
    "/etc/crontab",
    "/etc/passwd",
    "/etc/shadow",
    "/etc/sudoers",
]

POLL_INTERVAL_S = 2.0


@dataclass
class FileEvent:
    path:       str
    event_type: str   # "created" | "modified" | "deleted"
    pid:        int   # 0 if unknown
    uid:        int


# ── inotify implementation ────────────────────────────────────────────────────

def _try_inotify(watch_paths: list[str], out_q: queue.Queue, stop_event: threading.Event):
    """
    Use inotify_simple to watch paths. Returns False if unavailable.
    """
    try:
        import inotify_simple  # type: ignore
    except ImportError:
        return False

    IN_CREATE     = 0x100
    IN_MODIFY     = 0x2
    IN_DELETE     = 0x200
    IN_MOVED_FROM = 0x40
    IN_MOVED_TO   = 0x80
    IN_CLOSE_WRITE= 0x8
    MASK = IN_CREATE | IN_MODIFY | IN_DELETE | IN_MOVED_FROM | IN_MOVED_TO | IN_CLOSE_WRITE

    inotify = inotify_simple.INotify()
    wd_to_path: dict[int, str] = {}

    for p in watch_paths:
        rp = os.path.realpath(p)
        if os.path.exists(rp):
            try:
                wd = inotify.add_watch(rp, MASK)
                wd_to_path[wd] = rp
                log.debug("inotify watching: %s", rp)
            except OSError as exc:
                log.debug("inotify cannot watch %s: %s", rp, exc)

    if not wd_to_path:
        return False

    log.info("inotify_simple file sensor active — watching %d paths.", len(wd_to_path))

    while not stop_event.is_set():
        try:
            events = inotify.read(timeout=1000)  # ms
        except Exception:
            break
        for ev in events:
            base_path = wd_to_path.get(ev.wd, "")
            name      = ev.name if hasattr(ev, "name") else ""
            full_path = os.path.join(base_path, name) if name else base_path

            if ev.mask & (IN_CREATE | IN_MOVED_TO):
                etype = "created"
            elif ev.mask & IN_DELETE | IN_MOVED_FROM:
                etype = "deleted"
            else:
                etype = "modified"

            uid = 0
            try:
                uid = os.stat(full_path).st_uid
            except OSError:
                pass

            fe = FileEvent(path=full_path, event_type=etype, pid=0, uid=uid)
            try:
                out_q.put_nowait(fe)
            except queue.Full:
                pass

    inotify.close()
    return True


# ── Polling fallback ──────────────────────────────────────────────────────────

def _poll_watch(watch_paths: list[str], out_q: queue.Queue, stop_event: threading.Event):
    """
    Fallback: stat files/dirs every POLL_INTERVAL_S and emit events for changes.
    """
    log.info("File sensor using polling fallback (install inotify_simple for real-time).")

    # Build initial snapshot: {path -> mtime}
    snapshot: dict[str, float] = {}

    def _scan(base: str) -> dict[str, float]:
        result: dict[str, float] = {}
        try:
            if os.path.isfile(base):
                result[base] = os.stat(base).st_mtime
            elif os.path.isdir(base):
                for entry in os.scandir(base):
                    try:
                        result[entry.path] = entry.stat().st_mtime
                    except OSError:
                        pass
        except OSError:
            pass
        return result

    for p in watch_paths:
        snapshot.update(_scan(p))

    while not stop_event.is_set():
        time.sleep(POLL_INTERVAL_S)
        current: dict[str, float] = {}
        for p in watch_paths:
            current.update(_scan(p))

        for path, mtime in current.items():
            uid = 0
            try:
                uid = os.stat(path).st_uid
            except OSError:
                pass
            if path not in snapshot:
                fe = FileEvent(path=path, event_type="created", pid=0, uid=uid)
                try:
                    out_q.put_nowait(fe)
                except queue.Full:
                    pass
            elif mtime != snapshot[path]:
                fe = FileEvent(path=path, event_type="modified", pid=0, uid=uid)
                try:
                    out_q.put_nowait(fe)
                except queue.Full:
                    pass

        for path in snapshot:
            if path not in current:
                fe = FileEvent(path=path, event_type="deleted", pid=0, uid=0)
                try:
                    out_q.put_nowait(fe)
                except queue.Full:
                    pass

        snapshot = current


# ── Public sensor class ───────────────────────────────────────────────────────

class LinuxFileSensor(threading.Thread):
    """
    Monitors sensitive filesystem paths. Prefers inotify, falls back to polling.
    """

    def __init__(self, out_q: queue.Queue, watch_paths: Optional[list[str]] = None):
        super().__init__(daemon=True, name="LinuxFileSensor")
        self._q          = out_q
        self._paths      = watch_paths or WATCH_PATHS
        self._stop_event = threading.Event()

    def run(self):
        used_inotify = _try_inotify(self._paths, self._q, self._stop_event)
        if not used_inotify:
            _poll_watch(self._paths, self._q, self._stop_event)

    def stop(self):
        self._stop_event.set()
        log.info("LinuxFileSensor stopped.")
