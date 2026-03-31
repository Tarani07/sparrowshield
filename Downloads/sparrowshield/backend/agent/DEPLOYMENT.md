# Quick Deployment Reference

## 🚀 One-Line Installation (User)
```bash
bash <(curl -fsSL https://raw.githubusercontent.com/sparrowit/sparrowshield/main/backend/agent/sparrow-install.sh)
```

## 🔐 Deployment (Root/Admin)
```bash
sudo bash <(curl -fsSL https://raw.githubusercontent.com/sparrowit/sparrowshield/main/backend/agent/sparrow-install.sh)
```

## 🎯 JumpCloud Deployment

### Method 1: Custom Command (Single Device)
1. JumpCloud Admin Console → Commands → Custom Command
2. Paste this:
```bash
bash <(curl -fsSL https://raw.githubusercontent.com/sparrowit/sparrowshield/main/backend/agent/sparrow-install.sh)
```
3. Target: Select device
4. Timeout: 600 seconds
5. Run as: **User** (not root)
6. Execute

### Method 2: Fleet Policy (All Devices)
1. JumpCloud Admin Console → Policies → macOS
2. Create new policy: "SparrowShield Agent Installation"
3. Set trigger: Enrollment or Daily
4. Add script:
```bash
#!/bin/bash
bash <(curl -fsSL https://raw.githubusercontent.com/sparrowit/sparrowshield/main/backend/agent/sparrow-install.sh)
```
5. Target: macOS device group
6. Deploy

### Method 3: MDM Prestage Script
For new device enrollments:
```bash
# Add to: macOS Enrollment → Prestage script
bash <(curl -fsSL https://raw.githubusercontent.com/sparrowit/sparrowshield/main/backend/agent/sparrow-install.sh)
```
Devices will auto-install on first login before user sees desktop.

## ✅ Verification

### Check Installation
```bash
# Verify files
ls -la ~/.sparrow-agent/

# View logs (real-time)
tail -f ~/.sparrow-agent/agent.log

# Check if running
ps aux | grep agent_mac.py

# Check LaunchAgent status
launchctl list | grep sparrow
```

### Check Dashboard
1. Open dashboard: http://localhost:5173 (or your URL)
2. Go to Fleet Overview
3. Your device should appear within 5 minutes
4. Verify metrics are populating (CPU, RAM, disk, etc.)
5. Click device to see detailed metrics

## 🔧 Testing on Your Mac

### Test User Installation (No Admin)
```bash
# Download installer
curl -fsSL -o ~/sparrow-install.sh \
  https://raw.githubusercontent.com/sparrowit/sparrowshield/main/backend/agent/sparrow-install.sh

# Review it
less ~/sparrow-install.sh

# Run it
bash ~/sparrow-install.sh

# Watch logs
tail -f ~/.sparrow-agent/agent.log
```

### Test Root Installation (If Needed)
```bash
sudo bash <(curl -fsSL https://raw.githubusercontent.com/sparrowit/sparrowshield/main/backend/agent/sparrow-install.sh)
```

## 📊 Post-Installation Setup

1. **First heartbeat**: 5 minutes after installation
2. **Dashboard update**: 30 seconds after heartbeat
3. **Full inventory**: 1 hour after installation
4. **First alert check**: 5 minutes after installation

## 🚨 Troubleshooting

| Issue | Solution |
|-------|----------|
| Device not appearing | Wait 5 min, check logs: `tail ~/.sparrow-agent/agent.log` |
| High CPU usage | Check if inventory running: `ps aux \| grep agent` |
| Menu bar app missing | Install rumps: `pip3 install rumps` |
| Can't connect to backend | Check: `curl https://api.supabase.io` |
| Permission denied | Installer requires executable bash, try: `bash -c "$(curl ...)"` |

## 🛑 Uninstallation

```bash
# Stop agent
launchctl unload ~/.sparrow-agent/com.sparrow.agent.plist

# Remove all files
rm -rf ~/.sparrow-agent/
rm ~/Library/LaunchAgents/com.sparrow.*.plist

# Verify removed
ps aux | grep agent_mac.py  # Should show no results
```

## 📱 For iPad/Enterprise
Current agent supports macOS only. Windows agent coming Q2 2026.

---

**Need help?** Check `/INSTALL.md` for detailed guide.
