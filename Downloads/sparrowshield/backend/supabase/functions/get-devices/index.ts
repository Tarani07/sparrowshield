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
  const status = url.searchParams.get("status");
  const os_type = url.searchParams.get("os_type");
  const search = url.searchParams.get("search");

  const supabase = getSupabase();

  let query = supabase.from("devices").select(`
    id,
    hostname,
    serial_number,
    os_type,
    os_version,
    assigned_user,
    department,
    enrolled_at,
    last_seen,
    status
  `);

  if (status) {
    query = query.eq("status", status);
  }
  if (os_type) {
    query = query.eq("os_type", os_type);
  }
  if (search && search.trim()) {
    const term = search.trim();
    query = query.or(`hostname.ilike.%${term}%,assigned_user.ilike.%${term}%`);
  }

  const { data: devices, error } = await query.order("last_seen", {
    ascending: false,
  });

  if (error) {
    return failure(error.message, 500);
  }

  const deviceIds = (devices ?? []).map((d) => d.id);
  if (deviceIds.length === 0) {
    return success(devices ?? []);
  }

  const { data: metrics } = await supabase
    .from("metrics")
    .select("device_id, cpu_pct, ram_pct, disk_pct, timestamp")
    .in("device_id", deviceIds);

  const latestByDevice: Record<string, (typeof metrics)[0]> = {};
  for (const m of metrics ?? []) {
    const existing = latestByDevice[m.device_id];
    if (
      !existing ||
      new Date(m.timestamp) > new Date(existing.timestamp)
    ) {
      latestByDevice[m.device_id] = m;
    }
  }

  const devicesWithMetrics = (devices ?? []).map((d) => ({
    ...d,
    latest_metrics: latestByDevice[d.id] ?? null,
  }));

  return success(devicesWithMetrics);
});
