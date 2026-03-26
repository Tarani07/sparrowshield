import { handleCors } from "../_shared/cors.ts";
import { success, failure } from "../_shared/response.ts";
import { getSupabase } from "../_shared/supabase.ts";

const OFFLINE_THRESHOLD_MINUTES = 15;

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  const supabase = getSupabase();

  // Check if device_offline notifications are enabled
  const { data: toggleRow } = await supabase
    .from("config")
    .select("value")
    .eq("key", "slack_notify_device_offline")
    .single();

  if (toggleRow?.value === false) {
    return success({ skipped: true, reason: "device_offline notifications disabled" });
  }

  // Read Slack webhook URL
  const { data: webhookRow } = await supabase
    .from("config")
    .select("value")
    .eq("key", "slack_webhook_url")
    .single();

  const webhookUrl = (webhookRow?.value as string) ?? "";
  if (!webhookUrl || webhookUrl === '""' || webhookUrl === "") {
    return success({ skipped: true, reason: "Slack webhook URL not configured" });
  }

  const offlineCutoff = new Date(
    Date.now() - OFFLINE_THRESHOLD_MINUTES * 60 * 1000
  ).toISOString();

  // Find devices that are offline (last_seen older than threshold) and not yet notified
  const { data: offlineDevices, error: fetchErr } = await supabase
    .from("devices")
    .select("id, hostname, assigned_user, last_seen")
    .lt("last_seen", offlineCutoff)
    .eq("notified_offline", false);

  if (fetchErr) {
    return failure(`Failed to query devices: ${fetchErr.message}`, 500);
  }

  if (!offlineDevices?.length) {
    return success({ notified: 0 });
  }

  let notifiedCount = 0;

  for (const device of offlineDevices) {
    const lastSeenDate = device.last_seen
      ? new Date(device.last_seen)
      : null;
    const minutesAgo = lastSeenDate
      ? Math.round((Date.now() - lastSeenDate.getTime()) / 60000)
      : "unknown";

    const slackPayload = {
      attachments: [
        {
          color: "#daa038",
          pretext: ":warning: *Device Offline*",
          text: `${device.hostname} has not reported in for ${minutesAgo} minutes.`,
          fields: [
            { title: "Device", value: device.hostname ?? "Unknown", short: true },
            { title: "Assigned User", value: device.assigned_user ?? "N/A", short: true },
            { title: "Last Seen", value: device.last_seen ?? "Never", short: true },
          ],
          footer: "Sparrow IT Admin",
          ts: Math.floor(Date.now() / 1000),
        },
      ],
    };

    try {
      const resp = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(slackPayload),
      });

      if (resp.ok) {
        // Mark device as notified to avoid duplicate notifications
        await supabase
          .from("devices")
          .update({ notified_offline: true, status: "offline" })
          .eq("id", device.id);
        notifiedCount++;
      }
    } catch (_err) {
      // Log and continue with next device
    }
  }

  // Reset notified_offline for devices that have come back online
  const { data: onlineDevices } = await supabase
    .from("devices")
    .select("id")
    .gte("last_seen", offlineCutoff)
    .eq("notified_offline", true);

  if (onlineDevices?.length) {
    for (const device of onlineDevices) {
      await supabase
        .from("devices")
        .update({ notified_offline: false })
        .eq("id", device.id);
    }
  }

  return success({ notified: notifiedCount, checked: offlineDevices.length });
});
