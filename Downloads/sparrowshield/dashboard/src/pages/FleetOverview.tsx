import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import TopBar from "../components/layout/TopBar";
import StatCard from "../components/fleet/StatCard";
import FleetHealthChart from "../components/fleet/FleetHealthChart";
import TopOffendersWidget from "../components/fleet/TopOffendersWidget";
import DeviceTable from "../components/fleet/DeviceTable";
import { useFleetReports } from "../hooks/useHealthReports";
import { useAllDevices } from "../hooks/useDevices";
import { cn } from "../lib/utils";

const FILTERS = [
  { key: "all", label: "All" },
  { key: "critical", label: "🔴 Critical" },
  { key: "warning", label: "⚠️ Warning" },
  { key: "healthy", label: "✅ Healthy" },
  { key: "mac", label: "Apple" },
  { key: "windows", label: "Windows" },
];

export default function FleetOverview() {
  const [params] = useSearchParams();
  const search = params.get("search") ?? "";
  const [filter, setFilter] = useState("all");

  const { data: reports = [], isLoading, refetch, isFetching } = useFleetReports();
  const { data: allDevices = [] } = useAllDevices();

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

  return (
    <div className="flex flex-col h-full">
      <TopBar title="Fleet Overview" />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Stat cards — health */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Total Devices" value={total} icon="💻" color="default" sub={isLoading ? "Loading…" : "monitored"} />
          <StatCard label="Healthy" value={healthy} icon="✅" color="green" sub={total ? `${Math.round((healthy / total) * 100)}% of fleet` : undefined} />
          <StatCard label="Warning" value={warning} icon="⚠️" color="amber" sub="needs attention" />
          <StatCard label="Critical" value={critical} icon="🔴" color="red" sub="action required" />
        </div>

        {/* Stat cards — security */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <StatCard label="FileVault OFF" value={filevaultOff} icon="🔓" color={filevaultOff > 0 ? "red" : "green"} sub="unencrypted disks" />
          <StatCard label="Low Battery" value={lowBattery} icon="🪫" color={lowBattery > 0 ? "amber" : "green"} sub="below 20%" />
          <StatCard label="Compliance At Risk" value={complianceAtRisk} icon="📋" color={complianceAtRisk > 0 ? "red" : "green"} sub="score < 50%" />
        </div>

        {/* Charts row */}
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

        {/* Device table */}
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
