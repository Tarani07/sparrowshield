#!/usr/bin/env python3
"""
SparrowShield Agent — single-file macOS EDR agent.
Edit the CONFIG section below, then run or install as a LaunchAgent.
State (device_id) is stored in ~/.sparrowshield/state.json automatically.
"""

# ──────────────────────────────────────────────────────────────
# CONFIG — edit these before deploying
# ──────────────────────────────────────────────────────────────
SUPABASE_URL      = "https://hevcfhxmjgbpozqtescm.supabase.co"
ANON_KEY          = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhldmNmaHhtamdicG96cXRlc2NtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyMjk4NDYsImV4cCI6MjA4NjgwNTg0Nn0.CaXbG8F54bXV0_biNka7vp6Cl1s7vvQsRogNoz7jB28"
HEARTBEAT_SEC     = 60
# ──────────────────────────────────────────────────────────────

import json, os, platform, socket, subprocess, time, uuid, logging
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

# ── Logging ──────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("sparrowshield")

# ── State (device_id persisted between runs) ─────────────────
STATE_FILE = Path.home() / ".sparrowshield" / "state.json"

def load_state() -> dict:
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    if STATE_FILE.exists():
        try:
            return json.loads(STATE_FILE.read_text())
        except Exception:
            pass
    return {}

def save_state(state: dict):
    STATE_FILE.write_text(json.dumps(state, indent=2))

# ── Supabase REST helpers ─────────────────────────────────────
REST = f"{SUPABASE_URL}/rest/v1"
HEADERS = {
    "apikey": ANON_KEY,
    "Authorization": f"Bearer {ANON_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation",
}

def db_get(table: str, params: dict) -> list:
    r = requests.get(f"{REST}/{table}", headers=HEADERS, params=params, timeout=10)
    return r.json() if r.ok else []

def db_upsert(table: str, data: dict) -> dict | None:
    r = requests.post(f"{REST}/{table}", headers={**HEADERS, "Prefer": "resolution=merge-duplicates,return=representation"},
                      json=data, timeout=10)
    rows = r.json()
    return rows[0] if r.ok and rows else None

def db_patch(table: str, params: dict, data: dict):
    requests.patch(f"{REST}/{table}", headers=HEADERS, params=params, json=data, timeout=10)

def db_insert(table: str, data: dict):
    requests.post(f"{REST}/{table}", headers=HEADERS, json=data, timeout=10)

# ── Helpers ───────────────────────────────────────────────────
def shell(cmd: str) -> str:
    try:
        return subprocess.check_output(cmd, shell=True, stderr=subprocess.DEVNULL, timeout=5).decode().strip()
    except Exception:
        return ""

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

# ── Enrollment ────────────────────────────────────────────────
def enroll() -> str:
    """Register this device; return device_id."""
    state = load_state()
    if state.get("device_id"):
        log.info("Already enrolled: %s", state["device_id"])
        return state["device_id"]

    hostname   = socket.gethostname()
    serial     = shell("system_profiler SPHardwareDataType | awk '/Serial Number/{print $NF}'")
    model      = shell("system_profiler SPHardwareDataType | awk '/Model Name/{$1=$2=\"\"; print $0}'").strip()
    username   = os.environ.get("USER", "unknown")
    os_version = platform.mac_ver()[0]

    # Check for existing device by serial
    if serial:
        existing = db_get("devices", {"serial_number": f"eq.{serial}", "select": "id"})
        if existing:
            device_id = existing[0]["id"]
            log.info("Device already registered, reusing id: %s", device_id)
            save_state({"device_id": device_id})
            return device_id

    device_id = str(uuid.uuid4())
    payload = {
        "id": device_id,
        "hostname": hostname,
        "serial_number": serial,
        "model_name": model,
        "assigned_user": username,
        "os_type": "mac",
        "os_version": os_version,
        "status": "online",
        "enrolled_at": now_iso(),
        "last_seen": now_iso(),
    }
    result = db_upsert("devices", payload)
    if result:
        save_state({"device_id": result.get("id", device_id)})
        log.info("Enrolled as %s (%s)", hostname, device_id)
        return result.get("id", device_id)
    else:
        # fallback: save what we have
        save_state({"device_id": device_id})
        return device_id

# ── Telemetry collection ──────────────────────────────────────
def collect() -> dict:
    cpu    = psutil.cpu_percent(interval=1)
    ram    = psutil.virtual_memory()
    disk   = psutil.disk_usage("/")
    boot   = psutil.boot_time()
    uptime = int(time.time() - boot)

    # Security checks
    filevault  = "On"  in shell("fdesetup status")
    firewall   = "1"   == shell("defaults read /Library/Preferences/com.apple.alf globalstate 2>/dev/null")
    sip        = "enabled" in shell("csrutil status").lower()
    gatekeeper = "enabled" in shell("spctl --status 2>/dev/null").lower()
    screen_lock_delay = int(shell("defaults -currentHost read com.apple.screensaver idleTime 2>/dev/null") or "0")

    # Top processes
    top_procs = []
    for p in sorted(psutil.process_iter(["name","pid","cpu_percent","memory_percent"]),
                    key=lambda p: p.info.get("cpu_percent") or 0, reverse=True)[:15]:
        top_procs.append({
            "name": p.info["name"],
            "pid":  p.info["pid"],
            "cpu":  round(p.info.get("cpu_percent") or 0, 1),
            "mem":  round(p.info.get("memory_percent") or 0, 1),
        })

    # Network connections
    try:
        connections = psutil.net_connections(kind="inet")
    except (psutil.AccessDenied, PermissionError):
        connections = []
    open_count  = len(connections)
    listening   = []
    for c in connections:
        if c.status == "LISTEN" and c.laddr:
            proc_name = ""
            try:
                proc_name = psutil.Process(c.pid).name() if c.pid else ""
            except (psutil.NoSuchProcess, psutil.AccessDenied, Exception):
                pass
            listening.append({"port": c.laddr.port, "protocol": "tcp", "process": proc_name})

    # Installed apps (fast scan)
    apps = []
    for app_dir in ["/Applications", str(Path.home() / "Applications")]:
        try:
            apps += [f for f in os.listdir(app_dir) if f.endswith(".app")]
        except Exception:
            pass

    return {
        "status":              "online",
        "last_seen":           now_iso(),
        "os_version":          platform.mac_ver()[0],
        "cpu_pct":             cpu,
        "ram_total_gb":        round(ram.total / 1e9, 1),
        "ram_used_pct":        ram.percent,
        "disk_used_pct":       round(disk.percent, 1),
        "uptime_seconds":      uptime,
        "filevault_enabled":   filevault,
        "firewall_enabled":    firewall,
        "sip_enabled":         sip,
        "gatekeeper_enabled":  gatekeeper,
        "screen_lock_enabled": screen_lock_delay > 0,
        "screen_lock_delay_sec": screen_lock_delay,
        "top_processes":       top_procs,
        "listening_ports":     listening,
        "open_connections_count": open_count,
        "installed_apps":      apps,
        "active_user":         os.environ.get("USER", ""),
    }

# ── Detection engine ──────────────────────────────────────────
_MINERS    = {"xmrig","cpuminer","minerd","nbminer","cgminer","bfgminer","ethminer",
              "t-rex","lolminer","gminer","phoenixminer","teamredminer","nanominer","srbminer"}
_TUNNELS   = {"ngrok","frp","frpc","chisel","ligolo","rpivot","bore","rathole","cloudflared"}
_SHELLS    = {"bash","sh","zsh","fish","python","python3","nc","ncat","netcat"}
_BAD_PORTS = {4444,1337,31337,4545,6666,7777,12345,54321,9999,5555}
_MALWARE   = {"macstealer","atomicstealer","realst","amos","cthulhu","coinminer"}
_SYSTEM    = {"kernel_task","launchd","kextd","configd","mds","WindowServer",
              "coreaudiod","coreduetd","symptomsd"}

def _alert(device_id: str, rule_id: str, alert_type: str, severity: str,
           message: str, mitre: str):
    """Post alert with deduplication — skip if open alert already exists."""
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

def _resolve(device_id: str, rule_id: str):
    """Auto-resolve open alert when condition clears."""
    db_patch("alerts",
             {"device_id": f"eq.{device_id}", "rule_id": f"eq.{rule_id}", "resolved": "eq.false"},
             {"resolved": True, "resolved_at": now_iso()})

def run_detection(metrics: dict, device_id: str):
    procs      = {p["name"].lower() for p in metrics.get("top_processes", [])}
    ports      = {p["port"] for p in metrics.get("listening_ports", [])}
    port_procs = {p["port"]: p["process"].lower() for p in metrics.get("listening_ports", [])}
    apps       = {a.replace(".app","").lower() for a in metrics.get("installed_apps", [])}

    rules = [
        # (condition, rule_id, alert_type, severity, message, mitre)
        (not metrics.get("filevault_enabled"),
         "filevault_disabled", "filevault_disabled", "critical",
         "FileVault disk encryption is OFF — data at risk if device is lost", "T1486"),

        (not metrics.get("firewall_enabled"),
         "firewall_disabled", "firewall_disabled", "warning",
         "Host firewall is disabled — inbound connections are unrestricted", "T1562.004"),

        (not metrics.get("sip_enabled"),
         "sip_disabled", "sip_disabled", "critical",
         "System Integrity Protection (SIP) is OFF — kernel tampering possible", "T1562.001"),

        (not metrics.get("gatekeeper_enabled"),
         "gatekeeper_disabled", "gatekeeper_disabled", "high",
         "Gatekeeper is disabled — unsigned apps can run without prompts", "T1553.001"),

        (not metrics.get("screen_lock_enabled"),
         "screen_lock_disabled", "screen_lock_disabled", "warning",
         "Screen lock is not configured — device unprotected when unattended", "T1078"),

        (bool(procs & _MINERS),
         "crypto_miner_process", "crypto_miner_process", "critical",
         f"Crypto miner detected: {', '.join(procs & _MINERS)}", "T1496"),

        (bool(procs & _TUNNELS),
         "tunneling_tool_detected", "tunneling_tool_detected", "critical",
         f"Tunneling tool running: {', '.join(procs & _TUNNELS)}", "T1572"),

        (bool(procs & _MALWARE),
         "malicious_app_installed", "malicious_app_installed", "critical",
         f"Malicious process detected: {', '.join(procs & _MALWARE)}", "T1204"),

        (any(port_procs.get(p,"") in _SHELLS for p in ports),
         "shell_on_port", "shell_on_port", "critical",
         f"Shell interpreter listening on network port", "T1059"),

        (bool(ports & _BAD_PORTS),
         "suspicious_port", "suspicious_port", "high",
         f"Backdoor port(s) open: {', '.join(str(p) for p in ports & _BAD_PORTS)}", "T1049"),

        (any(p["cpu"] > 80 and p["name"].lower() not in _SYSTEM
             for p in metrics.get("top_processes", [])),
         "high_cpu_non_system", "high_cpu_non_system", "warning",
         "Non-system process consuming >80% CPU — possible miner or abuse", "T1496"),

        (bool(apps & _MALWARE),
         "malicious_app_installed_disk", "malicious_app_installed", "critical",
         f"Malicious app on disk: {', '.join(apps & _MALWARE)}", "T1204"),
    ]

    for condition, rule_id, alert_type, severity, message, mitre in rules:
        if condition:
            _alert(device_id, rule_id, alert_type, severity, message, mitre)
        else:
            _resolve(device_id, rule_id)

# ── Main loop ─────────────────────────────────────────────────
def main():
    log.info("SparrowShield Agent starting — %s", socket.gethostname())
    log.info("Supabase: %s", SUPABASE_URL)

    device_id = enroll()
    log.info("Device ID: %s", device_id)
    log.info("Heartbeat every %ds. Press Ctrl+C to stop.", HEARTBEAT_SEC)

    first_run = True
    while True:
        try:
            metrics = collect()

            # Push telemetry to devices table
            db_patch("devices", {"id": f"eq.{device_id}"}, metrics)

            # Run detection engine (skip first tick — cpu_percent needs 2 reads)
            if not first_run:
                run_detection(metrics, device_id)

            log.info("Heartbeat — CPU %.1f%% RAM %.1f%% Disk %.1f%%",
                     metrics["cpu_pct"], metrics["ram_used_pct"], metrics["disk_used_pct"])
            first_run = False

        except requests.exceptions.ConnectionError:
            log.warning("Network unreachable — will retry next heartbeat")
        except Exception as e:
            log.error("Heartbeat error: %s", e)

        time.sleep(HEARTBEAT_SEC)

if __name__ == "__main__":
    main()
