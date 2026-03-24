import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Apple, Monitor, Cpu, MemoryStick } from "lucide-react";
import TopBar from "../components/layout/TopBar";
import HealthGauge from "../components/device/HealthGauge";
import AIDiagnosisCard from "../components/device/AIDiagnosisCard";
import MetricBar from "../components/device/MetricBar";
import CulpritAppRow from "../components/device/CulpritAppRow";
import MetricsTrendChart from "../components/device/MetricsTrendChart";
import { useDeviceReport } from "../hooks/useHealthReports";
import { useDevice } from "../hooks/useDevices";
import { useMetrics } from "../hooks/useMetrics";
import { useAlerts } from "../hooks/useAlerts";
import { healthBadge, timeAgo, cn } from "../lib/utils";

export default function DeviceDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: reports = [], isLoading } = useDeviceReport(id!);
  const { data: device } = useDevice(id!);
  const { data: metrics = [] } = useMetrics(id!);
  const { data: alerts = [] } = useAlerts(id!, false);
  const { data: resolvedAlerts = [] } = useAlerts(id!, true);

  const latest = reports[0];

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
