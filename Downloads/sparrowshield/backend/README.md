# FleetPulse Backend

Backend for the FleetPulse System Health Monitoring product. Built on **Supabase** (PostgreSQL, Edge Functions, Realtime, Cron) with Python agents for macOS and Windows.

## Tech stack

- **Supabase Edge Functions** (Deno/TypeScript) — API layer
- **Supabase PostgreSQL** — Database
- **Supabase Realtime** — Live updates to dashboard
- **Supabase Cron** — Scheduled alert evaluation (every 15 minutes)
- **Slack Incoming Webhooks** — Notifications
- **Device agents** — Python (psutil, requests); authenticate via Bearer token (stored as SHA-256 hash in DB)

## Project structure

```
backend/
├── README.md
├── supabase/
│   ├── functions/
│   │   ├── _shared/           # CORS, response helpers, Supabase client, auth (hash/token)
│   │   ├── enroll             # POST — register device, return device_id + token
│   │   ├── heartbeat          # POST — receive metrics (Bearer auth)
│   │   ├── inventory          # POST — software + process list (Bearer auth)
│   │   ├── check-alerts       # Cron — evaluate rules, create/resolve alerts, Slack
│   │   ├── get-devices        # GET — list devices (optional filters, latest metrics)
│   │   ├── get-metrics        # GET — metrics for a device (device_id, hours)
│   │   ├── get-alerts         # GET — alerts (device_id, severity, resolved)
│   │   ├── resolve-alert      # POST — set alert resolved
│   │   └── update-config      # POST — upsert config (admin auth)
│   └── migrations/
│       └── 001_initial_schema.sql
└── agent/
    ├── agent_mac.py
    ├── agent_windows.py
    ├── config.json            # Template: api_url, device_id, device_token
    ├── requirements.txt
    └── README (this file references agent setup)
```

## Setup

### 1. Supabase project

1. Create a project at [supabase.com](https://supabase.com).
2. In the project directory (where `supabase/` lives), run:

   ```bash
   cd backend
   supabase init
   ```

   If `supabase init` already created a `supabase/` folder, ensure this repo’s `supabase/migrations` and `supabase/functions` are in place (replace or merge as needed).

3. Link the project (replace with your project ref):

   ```bash
   supabase link --project-ref YOUR_PROJECT_REF
   ```

### 2. Run migration

Apply the schema and seed config:

```bash
supabase db push
```

Or run the SQL manually in the Supabase SQL Editor: paste the contents of `supabase/migrations/001_initial_schema.sql` and execute.

### 3. Deploy Edge Functions

Deploy all functions:

```bash
supabase functions deploy enroll
supabase functions deploy heartbeat
supabase functions deploy inventory
supabase functions deploy check-alerts
supabase functions deploy get-devices
supabase functions deploy get-metrics
supabase functions deploy get-alerts
supabase functions deploy resolve-alert
supabase functions deploy update-config
```

Or deploy in one go (if your CLI supports it):

```bash
supabase functions deploy
```

### 4. Environment variables

Set secrets for the Edge Functions (Supabase Dashboard → Project Settings → Edge Functions → Secrets, or via CLI):

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Project URL (e.g. `https://YOUR_PROJECT.supabase.co`) — often set automatically |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key — often set automatically for deployed functions |
| `SUPABASE_ANON_KEY` | Anon key (optional; used if a function needs to call the API as anon) |
| `FLEETPULSE_ADMIN_SECRET` | Secret for `update-config`; send as `Authorization: Bearer <secret>` |
| `DASHBOARD_LINK` | Base URL of the React dashboard (for Slack alert links) |

Example (CLI):

```bash
supabase secrets set FLEETPULSE_ADMIN_SECRET=your-admin-secret
supabase secrets set DASHBOARD_LINK=https://your-dashboard.vercel.app
```

### 5. Cron: run check-alerts every 15 minutes

- In **Supabase Dashboard** → **Database** → **Extensions**, enable `pg_cron` if needed.
- In **Database** → **Cron Jobs** (or via SQL), add a job that calls the `check-alerts` Edge Function every 15 minutes.

Example using Supabase’s HTTP extension (if available) or a cron service:

- **Supabase Cron (pg_cron + pg_net)** — example SQL (adjust function URL and auth):

  ```sql
  SELECT cron.schedule(
    'fleetpulse-check-alerts',
    '*/15 * * * *',
    $$
    SELECT net.http_post(
      url := 'https://YOUR_PROJECT.supabase.co/functions/v1/check-alerts',
      headers := '{"Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb,
      body := '{}'::jsonb
    );
    $$
  );
  ```

- Or use an external cron (e.g. GitHub Actions, Vercel Cron) to `POST` to `https://YOUR_PROJECT.supabase.co/functions/v1/check-alerts` with `Authorization: Bearer YOUR_SERVICE_ROLE_KEY` every 15 minutes.

### 6. Slack (optional)

1. Create an Incoming Webhook in your Slack workspace.
2. Update the `slack_webhook` config with the webhook URL via the `update-config` function:

   ```bash
   curl -X POST 'https://YOUR_PROJECT.supabase.co/functions/v1/update-config' \
     -H 'Authorization: Bearer YOUR_FLEETPULSE_ADMIN_SECRET' \
     -H 'Content-Type: application/json' \
     -d '{"key":"slack_webhook","value":{"url":"https://hooks.slack.com/services/..."}}'
   ```

### 7. Install agent on devices

**macOS**

1. Copy `agent/` (including `config.json`, `agent_mac.py`, `requirements.txt`) to the Mac.
2. Edit `config.json`: set `api_url` to your Edge Functions base URL, e.g.  
   `https://YOUR_PROJECT.supabase.co/functions/v1`  
   Leave `device_id` and `device_token` empty for first run (agent will enroll).
3. Install Python 3 and dependencies:

   ```bash
   pip install -r requirements.txt
   ```

4. Run (foreground or as a service):

   ```bash
   python3 agent_mac.py
   ```

   For production, run as a launchd service; logs go to `/var/log/fleetpulse-agent.log` (create the file and set permissions if needed).

**Windows**

1. Copy `agent/` to the Windows machine.
2. Edit `config.json` as above.
3. Install Python 3 and dependencies:

   ```powershell
   pip install -r requirements.txt
   ```

4. Run:

   ```powershell
   python agent_windows.py
   ```

   Logs: `C:\ProgramData\FleetPulse\agent.log`. Run as a Windows Service or scheduled task for production.

## API summary

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/enroll` | POST | None | Register device; returns `device_id` and one-time `token`. |
| `/heartbeat` | POST | Bearer (device token) | Submit metrics. |
| `/inventory` | POST | Bearer (device token) | Submit software and process list. |
| `/check-alerts` | POST | Cron / service role | Evaluate rules, create/resolve alerts, send Slack; run every 15 min. |
| `/get-devices` | GET | Anon (dashboard) | List devices; optional `status`, `os_type`, `search`. |
| `/get-metrics` | GET | Anon | Metrics for `device_id`; optional `hours` (default 24, max 168). |
| `/get-alerts` | GET | Anon | Alerts; optional `device_id`, `severity`, `resolved`. |
| `/resolve-alert` | POST | Anon | Body: `{ "alert_id": "uuid" }`. |
| `/update-config` | POST | Admin Bearer | Body: `{ "key": "...", "value": ... }`. |

All Edge Functions return JSON: `{ "success": boolean, "data": any, "error": string | null }` and send CORS headers for dashboard access.

## Default config (in DB)

- **alert_thresholds**: `disk_warning`, `disk_critical`, `ram_warning`, `battery_warning`, `offline_minutes`, `min_os_version_mac`, `min_os_version_windows`
- **slack_webhook**: `{ "url": "" }` — set via `update-config`
- **daily_digest_time**: `{ "hour": 9 }` — 9:00 UTC daily digest to Slack

## Security notes

- Device tokens are stored as SHA-256 hashes; the raw token is only returned at enroll.
- Use `FLEETPULSE_ADMIN_SECRET` for `update-config`; keep it and the service role key out of the frontend.
- Dashboard uses Supabase anon key for read (and for resolve/update where allowed by RLS).
