import { handleCors } from "../_shared/cors.ts";
import { success, failure } from "../_shared/response.ts";
import { getSupabase } from "../_shared/supabase.ts";
import { hashToken } from "../_shared/auth.ts";

interface HeartbeatBody {
  // Core metrics (existing)
  cpu_pct?: number;
  ram_pct?: number;
  ram_total_gb?: number;
  disk_pct?: number;
  disk_total_gb?: number;
  battery_health_pct?: number;
  battery_cycles?: number;
  uptime_seconds?: number;
  filevault_enabled?: boolean;
  bitlocker_enabled?: boolean;
  firewall_enabled?: boolean;

  // Battery (new)
  battery_pct?: number;
  battery_health?: string;
  is_charging?: boolean;

  // Network (new)
  wifi_ssid?: string;
  wifi_rssi?: number;
  net_upload_mb?: number;
  net_download_mb?: number;

  // Security (new)
  sip_enabled?: boolean;
  gatekeeper_enabled?: boolean;

  // Compliance (new)
  mdm_enrolled?: boolean;
  antivirus_installed?: string;

  // USB devices (new)
  usb_devices?: Record<string, unknown>[];

  // Installed apps (new)
  installed_apps?: Record<string, unknown>[];

  // Crash logs (new)
  crash_count_24h?: number;
  last_crashed_app?: string;

  // Login / session (new)
  active_user?: string;
  remote_session_active?: boolean;

  // Location
  public_ip?: string;
  city?: string;
  region?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  isp?: string;

  // Extended Monitoring
  last_reboot?: string;
  swap_used_mb?: number;
  swap_total_mb?: number;
  memory_pressure?: string;
  thermal_state?: string;
  disk_read_mb?: number;
  disk_write_mb?: number;
  fan_speed_rpm?: number;
  storage_volumes?: Record<string, unknown>[];
  open_connections_count?: number;
  listening_ports?: Record<string, unknown>[];
  user_sessions?: Record<string, unknown>[];
  login_history?: Record<string, unknown>[];
  pending_updates?: string[];
  pending_update_count?: number;
  bluetooth_devices?: Record<string, unknown>[];
  connected_displays?: Record<string, unknown>[];
  timemachine_enabled?: boolean;
  timemachine_last_backup?: string;
  third_party_kexts?: string[];
  login_items?: string[];
  login_item_count?: number;
  dns_servers?: string[];
  proxy_configured?: boolean;
  screen_lock_enabled?: boolean;
  screen_lock_delay_sec?: number;
  printers?: string[];
  installed_browsers?: Record<string, unknown>[];
  top_processes?: Record<string, unknown>[];

  // Windows-specific
  windows_defender_enabled?: boolean;
  domain_joined?: boolean;
  domain_name?: string;
  activation_status?: string;
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return failure("Method not allowed", 405);
  }

  const rawToken = req.headers.get("X-Device-Token")?.trim();
  if (!rawToken) {
    return failure("Missing X-Device-Token header", 401);
  }

  let body: HeartbeatBody;
  try {
    body = await req.json();
  } catch {
    return failure("Invalid JSON body", 400);
  }

  const tokenHash = await hashToken(rawToken);
  const supabase = getSupabase();

  const { data: tokenRow, error: tokenErr } = await supabase
    .from("api_tokens")
    .select("device_id")
    .eq("token_hash", tokenHash)
    .eq("revoked", false)
    .single();

  if (tokenErr || !tokenRow) {
    return failure("Invalid or revoked token", 401);
  }

  const deviceId = tokenRow.device_id;

  const {
    cpu_pct,
    ram_pct,
    ram_total_gb,
    disk_pct,
    disk_total_gb,
    battery_health_pct,
    battery_cycles,
    uptime_seconds,
    filevault_enabled,
    bitlocker_enabled,
    firewall_enabled,
    // New fields
    battery_pct,
    battery_health,
    is_charging,
    wifi_ssid,
    wifi_rssi,
    net_upload_mb,
    net_download_mb,
    sip_enabled,
    gatekeeper_enabled,
    mdm_enrolled,
    antivirus_installed,
    usb_devices,
    installed_apps,
    crash_count_24h,
    last_crashed_app,
    active_user,
    remote_session_active,
    public_ip,
    city,
    region,
    country,
    latitude,
    longitude,
    isp,
    // Extended monitoring
    last_reboot,
    swap_used_mb,
    swap_total_mb,
    memory_pressure,
    thermal_state,
    disk_read_mb,
    disk_write_mb,
    fan_speed_rpm,
    storage_volumes,
    open_connections_count,
    listening_ports,
    user_sessions,
    login_history,
    pending_updates,
    pending_update_count,
    bluetooth_devices,
    connected_displays,
    timemachine_enabled,
    timemachine_last_backup,
    third_party_kexts,
    login_items,
    login_item_count,
    dns_servers,
    proxy_configured,
    screen_lock_enabled,
    screen_lock_delay_sec,
    printers,
    installed_browsers,
    top_processes,
    // Windows-specific
    windows_defender_enabled,
    domain_joined,
    domain_name,
    activation_status,
  } = body;

  if (
    cpu_pct == null ||
    ram_pct == null ||
    ram_total_gb == null ||
    disk_pct == null ||
    disk_total_gb == null
  ) {
    return failure(
      "Missing required fields: cpu_pct, ram_pct, ram_total_gb, disk_pct, disk_total_gb",
      400
    );
  }

  const { error: metricsErr } = await supabase.from("metrics").insert({
    device_id: deviceId,
    cpu_pct: cpu_pct ?? null,
    ram_pct: ram_pct ?? null,
    ram_total_gb: ram_total_gb ?? null,
    disk_pct: disk_pct ?? null,
    disk_total_gb: disk_total_gb ?? null,
    battery_health_pct: battery_health_pct ?? null,
    battery_cycles: battery_cycles ?? null,
    uptime_seconds: uptime_seconds ?? null,
    filevault_enabled: filevault_enabled ?? null,
    bitlocker_enabled: bitlocker_enabled ?? null,
    firewall_enabled: firewall_enabled ?? null,
  });

  if (metricsErr) {
    return failure(metricsErr.message, 500);
  }

  const now = new Date().toISOString();

  // Build device update payload — only include new monitoring fields if present
  const deviceUpdate: Record<string, unknown> = {
    last_seen: now,
    status: "online",
  };

  if (battery_pct != null)           deviceUpdate.battery_pct = battery_pct;
  if (battery_cycles != null)        deviceUpdate.battery_cycles = battery_cycles;
  if (battery_health != null)        deviceUpdate.battery_health = battery_health;
  if (is_charging != null)           deviceUpdate.is_charging = is_charging;
  if (wifi_ssid != null)             deviceUpdate.wifi_ssid = wifi_ssid;
  if (wifi_rssi != null)             deviceUpdate.wifi_rssi = wifi_rssi;
  if (filevault_enabled != null)     deviceUpdate.filevault_enabled = filevault_enabled;
  if (firewall_enabled != null)      deviceUpdate.firewall_enabled = firewall_enabled;
  if (sip_enabled != null)           deviceUpdate.sip_enabled = sip_enabled;
  if (gatekeeper_enabled != null)    deviceUpdate.gatekeeper_enabled = gatekeeper_enabled;
  if (mdm_enrolled != null)          deviceUpdate.mdm_enrolled = mdm_enrolled;
  if (antivirus_installed != null)   deviceUpdate.antivirus_installed = antivirus_installed;
  if (crash_count_24h != null)       deviceUpdate.crash_count_24h = crash_count_24h;
  if (last_crashed_app != null)      deviceUpdate.last_crashed_app = last_crashed_app;
  if (active_user != null)           deviceUpdate.active_user = active_user;
  if (remote_session_active != null) deviceUpdate.remote_session_active = remote_session_active;
  if (net_upload_mb != null)         deviceUpdate.net_upload_mb = net_upload_mb;
  if (net_download_mb != null)       deviceUpdate.net_download_mb = net_download_mb;
  if (usb_devices != null)           deviceUpdate.usb_devices = usb_devices;
  if (installed_apps != null)        deviceUpdate.installed_apps = installed_apps;
  if (public_ip != null)             deviceUpdate.public_ip = public_ip;
  if (city != null)                  deviceUpdate.city = city;
  if (region != null)                deviceUpdate.region = region;
  if (country != null)               deviceUpdate.country = country;
  if (latitude != null)              deviceUpdate.latitude = latitude;
  if (longitude != null)             deviceUpdate.longitude = longitude;
  if (isp != null)                   deviceUpdate.isp = isp;

  // Extended monitoring fields
  if (last_reboot != null)             deviceUpdate.last_reboot = last_reboot;
  if (uptime_seconds != null)          deviceUpdate.uptime_seconds = uptime_seconds;
  if (swap_used_mb != null)            deviceUpdate.swap_used_mb = swap_used_mb;
  if (swap_total_mb != null)           deviceUpdate.swap_total_mb = swap_total_mb;
  if (memory_pressure != null)         deviceUpdate.memory_pressure = memory_pressure;
  if (thermal_state != null)           deviceUpdate.thermal_state = thermal_state;
  if (disk_read_mb != null)            deviceUpdate.disk_read_mb = disk_read_mb;
  if (disk_write_mb != null)           deviceUpdate.disk_write_mb = disk_write_mb;
  if (fan_speed_rpm != null)           deviceUpdate.fan_speed_rpm = fan_speed_rpm;
  if (storage_volumes != null)         deviceUpdate.storage_volumes = storage_volumes;
  if (open_connections_count != null)  deviceUpdate.open_connections_count = open_connections_count;
  if (listening_ports != null)         deviceUpdate.listening_ports = listening_ports;
  if (user_sessions != null)           deviceUpdate.user_sessions = user_sessions;
  if (login_history != null)           deviceUpdate.login_history = login_history;
  if (pending_updates != null)         deviceUpdate.pending_updates = pending_updates;
  if (pending_update_count != null)    deviceUpdate.pending_update_count = pending_update_count;
  if (bluetooth_devices != null)       deviceUpdate.bluetooth_devices = bluetooth_devices;
  if (connected_displays != null)      deviceUpdate.connected_displays = connected_displays;
  if (timemachine_enabled != null)     deviceUpdate.timemachine_enabled = timemachine_enabled;
  if (timemachine_last_backup != null) deviceUpdate.timemachine_last_backup = timemachine_last_backup;
  if (third_party_kexts != null)       deviceUpdate.third_party_kexts = third_party_kexts;
  if (login_items != null)             deviceUpdate.login_items = login_items;
  if (login_item_count != null)        deviceUpdate.login_item_count = login_item_count;
  if (dns_servers != null)             deviceUpdate.dns_servers = dns_servers;
  if (proxy_configured != null)        deviceUpdate.proxy_configured = proxy_configured;
  if (screen_lock_enabled != null)     deviceUpdate.screen_lock_enabled = screen_lock_enabled;
  if (screen_lock_delay_sec != null)   deviceUpdate.screen_lock_delay_sec = screen_lock_delay_sec;
  if (printers != null)                deviceUpdate.printers = printers;
  if (installed_browsers != null)      deviceUpdate.installed_browsers = installed_browsers;
  if (top_processes != null)           deviceUpdate.top_processes = top_processes;

  // Windows-specific fields
  if (windows_defender_enabled != null)  deviceUpdate.windows_defender_enabled = windows_defender_enabled;
  if (domain_joined != null)             deviceUpdate.domain_joined = domain_joined;
  if (domain_name != null)               deviceUpdate.domain_name = domain_name;
  if (activation_status != null)         deviceUpdate.activation_status = activation_status;

  await supabase
    .from("devices")
    .update(deviceUpdate)
    .eq("id", deviceId);

  return success({ ok: true });
});
