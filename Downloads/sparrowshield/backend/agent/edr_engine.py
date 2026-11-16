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
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse

import psutil
import requests

logger = logging.getLogger("sparrowshield.edr")

# ── Paths ──────────────────────────────────────────────────────────────────────
DATA_DIR        = "/var/lib/sparrowshield"
IOC_CACHE_PATH  = f"{DATA_DIR}/ioc_cache.json"
WEB_FILTER_PATH = f"{DATA_DIR}/web_filter.json"
APP_FILTER_PATH = f"{DATA_DIR}/app_filter.json"
QUARANTINE_DIR  = "/var/quarantine/sparrowshield"
HOSTS_MARKER    = "# SparrowShield managed block — DO NOT EDIT"
HOSTS_PATH      = "/etc/hosts"

# ── IOC Feed URLs (all free, no API key) ──────────────────────────────────────
IOC_FEEDS = {
    "feodo_c2_ips":  "https://feodotracker.abuse.ch/downloads/ipblocklist.txt",
    "urlhaus":       "https://urlhaus.abuse.ch/downloads/text_online/",
    "malware_hashes":"https://bazaar.abuse.ch/export/txt/sha256/recent/",
}

CATEGORY_FEEDS = {
    "malware":       "https://raw.githubusercontent.com/blocklistproject/Lists/master/malware.txt",
    "phishing":      "https://raw.githubusercontent.com/blocklistproject/Lists/master/phishing.txt",
    "ransomware":    "https://raw.githubusercontent.com/blocklistproject/Lists/master/ransomware.txt",
    "crypto_mining": "https://raw.githubusercontent.com/blocklistproject/Lists/master/crypto.txt",
    "adult":         "https://raw.githubusercontent.com/blocklistproject/Lists/master/adult.txt",
    "gambling":      "https://raw.githubusercontent.com/blocklistproject/Lists/master/gambling.txt",
    "gaming":        "https://raw.githubusercontent.com/blocklistproject/Lists/master/gaming.txt",
    "social":        "https://raw.githubusercontent.com/blocklistproject/Lists/master/social.txt",
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
        requests.post(f"{rest_url}/{table}", json=body,
                      headers=_api_headers(anon_key), timeout=10)
    except Exception as e:
        logger.debug("_post %s error: %s", table, e)


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
# FEATURE 1: VIRUS / MALWARE DETECTION
# ══════════════════════════════════════════════════════════════════════════════

def _hash_file(path: str) -> Optional[str]:
    try:
        h = hashlib.sha256()
        with open(path, "rb") as f:
            for chunk in iter(lambda: f.read(65536), b""):
                h.update(chunk)
        return h.hexdigest()
    except (OSError, PermissionError):
        return None


def refresh_ioc_feeds(force=False) -> dict:
    """Pull malware hash and C2 IP feeds from abuse.ch. Cache locally."""
    global _last_refresh, _ioc_cache

    now = time.time()
    if not force and (now - _last_refresh) < REFRESH_INTERVAL and _ioc_cache:
        return _ioc_cache

    logger.info("[TI] Refreshing threat intelligence feeds")
    cache = {"malware_hashes": set(), "c2_ips": set(), "malicious_domains": set(), "updated_at": now}

    # MalwareBazaar hashes
    try:
        r = requests.get(IOC_FEEDS["malware_hashes"], timeout=20)
        if r.status_code == 200:
            for line in r.text.splitlines():
                line = line.strip()
                if line and not line.startswith("#") and len(line) == 64:
                    cache["malware_hashes"].add(line.lower())
            logger.info("[TI] MalwareBazaar: %d hashes", len(cache["malware_hashes"]))
    except Exception as e:
        logger.debug("[TI] MalwareBazaar error: %s", e)

    # Feodo C2 IPs
    try:
        r = requests.get(IOC_FEEDS["feodo_c2_ips"], timeout=15)
        if r.status_code == 200:
            for line in r.text.splitlines():
                line = line.strip()
                if line and not line.startswith("#"):
                    cache["c2_ips"].add(line)
            logger.info("[TI] Feodo: %d C2 IPs", len(cache["c2_ips"]))
    except Exception as e:
        logger.debug("[TI] Feodo error: %s", e)

    # URLhaus malicious domains
    try:
        r = requests.get(IOC_FEEDS["urlhaus"], timeout=15)
        if r.status_code == 200:
            for line in r.text.splitlines():
                line = line.strip()
                if line and not line.startswith("#"):
                    try:
                        domain = urlparse(line).netloc or line
                        if domain:
                            cache["malicious_domains"].add(domain.lower())
                    except Exception:
                        pass
            logger.info("[TI] URLhaus: %d domains", len(cache["malicious_domains"]))
    except Exception as e:
        logger.debug("[TI] URLhaus error: %s", e)

    _ioc_cache  = cache
    _last_refresh = now

    # Persist to disk
    _ensure_dirs()
    try:
        with open(IOC_CACHE_PATH, "w") as f:
            json.dump({k: list(v) if isinstance(v, set) else v for k, v in cache.items()}, f)
    except Exception:
        pass

    return cache


def scan_running_processes(ioc_cache: dict, rest_url: str, anon_key: str,
                           device_id: str, hostname: str,
                           virustotal_api_key: str = "",
                           auto_quarantine: bool = False):
    """
    Hash-scan all running process binaries against malware hashes.
    Posts alerts and optionally quarantines.
    """
    malware_hashes = ioc_cache.get("malware_hashes", set())
    if not malware_hashes:
        return

    scanned = set()
    threats_found = []

    for proc in psutil.process_iter(["pid", "name", "exe"]):
        try:
            path = proc.info.get("exe")
            if not path or path in scanned or not os.path.isfile(path):
                continue
            # Skip immutable system paths
            if path.startswith(("/System/", "/usr/lib/", "/usr/bin/", "/sbin/")):
                continue
            scanned.add(path)

            file_hash = _hash_file(path)
            if not file_hash:
                continue

            detected = False
            source   = ""

            if file_hash in malware_hashes:
                detected = True
                source   = "MalwareBazaar"

            # VirusTotal check (if API key provided and not already flagged)
            if not detected and virustotal_api_key:
                vt = _check_virustotal(file_hash, virustotal_api_key)
                if vt.get("malicious", 0) >= 3:
                    detected = True
                    source   = f"VirusTotal ({vt['malicious']}/{vt.get('total_engines',0)})"

            if detected:
                threat = {"pid": proc.info["pid"], "name": proc.info["name"],
                          "path": path, "hash": file_hash, "source": source}
                threats_found.append(threat)
                logger.warning("[AV] MALWARE DETECTED: %s (%s) — %s", proc.info["name"], path[:60], source)

                _post_security_event(rest_url, anon_key, device_id, hostname,
                    event_type="malware_detected", severity="critical",
                    description=f"Malware detected: '{proc.info['name']}' [{file_hash[:16]}] via {source}",
                    details=threat, mitre="T1204")

                _raise_alert(rest_url, anon_key, device_id, hostname,
                    rule_id="malware_hash_match",
                    message=f"Malware '{proc.info['name']}' detected on {hostname} (hash match: {source})",
                    severity="critical", mitre="T1204")

                if auto_quarantine and path:
                    _kill_and_quarantine(proc.info["pid"], path, reason=f"malware_{source}")

        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue

    # Post scan result
    _post(rest_url, anon_key, "av_scan_results", {
        "device_id":    device_id,
        "hostname":     hostname,
        "scan_type":    "quick",
        "status":       "threats_found" if threats_found else "clean",
        "threats_found": len(threats_found),
        "files_scanned": len(scanned),
        "threats":      threats_found,
    })


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

MAX_HOSTS_ENTRIES = 150_000
_DOMAIN_RE = re.compile(r"^[a-z0-9][a-z0-9._-]*\.[a-z]{2,}$")


def _clean_domain(raw: str) -> str:
    d = raw.strip().lower()
    d = re.sub(r"^https?://", "", d).split("/")[0].split(":")[0].strip(".")
    return d if _DOMAIN_RE.match(d) else ""


def _fetch_category(url: str) -> list:
    try:
        r = requests.get(url, timeout=30)
        if r.status_code != 200:
            return []
        out = []
        for line in r.text.splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            parts = line.split()
            d = _clean_domain(parts[1] if len(parts) >= 2 else parts[0])
            if d and d not in ("localhost", "0.0.0.0"):
                out.append(d)
        return out
    except Exception as e:
        logger.debug("[WEB FILTER] feed %s error: %s", url, e)
        return []


def sync_web_filter(rest_url: str, anon_key: str, group_id: Optional[str]):
    global _web_filter

    rules = _get(rest_url, anon_key,
                 f"web_filter_rules?enabled=eq.true&select=domain,action&{_group_scope(group_id)}&limit=10000")
    custom_block = [d for d in (_clean_domain(r.get("domain") or "") for r in rules if r.get("action") == "block") if d]
    allowed      = {d for d in (_clean_domain(r.get("domain") or "") for r in rules if r.get("action") == "allow") if d}

    # Custom rules first so they survive the size cap; security categories before content categories.
    ordered: list = list(custom_block)
    priority = ["malware", "phishing", "ransomware", "crypto_mining"]
    cats = _get(rest_url, anon_key, "web_categories?enabled=eq.true&select=name,blocklist_url")
    cats.sort(key=lambda c: priority.index(c["name"]) if c.get("name") in priority else len(priority))
    category_counts = {}
    for cat in cats:
        if cat.get("blocklist_url"):
            domains = _fetch_category(cat["blocklist_url"])
            category_counts[cat["name"]] = len(domains)
            ordered.extend(domains)

    seen, blocked = set(), []
    for d in ordered:
        if d in seen or d in allowed or any(d == a or d.endswith("." + a) for a in allowed):
            continue
        seen.add(d)
        blocked.append(d)
        if len(blocked) >= MAX_HOSTS_ENTRIES:
            break

    _web_filter = {"blocked": blocked, "allowed": allowed, "custom": set(custom_block)}
    _apply_hosts_block(blocked, set(custom_block))
    logger.info("[WEB FILTER] %d domains blocked (categories: %s, whitelist: %d)",
                len(blocked), category_counts, len(allowed))
    return {"blocked": len(blocked), "categories": category_counts, "allowed": len(allowed)}


def _apply_hosts_block(domains: list, custom: set):
    try:
        with open(HOSTS_PATH, "r") as f:
            original = f.read()
        base = original.split(HOSTS_MARKER)[0].rstrip() if HOSTS_MARKER in original else original.rstrip()

        lines = [HOSTS_MARKER]
        for d in domains:
            lines.append(f"0.0.0.0 {d}")
            if d in custom and not d.startswith("www."):
                lines.append(f"0.0.0.0 www.{d}")

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

def _kill_and_quarantine(pid: int, file_path: str, reason: str = "malware"):
    _ensure_dirs()
    try:
        psutil.Process(pid).kill()
        logger.warning("[QUARANTINE] Killed PID %d", pid)
    except (psutil.NoSuchProcess, psutil.AccessDenied):
        pass
    try:
        if os.path.isfile(file_path):
            ts   = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
            dest = os.path.join(QUARANTINE_DIR, f"{ts}_{os.path.basename(file_path)}")
            shutil.move(file_path, dest)
            os.chmod(dest, 0o000)
            logger.warning("[QUARANTINE] %s → %s (%s)", file_path, dest, reason)
    except Exception as e:
        logger.warning("[QUARANTINE] move error: %s", e)


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
        if r.status_code not in (200, 201, 204):
            logger.debug("_raise_alert %s: %s", r.status_code, r.text[:200])
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
                 auto_kill_blocked: bool = False):
    logger.info("[EDR] Starting scan for %s", hostname)
    group_id = None
    try:
        refresh_ioc_feeds()
    except Exception as e:
        logger.warning("[EDR] threat intel: %s", e)
    try:
        group_id = get_device_group(rest_url, anon_key, device_id)
    except Exception as e:
        logger.warning("[EDR] group lookup: %s", e)

    for label, fn in [
        ("app filter sync", lambda: sync_app_filter(rest_url, anon_key, group_id)),
        ("web filter",      lambda: sync_web_filter(rest_url, anon_key, group_id)),
        ("malware scan",    lambda: scan_running_processes(_ioc_cache, rest_url, anon_key, device_id, hostname,
                                                           virustotal_api_key=virustotal_api_key,
                                                           auto_quarantine=auto_quarantine)),
        ("behavior",        lambda: run_behavioral_detection(rest_url, anon_key, device_id, hostname)),
        ("app enforcement", lambda: enforce_app_filter(rest_url, anon_key, device_id, hostname,
                                                       installed_apps or [], auto_kill=auto_kill_blocked)),
    ]:
        try:
            fn()
        except Exception as e:
            logger.warning("[EDR] %s failed: %s", label, e)

    logger.info("[EDR] Scan complete for %s (group=%s)", hostname, group_id or "none")
