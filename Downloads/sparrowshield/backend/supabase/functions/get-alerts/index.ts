import { handleCors } from "../_shared/cors.ts";
import { success, failure } from "../_shared/response.ts";
import { getSupabase } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "GET") {
    return failure("Method not allowed", 405);
  }

  const url = new URL(req.url);
  const device_id = url.searchParams.get("device_id");
  const severity = url.searchParams.get("severity");
  const resolvedParam = url.searchParams.get("resolved");
  const resolved =
    resolvedParam === "true"
      ? true
      : resolvedParam === "false"
      ? false
      : false;

  const supabase = getSupabase();

  let query = supabase
    .from("alerts")
    .select(`
      id,
      device_id,
      alert_type,
      severity,
      message,
      resolved,
      created_at,
      resolved_at,
      devices ( hostname )
    `)
    .eq("resolved", resolved)
    .order("created_at", { ascending: false });

  if (device_id) {
    query = query.eq("device_id", device_id);
  }
  if (severity) {
    query = query.eq("severity", severity);
  }

  const { data, error } = await query;

  if (error) {
    return failure(error.message, 500);
  }

  const alerts = (data ?? []).map((a: Record<string, unknown>) => ({
    ...a,
    hostname: (a.devices as Record<string, unknown>)?.hostname ?? null,
    devices: undefined,
  }));

  return success(alerts);
});
