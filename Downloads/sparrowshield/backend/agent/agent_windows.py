#!/usr/bin/env python3
"""
FleetPulse Windows agent — collects system metrics and inventory, sends to backend.
"""

import json
import logging
import os
import platform
import subprocess
import sys
import threading
import time
from pathlib import Path

import psutil
import requests

LOG_DIR = os.environ.get("ProgramData", "C:\\ProgramData")
LOG_PATH = os.path.join(LOG_DIR, "FleetPulse", "agent.log")
CONFIG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.json")
HEARTBEAT_INTERVAL = 300
INVENTORY_INTERVAL = 3600


def setup_logging():
    try:
        Path(LOG_DIR, "FleetPulse").mkdir(parents=True, exist_ok=True)
    except OSError:
        pass
    try:
        logging.basicConfig(
            level=logging.INFO,
            format="%(asctime)s [%(levelname)s] %(message)s",
            handlers=[
                logging.FileHandler(LOG_PATH, encoding="utf-8"),
                logging.StreamHandler(sys.stderr),
            ],
        )
    except OSError:
        logging.basicConfig(
            level=logging.INFO,
            format="%(asctime)s [%(levelname)s] %(message)s",
            handlers=[logging.StreamHandler(sys.stderr)],
        )
    return logging.getLogger(__name__)


logger = setup_logging()


def load_config():
    path = Path(CONFIG_PATH)
    if not path.exists():
        return {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError) as e:
        logger.warning("Could not load config: %s", e)
        return {}


def save_config(config):
    path = Path(CONFIG_PATH)
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(config, f, indent=2)
    except OSError as e:
        logger.error("Could not save config: %s", e)


def get_windows_serial():
    try:
        r = subprocess.run(
            ["wmic", "bios", "get", "serialnumber"],
            capture_output=True,
            text=True,
            timeout=10,
            creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
        )
        if r.returncode == 0 and r.stdout:
            lines = [l.strip() for l in r.stdout.strip().splitlines() if l.strip()]
            if len(lines) >= 2:
                return lines[-1] or "unknown"
    except (subprocess.TimeoutExpired, FileNotFoundError):
        pass
    return "unknown"


def enroll(api_url: str, config: dict) -> bool:
    hostname = platform.node()
    serial_number = get_windows_serial()
    os_type = "windows"
    os_version = platform.win32_ver()[1] or platform.release()

    body = {
        "hostname": hostname,
        "serial_number": serial_number,
        "os_type": os_type,
        "os_version": os_version,
        "assigned_user": os.environ.get("USERNAME", ""),
        "department": "",
    }

    for attempt in range(3):
        try:
            r = requests.post(
                f"{api_url}/enroll",
                json=body,
                headers={"Content-Type": "application/json"},
                timeout=30,
            )
            data = r.json()
            if r.status_code == 200 and data.get("success") and data.get("data"):
                d = data["data"]
                config["device_id"] = str(d["device_id"])
                config["device_token"] = d["token"]
                save_config(config)
                logger.info("Enrolled successfully: device_id=%s", config["device_id"])
                return True
            logger.warning("Enroll failed: %s %s", r.status_code, data.get("error"))
        except Exception as e:
            logger.warning("Enroll attempt %s failed: %s", attempt + 1, e)
        time.sleep(2 ** attempt)
    return False


def retry_request(method, url, **kwargs):
    last_error = None
    for attempt in range(5):
        try:
            r = method(url, **kwargs)
            if r.status_code in (200, 201, 204):
                return r
            if r.status_code in (401, 403, 404):
                return r
            last_error = r.text
        except requests.RequestException as e:
            last_error = e
        time.sleep(2 ** attempt)
    raise last_error


def get_bitlocker_status() -> bool:
    try:
        r = subprocess.run(
            ["manage-bde", "-status", "C:"],
            capture_output=True,
            text=True,
            timeout=15,
            creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
        )
        if r.returncode == 0:
            return "Protection On" in r.stdout or "Fully Encrypted" in r.stdout
    except (subprocess.TimeoutExpired, FileNotFoundError):
        pass
    return False


def get_firewall_status() -> bool:
    try:
        r = subprocess.run(
            [
                "powershell",
                "-NoProfile",
                "-Command",
                "Get-NetFirewallProfile | Select-Object Name, Enabled",
            ],
            capture_output=True,
            text=True,
            timeout=15,
            creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
        )
        if r.returncode == 0 and r.stdout:
            for line in r.stdout.splitlines():
                if "Domain" in line or "Private" in line or "Public" in line:
                    if "True" in line:
                        return True
            return "True" in r.stdout
    except (subprocess.TimeoutExpired, FileNotFoundError):
        pass
    return False


def collect_metrics() -> dict:
    vm = psutil.virtual_memory()
    disk = psutil.disk_usage("C:\\")
    cpu_pct = psutil.cpu_percent(interval=2)
    uptime_seconds = int(time.time() - psutil.boot_time()) if hasattr(psutil, "boot_time") else 0

    battery_health_pct = None
    battery_cycles = None
    if hasattr(psutil, "sensors_battery") and psutil.sensors_battery():
        bat = psutil.sensors_battery()
        battery_health_pct = getattr(bat, "percent", None)

    return {
        "cpu_pct": round(cpu_pct, 2),
        "ram_pct": round(vm.percent, 2),
        "ram_total_gb": round(vm.total / (1024 ** 3), 2),
        "disk_pct": round(disk.percent, 2),
        "disk_total_gb": round(disk.total / (1024 ** 3), 2),
        "battery_health_pct": battery_health_pct,
        "battery_cycles": battery_cycles,
        "uptime_seconds": uptime_seconds,
        "filevault_enabled": None,
        "bitlocker_enabled": get_bitlocker_status(),
        "firewall_enabled": get_firewall_status(),
    }


def heartbeat_loop(api_url: str, token: str):
    while True:
        try:
            metrics = collect_metrics()
            r = retry_request(
                requests.post,
                f"{api_url}/heartbeat",
                json=metrics,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {token}",
                },
                timeout=30,
            )
            if r.status_code == 200:
                logger.debug("Heartbeat OK")
            elif r.status_code == 401:
                logger.error("Token invalid or revoked; re-enroll required")
        except Exception as e:
            logger.exception("Heartbeat failed: %s", e)
        time.sleep(HEARTBEAT_INTERVAL)


def get_software_list():
    result = []
    try:
        r = subprocess.run(
            ["wmic", "product", "get", "name,version", "/format:csv"],
            capture_output=True,
            text=True,
            timeout=60,
            creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
        )
        if r.returncode != 0 or not r.stdout:
            return []
        lines = [l.strip() for l in r.stdout.strip().splitlines() if l.strip()]
        if len(lines) < 2:
            return []
        keys = [k.strip() for k in lines[0].split(",")]
        name_idx = next((i for i, k in enumerate(keys) if "name" in k.lower()), 0)
        version_idx = next((i for i, k in enumerate(keys) if "version" in k.lower()), 1)
        for line in lines[1:]:
            parts = [p.strip() for p in line.split(",")]
            if len(parts) > max(name_idx, version_idx):
                name = parts[name_idx] or ""
                version = parts[version_idx] if version_idx < len(parts) else ""
                if name:
                    result.append({"app_name": name[:256], "version": str(version)[:128]})
        return result[:500]
    except (subprocess.TimeoutExpired, FileNotFoundError) as e:
        logger.warning("Software inventory failed: %s", e)
        return []


def get_top_processes(limit=20):
    result = []
    try:
        procs = []
        for p in psutil.process_iter(["name", "cpu_percent", "memory_info"]):
            try:
                pinfo = p.info
                cpu = pinfo.get("cpu_percent") or 0
                mem = (pinfo.get("memory_info") or type("M", (), {"rss": 0})()).rss
                procs.append((pinfo.get("name") or p.name(), cpu, mem / (1024 * 1024)))
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
        procs.sort(key=lambda x: x[1], reverse=True)
        for name, cpu_pct, ram_mb in procs[:limit]:
            result.append({
                "process_name": (name or "unknown")[:256],
                "cpu_pct": round(cpu_pct, 2),
                "ram_mb": round(ram_mb, 2),
            })
    except Exception as e:
        logger.warning("Process list failed: %s", e)
    return result


def inventory_loop(api_url: str, token: str):
    while True:
        time.sleep(INVENTORY_INTERVAL)
        try:
            software = get_software_list()
            processes = get_top_processes(20)
            r = retry_request(
                requests.post,
                f"{api_url}/inventory",
                json={"software": software, "processes": processes},
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {token}",
                },
                timeout=60,
            )
            if r.status_code == 200:
                logger.info("Inventory sent: %s apps, %s processes", len(software), len(processes))
            elif r.status_code == 401:
                logger.error("Token invalid; re-enroll required")
        except Exception as e:
            logger.exception("Inventory failed: %s", e)


def main():
    config = load_config()
    api_url = (config.get("api_url") or "").rstrip("/")
    if not api_url:
        logger.error("config.json missing api_url. Set api_url to your Supabase functions URL.")
        sys.exit(1)

    device_id = config.get("device_id")
    token = config.get("device_token")

    if not token or not device_id:
        logger.info("No device_id/token; enrolling...")
        if not enroll(api_url, config):
            logger.error("Enrollment failed. Check api_url and network.")
            sys.exit(1)
        token = config.get("device_token")
        device_id = config.get("device_id")

    logger.info("Starting agent for device_id=%s", device_id)

    t = threading.Thread(target=inventory_loop, args=(api_url, token), daemon=True)
    t.start()

    heartbeat_loop(api_url, token)


if __name__ == "__main__":
    main()
