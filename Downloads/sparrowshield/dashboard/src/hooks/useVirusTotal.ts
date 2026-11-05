import { useState } from "react";

export interface VTResult {
  hash: string;
  malicious: number;
  suspicious: number;
  harmless: number;
  undetected: number;
  total: number;
  name: string;
  type: string;
  size: number;
  firstSeen: string;
  lastSeen: string;
  reputation: number;
  error?: string;
}

export function useVirusTotalLookup() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VTResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const apiKey = localStorage.getItem("vt_api_key") ?? "";

  async function lookup(hash: string) {
    if (!hash || hash.length < 32) {
      setError("Invalid hash");
      return;
    }
    if (!apiKey) {
      setError("No VirusTotal API key configured. Add it in Settings → Integrations.");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const resp = await fetch(`https://www.virustotal.com/api/v3/files/${hash}`, {
        headers: { "x-apikey": apiKey },
      });
      if (!resp.ok) {
        if (resp.status === 404) throw new Error("File not found in VirusTotal database.");
        if (resp.status === 401) throw new Error("Invalid API key — check Settings → Integrations.");
        throw new Error(`VirusTotal error ${resp.status}`);
      }
      const json = await resp.json();
      const a = json.data?.attributes;
      const stats = a?.last_analysis_stats ?? {};
      setResult({
        hash,
        malicious:  stats.malicious  ?? 0,
        suspicious: stats.suspicious ?? 0,
        harmless:   stats.harmless   ?? 0,
        undetected: stats.undetected ?? 0,
        total:      Object.values(stats as Record<string, number>).reduce((s, v) => s + v, 0),
        name:       a?.meaningful_name ?? a?.names?.[0] ?? hash.slice(0, 16),
        type:       a?.type_description ?? "",
        size:       a?.size ?? 0,
        firstSeen:  a?.first_submission_date ? new Date(a.first_submission_date * 1000).toISOString().split("T")[0] : "",
        lastSeen:   a?.last_analysis_date    ? new Date(a.last_analysis_date    * 1000).toISOString().split("T")[0] : "",
        reputation: a?.reputation ?? 0,
      });
    } catch (err: any) {
      setError(err.message ?? "Lookup failed");
    }
    setLoading(false);
  }

  return { lookup, loading, result, error, hasKey: !!apiKey };
}
