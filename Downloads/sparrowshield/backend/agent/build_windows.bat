@echo off
:: SparrowShield Windows Agent — local build script
:: Run this on a Windows machine with Python 3.10+ installed.
:: Output: dist\SparrowShieldAgent.exe

echo [1/3] Installing build dependencies...
pip install pyinstaller psutil requests --quiet

echo [2/3] Building EXE...
pyinstaller ^
  --onefile ^
  --noconsole ^
  --name SparrowShieldAgent ^
  agent_windows.py

echo [3/3] Done.
echo.
echo  Output: dist\SparrowShieldAgent.exe
echo.
echo  To install as a boot-time service (run as Administrator):
echo    dist\SparrowShieldAgent.exe --install
echo.
echo  To run directly (for testing):
echo    dist\SparrowShieldAgent.exe
echo.
pause
