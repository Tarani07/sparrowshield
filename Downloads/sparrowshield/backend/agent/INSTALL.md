# SparrowShield Agent Installation Guide

## One-Click Installation

The simplest way to install the SparrowShield agent on macOS is using the one-click installer:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/sparrowit/sparrowshield/main/backend/agent/sparrow-install.sh)
```

Or if you prefer to review the script first:

```bash
# Download
curl -fsSL -o sparrow-install.sh https://raw.githubusercontent.com/sparrowit/sparrowshield/main/backend/agent/sparrow-install.sh

# Review
cat sparrow-install.sh

# Execute
bash sparrow-install.sh
```

## Features

✅ **Self-Contained** — All code embedded as base64, no external downloads needed  
✅ **Zero Dependencies** — Works offline, even from JumpCloud without internet access  
✅ **Smart Context Detection** — Automatically detects root vs. user installation  
✅ **LaunchAgent Auto-Start** — Registers as system background service  
✅ **Python Auto-Setup** — Installs psutil/requests automatically  
✅ **Secure** — Uses Supabase API keys, HTTPS only  

## Installation Contexts

### User Installation (Recommended)
```bash
bash <(curl -fsSL https://raw.githubusercontent.com/sparrowit/sparrowshield/main/backend/agent/sparrow-install.sh)
```
- Installs to: `~/.sparrow-agent`
- Runs as: current user
- No sudo required

### Root Installation (MDM Deployment)
```bash
sudo bash <(curl -fsSL https://raw.githubusercontent.com/sparrowit/sparrowshield/main/backend/agent/sparrow-install.sh)
```
- Installs to: `/usr/local/sparrow-agent`
- Runs as: specified console user
- For JumpCloud or fleet MDM systems

### JumpCloud Command (Silent)
Paste into JumpCloud admin → Commands → Custom Command:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/sparrowit/sparrowshield/main/backend/agent/sparrow-install.sh)
```

**Or embed in a policy:**
- Target: All devices or groups
- Command type: Shell
- Run as: User (not root, unless you need to)
- Timeout: 600 seconds

## What Gets Installed

```
~/.sparrow-agent/
├── agent_mac.py           # Main agent (1.7K lines, 66KB)
├── menubar_mac.py         # Menu bar app (925 lines, 33KB)
├── config.json            # Supabase connection settings
├── agent.log              # Activity log
└── .plist                 # LaunchAgent registration
```

## What the Agent Does

- **Every 5 minutes (Heartbeat)**
  - System metrics: CPU, RAM, disk, battery, network
  - Security status: FileVault, firewall, SIP, Gatekeeper, MDM
  - App inventory: installed applications and versions
  - User sessions and login history
  - Peripherals: USB, Bluetooth, displays, printers
  - Processes: top 10 memory-consuming apps

- **Every 1 hour (Inventory)**
  - Detailed system hardware info
  - Browser detection and versions
  - Startup items and background services
  - Listening ports and network connections

- **On-Demand (Remote Commands)**
  - Kill processes, optimize memory, clear caches
  - Restart Finder/Dock, force logout
  - Install/uninstall software
  - Run arbitrary shell commands

## Verification

### Check Installation
```bash
# Verify files exist
ls -la ~/.sparrow-agent/

# Check LaunchAgent
launchctl list | grep sparrow

# View logs
tail -f ~/.sparrow-agent/agent.log

# Check if running
ps aux | grep agent_mac.py
```

### Dashboard Verification
1. Open https://localhost:5173 (or your dashboard URL)
2. Go to Fleet Overview
3. Your device should appear within 5 minutes
4. Check health metrics are populating

## Troubleshooting

### Agent Not Appearing in Dashboard
1. Check logs: `tail ~/.sparrow-agent/agent.log`
2. Verify internet connection: `ping api.supabase.io`
3. Restart agent: `launchctl unload ~/.sparrow-agent/com.sparrow.agent.plist && sleep 2 && launchctl load ~/.sparrow-agent/com.sparrow.agent.plist`

### CPU/Memory Usage High
- Agent uses ~5-10MB RAM (psutil collection)
- Heartbeat runs every 5 minutes (2 seconds duration)
- Inventory runs every 1 hour
- Menu bar app is optional and uses ~20MB when visible

### Python Dependency Issues
```bash
# Manual install
pip3 install psutil requests rumps
# Or with --user
pip3 install --user psutil requests rumps
```

### Uninstallation
```bash
# Stop the agent
launchctl unload ~/.sparrow-agent/com.sparrow.agent.plist

# Remove files
rm -rf ~/.sparrow-agent/
rm ~/Library/LaunchAgents/com.sparrow.agent.plist
rm ~/Library/LaunchAgents/com.sparrow.menubar.plist

# For root installation, use /usr/local/sparrow-agent
```

## Remote Management

After installation, you can remotely:

### Via Dashboard
1. Go to Device Details
2. Click action buttons: Kill Process, Optimize Memory, Clear Cache, etc.
3. Changes execute within 10 seconds

### Via JumpCloud
1. Send custom command to device
2. Agent receives and executes within 10 seconds
3. Result returned to dashboard

## Deployment at Scale

### For 100+ Devices
1. **JumpCloud Policy**: Create policy with installer command
2. **Target**: All Macs
3. **Run at**: Enrollment or custom schedule
4. **Verify**: Check fleet health in dashboard after 30 minutes

### For Fresh MDM Enrollments
1. Add installer to JumpCloud/Jamf "prestage" or "post-enrollment" script
2. Devices will auto-install on first login
3. No additional IT steps needed

## Security

- Supabase connection: HTTPS TLS 1.2+
- API Key: Public anon key (read/write only to devices table)
- Agent code: Open source, auditable on GitHub
- No data goes to third parties
- Self-hosted backend option available

## Support

- **Logs**: `~/.sparrow-agent/agent.log`
- **Dashboard**: http://localhost:5173/device/{device-id}
- **GitHub Issues**: https://github.com/sparrowit/sparrowshield/issues
- **Email**: support@sparrowit.com

---

**Happy monitoring! 🎯**
