#!/usr/bin/env python3
"""
SparrowShield EDR Sensor — unified EXE entry point.

Behaviour depends on how the EXE is invoked:
  (double-click / no args)          → self-install + start service
  SparrowShieldSensor.exe --service → Windows SCM service mode
  SparrowShieldSensor.exe --install → install & start (non-interactive)
  SparrowShieldSensor.exe --uninstall / --remove → stop & remove services
  SparrowShieldSensor.exe --run     → foreground console mode (for testing)
  SparrowShieldSensor.exe --status  → print service status
"""

import ctypes
import json
import logging
import os
import shutil
import socket
import subprocess
import sys
import time
import threading
import uuid
from pathlib import Path

# ── Paths ─────────────────────────────────────────────────────────────────────

# When frozen by PyInstaller, sys.executable is the .exe path
EXE_PATH    = Path(sys.executable if getattr(sys, "frozen", False) else os.path.abspath(__file__))
INSTALL_DIR = Path("C:\\Program Files\\SparrowShield")
DATA_DIR    = Path(os.environ.get("PROGRAMDATA", "C:\\ProgramData")) / "SparrowShield"
INSTALLED   = INSTALL_DIR / "SparrowShieldSensor.exe"
CONFIG_FILE = DATA_DIR / "config.json"
LOG_FILE    = DATA_DIR / "sensor.log"

SVC_NAME      = "SparrowShieldSensor"
SVC_DISPLAY   = "SparrowShield EDR Sensor"
SVC_DESC      = "Real-time endpoint detection via ETW. SparrowShield v2.0"
SVC_WD_NAME   = "SparrowShieldWatchdog"
SVC_WD_DISP  = "SparrowShield EDR Watchdog"


# ── Helpers ───────────────────────────────────────────────────────────────────

def _is_admin() -> bool:
    try:
        return bool(ctypes.windll.shell32.IsUserAnAdmin())
    except Exception:
        return False


def _elevate():
    """Re-launch current EXE as Administrator if not already elevated."""
    ctypes.windll.shell32.ShellExecuteW(
        None, "runas", str(EXE_PATH), " ".join(sys.argv[1:]), None, 1
    )
    sys.exit(0)


def _run(cmd: list[str], check: bool = False, timeout: int = 30) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, capture_output=True, text=True,
                          timeout=timeout, check=check)


def _sc(*args) -> subprocess.CompletedProcess:
    return _run(["sc"] + list(args))


def _svc_status(name: str) -> str:
    """Returns SERVICE_RUNNING / SERVICE_STOPPED / UNKNOWN."""
    r = _run(["sc", "query", name])
    for line in r.stdout.splitlines():
        if "STATE" in line:
            parts = line.split()
            return parts[-1] if parts else "UNKNOWN"
    return "NOT_INSTALLED"


def _write_config():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not CONFIG_FILE.exists():
        cfg = {
            "device_uid":   str(uuid.uuid4()),
            "hostname":     socket.gethostname(),
            "supabase_url": "",
            "anon_key":     "",
        }
        CONFIG_FILE.write_text(json.dumps(cfg, indent=2))
        print(f"  Config written → {CONFIG_FILE}")
        print("  ACTION REQUIRED: Edit config.json and add your supabase_url + anon_key")


def _copy_exe():
    """Copy this EXE to the permanent install directory."""
    INSTALL_DIR.mkdir(parents=True, exist_ok=True)
    if EXE_PATH.resolve() != INSTALLED.resolve():
        shutil.copy2(EXE_PATH, INSTALLED)
        print(f"  Installed → {INSTALLED}")


# ── Install / Uninstall ───────────────────────────────────────────────────────

def install(silent: bool = False):
    if not _is_admin():
        _elevate()

    print("\n SparrowShield EDR Sensor — Installer\n" + "─" * 42)

    # 1. Copy EXE to install dir
    _copy_exe()

    # 2. Write initial config
    _write_config()

    # 3. Create quarantine / log dirs
    (DATA_DIR / "quarantine").mkdir(parents=True, exist_ok=True)

    # 4. Register sensor service
    #    binPath uses --service flag so SCM start → service mode
    svc_binary = f'"{INSTALLED}" --service'
    _sc("create", SVC_NAME, f"binPath= {svc_binary}",
        f"DisplayName= {SVC_DISPLAY}", "start= delayed-auto", "obj= LocalSystem")
    _sc("description", SVC_NAME, SVC_DESC)
    _sc("failure", SVC_NAME, "reset= 60",
        "actions= restart/5000/restart/10000/restart/30000")
    print(f"  Service registered: {SVC_NAME}")

    # 5. Register watchdog service
    wd_binary = f'"{INSTALLED}" --watchdog'
    _sc("create", SVC_WD_NAME, f"binPath= {wd_binary}",
        f"DisplayName= {SVC_WD_DISP}", "start= delayed-auto", "obj= LocalSystem")
    _sc("failure", SVC_WD_NAME, "reset= 60",
        "actions= restart/5000/restart/10000/restart/30000")
    print(f"  Service registered: {SVC_WD_NAME}")

    # 6. Start services
    _run(["net", "start", SVC_NAME], timeout=30)
    time.sleep(2)
    _run(["net", "start", SVC_WD_NAME], timeout=30)

    status = _svc_status(SVC_NAME)
    print(f"\n  Status: {status}")
    print(f"  Logs  : {LOG_FILE}")
    print(f"  Config: {CONFIG_FILE}\n")

    if not silent:
        input("  Press Enter to close…")


def uninstall():
    if not _is_admin():
        _elevate()

    print("\n SparrowShield EDR Sensor — Uninstaller\n" + "─" * 42)

    for name in (SVC_WD_NAME, SVC_NAME):
        _run(["net", "stop", name], timeout=15)
        _sc("delete", name)
        print(f"  Removed: {name}")

    # Remove installed EXE but leave data/logs for forensics
    try:
        INSTALLED.unlink(missing_ok=True)
        print(f"  Deleted: {INSTALLED}")
    except OSError as e:
        print(f"  Warning: could not delete {INSTALLED}: {e}")

    print("  Data preserved at:", DATA_DIR)
    input("  Press Enter to close…")


# ── Service mode (called by Windows SCM) ─────────────────────────────────────

def run_as_service():
    """Entry point when Windows SCM starts the sensor service."""
    try:
        import servicemanager
        import win32serviceutil

        class _Service(win32serviceutil.ServiceFramework):
            _svc_name_         = SVC_NAME
            _svc_display_name_ = SVC_DISPLAY

            def __init__(self, args):
                import win32event
                win32serviceutil.ServiceFramework.__init__(self, args)
                self._stop = win32event.CreateEvent(None, 0, 0, None)
                self._orch = None

            def SvcStop(self):
                import win32service
                self.ReportServiceStatus(win32service.SERVICE_STOP_PENDING)
                if self._orch:
                    self._orch.stop()
                import win32event
                win32event.SetEvent(self._stop)

            def SvcDoRun(self):
                import win32event
                servicemanager.LogMsg(
                    servicemanager.EVENTLOG_INFORMATION_TYPE,
                    servicemanager.PYS_SERVICE_STARTED,
                    (SVC_NAME, ""),
                )
                from main import SparrowShieldSensorOrchestrator
                self._orch = SparrowShieldSensorOrchestrator()
                self._orch.start()
                win32event.WaitForSingleObject(self._stop, win32event.INFINITE)

        servicemanager.Initialize()
        servicemanager.PrepareToHostSingle(_Service)
        servicemanager.StartServiceCtrlDispatcher()

    except Exception as exc:
        # Last-resort: log to file and exit
        try:
            LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
            with open(LOG_FILE, "a") as f:
                f.write(f"SERVICE START FAILED: {exc}\n")
        except Exception:
            pass
        sys.exit(1)


# ── Watchdog mode ─────────────────────────────────────────────────────────────

def run_as_watchdog():
    """Entry point when Windows SCM starts the watchdog service."""
    try:
        import servicemanager
        import win32serviceutil

        class _Watchdog(win32serviceutil.ServiceFramework):
            _svc_name_         = SVC_WD_NAME
            _svc_display_name_ = SVC_WD_DISP

            def __init__(self, args):
                import win32event
                win32serviceutil.ServiceFramework.__init__(self, args)
                self._stop = win32event.CreateEvent(None, 0, 0, None)

            def SvcStop(self):
                import win32service, win32event
                self.ReportServiceStatus(win32service.SERVICE_STOP_PENDING)
                win32event.SetEvent(self._stop)

            def SvcDoRun(self):
                import win32event
                self._thread = threading.Thread(target=self._loop, daemon=True)
                self._thread.start()
                win32event.WaitForSingleObject(self._stop, win32event.INFINITE)

            def _loop(self):
                import win32service
                consecutive = 0
                while True:
                    time.sleep(15)
                    status = _svc_status(SVC_NAME)
                    if "RUNNING" in status:
                        consecutive = 0
                        continue
                    consecutive += 1
                    wait = min(5 * (2 ** (consecutive - 1)), 120)
                    time.sleep(wait)
                    _run(["net", "start", SVC_NAME], timeout=30)

        servicemanager.Initialize()
        servicemanager.PrepareToHostSingle(_Watchdog)
        servicemanager.StartServiceCtrlDispatcher()

    except Exception as exc:
        try:
            with open(LOG_FILE, "a") as f:
                f.write(f"WATCHDOG START FAILED: {exc}\n")
        except Exception:
            pass
        sys.exit(1)


# ── Console / test mode ───────────────────────────────────────────────────────

def run_console():
    if not _is_admin():
        print("ERROR: Run as Administrator.")
        sys.exit(1)

    _write_config()
    (DATA_DIR / "quarantine").mkdir(parents=True, exist_ok=True)

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        handlers=[
            logging.StreamHandler(sys.stdout),
            logging.FileHandler(LOG_FILE, encoding="utf-8"),
        ],
    )

    from main import SparrowShieldSensorOrchestrator
    orch = SparrowShieldSensorOrchestrator()
    orch.start()
    print("Sensor running in console. Press Ctrl+C to stop.")
    try:
        while True:
            time.sleep(5)
    except KeyboardInterrupt:
        orch.stop()


def print_status():
    for name in (SVC_NAME, SVC_WD_NAME):
        status = _svc_status(name)
        print(f"  {name:<28} {status}")


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    args = [a.lower() for a in sys.argv[1:]]

    if "--service" in args:
        run_as_service()
    elif "--watchdog" in args:
        run_as_watchdog()
    elif "--install" in args:
        install(silent=True)
    elif "--uninstall" in args or "--remove" in args:
        uninstall()
    elif "--run" in args or "--console" in args:
        run_console()
    elif "--status" in args:
        print_status()
    else:
        # Default: double-click → auto-install
        if not _is_admin():
            _elevate()
        status = _svc_status(SVC_NAME)
        if "RUNNING" in status:
            print(f"\n SparrowShield is already running.\n")
            print_status()
            input("\n Press Enter to close…")
        else:
            install(silent=False)
