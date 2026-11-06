@echo off
REM SparrowFilter build script
REM Requires: WDK 10.0.22621.0 + Visual Studio 2022

setlocal

SET WDK_ROOT=C:\Program Files (x86)\Windows Kits\10
SET VS_ROOT=C:\Program Files\Microsoft Visual Studio\2022\Community
SET MSBUILD=%VS_ROOT%\MSBuild\Current\Bin\MSBuild.exe

echo [SparrowShield] Building minifilter driver...

IF NOT EXIST "%MSBUILD%" (
    echo ERROR: MSBuild not found at %MSBUILD%
    echo Install Visual Studio 2022 with "Desktop development with C++" workload.
    exit /b 1
)

IF NOT EXIST "%WDK_ROOT%" (
    echo ERROR: WDK not found at %WDK_ROOT%
    echo Download from: https://learn.microsoft.com/en-us/windows-hardware/drivers/download-the-wdk
    exit /b 1
)

REM Build Release x64
"%MSBUILD%" SparrowFilter.vcxproj /p:Configuration=Release /p:Platform=x64 /v:minimal
IF ERRORLEVEL 1 (
    echo ERROR: Build failed.
    exit /b 1
)

echo [SparrowShield] Build succeeded: x64\Release\SparrowFilter.sys

REM ── Signing ────────────────────────────────────────────────────
REM For PRODUCTION (required on Windows 10/11):
REM   1. Obtain an EV (Extended Validation) code-signing certificate
REM   2. Submit to Microsoft Attestation Signing (Partner Center)
REM   3. Use the WHQL-signed .cat file returned by Microsoft
REM
REM For DEVELOPMENT / TEST SIGNING (no EV cert required):
REM   Enable test-signing on the target machine first:
REM     bcdedit /set testsigning on
REM   Then sign with a self-signed test cert:

echo [SparrowShield] Signing with test certificate (dev only)...

REM Create a self-signed test cert (once, skip if already exists)
makecert -r -pe -ss SparrowTest -n "CN=SparrowShield Test" -eku 1.3.6.1.5.5.7.3.3 SparrowTest.cer 2>nul

REM Sign the .sys
signtool sign /v /s SparrowTest /n "SparrowShield Test" ^
    /fd sha256 ^
    /t http://timestamp.digicert.com ^
    x64\Release\SparrowFilter.sys

REM Sign the .cat (create it first with Inf2Cat)
Inf2Cat /driver:. /os:10_x64,Server10_x64 /verbose
IF EXIST SparrowFilter.cat (
    signtool sign /v /s SparrowTest /n "SparrowShield Test" ^
        /fd sha256 /t http://timestamp.digicert.com ^
        SparrowFilter.cat
)

echo.
echo [SparrowShield] Done.
echo   Driver: x64\Release\SparrowFilter.sys
echo   INF:    SparrowFilter.inf
echo.
echo To install on a TEST machine (testsigning enabled):
echo   pnputil /add-driver SparrowFilter.inf /install
echo   fltMC load SparrowFilter
echo.
echo To verify:
echo   fltMC filters
echo   fltMC instances
endlocal
