#!/bin/bash
# ─────────────────────────────────────────────────────────────
#  Sparrow IT Admin — Mac Agent Installer
#  Usage: bash install.sh
# ─────────────────────────────────────────────────────────────

set -e

# When run as root (e.g. via JumpCloud), install to /usr/local instead of $HOME
if [ "$(id -u)" -eq 0 ]; then
  # Detect the logged-in console user (for LaunchAgents)
  CONSOLE_USER=$(stat -f "%Su" /dev/console 2>/dev/null || echo "")
  CONSOLE_HOME=$(dscl . -read /Users/"$CONSOLE_USER" NFSHomeDirectory 2>/dev/null | awk '{print $2}' || echo "")
  INSTALL_DIR="/usr/local/sparrow-agent"
  LAUNCH_HOME="${CONSOLE_HOME:-/tmp}"
else
  CONSOLE_USER="$(whoami)"
  CONSOLE_HOME="$HOME"
  INSTALL_DIR="$HOME/.sparrow-agent"
  LAUNCH_HOME="$HOME"
fi
REPO_URL="https://hevcfhxmjgbpozqtescm.supabase.co/storage/v1/object/public/agent-installer"
LAUNCH_AGENT_LABEL="com.sparrow.agent"
mkdir -p "${LAUNCH_HOME}/Library/LaunchAgents" 2>/dev/null || true
LAUNCH_AGENT_PLIST="${LAUNCH_HOME}/Library/LaunchAgents/${LAUNCH_AGENT_LABEL}.plist"
MENUBAR_PLIST="${LAUNCH_HOME}/Library/LaunchAgents/com.sparrow.menubar.plist"

echo ""
echo "╔══════════════════════════════════════╗"
echo "║     Sparrow IT Admin — Installer     ║"
echo "╚══════════════════════════════════════╝"
echo ""

# ── Step 1: Create install directory ─────────────────────────
echo "[ 1/6 ] Creating install directory..."
mkdir -p "$INSTALL_DIR"

# ── Step 2: Download agent files ──────────────────────────────
echo "[ 2/6 ] Downloading agent files..."
curl -fsSL "$REPO_URL/agent_mac.py"   -o "$INSTALL_DIR/agent_mac.py"
curl -fsSL "$REPO_URL/menubar_mac.py" -o "$INSTALL_DIR/menubar_mac.py"
curl -fsSL "$REPO_URL/config.json"    -o "$INSTALL_DIR/config.json"
echo "        ✅ Files downloaded"

# ── Step 3: Install Python dependencies ──────────────────────
echo "[ 3/6 ] Installing Python dependencies..."
pip3 install psutil requests rumps --break-system-packages -q 2>/dev/null || pip3 install psutil requests rumps --user -q 2>/dev/null || pip3 install psutil requests rumps -q
echo "        ✅ Dependencies installed"

# ── Step 4: LaunchAgent — background agent (auto-start on boot) ──
echo "[ 4/6 ] Registering background agent service..."
cat > "$LAUNCH_AGENT_PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LAUNCH_AGENT_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/python3</string>
    <string>${INSTALL_DIR}/agent_mac.py</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${INSTALL_DIR}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${INSTALL_DIR}/agent.log</string>
  <key>StandardErrorPath</key>
  <string>${INSTALL_DIR}/agent.log</string>
</dict>
</plist>
EOF
echo "        ✅ Background agent registered"

# ── Step 5: LaunchAgent — menu bar app (auto-start on login) ──
echo "[ 5/6 ] Registering menu bar app..."
cat > "$MENUBAR_PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.sparrow.menubar</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/python3</string>
    <string>${INSTALL_DIR}/menubar_mac.py</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${INSTALL_DIR}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${INSTALL_DIR}/menubar.log</string>
  <key>StandardErrorPath</key>
  <string>${INSTALL_DIR}/menubar.log</string>
</dict>
</plist>
EOF
echo "        ✅ Menu bar app registered"

# ── Step 6: Load both services ────────────────────────────────
echo "[ 6/6 ] Starting services..."
if [ "$(id -u)" -eq 0 ] && [ -n "$CONSOLE_USER" ]; then
  # Running as root (JumpCloud) — load LaunchAgents as the logged-in user
  CONSOLE_UID=$(id -u "$CONSOLE_USER")
  launchctl bootout "gui/$CONSOLE_UID/$LAUNCH_AGENT_LABEL" 2>/dev/null || true
  launchctl bootout "gui/$CONSOLE_UID/com.sparrow.menubar" 2>/dev/null || true
  launchctl bootstrap "gui/$CONSOLE_UID" "$LAUNCH_AGENT_PLIST"
  launchctl bootstrap "gui/$CONSOLE_UID" "$MENUBAR_PLIST"
  # Fix ownership so the user's agent can write logs
  chown -R "$CONSOLE_USER" "$INSTALL_DIR"
else
  launchctl unload "$LAUNCH_AGENT_PLIST" 2>/dev/null || true
  launchctl unload "$MENUBAR_PLIST"      2>/dev/null || true
  launchctl load   "$LAUNCH_AGENT_PLIST"
  launchctl load   "$MENUBAR_PLIST"
fi
echo "        ✅ Services started"

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║   ✅  Installation Complete!                 ║"
echo "╠══════════════════════════════════════════════╣"
echo "║  Agent logs : ${INSTALL_DIR}/agent.log       ║"
echo "║  Config     : ${INSTALL_DIR}/config.json     ║"
echo "║  Run as     : ${CONSOLE_USER:-$(whoami)}     ║"
echo "╚══════════════════════════════════════════════╝"
echo ""
echo "  Sparrow IT Admin is now running in your menu bar."
echo "  The agent will auto-start on every login."
echo ""
