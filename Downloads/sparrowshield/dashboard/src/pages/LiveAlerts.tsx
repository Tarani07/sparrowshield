import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, CheckCircle, Shield } from "lucide-react";
import TopBar from "../components/layout/TopBar";
import { supabase } from "../lib/supabase";
import { timeAgo } from "../lib/utils";

/* ── Types ── */
interface LiveAlert {
  id: string;
  alert_type: string | null;
  severity: string | null;
  severity_id?: number | null;
  message: string | null;
  resolved: boolean;
  created_at: string | null;
  resolved_at: string | null;
  device_id: string | null;
  cmdline?: string | null;
  file_path?: string | null;
  dst_ip?: string | null;
  rule_name?: string | null;
  devices?: { hostname: string | null } | null;
}

/* ── Helpers ── */
function severityNum(a: LiveAlert): number {
  if (a.severity_id != null) return a.severity_id;
  switch (a.severity) {
    case "critical": return 5;
    case "high":     return 4;
    case "medium":   return 3;
    case "low":      return 2;
    default:         return 1;
  }
}

function leftBorderColor(a: LiveAlert): string {
  const sev = severityNum(a);
  if (sev >= 5) return "#ef4444"; // red / critical
  if (sev >= 4) return "#f97316"; // orange / high
  if (sev >= 3) return "#eab308"; // yellow / medium
  return "#6b7280";
}

function severityBadgeStyle(a: LiveAlert): React.CSSProperties {
  const sev = severityNum(a);
  if (sev >= 5) return { background: "rgba(239,68,68,0.15)",   color: "#ef4444" };
  if (sev >= 4) return { background: "rgba(249,115,22,0.15)",  color: "#f97316" };
  if (sev >= 3) return { background: "rgba(234,179,8,0.15)",   color: "#eab308" };
  return               { background: "rgba(107,114,128,0.12)", color: "#9ca3af" };
}

function severityLabel(a: LiveAlert): string {
  if (a.severity) return a.severity.charAt(0).toUpperCase() + a.severity.slice(1);
  const sev = severityNum(a);
  switch (sev) {
    case 5: return "Critical";
    case 4: return "High";
    case 3: return "Medium";
    case 2: return "Low";
    default: return "Info";
  }
}

/* ── Hero stat card ── */
function StatCard({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div style={{
      background: "var(--c-card)",
      border: "1px solid var(--c-border)",
      borderRadius: 20,
      padding: "20px 24px",
      flex: 1,
      minWidth: 0,
    }}>
      <p style={{ fontSize: 12, color: "var(--c-muted)", marginBottom: 8 }}>{label}</p>
      <p style={{ fontSize: 44, fontWeight: 800, lineHeight: 1, letterSpacing: "-1px", color: accent ?? "var(--c-strong)" }}>
        {value}
      </p>
    </div>
  );
}

/* ── Single alert card ── */
function AlertCard({ alert, onResolve }: { alert: LiveAlert; onResolve: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const borderColor = leftBorderColor(alert);
  const hasDetails = alert.cmdline || alert.file_path || alert.dst_ip;

  return (
    <div style={{
      background: "var(--c-card)",
      border: "1px solid var(--c-border)",
      borderLeft: `4px solid ${borderColor}`,
      borderRadius: "0 16px 16px 0",
      overflow: "hidden",
    }}>
      {/* Main row */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px" }}>

        {/* Expand chevron */}
        {hasDetails ? (
          <button onClick={() => setOpen(v => !v)} style={{ color: "var(--c-muted)", flexShrink: 0 }}>
            {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          </button>
        ) : (
          <span style={{ width: 15, flexShrink: 0 }} />
        )}

        {/* Alert info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: "var(--c-strong)", marginBottom: 3 }}>
            {alert.rule_name ?? alert.alert_type?.replace(/_/g, " ") ?? "Unknown Alert"}
          </p>
          <p style={{ fontSize: 11, color: "var(--c-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {alert.devices?.hostname ?? alert.device_id ?? "Unknown device"}
            {alert.created_at ? ` · ${timeAgo(alert.created_at)}` : ""}
          </p>
        </div>

        {/* Severity badge */}
        <span style={{
          fontSize: 10, fontWeight: 700,
          padding: "3px 10px", borderRadius: 20,
          flexShrink: 0,
          ...severityBadgeStyle(alert),
        }}>
          {severityLabel(alert)}
        </span>

        {/* Resolve button */}
        <button
          onClick={() => onResolve(alert.id)}
          className="text-xs font-semibold rounded-xl transition-all"
          style={{
            padding: "6px 14px",
            background: "var(--c-primary-bg)",
            color: "var(--c-primary)",
            border: "1px solid var(--c-primary)",
            flexShrink: 0,
          }}
          onMouseEnter={e => { e.currentTarget.style.background = "var(--c-primary)"; e.currentTarget.style.color = "#fff"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "var(--c-primary-bg)"; e.currentTarget.style.color = "var(--c-primary)"; }}
        >
          Resolve
        </button>
      </div>

      {/* Expanded details */}
      {open && hasDetails && (
        <div style={{
          padding: "10px 16px 14px 43px",
          borderTop: "1px solid var(--c-faint)",
          background: "var(--c-bg)",
        }}>
          {alert.cmdline && (
            <div style={{ marginBottom: 6 }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: "var(--c-muted)", textTransform: "uppercase" }}>Command</span>
              <p style={{ fontFamily: "monospace", fontSize: 11, color: "var(--c-strong)", wordBreak: "break-all", marginTop: 2 }}>
                {alert.cmdline}
              </p>
            </div>
          )}
          {alert.file_path && (
            <div style={{ marginBottom: 6 }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: "var(--c-muted)", textTransform: "uppercase" }}>File Path</span>
              <p style={{ fontFamily: "monospace", fontSize: 11, color: "var(--c-strong)", wordBreak: "break-all", marginTop: 2 }}>
                {alert.file_path}
              </p>
            </div>
          )}
          {alert.dst_ip && (
            <div>
              <span style={{ fontSize: 10, fontWeight: 600, color: "var(--c-muted)", textTransform: "uppercase" }}>Destination IP</span>
              <p style={{ fontFamily: "monospace", fontSize: 11, color: "var(--c-strong)", marginTop: 2 }}>
                {alert.dst_ip}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function LiveAlerts() {
  const qc = useQueryClient();

  /* ── Initial fetch ── */
  const { data: initialAlerts = [], isLoading } = useQuery<LiveAlert[]>({
    queryKey: ["live-alerts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("alerts")
        .select("id, alert_type, severity, message, resolved, created_at, resolved_at, device_id, devices(hostname)")
        .eq("resolved", false)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as LiveAlert[];
    },
  });

  /* ── Live stream (prepend new alerts) ── */
  const [streamAlerts, setStreamAlerts] = useState<LiveAlert[]>([]);

  useEffect(() => {
    const channel = supabase
      .channel("live-alerts")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "alerts" },
        payload => {
          setStreamAlerts(prev => [payload.new as LiveAlert, ...prev]);
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "edr_events" },
        payload => {
          const row = payload.new as Record<string, unknown>;
          const sevId = typeof row.severity_id === "number" ? row.severity_id : 0;
          if (sevId >= 4) {
            const synth: LiveAlert = {
              id: `edr-${row.id ?? Date.now()}`,
              alert_type: "edr_detection",
              severity: sevId >= 5 ? "critical" : "high",
              severity_id: sevId,
              message: null,
              resolved: false,
              created_at: typeof row.event_time === "string" ? row.event_time : new Date().toISOString(),
              resolved_at: null,
              device_id: typeof row.device_uid === "string" ? row.device_uid : null,
              cmdline: typeof row.cmdline === "string" ? row.cmdline : null,
              file_path: typeof row.image_path === "string" ? row.image_path : null,
              rule_name: typeof row.process_name === "string" ? `EDR: ${row.process_name}` : "EDR Detection",
            };
            setStreamAlerts(prev => [synth, ...prev]);
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  /* ── Resolve ── */
  const resolveMut = useMutation({
    mutationFn: async (alertId: string) => {
      if (alertId.startsWith("edr-")) return; // synthetic, skip DB write
      const { error } = await supabase
        .from("alerts")
        .update({ resolved: true, resolved_at: new Date().toISOString() })
        .eq("id", alertId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["live-alerts"] }),
  });

  function handleResolve(id: string) {
    resolveMut.mutate(id);
    setStreamAlerts(prev => prev.filter(a => a.id !== id));
  }

  /* ── Merge stream + initial ── */
  const allAlerts: LiveAlert[] = [
    ...streamAlerts,
    ...initialAlerts.filter(a => !streamAlerts.some(s => s.id === a.id)),
  ];

  /* ── Stats ── */
  const openCount     = allAlerts.length;
  const criticalCount = allAlerts.filter(a => severityNum(a) >= 5).length;
  const highCount     = allAlerts.filter(a => severityNum(a) === 4).length;

  const { data: resolvedToday = 0 } = useQuery<number>({
    queryKey: ["alerts-resolved-today"],
    queryFn: async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const { count } = await supabase
        .from("alerts")
        .select("*", { count: "exact", head: true })
        .eq("resolved", true)
        .gte("resolved_at", today.toISOString());
      return count ?? 0;
    },
    refetchInterval: 30_000,
  });

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--c-bg)" }}>
      <TopBar title="Live Alerts" />

      <div className="flex-1 overflow-y-auto p-6 space-y-5">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: "var(--c-strong)" }}>
              Live Alerts
            </h1>
            <p className="text-sm mt-1" style={{ color: "var(--c-muted)" }}>
              Real-time security alert stream via Supabase Realtime.
            </p>
          </div>

          {/* Live indicator */}
          <div className="flex items-center gap-2">
            <span style={{
              width: 8, height: 8, borderRadius: "50%",
              background: "#22c55e",
              boxShadow: "0 0 0 3px rgba(34,197,94,0.25)",
              animation: "pulse 2s infinite",
            }} />
            <style>{`@keyframes pulse{0%,100%{box-shadow:0 0 0 3px rgba(34,197,94,0.25)}50%{box-shadow:0 0 0 7px rgba(34,197,94,0.1)}}`}</style>
            <span className="text-xs font-bold" style={{ color: "#22c55e" }}>Live</span>
          </div>
        </div>

        {/* Hero stats */}
        <div className="flex gap-4">
          <StatCard label="Open Alerts"   value={openCount}     accent={openCount > 0 ? "#ef4444" : undefined} />
          <StatCard label="Critical"       value={criticalCount} accent={criticalCount > 0 ? "#ef4444" : undefined} />
          <StatCard label="High"           value={highCount}     accent={highCount > 0 ? "#f97316" : undefined} />
          <StatCard label="Resolved Today" value={resolvedToday} />
        </div>

        {/* Alert list */}
        <div className="space-y-3">
          {isLoading ? (
            <div className="py-16 text-center text-sm" style={{ color: "var(--c-muted)" }}>
              Loading alerts…
            </div>
          ) : allAlerts.length === 0 ? (
            <div className="rounded-2xl py-20 text-center"
              style={{ background: "var(--c-card)", border: "1px solid var(--c-border)" }}>
              <CheckCircle size={36} className="mx-auto mb-3" style={{ color: "#22c55e" }} />
              <p className="text-base font-bold" style={{ color: "var(--c-strong)" }}>No open alerts — all clear</p>
              <p className="text-xs mt-1" style={{ color: "var(--c-muted)" }}>
                Realtime subscription is active. New alerts will appear here instantly.
              </p>
            </div>
          ) : (
            allAlerts.map(alert => (
              <AlertCard key={alert.id} alert={alert} onResolve={handleResolve} />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
