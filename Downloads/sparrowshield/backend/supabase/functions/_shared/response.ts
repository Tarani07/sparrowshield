import { corsHeaders } from "./cors.ts";

export function jsonResponse(
  body: { success: boolean; data?: unknown; error?: string | null },
  status = 200
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function success<T>(data: T, status = 200): Response {
  return jsonResponse({ success: true, data, error: null }, status);
}

export function failure(error: string, status = 400): Response {
  return jsonResponse({ success: false, data: null, error }, status);
}
