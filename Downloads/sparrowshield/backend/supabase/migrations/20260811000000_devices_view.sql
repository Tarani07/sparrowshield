-- Create a "devices" view that maps the telemetry table to the Device schema
-- the dashboard expects. This avoids changing either the agent or the dashboard.

CREATE OR REPLACE VIEW devices AS
SELECT
  device_id::text                                                   AS id,
  hostname,
  serial_number,
  'mac'::text                                                       AS os_type,
  NULL::text                                                        AS os_version,
  username                                                          AS assigned_user,
  NULL::text                                                        AS department,
  model_name                                                        AS cpu_model,
  NULL::integer                                                     AS cpu_cores,
  ram_gb                                                            AS ram_total_gb,
  CASE
    WHEN last_seen_at > NOW() - INTERVAL '15 minutes' THEN 'online'
    ELSE 'offline'
  END                                                               AS status,
  last_seen_at                                                      AS last_seen,
  last_seen_at                                                      AS enrolled_at,

  -- Battery (not yet collected by agent)
  NULL::integer                                                     AS battery_pct,
  NULL::integer                                                     AS battery_cycles,
  NULL::text                                                        AS battery_health,
  NULL::boolean                                                     AS is_charging,

  -- Network
  NULL::text                                                        AS wifi_ssid,
  NULL::integer                                                     AS wifi_rssi,
  NULL::numeric                                                     AS net_upload_mb,
  NULL::numeric                                                     AS net_download_mb,

  -- Security
  NULL::boolean                                                     AS filevault_enabled,
  NULL::boolean                                                     AS firewall_enabled,
  NULL::boolean                                                     AS sip_enabled,
  NULL::boolean                                                     AS gatekeeper_enabled,

  -- Compliance
  NULL::boolean                                                     AS mdm_enrolled,
  NULL::text                                                        AS antivirus_installed,

  -- Extended
  NULL::jsonb                                                       AS usb_devices,
  NULL::jsonb                                                       AS installed_apps,
  NULL::integer                                                     AS crash_count_24h,
  NULL::text                                                        AS last_crashed_app,
  username                                                          AS active_user,
  NULL::boolean                                                     AS remote_session_active,
  NULL::text                                                        AS public_ip,
  NULL::text                                                        AS city,
  NULL::text                                                        AS region,
  NULL::text                                                        AS country,
  NULL::numeric                                                     AS latitude,
  NULL::numeric                                                     AS longitude,
  NULL::text                                                        AS isp,
  NULL::integer                                                     AS uptime_seconds,
  NULL::timestamptz                                                 AS last_reboot,
  NULL::numeric                                                     AS swap_used_mb,
  NULL::numeric                                                     AS swap_total_mb,
  NULL::text                                                        AS memory_pressure,
  NULL::text                                                        AS thermal_state,
  NULL::numeric                                                     AS disk_read_mb,
  NULL::numeric                                                     AS disk_write_mb,
  NULL::integer                                                     AS fan_speed_rpm,
  NULL::jsonb                                                       AS storage_volumes,
  NULL::integer                                                     AS open_connections_count,
  NULL::jsonb                                                       AS listening_ports,
  NULL::jsonb                                                       AS user_sessions,
  NULL::jsonb                                                       AS login_history,
  NULL::jsonb                                                       AS pending_updates,
  NULL::integer                                                     AS pending_update_count,
  NULL::jsonb                                                       AS bluetooth_devices,
  NULL::jsonb                                                       AS connected_displays,
  NULL::boolean                                                     AS timemachine_enabled,
  NULL::timestamptz                                                 AS timemachine_last_backup,
  NULL::jsonb                                                       AS third_party_kexts,
  NULL::jsonb                                                       AS login_items,
  NULL::integer                                                     AS login_item_count,
  NULL::jsonb                                                       AS dns_servers,
  NULL::boolean                                                     AS proxy_configured,
  NULL::boolean                                                     AS screen_lock_enabled,
  NULL::integer                                                     AS screen_lock_delay_sec,
  NULL::jsonb                                                       AS printers,
  NULL::jsonb                                                       AS installed_browsers,
  NULL::jsonb                                                       AS top_processes,
  NULL::boolean                                                     AS windows_defender_enabled,
  NULL::boolean                                                     AS domain_joined,
  NULL::text                                                        AS domain_name,
  NULL::text                                                        AS activation_status
FROM telemetry;

-- Allow the anon role to read the view (required for REST API access)
GRANT SELECT ON devices TO anon;
