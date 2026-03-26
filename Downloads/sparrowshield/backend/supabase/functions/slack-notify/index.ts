import { handleCors } from "../_shared/cors.ts";
import { success, failure } from "../_shared/response.ts";
import { getSupabase } from "../_shared/supabase.ts";

type Severity = "info" | "warning" | "critical";

interface SlackNotifyBody {
  event_type:
    | "new_app_installed"
    | "system_critical"
    | "security_alert"
    | "device_offline"
    | "disk_failing";
  device_name?: string;
  device_id?: string;
  title: string;
  message: string;
  severity: Severity;
  fields?: { title: string; value: string }[];
}

const SEVERITY_COLORS: Record<Severity, string> = {
  info: "#2eb886",     // green
  warning: "#daa038",  // amber
  critical: "#cc0000", // red
};

const SEVERITY_EMOJI: Record<Severity, string> = {
  info: ":large_green_circle:",
  warning: ":warning:",
  critical: ":rotating_light:",
};

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return failure("Method not allowed", 405);
  }

  let body: SlackNotifyBody;
  try {
    body = await req.json();
  } catch {
    return failure("Invalid JSON body", 400);
  }

  const { event_type, device_name, device_id, title, message, severity, fields } = body;

  if (!event_type || !title || !message || !severity) {
    return failure("Missing required fields: event_type, title, message, severity", 400);
  }

  const supabase = getSupabase();

  // Check if this notification type is enabled
  const eventConfigMap: Record<string, string> = {
    new_app_installed: "slack_notify_new_app",
    system_critical: "slack_notify_system_critical",
    security_alert: "slack_notify_security_alert",
    device_offline: "slack_notify_device_offline",
    disk_failing: "slack_notify_disk_health",
  };

  const configKey = eventConfigMap[event_type];
  if (configKey) {
    const { data: toggleRow } = await supabase
      .from("config")
      .select("value")
      .eq("key", configKey)
      .single();

    if (toggleRow?.value === false) {
      return success({ skipped: true, reason: `${event_type} notifications disabled` });
    }
  }

  // Read the Slack webhook URL
  const { data: webhookRow } = await supabase
    .from("config")
    .select("value")
    .eq("key", "slack_webhook_url")
    .single();

  const webhookUrl = (webhookRow?.value as string) ?? "";

  if (!webhookUrl || webhookUrl === '""' || webhookUrl === "") {
    return failure("Slack webhook URL not configured", 400);
  }

  // Build Slack attachment fields
  const slackFields = (fields ?? []).map((f) => ({
    title: f.title,
    value: f.value,
    short: true,
  }));

  const emoji = SEVERITY_EMOJI[severity] ?? ":bell:";

  const slackPayload = {
    attachments: [
      {
        color: SEVERITY_COLORS[severity] ?? "#439FE0",
        pretext: `${emoji} *${title}*`,
        text: message,
        fields: slackFields,
        footer: "Sparrow IT Admin",
        footer_icon: "https://raw.githubusercontent.com/sparrowshield/assets/main/logo.png",
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

    if (!resp.ok) {
      const errText = await resp.text();
      return failure(`Slack webhook returned ${resp.status}: ${errText}`, 502);
    }

    return success({ sent: true, event_type, severity });
  } catch (err) {
    return failure(`Failed to send Slack notification: ${String(err)}`, 500);
  }
});
