import { handleCors } from "../_shared/cors.ts";
import { success, failure } from "../_shared/response.ts";
import { getSupabase } from "../_shared/supabase.ts";
import { hashToken, generateToken } from "../_shared/auth.ts";

interface EnrollBody {
  hostname: string;
  serial_number: string;
  os_type: string;
  os_version: string;
  assigned_user?: string;
  department?: string;
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return failure("Method not allowed", 405);
  }

  let body: EnrollBody;
  try {
    body = await req.json();
  } catch {
    return failure("Invalid JSON body", 400);
  }

  const {
    hostname,
    serial_number,
    os_type,
    os_version,
    assigned_user,
    department,
  } = body;

  if (
    !hostname ||
    !serial_number ||
    !os_type ||
    !os_version
  ) {
    return failure(
      "Missing required fields: hostname, serial_number, os_type, os_version",
      400
    );
  }

  const supabase = getSupabase();

  const { data: existing } = await supabase
    .from("devices")
    .select("id")
    .eq("serial_number", serial_number)
    .single();

  if (existing) {
    await supabase
      .from("api_tokens")
      .update({ revoked: true })
      .eq("device_id", existing.id);

    const token = generateToken();
    const tokenHash = await hashToken(token);

    const { error: tokenErr } = await supabase.from("api_tokens").insert({
      device_id: existing.id,
      token_hash: tokenHash,
      revoked: false,
    });

    if (tokenErr) {
      return failure("Failed to issue new token", 500);
    }

    await supabase
      .from("devices")
      .update({
        hostname,
        os_type,
        os_version,
        assigned_user: assigned_user ?? null,
        department: department ?? null,
        last_seen: new Date().toISOString(),
        status: "online",
      })
      .eq("id", existing.id);

    return success({
      device_id: existing.id,
      token,
      message: "Device re-enrolled; new token issued.",
    });
  }

  const { data: newDevice, error: deviceErr } = await supabase
    .from("devices")
    .insert({
      hostname,
      serial_number,
      os_type,
      os_version,
      assigned_user: assigned_user ?? null,
      department: department ?? null,
      status: "online",
    })
    .select("id")
    .single();

  if (deviceErr || !newDevice) {
    return failure(deviceErr?.message ?? "Failed to create device", 500);
  }

  const token = generateToken();
  const tokenHash = await hashToken(token);

  const { error: tokenErr } = await supabase.from("api_tokens").insert({
    device_id: newDevice.id,
    token_hash: tokenHash,
    revoked: false,
  });

  if (tokenErr) {
    await supabase.from("devices").delete().eq("id", newDevice.id);
    return failure("Failed to create token", 500);
  }

  return success({
    device_id: newDevice.id,
    token,
    message: "Device enrolled successfully. Save the token; it will not be shown again.",
  });
});
