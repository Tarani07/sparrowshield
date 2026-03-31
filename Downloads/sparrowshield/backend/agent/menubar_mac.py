#!/usr/bin/env python3
"""SparrowShield — macOS Menu Bar App"""

import json
import os
import subprocess
import threading
import time
import webbrowser
from pathlib import Path

import psutil
import rumps

# ── Constants ─────────────────────────────────────────────────────────────────

BASE_DIR      = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH   = os.path.join(BASE_DIR, "config.json")
IT_TICKET_URL = "https://requests.surveysparrow.com/s/it-request"
REFRESH_SEC   = 30     # stats refresh interval
NOTICE_SEC    = 120    # IT notice poll interval
UPDATE_SEC    = 3600   # OS update check interval (1 hour)

SAFE_PROCS = {
    "kernel_task", "launchd", "WindowServer", "loginwindow", "coreaudiod",
    "configd", "mds", "mds_stores", "diskarbitrationd", "securityd",
    "opendirectoryd", "systemstats", "sysmond", "powerd", "symptomsd",
    "python3", "python", "Python", "menubar_mac", "agent_mac", "bash", "zsh",
    "fish", "ssh", "sshd", "git", "npm", "node",
}

# ── Config loader ─────────────────────────────────────────────────────────────

def _load_config() -> dict:
    try:
        with open(CONFIG_PATH) as f:
            return json.load(f)
    except Exception:
        return {}

# ── Formatters ────────────────────────────────────────────────────────────────

def _fmt_bytes(n: float) -> str:
    mb = n / 1_048_576
    return f"{mb / 1024:.1f} GB" if mb >= 1024 else f"{mb:.0f} MB"

def _fmt_gb(n: float) -> str:
    return f"{n / 1_073_741_824:.1f} GB"

def _wifi_bars(rssi: int | None) -> str:
    if rssi is None:
        return "—"
    if rssi >= -55: return "▂▄▆█  Excellent"
    if rssi >= -65: return "▂▄▆   Good"
    if rssi >= -75: return "▂▄    Fair"
    return                  "▂     Weak"

def _health_bar(score: int) -> str:
    filled = round(score / 10)
    bar = "█" * filled + "░" * (10 - filled)
    return f"[{bar}]  {score}/100"

# ── Stats collectors ──────────────────────────────────────────────────────────

def _get_stats() -> dict:
    cpu  = psutil.cpu_percent(interval=0.5)
    vm   = psutil.virtual_memory()
    disk = psutil.disk_usage("/")
    bat  = psutil.sensors_battery()
    return {
        "cpu":          cpu,
        "ram_used":     vm.used,
        "ram_total":    vm.total,
        "ram_pct":      vm.percent,
        "disk_pct":     disk.percent,
        "disk_used":    disk.used,
        "disk_total":   disk.total,
        "bat_pct":      int(bat.percent) if bat else None,
        "bat_charging": bat.power_plugged if bat else None,
    }

def _get_wifi_rssi() -> int | None:
    try:
        r = subprocess.run(
            ["/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport", "-I"],
            capture_output=True, text=True, timeout=5,
        )
        for line in r.stdout.splitlines():
            if "agrCtlRSSI" in line:
                return int(line.split(":")[1].strip())
    except Exception:
        pass
    return None

def _get_health_score() -> int:
    """Read health score written by agent, or compute a basic estimate."""
    try:
        score_file = os.path.join(BASE_DIR, ".last_health_score")
        if os.path.exists(score_file):
            val = int(Path(score_file).read_text().strip())
            if 0 <= val <= 100:
                return val
    except Exception:
        pass
    # Fallback: estimate from live metrics
    vm   = psutil.virtual_memory()
    disk = psutil.disk_usage("/")
    cpu  = psutil.cpu_percent(interval=0.3)
    score = 100
    if vm.percent   > 90: score -= 20
    elif vm.percent > 75: score -= 10
    if disk.percent > 90: score -= 20
    elif disk.percent > 80: score -= 10
    if cpu > 90: score -= 15
    elif cpu > 70: score -= 5
    return max(0, min(100, score))

# ── OS Update checker ─────────────────────────────────────────────────────────

_os_update_cache: dict = {"label": None, "checked_at": 0}

def _check_os_updates() -> str | None:
    """Returns update label if available, else None. Cached for 1 hour."""
    global _os_update_cache
    now = time.time()
    if now - _os_update_cache["checked_at"] < UPDATE_SEC:
        return _os_update_cache["label"]
    try:
        r = subprocess.run(
            ["softwareupdate", "--list"],
            capture_output=True, text=True, timeout=30,
        )
        output = r.stdout + r.stderr
        if "No new software available" in output or not output.strip():
            _os_update_cache = {"label": None, "checked_at": now}
            return None
        for line in output.splitlines():
            line = line.strip()
            if line.startswith("*") or line.startswith("-") or "Label:" in line:
                name = line.lstrip("*- ").replace("Label:", "").strip()
                if name:
                    _os_update_cache = {"label": name, "checked_at": now}
                    return name
        _os_update_cache = {"label": "macOS Update Available", "checked_at": now}
        return "macOS Update Available"
    except Exception:
        _os_update_cache = {"label": None, "checked_at": now}
        return None

# ── IT Notice fetcher ─────────────────────────────────────────────────────────

_notice_cache: dict = {"text": None, "sender": None, "checked_at": 0}

def _fetch_it_notice() -> dict | None:
    """Poll Supabase it_notices table for the latest active message."""
    global _notice_cache
    now = time.time()
    if now - _notice_cache["checked_at"] < NOTICE_SEC:
        return _notice_cache if _notice_cache.get("text") else None
    try:
        import urllib.request
        cfg      = _load_config()
        api_url  = cfg.get("api_url", "")
        anon_key = cfg.get("anon_key", "")
        rest_base = api_url.replace("/functions/v1", "")
        url = f"{rest_base}/rest/v1/it_notices?active=eq.true&order=created_at.desc&limit=1"
        req = urllib.request.Request(
            url,
            headers={
                "apikey":        anon_key,
                "Authorization": f"Bearer {anon_key}",
            }
        )
        with urllib.request.urlopen(req, timeout=8) as resp:
            data = json.loads(resp.read())
            if data:
                row = data[0]
                _notice_cache = {
                    "text":       row.get("message", ""),
                    "sender":     row.get("sender", "IT Admin"),
                    "checked_at": now,
                }
                return _notice_cache
    except Exception:
        pass
    _notice_cache = {"text": None, "sender": None, "checked_at": now}
    return None

# ── Optimize All ──────────────────────────────────────────────────────────────

def do_optimize_all() -> str:
    import shutil as _shutil
    freed = 0
    scan_dirs = [
        os.path.expanduser("~/Library/Caches"),
        "/tmp",
        os.path.expanduser("~/Library/Logs"),
        os.path.expanduser("~/Library/Application Support/CrashReporter"),
    ]
    for d in scan_dirs:
        if not os.path.exists(d):
            continue
        try:
            for entry in os.scandir(d):
                try:
                    sz = os.path.getsize(entry.path)
                    if entry.is_file(follow_symlinks=False):
                        os.remove(entry.path)
                        freed += sz
                    elif entry.is_dir(follow_symlinks=False):
                        _shutil.rmtree(entry.path, ignore_errors=True)
                        freed += sz
                except Exception:
                    pass
        except OSError:
            pass

    # Clear logs older than 30 days
    logs_dir = os.path.expanduser("~/Library/Logs")
    cutoff   = time.time() - 30 * 86400
    try:
        for root, _dirs, files in os.walk(logs_dir):
            for fname in files:
                if fname.endswith(".log"):
                    fp = os.path.join(root, fname)
                    try:
                        if os.path.getmtime(fp) < cutoff:
                            freed += os.path.getsize(fp)
                            os.remove(fp)
                    except OSError:
                        pass
    except OSError:
        pass

    # Kill heavy processes (>500 MB RAM)
    killed = []
    for p in psutil.process_iter(["name", "pid", "memory_info"]):
        try:
            name = p.info["name"] or ""
            if name in SAFE_PROCS:
                continue
            mi = p.info["memory_info"]
            if mi and mi.rss / 1_048_576 > 500:
                p.kill()
                killed.append(name)
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            pass

    return (
        f"Freed {_fmt_bytes(freed)}"
        + (f" · Killed {len(killed)} heavy app(s)" if killed else "")
    )

# ── Restart Agent ─────────────────────────────────────────────────────────────

def do_restart_agent() -> str:
    plist = os.path.expanduser("~/Library/LaunchAgents/com.sparrow.agent.plist")
    if not os.path.exists(plist):
        plist = "/Library/LaunchAgents/com.sparrow.agent.plist"
    try:
        subprocess.run(["launchctl", "unload", plist], capture_output=True, timeout=5)
        time.sleep(1)
        subprocess.run(["launchctl", "load",   plist], capture_output=True, timeout=5)
        return "Agent restarted successfully"
    except Exception as e:
        return f"Restart failed: {e}"

# ── Run helper (threaded, updates title to spinner while running) ─────────────

def _run(label: str, fn):
    def worker():
        orig = app.title
        app.title = "🛡️  ..."
        try:
            result = fn()
            rumps.notification("SparrowShield", label, result or "Done")
        except Exception as exc:
            rumps.notification("SparrowShield", f"{label} — Error", str(exc))
        finally:
            app.title = orig
    threading.Thread(target=worker, daemon=True).start()

# ── Build app & menu items ────────────────────────────────────────────────────

app = rumps.App("🛡️", quit_button=None)

# Stats (display-only, no callbacks)
item_cpu    = rumps.MenuItem("  CPU      —",  callback=None)
item_ram    = rumps.MenuItem("  RAM      —",  callback=None)
item_disk   = rumps.MenuItem("  Disk     —",  callback=None)
item_bat    = rumps.MenuItem("  Battery  —",  callback=None)
item_wifi   = rumps.MenuItem("  WiFi     —",  callback=None)
item_health = rumps.MenuItem("  Health   —",  callback=None)

# OS update section (hidden until update found)
item_os_hdr  = rumps.MenuItem("",  callback=None)
item_os_name = rumps.MenuItem("",  callback=None)
item_os_btn  = rumps.MenuItem("",  callback=None)

# IT notice section (hidden until notice exists)
item_nt_hdr  = rumps.MenuItem("",  callback=None)
item_nt_msg  = rumps.MenuItem("",  callback=None)
item_nt_from = rumps.MenuItem("",  callback=None)

# ── Callbacks ─────────────────────────────────────────────────────────────────

@rumps.clicked("⚡  Optimize All")
def on_optimize(_):
    _run("Optimize All", do_optimize_all)

@rumps.clicked("🎫  Raise IT Ticket")
def on_ticket(_):
    webbrowser.open(IT_TICKET_URL)

@rumps.clicked("🔁  Restart Agent")
def on_restart(_):
    _run("Restart Agent", do_restart_agent)

@rumps.clicked("Quit SparrowShield")
def on_quit(_):
    rumps.quit_application()

# ── Menu layout ───────────────────────────────────────────────────────────────

app.menu = [
    item_cpu,
    item_ram,
    item_disk,
    item_bat,
    item_wifi,
    item_health,
    None,
    item_os_hdr,
    item_os_name,
    item_os_btn,
    None,
    item_nt_hdr,
    item_nt_msg,
    item_nt_from,
    None,
    "⚡  Optimize All",
    "🎫  Raise IT Ticket",
    "🔁  Restart Agent",
    None,
    "Quit SparrowShield",
]

# ── Dynamic section visibility helpers ───────────────────────────────────────

def _set_os_section(update_name: str | None):
    if update_name:
        item_os_hdr.title  = "── 🍎 OS Update Available ──"
        item_os_name.title = f"  {update_name}"
        item_os_btn.title  = "  Install Now →"
        item_os_btn.set_callback(
            lambda _: subprocess.Popen(["open", "-a", "Software Update"])
        )
    else:
        item_os_hdr.title  = ""
        item_os_name.title = ""
        item_os_btn.title  = ""
        item_os_btn.set_callback(None)

def _set_nt_section(notice: dict | None):
    if notice and notice.get("text"):
        msg = notice["text"]
        # Word-wrap at ~44 chars
        words, lines, cur = msg.split(), [], "  "
        for w in words:
            if len(cur) + len(w) + 1 > 46:
                lines.append(cur)
                cur = "  " + w
            else:
                cur += (" " if cur.strip() else "") + w
        if cur.strip():
            lines.append(cur)
        item_nt_hdr.title  = "── 📢 IT Notice ──"
        item_nt_msg.title  = "\n".join(lines)
        item_nt_from.title = f"  From: {notice.get('sender', 'IT Admin')}"
    else:
        item_nt_hdr.title  = ""
        item_nt_msg.title  = ""
        item_nt_from.title = ""

# Hide both optional sections at startup
_set_os_section(None)
_set_nt_section(None)

# ── Refresh timer ─────────────────────────────────────────────────────────────

@rumps.timer(REFRESH_SEC)
def refresh(_):
    # Live stats
    stats  = _get_stats()
    health = _get_health_score()
    rssi   = _get_wifi_rssi()

    item_cpu.title    = f"  CPU      {stats['cpu']:.0f}%"
    item_ram.title    = f"  RAM      {_fmt_gb(stats['ram_used'])} / {_fmt_gb(stats['ram_total'])}  ({stats['ram_pct']:.0f}%)"
    item_disk.title   = f"  Disk     {_fmt_gb(stats['disk_used'])} / {_fmt_gb(stats['disk_total'])}  ({stats['disk_pct']:.0f}%)"

    bat_pct = stats["bat_pct"]
    if bat_pct is not None:
        plug = " ⚡" if stats["bat_charging"] else ""
        item_bat.title = f"  Battery  {bat_pct}%{plug}"
    else:
        item_bat.title = "  Battery  —"

    item_wifi.title   = f"  WiFi     {_wifi_bars(rssi)}"
    item_health.title = f"  Health   {_health_bar(health)}"

    # Menu bar title: 🛡️ CPU% · RAM GB
    ram_gb    = stats["ram_used"] / 1_073_741_824
    app.title = f"🛡️  {stats['cpu']:.0f}%  ·  {ram_gb:.1f}GB"

    # OS update check (runs subprocess, cached for 1h)
    _set_os_section(_check_os_updates())

    # IT notice (polls Supabase, cached for 2 min)
    _set_nt_section(_fetch_it_notice())

# ── Initial refresh on startup ────────────────────────────────────────────────

def _initial_refresh():
    time.sleep(1.5)
    refresh(None)

threading.Thread(target=_initial_refresh, daemon=True).start()

# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    app.run()
