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
from datetime import datetime, timedelta
from pathlib import Path

import psutil
import requests

LOG_PATH = "/var/log/healsparrow-agent.log"
CONFIG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "config.json")
HEARTBEAT_INTERVAL = 300
INVENTORY_INTERVAL = 3600

# Known antivirus/EDR apps to check for
KNOWN_AV_APPS = [
    "CrowdStrike Falcon",
    "CrowdStrikeFalcon",
    "Falcon",
    "Carbon Black",
    "CarbonBlack",
    "SentinelOne",
    "Symantec Endpoint Security",
    "Norton",
    "McAfee Endpoint Security",
    "Sophos",
    "Malwarebytes",
    "ESET Endpoint Antivirus",
    "Trend Micro",
    "Kaspersky",
    "Bitdefender",
    "Avast",
    "Avira",
    "F-Secure",
    "Webroot",
    "Cylance",
    "Palo Alto Cortex",
    "Microsoft Defender",
]

# Remote access apps to watch
REMOTE_ACCESS_PROCS = {
    "anydesk": "AnyDesk",
    "teamviewer": "TeamViewer",
    "screensharing": "Screen Sharing",
    "screensharingd": "Screen Sharing",
    "rfb": "VNC",
    "logmein": "LogMeIn",
    "splashtop": "Splashtop",
    "goto": "GoTo Meeting",
    "bomgar": "Bomgar",
}


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

    anon_key = config.get("anon_key", "")
    enroll_headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {anon_key}",
        "apikey": anon_key,
    }

    for attempt in range(3):
        try:
            r = requests.post(
                f"{api_url}/enroll",
                json=body,
                headers=enroll_headers,
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


# ──────────────────────────────────────────────
# BATTERY
# ──────────────────────────────────────────────

def get_battery_info() -> dict:
    """Return battery_pct, battery_cycles, battery_health, is_charging."""
    info = {
        "battery_pct": None,
        "battery_cycles": None,
        "battery_health": None,
        "is_charging": None,
    }

    # psutil for charge % and charging status
    try:
        bat = psutil.sensors_battery()
        if bat:
            info["battery_pct"] = round(bat.percent, 1)
            info["is_charging"] = bat.power_plugged
    except Exception:
        pass

    # ioreg for cycle count and health condition
    try:
        r = subprocess.run(
            ["ioreg", "-rn", "AppleSmartBattery"],
            capture_output=True, text=True, timeout=10,
        )
        if r.returncode == 0:
            for line in r.stdout.splitlines():
                if '"CycleCount"' in line:
                    parts = line.split("=")
                    if len(parts) > 1:
                        try:
                            info["battery_cycles"] = int(parts[-1].strip())
                        except ValueError:
                            pass
                if '"BatteryHealth"' in line or '"PermanentFailureStatus"' in line:
                    pass  # Covered by DesignCapacity vs MaxCapacity ratio below
                if '"DesignCapacity"' in line:
                    try:
                        design = int(line.split("=")[-1].strip())
                        info["_design_cap"] = design
                    except ValueError:
                        pass
                if '"MaxCapacity"' in line:
                    try:
                        max_cap = int(line.split("=")[-1].strip())
                        info["_max_cap"] = max_cap
                    except ValueError:
                        pass

            # Derive health from capacity ratio
            design = info.pop("_design_cap", None)
            max_cap = info.pop("_max_cap", None)
            if design and max_cap and design > 0:
                ratio = (max_cap / design) * 100
                if ratio >= 80:
                    info["battery_health"] = "Good"
                elif ratio >= 50:
                    info["battery_health"] = "Fair"
                else:
                    info["battery_health"] = "Poor"
    except Exception as e:
        logger.debug("Battery ioreg failed: %s", e)

    return info


# ──────────────────────────────────────────────
# NETWORK
# ──────────────────────────────────────────────

def get_wifi_info() -> dict:
    """Return wifi_ssid and wifi_rssi."""
    info = {"wifi_ssid": None, "wifi_rssi": None}
    airport_paths = [
        "/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport",
        "/usr/sbin/airport",
    ]
    airport = None
    for p in airport_paths:
        if os.path.exists(p):
            airport = p
            break

    if not airport:
        return info

    try:
        r = subprocess.run(
            [airport, "-I"],
            capture_output=True, text=True, timeout=10,
        )
        if r.returncode == 0:
            for line in r.stdout.splitlines():
                line = line.strip()
                if line.startswith("SSID:"):
                    info["wifi_ssid"] = line.split(":", 1)[-1].strip()
                elif line.startswith("agrCtlRSSI:"):
                    try:
                        info["wifi_rssi"] = int(line.split(":")[-1].strip())
                    except ValueError:
                        pass
    except Exception as e:
        logger.debug("WiFi info failed: %s", e)

    return info


def get_location() -> dict:
    """Get approximate location from public IP using ip-api.com (free, no key needed)."""
    try:
        r = requests.get("http://ip-api.com/json/?fields=status,country,regionName,city,lat,lon,isp,query", timeout=5)
        if r.status_code == 200:
            data = r.json()
            if data.get("status") == "success":
                return {
                    "public_ip": data.get("query"),
                    "city": data.get("city"),
                    "region": data.get("regionName"),
                    "country": data.get("country"),
                    "latitude": data.get("lat"),
                    "longitude": data.get("lon"),
                    "isp": data.get("isp"),
                }
    except Exception:
        pass
    return {"public_ip": None, "city": None, "region": None, "country": None, "latitude": None, "longitude": None, "isp": None}


def get_network_io() -> dict:
    """Return net_upload_mb and net_download_mb (cumulative since boot)."""
    try:
        io = psutil.net_io_counters()
        return {
            "net_upload_mb": round(io.bytes_sent / (1024 * 1024), 2),
            "net_download_mb": round(io.bytes_recv / (1024 * 1024), 2),
        }
    except Exception:
        return {"net_upload_mb": None, "net_download_mb": None}


# ──────────────────────────────────────────────
# SECURITY STATUS
# ──────────────────────────────────────────────

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
            return r.stdout.strip() in ("1", "2")
    except (subprocess.TimeoutExpired, FileNotFoundError):
        pass
    return False


def get_sip_status() -> bool:
    try:
        r = subprocess.run(
            ["csrutil", "status"],
            capture_output=True, text=True, timeout=5,
        )
        if r.returncode == 0:
            return "enabled" in r.stdout.lower()
    except (subprocess.TimeoutExpired, FileNotFoundError):
        pass
    return False


def get_gatekeeper_status() -> bool:
    try:
        r = subprocess.run(
            ["spctl", "--status"],
            capture_output=True, text=True, timeout=5,
        )
        if r.returncode == 0:
            return "assessments enabled" in r.stdout.lower() or "enabled" in r.stdout.lower()
    except (subprocess.TimeoutExpired, FileNotFoundError):
        pass
    return False


# ──────────────────────────────────────────────
# COMPLIANCE
# ──────────────────────────────────────────────

def get_mdm_enrollment() -> bool:
    try:
        r = subprocess.run(
            ["profiles", "status", "-type", "enrollment"],
            capture_output=True, text=True, timeout=10,
        )
        if r.returncode == 0:
            output = r.stdout.lower()
            return "enrolled" in output and "not enrolled" not in output
    except (subprocess.TimeoutExpired, FileNotFoundError):
        pass
    return False


def get_antivirus_installed() -> str:
    """Return name of detected AV/EDR or empty string."""
    applications_dir = "/Applications"
    try:
        installed = os.listdir(applications_dir)
        for av in KNOWN_AV_APPS:
            for app in installed:
                app_name = app.replace(".app", "")
                if av.lower() in app_name.lower():
                    return av
    except OSError:
        pass
    return ""


# ──────────────────────────────────────────────
# USB DEVICES
# ──────────────────────────────────────────────

def get_usb_devices() -> list:
    """Return list of connected USB devices."""
    try:
        r = subprocess.run(
            ["system_profiler", "SPUSBDataType", "-json"],
            capture_output=True, text=True, timeout=30,
        )
        if r.returncode != 0:
            return []
        data = json.loads(r.stdout)
        usb_items = data.get("SPUSBDataType", [])
        devices = []

        def _extract(items):
            if not isinstance(items, list):
                return
            for item in items:
                if not isinstance(item, dict):
                    continue
                name = item.get("_name") or item.get("manufacturer", "Unknown")
                vendor = item.get("manufacturer", "")
                product_id = item.get("product_id", "")
                vendor_id = item.get("vendor_id", "")
                serial = item.get("serial_num", "")
                dev_type = "storage" if any(
                    k in name.lower() for k in ("disk", "storage", "flash", "drive", "usb")
                ) else "peripheral"
                devices.append({
                    "name": name[:128],
                    "vendor": vendor[:64],
                    "product_id": product_id[:16],
                    "vendor_id": vendor_id[:16],
                    "serial": serial[:64],
                    "type": dev_type,
                })
                # Recurse into sub-items
                _extract(item.get("_items", []))

        _extract(usb_items)
        return devices[:50]
    except Exception as e:
        logger.debug("USB devices failed: %s", e)
        return []


# ──────────────────────────────────────────────
# INSTALLED APPS (hourly)
# ──────────────────────────────────────────────

def get_installed_apps() -> list:
    """Return list of installed apps from /Applications with name, version, last_modified."""
    apps = []
    try:
        applications_dir = Path("/Applications")
        for app_path in applications_dir.glob("*.app"):
            try:
                name = app_path.stem
                last_modified = datetime.fromtimestamp(
                    app_path.stat().st_mtime
                ).isoformat()
                version = ""
                plist_path = app_path / "Contents" / "Info.plist"
                if plist_path.exists():
                    try:
                        r = subprocess.run(
                            ["defaults", "read", str(plist_path), "CFBundleShortVersionString"],
                            capture_output=True, text=True, timeout=3,
                        )
                        if r.returncode == 0:
                            version = r.stdout.strip()[:32]
                    except Exception:
                        pass
                apps.append({
                    "name": name[:128],
                    "version": version,
                    "last_modified": last_modified,
                })
            except OSError:
                continue
        apps.sort(key=lambda x: x["name"].lower())
    except Exception as e:
        logger.debug("Installed apps failed: %s", e)
    return apps[:500]


# ──────────────────────────────────────────────
# LOGIN / SESSION
# ──────────────────────────────────────────────

def get_active_user() -> str:
    """Return currently logged-in user."""
    try:
        r = subprocess.run(
            ["stat", "-f", "%Su", "/dev/console"],
            capture_output=True, text=True, timeout=5,
        )
        if r.returncode == 0 and r.stdout.strip():
            return r.stdout.strip()
    except Exception:
        pass
    return os.environ.get("USER", "")


def get_remote_session_active() -> bool:
    """Check if AnyDesk, TeamViewer, or Screen Sharing is actively running."""
    try:
        running_names = {p.name().lower() for p in psutil.process_iter(["name"])}
        for proc_name in REMOTE_ACCESS_PROCS:
            if proc_name in running_names:
                return True
    except Exception:
        pass
    return False


# ──────────────────────────────────────────────
# BROWSERS, SESSIONS, TOP PROCESSES
# ──────────────────────────────────────────────

def get_installed_browsers() -> list:
    """Detect installed browsers from /Applications."""
    BROWSER_MAP = {
        "Google Chrome.app":          {"name": "Google Chrome",  "engine": "Blink"},
        "Google Chrome Canary.app":   {"name": "Chrome Canary",  "engine": "Blink"},
        "Chromium.app":               {"name": "Chromium",       "engine": "Blink"},
        "Microsoft Edge.app":         {"name": "Microsoft Edge", "engine": "Blink"},
        "Brave Browser.app":          {"name": "Brave",          "engine": "Blink"},
        "Opera.app":                  {"name": "Opera",          "engine": "Blink"},
        "Vivaldi.app":                {"name": "Vivaldi",        "engine": "Blink"},
        "Arc.app":                    {"name": "Arc",            "engine": "Blink"},
        "Safari.app":                 {"name": "Safari",         "engine": "WebKit"},
        "Firefox.app":                {"name": "Firefox",        "engine": "Gecko"},
        "Firefox Developer Edition.app": {"name": "Firefox Dev", "engine": "Gecko"},
        "Tor Browser.app":            {"name": "Tor Browser",    "engine": "Gecko"},
        "Orion.app":                  {"name": "Orion",          "engine": "WebKit"},
    }
    found = []
    try:
        # Get default browser
        default_result = subprocess.run(
            ["defaults", "read", "com.apple.LaunchServices/com.apple.launchservices.secure", "LSHandlers"],
            capture_output=True, text=True, timeout=5
        )
        default_bundle = ""
        for line in default_result.stdout.splitlines():
            if "LSHandlerURLScheme = https" in line or "LSHandlerURLScheme = http" in line:
                pass
            if "LSHandlerRoleAll" in line:
                default_bundle = line.split("=")[-1].strip().strip(";").strip('"')

        for app_dir in ["/Applications", f"{os.path.expanduser('~')}/Applications"]:
            if not os.path.exists(app_dir):
                continue
            for app_name, meta in BROWSER_MAP.items():
                app_path = os.path.join(app_dir, app_name)
                if os.path.exists(app_path):
                    version = None
                    try:
                        r = subprocess.run(
                            ["defaults", "read", f"{app_path}/Contents/Info", "CFBundleShortVersionString"],
                            capture_output=True, text=True, timeout=5
                        )
                        if r.returncode == 0:
                            version = r.stdout.strip()
                    except Exception:
                        pass
                    found.append({
                        "name": meta["name"],
                        "version": version,
                        "engine": meta["engine"],
                        "path": app_path,
                        "is_default": False,
                        "profiles": 0,
                    })
    except Exception as e:
        logger.debug("Browser detection error: %s", e)
    return found


def get_user_sessions() -> list:
    """Get currently logged-in users via `who`."""
    sessions = []
    try:
        r = subprocess.run(["who"], capture_output=True, text=True, timeout=5)
        for line in r.stdout.splitlines():
            parts = line.split()
            if len(parts) >= 2:
                sessions.append({
                    "username": parts[0],
                    "terminal": parts[1] if len(parts) > 1 else "",
                    "host": parts[-1].strip("()") if "(" in line else "",
                    "login_time": " ".join(parts[2:4]) if len(parts) >= 4 else "",
                })
    except Exception as e:
        logger.debug("Session collection error: %s", e)
    return sessions


def get_login_history() -> list:
    """Get recent login/logout events via `last`."""
    events = []
    try:
        r = subprocess.run(["last", "-20"], capture_output=True, text=True, timeout=10)
        for line in r.stdout.splitlines():
            if not line.strip() or line.startswith("wtmp"):
                continue
            parts = line.split()
            if len(parts) < 4:
                continue
            username = parts[0]
            event_type = "login"
            if "reboot" in username:
                event_type = "reboot"
            elif "shutdown" in username:
                event_type = "logout"
            events.append({
                "username": username,
                "terminal": parts[1] if len(parts) > 1 else "",
                "time": " ".join(parts[3:7]) if len(parts) >= 7 else " ".join(parts[3:]),
                "type": event_type,
            })
            if len(events) >= 20:
                break
    except Exception as e:
        logger.debug("Login history error: %s", e)
    return events


def get_top_processes(limit: int = 10) -> list:
    """Return top processes by RAM usage."""
    procs = []
    try:
        for p in psutil.process_iter(["name", "cpu_percent", "memory_info"]):
            try:
                info = p.info
                ram_mb = round(info["memory_info"].rss / (1024 ** 2), 1) if info.get("memory_info") else 0
                procs.append({
                    "process_name": info.get("name", "unknown"),
                    "cpu_pct": round(info.get("cpu_percent") or 0, 1),
                    "ram_mb": ram_mb,
                })
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                pass
        procs.sort(key=lambda x: x["ram_mb"], reverse=True)
    except Exception as e:
        logger.debug("Process collection error: %s", e)
    return procs[:limit]


# ──────────────────────────────────────────────
# CRASH LOGS
# ──────────────────────────────────────────────

def get_crash_info() -> dict:
    """Count crash logs from last 24h and return most recent app name."""
    crash_dir = Path.home() / "Library" / "Logs" / "DiagnosticReports"
    count = 0
    last_app = None
    last_mtime = 0
    cutoff = time.time() - 86400

    try:
        if crash_dir.exists():
            for f in crash_dir.iterdir():
                try:
                    st = f.stat()
                    if st.st_mtime > cutoff and f.suffix in (".crash", ".ips", ".hang"):
                        count += 1
                        if st.st_mtime > last_mtime:
                            last_mtime = st.st_mtime
                            # File name format: AppName_date_hostname.crash
                            last_app = f.name.split("_")[0]
                except OSError:
                    continue
    except Exception as e:
        logger.debug("Crash logs failed: %s", e)

    return {
        "crash_count_24h": count,
        "last_crashed_app": last_app,
    }


# ──────────────────────────────────────────────
# DISK HEALTH (S.M.A.R.T.)
# ──────────────────────────────────────────────

def get_disk_health() -> str:
    """Return disk S.M.A.R.T. status via diskutil. Returns 'Verified', 'Not Supported', or error string."""
    try:
        # Get the boot disk identifier
        r = subprocess.run(
            ["diskutil", "info", "/"],
            capture_output=True, text=True, timeout=10,
        )
        if r.returncode != 0:
            return "Not Supported"
        disk_id = None
        for line in r.stdout.splitlines():
            if "Device Identifier" in line:
                disk_id = line.split(":")[-1].strip()
                break
        if not disk_id:
            return "Not Supported"

        # Run verifyDisk
        r2 = subprocess.run(
            ["diskutil", "verifyDisk", disk_id],
            capture_output=True, text=True, timeout=60,
        )
        output = r2.stdout + r2.stderr
        if "appears to be OK" in output or "verified" in output.lower():
            return "Verified"
        elif "not supported" in output.lower():
            return "Not Supported"
        else:
            return output.strip()[:200] or "Unknown"
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return "Not Supported"
    except Exception as e:
        logger.debug("Disk health check failed: %s", e)
        return "Not Supported"


# ──────────────────────────────────────────────
# SLACK NOTIFICATIONS
# ──────────────────────────────────────────────

def notify_slack(api_url, anon_key, event_type, title, message, severity, fields=None):
    """Send a notification to the slack-notify Edge Function."""
    if not api_url or not anon_key:
        return
    payload = {
        "event_type": event_type,
        "device_name": platform.node(),
        "title": title,
        "message": message,
        "severity": severity,
        "fields": fields or [],
    }
    try:
        r = requests.post(
            f"{api_url}/slack-notify",
            json=payload,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {anon_key}",
                "apikey": anon_key,
            },
            timeout=15,
        )
        if r.status_code == 200:
            logger.info("Slack notification sent: %s", title)
        else:
            logger.debug("Slack notify response %s: %s", r.status_code, r.text[:200])
    except Exception as e:
        logger.debug("Slack notification failed: %s", e)


# ──────────────────────────────────────────────
# EXTENDED METRICS COLLECTION
# ──────────────────────────────────────────────

def get_memory_pressure() -> str:
    try:
        r = subprocess.run(["memory_pressure"], capture_output=True, text=True, timeout=5)
        out = r.stdout.lower()
        if "critical" in out: return "critical"
        if "warn" in out: return "warn"
        return "normal"
    except Exception:
        return None

def get_thermal_state() -> str:
    try:
        r = subprocess.run(["pmset", "-g", "therm"], capture_output=True, text=True, timeout=5)
        for line in r.stdout.splitlines():
            if "CPU_Speed_Limit" in line:
                val = line.split("=")[-1].strip()
                if val == "100": return "nominal"
                if int(val) >= 50: return "fair"
                return "serious"
        return "nominal"
    except Exception:
        return None

def get_fan_speed() -> int:
    try:
        r = subprocess.run(["system_profiler", "SPHardwareDataType"], capture_output=True, text=True, timeout=10)
        # fan data not in system_profiler; use powermetrics as fallback
        r2 = subprocess.run(["sudo", "powermetrics", "-n1", "-i1", "--samplers", "smc"], capture_output=True, text=True, timeout=10)
        for line in r2.stdout.splitlines():
            if "Fan" in line and "rpm" in line.lower():
                parts = line.split()
                for p in parts:
                    if p.isdigit(): return int(p)
    except Exception:
        pass
    return None

def get_swap_info() -> dict:
    try:
        vm = psutil.swap_memory()
        return {"swap_used_mb": round(vm.used / (1024**2), 1), "swap_total_mb": round(vm.total / (1024**2), 1)}
    except Exception:
        return {"swap_used_mb": None, "swap_total_mb": None}

def get_disk_io() -> dict:
    try:
        io = psutil.disk_io_counters()
        return {"disk_read_mb": round(io.read_bytes / (1024**2), 1), "disk_write_mb": round(io.write_bytes / (1024**2), 1)}
    except Exception:
        return {"disk_read_mb": None, "disk_write_mb": None}

def get_open_connections() -> int:
    try:
        return len(psutil.net_connections())
    except Exception:
        return None

def get_pending_updates() -> dict:
    try:
        r = subprocess.run(["softwareupdate", "-l"], capture_output=True, text=True, timeout=30)
        updates = [l.strip() for l in r.stdout.splitlines() if l.strip().startswith("*")]
        return {"pending_updates": updates, "pending_update_count": len(updates)}
    except Exception:
        return {"pending_updates": [], "pending_update_count": 0}

def get_screen_lock_info() -> dict:
    try:
        r = subprocess.run(["defaults", "-currentHost", "read", "com.apple.screensaver", "idleTime"],
                           capture_output=True, text=True, timeout=5)
        delay = int(r.stdout.strip()) if r.returncode == 0 else None
        r2 = subprocess.run(["defaults", "read", "com.apple.screensaver", "askForPassword"],
                            capture_output=True, text=True, timeout=5)
        enabled = r2.stdout.strip() == "1" if r2.returncode == 0 else None
        return {"screen_lock_enabled": enabled, "screen_lock_delay_sec": delay}
    except Exception:
        return {"screen_lock_enabled": None, "screen_lock_delay_sec": None}

def get_login_items() -> dict:
    try:
        r = subprocess.run(["osascript", "-e",
            'tell application "System Events" to get the name of every login item'],
            capture_output=True, text=True, timeout=10)
        items = [i.strip() for i in r.stdout.split(",") if i.strip()] if r.returncode == 0 else []
        return {"login_items": items, "login_item_count": len(items)}
    except Exception:
        return {"login_items": [], "login_item_count": 0}

def get_proxy_configured() -> bool:
    try:
        r = subprocess.run(["networksetup", "-getwebproxy", "Wi-Fi"], capture_output=True, text=True, timeout=5)
        return "Enabled: Yes" in r.stdout
    except Exception:
        return None

def get_timemachine_info() -> dict:
    try:
        r = subprocess.run(["tmutil", "status"], capture_output=True, text=True, timeout=10)
        enabled = r.returncode == 0
        last = None
        r2 = subprocess.run(["tmutil", "latestbackup"], capture_output=True, text=True, timeout=10)
        if r2.returncode == 0 and r2.stdout.strip():
            last = r2.stdout.strip()
        return {"timemachine_enabled": enabled, "timemachine_last_backup": last}
    except Exception:
        return {"timemachine_enabled": None, "timemachine_last_backup": None}

def get_last_reboot() -> str:
    try:
        bt = psutil.boot_time()
        return __import__("datetime").datetime.utcfromtimestamp(bt).isoformat() + "Z"
    except Exception:
        return None


def get_bluetooth_devices() -> list:
    """Get paired/connected Bluetooth devices via system_profiler."""
    devices = []
    try:
        r = subprocess.run(
            ["system_profiler", "SPBluetoothDataType", "-json"],
            capture_output=True, text=True, timeout=15
        )
        if r.returncode == 0:
            data = json.loads(r.stdout)
            bt_items = data.get("SPBluetoothDataType", [])
            for item in bt_items:
                for section_key in ("device_connected", "device_not_connected", "devices_connected", "devices_not_connected"):
                    for dev_group in item.get(section_key, []):
                        if isinstance(dev_group, dict):
                            for name, info in dev_group.items():
                                connected = section_key in ("device_connected", "devices_connected")
                                devices.append({
                                    "name": name,
                                    "type": info.get("device_minorClassOfDevice_string", "Unknown"),
                                    "connected": connected,
                                    "battery_pct": None,
                                })
    except Exception as e:
        logger.debug("Bluetooth detection error: %s", e)
    return devices


def get_connected_displays() -> list:
    """Get connected displays via system_profiler."""
    displays = []
    try:
        r = subprocess.run(
            ["system_profiler", "SPDisplaysDataType", "-json"],
            capture_output=True, text=True, timeout=15
        )
        if r.returncode == 0:
            data = json.loads(r.stdout)
            for gpu_entry in data.get("SPDisplaysDataType", []):
                gpu_name = gpu_entry.get("sppci_model", "Unknown GPU")
                for disp in gpu_entry.get("spdisplays_ndrvs", []):
                    res = disp.get("_spdisplays_resolution", disp.get("spdisplays_resolution", "Unknown"))
                    displays.append({
                        "name": disp.get("_name", disp.get("spdisplays_display-product-name", "Unknown Display")),
                        "resolution": res,
                        "gpu": gpu_name,
                    })
    except Exception as e:
        logger.debug("Display detection error: %s", e)
    return displays


def get_printers() -> list:
    """Get installed printers via lpstat."""
    printers = []
    try:
        r = subprocess.run(["lpstat", "-p"], capture_output=True, text=True, timeout=10)
        for line in r.stdout.splitlines():
            if line.startswith("printer "):
                parts = line.split()
                if len(parts) >= 2:
                    printers.append(parts[1])
    except Exception as e:
        logger.debug("Printer detection error: %s", e)
    return printers


def get_listening_ports() -> list:
    """Get listening ports with process names via lsof."""
    ports = []
    seen = set()
    try:
        r = subprocess.run(
            ["lsof", "-iTCP", "-iUDP", "-sTCP:LISTEN", "-n", "-P"],
            capture_output=True, text=True, timeout=15
        )
        for line in r.stdout.splitlines()[1:]:
            parts = line.split()
            if len(parts) < 9:
                continue
            name_field = parts[8] if len(parts) > 8 else ""
            if ":" not in name_field:
                continue
            port_str = name_field.rsplit(":", 1)[-1]
            if not port_str.isdigit():
                continue
            key = (port_str, parts[7])
            if key in seen:
                continue
            seen.add(key)
            ports.append({
                "port": int(port_str),
                "process": parts[0],
                "protocol": parts[7].lower(),
            })
            if len(ports) >= 20:
                break
    except Exception as e:
        logger.debug("Listening ports error: %s", e)
    return ports


def get_dns_servers() -> list:
    """Get DNS servers via scutil."""
    dns = []
    try:
        r = subprocess.run(["scutil", "--dns"], capture_output=True, text=True, timeout=10)
        for line in r.stdout.splitlines():
            line = line.strip()
            if line.startswith("nameserver["):
                server = line.split(":")[-1].strip()
                if server and server not in dns:
                    dns.append(server)
    except Exception as e:
        logger.debug("DNS detection error: %s", e)
    return dns[:5]


# ──────────────────────────────────────────────
# METRICS COLLECTION
# ──────────────────────────────────────────────

_cached_apps: list = []
_cached_apps_time: float = 0.0

def collect_metrics() -> dict:
    global _cached_apps, _cached_apps_time
    vm = psutil.virtual_memory()
    disk = psutil.disk_usage("/")
    cpu_pct = psutil.cpu_percent(interval=2)
    uptime_seconds = int(time.time() - psutil.boot_time()) if hasattr(psutil, "boot_time") else 0

    # Installed apps — refresh every hour or on first run
    now = time.time()
    if not _cached_apps or (now - _cached_apps_time) >= 3600:
        _cached_apps = get_installed_apps()
        _cached_apps_time = now

    # Existing battery (legacy fields kept for metrics table compat)
    battery_health_pct = None
    if hasattr(psutil, "sensors_battery") and psutil.sensors_battery():
        bat = psutil.sensors_battery()
        battery_health_pct = getattr(bat, "percent", None)

    # New battery info
    battery_info = get_battery_info()

    # Network
    wifi_info = get_wifi_info()
    net_io = get_network_io()

    # Security
    filevault = get_filevault_status()
    firewall = get_firewall_status()
    sip = get_sip_status()
    gatekeeper = get_gatekeeper_status()

    # Compliance
    mdm = get_mdm_enrollment()
    antivirus = get_antivirus_installed()

    # USB
    usb_devices = get_usb_devices()

    # Crash logs
    crash_info = get_crash_info()

    # Location (cached — refresh every 30 min)
    location = get_location()

    # Login / session
    active_user = get_active_user()
    remote_session = get_remote_session_active()
    user_sessions = get_user_sessions()
    login_history = get_login_history()

    # Browsers & processes
    installed_browsers = get_installed_browsers()
    top_processes = get_top_processes(10)

    # Peripherals
    bluetooth_devices = get_bluetooth_devices()
    connected_displays = get_connected_displays()
    printers = get_printers()

    # Network security
    listening_ports = get_listening_ports()
    dns_servers = get_dns_servers()

    # Extended metrics
    swap = get_swap_info()
    disk_io = get_disk_io()
    screen_lock = get_screen_lock_info()
    login_items = get_login_items()
    pending = get_pending_updates()
    timemachine = get_timemachine_info()

    return {
        # Core metrics (existing)
        "cpu_pct": round(cpu_pct, 2),
        "ram_pct": round(vm.percent, 2),
        "ram_total_gb": round(vm.total / (1024 ** 3), 2),
        "disk_pct": round(disk.percent, 2),
        "disk_total_gb": round(disk.total / (1024 ** 3), 2),
        "battery_health_pct": battery_health_pct,
        "battery_cycles": battery_info.get("battery_cycles"),
        "uptime_seconds": uptime_seconds,
        "filevault_enabled": filevault,
        "bitlocker_enabled": None,
        "firewall_enabled": firewall,

        # New battery fields
        "battery_pct": battery_info.get("battery_pct"),
        "battery_health": battery_info.get("battery_health"),
        "is_charging": battery_info.get("is_charging"),

        # Network
        "wifi_ssid": wifi_info.get("wifi_ssid"),
        "wifi_rssi": wifi_info.get("wifi_rssi"),
        "net_upload_mb": net_io.get("net_upload_mb"),
        "net_download_mb": net_io.get("net_download_mb"),

        # Security
        "sip_enabled": sip,
        "gatekeeper_enabled": gatekeeper,

        # Compliance
        "mdm_enrolled": mdm,
        "antivirus_installed": antivirus or None,

        # USB
        "usb_devices": usb_devices,

        # Crash logs
        "crash_count_24h": crash_info.get("crash_count_24h"),
        "last_crashed_app": crash_info.get("last_crashed_app"),

        # Login / session
        "active_user": active_user or None,
        "remote_session_active": remote_session,

        # Location
        "public_ip": location.get("public_ip"),
        "city": location.get("city"),
        "region": location.get("region"),
        "country": location.get("country"),
        "latitude": location.get("latitude"),
        "longitude": location.get("longitude"),
        "isp": location.get("isp"),

        # Installed apps (hourly refresh)
        "installed_apps": _cached_apps,

        # Browsers, sessions, top processes
        "installed_browsers": installed_browsers,
        "user_sessions": user_sessions,
        "login_history": login_history,
        "top_processes": top_processes,

        # Peripherals
        "bluetooth_devices": bluetooth_devices,
        "connected_displays": connected_displays,
        "printers": printers,

        # Network security
        "listening_ports": listening_ports,
        "dns_servers": dns_servers,

        # Extended monitoring
        "swap_used_mb": swap.get("swap_used_mb"),
        "swap_total_mb": swap.get("swap_total_mb"),
        "disk_read_mb": disk_io.get("disk_read_mb"),
        "disk_write_mb": disk_io.get("disk_write_mb"),
        "open_connections_count": get_open_connections(),
        "memory_pressure": get_memory_pressure(),
        "thermal_state": get_thermal_state(),
        "screen_lock_enabled": screen_lock.get("screen_lock_enabled"),
        "screen_lock_delay_sec": screen_lock.get("screen_lock_delay_sec"),
        "login_items": login_items.get("login_items"),
        "login_item_count": login_items.get("login_item_count"),
        "pending_updates": pending.get("pending_updates"),
        "pending_update_count": pending.get("pending_update_count"),
        "timemachine_enabled": timemachine.get("timemachine_enabled"),
        "timemachine_last_backup": timemachine.get("timemachine_last_backup"),
        "proxy_configured": get_proxy_configured(),
        "last_reboot": get_last_reboot(),
    }


def heartbeat_loop(api_url: str, token: str, anon_key: str = ""):
    # Track previous USB devices to detect new storage devices
    prev_usb_serials: set = set()
    # Track previous installed apps to detect new installs
    prev_app_names: set = set()
    # Track consecutive high-CPU heartbeats
    high_cpu_count = 0
    first_run = True
    hostname = platform.node()

    while True:
        try:
            metrics = collect_metrics()

            # ── New App Installed Detection ──
            current_apps = metrics.get("installed_apps") or []
            current_app_names = {a.get("name", "") for a in current_apps if a.get("name")}
            if not first_run and prev_app_names:
                new_apps = current_app_names - prev_app_names
                for app_name in new_apps:
                    app_info = next((a for a in current_apps if a.get("name") == app_name), {})
                    version = app_info.get("version", "unknown")
                    logger.info("New app detected: %s v%s", app_name, version)
                    notify_slack(
                        api_url, anon_key,
                        event_type="new_app_installed",
                        title="New App Installed",
                        message=f"{app_name} (v{version}) was installed on {hostname}",
                        severity="info",
                        fields=[
                            {"title": "App", "value": f"{app_name} v{version}"},
                            {"title": "Device", "value": hostname},
                        ],
                    )
            prev_app_names = current_app_names

            # ── System Critical: CPU, RAM, Disk, Battery ──
            cpu_pct = metrics.get("cpu_pct", 0)
            ram_pct = metrics.get("ram_pct", 0)
            disk_pct = metrics.get("disk_pct", 0)
            battery_pct = metrics.get("battery_pct")

            # CPU > 90% for 2 consecutive heartbeats
            if cpu_pct > 90:
                high_cpu_count += 1
            else:
                high_cpu_count = 0

            if not first_run:
                if high_cpu_count >= 2:
                    notify_slack(
                        api_url, anon_key,
                        event_type="system_critical",
                        title="High CPU Usage",
                        message=f"CPU at {cpu_pct}% for {high_cpu_count} consecutive heartbeats on {hostname}",
                        severity="critical",
                        fields=[
                            {"title": "CPU", "value": f"{cpu_pct}%"},
                            {"title": "Device", "value": hostname},
                        ],
                    )
                    high_cpu_count = 0  # Reset after notification

                if ram_pct > 90:
                    notify_slack(
                        api_url, anon_key,
                        event_type="system_critical",
                        title="High RAM Usage",
                        message=f"RAM at {ram_pct}% on {hostname}",
                        severity="warning",
                        fields=[
                            {"title": "RAM", "value": f"{ram_pct}%"},
                            {"title": "Device", "value": hostname},
                        ],
                    )

                if disk_pct > 90:
                    notify_slack(
                        api_url, anon_key,
                        event_type="system_critical",
                        title="High Disk Usage",
                        message=f"Disk at {disk_pct}% on {hostname}",
                        severity="critical",
                        fields=[
                            {"title": "Disk", "value": f"{disk_pct}%"},
                            {"title": "Device", "value": hostname},
                        ],
                    )

                if battery_pct is not None and battery_pct < 10:
                    notify_slack(
                        api_url, anon_key,
                        event_type="system_critical",
                        title="Low Battery",
                        message=f"Battery at {battery_pct}% on {hostname}",
                        severity="warning",
                        fields=[
                            {"title": "Battery", "value": f"{battery_pct}%"},
                            {"title": "Device", "value": hostname},
                        ],
                    )

            # ── Security Alerts ──
            if not first_run:
                if metrics.get("filevault_enabled") is False:
                    notify_slack(
                        api_url, anon_key,
                        event_type="security_alert",
                        title="FileVault Disabled",
                        message=f"FileVault disk encryption is disabled on {hostname}",
                        severity="critical",
                        fields=[{"title": "Device", "value": hostname}],
                    )

                if metrics.get("firewall_enabled") is False:
                    notify_slack(
                        api_url, anon_key,
                        event_type="security_alert",
                        title="Firewall Disabled",
                        message=f"Firewall is disabled on {hostname}",
                        severity="warning",
                        fields=[{"title": "Device", "value": hostname}],
                    )

                if metrics.get("sip_enabled") is False:
                    notify_slack(
                        api_url, anon_key,
                        event_type="security_alert",
                        title="SIP Disabled",
                        message=f"System Integrity Protection is disabled on {hostname}",
                        severity="critical",
                        fields=[{"title": "Device", "value": hostname}],
                    )

            # ── USB Storage Detection + Slack ──
            current_usb = metrics.get("usb_devices") or []
            current_storage = {
                d.get("serial") or d.get("name", "")
                for d in current_usb
                if d.get("type") == "storage"
            }
            if not first_run:
                new_storage = current_storage - prev_usb_serials
                if new_storage:
                    logger.warning("New USB storage device(s) detected: %s", new_storage)
                    for usb_id in new_storage:
                        notify_slack(
                            api_url, anon_key,
                            event_type="security_alert",
                            title="New USB Storage Device",
                            message=f"USB storage device '{usb_id}' connected to {hostname}",
                            severity="warning",
                            fields=[
                                {"title": "USB Device", "value": str(usb_id)},
                                {"title": "Device", "value": hostname},
                            ],
                        )
            prev_usb_serials = current_storage

            # ── Disk Health (S.M.A.R.T.) ──
            if not first_run:
                disk_status = get_disk_health()
                if disk_status not in ("Verified", "Not Supported"):
                    notify_slack(
                        api_url, anon_key,
                        event_type="disk_failing",
                        title="Disk Health Warning",
                        message=f"Disk S.M.A.R.T. status: {disk_status} on {hostname}",
                        severity="critical",
                        fields=[
                            {"title": "Status", "value": disk_status},
                            {"title": "Device", "value": hostname},
                        ],
                    )

            first_run = False

            r = retry_request(
                requests.post,
                f"{api_url}/heartbeat",
                json=metrics,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {anon_key}",
                    "X-Device-Token": token,
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


def inventory_loop(api_url: str, token: str, anon_key: str = ""):
    last_apps_sent = 0

    while True:
        time.sleep(INVENTORY_INTERVAL)
        try:
            software = get_software_list()
            processes = get_top_processes(20)

            # Send installed_apps once per hour via heartbeat (included in metrics)
            # Here we also collect the /Applications inventory
            payload = {"software": software, "processes": processes}

            # Include installed apps in hourly inventory
            now = time.time()
            if now - last_apps_sent >= INVENTORY_INTERVAL:
                installed_apps = get_installed_apps()
                payload["installed_apps"] = installed_apps
                last_apps_sent = now

            r = retry_request(
                requests.post,
                f"{api_url}/inventory",
                json=payload,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {anon_key}",
                    "X-Device-Token": token,
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

    t = threading.Thread(target=inventory_loop, args=(api_url, token, anon_key), daemon=True)
    t.start()

    t2 = threading.Thread(target=command_loop, args=(device_id, anon_key, supabase_rest_url), daemon=True)
    t2.start()

    heartbeat_loop(api_url, token, anon_key)


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
