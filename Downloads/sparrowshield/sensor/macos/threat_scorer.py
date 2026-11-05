#!/usr/bin/env python3
"""
SparrowShield — Rule-Based Threat Scorer (macOS)
Pre-ML placeholder. Scores 0.0–1.0 based on additive heuristic rules.
All rules are capped at 1.0.
"""

from __future__ import annotations

import logging
import os
import subprocess
from functools import lru_cache
from typing import Optional

log = logging.getLogger(__name__)

try:
    import sys as _sys, os as _os
    _ml = _os.path.join(_os.path.dirname(__file__), "..", "ml")
    if _ml not in _sys.path: _sys.path.insert(0, _ml)
    from onnx_scorer import OnnxThreatScorer as _OnnxScorer
    _onnx_scorer = _OnnxScorer()
except Exception:
    _onnx_scorer = None

# ── Known-malware filename list (common macOS samples) ────────────────────────
_KNOWN_MALWARE_NAMES = frozenset({
    "miner",
    "cryptominer",
    "xmrig",
    "shlayer",
    "bundlore",
    "pirrit",
    "amos",
    "atomic",
    "genieo",
    "genieoextra",
    "installmac",
    "crossrider",
    "mackeeper",
    "dockster",
    "flashback",
    "renepo",
    "ispy",
    "coinminer",
    "snake",
    "calisto",
    "coldroot",
    "proton",
    "fruitfly",
    "keydnap",
    "dok",
})

# Shell interpreters
_SHELLS = frozenset({"sh", "bash", "zsh", "ksh", "fish", "csh", "tcsh", "dash"})

# Scripting runtimes
_SCRIPTING = frozenset({"python", "python3", "python2", "ruby", "perl", "node", "nodejs"})

# Office / productivity apps that shouldn't spawn shells
_OFFICE_APPS = frozenset({
    "microsoft word",
    "microsoft excel",
    "microsoft powerpoint",
    "microsoft onenote",
    "pages",
    "numbers",
    "keynote",
    "libreoffice",
    "adobe acrobat",
    "preview",
})

# Suspicious source directories
_SUSPICIOUS_DIRS = (
    "/tmp/",
    "/var/folders/",
    os.path.expanduser("~/Downloads/"),
    os.path.expanduser("~/Desktop/"),
)

_PRIVATE_TMP_PREFIXES = ("/private/tmp/", "/private/var/")


# ── Code-signing check ────────────────────────────────────────────────────────

@lru_cache(maxsize=512)
def _is_unsigned(image_path: str) -> bool:
    """Return True if the binary lacks a valid code signature."""
    if not image_path or not os.path.isfile(image_path):
        return False
    try:
        result = subprocess.run(
            ["codesign", "-v", "--strict", image_path],
            capture_output=True, timeout=5
        )
        return result.returncode != 0
    except (subprocess.TimeoutExpired, FileNotFoundError, OSError):
        return False


# ── Scorer ────────────────────────────────────────────────────────────────────

def score(
    pid:       int,
    image_path: str,
    cmdline:   str,
    ancestry:  Optional[list[str]] = None,
) -> float:
    """
    Returns a threat score in [0.0, 1.0].
    Rules are additive; result is capped at 1.0.
    """
    if ancestry is None:
        ancestry = []

    total     = 0.0
    basename  = os.path.basename(image_path or "").lower()
    cmd_lower = (cmdline or "").lower()

    # ── Rule 1: Execution from suspicious source directories ─────────────────
    real_path = ""
    try:
        real_path = os.path.realpath(image_path or "")
    except OSError:
        real_path = image_path or ""

    for sus_dir in _SUSPICIOUS_DIRS:
        if real_path.startswith(sus_dir) or (image_path or "").startswith(sus_dir):
            total += 0.30
            log.debug("score +0.30 (suspicious dir): %s", image_path)
            break

    # ── Rule 2: Shell spawned by non-shell parent ─────────────────────────────
    if basename in _SHELLS and len(ancestry) >= 2:
        parent_name = (ancestry[-2] or "").lower()
        if parent_name not in _SHELLS:
            total += 0.30
            log.debug("score +0.30 (shell by non-shell parent): parent=%s", parent_name)

    # ── Rule 3: Scripting runtime running downloaded/tmp script ──────────────
    if basename in _SCRIPTING or any(b in cmd_lower for b in _SCRIPTING):
        if (
            "downloads" in cmd_lower
            or "/tmp" in cmd_lower
            or "/var/folders" in cmd_lower
        ):
            total += 0.40
            log.debug("score +0.40 (scripting runtime + downloaded script)")

    # ── Rule 4: curl / wget piped to sh / bash ────────────────────────────────
    if ("curl" in cmd_lower or "wget" in cmd_lower) and (
        "| sh" in cmd_lower or "| bash" in cmd_lower or "|sh" in cmd_lower
        or "|bash" in cmd_lower
    ):
        total += 0.50
        log.debug("score +0.50 (curl/wget piped to shell)")

    # ── Rule 5: Unsigned binary ───────────────────────────────────────────────
    if image_path and _is_unsigned(image_path):
        total += 0.25
        log.debug("score +0.25 (unsigned binary): %s", image_path)

    # ── Rule 6: Office app → shell ancestry chain ─────────────────────────────
    ancestry_lower = [a.lower() for a in ancestry]
    if basename in _SHELLS:
        for ancestor in ancestry_lower[:-1]:   # exclude self
            if any(office in ancestor for office in _OFFICE_APPS):
                total += 0.60
                log.debug("score +0.60 (Office→shell chain)")
                break

    # ── Rule 7: Binary in /private/tmp or /private/var ───────────────────────
    for prefix in _PRIVATE_TMP_PREFIXES:
        if real_path.startswith(prefix) or (image_path or "").startswith(prefix):
            total += 0.35
            log.debug("score +0.35 (private/tmp or private/var)")
            break

    # ── Rule 8: Known malware name ────────────────────────────────────────────
    # Check basename or any component of the path against the malware list
    name_parts = {basename}
    for part in (image_path or "").split("/"):
        name_parts.add(part.lower())

    for part in name_parts:
        for malware in _KNOWN_MALWARE_NAMES:
            if malware in part:
                total += 0.80
                log.debug("score +0.80 (known malware name match): %s ~ %s", part, malware)
                break

    # ── osascript by non-shell parent (bonus rule for macOS) ─────────────────
    if basename == "osascript" and len(ancestry) >= 2:
        parent_name = (ancestry[-2] or "").lower()
        if parent_name not in _SHELLS and "terminal" not in parent_name:
            total += 0.30
            log.debug("score +0.30 (osascript by non-shell parent)")

    result = min(round(total, 4), 1.0)
    log.debug(
        "threat_scorer: pid=%d path=%s score=%.4f",
        pid, image_path, result
    )
    return result


# Alias for use by score_event fallback
def score_process(event: dict) -> float:
    """Score a minimal process event dict using rule-based logic."""
    return score(
        pid        = int(event.get("pid") or 0),
        image_path = event.get("image_path") or "",
        cmdline    = event.get("cmdline") or "",
        ancestry   = event.get("ancestry") or [],
    )


def score_event(event: dict) -> float:
    """Score any OCSF event dict; uses ONNX model if available, falls back to rules."""
    if _onnx_scorer is not None:
        return _onnx_scorer.score(event)
    # build a minimal synthetic process event for rule-based scoring
    return score_process({
        "process_name": event.get("process_name", ""),
        "cmdline":      event.get("cmdline", ""),
        "image_path":   event.get("image_path", ""),
        "ppid":         event.get("ppid"),
    })
