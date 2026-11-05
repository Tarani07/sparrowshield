#!/usr/bin/env python3
"""
SparrowShield — Linux Network Sensor
Monitors /proc/net/tcp, /proc/net/tcp6, /proc/net/udp every 2 seconds.
Detects new ESTABLISHED connections and flags suspicious ports.
Emits NetworkEvent dataclass objects into a queue.
"""

from __future__ import annotations

import ipaddress
import logging
import queue
import socket
import struct
import threading
import time
from dataclasses import dataclass
from typing import Optional

log = logging.getLogger(__name__)

POLL_INTERVAL_S = 2.0

# Suspicious ports
SUSPICIOUS_PORTS: set[int] = {
    # Common reverse shell / C2
    4444, 1337, 9001, 31337, 4445, 5555, 6666, 6667, 6668, 6669,
    # Metasploit default
    4443, 8443,
    # Cobalt Strike / Meterpreter
    50050,
    # Crypto miners (stratum)
    3333, 14444, 45700, 7777, 45560, 3032, 5730, 20536,
    # XMRig / NiceHash
    14433, 3256,
}


@dataclass
class NetworkEvent:
    src_ip:    str
    src_port:  int
    dst_ip:    str
    dst_port:  int
    pid:       int       # 0 if unknown
    protocol:  str       # "tcp" | "udp"
    suspicious: bool


# ── /proc/net parser ──────────────────────────────────────────────────────────

def _hex_to_ip4(hex_str: str) -> str:
    """Convert kernel hex-encoded little-endian IPv4 to dotted string."""
    try:
        n = int(hex_str, 16)
        packed = struct.pack("<I", n)
        return socket.inet_ntoa(packed)
    except Exception:
        return "0.0.0.0"


def _hex_to_ip6(hex_str: str) -> str:
    """Convert kernel hex-encoded IPv6 to colon string."""
    try:
        # Kernel writes 4 x uint32 in little-endian
        parts = [hex_str[i:i+8] for i in range(0, 32, 8)]
        raw = b"".join(struct.pack("<I", int(p, 16)) for p in parts)
        return str(ipaddress.ip_address(raw))
    except Exception:
        return "::"


def _parse_proc_net(path: str, v6: bool = False) -> list[tuple[str, int, str, int, int]]:
    """
    Parse /proc/net/tcp[6] or /proc/net/udp[6].
    Returns list of (src_ip, src_port, dst_ip, dst_port, inode).
    Only ESTABLISHED state (state=01) for TCP; all for UDP.
    """
    results = []
    try:
        with open(path) as f:
            lines = f.readlines()
    except OSError:
        return results

    for line in lines[1:]:  # skip header
        parts = line.split()
        if len(parts) < 10:
            continue
        local_addr, remote_addr, state = parts[1], parts[2], parts[3]
        inode = int(parts[9]) if parts[9].isdigit() else 0

        # For TCP only track ESTABLISHED (01); for UDP track all (state=07)
        if "tcp" in path and state != "01":
            continue

        local_ip_hex, _, local_port_hex   = local_addr.partition(":")
        remote_ip_hex, _, remote_port_hex = remote_addr.partition(":")

        if v6:
            src_ip = _hex_to_ip6(local_ip_hex)
            dst_ip = _hex_to_ip6(remote_ip_hex)
        else:
            src_ip = _hex_to_ip4(local_ip_hex)
            dst_ip = _hex_to_ip4(remote_ip_hex)

        try:
            src_port = int(local_port_hex, 16)
            dst_port = int(remote_port_hex, 16)
        except ValueError:
            continue

        results.append((src_ip, src_port, dst_ip, dst_port, inode))

    return results


# ── inode → PID lookup ───────────────────────────────────────────────────────

def _build_inode_to_pid() -> dict[int, int]:
    """Walk /proc/<pid>/fd to map socket inodes to PIDs."""
    mapping: dict[int, int] = {}
    try:
        for entry in __import__("os").scandir("/proc"):
            if not entry.name.isdigit():
                continue
            pid = int(entry.name)
            fd_dir = f"/proc/{pid}/fd"
            try:
                for fd_entry in __import__("os").scandir(fd_dir):
                    try:
                        target = __import__("os").readlink(fd_entry.path)
                        if target.startswith("socket:["):
                            inode = int(target[8:-1])
                            mapping[inode] = pid
                    except OSError:
                        pass
            except OSError:
                pass
    except OSError:
        pass
    return mapping


# ── Sensor class ─────────────────────────────────────────────────────────────

class LinuxNetworkSensor(threading.Thread):
    """
    Polls /proc/net/{tcp,tcp6,udp} every POLL_INTERVAL_S seconds.
    Emits NetworkEvent for new connections; flags suspicious ports.
    """

    def __init__(self, out_q: queue.Queue):
        super().__init__(daemon=True, name="LinuxNetSensor")
        self._q    = out_q
        self._stop = threading.Event()
        # Track known connections to detect new ones: frozenset of (src_ip, src_port, dst_ip, dst_port)
        self._seen: set[tuple[str, int, str, int]] = set()

    def run(self):
        log.info("LinuxNetworkSensor started.")
        # Seed initial state silently
        self._seen = self._snapshot()

        while not self._stop.is_set():
            time.sleep(POLL_INTERVAL_S)
            try:
                current = self._snapshot_with_inodes()
                inode_map = _build_inode_to_pid()
                current_keys: set[tuple[str, int, str, int]] = {c[:4] for c in current}

                new_conns = [c for c in current if c[:4] not in self._seen]
                self._seen = current_keys

                for src_ip, src_port, dst_ip, dst_port, inode, proto in new_conns:
                    # Skip loopback-only if destination is localhost
                    if dst_ip in ("127.0.0.1", "::1", "0.0.0.0", "::"):
                        continue
                    pid = inode_map.get(inode, 0)
                    suspicious = dst_port in SUSPICIOUS_PORTS or src_port in SUSPICIOUS_PORTS
                    evt = NetworkEvent(
                        src_ip=src_ip,
                        src_port=src_port,
                        dst_ip=dst_ip,
                        dst_port=dst_port,
                        pid=pid,
                        protocol=proto,
                        suspicious=suspicious,
                    )
                    try:
                        self._q.put_nowait(evt)
                    except queue.Full:
                        log.warning("net_q full, dropping connection %s:%d -> %s:%d",
                                    src_ip, src_port, dst_ip, dst_port)
            except Exception as exc:
                log.error("LinuxNetworkSensor error: %s", exc)

    def _snapshot(self) -> set[tuple[str, int, str, int]]:
        result: set[tuple[str, int, str, int]] = set()
        for path, v6, proto in [
            ("/proc/net/tcp",  False, "tcp"),
            ("/proc/net/tcp6", True,  "tcp"),
            ("/proc/net/udp",  False, "udp"),
            ("/proc/net/udp6", True,  "udp"),
        ]:
            for src_ip, src_port, dst_ip, dst_port, _inode in _parse_proc_net(path, v6):
                result.add((src_ip, src_port, dst_ip, dst_port))
        return result

    def _snapshot_with_inodes(self) -> list[tuple[str, int, str, int, int, str]]:
        result = []
        for path, v6, proto in [
            ("/proc/net/tcp",  False, "tcp"),
            ("/proc/net/tcp6", True,  "tcp"),
            ("/proc/net/udp",  False, "udp"),
            ("/proc/net/udp6", True,  "udp"),
        ]:
            for src_ip, src_port, dst_ip, dst_port, inode in _parse_proc_net(path, v6):
                result.append((src_ip, src_port, dst_ip, dst_port, inode, proto))
        return result

    def stop(self):
        self._stop.set()
        log.info("LinuxNetworkSensor stopped.")
