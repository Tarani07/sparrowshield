@echo off
:: SparrowShield Windows Sensor — Full Service Installer
:: Run as Administrator

setlocal

set INSTALL_DIR=C:\SparrowShield
set DATA_DIR=C:\ProgramData\SparrowShield

echo.
echo  ================================================================
echo   SparrowShield EDR Sensor — Windows Service Installer
echo  ================================================================
echo.

:: Check admin
net session >NUL 2>&1
if %errorlevel% NEQ 0 (
    echo ERROR: This installer must be run as Administrator.
    pause & exit /b 1
)

:: Check Python
python --version >NUL 2>&1
if %errorlevel% NEQ 0 (
    echo ERROR: Python 3.11+ not found. Download from https://python.org
    pause & exit /b 1
)

echo [1/6] Installing Python dependencies...
python -m pip install pywin32 psutil requests wmi onnxruntime -q
if %errorlevel% NEQ 0 (
    echo ERROR: pip install failed.
    pause & exit /b 1
)
python -m pip install pywin32 -q
python Scripts\pywin32_postinstall.py -install >NUL 2>&1

echo [2/6] Creating install directory...
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"
if not exist "%DATA_DIR%"    mkdir "%DATA_DIR%"
if not exist "%DATA_DIR%\quarantine" mkdir "%DATA_DIR%\quarantine"

echo [3/6] Copying sensor files...
copy /Y "%~dp0*.py"   "%INSTALL_DIR%\" >NUL
copy /Y "%~dp0*.txt"  "%INSTALL_DIR%\" >NUL

echo [4/6] Writing config...
if not exist "%DATA_DIR%\config.json" (
    :: Generate a UUID for device_uid using PowerShell
    for /f %%G in ('powershell -Command "[guid]::NewGuid().ToString()"') do set DEVICE_UID=%%G
    echo {"device_uid":"%DEVICE_UID%","hostname":"%COMPUTERNAME%","supabase_url":"","anon_key":""} > "%DATA_DIR%\config.json"
    echo     Created config at %DATA_DIR%\config.json
    echo     IMPORTANT: Edit config.json and set supabase_url + anon_key
)

echo [5/6] Registering Windows services...
cd /d "%INSTALL_DIR%"
python windows_service.py install
python watchdog.py install

:: Set services to delayed auto-start for boot resilience
sc config SparrowShieldSensor  start= delayed-auto >NUL
sc config SparrowShieldWatchdog start= delayed-auto >NUL

:: Configure failure recovery (restart after 5s, 3 times)
sc failure SparrowShieldSensor  reset= 60 actions= restart/5000/restart/5000/restart/5000 >NUL
sc failure SparrowShieldWatchdog reset= 60 actions= restart/5000/restart/5000/restart/5000 >NUL

echo [6/6] Starting services...
net start SparrowShieldSensor
net start SparrowShieldWatchdog

echo.
echo  ================================================================
echo   Installation complete.
echo   Sensor:   sc query SparrowShieldSensor
echo   Watchdog: sc query SparrowShieldWatchdog
echo   Logs:     %DATA_DIR%\sensor.log
echo   Config:   %DATA_DIR%\config.json
echo  ================================================================
echo.
pause
