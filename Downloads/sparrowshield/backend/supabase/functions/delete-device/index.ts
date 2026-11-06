import { handleCors } from "../_shared/cors.ts";
import { success, failure } from "../_shared/response.ts";
import { getSupabase } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "DELETE") return failure("Method not allowed", 405);

  // Require an authenticated dashboard user — agents (anon key) must not delete devices
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return failure("Unauthorized", 401);
  }
  const token = authHeader.replace("Bearer ", "");
  const adminClient = getSupabase();
  const { data: { user }, error: authError } = await adminClient.auth.getUser(token);
  if (authError || !user) {
    return failure("Invalid or expired session", 403);
  }

  const url = new URL(req.url);
  const deviceId = url.searchParams.get("id");
  if (!deviceId) return failure("Missing device id", 400);

  const supabase = getSupabase();

  const { error } = await supabase
    .from("devices")
    .delete()
    .eq("id", deviceId);

  if (error) return failure(error.message, 500);

  return success({ deleted: true, device_id: deviceId });
});
