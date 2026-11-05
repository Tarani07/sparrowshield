#!/usr/bin/env python3
"""
SparrowShield — OCSF Event Feature Extractor
Converts an OCSF event dict into a 22-element float32 numpy array
for ONNX behavioral threat classification.

Dependencies: stdlib + numpy only.
"""

from __future__ import annotations

import ipaddress
import os
import re
import base64

import numpy as np

# ── Feature index constants ────────────────────────────────────────────────────

# Process features (0-10)
FEAT_TEMP_PATH_EXEC       = 0
FEAT_ENCODED_CMDLINE      = 1
FEAT_SCRIPTING_RUNTIME    = 2
FEAT_OFFICE_SHELL_CHAIN   = 3
FEAT_DOUBLE_EXTENSION     = 4
FEAT_KNOWN_MALWARE_NAME   = 5
FEAT_VSS_TOUCH            = 6
FEAT_CREDENTIAL_ACCESS    = 7
FEAT_AUTO_START_PATH      = 8
FEAT_HIGH_PID_LOW_PPID    = 9
FEAT_UNSIGNED_OR_MISSING  = 10
# Network features (11-15)
FEAT_BEACON_PORT          = 11
FEAT_MINER_PORT           = 12
FEAT_LOOPBACK_CONNECT     = 13
FEAT_HIGH_PORT_OUTBOUND   = 14
FEAT_PRIVATE_TO_PUBLIC    = 15
# File features (16-19)
FEAT_RANSOMWARE_EXT       = 16
FEAT_SHADOW_COPY_PATH     = 17
FEAT_SCRIPT_IN_TEMP       = 18
FEAT_HIDDEN_FILE          = 19
# Severity/score (20-21)
FEAT_SEVERITY_HIGH        = 20
FEAT_THREAT_SCORE_RAW     = 21

NUM_FEATURES = 22

FEATURES = [
    "temp_path_exec",
    "encoded_cmdline",
    "scripting_runtime",
    "office_shell_chain",
    "double_extension",
    "known_malware_name",
    "vss_touch",
    "credential_access",
    "auto_start_path",
    "high_pid_low_ppid",
    "unsigned_or_missing",
    "beacon_port",
    "miner_port",
    "loopback_connect",
    "high_port_outbound",
    "private_to_public",
    "ransomware_ext",
    "shadow_copy_path",
    "script_in_temp",
    "hidden_file",
    "severity_high",
    "threat_score_raw",
]

# ── Rule constants ─────────────────────────────────────────────────────────────

_TEMP_PATHS = ("/tmp", "/var/folders", "%temp%", "appdata", "\\temp\\", "\\tmp\\")

_SCRIPTING_RUNTIMES = frozenset({
    "python", "python3", "powershell", "powershell.exe",
    "wscript", "wscript.exe", "cscript", "cscript.exe",
    "mshta", "mshta.exe", "regsvr32", "regsvr32.exe",
})

_OFFICE_PARENTS = frozenset({
    "winword", "winword.exe", "excel", "excel.exe",
    "outlook", "outlook.exe", "powerpnt", "powerpnt.exe",
    "word", "excel", "onenote",
})

_SHELL_CHILDREN = frozenset({
    "cmd", "cmd.exe", "bash", "bash.exe", "sh", "sh.exe",
    "powershell", "powershell.exe", "pwsh", "pwsh.exe",
})

_VSS_KEYWORDS = ("vssadmin", "wbadmin", "diskshadow", "bcdedit")

_CREDENTIAL_KEYWORDS = ("mimikatz", "lsass", "sekurlsa", "hashdump", "wdigest")

_AUTO_START_PATHS = (
    "\\startup\\",
    "\\start menu\\programs\\startup",
    "/launchagents/",
    "/launchdaemons/",
    "hkcu\\software\\microsoft\\windows\\currentversion\\run",
    "hklm\\software\\microsoft\\windows\\currentversion\\run",
)

_BEACON_PORTS = frozenset({443, 80, 8080, 4444, 8443, 9001, 1337, 31337})

_MINER_PORTS = frozenset({3333, 14444, 45700, 7777, 45560})

_RANSOMWARE_EXTENSIONS = frozenset({
    ".locked", ".encrypt", ".crypt", ".zepto", ".wncry",
    ".wncryt", ".cerber", ".cerber2", ".cerber3",
    ".locky", ".aesir", ".shit", ".thor", ".ezz",
    ".exx", ".crypto", ".vault",
})

_SCRIPT_IN_TEMP_EXTS = frozenset({".ps1", ".vbs", ".js", ".bat", ".cmd", ".hta"})

_KNOWN_MALWARE_NAMES = frozenset({
    "miner", "cryptominer", "xmrig", "shlayer", "bundlore",
    "pirrit", "amos", "atomic", "genieo", "installmac",
    "crossrider", "mackeeper", "dockster", "flashback",
    "renepo", "ispy", "coinminer", "snake", "calisto",
    "coldroot", "proton", "fruitfly", "keydnap", "dok",
    "mimikatz", "cobalt", "metasploit", "meterpreter",
    "empire", "powersploit",
})

_DOUBLE_EXT_RE = re.compile(
    r'\.(pdf|doc|docx|xls|xlsx|txt|csv|jpg|jpeg|png|gif|zip|rar)\.(exe|bat|cmd|vbs|ps1|hta|scr|pif)$',
    re.IGNORECASE,
)

_BASE64_RE = re.compile(r'[A-Za-z0-9+/]{50,}={0,2}')

_SHADOW_TOKENS = ("shadow", "shadowstorage", "\\shadows", "shadow volume")


def _is_private_ip(addr: str) -> bool:
    try:
        return ipaddress.ip_address(addr).is_private
    except ValueError:
        return False


def _is_public_ip(addr: str) -> bool:
    try:
        ip = ipaddress.ip_address(addr)
        return not (ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_multicast)
    except ValueError:
        return False


# ── Main extractor ─────────────────────────────────────────────────────────────

def extract(event: dict) -> np.ndarray:
    """
    Extract a 22-element float32 numpy array from an OCSF event dict.

    Accepted top-level keys (all optional, default to empty/0):
      process_name, image_path, cmdline, ppid, pid,
      parent_name, parent_image_path,
      dst_port, src_ip, dst_ip,
      file_path,
      severity_id, threat_score,
      ancestry (list[str])
    """
    feat = np.zeros(NUM_FEATURES, dtype=np.float32)

    # ── Normalise common fields ────────────────────────────────────────────
    image_path   = (event.get("image_path") or "").lower()
    cmdline      = (event.get("cmdline") or "").lower()
    file_path    = (event.get("file_path") or "").lower()
    process_name = (event.get("process_name") or os.path.basename(image_path)).lower()
    parent_name  = (event.get("parent_name") or event.get("parent_image_path") or "").lower()
    ancestry     = event.get("ancestry") or []

    try:
        pid  = int(event.get("pid") or 0)
    except (TypeError, ValueError):
        pid = 0
    try:
        ppid = int(event.get("ppid") or 0)
    except (TypeError, ValueError):
        ppid = 0
    try:
        dst_port = int(event.get("dst_port") or 0)
    except (TypeError, ValueError):
        dst_port = 0
    try:
        src_ip = str(event.get("src_ip") or "")
    except Exception:
        src_ip = ""
    try:
        dst_ip = str(event.get("dst_ip") or "")
    except Exception:
        dst_ip = ""
    try:
        severity_id = int(event.get("severity_id") or 0)
    except (TypeError, ValueError):
        severity_id = 0
    try:
        threat_score = float(event.get("threat_score") or 0.0)
    except (TypeError, ValueError):
        threat_score = 0.0

    # ── Process features ──────────────────────────────────────────────────

    # 0: temp_path_exec
    if any(t in image_path for t in _TEMP_PATHS):
        feat[FEAT_TEMP_PATH_EXEC] = 1.0

    # 1: encoded_cmdline
    if "-enc" in cmdline or "-encodedcommand" in cmdline or bool(_BASE64_RE.search(cmdline)):
        feat[FEAT_ENCODED_CMDLINE] = 1.0

    # 2: scripting_runtime
    pname_bare = process_name.replace(".exe", "")
    if pname_bare in _SCRIPTING_RUNTIMES or process_name in _SCRIPTING_RUNTIMES:
        feat[FEAT_SCRIPTING_RUNTIME] = 1.0

    # 3: office_shell_chain
    parent_bare = os.path.basename(parent_name).replace(".exe", "")
    child_bare  = process_name.replace(".exe", "")
    ancestry_lower = [a.lower() for a in ancestry]
    _office_in_ancestry = any(
        any(o in a for o in _OFFICE_PARENTS)
        for a in [parent_bare, parent_name] + ancestry_lower
    )
    if _office_in_ancestry and child_bare in _SHELL_CHILDREN:
        feat[FEAT_OFFICE_SHELL_CHAIN] = 1.0

    # 4: double_extension
    if _DOUBLE_EXT_RE.search(image_path) or _DOUBLE_EXT_RE.search(file_path):
        feat[FEAT_DOUBLE_EXTENSION] = 1.0

    # 5: known_malware_name
    name_tokens = set()
    name_tokens.add(process_name.replace(".exe", ""))
    for part in image_path.split("/") + image_path.split("\\"):
        name_tokens.add(part.replace(".exe", "").lower())
    for mal in _KNOWN_MALWARE_NAMES:
        if any(mal in tok for tok in name_tokens):
            feat[FEAT_KNOWN_MALWARE_NAME] = 1.0
            break

    # 6: vss_touch
    if any(k in cmdline for k in _VSS_KEYWORDS):
        feat[FEAT_VSS_TOUCH] = 1.0

    # 7: credential_access
    if any(k in cmdline for k in _CREDENTIAL_KEYWORDS):
        feat[FEAT_CREDENTIAL_ACCESS] = 1.0

    # 8: auto_start_path
    check_paths = image_path + " " + file_path
    if any(a in check_paths for a in _AUTO_START_PATHS):
        feat[FEAT_AUTO_START_PATH] = 1.0

    # 9: high_pid_low_ppid
    if pid > 5000 and 0 < ppid < 10:
        feat[FEAT_HIGH_PID_LOW_PPID] = 1.0

    # 10: unsigned_or_missing (proxy: threat_score > 0 from sensor)
    if threat_score > 0:
        feat[FEAT_UNSIGNED_OR_MISSING] = 1.0

    # ── Network features ──────────────────────────────────────────────────

    # 11: beacon_port
    if dst_port in _BEACON_PORTS:
        feat[FEAT_BEACON_PORT] = 1.0

    # 12: miner_port
    if dst_port in _MINER_PORTS:
        feat[FEAT_MINER_PORT] = 1.0

    # 13: loopback_connect
    if dst_ip.startswith("127.") or dst_ip == "::1":
        feat[FEAT_LOOPBACK_CONNECT] = 1.0

    # 14: high_port_outbound
    if dst_port > 49151:
        feat[FEAT_HIGH_PORT_OUTBOUND] = 1.0

    # 15: private_to_public
    if src_ip and dst_ip and _is_private_ip(src_ip) and _is_public_ip(dst_ip):
        feat[FEAT_PRIVATE_TO_PUBLIC] = 1.0

    # ── File features ─────────────────────────────────────────────────────

    # 16: ransomware_ext
    _, fext = os.path.splitext(file_path)
    if fext in _RANSOMWARE_EXTENSIONS:
        feat[FEAT_RANSOMWARE_EXT] = 1.0

    # 17: shadow_copy_path
    if any(s in file_path for s in _SHADOW_TOKENS):
        feat[FEAT_SHADOW_COPY_PATH] = 1.0

    # 18: script_in_temp
    if any(t in file_path for t in _TEMP_PATHS) and fext in _SCRIPT_IN_TEMP_EXTS:
        feat[FEAT_SCRIPT_IN_TEMP] = 1.0

    # 19: hidden_file
    parts = file_path.replace("\\", "/").split("/")
    if any(p.startswith(".") for p in parts if p) or "hidden" in file_path:
        feat[FEAT_HIDDEN_FILE] = 1.0

    # ── Severity / score ──────────────────────────────────────────────────

    # 20: severity_high
    if severity_id >= 4:
        feat[FEAT_SEVERITY_HIGH] = 1.0

    # 21: threat_score_raw
    feat[FEAT_THREAT_SCORE_RAW] = float(np.clip(threat_score, 0.0, 1.0))

    return feat
