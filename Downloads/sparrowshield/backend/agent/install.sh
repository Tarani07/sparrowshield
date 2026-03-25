#!/bin/bash
# ─────────────────────────────────────────────────────────────
#  Sparrow IT Admin — Mac Agent Installer
#  Usage: bash install.sh
# ─────────────────────────────────────────────────────────────

set -e

INSTALL_DIR="$HOME/.sparrow-agent"
REPO="https://raw.githubusercontent.com/Tarani07/sparrowshield/main/Downloads/sparrowshield/backend/agent"
LAUNCH_AGENT_LABEL="com.sparrow.agent"
LAUNCH_AGENT_PLIST="$HOME/Library/LaunchAgents/${LAUNCH_AGENT_LABEL}.plist"
MENUBAR_PLIST="$HOME/Library/LaunchAgents/com.sparrow.menubar.plist"

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
curl -fsSL "$REPO/agent_mac.py"   -o "$INSTALL_DIR/agent_mac.py"
curl -fsSL "$REPO/menubar_mac.py" -o "$INSTALL_DIR/menubar_mac.py"
curl -fsSL "$REPO/config.json"    -o "$INSTALL_DIR/config.json"
echo "        ✅ Files downloaded"

# ── Step 3: Install Python dependencies ──────────────────────
echo "[ 3/6 ] Installing Python dependencies..."
pip3 install psutil requests rumps --break-system-packages -q
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
launchctl unload "$LAUNCH_AGENT_PLIST" 2>/dev/null || true
launchctl unload "$MENUBAR_PLIST"      2>/dev/null || true
launchctl load   "$LAUNCH_AGENT_PLIST"
launchctl load   "$MENUBAR_PLIST"
echo "        ✅ Services started"

echo ""
echo "╔══════════════════════════════════════╗"
echo "║   ✅  Installation Complete!         ║"
echo "╠══════════════════════════════════════╣"
echo "║  Agent logs : ~/.sparrow-agent/agent.log   ║"
echo "║  Config     : ~/.sparrow-agent/config.json ║"
echo "╚══════════════════════════════════════╝"
echo ""
echo "  Sparrow IT Admin is now running in your menu bar."
echo "  The agent will auto-start on every login."
echo ""
