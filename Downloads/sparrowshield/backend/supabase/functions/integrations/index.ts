// Save / test / remove integration credentials. Secrets go to internal_secrets (service role only);
// non-secret status goes to integration_status so the console can show it.
import { handleCors, corsHeaders } from "../_shared/cors.ts";
import { getSupabase } from "../_shared/supabase.ts";
import { authorize, getSecret } from "../_shared/guard.ts";
import { jcGet } from "../_shared/jumpcloud.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  const db = getSupabase();
  const caller = await authorize(req, db);
  if (!caller || caller.kind !== "admin") return json({ error: "Only admins can manage integrations" }, 403);

  let body: Record<string, string | undefined>;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const setSecret = (name: string, value: string) =>
    db.from("internal_secrets").upsert({ name, value, updated_at: new Date().toISOString() });
  const setStatus = (name: string, patch: Record<string, unknown>) =>
    db.from("integration_status").upsert({ name, ...patch, updated_at: new Date().toISOString() });
  const audit = (summary: string) => db.from("audit_log").insert({
    actor_id: caller.id, actor_email: caller.email, action: "UPDATE", table_name: "integrations", record_id: body.action, summary,
    changes: { action: body.action },
  });

  try {
    switch (body.action) {
      case "save_jumpcloud": {
        const apiKey = (body.api_key ?? "").trim() || (await getSecret(db, "jumpcloud_api_key")) || "";
        const orgId = (body.org_id ?? "").trim() || null;
        if (!apiKey) return json({ error: "Enter your JumpCloud API key" }, 400);
        // Prove the key works before saving it.
        const res = await jcGet<{ totalCount: number }>("/systems?limit=1&fields=hostname", apiKey, orgId);
        await setSecret("jumpcloud_api_key", apiKey);
        await setStatus("jumpcloud", { configured: true, settings: { org_id: orgId }, last_status: "ok",
          last_message: `Connected — ${res.totalCount ?? 0} systems in JumpCloud` });
        await audit("Connected JumpCloud");
        return json({ ok: true, systems: res.totalCount ?? 0 });
      }
      case "remove_jumpcloud": {
        await db.from("internal_secrets").delete().eq("name", "jumpcloud_api_key");
        await db.from("jumpcloud_systems").delete().neq("jc_id", "");
        await setStatus("jumpcloud", { configured: false, last_status: null, last_message: "Disconnected", last_sync_at: null });
        await audit("Disconnected JumpCloud");
        return json({ ok: true });
      }
      case "save_email": {
        const key = (body.resend_api_key ?? "").trim();
        const from = (body.from ?? "").trim() || "SparrowShield <onboarding@resend.dev>";
        if (key) await setSecret("resend_api_key", key);
        const has = !!(key || (await getSecret(db, "resend_api_key")));
        await setStatus("email", { configured: has, settings: { from }, last_status: has ? "ok" : null,
          last_message: has ? "Email sending configured" : "Add a Resend API key" });
        await audit("Updated email settings");
        return json({ ok: true, configured: has });
      }
      case "test_email": {
        const key = await getSecret(db, "resend_api_key");
        if (!key) return json({ error: "Save a Resend API key first" }, 400);
        const { data: st } = await db.from("integration_status").select("settings").eq("name", "email").maybeSingle();
        const r = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: (st?.settings as { from?: string } | null)?.from ?? "SparrowShield <onboarding@resend.dev>",
            to: [body.to ?? caller.email], subject: "SparrowShield test email",
            html: "<p>Email delivery from SparrowShield is working. Scheduled reports will arrive from this address.</p>",
          }),
        });
        if (!r.ok) return json({ error: `Resend: ${(await r.text()).slice(0, 200)}` }, 400);
        return json({ ok: true });
      }
      case "remove_email": {
        await db.from("internal_secrets").delete().eq("name", "resend_api_key");
        await setStatus("email", { configured: false, last_status: null, last_message: "Email disabled" });
        await audit("Removed email settings");
        return json({ ok: true });
      }
      default:
        return json({ error: "Unknown action" }, 400);
    }
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 400);
  }
});
