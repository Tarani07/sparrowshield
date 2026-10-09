@echo off
:: SparrowShield EDR Sensor — Windows Installer
:: Run as Administrator. Requires internet access.
:: Installs Python sensor as a Windows service.

setlocal enabledelayedexpansion
title SparrowShield EDR Installer
color 0A

echo.
echo  ================================================================
echo   SparrowShield EDR — Windows Sensor Installer
echo  ================================================================
echo.

:: Check admin
net session >nul 2>&1
if %errorlevel% NEQ 0 (
    echo  [!] This script must be run as Administrator.
    echo      Right-click ^> "Run as administrator"
    pause & exit /b 1
)

:: Check Python
python --version >nul 2>&1
if %errorlevel% NEQ 0 (
    echo  [1/5] Python not found. Downloading Python 3.11 ...
    curl -L -o "%TEMP%\python-3.11.9-amd64.exe" ^
        "https://www.python.org/ftp/python/3.11.9/python-3.11.9-amd64.exe"
    echo        Installing Python silently ...
    "%TEMP%\python-3.11.9-amd64.exe" /quiet InstallAllUsers=1 PrependPath=1
    del "%TEMP%\python-3.11.9-amd64.exe"
    :: Refresh PATH
    for /f "tokens=*" %%i in ('where python 2^>nul') do set PYTHON=%%i
) else (
    echo  [1/5] Python found.
    set PYTHON=python
)

:: Install dir
set INSTALL_DIR=C:\ProgramData\SparrowShield
echo  [2/5] Creating install directory: %INSTALL_DIR%
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"
if not exist "%INSTALL_DIR%\quarantine" mkdir "%INSTALL_DIR%\quarantine"
if not exist "%INSTALL_DIR%\logs" mkdir "%INSTALL_DIR%\logs"

:: Install pip dependencies
echo  [3/5] Installing Python dependencies ...
python -m pip install --quiet requests psutil wmi pywin32 onnxruntime

:: Download sensor files from GitHub
echo  [4/5] Downloading sensor files ...
set BASE=https://raw.githubusercontent.com/Tarani07/sparrowshield/claude/sweet-pare/Downloads/sparrowshield/sensor/windows

for %%f in (
    main.py
    etw_sensor.py
    etw_file_sensor.py
    etw_network_sensor.py
    vss_guard.py
    ocsf_builder.py
    response_engine.py
    supabase_shipper.py
    sensor_entry.py
    watchdog.py
    windows_service.py
) do (
    curl -s -L -o "%INSTALL_DIR%\%%f" "%BASE%/%%f"
    echo         Downloaded %%f
)

:: Download ONNX model
set ML_BASE=https://raw.githubusercontent.com/Tarani07/sparrowshield/claude/sweet-pare/Downloads/sparrowshield/sensor/ml
if not exist "%INSTALL_DIR%\ml" mkdir "%INSTALL_DIR%\ml"
curl -s -L -o "%INSTALL_DIR%\ml\feature_extractor.py" "%ML_BASE%/feature_extractor.py"
curl -s -L -o "%INSTALL_DIR%\ml\onnx_scorer.py"       "%ML_BASE%/onnx_scorer.py"
curl -s -L -o "%INSTALL_DIR%\ml\threat_model.onnx"    "%ML_BASE%/threat_model.onnx"

:: Write config
echo  [5/5] Writing config.json ...
(
echo {
echo   "supabase_url": "https://hevcfhxmjgbpozqtescm.supabase.co",
echo   "anon_key": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhldmNmaHhtamdicG96cXRlc2NtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyMjk4NDYsImV4cCI6MjA4NjgwNTg0Nn0.CaXbG8F54bXV0_biNka7vp6Cl1s7vvQsRogNoz7jB28",
echo   "device_uid": "",
echo   "log_level": "INFO",
echo   "batch_interval_s": 5,
echo   "offline_max_events": 50000
echo }
) > "%INSTALL_DIR%\config.json"

:: Register as Windows service
echo.
echo  Registering SparrowShield as a Windows service ...
sc stop  SparrowShield >nul 2>&1
sc delete SparrowShield >nul 2>&1
sc create SparrowShield ^
    binPath= "python \"%INSTALL_DIR%\sensor_entry.py\" --service" ^
    start= auto ^
    DisplayName= "SparrowShield EDR Sensor"
sc description SparrowShield "SparrowShield real-time endpoint detection and response sensor"
sc start SparrowShield

echo.
echo  ================================================================
echo   Install complete!
echo.
echo   Service: SparrowShield (auto-starts on boot)
echo   Logs:    %INSTALL_DIR%\logs\
echo   Config:  %INSTALL_DIR%\config.json
echo.
echo   Check status:   sc query SparrowShield
echo   Stop service:   sc stop SparrowShield
echo   Uninstall:      sc stop SparrowShield ^&^& sc delete SparrowShield
echo  ================================================================
echo.
pause
