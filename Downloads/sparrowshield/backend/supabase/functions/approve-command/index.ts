import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getSupabase } from "../_shared/supabase.ts";
import { handleCors, corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleCors(req);
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "POST only" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Require authenticated dashboard user
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const token = authHeader.replace("Bearer ", "");
  const authClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
  );
  const { data: { user }, error: authErr } = await authClient.auth.getUser(token);
  if (authErr || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
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
