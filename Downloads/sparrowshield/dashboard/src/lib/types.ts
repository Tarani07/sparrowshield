export interface CulpritApp {
  app_name: string;
  ram_mb: number;
  cpu_pct: number;
  impact: "high" | "medium" | "low";
  recommendation: string;
}

export interface MetricsSnapshot {
  cpu_pct: number | null;
  ram_pct: number | null;
  disk_pct: number | null;
  battery_health_pct: number | null;
}

export interface HealthReport {
  id: string;
  device_id: string;
  health_status: "healthy" | "warning" | "critical";
  health_score: number;
  summary: string;
  culprit_apps: CulpritApp[];
  metrics_snapshot: MetricsSnapshot;
  generated_at: string;
  devices?: {
    hostname: string;
    os_type: string;
    assigned_user: string | null;
    status: string;
    last_seen: string | null;
    cpu_model: string | null;
    cpu_cores: number | null;
    ram_total_gb: number | null;
  };
}

export interface UsbDevice {
  name: string;
  vendor: string;
  product_id: string;
  vendor_id: string;
  serial: string;
  type: "storage" | "peripheral";
}

export interface InstalledApp {
  name: string;
  version: string;
  last_modified: string;
}

export interface BluetoothDevice {
  name: string;
  address: string;
  type: string;
  battery_pct: number | null;
  connected: boolean;
}

export interface DisplayInfo {
  name: string;
  resolution: string;
  gpu: string;
}

export interface ListeningPort {
  port: number;
  process: string;
  protocol: "tcp" | "udp";
}

export interface UserSession {
  username: string;
  terminal: string;
  host: string;
  login_time: string;
}

export interface StorageVolume {
  name: string;
  mount_point: string;
  total_gb: number;
  used_gb: number;
  free_gb: number;
  percent: number;
  fs_type: string;
}

export interface LoginEvent {
  username: string;
  terminal: string;
  time: string;
  type: "login" | "logout" | "reboot";
}

export interface InstalledBrowser {
  name: string;
  version: string | null;
  engine: string;
  is_default: boolean;
  profiles: number;
  path: string;
}

export interface Device {
  id: string;
  hostname: string;
  serial_number: string;
  os_type: string;
  os_version: string | null;
  assigned_user: string | null;
  department: string | null;
  enrolled_at: string;
  last_seen: string | null;
  status: string;
  cpu_model: string | null;
  cpu_cores: number | null;
  ram_total_gb: number | null;

  // Battery
  battery_pct: number | null;
  battery_cycles: number | null;
  battery_health: string | null;
  is_charging: boolean | null;

  // Network
  wifi_ssid: string | null;
  wifi_rssi: number | null;
  net_upload_mb: number | null;
  net_download_mb: number | null;

  // Security
  filevault_enabled: boolean | null;
  firewall_enabled: boolean | null;
  sip_enabled: boolean | null;
  gatekeeper_enabled: boolean | null;

  // Compliance
  mdm_enrolled: boolean | null;
  antivirus_installed: string | null;

  // USB + Apps
  usb_devices: UsbDevice[] | null;
  installed_apps: InstalledApp[] | null;

  // Crash logs
  crash_count_24h: number | null;
  last_crashed_app: string | null;

  // Login / session
  active_user: string | null;
  remote_session_active: boolean | null;

  // Location
  public_ip: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  isp: string | null;

  // Extended Monitoring
  uptime_seconds: number | null;
  last_reboot: string | null;
  swap_used_mb: number | null;
  swap_total_mb: number | null;
  memory_pressure: "normal" | "warning" | "critical" | null;
  thermal_state: "nominal" | "fair" | "serious" | "critical" | null;
  disk_read_mb: number | null;
  disk_write_mb: number | null;
  fan_speed_rpm: number | null;
  storage_volumes: StorageVolume[] | null;
  open_connections_count: number | null;
  listening_ports: ListeningPort[] | null;
  user_sessions: UserSession[] | null;
  login_history: LoginEvent[] | null;
  pending_updates: string[] | null;
  pending_update_count: number | null;
  bluetooth_devices: BluetoothDevice[] | null;
  connected_displays: DisplayInfo[] | null;
  timemachine_enabled: boolean | null;
  timemachine_last_backup: string | null;
  third_party_kexts: string[] | null;
  login_items: string[] | null;
  login_item_count: number | null;
  dns_servers: string[] | null;
  proxy_configured: boolean | null;
  screen_lock_enabled: boolean | null;
  screen_lock_delay_sec: number | null;
  printers: string[] | null;

  // Browsers
  installed_browsers: InstalledBrowser[] | null;

  // Top processes
  top_processes: { process_name: string; cpu_pct: number; ram_mb: number }[] | null;

  // Windows-specific
  windows_defender_enabled: boolean | null;
  domain_joined: boolean | null;
  domain_name: string | null;
  activation_status: string | null;
}

// Remediation
export interface RemediationRule {
  id: string;
  name: string;
  enabled: boolean;
  metric: string;
  operator: string;
  threshold: number;
  consecutive_beats: number;
  action_type: string;
  action_payload: Record<string, unknown>;
  scope: string;
  scope_value: string | null;
  cooldown_minutes: number;
  created_at: string;
  updated_at: string;
}

export interface RemediationLogEntry {
  id: string;
  rule_id: string;
  device_id: string;
  command_id: string | null;
  triggered_at: string;
  metric_value: number;
  action_type: string;
  status: string;
  remediation_rules?: { name: string };
  devices?: { hostname: string };
}

// Compliance
export interface ComplianceFramework {
  id: string;
  name: string;
  enabled: boolean;
}

export interface ComplianceControl {
  id: string;
  framework_id: string;
  control_id: string;
  control_name: string;
  description: string | null;
  field_checks: { field: string; expect: unknown; operator?: string; max_age_hours?: number }[];
  severity: string;
}

export interface ComplianceSnapshot {
  id: string;
  device_id: string;
  framework: string;
  score: number;
  pass_count: number;
  fail_count: number;
  details: { control_id: string; pass: boolean; field_values: Record<string, unknown> }[];
  snapshot_at: string;
  devices?: { hostname: string };
}

// Software Lists
export interface SoftwareListEntry {
  id: string;
  list_type: "allowlist" | "blocklist";
  app_name: string;
  app_pattern: string | null;
  reason: string | null;
  added_by: string | null;
  created_at: string;
}

export interface SoftwareViolation {
  id: string;
  device_id: string;
  app_name: string;
  app_version: string | null;
  violation_type: string;
  detected_at: string;
  resolved: boolean;
  devices?: { hostname: string };
}

// Software Catalog / Deployment
export interface SoftwareCatalogEntry {
  id: string;
  name: string;
  bundle_id: string | null;
  install_method: string;
  install_command: string | null;
  uninstall_command: string | null;
  version: string | null;
  category: string;
  icon_url: string | null;
  platform: string;
}

export interface DeploymentTask {
  id: string;
  device_id: string;
  software_id: string | null;
  software_name: string;
  action: "install" | "uninstall";
  method: string;
  status: string;
  result: string | null;
  initiated_by: string;
  created_at: string;
  completed_at: string | null;
}

// Patch Management
export interface PatchHistoryEntry {
  id: string;
  device_id: string;
  command_id: string | null;
  updates_installed: string[] | null;
  updates_attempted: number | null;
  updates_succeeded: number | null;
  initiated_by: string;
  started_at: string;
  completed_at: string | null;
  status: string;
  devices?: { hostname: string };
}

export interface Alert {
  id: string;
  device_id: string;
  alert_type: string;
  severity: string;
  message: string;
  resolved: boolean;
  created_at: string;
  resolved_at: string | null;
  devices?: { hostname: string };
}

export interface MetricRow {
  timestamp: string;
  cpu_pct: number | null;
  ram_pct: number | null;
  disk_pct: number | null;
  battery_health_pct: number | null;
}
