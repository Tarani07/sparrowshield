#!/usr/bin/env bash
# SparrowShield macOS Sensor Installer
# Must be run with: sudo bash install.sh
set -euo pipefail

INSTALL_DIR="/usr/local/sparrowshield"
PLIST_SRC="$(cd "$(dirname "$0")" && pwd)/com.sparrowshield.sensor.plist"
PLIST_DEST="/Library/LaunchDaemons/com.sparrowshield.sensor.plist"
PYTHON3="$(command -v python3 || true)"

# ── Preflight checks ──────────────────────────────────────────────────────────

if [[ "$(id -u)" -ne 0 ]]; then
    echo "ERROR: This installer must be run as root." >&2
    echo "  sudo bash install.sh" >&2
    exit 1
fi

if [[ -z "$PYTHON3" ]]; then
    echo "ERROR: python3 not found on PATH." >&2
    echo "  Install from https://www.python.org or via Homebrew: brew install python3" >&2
    exit 1
fi

PYTHON_VER=$("$PYTHON3" -c "import sys; print(sys.version_info[:2])")
echo "Using Python: $PYTHON3  ($PYTHON_VER)"

# ── Create installation directory ────────────────────────────────────────────

echo "Creating installation directory: $INSTALL_DIR"
mkdir -p "$INSTALL_DIR"

# ── Create virtual environment and install dependencies ──────────────────────

VENV_DIR="$INSTALL_DIR/venv"
if [[ ! -d "$VENV_DIR" ]]; then
    echo "Creating Python virtual environment..."
    "$PYTHON3" -m venv "$VENV_DIR"
fi

echo "Installing Python dependencies (requests, psutil)..."
"$VENV_DIR/bin/pip3" install --quiet --upgrade pip
"$VENV_DIR/bin/pip3" install --quiet requests psutil

# ── Copy sensor source files ──────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
echo "Copying sensor files from $SCRIPT_DIR to $INSTALL_DIR..."

for py_file in "$SCRIPT_DIR"/*.py; do
    install -m 644 "$py_file" "$INSTALL_DIR/"
done

# ── Write initial config.json ─────────────────────────────────────────────────

CONFIG_PATH="$INSTALL_DIR/config.json"

DEVICE_UID="$(uuidgen | tr '[:upper:]' '[:lower:]')"
HOSTNAME="$(hostname -f 2>/dev/null || hostname)"

if [[ -f "$CONFIG_PATH" ]]; then
    echo "config.json already exists — preserving existing configuration."
else
    echo "Writing initial config.json..."
    cat > "$CONFIG_PATH" <<CONFIG
{
    "supabase_url":  "https://hevcfhxmjgbpozqtescm.supabase.co",
    "anon_key":      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhldmNmaHhtamdicG96cXRlc2NtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyMjk4NDYsImV4cCI6MjA4NjgwNTg0Nn0.CaXbG8F54bXV0_biNka7vp6Cl1s7vvQsRogNoz7jB28",
    "device_uid":    "${DEVICE_UID}",
    "hostname":      "${HOSTNAME}",
    "verbose":       false
}
CONFIG
fi

chmod 600 "$CONFIG_PATH"

# ── Install launchd plist ─────────────────────────────────────────────────────

echo "Installing launchd daemon plist to $PLIST_DEST..."
install -m 644 "$PLIST_SRC" "$PLIST_DEST"

# Unload first if already loaded (ignore errors)
launchctl unload "$PLIST_DEST" 2>/dev/null || true

echo "Loading launchd daemon..."
launchctl load "$PLIST_DEST"

# ── Verify the daemon started ─────────────────────────────────────────────────

sleep 2
if launchctl list | grep -q "com.sparrowshield.sensor"; then
    echo ""
    echo "======================================================"
    echo " SparrowShield sensor installed and running."
    echo "======================================================"
    echo ""
    echo " Installation directory : $INSTALL_DIR"
    echo " Config                 : $CONFIG_PATH"
    echo " Log                    : /var/log/sparrowshield-sensor.log"
    echo " Device UID             : $DEVICE_UID"
    echo ""
    echo " To check status:"
    echo "   sudo launchctl list | grep sparrowshield"
    echo "   tail -f /var/log/sparrowshield-sensor.log"
    echo ""
    echo " NEXT STEP: Edit $CONFIG_PATH"
    echo " to add your Supabase credentials if you want telemetry shipping."
    echo "======================================================"
else
    echo ""
    echo "WARNING: Daemon may not have started. Check the log:"
    echo "  cat /var/log/sparrowshield-sensor.log"
fi
