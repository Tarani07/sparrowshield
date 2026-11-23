// Scheduled report delivery. pg_cron calls it hourly (x-cron-secret) to send every due schedule;
// admins call it with { schedule_id } for "Send now". Email via Resend, summary via Slack webhook.
import { handleCors, corsHeaders } from "../_shared/cors.ts";
import { getSupabase } from "../_shared/supabase.ts";
import { authorize, getSecret } from "../_shared/guard.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const CONSOLE = "https://sparrowshield.vercel.app";
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

type Schedule = { id: string; name: string; report_type: string; frequency: string; day_of_week: number | null; hour_utc: number;
  recipients: string[]; send_slack: boolean; enabled: boolean };
type Db = ReturnType<typeof getSupabase>;

const PERIOD_DAYS: Record<string, number> = { daily: 1, weekly: 7, monthly: 30 };
const SEV_COLOR: Record<string, string> = { critical: "#e11d48", high: "#ea580c", medium: "#ca8a04", warning: "#ca8a04", low: "#2563eb", info: "#64748b" };

async function buildReport(db: Db, s: Schedule) {
  const days = PERIOD_DAYS[s.frequency] ?? 7;
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const [{ data: devices }, { data: periodAlerts }, { data: openAlerts }, { count: blocked }, { data: snaps }] = await Promise.all([
    db.from("devices").select("id, hostname, os_type, os_version, last_seen, agent_version, assigned_user, filevault_enabled, firewall_enabled, sip_enabled, gatekeeper_enabled"),
    db.from("alerts").select("severity, message, created_at, resolved, devices(hostname)").gte("created_at", since).order("created_at", { ascending: false }).limit(500),
    db.from("alerts").select("severity, message, created_at, devices(hostname)").eq("resolved", false).order("created_at", { ascending: false }).limit(500),
    db.from("security_events").select("*", { count: "exact", head: true }).gte("created_at", since)
      .in("event_type", ["blocked_app_killed", "policy_blocked", "malware_detected", "blocked_app_running"]),
    db.from("compliance_snapshots").select("framework, score, device_id, hostname, details"),
  ]);
  const devs = devices ?? [];
  const online = devs.filter(d => d.last_seen && Date.now() - new Date(d.last_seen).getTime() < 15 * 60_000).length;
  const atRisk = devs.filter(d => d.firewall_enabled === false || (d.os_type !== "windows" && (d.filevault_enabled === false || d.sip_enabled === false)));
  const open = openAlerts ?? [];
  const bySev = (list: { severity: string }[]) => ["critical", "high", "medium", "low"].map(k =>
    [k, list.filter(a => (a.severity === "warning" ? "medium" : a.severity === "info" ? "low" : a.severity) === k).length] as const);
  const frameworks = new Map<string, number[]>();
  for (const sn of snaps ?? []) frameworks.set(sn.framework, [...(frameworks.get(sn.framework) ?? []), Number(sn.score ?? 0)]);
  const compliance = [...frameworks.entries()].map(([f, scores]) => [f, Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)] as const);

  const kpi = (label: string, value: unknown, color = "#0b1324") =>
    `<td style="padding:12px 14px;border:1px solid #e2e7ef;border-radius:6px;width:25%"><div style="font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#5b6984">${esc(label)}</div><div style="font-size:24px;font-weight:600;color:${color};margin-top:4px">${esc(value)}</div></td>`;
  const sevPill = (s: string) => `<span style="display:inline-block;padding:1px 7px;border-radius:4px;font-size:11px;font-weight:600;color:#fff;background:${SEV_COLOR[s] ?? "#64748b"}">${esc(s === "warning" ? "medium" : s)}</span>`;
  const alertRows = (list: { severity: string; message: string; created_at: string; devices?: { hostname?: string } | null }[], n = 15) =>
    list.slice(0, n).map(a => `<tr><td style="padding:6px 8px;border-top:1px solid #edf0f5">${sevPill(a.severity)}</td><td style="padding:6px 8px;border-top:1px solid #edf0f5;color:#0b1324">${esc(a.message)}</td><td style="padding:6px 8px;border-top:1px solid #edf0f5;color:#5b6984;white-space:nowrap">${esc(a.devices?.hostname ?? "")}</td></tr>`).join("");
  const table = (head: string[], body: string) => `<table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:8px"><thead><tr>${head.map(h => `<th style="text-align:left;padding:6px 8px;font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#5b6984;background:#f7f9fc">${h}</th>`).join("")}</tr></thead><tbody>${body || `<tr><td colspan="${head.length}" style="padding:10px 8px;color:#5b6984">Nothing to report.</td></tr>`}</tbody></table>`;
  const h2 = (t: string) => `<h2 style="font-size:15px;margin:28px 0 4px;color:#0b1324">${t}</h2>`;

  let body = `<table style="width:100%;border-collapse:separate;border-spacing:8px 0;margin:0 -8px"><tr>
    ${kpi("Endpoints online", `${online} / ${devs.length}`)}${kpi("Open alerts", open.length, open.length ? "#e11d48" : "#059669")}
    ${kpi(`Blocked (${days}d)`, blocked ?? 0, "#2557d6")}${kpi("At-risk devices", atRisk.length, atRisk.length ? "#ea580c" : "#059669")}</tr></table>`;

  if (s.report_type === "executive" || s.report_type === "alerts") {
    body += h2(`Alerts raised in the last ${days === 1 ? "24 hours" : `${days} days`}`) +
      `<p style="margin:0;color:#3b475e;font-size:13px">${(periodAlerts ?? []).length} raised · ${(periodAlerts ?? []).filter(a => a.resolved).length} resolved · open by severity: ${bySev(open).map(([k, n]) => `${k} ${n}`).join(" · ")}</p>` +
      table(["Severity", "Detection", "Device"], alertRows((s.report_type === "alerts" ? periodAlerts : open) ?? [], s.report_type === "alerts" ? 100 : 10));
  }
  if (s.report_type === "executive" || s.report_type === "compliance") {
    body += h2("Compliance") + table(["Framework", "Average score"],
      compliance.map(([f, sc]) => `<tr><td style="padding:6px 8px;border-top:1px solid #edf0f5">${esc(f)}</td><td style="padding:6px 8px;border-top:1px solid #edf0f5;font-weight:600;color:${sc >= 90 ? "#059669" : sc >= 70 ? "#ca8a04" : "#e11d48"}">${sc}%</td></tr>`).join(""));
    if (s.report_type === "compliance") {
      const failing = (snaps ?? []).filter(sn => Number(sn.score) < 100).slice(0, 50);
      body += h2("Devices with failing controls") + table(["Framework", "Device", "Score", "Failing controls"],
        failing.map(sn => `<tr><td style="padding:6px 8px;border-top:1px solid #edf0f5">${esc(sn.framework)}</td><td style="padding:6px 8px;border-top:1px solid #edf0f5">${esc(sn.hostname ?? devs.find(d => d.id === sn.device_id)?.hostname ?? "")}</td><td style="padding:6px 8px;border-top:1px solid #edf0f5">${esc(sn.score)}%</td><td style="padding:6px 8px;border-top:1px solid #edf0f5;color:#5b6984">${esc(((sn.details ?? []) as { control_id: string; pass: boolean }[]).filter(c => !c.pass).map(c => c.control_id).join(", "))}</td></tr>`).join(""));
    }
  }
  if (s.report_type === "executive" || s.report_type === "devices") {
    const list = s.report_type === "devices" ? devs : atRisk;
    body += h2(s.report_type === "devices" ? "Device inventory" : "At-risk devices") + table(["Device", "User", "OS", "Issues", "Last seen"],
      list.map(d => {
        const issues = [d.firewall_enabled === false && "Firewall off", d.os_type !== "windows" && d.filevault_enabled === false && "FileVault off",
          d.os_type !== "windows" && d.sip_enabled === false && "SIP off", d.os_type !== "windows" && d.gatekeeper_enabled === false && "Gatekeeper off"].filter(Boolean).join(", ");
        return `<tr><td style="padding:6px 8px;border-top:1px solid #edf0f5;color:#0b1324">${esc(d.hostname)}</td><td style="padding:6px 8px;border-top:1px solid #edf0f5">${esc(d.assigned_user ?? "")}</td><td style="padding:6px 8px;border-top:1px solid #edf0f5">${esc(`${d.os_type === "windows" ? "Windows" : "macOS"} ${d.os_version ?? ""}`)}</td><td style="padding:6px 8px;border-top:1px solid #edf0f5;color:${issues ? "#ea580c" : "#059669"}">${esc(issues || "None")}</td><td style="padding:6px 8px;border-top:1px solid #edf0f5;color:#5b6984;white-space:nowrap">${esc(d.last_seen ? new Date(d.last_seen).toISOString().slice(0, 16).replace("T", " ") + " UTC" : "never")}</td></tr>`;
      }).join(""));
  }

  const title = `${s.name}`;
  const html = `<!doctype html><html><body style="margin:0;background:#f3f5f9;font-family:-apple-system,Segoe UI,Inter,Arial,sans-serif">
  <div style="max-width:760px;margin:0 auto;padding:24px">
    <div style="background:#0b1220;color:#eef2fa;padding:18px 22px;border-radius:8px 8px 0 0">
      <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#8c9ab8">SparrowShield · ${esc(s.frequency)} report</div>
      <div style="font-size:20px;font-weight:600;margin-top:4px">${esc(title)}</div>
      <div style="font-size:12px;color:#8c9ab8;margin-top:2px">Generated ${new Date().toUTCString()}</div>
    </div>
    <div style="background:#fff;padding:22px;border:1px solid #e2e7ef;border-top:0;border-radius:0 0 8px 8px">${body}
      <p style="margin-top:28px"><a href="${CONSOLE}" style="display:inline-block;background:#2557d6;color:#fff;text-decoration:none;padding:9px 14px;border-radius:6px;font-size:13px;font-weight:600">Open the console</a></p>
    </div>
    <p style="font-size:11px;color:#66748f;text-align:center;margin-top:14px">You receive this because you are on the “${esc(s.name)}” schedule in SparrowShield.</p>
  </div></body></html>`;

  const slack = `*${title}* (${s.frequency})\n• Endpoints online: ${online}/${devs.length}\n• Open alerts: ${open.length} (${bySev(open).filter(([, n]) => n).map(([k, n]) => `${n} ${k}`).join(", ") || "none"})\n• Blocked in period: ${blocked ?? 0}\n• At-risk devices: ${atRisk.length}` +
    (compliance.length ? `\n• Compliance: ${compliance.map(([f, sc]) => `${f} ${sc}%`).join(", ")}` : "") + `\n<${CONSOLE}|Open the console>`;
  return { subject: `[SparrowShield] ${title} — ${new Date().toISOString().slice(0, 10)}`, html, slack };
}

async function deliver(db: Db, s: Schedule) {
  const report = await buildReport(db, s);
  const sent: string[] = [];
  const problems: string[] = [];
  if (s.recipients?.length) {
    const key = await getSecret(db, "resend_api_key");
    if (!key) problems.push("email skipped — no Resend API key (Settings → Integrations)");
    else {
      const { data: st } = await db.from("integration_status").select("settings").eq("name", "email").maybeSingle();
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: (st?.settings as { from?: string } | null)?.from ?? "SparrowShield <onboarding@resend.dev>",
          to: s.recipients, subject: report.subject, html: report.html }),
      });
      if (r.ok) sent.push(`email to ${s.recipients.length}`); else problems.push(`email failed: ${(await r.text()).slice(0, 150)}`);
    }
  }
  if (s.send_slack) {
    const { data: hook } = await db.from("config").select("value").eq("key", "slack_webhook_url").maybeSingle();
    const url = typeof hook?.value === "string" ? hook.value : (hook?.value as { url?: string } | null)?.url;
    if (!url) problems.push("Slack skipped — no webhook in Settings");
    else {
      const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: report.slack }) });
      if (r.ok) sent.push("Slack"); else problems.push(`Slack failed (${r.status})`);
    }
  }
  const ok = sent.length > 0 && problems.length === 0;
  const message = [sent.length ? `Sent: ${sent.join(", ")}` : "Nothing sent", ...problems].join(" · ");
  const { data: next } = await db.rpc("report_next_run", { freq: s.frequency, dow: s.day_of_week, hr: s.hour_utc });
  await db.from("report_schedules").update({ last_run_at: new Date().toISOString(), last_status: ok ? "ok" : sent.length ? "partial" : "error",
    last_message: message, next_run_at: next }).eq("id", s.id);
  return { id: s.id, ok, message };
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  const db = getSupabase();
  const caller = await authorize(req, db);
  if (!caller) return json({ error: "Not allowed" }, 403);
  const body = await req.json().catch(() => ({})) as { schedule_id?: string };

  let schedules: Schedule[] = [];
  if (body.schedule_id) {
    if (caller.kind !== "admin") return json({ error: "Admins only" }, 403);
    const { data } = await db.from("report_schedules").select("*").eq("id", body.schedule_id);
    schedules = (data ?? []) as Schedule[];
  } else {
    const { data } = await db.from("report_schedules").select("*").eq("enabled", true).lte("next_run_at", new Date().toISOString());
    schedules = (data ?? []) as Schedule[];
  }
  const results = [];
  for (const s of schedules) {
    try { results.push(await deliver(db, s)); }
    catch (e) { results.push({ id: s.id, ok: false, message: e instanceof Error ? e.message : String(e) }); }
  }
  return json({ ran: results.length, results });
});
