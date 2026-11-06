import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Device-Token",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const url = new URL(req.url);
  const deviceId = url.searchParams.get("device_id");
  const platform = url.searchParams.get("platform") || "all";

  // Rules that apply to all devices OR this specific device, filtered by platform
  let query = supabase
    .from("block_rules")
    .select("pattern, rule_type, action, severity, mitre_id, name")
    .eq("enabled", true)
    .or(`platform.eq.all,platform.eq.${platform}`);

  if (deviceId) {
    query = query.or(`device_id.is.null,device_id.eq.${deviceId}`);
  } else {
    query = query.is("device_id", null);
  }

  const { data, error } = await query;

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...CORS },
    });
  }

  const rules = data ?? [];
  const blockPatterns = rules.filter(r => r.action === "block").map(r => r.pattern);
  const alertPatterns = rules.filter(r => r.action === "alert").map(r => r.pattern);

  return new Response(
    JSON.stringify({ block: blockPatterns, alert: alertPatterns, rules }),
    { headers: { "Content-Type": "application/json", ...CORS } }
  );
});
