#!/usr/bin/env python3
"""
SparrowShield — Linux Process Sensor
Monitors new processes via /proc polling + netlink AUDIT socket (AUDIT_SYSCALL).
Emits ProcessEvent dataclass objects into a queue.
"""

from __future__ import annotations

import ctypes
import errno
import logging
import os
import queue
import socket
import struct
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

log = logging.getLogger(__name__)

POLL_INTERVAL_S = 0.5

# Netlink constants
NETLINK_AUDIT    = 9
AUDIT_STATUS_GET = 1000
AUDIT_STATUS_SET = 1001
AUDIT_GET        = 1000
AUDIT_SET        = 1001
AUDIT_SYSCALL    = 1300
AUDIT_PATH       = 1302
AUDIT_SOCKADDR   = 1306
AUDIT_EXECVE     = 1309
AUDIT_USER       = 1005
SOL_NETLINK      = 270

# struct nlmsghdr: len, type, flags, seq, pid
NLMSG_HDRLEN = 16
NLM_F_REQUEST = 0x0001


@dataclass
class ProcessEvent:
    pid:        int
    ppid:       int
    image_path: str
    cmdline:    str
    user:       str
    event_type: str = "ProcessStart"


def _read_proc_file(path: str, max_bytes: int = 4096) -> str:
    """Read a /proc file safely, return empty string on error."""
    try:
        with open(path, "rb") as f:
            data = f.read(max_bytes)
        return data.replace(b"\x00", b" ").decode("utf-8", errors="replace").strip()
    except OSError:
        return ""


def _proc_info(pid: int) -> Optional[ProcessEvent]:
    """
    Read /proc/<pid>/{cmdline,exe,status} to build a ProcessEvent.
    Returns None if the process has already exited.
    """
    base = f"/proc/{pid}"
    if not os.path.isdir(base):
        return None

    # cmdline: args joined by NUL
    cmdline = _read_proc_file(f"{base}/cmdline")

    # exe: symlink to binary
    try:
        image_path = os.readlink(f"{base}/exe")
    except OSError:
        image_path = cmdline.split()[0] if cmdline else ""

    # status: ppid + uid
    ppid = 0
    uid  = 0
    for line in _read_proc_file(f"{base}/status").splitlines():
        if line.startswith("PPid:"):
            try:
                ppid = int(line.split()[1])
            except (ValueError, IndexError):
                pass
        elif line.startswith("Uid:"):
            try:
                uid = int(line.split()[1])
            except (ValueError, IndexError):
                pass

    # Resolve uid -> username
    user = _uid_to_username(uid)

    return ProcessEvent(
        pid=pid,
        ppid=ppid,
        image_path=image_path,
        cmdline=cmdline,
        user=user,
    )


_UID_CACHE: dict[int, str] = {}


def _uid_to_username(uid: int) -> str:
    if uid in _UID_CACHE:
        return _UID_CACHE[uid]
    try:
        import pwd
        name = pwd.getpwuid(uid).pw_name
    except (KeyError, ImportError):
        name = str(uid)
    _UID_CACHE[uid] = name
    return name


# ── /proc poller ─────────────────────────────────────────────────────────────

class ProcPoller(threading.Thread):
    """
    Polls /proc every POLL_INTERVAL_S for new PIDs and emits ProcessEvents.
    """

    def __init__(self, out_q: queue.Queue):
        super().__init__(daemon=True, name="ProcPoller")
        self._q       = out_q
        self._seen:   set[int] = set()
        self._stop    = threading.Event()

    def run(self):
        # Seed with existing PIDs so we don't flood on startup
        self._seen = self._current_pids()
        log.info("ProcPoller started — %d existing PIDs seeded.", len(self._seen))

        while not self._stop.is_set():
            time.sleep(POLL_INTERVAL_S)
            try:
                current = self._current_pids()
                new_pids = current - self._seen
                self._seen = current
                for pid in new_pids:
                    evt = _proc_info(pid)
                    if evt is not None:
                        try:
                            self._q.put_nowait(evt)
                        except queue.Full:
                            log.warning("proc_q full, dropping pid=%d", pid)
            except Exception as exc:
                log.error("ProcPoller error: %s", exc)

    def stop(self):
        self._stop.set()

    @staticmethod
    def _current_pids() -> set[int]:
        pids: set[int] = set()
        try:
            for entry in os.scandir("/proc"):
                if entry.name.isdigit():
                    pids.add(int(entry.name))
        except OSError:
            pass
        return pids


# ── Netlink AUDIT socket ─────────────────────────────────────────────────────

def _nlmsg(msg_type: int, body: bytes = b"") -> bytes:
    """Build a netlink message."""
    total = NLMSG_HDRLEN + len(body)
    # align to 4 bytes
    total = (total + 3) & ~3
    hdr = struct.pack("IHHII", total, msg_type, NLM_F_REQUEST, 1, os.getpid())
    return hdr + body + b"\x00" * (total - NLMSG_HDRLEN - len(body))


def _open_audit_socket() -> Optional[socket.socket]:
    """Try to open an AF_NETLINK AUDIT socket. Returns None if not permitted."""
    try:
        sock = socket.socket(socket.AF_NETLINK, socket.SOCK_RAW, NETLINK_AUDIT)
        sock.bind((0, 0))
        sock.settimeout(1.0)
        # Enable audit (send AUDIT_STATUS_SET with enabled=1)
        # struct audit_status: mask, enabled, failure, pid, rate_limit, backlog_limit
        status_body = struct.pack("IIIIII", 0x7, 1, 0, os.getpid(), 0, 0)
        sock.send(_nlmsg(AUDIT_SET, status_body))
        log.info("Netlink AUDIT socket opened (kernel syscall events enabled).")
        return sock
    except (OSError, PermissionError) as exc:
        log.info("Netlink AUDIT socket unavailable (%s) — using /proc polling only.", exc)
        return None


class NetlinkAuditListener(threading.Thread):
    """
    Listens on the AUDIT netlink socket for AUDIT_SYSCALL events (exec/open/connect).
    Converts them to ProcessEvents and emits on out_q.
    Falls back gracefully if the socket can't be opened.
    """

    def __init__(self, out_q: queue.Queue):
        super().__init__(daemon=True, name="NetlinkAudit")
        self._q    = out_q
        self._stop = threading.Event()
        self._sock: Optional[socket.socket] = None

    def run(self):
        self._sock = _open_audit_socket()
        if self._sock is None:
            log.info("NetlinkAuditListener exiting — no audit socket.")
            return

        log.info("NetlinkAuditListener running.")
        while not self._stop.is_set():
            try:
                data = self._sock.recv(65536)
                self._parse_audit_msg(data)
            except socket.timeout:
                continue
            except OSError as exc:
                if exc.errno == errno.EINTR:
                    continue
                log.error("NetlinkAuditListener recv error: %s", exc)
                break

    def _parse_audit_msg(self, data: bytes):
        """
        Parse a raw netlink audit message.
        AUDIT_SYSCALL records look like:
          audit(...): arch=... syscall=59 ... pid=1234 ppid=... exe="..." ...
        """
        if len(data) < NLMSG_HDRLEN:
            return
        msg_len, msg_type, flags, seq, pid = struct.unpack_from("IHHII", data)
        body = data[NLMSG_HDRLEN:msg_len].decode("utf-8", errors="replace")

        # We only care about AUDIT_SYSCALL (execve=59/322, connect=42, open=2)
        if msg_type != AUDIT_SYSCALL:
            return

        fields = self._kv(body)
        syscall = int(fields.get("syscall", "0"))
        if syscall not in (2, 42, 59, 322):   # open, connect, execve, execveat
            return

        try:
            apid = int(fields.get("pid", "0"))
        except ValueError:
            return
        if apid == 0:
            return

        evt = _proc_info(apid)
        if evt:
            # Annotate with syscall type
            evt.event_type = "ProcessStart" if syscall in (59, 322) else "ProcessActivity"
            try:
                self._q.put_nowait(evt)
            except queue.Full:
                pass

    @staticmethod
    def _kv(body: str) -> dict[str, str]:
        result: dict[str, str] = {}
        for tok in body.split():
            if "=" in tok:
                k, _, v = tok.partition("=")
                result[k.strip()] = v.strip('"').strip("'")
        return result

    def stop(self):
        self._stop.set()
        if self._sock:
            try:
                self._sock.close()
            except OSError:
                pass


# ── Public sensor class ───────────────────────────────────────────────────────

class LinuxProcessSensor:
    """
    Combines ProcPoller + NetlinkAuditListener.
    Consumers read from the shared queue.
    """

    def __init__(self, out_q: queue.Queue):
        self._q       = out_q
        self._poller  = ProcPoller(out_q)
        self._netlink = NetlinkAuditListener(out_q)

    def start(self):
        self._poller.start()
        self._netlink.start()
        log.info("LinuxProcessSensor started.")

    def stop(self):
        self._poller.stop()
        self._netlink.stop()
        log.info("LinuxProcessSensor stopped.")
