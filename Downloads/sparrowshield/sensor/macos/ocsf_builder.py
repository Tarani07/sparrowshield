#!/usr/bin/env python3
"""
SparrowShield — OCSF Builder (macOS)
Converts raw sensor events to OCSF v1.1.0 JSON.

  Class 1007 — Process Activity
  Class 1001 — File System Activity
  Class 4001 — Network Activity

macOS specifics:
  device.os.type_id = 300  (macOS)
  device.os.name    = "macOS"
"""

from __future__ import annotations

import hashlib
import os
from datetime import datetime, timezone
from typing import Optional

try:
    import sys as _sys, os as _os
    _ml = _os.path.join(_os.path.dirname(__file__), "..", "ml")
    if _ml not in _sys.path: _sys.path.insert(0, _ml)
    from mitre_mapper import enrich_event as _mitre_enrich
except Exception:
    def _mitre_enrich(e: dict) -> dict: return e

PRODUCT_META = {
    "name":        "SparrowShield",
    "vendor_name": "SparrowShield",
    "version":     "2.0.0",
    "feature":     {"name": "macOS OpenBSM Sensor"},
}

_OS_META = {
    "type_id": 300,
    "name":    "macOS",
}


# ── Helpers ───────────────────────────────────────────────────────────────────

def _severity(threat_score: float) -> int:
    """Map threat score to OCSF severity_id."""
    if threat_score >= 0.9:
        return 5   # Critical
    if threat_score >= 0.7:
        return 4   # High
    if threat_score >= 0.5:
        return 3   # Medium
    if threat_score >= 0.3:
        return 2   # Low
    return 1       # Informational


def _now_ms() -> int:
    return int(datetime.now(timezone.utc).timestamp() * 1000)


def _file_hash(path: str) -> list[dict]:
    hashes: list[dict] = []
    try:
        with open(path, "rb") as f:
            data = f.read(4 * 1024 * 1024)   # cap at 4 MB
        hashes.append({"algorithm_id": 2, "value": hashlib.md5(data).hexdigest()})
        hashes.append({"algorithm_id": 3, "value": hashlib.sha256(data).hexdigest()})
    except OSError:
        pass
    return hashes


def _device_block(device_uid: str, hostname: str) -> dict:
    return {
        "uid":      device_uid,
        "hostname": hostname,
        "type_id":  2,            # 2 = Desktop/Laptop (OCSF)
        "os":       dict(_OS_META),
    }


def _metadata() -> dict:
    return {
        "version": "1.1.0",
        "product": PRODUCT_META,
    }


# ── Class 1007 — Process Activity ────────────────────────────────────────────

def process_activity(
    *,
    activity_id:  int,          # 1=Launch 2=Terminate 3=Open 4=Inject
    pid:          int,
    ppid:         int,
    image_path:   str,
    cmdline:      str,
    user:         str,
    device_uid:   str,
    hostname:     str,
    threat_score: float = 0.0,
    ancestry:     Optional[list[str]] = None,
    exit_code:    Optional[int] = None,
) -> dict:
    activity_map = {1: "Launch", 2: "Terminate", 3: "Open", 4: "Inject"}
    name   = os.path.basename(image_path) if image_path else "unknown"
    hashes = _file_hash(image_path) if image_path and activity_id == 1 else []

    event: dict = {
        "class_uid":     1007,
        "class_name":    "Process Activity",
        "activity_id":   activity_id,
        "activity_name": activity_map.get(activity_id, "Unknown"),
        "time":          _now_ms(),
        "severity_id":   _severity(threat_score),
        "status_id":     1,
        "metadata":      _metadata(),
        "device":        _device_block(device_uid, hostname),
        "process": {
            "pid":      pid,
            "name":     name,
            "cmd_line": cmdline,
            "user":     {"name": user} if user else {},
            "file": {
                "path":   image_path,
                "name":   name,
                "hashes": hashes,
            },
            "parent_process": {"pid": ppid},
        },
        "unmapped": {
            "threat_score": round(threat_score, 4),
            "ancestry":     ancestry or [],
        },
    }

    if exit_code is not None:
        event["process"]["exit_code"] = exit_code

    event = _mitre_enrich(event)
    return event


# ── Class 1001 — File System Activity ────────────────────────────────────────

def file_activity(
    *,
    activity_id:  int,          # 1=Create 2=Read 3=Update 4=Delete 5=Rename
    pid:          int,
    path:         str,
    device_uid:   str,
    hostname:     str,
    threat_score: float = 0.0,
    alert_type:   str = "",
    rename_dest:  str = "",
) -> dict:
    activity_map = {1: "Create", 2: "Read", 3: "Update", 4: "Delete", 5: "Rename"}
    name = os.path.basename(path) if path else ""
    ext  = os.path.splitext(name)[1].lower() if name else ""

    event: dict = {
        "class_uid":     1001,
        "class_name":    "File System Activity",
        "activity_id":   activity_id,
        "activity_name": activity_map.get(activity_id, "Unknown"),
        "time":          _now_ms(),
        "severity_id":   _severity(threat_score),
        "status_id":     1,
        "metadata":      _metadata(),
        "device":        _device_block(device_uid, hostname),
        "actor": {
            "process": {"pid": pid},
        },
        "file": {
            "path":      path,
            "name":      name,
            "type_id":   1,
            "extension": ext.lstrip("."),
        },
        "unmapped": {
            "threat_score": round(threat_score, 4),
            "alert_type":   alert_type,
        },
    }

    if rename_dest:
        event["file_result"] = {
            "path": rename_dest,
            "name": os.path.basename(rename_dest),
        }

    event = _mitre_enrich(event)
    return event


# ── Class 4001 — Network Activity ────────────────────────────────────────────

def network_activity(
    *,
    activity_id:  int,          # 1=Open 2=Close 3=Reset 4=Fail 5=Refuse 6=Traffic
    pid:          int,
    src_ip:       str,
    src_port:     int,
    dst_ip:       str,
    dst_port:     int,
    protocol:     str = "tcp",
    device_uid:   str,
    hostname:     str,
    threat_score: float = 0.0,
    alert_type:   str = "",
) -> dict:
    activity_map = {1: "Open", 2: "Close", 3: "Reset", 4: "Fail", 5: "Refuse", 6: "Traffic"}
    proto_id = 6 if protocol.lower() == "tcp" else 17   # IANA protocol numbers

    event = {
        "class_uid":     4001,
        "class_name":    "Network Activity",
        "activity_id":   activity_id,
        "activity_name": activity_map.get(activity_id, "Unknown"),
        "time":          _now_ms(),
        "severity_id":   _severity(threat_score),
        "status_id":     1,
        "metadata":      _metadata(),
        "device":        _device_block(device_uid, hostname),
        "actor": {
            "process": {"pid": pid},
        },
        "src_endpoint": {
            "ip":   src_ip,
            "port": src_port,
        },
        "dst_endpoint": {
            "ip":   dst_ip,
            "port": dst_port,
        },
        "connection_info": {
            "protocol_id":   proto_id,
            "protocol_name": protocol.upper(),
        },
        "unmapped": {
            "threat_score": round(threat_score, 4),
            "alert_type":   alert_type,
        },
    }
    event = _mitre_enrich(event)
    return event
