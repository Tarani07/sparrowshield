import { getSupabase } from "../_shared/supabase.ts";

const DASHBOARD_LINK = Deno.env.get("DASHBOARD_LINK") ?? "https://fleetpulse.example.com";

interface AlertThresholds {
  disk_warning: number;
  disk_critical: number;
  ram_warning: number;
  battery_warning: number;
  offline_minutes: number;
  min_os_version_mac?: string;
  min_os_version_windows?: string;
}

interface SlackWebhook {
  url: string;
}

interface DailyDigestTime {
  hour: number;
}

Deno.serve(async (req) => {
  const supabase = getSupabase();

  const { data: thresholdsRow } = await supabase
    .from("config")
    .select("value")
    .eq("key", "alert_thresholds")
    .single();

  const { data: slackRow } = await supabase
    .from("config")
    .select("value")
    .eq("key", "slack_webhook")
    .single();

  const { data: digestRow } = await supabase
    .from("config")
    .select("value")
    .eq("key", "daily_digest_time")
    .single();

  const thresholds: AlertThresholds = (thresholdsRow?.value as AlertThresholds) ?? {
    disk_warning: 85,
    disk_critical: 95,
    ram_warning: 90,
    battery_warning: 60,
    offline_minutes: 120,
  };

  const slackWebhook: SlackWebhook = (slackRow?.value as SlackWebhook) ?? { url: "" };
  const digestTime: DailyDigestTime = (digestRow?.value as DailyDigestTime) ?? { hour: 9 };

  const { data: devices } = await supabase
    .from("devices")
    .select("id, hostname, assigned_user, os_type, last_seen");

  if (!devices?.length) {
    return new Response(JSON.stringify({ success: true, data: { processed: 0 } }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const offlineCutoff = new Date(
    Date.now() - thresholds.offline_minutes * 60 * 1000
  ).toISOString();

  const newAlerts: { device_id: string; hostname: string; assigned_user: string | null; alert_type: string; severity: string; message: string }[] = [];

  for (const device of devices) {
    const { data: latestMetric } = await supabase
      .from("metrics")
      .select("*")
      .eq("device_id", device.id)
      .order("timestamp", { ascending: false })
      .limit(1)
      .single();

    const { data: activeAlerts } = await supabase
      .from("alerts")
      .select("id, alert_type")
      .eq("device_id", device.id)
      .eq("resolved", false);

    const activeTypes = new Set((activeAlerts ?? []).map((a) => a.alert_type));

    const createAlert = (
      alert_type: string,
      severity: string,
      message: string
    ) => {
      if (activeTypes.has(alert_type)) return;
      newAlerts.push({
        device_id: device.id,
        hostname: device.hostname,
        assigned_user: device.assigned_user ?? null,
        alert_type,
        severity,
        message,
      });
      activeTypes.add(alert_type);
    };

    if (!device.last_seen || new Date(device.last_seen) < new Date(offlineCutoff)) {
      await supabase
        .from("devices")
        .update({ status: "offline" })
        .eq("id", device.id);
      createAlert(
        "device_offline",
        "critical",
        `Device has been offline for more than ${thresholds.offline_minutes} minutes.`
      );
    }

    if (!latestMetric) continue;

    const m = latestMetric as Record<string, unknown>;
    const disk_pct = m.disk_pct as number | null;
    const ram_pct = m.ram_pct as number | null;
    const battery_health_pct = m.battery_health_pct as number | null;
    const filevault_enabled = m.filevault_enabled as boolean | null;
    const bitlocker_enabled = m.bitlocker_enabled as boolean | null;
    const firewall_enabled = m.firewall_enabled as boolean | null;

    if (disk_pct != null && disk_pct >= thresholds.disk_critical) {
      createAlert(
        "high_disk",
        "critical",
        `Disk usage at ${disk_pct.toFixed(1)}% (critical threshold: ${thresholds.disk_critical}%).`
      );
    } else if (disk_pct != null && disk_pct >= thresholds.disk_warning) {
      createAlert(
        "high_disk",
        "warning",
        `Disk usage at ${disk_pct.toFixed(1)}% (warning threshold: ${thresholds.disk_warning}%).`
      );
    }

    if (ram_pct != null && ram_pct >= thresholds.ram_warning) {
      createAlert(
        "high_ram",
        "warning",
        `RAM usage at ${ram_pct.toFixed(1)}% (threshold: ${thresholds.ram_warning}%).`
      );
    }

    if (battery_health_pct != null && battery_health_pct < thresholds.battery_warning) {
      createAlert(
        "battery_health",
        "warning",
        `Battery health at ${battery_health_pct.toFixed(0)}% (below ${thresholds.battery_warning}%).`
      );
    }

    if (device.os_type?.toLowerCase() === "mac" && filevault_enabled === false) {
      createAlert("encryption_disabled", "critical", "FileVault is disabled.");
    }
    if (device.os_type?.toLowerCase() === "windows" && bitlocker_enabled === false) {
      createAlert("encryption_disabled", "critical", "BitLocker is disabled.");
    }

    if (firewall_enabled === false) {
      createAlert("firewall_disabled", "warning", "Firewall is disabled.");
    }
  }

  for (const a of newAlerts) {
    await supabase.from("alerts").insert({
      device_id: a.device_id,
      alert_type: a.alert_type,
      severity: a.severity,
      message: a.message,
      resolved: false,
    });
  }

  for (const device of devices) {
    const { data: latestMetric } = await supabase
      .from("metrics")
      .select("*")
      .eq("device_id", device.id)
      .order("timestamp", { ascending: false })
      .limit(1)
      .single();

    const { data: unresolvedAlerts } = await supabase
      .from("alerts")
      .select("id, alert_type, severity, message")
      .eq("device_id", device.id)
      .eq("resolved", false);

    if (!unresolvedAlerts?.length) continue;

    const m = (latestMetric ?? {}) as Record<string, unknown>;
    const disk_pct = m.disk_pct as number | null;
    const ram_pct = m.ram_pct as number | null;
    const battery_health_pct = m.battery_health_pct as number | null;
    const filevault_enabled = m.filevault_enabled as boolean | null;
    const bitlocker_enabled = m.bitlocker_enabled as boolean | null;
    const firewall_enabled = m.firewall_enabled as boolean | null;
    const last_seen = device.last_seen;
    const isOffline = !last_seen || new Date(last_seen) < new Date(offlineCutoff);

    for (const alert of unresolvedAlerts) {
      let shouldResolve = false;
      switch (alert.alert_type) {
        case "high_disk":
          shouldResolve =
            disk_pct != null && disk_pct < thresholds.disk_warning;
          break;
        case "high_ram":
          shouldResolve = ram_pct != null && ram_pct < thresholds.ram_warning;
          break;
        case "battery_health":
          shouldResolve =
            battery_health_pct != null && battery_health_pct >= thresholds.battery_warning;
          break;
        case "encryption_disabled":
          if (device.os_type?.toLowerCase() === "mac") {
            shouldResolve = filevault_enabled === true;
          } else {
            shouldResolve = bitlocker_enabled === true;
          }
          break;
        case "firewall_disabled":
          shouldResolve = firewall_enabled === true;
          break;
        case "device_offline":
          shouldResolve = !isOffline;
          break;
      }
      if (shouldResolve) {
        await supabase
          .from("alerts")
          .update({ resolved: true, resolved_at: new Date().toISOString() })
          .eq("id", alert.id);
      }
    }
  }

  if (slackWebhook.url && newAlerts.length > 0) {
    for (const a of newAlerts) {
      const text = `[${a.severity}] ${a.hostname}${a.assigned_user ? ` (${a.assigned_user})` : ""}: ${a.message} — ${DASHBOARD_LINK}`;
      try {
        await fetch(slackWebhook.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
      } catch (_e) {
        // log and continue
      }
    }
  }

  const now = new Date();
  const digestHour = digestTime.hour ?? 9;
  if (now.getUTCHours() === digestHour && now.getUTCMinutes() < 15) {
    if (slackWebhook.url) {
      const { data: allDevices } = await supabase
        .from("devices")
        .select("id, status");
      const { data: openAlerts } = await supabase
        .from("alerts")
        .select("id, severity")
        .eq("resolved", false);
      const total = allDevices?.length ?? 0;
      const online = allDevices?.filter((d) => d.status === "online").length ?? 0;
      const critical = openAlerts?.filter((a) => a.severity === "critical").length ?? 0;
      const warning = openAlerts?.filter((a) => a.severity === "warning").length ?? 0;
      const text = `FleetPulse Daily Digest — Devices: ${online}/${total} online. Open alerts: ${critical} critical, ${warning} warning. ${DASHBOARD_LINK}`;
      try {
        await fetch(slackWebhook.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
      } catch (_e) {
        // ignore
      }
    }
  }

  return new Response(
    JSON.stringify({
      success: true,
      data: { processed: devices.length, newAlerts: newAlerts.length },
    }),
    { headers: { "Content-Type": "application/json" } }
  );
});
