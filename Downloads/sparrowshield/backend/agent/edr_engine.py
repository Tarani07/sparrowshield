#!/usr/bin/env python3
"""
SparrowShield EDR Engine
Features: malware detection, web filter, app filter, suspicious behavior, device groups
"""

import hashlib
import json
import logging
import os
import re
import shutil
import subprocess
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from urllib.parse import quote

import psutil
import requests

logger = logging.getLogger("sparrowshield.edr")

# ── Paths ──────────────────────────────────────────────────────────────────────
DATA_DIR        = "/var/lib/sparrowshield"
QUARANTINE_DIR  = "/var/quarantine/sparrowshield"
HOSTS_MARKER    = "# SparrowShield managed block — DO NOT EDIT"
HOSTS_PATH      = "/etc/hosts"

# ── Threat intel feeds ────────────────────────────────────────────────────────
IOC_FEEDS = {
    "feodo_c2_ips":   "https://feodotracker.abuse.ch/downloads/ipblocklist.txt",
    "malware_hashes": "https://bazaar.abuse.ch/export/txt/sha256/recent/",   # needs free abuse.ch Auth-Key
}

REFRESH_INTERVAL = 3600  # 1 hour
_last_refresh    = 0
_ioc_cache: dict = {}
_web_filter: dict = {}
_app_filter: dict = {}

# ── Behavioral patterns ───────────────────────────────────────────────────────
_SUSPICIOUS_PATHS = ["/tmp/", "/private/tmp/"]

_SUSPICIOUS_PARENT_CHILD = {
    "safari":  {"bash","sh","zsh","python","python3","ruby","perl","nc"},
    "firefox": {"bash","sh","zsh","python","python3"},
    "chrome":  {"bash","sh","zsh","python","python3"},
    "word":    {"bash","sh","zsh","python","python3","curl","wget"},
    "excel":   {"bash","sh","zsh","python","python3","curl","wget"},
    "numbers": {"bash","sh","python","python3"},
    "pages":   {"bash","sh","python","python3"},
}


# ══════════════════════════════════════════════════════════════════════════════
# HELPERS
# ══════════════════════════════════════════════════════════════════════════════

def _ensure_dirs():
    os.makedirs(DATA_DIR, exist_ok=True)
    os.makedirs(QUARANTINE_DIR, exist_ok=True)


def _api_headers(anon_key: str) -> dict:
    return {
        "apikey":        anon_key,
        "Authorization": f"Bearer {anon_key}",
        "Content-Type":  "application/json",
        "Prefer":        "return=minimal",
    }


def _post(rest_url: str, anon_key: str, table: str, body: dict):
    try:
        r = requests.post(f"{rest_url}/{table}", json=body,
                          headers=_api_headers(anon_key), timeout=10)
        if r.status_code >= 300:
            logger.warning("[EDR] insert into %s rejected (HTTP %s): %s", table, r.status_code, r.text[:200])
    except Exception as e:
        logger.warning("[EDR] insert into %s failed: %s", table, e)


def _patch(rest_url: str, anon_key: str, table: str, filters: str, body: dict):
    try:
        requests.patch(f"{rest_url}/{table}?{filters}", json=body,
                       headers=_api_headers(anon_key), timeout=10)
    except Exception as e:
        logger.debug("_patch %s error: %s", table, e)


def _get(rest_url: str, anon_key: str, path: str) -> list:
    try:
        r = requests.get(f"{rest_url}/{path}",
                         headers=_api_headers(anon_key), timeout=10)
        if r.status_code == 200:
            return r.json() or []
    except Exception as e:
        logger.debug("_get %s error: %s", path, e)
    return []


# ══════════════════════════════════════════════════════════════════════════════
# FEATURE 1: VIRUS / MALWARE DETECTION  (ClamAV signatures + optional hash feeds)
# ══════════════════════════════════════════════════════════════════════════════

CLAMAV_BIN_DIRS   = ["/opt/homebrew/bin", "/usr/local/bin", "/opt/local/bin"]
CLAMAV_DB_DIR     = f"{DATA_DIR}/clamav"
FRESHCLAM_CONF    = f"{DATA_DIR}/freshclam.conf"
CLAMAV_UPDATE_SEC = 12 * 3600
SCAN_MAX_FILES    = 5000
SCAN_MAX_BYTES    = 100 * 1024 * 1024
SCAN_RECENT_DAYS  = 30
_SKIP_EXE_PREFIXES = ("/System/", "/usr/", "/bin/", "/sbin/", "/Library/Apple/")


def _hash_file(path: str) -> Optional[str]:
    try:
        h = hashlib.sha256()
        with open(path, "rb") as f:
            for chunk in iter(lambda: f.read(65536), b""):
                h.update(chunk)
        return h.hexdigest()
    except (OSError, PermissionError):
        return None


def _clam_bin(name: str) -> Optional[str]:
    for d in CLAMAV_BIN_DIRS:
        p = os.path.join(d, name)
        if os.access(p, os.X_OK):
            return p
    return shutil.which(name)


def _clam_db_age() -> Optional[float]:
    newest = 0.0
    for f in ("daily.cvd", "daily.cld", "main.cvd", "main.cld"):
        p = os.path.join(CLAMAV_DB_DIR, f)
        if os.path.isfile(p):
            newest = max(newest, os.path.getmtime(p))
    return (time.time() - newest) if newest else None


def update_clamav_signatures(force: bool = False) -> dict:
    freshclam = _clam_bin("freshclam")
    if not freshclam:
        return {"available": False}
    age = _clam_db_age()
    if not force and age is not None and age < CLAMAV_UPDATE_SEC:
        return {"available": True, "updated": False, "age_h": round(age / 3600, 1)}

    os.makedirs(CLAMAV_DB_DIR, exist_ok=True)
    with open(FRESHCLAM_CONF, "w") as f:
        f.write(f"DatabaseDirectory {CLAMAV_DB_DIR}\n"
                "DatabaseOwner root\n"
                "DatabaseMirror database.clamav.net\n"
                "Checks 2\n")
    logger.info("[AV] Updating ClamAV signatures…")
    r = subprocess.run([freshclam, f"--config-file={FRESHCLAM_CONF}", "--stdout"],
                       capture_output=True, text=True, timeout=900)
    ok = r.returncode in (0, 1) and _clam_db_age() is not None
    if not ok:
        logger.warning("[AV] freshclam failed (%s): %s", r.returncode, (r.stdout + r.stderr)[-300:])
    return {"available": True, "updated": ok}


def _malware_scan_targets() -> list:
    """Running non-system executables + recent files in Downloads/Desktop/tmp."""
    targets, seen = [], set()

    def add(p):
        if p in seen or len(targets) >= SCAN_MAX_FILES:
            return
        try:
            st = os.stat(p)
            if os.path.isfile(p) and 0 < st.st_size <= SCAN_MAX_BYTES:
                seen.add(p)
                targets.append(p)
        except OSError:
            pass

    for proc in psutil.process_iter(["exe"]):
        try:
            exe = proc.info.get("exe")
            if exe and not exe.startswith(_SKIP_EXE_PREFIXES):
                add(exe)
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue

    cutoff = time.time() - SCAN_RECENT_DAYS * 86400
    user_roots = []
    for home in Path("/Users").glob("*"):
        if home.name in ("Shared", "Guest") or home.name.startswith("."):
            continue
        user_roots += [str(home / "Downloads"), str(home / "Desktop")]

    denied = []
    for group in (user_roots, ["/private/tmp", "/private/var/tmp"]):
        recent = []
        for root in group:
            if not os.path.isdir(root):
                continue
            try:
                os.listdir(root)
            except PermissionError:
                denied.append(root)
                continue
            for dirpath, dirnames, filenames in os.walk(root):
                dirnames[:] = [d for d in dirnames if not d.startswith(".")]
                for fn in filenames:
                    p = os.path.join(dirpath, fn)
                    try:
                        m = os.path.getmtime(p)
                    except OSError:
                        continue
                    if m >= cutoff:
                        recent.append((m, p))
        for _, p in sorted(recent, reverse=True):
            add(p)
    if denied:
        logger.warning("[AV] No access to %s — grant Full Disk Access to the agent's Python in "
                       "System Settings > Privacy & Security", ", ".join(denied))
    return targets


def _clamscan(paths: list) -> list:
    """Return [(path, signature)] for infected files."""
    clamscan = _clam_bin("clamscan")
    if not clamscan or _clam_db_age() is None or not paths:
        return []
    list_file = f"{DATA_DIR}/scan_list.txt"
    with open(list_file, "w") as f:
        f.write("\n".join(paths))
    r = subprocess.run([clamscan, f"--database={CLAMAV_DB_DIR}", f"--file-list={list_file}",
                        "--infected", "--no-summary", "--stdout"],
                       capture_output=True, text=True, timeout=1800)
    hits = []
    for line in r.stdout.splitlines():
        if line.endswith(" FOUND") and ": " in line:
            path, sig = line[:-6].rsplit(": ", 1)
            hits.append((path, sig))
    if r.returncode == 2:
        logger.warning("[AV] clamscan error: %s", r.stderr[-300:])
    return hits


def refresh_ioc_feeds(force: bool = False, abuse_ch_key: str = "") -> dict:
    """C2 IPs (Feodo, keyless) and, with a free abuse.ch Auth-Key, MalwareBazaar hashes."""
    global _last_refresh, _ioc_cache
    now = time.time()
    if not force and (now - _last_refresh) < REFRESH_INTERVAL and _ioc_cache:
        return _ioc_cache

    cache = {"malware_hashes": set(), "c2_ips": set()}
    try:
        r = requests.get(IOC_FEEDS["feodo_c2_ips"], timeout=15)
        if r.status_code == 200:
            cache["c2_ips"] = {l.strip() for l in r.text.splitlines() if l.strip() and not l.startswith("#")}
    except Exception as e:
        logger.debug("[TI] Feodo error: %s", e)

    if abuse_ch_key:
        try:
            r = requests.get(IOC_FEEDS["malware_hashes"], headers={"Auth-Key": abuse_ch_key}, timeout=30)
            if r.status_code == 200:
                cache["malware_hashes"] = {l.strip().lower() for l in r.text.splitlines()
                                           if len(l.strip()) == 64 and not l.startswith("#")}
            else:
                logger.warning("[TI] MalwareBazaar returned HTTP %s — check abuse_ch_auth_key", r.status_code)
        except Exception as e:
            logger.debug("[TI] MalwareBazaar error: %s", e)

    logger.info("[TI] %d C2 IPs, %d malware hashes", len(cache["c2_ips"]), len(cache["malware_hashes"]))
    _ioc_cache, _last_refresh = cache, now
    return cache


def scan_for_malware(rest_url: str, anon_key: str, device_id: str, hostname: str,
                     virustotal_api_key: str = "", auto_quarantine: bool = False) -> dict:
    started = time.time()
    sig_status = update_clamav_signatures()
    targets = _malware_scan_targets()
    exe_pids = {}
    for proc in psutil.process_iter(["pid", "exe"]):
        try:
            if proc.info.get("exe"):
                exe_pids.setdefault(proc.info["exe"], proc.info["pid"])
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue

    detections = [{"path": p, "signature": sig, "engine": "ClamAV"} for p, sig in _clamscan(targets)]

    hashes = _ioc_cache.get("malware_hashes", set())
    if hashes or virustotal_api_key:
        flagged = {d["path"] for d in detections}
        for p in targets:
            if p in flagged:
                continue
            h = _hash_file(p)
            if not h:
                continue
            if h in hashes:
                detections.append({"path": p, "signature": f"sha256:{h[:16]}", "engine": "MalwareBazaar"})
            elif virustotal_api_key and p in exe_pids:
                vt = _check_virustotal(h, virustotal_api_key)
                if vt.get("malicious", 0) >= 3:
                    detections.append({"path": p, "signature": f"{vt['malicious']}/{vt['total_engines']} engines",
                                       "engine": "VirusTotal"})

    for d in detections:
        try:
            analytics_on_malware(rest_url, anon_key, device_id, hostname, d)
        except Exception as e:
            logger.debug("analytics malware mapping failed: %s", e)
        name = os.path.basename(d["path"])
        pid = exe_pids.get(d["path"])
        d["pid"] = pid
        msg = f"Malware '{d['signature']}' found in {d['path']} on {hostname} ({d['engine']})"
        logger.warning("[AV] %s", msg)
        _post_security_event(rest_url, anon_key, device_id, hostname,
            event_type="malware_detected", severity="critical", description=msg,
            details=d, mitre="T1204")
        _raise_alert(rest_url, anon_key, device_id, hostname,
            rule_id=f"malware:{name[:60]}", severity="critical", message=msg, mitre="T1204")
        if auto_quarantine:
            if pid:
                _kill_and_quarantine(pid, d["path"], reason=d["signature"])
            else:
                _quarantine_file(d["path"], reason=d["signature"])
            d["quarantined"] = not os.path.exists(d["path"])

    engines = [e for e, on in (("ClamAV", _clam_db_age() is not None),
                               ("MalwareBazaar", bool(hashes)),
                               ("VirusTotal", bool(virustotal_api_key))) if on]
    _post(rest_url, anon_key, "av_scan_results", {
        "device_id":         device_id,
        "hostname":          hostname,
        "scan_type":         "quick",
        "status":            "threats_found" if detections else "clean",
        "threats_found":     len(detections),
        "files_scanned":     len(targets),
        "scan_duration_sec": int(time.time() - started),
        "threats":           detections,
    })
    if not engines:
        logger.warning("[AV] No malware signatures available — install ClamAV (brew install clamav)")
    return {"files_scanned": len(targets), "threats": len(detections), "engines": engines,
            "signatures": sig_status, "seconds": int(time.time() - started)}


def _check_virustotal(file_hash: str, api_key: str) -> dict:
    try:
        r = requests.get(
            f"https://www.virustotal.com/api/v3/files/{file_hash}",
            headers={"x-apikey": api_key}, timeout=15,
        )
        if r.status_code == 200:
            stats = r.json().get("data", {}).get("attributes", {}).get("last_analysis_stats", {})
            return {"malicious": stats.get("malicious", 0),
                    "total_engines": sum(stats.values())}
    except Exception as e:
        logger.debug("[VT] error: %s", e)
    return {}


# ══════════════════════════════════════════════════════════════════════════════
# FEATURE 2: SUSPICIOUS BEHAVIOR DETECTION
# (miners, tunnels, backdoor ports are covered by agent_mac.run_detection_engine)
# ══════════════════════════════════════════════════════════════════════════════

def run_behavioral_detection(rest_url: str, anon_key: str, device_id: str, hostname: str):
    proc_map = {}
    for proc in psutil.process_iter(["pid", "name", "exe", "ppid"]):
        try:
            proc_map[proc.info["pid"]] = proc.info
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            pass

    for pid, info in proc_map.items():
        name   = (info.get("name") or "").lower()
        path   = info.get("exe") or ""
        ppid   = info.get("ppid") or 0
        parent = proc_map.get(ppid, {}).get("name") or ""

        for parent_app, bad_children in _SUSPICIOUS_PARENT_CHILD.items():
            if parent_app in parent.lower() and name in bad_children:
                msg = f"Shell '{info['name']}' spawned by '{parent}' on {hostname} — possible macro/exploit execution"
                _post_security_event(rest_url, anon_key, device_id, hostname,
                    event_type="shell_from_app", severity="critical", description=msg,
                    details={"pid": pid, "parent": parent, "child": info["name"]},
                    mitre="T1059.004")
                _raise_alert(rest_url, anon_key, device_id, hostname,
                    rule_id="shell_from_app", severity="critical", message=msg, mitre="T1059.004")

        if any(path.startswith(d) for d in _SUSPICIOUS_PATHS):
            msg = f"Process '{info['name']}' running from temp directory: {path}"
            _post_security_event(rest_url, anon_key, device_id, hostname,
                event_type="proc_suspicious_path", severity="high", description=msg,
                details={"pid": pid, "path": path}, mitre="T1059")
            _raise_alert(rest_url, anon_key, device_id, hostname,
                rule_id="proc_suspicious_path", severity="high", message=msg, mitre="T1059")

    c2_ips = _ioc_cache.get("c2_ips", set())
    if not c2_ips:
        return
    try:
        conns = psutil.net_connections(kind="inet")
    except (psutil.AccessDenied, PermissionError):
        return
    for conn in conns:
        if conn.status != "ESTABLISHED" or not conn.raddr or conn.raddr.ip not in c2_ips:
            continue
        pname = proc_map.get(conn.pid, {}).get("name") or "unknown"
        msg = f"Connection to known C2 server {conn.raddr.ip}:{conn.raddr.port} by '{pname}' on {hostname}"
        _post_security_event(rest_url, anon_key, device_id, hostname,
            event_type="c2_connection", severity="critical", description=msg,
            details={"ip": conn.raddr.ip, "port": conn.raddr.port, "pid": conn.pid, "process": pname},
            mitre="T1071")
        _raise_alert(rest_url, anon_key, device_id, hostname,
            rule_id="c2_connection", severity="critical", message=msg, mitre="T1071")


# ══════════════════════════════════════════════════════════════════════════════
# FEATURE 3: APPLICATION FILTER
# ══════════════════════════════════════════════════════════════════════════════

def _group_scope(group_id: Optional[str]) -> str:
    if group_id:
        return f"or=(group_id.is.null,group_id.eq.{group_id})"
    return "group_id=is.null"


def sync_app_filter(rest_url: str, anon_key: str, group_id: Optional[str]):
    """Global rules + this device's team rules. Team allow overrides global block."""
    global _app_filter
    rows = _get(rest_url, anon_key,
                f"software_lists?select=app_name,list_type,platform,group_id&{_group_scope(group_id)}&limit=2000")
    rows = [r for r in rows if (r.get("platform") or "all") in ("all", "mac", "macos")]
    block = {r["app_name"].lower() for r in rows if r.get("list_type") == "blocklist" and r.get("app_name")}
    allow = {r["app_name"].lower() for r in rows if r.get("list_type") == "allowlist" and r.get("app_name")}
    team_allow = {r["app_name"].lower() for r in rows
                  if r.get("list_type") == "allowlist" and r.get("group_id") and r.get("app_name")}
    _app_filter = {"blocklist": block - team_allow, "allowlist": allow}
    logger.info("[APP FILTER] %d blocked, %d allowed", len(_app_filter["blocklist"]), len(allow))


def _matches(name: str, patterns: set) -> Optional[str]:
    name = name.lower()
    for p in patterns:
        if p and p in name:
            return p
    return None


def enforce_app_filter(rest_url: str, anon_key: str, device_id: str, hostname: str,
                       installed_apps: list, auto_kill: bool = False):
    blocklist = _app_filter.get("blocklist", set())
    if not blocklist:
        return

    for app in installed_apps or []:
        app_name = app.get("name") or ""
        hit = _matches(app_name, blocklist)
        if not hit:
            continue
        open_rows = _get(rest_url, anon_key,
                         f"software_violations?device_id=eq.{device_id}&app_name=eq.{quote(app_name)}"
                         f"&resolved=eq.false&select=id&limit=1")
        if not open_rows:
            _post(rest_url, anon_key, "software_violations", {
                "device_id":      device_id,
                "app_name":       app_name,
                "app_version":    app.get("version"),
                "violation_type": "blocklist_hit",
            })
        _raise_alert(rest_url, anon_key, device_id, hostname,
            rule_id=f"blocked_app:{hit[:40]}", severity="high",
            message=f"Blocked application '{app_name}' is installed on {hostname} — "
                    f"remove it from App Filter → Violations",
            mitre="T1204")
    # Running blocked apps are closed by the real-time loop (enforce_running_apps).


# ══════════════════════════════════════════════════════════════════════════════
# REAL-TIME ENFORCEMENT (every 15s): App Filter blocklist + Policy Manager rules
# ══════════════════════════════════════════════════════════════════════════════

APP_ENFORCE_INTERVAL = 15
RULES_REFRESH_SEC    = 60
APP_QUARANTINE_DIR   = os.path.join(QUARANTINE_DIR, "apps")
_APP_ROOTS           = ("/Applications/",)
_MIN_PATTERN         = 3          # never act on 1–2 character patterns ("a" would match everything)
_policy_rules: list  = []
_alerted_pids: set   = set()      # (rule_id, pid) already alerted, so a long-lived process alerts once


def _app_bundle_of(exe: str) -> Optional[str]:
    """'/Applications/Slack.app/Contents/MacOS/Slack' → '/Applications/Slack.app' (user apps only)."""
    m = re.match(r"^(/Applications/.+?\.app|/Users/[^/]+/Applications/.+?\.app)/", exe or "")
    return m.group(1) if m else None


def sync_policy_rules(rest_url: str, anon_key: str, device_id: str):
    """Policy Manager (block_rules) rules for macOS that target this device or all devices."""
    global _policy_rules
    rows = _get(rest_url, anon_key,
                f"block_rules?enabled=eq.true&or=(device_id.is.null,device_id.eq.{device_id})"
                f"&select=id,name,pattern,rule_type,action,platform,severity,mitre_id&limit=500")
    _policy_rules = [
        r for r in rows
        if (r.get("platform") or "all") in ("all", "mac", "macos")
        and r.get("rule_type") in ("process_name", "path")
        and len((r.get("pattern") or "").strip()) >= _MIN_PATTERN
    ]


def _policy_hit(name: str, exe: str) -> Optional[dict]:
    for r in _policy_rules:
        pat = r["pattern"].strip().lower()
        if r["rule_type"] == "process_name" and name.lower() == pat:
            return r
        if r["rule_type"] == "path" and pat in exe.lower():
            return r
    return None


def _spawned_by_agent(pid: int, ppid_of, me: int) -> bool:
    """True if `me` (the agent) is an ancestor of `pid` — e.g. agent → sudo → osascript for IT notices."""
    seen = 0
    while pid and pid > 1 and seen < 8:
        pid = ppid_of(pid)
        if pid == me:
            return True
        seen += 1
    return False


def _ppid_live(pid: int) -> int:
    try:
        return psutil.Process(pid).ppid()
    except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
        return 0


def enforce_running_apps(rest_url: str, anon_key: str, device_id: str, hostname: str):
    """Close blocked apps and Policy-Manager-blocked processes; alert on 'alert' rules."""
    blocklist = {p for p in _app_filter.get("blocklist", set()) if len(p) >= _MIN_PATTERN}
    me = os.getpid()
    live = set()
    for proc in psutil.process_iter(["pid", "name", "exe"]):
        try:
            pid, name, exe = proc.info["pid"], proc.info.get("name") or "", proc.info.get("exe") or ""
            if pid in (0, 1, me):
                continue
            live.add(pid)

            # App Filter: match the .app bundle name, so helpers and renderers go too.
            bundle = _app_bundle_of(exe)
            if bundle and blocklist:
                app_name = os.path.basename(bundle)[:-4]
                hit = _matches(app_name, blocklist)
                if hit:
                    proc.kill()
                    logger.warning("[APP FILTER] Closed blocked app %s (PID %d)", app_name, pid)
                    if exe.startswith(bundle + "/Contents/MacOS/"):   # report main process only
                        _post_security_event(rest_url, anon_key, device_id, hostname,
                            event_type="blocked_app_killed", severity="warning",
                            description=f"Blocked app '{app_name}' was closed on {hostname}",
                            details={"pid": pid, "app": app_name, "path": bundle, "rule": hit},
                            mitre="T1204")
                        _raise_alert(rest_url, anon_key, device_id, hostname,
                            rule_id=f"blocked_app:{hit[:40]}", severity="high",
                            message=f"Blocked application '{app_name}' was opened and closed on {hostname} — "
                                    f"remove it from App Filter → Violations",
                            mitre="T1204")
                    continue

            # Policy Manager rules.
            rule = _policy_hit(name, exe)
            if not rule or _spawned_by_agent(pid, _ppid_live, me):
                continue
            key = (rule["id"], pid)
            if rule.get("action") == "block":
                proc.kill()
                logger.warning("[POLICY] Blocked %s (PID %d) by rule '%s'", name, pid, rule.get("name"))
            elif key in _alerted_pids:
                continue
            _alerted_pids.add(key)
            verb = "blocked" if rule.get("action") == "block" else "detected"
            _post_security_event(rest_url, anon_key, device_id, hostname,
                event_type=f"policy_{verb}", severity="high" if rule.get("severity") in ("high", "critical") else "warning",
                description=f"Policy '{rule.get('name')}' {verb} '{name}' on {hostname}",
                details={"pid": pid, "process": name, "path": exe, "rule_id": rule["id"]},
                mitre=rule.get("mitre_id"))
            _raise_alert(rest_url, anon_key, device_id, hostname,
                rule_id=f"policy:{rule['id']}", severity=rule.get("severity") or "high",
                message=f"Policy '{rule.get('name')}' {verb} '{name}' on {hostname}",
                mitre=rule.get("mitre_id"))
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            continue
    _alerted_pids.intersection_update({k for k in _alerted_pids if k[1] in live})


def app_enforcement_loop(rest_url: str, anon_key: str, device_id: str, hostname: str):
    last_sync = 0.0
    while True:
        try:
            if time.time() - last_sync > RULES_REFRESH_SEC:
                sync_app_filter(rest_url, anon_key, get_device_group(rest_url, anon_key, device_id))
                sync_policy_rules(rest_url, anon_key, device_id)
                last_sync = time.time()
            enforce_running_apps(rest_url, anon_key, device_id, hostname)
        except Exception as e:
            logger.warning("[APP FILTER] enforcement error: %s", e)
        time.sleep(APP_ENFORCE_INTERVAL)


def _find_app_bundles(app_name: str) -> list:
    """Installed .app bundles for an app name: exact name match first, else name contains it."""
    want = app_name.strip().lower().removesuffix(".app")
    if len(want) < _MIN_PATTERN:
        return []
    roots = ["/Applications"] + [str(p) for p in Path("/Users").glob("*/Applications")]
    found = []
    for root in roots:
        try:
            for entry in os.scandir(root):
                if entry.name.endswith(".app") and entry.is_dir(follow_symlinks=False):
                    found.append(entry.path)
        except OSError:
            continue
    exact = [p for p in found if os.path.basename(p)[:-4].lower() == want]
    return exact or [p for p in found if want in os.path.basename(p)[:-4].lower()]


def remove_app(app_name: str) -> dict:
    """Admin-approved removal: close the app and move its bundle to quarantine (restorable)."""
    bundles = _find_app_bundles(app_name)
    if not bundles:
        return {"removed": [], "message": f"'{app_name}' is not installed"}
    os.makedirs(APP_QUARANTINE_DIR, exist_ok=True)
    os.chmod(APP_QUARANTINE_DIR, 0o700)
    removed = []
    for bundle in bundles:
        for proc in psutil.process_iter(["pid", "exe"]):
            try:
                if (proc.info.get("exe") or "").startswith(bundle + "/"):
                    proc.kill()
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
        ts   = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        dest = os.path.join(APP_QUARANTINE_DIR, f"{ts}_{os.path.basename(bundle)}")
        shutil.move(bundle, dest)
        with open(dest + ".origin", "w") as f:
            f.write(bundle)
        logger.warning("[APP FILTER] Removed %s → %s", bundle, dest)
        removed.append({"from": bundle, "quarantine": dest})
    return {"removed": removed, "message": f"Removed {len(removed)} app bundle(s)"}


def restore_app(app_name: str) -> dict:
    """Undo remove_app: move the most recent quarantined bundle(s) of this app back."""
    want = app_name.strip().lower().removesuffix(".app")
    restored = []
    if not os.path.isdir(APP_QUARANTINE_DIR):
        return {"restored": [], "message": "nothing in quarantine"}
    latest: dict = {}
    for entry in sorted(os.scandir(APP_QUARANTINE_DIR), key=lambda e: e.name):
        if not entry.name.endswith(".app"):
            continue
        origin_file = entry.path + ".origin"
        if not os.path.exists(origin_file):
            continue
        origin = open(origin_file).read().strip()
        if want in os.path.basename(origin)[:-4].lower():
            latest[origin] = entry.path          # later timestamps win
    for origin, qpath in latest.items():
        if os.path.exists(origin):
            continue
        shutil.move(qpath, origin)
        os.remove(qpath + ".origin")
        restored.append(origin)
        logger.warning("[APP FILTER] Restored %s", origin)
    return {"restored": restored,
            "message": f"Restored {len(restored)} app bundle(s)" if restored else f"no quarantined copy of '{app_name}'"}


# ══════════════════════════════════════════════════════════════════════════════
# FEATURE 4: WEBSITE FILTER (categories + custom whitelist/blacklist → /etc/hosts)
# ══════════════════════════════════════════════════════════════════════════════

MAX_HOSTS_DOMAINS  = 250_000
CONTENT_CATEGORIES = {"adult", "gambling", "gaming", "social"}
_DOMAIN_RE = re.compile(r"^[a-z0-9][a-z0-9._-]*\.[a-z]{2,}$")


def _clean_domain(raw: str) -> str:
    d = raw.strip().lower()
    d = re.sub(r"^https?://", "", d).split("/")[0].split(":")[0].strip(".")
    if d.startswith("*."):
        d = d[2:]
    return d if _DOMAIN_RE.match(d) else ""


FEED_CACHE_DIR = os.path.join(DATA_DIR, "feeds")
FEED_MAX_AGE   = 6 * 3600     # category lists change slowly; re-download at most every 6h


def _parse_feed(text: str) -> list:
    out = []
    for line in text.splitlines():
        line = line.strip()
        if not line or line[0] in "#!":
            continue
        parts = line.split()
        d = _clean_domain(parts[1] if len(parts) >= 2 else parts[0])
        if d and d not in ("localhost", "0.0.0.0"):
            out.append(d)
    return out


def _fetch_category(url: str) -> list:
    cache = os.path.join(FEED_CACHE_DIR, hashlib.sha1(url.encode()).hexdigest() + ".txt")
    try:
        if time.time() - os.path.getmtime(cache) < FEED_MAX_AGE:
            with open(cache, encoding="utf-8", errors="ignore") as f:
                return _parse_feed(f.read())
    except OSError:
        pass
    try:
        r = requests.get(url, timeout=60)
        if r.status_code != 200:
            raise RuntimeError(f"HTTP {r.status_code}")
        os.makedirs(FEED_CACHE_DIR, exist_ok=True)
        tmp = cache + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            f.write(r.text)
        os.replace(tmp, cache)
        return _parse_feed(r.text)
    except Exception as e:
        logger.warning("[WEB FILTER] feed %s error: %s — using cached copy if any", url, e)
        try:
            with open(cache, encoding="utf-8", errors="ignore") as f:
                return _parse_feed(f.read())
        except OSError:
            return []


def _fair_share(lists: dict, budget: int) -> dict:
    """Split budget across categories; small lists fit fully, leftovers flow to big ones."""
    alloc, remaining, pending = {}, budget, sorted(lists, key=lambda k: len(lists[k]))
    while pending:
        share = remaining // len(pending)
        name = pending.pop(0)
        take = min(len(lists[name]), share)
        alloc[name] = lists[name][:take]
        remaining -= take
    return alloc


_web_lock = threading.Lock()


def sync_web_filter(rest_url: str, anon_key: str, group_id: Optional[str]):
    with _web_lock:          # scan and on-demand sync can overlap; serialize hosts writes
        return _sync_web_filter(rest_url, anon_key, group_id)


def _sync_web_filter(rest_url: str, anon_key: str, group_id: Optional[str]):
    global _web_filter

    rules = _get(rest_url, anon_key,
                 f"web_filter_rules?enabled=eq.true&select=domain,action&{_group_scope(group_id)}&limit=10000")
    custom_block = [d for d in (_clean_domain(r.get("domain") or "") for r in rules if r.get("action") == "block") if d]
    # Allowing "www.site.com" means the site: also allow "site.com" (category lists use bare domains).
    allowed      = {d[4:] if d.startswith("www.") else d
                    for d in (_clean_domain(r.get("domain") or "") for r in rules if r.get("action") == "allow") if d}

    def is_allowed(d):
        return d in allowed or any(d.endswith("." + a) for a in allowed)

    cats = _get(rest_url, anon_key, "web_categories?enabled=eq.true&select=name,blocklist_url")
    raw = {c["name"]: _fetch_category(c["blocklist_url"]) for c in cats if c.get("blocklist_url")}
    feed_sizes = {k: len(v) for k, v in raw.items()}

    seen = set(d for d in custom_block if not is_allowed(d))
    lists = {}
    for name, domains in raw.items():
        uniq = []
        for d in domains:
            if d not in seen and not is_allowed(d):
                seen.add(d)
                uniq.append(d)
        lists[name] = uniq

    custom = [d for d in dict.fromkeys(custom_block) if not is_allowed(d)]
    alloc = _fair_share(lists, max(0, MAX_HOSTS_DOMAINS - len(custom)))

    entries = list(custom) + [d for name in alloc for d in alloc[name]]
    with_www = set(custom) | {d for name in alloc if name in CONTENT_CATEGORIES for d in alloc[name]}

    # Rewriting a 700k-line hosts file and flushing DNS is the slow part; skip it when unchanged.
    digest = hashlib.sha1(("\n".join(entries) + "|" + ",".join(sorted(with_www))).encode()).hexdigest()
    digest_file = os.path.join(DATA_DIR, "hosts.sha1")
    try:
        unchanged = open(digest_file).read().strip() == digest and HOSTS_MARKER in open(HOSTS_PATH).read()
    except OSError:
        unchanged = False
    if not unchanged and _apply_hosts_block(entries, with_www):
        try:
            os.makedirs(DATA_DIR, exist_ok=True)
            with open(digest_file, "w") as f:
                f.write(digest)
        except OSError:
            pass
    applied = {k: len(v) for k, v in alloc.items()}
    _web_filter = {"blocked": len(entries), "allowed": allowed}
    logger.info("[WEB FILTER] %d domains blocked; per category %s (feed sizes %s); whitelist %d",
                len(entries), applied, feed_sizes, len(allowed))
    return {"blocked": len(entries), "custom": len(custom), "categories": applied,
            "feed_sizes": feed_sizes, "allowed": len(allowed)}


def _apply_hosts_block(domains: list, with_www: set) -> bool:
    """Block over IPv4 and IPv6 so AAAA lookups can't bypass the filter."""
    try:
        with open(HOSTS_PATH, "r") as f:
            original = f.read()
        base = original.split(HOSTS_MARKER)[0].rstrip() if HOSTS_MARKER in original else original.rstrip()

        lines = [HOSTS_MARKER]
        for d in domains:
            names = [d]
            if d in with_www and not d.startswith("www."):
                names.append("www." + d)
            for n in names:
                lines.append(f"0.0.0.0 {n}")
                lines.append(f":: {n}")

        tmp = HOSTS_PATH + ".sparrowshield.tmp"
        with open(tmp, "w") as f:
            f.write(base + "\n\n" + "\n".join(lines) + "\n")
        os.chmod(tmp, 0o644)
        os.replace(tmp, HOSTS_PATH)

        subprocess.run(["dscacheutil", "-flushcache"], capture_output=True, timeout=5)
        subprocess.run(["killall", "-HUP", "mDNSResponder"], capture_output=True, timeout=5)
        return True
    except PermissionError:
        logger.warning("[WEB FILTER] Cannot write /etc/hosts — agent must run as root")
    except Exception as e:
        logger.warning("[WEB FILTER] /etc/hosts update error: %s", e)
    return False


# ══════════════════════════════════════════════════════════════════════════════
# FEATURE 5: DEVICE GROUPS (team-scoped policies)
# ══════════════════════════════════════════════════════════════════════════════

def get_device_group(rest_url: str, anon_key: str, device_id: str) -> Optional[str]:
    rows = _get(rest_url, anon_key, f"device_group_members?device_id=eq.{device_id}&select=group_id&limit=1")
    return rows[0].get("group_id") if rows else None


# ══════════════════════════════════════════════════════════════════════════════
# QUARANTINE
# ══════════════════════════════════════════════════════════════════════════════

def _quarantine_file(file_path: str, reason: str = "malware"):
    _ensure_dirs()
    try:
        if os.path.isfile(file_path):
            ts   = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
            dest = os.path.join(QUARANTINE_DIR, f"{ts}_{os.path.basename(file_path)}")
            shutil.move(file_path, dest)
            os.chmod(dest, 0o000)
            logger.warning("[QUARANTINE] %s → %s (%s)", file_path, dest, reason)
    except Exception as e:
        logger.warning("[QUARANTINE] move error: %s", e)


def _kill_and_quarantine(pid: int, file_path: str, reason: str = "malware"):
    try:
        psutil.Process(pid).kill()
        logger.warning("[QUARANTINE] Killed PID %d", pid)
    except (psutil.NoSuchProcess, psutil.AccessDenied):
        pass
    _quarantine_file(file_path, reason)


# ══════════════════════════════════════════════════════════════════════════════
# ALERT / EVENT POSTING
# ══════════════════════════════════════════════════════════════════════════════

def _raise_alert(rest_url, anon_key, device_id, hostname,
                 rule_id, message, severity="high", mitre=None):
    headers = _api_headers(anon_key)
    try:
        chk = requests.get(
            f"{rest_url}/alerts?device_id=eq.{device_id}&rule_id=eq.{rule_id}&resolved=eq.false&limit=1",
            headers=headers, timeout=8)
        if chk.status_code == 200 and chk.json():
            return
        body = {"device_id": device_id, "alert_type": rule_id.split(":")[0], "rule_id": rule_id,
                "severity": severity, "message": message, "resolved": False}
        if mitre:
            body["mitre_technique"] = mitre
        r = requests.post(f"{rest_url}/alerts", json=body, headers=headers, timeout=10)
        if r.status_code >= 300:
            logger.warning("[EDR] alert %s rejected (HTTP %s): %s", rule_id, r.status_code, r.text[:200])
    except Exception as e:
        logger.debug("_raise_alert error: %s", e)


def _post_security_event(rest_url, anon_key, device_id, hostname,
                         event_type, description, severity="info",
                         details=None, mitre=None):
    _post(rest_url, anon_key, "security_events", {
        "device_id":       device_id,
        "hostname":        hostname,
        "event_type":      event_type,
        "severity":        severity,
        "description":     description,
        "details":         details or {},
        "mitre_technique": mitre,
    })


# ══════════════════════════════════════════════════════════════════════════════
# ENTRY POINT — called from agent_mac.inventory_loop
# ══════════════════════════════════════════════════════════════════════════════

def run_full_edr(rest_url: str, anon_key: str, device_id: str, hostname: str,
                 installed_apps: list = None,
                 virustotal_api_key: str = "",
                 auto_quarantine: bool = False,
                 auto_kill_blocked: bool = False,
                 abuse_ch_key: str = "",
                 progress=None) -> dict:
    """progress(pct, message) is called as each stage starts (used for live command progress)."""
    report = progress or (lambda pct, msg: None)
    if _scan_lock.locked():
        report(2, "Waiting for the scan already in progress…")
    with _scan_lock:
        return _run_full_edr(rest_url, anon_key, device_id, hostname, installed_apps,
                             virustotal_api_key, auto_quarantine, auto_kill_blocked, abuse_ch_key, report)


_scan_lock = threading.Lock()


def _run_full_edr(rest_url, anon_key, device_id, hostname, installed_apps,
                  virustotal_api_key, auto_quarantine, auto_kill_blocked, abuse_ch_key, report) -> dict:
    logger.info("[EDR] Starting scan for %s", hostname)
    summary = {"group": None, "errors": []}
    group_id = None
    report(5, "Updating threat intelligence")
    try:
        refresh_ioc_feeds(abuse_ch_key=abuse_ch_key)
        summary["threat_intel"] = {k: len(v) for k, v in _ioc_cache.items() if isinstance(v, set)}
    except Exception as e:
        logger.warning("[EDR] threat intel: %s", e)
        summary["errors"].append(f"threat intel: {e}")
    try:
        group_id = get_device_group(rest_url, anon_key, device_id)
        summary["group"] = group_id
    except Exception as e:
        logger.warning("[EDR] group lookup: %s", e)

    stages = {
        "app filter sync": (20, "Syncing application rules"),
        "web filter":      (30, "Applying web filtering"),
        "malware scan":    (45, "Scanning files and running processes for malware"),
        "behavior":        (85, "Checking for suspicious behaviour"),
        "app enforcement": (93, "Checking installed applications against policy"),
    }
    for label, fn in [
        ("app filter sync", lambda: sync_app_filter(rest_url, anon_key, group_id)),
        ("web filter",      lambda: sync_web_filter(rest_url, anon_key, group_id)),
        ("malware scan",    lambda: scan_for_malware(rest_url, anon_key, device_id, hostname,
                                                     virustotal_api_key=virustotal_api_key,
                                                     auto_quarantine=auto_quarantine)),
        ("behavior",        lambda: run_behavioral_detection(rest_url, anon_key, device_id, hostname)),
        ("app enforcement", lambda: enforce_app_filter(rest_url, anon_key, device_id, hostname,
                                                       installed_apps or [], auto_kill=auto_kill_blocked)),
    ]:
        report(*stages[label])
        try:
            result = fn()
            if result is not None:
                summary[label] = result
        except Exception as e:
            logger.warning("[EDR] %s failed: %s", label, e)
            summary["errors"].append(f"{label}: {e}")

    summary["app_blocklist"] = len(_app_filter.get("blocklist", ()))
    report(100, "Scan complete")
    logger.info("[EDR] Scan complete for %s: %s", hostname, summary)
    return summary


# ══════════════════════════════════════════════════════════════════════════════
# DETECTION ANALYTICS (catalogue in the `analytics` table; modelled on Jamf Protect)
#   process rules every 30s · persistence/file/config/log/malware-IOC every 5 min
# ══════════════════════════════════════════════════════════════════════════════

import plistlib
import stat as _stat
from glob import glob as _glob

ANALYTICS_STATE = os.path.join(DATA_DIR, "analytics_state.json")
ANALYTICS_REFRESH_SEC = 600
_SHELL_NAMES = {"sh", "bash", "zsh", "ksh", "csh", "tcsh", "dash", "fish"}
_analytics: list = []
_analytics_loaded_at = 0.0
_analytics_seen: dict = {}          # dedupe key -> first seen ts (process hits)
_regex_cache: dict = {}


def _rx(pattern: str):
    r = _regex_cache.get(pattern)
    if r is None:
        try:
            r = re.compile(pattern)
        except re.error:
            r = re.compile(r"(?!x)x")        # never matches; a bad pattern must not break the engine
        _regex_cache[pattern] = r
    return r


def _load_state() -> dict:
    try:
        with open(ANALYTICS_STATE) as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def _save_state(state: dict):
    try:
        _ensure_dirs()
        tmp = ANALYTICS_STATE + ".tmp"
        with open(tmp, "w") as f:
            json.dump(state, f)
        os.replace(tmp, ANALYTICS_STATE)
    except OSError as e:
        logger.debug("analytics state save failed: %s", e)


def sync_analytics(rest_url: str, anon_key: str, force: bool = False):
    """Enabled analytics the agent can run (anon policy hides disabled and ES-only ones)."""
    global _analytics, _analytics_loaded_at
    if not force and time.time() - _analytics_loaded_at < ANALYTICS_REFRESH_SEC and _analytics:
        return
    rows = _get(rest_url, anon_key, "analytics?select=id,name,category,method,definition,severity,mitre&limit=1000")
    if rows or not _analytics:
        _analytics = rows
        _analytics_loaded_at = time.time()
        logger.info("[ANALYTICS] %d analytics active", len(rows))


def _expand(paths: list) -> list:
    out = []
    for p in paths:
        if p.startswith("~/"):
            out += _glob(os.path.join("/Users/*", p[2:]))
        else:
            out += _glob(p)
    return [p for p in out if not p.startswith("/Users/Shared/Relocated")]


def _hit(rest_url, anon_key, device_id, hostname, rule: dict, detail: str, extra: dict = None):
    sev = rule.get("severity") or "high"
    logger.warning("[ANALYTICS] %s — %s", rule["name"], detail)
    _post_security_event(rest_url, anon_key, device_id, hostname,
        event_type="analytic", severity="high" if sev in ("critical", "high") else "warning",
        description=f"{rule['name']}: {detail}",
        details={"rule_id": rule["id"], "category": rule.get("category"), **(extra or {})},
        mitre=rule.get("mitre"))
    _raise_alert(rest_url, anon_key, device_id, hostname,
        rule_id=f"analytic:{rule['id']}"[:120], severity=sev if sev != "info" else "low",
        message=f"{rule['name']} — {detail} on {hostname}", mitre=rule.get("mitre"))


def _once(key: str, ttl: int = 3600) -> bool:
    """True the first time a key is seen within ttl seconds."""
    now = time.time()
    if now - _analytics_seen.get(key, 0) < ttl:
        return False
    _analytics_seen[key] = now
    if len(_analytics_seen) > 5000:
        for k in sorted(_analytics_seen, key=_analytics_seen.get)[:2500]:
            _analytics_seen.pop(k, None)
    return True


# ── process-based rules ──────────────────────────────────────────────────────
def run_process_analytics(rest_url, anon_key, device_id, hostname):
    rules = [r for r in _analytics if r.get("method") in ("cmdline", "parent_child", "process", "listen")]
    if not rules:
        return
    me = os.getpid()
    procs = {}
    for p in psutil.process_iter(["pid", "ppid", "name", "exe", "cmdline", "create_time"]):
        procs[p.info["pid"]] = p.info
    for info in procs.values():
        pid = info["pid"]
        if pid in (0, 1, me) or _spawned_by_agent(pid, lambda x: (procs.get(x) or {}).get("ppid") or 0, me):
            continue                                              # never flag the agent's own helpers
        name = info.get("name") or ""
        exe = info.get("exe") or ""
        cmd = " ".join(info.get("cmdline") or [])[:4000]
        parent = procs.get(info.get("ppid") or -1) or {}
        pname = parent.get("name") or ""
        for r in rules:
            d = r.get("definition") or {}
            m = r["method"]
            matched = None
            if m == "cmdline" and cmd:
                for pat in d.get("patterns", []):
                    if _rx(pat).search(cmd):
                        matched = f"{name} (PID {pid}): {cmd[:300]}"
                        break
            elif m == "parent_child" and pname:
                if _rx(d.get("parents", "(?!x)x")).search(pname) and _rx(d.get("children", "(?!x)x")).search(name):
                    matched = f"{pname} started {name} (PID {pid}): {cmd[:250]}"
            elif m == "process":
                if d.get("check") == "exe_deleted":
                    if exe and not exe.startswith(("/System/", "/Applications/", "/usr/", "/Library/Apple/")) \
                            and time.time() - (info.get("create_time") or 0) > 30:
                        try:
                            os.stat(exe)
                        except FileNotFoundError:          # truly gone — not merely unreadable
                            matched = f"{name} (PID {pid}) is running but its binary {exe} was deleted"
                        except OSError:
                            pass
                else:
                    ok = True
                    if d.get("name") and not _rx(d["name"]).search(name):
                        ok = False
                    if ok and d.get("exe") and not _rx(d["exe"]).search(exe):
                        ok = False
                    if ok and d.get("exe_not") and (not exe or _rx(d["exe_not"]).search(exe)):
                        ok = False
                    if ok and (d.get("name") or d.get("exe")):
                        matched = f"{name} (PID {pid}) {exe}"
            if matched and _once(f"{r['id']}:{pid}:{info.get('create_time')}"):
                _hit(rest_url, anon_key, device_id, hostname, r, matched,
                     {"pid": pid, "process": name, "path": exe, "cmdline": cmd[:1000], "parent": pname})

    for r in [r for r in rules if r["method"] == "listen"]:
        d = r.get("definition") or {}
        try:
            for c in psutil.net_connections(kind="inet"):
                if c.status != psutil.CONN_LISTEN or not c.pid or not c.laddr:
                    continue
                pname = (procs.get(c.pid) or {}).get("name") or ""
                if _rx(d.get("process", "(?!x)x")).search(pname) and c.laddr.port not in d.get("allowed_ports", []):
                    if _once(f"{r['id']}:{c.laddr.port}", 86400):
                        _hit(rest_url, anon_key, device_id, hostname, r, f"{pname} listening on port {c.laddr.port}", {"port": c.laddr.port})
        except (psutil.AccessDenied, OSError):
            pass


# ── persistence / file / config / log rules ──────────────────────────────────
def _plist_program(path: str) -> str:
    try:
        with open(path, "rb") as f:
            pl = plistlib.load(f)
        prog = pl.get("Program") or (pl.get("ProgramArguments") or [""])[0]
        return str(prog or "")
    except Exception:
        return ""


def _plist_dyld(path: str, key: str = "EnvironmentVariables") -> bool:
    try:
        with open(path, "rb") as f:
            pl = plistlib.load(f)
        return "DYLD_INSERT_LIBRARIES" in (pl.get(key) or {})
    except Exception:
        return False


def _file_sig(path: str) -> str:
    try:
        st = os.stat(path)
        return f"{int(st.st_mtime)}:{st.st_size}"
    except OSError:
        return ""


def _recent(path: str, minutes: int) -> bool:
    try:
        return time.time() - os.stat(path).st_mtime < minutes * 60
    except OSError:
        return False


def _app_info(app: str) -> dict:
    try:
        with open(os.path.join(app, "Contents", "Info.plist"), "rb") as f:
            return plistlib.load(f)
    except Exception:
        return {}


def _walk_limited(root: str, depth: int, cap: int = 3000):
    base = root.rstrip("/").count("/")
    n = 0
    for dirpath, dirnames, filenames in os.walk(root):
        if dirpath.count("/") - base >= depth:
            dirnames[:] = []
        for fn in filenames:
            n += 1
            if n > cap:
                return
            yield os.path.join(dirpath, fn)


def run_periodic_analytics(rest_url, anon_key, device_id, hostname, state: dict):
    baselines = state.setdefault("baselines", {})
    alerted = state.setdefault("alerted", {})

    def once_path(rule_id, key) -> bool:
        k = f"{rule_id}|{key}"
        if k in alerted:
            return False
        alerted[k] = int(time.time())
        return True

    for r in _analytics:
        m, d, rid = r.get("method"), r.get("definition") or {}, r["id"]
        try:
            if m == "persistence":
                items = {}
                for root in _expand(d.get("paths", [])):
                    for p in _glob(os.path.join(root, d.get("glob", "*"))):
                        items[p] = _file_sig(p)
                chk = d.get("check")
                if chk in ("new", "changed"):
                    prev = baselines.get(rid)
                    if prev is None:
                        baselines[rid] = items                      # first run: learn what's already there
                        continue
                    for p, sig in items.items():
                        if p not in prev or (chk == "changed" and prev.get(p) != sig):
                            if once_path(rid, f"{p}:{sig}"):
                                prog = _plist_program(p) if p.endswith(".plist") else ""
                                _hit(rest_url, anon_key, device_id, hostname, r,
                                     f"{'new' if p not in prev else 'modified'} {p}" + (f" → {prog}" if prog else ""), {"path": p, "program": prog})
                    baselines[rid] = items
                elif chk == "disguised":
                    exp = d.get("expected", [])
                    for p in items:
                        prog = _plist_program(p)
                        if prog and not any(_rx(e).search(prog) for e in exp) and once_path(rid, p):
                            _hit(rest_url, anon_key, device_id, hostname, r, f"{p} runs {prog}", {"path": p, "program": prog})
                elif chk == "hidden_target":
                    for p in items:
                        prog = _plist_program(p)
                        if "/." in prog and once_path(rid, p):
                            _hit(rest_url, anon_key, device_id, hostname, r, f"{p} runs hidden binary {prog}", {"path": p, "program": prog})
                elif chk == "dyld_insert":
                    for p in items:
                        if _plist_dyld(p) and once_path(rid, p):
                            _hit(rest_url, anon_key, device_id, hostname, r, f"{p} sets DYLD_INSERT_LIBRARIES", {"path": p})

            elif m == "file_scan":
                chk = d.get("check")
                age = d.get("max_age_minutes")
                for root in _expand(d.get("paths", [])):
                    if not os.path.isdir(root):
                        continue
                    if chk == "setuid_shell":
                        for p in _walk_limited(root, 2, 2000):
                            try:
                                st = os.lstat(p)
                            except OSError:
                                continue
                            if st.st_mode & _stat.S_ISUID and os.path.basename(p) in _SHELL_NAMES | {"sh_copy"} and once_path(rid, p):
                                _hit(rest_url, anon_key, device_id, hostname, r, f"setuid shell at {p}", {"path": p})
                    elif chk in ("script_app", "url_handler_app", "dyld_insert_app", "no_quarantine_app"):
                        for app in _glob(os.path.join(root, "*.app")):
                            if age and not _recent(app, age):
                                continue
                            info = _app_info(app)
                            if chk == "script_app":
                                exe = os.path.join(app, "Contents", "MacOS", str(info.get("CFBundleExecutable", "")))
                                try:
                                    with open(exe, "rb") as f:
                                        if f.read(2) == b"#!" and once_path(rid, app):
                                            _hit(rest_url, anon_key, device_id, hostname, r, f"{app} main executable is a script", {"path": app})
                                except OSError:
                                    pass
                            elif chk == "url_handler_app" and info.get("CFBundleURLTypes") and once_path(rid, app):
                                schemes = [s for t in info["CFBundleURLTypes"] for s in (t.get("CFBundleURLSchemes") or [])]
                                _hit(rest_url, anon_key, device_id, hostname, r, f"{app} registers URL scheme(s) {', '.join(schemes)[:80]}", {"path": app})
                            elif chk == "dyld_insert_app" and "DYLD_INSERT_LIBRARIES" in (info.get("LSEnvironment") or {}) and once_path(rid, app):
                                _hit(rest_url, anon_key, device_id, hostname, r, f"{app} injects a library via LSEnvironment", {"path": app})
                            elif chk == "no_quarantine_app":
                                q = subprocess.run(["xattr", "-p", "com.apple.quarantine", app], capture_output=True, timeout=5)
                                if q.returncode != 0 and once_path(rid, app):
                                    _hit(rest_url, anon_key, device_id, hostname, r, f"{app} downloaded without a quarantine attribute", {"path": app})
                    elif chk in ("recent_script", "suspicious_download", "name_match"):
                        rx = _rx(d.get("name") or (r"(?i)\.(sh|command|py|scpt|pl|rb)$" if chk == "recent_script"
                                 else r"(?i)\.(pdf|docx?|xlsx?|jpe?g|png|txt|mp4)\.(app|command|sh|pkg|dmg|terminal)$|\.(command|terminal|tool)$"))
                        for p in _walk_limited(root, 6 if chk == "recent_script" else 1, 4000):
                            if rx.search(os.path.basename(p)) and (not age or _recent(p, age)) and once_path(rid, f"{p}:{_file_sig(p)}"):
                                _hit(rest_url, anon_key, device_id, hostname, r, p, {"path": p})
                    elif chk == "dsstore_dir":
                        cand = os.path.join(root, ".DS_Store")
                        if os.path.isdir(cand) and once_path(rid, cand):
                            _hit(rest_url, anon_key, device_id, hostname, r, f"directory named .DS_Store at {cand}", {"path": cand})

            elif m == "config":
                chk = d.get("check")
                jamf_plist = "/Library/Preferences/com.jamfsoftware.jamf.plist"
                if chk in ("jamf_url_insecure", "jamf_url_changed") and os.path.exists(jamf_plist):
                    try:
                        with open(jamf_plist, "rb") as f:
                            url = str(plistlib.load(f).get("jss_url", ""))
                    except Exception:
                        url = ""
                    if chk == "jamf_url_insecure" and url.lower().startswith("http://") and once_path(rid, url):
                        _hit(rest_url, anon_key, device_id, hostname, r, f"jss_url uses plain HTTP: {url}", {"url": url})
                    if chk == "jamf_url_changed" and url:
                        known = baselines.setdefault(rid, {}).get("url")
                        if known is None:
                            baselines[rid]["url"] = url
                        elif known != url and once_path(rid, url):
                            _hit(rest_url, anon_key, device_id, hostname, r, f"jss_url changed from {known} to {url}", {"old": known, "new": url})
                elif chk == "jamf_binary_changed":
                    b = "/usr/local/bin/jamf"
                    h = _hash_file(b) if os.path.exists(b) else "missing"
                    known = baselines.setdefault(rid, {}).get("hash")
                    if known is None:
                        if h != "missing":
                            baselines[rid]["hash"] = h
                    elif known != h:
                        if once_path(rid, h):
                            _hit(rest_url, anon_key, device_id, hostname, r,
                                 "Jamf binary removed" if h == "missing" else "Jamf binary changed (may be a Jamf update — verify)", {"sha256": h})
                        if h != "missing":
                            baselines[rid]["hash"] = h
                elif chk == "proxy_localhost":
                    out = subprocess.run(["scutil", "--proxy"], capture_output=True, text=True, timeout=5).stdout
                    for kind in ("HTTP", "HTTPS", "SOCKS"):
                        if re.search(rf"{kind}Enable\s*:\s*1", out) and re.search(rf"{kind}Proxy\s*:\s*(127\.0\.0\.1|localhost)", out) and once_path(rid, kind):
                            _hit(rest_url, anon_key, device_id, hostname, r, f"{kind} proxy points to localhost", {"type": kind})
                elif chk == "login_hook":
                    for pl in ["/var/root/Library/Preferences/com.apple.loginwindow.plist", "/Library/Preferences/com.apple.loginwindow.plist"]:
                        try:
                            with open(pl, "rb") as f:
                                hook = plistlib.load(f).get("LoginHook")
                        except Exception:
                            hook = None
                        if hook and once_path(rid, str(hook)):
                            _hit(rest_url, anon_key, device_id, hostname, r, f"LoginHook set to {hook}", {"hook": str(hook)})

            elif m == "log":
                last = state.get("log_last", {}).get(rid)
                window = "6m" if last else "10m"
                out = subprocess.run(["log", "show", "--style", "compact", "--last", window, "--predicate", d.get("predicate", "")],
                                     capture_output=True, text=True, timeout=60).stdout
                rx = _rx(d.get("regex", "(?!x)x"))
                for line in out.splitlines()[-5000:]:
                    if rx.search(line) and once_path(rid, hashlib.sha1(line.encode()).hexdigest()):
                        _hit(rest_url, anon_key, device_id, hostname, r, line.strip()[:300], {"log": line.strip()[:1000]})
                state.setdefault("log_last", {})[rid] = int(time.time())

            elif m == "malware":
                for p in _expand(d.get("paths", [])):
                    if os.path.exists(p) and once_path(rid, p):
                        _hit(rest_url, anon_key, device_id, hostname, r, f"indicator present: {p}", {"path": p})
                for app in d.get("apps", []):
                    for p in _glob(f"/Applications/{app}*.app") + _glob(f"/Users/*/Applications/{app}*.app"):
                        if once_path(rid, p):
                            _hit(rest_url, anon_key, device_id, hostname, r, f"application installed: {p}", {"path": p})
        except Exception as e:
            logger.debug("[ANALYTICS] %s failed: %s", rid, e)

    # keep the alerted map bounded (forget items after 30 days)
    cutoff = time.time() - 30 * 86400
    state["alerted"] = {k: v for k, v in alerted.items() if v > cutoff}


def analytics_on_malware(rest_url, anon_key, device_id, hostname, detection: dict):
    """Map a ClamAV/MalwareBazaar detection to the matching malware-family analytics."""
    sig = (detection.get("signature") or "").lower()
    for r in _analytics:
        if r.get("method") != "malware":
            continue
        kws = [k.lower() for k in (r.get("definition") or {}).get("keywords", [])]
        if any(re.search(rf"(^|[^a-z]){re.escape(k)}([^a-z]|$)", sig) for k in kws if len(k) >= 3):
            if _once(f"{r['id']}:{detection.get('path')}", 86400):
                _hit(rest_url, anon_key, device_id, hostname, r, f"{detection.get('signature')} in {detection.get('path')}",
                     {"path": detection.get("path"), "signature": detection.get("signature"), "engine": detection.get("engine")})


def analytics_loop(rest_url: str, anon_key: str, device_id: str, hostname: str):
    state = _load_state()
    last_periodic = 0.0
    time.sleep(20)
    while True:
        try:
            sync_analytics(rest_url, anon_key)
            run_process_analytics(rest_url, anon_key, device_id, hostname)
            if time.time() - last_periodic > 300:
                run_periodic_analytics(rest_url, anon_key, device_id, hostname, state)
                _save_state(state)
                last_periodic = time.time()
        except Exception as e:
            logger.warning("[ANALYTICS] loop error: %s", e)
        time.sleep(30)
