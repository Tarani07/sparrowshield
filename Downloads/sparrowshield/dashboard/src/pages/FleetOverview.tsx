import { useMemo, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { RefreshCw, Wifi, WifiOff, Apple, Monitor, Download, ShieldAlert, Bell, Gauge } from "lucide-react";
import TopBar from "../components/layout/TopBar";
import StatCard from "../components/fleet/StatCard";
import FleetHealthChart from "../components/fleet/FleetHealthChart";
import TopOffendersWidget from "../components/fleet/TopOffendersWidget";
import DeviceTable from "../components/fleet/DeviceTable";
import { useFleetReports } from "../hooks/useHealthReports";
import { useAllDevices } from "../hooks/useDevices";
import { useAlerts } from "../hooks/useAlerts";
import { cn } from "../lib/utils";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "critical", label: "🔴 Critical" },
  { key: "warning", label: "⚠️ Warning" },
  { key: "healthy", label: "✅ Healthy" },
  { key: "mac", label: "Apple" },
  { key: "windows", label: "Windows" },
];

/* ── Mini donut chart (SVG) ── */
function DonutChart({ slices, size = 120 }: { slices: { value: number; color: string; label: string }[]; size?: number }) {
  const total = slices.reduce((s, sl) => s + sl.value, 0);
  if (total === 0) return <p className="text-xs text-slate-600 text-center py-6">No data</p>;
  const r = size / 2 - 8;
  const cx = size / 2;
  const cy = size / 2;
  let cumulative = 0;
  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {slices.filter(s => s.value > 0).map((sl) => {
          const pct = sl.value / total;
          const startAngle = cumulative * 2 * Math.PI - Math.PI / 2;
          cumulative += pct;
          const endAngle = cumulative * 2 * Math.PI - Math.PI / 2;
          const large = pct > 0.5 ? 1 : 0;
          const x1 = cx + r * Math.cos(startAngle);
          const y1 = cy + r * Math.sin(startAngle);
          const x2 = cx + r * Math.cos(endAngle);
          const y2 = cy + r * Math.sin(endAngle);
          // If only one slice with 100%, draw full circle
          if (pct >= 0.999) {
            return <circle key={sl.label} cx={cx} cy={cy} r={r} fill="none" stroke={sl.color} strokeWidth={16} />;
          }
          return (
            <path
              key={sl.label}
              d={`M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`}
              fill="none"
              stroke={sl.color}
              strokeWidth={16}
              strokeLinecap="round"
            />
          );
        })}
        <text x={cx} y={cy - 4} textAnchor="middle" className="fill-white text-lg font-bold">{total}</text>
        <text x={cx} y={cy + 12} textAnchor="middle" className="fill-slate-500 text-[9px]">devices</text>
      </svg>
      <div className="space-y-1.5">
        {slices.map((sl) => (
          <div key={sl.label} className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: sl.color }} />
            <span className="text-[11px] text-slate-400">{sl.label}</span>
            <span className="text-[11px] font-bold text-slate-300">{sl.value}</span>
            <span className="text-[10px] text-slate-600">({total ? Math.round((sl.value / total) * 100) : 0}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function FleetOverview() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const search = params.get("search") ?? "";
  const [filter, setFilter] = useState("all");

  const { data: reports = [], isLoading, refetch, isFetching } = useFleetReports();
  const { data: allDevices = [] } = useAllDevices();
  const { data: recentAlerts = [] } = useAlerts(undefined, false);

  const total    = reports.length;
  const healthy  = reports.filter((r) => r.health_status === "healthy").length;
  const warning  = reports.filter((r) => r.health_status === "warning").length;
  const critical = reports.filter((r) => r.health_status === "critical").length;

  // Security fleet stats — computed from device records
  const filevaultOff = allDevices.filter((d) => d.filevault_enabled === false).length;
  const lowBattery   = allDevices.filter((d) => d.battery_pct != null && d.battery_pct < 20).length;

  // Compliance score per device
  const complianceAtRisk = allDevices.filter((d) => {
    const score =
      (d.filevault_enabled  ? 20 : 0) +
      (d.firewall_enabled   ? 20 : 0) +
      (d.sip_enabled        ? 15 : 0) +
      (d.gatekeeper_enabled ? 15 : 0) +
      (d.mdm_enrolled       ? 15 : 0) +
      (d.antivirus_installed ? 15 : 0);
    return score < 50;
  }).length;

  // ── New stats ──
  const now = Date.now();
  const onlineDevices  = allDevices.filter((d) => d.last_seen && (now - new Date(d.last_seen).getTime()) < 10 * 60 * 1000).length;
  const offlineDevices = allDevices.length - onlineDevices;
  const macDevices     = allDevices.filter((d) => d.os_type === "macos" || d.os_type === "darwin").length;
  const winDevices     = allDevices.filter((d) => d.os_type === "windows").length;
  const otherDevices   = allDevices.length - macDevices - winDevices;
  const pendingUpdates = allDevices.reduce((sum, d) => sum + (d.pending_update_count ?? 0), 0);

  // Avg fleet health score
  const avgHealthScore = useMemo(() => {
    if (reports.length === 0) return 0;
    const sum = reports.reduce((acc, r) => acc + (r.health_score ?? 0), 0);
    return Math.round(sum / reports.length);
  }, [reports]);

  const healthColor = avgHealthScore >= 80 ? "text-emerald-400" : avgHealthScore >= 60 ? "text-amber-400" : "text-red-400";
  const healthBg = avgHealthScore >= 80 ? "bg-emerald-500/10 border-emerald-500/20" : avgHealthScore >= 60 ? "bg-amber-500/10 border-amber-500/20" : "bg-red-500/10 border-red-500/20";

  // Software violations count
  const softwareViolations = 0; // Will be populated when software violation detection is active

  return (
    <div className="flex flex-col h-full">
      <TopBar title="Dashboard" />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">

        {/* ── Row 1: Avg Health Score (hero) + Health stat cards ── */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Big health score */}
          <div className={cn("rounded-xl border p-5 flex flex-col items-center justify-center gap-1", healthBg)}>
            <Gauge className={cn("w-5 h-5", healthColor)} />
            <p className={cn("text-4xl font-bold font-mono", healthColor)}>{avgHealthScore}</p>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">Avg Health</p>
          </div>
          <StatCard label="Total Devices" value={total} icon="💻" color="default" sub={isLoading ? "Loading…" : "monitored"} />
          <StatCard label="Healthy" value={healthy} icon="✅" color="green" sub={total ? `${Math.round((healthy / total) * 100)}% of fleet` : undefined} />
          <StatCard label="Warning" value={warning} icon="⚠️" color="amber" sub="needs attention" />
          <StatCard label="Critical" value={critical} icon="🔴" color="red" sub="action required" />
        </div>

        {/* ── Row 2: Security + new stat cards ── */}
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
          <StatCard label="FileVault OFF" value={filevaultOff} icon="🔓" color={filevaultOff > 0 ? "red" : "green"} sub="unencrypted disks" />
          <StatCard label="Low Battery" value={lowBattery} icon="🪫" color={lowBattery > 0 ? "amber" : "green"} sub="below 20%" />
          <StatCard label="Compliance Risk" value={complianceAtRisk} icon="📋" color={complianceAtRisk > 0 ? "red" : "green"} sub="score < 50%" />
          <StatCard label="Pending Updates" value={pendingUpdates} icon="📦" color={pendingUpdates > 5 ? "amber" : "green"} sub="across fleet" />
          <StatCard label="Devices Offline" value={offlineDevices} icon="📡" color={offlineDevices > 0 ? "red" : "green"} sub={`${onlineDevices} online`} />
          <StatCard label="SW Violations" value={softwareViolations} icon="🚫" color={softwareViolations > 0 ? "red" : "green"} sub="blocklist hits" />
        </div>

        {/* ── Row 3: Donut charts + Recent Alerts ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Online vs Offline donut */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Wifi className="w-4 h-4 text-emerald-400" />
              <h2 className="text-sm font-semibold text-slate-200">Online vs Offline</h2>
            </div>
            <DonutChart slices={[
              { value: onlineDevices, color: "#34d399", label: "Online" },
              { value: offlineDevices, color: "#ef4444", label: "Offline" },
            ]} />
          </div>

          {/* OS Distribution donut */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Monitor className="w-4 h-4 text-blue-400" />
              <h2 className="text-sm font-semibold text-slate-200">OS Distribution</h2>
            </div>
            <DonutChart slices={[
              { value: macDevices, color: "#a78bfa", label: "macOS" },
              { value: winDevices, color: "#60a5fa", label: "Windows" },
              ...(otherDevices > 0 ? [{ value: otherDevices, color: "#94a3b8", label: "Other" }] : []),
            ]} />
          </div>

          {/* Recent Alerts feed */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-amber-400" />
                <h2 className="text-sm font-semibold text-slate-200">Recent Alerts</h2>
              </div>
              <button
                onClick={() => navigate("/alerts")}
                className="text-[10px] text-indigo-400 hover:text-indigo-300 font-medium"
              >
                View All →
              </button>
            </div>
            {recentAlerts.length === 0 ? (
              <p className="text-xs text-slate-600 text-center py-6">No active alerts</p>
            ) : (
              <div className="space-y-2">
                {recentAlerts.slice(0, 5).map((alert) => (
                  <div
                    key={alert.id}
                    className="flex items-start gap-2.5 p-2.5 rounded-lg bg-slate-800/50 border border-slate-700/30 hover:bg-slate-800/80 transition-colors cursor-pointer"
                    onClick={() => alert.device_id && navigate(`/device/${alert.device_id}`)}
                  >
                    <div className={cn(
                      "w-2 h-2 rounded-full mt-1.5 flex-shrink-0",
                      alert.severity === "critical" ? "bg-red-500" : "bg-amber-500"
                    )} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-medium text-slate-300 truncate">{alert.alert_type?.replace(/_/g, " ")}</p>
                      <p className="text-[10px] text-slate-500 truncate">
                        {(alert as any).devices?.hostname ?? "Unknown device"} · {alert.created_at ? new Date(alert.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}
                      </p>
                    </div>
                    <span className={cn(
                      "px-1.5 py-0.5 rounded text-[9px] font-semibold flex-shrink-0",
                      alert.severity === "critical" ? "bg-red-500/15 text-red-400" : "bg-amber-500/15 text-amber-400"
                    )}>
                      {alert.severity}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Row 4: Charts row ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Health trend */}
          <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold text-slate-200">Fleet Health Trend</h2>
                <p className="text-xs text-slate-500 mt-0.5">Device counts by status over 24h</p>
              </div>
              <button
                onClick={() => refetch()}
                className="p-1.5 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors"
              >
                <RefreshCw className={cn("w-3.5 h-3.5", isFetching && "animate-spin")} />
              </button>
            </div>
            <FleetHealthChart reports={reports} />
          </div>

          {/* Top offenders */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-slate-200 mb-1">Top Memory Hogs</h2>
            <p className="text-xs text-slate-500 mb-4">Fleet-wide most common culprits</p>
            <TopOffendersWidget reports={reports} />
          </div>
        </div>

        {/* ── Row 5: Device table ── */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-200">All Devices</h2>
              <p className="text-xs text-slate-500 mt-0.5">{total} devices · click a row to view details</p>
            </div>
            {/* Filter tabs */}
            <div className="flex gap-1 flex-wrap">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={cn(
                    "px-3 py-1 rounded-lg text-xs font-medium transition-colors",
                    filter === f.key
                      ? "bg-indigo-600 text-white"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {isLoading ? (
            <div className="py-16 text-center text-slate-500 text-sm">Loading fleet data…</div>
          ) : (
            <DeviceTable reports={reports} search={search} filter={filter} />
          )}
        </div>
      </div>
    </div>
  );
}
