#!/usr/bin/env python3
"""
SparrowShield — Response Engine (macOS)
Automated threat response: snapshot, kill, quarantine.

Protected processes are never killed regardless of score.
"""

from __future__ import annotations

import hashlib
import logging
import os
import shutil
import signal
import subprocess
import time
from pathlib import Path
from typing import Optional

from apfs_snapshot import take_snapshot_before_exec

log = logging.getLogger(__name__)

# ── Configuration ─────────────────────────────────────────────────────────────

QUARANTINE_DIR   = Path.home() / "Library" / "Application Support" / \
                   "SparrowShield" / "quarantine"

KILL_THRESHOLD   = 0.80   # kill + quarantine
ALERT_THRESHOLD  = 0.50   # alert only

# Process names that must never be killed
_PROTECTED_NAMES = frozenset({
    "launchd",
    "kernel_task",
    "WindowServer",
    "loginwindow",
    "coreaudiod",
    "cfprefsd",
    "distnoted",
    "notifyd",
})

_PROTECTED_PIDS = {1}   # launchd is always pid 1; kernel_task is pid 0


# ── Internal helpers ──────────────────────────────────────────────────────────

def _file_sha256(path: str) -> str:
    """Compute SHA-256 of a file (first 64 MB)."""
    h = hashlib.sha256()
    try:
        with open(path, "rb") as f:
            while True:
                chunk = f.read(65536)
                if not chunk:
                    break
                h.update(chunk)
    except OSError:
        return "0" * 64
    return h.hexdigest()


def _is_protected(pid: int, image_path: str) -> bool:
    """Return True if the process must not be killed."""
    if pid in _PROTECTED_PIDS:
        return True
    name = os.path.basename(image_path or "").lower()
    return name in _PROTECTED_NAMES


# ── Public API ────────────────────────────────────────────────────────────────

def kill_pid(pid: int) -> bool:
    """
    Send SIGKILL to `pid`. Falls back to `kill -9` subprocess if os.kill fails.
    Returns True on success.
    """
    log.info("ResponseEngine: killing pid=%d", pid)
    try:
        os.kill(pid, signal.SIGKILL)
        return True
    except (ProcessLookupError, PermissionError) as exc:
        log.warning("os.kill(%d) failed (%s), trying subprocess kill -9.", pid, exc)

    try:
        result = subprocess.run(
            ["kill", "-9", str(pid)],
            capture_output=True, timeout=5
        )
        if result.returncode == 0:
            return True
        log.error("subprocess kill -9 %d failed: %s", pid, result.stderr.strip())
        return False
    except Exception as exc:
        log.error("kill_pid(%d) subprocess error: %s", pid, exc)
        return False


def quarantine(image_path: str) -> Optional[str]:
    """
    Move `image_path` to the quarantine directory, named as
    <sha256>_<original_name>.quar. Leaves a zero-byte stub at the
    original location so dependent processes see the inode.

    Returns the quarantine path on success, None on failure.
    """
    if not image_path or not os.path.isfile(image_path):
        log.warning("quarantine: path not found or not a file: %s", image_path)
        return None

    try:
        QUARANTINE_DIR.mkdir(parents=True, exist_ok=True)

        sha256      = _file_sha256(image_path)
        base_name   = os.path.basename(image_path)
        quar_name   = f"{sha256}_{base_name}.quar"
        quar_path   = QUARANTINE_DIR / quar_name

        # Move the file
        shutil.move(image_path, str(quar_path))
        log.info("Quarantined %s → %s", image_path, quar_path)

        # Leave a zero-byte stub
        try:
            open(image_path, "wb").close()
            os.chmod(image_path, 0o000)
        except OSError as exc:
            log.debug("Could not create stub at %s: %s", image_path, exc)

        return str(quar_path)

    except Exception as exc:
        log.error("quarantine(%s) failed: %s", image_path, exc)
        return None


def evaluate(
    pid:        int,
    image_path: str,
    score:      float,
    process_name: str = "",
) -> dict:
    """
    Evaluate a threat score and take appropriate action.

    score >= KILL_THRESHOLD  → snapshot + kill + quarantine
    score >= ALERT_THRESHOLD → alert only (log warning)

    Returns a result dict: {action, snapshot, killed, quarantine_path}.
    """
    result = {
        "action":         "none",
        "snapshot":       None,
        "killed":         False,
        "quarantine_path": None,
        "pid":            pid,
        "image_path":     image_path,
        "score":          score,
    }

    if _is_protected(pid, image_path):
        log.info(
            "ResponseEngine: pid=%d (%s) is protected — no action.",
            pid, image_path
        )
        result["action"] = "protected"
        return result

    if score >= KILL_THRESHOLD:
        log.warning(
            "HIGH THREAT: pid=%d score=%.2f path=%s — taking snapshot, killing, quarantining.",
            pid, score, image_path
        )
        result["action"] = "kill_and_quarantine"

        # 1. Snapshot before killing (non-blocking best-effort)
        snap = take_snapshot_before_exec(image_path)
        result["snapshot"] = snap

        # 2. Kill the process
        killed = kill_pid(pid)
        result["killed"] = killed

        # 3. Quarantine the binary
        if image_path:
            quar = quarantine(image_path)
            result["quarantine_path"] = quar

    elif score >= ALERT_THRESHOLD:
        log.warning(
            "MEDIUM THREAT: pid=%d score=%.2f path=%s — alert only.",
            pid, score, image_path
        )
        result["action"] = "alert"

    else:
        log.debug(
            "LOW THREAT: pid=%d score=%.2f path=%s — no action.",
            pid, score, image_path
        )

    return result
