# Sparrow Shield Agent

Native macOS monitoring agent that collects host metrics and reports to your backend every 5 minutes.

## Requirements

- macOS 13+
- Swift 6.2
- Backend at `http://localhost:3000/api/v1/report` accepting JSON POST with header `X-Sparrow-Secret`

## Install

**Option 1 – Build and run from the project (no install)**

```bash
cd /Users/tarani
swift build
export SPARROW_SECRET="your-secret-here"
swift run SparrowShieldAgent
```

**Option 2 – Install script (binary + optional LaunchAgent)**

1. Set your secret and run the install script:

   ```bash
   cd /Users/tarani
   export SPARROW_SECRET="your-secret-here"   # required for backend auth
   chmod +x install.sh
   ./install.sh
   ```

   This builds a **release** binary at `.build/release/SparrowShieldAgent`. Run it with:

   ```bash
   SPARROW_SECRET='your-secret' .build/release/SparrowShieldAgent
   ```

2. **Optional – install to PATH and run at login:**

   ```bash
   export SPARROW_SECRET="your-secret-here"
   ./install.sh --launch-agent
   ```

   This will:
   - Copy the binary to `/usr/local/bin/SparrowShieldAgent` (or `~/bin` if you don’t have write access there)
   - Create a LaunchAgent at `~/Library/LaunchAgents/com.sparrowshield.agent.plist`

   Then load it (starts the agent and runs at every login):

   ```bash
   launchctl load ~/Library/LaunchAgents/com.sparrowshield.agent.plist
   ```

   To stop:

   ```bash
   launchctl unload ~/Library/LaunchAgents/com.sparrowshield.agent.plist
   ```

   Logs: `~/Library/Logs/SparrowShieldAgent.log` and `SparrowShieldAgent.err.log`.

Set `SPARROW_SECRET` in your environment (or in the LaunchAgent plist) so the agent can authenticate with the backend.

## Behavior

- **Every 5 minutes** the agent collects:
  - `hostname` – machine name
  - `username` – current user
  - `cpu_usage` – system CPU %
  - `ram_usage` – used RAM %
  - `top_energy_impact_app` – process name with highest CPU (proxy for Energy Impact)

- **Networking:** Sends a JSON POST to `http://localhost:3000/api/v1/report` with header `X-Sparrow-Secret: <SPARROW_SECRET>`.

- **Retry:** If the backend is unreachable, the agent retries after 60 seconds.

- **Self-healing:** If CPU usage is above 90% for two consecutive checks, it logs a "Heal Action" and runs `purge` to clear inactive memory (via `Process`). For full system purge you can run the agent with `sudo` or configure passwordless `sudo purge`.

- **Persistence:** The process stays running using `RunLoop.main.run()` and a repeating 5-minute timer.

## Example report payload

```json
{
  "hostname": "MyMac",
  "username": "jane",
  "cpu_usage": 12.5,
  "ram_usage": 68.2,
  "top_energy_impact_app": "Safari",
  "timestamp": "2026-02-16T12:00:00Z"
}
```
