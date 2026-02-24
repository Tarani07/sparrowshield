import { handleCors } from "../_shared/cors.ts";
import { success, failure } from "../_shared/response.ts";
import { getSupabase } from "../_shared/supabase.ts";
import { hashToken } from "../_shared/auth.ts";

interface SoftwareItem {
  app_name: string;
  version: string;
}

interface ProcessItem {
  process_name: string;
  cpu_pct?: number;
  ram_mb?: number;
}

interface InventoryBody {
  software?: SoftwareItem[];
  processes?: ProcessItem[];
}

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  if (req.method !== "POST") {
    return failure("Method not allowed", 405);
  }

  const auth = req.headers.get("Authorization");
  if (!auth?.startsWith("Bearer ")) {
    return failure("Missing or invalid Authorization header", 401);
  }
  const rawToken = auth.slice(7).trim();
  if (!rawToken) {
    return failure("Missing Bearer token", 401);
  }

  let body: InventoryBody;
  try {
    body = await req.json();
  } catch {
    return failure("Invalid JSON body", 400);
  }

  const tokenHash = await hashToken(rawToken);
  const supabase = getSupabase();

  const { data: tokenRow, error: tokenErr } = await supabase
    .from("api_tokens")
    .select("device_id")
    .eq("token_hash", tokenHash)
    .eq("revoked", false)
    .single();

  if (tokenErr || !tokenRow) {
    return failure("Invalid or revoked token", 401);
  }

  const deviceId = tokenRow.device_id;
  const software = body.software ?? [];
  const processes = body.processes ?? [];

  if (software.length > 0) {
    for (const item of software) {
      if (!item.app_name) continue;
      await supabase.from("software_inventory").upsert(
        {
          device_id: deviceId,
          app_name: item.app_name,
          version: item.version ?? null,
          last_seen: new Date().toISOString(),
        },
        { onConflict: "device_id,app_name" }
      );
    }
  }

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  await supabase
    .from("processes")
    .delete()
    .eq("device_id", deviceId)
    .lt("timestamp", oneHourAgo);

  if (processes.length > 0) {
    const now = new Date().toISOString();
    const rows = processes.map((p) => ({
      device_id: deviceId,
      timestamp: now,
      process_name: p.process_name ?? "",
      cpu_pct: p.cpu_pct ?? null,
      ram_mb: p.ram_mb ?? null,
    }));
    await supabase.from("processes").insert(rows);
  }

  return success({ ok: true });
});
