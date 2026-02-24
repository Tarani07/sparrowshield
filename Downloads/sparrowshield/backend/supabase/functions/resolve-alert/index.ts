import { handleCors } from "../_shared/cors.ts";
import { success, failure } from "../_shared/response.ts";
import { getSupabase } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return failure("Method not allowed", 405);
  }

  let body: { alert_id?: string };
  try {
    body = await req.json();
  } catch {
    return failure("Invalid JSON body", 400);
  }

  const alertId = body.alert_id;
  if (!alertId) {
    return failure("Missing required field: alert_id", 400);
  }

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("alerts")
    .update({
      resolved: true,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", alertId)
    .select("id")
    .single();

  if (error) {
    return failure(error.message, 500);
  }
  if (!data) {
    return failure("Alert not found", 404);
  }

  return success({ resolved: true, alert_id: alertId });
});
