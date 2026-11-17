#!/bin/bash
# Builds the SparrowShield macOS agent as a signed, notarized .pkg for Jamf.
#
# The agent is frozen into a self-contained executable at a FIXED path, so a Jamf
# PPPC profile can grant it Full Disk Access silently (Apple does not let a program
# grant that to itself).
#
# Usage:
#   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_ANON_KEY=<anon key> \
#   APP_SIGN_ID="Developer ID Application: SurveySparrow ... (TEAMID)" \
#   PKG_SIGN_ID="Developer ID Installer: SurveySparrow ... (TEAMID)" \
#   NOTARY_PROFILE=sparrowshield-notary \
#   ./build_pkg.sh 1.0.0
#
# Without APP_SIGN_ID / PKG_SIGN_ID the build is ad-hoc signed: fine for a local test,
# but a PPPC profile cannot match it and Gatekeeper will reject it on other Macs.
# NOTARY_PROFILE is a keychain profile created once with:
#   xcrun notarytool store-credentials sparrowshield-notary --apple-id ... --team-id ...
set -euo pipefail
export COPYFILE_DISABLE=1   # keep AppleDouble ._ files out of the package

VERSION="${1:-1.0.0}"
HERE="$(cd "$(dirname "$0")" && pwd)"
AGENT_SRC="$(cd "$HERE/.." && pwd)"
BUILD="$HERE/build"
OUT="$HERE/dist"
PYTHON="${PYTHON:-python3}"   # use python.org's universal2 Python for fleet builds
BUNDLE_ID="com.surveysparrow.sparrowshield.agent"
PKG_ID="com.surveysparrow.sparrowshield"
APP_NAME="sparrowshield-agent"
INSTALL_BIN="usr/local/sparrowshield/bin"

: "${SUPABASE_URL:?set SUPABASE_URL}"
: "${SUPABASE_ANON_KEY:?set SUPABASE_ANON_KEY}"

rm -rf "$BUILD" "$OUT"
mkdir -p "$BUILD" "$OUT"

echo "==> Building frozen agent with PyInstaller"
"$PYTHON" -m venv "$BUILD/venv"
"$BUILD/venv/bin/pip" install --quiet --upgrade pip
"$BUILD/venv/bin/pip" install --quiet -r "$AGENT_SRC/requirements.txt" pyinstaller
"$BUILD/venv/bin/pyinstaller" --noconfirm --clean --onedir \
  --name "$APP_NAME" \
  --osx-bundle-identifier "$BUNDLE_ID" \
  --paths "$AGENT_SRC" \
  --hidden-import edr_engine \
  --distpath "$BUILD/pyi-dist" --workpath "$BUILD/pyi-work" --specpath "$BUILD" \
  "$AGENT_SRC/agent_mac.py" >"$BUILD/pyinstaller.log" 2>&1 \
  || { tail -30 "$BUILD/pyinstaller.log"; exit 1; }

FROZEN="$BUILD/pyi-dist/$APP_NAME"

echo "==> Signing (${APP_SIGN_ID:-ad-hoc})"
SIGN_ID="${APP_SIGN_ID:--}"
SIGN_OPTS=(--force --sign "$SIGN_ID")
# Hardened runtime + timestamp are required for notarization; with a real identity every
# embedded library shares the Team ID, so library validation passes.
[ "$SIGN_ID" != "-" ] && SIGN_OPTS+=(--options runtime --timestamp)
# Every embedded Mach-O (including Python.framework's extension-less binary) first,
# main executable last, so its signature seals everything.
find "$FROZEN" -type f ! -path "$FROZEN/$APP_NAME" -print0 |
  while IFS= read -r -d '' f; do
    if [[ "$(file -b "$f")" == *Mach-O* ]]; then
      codesign "${SIGN_OPTS[@]}" "$f" 2>/dev/null
    fi
  done
codesign "${SIGN_OPTS[@]}" --identifier "$BUNDLE_ID" "$FROZEN/$APP_NAME"
codesign --verify --strict --verbose=2 "$FROZEN/$APP_NAME"

echo "==> Assembling package payload"
ROOT="$BUILD/root"
mkdir -p "$ROOT/$INSTALL_BIN" "$ROOT/Library/LaunchDaemons" "$ROOT/usr/local/sparrowshield"
ditto --norsrc --noextattr "$FROZEN" "$ROOT/$INSTALL_BIN/$APP_NAME"
cp "$HERE/com.sparrowshield.sensor.plist" "$ROOT/Library/LaunchDaemons/"
cat >"$ROOT/usr/local/sparrowshield/config.default.json" <<EOF
{
  "api_url": "${SUPABASE_URL%/}/functions/v1",
  "anon_key": "${SUPABASE_ANON_KEY}",
  "device_id": null,
  "device_token": null
}
EOF
chmod 755 "$HERE/scripts/preinstall" "$HERE/scripts/postinstall"
xattr -cr "$ROOT" 2>/dev/null || true

# The embedded Python.framework must install at the fixed path, never be "relocated"
# to some other copy the installer finds on the Mac.
COMPONENTS="$BUILD/components.plist"
pkgbuild --analyze --root "$ROOT" "$COMPONENTS" >/dev/null
i=0
while /usr/libexec/PlistBuddy -c "Print :$i" "$COMPONENTS" >/dev/null 2>&1; do
  /usr/libexec/PlistBuddy -c "Set :$i:BundleIsRelocatable false" "$COMPONENTS" 2>/dev/null \
    || /usr/libexec/PlistBuddy -c "Add :$i:BundleIsRelocatable bool false" "$COMPONENTS"
  i=$((i + 1))
done

COMPONENT="$BUILD/SparrowShield-component.pkg"
pkgbuild --root "$ROOT" --component-plist "$COMPONENTS" --scripts "$HERE/scripts" \
  --identifier "$PKG_ID" --version "$VERSION" --install-location / \
  --ownership recommended "$COMPONENT"

FINAL="$OUT/SparrowShield-$VERSION.pkg"
if [ -n "${PKG_SIGN_ID:-}" ]; then
  echo "==> Signing package"
  productbuild --package "$COMPONENT" --sign "$PKG_SIGN_ID" --timestamp "$FINAL"
else
  productbuild --package "$COMPONENT" "$FINAL"
  echo "   (package unsigned — set PKG_SIGN_ID for fleet use)"
fi

if [ -n "${NOTARY_PROFILE:-}" ] && [ -n "${PKG_SIGN_ID:-}" ]; then
  echo "==> Notarizing"
  xcrun notarytool submit "$FINAL" --keychain-profile "$NOTARY_PROFILE" --wait
  xcrun stapler staple "$FINAL"
fi

echo "==> Generating Jamf Full Disk Access profile"
"$HERE/make_pppc_profile.sh" "$FROZEN/$APP_NAME" "$OUT/SparrowShield-FullDiskAccess.mobileconfig"

echo
echo "Done:"
ls -lh "$OUT"
