#!/usr/bin/env bash
# SparrowShield macOS Sensor Uninstaller
# Must be run with: sudo bash uninstall.sh
set -euo pipefail

INSTALL_DIR="/usr/local/sparrowshield"
PLIST_DEST="/Library/LaunchDaemons/com.sparrowshield.sensor.plist"

if [[ "$(id -u)" -ne 0 ]]; then
    echo "ERROR: This uninstaller must be run as root." >&2
    echo "  sudo bash uninstall.sh" >&2
    exit 1
fi

echo "Uninstalling SparrowShield macOS sensor..."

# ── Stop and unload launchd daemon ────────────────────────────────────────────

if launchctl list 2>/dev/null | grep -q "com.sparrowshield.sensor"; then
    echo "Stopping daemon..."
    launchctl stop "com.sparrowshield.sensor" 2>/dev/null || true
fi

if [[ -f "$PLIST_DEST" ]]; then
    echo "Unloading launchd plist..."
    launchctl unload "$PLIST_DEST" 2>/dev/null || true
    rm -f "$PLIST_DEST"
    echo "Removed: $PLIST_DEST"
fi

# ── Remove installation directory ─────────────────────────────────────────────

if [[ -d "$INSTALL_DIR" ]]; then
    echo "Removing installation directory: $INSTALL_DIR"
    rm -rf "$INSTALL_DIR"
    echo "Removed: $INSTALL_DIR"
else
    echo "Installation directory not found: $INSTALL_DIR"
fi

# ── Optional: remove logs ─────────────────────────────────────────────────────

LOG_FILE="/var/log/sparrowshield-sensor.log"
if [[ -f "$LOG_FILE" ]]; then
    read -r -p "Remove log file $LOG_FILE? [y/N] " answer
    if [[ "${answer,,}" == "y" ]]; then
        rm -f "$LOG_FILE"
        echo "Removed: $LOG_FILE"
    else
        echo "Log file preserved."
    fi
fi

echo ""
echo "SparrowShield sensor uninstalled successfully."
