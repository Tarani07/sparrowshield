// Minimal JumpCloud API client (v1 systems + v2 System Insights).
export const JC_BASE = "https://console.jumpcloud.com/api";

export function jcHeaders(apiKey: string, orgId?: string | null): HeadersInit {
  const h: Record<string, string> = { "x-api-key": apiKey, Accept: "application/json", "Content-Type": "application/json" };
  if (orgId) h["x-org-id"] = orgId;
  return h;
}

export async function jcGet<T = unknown>(path: string, apiKey: string, orgId?: string | null): Promise<T> {
  const r = await fetch(`${JC_BASE}${path}`, { headers: jcHeaders(apiKey, orgId) });
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new Error(r.status === 401 ? "JumpCloud rejected the API key (401)" : `JumpCloud ${r.status}: ${body.slice(0, 200)}`);
  }
  return r.json() as Promise<T>;
}
