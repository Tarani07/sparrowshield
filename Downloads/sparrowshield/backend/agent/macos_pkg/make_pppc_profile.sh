#!/bin/bash
# Writes a PPPC (Privacy Preferences Policy Control) configuration profile that grants
# the SparrowShield agent Full Disk Access. Upload the result to Jamf Pro:
#   Computers > Configuration Profiles > Upload, then scope it to your Macs
#   BEFORE (or together with) the SparrowShield .pkg policy.
#
# The code requirement is read from the signed binary, so the grant only applies to
# the genuine SparrowShield build — a different program at the same path gets nothing.
#
# Usage: make_pppc_profile.sh <signed sparrowshield-agent binary> <output.mobileconfig>
set -euo pipefail

BIN="${1:?path to the signed sparrowshield-agent binary}"
OUTFILE="${2:?output .mobileconfig path}"
INSTALLED_PATH="/usr/local/sparrowshield/bin/sparrowshield-agent/sparrowshield-agent"

REQ="$(codesign -d -r- "$BIN" 2>&1 | sed -n 's/^#* *designated => //p')"
[ -n "$REQ" ] || { echo "Could not read code requirement from $BIN (is it signed?)" >&2; exit 1; }
if [[ "$REQ" == cdhash* ]]; then
  echo "WARNING: binary is ad-hoc signed; this profile will stop matching after any rebuild." >&2
  echo "         Sign with a Developer ID Application certificate for fleet use." >&2
fi

xml_escape() { sed -e 's/&/\&amp;/g' -e 's/</\&lt;/g' -e 's/>/\&gt;/g' -e 's/"/\&quot;/g'; }
REQ_XML="$(printf '%s' "$REQ" | xml_escape)"
U1="$(uuidgen)"; U2="$(uuidgen)"

cat >"$OUTFILE" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>PayloadDisplayName</key><string>SparrowShield — Full Disk Access</string>
  <key>PayloadDescription</key><string>Allows the SparrowShield security agent to scan user folders for malware.</string>
  <key>PayloadIdentifier</key><string>com.surveysparrow.sparrowshield.pppc</string>
  <key>PayloadOrganization</key><string>SurveySparrow</string>
  <key>PayloadScope</key><string>System</string>
  <key>PayloadType</key><string>Configuration</string>
  <key>PayloadUUID</key><string>$U1</string>
  <key>PayloadVersion</key><integer>1</integer>
  <key>PayloadRemovalDisallowed</key><true/>
  <key>PayloadContent</key>
  <array>
    <dict>
      <key>PayloadDisplayName</key><string>SparrowShield PPPC</string>
      <key>PayloadIdentifier</key><string>com.surveysparrow.sparrowshield.pppc.tcc</string>
      <key>PayloadType</key><string>com.apple.TCC.configuration-profile-policy</string>
      <key>PayloadUUID</key><string>$U2</string>
      <key>PayloadVersion</key><integer>1</integer>
      <key>Services</key>
      <dict>
        <key>SystemPolicyAllFiles</key>
        <array>
          <dict>
            <key>Identifier</key><string>$INSTALLED_PATH</string>
            <key>IdentifierType</key><string>path</string>
            <key>CodeRequirement</key><string>$REQ_XML</string>
            <key>Authorization</key><string>Allow</string>
            <key>StaticCode</key><false/>
            <key>Comment</key><string>SparrowShield agent malware scanning</string>
          </dict>
        </array>
      </dict>
    </dict>
  </array>
</dict>
</plist>
EOF

plutil -lint "$OUTFILE" >/dev/null
echo "Wrote $OUTFILE"
echo "  path: $INSTALLED_PATH"
echo "  requirement: $REQ"
