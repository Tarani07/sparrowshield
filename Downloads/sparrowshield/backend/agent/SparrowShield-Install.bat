@echo off
setlocal EnableDelayedExpansion
title SparrowShield Agent Installer
echo.
echo  ============================================
echo   SparrowShield Agent - One-Click Installer
echo  ============================================
echo.

:: Run as Administrator
net session >nul 2>&1
if %errorLevel% NEQ 0 (
    echo  Requesting Administrator privileges...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b
)

set INSTALL_DIR=%ProgramData%\SparrowShield
set AGENT_PY=%INSTALL_DIR%\agent_windows.py
set CONFIG_JSON=%INSTALL_DIR%\config.json
set TASK_NAME=SparrowShieldAgent

if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"

:: ── Step 1: Write config.json ─────────────────────────────────────────────────
echo  [1/5] Writing config...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
 "$c = [ordered]@{ api_url='https://hevcfhxmjgbpozqtescm.supabase.co/functions/v1'; anon_key='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhldmNmaHhtamdicG96cXRlc2NtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyMjk4NDYsImV4cCI6MjA4NjgwNTg0Nn0.CaXbG8F54bXV0_biNka7vp6Cl1s7vvQsRogNoz7jB28'; device_id=''; device_token='' }; $c | ConvertTo-Json | Set-Content -Path '%CONFIG_JSON%' -Encoding UTF8"

:: ── Step 2: Write agent_windows.py ───────────────────────────────────────────
echo  [2/5] Writing agent script...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
 "$code = @'" ^& echo. ^& ^
"#!/usr/bin/env python3" ^& echo. ^& ^
"'@; Set-Content -Path '%AGENT_PY%' -Value '' -Encoding UTF8"

:: Write Python source via PowerShell here-string (most reliable for special chars)
set PS_TMP=%TEMP%\ss_write_agent.ps1
(
echo $dest = '%AGENT_PY%'
echo $code = @'
echo #!/usr/bin/env python3
echo """SparrowShield Windows Agent"""
echo import json, logging, os, platform, subprocess, sys, threading, time
echo from pathlib import Path
echo import psutil, requests
echo.
echo LOG_DIR = os.environ.get("ProgramData", "C:\\ProgramData")
echo LOG_PATH = os.path.join(LOG_DIR, "HealSparrow", "agent.log")
echo CONFIG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.json")
echo HEARTBEAT_INTERVAL = 300
echo INVENTORY_INTERVAL = 3600
echo.
echo def setup_logging():
echo     try:
echo         Path(LOG_DIR, "HealSparrow").mkdir(parents=True, exist_ok=True)
echo     except OSError:
echo         pass
echo     try:
echo         logging.basicConfig(level=logging.INFO,
echo             format="%(asctime)s [%(levelname)s] %(message)s",
echo             handlers=[logging.FileHandler(LOG_PATH, encoding="utf-8"),
echo                       logging.StreamHandler(sys.stderr)])
echo     except OSError:
echo         logging.basicConfig(level=logging.INFO,
echo             format="%(asctime)s [%(levelname)s] %(message)s",
echo             handlers=[logging.StreamHandler(sys.stderr)])
echo     return logging.getLogger(__name__)
echo.
echo logger = setup_logging()
echo.
echo def load_config():
echo     path = Path(CONFIG_PATH)
echo     if not path.exists():
echo         return {}
echo     try:
echo         with open(path, "r", encoding="utf-8") as f:
echo             return json.load(f)
echo     except (json.JSONDecodeError, OSError) as e:
echo         logger.warning("Could not load config: %%s", e)
echo         return {}
echo.
echo def save_config(config):
echo     try:
echo         with open(CONFIG_PATH, "w", encoding="utf-8") as f:
echo             json.dump(config, f, indent=2)
echo     except OSError as e:
echo         logger.error("Could not save config: %%s", e)
echo.
echo def get_windows_serial():
echo     try:
echo         r = subprocess.run(["wmic", "bios", "get", "serialnumber"],
echo             capture_output=True, text=True, timeout=10,
echo             creationflags=subprocess.CREATE_NO_WINDOW)
echo         if r.returncode == 0 and r.stdout:
echo             lines = [l.strip() for l in r.stdout.strip().splitlines() if l.strip()]
echo             if len(lines) >= 2:
echo                 return lines[-1] or "unknown"
echo     except (subprocess.TimeoutExpired, FileNotFoundError):
echo         pass
echo     return "unknown"
echo.
echo def enroll(api_url, config):
echo     cpu_model = platform.processor() or "unknown"
echo     try:
echo         r = subprocess.run(["wmic", "cpu", "get", "Name", "/format:value"],
echo             capture_output=True, text=True, timeout=10,
echo             creationflags=subprocess.CREATE_NO_WINDOW)
echo         for line in r.stdout.splitlines():
echo             if line.startswith("Name=") and line[5:].strip():
echo                 cpu_model = line[5:].strip(); break
echo     except (subprocess.TimeoutExpired, FileNotFoundError):
echo         pass
echo     body = {
echo         "hostname": platform.node(),
echo         "serial_number": get_windows_serial(),
echo         "os_type": "windows",
echo         "os_version": platform.win32_ver()[1] or platform.release(),
echo         "assigned_user": os.environ.get("USERNAME", ""),
echo         "department": "",
echo         "cpu_model": cpu_model,
echo         "cpu_cores": psutil.cpu_count(logical=False) or psutil.cpu_count(),
echo         "ram_total_gb": round(psutil.virtual_memory().total / (1024 ** 3), 2),
echo     }
echo     anon_key = config.get("anon_key", "")
echo     hdrs = {"Content-Type": "application/json", "apikey": anon_key,
echo             "Authorization": f"Bearer {anon_key}"}
echo     for attempt in range(3):
echo         try:
echo             r = requests.post(f"{api_url}/enroll", json=body, headers=hdrs, timeout=30)
echo             data = r.json()
echo             if r.status_code == 200 and data.get("success") and data.get("data"):
echo                 d = data["data"]
echo                 config["device_id"] = str(d["device_id"])
echo                 config["device_token"] = d["token"]
echo                 save_config(config)
echo                 logger.info("Enrolled: device_id=%%s", config["device_id"])
echo                 return True
echo             logger.warning("Enroll failed: %%s %%s", r.status_code, data.get("error"))
echo         except Exception as e:
echo             logger.warning("Enroll attempt %%s failed: %%s", attempt + 1, e)
echo         time.sleep(2 ** attempt)
echo     return False
echo.
echo def retry_request(method, url, **kwargs):
echo     last_error = None
echo     for attempt in range(5):
echo         try:
echo             r = method(url, **kwargs)
echo             if r.status_code in (200, 201, 204): return r
echo             if r.status_code in (401, 403, 404): return r
echo             last_error = r.text
echo         except requests.RequestException as e:
echo             last_error = e
echo         time.sleep(2 ** attempt)
echo     raise last_error
echo.
echo def get_bitlocker_status():
echo     try:
echo         r = subprocess.run(["manage-bde", "-status", "C:"],
echo             capture_output=True, text=True, timeout=15,
echo             creationflags=subprocess.CREATE_NO_WINDOW)
echo         if r.returncode == 0:
echo             return "Protection On" in r.stdout or "Fully Encrypted" in r.stdout
echo     except (subprocess.TimeoutExpired, FileNotFoundError):
echo         pass
echo     return False
echo.
echo def get_firewall_status():
echo     try:
echo         r = subprocess.run(
echo             ["powershell", "-NoProfile", "-Command",
echo              "Get-NetFirewallProfile | Select-Object Name, Enabled"],
echo             capture_output=True, text=True, timeout=15,
echo             creationflags=subprocess.CREATE_NO_WINDOW)
echo         if r.returncode == 0 and r.stdout:
echo             for line in r.stdout.splitlines():
echo                 if ("Domain" in line or "Private" in line or "Public" in line) and "True" in line:
echo                     return True
echo     except (subprocess.TimeoutExpired, FileNotFoundError):
echo         pass
echo     return False
echo.
echo def collect_metrics():
echo     vm = psutil.virtual_memory()
echo     disk = psutil.disk_usage("C:\\")
echo     cpu_pct = psutil.cpu_percent(interval=2)
echo     uptime_seconds = int(time.time() - psutil.boot_time())
echo     battery_health_pct = None
echo     if hasattr(psutil, "sensors_battery") and psutil.sensors_battery():
echo         battery_health_pct = getattr(psutil.sensors_battery(), "percent", None)
echo     return {
echo         "cpu_pct": round(cpu_pct, 2),
echo         "ram_pct": round(vm.percent, 2),
echo         "ram_total_gb": round(vm.total / (1024 ** 3), 2),
echo         "disk_pct": round(disk.percent, 2),
echo         "disk_total_gb": round(disk.total / (1024 ** 3), 2),
echo         "battery_health_pct": battery_health_pct,
echo         "battery_cycles": None,
echo         "uptime_seconds": uptime_seconds,
echo         "filevault_enabled": None,
echo         "bitlocker_enabled": get_bitlocker_status(),
echo         "firewall_enabled": get_firewall_status(),
echo     }
echo.
echo def heartbeat_loop(api_url, token, anon_key=""):
echo     while True:
echo         try:
echo             r = retry_request(requests.post, f"{api_url}/heartbeat",
echo                 json=collect_metrics(),
echo                 headers={"Content-Type": "application/json",
echo                          "apikey": anon_key,
echo                          "Authorization": f"Bearer {token}"},
echo                 timeout=30)
echo             if r.status_code == 200: logger.debug("Heartbeat OK")
echo             elif r.status_code == 401: logger.error("Token invalid; re-enroll required")
echo         except Exception as e:
echo             logger.exception("Heartbeat failed: %%s", e)
echo         time.sleep(HEARTBEAT_INTERVAL)
echo.
echo def get_software_list():
echo     try:
echo         r = subprocess.run(
echo             ["wmic", "product", "get", "name,version", "/format:csv"],
echo             capture_output=True, text=True, timeout=60,
echo             creationflags=subprocess.CREATE_NO_WINDOW)
echo         if r.returncode != 0 or not r.stdout: return []
echo         lines = [l.strip() for l in r.stdout.strip().splitlines() if l.strip()]
echo         if len(lines) < 2: return []
echo         keys = [k.strip() for k in lines[0].split(",")]
echo         ni = next((i for i,k in enumerate(keys) if "name" in k.lower()), 0)
echo         vi = next((i for i,k in enumerate(keys) if "version" in k.lower()), 1)
echo         result = []
echo         for line in lines[1:]:
echo             parts = [p.strip() for p in line.split(",")]
echo             if len(parts) > max(ni, vi) and parts[ni]:
echo                 result.append({"app_name": parts[ni][:256],
echo                                "version": str(parts[vi] if vi < len(parts) else "")[:128]})
echo         return result[:500]
echo     except (subprocess.TimeoutExpired, FileNotFoundError) as e:
echo         logger.warning("Software inventory failed: %%s", e)
echo         return []
echo.
echo def get_top_processes(limit=20):
echo     result = []
echo     try:
echo         procs = []
echo         for p in psutil.process_iter(["name", "cpu_percent", "memory_info"]):
echo             try:
echo                 pi = p.info
echo                 mem = (pi.get("memory_info") or type("M",(),{"rss":0})()).rss
echo                 procs.append((pi.get("name") or p.name(), pi.get("cpu_percent") or 0, mem/1048576))
echo             except (psutil.NoSuchProcess, psutil.AccessDenied):
echo                 continue
echo         procs.sort(key=lambda x: x[2], reverse=True)
echo         for name, cpu, ram in procs[:limit]:
echo             result.append({"process_name": (name or "unknown")[:256],
echo                            "cpu_pct": round(cpu, 2), "ram_mb": round(ram, 2)})
echo     except Exception as e:
echo         logger.warning("Process list failed: %%s", e)
echo     return result
echo.
echo def inventory_loop(api_url, token, anon_key=""):
echo     while True:
echo         time.sleep(INVENTORY_INTERVAL)
echo         try:
echo             r = retry_request(requests.post, f"{api_url}/inventory",
echo                 json={"software": get_software_list(), "processes": get_top_processes(20)},
echo                 headers={"Content-Type": "application/json",
echo                          "apikey": anon_key,
echo                          "Authorization": f"Bearer {token}"},
echo                 timeout=60)
echo             if r.status_code == 200: logger.info("Inventory sent OK")
echo             elif r.status_code == 401: logger.error("Token invalid; re-enroll required")
echo         except Exception as e:
echo             logger.exception("Inventory failed: %%s", e)
echo.
echo def main():
echo     config = load_config()
echo     api_url = (config.get("api_url") or "").rstrip("/")
echo     if not api_url:
echo         logger.error("config.json missing api_url")
echo         sys.exit(1)
echo     if not config.get("device_token") or not config.get("device_id"):
echo         logger.info("Enrolling device...")
echo         if not enroll(api_url, config):
echo             logger.error("Enrollment failed. Check api_url and network.")
echo             sys.exit(1)
echo     token = config.get("device_token")
echo     anon_key = config.get("anon_key", "")
echo     logger.info("Agent started for device_id=%%s", config.get("device_id"))
echo     t = threading.Thread(target=inventory_loop, args=(api_url, token, anon_key), daemon=True)
echo     t.start()
echo     heartbeat_loop(api_url, token, anon_key)
echo.
echo if __name__ == "__main__":
echo     main()
echo '@
echo Set-Content -Path $dest -Value $code -Encoding UTF8
) > "%PS_TMP%"
powershell -NoProfile -ExecutionPolicy Bypass -File "%PS_TMP%"
del "%PS_TMP%" >nul 2>&1

:: ── Step 3: Check / Install Python ───────────────────────────────────────────
echo  [3/5] Checking Python...
python --version >nul 2>&1
if %errorLevel% NEQ 0 (
    echo      Python not found - installing via winget...
    winget install --id Python.Python.3.11 --silent --accept-package-agreements --accept-source-agreements
    if %errorLevel% NEQ 0 (
        echo      winget failed - downloading Python 3.11 installer...
        powershell -NoProfile -ExecutionPolicy Bypass -Command ^
          "Invoke-WebRequest -Uri 'https://www.python.org/ftp/python/3.11.9/python-3.11.9-amd64.exe' -OutFile '%TEMP%\python_setup.exe' -UseBasicParsing"
        "%TEMP%\python_setup.exe" /quiet InstallAllUsers=1 PrependPath=1
        del "%TEMP%\python_setup.exe" >nul 2>&1
    )
    :: Refresh PATH after install
    for /f "usebackq tokens=*" %%i in (`powershell -NoProfile -Command "[Environment]::GetEnvironmentVariable('PATH','Machine')"`) do set PATH=%%i;%PATH%
)
python --version >nul 2>&1
if %errorLevel% NEQ 0 (
    echo  [ERROR] Python not found after install. Please install Python 3.11 manually from python.org and re-run.
    pause & exit /b 1
)

:: ── Step 4: Install pip packages ─────────────────────────────────────────────
echo  [4/5] Installing dependencies...
python -m pip install --quiet --upgrade pip >nul 2>&1
python -m pip install --quiet psutil requests
if %errorLevel% NEQ 0 (
    echo  [ERROR] Failed to install dependencies. Check your internet connection.
    pause & exit /b 1
)

:: ── Step 5: Register Windows Scheduled Task ───────────────────────────────────
echo  [5/5] Registering startup task...
schtasks /query /tn "%TASK_NAME%" >nul 2>&1
if %errorLevel% EQU 0 schtasks /delete /tn "%TASK_NAME%" /f >nul 2>&1

schtasks /create ^
  /tn "%TASK_NAME%" ^
  /tr "pythonw \"%AGENT_PY%\"" ^
  /sc ONLOGON ^
  /rl HIGHEST ^
  /f >nul 2>&1

if %errorLevel% EQU 0 (
    echo      Auto-start registered - agent will run on every login.
) else (
    echo      Could not register task - start the agent manually if needed.
)

:: ── Launch agent now ──────────────────────────────────────────────────────────
echo.
echo  Starting SparrowShield agent...
start "" pythonw "%AGENT_PY%"
timeout /t 3 >nul

echo.
echo  ============================================
echo   Done! SparrowShield agent is running.
echo.
echo   Install path : %INSTALL_DIR%
echo   Log file     : %ProgramData%\HealSparrow\agent.log
echo   Auto-start   : On every Windows login
echo  ============================================
echo.
pause
