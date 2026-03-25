#!/usr/bin/env python3
"""
HealSparrow macOS agent — collects system metrics and inventory, sends to backend.
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

LOG_PATH = "/var/log/healsparrow-agent.log"
CONFIG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.json")
HEARTBEAT_INTERVAL = 300
INVENTORY_INTERVAL = 3600


def setup_logging():
    try:
        logging.basicConfig(
            level=logging.INFO,
            format="%(asctime)s [%(levelname)s] %(message)s",
            handlers=[
                logging.FileHandler(LOG_PATH),
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
        with open(path, "r") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError) as e:
        logger.warning("Could not load config: %s", e)
        return {}


def save_config(config):
    path = Path(CONFIG_PATH)
    try:
        with open(path, "w") as f:
            json.dump(config, f, indent=2)
    except OSError as e:
        logger.error("Could not save config: %s", e)


def enroll(api_url: str, config: dict) -> bool:
    hostname = platform.node()
    try:
        sn = subprocess.run(
            ["ioreg", "-rd1", "-c", "IOPlatformExpertDevice"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        serial_number = "unknown"
        if sn.returncode == 0:
            for line in sn.stdout.splitlines():
                if "IOPlatformSerialNumber" in line:
                    serial_number = line.split('"')[-2]
                    break
    except (subprocess.TimeoutExpired, FileNotFoundError):
        serial_number = "unknown"

    os_type = "mac"
    os_version = platform.mac_ver()[0] or platform.release()

    # Hardware config
    cpu_model = platform.processor() or "unknown"
    try:
        r = subprocess.run(
            ["sysctl", "-n", "machdep.cpu.brand_string"],
            capture_output=True, text=True, timeout=5,
        )
        if r.returncode == 0 and r.stdout.strip():
            cpu_model = r.stdout.strip()
    except (subprocess.TimeoutExpired, FileNotFoundError):
        pass
    cpu_cores = psutil.cpu_count(logical=False) or psutil.cpu_count()
    ram_total_gb = round(psutil.virtual_memory().total / (1024 ** 3), 2)

    body = {
        "hostname": hostname,
        "serial_number": serial_number,
        "os_type": os_type,
        "os_version": os_version,
        "assigned_user": os.environ.get("USER", ""),
        "department": "",
        "cpu_model": cpu_model,
        "cpu_cores": cpu_cores,
        "ram_total_gb": ram_total_gb,
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


def get_filevault_status() -> bool:
    try:
        r = subprocess.run(
            ["fdesetup", "status"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if r.returncode == 0:
            return "FileVault is On" in r.stdout
    except (subprocess.TimeoutExpired, FileNotFoundError):
        pass
    return False


def get_firewall_status() -> bool:
    try:
        r = subprocess.run(
            ["defaults", "read", "/Library/Preferences/com.apple.alf", "globalstate"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if r.returncode == 0:
            return r.stdout.strip() == "1"
    except (subprocess.TimeoutExpired, FileNotFoundError):
        pass
    return False


def collect_metrics() -> dict:
    vm = psutil.virtual_memory()
    disk = psutil.disk_usage("/")
    cpu_pct = psutil.cpu_percent(interval=2)
    uptime_seconds = int(time.time() - psutil.boot_time()) if hasattr(psutil, "boot_time") else 0

    battery_health_pct = None
    battery_cycles = None
    if hasattr(psutil, "sensors_battery") and psutil.sensors_battery():
        bat = psutil.sensors_battery()
        battery_health_pct = getattr(bat, "percent", None)
        battery_cycles = None

    return {
        "cpu_pct": round(cpu_pct, 2),
        "ram_pct": round(vm.percent, 2),
        "ram_total_gb": round(vm.total / (1024 ** 3), 2),
        "disk_pct": round(disk.percent, 2),
        "disk_total_gb": round(disk.total / (1024 ** 3), 2),
        "battery_health_pct": battery_health_pct,
        "battery_cycles": battery_cycles,
        "uptime_seconds": uptime_seconds,
        "filevault_enabled": get_filevault_status(),
        "bitlocker_enabled": None,
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
    try:
        r = subprocess.run(
            ["system_profiler", "SPApplicationsDataType", "-json"],
            capture_output=True,
            text=True,
            timeout=120,
        )
        if r.returncode != 0:
            return []
        data = json.loads(r.stdout)
        apps = data.get("SPApplicationsDataType", [])
        if isinstance(apps, dict):
            apps = apps.get("_name", []) or list(apps.values()) if "_name" in apps else []
        if not isinstance(apps, list):
            apps = [apps] if apps else []
        result = []
        for item in apps:
            if isinstance(item, dict):
                name = item.get("_name") or item.get("name") or item.get("SPAppName")
                version = item.get("version") or item.get("version_str") or ""
                if name:
                    result.append({"app_name": name, "version": str(version)[:128]})
            elif isinstance(item, list):
                for sub in item:
                    if isinstance(sub, dict) and (sub.get("_name") or sub.get("name")):
                        result.append({
                            "app_name": sub.get("_name") or sub.get("name"),
                            "version": str(sub.get("version", ""))[:128],
                        })
        return result[:500]
    except (subprocess.TimeoutExpired, FileNotFoundError, json.JSONDecodeError) as e:
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
        procs.sort(key=lambda x: x[2], reverse=True)  # sort by RAM (x[2]), not CPU
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

    # Derive REST URL from functions URL
    supabase_rest_url = api_url.replace("/functions/v1", "/rest/v1")
    anon_key = config.get("anon_key", "")

    logger.info("Starting agent for device_id=%s", device_id)

    t = threading.Thread(target=inventory_loop, args=(api_url, token), daemon=True)
    t.start()

    t2 = threading.Thread(target=command_loop, args=(device_id, anon_key, supabase_rest_url), daemon=True)
    t2.start()

    heartbeat_loop(api_url, token)


# ──────────────────────────────────────────────
# OPTIMIZER: command handlers + polling loop
# ──────────────────────────────────────────────

SAFE_PROCS = {
    "kernel_task", "launchd", "WindowServer", "loginwindow", "coreaudiod",
    "configd", "mds", "mds_stores", "diskarbitrationd", "securityd",
    "opendirectoryd", "systemstats", "sysmond", "powerd", "symptomsd",
    "python3", "python",
}

FOREGROUND_APPS = {
    "Safari", "Google Chrome", "Google Chrome Helper", "Firefox", "Slack",
    "zoom.us", "Microsoft Teams", "Finder", "Dock", "Mail", "Calendar",
    "Terminal", "iTerm2", "Visual Studio Code", "Xcode", "Spotify",
    "Music", "Photos", "Messages", "FaceTime", "Notes", "Reminders",
}


# When a helper is killed, also kill the parent app so it can't respawn the helper
APP_FAMILY = {
    "Google Chrome Helper": "Google Chrome",
    "Spotify Helper":       "Spotify",
    "Slack Helper":         "Slack",
    "Brave Browser Helper": "Brave Browser",
    "WhatsApp Helper":      "WhatsApp",
    "Firefox Helper":       "Firefox",
    "Opera Helper":         "Opera",
}


def _kill_by_name(name):
    killed = []
    for proc in psutil.process_iter(["name", "pid"]):
        try:
            if proc.info["name"] == name and name not in SAFE_PROCS:
                proc.kill()
                killed.append(proc.info["pid"])
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue
    return killed


def handle_kill_process(payload):
    process_name = payload.get("process_name", "")
    if not process_name:
        return "No process_name in payload", False
    try:
        killed = _kill_by_name(process_name)

        # If this is a helper process, also kill the parent app to prevent respawn
        parent_killed = []
        for prefix, parent_name in APP_FAMILY.items():
            if process_name.startswith(prefix):
                parent_killed = _kill_by_name(parent_name)
                if parent_killed:
                    logger.info("Also killed parent app '%s' to prevent respawn", parent_name)
                break

        total = len(killed) + len(parent_killed)
        if total:
            result = f"Killed '{process_name}' ({len(killed)} instance(s))"
            if parent_killed:
                result += f" + parent app ({len(parent_killed)} instance(s)) to prevent respawn"
        else:
            result = f"Process '{process_name}' not found (may have already exited)"
        logger.info(result)
        return result, True
    except Exception as e:
        return f"Error: {e}", False


def handle_optimize_memory(payload):
    threshold_mb = payload.get("threshold_mb", 500)
    try:
        killed = []
        for proc in psutil.process_iter(["name", "pid", "memory_info"]):
            try:
                name = proc.info["name"]
                if name in SAFE_PROCS:
                    continue
                ram_mb = (proc.info["memory_info"].rss / 1024 / 1024) if proc.info["memory_info"] else 0
                if ram_mb > threshold_mb:
                    proc.kill()
                    killed.append(f"{name} ({ram_mb:.0f}MB)")
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
        result = f"Freed memory — killed {len(killed)} process(es): {', '.join(killed)}" if killed else f"No processes using >{threshold_mb}MB found"
        logger.info(result)
        return result, True
    except Exception as e:
        return f"Memory optimization error: {e}", False


def handle_clear_cache(payload):
    import shutil
    freed_bytes = 0
    cleared = 0
    cache_dir = os.path.expanduser("~/Library/Caches")
    try:
        if os.path.exists(cache_dir):
            for entry in os.scandir(cache_dir):
                try:
                    if entry.is_dir():
                        size = sum(f.stat().st_size for f in Path(entry.path).rglob("*") if f.is_file())
                        shutil.rmtree(entry.path, ignore_errors=True)
                        freed_bytes += size
                        cleared += 1
                    elif entry.is_file():
                        freed_bytes += entry.stat().st_size
                        os.remove(entry.path)
                except Exception:
                    continue
        mb = freed_bytes / 1024 / 1024
        freed_str = f"{mb/1024:.1f} GB" if mb >= 1024 else f"{mb:.0f} MB"
        result = f"Cache cleared — freed {freed_str} across {cleared} folder(s)"
        logger.info(result)
        return result, True
    except Exception as e:
        return f"Cache clear error: {e}", False


def handle_restart_ui(payload):
    try:
        import subprocess as sp
        sp.run(["killall", "Dock"], capture_output=True)
        sp.run(["killall", "Finder"], capture_output=True)
        result = "UI restarted — Dock and Finder relaunched successfully"
        logger.info(result)
        return result, True
    except Exception as e:
        return f"UI restart error: {e}", False


def handle_kill_background_services(payload):
    threshold_mb = payload.get("threshold_mb", 200)
    try:
        killed = []
        for proc in psutil.process_iter(["name", "pid", "memory_info"]):
            try:
                name = proc.info["name"]
                if name in SAFE_PROCS or name in FOREGROUND_APPS:
                    continue
                ram_mb = (proc.info["memory_info"].rss / 1024 / 1024) if proc.info["memory_info"] else 0
                if ram_mb > threshold_mb:
                    proc.kill()
                    killed.append(f"{name} ({ram_mb:.0f}MB)")
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
        result = f"Killed {len(killed)} background service(s): {', '.join(killed)}" if killed else f"No background services using >{threshold_mb}MB found"
        logger.info(result)
        return result, True
    except Exception as e:
        return f"Background service kill error: {e}", False


COMMAND_HANDLERS = {
    "kill_process":             handle_kill_process,
    "optimize_memory":          handle_optimize_memory,
    "clear_cache":              handle_clear_cache,
    "restart_ui":               handle_restart_ui,
    "kill_background_services": handle_kill_background_services,
}


def command_loop(device_id, anon_key, supabase_rest_url):
    if not supabase_rest_url or not anon_key:
        logger.warning("Command loop: missing REST URL or anon_key — optimizer disabled")
        return
    headers = {
        "Authorization": f"Bearer {anon_key}",
        "apikey": anon_key,
        "Content-Type": "application/json",
    }
    logger.info("Optimizer command loop started — polling every 10s")
    while True:
        try:
            r = requests.get(
                f"{supabase_rest_url}/device_commands"
                f"?device_id=eq.{device_id}&status=eq.pending&order=created_at.asc&limit=10",
                headers=headers, timeout=10,
            )
            if r.status_code == 200:
                for cmd in r.json():
                    cmd_id = cmd["id"]
                    cmd_type = cmd.get("command_type")
                    payload = cmd.get("payload", {})
                    requests.patch(
                        f"{supabase_rest_url}/device_commands?id=eq.{cmd_id}",
                        headers=headers, json={"status": "running"}, timeout=10,
                    )
                    handler = COMMAND_HANDLERS.get(cmd_type)
                    result, success = handler(payload) if handler else (f"Unknown command: {cmd_type}", False)
                    requests.patch(
                        f"{supabase_rest_url}/device_commands?id=eq.{cmd_id}",
                        headers=headers,
                        json={
                            "status": "done" if success else "failed",
                            "result": result,
                            "executed_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                        },
                        timeout=10,
                    )
        except Exception as e:
            logger.warning("Command loop error: %s", e)
        time.sleep(10)


if __name__ == "__main__":
    main()
