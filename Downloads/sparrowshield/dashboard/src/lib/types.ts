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
