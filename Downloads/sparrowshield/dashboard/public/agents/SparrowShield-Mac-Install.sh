#!/usr/bin/env bash
# SparrowShield — macOS agent installer
# Installs the agent with malware detection, behaviour detection, web filter,
# app filter and device-group policies. Run with: sudo bash SparrowShield-Mac-Install.sh
set -euo pipefail

PORTAL="https://sparrowshield.vercel.app/agents"
SUPABASE_URL="https://hevcfhxmjgbpozqtescm.supabase.co"
ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhldmNmaHhtamdicG96cXRlc2NtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyMjk4NDYsImV4cCI6MjA4NjgwNTg0Nn0.CaXbG8F54bXV0_biNka7vp6Cl1s7vvQsRogNoz7jB28"
INSTALL_DIR="/usr/local/sparrowshield"
PLIST="/Library/LaunchDaemons/com.sparrowshield.sensor.plist"
LOG_FILE="/var/log/sparrowshield-sensor.log"

echo ""
echo "================================================================"
echo "  SparrowShield — macOS Agent Installer"
echo "================================================================"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "[!] Run as root:  sudo bash SparrowShield-Mac-Install.sh"; exit 1
fi

# Prefer Homebrew / python.org Python; Apple's /usr/bin/python3 needs Command Line Tools.
PYTHON3=""
for p in /opt/homebrew/bin/python3 /usr/local/bin/python3 /Library/Frameworks/Python.framework/Versions/Current/bin/python3 /usr/bin/python3; do
  if [[ -x "$p" ]] && "$p" -c "import venv" >/dev/null 2>&1; then PYTHON3="$p"; break; fi
done
if [[ -z "$PYTHON3" ]]; then
  echo "[!] Python 3 not found. Install it from https://www.python.org/downloads/macos/ and re-run."
  exit 1
fi
echo "[1/6] Python: $PYTHON3 ($("$PYTHON3" --version 2>&1))"

echo "[2/6] Stopping any previous SparrowShield agent ..."
launchctl bootout system/com.sparrowshield.sensor 2>/dev/null || true
mkdir -p "$INSTALL_DIR"
touch "$LOG_FILE"; chmod 640 "$LOG_FILE"

echo "[3/6] Installing Python dependencies ..."
rm -rf "$INSTALL_DIR/venv"
"$PYTHON3" -m venv "$INSTALL_DIR/venv"
"$INSTALL_DIR/venv/bin/pip" install --quiet --upgrade pip
"$INSTALL_DIR/venv/bin/pip" install --quiet requests psutil

echo "[4/6] Downloading agent ..."
for f in agent_mac.py edr_engine.py; do
  curl -fsSL -o "$INSTALL_DIR/$f" "$PORTAL/$f"
  echo "       $f"
done
# Remove files from the older sensor build, if present.
rm -f "$INSTALL_DIR"/{main,bsm_sensor,apfs_snapshot,threat_scorer,response_engine,ocsf_builder,supabase_shipper}.py

echo "[5/6] Writing config ..."
CONFIG="$INSTALL_DIR/config.json"
if [[ -f "$CONFIG" ]] && grep -q '"device_token"' "$CONFIG"; then
  echo "       Existing enrollment kept."
else
  cat > "$CONFIG" <<CONFIG
{
  "api_url": "${SUPABASE_URL}/functions/v1",
  "anon_key": "${ANON_KEY}",
  "device_id": null,
  "device_token": null
}
CONFIG
fi
chown -R root:wheel "$INSTALL_DIR"; chmod 600 "$CONFIG"

# ClamAV powers virus-signature scanning. Homebrew refuses to run as root,
# so install it as the logged-in user when Homebrew is available.
CONSOLE_USER="$(stat -f %Su /dev/console)"
BREW=""
for b in /opt/homebrew/bin/brew /usr/local/bin/brew; do [[ -x "$b" ]] && BREW="$b" && break; done
if command -v clamscan >/dev/null 2>&1 || [[ -x /opt/homebrew/bin/clamscan || -x /usr/local/bin/clamscan ]]; then
  echo "       ClamAV already installed."
elif [[ -n "$BREW" && "$CONSOLE_USER" != "root" ]]; then
  echo "       Installing ClamAV (virus signatures) ..."
  sudo -u "$CONSOLE_USER" "$BREW" install --quiet clamav >/dev/null 2>&1 \
    && echo "       ClamAV installed." || echo "       [!] ClamAV install failed — virus-signature scanning disabled."
else
  echo "       [!] Homebrew not found — ClamAV skipped. Virus-signature scanning disabled;"
  echo "           behaviour detection, web filter and app filter still work."
fi

echo "[6/6] Starting agent ..."
cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.sparrowshield.sensor</string>
  <key>ProgramArguments</key>
  <array>
    <string>${INSTALL_DIR}/venv/bin/python3</string>
    <string>${INSTALL_DIR}/agent_mac.py</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>UserName</key><string>root</string>
  <key>WorkingDirectory</key><string>${INSTALL_DIR}</string>
  <key>StandardOutPath</key><string>${LOG_FILE}</string>
  <key>StandardErrorPath</key><string>${LOG_FILE}</string>
</dict>
</plist>
PLIST
chown root:wheel "$PLIST"; chmod 644 "$PLIST"
launchctl bootstrap system "$PLIST"
sleep 5

echo ""
if launchctl print system/com.sparrowshield.sensor >/dev/null 2>&1; then
  echo "================================================================"
  echo "  SparrowShield agent installed and running."
  echo "  This Mac appears in the dashboard within a minute."
  echo ""
  echo "  Logs      : tail -f $LOG_FILE"
  echo "  Restart   : sudo launchctl kickstart -k system/com.sparrowshield.sensor"
  echo ""
  echo "  To scan Downloads/Desktop, grant Full Disk Access to:"
  echo "    $(readlink -f "$INSTALL_DIR/venv/bin/python3")"
  echo "  (System Settings > Privacy & Security > Full Disk Access > +, Cmd+Shift+G)"
  echo "================================================================"
else
  echo "[!] Agent did not start. Check: tail -50 $LOG_FILE"
fi
