// Evaluate every enabled compliance framework (built-in or custom) against every device.
// Runs hourly from pg_cron and on demand from the console ("Evaluate now").
import { handleCors, corsHeaders } from "../_shared/cors.ts";
import { getSupabase } from "../_shared/supabase.ts";
import { authorize } from "../_shared/guard.ts";

interface FieldCheck { field: string; expect: unknown; operator?: string; max_age_hours?: number }
interface Control { id: string; control_id: string; control_name: string; field_checks: FieldCheck[]; severity: string; description?: string }

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" && !isNaN(Number(v)) ? Number(v) : NaN);

export function evaluateCheck(device: Record<string, unknown>, check: FieldCheck): boolean {
  const value = device[check.field];
  if (check.expect === "not_null") return value != null && value !== "" && value !== false;
  if (check.expect === "recent") {
    if (!value) return false;
    const ageH = (Date.now() - new Date(value as string).getTime()) / 3_600_000;
    return ageH <= (check.max_age_hours ?? 24);
  }
  const op = check.operator ?? "==";
  const expected = check.expect;
  switch (op) {
    case "==": return value === expected || (typeof expected === "string" && String(value ?? "") === expected);
    case "!=": return value !== expected;
    case ">": return num(value) > num(expected);
    case ">=": return num(value) >= num(expected);
    case "<": return num(value) < num(expected);
    case "<=": return value != null && num(value) <= num(expected);
    case "contains": return String(value ?? "").toLowerCase().includes(String(expected).toLowerCase());
    case "version_gte": {
      // e.g. os_version "14.6.1" >= "14.5"
      const a = String(value ?? "").split(".").map(Number), b = String(expected).split(".").map(Number);
      for (let i = 0; i < Math.max(a.length, b.length); i++) {
        const x = a[i] || 0, y = b[i] || 0;
        if (x !== y) return x > y;
      }
      return true;
    }
    default: return value === expected;
  }
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  const db = getSupabase();
  const caller = await authorize(req, db);
  if (!caller) return json({ error: "Not allowed" }, 403);
  const body = await req.json().catch(() => ({})) as { framework_id?: string };

  let fq = db.from("compliance_frameworks").select("id, name").eq("enabled", true);
  if (body.framework_id) fq = fq.eq("id", body.framework_id);
  const { data: frameworks } = await fq;
  if (!frameworks?.length) return json({ evaluated: 0, message: "No enabled frameworks" });

  const { data: devices } = await db.from("devices").select("*");
  if (!devices?.length) return json({ evaluated: 0, message: "No devices" });

  let total = 0;
  for (const fw of frameworks) {
    const { data: controls } = await db.from("compliance_controls").select("*").eq("framework_id", fw.id);
    if (!controls?.length) {
      await db.from("compliance_snapshots").delete().eq("framework_id", fw.id);
      continue;
    }
    const rows = devices.map(device => {
      let pass = 0, fail = 0;
      const details = (controls as Control[]).map(c => {
        const field_values: Record<string, unknown> = {};
        let ok = true;
        for (const chk of c.field_checks ?? []) {
          field_values[chk.field] = device[chk.field];
          if (!evaluateCheck(device, chk)) ok = false;
        }
        ok ? pass++ : fail++;
        return { control_id: c.control_id, control_name: c.control_name, severity: c.severity, pass: ok, field_values };
      });
      const n = pass + fail;
      return {
        device_id: device.id, hostname: device.hostname, os_type: device.os_type,
        framework: fw.name, framework_id: fw.id,
        score: n ? Math.round((pass / n) * 100) : 0, score_pct: n ? Math.round((pass / n) * 100) : 0,
        pass_count: pass, fail_count: fail, passed: pass, total: n,
        details, snapshot_at: new Date().toISOString(),
      };
    });
    // Replace this framework's results (also clears old rows keyed only by name).
    await db.from("compliance_snapshots").delete().or(`framework_id.eq.${fw.id},framework.eq.${fw.name}`);
    const { error } = await db.from("compliance_snapshots").insert(rows);
    if (error) return json({ error: `${fw.name}: ${error.message}` }, 500);
    total += rows.length;
  }
  return json({ evaluated: total, devices: devices.length, frameworks: frameworks.length });
});
