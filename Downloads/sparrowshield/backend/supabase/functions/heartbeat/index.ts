import { handleCors } from "../_shared/cors.ts";
import { success, failure } from "../_shared/response.ts";
import { getSupabase } from "../_shared/supabase.ts";
import { hashToken } from "../_shared/auth.ts";

interface HeartbeatBody {
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
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return failure("Method not allowed", 405);
  }

  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) {
    return failure("Missing or invalid Authorization header", 401);
  }
  const rawToken = auth.slice(7).trim();
  if (!rawToken) {
    return failure("Missing Bearer token", 401);
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
  await supabase
    .from("devices")
    .update({ last_seen: now, status: "online" })
    .eq("id", deviceId);

  return success({ ok: true });
});
