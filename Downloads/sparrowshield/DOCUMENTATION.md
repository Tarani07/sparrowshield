# SparrowShield — Complete Product Documentation

**Version:** 2.0
**Last Updated:** 24 November 2026
**Stack:** Python agents · Supabase (Postgres, Edge Functions, Realtime, pg_cron) · React · TypeScript · Tailwind CSS
**Console:** https://sparrowshield.vercel.app (sign-in required — invited users only)

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [Problems It Solves](#2-problems-it-solves)
3. [Architecture Overview](#3-architecture-overview)
4. [System Requirements](#4-system-requirements)
5. [Installation Guide](#5-installation-guide)
   - 5.1 [macOS Agent Installation](#51-macos-agent-installation)
   - 5.2 [Windows Agent Installation](#52-windows-agent-installation)
6. [Device Agents](#6-device-agents)
   - 6.0 [What every agent does today](#60-what-every-agent-does-today)
   - 6.1 [macOS Agent (agent_mac.py)](#61-macos-agent-agent_macpy)
   - 6.2 [Windows Agent (agent_windows.py)](#62-windows-agent-agent_windowspy)
   - 6.3 [macOS Menu Bar App (menubar_mac.py)](#63-macos-menu-bar-app-menubar_macpy)
7. [Dashboard — Pages & Features](#7-dashboard--pages--features)
   - 7.1 [Signing in, roles and the console frame](#71-signing-in-roles-and-the-console-frame)
   - 7.2 [Home](#72-home) — Overview, Alerts, Live Activity
   - 7.3 [Endpoints](#73-endpoints) — All Devices, macOS, Windows, Device Detail, Device Groups, Sensor Health, JumpCloud
   - 7.4 [Detection & Response](#74-detection--response) — Detections, Analytics, Malware Scanner, Threat Hunting, Process Tree, Network Activity, MITRE ATT&CK
   - 7.5 [Protection Policies](#75-protection-policies) — Application Control, Web Filtering, Process Policies
   - 7.6 [Vulnerability & Compliance](#76-vulnerability--compliance) — Vulnerabilities, Patch Management, Compliance
   - 7.7 [Operations](#77-operations) — IT Notices, Reports, Executive Summary
   - 7.8 [Administration](#78-administration) — Users & Roles, Audit Log, Settings
   - 7.9 [Windows Console](#79-windows-console) — Windows Antivirus, Windows Detections, Host Isolation
   - 7.10 [Pages reachable by link only](#710-pages-reachable-by-link-only)
8. [Data Collection Reference](#8-data-collection-reference)
9. [API Reference — Edge Functions](#9-api-reference--edge-functions)
10. [Database Schema](#10-database-schema)
11. [Alert System](#11-alert-system)
12. [Remediation & Remote Actions](#12-remediation--remote-actions)
13. [Compliance Frameworks](#13-compliance-frameworks)
14. [Software Management](#14-software-management)
15. [Patch Management](#15-patch-management)
16. [AI Health Diagnosis](#16-ai-health-diagnosis)
17. [IT Notices](#17-it-notices)
18. [Slack Integration](#18-slack-integration)
19. [Reporting & Exports](#19-reporting--exports)
20. [Security Model](#20-security-model)
21. [Configuration Reference](#21-configuration-reference)
22. [Deployment Guide](#22-deployment-guide)
23. [Troubleshooting](#23-troubleshooting)
24. [Roadmap & Limitations](#24-roadmap--limitations)

---

## 1. Product Overview

**SparrowShield** is an endpoint security and fleet management console for IT teams running macOS and Windows laptops. One lightweight Python agent per device reports health, security posture and sensor data, enforces application and web policies, runs Jamf-Protect-style detection analytics, and carries out remote actions sent from the console. Everything is stored in a Supabase project and shown in a React console with real-time updates.

The console is private: only people invited in **Administration → Users & Roles** can sign in, and every change they make is written to the **Audit Log**.

### Key Capabilities at a Glance

| Category | Capability | Where in the console |
|---|---|---|
| **Fleet visibility** | Live status, CPU/RAM/disk/battery, security posture, agent version for every device; real-time updates (LIVE indicator) | Overview, All Devices, Device Detail |
| **Sensor health** | 14 hardware sensors per Mac (Touch ID, lid angle, motion, ambient light, camera, mic, battery, thermal, radios…), Windows sensors via Device Manager; alert + Slack when a sensor fails, auto-resolve on recovery | Endpoints → Sensor Health, Device Detail |
| **Detection** | 156 Jamf-Protect-style analytics (150 active on Macs), heartbeat detection rules, EDR sensor events, MITRE ATT&CK mapping | Detection & Response |
| **Malware** | Full security scans (ClamAV signatures, threat intel, behaviour, policy), Defender scans on Windows, quarantine and restore | Malware Scanner, Quarantine |
| **Application control** | Block apps (closed within ~15 s of launch), admin-approved remove/restore of app bundles, violations list | Application Control |
| **Web filtering** | Category feeds (up to 250,000 domains/device) plus custom block/allow rules, pushed instantly | Web Filtering |
| **Process policies** | Block or alert on process name, path, signing ID, team ID or hash | Process Policies, Threat Hunting |
| **Response** | Kill process, full scan, restart, update agent, isolate host (Windows), uninstall app — with live progress | Device Detail, command activity tray |
| **Vulnerabilities & patches** | Vulnerable/EOL software, outdated apps, patch one app or everything on a device | Vulnerabilities, Patch Management |
| **Compliance** | SOC 2 / HIPAA plus your own frameworks built in the console, evaluated hourly | Compliance |
| **Communication** | IT notices pop up on users' Macs as a dialog | IT Notices |
| **Reporting** | Downloadable reports, scheduled email/Slack delivery, executive summary | Reports, Executive Summary |
| **Integrations** | JumpCloud System Insights (hourly), Resend email, Slack webhook, VirusTotal look-ups | Settings → Integrations, JumpCloud |
| **Administration** | Admin / read-only roles, SSO-ready sign-in, immutable audit log | Users & Roles, Audit Log |
| **Agent lifecycle** | One-line install, hourly self-update with checksum verification and automatic rollback | Sidebar → Deploy agent |

---

## 2. Problems It Solves

### 1. Lack of Real-Time Device Visibility
**Challenge:** IT teams have no visibility into what is happening on employee machines in real time — CPU spikes, memory exhaustion, thermal throttling, or disk running full.

**Solution:** SparrowShield agents send 60+ metric fields every 5 minutes including CPU usage, RAM pressure, disk fill rate, battery health, thermal state, fan speed, WiFi signal, top processes, crash logs, and more.

### 2. Reactive IT Support
**Challenge:** IT only discovers device issues after employees file tickets. By that point, the employee has already lost productivity.

**Solution:** Automated alert rules continuously evaluate incoming metrics and fire alerts the moment thresholds are crossed. Slack notifications reach IT immediately — before employees are even aware of a problem.

### 3. Manual Troubleshooting Requires Physical Access
**Challenge:** Diagnosing and fixing issues requires either physical access to the machine or setting up a separate remote-desktop session.

**Solution:** One-click remote actions from the dashboard — kill runaway processes, clear caches, free memory, restart macOS UI services, or trigger OS updates — all executed on the device within seconds.

### 4. Security Blind Spots
**Challenge:** IT has no consistent way to verify whether FileVault, Firewall, SIP, Gatekeeper, MDM enrollment, and antivirus are actually active across all devices.

**Solution:** SparrowShield checks all security controls on every heartbeat and alerts immediately when any security configuration changes or goes offline.

### 5. High Cost of Commercial MDM
**Challenge:** Tools like JumpCloud cost $11–21 per user per month. For a 400-person company that is $50,000–$100,000 per year, with key features locked behind premium tiers.

**Solution:** SparrowShield is entirely self-hosted. Infrastructure costs scale with Supabase pricing — free tier covers small teams; Pro tier ($25/month) handles thousands of devices with full history retention.

### 6. Compliance Is Manual and Error-Prone
**Challenge:** Demonstrating SOC2 or HIPAA compliance requires manually checking every device's security configuration and maintaining spreadsheets that go stale immediately.

**Solution:** SparrowShield evaluates SOC2 and HIPAA controls automatically on every device heartbeat. Compliance scores, per-control pass/fail results, and compliance history are always up to date and exportable.

### 7. No Channel to Push Announcements to Devices
**Challenge:** IT has no direct way to communicate with employees through their devices — scheduled maintenance, security incidents, or policy reminders have to go through email or Slack.

**Solution:** IT Notices — admins type a message in the Settings dashboard and it appears in every employee's Mac menu bar tray within 2 minutes, with optional expiry time.

### 8. Employee Helplessness
**Challenge:** Employees do not know why their Mac is slow or how to fix basic performance issues. They file IT tickets for problems they could resolve themselves.

**Solution:** The macOS Menu Bar app (🛡️) shows live CPU, RAM, and health score at a glance. Employees can run "Optimize All" with one click, and raise an IT ticket directly from the tray.

---

## 3. Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Employee Devices                      │
│                                                         │
│  ┌──────────────────┐      ┌────────────────────────┐  │
│  │  agent_mac.py    │      │  agent_windows.py      │  │
│  │  (Python daemon) │      │  (Python daemon)       │  │
│  │  + menubar_mac.py│      │  Scheduled Task        │  │
│  │  LaunchDaemon    │      │  (SYSTEM account)      │  │
│  └────────┬─────────┘      └──────────┬─────────────┘  │
└───────────┼──────────────────────────┼─────────────────┘
            │  HTTPS (Bearer token)    │
            ▼                          ▼
┌──────────────────────────────────────────────────────────┐
│               Supabase Backend                           │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │         Edge Functions (18 Deno TypeScript)     │    │
│  │  /enroll  /heartbeat  /inventory  /get-devices  │    │
│  │  /get-metrics  /get-alerts  /resolve-alert      │    │
│  │  /check-alerts  /reporting-agent  /compliance   │    │
│  │  /patch-deploy  /approve-command  + more        │    │
│  └────────────────────┬────────────────────────────┘    │
│                       │                                  │
│  ┌────────────────────▼────────────────────────────┐    │
│  │         PostgreSQL Database (14 migrations)     │    │
│  │  devices · metrics · alerts · health_reports    │    │
│  │  compliance · software_lists · patch_history    │    │
│  │  remediation_rules · it_notices · config        │    │
│  └─────────────────────────────────────────────────┘    │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │         Scheduled Cron Jobs (pg_cron)           │    │
│  │  check-alerts every 15 min                      │    │
│  │  reporting-agent every 15 min (AI diagnosis)    │    │
│  │  compliance-evaluate every 1 hour               │    │
│  └─────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────┘
            │
            ▼
┌──────────────────────────────────────────────────────────┐
│               IT Admin Dashboard                         │
│         React + TypeScript + Vite + TanStack Query       │
│         Tailwind CSS + Recharts + Framer Motion          │
│         8 Pages · 20+ Device Cards · Realtime Updates    │
└──────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────┐
│  Slack      │  Alert notifications
└─────────────┘
```

### Data Flow

1. **Enrollment:** Agent runs once on install → POSTs device hardware info to `/enroll` → receives `device_id` + `device_token` → saves to `config.json`
2. **Heartbeat (every 5 min):** Agent collects 60+ metrics → POSTs to `/heartbeat` with Bearer token → stored in `metrics` table → `devices` table updated
3. **Inventory (every 1 hour):** Agent collects installed apps and top processes → POSTs to `/inventory`
4. **Alert Check (every 15 min):** Cron triggers `check-alerts` → evaluates all devices against threshold rules → creates/resolves alerts → sends Slack notifications
5. **AI Diagnosis (every 15 min):** Cron triggers `reporting-agent` → calls Claude API with metrics + process data → stores health report with score and recommendations
6. **Dashboard:** React app queries Supabase directly via `@supabase/supabase-js` with TanStack Query for caching and background refresh
7. **Remote Commands:** Admin clicks action in dashboard → command record created → agent polls every 10s → executes command → reports back status

---

## 4. System Requirements

### Agent — macOS
- macOS 11 Big Sur or later
- Python 3.9 or later
- pip packages: `psutil`, `requests`, `rumps`
- Internet connectivity (HTTPS outbound to Supabase)
- ~15 MB disk space
- ~20 MB RAM (agent daemon)
- CPU: < 0.5% average

### Agent — Windows
- Windows 10 (1903) or later / Windows 11
- Python 3.9 or later (auto-installed via winget if absent)
- pip packages: `psutil`, `requests`
- Internet connectivity (HTTPS outbound to Supabase)
- ~15 MB disk space
- ~25 MB RAM

### Dashboard
- Any modern browser (Chrome 90+, Firefox 88+, Safari 14+, Edge 90+)
- Node.js 18+ (for local development only)

### Backend Infrastructure
- Supabase project (Free or Pro tier)
- Supabase Edge Functions enabled
- pg_cron enabled (for scheduled checks)

---

## 5. Installation Guide

The easiest way to get the install command is the **Deploy agent** menu at the bottom of the console sidebar. It offers the macOS installer (`.sh`), the Windows installer (`.bat`) and a copy button for the one-line Mac command. Linux is intentionally hidden from the portal.

### 5.1 macOS Agent Installation

**One-line install (recommended)** — run in Terminal on the Mac:

```bash
curl -fsSL sparrowshield.vercel.app/mac | sudo bash
```

`/mac` is a short link to `/agents/SparrowShield-Mac-Install.sh`. The installer:
1. Finds a Python 3 with `venv` (Homebrew, python.org or Apple's `/usr/bin/python3`)
2. Creates `/usr/local/sparrowshield/` with its own virtualenv and installs `requests` and `psutil`
3. Downloads `agent_mac.py` and `edr_engine.py` from the portal
4. Writes `config.json` (Supabase URL and public key; `chmod 600`, owned by root)
5. Installs ClamAV through Homebrew as the logged-in user, if Homebrew is present (otherwise virus-signature scanning is skipped)
6. Registers the root LaunchDaemon `/Library/LaunchDaemons/com.sparrowshield.sensor.plist` and starts it
7. The agent enrols on first run and appears in the console within about a minute

**Full Disk Access:** without it the agent cannot scan user folders. Grant it silently with a PPPC profile from Jamf (see `backend/agent/macos_pkg/`), or manually in System Settings → Privacy & Security → Full Disk Access.

**Verify / restart / logs:**
```bash
sudo launchctl print system/com.sparrowshield.sensor | head -20
sudo launchctl kickstart -k system/com.sparrowshield.sensor
tail -f /usr/local/sparrowshield/agent.log
```

**Re-installing is not needed for updates** — the agent updates itself every hour (see 6.0).

**Uninstall:**
```bash
sudo launchctl bootout system/com.sparrowshield.sensor
sudo rm -rf /usr/local/sparrowshield /Library/LaunchDaemons/com.sparrowshield.sensor.plist
```
Then remove the device from the console (Device Detail → **Remove**).

---

### 5.2 Windows Agent Installation

**Option A — Double-click installer (recommended):**

1. Download `SparrowShieldInstaller.bat` from **Deploy agent** in the console sidebar
2. Right-click → **Run as Administrator** (or double-click — it self-elevates)
3. Follow the progress prompts

**Option B — PowerShell directly:**

```powershell
# Run in an elevated PowerShell window
Set-ExecutionPolicy Bypass -Scope Process -Force
.\sparrow-install.ps1
```

The installer:
1. Self-elevates to Administrator via UAC
2. Checks for Python 3 → installs via `winget` if missing
3. Installs pip dependencies: `psutil`, `requests`
4. Creates `C:\ProgramData\SparrowShield\`
5. Writes `agent_windows.py` and `config.json`
6. Registers the Task Scheduler task `SparrowShieldAgent` running as SYSTEM, at every boot
7. Starts the task immediately

**Verify installation:**
```powershell
Get-ScheduledTask -TaskName "SparrowShieldAgent"
```

**Uninstall:**
```powershell
Unregister-ScheduledTask -TaskName "SparrowShieldAgent" -Confirm:$false
Remove-Item "C:\ProgramData\SparrowShield" -Recurse
```

> The Windows agent does **not** self-update yet. To roll out a new Windows agent, re-run the installer.

---

## 6. Device Agents

### 6.0 What every agent does today

Each agent runs several independent loops. The table shows the macOS agent (`agent_mac.py` + `edr_engine.py`, root LaunchDaemon); the Windows column says where Windows differs.

| Loop / feature | How often | What it does | Windows |
|---|---|---|---|
| **Heartbeat** | every 5 min | Metrics, security posture, hostname (from `scutil --get ComputerName`, so renames show up), agent version, failed-login check | every 60 s |
| **Inventory** | every hour | Installed software and top processes | Compliance / vulnerability loops |
| **Command loop** | polls every 5 s | Runs console commands **concurrently** in threads, reports `progress` (0–100 %) and a progress message, merges duplicate scans, marks commands left "running" by a crash as failed at start-up | polls; no progress reporting |
| **Auto-update** | 90 s after start, then hourly (or on the **Update agent** command) | Downloads `/agents/version.json`, verifies the SHA-256 of `agent_mac.py` and `edr_engine.py`, compiles them, keeps the old copy as `.prev`, restarts. If the new version fails to start 3 times it rolls back automatically | not available |
| **App enforcement** | every 15 s | Closes apps on the Application Control blocklist (matched by `.app` bundle name, so helpers go too) and enforces Process Policies (block = kill, alert = alert). Never flags processes the agent itself started | via minifilter driver if installed |
| **Detection analytics** | process rules every 30 s, file/persistence/config/log rules every 5 min | Evaluates the 156-analytic catalogue from the console (see below). State in `/var/lib/sparrowshield/analytics_state.json` | not available |
| **IT notices** | every 60 s | Shows each active notice once per Mac as a dialog in the logged-in user's session | not available |
| **Sensor health** | 45 s after start, then every 10 min (or **Check now**) | Checks hardware sensors and reports them to `rpc/report_sensors` (see below) | every 10 min, via Device Manager |
| **Web filter** | on command and after policy changes | Category feeds (cached 6 h) + custom rules written to `/etc/hosts` only when the content changes; allow rules strip `www.` | DNS blocklist commands |

**Detection analytics catalogue.** 156 analytics modelled on Jamf Protect, across 11 categories, stored in the `analytics` table (generated by `backend/supabase/analytics_catalog.py` — regenerate rather than hand-editing migration 025). 150 are enabled and evaluated, 3 are disabled by default (matching Jamf's defaults), and 3 (Nested App Signature Mismatch, Synthetic Click, USB Write) need the Endpoint Security sensor and are listed but not evaluated. Methods: command-line and parent/child process rules, listening ports, persistence baselines (new/changed LaunchAgents and daemons, disguised or hidden targets, `DYLD_INSERT_LIBRARIES`), file checks (new apps with URL handlers or no quarantine flag are judged only when they appear, never on first scan), configuration checks, unified-log queries and malware indicators. A hit writes a `security_events` row (`event_type = 'analytic'`) and an alert with `rule_id = analytic:<id>`.

**Sensor health.** The macOS agent checks 14 sensors in `collect_sensors()`:

| Sensor | Category | How it's read |
|---|---|---|
| Touch ID | Biometrics | `AppleBiometricSensor` in the I/O registry; `bioutil` for unlock setting and enrolled fingerprints |
| Presence detection | Presence | Always "Not available" — Macs have none |
| Accelerometer, Gyroscope | Motion & tilt | Apple Silicon sensor processor (`AppleSPUHIDDevice` products `accel`, `gyro`) |
| Lid angle sensor | Lid / hinge | Live hinge angle in degrees read over IOKit HID (`las`), plus lid open/closed |
| Ambient light sensor | Display light | `als` (Apple Silicon) or `AppleLMUController` (Intel) |
| Location (Wi-Fi) | Location | Wi-Fi hardware present + Location Services on/off |
| Wi-Fi radio, Bluetooth | Wireless | `networksetup` / `ifconfig`; `system_profiler SPBluetoothDataType` |
| Built-in camera, Built-in microphone | Camera / Audio | `system_profiler SPCameraDataType` / `SPAudioDataType` |
| Keyboard & trackpad | Input | "Apple Internal Keyboard / Trackpad" in the I/O registry |
| Battery | Power | macOS battery health, maximum capacity, cycles, permanent-failure flag (warning below 80 % or "Service Recommended") |
| Thermal sensors | Thermal | `pmset -g therm` — warning if the CPU is throttled |

The Windows agent (`collect_sensors_win()`) reads Device Manager status for fingerprint reader, Windows Hello IR camera, presence (ToF/radar), accelerometer, gyroscope, compass, hinge/lid, ambient light, GPS, camera, microphone, Wi-Fi, Bluetooth and keyboard/touchpad, plus battery wear (full-charge vs design capacity). A device in Device Manager "Error" (any problem code) is a failure, "Degraded" is a warning.

The database function `report_sensors()` (migration `026_sensor_health.sql`) stores each sensor in `device_sensors` and decides what counts as a fault: a sensor that **has worked before** on that device and now reports an error, a warning, or has disappeared raises one alert (`rule_id = sensor:<name>`, high for failures, medium for warnings) and posts to Slack straight away. When the sensor works again the alert resolves itself and Slack gets a "working again" message. Sensors a model never had never alert. A sensor that recovers and fails again within an hour does not page Slack a second time.

---

### 6.1 macOS Agent (agent_mac.py)

The macOS agent is a Python daemon that runs continuously in the background, collecting system metrics and sending them to SparrowShield backend.

#### Configuration

The agent reads from `/usr/local/sparrowshield/config.json`:

```json
{
  "api_url": "https://[PROJECT_ID].supabase.co/functions/v1",
  "anon_key": "eyJ...",
  "device_id": "uuid-assigned-at-enrollment",
  "device_token": "token-assigned-at-enrollment"
}
```

#### Enrollment

On first run (when `device_id` is empty), the agent calls `/enroll` with:
- `hostname`, `serial_number`, `os_type` ("mac"), `os_version`
- `assigned_user`, `department`
- `cpu_model`, `cpu_cores`, `ram_total_gb`

The response contains `device_id` and `device_token` which are saved back to `config.json`.

#### Heartbeat Loop (every 5 minutes)

Collects and POSTs the following to `/heartbeat`:

**Performance Metrics**
| Field | Description |
|---|---|
| `cpu_pct` | CPU utilization percentage |
| `ram_pct` | RAM utilization percentage |
| `disk_pct` | Primary disk usage percentage |
| `uptime_seconds` | System uptime in seconds |
| `last_reboot` | Timestamp of last boot |

**Battery**
| Field | Description |
|---|---|
| `battery_pct` | Current battery level (0–100) |
| `battery_cycles` | Battery charge cycle count |
| `battery_health` | Health string (Good / Fair / Poor) |
| `battery_health_pct` | Numeric health percentage |
| `is_charging` | Boolean — is AC power connected |

**Memory & Thermals**
| Field | Description |
|---|---|
| `swap_used_mb` | Swap memory in use (MB) |
| `swap_total_mb` | Total swap capacity (MB) |
| `memory_pressure` | macOS memory pressure (normal / warning / critical) |
| `thermal_state` | macOS thermal state (nominal / fair / serious / critical) |
| `fan_speed_rpm` | Fan speed in RPM |

**Network**
| Field | Description |
|---|---|
| `wifi_ssid` | Connected WiFi network name |
| `wifi_rssi` | WiFi signal strength in dBm |
| `net_upload_mb` | Network bytes sent (MB) |
| `net_download_mb` | Network bytes received (MB) |
| `open_connections_count` | Active TCP/UDP connections |
| `public_ip` | Public IP address (via ip-api.com) |
| `city`, `region`, `country` | Geolocation from IP |
| `latitude`, `longitude` | GPS coordinates from IP |
| `isp` | Internet service provider name |

**Security**
| Field | Description |
|---|---|
| `filevault_enabled` | FileVault full-disk encryption status |
| `firewall_enabled` | Application firewall status |
| `sip_enabled` | System Integrity Protection status |
| `gatekeeper_enabled` | Gatekeeper status |
| `mdm_enrolled` | MDM enrollment status |
| `antivirus_installed` | CrowdStrike / SentinelOne / Sophos / etc. detected |
| `antivirus_name` | Name of detected AV product |
| `screen_lock_enabled` | Screen lock / password required on wake |

**Sessions & Activity**
| Field | Description |
|---|---|
| `active_user` | Currently logged-in username |
| `remote_session_active` | AnyDesk / TeamViewer / LogMeIn detected |
| `crash_count_24h` | Application crashes in last 24 hours |
| `last_crashed_app` | Name of most recently crashed app |
| `user_sessions` | Active login sessions (username, terminal, host, login_time) |
| `login_history` | Recent login/logout events (username, type, time) |

**Storage & I/O**
| Field | Description |
|---|---|
| `disk_read_mb` | Disk read throughput (MB) |
| `disk_write_mb` | Disk write throughput (MB) |
| `storage_volumes` | All mounted volumes with capacity, free space, filesystem |

**System**
| Field | Description |
|---|---|
| `timemachine_enabled` | Time Machine backup enabled |
| `timemachine_last_backup` | Timestamp of last Time Machine backup |
| `login_items` | Apps that launch at login |
| `startup_items` | Legacy startup items |
| `third_party_kexts` | Third-party kernel extensions loaded |
| `listening_ports` | Open TCP/UDP listening ports |
| `dns_servers` | Configured DNS server addresses |
| `proxy_configured` | System proxy configured (boolean) |
| `printers` | Connected printers |
| `connected_displays` | External displays (model, resolution) |
| `bluetooth_devices` | Paired Bluetooth devices (name, battery %) |
| `pending_updates` | Available OS/app updates |
| `pending_update_count` | Count of pending updates |
| `installed_browsers` | Web browsers (name, version, engine, profiles) |
| `windows_defender_enabled` | (Windows only) Defender status |
| `domain_joined` | (Windows only) Active Directory domain joined |

#### Inventory Loop (every 1 hour)

POSTs to `/inventory`:
- `software`: Array of installed apps — name, version (up to 500 apps)
- `processes`: Top 20 processes by RAM usage — name, CPU%, RAM in MB

---

### 6.2 Windows Agent (agent_windows.py)

The Windows agent mirrors the macOS agent in functionality with platform-specific implementations.

#### Key Differences from macOS Agent

| Feature | macOS | Windows |
|---|---|---|
| Disk encryption | FileVault | BitLocker (`manage-bde -status C:`) |
| Firewall check | `socketfilterfw` | PowerShell `Get-NetFirewallProfile` |
| Serial number | `system_profiler` | `wmic bios get serialnumber` |
| Service mechanism | Root LaunchDaemon `com.sparrowshield.sensor` | Task Scheduler (SYSTEM account) |
| Install / log path | `/usr/local/sparrowshield/` (`agent.log`) | `C:\ProgramData\SparrowShield\` |
| Self-update | Hourly, checksum-verified, auto-rollback | Re-run installer |
| Analytics engine, app enforcement, IT notice pop-ups | Yes | Not yet |
| Sensor health | 14 sensors (I/O registry, IOKit HID, system_profiler) | Device Manager status + battery wear |
| Primary disk | `/` | `C:\` |
| SIP / Gatekeeper | Checked | N/A |
| BitLocker status | N/A | Checked |

---

### 6.3 macOS Menu Bar App (menubar_mac.py)

The menu bar app runs alongside the agent and provides employees with a quick-access status window in the macOS menu bar.

#### Menu Bar Title
The title displays live stats updated every 30 seconds:
```
🛡️  34%  ·  6.1GB
```
(CPU percentage · RAM in use)

#### Menu Structure

```
🛡️  34%  ·  6.1GB
─────────────────────
💻 CPU      34%  ████░░░░
🧠 RAM      55%  █████░░░  6.1 / 11.0 GB
💾 Disk     42%  ████░░░░
🔋 Battery  87%  ████████  Charging
📶 WiFi     -48 dBm  (Excellent)
🏥 Health   82 / 100

─────────────────────
[OS UPDATE BANNER — shown if update available]
⬆ macOS 14.5 available → Install Now

─────────────────────
[IT NOTICE BANNER — shown if active notice]
📢 System maintenance tonight 8–10pm — IT Admin

─────────────────────
⚡ Optimize All
🎫 Raise IT Ticket
🔄 Restart Agent
✕  Quit
```

#### Refresh Schedule

| Item | Interval |
|---|---|
| CPU / RAM / Disk / Battery | Every 30 seconds |
| WiFi signal | Every 30 seconds |
| Health score | Every 30 seconds |
| OS update check | Every 1 hour (cached) |
| IT Notice poll | Every 2 minutes |

#### Actions

**Optimize All** — Runs automatically:
1. Deletes user cache files (`~/Library/Caches/`)
2. Removes log files older than 30 days
3. Kills any app consuming over 500 MB RAM (with notification)

**Raise IT Ticket** — Opens a web browser to the IT ticketing system URL configured in `config.json`.

**Restart Agent** — restarts the root LaunchDaemon:
```bash
sudo launchctl kickstart -k system/com.sparrowshield.sensor
```

---

## 7. Dashboard — Pages & Features

The console lives at **https://sparrowshield.vercel.app**. This section follows the sidebar from top to bottom. Every list page uses the same table: free-text search, filter chips, sortable columns, CSV export, and a side drawer when you click a row.

**Who can do what.** There are two roles. **Admins** can do everything. **Read-only** users see every page, but buttons that change something (create, delete, resolve, send a command) are disabled, with the tooltip "Read-only access — ask an admin", and a banner at the top of the console says the account is read-only. The database enforces the same rule, so a read-only user cannot make changes through the API either.

### 7.1 Signing in, roles and the console frame

#### Login
- **Email code:** enter a work email and receive a one-time sign-in code (requires the Supabase email template to include `{{ .Token }}`).
- **Continue with Google / Continue with Microsoft:** OAuth sign-in. Works once the provider is enabled in Supabase → Authentication → Providers.
- **Single sign-on (Okta, SAML):** enter the company domain to start a SAML sign-in (needs SAML configured in Supabase).
- Only invited users get in. Anyone else who signs in sees a "no access" screen and no data.

#### Sidebar
Grouped sections (Home, Endpoints, Detection & Response, Protection Policies, Vulnerability & Compliance, Operations, Administration, and a collapsed Windows Console). Counters show open alerts, device counts per OS and sensor issues. **Deploy agent** at the bottom offers the macOS and Windows installers and copies the one-line Mac command. On phones the sidebar becomes a slide-in menu.

#### Top bar
- **Device search (⌘K):** jump to any device by name.
- **LIVE indicator:** the console is subscribed to database changes (Supabase Realtime); pages refresh themselves within about a second of an agent reporting.
- **Command activity tray:** every command sent to a device (scan, update, remove app, check sensors…) with live progress such as "Scanning files… 45 %", and the final result.
- Open-alert shortcut and your role label.

---

### 7.2 Home

#### Overview (`/`)
Real-time security posture of the fleet.
- **Tiles:** endpoints online, open alerts, policy violations, blocked items in the last 24 h, agents up to date.
- **Charts:** detections over the last 14 days by severity, open alerts by severity, top MITRE ATT&CK techniques (30 days), protection coverage.
- **Lists:** highest-priority open alerts and an endpoints table. **Refresh** reloads everything.

#### Alerts (`/alerts`)
Every alert from every source (detection rules, analytics, policies, sensor health, malware, thresholds), sorted by severity.
- Tiles for open alerts and resolved in the last 30 days; filters by severity, type and device.
- Click an alert for details, recent activity on that device and **Open device**.
- **Resolve / Reopen** (admin).
- **Automated remediations that need an admin decision:** commands raised by auto-remediation rules wait here for **Approve** or **Dismiss** (admin).

#### Live Activity (`/live-alerts`)
Open alerts and high-severity sensor events streamed as they arrive. **Pause stream / Resume**, resolve from the list or drawer, jump to the device.

---

### 7.3 Endpoints

#### All Devices / macOS / Windows (`/devices`, `/mac/devices`, `/windows/devices`)
Every enrolled endpoint with online status, posture, agent version and group. The macOS and Windows entries are the same list pre-filtered by OS.
- **Tiles:** total, online, offline, at risk, agent updating.
- **Filters:** OS, group, posture (compliant / at risk).
- Click a row to open **Device Detail**. **Remove from console** deletes the device record (with confirmation). **Refresh** reloads.

#### Device Detail (`/device/:id`)
Everything about one machine, top to bottom:

| Panel | What it shows / does |
|---|---|
| **Header** | Hostname (kept in sync with the Mac's Computer Name), online badge, serial, CPU, RAM, agent version, last seen. **Restart** (asks for confirmation; admin) and **Remove** |
| **JumpCloud System Insights** | Shown when the serial matches a JumpCloud system: JumpCloud agent, OS build, hardware, encryption and recovery key, firewall, uptime, battery, volumes, signed-in users |
| **Health gauge + AI diagnosis** | Latest health score and Claude-generated summary |
| **Metric bars** | CPU, RAM, disk, battery |
| **Battery / Network** | Battery condition and cycles; network interfaces and IPs |
| **Sensor health** | Every hardware sensor with status (Working / Warning / Failure / Not available), live detail (e.g. "Lid open at 118°", "Good · 88 % capacity · 390 cycles"), and "last working" time for failures. **Check now** (admin) runs the check immediately and refreshes the panel. Sensors the model doesn't have are folded away |
| **Security status / Security log** | FileVault/BitLocker, firewall, SIP, Gatekeeper…; recent security events (failed logins, USB, analytics hits, policy hits) |
| **Windows EDR / Isolation** | Windows only: Defender and EDR posture; isolate or reconnect the host |
| **Remote actions** | Mac: Run full security scan, Apply web filter now, Update agent now, Restart device (confirm). Windows: Run Defender full scan, Run vulnerability scan, Isolate host (confirm), Reconnect host. Each shows live progress and the result |
| **Threat score timeline** | Threat score over time |
| **Compliance / Crashes** | Per-device compliance result; crash reports |
| **System info / Storage** | Hardware and OS details; volumes |
| **Network security / Startup items** | Listening ports and connections; login items and launch agents |
| **Peripherals / Sessions** | USB and Bluetooth devices; user sessions |
| **Updates / Location** | Pending OS updates; approximate location from public IP |
| **Browsers** | Installed browsers and versions |
| **Installed apps** | Searchable app list with **Uninstall** and bulk uninstall (sends `uninstall_software`; the agent closes the app and moves it to quarantine, so it can be restored). Apple/system apps are protected |
| **Optimizer (macOS)** | Culprit applications by memory, performance history chart, recent commands and alert history |

#### Device Groups (`/groups`)
Teams of devices used to scope policies.
- **New team** (name + description), add or remove devices (searchable), **Delete team** (confirm).
- Tiles: teams, devices assigned, unassigned, team-scoped rules (app and web rules can target a team).

#### Sensor Health (`/sensors`)
Fleet-wide view of hardware sensors. The sidebar badge shows how many sensors currently have issues.
- **Tiles:** devices reporting (and how many have issues), open issues, failures, warnings, sensors working — click a tile to filter the table.
- **Table:** device, sensor, type, status, detail, how long it has been in that state, last checked. Filters by sensor type and OS; search; CSV export. Click a row to open the device.
- **Sensor coverage by platform:** one row per sensor type (biometrics, presence, motion & tilt, lid/hinge, location, display light, camera, microphone, wireless, keyboard & trackpad, battery, thermal) showing, for MacBooks and Windows laptops separately, how many devices have that sensor and how many have a problem.
- **Notifications:** a sensor that used to work and now fails or disappears raises a HIGH alert (MEDIUM for warnings such as a worn battery) and posts to Slack immediately; when it recovers the alert closes itself and Slack is told. Turn the Slack part off with the `slack_notify_sensor_health` setting.

#### JumpCloud (`/jumpcloud`)
Machines managed in JumpCloud, matched to SparrowShield devices by serial number.
- If JumpCloud isn't connected: **Connect JumpCloud** goes to Settings → Integrations.
- **Tiles:** JumpCloud systems, Protected (has SparrowShield), **Missing agent**, not encrypted, no contact for over 7 days — click to filter.
- Click a system for its System Insights; protected systems link to the SparrowShield device, missing ones show the install command.
- Synced hourly by the `jumpcloud-sync` function, or with **Sync now** in Settings.

---

### 7.4 Detection & Response

#### Detections (`/mac/edr`)
Alerts raised by the endpoint detection engine.
- Tabs **Open / Resolved / All**; filters by type and device; severity, MITRE technique and time columns.
- Drawer: details and response actions — **Full EDR scan**, **Defender scan** (Windows), **Isolate host** (Windows, with confirmation), **Resolve / Reopen**, **Open device**.

#### Analytics (`/analytics`)
The 156 Jamf-Protect-style detection analytics.
- Tiles: analytics, enabled, needing the ES sensor, detections in 30 days.
- Each analytic shows category, severity, MITRE technique, description and "Needs ES sensor" where applicable; an on/off switch (admin) enables or disables it fleet-wide — agents pick up the change on their next sync.
- Drawer: how the analytic works and its recent detections.

#### Malware Scanner (`/mac/av`)
Threat Scanner for the fleet.
- **Scan all devices** queues a full scan on every device (`run_edr_scan` on Macs, `defender_scan` on Windows), skipping devices with a scan already running.
- Tabs **Threats** (malware alerts; resolve / reopen) and **Scan history** (per-scan results, **Scan again**).
- Tiles: active threats, critical, scans in 24 h, last scan.

#### Threat Hunting (`/threat-hunt`)
Live stream of endpoint sensor events (`edr_events`) with risk scores.
- Pause / resume, minimum risk score filter, timeline of the last 60 minutes.
- Drawer: process lineage, **Kill process**, and **Block fleet-wide** by process name, path or signing ID (creates a Process Policy).

#### Process Tree (`/process-tree`)
Parent → child execution chains rebuilt from sensor process events. Search by process, command line or path; expand / collapse; select a process for lineage, command line, VirusTotal look-up and **Kill process**. Shows "sensor not yet connected" when no device sends process events.

#### Network Activity (`/mac/network`)
Open connections and listening ports from each device's latest heartbeat, with tiles for online devices, open connections, listening ports and suspicious ports.

#### MITRE ATT&CK (`/mitre`)
The Enterprise matrix coloured by what was detected. Tiles for techniques detected, tactics hit and rule coverage. Click a technique to see recent alerts, sensor events, the rules that cover it, and a link to MITRE.

---

### 7.5 Protection Policies

#### Application Control (`/app-filter`)
- **Rules tab:** **Add rule** — application name (e.g. "Slack"), **Block** (closed within ~15 s of launch and recorded as a violation) or **Allow** (exempt), scope (all devices or a team), optional reason. Delete rules.
- **Violations tab:** each time a blocked app was found. Actions: **Resolve**, **Remove app** (admin-approved: closes it and moves the `.app` bundle to quarantine on that Mac) and **Restore** (moves it back).
- Tiles: blocked apps, allowed apps, open violations.

#### Web Filtering (`/web-filter`)
- **Categories tab:** switch whole categories (malware, phishing, ransomware, crypto-mining, gaming…) on or off.
- **Custom rules tab:** **Add domain** as **Block** or **Allow** (allow wins even if a category lists the site). **Allow instead** turns a block into an allow in one click.
- Every change sends `sync_web_filter` to all Macs immediately (up to 250,000 domains per device).
- Tiles: categories blocked, blocked domains, allowed domains.

#### Process Policies (`/policy`)
Block or alert rules enforced by the agent's 15-second enforcement loop.
- **New Block Rule:** name, rule type (process name, path, signing ID, team ID, hash), pattern, action (**block** = kill, **alert** = alert only), severity, platform, optional MITRE ID and description. Enable/disable and delete (delete is permanent).

---

### 7.6 Vulnerability & Compliance

#### Vulnerabilities (`/vulnerabilities`)
End-of-life and vulnerable software across the fleet.
- Tabs **Open / Patched / All**; severity filter; most-affected applications; devices by risk.
- Actions: **Patch app**, **Patch all on device**, **Mark fixed**, **Open device**, and a link to Patch Management.

#### Patch Management (`/patches`)
Outdated applications reported by each agent, **By application** or **By device**. Update one app or everything on a device (Homebrew / App Store on Mac, winget on Windows). Tiles: devices, need updates, outdated apps, up to date.

#### Compliance (`/compliance`)
- Pick a framework (SOC 2, HIPAA, or your own). See the fleet score, the **Controls** tab (pass/fail per control, severity) and the **Devices** tab (per-device result).
- **New framework** (admin): name, description, controls; each control has an ID, name, severity and one or more checks on a device attribute with an operator (for example equals, contains, minimum version, or age in hours).
- Enable/disable or delete a framework; **Evaluate now** re-scores immediately. The `compliance-evaluate` function also runs every hour.

---

### 7.7 Operations

#### IT Notices (`/notices`)
Send a message that pops up on every Mac. Write the message, set **From** and an optional **Expiry**, and send. Each Mac shows it once, as a dialog for the logged-in user, within about a minute; sleeping Macs see it when they wake (until it expires). **Sent notices** lists history; delete a notice to stop it.

#### Reports (`/reports`)
- **Report library:** download fleet reports on demand as CSV, and print a one-page security summary.
- **Scheduled delivery:** **New schedule** — report type (executive, alerts, compliance, devices), daily / weekly / monthly, email recipients and/or Slack. Pause/resume and **Send now**. Delivered by the `send-reports` function (hourly check). Email needs a Resend key in Settings.

#### Executive Summary (`/executive`)
One-page posture for management: overall score, endpoints, agents reporting, open alerts, threat events (7 days), compliance, disk encryption, firewall, vulnerability-free share, web categories blocked; trends for 30 days; highest-risk endpoints. **Print / save PDF**.

---

### 7.8 Administration

#### Users & Roles (`/users`)
- **Invite user** by work email as **Admin — full control** or **Read-only**. Change a role from the drop-down in the list, or **Remove access**. The last admin cannot be removed or demoted.
- Shows each person's role and last sign-in ("Never signed in" until they log in) and the sign-in methods available (email code; Google / Microsoft / Okta SSO).

#### Audit Log (`/audit`) — admins only
Every change a person made in the console: policies, device actions, alerts, users and settings, with before/after values (secrets hidden). Filter by who, action, area and time range. Entries cannot be edited or deleted.

#### Settings (`/settings`)
Tabs (the URL remembers the tab, e.g. `/settings?tab=integrations`):

| Tab | What you configure |
|---|---|
| **Slack Notifications** | Slack webhook URL and which notification types to send (security alerts, system critical, device offline, disk health, new apps) |
| **Email Alerts** | Email delivery through Resend: API key, who receives alert e-mails, From address, **Send test email**, **Remove key** |
| **Integrations** | **JumpCloud** (API key, optional organisation ID, **Sync now**, **Disconnect**), **VirusTotal** (API key stored only in your browser, used for file look-ups; free tier 500/day). Other cards are marked *Planned* |
| **Auto-Remediation** | Rules such as "CPU above X % for N heartbeats → free memory", with cooldown, and the recent remediation log. Remediations can require admin approval in Alerts |
| **Software Lists** | Allow/block lists with reason, platform and violations |
| **Software Catalog** | Approved software with install method, for remote install |

API keys are stored server-side in `internal_secrets`, which the console can never read back.

---

### 7.9 Windows Console

Collapsed by default in the sidebar.
- **Windows Antivirus** (`/windows/av`) — the Threat Scanner for Windows devices (Defender scans).
- **Windows Detections** (`/windows/edr`) — Detections filtered to Windows.
- **Host Isolation** (`/windows/isolation`) — Windows endpoints with their isolation state; **Isolate** cuts all traffic except the SparrowShield console, **Release** restores it.

---

### 7.10 Pages reachable by link only

Not in the sidebar, but reachable by URL: Quarantine (`/av/quarantine` — quarantined app bundles with **Restore**), AV Definitions (`/av/definitions`), Detection Rules (`/edr/rules`), Process Monitor (`/edr/processes` — top processes with **Kill process**), Onboarding (`/onboarding`), About (`/about`).

---

## 8. Data Collection Reference

### Complete Field List (devices table)

The `devices` table is the master record for each enrolled device. Below is the complete field reference across all 14 database migrations.

#### Identity & Enrollment
| Field | Type | Description |
|---|---|---|
| `id` | uuid | Primary key |
| `hostname` | text | Device hostname |
| `serial_number` | text | Hardware serial number |
| `os_type` | text | "mac" or "windows" |
| `os_version` | text | Full OS version string |
| `assigned_user` | text | Primary user account |
| `department` | text | Organizational department |
| `enrolled_at` | timestamptz | First enrollment timestamp |
| `last_seen` | timestamptz | Most recent heartbeat |
| `status` | text | online / offline / warning / critical |

#### Hardware
| Field | Type | Description |
|---|---|---|
| `cpu_model` | text | CPU model name |
| `cpu_cores` | integer | Number of CPU cores |
| `ram_total_gb` | numeric | Total RAM in GB |

#### Real-Time Metrics
| Field | Type | Description |
|---|---|---|
| `cpu_pct` | numeric | CPU usage % |
| `ram_pct` | numeric | RAM usage % |
| `disk_pct` | numeric | Primary disk usage % |
| `uptime_seconds` | bigint | System uptime |
| `last_reboot` | timestamptz | Last boot timestamp |

#### Battery
| Field | Type | Description |
|---|---|---|
| `battery_pct` | numeric | Battery level % |
| `battery_cycles` | integer | Charge cycle count |
| `battery_health` | text | Good / Fair / Poor |
| `battery_health_pct` | numeric | Battery health % |
| `is_charging` | boolean | AC power connected |

#### Memory & Thermals
| Field | Type | Description |
|---|---|---|
| `swap_used_mb` | numeric | Swap in use (MB) |
| `swap_total_mb` | numeric | Swap total (MB) |
| `memory_pressure` | text | normal / warning / critical |
| `thermal_state` | text | nominal / fair / serious / critical |
| `fan_speed_rpm` | integer | Fan speed (RPM) |

#### Network
| Field | Type | Description |
|---|---|---|
| `wifi_ssid` | text | WiFi network name |
| `wifi_rssi` | integer | Signal strength (dBm) |
| `net_upload_mb` | numeric | Bytes sent (MB) |
| `net_download_mb` | numeric | Bytes received (MB) |
| `open_connections_count` | integer | Active connections |
| `listening_ports` | jsonb | Open listening ports |
| `dns_servers` | jsonb | DNS server list |
| `proxy_configured` | boolean | System proxy active |

#### Location
| Field | Type | Description |
|---|---|---|
| `public_ip` | text | Public IP address |
| `city` | text | City (from IP) |
| `region` | text | Region / state |
| `country` | text | Country |
| `latitude` | numeric | Latitude coordinate |
| `longitude` | numeric | Longitude coordinate |
| `isp` | text | Internet service provider |

#### Security
| Field | Type | Description |
|---|---|---|
| `filevault_enabled` | boolean | FileVault status |
| `bitlocker_enabled` | boolean | BitLocker status |
| `firewall_enabled` | boolean | Firewall status |
| `sip_enabled` | boolean | System Integrity Protection |
| `gatekeeper_enabled` | boolean | Gatekeeper status |
| `mdm_enrolled` | boolean | MDM enrollment |
| `antivirus_installed` | boolean | AV detected |
| `antivirus_name` | text | AV product name |
| `screen_lock_enabled` | boolean | Screen lock status |
| `windows_defender_enabled` | boolean | Windows Defender |
| `domain_joined` | boolean | AD domain joined |
| `domain_name` | text | AD domain name |
| `activation_status` | text | Windows activation |

#### Activity
| Field | Type | Description |
|---|---|---|
| `active_user` | text | Current user |
| `remote_session_active` | boolean | Remote access active |
| `crash_count_24h` | integer | Crashes last 24h |
| `last_crashed_app` | text | Last crashed app name |
| `user_sessions` | jsonb | Active sessions |
| `login_history` | jsonb | Recent login events |

#### Storage
| Field | Type | Description |
|---|---|---|
| `disk_read_mb` | numeric | Disk read throughput |
| `disk_write_mb` | numeric | Disk write throughput |
| `storage_volumes` | jsonb | All volumes detail |

#### System Items
| Field | Type | Description |
|---|---|---|
| `timemachine_enabled` | boolean | Time Machine on |
| `timemachine_last_backup` | timestamptz | Last backup time |
| `login_items` | jsonb | Apps at login |
| `startup_items` | jsonb | Startup items |
| `third_party_kexts` | jsonb | Kernel extensions |
| `printers` | jsonb | Connected printers |
| `connected_displays` | jsonb | External displays |
| `bluetooth_devices` | jsonb | Paired BT devices |
| `pending_updates` | jsonb | Available updates |
| `pending_update_count` | integer | Update count |
| `installed_browsers` | jsonb | Browser list |
| `top_processes` | jsonb | Top processes cache |
| `installed_apps` | jsonb | Installed apps cache |

---

## 9. API Reference — Edge Functions

All endpoints are served at:
```
https://[PROJECT_ID].supabase.co/functions/v1/[endpoint]
```

### POST /enroll
Register a new device with the fleet.

**Auth:** None (anon)

**Request body:**
```json
{
  "hostname": "MacBook-Pro-Tarani",
  "serial_number": "C02XK1JWJGH6",
  "os_type": "mac",
  "os_version": "macOS 14.4.1",
  "assigned_user": "tarani@company.com",
  "department": "Engineering",
  "cpu_model": "Apple M2 Pro",
  "cpu_cores": 10,
  "ram_total_gb": 16
}
```

**Response:**
```json
{
  "device_id": "uuid-...",
  "device_token": "token-string"
}
```

---

### POST /heartbeat
Send metrics update from device. Called every 5 minutes.

**Auth:** `Authorization: Bearer {device_token}`

**Request body:** All metric fields from Section 8 (60+ fields).

**Response:** `{ "ok": true }`

---

### POST /inventory
Send software and process inventory. Called every hour.

**Auth:** `Authorization: Bearer {device_token}`

**Request body:**
```json
{
  "device_id": "uuid-...",
  "software": [
    { "app_name": "Figma", "version": "116.15.4" }
  ],
  "processes": [
    { "process_name": "Figma", "cpu_pct": 12.3, "ram_mb": 412 }
  ]
}
```

---

### GET /get-devices
List all enrolled devices with optional filtering.

**Auth:** Anon key

**Query params:**
- `status` — filter by device status (online/offline/warning/critical)
- `os_type` — filter by OS (mac/windows)
- `search` — text search on hostname or assigned_user

**Response:** Array of device objects.

---

### GET /get-metrics
Fetch time-series metrics for a specific device.

**Auth:** Anon key

**Query params:**
- `device_id` (required) — device UUID
- `hours` — lookback window in hours (default: 24, max: 168)

**Response:** Array of metric rows sorted by timestamp.

---

### GET /get-alerts
Fetch alerts with optional filtering.

**Auth:** Anon key

**Query params:**
- `device_id` — filter by device
- `severity` — critical or warning
- `resolved` — true or false

---

### GET /get-health-reports
Fetch AI-generated health reports.

**Auth:** Anon key

**Query params:**
- `device_id` (required) — device UUID
- `limit` — number of reports (default: 10)

---

### POST /resolve-alert
Mark an alert as resolved.

**Auth:** Anon key

**Request body:**
```json
{ "alert_id": "uuid-..." }
```

---

### POST /approve-command
Approve or dismiss a pending remediation command.

**Auth:** Anon key

**Request body:**
```json
{
  "command_id": "uuid-...",
  "action": "approve"
}
```
`action` is either `"approve"` or `"dismiss"`.

---

### POST /check-alerts *(cron)*
Evaluate all devices against alert threshold rules. Creates new alerts and resolves stale ones. Sends Slack notifications for new critical alerts.

**Auth:** Service role key
**Trigger:** pg_cron every 15 minutes

---

### POST /reporting-agent *(cron)*
Generate AI health reports using Claude API. Reads latest metrics and top processes for each device, sends to Claude, stores the diagnosis.

**Auth:** Service role key
**Trigger:** pg_cron every 15 minutes

---

### POST /compliance-evaluate *(cron)*
Evaluate all active compliance frameworks against current device data. Updates compliance scores per device per control.

**Auth:** Service role key
**Trigger:** pg_cron every hour

---

### POST /update-config
Update global configuration (alert thresholds, Slack webhook, etc.).

**Auth:** `Authorization: Bearer {FLEETPULSE_ADMIN_SECRET}`

**Request body:** Key-value pairs matching the `config` table schema.

---

### POST /delete-device
Unenroll and remove a device from the fleet.

**Auth:** Service role key

**Request body:** `{ "device_id": "uuid-..." }`

---

## 10. Database Schema

### Core Tables

#### devices
Master device registry. One row per enrolled device. See Section 8 for complete field list.

#### metrics
Time-series performance data. One row per heartbeat per device.

```sql
id          uuid          primary key
device_id   uuid          references devices(id)
cpu_pct     numeric
ram_pct     numeric
disk_pct    numeric
battery_health_pct  numeric
filevault_enabled   boolean
firewall_enabled    boolean
recorded_at         timestamptz  default now()
```

#### device_health_reports
AI-generated health diagnoses.

```sql
id              uuid
device_id       uuid    references devices(id)
health_status   text    -- healthy / warning / critical
health_score    integer -- 0 to 100
summary         text    -- AI-generated narrative
culprit_apps    jsonb   -- [{app_name, ram_mb, cpu_pct, impact, recommendation}]
metrics_snapshot jsonb  -- snapshot of metrics at time of report
generated_at    timestamptz
```

#### alerts

```sql
id          uuid
device_id   uuid     references devices(id)
alert_type  text
severity    text     -- critical / warning
message     text
resolved    boolean
created_at  timestamptz
resolved_at timestamptz
```

#### remediation_rules

```sql
id                 uuid
name               text
enabled            boolean
metric             text    -- cpu_pct / ram_pct / disk_pct
operator           text    -- > / < / =
threshold          numeric
consecutive_beats  integer
action_type        text
cooldown_minutes   integer
created_at         timestamptz
```

#### compliance_frameworks

```sql
id       uuid
name     text    -- SOC2 / HIPAA
enabled  boolean
```

#### compliance_controls

```sql
id            uuid
framework_id  uuid  references compliance_frameworks(id)
control_id    text  -- e.g. "CC6.1"
control_name  text
description   text
field_checks  jsonb -- [{field, operator, value}]
severity      text
```

#### software_lists

```sql
id           uuid
list_type    text  -- allowlist / blocklist
app_name     text
app_pattern  text  -- glob pattern
reason       text
added_by     text
created_at   timestamptz
```

#### software_catalog

```sql
id                uuid
name              text
bundle_id         text
install_method    text  -- brew / pkg / dmg
install_command   text
uninstall_command text
version           text
category          text
icon_url          text
platform          text  -- mac / windows / both
```

#### patch_history

```sql
id                  uuid
device_id           uuid
updates_installed   text[]
updates_attempted   integer
updates_succeeded   integer
initiated_by        text
started_at          timestamptz
completed_at        timestamptz
status              text  -- pending / running / completed / failed
```

#### it_notices

```sql
id          uuid
message     text
sender      text  default 'IT Admin'
active      boolean  default true
created_at  timestamptz
expires_at  timestamptz  -- null = no expiry
```

Row Level Security: anonymous users can SELECT where `active = true`. An auto-expire trigger sets `active = false` when `expires_at` passes.

#### api_tokens

```sql
id          uuid
device_id   uuid
token_hash  text   -- SHA-256 of the raw token
created_at  timestamptz
last_used   timestamptz
revoked     boolean
```

#### config

```sql
key    text  primary key
value  text
```

---

## 11. Alert System

### Where alerts come from today (November 2026)

| Source | Raised by | Notified |
|---|---|---|
| Detection rules, analytics, process policies, blocked apps, malware | The agent, directly into `alerts` / `security_events` | Shown in the console in real time (Alerts, Live Activity). **Not** posted to Slack individually |
| Sensor faults | `report_sensors()` in the database (migration 026) | **Slack immediately**, and again when the sensor recovers |
| Threshold alerts (disk, RAM, CPU, battery %, encryption, firewall, offline) | The `check-alerts` edge function | Slack + email for each new alert |

> **Known gap:** `check-alerts` is **not currently scheduled** in pg_cron (only `compliance-evaluate`, `send-reports`, `jumpcloud-sync` and the offline-marking jobs are). Until a cron job is added, the threshold alerts described below are not generated automatically.


### How Alerts Are Generated

When scheduled (see the known gap above), the `check-alerts` edge function runs via pg_cron. For each device that has reported in the last hour it:

1. Reads the most recent heartbeat metrics from the `metrics` table
2. Evaluates each threshold rule:
   - `disk_pct > disk_warning` → Warning alert
   - `disk_pct > disk_critical` → Critical alert
   - `ram_pct > ram_warning` → Warning alert
   - `battery_pct < battery_warning` → Warning alert
   - `filevault_enabled = false` → Critical alert
   - `firewall_enabled = false` → Critical alert
   - No heartbeat for `offline_minutes` → Offline alert
3. Creates new alert records for newly detected conditions
4. Auto-resolves stale alerts when conditions clear
5. Sends Slack notification for new critical alerts (if webhook configured)

### Alert Severities

| Severity | Color | Meaning |
|---|---|---|
| **Critical** | Red | Immediate action required — security control off, disk full |
| **Warning** | Amber | Attention needed — resources high, battery low |

### Alert Lifecycle

```
Created (unresolved)
    → Condition clears → Auto-resolved by check-alerts
    → IT Admin clicks Resolve → Manually resolved
```

---

## 12. Remediation & Remote Actions

### How It Works

1. **Rule-based (automatic):** A remediation rule fires when a metric crosses its threshold for N consecutive beats. Creates a command record with status `awaiting_approval`.
2. **Manual (from dashboard):** IT admin clicks an action button in the Device Detail or Alert Center page. Creates a command record.
3. **Approval:** IT admin approves or dismisses the command in the Alert Center's Pending Commands section.
4. **Execution:** Agent polls for pending commands every 10 seconds. When found, executes the action and reports back (completed / failed).

### Command Types

| Command | What It Does |
|---|---|
| `kill_process` | Terminate the named process using `pkill` (macOS) or `taskkill` (Windows) |
| `clear_cache` | Delete `~/Library/Caches/` contents (macOS) or `%TEMP%` (Windows) |
| `optimize_memory` | Kill all processes consuming > 500 MB RAM |
| `kill_background_services` | Kill background services consuming > 200 MB RAM |
| `restart_ui` | Restart Dock and Finder (macOS only) |
| `install_updates` | Run `softwareupdate --install --all` (macOS) or Windows Update |
| `install_software` | Install app from the software catalog |
| `uninstall_software` | Uninstall a specified application |
| `patch_deploy` | Deploy a specific security patch via the patch-deploy function |

---

## 13. Compliance Frameworks

### Supported Frameworks
- **SOC2 Type II** — Security, Availability, and Confidentiality criteria
- **HIPAA** — Health Insurance Portability and Accountability Act technical safeguards

### How Compliance Is Evaluated

Each control is defined as a set of field checks against the `devices` table. For example:

```
Control CC6.1 — Encryption at Rest
  Check: filevault_enabled = true  (macOS)
  Check: bitlocker_enabled = true  (Windows)
  Severity: critical
```

The `compliance-evaluate` cron function runs hourly, evaluating every active control against every enrolled device. Results are stored as pass/fail snapshots.

### Compliance Score Calculation

Score = (controls passing / total controls) × 100

Scores are calculated per device and as a fleet aggregate.

---

## 14. Software Management

### Allowlist / Blocklist

**Blocklist:** When the inventory agent reports installed apps, the `/inventory` edge function checks each app against the blocklist. If a match is found, a `software_violation` alert is created. IT is notified via Slack if configured.

**Allowlist:** Can be enforced to alert when non-allowlisted apps are detected. Useful for regulated environments.

### Software Catalog

IT administrators can define approved applications in the Software Catalog with install and uninstall commands. These can then be deployed to any device remotely from the dashboard via deployment tasks.

**Supported install methods:**
- `brew` — Homebrew (macOS)
- `pkg` — macOS PKG installer
- `dmg` — macOS DMG disk image
- `winget` — Windows Package Manager
- `msi` — Windows Installer

---

## 15. Patch Management

### OS Update Detection
The macOS agent runs `softwareupdate --list` hourly and stores the list of pending updates in the `pending_updates` field. The Windows agent queries Windows Update API.

### Remote Patch Deployment
IT admins can trigger OS updates on any device from the Updates Card in Device Detail or via the `patch-deploy` edge function. The agent executes:

**macOS:**
```bash
softwareupdate --install --all
```

**Windows:**
```powershell
Install-WindowsUpdate -AcceptAll -AutoReboot
```

Patch history is logged to the `patch_history` table with start time, end time, list of updates installed, and success/failure status.

---

## 16. AI Health Diagnosis

### How It Works

The `reporting-agent` edge function runs every 15 minutes. For each device with new metrics it:

1. Reads the latest heartbeat data (all metric fields)
2. Reads the top 20 processes (name, CPU%, RAM MB)
3. Constructs a detailed prompt for Claude
4. Calls the Claude API (claude-3-opus or claude-3-sonnet)
5. Parses the structured JSON response
6. Stores the health report in `device_health_reports`

### Health Report Structure

```json
{
  "health_status": "warning",
  "health_score": 64,
  "summary": "Device is experiencing elevated memory pressure driven by multiple browser instances and Slack. Disk is 78% full — approaching warning threshold. Battery health is Good.",
  "culprit_apps": [
    {
      "app_name": "Google Chrome",
      "ram_mb": 1840,
      "cpu_pct": 18.2,
      "impact": "high",
      "recommendation": "Close unused Chrome tabs or limit to one browser window."
    },
    {
      "app_name": "Slack",
      "ram_mb": 620,
      "cpu_pct": 4.1,
      "impact": "medium",
      "recommendation": "Restart Slack to reclaim memory — it tends to leak after long uptime."
    }
  ]
}
```

### Health Score Calculation

| Score Range | Status | Dashboard Color |
|---|---|---|
| 80–100 | Healthy | Green |
| 50–79 | Warning | Amber |
| 0–49 | Critical | Red |

The score is AI-generated but generally reflects: RAM pressure, disk usage, thermal state, security controls, crash frequency, and process behavior.

---

## 17. IT Notices

IT Notices put a message in front of every Mac user — for example "Please restart before 6 PM to install security updates".

### Sending a notice (console → Operations → IT Notices)
1. Write the message.
2. Set **From** (shown in the dialog title, e.g. "IT Notice — IT Team").
3. Optionally set an **Expiry**.
4. Send. The notice is stored in the `it_notices` table.

### Delivery
The macOS agent checks for active, unexpired notices every 60 seconds and shows each new one **once per Mac** as a dialog with an OK button in the logged-in user's session (`launchctl asuser … osascript`; the text is passed as arguments, never inserted into the script). Seen notices are remembered in `notices_seen.json` on the Mac. A Mac that is asleep or has nobody logged in shows the notice later, as long as it hasn't expired. Windows does not show notices yet.

### Stopping a notice
Delete it from **Sent notices**, or let it expire.

---

## 18. Slack Integration

### Setup

1. Create an Incoming Webhook in your Slack workspace:
   - Go to https://api.slack.com/apps → Your App → Incoming Webhooks
   - Enable and add a webhook to the channel of your choice
   - Copy the webhook URL (`https://hooks.slack.com/services/...`)

2. In SparrowShield dashboard → Settings → Slack:
   - Paste the webhook URL
   - Toggle on the notification types you want

### Notification Types

| Toggle | Fires When |
|---|---|
| **New Software Installed** | Agent reports a new app not previously seen on a device |
| **Critical System Alerts** | CPU, RAM, or disk exceeds critical threshold |
| **Security Alerts** | FileVault, firewall, or antivirus status changes |
| **Device Offline** | No heartbeat received within the offline window |
| **Disk Health Warnings** | Disk usage exceeds the warning threshold |

### Notification Format

```
🚨 *SparrowShield Alert*
Device: MacBook-Pro-Tarani
Alert: Disk usage critical (96%)
User: tarani@company.com
Time: Apr 7, 2026 14:32 UTC
→ View Device
```

---

## 19. Reporting & Exports

All reports are exported as CSV files directly from the dashboard Reports page. Reports draw from live Supabase data at the time of export.

### Export Columns by Report

**Fleet Health Summary:**
`hostname, os_type, assigned_user, department, health_score, health_status, status, last_seen, enrolled_at`

**Security Compliance:**
`hostname, filevault_enabled, bitlocker_enabled, firewall_enabled, sip_enabled, gatekeeper_enabled, mdm_enrolled, antivirus_installed, screen_lock_enabled`

**Software Inventory:**
`hostname, assigned_user, app_name, version, detected_at`

**Alert History:**
`hostname, alert_type, severity, message, created_at, resolved, resolved_at`

**Patch History:**
`hostname, updates_installed, status, initiated_by, started_at, completed_at`

---

## 20. Security Model

### Device Authentication

Each device authenticates using a **Bearer token** issued at enrollment. The token is:
- Generated as a cryptographically random string at enrollment
- Stored in the Supabase database as a **SHA-256 hash** (never the raw token)
- Stored on the device in `config.json` (raw token, local only)
- Sent in every heartbeat and inventory request as `Authorization: Bearer {token}`
- Verified server-side by hashing the incoming token and comparing to the stored hash

### Console access and roles (RLS)

- The console requires sign-in (email code, Google, Microsoft or SAML). Membership is the `console_users` table (`admin` or `viewer`); `is_console_member()` and `is_console_admin()` are used by every policy.
- Every table: members can **read** (`console_member_read`), only admins can **write** (`console_admin_write`). Someone who signs in without an invitation sees nothing.
- Agents use the public (anon) key with narrow policies on the tables they write. Sensor reports go through the `report_sensors()` function instead of a table policy.
- Secrets (cron secret, JumpCloud and Resend keys) live in `internal_secrets`, which only the service role can read. Never put secrets in `config` — members can read it.
- User management goes through the `admin-users` edge function (invite, change role, remove; the last admin is protected).
- Every change made by a person is recorded by the `audit_row_change()` trigger in `audit_log` (config values redacted); entries cannot be edited or deleted.
- **Known gap:** the public key can still insert `device_commands` rows, so anyone who extracts it from an installer could queue commands to a device. Tighten this before wide rollout.

### Scheduled jobs
pg_cron calls edge functions through `call_edge_function()` with an `x-cron-secret` header: `compliance-evaluate` (hourly at :10), `send-reports` (hourly at :02), `jumpcloud-sync` (hourly at :20). Devices are marked offline every 2–5 minutes when heartbeats stop.

### Network Security

- All agent-to-backend communication is HTTPS only
- No inbound ports are opened on enrolled devices
- Agents are outbound-only (pull model for commands, push model for metrics)
- Public IP and geolocation data is collected from the ip-api.com service

### Data Retention

- Metrics data: retained indefinitely by default. Supabase pg_cron can be configured to purge records older than N days.
- Health reports: retained indefinitely.
- Alerts: retained indefinitely.
- Purge cron jobs are defined in migration `002_healsparrow.sql`.

---

## 21. Configuration Reference

### Global Config (Settings → General)

All values stored in the `config` table as key-value pairs.

| Key | Default | Description |
|---|---|---|
| `disk_warning_pct` | 85 | Disk warning alert threshold % |
| `disk_critical_pct` | 95 | Disk critical alert threshold % |
| `ram_warning_pct` | 90 | RAM warning alert threshold % |
| `battery_warning_pct` | 20 | Battery warning threshold % |
| `offline_minutes` | 120 | Minutes before device is marked offline |
| `min_os_version_mac` | 13.0 | Minimum required macOS version |
| `min_os_version_windows` | 10.0 | Minimum required Windows version |
| `slack_webhook` | — | Slack incoming webhook URL |
| `slack_notify_new_app` | true | Notify on new app installs |
| `slack_notify_system_critical` | true | Notify on critical system alerts |
| `slack_notify_security_alert` | true | Notify on security changes |
| `slack_notify_device_offline` | true | Notify on device going offline |
| `slack_notify_disk_health` | true | Notify on disk health warnings |
| `reporting_agent_enabled` | true | Enable AI health report generation |

### Agent config.json

```json
{
  "api_url": "https://[PROJECT_ID].supabase.co/functions/v1",
  "anon_key": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "device_id": "",
  "device_token": ""
}
```

`device_id` and `device_token` are populated automatically on first run.

### Edge Function Environment Variables

| Variable | Required | Description |
|---|---|---|
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Service role key (admin operations) |
| `SUPABASE_ANON_KEY` | Yes | Anonymous key (public reads) |
| `FLEETPULSE_ADMIN_SECRET` | Yes | Admin Bearer token for update-config |
| `ANTHROPIC_API_KEY` | Yes | Claude API key for health reports |
| `DASHBOARD_LINK` | Optional | Base URL included in Slack alert links |

---

## 22. Deployment Guide

### Step 1 — Create Supabase Project

1. Go to https://supabase.com and create a new project
2. Note your **Project URL** and **API keys** (anon + service role)
3. Enable **Edge Functions** in project settings
4. Enable **pg_cron** extension: Dashboard → Database → Extensions → pg_cron

### Step 2 — Run Database Migrations

In the Supabase SQL editor, run each migration file in order:

```
001_initial_schema.sql
002_healsparrow.sql
003_monitoring_expansion.sql
004_slack_integration.sql
005_location_tracking.sql
006_extended_monitoring.sql
007_remediation_rules.sql
008_compliance_mapping.sql
009_software_lists.sql
010_software_deployment.sql
011_patch_management.sql
012_windows_fields.sql
013_top_processes_column.sql
014_it_notices.sql
```

All migration files are in `/backend/supabase/migrations/`.

### Step 3 — Deploy Edge Functions

```bash
# Install Supabase CLI
npm install -g supabase

# Login
supabase login

# Link to your project
supabase link --project-ref [YOUR_PROJECT_ID]

# Set environment variables
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
supabase secrets set FLEETPULSE_ADMIN_SECRET=your-admin-secret
supabase secrets set DASHBOARD_LINK=https://your-dashboard.com

# Deploy all functions
supabase functions deploy
```

### Step 4 — Set Up Cron Jobs

In the Supabase SQL editor:

```sql
-- Alert checking every 15 minutes
select cron.schedule(
  'check-alerts',
  '*/15 * * * *',
  $$select net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/check-alerts',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.service_role_key')
    )
  )$$
);

-- AI health reports every 15 minutes
select cron.schedule(
  'reporting-agent',
  '*/15 * * * *',
  $$select net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/reporting-agent',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.service_role_key')
    )
  )$$
);
```

### Step 5 — Build and Deploy Dashboard

```bash
cd dashboard

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env:
# VITE_SUPABASE_URL=https://[PROJECT_ID].supabase.co
# VITE_SUPABASE_ANON_KEY=eyJ...

# Build for production
npm run build

# Deploy to any static host (Vercel, Netlify, Cloudflare Pages, etc.)
# The dist/ folder contains the built app
```

### Step 6 — Build Installers

Update the `api_url` and `anon_key` in the agent files, then rebuild the installers:

```bash
cd backend/agent

# macOS installer — embeds agent_mac.py and menubar_mac.py as base64
python3 build_installer.py  # or run the embed script

# Windows installer — embeds agent_windows.py as base64
# SparrowShield-Install.bat wraps sparrow-install.ps1
```

### Step 7 — Deploy Agents to Devices

**macOS (via MDM or manual):**
```bash
# On the target Mac (or push the same command through Jamf/MDM):
curl -fsSL sparrowshield.vercel.app/mac | sudo bash
```

**Windows (via GPO or manual):**
```
Double-click SparrowShieldInstaller.bat → Run as Administrator
```

---

## 23. Troubleshooting

### Agent Not Sending Heartbeats

1. Check agent is running: `sudo launchctl print system/com.sparrowshield.sensor | head`
2. View logs: `tail -100 /usr/local/sparrowshield/agent.log`
3. Verify config.json has valid `api_url` and `anon_key`
4. Test connectivity: `curl https://[PROJECT].supabase.co/functions/v1/get-devices`
5. Restart agent: `sudo launchctl kickstart -k system/com.sparrowshield.sensor`

### Dashboard Shows Device as Offline

Device is offline if no heartbeat received within `offline_minutes` (default: 120 minutes). Check:
- Agent is running on the device
- Device has internet connectivity
- Supabase project is not paused (free tier auto-pauses after 7 days inactivity)

### Stat Cards Show "—" (Empty Values)

This means neither the AI health report snapshot nor the metrics table has data for the device. Check:
- Heartbeat is being sent successfully (check agent logs)
- `metrics` table has rows for this `device_id` in Supabase Table Editor
- The `useMetrics` hook is fetching with the correct `device_id`

### Sessions Card Shows "Invalid Date"

The macOS `last` command returns dates without a year (e.g., `"Mon Mar 31 10:22"`). The `fmtDate()` helper in `SessionsCard.tsx` handles this by appending the current year and retrying. If you still see invalid dates, check the raw format of `login_history[].time` in the device's Supabase record.

### AI Health Reports Not Generating

1. Verify `ANTHROPIC_API_KEY` is set in Supabase secrets
2. Check `reporting_agent_enabled` is `true` in the config table
3. Check edge function logs in Supabase Dashboard → Edge Functions → reporting-agent → Logs
4. Verify the cron job is active: `select * from cron.job;` in SQL editor

### IT Notices Not Appearing on Macs

1. Check the notice is active and not expired in **IT Notices → Sent notices**
2. Wait about a minute (the agent checks every 60 seconds); each Mac shows a notice only once
3. A user must be logged in at the Mac — with only the login window showing, the notice waits
4. Look for "Showed IT notice" in `/usr/local/sparrowshield/agent.log`

### Windows Agent Not Starting

1. Check Task Scheduler: `Get-ScheduledTask -TaskName "SparrowShieldAgent"`
2. Run manually: `python "C:\ProgramData\SparrowShield\agent_windows.py"`
3. Check logs: `Get-Content "C:\ProgramData\HealSparrow\agent.log" -Tail 50`
4. Verify Python is installed: `python --version`
5. Verify pip dependencies: `pip show psutil requests`

---

## 24. Roadmap & Limitations

### Current Limitations

| Area | Limitation |
|---|---|
| **Windows parity** | Windows lacks self-update, the analytics engine, 15-second app enforcement and IT notice pop-ups. Windows sensor health is implemented but not yet tested on a real Windows laptop |
| **Endpoint Security sensor** | 3 analytics (Nested App Signature Mismatch, Synthetic Click, USB Write) need the ES sensor and are not evaluated |
| **Threshold alerts** | `check-alerts` is not scheduled (see section 11) |
| **Agent-raised alerts** | Detection / analytics alerts are not pushed to Slack one by one (sensor faults are) |
| **Command security** | The public key can insert device commands (see section 20) |
| **Full Disk Access** | Must be granted by a PPPC profile (Jamf) or by hand; without it user folders are not scanned |
| **Integrations need keys** | JumpCloud and Resend need API keys in Settings; SSO buttons need the provider enabled in Supabase |
| **Linux** | Agent exists but is hidden from the portal and unsupported |
| **Mobile** | iOS and Android not supported |
| **MDM** | No configuration profiles or certificates (needs Apple MDM) |

### Delivered since v1
Console sign-in with roles and audit log · real-time updates · live command progress · custom compliance frameworks with hourly evaluation · scheduled report delivery · device groups · agent self-update · 156 detection analytics · application control with remove/restore · web filtering with category feeds · IT notice pop-ups · JumpCloud System Insights · sensor health monitoring.

### Planned
- [ ] Windows parity (self-update, analytics, notices)
- [ ] Schedule `check-alerts` and send agent-raised alerts to Slack
- [ ] Restrict command creation to signed-in admins
- [ ] Ticketing (Jira / ServiceNow)
- [ ] Endpoint Security sensor for the remaining analytics

---

*SparrowShield is built and maintained as an open-source project. Contributions welcome.*
