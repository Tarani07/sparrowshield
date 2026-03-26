import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Apple, Monitor, Cpu, MemoryStick, Activity, Zap, CheckCircle2, Clock, AlertCircle, Trash2, RefreshCw, Layers } from "lucide-react";
import TopBar from "../components/layout/TopBar";
import HealthGauge from "../components/device/HealthGauge";
import AIDiagnosisCard from "../components/device/AIDiagnosisCard";
import MetricBar from "../components/device/MetricBar";
import CulpritAppRow from "../components/device/CulpritAppRow";
import MetricsTrendChart from "../components/device/MetricsTrendChart";
import BatteryCard from "../components/device/BatteryCard";
import NetworkCard from "../components/device/NetworkCard";
import SecurityStatusCard from "../components/device/SecurityStatusCard";
import ComplianceCard from "../components/device/ComplianceCard";
import CrashCard from "../components/device/CrashCard";
import InstalledAppsCard from "../components/device/InstalledAppsCard";
import { useDeviceReport } from "../hooks/useHealthReports";
import { useDevice } from "../hooks/useDevices";
import { useMetrics } from "../hooks/useMetrics";
import { useAlerts } from "../hooks/useAlerts";
import { useTopProcesses, useKillProcess, useCommands, useExecuteCommand } from "../hooks/useProcesses";
import { healthBadge, timeAgo, cn } from "../lib/utils";

export default function DeviceDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: reports = [], isLoading } = useDeviceReport(id!);
  const { data: device } = useDevice(id!);
  const { data: metrics = [] } = useMetrics(id!);
  const { data: alerts = [] } = useAlerts(id!, false);
  const { data: resolvedAlerts = [] } = useAlerts(id!, true);
  const { data: topProcesses = [] } = useTopProcesses(id!);
  const { data: commands = [] } = useCommands(id!);
  const killProcess = useKillProcess(id!);
  const execCmd = useExecuteCommand(id!);

  const latest = reports[0];
  const pendingKills = new Set(
    commands.filter(c => c.status === "pending" || c.status === "running").map(c => c.payload.process_name)
  );
  const pendingTypes = new Set(
    commands.filter(c => c.status === "pending" || c.status === "running").map(c => c.command_type)
  );

  const optimizerActions = [
    { type: "clear_cache",              label: "Clear Cache",       icon: Trash2,    desc: "Delete ~/Library/Caches to free disk & RAM", color: "blue"   },
    { type: "restart_ui",               label: "Restart UI",        icon: RefreshCw, desc: "Restart Dock + Finder — fixes rendering glitches", color: "purple" },
    { type: "optimize_memory",          label: "Free Memory",       icon: MemoryStick, desc: "Kill all apps using >500MB RAM", color: "amber"  },
    { type: "kill_background_services", label: "Kill Bg Services",  icon: Layers,    desc: "Kill hidden background services using >200MB RAM", color: "red"    },
  ];

  const colorMap: Record<string, string> = {
    blue:   "bg-blue-500/10 border-blue-500/30 text-blue-400 hover:bg-blue-500/20",
    purple: "bg-purple-500/10 border-purple-500/30 text-purple-400 hover:bg-purple-500/20",
    amber:  "bg-amber-500/10 border-amber-500/30 text-amber-400 hover:bg-amber-500/20",
    red:    "bg-red-500/10 border-red-500/30 text-red-400 hover:bg-red-500/20",
  };

  const lastResultFor = (type: string) => commands.find(c => c.command_type === type && (c.status === "done" || c.status === "failed"));

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <TopBar title="Device Detail" />
        <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">Loading…</div>
      </div>
    );
  }

  if (!latest && !device) {
    return (
      <div className="flex flex-col h-full">
        <TopBar title="Device Detail" />
        <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">Device not found</div>
      </div>
    );
  }

  const maxRam = Math.max(...(latest?.culprit_apps?.map((a) => a.ram_mb) ?? [1]));
  const snapshot = latest?.metrics_snapshot;
  const isOnline = device?.status === "online";

  return (
    <div className="flex flex-col h-full">
      <TopBar title="Device Detail" />

      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        {/* Back + header */}
        <div>
          <Link to="/" className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors mb-3">
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Fleet
          </Link>

          <div className="flex items-start justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="relative">
                {device?.os_type === "mac"
                  ? <Apple className="w-5 h-5 text-slate-400" />
                  : <Monitor className="w-5 h-5 text-slate-400" />}
                <span className={cn(
                  "absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-slate-950",
                  isOnline ? "bg-green-500" : "bg-slate-600"
                )} />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white">{device?.hostname ?? "—"}</h1>
                <p className="text-xs text-slate-400">
                  {device?.assigned_user ?? "Unassigned"} · {device?.os_type} {device?.os_version}
                </p>
              </div>
            </div>

            {/* Device specs */}
            <div className="flex items-center gap-4 text-xs text-slate-500">
              {device?.cpu_model && (
                <div className="flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5" />
                  <span>{device.cpu_model}</span>
                </div>
              )}
              {device?.ram_total_gb && (
                <div className="flex items-center gap-1.5">
                  <MemoryStick className="w-3.5 h-3.5" />
                  <span>{device.ram_total_gb} GB RAM</span>
                </div>
              )}
              {device?.serial_number && (
                <span className="font-mono text-slate-600">S/N: {device.serial_number}</span>
              )}
            </div>
          </div>
        </div>

        {/* Health gauge + AI diagnosis */}
        {latest && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex items-center justify-center">
              <HealthGauge score={latest.health_score} status={latest.health_status} />
            </div>
            <div className="lg:col-span-2">
              <AIDiagnosisCard summary={latest.summary} generatedAt={latest.generated_at} />
            </div>
          </div>
        )}

        {/* Metric bars */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricBar label="CPU" icon="⚡" value={snapshot?.cpu_pct ?? null} warnAt={75} critAt={90} />
          <MetricBar label="RAM" icon="🧠" value={snapshot?.ram_pct ?? null} warnAt={80} critAt={90} />
          <MetricBar label="Disk" icon="💾" value={snapshot?.disk_pct ?? null} warnAt={80} critAt={92} />
          <MetricBar label="Battery" icon="🔋" value={snapshot?.battery_health_pct ?? null} warnAt={50} critAt={20} />
        </div>

        {/* Battery + Network row */}
        {device && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <BatteryCard device={device} />
            <NetworkCard device={device} />
          </div>
        )}

        {/* Security Status */}
        {device && <SecurityStatusCard device={device} />}

        {/* Compliance + Crash row */}
        {device && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ComplianceCard device={device} />
            <CrashCard device={device} />
          </div>
        )}

        {/* Installed Apps Inventory */}
        {device && (
          <InstalledAppsCard apps={device.installed_apps ?? []} />
        )}

        {/* Optimizer Panel */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-400" />
                Device Optimizer
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">One-click fixes — executed live on this device</p>
            </div>
            <button
              onClick={() => optimizerActions.forEach(a => execCmd.mutate({ type: a.type, payload: {} }))}
              disabled={execCmd.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/40 text-amber-300 text-xs font-semibold hover:from-amber-500/30 hover:to-orange-500/30 transition-all disabled:opacity-50"
            >
              <Zap className="w-3.5 h-3.5" />
              Optimize All
            </button>
          </div>

          <div className="p-5 grid grid-cols-2 gap-3">
            {optimizerActions.map(({ type, label, icon: Icon, desc, color }) => {
              const isPending = pendingTypes.has(type);
              const last = lastResultFor(type);
              return (
                <button
                  key={type}
                  onClick={() => execCmd.mutate({ type, payload: {} })}
                  disabled={isPending || execCmd.isPending}
                  title={desc}
                  className={cn(
                    "flex flex-col gap-2 p-4 rounded-xl border text-left transition-all disabled:opacity-60 group",
                    colorMap[color]
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {isPending
                        ? <Clock className="w-4 h-4 animate-pulse" />
                        : <Icon className="w-4 h-4" />}
                      <span className="text-xs font-semibold">{label}</span>
                    </div>
                    {last && (
                      last.status === "done"
                        ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        : <AlertCircle className="w-3.5 h-3.5 text-red-400" />
                    )}
                  </div>
                  <p className="text-[10px] opacity-60 leading-snug">{desc}</p>
                  {last && (
                    <p className={cn("text-[10px] font-mono truncate", last.status === "done" ? "text-emerald-400" : "text-red-400")}>
                      {last.result}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Top 10 Apps + Optimizer */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
            <div>
              <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <Activity className="w-4 h-4 text-indigo-400" />
                Top 10 Apps Slowing This Device
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">Sorted by RAM · live snapshot · refreshes every 15s</p>
            </div>
            <div className="flex items-center gap-2">
              {topProcesses[0] && (
                <span className="text-[10px] text-slate-600 font-mono">{new Date(topProcesses[0].timestamp).toLocaleTimeString()}</span>
              )}
              {topProcesses.length > 0 && (
                <button
                  onClick={() => {
                    const highRam = topProcesses.filter(p => (p.ram_mb ?? 0) > 500);
                    highRam.forEach(p => killProcess.mutate(p.process_name));
                  }}
                  disabled={killProcess.isPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-medium hover:bg-amber-500/20 transition-colors disabled:opacity-50"
                >
                  <Zap className="w-3.5 h-3.5" />
                  Optimize All
                </button>
              )}
            </div>
          </div>

          {/* Process list */}
          {topProcesses.length === 0 ? (
            <div className="py-10 text-center text-slate-600 text-xs">No process data yet — agent sends inventory every 5 min</div>
          ) : (
            <div className="divide-y divide-slate-800/60">
              {topProcesses.map((p, i) => {
                const maxRam = topProcesses[0]?.ram_mb ?? 1;
                const ramPct = Math.round(((p.ram_mb ?? 0) / maxRam) * 100);
                const isHigh = (p.ram_mb ?? 0) > 1000;
                const isMed  = (p.ram_mb ?? 0) > 400;
                const barColor = isHigh ? "bg-red-500" : isMed ? "bg-amber-500" : "bg-emerald-500";
                const rankColor = isHigh ? "bg-red-500/20 text-red-400" : isMed ? "bg-amber-500/20 text-amber-400" : "bg-slate-700 text-slate-400";
                const isPending = pendingKills.has(p.process_name);
                const lastCmd = commands.find(c => c.payload.process_name === p.process_name);
                const isDone = lastCmd?.status === "done";
                const isFailed = lastCmd?.status === "failed";

                return (
                  <div key={p.id} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-800/30 transition-colors group">
                    {/* Rank */}
                    <span className={cn("w-6 h-6 rounded-full text-[10px] font-bold flex items-center justify-center flex-shrink-0", rankColor)}>
                      {i + 1}
                    </span>

                    {/* Name + bar */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs font-medium text-slate-200 truncate">{p.process_name}</p>
                        <div className="flex items-center gap-3 ml-2 flex-shrink-0 text-[11px]">
                          <span className={cn("font-mono font-semibold", isHigh ? "text-red-400" : isMed ? "text-amber-400" : "text-slate-400")}>
                            {p.ram_mb != null ? (p.ram_mb >= 1024 ? `${(p.ram_mb/1024).toFixed(1)} GB` : `${Math.round(p.ram_mb)} MB`) : "—"}
                          </span>
                          <span className="text-slate-600 font-mono">
                            {p.cpu_pct != null ? `${p.cpu_pct.toFixed(1)}% CPU` : "—"}
                          </span>
                        </div>
                      </div>
                      <div className="w-full h-1 bg-slate-700/60 rounded-full overflow-hidden">
                        <div className={cn("h-full rounded-full transition-all duration-500", barColor)} style={{ width: `${ramPct}%` }} />
                      </div>
                    </div>

                    {/* Action */}
                    <div className="flex-shrink-0 w-24 flex justify-end">
                      {isDone ? (
                        <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Closed
                        </span>
                      ) : isFailed ? (
                        <span className="flex items-center gap-1 text-[10px] text-red-400 font-medium">
                          <AlertCircle className="w-3.5 h-3.5" /> Failed
                        </span>
                      ) : isPending ? (
                        <span className="flex items-center gap-1 text-[10px] text-amber-400 font-medium">
                          <Clock className="w-3.5 h-3.5 animate-pulse" /> Closing…
                        </span>
                      ) : (
                        <button
                          onClick={() => killProcess.mutate(p.process_name)}
                          className="opacity-0 group-hover:opacity-100 flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-[11px] font-medium hover:bg-red-500/20 transition-all"
                        >
                          <Zap className="w-3 h-3" /> Kill
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Command history */}
          {commands.length > 0 && (
            <div className="border-t border-slate-800 px-5 py-3 bg-slate-950/40">
              <p className="text-[10px] text-slate-600 font-semibold uppercase tracking-wider mb-2">Recent Commands</p>
              <div className="flex flex-wrap gap-2">
                {commands.slice(0, 6).map(c => (
                  <span key={c.id} className={cn(
                    "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] border font-mono",
                    c.status === "done"    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                    c.status === "failed"  ? "bg-red-500/10 text-red-400 border-red-500/20" :
                    c.status === "pending" ? "bg-amber-500/10 text-amber-400 border-amber-500/20" :
                                             "bg-slate-700 text-slate-400 border-slate-600"
                  )}>
                    {c.status === "done" ? "✓" : c.status === "failed" ? "✗" : "⏳"} {c.payload.process_name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Culprit apps */}
        {latest?.culprit_apps?.length > 0 && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-slate-200 mb-1">Culprit Applications</h2>
            <p className="text-xs text-slate-500 mb-4">Apps identified as causing slowness — sorted by RAM impact</p>
            <div className="space-y-3">
              {latest.culprit_apps.map((app) => (
                <CulpritAppRow key={app.app_name} app={app} maxRam={maxRam} />
              ))}
            </div>
          </div>
        )}

        {/* Trend + Alerts row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* 24h trend */}
          <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-slate-200 mb-1">24-Hour Metrics</h2>
            <p className="text-xs text-slate-500 mb-4">CPU · RAM · Disk over time</p>
            <MetricsTrendChart metrics={metrics} />
          </div>

          {/* Alert history */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <h2 className="text-sm font-semibold text-slate-200 mb-4">Alert History</h2>
            <div className="space-y-2">
              {[...alerts, ...resolvedAlerts].slice(0, 8).map((a) => (
                <div key={a.id} className="flex items-start gap-2">
                  <span className={cn(
                    "text-[10px] font-bold px-1.5 py-0.5 rounded border mt-0.5",
                    healthBadge(a.severity === "critical" ? "critical" : a.resolved ? "healthy" : "warning")
                  )}>
                    {a.resolved ? "✓" : a.severity === "critical" ? "🔴" : "⚠"}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs text-slate-300 truncate">{a.alert_type.replace(/_/g, " ")}</p>
                    <p className="text-[10px] text-slate-600 font-mono">{timeAgo(a.created_at)}</p>
                  </div>
                </div>
              ))}
              {alerts.length === 0 && resolvedAlerts.length === 0 && (
                <p className="text-xs text-slate-600">No alerts for this device</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
