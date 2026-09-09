import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { BellRing, CheckCircle2, Clock, Filter } from "lucide-react";

interface Alert {
  id: string;
  hostname: string;
  alert_type: string;
  severity: string;
  message: string;
  rule_id: string | null;
  mitre_technique: string | null;
  created_at: string;
  resolved: boolean;
}

const SEVERITY_ORDER = ["critical", "high", "warning", "info"];

export default function Detections() {
  const [filter, setFilter] = useState<"all" | "open" | "resolved">("open");
  const qc = useQueryClient();

  const { data: alerts = [], isLoading } = useQuery<Alert[]>({
    queryKey: ["edr-detections", filter],
    queryFn: async () => {
      let q = supabase
        .from("alerts")
        .select("id, hostname, alert_type, severity, message, rule_id, mitre_technique, created_at, resolved")
        .order("created_at", { ascending: false })
        .limit(200);
      if (filter === "open") q = q.eq("resolved", false);
      if (filter === "resolved") q = q.eq("resolved", true);
      const { data } = await q;
      return (data ?? []).sort((a, b) =>
        SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity)
      );
    },
    refetchInterval: 20_000,
  });

  const resolve = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("alerts").update({ resolved: true, resolved_at: new Date().toISOString() }).eq("id", id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["edr-detections"] }),
  });

  const severityColor: Record<string, string> = {
    critical: "#f87171", high: "#fb923c", warning: "#fbbf24", info: "#94a3b8",
  };

  const counts = {
    open: alerts.filter(a => !a.resolved).length,
    critical: alerts.filter(a => !a.resolved && a.severity === "critical").length,
  };

  return (
    <div className="p-6 space-y-6" style={{ color: "#c8d0e8" }}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <BellRing className="w-5 h-5" style={{ color: "#f87171" }} />
            EDR Detections
          </h1>
          <p className="text-sm mt-1" style={{ color: "#4b5270" }}>
            MITRE ATT&CK–tagged alerts from the detection engine
          </p>
        </div>
        <div className="flex items-center gap-1 p-1 rounded-lg" style={{ background: "#13141a", border: "1px solid rgba(255,255,255,0.05)" }}>
          {(["all","open","resolved"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className="px-3 py-1.5 rounded-md text-xs font-medium capitalize transition-all"
              style={filter === f
                ? { background: "rgba(99,102,241,0.2)", color: "#a5b4fc" }
                : { color: "#4b5270" }
              }>
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl p-4" style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.12)" }}>
          <p className="text-[11px] uppercase tracking-wider" style={{ color: "#f87171" }}>Open Alerts</p>
          <p className="text-3xl font-bold mt-1" style={{ color: "#f87171" }}>{counts.open}</p>
        </div>
        <div className="rounded-xl p-4" style={{ background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.08)" }}>
          <p className="text-[11px] uppercase tracking-wider" style={{ color: "#fb923c" }}>Critical</p>
          <p className="text-3xl font-bold mt-1" style={{ color: "#fb923c" }}>{counts.critical}</p>
        </div>
      </div>

      {/* Alert list */}
      <div className="rounded-xl overflow-hidden" style={{ background: "#13141a", border: "1px solid rgba(255,255,255,0.05)" }}>
        <div className="px-5 py-3 flex items-center gap-2" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
          <Filter className="w-4 h-4" style={{ color: "#4b5270" }} />
          <span className="text-sm font-semibold text-white capitalize">{filter} Detections</span>
          <span className="ml-auto text-xs" style={{ color: "#4b5270" }}>{alerts.length} results</span>
        </div>

        {isLoading ? (
          <div className="p-8 text-center" style={{ color: "#4b5270" }}>Loading…</div>
        ) : alerts.length === 0 ? (
          <div className="p-10 text-center">
            <CheckCircle2 className="w-10 h-10 mx-auto mb-3" style={{ color: "#4ade80" }} />
            <p className="text-sm font-medium text-white">No detections</p>
            <p className="text-xs mt-1" style={{ color: "#4b5270" }}>All clear for the selected filter</p>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
            {alerts.map(alert => (
              <div key={alert.id} className="px-5 py-4 flex items-start gap-4 group">
                <div className="mt-1.5 w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: alert.resolved ? "#334155" : severityColor[alert.severity] }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-white">
                      {alert.alert_type.replace(/_/g, " ")}
                    </span>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase"
                      style={{ background: `${severityColor[alert.severity]}18`, color: severityColor[alert.severity] }}>
                      {alert.severity}
                    </span>
                    {alert.mitre_technique && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-mono"
                        style={{ background: "rgba(99,102,241,0.1)", color: "#a5b4fc" }}>
                        {alert.mitre_technique}
                      </span>
                    )}
                    <span className="text-xs" style={{ color: "#4b5270" }}>{alert.hostname}</span>
                  </div>
                  <p className="text-xs mt-1" style={{ color: "#4b5270" }}>{alert.message}</p>
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <div className="flex items-center gap-1 text-[11px]" style={{ color: "#2d3252" }}>
                    <Clock className="w-3 h-3" />
                    {new Date(alert.created_at).toLocaleString()}
                  </div>
                  {!alert.resolved && (
                    <button
                      onClick={() => resolve.mutate(alert.id)}
                      className="text-[11px] px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ background: "rgba(34,197,94,0.1)", color: "#4ade80" }}>
                      Resolve
                    </button>
                  )}
                  {alert.resolved && (
                    <span className="text-[11px]" style={{ color: "#4ade80" }}>Resolved</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
