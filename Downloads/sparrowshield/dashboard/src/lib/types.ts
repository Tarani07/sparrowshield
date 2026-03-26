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
