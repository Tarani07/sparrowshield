#!/usr/bin/env python3
"""
SparrowShield Windows Agent v2.0 — Heimdal-level EDR
Capabilities: heartbeat, detection engine, UEBA, host isolation,
              DNS threat filtering (DarkLayer Guard equivalent),
              vulnerability assessment (CVE-aware), application control,
              WMI persistence detection, registry monitoring,
              privilege access management, ransomware protection,
              patch management, remote command execution.

Edit CONFIG below, then install as SYSTEM-level Task Scheduler task.
State: C:\\ProgramData\\SparrowShield\\state.json
"""

# ──────────────────────────────────────────────────────────────
# CONFIG — edit before deploying
# ──────────────────────────────────────────────────────────────
SUPABASE_URL     = "https://hevcfhxmjgbpozqtescm.supabase.co"
ANON_KEY         = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhldmNmaHhtamdicG96cXRlc2NtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyMjk4NDYsImV4cCI6MjA4NjgwNTg0Nn0.CaXbG8F54bXV0_biNka7vp6Cl1s7vvQsRogNoz7jB28"
HEARTBEAT_SEC    = 60
DETECTION_SEC    = 60
COMMAND_POLL_SEC = 15
VULN_SCAN_HRS    = 6     # How often to run vulnerability assessment
# ──────────────────────────────────────────────────────────────

import json, logging, os, platform, re, socket, sqlite3
import subprocess, sys, threading, time, uuid, winreg
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

# ── Constants ─────────────────────────────────────────────────
NW         = subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
STATE_DIR  = Path(os.environ.get("ProgramData", "C:\\ProgramData")) / "SparrowShield"
STATE_FILE = STATE_DIR / "state.json"
LOG_FILE   = STATE_DIR / "agent.log"
HOSTS_FILE = Path("C:/Windows/System32/drivers/etc/hosts")
HOSTS_START = "# SparrowShield-DNS-Block-Start"
HOSTS_END   = "# SparrowShield-DNS-Block-End"

RANSOMWARE_EXTENSIONS = {
    ".encrypted",".locked",".crypto",".crypted",".enc",".locky",
    ".cerber",".zepto",".thor",".aaa",".micro",".xyz",".zzz",
    ".crypt",".block",".wncry",".wannacry",".petya",".jaff",
    ".globe",".shade",".osiris",".lukitus",".onion",".qewe",".stop",
}

_MINERS  = {"xmrig","cpuminer","minerd","nbminer","cgminer","bfgminer","ethminer",
            "t-rex","lolminer","gminer","phoenixminer","teamredminer","nanominer","srbminer"}
_TUNNELS = {"ngrok","frp","frpc","chisel","ligolo","rpivot","bore","rathole","cloudflared"}
_SHELLS  = {"powershell","cmd","wscript","cscript","mshta","regsvr32","rundll32"}
_BAD_PORTS = {4444,1337,31337,4545,6666,7777,12345,54321,9999,5555}

# Living-off-the-land binaries (LOLBins) — Heimdal signature detection
_LOLBINS = {
    "certutil","bitsadmin","msiexec","wmic","regsvr32","mshta","rundll32",
    "installutil","cmstp","ieexec","msbuild","csc","vbc","jsc",
    "appsyncpublishingserver","aspnet_compiler","bash","desktopimgdownldr",
    "dfsvc","eudcedit","expand","extrac32","findstr","forfiles",
    "ftp","gpscript","hh","infdefaultinstall","makecab","mavinject",
    "microsoft.workflow.compiler","msdeploy","msdt","mshtml",
    "msiexec","msohtmed","mspub","pcalua","pcwrun","presentationhost",
    "print","regasm","regsvcs","replace","rpcping","runscripthelper",
    "scriptrunner","syncappvpublishingserver","ttdinject","tttracer",
    "update","vsiisexelauncher","wab","winrm","wsl","xwizard",
}

# ── Logging ───────────────────────────────────────────────────
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

# ── State ─────────────────────────────────────────────────────
def load_state() -> dict:
    if STATE_FILE.exists():
        try:
            return json.loads(STATE_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {}

def save_state(s: dict):
    STATE_FILE.write_text(json.dumps(s, indent=2), encoding="utf-8")

# ── Supabase REST ─────────────────────────────────────────────
REST = f"{SUPABASE_URL}/rest/v1"
_H = {
    "apikey": ANON_KEY,
    "Authorization": f"Bearer {ANON_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation",
}

def db_get(table: str, params: dict) -> list:
    try:
        r = requests.get(f"{REST}/{table}", headers=_H, params=params, timeout=10)
        return r.json() if r.ok else []
    except Exception as e:
        log.debug("db_get: %s", e)
        return []

def db_upsert(table: str, data: dict) -> dict | None:
    try:
        h = {**_H, "Prefer": "resolution=merge-duplicates,return=representation"}
        r = requests.post(f"{REST}/{table}", headers=h, json=data, timeout=10)
        if not r.ok:
            log.error("UPSERT %s %s: %s", table, r.status_code, r.text[:300])
            return None
        rows = r.json()
        return rows[0] if rows else None
    except Exception as e:
        log.error("db_upsert: %s", e)
        return None

def db_patch(table: str, params: dict, data: dict):
    try:
        r = requests.patch(f"{REST}/{table}", headers=_H, params=params, json=data, timeout=10)
        if not r.ok:
            log.error("PATCH %s %s: %s", table, r.status_code, r.text[:200])
    except Exception as e:
        log.debug("db_patch: %s", e)

def db_insert(table: str, data: dict) -> dict | None:
    try:
        r = requests.post(f"{REST}/{table}", headers=_H, json=data, timeout=10)
        if not r.ok:
            log.debug("INSERT %s %s: %s", table, r.status_code, r.text[:200])
            return None
        rows = r.json()
        return rows[0] if isinstance(rows, list) and rows else None
    except Exception as e:
        log.debug("db_insert: %s", e)
        return None

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

# ── Shell helpers ─────────────────────────────────────────────
def shell(cmd, timeout: int = 10) -> str:
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

def ps(cmd: str, timeout: int = 20) -> str:
    return shell(["powershell", "-NoProfile", "-NonInteractive", "-Command", cmd], timeout=timeout)

def reg_read(hive, path: str, name: str) -> str:
    try:
        key = winreg.OpenKey(hive, path)
        value, _ = winreg.QueryValueEx(key, name)
        winreg.CloseKey(key)
        return str(value)
    except Exception:
        return ""

# ── Enrollment ────────────────────────────────────────────────
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

    if serial and serial != "unknown":
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

# ── Security posture collectors ───────────────────────────────
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
             "AntivirusSignatureLastUpdated,QuickScanAge,TamperProtectionSource | ConvertTo-Json", timeout=20)
    try:
        d = json.loads(out)
        return {
            "defender_enabled":           bool(d.get("RealTimeProtectionEnabled")),
            "defender_mode":              d.get("AMRunningMode", ""),
            "defender_sig_age_days":      d.get("QuickScanAge"),
            "defender_tamper_protection": bool(d.get("TamperProtectionSource")),
        }
    except Exception:
        return {"defender_enabled": None, "defender_mode": None,
                "defender_sig_age_days": None, "defender_tamper_protection": None}

def get_uac_status() -> bool:
    return "0x1" in reg_read(
        winreg.HKEY_LOCAL_MACHINE,
        r"SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System",
        "EnableLUA"
    )

def get_autologon() -> bool:
    return "1" in reg_read(
        winreg.HKEY_LOCAL_MACHINE,
        r"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon",
        "AutoAdminLogon"
    )

def get_rdp_enabled() -> bool:
    return "0x0" in shell(
        'reg query "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Terminal Server" /v fDenyTSConnections'
    )

def get_guest_enabled() -> bool:
    out = shell("net user guest")
    return "Account active" in out and "Yes" in out.split("Account active")[-1].split("\n")[0]

def get_admin_users() -> list[str]:
    out = ps("Get-LocalGroupMember -Group Administrators | Select-Object -ExpandProperty Name")
    return [l.strip() for l in out.splitlines() if l.strip()]

def get_smb_signing() -> bool:
    out = ps("(Get-SmbServerConfiguration).RequireSecuritySignature")
    return out.strip().lower() == "true"

def get_llmnr_disabled() -> bool:
    val = reg_read(
        winreg.HKEY_LOCAL_MACHINE,
        r"SOFTWARE\Policies\Microsoft\Windows NT\DNSClient",
        "EnableMulticast"
    )
    return val == "0"

def get_applocker_enabled() -> bool:
    out = ps("(Get-AppLockerPolicy -Effective -ErrorAction SilentlyContinue).RuleCollections | Measure-Object | Select-Object -ExpandProperty Count")
    try:
        return int(out.strip()) > 0
    except Exception:
        return False

def get_laps_installed() -> bool:
    out = ps("Get-Command Get-AdmPwdPassword -ErrorAction SilentlyContinue | Measure-Object | Select-Object -ExpandProperty Count")
    try:
        return int(out.strip()) > 0
    except Exception:
        return False

def get_powershell_logging() -> dict:
    script_block = reg_read(
        winreg.HKEY_LOCAL_MACHINE,
        r"SOFTWARE\Policies\Microsoft\Windows\PowerShell\ScriptBlockLogging",
        "EnableScriptBlockLogging"
    )
    module_logging = reg_read(
        winreg.HKEY_LOCAL_MACHINE,
        r"SOFTWARE\Policies\Microsoft\Windows\PowerShell\ModuleLogging",
        "EnableModuleLogging"
    )
    return {
        "script_block_logging": script_block == "1",
        "module_logging":       module_logging == "1",
    }

def get_credential_guard() -> bool:
    out = ps("(Get-ComputerInfo -Property DeviceGuardSecurityServicesRunning -ErrorAction SilentlyContinue).DeviceGuardSecurityServicesRunning")
    return "credentialguard" in out.lower()

def get_secure_boot() -> bool:
    out = ps("Confirm-SecureBootUEFI -ErrorAction SilentlyContinue")
    return "True" in out

def get_windows_hello() -> bool:
    out = ps("(Get-WinUserLanguageList | Measure-Object).Count")
    enrolled = reg_read(
        winreg.HKEY_LOCAL_MACHINE,
        r"SOFTWARE\Microsoft\Windows NT\CurrentVersion\PasswordLess\Device",
        "DevicePasswordlessBuildVersion"
    )
    return bool(enrolled)

# ── CIS Windows Benchmark compliance ──────────────────────────
def get_cis_compliance() -> dict:
    """CIS Windows Benchmark Level 1+2 checks."""
    checks = {}
    defender  = get_defender()
    ps_log    = get_powershell_logging()

    # 1. Account policies
    checks["uac_enabled"]       = get_uac_status()
    checks["no_autologon"]      = not get_autologon()
    checks["guest_disabled"]    = not get_guest_enabled()
    checks["laps_installed"]    = get_laps_installed()

    # 2. Network security
    checks["firewall_enabled"]  = get_firewall()
    checks["smb_signing"]       = get_smb_signing()
    checks["llmnr_disabled"]    = get_llmnr_disabled()
    checks["rdp_controlled"]    = not get_rdp_enabled()

    # 3. Encryption
    checks["bitlocker_enabled"] = get_bitlocker()
    checks["secure_boot"]       = get_secure_boot()
    checks["credential_guard"]  = get_credential_guard()

    # 4. AV / EDR
    checks["defender_enabled"]        = bool(defender.get("defender_enabled"))
    checks["defender_signatures_fresh"] = (
        defender.get("defender_sig_age_days") is not None and
        defender.get("defender_sig_age_days") < 7
    )
    checks["tamper_protection"]       = bool(defender.get("defender_tamper_protection"))

    # 5. Application control
    checks["applocker_enabled"]        = get_applocker_enabled()

    # 6. Logging & auditing
    checks["ps_script_block_logging"]  = ps_log["script_block_logging"]
    checks["ps_module_logging"]        = ps_log["module_logging"]

    # 7. Windows Hello / MFA
    checks["windows_hello"]           = get_windows_hello()

    passed = sum(1 for v in checks.values() if v)
    total  = len(checks)
    checks["_score"] = passed
    checks["_total"] = total
    checks["_pct"]   = round(100 * passed / total)
    return checks

# ── Vulnerability assessment (Heimdal Thor equivalent) ────────
def get_installed_software_versions() -> list[dict]:
    out = ps(
        "Get-ItemProperty "
        "HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*,"
        "HKLM:\\Software\\Wow6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\* "
        "| Select-Object DisplayName,DisplayVersion,Publisher | ConvertTo-Json", timeout=30
    )
    try:
        items = json.loads(out)
        if isinstance(items, dict):
            items = [items]
        return [
            {"name": i.get("DisplayName",""), "version": i.get("DisplayVersion",""),
             "publisher": i.get("Publisher","")}
            for i in items if i.get("DisplayName")
        ][:300]
    except Exception:
        return []

# Known EOL versions that are common vulnerability vectors
EOL_PATTERNS = {
    "7-Zip":              {"eol_before": "23.0"},
    "Google Chrome":      {"eol_before": "120.0"},
    "Mozilla Firefox":    {"eol_before": "121.0"},
    "Microsoft Edge":     {"eol_before": "120.0"},
    "Adobe Acrobat":      {"eol_before": "2024.0"},
    "Adobe Reader":       {"eol_before": "2024.0"},
    "Java":               {"eol_before": "21.0"},
    "OpenSSL":            {"eol_before": "3.0"},
    "WinRAR":             {"eol_before": "6.23"},
    "Notepad++":          {"eol_before": "8.6"},
    "VLC":                {"eol_before": "3.0.20"},
    "Zoom":               {"eol_before": "5.17"},
    "Slack":              {"eol_before": "4.35"},
    "Python":             {"eol_before": "3.10"},
    "Node.js":            {"eol_before": "20.0"},
}

def assess_vulnerabilities(software: list[dict]) -> list[dict]:
    """Basic vulnerability assessment against known EOL versions."""
    vulns = []
    for app in software:
        name = app.get("name", "")
        ver  = app.get("version", "")
        if not name or not ver:
            continue
        for pattern, info in EOL_PATTERNS.items():
            if pattern.lower() in name.lower():
                try:
                    def parse_ver(v: str):
                        parts = re.sub(r"[^0-9.]", "", v.split(" ")[0]).split(".")
                        return tuple(int(x) for x in parts[:3] if x.isdigit())

                    current = parse_ver(ver)
                    threshold = parse_ver(info["eol_before"])
                    if current and threshold and current < threshold:
                        vulns.append({
                            "name":    name,
                            "version": ver,
                            "eol_since": info["eol_before"],
                            "severity": "high",
                            "cve_count_estimate": "unknown",
                        })
                except Exception:
                    pass
    return vulns[:50]

def get_pending_updates() -> list[str]:
    out = ps(
        "(New-Object -ComObject Microsoft.Update.Session).CreateUpdateSearcher()"
        ".Search('IsInstalled=0 and IsHidden=0').Updates | ForEach-Object { $_.Title }",
        timeout=60
    )
    return [l.strip() for l in out.splitlines() if l.strip()][:50]

# ── WMI persistence detection (Heimdal feature) ───────────────
def get_wmi_subscriptions() -> list[dict]:
    """Detect WMI event subscriptions — common malware persistence mechanism."""
    out = ps(
        "Get-WMIObject -Namespace root\\subscription -Class __EventFilter "
        "| Select-Object Name,Query | ConvertTo-Json -ErrorAction SilentlyContinue", timeout=20
    )
    try:
        items = json.loads(out)
        if isinstance(items, dict):
            items = [items]
        return [{"name": i.get("Name",""), "query": i.get("Query","")[:200]}
                for i in items if i.get("Name") and "BVTConsumer" not in i.get("Name","")][:20]
    except Exception:
        return []

# ── Registry persistence monitoring ───────────────────────────
def get_registry_run_keys() -> list[dict]:
    """Check Run/RunOnce keys for suspicious entries."""
    run_paths = [
        (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Windows\CurrentVersion\Run"),
        (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\Windows\CurrentVersion\RunOnce"),
        (winreg.HKEY_CURRENT_USER,  r"SOFTWARE\Microsoft\Windows\CurrentVersion\Run"),
        (winreg.HKEY_CURRENT_USER,  r"SOFTWARE\Microsoft\Windows\CurrentVersion\RunOnce"),
        (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Run"),
    ]
    entries = []
    trusted = {"C:\\Windows", "C:\\Program Files", "C:\\Program Files (x86)",
               "%SystemRoot%", "%ProgramFiles%", "OneDrive", "Dropbox",
               "Microsoft", "Google", "Zoom", "Slack"}
    for hive, path in run_paths:
        try:
            key = winreg.OpenKey(hive, path)
            i = 0
            while True:
                try:
                    name, data, _ = winreg.EnumValue(key, i)
                    is_trusted = any(t.lower() in data.lower() for t in trusted)
                    if not is_trusted:
                        entries.append({
                            "name":      name,
                            "command":   data[:200],
                            "hive":      "HKLM" if hive == winreg.HKEY_LOCAL_MACHINE else "HKCU",
                            "path":      path,
                            "suspicious": True,
                        })
                    i += 1
                except OSError:
                    break
            winreg.CloseKey(key)
        except Exception:
            pass
    return entries[:30]

# ── Certificate store monitoring ──────────────────────────────
def get_suspicious_certs() -> list[dict]:
    """Detect non-Microsoft root CAs in the trusted store."""
    out = ps(
        "Get-ChildItem -Path Cert:\\LocalMachine\\Root "
        "| Where-Object { $_.Subject -notmatch 'Microsoft|DigiCert|Comodo|Sectigo|"
        "GlobalSign|GeoTrust|Symantec|VeriSign|Entrust|Let.s Encrypt|Amazon|Google' } "
        "| Select-Object Subject,Thumbprint,NotAfter | ConvertTo-Json", timeout=20
    )
    try:
        items = json.loads(out)
        if isinstance(items, dict):
            items = [items]
        return [{"subject": i.get("Subject","")[:100],
                 "thumbprint": i.get("Thumbprint",""),
                 "expires": str(i.get("NotAfter",""))}
                for i in items][:20]
    except Exception:
        return []

# ── Privilege access management (Heimdal PAM equivalent) ──────
def get_pam_events(hours: int = 1) -> dict:
    """Track privilege elevation events for PAM monitoring."""
    try:
        # Event 4672: Special privileges assigned to new logon
        priv_count = int(ps(
            f"(Get-WinEvent -FilterHashtable @{{LogName='Security';Id=4672;"
            f"StartTime=(Get-Date).AddHours(-{hours})}} -ErrorAction SilentlyContinue | "
            f"Measure-Object).Count", timeout=15
        ).strip() or "0")

        # Event 4688: Process created with elevated token
        elevated_procs = int(ps(
            f"(Get-WinEvent -FilterHashtable @{{LogName='Security';Id=4688;"
            f"StartTime=(Get-Date).AddHours(-{hours})}} -ErrorAction SilentlyContinue "
            f"| Where-Object {{$_.Message -like '*elevated*'}} | Measure-Object).Count", timeout=15
        ).strip() or "0")

        # Event 4703: User right adjusted (token privilege change)
        token_changes = int(ps(
            f"(Get-WinEvent -FilterHashtable @{{LogName='Security';Id=4703;"
            f"StartTime=(Get-Date).AddHours(-{hours})}} -ErrorAction SilentlyContinue | "
            f"Measure-Object).Count", timeout=15
        ).strip() or "0")

        return {
            "privilege_logons":  priv_count,
            "elevated_processes": elevated_procs,
            "token_changes":     token_changes,
        }
    except Exception:
        return {"privilege_logons": 0, "elevated_processes": 0, "token_changes": 0}

# ── DNS threat filtering (DarkLayer Guard equivalent) ─────────
THREAT_DOMAIN_BLOCKLIST = [
    # Crypto mining pools
    "xmrig.com","minexmr.com","moneroocean.stream","supportxmr.com","cryptonight.net",
    "nanopool.org","f2pool.com","2miners.com","ethermine.org","flexpool.io",
    # Malware C2
    "botnet.club","c2.evil.com","update.malware.com","malware-traffic-analysis.net",
    # Phishing infrastructure
    "loginverify-secure.com","account-confirm-login.com","secure-bank-login.com",
    # Known RAT infrastructure
    "darkcomet.net","njrat-panel.com","async-rat.com",
    # Ransomware C2
    "lockbit.onion.pet","blackcat-gang.com","hive-ransomware.com",
    # Stalkerware
    "mspy.com","spyic.com","cocospy.com",
]

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

def apply_dns_blocklist(domains: list | None = None) -> tuple[str, bool]:
    domains = domains or THREAT_DOMAIN_BLOCKLIST
    hosts   = _read_hosts()
    if HOSTS_START in hosts:
        start = hosts.index(HOSTS_START)
        end   = hosts.index(HOSTS_END) + len(HOSTS_END)
        hosts = hosts[:start].rstrip() + "\n" + hosts[end:].lstrip()
    block = f"\n{HOSTS_START}\n"
    for d in domains:
        block += f"0.0.0.0 {d}\n0.0.0.0 www.{d}\n"
    block += f"{HOSTS_END}\n"
    _write_hosts(hosts + block)
    log.info("DNS blocklist applied: %d domains blocked", len(domains))
    return True, f"Blocked {len(domains)} malicious domains"

def remove_dns_blocklist() -> tuple[str, bool]:
    hosts = _read_hosts()
    if HOSTS_START not in hosts:
        return True, "No DNS blocklist found"
    start = hosts.index(HOSTS_START)
    end   = hosts.index(HOSTS_END) + len(HOSTS_END)
    _write_hosts(hosts[:start].rstrip() + "\n" + hosts[end:].lstrip())
    shell("ipconfig /flushdns")
    return True, "DNS blocklist removed"

def block_domain(domain: str) -> tuple[str, bool]:
    hosts = _read_hosts()
    entry = f"0.0.0.0 {domain}"
    if entry in hosts:
        return True, f"{domain} already blocked"
    _write_hosts(hosts + f"\n{entry}  # SparrowShield\n")
    return True, f"Blocked {domain}"

def unblock_domain(domain: str) -> tuple[str, bool]:
    hosts = _read_hosts()
    lines = [l for l in hosts.splitlines() if domain not in l]
    _write_hosts("\n".join(lines))
    return True, f"Unblocked {domain}"

# ── UEBA collectors ───────────────────────────────────────────
def get_failed_logins(hours: int = 1) -> int:
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
    try:
        out = ps(
            f"Get-WinEvent -FilterHashtable @{{LogName='Security';Id=4732;"
            f"StartTime=(Get-Date).AddHours(-{hours})}} -ErrorAction SilentlyContinue | "
            f"Select-Object -ExpandProperty Message"
        )
        return [l.strip() for l in out.splitlines() if "Administrators" in l][:10]
    except Exception:
        return []

def get_lateral_movement_events(hours: int = 1) -> int:
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
    try:
        out = ps(
            f"(Get-WinEvent -FilterHashtable @{{LogName='Security';Id=4740;"
            f"StartTime=(Get-Date).AddHours(-{hours})}} -ErrorAction SilentlyContinue | "
            f"Measure-Object).Count"
        )
        return int(out.strip() or "0")
    except Exception:
        return 0

# ── Ransomware detection ───────────────────────────────────────
def get_suspicious_file_activity() -> dict:
    try:
        out = ps(
            "Get-ChildItem -Path $env:USERPROFILE -Recurse -ErrorAction SilentlyContinue "
            "| Where-Object { $_.LastWriteTime -gt (Get-Date).AddSeconds(-60) } "
            "| Measure-Object | Select-Object -ExpandProperty Count"
        )
        recent_writes = int(out.strip() or "0")

        ext_out = ps(
            "Get-ChildItem -Path $env:USERPROFILE -Recurse -ErrorAction SilentlyContinue "
            "| Select-Object -ExpandProperty Extension | Sort-Object -Unique"
        )
        found_ext = [e.lower() for e in ext_out.splitlines()
                     if e.strip().lower() in RANSOMWARE_EXTENSIONS]

        vss_del = int(ps(
            "(Get-WinEvent -FilterHashtable @{LogName='System';Id=8193;"
            "StartTime=(Get-Date).AddMinutes(-10)} -ErrorAction SilentlyContinue | "
            "Measure-Object).Count"
        ).strip() or "0") > 0

        vssadmin_ran = int(ps(
            "Get-WinEvent -FilterHashtable @{LogName='Security';Id=4688;"
            "StartTime=(Get-Date).AddMinutes(-10)} -ErrorAction SilentlyContinue "
            "| Where-Object { $_.Message -like '*vssadmin*delete*' } | Measure-Object | "
            "Select-Object -ExpandProperty Count"
        ).strip() or "0") > 0

        return {
            "recent_file_writes":    recent_writes,
            "ransomware_extensions": found_ext,
            "vss_deleted":           vss_del or vssadmin_ran,
            "mass_encryption_risk":  recent_writes > 100 and bool(found_ext),
        }
    except Exception:
        return {"recent_file_writes": 0, "ransomware_extensions": [],
                "vss_deleted": False, "mass_encryption_risk": False}

# ── Full metrics snapshot ──────────────────────────────────────
def collect_metrics() -> dict:
    cpu      = psutil.cpu_percent(interval=2)
    vm       = psutil.virtual_memory()
    disk     = psutil.disk_usage("C:\\")
    boot     = psutil.boot_time()
    defender = get_defender()

    procs = []
    for p in psutil.process_iter(["name","pid","ppid","cpu_percent","memory_percent"]):
        try:
            procs.append({
                "name": p.info["name"],
                "pid":  p.info["pid"],
                "ppid": p.info.get("ppid"),
                "cpu":  round(p.info.get("cpu_percent") or 0, 1),
                "mem":  round(p.info.get("memory_percent") or 0, 1),
            })
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            pass
    procs = sorted(procs, key=lambda x: x["cpu"], reverse=True)[:20]

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

    vols = []
    for part in psutil.disk_partitions():
        if "cdrom" in part.opts.lower():
            continue
        try:
            u = psutil.disk_usage(part.mountpoint)
            vols.append({"mountpoint": part.mountpoint, "total_gb": round(u.total/1e9,1),
                         "used_pct": round(u.percent,1), "fstype": part.fstype})
        except Exception:
            pass

    return {
        "status":                "online",
        "last_seen":             now_iso(),
        "os_type":               "windows",
        "os_version":            platform.win32_ver()[1] or platform.release(),
        "assigned_user":         os.environ.get("USERNAME",""),
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
        "top_processes":         procs,
        "listening_ports":       ports,
        "open_connections_count": len(psutil.net_connections()),
        "storage_volumes":       vols,
        "pending_update_count":  0,
    }

# ── Alert helpers ─────────────────────────────────────────────
def post_alert(device_id: str, rule_id: str, alert_type: str,
               severity: str, message: str, mitre: str):
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

    # ── 1. Security posture ───────────────────────────────────
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

    # ── 2. Process IOC ────────────────────────────────────────
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

    lolbins_active = {p for p in procs if p.replace(".exe","") in _LOLBINS}
    if lolbins_active:
        rules.append((True, "lolbin_activity", "lolbin_activity", "high",
                      f"LOLBin abuse detected: {', '.join(lolbins_active)}", "T1218"))
    else:
        resolve_alert(device_id, "lolbin_activity")

    # ── 3. Network ────────────────────────────────────────────
    bad_ports = ports & _BAD_PORTS
    if bad_ports:
        rules.append((True, "suspicious_port", "suspicious_port", "high",
                      f"Backdoor port(s) open: {', '.join(str(p) for p in bad_ports)}", "T1049"))
    else:
        resolve_alert(device_id, "suspicious_port")

    shell_on_port = any(port_procs.get(p,"") in _SHELLS for p in ports)
    if shell_on_port:
        rules.append((True, "shell_on_port", "shell_on_port", "critical",
                      "Shell interpreter bound to a network port — possible reverse shell", "T1059"))
    else:
        resolve_alert(device_id, "shell_on_port")

    _sys_procs = {"system","idle","svchost.exe","lsass.exe","services.exe","csrss.exe","wininit.exe"}
    high_cpu = any(p["cpu"] > 80 and p["name"].lower() not in _sys_procs
                   for p in metrics.get("top_processes", []))
    rules.append((high_cpu, "high_cpu_non_system", "high_cpu_non_system", "warning",
                  "Non-system process consuming >80% CPU — possible miner or abuse", "T1496"))

    # ── 4. UEBA ───────────────────────────────────────────────
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

    # Off-hours logon check
    hour = datetime.now().hour
    off_hours = hour < 6 or hour > 22
    rules.append((off_hours and failed_logins > 0,
                  "off_hours_login", "off_hours_login", "warning",
                  "Login activity outside business hours (before 6am or after 10pm)", "T1078"))

    # ── 5. Ransomware ─────────────────────────────────────────
    ra = get_suspicious_file_activity()
    rules.append((ra.get("mass_encryption_risk"),
                  "ransomware_activity", "ransomware_activity", "critical",
                  f"Possible ransomware: {ra['recent_file_writes']} writes + "
                  f"extensions {ra['ransomware_extensions'][:3]}", "T1486"))
    rules.append((ra.get("vss_deleted"),
                  "vss_deletion", "vss_deletion", "critical",
                  "Shadow copy deletion — common ransomware pre-encryption step", "T1490"))

    for condition, rule_id, alert_type, severity, message, mitre in rules:
        if condition:
            post_alert(device_id, rule_id, alert_type, severity, message, mitre)
        else:
            resolve_alert(device_id, rule_id)

    # ── 6. WMI persistence (Heimdal feature) ──────────────────
    try:
        wmi_subs = get_wmi_subscriptions()
        if wmi_subs:
            post_alert(device_id, "wmi_persistence", "wmi_persistence", "critical",
                       f"WMI event subscription detected: {', '.join(s['name'] for s in wmi_subs[:3])}",
                       "T1546.003")
        else:
            resolve_alert(device_id, "wmi_persistence")
    except Exception:
        pass

    # ── 7. Registry persistence ───────────────────────────────
    try:
        run_keys = get_registry_run_keys()
        if run_keys:
            post_alert(device_id, "registry_persistence", "registry_persistence", "high",
                       f"Suspicious Run key entries: {', '.join(k['name'] for k in run_keys[:3])}",
                       "T1547.001")
        else:
            resolve_alert(device_id, "registry_persistence")
    except Exception:
        pass

    # ── 8. Suspicious certificates ────────────────────────────
    try:
        sus_certs = get_suspicious_certs()
        if sus_certs:
            post_alert(device_id, "suspicious_root_cert", "suspicious_root_cert", "high",
                       f"Unknown root CA in trusted store: "
                       f"{', '.join(c['subject'][:40] for c in sus_certs[:3])}",
                       "T1553.004")
        else:
            resolve_alert(device_id, "suspicious_root_cert")
    except Exception:
        pass

# ── Host isolation ────────────────────────────────────────────
def _supabase_ips() -> list[str]:
    try:
        host = SUPABASE_URL.replace("https://","").replace("http://","").split("/")[0]
        return list({i[4][0] for i in socket.getaddrinfo(host, 443)})
    except Exception:
        return []

def isolate_host(device_id: str) -> tuple[str, bool]:
    try:
        ips = _supabase_ips()
        shell("netsh advfirewall set allprofiles firewallpolicy blockinbound,blockoutbound")
        shell('netsh advfirewall firewall delete rule name="SparrowShield-Allow-Out"')
        shell('netsh advfirewall firewall delete rule name="SparrowShield-Allow-In"')
        for ip in ips:
            shell(f'netsh advfirewall firewall add rule name="SparrowShield-Allow-Out" '
                  f'dir=out action=allow remoteip={ip} protocol=TCP remoteport=443')
            shell(f'netsh advfirewall firewall add rule name="SparrowShield-Allow-In" '
                  f'dir=in action=allow remoteip={ip} protocol=TCP')
        shell('netsh advfirewall firewall add rule name="SparrowShield-Allow-Loopback" '
              'dir=out action=allow remoteip=127.0.0.1')
        db_patch("devices", {"id": f"eq.{device_id}"}, {"isolated": True, "status": "isolated"})
        msg = f"Host isolated. Supabase IPs allowlisted: {ips}"
        log.warning("HOST ISOLATED: %s", msg)
        return msg, True
    except Exception as e:
        return f"Isolation failed: {e}", False

def unisolate_host(device_id: str) -> tuple[str, bool]:
    try:
        shell('netsh advfirewall firewall delete rule name="SparrowShield-Allow-Out"')
        shell('netsh advfirewall firewall delete rule name="SparrowShield-Allow-In"')
        shell('netsh advfirewall firewall delete rule name="SparrowShield-Allow-Loopback"')
        shell("netsh advfirewall set allprofiles firewallpolicy blockinbound,allowoutbound")
        db_patch("devices", {"id": f"eq.{device_id}"}, {"isolated": False, "status": "online"})
        return "Host unisolated — normal network access restored", True
    except Exception as e:
        return f"Unisolate failed: {e}", False

# ── Patch management ──────────────────────────────────────────
def patch_app(payload: dict) -> tuple[str, bool]:
    app_id = payload.get("app_id") or payload.get("app_name", "")
    if not app_id:
        return "No app_id provided", False
    out = shell(["winget", "upgrade", "--id", app_id, "--silent",
                 "--accept-package-agreements", "--accept-source-agreements"], timeout=300)
    return (f"Updated {app_id}: {out[:200]}", "successfully" in out.lower() or out == "")

def patch_all(payload: dict) -> tuple[str, bool]:
    out = shell(["winget", "upgrade", "--all", "--silent",
                 "--accept-package-agreements", "--accept-source-agreements"], timeout=600)
    wu = ps("Install-Module PSWindowsUpdate -Force -Confirm:$false -ErrorAction SilentlyContinue; "
            "Get-WindowsUpdate -AcceptAll -Install -AutoReboot:$false | "
            "Select-Object -ExpandProperty Title", timeout=600)
    return f"winget: {'OK' if out else 'done'} | windows_update: {wu[:100] or 'checked'}", True

# ── Remote script ─────────────────────────────────────────────
def run_script(payload: dict) -> tuple[str, bool]:
    script = payload.get("script", "")
    if not script:
        return "No script", False
    import tempfile
    with tempfile.NamedTemporaryFile(suffix=".ps1", mode="w", delete=False, encoding="utf-8") as f:
        f.write(script)
        fname = f.name
    out = ps(f"& '{fname}'", timeout=120)
    os.unlink(fname)
    return out[:2000] or "Executed (no output)", True

def run_defender_scan(payload: dict) -> tuple[str, bool]:
    scan_type = payload.get("type", "quick")
    flag = "-QuickScan" if scan_type == "quick" else "-FullScan"
    out = ps(f"Start-MpScan {flag}", timeout=30)
    return f"Defender {scan_type} scan started: {out[:200]}", True

def get_compliance_report(payload: dict) -> tuple[str, bool]:
    cis    = get_cis_compliance()
    failed = [k for k, v in cis.items() if not v and not k.startswith("_")]
    result = {"score": f"{cis['_score']}/{cis['_total']} ({cis['_pct']}%)", "failed": failed}
    db_insert("compliance_snapshots", {
        "device_id":   load_state().get("device_id",""),
        "hostname":    socket.gethostname(),
        "os_type":     "windows",
        "framework":   "CIS Windows Benchmark",
        "score_pct":   cis["_pct"],
        "passed":      cis["_score"],
        "total":       cis["_total"],
        "details":     cis,
        "snapshot_at": now_iso(),
    })
    return json.dumps(result), True

def run_vulnerability_scan(payload: dict) -> tuple[str, bool]:
    software = get_installed_software_versions()
    vulns    = assess_vulnerabilities(software)
    pending  = get_pending_updates()
    result = {
        "vulnerabilities_found": len(vulns),
        "pending_updates":       len(pending),
        "vulnerable_apps":       vulns[:20],
    }
    # Store in Supabase
    device_id = load_state().get("device_id","")
    db_patch("devices", {"id": f"eq.{device_id}"}, {
        "vulnerability_count": len(vulns),
        "pending_update_count": len(pending),
    })
    for v in vulns:
        db_insert("vulnerabilities", {
            "device_id":     device_id,
            "hostname":      socket.gethostname(),
            "app_name":      v["name"],
            "version":       v["version"],
            "eol_since":     v["eol_since"],
            "severity":      v["severity"],
            "detected_at":   now_iso(),
        })
    return json.dumps(result), True

def get_persistence_report(payload: dict) -> tuple[str, bool]:
    result = {
        "wmi_subscriptions": get_wmi_subscriptions(),
        "registry_run_keys": get_registry_run_keys(),
        "suspicious_certs":  get_suspicious_certs(),
    }
    return json.dumps(result), True

# ── Command loop ──────────────────────────────────────────────
def command_loop(device_id: str):
    handlers = {
        "isolate":                lambda p: isolate_host(device_id),
        "unisolate":              lambda p: unisolate_host(device_id),
        "apply_dns_blocklist":    lambda p: apply_dns_blocklist(p.get("domains")),
        "remove_dns_blocklist":   lambda p: remove_dns_blocklist(),
        "block_domain":           lambda p: block_domain(p.get("domain","")),
        "unblock_domain":         lambda p: unblock_domain(p.get("domain","")),
        "patch_app":              patch_app,
        "patch_all":              patch_all,
        "run_script":             run_script,
        "defender_scan":          run_defender_scan,
        "get_compliance_report":  get_compliance_report,
        "run_vulnerability_scan": run_vulnerability_scan,
        "get_persistence_report": get_persistence_report,
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
                cmd_type = cmd.get("command_type","")
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
    time.sleep(45)
    while True:
        try:
            cis = get_cis_compliance()
            db_patch("devices", {"id": f"eq.{device_id}"}, {
                "cis_score_pct": cis["_pct"],
                "cis_passed":    cis["_score"],
                "cis_total":     cis["_total"],
                "cis_details":   cis,
            })
            db_insert("compliance_snapshots", {
                "device_id":   device_id,
                "hostname":    socket.gethostname(),
                "os_type":     "windows",
                "framework":   "CIS Windows Benchmark",
                "score_pct":   cis["_pct"],
                "passed":      cis["_score"],
                "total":       cis["_total"],
                "details":     cis,
                "snapshot_at": now_iso(),
            })
            log.info("CIS compliance: %d/%d (%d%%)", cis["_score"], cis["_total"], cis["_pct"])
        except Exception as e:
            log.debug("Compliance loop error: %s", e)
        time.sleep(VULN_SCAN_HRS * 3600)

# ── Vulnerability scan loop ───────────────────────────────────
def vuln_loop(device_id: str):
    time.sleep(120)  # let the system settle first
    while True:
        try:
            software = get_installed_software_versions()
            vulns    = assess_vulnerabilities(software)
            pending  = get_pending_updates()
            db_patch("devices", {"id": f"eq.{device_id}"}, {
                "vulnerability_count": len(vulns),
                "pending_update_count": len(pending),
            })
            # Alert if critical vulnerabilities found
            if len(vulns) > 0:
                post_alert(device_id, "vulnerable_software", "vulnerable_software", "high",
                           f"{len(vulns)} applications with known EOL versions detected: "
                           f"{', '.join(v['name'] for v in vulns[:3])}",
                           "T1203")
            else:
                resolve_alert(device_id, "vulnerable_software")
            # Alert if too many pending updates
            if len(pending) > 10:
                post_alert(device_id, "many_pending_updates", "many_pending_updates", "warning",
                           f"{len(pending)} pending Windows updates — system may be missing security patches",
                           "T1203")
            else:
                resolve_alert(device_id, "many_pending_updates")
            log.info("Vuln scan: %d vulns, %d pending updates", len(vulns), len(pending))
        except Exception as e:
            log.debug("Vuln loop error: %s", e)
        time.sleep(VULN_SCAN_HRS * 3600)

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

# ── Self-install ──────────────────────────────────────────────
TASK_NAME = "SparrowShieldAgent"

def install_service():
    exe = sys.executable if not getattr(sys, "frozen", False) else sys.executable
    shell(f'schtasks /create /tn "{TASK_NAME}" /tr "{exe}" /sc ONSTART /ru SYSTEM /rl HIGHEST /f')
    shell(f'schtasks /run /tn "{TASK_NAME}"')
    print(f"[OK] SparrowShield registered as scheduled task '{TASK_NAME}'")
    print(f"     Exe: {exe}")
    print(f"     Starts automatically on every boot as SYSTEM.")
    print(f"     Uninstall: run with --uninstall")

def uninstall_service():
    shell(f'schtasks /end /tn "{TASK_NAME}"')
    shell(f'schtasks /delete /tn "{TASK_NAME}" /f')
    print(f"[OK] Task '{TASK_NAME}' removed.")

# ── Main ──────────────────────────────────────────────────────
def main():
    log.info("SparrowShield Windows Agent v2.0 starting — %s", socket.gethostname())
    log.info("Supabase: %s", SUPABASE_URL)

    device_id = enroll()
    log.info("Device ID: %s", device_id)

    # Apply DNS blocklist on startup (requires admin)
    try:
        ok, msg = apply_dns_blocklist()
        log.info("DNS blocklist: %s", msg)
    except Exception:
        log.debug("DNS blocklist skipped (may need admin rights)")

    # Start background threads
    threading.Thread(target=command_loop,   args=(device_id,), daemon=True).start()
    threading.Thread(target=detection_loop, args=(device_id,), daemon=True).start()
    threading.Thread(target=compliance_loop,args=(device_id,), daemon=True).start()
    threading.Thread(target=vuln_loop,      args=(device_id,), daemon=True).start()

    # Heartbeat runs in main thread
    heartbeat_loop(device_id)

if __name__ == "__main__":
    if "--install" in sys.argv:
        install_service()
    elif "--uninstall" in sys.argv:
        uninstall_service()
    else:
        main()
