/**
 * HealSparrow — GET /get-health-reports
 * Returns health reports for the dashboard.
 * Query params:
 *   device_id   — single device detail
 *   status      — filter by health_status (healthy|warning|critical)
 *   hours       — lookback window (default 24, max 168)
 *   fleet        — if "true", return latest report per device (fleet overview)
 */

import { handleCors } from "../_shared/cors.ts";
import { success, failure } from "../_shared/response.ts";
import { getSupabase } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "GET") return failure("Method not allowed", 405);

  const url = new URL(req.url);
  const deviceId = url.searchParams.get("device_id");
  const statusFilter = url.searchParams.get("status");
  const hoursParam = parseInt(url.searchParams.get("hours") ?? "24", 10);
  const hours = Math.min(Math.max(hoursParam, 1), 168);
  const fleetMode = url.searchParams.get("fleet") === "true";

  const supabase = getSupabase();
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  if (fleetMode) {
    // Return the single latest health report per device, joined with device info.
    // Uses a DISTINCT ON equivalent via a subquery approach in Supabase.
    const { data, error } = await supabase
      .from("device_health_reports")
      .select(`
        id, device_id, health_status, health_score, summary, culprit_apps, metrics_snapshot, generated_at,
        devices!inner(hostname, os_type, assigned_user, status, last_seen, cpu_model, cpu_cores, ram_total_gb)
      `)
      .gte("generated_at", since)
      .order("generated_at", { ascending: false });

    if (error) return failure(error.message, 500);

    // Deduplicate: keep only latest report per device_id
    const latest = new Map<string, typeof data[0]>();
    for (const row of (data ?? [])) {
      if (!latest.has(row.device_id)) latest.set(row.device_id, row);
    }

    // Apply optional status filter
    let reports = Array.from(latest.values());
    if (statusFilter) {
      reports = reports.filter((r) => r.health_status === statusFilter);
    }

    return success({ reports, total: reports.length });
  }

  if (deviceId) {
    // Time-series for one device (used in Device Detail trend chart)
    let query = supabase
      .from("device_health_reports")
      .select("id, health_status, health_score, summary, culprit_apps, metrics_snapshot, generated_at")
      .eq("device_id", deviceId)
      .gte("generated_at", since)
      .order("generated_at", { ascending: false })
      .limit(200);

    const { data, error } = await query;
    if (error) return failure(error.message, 500);

    return success({ reports: data ?? [], device_id: deviceId });
  }

  // No device_id and not fleet mode — return all recent reports with device join
  let query = supabase
    .from("device_health_reports")
    .select(`
      id, device_id, health_status, health_score, summary, culprit_apps, metrics_snapshot, generated_at,
      devices(hostname, os_type, assigned_user)
    `)
    .gte("generated_at", since)
    .order("generated_at", { ascending: false })
    .limit(500);

  if (statusFilter) {
    query = query.eq("health_status", statusFilter);
  }

  const { data, error } = await query;
  if (error) return failure(error.message, 500);

  return success({ reports: data ?? [], total: (data ?? []).length });
});
