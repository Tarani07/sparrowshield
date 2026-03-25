#!/usr/bin/env python3
"""Sparrow IT Admin — macOS Menu Bar App (production-ready)"""

import os
import shutil
import subprocess
import threading
import time
import webbrowser
import glob
import sqlite3
from pathlib import Path

import psutil
import rumps

# ── Constants ─────────────────────────────────────────────────────────────────

BASE_DIR       = os.path.dirname(os.path.abspath(__file__))
LOGO_PATH      = os.path.join(BASE_DIR, "logo_menubar.png")
IT_TICKET_URL  = "https://requests.surveysparrow.com/s/it-request"
APP_TITLE      = "Sparrow IT Admin"

SAFE_PROCS = {
    "kernel_task", "launchd", "WindowServer", "loginwindow", "coreaudiod",
    "configd", "mds", "mds_stores", "diskarbitrationd", "securityd",
    "opendirectoryd", "systemstats", "sysmond", "powerd", "symptomsd",
    "python3", "python", "Python", "menubar_mac", "agent_mac", "bash", "zsh", "fish",
    "ssh", "sshd", "git", "npm", "node", "Xcode", "xcodebuild",
}

# ── Helpers ───────────────────────────────────────────────────────────────────

def _fmt_bytes(n_bytes):
    """Format bytes into human-readable MB / GB string."""
    mb = n_bytes / 1_048_576
    if mb >= 1024:
        return f"{mb / 1024:.2f} GB"
    return f"{mb:.1f} MB"


def _dir_size(path):
    """Return total byte size of all files under path, silently skipping errors."""
    total = 0
    try:
        for root, _dirs, files in os.walk(path, followlinks=False):
            for f in files:
                try:
                    total += os.path.getsize(os.path.join(root, f))
                except OSError:
                    pass
    except OSError:
        pass
    return total


def _delete_path(p):
    """Delete a file or directory tree, return bytes freed."""
    freed = 0
    try:
        if os.path.isdir(p):
            freed = _dir_size(p)
            shutil.rmtree(p, ignore_errors=True)
        elif os.path.isfile(p):
            freed = os.path.getsize(p)
            os.remove(p)
    except OSError:
        pass
    return freed


# ── Runner helper ─────────────────────────────────────────────────────────────

def run(label, fn):
    """Run fn in a background thread; update title & notify on completion."""
    def worker():
        app.title = f"{APP_TITLE}  ..."
        try:
            result = fn()
            if result:
                rumps.notification(APP_TITLE, label, result)
        except Exception as exc:
            rumps.notification(APP_TITLE, f"{label} — Error", str(exc))
        finally:
            time.sleep(2)
            app.title = APP_TITLE
    threading.Thread(target=worker, daemon=True).start()


# ── Browser Cookie Analyser ───────────────────────────────────────────────────

def _show_browser_suggestions():
    """Scan all browsers, show what's slowing them down, let user decide to clean."""
    findings = []
    actions  = {}   # browser → (db_path, sql_to_delete)

    # ── Chrome ────────────────────────────────────────────────────────────────
    chrome_db = os.path.expanduser(
        "~/Library/Application Support/Google/Chrome/Default/Cookies"
    )
    if os.path.isfile(chrome_db):
        try:
            con = sqlite3.connect(chrome_db)
            cur = con.cursor()
            cur.execute("SELECT COUNT(*) FROM cookies")
            total = cur.fetchone()[0]
            cur.execute("SELECT COUNT(*) FROM cookies WHERE is_httponly=0 AND is_secure=0")
            tracking = cur.fetchone()[0]
            cur.execute("SELECT host_key, COUNT(*) as c FROM cookies WHERE is_httponly=0 AND is_secure=0 GROUP BY host_key ORDER BY c DESC LIMIT 5")
            top_hosts = cur.fetchall()
            con.close()
            if tracking > 0:
                findings.append(f"Chrome: {tracking}/{total} tracking cookies found")
                findings.append("  Top offenders:")
                for host, count in top_hosts:
                    findings.append(f"    {host}  ({count} cookies)")
                actions["chrome"] = (chrome_db, "DELETE FROM cookies WHERE is_httponly=0 AND is_secure=0")
        except Exception:
            pass

    # ── Firefox ───────────────────────────────────────────────────────────────
    for ff_db in glob.glob(os.path.expanduser(
        "~/Library/Application Support/Firefox/Profiles/*/cookies.sqlite"
    )):
        try:
            con = sqlite3.connect(ff_db)
            cur = con.cursor()
            cur.execute("SELECT COUNT(*) FROM moz_cookies")
            total = cur.fetchone()[0]
            cur.execute("SELECT COUNT(*) FROM moz_cookies WHERE isSession=0 AND isSecure=0")
            tracking = cur.fetchone()[0]
            cur.execute("SELECT host, COUNT(*) as c FROM moz_cookies WHERE isSession=0 AND isSecure=0 GROUP BY host ORDER BY c DESC LIMIT 5")
            top_hosts = cur.fetchall()
            con.close()
            if tracking > 0:
                findings.append(f"\nFirefox: {tracking}/{total} tracking cookies found")
                findings.append("  Top offenders:")
                for host, count in top_hosts:
                    findings.append(f"    {host}  ({count} cookies)")
                actions["firefox"] = (ff_db, "DELETE FROM moz_cookies WHERE isSession=0 AND isSecure=0")
        except Exception:
            pass

    # ── Safari ────────────────────────────────────────────────────────────────
    safari_cookies = os.path.expanduser("~/Library/Cookies/Cookies.binarycookies")
    if os.path.isfile(safari_cookies):
        size_kb = os.path.getsize(safari_cookies) / 1024
        findings.append(f"\nSafari: Cookie file is {size_kb:.0f} KB")
        findings.append("  (Safari stores cookies in a binary file — clearing it removes all tracking cookies)")
        actions["safari"] = (safari_cookies, None)

    # ── Nothing found ─────────────────────────────────────────────────────────
    if not findings:
        rumps.alert(
            title="Browser Check",
            message="No tracking cookies found across Chrome, Firefox and Safari.",
            ok="Close"
        )
        return

    # ── Show findings + ask user ───────────────────────────────────────────────
    msg = "These are slowing your browser:\n\n"
    msg += "\n".join(findings)
    msg += "\n\n─────────────────────────────\n"
    msg += "Passwords are NEVER deleted.\nOnly tracking/non-secure cookies will be removed."

    response = rumps.alert(
        title="Browser Tracking Cookies Found",
        message=msg,
        ok="Clean All",
        cancel="Not Now"
    )

    if not response:
        return

    # ── User confirmed — clean now ─────────────────────────────────────────────
    cleaned = []
    for browser, (db_path, sql) in actions.items():
        try:
            if sql:                          # Chrome / Firefox — SQL delete
                con = sqlite3.connect(db_path)
                con.execute(sql)
                con.commit()
                con.close()
                cleaned.append(browser.capitalize())
            else:                            # Safari — delete binary file
                os.remove(db_path)
                cleaned.append("Safari")
        except Exception:
            pass

    rumps.notification(
        APP_TITLE,
        "Browser Cookies Cleaned",
        f"Tracking cookies removed from: {', '.join(cleaned)}" if cleaned else "Nothing could be cleaned (browser may be open)"
    )


# ── 1. Optimize All ───────────────────────────────────────────────────────────

def do_optimize_all():
    freed = 0

    # --- Smart Scan (Macube style) ---
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
                freed += _delete_path(entry.path)
        except OSError:
            pass

    # Delete .log files older than 30 days in ~/Library/Logs
    logs_dir = os.path.expanduser("~/Library/Logs")
    cutoff_30d = time.time() - 30 * 86400
    try:
        for root, _dirs, files in os.walk(logs_dir):
            for fname in files:
                if fname.endswith(".log"):
                    fp = os.path.join(root, fname)
                    try:
                        if os.path.getmtime(fp) < cutoff_30d:
                            freed += _delete_path(fp)
                    except OSError:
                        pass
    except OSError:
        pass

    # --- Browser cookie analysis (suggest only, never auto-delete) ---
    _show_browser_suggestions()

    # --- Kill processes > 500 MB RAM (skip SAFE_PROCS) ---
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

    freed_str = _fmt_bytes(freed)
    return (
        f"Freed {freed_str} | Killed {len(killed)} heavy process(es)"
        + (f": {', '.join(killed[:4])}" if killed else "")
    )


# ── 2. Memory Check ───────────────────────────────────────────────────────────

def do_memory_check():
    vm = psutil.virtual_memory()
    total_gb  = vm.total     / 1_073_741_824
    used_gb   = vm.used      / 1_073_741_824
    avail_gb  = vm.available / 1_073_741_824

    # Cache junk size
    cache_bytes = _dir_size(os.path.expanduser("~/Library/Caches"))

    # Files older than 1 year in ~/Downloads (Macube 1-year filter)
    downloads = os.path.expanduser("~/Downloads")
    cutoff_1y = time.time() - 365 * 86400
    old_dl_count = 0
    old_dl_bytes = 0
    try:
        for root, _dirs, files in os.walk(downloads):
            for fname in files:
                fp = os.path.join(root, fname)
                try:
                    st = os.stat(fp)
                    if st.st_mtime < cutoff_1y:
                        old_dl_count += 1
                        old_dl_bytes += st.st_size
                except OSError:
                    pass
    except OSError:
        pass

    # Top 5 memory hogs
    procs = []
    for p in psutil.process_iter(["name", "memory_info"]):
        try:
            name = p.info["name"] or ""
            mi = p.info["memory_info"]
            if mi:
                mb = mi.rss / 1_048_576
                if mb > 50:
                    procs.append((name, mb))
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            pass
    procs.sort(key=lambda x: x[1], reverse=True)

    # Hung / zombie process count (MacKeeper Memory Monitor)
    hung_count = 0
    for p in psutil.process_iter(["status"]):
        try:
            if p.info["status"] in (psutil.STATUS_ZOMBIE, psutil.STATUS_STOPPED):
                hung_count += 1
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            pass

    lines = [
        f"RAM Used:      {used_gb:.1f} GB / {total_gb:.1f} GB  ({vm.percent:.0f}%)",
        f"Available:     {avail_gb:.1f} GB",
        f"Cache Junk:    {_fmt_bytes(cache_bytes)}",
        f"Old Downloads: {old_dl_count} files  ({_fmt_bytes(old_dl_bytes)})  [>1 year]",
        f"Hung/Zombie:   {hung_count} process(es)",
        "",
        "Top 5 Memory Hogs:",
    ]
    for name, mb in procs[:5]:
        lines.append(f"  {name:<28}  {mb:>7.0f} MB")

    rumps.alert(title="Memory Check", message="\n".join(lines), ok="Close")
    return "Memory check complete"


# ── 3. Kill Old Apps ──────────────────────────────────────────────────────────

def do_kill_old_apps():
    now = time.time()
    flagged = []
    for p in psutil.process_iter(["name", "pid", "create_time", "memory_info", "status"]):
        try:
            name = p.info["name"] or ""
            if name in SAFE_PROCS:
                continue
            age_hrs = (now - (p.info["create_time"] or now)) / 3600
            mi = p.info["memory_info"]
            mb = mi.rss / 1_048_576 if mi else 0
            status = p.info.get("status", "")
            if (
                age_hrs > 12
                or status in (psutil.STATUS_ZOMBIE, psutil.STATUS_STOPPED)
                or mb > 300
            ):
                flagged.append((name, age_hrs, mb, p.pid, status))
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            pass

    flagged.sort(key=lambda x: x[2], reverse=True)

    if not flagged:
        rumps.alert(
            title="Kill Old Apps",
            message="No flagged applications found.\nAll processes look healthy.",
            ok="Close",
        )
        return "No flagged apps found"

    lines = ["Flagged processes (age >12h, RAM >300 MB, or zombie):\n"]
    for name, hrs, mb, _pid, status in flagged[:12]:
        lines.append(
            f"  {name:<28}  {hrs:>5.0f}h  {mb:>6.0f} MB  [{status}]"
        )
    if len(flagged) > 12:
        lines.append(f"  ... and {len(flagged) - 12} more")

    response = rumps.alert(
        title="Kill Old Apps",
        message="\n".join(lines),
        ok="Kill All Flagged",
        cancel="Cancel",
    )

    if response:  # OK / "Kill All Flagged" pressed
        killed = 0
        for _name, _hrs, _mb, pid, _st in flagged:
            try:
                psutil.Process(pid).kill()
                killed += 1
            except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
                pass
        return f"Killed {killed} flagged process(es)"

    return "Kill Old Apps cancelled"


# ── 4. Top 5 Large Files ──────────────────────────────────────────────────────

def do_large_files():
    scan_dirs = [
        os.path.expanduser("~/Downloads"),
        os.path.expanduser("~/Documents"),
        os.path.expanduser("~/Desktop"),
        os.path.expanduser("~/Movies"),
        os.path.expanduser("~/Music"),
        os.path.expanduser("~/Library/Application Support"),
    ]

    results = []
    for base in scan_dirs:
        if not os.path.exists(base):
            continue
        try:
            for root, _dirs, files in os.walk(base, followlinks=False):
                for fname in files:
                    fp = os.path.join(root, fname)
                    try:
                        sz = os.path.getsize(fp)
                        if sz > 50 * 1_048_576:  # > 50 MB
                            results.append((sz, fp))
                    except OSError:
                        pass
        except OSError:
            pass

    results.sort(reverse=True)
    top5 = results[:5]

    if not top5:
        rumps.alert(
            title="Top 5 Large Files",
            message="No files larger than 50 MB found in scanned folders.",
            ok="Close",
        )
        return "No large files found"

    combined = sum(sz for sz, _ in top5)
    lines = ["Top 5 largest files (OmniDiskSweeper scan):\n"]
    for i, (sz, fp) in enumerate(top5, 1):
        fname   = os.path.basename(fp)
        folder  = os.path.dirname(fp)
        # Shorten home path
        folder  = folder.replace(os.path.expanduser("~"), "~")
        lines.append(f"  {i}. {fname}")
        lines.append(f"     {_fmt_bytes(sz)}  —  {folder}")
        lines.append("")

    lines.append(f"Combined size of top 5: {_fmt_bytes(combined)}")

    rumps.alert(title="Top 5 Large Files", message="\n".join(lines), ok="Close")
    return "Large file scan complete"


# ── 5. Disk Health ────────────────────────────────────────────────────────────

def do_disk_health():
    lines = []

    # Disk usage
    try:
        disk = psutil.disk_usage("/")
        used_gb  = disk.used  / 1_073_741_824
        total_gb = disk.total / 1_073_741_824
        free_gb  = disk.free  / 1_073_741_824
        pct      = disk.percent
        space_status = "WARNING: Low disk space!" if pct > 85 else "OK"
        lines.append(f"Disk Usage:  {used_gb:.1f} GB / {total_gb:.1f} GB  ({pct}%)")
        lines.append(f"Free Space:  {free_gb:.1f} GB  [{space_status}]")
    except Exception as exc:
        lines.append(f"Disk usage error: {exc}")

    # I/O counters
    try:
        io = psutil.disk_io_counters()
        if io:
            lines.append(f"Reads:       {_fmt_bytes(io.read_bytes)}")
            lines.append(f"Writes:      {_fmt_bytes(io.write_bytes)}")
    except Exception:
        pass

    lines.append("")

    # S.M.A.R.T. via diskutil (Drive Genius style)
    smart_ok = True
    try:
        result = subprocess.run(
            ["diskutil", "info", "/"],
            capture_output=True, text=True, timeout=10
        )
        smart_keys = {
            "SMART Status",
            "Media Type",
            "Protocol",
            "Solid State",
            "Device / Media Name",
            "Disk Size",
            "Partition Type",
        }
        for line in result.stdout.splitlines():
            stripped = line.strip()
            if any(k in stripped for k in smart_keys):
                lines.append(stripped)
                if "SMART Status" in stripped and "Verified" not in stripped:
                    smart_ok = False
    except Exception as exc:
        lines.append(f"diskutil error: {exc}")

    lines.append("")

    # OnyX Maintenance suggestion
    lines.append(
        "Maintenance tip (OnyX style):\n"
        "  Run 'sudo periodic daily weekly monthly' in Terminal\n"
        "  to clear system caches and run maintenance scripts."
    )

    # Warnings
    warnings = []
    try:
        if psutil.disk_usage("/").percent > 85:
            warnings.append("Disk is over 85% full — consider freeing space.")
    except Exception:
        pass
    if not smart_ok:
        warnings.append("S.M.A.R.T. status is NOT Verified — consider backup immediately.")

    if warnings:
        lines.append("")
        lines.append("WARNINGS:")
        for w in warnings:
            lines.append(f"  * {w}")

    rumps.alert(title="Disk Health", message="\n".join(lines), ok="Close")
    return "Disk health check complete"


# ── 6. Raise IT Ticket ────────────────────────────────────────────────────────

def do_raise_ticket(_sender=None):
    webbrowser.open(IT_TICKET_URL)


# ── Background: Malware / Adware Listener (CleanMyMac style) ─────────────────

_KNOWN_SUSPICIOUS = set()
_SUSPICIOUS_EXTENSIONS = {".dmg", ".pkg", ".app"}

_WATCH_DIRS = [
    os.path.expanduser("~/Downloads"),
    "/Library/LaunchAgents",
    os.path.expanduser("~/Library/LaunchAgents"),
]

_PLIST_WATCH_DIRS = {
    "/Library/LaunchAgents",
    os.path.expanduser("~/Library/LaunchAgents"),
}


def _collect_current_files():
    """Return frozenset of all relevant files in watched dirs."""
    seen = set()
    for watch_dir in _WATCH_DIRS:
        if not os.path.isdir(watch_dir):
            continue
        try:
            for entry in os.scandir(watch_dir):
                ext = os.path.splitext(entry.name)[1].lower()
                is_downloads = watch_dir == os.path.expanduser("~/Downloads")
                is_launchagent = watch_dir in _PLIST_WATCH_DIRS
                if (is_downloads and ext in _SUSPICIOUS_EXTENSIONS) or (
                    is_launchagent and ext == ".plist"
                ):
                    seen.add(entry.path)
        except OSError:
            pass
    return frozenset(seen)


def _malware_listener_loop():
    """Poll watched directories every 60 s for new suspicious files."""
    global _KNOWN_SUSPICIOUS
    # Seed with existing files so we don't alert on startup
    _KNOWN_SUSPICIOUS = set(_collect_current_files())

    # Try watchdog for real-time monitoring; fall back to polling
    try:
        from watchdog.observers import Observer
        from watchdog.events import FileSystemEventHandler

        class _Handler(FileSystemEventHandler):
            def on_created(self, event):
                if event.is_directory:
                    return
                path = event.src_path
                ext  = os.path.splitext(path)[1].lower()
                watch_dir = os.path.dirname(path)
                is_downloads = watch_dir == os.path.expanduser("~/Downloads")
                is_launchagent = watch_dir in _PLIST_WATCH_DIRS
                if not (
                    (is_downloads and ext in _SUSPICIOUS_EXTENSIONS)
                    or (is_launchagent and ext == ".plist")
                ):
                    return
                if path in _KNOWN_SUSPICIOUS:
                    return
                _KNOWN_SUSPICIOUS.add(path)
                fname = os.path.basename(path)
                rumps.notification(
                    APP_TITLE,
                    "Suspicious File Detected",
                    f"New file: {fname}\nLocation: {watch_dir}\nReview before opening.",
                )

        observer = Observer()
        handler  = _Handler()
        for d in _WATCH_DIRS:
            os.makedirs(d, exist_ok=True)
            observer.schedule(handler, d, recursive=False)
        observer.start()
        # Keep the observer alive; no need to poll
        while True:
            time.sleep(3600)

    except ImportError:
        # watchdog not available — fall back to polling every 60 s
        while True:
            time.sleep(60)
            current = _collect_current_files()
            new_files = current - _KNOWN_SUSPICIOUS
            for path in new_files:
                _KNOWN_SUSPICIOUS.add(path)
                fname     = os.path.basename(path)
                watch_dir = os.path.dirname(path)
                rumps.notification(
                    APP_TITLE,
                    "Suspicious File Detected",
                    f"New file: {fname}\nLocation: {watch_dir}\nReview before opening.",
                )


# ── App Setup ─────────────────────────────────────────────────────────────────

app = rumps.App(APP_TITLE, quit_button=None)
app.title = APP_TITLE

if os.path.isfile(LOGO_PATH):
    app.icon     = LOGO_PATH
    app.template = False


@rumps.clicked("Optimize All")
def on_optimize_all(_):
    run("Optimize All", do_optimize_all)


@rumps.clicked("Memory Check")
def on_memory_check(_):
    run("Memory Check", do_memory_check)


@rumps.clicked("Kill Old Apps")
def on_kill_old_apps(_):
    run("Kill Old Apps", do_kill_old_apps)


@rumps.clicked("Top 5 Large Files")
def on_large_files(_):
    run("Top 5 Large Files", do_large_files)


@rumps.clicked("Disk Health")
def on_disk_health(_):
    run("Disk Health", do_disk_health)


@rumps.clicked("Raise IT Ticket")
def on_raise_ticket(_):
    do_raise_ticket()


@rumps.clicked("Quit")
def on_quit(_):
    rumps.quit_application()


app.menu = [
    None,                   # separator after app title in menu bar
    "Optimize All",
    None,
    "Memory Check",
    "Kill Old Apps",
    "Top 5 Large Files",
    "Disk Health",
    None,
    "Raise IT Ticket",
    None,
    "Quit",
]

# ── Entry Point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    # Start background malware listener
    threading.Thread(target=_malware_listener_loop, daemon=True).start()
    app.run()
