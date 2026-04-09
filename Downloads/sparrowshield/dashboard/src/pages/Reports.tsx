import { useState } from "react";
import {
  FileText,
  Download,
  Laptop,
  Shield,
  Activity,
  AlertTriangle,
  Package,
  MapPin,
  Zap,
  Battery,
  Wifi,
  HardDrive,
  Clock,
  CheckCircle2,
  Loader2,
  Thermometer,
  Bluetooth,
  Monitor,
  Play,
  Users,
  Globe,
  Lock,
  Printer,
  ShieldAlert,
} from "lucide-react";
import TopBar from "../components/layout/TopBar";
import { useAllDevices } from "../hooks/useDevices";
import { useAlerts } from "../hooks/useAlerts";
import { useFleetReports } from "../hooks/useHealthReports";
import { cn } from "../lib/utils";
import type { Device, Alert, HealthReport } from "../lib/types";

/* ─── CSV helper ─── */
function downloadCSV(filename: string, headers: string[], rows: string[][]) {
  const escape = (v: string) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [headers.map(escape).join(","), ...rows.map((r) => r.map(escape).join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/* ─── Report definitions ─── */
interface ReportDef {
  id: string;
  label: string;
  description: string;
  icon: React.ElementType;
  color: string;
  category: "fleet" | "security" | "performance" | "inventory";
}

const REPORTS: ReportDef[] = [
  // Fleet
  {
    id: "fleet-inventory",
    label: "Fleet Inventory",
    description: "All devices with hostname, serial, OS, model, RAM, user, status, last seen",
    icon: Laptop,
    color: "indigo",
    category: "fleet",
  },
  {
    id: "device-health",
    label: "Device Health Summary",
    description: "Health scores, status, AI diagnosis summary per device",
    icon: Activity,
    color: "emerald",
    category: "fleet",
  },
  {
    id: "device-location",
    label: "Device Location",
    description: "City, region, country, IP, ISP, coordinates for all devices",
    icon: MapPin,
    color: "cyan",
    category: "fleet",
  },

  // Security
  {
    id: "security-compliance",
    label: "Security & Compliance",
    description: "FileVault, Firewall, SIP, Gatekeeper, MDM, Antivirus status per device",
    icon: Shield,
    color: "amber",
    category: "security",
  },
  {
    id: "alerts-active",
    label: "Active Alerts",
    description: "All unresolved alerts with severity, type, device, and timestamp",
    icon: AlertTriangle,
    color: "red",
    category: "security",
  },
  {
    id: "alerts-history",
    label: "Alert History (All)",
    description: "Complete alert history including resolved alerts",
    icon: Clock,
    color: "orange",
    category: "security",
  },

  // Performance
  {
    id: "battery-report",
    label: "Battery Health",
    description: "Battery %, cycle count, health status, charging state per device",
    icon: Battery,
    color: "green",
    category: "performance",
  },
  {
    id: "network-report",
    label: "Network Status",
    description: "WiFi SSID, signal strength, upload/download throughput",
    icon: Wifi,
    color: "blue",
    category: "performance",
  },
  {
    id: "culprit-apps",
    label: "High-Impact Apps",
    description: "Top resource-hungry apps flagged by AI across all devices",
    icon: Zap,
    color: "rose",
    category: "performance",
  },

  // Inventory
  {
    id: "installed-apps",
    label: "Installed Applications",
    description: "All apps with version numbers per device",
    icon: Package,
    color: "violet",
    category: "inventory",
  },
  {
    id: "disk-usage",
    label: "Disk Usage",
    description: "Disk usage %, crash count, last crashed app per device",
    icon: HardDrive,
    color: "teal",
    category: "inventory",
  },

  // Extended Monitoring
  {
    id: "system-info",
    label: "System & Thermal",
    description: "Uptime, last reboot, thermal state, fan speed, memory pressure per device",
    icon: Thermometer,
    color: "orange",
    category: "performance",
  },
  {
    id: "storage-volumes",
    label: "Storage Volumes",
    description: "All mounted volumes with capacity, usage, filesystem type, Time Machine status",
    icon: HardDrive,
    color: "cyan",
    category: "inventory",
  },
  {
    id: "network-connections",
    label: "Network Connections",
    description: "Listening ports, open connections, DNS servers, proxy config per device",
    icon: Globe,
    color: "blue",
    category: "security",
  },
  {
    id: "startup-items",
    label: "Startup & Kernel Extensions",
    description: "Login items, LaunchAgents/Daemons, third-party kexts per device",
    icon: Play,
    color: "amber",
    category: "security",
  },
  {
    id: "peripherals",
    label: "Peripherals & Displays",
    description: "Bluetooth devices, connected monitors, printers per device",
    icon: Bluetooth,
    color: "violet",
    category: "inventory",
  },
  {
    id: "user-sessions",
    label: "User Sessions & Login History",
    description: "Active sessions, login/logout events, screen lock status per device",
    icon: Users,
    color: "indigo",
    category: "security",
  },
  {
    id: "software-updates",
    label: "Pending Software Updates",
    description: "Outstanding macOS and app updates per device — patch compliance",
    icon: Download,
    color: "red",
    category: "security",
  },
  {
    id: "installed-browsers",
    label: "Installed Browsers",
    description: "All browsers with version, engine, default status, profile count per device",
    icon: Globe,
    color: "cyan",
    category: "inventory",
  },
  {
    id: "software-violations",
    label: "Software Violations",
    description: "Blocklist/allowlist violations detected across fleet devices",
    icon: ShieldAlert,
    color: "red",
    category: "security",
  },
  {
    id: "software-deployments",
    label: "Software Deployments",
    description: "Install/uninstall deployment history across all devices",
    icon: Package,
    color: "violet",
    category: "inventory",
  },
  {
    id: "patch-compliance",
    label: "Patch Compliance",
    description: "Pending updates per device, patch installation history, compliance %",
    icon: Download,
    color: "green",
    category: "security",
  },
  {
    id: "remediation-history",
    label: "Remediation History",
    description: "Auto-remediation actions triggered by rules across all devices",
    icon: Zap,
    color: "amber",
    category: "security",
  },
  {
    id: "full-audit",
    label: "Full Fleet Audit",
    description: "Comprehensive audit: hardware, security, compliance, thermal, storage, network — all fields",
    icon: Shield,
    color: "rose",
    category: "fleet",
  },
];

const CATEGORIES = [
  { key: "all", label: "All Reports" },
  { key: "fleet", label: "Fleet" },
  { key: "security", label: "Security" },
  { key: "performance", label: "Performance" },
  { key: "inventory", label: "Inventory" },
];

const COLOR_MAP: Record<string, { bg: string; border: string; text: string; icon: string; hover: string }> = {
  indigo:  { bg: "bg-indigo-500/10",  border: "border-indigo-500/20",  text: "text-indigo-400",  icon: "bg-indigo-500/20",  hover: "hover:border-indigo-500/40" },
  emerald: { bg: "bg-emerald-500/10", border: "border-emerald-500/20", text: "text-emerald-400", icon: "bg-emerald-500/20", hover: "hover:border-emerald-500/40" },
  cyan:    { bg: "bg-cyan-500/10",    border: "border-cyan-500/20",    text: "text-cyan-400",    icon: "bg-cyan-500/20",    hover: "hover:border-cyan-500/40" },
  amber:   { bg: "bg-amber-500/10",   border: "border-amber-500/20",   text: "text-amber-400",   icon: "bg-amber-500/20",   hover: "hover:border-amber-500/40" },
  red:     { bg: "bg-red-500/10",     border: "border-red-500/20",     text: "text-red-400",     icon: "bg-red-500/20",     hover: "hover:border-red-500/40" },
  orange:  { bg: "bg-orange-500/10",  border: "border-orange-500/20",  text: "text-orange-400",  icon: "bg-orange-500/20",  hover: "hover:border-orange-500/40" },
  green:   { bg: "bg-green-500/10",   border: "border-green-500/20",   text: "text-green-400",   icon: "bg-green-500/20",   hover: "hover:border-green-500/40" },
  blue:    { bg: "bg-blue-500/10",    border: "border-blue-500/20",    text: "text-blue-400",    icon: "bg-blue-500/20",    hover: "hover:border-blue-500/40" },
  rose:    { bg: "bg-rose-500/10",    border: "border-rose-500/20",    text: "text-rose-400",    icon: "bg-rose-500/20",    hover: "hover:border-rose-500/40" },
  violet:  { bg: "bg-violet-500/10",  border: "border-violet-500/20",  text: "text-violet-400",  icon: "bg-violet-500/20",  hover: "hover:border-violet-500/40" },
  teal:    { bg: "bg-teal-500/10",    border: "border-teal-500/20",    text: "text-teal-400",    icon: "bg-teal-500/20",    hover: "hover:border-teal-500/40" },
};

/* ─── CSV generators ─── */
function generateFleetInventory(devices: Device[]) {
  const headers = ["Hostname", "Serial Number", "OS Type", "OS Version", "CPU Model", "CPU Cores", "RAM (GB)", "Assigned User", "Department", "Status", "Enrolled At", "Last Seen"];
  const rows = devices.map((d) => [
    d.hostname, d.serial_number, d.os_type, d.os_version ?? "", d.cpu_model ?? "", String(d.cpu_cores ?? ""), String(d.ram_total_gb ?? ""),
    d.assigned_user ?? "", d.department ?? "", d.status, d.enrolled_at, d.last_seen ?? "",
  ]);
  downloadCSV(`fleet-inventory-${today()}.csv`, headers, rows);
}

function generateDeviceHealth(devices: Device[], reports: HealthReport[]) {
  const headers = ["Hostname", "Status", "Health Score", "Health Status", "CPU %", "RAM %", "Disk %", "Battery %", "AI Summary", "Report Time"];
  const reportMap = new Map(reports.map((r) => [r.device_id, r]));
  const rows = devices.map((d) => {
    const r = reportMap.get(d.id);
    return [
      d.hostname, d.status, String(r?.health_score ?? ""), r?.health_status ?? "",
      String(r?.metrics_snapshot?.cpu_pct ?? ""), String(r?.metrics_snapshot?.ram_pct ?? ""),
      String(r?.metrics_snapshot?.disk_pct ?? ""), String(r?.metrics_snapshot?.battery_health_pct ?? ""),
      r?.summary ?? "", r?.generated_at ?? "",
    ];
  });
  downloadCSV(`device-health-${today()}.csv`, headers, rows);
}

function generateDeviceLocation(devices: Device[]) {
  const headers = ["Hostname", "City", "Region", "Country", "Public IP", "ISP", "Latitude", "Longitude"];
  const rows = devices.map((d) => [
    d.hostname, d.city ?? "", d.region ?? "", d.country ?? "", d.public_ip ?? "", d.isp ?? "",
    String(d.latitude ?? ""), String(d.longitude ?? ""),
  ]);
  downloadCSV(`device-location-${today()}.csv`, headers, rows);
}

function generateSecurityCompliance(devices: Device[]) {
  const headers = ["Hostname", "FileVault", "Firewall", "SIP", "Gatekeeper", "MDM Enrolled", "Antivirus", "Status"];
  const rows = devices.map((d) => [
    d.hostname, yn(d.filevault_enabled), yn(d.firewall_enabled), yn(d.sip_enabled), yn(d.gatekeeper_enabled),
    yn(d.mdm_enrolled), d.antivirus_installed ?? "None", d.status,
  ]);
  downloadCSV(`security-compliance-${today()}.csv`, headers, rows);
}

function generateAlerts(alerts: Alert[], filename: string) {
  const headers = ["Device", "Alert Type", "Severity", "Message", "Resolved", "Created At", "Resolved At"];
  const rows = alerts.map((a) => [
    a.devices?.hostname ?? a.device_id, a.alert_type, a.severity, a.message,
    a.resolved ? "Yes" : "No", a.created_at, a.resolved_at ?? "",
  ]);
  downloadCSV(`${filename}-${today()}.csv`, headers, rows);
}

function generateBatteryReport(devices: Device[]) {
  const headers = ["Hostname", "Battery %", "Cycle Count", "Health", "Charging", "Status"];
  const rows = devices.map((d) => [
    d.hostname, String(d.battery_pct ?? ""), String(d.battery_cycles ?? ""), d.battery_health ?? "",
    d.is_charging ? "Yes" : "No", d.status,
  ]);
  downloadCSV(`battery-health-${today()}.csv`, headers, rows);
}

function generateNetworkReport(devices: Device[]) {
  const headers = ["Hostname", "WiFi SSID", "Signal (RSSI)", "Upload (MB)", "Download (MB)", "Public IP", "ISP"];
  const rows = devices.map((d) => [
    d.hostname, d.wifi_ssid ?? "", String(d.wifi_rssi ?? ""), String(d.net_upload_mb ?? ""),
    String(d.net_download_mb ?? ""), d.public_ip ?? "", d.isp ?? "",
  ]);
  downloadCSV(`network-status-${today()}.csv`, headers, rows);
}

function generateCulpritApps(reports: HealthReport[]) {
  const headers = ["Device", "App Name", "RAM (MB)", "CPU %", "Impact", "Recommendation", "Report Time"];
  const rows: string[][] = [];
  for (const r of reports) {
    const hostname = r.devices?.hostname ?? r.device_id;
    for (const app of r.culprit_apps ?? []) {
      rows.push([hostname, app.app_name, String(app.ram_mb), String(app.cpu_pct), app.impact, app.recommendation, r.generated_at]);
    }
  }
  downloadCSV(`culprit-apps-${today()}.csv`, headers, rows);
}

function generateInstalledApps(devices: Device[]) {
  const headers = ["Device", "App Name", "Version", "Last Modified"];
  const rows: string[][] = [];
  for (const d of devices) {
    for (const app of d.installed_apps ?? []) {
      rows.push([d.hostname, app.name, app.version, app.last_modified ?? ""]);
    }
  }
  downloadCSV(`installed-apps-${today()}.csv`, headers, rows);
}

function generateDiskUsage(devices: Device[], reports: HealthReport[]) {
  const headers = ["Hostname", "Disk %", "Crash Count (24h)", "Last Crashed App", "Status"];
  const reportMap = new Map(reports.map((r) => [r.device_id, r]));
  const rows = devices.map((d) => {
    const r = reportMap.get(d.id);
    return [d.hostname, String(r?.metrics_snapshot?.disk_pct ?? ""), String(d.crash_count_24h ?? "0"), d.last_crashed_app ?? "", d.status];
  });
  downloadCSV(`disk-usage-${today()}.csv`, headers, rows);
}

/* ─── New CSV generators (Extended Monitoring) ─── */
function generateSystemInfo(devices: Device[]) {
  const headers = ["Hostname", "Uptime (hours)", "Last Reboot", "Thermal State", "Fan Speed (RPM)", "Memory Pressure", "Swap Used (MB)", "Swap Total (MB)"];
  const rows = devices.map((d) => [
    d.hostname, d.uptime_seconds ? String(Math.round(d.uptime_seconds / 3600)) : "",
    d.last_reboot ?? "", d.thermal_state ?? "", String(d.fan_speed_rpm ?? ""),
    d.memory_pressure ?? "", String(d.swap_used_mb ?? ""), String(d.swap_total_mb ?? ""),
  ]);
  downloadCSV(`system-thermal-${today()}.csv`, headers, rows);
}

function generateStorageVolumes(devices: Device[]) {
  const headers = ["Device", "Volume", "Mount Point", "Total (GB)", "Used (GB)", "Free (GB)", "Usage %", "FS Type", "Time Machine", "Last Backup"];
  const rows: string[][] = [];
  for (const d of devices) {
    for (const v of d.storage_volumes ?? []) {
      rows.push([d.hostname, v.name, v.mount_point, String(v.total_gb), String(v.used_gb), String(v.free_gb), String(v.percent), v.fs_type,
        yn(d.timemachine_enabled), d.timemachine_last_backup ?? ""]);
    }
    if (!(d.storage_volumes ?? []).length) {
      rows.push([d.hostname, "", "", "", "", "", "", "", yn(d.timemachine_enabled), d.timemachine_last_backup ?? ""]);
    }
  }
  downloadCSV(`storage-volumes-${today()}.csv`, headers, rows);
}

function generateNetworkConnections(devices: Device[]) {
  const headers = ["Device", "Open Connections", "Listening Ports", "DNS Servers", "Proxy Configured"];
  const rows = devices.map((d) => [
    d.hostname, String(d.open_connections_count ?? ""),
    (d.listening_ports ?? []).map((p) => `${p.port}/${p.process}`).join("; "),
    (d.dns_servers ?? []).join(", "), yn(d.proxy_configured),
  ]);
  downloadCSV(`network-connections-${today()}.csv`, headers, rows);
}

function generateStartupItems(devices: Device[]) {
  const headers = ["Device", "Login Items", "Login Item Count", "Third-Party Kexts"];
  const rows = devices.map((d) => [
    d.hostname, (d.login_items ?? []).join(", "), String(d.login_item_count ?? ""),
    (d.third_party_kexts ?? []).join(", "),
  ]);
  downloadCSV(`startup-items-${today()}.csv`, headers, rows);
}

function generatePeripherals(devices: Device[]) {
  const headers = ["Device", "Bluetooth Devices", "Connected Displays", "Printers"];
  const rows = devices.map((d) => [
    d.hostname,
    (d.bluetooth_devices ?? []).map((b) => `${b.name} (${b.type})`).join(", "),
    (d.connected_displays ?? []).map((m) => `${m.name} ${m.resolution}`).join(", "),
    (d.printers ?? []).join(", "),
  ]);
  downloadCSV(`peripherals-${today()}.csv`, headers, rows);
}

function generateUserSessions(devices: Device[]) {
  const headers = ["Device", "Username", "Terminal", "Host", "Login Time", "Screen Lock", "Lock Delay (sec)"];
  const rows: string[][] = [];
  for (const d of devices) {
    for (const s of d.user_sessions ?? []) {
      rows.push([d.hostname, s.username, s.terminal, s.host, s.login_time, yn(d.screen_lock_enabled), String(d.screen_lock_delay_sec ?? "")]);
    }
    if (!(d.user_sessions ?? []).length) {
      rows.push([d.hostname, d.active_user ?? "", "console", "local", "", yn(d.screen_lock_enabled), String(d.screen_lock_delay_sec ?? "")]);
    }
  }
  downloadCSV(`user-sessions-${today()}.csv`, headers, rows);
}

function generateSoftwareUpdates(devices: Device[]) {
  const headers = ["Device", "Pending Update Count", "Pending Updates"];
  const rows = devices.map((d) => [
    d.hostname, String(d.pending_update_count ?? "0"), (d.pending_updates ?? []).join(", "),
  ]);
  downloadCSV(`software-updates-${today()}.csv`, headers, rows);
}

async function generateSoftwareViolations() {
  const { data } = await (await import("../lib/supabase")).supabase
    .from("software_violations")
    .select("*, devices(hostname)")
    .order("detected_at", { ascending: false })
    .limit(500);
  if (!data?.length) { alert("No violations found"); return; }
  const headers = ["Device", "App", "Version", "Violation Type", "Detected", "Resolved"];
  const rows = data.map((v: Record<string, unknown>) => [
    (v.devices as Record<string, string>)?.hostname ?? String(v.device_id),
    String(v.app_name ?? ""), String(v.app_version ?? ""), String(v.violation_type ?? ""),
    String(v.detected_at ?? ""), v.resolved ? "Yes" : "No",
  ]);
  downloadCSV(`software-violations-${today()}.csv`, headers, rows);
}

async function generateSoftwareDeployments() {
  const { data } = await (await import("../lib/supabase")).supabase
    .from("deployment_tasks")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);
  if (!data?.length) { alert("No deployment history"); return; }
  const headers = ["Software", "Action", "Method", "Status", "Result", "Initiated By", "Created", "Completed"];
  const rows = data.map((d: Record<string, unknown>) => [
    String(d.software_name ?? ""), String(d.action ?? ""), String(d.method ?? ""),
    String(d.status ?? ""), String(d.result ?? ""), String(d.initiated_by ?? ""),
    String(d.created_at ?? ""), String(d.completed_at ?? ""),
  ]);
  downloadCSV(`software-deployments-${today()}.csv`, headers, rows);
}

function generatePatchCompliance(devices: Device[]) {
  const headers = ["Hostname", "Pending Update Count", "Pending Updates", "Status"];
  const rows = devices.map((d) => [
    d.hostname, String(d.pending_update_count ?? "0"),
    (d.pending_updates ?? []).join(", "), d.status,
  ]);
  downloadCSV(`patch-compliance-${today()}.csv`, headers, rows);
}

async function generateRemediationHistory() {
  const { data } = await (await import("../lib/supabase")).supabase
    .from("remediation_log")
    .select("*, remediation_rules(name), devices(hostname)")
    .order("triggered_at", { ascending: false })
    .limit(500);
  if (!data?.length) { alert("No remediation history"); return; }
  const headers = ["Device", "Rule", "Action", "Metric Value", "Status", "Triggered At"];
  const rows = data.map((r: Record<string, unknown>) => [
    (r.devices as Record<string, string>)?.hostname ?? String(r.device_id),
    (r.remediation_rules as Record<string, string>)?.name ?? String(r.rule_id),
    String(r.action_type ?? ""), String(r.metric_value ?? ""),
    String(r.status ?? ""), String(r.triggered_at ?? ""),
  ]);
  downloadCSV(`remediation-history-${today()}.csv`, headers, rows);
}

function generateInstalledBrowsers(devices: Device[]) {
  const headers = ["Device", "Browser", "Version", "Engine", "Default", "Profiles", "Path"];
  const rows: string[][] = [];
  for (const d of devices) {
    for (const b of d.installed_browsers ?? []) {
      rows.push([d.hostname, b.name, b.version ?? "", b.engine, b.is_default ? "Yes" : "No", String(b.profiles), b.path]);
    }
  }
  downloadCSV(`installed-browsers-${today()}.csv`, headers, rows);
}

function generateFullAudit(devices: Device[]) {
  const headers = [
    "Hostname", "Serial", "OS", "CPU", "RAM (GB)", "Status", "User",
    "FileVault", "Firewall", "SIP", "Gatekeeper", "MDM", "Antivirus", "Screen Lock",
    "Thermal", "Memory Pressure", "Fan RPM", "Uptime (h)", "Battery %", "Battery Health",
    "WiFi SSID", "RSSI", "Open Conns", "DNS Servers", "Proxy",
    "Pending Updates", "Login Items", "Kexts", "Printers", "Bluetooth", "Displays",
    "Time Machine", "Last Backup", "City", "Country", "Browsers",
  ];
  const rows = devices.map((d) => [
    d.hostname, d.serial_number, `${d.os_type} ${d.os_version ?? ""}`, d.cpu_model ?? "", String(d.ram_total_gb ?? ""), d.status, d.assigned_user ?? "",
    yn(d.filevault_enabled), yn(d.firewall_enabled), yn(d.sip_enabled), yn(d.gatekeeper_enabled), yn(d.mdm_enrolled), d.antivirus_installed ?? "None", yn(d.screen_lock_enabled),
    d.thermal_state ?? "", d.memory_pressure ?? "", String(d.fan_speed_rpm ?? ""), d.uptime_seconds ? String(Math.round(d.uptime_seconds / 3600)) : "", String(d.battery_pct ?? ""), d.battery_health ?? "",
    d.wifi_ssid ?? "", String(d.wifi_rssi ?? ""), String(d.open_connections_count ?? ""), (d.dns_servers ?? []).join(", "), yn(d.proxy_configured),
    String(d.pending_update_count ?? "0"), String(d.login_item_count ?? ""), (d.third_party_kexts ?? []).join(", "), (d.printers ?? []).join(", "),
    (d.bluetooth_devices ?? []).map((b) => b.name).join(", "), (d.connected_displays ?? []).map((m) => m.name).join(", "),
    yn(d.timemachine_enabled), d.timemachine_last_backup ?? "", d.city ?? "", d.country ?? "",
    (d.installed_browsers ?? []).map((b) => `${b.name} ${b.version ?? ""}`).join(", "),
  ]);
  downloadCSV(`full-fleet-audit-${today()}.csv`, headers, rows);
}

/* Helpers */
function today() { return new Date().toISOString().slice(0, 10); }
function yn(v: boolean | null) { return v === true ? "Yes" : v === false ? "No" : "Unknown"; }

/* ─── Component ─── */
export default function Reports() {
  const [filter, setFilter] = useState("all");
  const [downloading, setDownloading] = useState<string | null>(null);

  const { data: devices = [] } = useAllDevices();
  const { data: activeAlerts = [] } = useAlerts(undefined, false);
  const { data: allAlerts = [] } = useAlerts(undefined, true);
  const { data: reports = [] } = useFleetReports();

  const combinedAlerts = [...activeAlerts, ...allAlerts];
  const filtered = filter === "all" ? REPORTS : REPORTS.filter((r) => r.category === filter);

  const handleDownload = async (reportId: string) => {
    setDownloading(reportId);
    // Small delay so the user sees the animation
    await new Promise((r) => setTimeout(r, 300));

    switch (reportId) {
      case "fleet-inventory":      generateFleetInventory(devices); break;
      case "device-health":        generateDeviceHealth(devices, reports); break;
      case "device-location":      generateDeviceLocation(devices); break;
      case "security-compliance":  generateSecurityCompliance(devices); break;
      case "alerts-active":        generateAlerts(activeAlerts, "active-alerts"); break;
      case "alerts-history":       generateAlerts(combinedAlerts, "all-alerts"); break;
      case "battery-report":       generateBatteryReport(devices); break;
      case "network-report":       generateNetworkReport(devices); break;
      case "culprit-apps":         generateCulpritApps(reports); break;
      case "installed-apps":       generateInstalledApps(devices); break;
      case "disk-usage":           generateDiskUsage(devices, reports); break;
      case "system-info":          generateSystemInfo(devices); break;
      case "storage-volumes":      generateStorageVolumes(devices); break;
      case "network-connections":  generateNetworkConnections(devices); break;
      case "startup-items":        generateStartupItems(devices); break;
      case "peripherals":          generatePeripherals(devices); break;
      case "user-sessions":        generateUserSessions(devices); break;
      case "software-updates":     generateSoftwareUpdates(devices); break;
      case "installed-browsers":   generateInstalledBrowsers(devices); break;
      case "software-violations":  await generateSoftwareViolations(); break;
      case "software-deployments": await generateSoftwareDeployments(); break;
      case "patch-compliance":     generatePatchCompliance(devices); break;
      case "remediation-history":  await generateRemediationHistory(); break;
      case "full-audit":           generateFullAudit(devices); break;
    }

    setTimeout(() => setDownloading(null), 1200);
  };

  const stats = {
    devices: devices.length,
    alerts: activeAlerts.length,
    reports: reports.length,
  };

  return (
    <div className="flex flex-col h-full">
      <TopBar title="Reports" />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-xl font-bold text-white">Reports & Downloads</h1>
          <p className="text-sm text-slate-400 mt-1">
            Download fleet reports as CSV. Data refreshes every 30 seconds.
          </p>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-500/20 flex items-center justify-center">
              <Laptop className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <p className="text-lg font-bold text-white">{stats.devices}</p>
              <p className="text-[11px] text-slate-500">Enrolled Devices</p>
            </div>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <p className="text-lg font-bold text-white">{stats.alerts}</p>
              <p className="text-[11px] text-slate-500">Active Alerts</p>
            </div>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
              <Activity className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <p className="text-lg font-bold text-white">{stats.reports}</p>
              <p className="text-[11px] text-slate-500">Health Reports</p>
            </div>
          </div>
        </div>

        {/* Category filter */}
        <div className="flex items-center gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c.key}
              onClick={() => setFilter(c.key)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-all border",
                filter === c.key
                  ? "bg-indigo-600/20 text-indigo-400 border-indigo-600/30"
                  : "bg-slate-800/50 text-slate-400 border-slate-700 hover:text-slate-200 hover:bg-slate-800"
              )}
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* Report cards grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((report) => {
            const colors = COLOR_MAP[report.color];
            const Icon = report.icon;
            const isDownloading = downloading === report.id;
            const isDone = downloading === null && false; // reset after anim

            return (
              <div
                key={report.id}
                className={cn(
                  "bg-slate-900 border rounded-xl p-5 transition-all group",
                  colors.border,
                  colors.hover
                )}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", colors.icon)}>
                    <Icon className={cn("w-5 h-5", colors.text)} />
                  </div>
                  <span className={cn("text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border", colors.bg, colors.border, colors.text)}>
                    {report.category}
                  </span>
                </div>

                <h3 className="text-sm font-semibold text-white mb-1">{report.label}</h3>
                <p className="text-xs text-slate-500 leading-relaxed mb-4">{report.description}</p>

                <button
                  onClick={() => handleDownload(report.id)}
                  disabled={isDownloading}
                  className={cn(
                    "w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold transition-all border",
                    isDownloading
                      ? "bg-emerald-500/20 border-emerald-500/30 text-emerald-400"
                      : cn(colors.bg, colors.border, colors.text, "hover:opacity-80")
                  )}
                >
                  {isDownloading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Download className="w-3.5 h-3.5" />
                      Download CSV
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>

        {/* Download All */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <FileText className="w-4 h-4 text-indigo-400" />
                Download All Reports
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Generate all {REPORTS.length} reports at once as separate CSV files
              </p>
            </div>
            <button
              onClick={async () => {
                for (const r of REPORTS) {
                  await handleDownload(r.id);
                  await new Promise((res) => setTimeout(res, 200));
                }
              }}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-xs font-semibold hover:from-indigo-500 hover:to-purple-500 transition-all shadow-lg shadow-indigo-500/20"
            >
              <Download className="w-4 h-4" />
              Download All ({REPORTS.length} Reports)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
