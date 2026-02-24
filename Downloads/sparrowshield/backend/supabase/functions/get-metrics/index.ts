import { handleCors } from "../_shared/cors.ts";
import { success, failure } from "../_shared/response.ts";
import { getSupabase } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "GET") {
    return failure("Method not allowed", 405);
  }

  const url = new URL(req.url);
  const deviceId = url.searchParams.get("device_id");
  let hours = parseInt(url.searchParams.get("hours") ?? "24", 10);
  if (Number.isNaN(hours) || hours < 1) hours = 24;
  if (hours > 168) hours = 168;

  if (!deviceId) {
    return failure("Missing required query parameter: device_id", 400);
  }

  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("metrics")
    .select("*")
    .eq("device_id", deviceId)
    .gte("timestamp", since)
    .order("timestamp", { ascending: false });

  if (error) {
    return failure(error.message, 500);
  }

  return success(data ?? []);
});
