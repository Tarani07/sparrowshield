#!/bin/bash
# SparrowShield Linux Sensor Installer
# Installs the sensor, creates systemd service, and starts it.
# Must be run as root.

set -euo pipefail

INSTALL_DIR="/opt/sparrowshield"
CONFIG_DIR="/etc/sparrowshield"
LOG_DIR="/var/log/sparrowshield"
SERVICE_FILE="/lib/systemd/system/sparrowshield.service"

SUPABASE_URL="https://hevcfhxmjgbpozqtescm.supabase.co"
SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhldmNmaHhtamdicG96cXRlc2NtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyMjk4NDYsImV4cCI6MjA4NjgwNTg0Nn0.CaXbG8F54bXV0_biNka7vp6Cl1s7vvQsRogNoz7jB28"

# ── Require root ──────────────────────────────────────────────────────────────
if [[ $EUID -ne 0 ]]; then
    echo "ERROR: This installer must be run as root." >&2
    exit 1
fi

echo "=== SparrowShield Linux Sensor Installer ==="

# ── Detect distro package manager ────────────────────────────────────────────
if command -v apt-get &>/dev/null; then
    PKG="apt-get"
elif command -v yum &>/dev/null; then
    PKG="yum"
elif command -v dnf &>/dev/null; then
    PKG="dnf"
else
    PKG=""
fi

# ── Install Python3 + pip if missing ─────────────────────────────────────────
if ! command -v python3 &>/dev/null; then
    echo "[+] Installing python3..."
    if [[ -n "$PKG" ]]; then
        $PKG install -y python3 python3-pip
    else
        echo "ERROR: python3 not found and no known package manager. Install python3 manually." >&2
        exit 1
    fi
fi

if ! python3 -m pip --version &>/dev/null; then
    echo "[+] Installing pip..."
    if [[ -n "$PKG" ]]; then
        $PKG install -y python3-pip
    else
        python3 -m ensurepip --upgrade
    fi
fi

# ── Install Python dependencies ───────────────────────────────────────────────
echo "[+] Installing Python dependencies..."
python3 -m pip install --quiet --upgrade \
    requests \
    psutil \
    inotify_simple

# ── Create directories ────────────────────────────────────────────────────────
echo "[+] Creating directories..."
mkdir -p "$INSTALL_DIR"
mkdir -p "$CONFIG_DIR"
mkdir -p "$LOG_DIR"

# ── Copy sensor files ─────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
echo "[+] Installing sensor files to $INSTALL_DIR ..."
cp "$SCRIPT_DIR/main.py"            "$INSTALL_DIR/"
cp "$SCRIPT_DIR/netlink_sensor.py"  "$INSTALL_DIR/"
cp "$SCRIPT_DIR/file_sensor.py"     "$INSTALL_DIR/"
cp "$SCRIPT_DIR/net_sensor.py"      "$INSTALL_DIR/"
cp "$SCRIPT_DIR/ocsf_builder.py"    "$INSTALL_DIR/"
cp "$SCRIPT_DIR/supabase_shipper.py" "$INSTALL_DIR/"

# Copy MITRE mapper if present
ML_DIR="$SCRIPT_DIR/../../ml"
if [[ -f "$ML_DIR/mitre_mapper.py" ]]; then
    mkdir -p "$INSTALL_DIR/ml"
    cp "$ML_DIR/mitre_mapper.py" "$INSTALL_DIR/ml/"
fi

chmod 750 "$INSTALL_DIR"/*.py

# ── Write config.json ─────────────────────────────────────────────────────────
CONFIG_FILE="$CONFIG_DIR/config.json"
if [[ ! -f "$CONFIG_FILE" ]]; then
    echo "[+] Generating device config..."
    DEVICE_UID="$(python3 -c 'import uuid; print(str(uuid.uuid4()))')"
    HOSTNAME="$(hostname -f 2>/dev/null || hostname)"
    cat > "$CONFIG_FILE" <<EOF
{
  "device_uid": "$DEVICE_UID",
  "hostname": "$HOSTNAME",
  "supabase_url": "$SUPABASE_URL",
  "anon_key": "$SUPABASE_ANON_KEY"
}
EOF
    chmod 640 "$CONFIG_FILE"
    echo "[+] Config written: device_uid=$DEVICE_UID"
else
    echo "[*] Config already exists at $CONFIG_FILE — preserving."
fi

# ── Write systemd service ─────────────────────────────────────────────────────
echo "[+] Writing systemd unit to $SERVICE_FILE ..."
cat > "$SERVICE_FILE" <<'UNIT'
[Unit]
Description=SparrowShield EDR Linux Sensor
After=network.target

[Service]
Type=simple
ExecStart=/usr/bin/python3 /opt/sparrowshield/main.py
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
UNIT

# ── Enable and start service ──────────────────────────────────────────────────
echo "[+] Enabling and starting sparrowshield service..."
systemctl daemon-reload
systemctl enable --now sparrowshield

echo ""
echo "=== Installation complete ==="
echo "    Service status:  systemctl status sparrowshield"
echo "    Logs:            journalctl -u sparrowshield -f"
echo "    Sensor log:      tail -f $LOG_DIR/sensor.log"
echo "    Config:          $CONFIG_FILE"
