@echo off
:: SparrowShield Windows Sensor — Day 1 installer
:: Run as Administrator

echo [SparrowShield] Checking Python...
python --version >NUL 2>&1
if %errorlevel% NEQ 0 (
    echo ERROR: Python not found. Install Python 3.11+ and add to PATH.
    pause & exit /b 1
)

echo [SparrowShield] Installing dependencies...
python -m pip install -r "%~dp0requirements.txt" -q
if %errorlevel% NEQ 0 (
    echo ERROR: pip install failed.
    pause & exit /b 1
)

echo [SparrowShield] Starting sensor (press Ctrl+C to stop)...
python "%~dp0etw_sensor.py"
