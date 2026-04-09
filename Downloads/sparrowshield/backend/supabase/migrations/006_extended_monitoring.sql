-- Migration 006: Extended Monitoring Columns
-- Adds 25+ new monitoring fields to the devices table

-- System Info
ALTER TABLE devices ADD COLUMN IF NOT EXISTS uptime_seconds int;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS last_reboot timestamptz;

-- Memory Pressure
ALTER TABLE devices ADD COLUMN IF NOT EXISTS swap_used_mb float;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS swap_total_mb float;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS memory_pressure text;

-- Thermal & Fan
ALTER TABLE devices ADD COLUMN IF NOT EXISTS thermal_state text;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS fan_speed_rpm int;

-- Disk I/O
ALTER TABLE devices ADD COLUMN IF NOT EXISTS disk_read_mb float;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS disk_write_mb float;

-- Storage Volumes
ALTER TABLE devices ADD COLUMN IF NOT EXISTS storage_volumes jsonb DEFAULT '[]';

-- Network Connections
ALTER TABLE devices ADD COLUMN IF NOT EXISTS open_connections_count int;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS listening_ports jsonb DEFAULT '[]';

-- User Sessions
ALTER TABLE devices ADD COLUMN IF NOT EXISTS user_sessions jsonb DEFAULT '[]';
ALTER TABLE devices ADD COLUMN IF NOT EXISTS login_history jsonb DEFAULT '[]';

-- Software Updates
ALTER TABLE devices ADD COLUMN IF NOT EXISTS pending_updates jsonb DEFAULT '[]';
ALTER TABLE devices ADD COLUMN IF NOT EXISTS pending_update_count int;

-- Bluetooth Devices
ALTER TABLE devices ADD COLUMN IF NOT EXISTS bluetooth_devices jsonb DEFAULT '[]';

-- Connected Displays
ALTER TABLE devices ADD COLUMN IF NOT EXISTS connected_displays jsonb DEFAULT '[]';

-- Time Machine Backup
ALTER TABLE devices ADD COLUMN IF NOT EXISTS timemachine_enabled boolean;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS timemachine_last_backup timestamptz;

-- Startup / Kernel Extensions
ALTER TABLE devices ADD COLUMN IF NOT EXISTS login_items jsonb DEFAULT '[]';
ALTER TABLE devices ADD COLUMN IF NOT EXISTS login_item_count int;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS third_party_kexts jsonb DEFAULT '[]';

-- DNS & Proxy
ALTER TABLE devices ADD COLUMN IF NOT EXISTS dns_servers jsonb DEFAULT '[]';
ALTER TABLE devices ADD COLUMN IF NOT EXISTS proxy_configured boolean;

-- Screen Lock
ALTER TABLE devices ADD COLUMN IF NOT EXISTS screen_lock_enabled boolean;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS screen_lock_delay_sec int;

-- Printers
ALTER TABLE devices ADD COLUMN IF NOT EXISTS printers jsonb DEFAULT '[]';
