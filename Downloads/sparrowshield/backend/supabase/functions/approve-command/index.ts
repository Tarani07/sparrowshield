import { getSupabase } from "../_shared/supabase.ts";

/**
 * Approve or Dismiss a remediation command.
 *
 * POST body:
 *   { command_id: string, action: "approve" | "dismiss" }
 *
 * - "approve" → sets status to "pending" so the agent picks it up
 * - "dismiss" → sets status to "dismissed" so it's ignored
 */
Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = getSupabase();
  const { command_id, action } = await req.json();

  if (!command_id || !["approve", "dismiss"].includes(action)) {
    return new Response(
      JSON.stringify({ error: "Required: command_id (string), action ('approve' | 'dismiss')" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Verify the command exists and is awaiting approval
  const { data: cmd, error: fetchErr } = await supabase
    .from("device_commands")
    .select("id, device_id, command_type, status")
    .eq("id", command_id)
    .single();

  if (fetchErr || !cmd) {
    return new Response(
      JSON.stringify({ error: "Command not found" }),
      { status: 404, headers: { "Content-Type": "application/json" } }
    );
  }

  if (cmd.status !== "awaiting_approval") {
    return new Response(
      JSON.stringify({ error: `Command is already '${cmd.status}', cannot ${action}` }),
      { status: 409, headers: { "Content-Type": "application/json" } }
    );
  }

  if (action === "approve") {
    // Set to "pending" — agent will pick it up on next 10s poll
    await supabase
      .from("device_commands")
      .update({ status: "pending" })
      .eq("id", command_id);

    // Update remediation log
    await supabase
      .from("remediation_log")
      .update({ status: "approved" })
      .eq("command_id", command_id);

    // Get device hostname for Slack
    const { data: device } = await supabase
      .from("devices")
      .select("hostname")
      .eq("id", cmd.device_id)
      .single();

    // Slack notification
    const { data: slackRow } = await supabase
      .from("config")
      .select("value")
      .eq("key", "slack_webhook")
      .single();

    const webhookUrl = (slackRow?.value as { url: string })?.url;
    if (webhookUrl) {
      try {
        await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: `✅ Remediation Approved: "${cmd.command_type}" on ${device?.hostname ?? cmd.device_id}. Command dispatched to agent.`,
          }),
        });
      } catch (_e) { /* ignore */ }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Command approved and dispatched to agent`,
        command_id,
        command_type: cmd.command_type,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  }

  // action === "dismiss"
  await supabase
    .from("device_commands")
    .update({ status: "dismissed" })
    .eq("id", command_id);

  await supabase
    .from("remediation_log")
    .update({ status: "dismissed" })
    .eq("command_id", command_id);

  return new Response(
    JSON.stringify({
      success: true,
      message: `Command dismissed`,
      command_id,
    }),
    { headers: { "Content-Type": "application/json" } }
  );
});
