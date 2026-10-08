#!/usr/bin/env python3
"""
SparrowShield — Watchdog Service (Day 4)
Monitors SparrowShieldSensor and restarts it if it exits unexpectedly.
Runs as a separate Windows service so the pair survive individual crashes.

Install:  python watchdog.py install
Start:    python watchdog.py start
"""

import logging
import subprocess
import time

import servicemanager
import win32event
import win32service
import win32serviceutil

WATCHED_SERVICE  = "SparrowShieldSensor"
CHECK_INTERVAL_S = 15   # check every 15 seconds
RESTART_DELAY_S  = 5    # wait before restart attempt


class SparrowShieldWatchdog(win32serviceutil.ServiceFramework):
    _svc_name_         = "SparrowShieldWatchdog"
    _svc_display_name_ = "SparrowShield EDR Watchdog"
    _svc_description_  = (
        "Monitors the SparrowShield EDR Sensor and restarts it if it stops "
        "unexpectedly. Part of the SparrowShield self-protection pair."
    )

    def __init__(self, args):
        win32serviceutil.ServiceFramework.__init__(self, args)
        self._stop_event = win32event.CreateEvent(None, 0, 0, None)

    def SvcStop(self):
        self.ReportServiceStatus(win32service.SERVICE_STOP_PENDING)
        win32event.SetEvent(self._stop_event)

    def SvcDoRun(self):
        servicemanager.LogMsg(
            servicemanager.EVENTLOG_INFORMATION_TYPE,
            servicemanager.PYS_SERVICE_STARTED,
            (self._svc_name_, ""),
        )
        self._watchdog_loop()

    def _watchdog_loop(self):
        logging.basicConfig(
            filename=r"C:\ProgramData\SparrowShield\watchdog.log",
            level=logging.INFO,
            format="%(asctime)s [%(levelname)s] %(message)s",
        )
        consecutive_fails = 0

        while True:
            rc = win32event.WaitForSingleObject(self._stop_event, CHECK_INTERVAL_S * 1000)
            if rc == win32event.WAIT_OBJECT_0:
                break

            status = self._get_service_status(WATCHED_SERVICE)

            if status == win32service.SERVICE_RUNNING:
                consecutive_fails = 0
                continue

            consecutive_fails += 1
            logging.warning(
                "Sensor service not running (state=%s, attempt=%d). Restarting in %ds.",
                status, consecutive_fails, RESTART_DELAY_S,
            )
            time.sleep(RESTART_DELAY_S)

            # Back-off: wait longer after repeated failures
            if consecutive_fails >= 5:
                logging.error(
                    "Sensor failed %d times consecutively — waiting 60s before retry.",
                    consecutive_fails,
                )
                time.sleep(60)
                consecutive_fails = 0

            self._restart_service(WATCHED_SERVICE)

    @staticmethod
    def _get_service_status(service_name: str) -> int:
        try:
            scm = win32service.OpenSCManager(None, None, win32service.SC_MANAGER_CONNECT)
            svc = win32service.OpenService(
                scm, service_name, win32service.SERVICE_QUERY_STATUS
            )
            status = win32service.QueryServiceStatus(svc)[1]
            win32service.CloseServiceHandle(svc)
            win32service.CloseServiceHandle(scm)
            return status
        except Exception:
            return win32service.SERVICE_STOPPED

    @staticmethod
    def _restart_service(service_name: str):
        try:
            subprocess.run(["net", "start", service_name],
                           capture_output=True, timeout=30)
            logging.info("Restart command sent to %s.", service_name)
        except Exception as exc:
            logging.error("Failed to restart %s: %s", service_name, exc)


if __name__ == "__main__":
    import sys
    if len(sys.argv) == 1:
        servicemanager.Initialize()
        servicemanager.PrepareToHostSingle(SparrowShieldWatchdog)
        servicemanager.StartServiceCtrlDispatcher()
    else:
        win32serviceutil.HandleCommandLine(SparrowShieldWatchdog)
