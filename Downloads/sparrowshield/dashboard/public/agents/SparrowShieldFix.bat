@echo off
:: SparrowShield — Quick Fix Script
:: Run as Administrator. Re-downloads main.py with device registration fix.

setlocal enabledelayedexpansion
title SparrowShield Fix
color 0A

echo.
echo  ================================================================
echo   SparrowShield EDR — Device Registration Fix
echo  ================================================================
echo   This updates main.py so your Windows device appears in the
echo   dashboard. Previous sensor files are preserved.
echo  ================================================================
echo.

:: Check admin
net session >nul 2>&1
if %errorlevel% NEQ 0 (
    echo  [!] Run as Administrator.
    pause & exit /b 1
)

set INSTALL_DIR=C:\ProgramData\SparrowShield
if not exist "%INSTALL_DIR%" (
    echo  [!] SparrowShield not installed. Run SparrowShieldInstaller.bat first.
    pause & exit /b 1
)

:: Stop the running sensor
echo  [1/4] Stopping sensor ...
schtasks /end /tn "SparrowShield EDR" >nul 2>&1
timeout /t 2 /nobreak >nul

:: Re-download main.py (has the device registration fix)
echo  [2/4] Downloading updated main.py ...
set BASE=https://raw.githubusercontent.com/Tarani07/sparrowshield/claude/sweet-pare/Downloads/sparrowshield/sensor/windows
curl -s -L -o "%INSTALL_DIR%\main.py" "%BASE%/main.py"
if %errorlevel% NEQ 0 (
    echo  [!] Download failed. Check internet connection.
    pause & exit /b 1
)
echo        main.py updated.

:: Also update ocsf_builder and supabase_shipper (have MITRE enrichment)
echo  [3/4] Updating sensor modules ...
curl -s -L -o "%INSTALL_DIR%\ocsf_builder.py"    "%BASE%/ocsf_builder.py"
curl -s -L -o "%INSTALL_DIR%\supabase_shipper.py" "%BASE%/supabase_shipper.py"

:: Restart the sensor
echo  [4/4] Restarting sensor ...
schtasks /run /tn "SparrowShield EDR"
timeout /t 3 /nobreak >nul

echo.
echo  Checking if sensor started ...
tasklist /fi "imagename eq python.exe" /fo csv 2>nul | find /i "python.exe" >nul
if %errorlevel% EQU 0 (
    echo  [OK] Sensor is running.
) else (
    echo  [!] Process not detected. Check: %INSTALL_DIR%\sensor.log
)

echo.
echo  ================================================================
echo   Fix applied!
echo.
echo   Your device should appear in the dashboard within 30 seconds.
echo   Logs: %INSTALL_DIR%\sensor.log
echo  ================================================================
echo.
pause
