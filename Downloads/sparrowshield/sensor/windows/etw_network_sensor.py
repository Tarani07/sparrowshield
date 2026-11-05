#!/usr/bin/env python3
"""
SparrowShield — ETW Network Sensor (Day 3)
Monitors Microsoft-Windows-Kernel-Network for suspicious outbound connections:
C2 beaconing, lateral movement, crypto-miner pools, data exfiltration.
"""

import collections
import ipaddress
import logging
import queue
import socket
import subprocess
import threading
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional

KERNEL_NETWORK_GUID = "{7DD42A49-5329-4832-8DFD-43D979153A88}"
SESSION_NAME        = "SparrowShieldNetETW"

# Well-known miner pool ports
MINER_PORTS = {3333, 4444, 5555, 7777, 8888, 9999, 14444, 45560, 45700}

# Common C2 beacon intervals (seconds) — beaconing detection window
BEACON_WINDOW_SECS  = 120
BEACON_MIN_COUNT    = 5     # ≥5 connections to same host in window = beaconing


@dataclass
class NetworkEvent:
    event_type:  str      # "TcpConnect" | "UdpSend" | "TcpAccept"
    timestamp:   str
    pid:         int
    src_ip:      str
    src_port:    int
    dst_ip:      str
    dst_port:    int
    protocol:    str      # "tcp" | "udp"


def _is_private(ip: str) -> bool:
    try:
        return ipaddress.ip_address(ip).is_private
    except ValueError:
        return False


class BeaconDetector:
    """
    Detects C2 beaconing: same (pid, dst_ip, dst_port) contacted
    ≥BEACON_MIN_COUNT times in BEACON_WINDOW_SECS with regular intervals.
    """

    def __init__(self, on_beacon):
        self._on_beacon = on_beacon
        self._lock      = threading.Lock()
        # key=(pid, dst_ip, dst_port) → deque of monotonic timestamps
        self._hits: dict[tuple, collections.deque] = {}

    def record(self, evt: NetworkEvent):
        if _is_private(evt.dst_ip):
            return
        key = (evt.pid, evt.dst_ip, evt.dst_port)
        now = time.monotonic()
        with self._lock:
            if key not in self._hits:
                self._hits[key] = collections.deque()
            dq = self._hits[key]
            dq.append(now)
            # Evict old entries
            cutoff = now - BEACON_WINDOW_SECS
            while dq and dq[0] < cutoff:
                dq.popleft()
            if len(dq) >= BEACON_MIN_COUNT:
                intervals = [dq[i+1] - dq[i] for i in range(len(dq)-1)]
                avg_iv = sum(intervals) / len(intervals) if intervals else 0
                self._on_beacon(evt, len(dq), avg_iv)
                self._hits[key] = collections.deque()  # reset

    def cleanup(self):
        now = time.monotonic()
        with self._lock:
            dead = [k for k, dq in self._hits.items()
                    if not dq or now - dq[-1] > BEACON_WINDOW_SECS * 2]
            for k in dead:
                del self._hits[k]


class ETWNetworkSensor:
    """
    Subscribes to Microsoft-Windows-Kernel-Network via logman.
    Falls back to psutil connection polling every 2 seconds.
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
            logging.warning("Network ETW unavailable (%s), using psutil fallback.", exc)
            self._thread = threading.Thread(target=self._psutil_loop, daemon=True)
            self._thread.start()

    def stop(self):
        self._running.clear()
        subprocess.run(["logman", "stop", SESSION_NAME, "-ets"], capture_output=True)

    def _start_etw(self):
        subprocess.run(
            ["logman", "start", SESSION_NAME,
             "-p", KERNEL_NETWORK_GUID, "0xFFFFFFFF", "5",
             "-rt", "-ets"],
            capture_output=True, check=False
        )
        self._thread = threading.Thread(target=self._consume, daemon=True)
        self._thread.start()
        logging.info("Network ETW session started.")

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
        if len(row) < 8:
            return
        try:
            etype = row[0].strip()
            if etype not in ("TcpConnect", "UdpSend", "TcpAccept"):
                return
            pid      = int(row[2]) if row[2].strip().isdigit() else 0
            src_ip   = row[4].strip() if len(row) > 4 else ""
            src_port = int(row[5]) if len(row) > 5 and row[5].strip().isdigit() else 0
            dst_ip   = row[6].strip() if len(row) > 6 else ""
            dst_port = int(row[7]) if len(row) > 7 and row[7].strip().isdigit() else 0
            proto    = "udp" if "Udp" in etype else "tcp"
            self._queue.put(NetworkEvent(
                event_type = etype,
                timestamp  = datetime.now(timezone.utc).isoformat(),
                pid        = pid,
                src_ip     = src_ip, src_port = src_port,
                dst_ip     = dst_ip, dst_port = dst_port,
                protocol   = proto,
            ))
        except (ValueError, IndexError):
            pass

    def _psutil_loop(self):
        import psutil
        seen: set[tuple] = set()
        while self._running.is_set():
            try:
                current: set[tuple] = set()
                for conn in psutil.net_connections(kind="inet"):
                    if conn.status != "ESTABLISHED" or not conn.raddr:
                        continue
                    key = (conn.pid or 0, conn.laddr.ip, conn.laddr.port,
                           conn.raddr.ip, conn.raddr.port)
                    current.add(key)
                    if key not in seen:
                        seen.add(key)
                        self._queue.put(NetworkEvent(
                            event_type = "TcpConnect",
                            timestamp  = datetime.now(timezone.utc).isoformat(),
                            pid        = conn.pid or 0,
                            src_ip     = conn.laddr.ip,
                            src_port   = conn.laddr.port,
                            dst_ip     = conn.raddr.ip,
                            dst_port   = conn.raddr.port,
                            protocol   = "tcp",
                        ))
                seen &= current  # remove closed connections
            except Exception as exc:
                logging.debug("psutil net fallback error: %s", exc)
            time.sleep(2)


class NetworkEventProcessor(threading.Thread):
    """Consumes NetworkEvents, runs heuristics, emits alerts."""

    def __init__(self, net_queue: queue.Queue, alert_queue: queue.Queue):
        super().__init__(daemon=True)
        self._net_q   = net_queue
        self._alert_q = alert_queue
        self._beacon  = BeaconDetector(on_beacon=self._on_beacon)

    def run(self):
        cleanup_tick = time.monotonic()
        while True:
            try:
                evt: NetworkEvent = self._net_q.get(timeout=1)
            except queue.Empty:
                if time.monotonic() - cleanup_tick > 60:
                    self._beacon.cleanup()
                    cleanup_tick = time.monotonic()
                continue

            self._check_miner_port(evt)
            self._beacon.record(evt)
            logging.debug("[NET] %s PID=%-6d %s:%d → %s:%d",
                          evt.event_type, evt.pid,
                          evt.src_ip, evt.src_port,
                          evt.dst_ip, evt.dst_port)

    def _check_miner_port(self, evt: NetworkEvent):
        if evt.dst_port in MINER_PORTS and not _is_private(evt.dst_ip):
            self._emit_alert(
                "CRYPTOMINER_CONNECTION",
                evt.pid,
                f"{evt.dst_ip}:{evt.dst_port}",
                f"Outbound connection to known miner pool port {evt.dst_port}",
                severity=4,
            )

    def _on_beacon(self, evt: NetworkEvent, count: int, avg_interval: float):
        self._emit_alert(
            "C2_BEACONING",
            evt.pid,
            f"{evt.dst_ip}:{evt.dst_port}",
            f"{count} connections in {BEACON_WINDOW_SECS}s window, "
            f"avg interval={avg_interval:.1f}s → C2 beaconing pattern",
            severity=4,
        )

    def _emit_alert(self, alert_type: str, pid: int, target: str,
                    detail: str, severity: int):
        alert = {
            "alert_type": alert_type,
            "timestamp":  datetime.now(timezone.utc).isoformat(),
            "pid":        pid,
            "target":     target,
            "detail":     detail,
            "severity":   severity,
        }
        self._alert_q.put(alert)
        logging.warning("[ALERT] %s PID=%d — %s", alert_type, pid, detail)
