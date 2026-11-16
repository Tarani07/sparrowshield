#!/usr/bin/env python3
"""
SparrowShield EDR Engine
Features: malware detection, web filter, app filter, suspicious behavior, device groups
"""

import hashlib
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
    roots = []
    for home in Path("/Users").glob("*"):
        if home.name in ("Shared", "Guest") or home.name.startswith("."):
            continue
        roots += [str(home / "Downloads"), str(home / "Desktop")]
    roots += ["/private/tmp", "/private/var/tmp"]
    for root in roots:
        for dirpath, dirnames, filenames in os.walk(root):
            dirnames[:] = [d for d in dirnames if not d.startswith(".")]
            for fn in filenames:
                p = os.path.join(dirpath, fn)
                try:
                    if os.path.getmtime(p) >= cutoff:
                        add(p)
                except OSError:
                    pass
            if len(targets) >= SCAN_MAX_FILES:
                break
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
        _post(rest_url, anon_key, "software_violations", {
            "device_id":      device_id,
            "app_name":       app_name,
            "app_version":    app.get("version"),
            "violation_type": "blocklist_hit",
        })
        _raise_alert(rest_url, anon_key, device_id, hostname,
            rule_id=f"blocked_app:{hit[:40]}", severity="high",
            message=f"Blocked application '{app_name}' is installed on {hostname}",
            mitre="T1204")

    for proc in psutil.process_iter(["pid", "name"]):
        try:
            pname = proc.info.get("name") or ""
            hit = _matches(pname, blocklist)
            if not hit:
                continue
            if auto_kill:
                proc.kill()
                logger.warning("[APP FILTER] Killed blocked app %s (PID %d)", pname, proc.info["pid"])
            _post_security_event(rest_url, anon_key, device_id, hostname,
                event_type="blocked_app_killed" if auto_kill else "blocked_app_running",
                severity="warning",
                description=f"Blocked app '{pname}' {'was terminated' if auto_kill else 'is running'} on {hostname}",
                details={"pid": proc.info["pid"], "name": pname, "rule": hit},
                mitre="T1204")
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue


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


def _fetch_category(url: str) -> list:
    try:
        r = requests.get(url, timeout=60)
        if r.status_code != 200:
            logger.warning("[WEB FILTER] feed %s returned HTTP %s", url, r.status_code)
            return []
        out = []
        for line in r.text.splitlines():
            line = line.strip()
            if not line or line[0] in "#!":
                continue
            parts = line.split()
            d = _clean_domain(parts[1] if len(parts) >= 2 else parts[0])
            if d and d not in ("localhost", "0.0.0.0"):
                out.append(d)
        return out
    except Exception as e:
        logger.warning("[WEB FILTER] feed %s error: %s", url, e)
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


def sync_web_filter(rest_url: str, anon_key: str, group_id: Optional[str]):
    global _web_filter

    rules = _get(rest_url, anon_key,
                 f"web_filter_rules?enabled=eq.true&select=domain,action&{_group_scope(group_id)}&limit=10000")
    custom_block = [d for d in (_clean_domain(r.get("domain") or "") for r in rules if r.get("action") == "block") if d]
    allowed      = {d for d in (_clean_domain(r.get("domain") or "") for r in rules if r.get("action") == "allow") if d}

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

    _apply_hosts_block(entries, with_www)
    applied = {k: len(v) for k, v in alloc.items()}
    _web_filter = {"blocked": len(entries), "allowed": allowed}
    logger.info("[WEB FILTER] %d domains blocked; per category %s (feed sizes %s); whitelist %d",
                len(entries), applied, feed_sizes, len(allowed))
    return {"blocked": len(entries), "custom": len(custom), "categories": applied,
            "feed_sizes": feed_sizes, "allowed": len(allowed)}


def _apply_hosts_block(domains: list, with_www: set):
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
    except PermissionError:
        logger.warning("[WEB FILTER] Cannot write /etc/hosts — agent must run as root")
    except Exception as e:
        logger.warning("[WEB FILTER] /etc/hosts update error: %s", e)


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
                 abuse_ch_key: str = "") -> dict:
    with _scan_lock:
        return _run_full_edr(rest_url, anon_key, device_id, hostname, installed_apps,
                             virustotal_api_key, auto_quarantine, auto_kill_blocked, abuse_ch_key)


_scan_lock = threading.Lock()


def _run_full_edr(rest_url, anon_key, device_id, hostname, installed_apps,
                  virustotal_api_key, auto_quarantine, auto_kill_blocked, abuse_ch_key) -> dict:
    logger.info("[EDR] Starting scan for %s", hostname)
    summary = {"group": None, "errors": []}
    group_id = None
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
        try:
            result = fn()
            if result is not None:
                summary[label] = result
        except Exception as e:
            logger.warning("[EDR] %s failed: %s", label, e)
            summary["errors"].append(f"{label}: {e}")

    summary["app_blocklist"] = len(_app_filter.get("blocklist", ()))
    logger.info("[EDR] Scan complete for %s: %s", hostname, summary)
    return summary
