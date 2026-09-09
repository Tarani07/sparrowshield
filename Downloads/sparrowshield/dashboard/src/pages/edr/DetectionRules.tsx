import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { ListChecks, ToggleRight } from "lucide-react";

interface Rule {
  rule_id: string;
  name: string;
  description: string;
  severity: string;
  mitre_id: string | null;
  mitre_name: string | null;
  enabled: boolean;
  created_at: string;
}

export default function DetectionRules() {
  const { data: rules = [], isLoading } = useQuery<Rule[]>({
    queryKey: ["detection-rules"],
    queryFn: async () => {
      const { data } = await supabase
        .from("detection_rules")
        .select("*")
        .order("severity");
      return data ?? [];
    },
  });

  const severityColor: Record<string, string> = {
    critical: "#f87171", high: "#fb923c", warning: "#fbbf24", info: "#94a3b8",
  };

  const groups = ["critical", "high", "warning", "info"].map(s => ({
    severity: s,
    rules: rules.filter(r => r.severity === s),
  })).filter(g => g.rules.length > 0);

  return (
    <div className="p-6 space-y-6" style={{ color: "#c8d0e8" }}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <ListChecks className="w-5 h-5" style={{ color: "#a5b4fc" }} />
            Detection Rules
          </h1>
          <p className="text-sm mt-1" style={{ color: "#4b5270" }}>
            All active detection rules with MITRE ATT&CK mappings
          </p>
        </div>
        <div className="text-sm px-3 py-1.5 rounded-lg"
          style={{ background: "rgba(99,102,241,0.1)", color: "#a5b4fc", border: "1px solid rgba(99,102,241,0.2)" }}>
          {rules.filter(r => r.enabled).length} / {rules.length} active
        </div>
      </div>

      {isLoading ? (
        <div className="p-8 text-center" style={{ color: "#4b5270" }}>Loading rules…</div>
      ) : (
        <div className="space-y-4">
          {groups.map(({ severity, rules: grpRules }) => (
            <div key={severity} className="rounded-xl overflow-hidden"
              style={{ background: "#13141a", border: "1px solid rgba(255,255,255,0.05)" }}>
              <div className="px-5 py-3 flex items-center gap-3"
                style={{ borderBottom: "1px solid rgba(255,255,255,0.05)", background: `${severityColor[severity]}08` }}>
                <div className="w-2 h-2 rounded-full" style={{ background: severityColor[severity] }} />
                <span className="text-xs font-bold uppercase tracking-wider" style={{ color: severityColor[severity] }}>
                  {severity}
                </span>
                <span className="text-xs" style={{ color: "#4b5270" }}>{grpRules.length} rules</span>
              </div>
              <div className="divide-y" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
                {grpRules.map(rule => (
                  <div key={rule.rule_id} className="px-5 py-4 flex items-start gap-4">
                    <ToggleRight className="w-4 h-4 mt-0.5 flex-shrink-0"
                      style={{ color: rule.enabled ? "#4ade80" : "#334155" }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-white">{rule.name}</span>
                        {rule.mitre_id && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded font-mono"
                            style={{ background: "rgba(99,102,241,0.1)", color: "#a5b4fc" }}>
                            {rule.mitre_id}
                          </span>
                        )}
                      </div>
                      <p className="text-xs mt-0.5" style={{ color: "#4b5270" }}>{rule.description}</p>
                      {rule.mitre_name && (
                        <p className="text-[11px] mt-1" style={{ color: "#2d3252" }}>
                          Tactic: {rule.mitre_name}
                        </p>
                      )}
                    </div>
                    <code className="text-[10px] font-mono flex-shrink-0 mt-0.5" style={{ color: "#2d3252" }}>
                      {rule.rule_id}
                    </code>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
