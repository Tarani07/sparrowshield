import { handleCors } from "../_shared/cors.ts";
import { success, failure } from "../_shared/response.ts";
import { getSupabase } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return failure("Method not allowed", 405);
  }

  let body: { device_ids: string[] };
  try {
    body = await req.json();
  } catch {
    return failure("Invalid JSON body", 400);
  }

  if (!body.device_ids?.length) {
    return failure("device_ids array required", 400);
  }

  const supabase = getSupabase();
  let deployed = 0;

  for (const deviceId of body.device_ids) {
    // Create device command
    const { data: cmd, error: cmdErr } = await supabase
      .from("device_commands")
      .insert({
        device_id: deviceId,
        command_type: "install_updates",
        payload: {},
        status: "pending",
      })
      .select("id")
      .single();

    if (cmdErr) continue;

    // Create patch history entry
    await supabase.from("patch_history").insert({
      device_id: deviceId,
      command_id: cmd.id,
      status: "pending",
      initiated_by: "fleet_deploy",
    });

    deployed++;
  }

  return success({ deployed, total: body.device_ids.length });
});
