#Requires -Version 5
<#
.SYNOPSIS
    SparrowShield Agent - One-Click Installer
.DESCRIPTION
    Installs Python, dependencies, writes the agent, registers auto-start task,
    and launches the agent - all in one script.
.NOTES
    Right-click this file → "Run with PowerShell"
    OR from an Admin PowerShell: .\SparrowShield-Install.ps1
#>

# ── Self-elevate to Administrator ─────────────────────────────────────────────
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]"Administrator")) {
    Write-Host "Requesting Administrator privileges..." -ForegroundColor Yellow
    Start-Process powershell -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`"" -Verb RunAs
    exit
}

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host "   SparrowShield Agent - One-Click Installer" -ForegroundColor Cyan
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host ""

# ── Paths ─────────────────────────────────────────────────────────────────────
$InstallDir  = "$env:ProgramData\SparrowShield"
$AgentPy     = "$InstallDir\agent_windows.py"
$ConfigJson  = "$InstallDir\config.json"
$TaskName    = "SparrowShieldAgent"

New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null

# ── Step 1: Write config.json ─────────────────────────────────────────────────
Write-Host "  [1/5] Writing config..." -ForegroundColor White
$config = @{
    api_url      = "https://hevcfhxmjgbpozqtescm.supabase.co/functions/v1"
    anon_key     = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhldmNmaHhtamdicG96cXRlc2NtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyMjk4NDYsImV4cCI6MjA4NjgwNTg0Nn0.CaXbG8F54bXV0_biNka7vp6Cl1s7vvQsRogNoz7jB28"
    device_id    = ""
    device_token = ""
}
$configJson = $config | ConvertTo-Json
[System.IO.File]::WriteAllText($ConfigJson, $configJson, [System.Text.UTF8Encoding]::new($false))
Write-Host "       config.json written." -ForegroundColor Green

# ── Step 2: Write agent_windows.py ───────────────────────────────────────────
Write-Host "  [2/5] Writing agent script..." -ForegroundColor White

$agentCode = @'
#!/usr/bin/env python3
"""SparrowShield Windows Agent"""
import json, logging, os, platform, subprocess, sys, threading, time
from pathlib import Path
import psutil, requests

LOG_DIR = os.environ.get("ProgramData", "C:\\ProgramData")
LOG_PATH = os.path.join(LOG_DIR, "HealSparrow", "agent.log")
CONFIG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.json")
HEARTBEAT_INTERVAL = 300
INVENTORY_INTERVAL = 3600

def setup_logging():
    try:
        Path(LOG_DIR, "HealSparrow").mkdir(parents=True, exist_ok=True)
    except OSError:
        pass
    try:
        logging.basicConfig(
            level=logging.INFO,
            format="%(asctime)s [%(levelname)s] %(message)s",
            handlers=[logging.FileHandler(LOG_PATH, encoding="utf-8"),
                      logging.StreamHandler(sys.stderr)])
    except OSError:
        logging.basicConfig(level=logging.INFO,
            format="%(asctime)s [%(levelname)s] %(message)s",
            handlers=[logging.StreamHandler(sys.stderr)])
    return logging.getLogger(__name__)

logger = setup_logging()

def load_config():
    path = Path(CONFIG_PATH)
    if not path.exists():
        return {}
    try:
        with open(path, "r", encoding="utf-8-sig") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError) as e:
        logger.warning("Could not load config: %s", e)
        return {}

def save_config(config):
    try:
        with open(CONFIG_PATH, "w", encoding="utf-8") as f:
            json.dump(config, f, indent=2)
    except OSError as e:
        logger.error("Could not save config: %s", e)

def get_windows_serial():
    try:
        r = subprocess.run(
            ["wmic", "bios", "get", "serialnumber"],
            capture_output=True, text=True, timeout=10,
            creationflags=subprocess.CREATE_NO_WINDOW)
        if r.returncode == 0 and r.stdout:
            lines = [l.strip() for l in r.stdout.strip().splitlines() if l.strip()]
            if len(lines) >= 2:
                return lines[-1] or "unknown"
    except (subprocess.TimeoutExpired, FileNotFoundError):
        pass
    return "unknown"

def enroll(api_url, config):
    cpu_model = platform.processor() or "unknown"
    try:
        r = subprocess.run(
            ["wmic", "cpu", "get", "Name", "/format:value"],
            capture_output=True, text=True, timeout=10,
            creationflags=subprocess.CREATE_NO_WINDOW)
        for line in r.stdout.splitlines():
            if line.startswith("Name=") and line[5:].strip():
                cpu_model = line[5:].strip()
                break
    except (subprocess.TimeoutExpired, FileNotFoundError):
        pass
    body = {
        "hostname": platform.node(),
        "serial_number": get_windows_serial(),
        "os_type": "windows",
        "os_version": platform.win32_ver()[1] or platform.release(),
        "assigned_user": os.environ.get("USERNAME", ""),
        "department": "",
        "cpu_model": cpu_model,
        "cpu_cores": psutil.cpu_count(logical=False) or psutil.cpu_count(),
        "ram_total_gb": round(psutil.virtual_memory().total / (1024 ** 3), 2),
    }
    anon_key = config.get("anon_key", "")
    hdrs = {
        "Content-Type": "application/json",
        "apikey": anon_key,
        "Authorization": f"Bearer {anon_key}",
    }
    for attempt in range(3):
        try:
            r = requests.post(f"{api_url}/enroll", json=body, headers=hdrs, timeout=30)
            data = r.json()
            if r.status_code == 200 and data.get("success") and data.get("data"):
                d = data["data"]
                config["device_id"] = str(d["device_id"])
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
            if r.status_code in (200, 201, 204):
                return r
            if r.status_code in (401, 403, 404):
                return r
            last_error = r.text
        except requests.RequestException as e:
            last_error = e
        time.sleep(2 ** attempt)
    raise last_error

def get_bitlocker_status():
    try:
        r = subprocess.run(
            ["manage-bde", "-status", "C:"],
            capture_output=True, text=True, timeout=15,
            creationflags=subprocess.CREATE_NO_WINDOW)
        if r.returncode == 0:
            return "Protection On" in r.stdout or "Fully Encrypted" in r.stdout
    except (subprocess.TimeoutExpired, FileNotFoundError):
        pass
    return False

def get_firewall_status():
    try:
        r = subprocess.run(
            ["powershell", "-NoProfile", "-Command",
             "Get-NetFirewallProfile | Select-Object Name, Enabled"],
            capture_output=True, text=True, timeout=15,
            creationflags=subprocess.CREATE_NO_WINDOW)
        if r.returncode == 0 and r.stdout:
            for line in r.stdout.splitlines():
                if ("Domain" in line or "Private" in line or "Public" in line) and "True" in line:
                    return True
    except (subprocess.TimeoutExpired, FileNotFoundError):
        pass
    return False

def collect_metrics():
    vm = psutil.virtual_memory()
    disk = psutil.disk_usage("C:\\")
    cpu_pct = psutil.cpu_percent(interval=2)
    uptime_seconds = int(time.time() - psutil.boot_time())
    battery_health_pct = None
    if hasattr(psutil, "sensors_battery") and psutil.sensors_battery():
        battery_health_pct = getattr(psutil.sensors_battery(), "percent", None)
    return {
        "cpu_pct": round(cpu_pct, 2),
        "ram_pct": round(vm.percent, 2),
        "ram_total_gb": round(vm.total / (1024 ** 3), 2),
        "disk_pct": round(disk.percent, 2),
        "disk_total_gb": round(disk.total / (1024 ** 3), 2),
        "battery_health_pct": battery_health_pct,
        "battery_cycles": None,
        "uptime_seconds": uptime_seconds,
        "filevault_enabled": None,
        "bitlocker_enabled": get_bitlocker_status(),
        "firewall_enabled": get_firewall_status(),
    }

def heartbeat_loop(api_url, token, anon_key=""):
    while True:
        try:
            r = retry_request(
                requests.post, f"{api_url}/heartbeat",
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
            logger.exception("Heartbeat failed: %s", e)
        time.sleep(HEARTBEAT_INTERVAL)

def get_software_list():
    try:
        r = subprocess.run(
            ["wmic", "product", "get", "name,version", "/format:csv"],
            capture_output=True, text=True, timeout=60,
            creationflags=subprocess.CREATE_NO_WINDOW)
        if r.returncode != 0 or not r.stdout:
            return []
        lines = [l.strip() for l in r.stdout.strip().splitlines() if l.strip()]
        if len(lines) < 2:
            return []
        keys = [k.strip() for k in lines[0].split(",")]
        ni = next((i for i, k in enumerate(keys) if "name" in k.lower()), 0)
        vi = next((i for i, k in enumerate(keys) if "version" in k.lower()), 1)
        result = []
        for line in lines[1:]:
            parts = [p.strip() for p in line.split(",")]
            if len(parts) > max(ni, vi) and parts[ni]:
                result.append({"app_name": parts[ni][:256],
                               "version": str(parts[vi] if vi < len(parts) else "")[:128]})
        return result[:500]
    except (subprocess.TimeoutExpired, FileNotFoundError) as e:
        logger.warning("Software inventory failed: %s", e)
        return []

def get_top_processes(limit=20):
    result = []
    try:
        procs = []
        for p in psutil.process_iter(["name", "cpu_percent", "memory_info"]):
            try:
                pi = p.info
                mem = (pi.get("memory_info") or type("M", (), {"rss": 0})()).rss
                procs.append((pi.get("name") or p.name(), pi.get("cpu_percent") or 0, mem / 1048576))
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
        procs.sort(key=lambda x: x[2], reverse=True)
        for name, cpu, ram in procs[:limit]:
            result.append({"process_name": (name or "unknown")[:256],
                           "cpu_pct": round(cpu, 2), "ram_mb": round(ram, 2)})
    except Exception as e:
        logger.warning("Process list failed: %s", e)
    return result

def inventory_loop(api_url, token, anon_key=""):
    while True:
        time.sleep(INVENTORY_INTERVAL)
        try:
            r = retry_request(
                requests.post, f"{api_url}/inventory",
                json={"software": get_software_list(), "processes": get_top_processes(20)},
                headers={"Content-Type": "application/json",
                         "apikey": anon_key,
                         "Authorization": f"Bearer {token}"},
                timeout=60)
            if r.status_code == 200:
                logger.info("Inventory sent OK")
            elif r.status_code == 401:
                logger.error("Token invalid; re-enroll required")
        except Exception as e:
            logger.exception("Inventory failed: %s", e)

def main():
    config = load_config()
    api_url = (config.get("api_url") or "").rstrip("/")
    if not api_url:
        logger.error("config.json missing api_url")
        sys.exit(1)
    if not config.get("device_token") or not config.get("device_id"):
        logger.info("Enrolling device...")
        if not enroll(api_url, config):
            logger.error("Enrollment failed. Check api_url and network.")
            sys.exit(1)
    token = config.get("device_token")
    anon_key = config.get("anon_key", "")
    logger.info("Agent started for device_id=%s", config.get("device_id"))
    t = threading.Thread(target=inventory_loop, args=(api_url, token, anon_key), daemon=True)
    t.start()
    heartbeat_loop(api_url, token, anon_key)

if __name__ == "__main__":
    main()
'@

[System.IO.File]::WriteAllText($AgentPy, $agentCode, [System.Text.Encoding]::UTF8)
Write-Host "       agent_windows.py written." -ForegroundColor Green

# ── Step 3: Check / Install Python ───────────────────────────────────────────
Write-Host "  [3/5] Checking Python..." -ForegroundColor White
$python = $null
foreach ($cmd in @("python", "python3", "py")) {
    try {
        $ver = & $cmd --version 2>&1
        if ($ver -match "Python 3") { $python = $cmd; break }
    } catch {}
}

if (-not $python) {
    Write-Host "       Python not found. Installing via winget..." -ForegroundColor Yellow
    try {
        winget install --id Python.Python.3.11 --silent --accept-package-agreements --accept-source-agreements
        $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH", "Machine") + ";" + $env:PATH
        $python = "python"
    } catch {
        Write-Host "       winget failed. Downloading Python 3.11 installer..." -ForegroundColor Yellow
        $pySetup = "$env:TEMP\python_setup.exe"
        Invoke-WebRequest -Uri "https://www.python.org/ftp/python/3.11.9/python-3.11.9-amd64.exe" -OutFile $pySetup -UseBasicParsing
        Start-Process -FilePath $pySetup -ArgumentList "/quiet InstallAllUsers=1 PrependPath=1" -Wait
        Remove-Item $pySetup -ErrorAction SilentlyContinue
        $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH", "Machine") + ";" + $env:PATH
        $python = "python"
    }
}

try {
    $ver = & $python --version 2>&1
    Write-Host "       $ver" -ForegroundColor Green
} catch {
    Write-Host "  [ERROR] Python not available. Install Python 3 from python.org and re-run." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

# ── Step 4: Install pip packages ─────────────────────────────────────────────
Write-Host "  [4/5] Installing dependencies (psutil, requests)..." -ForegroundColor White
& $python -m pip install --quiet --upgrade pip | Out-Null
& $python -m pip install --quiet psutil requests
if ($LASTEXITCODE -ne 0) {
    Write-Host "  [ERROR] pip install failed. Check your internet connection." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}
Write-Host "       Dependencies installed." -ForegroundColor Green

# ── Step 5: Register Scheduled Task ──────────────────────────────────────────
Write-Host "  [5/5] Registering startup task..." -ForegroundColor White

# Find pythonw.exe for silent background execution
$pythonDir = Split-Path (& $python -c "import sys; print(sys.executable)" 2>&1) -Parent
$pythonw   = Join-Path $pythonDir "pythonw.exe"
if (-not (Test-Path $pythonw)) { $pythonw = & $python -c "import sys; print(sys.executable)" }

try {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
    $action   = New-ScheduledTaskAction -Execute $pythonw -Argument "`"$AgentPy`""
    $trigger  = New-ScheduledTaskTrigger -AtLogOn
    $settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit 0 -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
    $principal= New-ScheduledTaskPrincipal -UserId $env:USERNAME -RunLevel Highest
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
    Write-Host "       Auto-start registered (runs on every login)." -ForegroundColor Green
} catch {
    Write-Host "       Could not register task: $_" -ForegroundColor Yellow
}

# ── Launch agent now ──────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  Starting SparrowShield agent..." -ForegroundColor White
Start-Process -FilePath $pythonw -ArgumentList "`"$AgentPy`"" -WindowStyle Hidden
Start-Sleep -Seconds 3

Write-Host ""
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host "   Installation complete!" -ForegroundColor Green
Write-Host ""
Write-Host "   Install path : $InstallDir" -ForegroundColor White
Write-Host "   Log file     : $env:ProgramData\HealSparrow\agent.log" -ForegroundColor White
Write-Host "   Auto-start   : On every Windows login" -ForegroundColor White
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host ""
Read-Host "Press Enter to close"
