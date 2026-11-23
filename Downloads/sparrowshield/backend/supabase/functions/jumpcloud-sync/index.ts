// Pull systems + System Insights from JumpCloud and match them to SparrowShield devices by serial.
// Runs hourly from pg_cron (x-cron-secret) or on demand from the console (admin).
import { handleCors, corsHeaders } from "../_shared/cors.ts";
import { getSupabase } from "../_shared/supabase.ts";
import { authorize, getSecret } from "../_shared/guard.ts";
import { jcGet } from "../_shared/jumpcloud.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

type JcSystem = {
  _id: string; hostname?: string; displayName?: string; serialNumber?: string; os?: string; version?: string;
  arch?: string; agentVersion?: string; active?: boolean; lastContact?: string; remoteIP?: string;
  fde?: { active?: boolean; keyPresent?: boolean };
};

// System Insights tables worth showing per device (rows capped per system).
const INSIGHT_TABLES = ["system_info", "os_version", "uptime", "disk_encryption", "logged_in_users", "alf", "battery"];
const MAX_ROWS_PER_SYSTEM = 15;

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  const db = getSupabase();
  const caller = await authorize(req, db);
  if (!caller) return json({ error: "Not allowed" }, 403);

  const apiKey = await getSecret(db, "jumpcloud_api_key");
  if (!apiKey) return json({ skipped: true, reason: "JumpCloud not connected" });
  const { data: st } = await db.from("integration_status").select("settings").eq("name", "jumpcloud").maybeSingle();
  const orgId = (st?.settings as { org_id?: string } | null)?.org_id ?? null;

  const started = Date.now();
  try {
    // 1) All systems (v1, paginated 100 at a time).
    const systems: JcSystem[] = [];
    for (let skip = 0; skip < 20000; skip += 100) {
      const page = await jcGet<{ totalCount: number; results: JcSystem[] }>(
        `/systems?limit=100&skip=${skip}&fields=hostname displayName serialNumber os version arch agentVersion active lastContact remoteIP fde`,
        apiKey, orgId);
      systems.push(...(page.results ?? []));
      if (!page.results?.length || systems.length >= page.totalCount) break;
    }

    // 2) System Insights (v2). Some tables may not be available on every plan — skip those.
    const insights = new Map<string, Record<string, unknown[]>>();
    const skippedTables: string[] = [];
    for (const table of INSIGHT_TABLES) {
      try {
        for (let skip = 0; skip < 50000; skip += 1000) {
          const rows = await jcGet<Record<string, unknown>[]>(`/v2/systeminsights/${table}?limit=1000&skip=${skip}`, apiKey, orgId);
          for (const row of rows) {
            const sid = String(row.system_id ?? "");
            if (!sid) continue;
            const bucket = insights.get(sid) ?? {};
            const list = (bucket[table] ??= []);
            if (list.length < MAX_ROWS_PER_SYSTEM) list.push(row);
            insights.set(sid, bucket);
          }
          if (rows.length < 1000) break;
        }
      } catch {
        skippedTables.push(table);
      }
    }

    // 3) Match to SparrowShield devices by serial number.
    const { data: devices } = await db.from("devices").select("id, serial_number");
    const bySerial = new Map((devices ?? []).filter(d => d.serial_number).map(d => [String(d.serial_number).toLowerCase(), d.id]));

    const rows = systems.map(s => ({
      jc_id: s._id,
      device_id: s.serialNumber ? bySerial.get(s.serialNumber.toLowerCase()) ?? null : null,
      hostname: s.hostname ?? null,
      display_name: s.displayName ?? null,
      serial_number: s.serialNumber ?? null,
      os: s.os ?? null,
      os_version: s.version ?? null,
      arch: s.arch ?? null,
      agent_version: s.agentVersion ?? null,
      active: s.active ?? null,
      last_contact: s.lastContact ?? null,
      remote_ip: s.remoteIP ?? null,
      fde_active: s.fde?.active ?? null,
      fde_key_present: s.fde?.keyPresent ?? null,
      insights: insights.get(s._id) ?? {},
      synced_at: new Date().toISOString(),
    }));

    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await db.from("jumpcloud_systems").upsert(rows.slice(i, i + 200), { onConflict: "jc_id" });
      if (error) throw new Error(error.message);
    }
    // Systems removed from JumpCloud disappear here too.
    if (rows.length) {
      await db.from("jumpcloud_systems").delete().not("jc_id", "in", `(${rows.map(r => `"${r.jc_id}"`).join(",")})`);
    }

    const matched = rows.filter(r => r.device_id).length;
    const message = `${rows.length} systems synced · ${matched} matched to SparrowShield · ${rows.length - matched} without the agent` +
      (skippedTables.length ? ` · Insights not available: ${skippedTables.join(", ")}` : "");
    await db.from("integration_status").upsert({ name: "jumpcloud", configured: true, last_sync_at: new Date().toISOString(),
      last_status: "ok", last_message: message, updated_at: new Date().toISOString() });
    return json({ ok: true, systems: rows.length, matched, skipped_tables: skippedTables, ms: Date.now() - started });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await db.from("integration_status").upsert({ name: "jumpcloud", last_status: "error", last_message: message,
      updated_at: new Date().toISOString() });
    return json({ error: message }, 502);
  }
});
