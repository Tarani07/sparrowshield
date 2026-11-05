import { useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  RefreshCw, Apple, Monitor, Bell, ChevronRight,
  Laptop, Lock, Battery, ClipboardCheck, Package, WifiOff, Ban,
  Shield, Plus, ArrowUpRight, AlertTriangle,
} from "lucide-react";
import TopBar from "../components/layout/TopBar";
import FleetHealthChart from "../components/fleet/FleetHealthChart";
import DeviceTable from "../components/fleet/DeviceTable";
import { useFleetReports } from "../hooks/useHealthReports";
import { useAllDevices } from "../hooks/useDevices";
import { useAlerts } from "../hooks/useAlerts";
import { supabase } from "../lib/supabase";
import { timeAgo } from "../lib/utils";
import type { Device } from "../lib/types";

const G  = "#1B5E37";
const GL = "#E8F5EE";
const GM = "#2E7D52";

function computeDeviceStatus(device: Device): "online" | "offline" {
  if (!device.last_seen) return "offline";
  return (Date.now() - new Date(device.last_seen).getTime()) / 60000 > 15 ? "offline" : "online";
}

/* ── Big Hero Stat Card (Donezo style) ── */
function HeroCard({ label, value, sub, primary, trend }: {
  label: string; value: string | number; sub?: string;
  primary?: boolean; trend?: "up" | "stable";
}) {
  return (
    <div style={{
      background: primary ? G : "var(--c-card)",
      borderRadius: 20,
      padding: "22px 24px",
      flex: 1,
      minWidth: 0,
      border: primary ? "none" : "1px solid var(--c-border)",
      boxShadow: primary ? "0 8px 32px rgba(27,94,55,0.25)" : "none",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{
          fontSize: 13, fontWeight: 500,
          color: primary ? "rgba(255,255,255,0.7)" : "var(--c-muted)",
        }}>{label}</span>
        <div style={{
          width: 28, height: 28, borderRadius: "50%",
          background: primary ? "rgba(255,255,255,0.15)" : GL,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <ArrowUpRight size={13} color={primary ? "#fff" : G} />
        </div>
      </div>
      <div style={{
        fontSize: 54, fontWeight: 800, lineHeight: 1,
        color: primary ? "#fff" : "var(--c-strong)",
        letterSpacing: "-1px",
      }}>{value}</div>
      {sub && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
          <div style={{
            width: 18, height: 18, borderRadius: 6,
            background: primary ? "rgba(255,255,255,0.2)" : GL,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 9, color: primary ? "#fff" : G,
          }}>
            {trend === "up" ? "↑" : "→"}
          </div>
          <span style={{ fontSize: 12, color: primary ? "rgba(255,255,255,0.65)" : "var(--c-muted)" }}>
            {sub}
          </span>
        </div>
      )}
    </div>
  );
}

/* ── Weekly Security Events Bar Chart (Donezo style) ── */
function SecurityEventsChart({ counts }: { counts: number[] }) {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const today = new Date().getDay();
  const max = Math.max(...counts, 1);

  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 128, paddingTop: 28, paddingBottom: 0 }}>
      {counts.map((val, i) => {
        const h = Math.max((val / max) * 100, val > 0 ? 6 : 0);
        const isToday = i === today;
        const isWeekend = i === 0 || i === 6;
        const isHigh = val >= max * 0.65;

        let barStyle: React.CSSProperties;
        if (val === 0) {
          barStyle = {
            background: "repeating-linear-gradient(45deg, var(--c-faint) 0px, var(--c-faint) 1.5px, transparent 1.5px, transparent 6px)",
            border: "1px solid var(--c-border)",
          };
        } else if (isHigh) {
          barStyle = { background: G };
        } else {
          barStyle = { background: GM };
        }

        return (
          <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, position: "relative" }}>
            {isToday && val > 0 && (
              <div style={{
                position: "absolute", top: -26,
                fontSize: 10, fontWeight: 700,
                color: G, background: GL,
                padding: "2px 6px", borderRadius: 6,
                border: `1px solid ${GM}30`,
              }}>
                {val}
              </div>
            )}
            <div style={{ width: "100%", display: "flex", alignItems: "flex-end", height: 100 }}>
              <div style={{
                width: "100%",
                height: val === 0 ? 20 : `${h}%`,
                borderRadius: "8px 8px 4px 4px",
                transition: "height 0.4s ease",
                ...barStyle,
              }} />
            </div>
            <span style={{
              fontSize: 10,
              fontWeight: isToday ? 700 : 400,
              color: isToday ? "var(--c-primary)" : "var(--c-muted)",
            }}>
              {days[i][0]}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ── Compliance Donut (Donezo Project Progress style) ── */
function ComplianceDonut({ passed, total }: { passed: number; total: number }) {
  const pct = total > 0 ? Math.round((passed / total) * 100) : 0;
  const r = 58;
  const circ = 2 * Math.PI * r;
  const filled = (pct / 100) * circ;
  const color = pct >= 80 ? G : pct >= 60 ? "#D97706" : "#DC2626";
  const atRisk = total - passed;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
      <svg width={156} height={156} viewBox="0 0 156 156">
        <circle cx={78} cy={78} r={r} fill="none" stroke="var(--c-faint)" strokeWidth={18} />
        {total > 0 && (
          <circle cx={78} cy={78} r={r} fill="none" stroke={color} strokeWidth={18}
            strokeDasharray={`${filled} ${circ}`}
            strokeLinecap="round"
            transform="rotate(-90 78 78)" />
        )}
        <text x={78} y={72} textAnchor="middle" dominantBaseline="central"
          fontSize={24} fontWeight={800} fill={total > 0 ? color : "var(--c-muted)"}>{pct}%</text>
        <text x={78} y={94} textAnchor="middle" fontSize={10} fill="var(--c-muted)">Compliant Fleet</text>
      </svg>
      <div style={{ display: "flex", gap: 20, justifyContent: "center" }}>
        {[
          { label: "Passing", count: passed, color: G, pattern: false },
          { label: "At Risk", count: atRisk, color: "#DC2626", pattern: true },
        ].map(s => (
          <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{
              width: 10, height: 10, borderRadius: 2, flexShrink: 0,
              background: s.pattern
                ? "repeating-linear-gradient(45deg, #DC2626 0px, #DC2626 2px, transparent 2px, transparent 5px)"
                : s.color,
            }} />
            <span style={{ fontSize: 11, color: "var(--c-muted)" }}>{s.label}</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--c-strong)" }}>{s.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Device Status Row (Team Collaboration style) ── */
function DeviceRow({ device }: { device: Device }) {
  const navigate = useNavigate();
  const status = computeDeviceStatus(device);
  const isMac = ["mac", "macos", "darwin"].includes(device.os_type ?? "");

  return (
    <div
      onClick={() => navigate(`/device/${device.id}`)}
      style={{
        display: "flex", alignItems: "center", gap: 12,
        padding: "10px 0",
        borderBottom: "1px solid var(--c-divider)",
        cursor: "pointer",
      }}
    >
      <div style={{
        width: 38, height: 38, borderRadius: "50%", flexShrink: 0,
        background: isMac ? "rgba(167,139,250,0.12)" : "rgba(96,165,250,0.12)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        {isMac ? <Apple size={17} color="#a78bfa" /> : <Monitor size={17} color="#60a5fa" />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          fontSize: 13, fontWeight: 600, color: "var(--c-strong)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 2,
        }}>{device.hostname ?? "Unknown"}</p>
        <p style={{
          fontSize: 11, color: "var(--c-muted)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {device.assigned_user ?? "unassigned"}{device.last_seen ? ` · ${timeAgo(device.last_seen)}` : ""}
        </p>
      </div>
      <span style={{
        fontSize: 10, fontWeight: 700,
        padding: "3px 10px", borderRadius: 20,
        textTransform: "uppercase", letterSpacing: "0.05em", flexShrink: 0,
        background: status === "online" ? "rgba(34,197,94,0.1)" : "rgba(100,116,139,0.12)",
        color: status === "online" ? "#22c55e" : "#94a3b8",
        border: `1px solid ${status === "online" ? "rgba(34,197,94,0.2)" : "rgba(100,116,139,0.2)"}`,
      }}>{status}</span>
    </div>
  );
}

const FILTERS = [
  { key: "all",      label: "All"      },
  { key: "critical", label: "Critical" },
  { key: "warning",  label: "Warning"  },
  { key: "healthy",  label: "Healthy"  },
  { key: "mac",      label: "Apple"    },
  { key: "windows",  label: "Windows"  },
];

/* ── Fallback device table when no health reports ── */
function FallbackTable({ devices, search }: { devices: Device[]; search: string }) {
  const navigate = useNavigate();
  let rows = devices;
  if (search) {
    const q = search.toLowerCase();
    rows = rows.filter(d => d.hostname?.toLowerCase().includes(q) || d.assigned_user?.toLowerCase().includes(q));
  }
  if (rows.length === 0) return (
    <div className="py-12 text-center text-sm" style={{ color: "var(--c-muted)" }}>No devices match</div>
  );
  return (
    <table className="w-full text-sm">
      <thead>
        <tr style={{ borderBottom: "1px solid var(--c-border)" }}>
          {["Device", "Status", "OS", "Last Seen"].map(h => (
            <th key={h} className="text-left px-4 py-3 text-[11px] font-semibold uppercase tracking-wider"
              style={{ color: "var(--c-muted)" }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map(d => (
          <tr key={d.id} onClick={() => navigate(`/device/${d.id}`)}
            className="cursor-pointer transition-colors"
            style={{ borderBottom: "1px solid var(--c-divider)" }}
            onMouseEnter={e => (e.currentTarget.style.background = "var(--c-bg)")}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
            <td className="px-4 py-3">
              <div className="flex items-center gap-2.5">
                {["mac","macos","darwin"].includes(d.os_type ?? "")
                  ? <Apple className="w-4 h-4" style={{ color: "#a78bfa" }} />
                  : <Monitor className="w-4 h-4" style={{ color: "#60a5fa" }} />}
                <div>
                  <p className="text-xs font-medium" style={{ color: "var(--c-strong)" }}>{d.hostname ?? "—"}</p>
                  <p className="text-[10px]" style={{ color: "var(--c-muted)" }}>{d.assigned_user ?? "unassigned"}</p>
                </div>
              </div>
            </td>
            <td className="px-4 py-3">
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase"
                style={computeDeviceStatus(d) === "online"
                  ? { background: "rgba(34,197,94,0.1)", color: "#22c55e" }
                  : { background: "rgba(100,116,139,0.1)", color: "#94a3b8" }}>
                {computeDeviceStatus(d)}
              </span>
            </td>
            <td className="px-4 py-3 text-xs" style={{ color: "var(--c-muted)" }}>{d.os_version ?? "—"}</td>
            <td className="px-4 py-3 text-[11px] font-mono" style={{ color: "var(--c-muted)" }}>
              {d.last_seen ? timeAgo(d.last_seen) : "—"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function FleetOverview() {
  const [params] = useState(() => new URLSearchParams(window.location.search));
  const navigate = useNavigate();
  const search = params.get("search") ?? "";
  const [filter, setFilter] = useState("all");
  const [refreshKey, setRefreshKey] = useState(0);

  const { data: reports = [], isLoading, refetch, isFetching } = useFleetReports();
  const { data: allDevices = [] } = useAllDevices();
  const { data: recentAlerts = [] } = useAlerts(undefined, false);

  /* ── Weekly security events (last 7 days, grouped by day-of-week) ── */
  const { data: weeklyCounts = [0,0,0,0,0,0,0] } = useQuery<number[]>({
    queryKey: ["security-events-weekly", refreshKey],
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - 7);
      const { data } = await supabase
        .from("security_events")
        .select("occurred_at")
        .gte("occurred_at", since.toISOString());
      const counts = [0,0,0,0,0,0,0];
      (data ?? []).forEach(e => {
        const day = new Date(e.occurred_at).getDay();
        counts[day]++;
      });
      return counts;
    },
    refetchInterval: 60_000,
  });

  /* ── Core fleet metrics ── */
  const total    = allDevices.length;
  const healthy  = reports.filter(r => r.health_status === "healthy").length;
  const warning  = reports.filter(r => r.health_status === "warning").length;
  const critical = reports.filter(r => r.health_status === "critical").length;
  const online   = allDevices.filter(d => computeDeviceStatus(d) === "online").length;
  const offline  = total - online;

  const macDevices = allDevices.filter(d => ["mac","macos","darwin"].includes(d.os_type ?? ""));
  const winDevices = allDevices.filter(d => d.os_type === "windows");

  /* ── Compliance ── */
  const complianceDevices = allDevices.filter(d => {
    const score =
      (d.filevault_enabled  ? 20 : 0) +
      (d.firewall_enabled   ? 20 : 0) +
      (d.sip_enabled        ? 15 : 0) +
      (d.gatekeeper_enabled ? 15 : 0) +
      (d.mdm_enrolled       ? 15 : 0) +
      (d.antivirus_installed ? 15 : 0);
    return score >= 50;
  }).length;

  const avgScore = useMemo(() => {
    if (reports.length === 0) return 0;
    return Math.round(reports.reduce((a, r) => a + (r.health_score ?? 0), 0) / reports.length);
  }, [reports]);

  /* ── Threat level ── */
  const criticalAlerts = recentAlerts.filter(a => a.severity === "critical").length;
  const threatLevel = criticalAlerts > 0 ? "HIGH" : recentAlerts.length > 5 ? "MEDIUM" : "LOW";
  const threatColor = criticalAlerts > 0 ? "#ef4444" : recentAlerts.length > 5 ? "#f59e0b" : "#4ade80";

  const totalEvents = weeklyCounts.reduce((a, b) => a + b, 0);

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--c-bg)" }}>
      <TopBar title="Dashboard" />

      <div className="flex-1 overflow-y-auto p-6 space-y-5">

        {/* ── Header ── */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: "var(--c-strong)" }}>Dashboard</h1>
            <p className="text-sm mt-1" style={{ color: "var(--c-muted)" }}>
              Plan, monitor, and respond to security threats across your fleet.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate("/devices")}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all"
              style={{ background: G }}
              onMouseEnter={e => (e.currentTarget.style.background = GM)}
              onMouseLeave={e => (e.currentTarget.style.background = G)}
            >
              <Plus size={15} /> Add Device
            </button>
            <button
              onClick={() => { refetch(); setRefreshKey(k => k + 1); }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all"
              style={{ background: "var(--c-card)", border: "1px solid var(--c-border)", color: "var(--c-text)" }}
            >
              <RefreshCw size={14} className={isFetching ? "animate-spin" : ""} /> Refresh
            </button>
          </div>
        </div>

        {/* ── Row 1: Hero Stat Cards ── */}
        <div className="flex gap-4">
          <HeroCard label="Total Devices" value={total}         sub="enrolled"         primary trend="up" />
          <HeroCard label="Healthy"       value={healthy}       sub="no issues found"  trend="stable" />
          <HeroCard label="Active Alerts" value={recentAlerts.length} sub="needs attention" trend={recentAlerts.length > 0 ? "up" : "stable"} />
          <HeroCard label="Critical"      value={critical}      sub="action required"  trend={critical > 0 ? "up" : "stable"} />
        </div>

        {/* ── Row 2: Security Events Chart + Recent Alerts ── */}
        <div className="grid grid-cols-5 gap-4">

          {/* Bar chart */}
          <div className="col-span-3 rounded-2xl p-5"
            style={{ background: "var(--c-card)", border: "1px solid var(--c-border)" }}>
            <div className="flex items-start justify-between mb-2">
              <div>
                <h2 className="text-sm font-bold" style={{ color: "var(--c-strong)" }}>Security Events</h2>
                <p className="text-[11px] mt-0.5" style={{ color: "var(--c-muted)" }}>
                  {totalEvents} events this week
                </p>
              </div>
              <div className="flex items-center gap-4 text-[11px]" style={{ color: "var(--c-muted)" }}>
                <span className="flex items-center gap-1.5">
                  <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: G }} />
                  High
                </span>
                <span className="flex items-center gap-1.5">
                  <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: GM }} />
                  Normal
                </span>
                <span className="flex items-center gap-1.5">
                  <span style={{
                    display: "inline-block", width: 10, height: 10, borderRadius: 3,
                    background: "repeating-linear-gradient(45deg, var(--c-faint) 0px, var(--c-faint) 1.5px, transparent 1.5px, transparent 5px)",
                    border: "1px solid var(--c-border2)",
                  }} />
                  No data
                </span>
              </div>
            </div>
            <SecurityEventsChart counts={weeklyCounts} />
          </div>

          {/* Recent Alerts */}
          <div className="col-span-2 rounded-2xl p-5"
            style={{ background: "var(--c-card)", border: "1px solid var(--c-border)" }}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Bell size={15} style={{ color: "#f59e0b" }} />
                <h2 className="text-sm font-bold" style={{ color: "var(--c-strong)" }}>Alerts</h2>
              </div>
              <Link to="/alerts" className="text-[11px] font-semibold"
                style={{ color: "var(--c-primary)" }}>
                View All →
              </Link>
            </div>

            {recentAlerts.length === 0 ? (
              <div className="py-8 text-center">
                <Shield size={28} className="mx-auto mb-2" style={{ color: "var(--c-faint)" }} />
                <p className="text-xs" style={{ color: "var(--c-muted)" }}>No active alerts</p>
              </div>
            ) : (
              <div className="space-y-2">
                {recentAlerts.slice(0, 6).map(alert => (
                  <div key={alert.id}
                    className="flex items-start gap-3 p-2.5 rounded-xl cursor-pointer transition-colors"
                    style={{ background: "var(--c-bg)" }}
                    onMouseEnter={e => (e.currentTarget.style.background = "var(--c-border)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "var(--c-bg)")}
                    onClick={() => alert.device_id && navigate(`/device/${alert.device_id}`)}>
                    <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0"
                      style={{ background: alert.severity === "critical" ? "#ef4444" : "#f59e0b" }} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] font-medium truncate capitalize" style={{ color: "var(--c-strong)" }}>
                        {alert.alert_type?.replace(/_/g, " ")}
                      </p>
                      <p className="text-[10px] truncate" style={{ color: "var(--c-muted)" }}>
                        {(alert as any).devices?.hostname ?? "Unknown"}
                        {alert.created_at ? ` · ${new Date(alert.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}
                      </p>
                    </div>
                    <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded flex-shrink-0"
                      style={alert.severity === "critical"
                        ? { background: "rgba(239,68,68,0.1)", color: "#ef4444" }
                        : { background: "rgba(245,158,11,0.1)", color: "#f59e0b" }}>
                      {alert.severity}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Row 3: Device Status + Compliance Donut + Threat Level ── */}
        <div className="grid grid-cols-5 gap-4">

          {/* Device Status (Team Collaboration style) */}
          <div className="col-span-2 rounded-2xl p-5"
            style={{ background: "var(--c-card)", border: "1px solid var(--c-border)" }}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-bold" style={{ color: "var(--c-strong)" }}>Fleet Status</h2>
              <button
                className="text-xs px-3 py-1 rounded-lg font-semibold transition-all"
                style={{ background: GL, color: G, border: `1px solid ${G}20` }}
                onClick={() => navigate("/devices")}
              >
                + Enroll Device
              </button>
            </div>
            {allDevices.length === 0 ? (
              <p className="text-xs text-center py-8" style={{ color: "var(--c-muted)" }}>No devices enrolled yet</p>
            ) : (
              <div>
                {allDevices.slice(0, 6).map(d => <DeviceRow key={d.id} device={d} />)}
              </div>
            )}
          </div>

          {/* Compliance Donut (Project Progress style) */}
          <div className="col-span-2 rounded-2xl p-5 flex flex-col items-center justify-center"
            style={{ background: "var(--c-card)", border: "1px solid var(--c-border)" }}>
            <h2 className="text-sm font-bold mb-4 self-start" style={{ color: "var(--c-strong)" }}>
              Compliance Score
            </h2>
            <ComplianceDonut passed={complianceDevices} total={total} />
          </div>

          {/* Threat Level (Time Tracker dark card style) */}
          <div className="col-span-1 rounded-2xl p-5 flex flex-col"
            style={{
              background: "linear-gradient(145deg, #0f2a1a, #1B5E37)",
              border: "1px solid rgba(27,94,55,0.4)",
            }}>
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle size={14} style={{ color: threatColor }} />
              <span className="text-xs font-bold text-white opacity-70">Threat Level</span>
            </div>
            <div className="flex-1 flex flex-col items-center justify-center gap-3">
              <div style={{
                fontSize: 28, fontWeight: 900, color: threatColor,
                textShadow: `0 0 20px ${threatColor}50`,
              }}>
                {threatLevel}
              </div>
              <div className="text-center space-y-1">
                <p className="text-xs text-white opacity-50">{recentAlerts.length} open alerts</p>
                <p className="text-xs text-white opacity-50">{criticalAlerts} critical</p>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => navigate("/alerts")}
                className="flex-1 py-2 rounded-xl text-xs font-bold text-center transition-all"
                style={{ background: "rgba(255,255,255,0.15)", color: "#fff" }}
                onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.25)")}
                onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.15)")}
              >
                View
              </button>
              <button
                onClick={() => navigate("/mac/edr")}
                className="flex-1 py-2 rounded-xl text-xs font-bold text-center transition-all"
                style={{ background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.7)" }}
                onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.2)")}
                onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.1)")}
              >
                EDR
              </button>
            </div>
          </div>
        </div>

        {/* ── Row 4: macOS + Windows fleet panels ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* macOS Panel */}
          <div className="rounded-2xl overflow-hidden" style={{ background: "var(--c-card)", border: "1px solid rgba(167,139,250,0.18)" }}>
            <div className="px-5 py-3.5 flex items-center justify-between"
              style={{ borderBottom: "1px solid rgba(167,139,250,0.12)", background: "rgba(167,139,250,0.04)" }}>
              <div className="flex items-center gap-2">
                <Apple size={15} style={{ color: "#a78bfa" }} />
                <span className="text-sm font-bold" style={{ color: "var(--c-strong)" }}>macOS Fleet</span>
                <span className="text-xs px-2 py-0.5 rounded-full font-bold"
                  style={{ background: "rgba(167,139,250,0.15)", color: "#a78bfa" }}>
                  {macDevices.length} devices
                </span>
              </div>
              <Link to="/mac/devices" className="text-[11px] font-semibold"
                style={{ color: "var(--c-primary)" }}>View All →</Link>
            </div>
            <div className="px-5 py-4 space-y-2.5">
              {[
                { label: "FileVault Encryption", pass: macDevices.filter(d => d.filevault_enabled).length, mitre: "T1486" },
                { label: "Firewall Enabled",     pass: macDevices.filter(d => d.firewall_enabled).length,  mitre: "T1562.004" },
                { label: "SIP Enabled",          pass: macDevices.filter(d => d.sip_enabled).length,       mitre: "T1562.001" },
                { label: "Gatekeeper On",        pass: macDevices.filter(d => d.gatekeeper_enabled).length,mitre: "T1553.001" },
              ].map(c => (
                <div key={c.label} className="flex items-center gap-3">
                  <div className="flex-1">
                    <div className="flex justify-between mb-1">
                      <span className="text-[11px]" style={{ color: "var(--c-muted)" }}>{c.label}</span>
                      <span className="text-[11px] font-semibold"
                        style={{ color: c.pass === macDevices.length ? "#22c55e" : c.pass > 0 ? "#f59e0b" : "#ef4444" }}>
                        {macDevices.length > 0 ? `${c.pass}/${macDevices.length}` : "—"}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full" style={{ background: "var(--c-faint)" }}>
                      <div className="h-full rounded-full transition-all"
                        style={{
                          width: macDevices.length > 0 ? `${(c.pass/macDevices.length)*100}%` : "0%",
                          background: c.pass === macDevices.length ? G : c.pass > 0 ? "#f59e0b" : "#ef4444",
                        }} />
                    </div>
                  </div>
                  <span className="text-[9px] font-mono w-16 text-right" style={{ color: "var(--c-faint)" }}>{c.mitre}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Windows Panel */}
          <div className="rounded-2xl overflow-hidden" style={{ background: "var(--c-card)", border: "1px solid rgba(96,165,250,0.18)" }}>
            <div className="px-5 py-3.5 flex items-center justify-between"
              style={{ borderBottom: "1px solid rgba(96,165,250,0.12)", background: "rgba(96,165,250,0.04)" }}>
              <div className="flex items-center gap-2">
                <Monitor size={15} style={{ color: "#60a5fa" }} />
                <span className="text-sm font-bold" style={{ color: "var(--c-strong)" }}>Windows Fleet</span>
                <span className="text-xs px-2 py-0.5 rounded-full font-bold"
                  style={{ background: "rgba(96,165,250,0.15)", color: "#60a5fa" }}>
                  {winDevices.length} devices
                </span>
              </div>
              <Link to="/windows/devices" className="text-[11px] font-semibold"
                style={{ color: "var(--c-primary)" }}>View All →</Link>
            </div>
            <div className="px-5 py-4 space-y-2.5">
              {[
                { label: "BitLocker Encryption", pass: winDevices.filter(d => d.bitlocker_enabled).length, mitre: "T1486" },
                { label: "Firewall Enabled",     pass: winDevices.filter(d => d.firewall_enabled).length,  mitre: "T1562.004" },
                { label: "Defender Active",      pass: winDevices.filter(d => d.defender_enabled).length,  mitre: "T1562.001" },
                { label: "UAC Enabled",          pass: winDevices.filter(d => d.uac_enabled).length,       mitre: "T1548.002" },
                { label: "RDP Disabled",         pass: winDevices.filter(d => !d.rdp_enabled).length,      mitre: "T1021.001" },
              ].map(c => (
                <div key={c.label} className="flex items-center gap-3">
                  <div className="flex-1">
                    <div className="flex justify-between mb-1">
                      <span className="text-[11px]" style={{ color: "var(--c-muted)" }}>{c.label}</span>
                      <span className="text-[11px] font-semibold"
                        style={{ color: c.pass === winDevices.length ? "#22c55e" : c.pass > 0 ? "#f59e0b" : "#ef4444" }}>
                        {winDevices.length > 0 ? `${c.pass}/${winDevices.length}` : "—"}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full" style={{ background: "var(--c-faint)" }}>
                      <div className="h-full rounded-full transition-all"
                        style={{
                          width: winDevices.length > 0 ? `${(c.pass/winDevices.length)*100}%` : "0%",
                          background: c.pass === winDevices.length ? G : c.pass > 0 ? "#f59e0b" : "#ef4444",
                        }} />
                    </div>
                  </div>
                  <span className="text-[9px] font-mono w-16 text-right" style={{ color: "var(--c-faint)" }}>{c.mitre}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Row 5: Device table ── */}
        <div className="rounded-2xl overflow-hidden" style={{ background: "var(--c-card)", border: "1px solid var(--c-border)" }}>
          <div className="px-5 py-4 flex items-center justify-between flex-wrap gap-3"
            style={{ borderBottom: "1px solid var(--c-border)" }}>
            <div>
              <h2 className="text-sm font-bold" style={{ color: "var(--c-strong)" }}>All Devices</h2>
              <p className="text-[11px] mt-0.5" style={{ color: "var(--c-muted)" }}>
                {total} enrolled · {online} online · click a row to view details
              </p>
            </div>
            <div className="flex gap-1 flex-wrap p-1 rounded-xl" style={{ background: "var(--c-bg)" }}>
              {FILTERS.map(f => (
                <button key={f.key} onClick={() => setFilter(f.key)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                  style={filter === f.key
                    ? { background: G, color: "#fff" }
                    : { color: "var(--c-muted)", background: "transparent" }}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          {isLoading ? (
            <div className="py-16 text-center text-sm" style={{ color: "var(--c-muted)" }}>Loading fleet data…</div>
          ) : reports.length > 0 ? (
            <DeviceTable reports={reports} search={search} filter={filter} />
          ) : allDevices.length > 0 ? (
            <FallbackTable devices={allDevices} search={search} />
          ) : (
            <div className="py-16 text-center text-sm" style={{ color: "var(--c-muted)" }}>No devices enrolled yet</div>
          )}
        </div>
      </div>
    </div>
  );
}
