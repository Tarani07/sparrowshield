import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { Trash2, ShieldCheck, Clock } from "lucide-react";

interface QuarantineRow {
  id: string;
  hostname: string;
  alert_type: string;
  severity: string;
  message: string;
  created_at: string;
  resolved_at: string | null;
}

export default function Quarantine() {
  const { data: items = [], isLoading } = useQuery<QuarantineRow[]>({
    queryKey: ["quarantine"],
    queryFn: async () => {
      const { data } = await supabase
        .from("alerts")
        .select("id, hostname, alert_type, severity, message, created_at, resolved_at")
        .eq("resolved", true)
        .in("alert_type", ["crypto_miner_process", "malicious_app_installed", "tunneling_tool_detected", "shell_on_port"])
        .order("resolved_at", { ascending: false })
        .limit(100);
      return data ?? [];
    },
    refetchInterval: 60_000,
  });

  return (
    <div className="p-6 space-y-6" style={{ color: "#c8d0e8" }}>
      <div>
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <Trash2 className="w-5 h-5" style={{ color: "#fbbf24" }} />
          Quarantine
        </h1>
        <p className="text-sm mt-1" style={{ color: "#4b5270" }}>
          Threats that were detected and auto-resolved by the agent
        </p>
      </div>

      <div className="rounded-xl overflow-hidden" style={{ background: "#13141a", border: "1px solid rgba(255,255,255,0.05)" }}>
        <div className="px-5 py-3 flex items-center gap-2" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
          <ShieldCheck className="w-4 h-4" style={{ color: "#4ade80" }} />
          <span className="text-sm font-semibold text-white">Quarantined Items</span>
          <span className="ml-auto text-xs" style={{ color: "#4b5270" }}>{items.length} total</span>
        </div>

        {isLoading ? (
          <div className="p-8 text-center" style={{ color: "#4b5270" }}>Loading…</div>
        ) : items.length === 0 ? (
          <div className="p-10 text-center">
            <Trash2 className="w-10 h-10 mx-auto mb-3" style={{ color: "#4b5270" }} />
            <p className="text-sm font-medium text-white">Quarantine is empty</p>
            <p className="text-xs mt-1" style={{ color: "#4b5270" }}>Resolved threats will appear here</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                {["Threat", "Severity", "Device", "Detected", "Resolved"].map(h => (
                  <th key={h} className="px-5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider"
                    style={{ color: "#2d3252" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
              {items.map(item => (
                <tr key={item.id}>
                  <td className="px-5 py-3 font-medium text-white">{item.alert_type.replace(/_/g, " ")}</td>
                  <td className="px-5 py-3">
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase"
                      style={{
                        background: item.severity === "critical" ? "rgba(239,68,68,0.12)" : "rgba(245,158,11,0.1)",
                        color: item.severity === "critical" ? "#f87171" : "#fbbf24",
                      }}>
                      {item.severity}
                    </span>
                  </td>
                  <td className="px-5 py-3" style={{ color: "#94a3b8" }}>{item.hostname}</td>
                  <td className="px-5 py-3 text-xs" style={{ color: "#4b5270" }}>
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {new Date(item.created_at).toLocaleDateString()}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-xs" style={{ color: "#4ade80" }}>
                    {item.resolved_at ? new Date(item.resolved_at).toLocaleDateString() : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
