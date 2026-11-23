// Who may call privileged functions: a console admin (dashboard) or the database scheduler
// (pg_cron sends the internal cron secret in x-cron-secret).
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type Caller = { kind: "cron" } | { kind: "admin"; id: string; email: string | undefined };

export async function authorize(req: Request, db: SupabaseClient): Promise<Caller | null> {
  const cron = req.headers.get("x-cron-secret");
  if (cron) {
    const { data } = await db.from("internal_secrets").select("value").eq("name", "cron_secret").maybeSingle();
    return data?.value && data.value === cron ? { kind: "cron" } : null;
  }
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: { user } } = await db.auth.getUser(jwt);
  if (!user) return null;
  const { data: me } = await db.from("console_users").select("role").eq("user_id", user.id).maybeSingle();
  return me?.role === "admin" ? { kind: "admin", id: user.id, email: user.email } : null;
}

export async function getSecret(db: SupabaseClient, name: string): Promise<string | null> {
  const { data } = await db.from("internal_secrets").select("value").eq("name", name).maybeSingle();
  return data?.value ?? null;
}
