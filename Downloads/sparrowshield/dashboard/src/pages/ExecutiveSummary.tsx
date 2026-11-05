import { useQuery } from "@tanstack/react-query";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { Shield, Printer, AlertTriangle, Monitor, CheckCircle, XCircle, Activity } from "lucide-react";
import TopBar from "../components/layout/TopBar";
import { supabase } from "../lib/supabase";

function timeAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function KpiTile({ label, value, sub, icon: Icon, color }: {
  label: string; value: string | number; sub?: string;
  icon: React.ElementType; color: string;
}) {
  return (
    <div className="rounded-2xl p-6 flex flex-col gap-3" style={{ background: "var(--c-card-bg, var(--c-bg))", border: "1px solid var(--c-border)" }}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium" style={{ color: "var(--c-muted)" }}>{label}</span>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: color + "20" }}>
          <Icon className="w-4 h-4" style={{ color }} />
        </div>
      </div>
      <div>
        <p className="text-4xl font-bold tracking-tight" style={{ color: "var(--c-strong)" }}>{value}</p>
        {sub && <p className="text-xs mt-1" style={{ color: "var(--c-muted)" }}>{sub}</p>}
      </div>
    </div>
  );
}

const SEVERITY_COLOR: Record<string, string> = {
  critical: "#ef4444",
  high: "#f97316",
  warning: "#f59e0b",
  medium: "#f59e0b",
  low: "#22c55e",
  info: "#60a5fa",
};

export default function ExecutiveSummary() {
  const { data: devices = [] } = useQuery({
    queryKey: ["exec-devices"],
    queryFn: async () => {
      const { data } = await supabase.from("devices").select("id, status, cis_score_pct, os_type");
      return data ?? [];
    },
  });

  const { data: alerts = [] } = useQuery({
    queryKey: ["exec-alerts"],
    queryFn: async () => {
      const { data } = await supabase
        .from("alerts")
        .select("id, severity, alert_type, message, created_at, device_id")
        .eq("resolved", false)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const { data: threatCount = 0 } = useQuery({
    queryKey: ["exec-threats"],
    queryFn: async () => {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { count } = await supabase
        .from("edr_events")
        .select("*", { count: "exact", head: true })
        .gte("created_at", since);
      return count ?? 0;
    },
  });

  const total = devices.length;
  const online = devices.filter((d: any) => d.status === "online").length;
  const offline = total - online;
  const onlinePct = total > 0 ? Math.round((online / total) * 100) : 0;

  const cisScores = devices.map((d: any) => d.cis_score_pct).filter((v: any) => v != null) as number[];
  const avgCis = cisScores.length > 0 ? Math.round(cisScores.reduce((a, b) => a + b, 0) / cisScores.length) : 0;
  const compliantCount = devices.filter((d: any) => (d.cis_score_pct ?? 0) >= 80).length;
  const atRiskCount = total - compliantCount;

  const compliancePie = [
    { name: "Compliant", value: compliantCount, color: "#22c55e" },
    { name: "At Risk", value: atRiskCount, color: "#ef4444" },
  ];

  // Risk tiers by cis_score_pct
  const lowRisk = devices.filter((d: any) => (d.cis_score_pct ?? 100) >= 80).length;
  const medRisk = devices.filter((d: any) => { const s = d.cis_score_pct ?? 100; return s >= 50 && s < 80; }).length;
  const highRisk = devices.filter((d: any) => (d.cis_score_pct ?? 100) < 50).length;

  const criticalAlerts = alerts.filter((a: any) => a.severity === "critical").slice(0, 5);

  const generatedAt = new Date().toLocaleString();

  return (
    <div className="flex flex-col min-h-screen" style={{ background: "var(--c-bg)" }}>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; color: black !important; }
        }
      `}</style>

      <div className="no-print">
        <TopBar title="Executive Summary" />
      </div>

      <div className="flex-1 p-6 space-y-6 max-w-6xl mx-auto w-full">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, #1B5E37, #2E7D52)" }}>
                <Shield className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold" style={{ color: "var(--c-strong)" }}>Executive Summary</h1>
                <p className="text-sm" style={{ color: "var(--c-muted)" }}>Security posture overview for leadership</p>
              </div>
            </div>
            <p className="text-xs mt-2" style={{ color: "var(--c-faint, var(--c-muted))" }}>Generated: {generatedAt}</p>
          </div>
          <button
            onClick={() => window.print()}
            className="no-print flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all"
            style={{ background: "var(--c-primary, #1B5E37)", color: "#fff" }}
            onMouseEnter={e => (e.currentTarget.style.opacity = "0.85")}
            onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
          >
            <Printer className="w-4 h-4" />
            Export PDF
          </button>
        </div>

        {/* KPI tiles */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KpiTile label="Total Devices" value={total} sub="enrolled" icon={Monitor} color="#60a5fa" />
          <KpiTile label="Compliance Score" value={`${avgCis}%`} sub={`${compliantCount} of ${total} compliant`} icon={CheckCircle} color="#22c55e" />
          <KpiTile label="Open Alerts" value={alerts.length} sub={`${criticalAlerts.length} critical`} icon={AlertTriangle} color="#f59e0b" />
          <KpiTile label="Threat Events (7d)" value={threatCount} sub="EDR detections" icon={Activity} color="#a78bfa" />
        </div>

        {/* Middle row: Compliance donut + Risk breakdown */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Compliance donut */}
          <div className="rounded-2xl p-6" style={{ background: "var(--c-card-bg, var(--c-bg))", border: "1px solid var(--c-border)" }}>
            <h2 className="text-sm font-semibold mb-4" style={{ color: "var(--c-strong)" }}>Compliance Breakdown</h2>
            {total === 0 ? (
              <div className="flex items-center justify-center h-40 text-sm" style={{ color: "var(--c-muted)" }}>No devices enrolled</div>
            ) : (
              <div className="flex items-center gap-6">
                <ResponsiveContainer width={160} height={160}>
                  <PieChart>
                    <Pie data={compliancePie} cx={75} cy={75} innerRadius={45} outerRadius={70} dataKey="value" strokeWidth={0}>
                      {compliancePie.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Tooltip formatter={(v: any) => [`${v} devices`]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-3">
                  <div className="text-center">
                    <p className="text-3xl font-bold" style={{ color: "var(--c-strong)" }}>{avgCis}%</p>
                    <p className="text-xs" style={{ color: "var(--c-muted)" }}>avg CIS score</p>
                  </div>
                  {compliancePie.map(e => (
                    <div key={e.name} className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: e.color }} />
                      <span className="text-sm" style={{ color: "var(--c-muted)" }}>{e.name}: <strong style={{ color: "var(--c-strong)" }}>{e.value}</strong></span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Risk breakdown */}
          <div className="rounded-2xl p-6" style={{ background: "var(--c-card-bg, var(--c-bg))", border: "1px solid var(--c-border)" }}>
            <h2 className="text-sm font-semibold mb-4" style={{ color: "var(--c-strong)" }}>Risk Breakdown</h2>
            <div className="space-y-3">
              {[
                { label: "Low Risk", value: lowRisk, color: "#22c55e", bg: "#22c55e15", desc: "CIS ≥ 80%" },
                { label: "Medium Risk", value: medRisk, color: "#f59e0b", bg: "#f59e0b15", desc: "CIS 50–79%" },
                { label: "High Risk", value: highRisk, color: "#ef4444", bg: "#ef444415", desc: "CIS < 50%" },
              ].map(r => (
                <div key={r.label} className="flex items-center justify-between p-3 rounded-xl" style={{ background: r.bg }}>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: r.color }}>{r.label}</p>
                    <p className="text-xs" style={{ color: "var(--c-muted)" }}>{r.desc}</p>
                  </div>
                  <span className="text-2xl font-bold" style={{ color: r.color }}>{r.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Fleet health bar */}
        <div className="rounded-2xl p-6" style={{ background: "var(--c-card-bg, var(--c-bg))", border: "1px solid var(--c-border)" }}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold" style={{ color: "var(--c-strong)" }}>Fleet Health</h2>
            <span className="text-sm" style={{ color: "var(--c-muted)" }}>
              {online} online · {offline} offline · {total} total
            </span>
          </div>
          <div className="w-full h-4 rounded-full overflow-hidden" style={{ background: "var(--c-border2, #374151)" }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${onlinePct}%`, background: "linear-gradient(90deg, #22c55e, #16a34a)" }}
            />
          </div>
          <div className="flex items-center gap-4 mt-2">
            <span className="flex items-center gap-1.5 text-xs" style={{ color: "#22c55e" }}>
              <span className="w-2 h-2 rounded-full bg-green-500" /> Online ({onlinePct}%)
            </span>
            <span className="flex items-center gap-1.5 text-xs" style={{ color: "var(--c-muted)" }}>
              <span className="w-2 h-2 rounded-full" style={{ background: "var(--c-border2, #374151)" }} /> Offline ({100 - onlinePct}%)
            </span>
          </div>
        </div>

        {/* Critical alerts table */}
        <div className="rounded-2xl p-6" style={{ background: "var(--c-card-bg, var(--c-bg))", border: "1px solid var(--c-border)" }}>
          <h2 className="text-sm font-semibold mb-4" style={{ color: "var(--c-strong)" }}>Recent Critical Alerts</h2>
          {criticalAlerts.length === 0 ? (
            <div className="flex items-center gap-2 py-6 justify-center text-sm" style={{ color: "var(--c-muted)" }}>
              <CheckCircle className="w-4 h-4 text-green-500" /> No critical alerts — fleet is healthy
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--c-border)" }}>
                    {["Severity", "Type", "Message", "When"].map(h => (
                      <th key={h} className="text-left pb-2 pr-4 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--c-muted)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {criticalAlerts.map((a: any) => (
                    <tr key={a.id} style={{ borderBottom: "1px solid var(--c-border)" }}>
                      <td className="py-3 pr-4">
                        <span className="px-2 py-0.5 rounded text-xs font-bold uppercase" style={{ background: (SEVERITY_COLOR[a.severity] ?? "#6b7280") + "20", color: SEVERITY_COLOR[a.severity] ?? "#6b7280" }}>
                          {a.severity}
                        </span>
                      </td>
                      <td className="py-3 pr-4" style={{ color: "var(--c-strong)" }}>{a.alert_type?.replace(/_/g, " ")}</td>
                      <td className="py-3 pr-4 max-w-xs truncate" style={{ color: "var(--c-muted)" }}>{a.message}</td>
                      <td className="py-3 text-xs whitespace-nowrap" style={{ color: "var(--c-muted)" }}>{a.created_at ? timeAgo(a.created_at) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="text-center pb-6">
          <p className="text-xs" style={{ color: "var(--c-muted)" }}>SparrowShield Security Platform · {generatedAt}</p>
        </div>
      </div>
    </div>
  );
}
