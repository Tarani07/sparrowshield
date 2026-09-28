#!/usr/bin/env python3
"""
SparrowShield Windows EDR Agent
Features: heartbeat, detection engine, UEBA, host isolation,
          DNS filtering, ransomware detection, privilege monitoring,
          patch management, remote script execution.

Edit the CONFIG section below, then install as a Windows Service or Task.
State is stored in C:\\ProgramData\\SparrowShield\\state.json automatically.
"""

# ──────────────────────────────────────────────────────────────────────────────
# CONFIG — edit before deploying
# ──────────────────────────────────────────────────────────────────────────────
SUPABASE_URL      = "https://hevcfhxmjgbpozqtescm.supabase.co"
ANON_KEY          = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhldmNmaHhtamdicG96cXRlc2NtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyMjk4NDYsImV4cCI6MjA4NjgwNTg0Nn0.CaXbG8F54bXV0_biNka7vp6Cl1s7vvQsRogNoz7jB28"
HEARTBEAT_SEC     = 60
DETECTION_SEC     = 60
COMMAND_POLL_SEC  = 15
# ──────────────────────────────────────────────────────────────────────────────

import json, logging, os, platform, re, socket, subprocess, sys
import threading, time, uuid
from datetime import datetime, timezone
from pathlib import Path

try:
    import psutil
except ImportError:
    subprocess.run([sys.executable, "-m", "pip", "install", "psutil", "-q"], check=False)
    import psutil

try:
    import requests
except ImportError:
    subprocess.run([sys.executable, "-m", "pip", "install", "requests", "-q"], check=False)
    import requests

# ── Constants ─────────────────────────────────────────────────────────────────
NW = subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
STATE_DIR  = Path(os.environ.get("ProgramData", "C:\\ProgramData")) / "SparrowShield"
STATE_FILE = STATE_DIR / "state.json"
LOG_FILE   = STATE_DIR / "agent.log"
HOSTS_FILE = Path("C:/Windows/System32/drivers/etc/hosts")
HOSTS_MARKER_START = "# SparrowShield-DNS-Block-Start"
HOSTS_MARKER_END   = "# SparrowShield-DNS-Block-End"

RANSOMWARE_EXTENSIONS = {
    ".encrypted", ".locked", ".crypto", ".crypted", ".enc", ".locky",
    ".cerber", ".zepto", ".thor", ".aaa", ".micro", ".xyz", ".zzz",
    ".crypt", ".block", ".wncry", ".wannacry", ".petya", ".jaff",
    ".globe", ".shade", ".osiris", ".lukitus", ".onion",
}

_MINERS    = {"xmrig","cpuminer","minerd","nbminer","cgminer","bfgminer","ethminer",
              "t-rex","lolminer","gminer","phoenixminer","teamredminer","nanominer","srbminer"}
_TUNNELS   = {"ngrok","frp","frpc","chisel","ligolo","rpivot","bore","rathole","cloudflared"}
_SHELLS    = {"powershell","cmd","wscript","cscript","mshta","regsvr32","rundll32"}
_BAD_PORTS = {4444, 1337, 31337, 4545, 6666, 7777, 12345, 54321, 9999, 5555}
_LOLBINS   = {"certutil","bitsadmin","msiexec","wmic","regsvr32","mshta","rundll32","installutil"}

_KNOWN_GOOD_DOMAINS = {
    "supabase.co", "supabase.io", "vercel.app", "microsoft.com",
    "windows.com", "windowsupdate.com", "google.com", "googleapis.com",
}

MALICIOUS_DOMAINS_BLOCKLIST = [
    "malware-traffic-analysis.net", "botnet.club", "cryptonight.net",
    "xmrig.com", "minexmr.com", "moneroocean.stream", "supportxmr.com",
    "c2.evil.com", "update.malware.com",
]

# ── Logging ───────────────────────────────────────────────────────────────────
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

# ── State ─────────────────────────────────────────────────────────────────────
def load_state() -> dict:
    if STATE_FILE.exists():
        try:
            return json.loads(STATE_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {}

def save_state(s: dict):
    STATE_FILE.write_text(json.dumps(s, indent=2), encoding="utf-8")

# ── Supabase REST ─────────────────────────────────────────────────────────────
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
        if not r.ok:
            log.debug("GET %s %s: %s", table, r.status_code, r.text[:200])
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

# ── Shell helper ──────────────────────────────────────────────────────────────
def shell(cmd: str | list, timeout: int = 10) -> str:
    try:
        if isinstance(cmd, str):
            r = subprocess.run(cmd, shell=True, capture_output=True, text=True,
                               timeout=timeout, creationflags=NW, encoding="utf-8", errors="ignore")
        else:
            r = subprocess.run(cmd, capture_output=True, text=True,
                               timeout=timeout, creationflags=NW, encoding="utf-8", errors="ignore")
        return r.stdout.strip()
    except Exception:
        return ""

def ps(cmd: str, timeout: int = 15) -> str:
    return shell(["powershell", "-NoProfile", "-NonInteractive", "-Command", cmd], timeout=timeout)

# ── Enrollment ────────────────────────────────────────────────────────────────
def enroll() -> str:
    state = load_state()
    if state.get("device_id"):
        log.info("Already enrolled: %s", state["device_id"])
        return state["device_id"]

    hostname  = socket.gethostname()
    serial    = shell("wmic bios get serialnumber /value").split("=")[-1].strip() or "unknown"
    cpu_model = shell("wmic cpu get Name /value").split("=")[-1].strip() or platform.processor()
    model     = shell("wmic computersystem get Model /value").split("=")[-1].strip()
    username  = os.environ.get("USERNAME", "unknown")
    os_ver    = platform.win32_ver()[1] or platform.release()
    ram_gb    = round(psutil.virtual_memory().total / 1e9, 1)

    # Check for existing device by serial
    if serial and serial != "unknown":
        existing = db_get("devices", {"serial_number": f"eq.{serial}", "select": "id"})
        if existing:
            device_id = existing[0]["id"]
            log.info("Device exists, reusing id: %s", device_id)
            save_state({"device_id": device_id})
            return device_id

    device_id = str(uuid.uuid4())
    result = db_upsert("devices", {
        "id":            device_id,
        "hostname":      hostname,
        "serial_number": serial,
        "model_name":    model or cpu_model,
        "cpu_model":     cpu_model,
        "assigned_user": username,
        "os_type":       "windows",
        "os_version":    os_ver,
        "ram_total_gb":  ram_gb,
        "status":        "online",
        "enrolled_at":   now_iso(),
        "last_seen":     now_iso(),
    })
    final_id = result.get("id", device_id) if result else device_id
    save_state({"device_id": final_id})
    log.info("Enrolled as %s (%s)", hostname, final_id)
    return final_id

# ── System collectors ─────────────────────────────────────────────────────────
def get_bitlocker() -> bool:
    out = shell("manage-bde -status C:", timeout=15)
    return "Protection On" in out or "Fully Encrypted" in out

def get_firewall() -> bool:
    out = ps("(Get-NetFirewallProfile | Where Enabled -eq True | Measure-Object).Count")
    try:
        return int(out.strip()) > 0
    except Exception:
        return False

def get_defender() -> dict:
    out = ps("Get-MpComputerStatus | Select-Object AMRunningMode,RealTimeProtectionEnabled,"
             "AntivirusSignatureLastUpdated,QuickScanAge | ConvertTo-Json", timeout=20)
    try:
        d = json.loads(out)
        return {
            "defender_enabled":      bool(d.get("RealTimeProtectionEnabled")),
            "defender_mode":         d.get("AMRunningMode", ""),
            "defender_sig_age_days": d.get("QuickScanAge"),
        }
    except Exception:
        return {"defender_enabled": None, "defender_mode": None, "defender_sig_age_days": None}

def get_uac_status() -> bool:
    out = shell('reg query "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System" /v EnableLUA')
    return "0x1" in out

def get_autologon() -> bool:
    out = shell('reg query "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon" /v AutoAdminLogon')
    return "1" in out

def get_rdp_enabled() -> bool:
    out = shell('reg query "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Terminal Server" /v fDenyTSConnections')
    return "0x0" in out

def get_guest_enabled() -> bool:
    out = shell("net user guest")
    return "Account active" in out and "Yes" in out.split("Account active")[-1].split("\n")[0]

def get_admin_users() -> list[str]:
    out = ps("Get-LocalGroupMember -Group Administrators | Select-Object -ExpandProperty Name")
    return [l.strip() for l in out.splitlines() if l.strip()]

def get_top_processes(limit: int = 20) -> list:
    procs = []
    for p in psutil.process_iter(["name", "pid", "cpu_percent", "memory_percent"]):
        try:
            procs.append({
                "name": p.info["name"],
                "pid":  p.info["pid"],
                "cpu":  round(p.info.get("cpu_percent") or 0, 1),
                "mem":  round(p.info.get("memory_percent") or 0, 1),
            })
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            pass
    return sorted(procs, key=lambda x: x["cpu"], reverse=True)[:limit]

def get_listening_ports() -> list:
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
    except Exception:
        pass
    return ports

def get_installed_apps() -> list:
    out = ps(
        "Get-ItemProperty HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*,"
        "HKLM:\\Software\\Wow6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*"
        " | Select-Object DisplayName,DisplayVersion | ConvertTo-Json", timeout=30
    )
    try:
        items = json.loads(out)
        if isinstance(items, dict):
            items = [items]
        return [{"name": i.get("DisplayName",""), "version": i.get("DisplayVersion","")}
                for i in items if i.get("DisplayName")][:300]
    except Exception:
        return []

def get_pending_updates() -> list:
    out = ps(
        "(New-Object -ComObject Microsoft.Update.Session).CreateUpdateSearcher()"
        ".Search('IsInstalled=0 and IsHidden=0').Updates | "
        "ForEach-Object { $_.Title }", timeout=60
    )
    return [l.strip() for l in out.splitlines() if l.strip()][:50]

def get_storage_volumes() -> list:
    vols = []
    for part in psutil.disk_partitions():
        if "cdrom" in part.opts.lower():
            continue
        try:
            usage = psutil.disk_usage(part.mountpoint)
            vols.append({
                "mountpoint": part.mountpoint,
                "total_gb":   round(usage.total / 1e9, 1),
                "used_pct":   round(usage.percent, 1),
                "fstype":     part.fstype,
            })
        except Exception:
            pass
    return vols

# ── UEBA — Windows Event Log parsing ─────────────────────────────────────────
def parse_event_log(log_name: str, event_id: int, hours: int = 1, max_records: int = 50) -> list[dict]:
    """Query Windows event log via wevtutil and return parsed events."""
    try:
        since = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")
        cmd = (
            f'wevtutil qe {log_name} /q:"*[System[EventID={event_id} and '
            f'TimeCreated[@SystemTime>=\'{since}\']]]" /f:text /c:{max_records} /rd:true'
        )
        out = shell(cmd, timeout=15)
        events = []
        current = {}
        for line in out.splitlines():
            line = line.strip()
            if line.startswith("Event["):
                if current:
                    events.append(current)
                current = {"raw": line}
            elif ":" in line:
                k, _, v = line.partition(":")
                current[k.strip()] = v.strip()
        if current:
            events.append(current)
        return events
    except Exception:
        return []

def get_failed_logins(hours: int = 1) -> int:
    """Count failed login attempts (Event 4625) in the last N hours."""
    try:
        out = ps(
            f"(Get-WinEvent -FilterHashtable @{{LogName='Security';Id=4625;"
            f"StartTime=(Get-Date).AddHours(-{hours})}} -ErrorAction SilentlyContinue | "
            f"Measure-Object).Count"
        )
        return int(out.strip() or "0")
    except Exception:
        return 0

def get_new_admin_events(hours: int = 1) -> list[str]:
    """Detect new user added to Administrators group (Event 4732)."""
    try:
        out = ps(
            f"Get-WinEvent -FilterHashtable @{{LogName='Security';Id=4732;"
            f"StartTime=(Get-Date).AddHours(-{hours})}} -ErrorAction SilentlyContinue | "
            f"Select-Object -ExpandProperty Message"
        )
        return [l.strip() for l in out.splitlines() if "Administrators" in l][:10]
    except Exception:
        return []

def get_privilege_use_events(hours: int = 1) -> int:
    """Count special privilege logon events (Event 4672) in the last N hours."""
    try:
        out = ps(
            f"(Get-WinEvent -FilterHashtable @{{LogName='Security';Id=4672;"
            f"StartTime=(Get-Date).AddHours(-{hours})}} -ErrorAction SilentlyContinue | "
            f"Measure-Object).Count"
        )
        return int(out.strip() or "0")
    except Exception:
        return 0

def get_logon_hours_violations() -> bool:
    """Check if any logins happened outside 6am–10pm (Event 4624)."""
    hour = datetime.now().hour
    return hour < 6 or hour > 22

def get_lateral_movement_events(hours: int = 1) -> int:
    """Detect explicit credential use (Event 4648 — possible lateral movement)."""
    try:
        out = ps(
            f"(Get-WinEvent -FilterHashtable @{{LogName='Security';Id=4648;"
            f"StartTime=(Get-Date).AddHours(-{hours})}} -ErrorAction SilentlyContinue | "
            f"Measure-Object).Count"
        )
        return int(out.strip() or "0")
    except Exception:
        return 0

def get_account_lockouts(hours: int = 1) -> int:
    """Count account lockout events (Event 4740)."""
    try:
        out = ps(
            f"(Get-WinEvent -FilterHashtable @{{LogName='Security';Id=4740;"
            f"StartTime=(Get-Date).AddHours(-{hours})}} -ErrorAction SilentlyContinue | "
            f"Measure-Object).Count"
        )
        return int(out.strip() or "0")
    except Exception:
        return 0

# ── Ransomware detection ──────────────────────────────────────────────────────
def get_suspicious_file_activity() -> dict:
    """Detect ransomware-like file activity patterns."""
    try:
        # Check for mass file modifications in user folders (last 60 seconds)
        out = ps(
            "Get-ChildItem -Path $env:USERPROFILE -Recurse -ErrorAction SilentlyContinue "
            "| Where-Object { $_.LastWriteTime -gt (Get-Date).AddSeconds(-60) } "
            "| Measure-Object | Select-Object -ExpandProperty Count"
        )
        recent_writes = int(out.strip() or "0")

        # Check for ransomware extensions in user folder
        ext_out = ps(
            "Get-ChildItem -Path $env:USERPROFILE -Recurse -ErrorAction SilentlyContinue "
            "| Select-Object -ExpandProperty Extension | Sort-Object -Unique"
        )
        found_extensions = [
            e.lower() for e in ext_out.splitlines()
            if e.strip().lower() in RANSOMWARE_EXTENSIONS
        ]

        # Check for VSS (shadow copy) deletion — common ransomware step
        vss_out = ps(
            "(Get-WinEvent -FilterHashtable @{LogName='System';Id=8193;"
            "StartTime=(Get-Date).AddMinutes(-10)} -ErrorAction SilentlyContinue | "
            "Measure-Object).Count"
        )
        vss_deleted = int(vss_out.strip() or "0") > 0

        # Check if vssadmin ran recently
        vssadmin_out = ps(
            "Get-WinEvent -FilterHashtable @{LogName='Security';Id=4688;"
            "StartTime=(Get-Date).AddMinutes(-10)} -ErrorAction SilentlyContinue "
            "| Where-Object { $_.Message -like '*vssadmin*delete*' } | Measure-Object | "
            "Select-Object -ExpandProperty Count"
        )
        vssadmin_ran = int(vssadmin_out.strip() or "0") > 0

        return {
            "recent_file_writes":    recent_writes,
            "ransomware_extensions": found_extensions,
            "vss_deleted":           vss_deleted or vssadmin_ran,
            "mass_encryption_risk":  recent_writes > 100 and bool(found_extensions),
        }
    except Exception:
        return {"recent_file_writes": 0, "ransomware_extensions": [], "vss_deleted": False, "mass_encryption_risk": False}

# ── Collect full metrics snapshot ─────────────────────────────────────────────
def collect_metrics() -> dict:
    cpu   = psutil.cpu_percent(interval=2)
    vm    = psutil.virtual_memory()
    disk  = psutil.disk_usage("C:\\")
    boot  = psutil.boot_time()
    defender = get_defender()

    return {
        "status":                "online",
        "last_seen":             now_iso(),
        "os_type":               "windows",
        "os_version":            platform.win32_ver()[1] or platform.release(),
        "assigned_user":         os.environ.get("USERNAME", ""),
        "cpu_pct":               round(cpu, 1),
        "ram_total_gb":          round(vm.total / 1e9, 1),
        "ram_used_pct":          round(vm.percent, 1),
        "disk_used_pct":         round(disk.percent, 1),
        "uptime_seconds":        int(time.time() - boot),
        # Security posture
        "firewall_enabled":      get_firewall(),
        "bitlocker_enabled":     get_bitlocker(),
        "uac_enabled":           get_uac_status(),
        "rdp_enabled":           get_rdp_enabled(),
        "guest_enabled":         get_guest_enabled(),
        "autologon_enabled":     get_autologon(),
        **defender,
        # Process & network
        "top_processes":         get_top_processes(),
        "listening_ports":       get_listening_ports(),
        "open_connections_count": len(psutil.net_connections()),
        # Storage
        "storage_volumes":       get_storage_volumes(),
        "pending_update_count":  0,  # filled separately to avoid slowing heartbeat
    }

# ── Alert helpers ─────────────────────────────────────────────────────────────
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

# ── Detection engine ──────────────────────────────────────────────────────────
def run_detection(metrics: dict, device_id: str):
    procs      = {p["name"].lower() for p in metrics.get("top_processes", [])}
    ports      = {p["port"] for p in metrics.get("listening_ports", [])}
    port_procs = {p["port"]: p["process"].lower() for p in metrics.get("listening_ports", [])}

    # ── 1. Security posture ───────────────────────────────────────────────────
    rules = [
        (not metrics.get("firewall_enabled"),
         "firewall_disabled", "firewall_disabled", "warning",
         "Windows Firewall is disabled — all profiles are off", "T1562.004"),

        (not metrics.get("bitlocker_enabled"),
         "bitlocker_disabled", "bitlocker_disabled", "critical",
         "BitLocker encryption is OFF — data at risk if device is stolen", "T1486"),

        (not metrics.get("uac_enabled"),
         "uac_disabled", "uac_disabled", "critical",
         "UAC (User Account Control) is disabled — privilege escalation unrestricted", "T1548.002"),

        (metrics.get("guest_enabled"),
         "guest_account_enabled", "guest_account_enabled", "high",
         "Guest account is enabled — unauthorized local access possible", "T1078.003"),

        (metrics.get("autologon_enabled"),
         "autologon_enabled", "autologon_enabled", "high",
         "Auto-logon is configured — credentials stored in registry plaintext", "T1552.002"),

        (metrics.get("defender_enabled") is False,
         "defender_disabled", "defender_disabled", "critical",
         "Windows Defender real-time protection is OFF", "T1562.001"),

        (metrics.get("rdp_enabled"),
         "rdp_exposed", "rdp_exposed", "warning",
         "Remote Desktop (RDP) is enabled — ensure it is access-controlled", "T1021.001"),
    ]

    # ── 2. Process IOC ────────────────────────────────────────────────────────
    miners_found = procs & _MINERS
    if miners_found:
        rules.append((True, "crypto_miner_process", "crypto_miner_process", "critical",
                      f"Crypto miner running: {', '.join(miners_found)}", "T1496"))
    else:
        resolve_alert(device_id, "crypto_miner_process")

    tunnels_found = procs & _TUNNELS
    if tunnels_found:
        rules.append((True, "tunneling_tool_detected", "tunneling_tool_detected", "critical",
                      f"Tunneling tool running: {', '.join(tunnels_found)}", "T1572"))
    else:
        resolve_alert(device_id, "tunneling_tool_detected")

    lolbins_on_net = {p for p in procs if p in _LOLBINS}
    if lolbins_on_net:
        rules.append((True, "lolbin_network_activity", "lolbin_network_activity", "high",
                      f"LOLBin process active: {', '.join(lolbins_on_net)}", "T1218"))
    else:
        resolve_alert(device_id, "lolbin_network_activity")

    # ── 3. Network ────────────────────────────────────────────────────────────
    bad_ports = ports & _BAD_PORTS
    if bad_ports:
        rules.append((True, "suspicious_port", "suspicious_port", "high",
                      f"Backdoor port(s) open: {', '.join(str(p) for p in bad_ports)}", "T1049"))
    else:
        resolve_alert(device_id, "suspicious_port")

    shell_on_port = any(port_procs.get(p, "") in _SHELLS for p in ports)
    if shell_on_port:
        rules.append((True, "shell_on_port", "shell_on_port", "critical",
                      "Shell interpreter is bound to a network port", "T1059"))
    else:
        resolve_alert(device_id, "shell_on_port")

    # High CPU (non-system)
    _sys_procs = {"system","idle","svchost.exe","lsass.exe","services.exe","csrss.exe","wininit.exe"}
    high_cpu = any(p["cpu"] > 80 and p["name"].lower() not in _sys_procs
                   for p in metrics.get("top_processes", []))
    rules.append((high_cpu, "high_cpu_non_system", "high_cpu_non_system", "warning",
                  "Non-system process consuming >80% CPU — possible miner or abuse", "T1496"))

    # ── 4. UEBA ───────────────────────────────────────────────────────────────
    failed_logins = get_failed_logins(hours=1)
    rules.append((failed_logins >= 10,
                  "brute_force_detected", "brute_force_detected", "critical",
                  f"{failed_logins} failed login attempts in the last hour", "T1110"))

    lockouts = get_account_lockouts(hours=1)
    rules.append((lockouts > 0,
                  "account_lockout", "account_lockout", "high",
                  f"{lockouts} account lockout(s) detected", "T1110.003"))

    lateral = get_lateral_movement_events(hours=1)
    rules.append((lateral > 20,
                  "lateral_movement_risk", "lateral_movement_risk", "high",
                  f"{lateral} explicit-credential logon events (4648) — possible lateral movement",
                  "T1550.003"))

    new_admins = get_new_admin_events(hours=1)
    rules.append((bool(new_admins),
                  "new_admin_added", "new_admin_added", "critical",
                  f"New user added to Administrators group: {new_admins[:2]}", "T1136.001"))

    off_hours = get_logon_hours_violations()
    rules.append((off_hours and failed_logins > 0,
                  "off_hours_login", "off_hours_login", "warning",
                  "Login activity detected outside business hours (before 6am or after 10pm)",
                  "T1078"))

    # ── 5. Ransomware ─────────────────────────────────────────────────────────
    ra = get_suspicious_file_activity()
    rules.append((ra.get("mass_encryption_risk"),
                  "ransomware_activity", "ransomware_activity", "critical",
                  f"Possible ransomware: {ra['recent_file_writes']} file writes + suspicious extensions "
                  f"{ra['ransomware_extensions'][:3]}", "T1486"))
    rules.append((ra.get("vss_deleted"),
                  "vss_deletion", "vss_deletion", "critical",
                  "Shadow copy deletion detected — common ransomware pre-encryption step", "T1490"))

    # ── Apply all rules ───────────────────────────────────────────────────────
    for condition, rule_id, alert_type, severity, message, mitre in rules:
        if condition:
            post_alert(device_id, rule_id, alert_type, severity, message, mitre)
        else:
            resolve_alert(device_id, rule_id)

# ── Host Isolation ────────────────────────────────────────────────────────────
def _resolve_supabase_ips() -> list[str]:
    try:
        host = SUPABASE_URL.replace("https://", "").replace("http://", "").split("/")[0]
        infos = socket.getaddrinfo(host, 443)
        return list({i[4][0] for i in infos})
    except Exception:
        return []

def isolate_host(device_id: str) -> tuple[bool, str]:
    """Block all network traffic except Supabase (keeps agent alive)."""
    try:
        supabase_ips = _resolve_supabase_ips()
        # Block all inbound and outbound
        shell("netsh advfirewall set allprofiles firewallpolicy blockinbound,blockoutbound")
        # Remove previous SparrowShield allow rules
        shell('netsh advfirewall firewall delete rule name="SparrowShield-Allow-Out"')
        shell('netsh advfirewall firewall delete rule name="SparrowShield-Allow-In"')
        # Add Supabase exception so agent stays connected
        for ip in supabase_ips:
            shell(f'netsh advfirewall firewall add rule name="SparrowShield-Allow-Out" '
                  f'dir=out action=allow remoteip={ip} protocol=TCP remoteport=443')
            shell(f'netsh advfirewall firewall add rule name="SparrowShield-Allow-In" '
                  f'dir=in action=allow remoteip={ip} protocol=TCP')
        # Allow loopback
        shell('netsh advfirewall firewall add rule name="SparrowShield-Allow-Loopback" '
              'dir=out action=allow remoteip=127.0.0.1')
        # Update state
        db_patch("devices", {"id": f"eq.{device_id}"}, {"isolated": True, "status": "isolated"})
        msg = f"Host isolated. Supabase IPs allowlisted: {supabase_ips}"
        log.warning("HOST ISOLATED: %s", msg)
        return True, msg
    except Exception as e:
        return False, f"Isolation failed: {e}"

def unisolate_host(device_id: str) -> tuple[bool, str]:
    """Restore normal network access."""
    try:
        shell('netsh advfirewall firewall delete rule name="SparrowShield-Allow-Out"')
        shell('netsh advfirewall firewall delete rule name="SparrowShield-Allow-In"')
        shell('netsh advfirewall firewall delete rule name="SparrowShield-Allow-Loopback"')
        shell("netsh advfirewall set allprofiles firewallpolicy blockinbound,allowoutbound")
        db_patch("devices", {"id": f"eq.{device_id}"}, {"isolated": False, "status": "online"})
        log.info("Host isolation lifted")
        return True, "Host unisolated — normal network access restored"
    except Exception as e:
        return False, f"Unisolate failed: {e}"

# ── DNS Filtering ─────────────────────────────────────────────────────────────
def _read_hosts() -> str:
    try:
        return HOSTS_FILE.read_text(encoding="utf-8")
    except Exception:
        return ""

def _write_hosts(content: str):
    try:
        HOSTS_FILE.write_text(content, encoding="utf-8")
        shell("ipconfig /flushdns")
    except PermissionError:
        log.error("DNS filter: need admin rights to write hosts file")

def apply_dns_blocklist(domains: list[str] | None = None) -> tuple[bool, str]:
    """Block malicious domains via Windows hosts file."""
    domains = domains or MALICIOUS_DOMAINS_BLOCKLIST
    hosts = _read_hosts()
    # Remove old block
    if HOSTS_MARKER_START in hosts:
        start = hosts.index(HOSTS_MARKER_START)
        end   = hosts.index(HOSTS_MARKER_END) + len(HOSTS_MARKER_END)
        hosts = hosts[:start].rstrip() + "\n" + hosts[end:].lstrip()
    block = f"\n{HOSTS_MARKER_START}\n"
    for d in domains:
        block += f"0.0.0.0 {d}\n0.0.0.0 www.{d}\n"
    block += f"{HOSTS_MARKER_END}\n"
    _write_hosts(hosts + block)
    log.info("DNS blocklist applied: %d domains blocked", len(domains))
    return True, f"Blocked {len(domains)} malicious domains"

def remove_dns_blocklist() -> tuple[bool, str]:
    """Remove SparrowShield DNS blocks."""
    hosts = _read_hosts()
    if HOSTS_MARKER_START not in hosts:
        return True, "No DNS blocklist found"
    start = hosts.index(HOSTS_MARKER_START)
    end   = hosts.index(HOSTS_MARKER_END) + len(HOSTS_MARKER_END)
    _write_hosts(hosts[:start].rstrip() + "\n" + hosts[end:].lstrip())
    shell("ipconfig /flushdns")
    log.info("DNS blocklist removed")
    return True, "DNS blocklist removed"

def block_domain(domain: str) -> tuple[bool, str]:
    """Block a single domain."""
    hosts = _read_hosts()
    entry = f"0.0.0.0 {domain}"
    if entry in hosts:
        return True, f"{domain} already blocked"
    _write_hosts(hosts + f"\n{entry}  # SparrowShield\n")
    return True, f"Blocked {domain}"

def unblock_domain(domain: str) -> tuple[bool, str]:
    """Unblock a single domain."""
    hosts = _read_hosts()
    lines = [l for l in hosts.splitlines() if domain not in l]
    _write_hosts("\n".join(lines))
    return True, f"Unblocked {domain}"

# ── Patch management ──────────────────────────────────────────────────────────
def patch_app(payload: dict) -> tuple[str, bool]:
    app_id = payload.get("app_id") or payload.get("app_name", "")
    if not app_id:
        return "No app_id provided", False
    out = shell(["winget", "upgrade", "--id", app_id, "--silent",
                 "--accept-package-agreements", "--accept-source-agreements"], timeout=300)
    ok = "successfully" in out.lower() or out == ""
    return (f"Updated {app_id}: {out[:200]}", ok)

def patch_all(payload: dict) -> tuple[str, bool]:
    results = []
    out = shell(["winget", "upgrade", "--all", "--silent",
                 "--accept-package-agreements", "--accept-source-agreements"], timeout=600)
    results.append(f"winget: {'OK' if out else 'done'}")
    wu = ps("Install-Module PSWindowsUpdate -Force -Confirm:$false -ErrorAction SilentlyContinue; "
            "Get-WindowsUpdate -AcceptAll -Install -AutoReboot:$false | Select-Object -ExpandProperty Title",
            timeout=600)
    results.append(f"windows_update: {wu[:100] or 'checked'}")
    return " | ".join(results), True

# ── Remote script execution ───────────────────────────────────────────────────
def run_script(payload: dict) -> tuple[str, bool]:
    script = payload.get("script", "")
    if not script:
        return "No script provided", False
    try:
        import tempfile
        with tempfile.NamedTemporaryFile(suffix=".ps1", mode="w", delete=False, encoding="utf-8") as f:
            f.write(script)
            fname = f.name
        out = ps(f"& '{fname}'", timeout=120)
        os.unlink(fname)
        return out[:2000] or "Script executed (no output)", True
    except Exception as e:
        return f"Script error: {e}", False

# ── Scan on demand ────────────────────────────────────────────────────────────
def run_defender_scan(payload: dict) -> tuple[str, bool]:
    scan_type = payload.get("type", "quick")
    flag = "-QuickScan" if scan_type == "quick" else "-FullScan"
    out = ps(f"Start-MpScan {flag}", timeout=30)
    return f"Defender {scan_type} scan started: {out[:200]}", True

# ── Command dispatcher ────────────────────────────────────────────────────────
COMMAND_HANDLERS: dict = {}
# Registered below after device_id is known at runtime

# ── Command loop ──────────────────────────────────────────────────────────────
def command_loop(device_id: str):
    handlers = {
        "isolate":            lambda p: isolate_host(device_id),
        "unisolate":          lambda p: unisolate_host(device_id),
        "apply_dns_blocklist":lambda p: apply_dns_blocklist(p.get("domains")),
        "remove_dns_blocklist":lambda p: remove_dns_blocklist(),
        "block_domain":       lambda p: block_domain(p.get("domain", "")),
        "unblock_domain":     lambda p: unblock_domain(p.get("domain", "")),
        "patch_app":          patch_app,
        "patch_all":          patch_all,
        "run_script":         run_script,
        "defender_scan":      run_defender_scan,
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

# ── Detection loop ─────────────────────────────────────────────────────────────
def detection_loop(device_id: str):
    log.info("Detection engine started — running every %ds", DETECTION_SEC)
    first = True
    while True:
        time.sleep(DETECTION_SEC)
        if first:
            first = False
            continue  # skip first tick — cpu_percent needs a baseline
        try:
            metrics = collect_metrics()
            run_detection(metrics, device_id)
        except Exception as e:
            log.debug("Detection error: %s", e)

# ── Heartbeat loop ────────────────────────────────────────────────────────────
def heartbeat_loop(device_id: str):
    log.info("Heartbeat started — every %ds", HEARTBEAT_SEC)
    while True:
        try:
            metrics = collect_metrics()
            db_patch("devices", {"id": f"eq.{device_id}"}, metrics)
            log.info("Heartbeat — CPU %.1f%% RAM %.1f%% Disk %.1f%%",
                     metrics["cpu_pct"], metrics["ram_used_pct"], metrics["disk_used_pct"])
        except requests.exceptions.ConnectionError:
            log.warning("Network unreachable — will retry next heartbeat")
        except Exception as e:
            log.error("Heartbeat error: %s", e)
        time.sleep(HEARTBEAT_SEC)

# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    log.info("SparrowShield Windows Agent starting — %s", socket.gethostname())
    log.info("Supabase: %s", SUPABASE_URL)

    device_id = enroll()
    log.info("Device ID: %s", device_id)

    # Apply DNS blocklist on startup (requires admin)
    try:
        apply_dns_blocklist()
    except Exception:
        log.debug("DNS blocklist skipped (may need admin rights)")

    # Start background threads
    threading.Thread(target=command_loop,   args=(device_id,), daemon=True).start()
    threading.Thread(target=detection_loop, args=(device_id,), daemon=True).start()

    # Heartbeat runs in main thread
    heartbeat_loop(device_id)

if __name__ == "__main__":
    main()
