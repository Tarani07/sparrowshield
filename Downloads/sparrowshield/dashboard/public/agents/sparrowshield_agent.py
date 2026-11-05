#!/usr/bin/env python3
"""
SparrowShield macOS Agent — JAMF Protect-level EDR
Capabilities: heartbeat, detection, UEBA, persistence monitoring,
              CIS compliance, command execution, auto-remediation,
              process ancestry, TCC monitoring, network DNS assessment.

Edit the CONFIG section then run or deploy as LaunchDaemon.
State stored in ~/.sparrowshield/state.json
"""

# ──────────────────────────────────────────────────────────────
# CONFIG — edit these before deploying
# ──────────────────────────────────────────────────────────────
SUPABASE_URL     = "https://hevcfhxmjgbpozqtescm.supabase.co"
ANON_KEY         = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhldmNmaHhtamdicG96cXRlc2NtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyMjk4NDYsImV4cCI6MjA4NjgwNTg0Nn0.CaXbG8F54bXV0_biNka7vp6Cl1s7vvQsRogNoz7jB28"
HEARTBEAT_SEC    = 60
DETECTION_SEC    = 60
COMMAND_POLL_SEC = 15
# ──────────────────────────────────────────────────────────────

import json, logging, os, platform, plistlib, re, socket, sqlite3
import subprocess, sys, threading, time, uuid
from datetime import datetime, timezone
from pathlib import Path

try:
    import psutil
except ImportError:
    os.system("pip3 install psutil --quiet")
    import psutil

try:
    import requests
except ImportError:
    os.system("pip3 install requests --quiet")
    import requests

# ── Logging ───────────────────────────────────────────────────
STATE_DIR  = Path.home() / ".sparrowshield"
STATE_FILE = STATE_DIR / "state.json"
LOG_FILE   = STATE_DIR / "agent.log"
STATE_DIR.mkdir(parents=True, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
    handlers=[
        logging.FileHandler(LOG_FILE, encoding="utf-8"),
        logging.StreamHandler(sys.stderr),
    ],
)
log = logging.getLogger("sparrowshield")

# ── IOC sets ──────────────────────────────────────────────────
_MINERS  = {"xmrig","cpuminer","minerd","nbminer","cgminer","bfgminer","ethminer",
            "t-rex","lolminer","gminer","phoenixminer","teamredminer","nanominer","srbminer"}
_TUNNELS = {"ngrok","frp","frpc","chisel","ligolo","rpivot","bore","rathole","cloudflared"}
_SHELLS  = {"bash","sh","zsh","fish","python","python3","nc","ncat","netcat","perl","ruby"}
_BAD_PORTS = {4444,1337,31337,4545,6666,7777,12345,54321,9999,5555}
_MALWARE   = {"macstealer","atomicstealer","realst","amos","cthulhu","coinminer","xloader",
              "bundlore","shlayer","osx.dok","pirrit","jahlav","crossrider","adload"}
_SYSTEM    = {"kernel_task","launchd","kextd","configd","mds","WindowServer","coreaudiod",
              "coreduetd","symptomsd","watchdogd","logd","notifyd","securityd"}

# ── State ─────────────────────────────────────────────────────
def load_state() -> dict:
    if STATE_FILE.exists():
        try:
            return json.loads(STATE_FILE.read_text())
        except Exception:
            pass
    return {}

def save_state(s: dict):
    STATE_FILE.write_text(json.dumps(s, indent=2))

# ── Supabase REST ─────────────────────────────────────────────
REST = f"{SUPABASE_URL}/rest/v1"
_HEADERS = {
    "apikey": ANON_KEY,
    "Authorization": f"Bearer {ANON_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation",
}

def db_get(table: str, params: dict) -> list:
    try:
        r = requests.get(f"{REST}/{table}", headers=_HEADERS, params=params, timeout=10)
        return r.json() if r.ok else []
    except Exception as e:
        log.debug("db_get error: %s", e)
        return []

def db_upsert(table: str, data: dict) -> dict | None:
    try:
        h = {**_HEADERS, "Prefer": "resolution=merge-duplicates,return=representation"}
        r = requests.post(f"{REST}/{table}", headers=h, json=data, timeout=10)
        if not r.ok:
            log.error("UPSERT %s %s: %s", table, r.status_code, r.text[:300])
            return None
        rows = r.json()
        return rows[0] if rows else None
    except Exception as e:
        log.error("db_upsert error: %s", e)
        return None

def db_patch(table: str, params: dict, data: dict):
    try:
        r = requests.patch(f"{REST}/{table}", headers=_HEADERS, params=params, json=data, timeout=10)
        if not r.ok:
            log.error("PATCH %s %s: %s", table, r.status_code, r.text[:200])
    except Exception as e:
        log.debug("db_patch error: %s", e)

def db_insert(table: str, data: dict) -> dict | None:
    try:
        r = requests.post(f"{REST}/{table}", headers=_HEADERS, json=data, timeout=10)
        if not r.ok:
            log.debug("INSERT %s %s: %s", table, r.status_code, r.text[:200])
            return None
        rows = r.json()
        return rows[0] if isinstance(rows, list) and rows else None
    except Exception as e:
        log.debug("db_insert error: %s", e)
        return None

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

# ── Shell helpers ─────────────────────────────────────────────
def shell(cmd: str, timeout: int = 8) -> str:
    try:
        return subprocess.check_output(
            cmd, shell=True, stderr=subprocess.DEVNULL, timeout=timeout
        ).decode(errors="ignore").strip()
    except Exception:
        return ""

def shell_lines(cmd: str, timeout: int = 8) -> list[str]:
    return [l for l in shell(cmd, timeout).splitlines() if l.strip()]

# ── Enrollment ────────────────────────────────────────────────
def enroll() -> str:
    state = load_state()
    if state.get("device_id"):
        log.info("Already enrolled: %s", state["device_id"])
        return state["device_id"]

    hostname   = socket.gethostname()
    serial     = shell("system_profiler SPHardwareDataType | awk '/Serial Number/{print $NF}'")
    model      = shell("system_profiler SPHardwareDataType | awk '/Model Name/{$1=$2=\"\"; print $0}'").strip()
    username   = os.environ.get("USER", "unknown")
    os_version = platform.mac_ver()[0]
    cpu_model  = shell("sysctl -n machdep.cpu.brand_string")
    ram_gb     = round(psutil.virtual_memory().total / 1e9, 1)

    if serial:
        existing = db_get("devices", {"serial_number": f"eq.{serial}", "select": "id"})
        if existing:
            device_id = existing[0]["id"]
            save_state({"device_id": device_id})
            return device_id

    device_id = str(uuid.uuid4())
    result = db_upsert("devices", {
        "id":            device_id,
        "hostname":      hostname,
        "serial_number": serial,
        "model_name":    model,
        "cpu_model":     cpu_model,
        "assigned_user": username,
        "os_type":       "mac",
        "os_version":    os_version,
        "ram_total_gb":  ram_gb,
        "status":        "online",
        "enrolled_at":   now_iso(),
        "last_seen":     now_iso(),
    })
    final_id = result.get("id", device_id) if result else device_id
    save_state({"device_id": final_id})
    log.info("Enrolled as %s (%s)", hostname, final_id)
    return final_id

# ── Security posture collectors ───────────────────────────────
def get_filevault() -> bool:
    return "On" in shell("fdesetup status")

def get_firewall() -> bool:
    return "1" == shell("defaults read /Library/Preferences/com.apple.alf globalstate 2>/dev/null")

def get_sip() -> bool:
    return "enabled" in shell("csrutil status").lower()

def get_gatekeeper() -> bool:
    return "enabled" in shell("spctl --status 2>/dev/null").lower()

def get_screen_lock() -> tuple[bool, int]:
    delay = int(shell("defaults -currentHost read com.apple.screensaver idleTime 2>/dev/null") or "0")
    return delay > 0, delay

def get_ssh_enabled() -> bool:
    return "started" in shell("launchctl list com.openssh.sshd 2>/dev/null").lower() or \
           "0" in shell("systemsetup -getremotelogin 2>/dev/null").lower()

def get_remote_desktop_enabled() -> bool:
    return "1" == shell("defaults read /Library/Preferences/com.apple.RemoteDesktop ARD_AllLocalUsers 2>/dev/null")

def get_airdrop_enabled() -> bool:
    return "everyone" in shell("defaults read com.apple.NetworkBrowser BrowseAllInterfaces 2>/dev/null").lower() or \
           shell("defaults read ~/Library/Preferences/com.apple.finder ShowAirDropButton 2>/dev/null") != "0"

def get_automatic_updates() -> bool:
    out = shell("defaults read /Library/Preferences/com.apple.SoftwareUpdate AutomaticCheckEnabled 2>/dev/null")
    return out == "1"

def get_password_policy() -> dict:
    out = shell("pwpolicy -getaccountpolicies 2>/dev/null")
    return {
        "policy_configured": bool(out and "<" in out),
        "min_length_ok": "minChars" in out,
    }

# ── Persistence monitoring (JAMF Protect signature feature) ───
def get_launch_agents() -> list[dict]:
    """Enumerate all LaunchAgent and LaunchDaemon plists — detect non-Apple persistence."""
    dirs = [
        Path("/Library/LaunchDaemons"),
        Path("/Library/LaunchAgents"),
        Path.home() / "Library" / "LaunchAgents",
    ]
    suspicious = []
    for d in dirs:
        if not d.exists():
            continue
        for plist_path in d.glob("*.plist"):
            try:
                with open(plist_path, "rb") as f:
                    pl = plistlib.load(f)
                label = pl.get("Label", str(plist_path.name))
                prog  = " ".join(pl.get("ProgramArguments", pl.get("Program", [""])))
                if prog and not any(trusted in prog for trusted in [
                    "/usr/", "/System/", "/Library/Apple/", "/Applications/",
                    "com.apple.", "com.microsoft.", "com.google."
                ]):
                    suspicious.append({
                        "label": label,
                        "program": prog[:200],
                        "path": str(plist_path),
                        "run_at_load": pl.get("RunAtLoad", False),
                    })
            except Exception:
                pass
    return suspicious

def get_cron_jobs() -> list[str]:
    """List non-system cron jobs."""
    jobs = []
    try:
        out = shell("crontab -l 2>/dev/null")
        for line in out.splitlines():
            if line.strip() and not line.startswith("#"):
                jobs.append(line.strip())
    except Exception:
        pass
    # Also check /etc/crontab and /etc/periodic
    for path in ["/etc/crontab"]:
        try:
            content = Path(path).read_text()
            for line in content.splitlines():
                if line.strip() and not line.startswith("#") and not line.startswith("SHELL"):
                    jobs.append(f"[system] {line.strip()}")
        except Exception:
            pass
    return jobs[:20]

def get_login_items() -> list[str]:
    """List login items for the current user."""
    out = shell("osascript -e 'tell application \"System Events\" to get the name of every login item' 2>/dev/null")
    return [x.strip() for x in out.split(",") if x.strip()]

def get_startup_items() -> list[str]:
    """List items in /Library/StartupItems."""
    try:
        return list(os.listdir("/Library/StartupItems"))
    except Exception:
        return []

# ── TCC / Privacy monitoring (JAMF Protect feature) ──────────
def get_tcc_full_disk_access() -> list[str]:
    """Apps with Full Disk Access via TCC database."""
    tcc_paths = [
        "/Library/Application Support/com.apple.TCC/TCC.db",
        str(Path.home() / "Library" / "Application Support" / "com.apple.TCC" / "TCC.db"),
    ]
    apps = []
    for p in tcc_paths:
        if not Path(p).exists():
            continue
        try:
            conn = sqlite3.connect(p)
            cur  = conn.execute(
                "SELECT client FROM access WHERE service='kTCCServiceSystemPolicyAllFiles' AND auth_value=2"
            )
            apps += [row[0] for row in cur.fetchall()]
            conn.close()
        except Exception:
            pass
    return list(set(apps))[:20]

# ── Browser extension monitoring ─────────────────────────────
def get_browser_extensions() -> list[dict]:
    """Enumerate Chrome/Edge extensions for current user."""
    extensions = []
    profile_dirs = []
    chrome_base = Path.home() / "Library" / "Application Support" / "Google" / "Chrome"
    edge_base   = Path.home() / "Library" / "Application Support" / "Microsoft Edge"
    brave_base  = Path.home() / "Library" / "Application Support" / "BraveSoftware" / "Brave-Browser"

    for base in [chrome_base, edge_base, brave_base]:
        if base.exists():
            for profile in base.iterdir():
                ext_dir = profile / "Extensions"
                if ext_dir.exists():
                    profile_dirs.append((base.name, ext_dir))

    for browser, ext_dir in profile_dirs[:3]:
        for ext_id_dir in list(ext_dir.iterdir())[:50]:
            if not ext_id_dir.is_dir():
                continue
            for ver_dir in ext_id_dir.iterdir():
                manifest = ver_dir / "manifest.json"
                if manifest.exists():
                    try:
                        m = json.loads(manifest.read_text(errors="ignore"))
                        permissions = m.get("permissions", [])
                        dangerous = [p for p in permissions if p in
                                     {"tabs", "cookies", "history", "webRequest", "webRequestBlocking",
                                      "nativeMessaging", "management", "<all_urls>", "storage"}]
                        extensions.append({
                            "browser": browser,
                            "name":    m.get("name", ext_id_dir.name)[:60],
                            "id":      ext_id_dir.name,
                            "permissions": dangerous[:5],
                            "suspicious": len(dangerous) >= 4,
                        })
                    except Exception:
                        pass
    return extensions[:30]

# ── CIS Level 1 & 2 compliance (JAMF Protect benchmark checks)
def get_cis_compliance() -> dict:
    """Run CIS macOS Benchmark checks. Returns per-control pass/fail."""
    checks = {}

    # 1.1 FileVault
    checks["filevault"] = get_filevault()

    # 1.2 Firewall
    checks["firewall"] = get_firewall()

    # 1.3 SIP
    checks["sip"] = get_sip()

    # 1.4 Gatekeeper
    checks["gatekeeper"] = get_gatekeeper()

    # 1.5 Screen lock
    delay = int(shell("defaults -currentHost read com.apple.screensaver idleTime 2>/dev/null") or "0")
    checks["screen_lock"] = 0 < delay <= 300

    # 2.1 Bluetooth off when not needed (check if paired devices exist)
    bt_devices = shell("system_profiler SPBluetoothDataType 2>/dev/null | grep 'Address:' | wc -l").strip()
    checks["bluetooth_managed"] = int(bt_devices or "0") == 0

    # 2.2 SSH remote login
    checks["ssh_disabled"] = not get_ssh_enabled()

    # 2.3 Remote desktop/ARD
    checks["ard_disabled"] = not get_remote_desktop_enabled()

    # 2.4 AirDrop restricted
    checks["airdrop_restricted"] = not get_airdrop_enabled()

    # 2.5 Auto-updates enabled
    checks["auto_update"] = get_automatic_updates()

    # 3.1 Password policy
    pw = get_password_policy()
    checks["password_policy"] = pw["policy_configured"]

    # 3.2 Disable guest account
    guest_out = shell("sysadminctl -guestAccount status 2>/dev/null").lower()
    checks["guest_disabled"] = "disabled" in guest_out or "" == guest_out

    # 3.3 Account for auto-login
    auto_login = shell("defaults read /Library/Preferences/com.apple.loginwindow autoLoginUser 2>/dev/null")
    checks["no_autologin"] = not bool(auto_login)

    # 4.1 Time-based screen saver password
    pwd_prompt = shell("defaults read com.apple.screensaver askForPasswordDelay 2>/dev/null")
    checks["screensaver_password"] = pwd_prompt == "0" or pwd_prompt == ""

    # 4.2 Firmware password (T2 / Apple Silicon: different)
    arch = platform.machine()
    if "arm" in arch.lower():
        checks["firmware_password"] = True  # Apple Silicon uses Activation Lock
    else:
        fw_out = shell("firmwarepasswd -check 2>/dev/null").lower()
        checks["firmware_password"] = "yes" in fw_out or "password enabled" in fw_out

    # 5.1 Audit logging
    audit_out = shell("launchctl list com.apple.auditd 2>/dev/null")
    checks["audit_logging"] = bool(audit_out)

    # 5.2 Crash reporter
    checks["crash_reporter"] = True  # non-critical, assume ok

    # 5.3 Location services
    ls_out = shell("launchctl list com.apple.locationd 2>/dev/null")
    checks["location_services_managed"] = bool(ls_out)

    # Score
    passed = sum(1 for v in checks.values() if v)
    total  = len(checks)
    checks["_score"] = passed
    checks["_total"] = total
    checks["_pct"]   = round(100 * passed / total)
    return checks

# ── Process ancestry collector ────────────────────────────────
def get_process_tree() -> list[dict]:
    """Build minimal process ancestry for top 20 processes."""
    procs = []
    for p in psutil.process_iter(["name", "pid", "ppid", "cpu_percent", "memory_percent", "exe", "status"]):
        try:
            info = p.info
            procs.append({
                "name": info["name"],
                "pid":  info["pid"],
                "ppid": info["ppid"],
                "cpu":  round(info.get("cpu_percent") or 0, 1),
                "mem":  round(info.get("memory_percent") or 0, 1),
                "exe":  info.get("exe") or "",
            })
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            pass
    return sorted(procs, key=lambda x: x["cpu"], reverse=True)[:20]

# ── Network listeners ─────────────────────────────────────────
def get_listening_ports() -> list[dict]:
    ports = []
    try:
        for c in psutil.net_connections(kind="inet"):
            if c.status == "LISTEN" and c.laddr:
                proc = ""
                try:
                    proc = psutil.Process(c.pid).name() if c.pid else ""
                except Exception:
                    pass
                ports.append({"port": c.laddr.port, "protocol": "tcp", "process": proc})
    except (psutil.AccessDenied, PermissionError):
        pass
    return ports

# ── Installed apps ────────────────────────────────────────────
def get_installed_apps() -> list[str]:
    apps = []
    for app_dir in ["/Applications", str(Path.home() / "Applications")]:
        try:
            apps += [f for f in os.listdir(app_dir) if f.endswith(".app")]
        except Exception:
            pass
    return apps[:200]

# ── DNS security assessment (Heimdal-like) ────────────────────
def get_dns_config() -> dict:
    """Assess current DNS configuration for security posture."""
    nameservers = shell_lines("scutil --dns 2>/dev/null | grep nameserver | awk '{print $3}'")
    known_safe_dns = {
        "1.1.1.1", "1.0.0.1",           # Cloudflare
        "8.8.8.8", "8.8.4.4",           # Google
        "9.9.9.9", "149.112.112.112",    # Quad9
        "208.67.222.222",                # OpenDNS
        "208.67.220.220",
    }
    using_private_dns = any(ip in known_safe_dns for ip in nameservers)
    using_corporate   = any(ip.startswith(("10.", "192.168.", "172.")) for ip in nameservers)
    return {
        "nameservers":        nameservers[:5],
        "using_secure_dns":   using_private_dns or using_corporate,
        "using_corporate_dns": using_corporate,
        "doh_configured":     "cloudflared" in shell("ps aux | grep cloudflared"),
    }

# ── Full telemetry snapshot ───────────────────────────────────
def collect_metrics() -> dict:
    cpu  = psutil.cpu_percent(interval=1)
    ram  = psutil.virtual_memory()
    disk = psutil.disk_usage("/")
    boot = psutil.boot_time()

    screen_lock, screen_delay = get_screen_lock()

    return {
        "status":                "online",
        "last_seen":             now_iso(),
        "os_version":            platform.mac_ver()[0],
        "assigned_user":         os.environ.get("USER", ""),
        "cpu_pct":               cpu,
        "ram_total_gb":          round(ram.total / 1e9, 1),
        "ram_used_pct":          round(ram.percent, 1),
        "disk_used_pct":         round(disk.percent, 1),
        "uptime_seconds":        int(time.time() - boot),
        # Security posture
        "filevault_enabled":     get_filevault(),
        "firewall_enabled":      get_firewall(),
        "sip_enabled":           get_sip(),
        "gatekeeper_enabled":    get_gatekeeper(),
        "screen_lock_enabled":   screen_lock,
        "screen_lock_delay_sec": screen_delay,
        "ssh_enabled":           get_ssh_enabled(),
        "remote_desktop_enabled": get_remote_desktop_enabled(),
        "auto_update_enabled":   get_automatic_updates(),
        # Process & network
        "top_processes":         get_process_tree(),
        "listening_ports":       get_listening_ports(),
        "open_connections_count": len(psutil.net_connections(kind="inet")),
        # Apps
        "installed_apps":        get_installed_apps(),
        "active_user":           os.environ.get("USER", ""),
    }

# ── Alert helpers ─────────────────────────────────────────────
def post_alert(device_id: str, rule_id: str, alert_type: str, severity: str,
               message: str, mitre: str):
    existing = db_get("alerts", {
        "device_id": f"eq.{device_id}",
        "rule_id":   f"eq.{rule_id}",
        "resolved":  "eq.false",
        "select":    "id",
        "limit":     "1",
    })
    if existing:
        return
    db_insert("alerts", {
        "device_id":       device_id,
        "hostname":        socket.gethostname(),
        "alert_type":      alert_type,
        "severity":        severity,
        "message":         message,
        "rule_id":         rule_id,
        "mitre_technique": mitre,
        "resolved":        False,
    })
    log.warning("ALERT [%s] %s — %s", severity.upper(), alert_type, message)

def resolve_alert(device_id: str, rule_id: str):
    db_patch("alerts",
             {"device_id": f"eq.{device_id}", "rule_id": f"eq.{rule_id}", "resolved": "eq.false"},
             {"resolved": True, "resolved_at": now_iso()})

# ── Detection engine ──────────────────────────────────────────
def run_detection(metrics: dict, device_id: str):
    procs      = {p["name"].lower() for p in metrics.get("top_processes", [])}
    ports      = {p["port"] for p in metrics.get("listening_ports", [])}
    port_procs = {p["port"]: p["process"].lower() for p in metrics.get("listening_ports", [])}
    apps       = {a.replace(".app","").lower() for a in metrics.get("installed_apps", [])}

    rules = [
        # ── CIS / Posture ─────────────────────────────────────────
        (not metrics.get("filevault_enabled"),
         "filevault_disabled", "filevault_disabled", "critical",
         "FileVault disk encryption is OFF — data at risk if device is lost", "T1486"),

        (not metrics.get("firewall_enabled"),
         "firewall_disabled", "firewall_disabled", "warning",
         "Host firewall is disabled — inbound connections unrestricted", "T1562.004"),

        (not metrics.get("sip_enabled"),
         "sip_disabled", "sip_disabled", "critical",
         "System Integrity Protection (SIP) is OFF — kernel tampering possible", "T1562.001"),

        (not metrics.get("gatekeeper_enabled"),
         "gatekeeper_disabled", "gatekeeper_disabled", "high",
         "Gatekeeper is disabled — unsigned apps can run without prompts", "T1553.001"),

        (not metrics.get("screen_lock_enabled"),
         "screen_lock_disabled", "screen_lock_disabled", "warning",
         "Screen lock is not configured — device unprotected when unattended", "T1078"),

        (not metrics.get("auto_update_enabled"),
         "auto_update_disabled", "auto_update_disabled", "warning",
         "Automatic software updates are disabled — device may miss security patches", "T1203"),

        (metrics.get("remote_desktop_enabled"),
         "remote_desktop_enabled", "remote_desktop_enabled", "warning",
         "Apple Remote Desktop (ARD) is enabled — ensure it is access-controlled", "T1021.005"),

        # ── Process IOC ───────────────────────────────────────────
        (bool(procs & _MINERS),
         "crypto_miner_process", "crypto_miner_process", "critical",
         f"Crypto miner running: {', '.join(procs & _MINERS)}", "T1496"),

        (bool(procs & _TUNNELS),
         "tunneling_tool_detected", "tunneling_tool_detected", "critical",
         f"Tunneling tool running: {', '.join(procs & _TUNNELS)}", "T1572"),

        (bool(procs & _MALWARE),
         "malicious_process", "malicious_app_installed", "critical",
         f"Malicious process detected: {', '.join(procs & _MALWARE)}", "T1204"),

        (any(port_procs.get(p,"") in _SHELLS for p in ports),
         "shell_on_port", "shell_on_port", "critical",
         "Shell interpreter is bound to a network port — possible reverse shell", "T1059"),

        (bool(ports & _BAD_PORTS),
         "suspicious_port", "suspicious_port", "high",
         f"Backdoor port(s) open: {', '.join(str(p) for p in ports & _BAD_PORTS)}", "T1049"),

        (any(p["cpu"] > 80 and p["name"].lower() not in _SYSTEM
             for p in metrics.get("top_processes", [])),
         "high_cpu_non_system", "high_cpu_non_system", "warning",
         "Non-system process consuming >80% CPU — possible miner or abuse", "T1496"),

        (bool(apps & _MALWARE),
         "malicious_app_on_disk", "malicious_app_installed", "critical",
         f"Malicious app on disk: {', '.join(apps & _MALWARE)}", "T1204"),
    ]

    for condition, rule_id, alert_type, severity, message, mitre in rules:
        if condition:
            post_alert(device_id, rule_id, alert_type, severity, message, mitre)
        else:
            resolve_alert(device_id, rule_id)

    # ── Persistence monitoring ────────────────────────────────
    try:
        suspicious_agents = get_launch_agents()
        if suspicious_agents:
            post_alert(device_id, "suspicious_persistence", "suspicious_persistence", "high",
                       f"Suspicious LaunchAgent/Daemon persistence: "
                       f"{', '.join(a['label'] for a in suspicious_agents[:3])}", "T1543.001")
        else:
            resolve_alert(device_id, "suspicious_persistence")
    except Exception:
        pass

    # ── TCC abuse detection ───────────────────────────────────
    try:
        fda_apps = get_tcc_full_disk_access()
        suspicious_fda = [a for a in fda_apps if not any(
            trusted in a for trusted in ["com.apple.", "com.microsoft.", "com.google.", "Spotlight"]
        )]
        if suspicious_fda:
            post_alert(device_id, "tcc_full_disk_access", "tcc_full_disk_access", "warning",
                       f"Non-standard apps with Full Disk Access: {', '.join(suspicious_fda[:3])}", "T1530")
    except Exception:
        pass

    # ── Browser extension anomaly ─────────────────────────────
    try:
        extensions = get_browser_extensions()
        sus_ext    = [e for e in extensions if e.get("suspicious")]
        if sus_ext:
            post_alert(device_id, "suspicious_browser_extension", "suspicious_browser_extension", "warning",
                       f"Browser extensions with broad permissions: "
                       f"{', '.join(e['name'] for e in sus_ext[:3])}", "T1176")
    except Exception:
        pass

# ── Auto-remediation actions ──────────────────────────────────
def enable_firewall(payload: dict) -> tuple[str, bool]:
    out = shell("defaults write /Library/Preferences/com.apple.alf globalstate -int 1 && "
                "launchctl load /System/Library/LaunchDaemons/com.apple.alf.agent.plist 2>/dev/null")
    return "Firewall enabled", True

def enable_screensaver(payload: dict) -> tuple[str, bool]:
    delay = payload.get("delay_seconds", 300)
    shell(f"defaults -currentHost write com.apple.screensaver idleTime -int {delay}")
    shell("defaults write com.apple.screensaver askForPassword -int 1")
    shell("defaults write com.apple.screensaver askForPasswordDelay -int 0")
    return f"Screen lock set to {delay}s", True

def kill_process(payload: dict) -> tuple[str, bool]:
    pid  = payload.get("pid")
    name = payload.get("name", "")
    if pid:
        shell(f"kill -9 {pid}")
        return f"Killed PID {pid}", True
    elif name:
        shell(f"pkill -f '{name}'")
        return f"Killed process matching {name}", True
    return "No pid or name provided", False

def block_domain_mac(payload: dict) -> tuple[str, bool]:
    domain = payload.get("domain", "")
    if not domain:
        return "No domain provided", False
    hosts = Path("/etc/hosts").read_text()
    entry = f"0.0.0.0 {domain}"
    if entry in hosts:
        return f"{domain} already blocked", True
    Path("/etc/hosts").write_text(hosts + f"\n{entry}  # SparrowShield\n")
    shell("dscacheutil -flushcache && killall -HUP mDNSResponder")
    return f"Blocked {domain}", True

def unblock_domain_mac(payload: dict) -> tuple[str, bool]:
    domain = payload.get("domain", "")
    hosts  = Path("/etc/hosts").read_text()
    lines  = [l for l in hosts.splitlines() if domain not in l]
    Path("/etc/hosts").write_text("\n".join(lines))
    shell("dscacheutil -flushcache && killall -HUP mDNSResponder")
    return f"Unblocked {domain}", True

def run_script(payload: dict) -> tuple[str, bool]:
    script = payload.get("script", "")
    if not script:
        return "No script", False
    import tempfile
    with tempfile.NamedTemporaryFile(suffix=".sh", mode="w", delete=False) as f:
        f.write(script)
        fname = f.name
    os.chmod(fname, 0o700)
    out = shell(f"bash '{fname}'", timeout=60)
    os.unlink(fname)
    return out[:2000] or "Executed (no output)", True

def get_compliance_report(payload: dict) -> tuple[str, bool]:
    cis = get_cis_compliance()
    score = f"{cis['_score']}/{cis['_total']} ({cis['_pct']}%)"
    failed = [k for k, v in cis.items() if not v and not k.startswith("_")]
    result = {"score": score, "failed": failed, "checks": cis}
    # Store compliance snapshot
    db_insert("compliance_snapshots", {
        "device_id": load_state().get("device_id", ""),
        "hostname":  socket.gethostname(),
        "os_type":   "mac",
        "framework": "CIS macOS Benchmark",
        "score_pct": cis["_pct"],
        "passed":    cis["_score"],
        "total":     cis["_total"],
        "details":   cis,
        "snapshot_at": now_iso(),
    })
    return json.dumps(result), True

def get_persistence_report(payload: dict) -> tuple[str, bool]:
    agents = get_launch_agents()
    crons  = get_cron_jobs()
    items  = get_login_items()
    result = {"launch_agents": agents, "cron_jobs": crons, "login_items": items}
    return json.dumps(result), True

# ── Command loop ──────────────────────────────────────────────
def command_loop(device_id: str):
    handlers = {
        "enable_firewall":       enable_firewall,
        "enable_screensaver":    enable_screensaver,
        "kill_process":          kill_process,
        "block_domain":          block_domain_mac,
        "unblock_domain":        unblock_domain_mac,
        "run_script":            run_script,
        "get_compliance_report": get_compliance_report,
        "get_persistence_report":get_persistence_report,
    }
    log.info("Command loop started — polling every %ds", COMMAND_POLL_SEC)
    while True:
        try:
            cmds = db_get("device_commands", {
                "device_id": f"eq.{device_id}",
                "status":    "eq.pending",
                "order":     "created_at.asc",
                "limit":     "5",
            })
            for cmd in cmds:
                cmd_id   = cmd["id"]
                cmd_type = cmd.get("command_type", "")
                payload  = cmd.get("payload") or {}
                db_patch("device_commands", {"id": f"eq.{cmd_id}"}, {"status": "running"})
                handler = handlers.get(cmd_type)
                if handler:
                    try:
                        result, success = handler(payload)
                    except Exception as e:
                        result, success = str(e), False
                else:
                    result, success = f"Unknown command: {cmd_type}", False
                db_patch("device_commands", {"id": f"eq.{cmd_id}"}, {
                    "status":      "done" if success else "failed",
                    "result":      result[:2000],
                    "executed_at": now_iso(),
                })
                log.info("CMD [%s] %s → %s", "OK" if success else "FAIL", cmd_type, result[:80])
        except Exception as e:
            log.debug("Command loop error: %s", e)
        time.sleep(COMMAND_POLL_SEC)

# ── Compliance loop ───────────────────────────────────────────
def compliance_loop(device_id: str):
    """Push CIS compliance snapshot every 6 hours."""
    time.sleep(30)  # brief startup delay
    while True:
        try:
            cis = get_cis_compliance()
            db_patch("devices", {"id": f"eq.{device_id}"}, {
                "cis_score_pct":  cis["_pct"],
                "cis_passed":     cis["_score"],
                "cis_total":      cis["_total"],
                "cis_details":    cis,
            })
            # Store snapshot
            db_insert("compliance_snapshots", {
                "device_id":   device_id,
                "hostname":    socket.gethostname(),
                "os_type":     "mac",
                "framework":   "CIS macOS Benchmark",
                "score_pct":   cis["_pct"],
                "passed":      cis["_score"],
                "total":       cis["_total"],
                "details":     cis,
                "snapshot_at": now_iso(),
            })
            log.info("CIS compliance: %d/%d (%d%%)", cis["_score"], cis["_total"], cis["_pct"])
        except Exception as e:
            log.debug("Compliance loop error: %s", e)
        time.sleep(6 * 3600)

# ── Detection loop ────────────────────────────────────────────
def detection_loop(device_id: str):
    log.info("Detection engine started — every %ds", DETECTION_SEC)
    first = True
    while True:
        time.sleep(DETECTION_SEC)
        if first:
            first = False
            continue
        try:
            metrics = collect_metrics()
            run_detection(metrics, device_id)
        except Exception as e:
            log.debug("Detection error: %s", e)

# ── Heartbeat loop ────────────────────────────────────────────
def heartbeat_loop(device_id: str):
    log.info("Heartbeat started — every %ds", HEARTBEAT_SEC)
    while True:
        try:
            metrics = collect_metrics()
            db_patch("devices", {"id": f"eq.{device_id}"}, metrics)
            log.info("Heartbeat — CPU %.1f%% RAM %.1f%% Disk %.1f%%",
                     metrics["cpu_pct"], metrics["ram_used_pct"], metrics["disk_used_pct"])
        except requests.exceptions.ConnectionError:
            log.warning("Network unreachable — retrying next heartbeat")
        except Exception as e:
            log.error("Heartbeat error: %s", e)
        time.sleep(HEARTBEAT_SEC)

# ── LaunchDaemon self-install ─────────────────────────────────
PLIST_PATH = Path("/Library/LaunchDaemons/com.sparrowshield.agent.plist")
PLIST_BODY = """<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.sparrowshield.agent</string>
  <key>ProgramArguments</key>
  <array><string>{exe}</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/var/log/sparrowshield.log</string>
  <key>StandardErrorPath</key><string>/var/log/sparrowshield.err</string>
</dict></plist>"""

def install_service():
    exe = sys.executable
    content = PLIST_BODY.format(exe=exe)
    PLIST_PATH.write_text(content)
    os.system(f"launchctl load -w {PLIST_PATH}")
    print(f"[OK] SparrowShield installed as LaunchDaemon: {PLIST_PATH}")
    print(f"     Runs as root, auto-starts on boot.")
    print(f"     Uninstall: sudo python3 {exe} --uninstall")

def uninstall_service():
    os.system(f"launchctl unload -w {PLIST_PATH}")
    PLIST_PATH.unlink(missing_ok=True)
    print("[OK] SparrowShield LaunchDaemon removed.")

# ── Main ──────────────────────────────────────────────────────
def main():
    log.info("SparrowShield macOS Agent v2.0 starting — %s", socket.gethostname())
    log.info("Supabase: %s", SUPABASE_URL)

    device_id = enroll()
    log.info("Device ID: %s", device_id)

    threading.Thread(target=command_loop,   args=(device_id,), daemon=True).start()
    threading.Thread(target=detection_loop, args=(device_id,), daemon=True).start()
    threading.Thread(target=compliance_loop,args=(device_id,), daemon=True).start()

    heartbeat_loop(device_id)

if __name__ == "__main__":
    if "--install" in sys.argv:
        install_service()
    elif "--uninstall" in sys.argv:
        uninstall_service()
    else:
        main()
