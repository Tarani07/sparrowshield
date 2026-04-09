# SparrowShield — Complete Product Documentation

**Version:** 1.0
**Last Updated:** April 2026
**Stack:** Python · Supabase · React · TypeScript · Tailwind CSS

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
   - 6.1 [macOS Agent (agent_mac.py)](#61-macos-agent-agent_macpy)
   - 6.2 [Windows Agent (agent_windows.py)](#62-windows-agent-agent_windowspy)
   - 6.3 [macOS Menu Bar App (menubar_mac.py)](#63-macos-menu-bar-app-menubar_macpy)
7. [Dashboard — Pages & Features](#7-dashboard--pages--features)
   - 7.1 [Fleet Overview](#71-fleet-overview)
   - 7.2 [Device List](#72-device-list)
   - 7.3 [Device Detail](#73-device-detail)
   - 7.4 [Alert Center](#74-alert-center)
   - 7.5 [Reports](#75-reports)
   - 7.6 [Compliance](#76-compliance)
   - 7.7 [Settings](#77-settings)
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

**SparrowShield** is a self-hosted, open-source Device Health Monitoring and Fleet Management platform designed for IT teams managing macOS and Windows endpoints. It provides real-time visibility into every device in the fleet — hardware metrics, security posture, compliance status, installed software, and network configuration — all from a single dashboard.

SparrowShield is built as a lightweight, cost-effective alternative to commercial MDM platforms like JumpCloud, Jamf, or Mosyle. Because it is fully self-hosted on Supabase infrastructure, there are no per-seat licensing fees — only flat infrastructure costs regardless of fleet size.

### Key Capabilities at a Glance

| Category | Capability |
|---|---|
| **Monitoring** | CPU, RAM, disk, battery, thermals, WiFi, network I/O — updated every 5 minutes |
| **Inventory** | Installed apps, running processes, peripherals, storage volumes, login history |
| **Security** | FileVault, BitLocker, Firewall, SIP, Gatekeeper, MDM, antivirus, screen lock |
| **Alerts** | Threshold-based alerts with Slack notifications |
| **Remediation** | Remote actions: kill process, clear cache, optimize memory, install updates |
| **Compliance** | SOC2 and HIPAA framework evaluation with per-control scoring |
| **AI Diagnosis** | Claude-powered health reports with root-cause analysis every 15 minutes |
| **Software** | App allowlist/blocklist, software catalog, remote install/uninstall |
| **Patches** | OS and app update detection and remote patch deployment |
| **IT Notices** | Push custom messages to all Mac menu bar trays in real time |
| **Reports** | 20+ downloadable CSV reports for audits, compliance, and fleet health |

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
│  │  LaunchAgent     │      │  (SYSTEM account)      │  │
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

### 5.1 macOS Agent Installation

**One-command install (recommended):**

```bash
bash ~/Downloads/sparrow-install.sh
```

The installer performs the following steps automatically:
1. Checks for Python 3 (prompts to install via Homebrew if missing)
2. Installs pip dependencies: `psutil`, `requests`, `rumps`
3. Creates installation directory: `/opt/sparrow/`
4. Writes `agent_mac.py` and `menubar_mac.py` to `/opt/sparrow/`
5. Writes `config.json` with the pre-configured API URL, Supabase anon key
6. Creates log directory and log file at `/var/log/healsparrow-agent.log`
7. Registers a macOS LaunchAgent plist at `~/Library/LaunchAgents/com.sparrowshield.agent.plist`
8. Loads the LaunchAgent (agent starts immediately and on every login)

**Verify installation:**
```bash
# Check agent is running
launchctl list | grep sparrow

# View live logs
tail -f /var/log/healsparrow-agent.log
```

**Uninstall:**
```bash
launchctl unload ~/Library/LaunchAgents/com.sparrowshield.agent.plist
rm -rf /opt/sparrow ~/Library/LaunchAgents/com.sparrowshield.agent.plist
```

---

### 5.2 Windows Agent Installation

**Option A — Double-click installer (recommended):**

1. Download `SparrowShield-Install.bat`
2. Right-click → **Run as Administrator** (or double-click — it self-elevates)
3. Follow the progress prompts [1/5] through [5/5]

**Option B — PowerShell directly:**

```powershell
# Run in an elevated PowerShell window
Set-ExecutionPolicy Bypass -Scope Process -Force
.\sparrow-install.ps1
```

The installer performs the following steps:
1. Self-elevates to Administrator via UAC
2. Checks for Python 3 → installs via `winget` if missing
3. Installs pip dependencies: `psutil`, `requests`
4. Creates installation directory: `C:\ProgramData\SparrowShield\`
5. Writes `agent_windows.py` and `config.json`
6. Registers a Windows Task Scheduler task running as SYSTEM account
7. Starts the task immediately

**Verify installation:**
```powershell
# Check scheduled task
Get-ScheduledTask -TaskName "SparrowShieldAgent"

# View logs
Get-Content "C:\ProgramData\HealSparrow\agent.log" -Tail 50
```

**Uninstall:**
```powershell
Unregister-ScheduledTask -TaskName "SparrowShieldAgent" -Confirm:$false
Remove-Item "C:\ProgramData\SparrowShield" -Recurse
```

---

## 6. Device Agents

### 6.1 macOS Agent (agent_mac.py)

The macOS agent is a Python daemon that runs continuously in the background, collecting system metrics and sending them to SparrowShield backend.

#### Configuration

The agent reads from `/opt/sparrow/config.json`:

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
| Service mechanism | LaunchAgent plist | Task Scheduler (SYSTEM account) |
| Log path | `/var/log/healsparrow-agent.log` | `C:\ProgramData\HealSparrow\agent.log` |
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

**Restart Agent** — Unloads and reloads the LaunchAgent plist:
```bash
launchctl unload ~/Library/LaunchAgents/com.sparrowshield.agent.plist
launchctl load  ~/Library/LaunchAgents/com.sparrowshield.agent.plist
```

---

## 7. Dashboard — Pages & Features

The dashboard is a React Single Page Application served via Vite. It connects directly to Supabase using the anon key and uses TanStack Query for data fetching, caching, and background refresh.

**Local development:**
```bash
cd dashboard
npm install
npm run dev
# Available at http://localhost:5173
```

---

### 7.1 Fleet Overview

**Route:** `/`

The home page gives a bird's-eye view of the entire fleet's health at a glance.

#### Summary Cards (top row)
- **Total Devices** — count of all enrolled devices
- **Critical** — count of devices in critical health status (red)
- **Warning** — count of devices in warning status (amber)
- **Healthy** — count of devices in healthy status (green)

#### Fleet Health Donut Chart
Visual breakdown of healthy / warning / critical device counts. Color-coded ring chart built with Recharts.

#### Top Offenders
List of the 5 devices with the lowest health scores, showing hostname, health score, and primary issues detected.

#### Device Table
Filterable table of all enrolled devices with columns:
- Hostname
- OS (macOS / Windows icon)
- Assigned User
- Department
- Last Seen (relative time)
- Health Score (colored badge)
- Status (Online / Offline / Warning / Critical)

**Filter tabs:** All · Critical · Warning · Healthy · Mac · Windows · Search

---

### 7.2 Device List

**Route:** `/devices`

Full searchable, sortable list of all enrolled devices. Each row is clickable to navigate to the Device Detail page.

---

### 7.3 Device Detail

**Route:** `/device/:id`

The most feature-rich page. Displays a complete profile of a single device across multiple cards.

#### Top Section
- **Health Gauge** — Large circular gauge showing health score (0–100) with color (green/amber/red) and status label
- **Metric Bars** — CPU%, RAM%, Disk% horizontal bars with color coding
- **AI Diagnosis Card** — Health status, AI-generated summary, culprit apps with impact level (high/medium/low) and recommendations

#### Hardware & System
- **System Info Card** — Hostname, serial number, OS version, CPU model, CPU cores, RAM total, enrolled date, last seen, uptime, last reboot
- **Storage Card** — Disk usage percentage, all mounted volumes with capacity and free space
- **Battery Card** — Battery %, charge cycles, health (Good/Fair/Poor), charging status

#### Network & Location
- **Network Card** — WiFi SSID, signal strength (dBm + quality label), upload/download stats, public IP
- **Location Card** — City, region, country, ISP, latitude/longitude
- **Network Security Card** — Open connections count, listening ports, DNS servers, proxy status

#### Security
- **Security Status Card** — Traffic-light status for: FileVault, BitLocker, Firewall, SIP, Gatekeeper, MDM Enrollment, Antivirus, Screen Lock
- **Compliance Card** — SOC2 and HIPAA compliance scores with per-control pass/fail details

#### Performance History
- **Metrics Trend Chart** — 24-hour line chart of CPU%, RAM%, Disk% with hover tooltips (built with Recharts)

#### Software & Processes
- **Installed Apps Card** — Full list of installed applications with name and version
- **Browsers Card** — Web browsers detected (name, version, engine, profile count, default browser)
- **Top Processes** — Running processes sorted by RAM usage (name, CPU%, RAM MB)

#### Activity & Events
- **Sessions Card** — Active login sessions (username, terminal, host, login time) and recent login/logout history
- **Crashes Card** — Crash count in last 24 hours, most recently crashed app
- **Updates Card** — Pending OS and app updates with count

#### Peripherals & System Items
- **Peripherals Card** — USB devices, Bluetooth devices (with battery %), connected displays
- **Startup Items Card** — Login items, startup items, third-party kernel extensions
- **Backup Card** — Time Machine status and last backup timestamp

#### Remote Actions
Optimizer action buttons:
- **Kill Top Process** — Terminate the highest RAM-consuming process
- **Clear Cache** — Delete user cache directories
- **Optimize Memory** — Kill all apps over 500 MB RAM
- **Restart UI** — Restart Dock and Finder
- **Install Updates** — Trigger pending OS and app updates

---

### 7.4 Alert Center

**Route:** `/alerts`

Centralized view of all system alerts across the fleet.

#### Alert List
Each alert shows:
- Severity badge (Critical / Warning)
- Alert type (plain English description)
- Affected device hostname
- Time created
- Resolved status

**Filter options:** All · Critical · Warning · Active · Resolved

#### Pending Commands
List of remediation commands awaiting approval, showing:
- Command type (kill_process, clear_cache, optimize_memory, etc.)
- Target device
- Triggered by (auto-rule or manual)
- Status (Awaiting Approval / Pending / Running / Completed / Failed)
- Approve ✓ and Dismiss ✕ buttons

#### Alert Types

| Alert Type | Trigger |
|---|---|
| `high_cpu` | CPU > configurable threshold (default 90%) |
| `high_ram` | RAM > configurable threshold (default 90%) |
| `high_disk` | Disk > configurable threshold (default 85%) |
| `critical_disk` | Disk > critical threshold (default 95%) |
| `low_battery` | Battery < threshold (default 20%) |
| `device_offline` | No heartbeat for configurable minutes (default 120) |
| `encryption_disabled` | FileVault or BitLocker turned off |
| `firewall_disabled` | Firewall turned off |
| `antivirus_missing` | No antivirus detected |
| `mdm_unenrolled` | Device removed from MDM |
| `new_software_installed` | New application detected on device |
| `software_violation` | Blocklisted app detected |

---

### 7.5 Reports

**Route:** `/reports`

Export any of 20+ pre-built CSV reports for auditing, compliance, and analysis.

#### Available Reports

| Report Name | Contents |
|---|---|
| Fleet Health Summary | All devices with health score, status, last seen |
| Device Inventory | Full hardware specs for all devices |
| Alert History | All alerts with device, type, severity, resolution |
| Software Inventory | All installed apps across all devices |
| Process Report | Top processes by device |
| Security Compliance | Per-device security control status |
| SOC2 Compliance | SOC2 control pass/fail per device |
| HIPAA Compliance | HIPAA control pass/fail per device |
| Battery Health Report | Battery cycles and health across fleet |
| Disk Usage Report | Disk utilization across fleet |
| Location Report | Device locations by IP geolocation |
| Login History | User login/logout events per device |
| Crash Report | Application crashes across fleet |
| Update Status | Pending updates per device |
| Patch History | OS update history per device |
| Software Violations | Blocklisted apps detected |
| Offline Devices | Devices that have not reported recently |
| New Enrollments | Recently enrolled devices |

---

### 7.6 Compliance

**Route:** `/compliance`

Evaluate and track SOC2 and HIPAA compliance across the entire fleet.

#### Framework Selector
Toggle between SOC2 and HIPAA frameworks.

#### Fleet Compliance Score
Overall percentage of controls passing across all devices.

#### Control Summary
Per-control breakdown showing:
- Control ID and name
- Description
- Which device field is evaluated
- Pass / Fail / N/A counts across the fleet
- Severity (critical / high / medium / low)

#### Device Compliance Table
Per-device compliance score with last evaluation timestamp. Drill down into a device to see which specific controls it is failing.

---

### 7.7 Settings

**Route:** `/settings`

Admin configuration panel with the following tabs:

#### General
Global alert threshold configuration:
- Disk warning threshold (%)
- Disk critical threshold (%)
- RAM warning threshold (%)
- Battery warning threshold (%)
- Offline detection window (minutes)
- Minimum macOS version required
- Minimum Windows version required

#### Remediation Rules
Create and manage auto-remediation rules. Each rule defines:
- **Name** — friendly label
- **Metric** — `cpu_pct`, `ram_pct`, or `disk_pct`
- **Operator** — `>`, `<`, or `=`
- **Threshold** — numeric trigger value
- **Consecutive Beats** — how many heartbeats must breach threshold before firing
- **Action** — kill_process, optimize_memory, clear_cache, restart_ui, install_updates
- **Cooldown** — minutes before the rule can fire again for the same device
- **Enabled** toggle

#### Slack Notifications
- Slack webhook URL input
- Toggle notifications for: new software installs, critical system alerts, security alerts, device offline, disk health warnings

#### Software Lists
Manage application allowlists and blocklists:
- **Allowlist** — only these apps are permitted (if enforced)
- **Blocklist** — these apps trigger a violation alert when detected
- Each entry has: app name, match pattern (glob), reason, added by

#### Software Catalog
Library of approved software packages available for remote deployment:
- App name, bundle ID, version, category, platform (mac/windows)
- Install method: Homebrew, PKG, DMG
- Install command and uninstall command

#### Deployment Tasks
Track in-progress and completed remote software deployments:
- Target device, app name, status, initiated by, timestamps

#### IT Notices
Push custom messages to all Mac menu bar trays:
- **Compose form:** Message text (up to 280 characters), From field, optional expiry datetime
- **Send to All Macs** button — inserts notice to `it_notices` table; polled by all menu bar apps within 2 minutes
- **Notice History** — table of all past notices with Active/Dismissed badge and manual dismiss button

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

### How Alerts Are Generated

The `check-alerts` edge function runs every 15 minutes via pg_cron. For each device that has reported in the last hour it:

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

IT Notices allow administrators to push custom text messages directly to the macOS menu bar app on all enrolled Mac devices.

### Creating a Notice (Dashboard → Settings → IT Notices)

1. Type your message (up to 280 characters)
2. Set the "From" name (defaults to "IT Admin")
3. Optionally set an expiry datetime (auto-dismisses at that time)
4. Click **Send to All Macs**

The notice is inserted into the `it_notices` Supabase table.

### Delivery

The macOS menu bar app polls the `it_notices` table every 2 minutes. When an active notice is found, it displays in the menu as a banner:

```
📢 [Message text] — [Sender]
```

### Expiry

If an `expires_at` datetime is set, a Supabase database trigger automatically sets `active = false` when that time passes. The notice disappears from all menu bar apps within 2 minutes of expiry.

### Manual Dismiss

Administrators can click the ✕ button next to any notice in the IT Notices history table to immediately set `active = false`.

### Prerequisites

Run migration `014_it_notices.sql` in the Supabase SQL editor before using this feature:

```sql
create table if not exists public.it_notices (
  id         uuid primary key default gen_random_uuid(),
  message    text not null,
  sender     text not null default 'IT Admin',
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  expires_at timestamptz default null
);

alter table public.it_notices enable row level security;

create policy "anon can read active notices"
  on public.it_notices for select to anon
  using (active = true);
```

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

### Row Level Security (RLS)

All Supabase tables have Row Level Security enabled. The `anon` role (used by the dashboard and agents) has carefully scoped policies:

- Agents can only INSERT/UPDATE their own device's records (scoped by `device_id`)
- Dashboard reads are allowed on all tables via anon (read-only)
- Destructive operations (delete, bulk update) require the service role key
- `it_notices` only returns rows where `active = true`

### Admin Operations

Admin-level API calls (update-config, delete-device) require the `FLEETPULSE_ADMIN_SECRET` environment variable as a Bearer token. This secret is never exposed to the frontend or agents.

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
# Copy installer to target Mac then:
bash ~/Downloads/sparrow-install.sh
```

**Windows (via GPO or manual):**
```
Double-click SparrowShield-Install.bat → Run as Administrator
```

---

## 23. Troubleshooting

### Agent Not Sending Heartbeats

1. Check agent is running: `launchctl list | grep sparrow`
2. View logs: `tail -100 /var/log/healsparrow-agent.log`
3. Verify config.json has valid `api_url` and `anon_key`
4. Test connectivity: `curl https://[PROJECT].supabase.co/functions/v1/get-devices`
5. Restart agent: `launchctl unload/load ~/Library/LaunchAgents/com.sparrowshield.agent.plist`

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

### IT Notices Not Appearing in Menu Bar

1. Confirm migration `014_it_notices.sql` has been run
2. Check the `it_notices` table has an active row (`active = true`)
3. Wait up to 2 minutes (polling interval)
4. Check `menubar_mac.py` logs for errors in the `_fetch_it_notice()` function

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
| **Menu Bar App** | macOS only. Windows tray app not yet built. |
| **Remote Actions** | Require agent polling. Actions can take up to 10 seconds to reach the device. |
| **MDM Features** | Does not enforce profiles, certificates, or configuration payloads (that requires Apple MDM protocol) |
| **Mobile Devices** | iOS and Android not supported |
| **Linux** | No Linux agent |
| **Real-time** | Dashboard does not use Supabase Realtime subscriptions — uses polling via TanStack Query |
| **Authentication** | Dashboard has no built-in auth layer — relies on Supabase anon key access |

### Planned Features

- [ ] Windows menu bar / system tray app
- [ ] Linux agent (Ubuntu / Debian)
- [ ] Dashboard authentication (Supabase Auth with email/password or SSO)
- [ ] Role-based access control (IT Admin vs. Read-only)
- [ ] Real-time dashboard updates via Supabase Realtime
- [ ] Mobile agent (iOS / Android)
- [ ] Custom compliance frameworks (beyond SOC2 and HIPAA)
- [ ] Scheduled report delivery via email
- [ ] Two-way command acknowledgement with progress streaming
- [ ] Device groups and tagging
- [ ] Integration with Jira / ServiceNow for ticket creation
- [ ] Audit log for all admin actions

---

*SparrowShield is built and maintained as an open-source project. Contributions welcome.*
