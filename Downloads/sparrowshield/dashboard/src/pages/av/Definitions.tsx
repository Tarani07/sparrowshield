import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { BookOpen, CheckCircle2 } from "lucide-react";

interface Rule {
  rule_id: string;
  name: string;
  description: string;
  severity: string;
  mitre_id: string | null;
  enabled: boolean;
}

const AV_RULE_IDS = [
  "crypto_miner_process", "malicious_app_installed", "tunneling_tool_detected",
  "shell_on_port", "suspicious_port", "high_cpu_non_system",
];

export default function Definitions() {
  const { data: rules = [], isLoading } = useQuery<Rule[]>({
    queryKey: ["av-definitions"],
    queryFn: async () => {
      const { data } = await supabase
        .from("detection_rules")
        .select("rule_id, name, description, severity, mitre_id, enabled")
        .in("rule_id", AV_RULE_IDS)
        .order("severity");
      return data ?? [];
    },
  });

  const severityColor: Record<string, string> = {
    critical: "#f87171", high: "#fb923c", warning: "#fbbf24", info: "#94a3b8",
  };

  return (
    <div className="p-6 space-y-6" style={{ color: "#c8d0e8" }}>
      <div>
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <BookOpen className="w-5 h-5" style={{ color: "#a5b4fc" }} />
          AV Definitions
        </h1>
        <p className="text-sm mt-1" style={{ color: "#4b5270" }}>
          Active threat signature definitions used by the antivirus engine
        </p>
      </div>

      <div className="rounded-xl overflow-hidden" style={{ background: "#13141a", border: "1px solid rgba(255,255,255,0.05)" }}>
        <div className="px-5 py-3 flex items-center gap-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
          <CheckCircle2 className="w-4 h-4" style={{ color: "#4ade80" }} />
          <span className="text-sm font-semibold text-white">Signature Database</span>
          <span className="ml-auto text-xs px-2 py-0.5 rounded"
            style={{ background: "rgba(34,197,94,0.1)", color: "#4ade80" }}>
            {rules.filter(r => r.enabled).length} active
          </span>
        </div>

        {isLoading ? (
          <div className="p-8 text-center" style={{ color: "#4b5270" }}>Loading definitions…</div>
        ) : (
          <div className="divide-y" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
            {rules.map(rule => (
              <div key={rule.rule_id} className="px-5 py-4 flex items-start gap-4">
                <div className="mt-1 w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: severityColor[rule.severity] ?? "#94a3b8" }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-white">{rule.name}</span>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase"
                      style={{ background: `${severityColor[rule.severity]}18`, color: severityColor[rule.severity] }}>
                      {rule.severity}
                    </span>
                    {rule.mitre_id && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-mono"
                        style={{ background: "rgba(99,102,241,0.1)", color: "#a5b4fc" }}>
                        {rule.mitre_id}
                      </span>
                    )}
                  </div>
                  <p className="text-xs mt-1" style={{ color: "#4b5270" }}>{rule.description}</p>
                  <p className="text-[10px] mt-1 font-mono" style={{ color: "#2d3252" }}>{rule.rule_id}</p>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded flex-shrink-0 ${rule.enabled ? "text-green-400" : "text-slate-600"}`}
                  style={{ background: rule.enabled ? "rgba(34,197,94,0.08)" : "rgba(255,255,255,0.04)" }}>
                  {rule.enabled ? "ACTIVE" : "DISABLED"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
