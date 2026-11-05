#!/usr/bin/env python3
"""
SparrowShield — APFS Snapshot Manager
Wraps macOS tmutil for local snapshot creation, listing, pruning,
and file recovery. Integrates with the threat response engine.
"""

from __future__ import annotations

import logging
import os
import shutil
import subprocess
import tempfile
import time
from datetime import datetime, timezone
from typing import Optional

log = logging.getLogger(__name__)

# Paths whose executables are considered "known good" — skip snapshotting
_KNOWN_GOOD_PREFIXES = (
    "/System/Library/",
    "/usr/bin/",
    "/usr/sbin/",
    "/usr/libexec/",
    "/Applications/",
    "/Library/Apple/",
)

_SNAPSHOT_MOUNT = "/tmp/sparrowshield_snapshot_mnt"


def _run(cmd: list[str], timeout: int = 30) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)


# ── Core snapshot operations ──────────────────────────────────────────────────

def take_snapshot(label: str = "") -> str:
    """
    Create a local APFS snapshot via `tmutil localsnapshot`.
    Returns the snapshot name (e.g. 'com.apple.TimeMachine.2024-01-15-123456').
    """
    result = _run(["tmutil", "localsnapshot"])
    if result.returncode != 0:
        raise RuntimeError(
            f"tmutil localsnapshot failed: {result.stderr.strip()}"
        )

    # Parse output: "Created local snapshot with date: 2024-01-15-123456"
    output = result.stdout.strip()
    # Attempt to extract the date token from the output
    snap_name = ""
    for part in output.split():
        if part.startswith("20") and "-" in part:
            snap_name = f"com.apple.TimeMachine.{part}"
            break

    if not snap_name:
        # Fallback: list and take the newest
        snaps = list_snapshots()
        snap_name = snaps[-1] if snaps else f"com.apple.TimeMachine.{label or 'unknown'}"

    log.info("Snapshot created: %s", snap_name)
    return snap_name


def list_snapshots() -> list[str]:
    """
    List all local APFS snapshots on the root volume.
    Returns a sorted list of snapshot names (oldest first).
    """
    result = _run(["tmutil", "listlocalsnapshots", "/"])
    if result.returncode != 0:
        log.warning("tmutil listlocalsnapshots failed: %s", result.stderr.strip())
        return []

    snapshots = []
    for line in result.stdout.splitlines():
        line = line.strip()
        if line.startswith("com.apple.TimeMachine.") or line.startswith("local"):
            snapshots.append(line)

    snapshots.sort()
    return snapshots


def delete_snapshot(snapshot_name: str) -> bool:
    """Delete a single local APFS snapshot by name."""
    # tmutil deletelocalsnapshot takes the date portion
    date_part = snapshot_name.replace("com.apple.TimeMachine.", "")
    result = _run(["tmutil", "deletelocalsnapshot", date_part], timeout=60)
    if result.returncode != 0:
        log.warning(
            "Failed to delete snapshot %s: %s",
            snapshot_name, result.stderr.strip()
        )
        return False
    log.info("Deleted snapshot: %s", snapshot_name)
    return True


def delete_oldest_if_over(max_count: int = 10) -> int:
    """
    Prune local snapshots so that at most `max_count` are kept.
    Deletes the oldest ones. Returns the number of snapshots deleted.
    """
    snapshots = list_snapshots()
    excess    = len(snapshots) - max_count
    if excess <= 0:
        return 0

    deleted = 0
    for snap in snapshots[:excess]:   # oldest first (list is sorted)
        if delete_snapshot(snap):
            deleted += 1

    return deleted


def restore_file(snapshot_name: str, file_path: str, dest_path: str) -> bool:
    """
    Mount the given snapshot read-only and copy `file_path` out to `dest_path`.
    Unmounts cleanly afterward.

    `file_path` should be an absolute path as it would appear on the live volume
    (e.g. /Users/alice/Documents/secret.txt).
    `dest_path` is where the recovered file is written.
    """
    mount_point = f"{_SNAPSHOT_MOUNT}_{int(time.time())}"
    date_part   = snapshot_name.replace("com.apple.TimeMachine.", "")

    try:
        os.makedirs(mount_point, exist_ok=True)

        # Mount the snapshot
        mount_result = _run(
            ["mount_apfs", "-s", snapshot_name, "-o", "rdonly",
             "/dev/disk1s1", mount_point],
            timeout=30,
        )
        if mount_result.returncode != 0:
            log.error(
                "mount_apfs failed for %s: %s",
                snapshot_name, mount_result.stderr.strip()
            )
            return False

        # Build path inside the mounted snapshot
        # Strip leading slash so we can join properly
        relative = file_path.lstrip("/")
        source   = os.path.join(mount_point, relative)

        if not os.path.exists(source):
            log.warning("File %s not found in snapshot %s.", file_path, snapshot_name)
            return False

        os.makedirs(os.path.dirname(os.path.abspath(dest_path)), exist_ok=True)
        shutil.copy2(source, dest_path)
        log.info("Restored %s → %s from snapshot %s.", file_path, dest_path, snapshot_name)
        return True

    except Exception as exc:
        log.error("restore_file error: %s", exc)
        return False

    finally:
        # Always unmount
        _run(["umount", mount_point], timeout=15)
        try:
            os.rmdir(mount_point)
        except OSError:
            pass


# ── Pre-exec snapshot guard ───────────────────────────────────────────────────

def take_snapshot_before_exec(image_path: str) -> Optional[str]:
    """
    Create a snapshot before a suspicious binary executes, unless it belongs
    to a known-good path prefix. Returns the snapshot name or None if skipped.
    """
    if not image_path:
        return None

    # Resolve symlinks so we compare real paths
    try:
        real_path = os.path.realpath(image_path)
    except OSError:
        real_path = image_path

    for prefix in _KNOWN_GOOD_PREFIXES:
        if real_path.startswith(prefix):
            log.debug("Skipping snapshot for known-good binary: %s", image_path)
            return None

    try:
        label = os.path.basename(image_path).replace(" ", "_")
        snap  = take_snapshot(label)
        delete_oldest_if_over(max_count=10)
        return snap
    except Exception as exc:
        log.warning("take_snapshot_before_exec failed for %s: %s", image_path, exc)
        return None
