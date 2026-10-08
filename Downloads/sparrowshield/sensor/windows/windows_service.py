#!/usr/bin/env python3
"""
SparrowShield — Windows Service wrapper (Day 4)
Installs and runs the sensor as a persistent Windows service via pywin32.

Install:  python windows_service.py install
Start:    python windows_service.py start
Remove:   python windows_service.py remove
"""

import logging
import os
import sys
import threading
import time

import servicemanager
import win32event
import win32service
import win32serviceutil


class SparrowShieldService(win32serviceutil.ServiceFramework):
    _svc_name_        = "SparrowShieldSensor"
    _svc_display_name_= "SparrowShield EDR Sensor"
    _svc_description_ = (
        "SparrowShield endpoint detection sensor. Monitors process, file, "
        "and network activity in real-time using ETW kernel providers."
    )
    _svc_deps_        = ["eventlog"]

    def __init__(self, args):
        win32serviceutil.ServiceFramework.__init__(self, args)
        self._stop_event = win32event.CreateEvent(None, 0, 0, None)
        self._main_thread: threading.Thread | None = None

    def SvcStop(self):
        self.ReportServiceStatus(win32service.SERVICE_STOP_PENDING)
        win32event.SetEvent(self._stop_event)
        if self._main_thread:
            self._main_thread.join(timeout=10)

    def SvcDoRun(self):
        servicemanager.LogMsg(
            servicemanager.EVENTLOG_INFORMATION_TYPE,
            servicemanager.PYS_SERVICE_STARTED,
            (self._svc_name_, ""),
        )
        self._main_thread = threading.Thread(target=self._run, daemon=True)
        self._main_thread.start()
        # Block until stop event
        win32event.WaitForSingleObject(self._stop_event, win32event.INFINITE)
        servicemanager.LogMsg(
            servicemanager.EVENTLOG_INFORMATION_TYPE,
            servicemanager.PYS_SERVICE_STOPPED,
            (self._svc_name_, ""),
        )

    def _run(self):
        # Import here so the service module itself loads fast
        from main import SparrowShieldSensorOrchestrator
        orch = SparrowShieldSensorOrchestrator()
        orch.start()
        # Keep running until stop event
        while True:
            rc = win32event.WaitForSingleObject(self._stop_event, 5000)
            if rc == win32event.WAIT_OBJECT_0:
                orch.stop()
                break


if __name__ == "__main__":
    if len(sys.argv) == 1:
        servicemanager.Initialize()
        servicemanager.PrepareToHostSingle(SparrowShieldService)
        servicemanager.StartServiceCtrlDispatcher()
    else:
        win32serviceutil.HandleCommandLine(SparrowShieldService)
