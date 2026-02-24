import { handleCors } from "../_shared/cors.ts";
import { success, failure } from "../_shared/response.ts";
import { getSupabase } from "../_shared/supabase.ts";

const ADMIN_SECRET = Deno.env.get("FLEETPULSE_ADMIN_SECRET") ?? "";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return failure("Method not allowed", 405);
  }

  const auth = req.headers.get("Authorization");
  const hasAdminAuth =
    ADMIN_SECRET &&
    (auth === `Bearer ${ADMIN_SECRET}` ||
      auth === `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`);

  if (!hasAdminAuth) {
    return failure("Unauthorized: admin access required", 403);
  }

  let body: { key?: string; value?: unknown };
  try {
    body = await req.json();
  } catch {
    return failure("Invalid JSON body", 400);
  }

  const { key, value } = body;
  if (!key || value === undefined) {
    return failure("Missing required fields: key, value", 400);
  }

  const supabase = getSupabase();
  const { error } = await supabase.from("config").upsert(
    { key, value },
    { onConflict: "key" }
  );

  if (error) {
    return failure(error.message, 500);
  }

  return success({ key, updated: true });
});
