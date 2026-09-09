import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { ScanLine, ShieldCheck, AlertTriangle, Clock, RefreshCw } from "lucide-react";

interface ThreatRow {
  id: string;
  hostname: string;
  alert_type: string;
  severity: string;
  message: string;
  created_at: string;
  resolved: boolean;
}

export default function AVScanner() {
  const [scanning, setScanning] = useState(false);

  const { data: threats = [], isLoading, refetch } = useQuery<ThreatRow[]>({
    queryKey: ["av-threats"],
    queryFn: async () => {
      const { data } = await supabase
        .from("alerts")
        .select("id, hostname, alert_type, severity, message, created_at, resolved")
        .in("alert_type", ["crypto_miner_process", "malicious_app_installed", "tunneling_tool_detected", "shell_on_port"])
        .order("created_at", { ascending: false })
        .limit(50);
      return data ?? [];
    },
    refetchInterval: 30_000,
  });

  const active = threats.filter(t => !t.resolved);
  const resolved = threats.filter(t => t.resolved);

  function handleScan() {
    setScanning(true);
    setTimeout(() => { setScanning(false); refetch(); }, 2000);
  }

  const severityColor: Record<string, string> = {
    critical: "#f87171",
    high: "#fb923c",
    warning: "#fbbf24",
    info: "#94a3b8",
  };

  return (
    <div className="p-6 space-y-6" style={{ color: "#c8d0e8" }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <ScanLine className="w-5 h-5" style={{ color: "#4ade80" }} />
            Threat Scanner
          </h1>
          <p className="text-sm mt-1" style={{ color: "#4b5270" }}>
            Real-time AV threat detections from all enrolled endpoints
          </p>
        </div>
        <button
          onClick={handleScan}
          disabled={scanning}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
          style={{ background: "rgba(34,197,94,0.12)", color: "#4ade80", border: "1px solid rgba(34,197,94,0.2)" }}
        >
          <RefreshCw className={`w-4 h-4 ${scanning ? "animate-spin" : ""}`} />
          {scanning ? "Scanning…" : "Scan Now"}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Active Threats", value: active.length, color: "#f87171", bg: "rgba(239,68,68,0.08)" },
          { label: "Resolved",       value: resolved.length, color: "#4ade80", bg: "rgba(34,197,94,0.08)" },
          { label: "Total Scanned",  value: threats.length,  color: "#a5b4fc", bg: "rgba(99,102,241,0.08)" },
        ].map(s => (
          <div key={s.label} className="rounded-xl p-4" style={{ background: s.bg, border: `1px solid ${s.color}18` }}>
            <p className="text-[11px] uppercase tracking-wider" style={{ color: s.color }}>{s.label}</p>
            <p className="text-3xl font-bold mt-1" style={{ color: s.color }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Threat List */}
      <div className="rounded-xl overflow-hidden" style={{ background: "#13141a", border: "1px solid rgba(255,255,255,0.05)" }}>
        <div className="px-5 py-3 flex items-center gap-2" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
          <AlertTriangle className="w-4 h-4" style={{ color: "#f87171" }} />
          <span className="text-sm font-semibold text-white">Active Threats</span>
          {active.length > 0 && (
            <span className="ml-auto px-2 py-0.5 rounded text-[10px] font-bold"
              style={{ background: "rgba(239,68,68,0.15)", color: "#f87171" }}>
              {active.length}
            </span>
          )}
        </div>

        {isLoading ? (
          <div className="p-8 text-center" style={{ color: "#4b5270" }}>Loading…</div>
        ) : active.length === 0 ? (
          <div className="p-10 text-center">
            <ShieldCheck className="w-10 h-10 mx-auto mb-3" style={{ color: "#4ade80" }} />
            <p className="text-sm font-medium" style={{ color: "#4ade80" }}>No active threats detected</p>
            <p className="text-xs mt-1" style={{ color: "#4b5270" }}>All endpoints are clean</p>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
            {active.map(t => (
              <div key={t.id} className="px-5 py-3 flex items-start gap-4">
                <div className="mt-0.5 w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: severityColor[t.severity] ?? "#94a3b8" }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-white">{t.alert_type.replace(/_/g, " ")}</span>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase"
                      style={{ background: `${severityColor[t.severity]}18`, color: severityColor[t.severity] }}>
                      {t.severity}
                    </span>
                    <span className="text-xs" style={{ color: "#4b5270" }}>{t.hostname}</span>
                  </div>
                  <p className="text-xs mt-0.5" style={{ color: "#4b5270" }}>{t.message}</p>
                </div>
                <div className="flex items-center gap-1 text-xs flex-shrink-0" style={{ color: "#2d3252" }}>
                  <Clock className="w-3 h-3" />
                  {new Date(t.created_at).toLocaleTimeString()}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Resolved */}
      {resolved.length > 0 && (
        <div className="rounded-xl overflow-hidden" style={{ background: "#13141a", border: "1px solid rgba(255,255,255,0.05)" }}>
          <div className="px-5 py-3 flex items-center gap-2" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
            <ShieldCheck className="w-4 h-4" style={{ color: "#4ade80" }} />
            <span className="text-sm font-semibold text-white">Resolved Threats</span>
            <span className="ml-auto px-2 py-0.5 rounded text-[10px] font-bold"
              style={{ background: "rgba(34,197,94,0.1)", color: "#4ade80" }}>
              {resolved.length}
            </span>
          </div>
          <div className="divide-y" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
            {resolved.slice(0, 10).map(t => (
              <div key={t.id} className="px-5 py-3 flex items-start gap-4 opacity-60">
                <div className="mt-0.5 w-2 h-2 rounded-full flex-shrink-0 bg-slate-600" />
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-white line-through">{t.alert_type.replace(/_/g, " ")}</span>
                  <span className="ml-2 text-xs" style={{ color: "#4b5270" }}>{t.hostname}</span>
                </div>
                <span className="text-xs" style={{ color: "#4ade80" }}>Resolved</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
