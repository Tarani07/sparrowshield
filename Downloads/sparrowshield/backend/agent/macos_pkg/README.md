# SparrowShield macOS package for Jamf (silent Full Disk Access)

Apple does not let any program grant itself Full Disk Access. Security agents (Jamf Protect,
CrowdStrike, SentinelOne) get it silently through an MDM **PPPC profile** that names the
agent's signed executable. This folder builds both pieces.

| Output (in `dist/`) | What it is |
|---|---|
| `SparrowShield-<version>.pkg` | Self-contained agent (no Python needed on the Mac) installed at `/usr/local/sparrowshield/bin/sparrowshield-agent/sparrowshield-agent`, run as a root LaunchDaemon. Enrolls itself on first run. |
| `SparrowShield-FullDiskAccess.mobileconfig` | PPPC profile granting that exact signed binary Full Disk Access. |

## One-time prerequisites (Apple Developer account holder)

1. Apple Developer Program membership for SurveySparrow (Team ID).
2. Two certificates in the build Mac's keychain:
   - **Developer ID Application** – signs the agent
   - **Developer ID Installer** – signs the .pkg
3. Notarization credentials:
   `xcrun notarytool store-credentials sparrowshield-notary --apple-id <id> --team-id <TEAMID>`
4. For fleet builds, install Python from python.org (universal2) so the agent runs on Intel and
   Apple Silicon and older macOS versions; pass it as `PYTHON=/Library/Frameworks/Python.framework/Versions/3.x/bin/python3`.

## Build

```bash
SUPABASE_URL=https://hevcfhxmjgbpozqtescm.supabase.co \
SUPABASE_ANON_KEY=<anon key> \
APP_SIGN_ID="Developer ID Application: <Company> (<TEAMID>)" \
PKG_SIGN_ID="Developer ID Installer: <Company> (<TEAMID>)" \
NOTARY_PROFILE=sparrowshield-notary \
./build_pkg.sh 1.0.0
```

Without the signing variables you get an ad-hoc test build; its profile only matches that exact
build and Gatekeeper rejects it on other Macs.

## Deploy in Jamf Pro (order matters)

1. **Computers → Configuration Profiles → Upload** `SparrowShield-FullDiskAccess.mobileconfig`.
   Scope it to the target Macs/Smart Group.
2. **Settings → Packages** – upload `SparrowShield-<version>.pkg`.
3. **Computers → Policies → New** – add the package, trigger *Enrollment Complete* + *Recurring
   Check-in*, frequency *Once per computer*, same scope.

The profile must reach the Mac before (or with) the package; if the agent starts first it simply
picks up the permission on its next restart.

## Verify on a Mac

```bash
sudo profiles show -type configuration | grep -i sparrowshield    # profile installed
sudo grep "Full Disk Access" /var/log/sparrowshield-sensor.log      # "granted"
```

The dashboard's **Scan Now** result also reports `"full_disk_access": true`.

## Notes

- The profile's code requirement is taken from the signed binary (Team ID + identifier
  `com.surveysparrow.sparrowshield.agent`), so it keeps working across future signed releases.
- The package keeps an existing enrollment (`config.json`) and removes the old venv-based install.
- ClamAV is not bundled; malware signature scanning needs `clamscan` on the Mac (e.g. a second
  Jamf package). Behaviour, web and app filtering work without it.
