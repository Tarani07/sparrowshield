// Console user management: list / invite / change role / remove.
// Only console admins may call it; the last admin can never be removed or demoted.
import { handleCors, corsHeaders } from "../_shared/cors.ts";
import { getSupabase } from "../_shared/supabase.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const db = getSupabase();
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: { user }, error: authErr } = await db.auth.getUser(jwt);
  if (authErr || !user) return json({ error: "Not signed in" }, 401);

  const { data: me } = await db.from("console_users").select("role").eq("user_id", user.id).maybeSingle();
  if (me?.role !== "admin") return json({ error: "Only admins can manage users" }, 403);

  let body: { action?: string; email?: string; role?: string; user_id?: string };
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const audit = (action: string, record: string, summary: string, changes: unknown) =>
    db.from("audit_log").insert({ actor_id: user.id, actor_email: user.email, action, table_name: "console_users", record_id: record, summary, changes });

  const adminCount = async () =>
    (await db.from("console_users").select("*", { count: "exact", head: true }).eq("role", "admin")).count ?? 0;

  switch (body.action) {
    case "list": {
      const { data, error } = await db.from("console_users").select("user_id, email, role, created_at, last_seen_at").order("email");
      if (error) return json({ error: error.message }, 500);
      return json({ users: data });
    }

    case "invite": {
      const email = (body.email ?? "").trim().toLowerCase();
      const role = body.role === "admin" ? "admin" : "viewer";
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: "Enter a valid email address" }, 400);
      // Create the auth user if needed (email OTP sign-in requires an existing user).
      let userId: string | undefined;
      const { data: created, error: cErr } = await db.auth.admin.createUser({ email, email_confirm: true });
      if (created?.user) userId = created.user.id;
      else {
        const { data: list } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
        userId = list?.users.find(u => (u.email ?? "").toLowerCase() === email)?.id;
        if (!userId) return json({ error: cErr?.message ?? "Could not create user" }, 500);
      }
      const { error } = await db.from("console_users").upsert({ user_id: userId, email, role, created_by: user.id }, { onConflict: "user_id" });
      if (error) return json({ error: error.message }, 500);
      await audit("INSERT", userId, email, { email, role });
      return json({ ok: true, user_id: userId });
    }

    case "set_role": {
      const role = body.role === "admin" ? "admin" : "viewer";
      const { data: target } = await db.from("console_users").select("email, role").eq("user_id", body.user_id ?? "").maybeSingle();
      if (!target) return json({ error: "User not found" }, 404);
      if (target.role === "admin" && role !== "admin" && (await adminCount()) <= 1)
        return json({ error: "There must be at least one admin" }, 400);
      const { error } = await db.from("console_users").update({ role }).eq("user_id", body.user_id!);
      if (error) return json({ error: error.message }, 500);
      await audit("UPDATE", body.user_id!, target.email, { role: [target.role, role] });
      return json({ ok: true });
    }

    case "remove": {
      const { data: target } = await db.from("console_users").select("email, role").eq("user_id", body.user_id ?? "").maybeSingle();
      if (!target) return json({ error: "User not found" }, 404);
      if (target.role === "admin" && (await adminCount()) <= 1)
        return json({ error: "You cannot remove the last admin" }, 400);
      // Remove console access; the sign-in account is deleted too so they can't log in at all.
      const { error } = await db.from("console_users").delete().eq("user_id", body.user_id!);
      if (error) return json({ error: error.message }, 500);
      await db.auth.admin.deleteUser(body.user_id!);
      await audit("DELETE", body.user_id!, target.email, { email: target.email, role: target.role });
      return json({ ok: true });
    }

    default:
      return json({ error: "Unknown action" }, 400);
  }
});
