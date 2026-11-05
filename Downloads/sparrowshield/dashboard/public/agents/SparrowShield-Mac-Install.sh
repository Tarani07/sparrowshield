#!/usr/bin/env bash
# SparrowShield EDR — macOS Sensor Installer
# Run with: sudo bash SparrowShield-Mac-Install.sh
set -euo pipefail

INSTALL_DIR="/usr/local/sparrowshield"
PLIST_DEST="/Library/LaunchDaemons/com.sparrowshield.sensor.plist"
VENV_DIR="$INSTALL_DIR/venv"
LOG_FILE="/var/log/sparrowshield-sensor.log"
BASE_URL="https://raw.githubusercontent.com/Tarani07/sparrowshield/claude/sweet-pare/Downloads/sparrowshield/sensor/macos"

echo ""
echo "================================================================"
echo "  SparrowShield EDR — macOS Sensor Installer"
echo "================================================================"
echo ""

# ── Require root ──────────────────────────────────────────────────────────────
if [[ "$(id -u)" -ne 0 ]]; then
    echo "[!] This installer must be run as root:"
    echo "    sudo bash SparrowShield-Mac-Install.sh"
    exit 1
fi

# ── Require python3 ───────────────────────────────────────────────────────────
PYTHON3="$(command -v python3 || true)"
if [[ -z "$PYTHON3" ]]; then
    echo "[!] python3 not found. Install via Homebrew: brew install python3"
    exit 1
fi
echo "[1/5] Python: $PYTHON3  ($($PYTHON3 --version 2>&1))"

# ── Create install directory ──────────────────────────────────────────────────
echo "[2/5] Creating $INSTALL_DIR ..."
mkdir -p "$INSTALL_DIR"
mkdir -p "$INSTALL_DIR/quarantine"
touch "$LOG_FILE"
chmod 640 "$LOG_FILE"

# ── Create venv and install dependencies ─────────────────────────────────────
echo "[3/5] Installing Python dependencies ..."
if [[ ! -d "$VENV_DIR" ]]; then
    "$PYTHON3" -m venv "$VENV_DIR"
fi
"$VENV_DIR/bin/pip3" install --quiet --upgrade pip
"$VENV_DIR/bin/pip3" install --quiet requests psutil

# ── Download sensor files from GitHub ────────────────────────────────────────
echo "[4/5] Downloading sensor files ..."
for f in main.py bsm_sensor.py apfs_snapshot.py threat_scorer.py \
          response_engine.py ocsf_builder.py supabase_shipper.py; do
    curl -fsSL -o "$INSTALL_DIR/$f" "$BASE_URL/$f"
    echo "       Downloaded $f"
done

# Also pull MITRE mapper from ml/
ML_BASE="https://raw.githubusercontent.com/Tarani07/sparrowshield/claude/sweet-pare/Downloads/sparrowshield/sensor/ml"
mkdir -p "$INSTALL_DIR/ml"
curl -fsSL -o "$INSTALL_DIR/ml/mitre_mapper.py" "$ML_BASE/mitre_mapper.py" 2>/dev/null || true

# ── Write config.json ─────────────────────────────────────────────────────────
echo "[5/5] Writing config ..."
DEVICE_UID="$(uuidgen | tr '[:upper:]' '[:lower:]')"
HOSTNAME="$(hostname -f 2>/dev/null || hostname)"
CONFIG_PATH="$INSTALL_DIR/config.json"

if [[ -f "$CONFIG_PATH" ]]; then
    echo "       config.json already exists — preserving existing configuration."
else
    cat > "$CONFIG_PATH" <<CONFIG
{
    "supabase_url":  "https://hevcfhxmjgbpozqtescm.supabase.co",
    "anon_key":      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhldmNmaHhtamdicG96cXRlc2NtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyMjk4NDYsImV4cCI6MjA4NjgwNTg0Nn0.CaXbG8F54bXV0_biNka7vp6Cl1s7vvQsRogNoz7jB28",
    "device_uid":    "${DEVICE_UID}",
    "hostname":      "${HOSTNAME}",
    "verbose":       false,
    "log_level":     "INFO",
    "batch_interval_s": 5,
    "offline_max_events": 50000
}
CONFIG
    chmod 600 "$CONFIG_PATH"
    echo "       Device UID: $DEVICE_UID"
fi

# ── Install launchd plist ─────────────────────────────────────────────────────
PLIST_URL="$BASE_URL/com.sparrowshield.sensor.plist"
curl -fsSL -o /tmp/com.sparrowshield.sensor.plist "$PLIST_URL"

# Patch the plist to point to the venv python
sed "s|/usr/bin/python3|$VENV_DIR/bin/python3|g" \
    /tmp/com.sparrowshield.sensor.plist > "$PLIST_DEST"
chmod 644 "$PLIST_DEST"

# ── Load daemon ───────────────────────────────────────────────────────────────
launchctl unload "$PLIST_DEST" 2>/dev/null || true
launchctl load "$PLIST_DEST"

sleep 2

echo ""
if launchctl list | grep -q "com.sparrowshield.sensor"; then
    echo "================================================================"
    echo "  SparrowShield macOS sensor installed and running!"
    echo "================================================================"
    echo ""
    echo "  Install dir  : $INSTALL_DIR"
    echo "  Config       : $CONFIG_PATH"
    echo "  Log          : $LOG_FILE"
    echo ""
    echo "  Check status : sudo launchctl list | grep sparrowshield"
    echo "  View logs    : tail -f $LOG_FILE"
    echo "  Uninstall    : sudo launchctl unload $PLIST_DEST && sudo rm -rf $INSTALL_DIR"
    echo ""
    echo "  Your Mac will appear in the SparrowShield dashboard within 30s."
    echo "================================================================"
else
    echo "[!] Daemon may not have started. Check: tail -f $LOG_FILE"
    echo "    If you see permission errors, you may need to allow the sensor"
    echo "    in System Preferences > Privacy & Security > Full Disk Access."
fi
echo ""
