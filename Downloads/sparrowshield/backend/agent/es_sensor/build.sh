#!/usr/bin/env bash
# SparrowShield ES Sensor — build & install
# Requires: Xcode Command Line Tools, macOS 10.15+
# For production: replace "ad-hoc" signing with a real Developer ID Application certificate.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BINARY="es_sensor"
INSTALL_DIR="/usr/local/sparrowshield"
RULES_DIR="/etc/sparrowshield"
RULES_FILE="$RULES_DIR/block_rules.json"

echo "==> Checking dependencies..."

if ! which swiftc &>/dev/null; then
    echo "ERROR: swiftc not found. Install Xcode Command Line Tools:"
    echo "  xcode-select --install"
    exit 1
fi

SWIFT_VER=$(swiftc --version 2>&1 | head -1)
echo "    Swift: $SWIFT_VER"

echo "==> Compiling es_sensor.swift..."
swiftc \
    "$SCRIPT_DIR/es_sensor.swift" \
    -framework EndpointSecurity \
    -framework Foundation \
    -O \
    -o "$SCRIPT_DIR/$BINARY"

echo "==> Signing binary..."
# Ad-hoc sign with entitlements (development only).
# For production: replace '-' with 'Developer ID Application: Your Name (TEAMID)'
codesign \
    --force \
    --sign - \
    --entitlements "$SCRIPT_DIR/es_sensor.entitlements" \
    "$SCRIPT_DIR/$BINARY"

echo "    Signed (ad-hoc). For production, use a Developer ID cert and notarize."

echo "==> Installing to $INSTALL_DIR..."
if [[ $EUID -ne 0 ]]; then
    echo "    Requesting sudo for installation..."
    sudo mkdir -p "$INSTALL_DIR"
    sudo cp "$SCRIPT_DIR/$BINARY" "$INSTALL_DIR/$BINARY"
    sudo chmod 755 "$INSTALL_DIR/$BINARY"
    sudo mkdir -p "$RULES_DIR"
    if [[ ! -f "$RULES_FILE" ]]; then
        sudo sh -c "echo '[]' > '$RULES_FILE'"
        sudo chmod 644 "$RULES_FILE"
        echo "    Created $RULES_FILE"
    fi
else
    mkdir -p "$INSTALL_DIR"
    cp "$SCRIPT_DIR/$BINARY" "$INSTALL_DIR/$BINARY"
    chmod 755 "$INSTALL_DIR/$BINARY"
    mkdir -p "$RULES_DIR"
    if [[ ! -f "$RULES_FILE" ]]; then
        echo '[]' > "$RULES_FILE"
        chmod 644 "$RULES_FILE"
        echo "    Created $RULES_FILE"
    fi
fi

echo ""
echo "==> Build complete."
echo ""
echo "    Binary installed at: $INSTALL_DIR/$BINARY"
echo "    Block rules at:      $RULES_FILE"
echo ""
echo "    The SparrowShield macOS agent (agent_mac.py) will launch this binary"
echo "    automatically as a subprocess when it starts."
echo ""
echo "    To test manually (requires root + FDA + entitlement):"
echo "      sudo $INSTALL_DIR/$BINARY"
echo ""
echo "    NOTES:"
echo "    1. Grant Full Disk Access to the binary in:"
echo "       System Settings → Privacy & Security → Full Disk Access"
echo "    2. For production, replace ad-hoc signing with:"
echo "       codesign --sign 'Developer ID Application: ...' --entitlements ..."
echo "    3. The entitlement com.apple.developer.endpoint-security.client"
echo "       requires Apple approval for distribution outside your team."
