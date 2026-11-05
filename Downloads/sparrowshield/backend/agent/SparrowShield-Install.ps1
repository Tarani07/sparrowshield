#Requires -Version 5
# SparrowShield Agent - One-Click Installer
# Right-click this file and select "Run with PowerShell"
# No administrator rights required.

$ErrorActionPreference = "Stop"

# Install into user's own AppData — always writable, no admin needed
$InstallDir  = "$env:LOCALAPPDATA\SparrowShield"
$AgentPy     = "$InstallDir\agent_windows.py"
$ConfigJson  = "$InstallDir\config.json"

Write-Host ""
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host "   SparrowShield Agent - One-Click Installer" -ForegroundColor Cyan
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host ""

# ── Step 1: Create install folder ────────────────────────────────────────────
Write-Host "  [1/5] Preparing install folder..." -ForegroundColor White
New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
Write-Host "         $InstallDir" -ForegroundColor Gray

# ── Step 2: Write config.json (UTF-8, no BOM) ────────────────────────────────
Write-Host "  [2/5] Writing config..." -ForegroundColor White
$configText = @'
{
  "api_url": "https://hevcfhxmjgbpozqtescm.supabase.co/functions/v1",
  "anon_key": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhldmNmaHhtamdicG96cXRlc2NtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyMjk4NDYsImV4cCI6MjA4NjgwNTg0Nn0.CaXbG8F54bXV0_biNka7vp6Cl1s7vvQsRogNoz7jB28",
  "device_id": "",
  "device_token": ""
}
'@
[System.IO.File]::WriteAllText($ConfigJson, $configText, [System.Text.UTF8Encoding]::new($false))
Write-Host "         config.json written." -ForegroundColor Green

# ── Step 3: Write agent_windows.py (UTF-8, no BOM) ───────────────────────────
Write-Host "  [3/5] Writing agent script..." -ForegroundColor White
$agentCode = @'
#!/usr/bin/env python3
"""SparrowShield Windows Agent"""
import json, logging, os, platform, subprocess, sys, threading, time
from pathlib import Path
import psutil, requests

CONFIG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.json")
LOG_PATH    = os.path.join(os.path.dirname(os.path.abspath(__file__)), "agent.log")
HEARTBEAT_INTERVAL = 300
INVENTORY_INTERVAL = 3600

def setup_logging():
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        handlers=[
            logging.FileHandler(LOG_PATH, encoding="utf-8"),
            logging.StreamHandler(sys.stdout),
        ],
    )
    return logging.getLogger(__name__)

logger = setup_logging()

def load_config():
    try:
        with open(CONFIG_PATH, "r", encoding="utf-8-sig") as f:
            return json.load(f)
    except Exception as e:
        logger.error("Could not load config: %s", e)
        return {}

def save_config(config):
    try:
        with open(CONFIG_PATH, "w", encoding="utf-8") as f:
            json.dump(config, f, indent=2)
    except Exception as e:
        logger.error("Could not save config: %s", e)

def get_serial():
    try:
        r = subprocess.run(["wmic", "bios", "get", "serialnumber"],
            capture_output=True, text=True, timeout=10,
            creationflags=subprocess.CREATE_NO_WINDOW)
        lines = [l.strip() for l in r.stdout.strip().splitlines() if l.strip()]
        if len(lines) >= 2:
            return lines[-1] or "unknown"
    except Exception:
        pass
    return "unknown"

def enroll(api_url, config):
    cpu_model = platform.processor() or "unknown"
    try:
        r = subprocess.run(["wmic", "cpu", "get", "Name", "/format:value"],
            capture_output=True, text=True, timeout=10,
            creationflags=subprocess.CREATE_NO_WINDOW)
        for line in r.stdout.splitlines():
            if line.startswith("Name=") and line[5:].strip():
                cpu_model = line[5:].strip(); break
    except Exception:
        pass
    body = {
        "hostname":     platform.node(),
        "serial_number": get_serial(),
        "os_type":      "windows",
        "os_version":   platform.win32_ver()[1] or platform.release(),
        "assigned_user": os.environ.get("USERNAME", ""),
        "department":   "",
        "cpu_model":    cpu_model,
        "cpu_cores":    psutil.cpu_count(logical=False) or psutil.cpu_count(),
        "ram_total_gb": round(psutil.virtual_memory().total / (1024**3), 2),
    }
    anon_key = config.get("anon_key", "")
    hdrs = {"Content-Type": "application/json", "apikey": anon_key,
            "Authorization": f"Bearer {anon_key}"}
    for attempt in range(3):
        try:
            r = requests.post(f"{api_url}/enroll", json=body, headers=hdrs, timeout=30)
            data = r.json()
            if r.status_code == 200 and data.get("success") and data.get("data"):
                d = data["data"]
                config["device_id"]    = str(d["device_id"])
                config["device_token"] = d["token"]
                save_config(config)
                logger.info("Enrolled: device_id=%s", config["device_id"])
                return True
            logger.warning("Enroll failed: %s %s", r.status_code, data.get("error"))
        except Exception as e:
            logger.warning("Enroll attempt %s failed: %s", attempt + 1, e)
        time.sleep(2 ** attempt)
    return False

def retry_request(method, url, **kwargs):
    last_error = None
    for attempt in range(5):
        try:
            r = method(url, **kwargs)
            if r.status_code in (200, 201, 204): return r
            if r.status_code in (401, 403, 404): return r
            last_error = r.text
        except requests.RequestException as e:
            last_error = e
        time.sleep(2 ** attempt)
    raise last_error

def get_bitlocker():
    try:
        r = subprocess.run(["manage-bde", "-status", "C:"],
            capture_output=True, text=True, timeout=15,
            creationflags=subprocess.CREATE_NO_WINDOW)
        return "Protection On" in r.stdout or "Fully Encrypted" in r.stdout
    except Exception:
        return False

def get_firewall():
    try:
        r = subprocess.run(["powershell", "-NoProfile", "-Command",
            "Get-NetFirewallProfile | Select-Object Name, Enabled"],
            capture_output=True, text=True, timeout=15,
            creationflags=subprocess.CREATE_NO_WINDOW)
        for line in r.stdout.splitlines():
            if ("Domain" in line or "Private" in line or "Public" in line) and "True" in line:
                return True
    except Exception:
        pass
    return False

def collect_metrics():
    vm   = psutil.virtual_memory()
    disk = psutil.disk_usage("C:\\")
    bat  = None
    if hasattr(psutil, "sensors_battery") and psutil.sensors_battery():
        bat = getattr(psutil.sensors_battery(), "percent", None)
    return {
        "cpu_pct":          round(psutil.cpu_percent(interval=2), 2),
        "ram_pct":          round(vm.percent, 2),
        "ram_total_gb":     round(vm.total / (1024**3), 2),
        "disk_pct":         round(disk.percent, 2),
        "disk_total_gb":    round(disk.total / (1024**3), 2),
        "battery_health_pct": bat,
        "battery_cycles":   None,
        "uptime_seconds":   int(time.time() - psutil.boot_time()),
        "filevault_enabled": None,
        "bitlocker_enabled": get_bitlocker(),
        "firewall_enabled":  get_firewall(),
    }

def heartbeat_loop(api_url, token, anon_key):
    while True:
        try:
            r = retry_request(requests.post, f"{api_url}/heartbeat",
                json=collect_metrics(),
                headers={"Content-Type": "application/json",
                         "apikey": anon_key,
                         "Authorization": f"Bearer {token}"},
                timeout=30)
            if r.status_code == 200:
                logger.debug("Heartbeat OK")
            elif r.status_code == 401:
                logger.error("Token invalid; re-enroll required")
        except Exception as e:
            logger.exception("Heartbeat error: %s", e)
        time.sleep(HEARTBEAT_INTERVAL)

def get_software_list():
    try:
        r = subprocess.run(
            ["wmic", "product", "get", "name,version", "/format:csv"],
            capture_output=True, text=True, timeout=60,
            creationflags=subprocess.CREATE_NO_WINDOW)
        if r.returncode != 0 or not r.stdout: return []
        lines = [l.strip() for l in r.stdout.strip().splitlines() if l.strip()]
        if len(lines) < 2: return []
        keys = [k.strip() for k in lines[0].split(",")]
        ni = next((i for i,k in enumerate(keys) if "name" in k.lower()), 0)
        vi = next((i for i,k in enumerate(keys) if "version" in k.lower()), 1)
        result = []
        for line in lines[1:]:
            parts = [p.strip() for p in line.split(",")]
            if len(parts) > max(ni,vi) and parts[ni]:
                result.append({"app_name": parts[ni][:256],
                               "version": str(parts[vi] if vi < len(parts) else "")[:128]})
        return result[:500]
    except Exception as e:
        logger.warning("Software list failed: %s", e)
        return []

def get_top_processes(limit=20):
    result = []
    try:
        procs = []
        for p in psutil.process_iter(["name","cpu_percent","memory_info"]):
            try:
                pi  = p.info
                mem = (pi.get("memory_info") or type("M",(),{"rss":0})()).rss
                procs.append((pi.get("name") or p.name(), pi.get("cpu_percent") or 0, mem/1048576))
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
        procs.sort(key=lambda x: x[2], reverse=True)
        for name, cpu, ram in procs[:limit]:
            result.append({"process_name": (name or "unknown")[:256],
                           "cpu_pct": round(cpu,2), "ram_mb": round(ram,2)})
    except Exception as e:
        logger.warning("Process list failed: %s", e)
    return result

def inventory_loop(api_url, token, anon_key):
    while True:
        time.sleep(INVENTORY_INTERVAL)
        try:
            r = retry_request(requests.post, f"{api_url}/inventory",
                json={"software": get_software_list(), "processes": get_top_processes()},
                headers={"Content-Type": "application/json",
                         "apikey": anon_key,
                         "Authorization": f"Bearer {token}"},
                timeout=60)
            if r.status_code == 200: logger.info("Inventory sent OK")
        except Exception as e:
            logger.exception("Inventory error: %s", e)

def main():
    config  = load_config()
    api_url = (config.get("api_url") or "").rstrip("/")
    if not api_url:
        logger.error("config.json missing api_url"); sys.exit(1)
    if not config.get("device_token") or not config.get("device_id"):
        logger.info("Enrolling device...")
        if not enroll(api_url, config):
            logger.error("Enrollment failed."); sys.exit(1)
    token    = config.get("device_token")
    anon_key = config.get("anon_key", "")
    logger.info("Agent running — device_id=%s", config.get("device_id"))
    threading.Thread(target=inventory_loop, args=(api_url, token, anon_key), daemon=True).start()
    heartbeat_loop(api_url, token, anon_key)

if __name__ == "__main__":
    main()
'@
[System.IO.File]::WriteAllText($AgentPy, $agentCode, [System.Text.UTF8Encoding]::new($false))
Write-Host "         agent_windows.py written." -ForegroundColor Green

# ── Step 4: Check / Install Python ───────────────────────────────────────────
Write-Host "  [4/5] Checking Python..." -ForegroundColor White
$python = $null
foreach ($cmd in @("python", "python3", "py")) {
    try {
        $v = & $cmd --version 2>&1
        if ($v -match "Python 3") { $python = $cmd; break }
    } catch {}
}

if (-not $python) {
    Write-Host "         Python not found — installing via winget..." -ForegroundColor Yellow
    try {
        winget install --id Python.Python.3.11 --silent --accept-package-agreements --accept-source-agreements
        $env:PATH += ";" + [System.Environment]::GetEnvironmentVariable("PATH","User")
        $python = "python"
    } catch {
        Write-Host "         Downloading Python 3.11 installer..." -ForegroundColor Yellow
        $setup = "$env:TEMP\py_setup.exe"
        Invoke-WebRequest "https://www.python.org/ftp/python/3.11.9/python-3.11.9-amd64.exe" -OutFile $setup -UseBasicParsing
        Start-Process $setup -ArgumentList "/quiet InstallAllUsers=0 PrependPath=1" -Wait
        Remove-Item $setup -ErrorAction SilentlyContinue
        $env:PATH += ";" + [System.Environment]::GetEnvironmentVariable("PATH","User")
        $python = "python"
    }
}

$ver = & $python --version 2>&1
Write-Host "         $ver" -ForegroundColor Green

Write-Host "         Installing psutil + requests..." -ForegroundColor White
& $python -m pip install --quiet --upgrade pip 2>&1 | Out-Null
& $python -m pip install --quiet psutil requests
if ($LASTEXITCODE -ne 0) {
    Write-Host "  [ERROR] pip install failed." -ForegroundColor Red
    Read-Host "Press Enter to exit"; exit 1
}
Write-Host "         Dependencies ready." -ForegroundColor Green

# ── Step 5: Auto-start via Registry (no admin needed) ────────────────────────
Write-Host "  [5/5] Registering auto-start..." -ForegroundColor White
$pythonDir = Split-Path (& $python -c "import sys; print(sys.executable)") -Parent
$pythonw   = Join-Path $pythonDir "pythonw.exe"
if (-not (Test-Path $pythonw)) { $pythonw = & $python -c "import sys; print(sys.executable)" }

$regPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Run"
Set-ItemProperty -Path $regPath -Name "SparrowShieldAgent" -Value "`"$pythonw`" `"$AgentPy`"" -ErrorAction SilentlyContinue
Write-Host "         Auto-start registered (runs on every login)." -ForegroundColor Green

# ── Launch agent now ──────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  Starting agent..." -ForegroundColor White
Start-Process -FilePath $pythonw -ArgumentList "`"$AgentPy`"" -WindowStyle Hidden
Start-Sleep -Seconds 4

# Show log output
$logFile = "$InstallDir\agent.log"
if (Test-Path $logFile) {
    Write-Host ""
    Write-Host "  Agent log:" -ForegroundColor Cyan
    Get-Content $logFile -Tail 5 | ForEach-Object { Write-Host "    $_" -ForegroundColor Gray }
}

Write-Host ""
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host "   Done! Device will appear in dashboard now." -ForegroundColor Green
Write-Host ""
Write-Host "   Install : $InstallDir" -ForegroundColor White
Write-Host "   Log     : $logFile" -ForegroundColor White
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host ""
Read-Host "Press Enter to close"
