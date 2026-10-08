@echo off
:: SparrowShield EDR Sensor — EXE Builder
:: Run on Windows with Python 3.11+ installed.
:: Output: dist\SparrowShieldSensor.exe  (~15-25 MB, self-contained)

setlocal
set BUILD_DIR=%~dp0

echo.
echo  ================================================================
echo   SparrowShield EDR Sensor — EXE Build
echo  ================================================================
echo.

:: 1. Install build dependencies
echo [1/5] Installing build dependencies...
python -m pip install pyinstaller pywin32 psutil requests wmi onnxruntime -q
if %errorlevel% NEQ 0 (
    echo ERROR: pip install failed.
    pause & exit /b 1
)

:: pywin32 post-install registers COM objects needed for freezing
echo       Running pywin32 post-install...
python -c "import win32api" >NUL 2>&1
if %errorlevel% NEQ 0 (
    python Scripts\pywin32_postinstall.py -install >NUL 2>&1
)

:: 2. Clean previous build artefacts
echo [2/5] Cleaning previous build...
if exist "%BUILD_DIR%build"  rmdir /s /q "%BUILD_DIR%build"
if exist "%BUILD_DIR%dist"   rmdir /s /q "%BUILD_DIR%dist"

:: 3. Run PyInstaller
echo [3/5] Running PyInstaller (this takes 60-120 seconds)...
cd /d "%BUILD_DIR%"
pyinstaller SparrowShieldSensor.spec --noconfirm --clean
if %errorlevel% NEQ 0 (
    echo ERROR: PyInstaller build failed. See output above.
    pause & exit /b 1
)

:: 4. Verify output
echo [4/5] Verifying output...
if not exist "%BUILD_DIR%dist\SparrowShieldSensor.exe" (
    echo ERROR: EXE not found in dist\
    pause & exit /b 1
)

for %%A in ("%BUILD_DIR%dist\SparrowShieldSensor.exe") do set SIZE=%%~zA
set /a SIZE_MB=%SIZE% / 1048576
echo       Size: %SIZE_MB% MB

:: 5. Copy to dashboard/public/agents so the dashboard serves it for download
echo [5/5] Copying to dashboard download folder...
if exist "%BUILD_DIR%..\..\dashboard\public\agents\" (
    copy /Y "%BUILD_DIR%dist\SparrowShieldSensor.exe" ^
         "%BUILD_DIR%..\..\dashboard\public\agents\SparrowShieldSensor.exe" >NUL
    echo       Copied to dashboard\public\agents\SparrowShieldSensor.exe
)

echo.
echo  ================================================================
echo   Build complete!
echo.
echo   EXE:      %BUILD_DIR%dist\SparrowShieldSensor.exe
echo.
echo   USAGE (on any Windows machine, run as Administrator):
echo     Double-click  → installs as Windows service automatically
echo     --run         → foreground console mode (testing)
echo     --status      → show service status
echo     --uninstall   → remove services
echo  ================================================================
echo.
pause
