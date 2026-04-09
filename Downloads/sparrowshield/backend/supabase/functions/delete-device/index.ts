import { handleCors } from "../_shared/cors.ts";
import { success, failure } from "../_shared/response.ts";
import { getSupabase } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "DELETE") return failure("Method not allowed", 405);

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
