import { useNavigate } from "react-router-dom";
import { ChevronRight, Monitor, Apple } from "lucide-react";
import { motion } from "framer-motion";
import { cn, healthBadge, timeAgo, metricColor } from "../../lib/utils";
import type { HealthReport } from "../../lib/types";

interface Props {
  reports: HealthReport[];
  search: string;
  filter: string;
}

function MetricPill({ value, warnAt = 75, critAt = 90 }: { value: number | null; warnAt?: number; critAt?: number }) {
  if (value == null) return <span className="text-slate-600 font-mono text-xs">—</span>;
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-16 h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full", metricColor(value, warnAt, critAt))} style={{ width: `${Math.min(value, 100)}%` }} />
      </div>
      <span className="text-xs font-mono text-slate-400">{Math.round(value)}%</span>
    </div>
  );
}

export default function DeviceTable({ reports, search, filter }: Props) {
  const navigate = useNavigate();

  let rows = reports;

  if (filter === "critical") rows = rows.filter((r) => r.health_status === "critical");
  else if (filter === "warning") rows = rows.filter((r) => r.health_status === "warning");
  else if (filter === "healthy") rows = rows.filter((r) => r.health_status === "healthy");
  else if (filter === "mac") rows = rows.filter((r) => r.devices?.os_type === "mac");
  else if (filter === "windows") rows = rows.filter((r) => r.devices?.os_type === "windows");

  if (search) {
    const q = search.toLowerCase();
    rows = rows.filter(
      (r) =>
        r.devices?.hostname?.toLowerCase().includes(q) ||
        r.devices?.assigned_user?.toLowerCase().includes(q)
    );
  }

  // Sort: critical first, then warning, then healthy
  const order = { critical: 0, warning: 1, healthy: 2 };
  rows = [...rows].sort((a, b) => (order[a.health_status] ?? 3) - (order[b.health_status] ?? 3));

  if (rows.length === 0) {
    return (
      <div className="text-center py-12 text-slate-500 text-sm">
        No devices match your filters
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-slate-500 uppercase tracking-wider border-b border-slate-800">
            <th className="text-left py-3 px-4 font-medium">Device</th>
            <th className="text-left py-3 px-4 font-medium">Health</th>
            <th className="text-left py-3 px-4 font-medium">Top Culprit</th>
            <th className="text-left py-3 px-4 font-medium">RAM</th>
            <th className="text-left py-3 px-4 font-medium">CPU</th>
            <th className="text-left py-3 px-4 font-medium">Last Report</th>
            <th className="py-3 px-4" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const dev = r.devices;
            const topApp = r.culprit_apps?.[0];
            const isOnline = dev?.status === "online";

            return (
              <motion.tr
                key={r.device_id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.03 }}
                onClick={() => navigate(`/device/${r.device_id}`)}
                className="border-b border-slate-800/50 hover:bg-slate-800/40 cursor-pointer transition-colors group"
              >
                {/* Device */}
                <td className="py-3 px-4">
                  <div className="flex items-center gap-2.5">
                    <div className="relative flex-shrink-0">
                      {dev?.os_type === "mac"
                        ? <Apple className="w-4 h-4 text-slate-400" />
                        : <Monitor className="w-4 h-4 text-slate-400" />}
                      <span className={cn(
                        "absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-slate-900",
                        isOnline ? "bg-green-500" : "bg-slate-600"
                      )} />
                    </div>
                    <div>
                      <p className="font-medium text-slate-200 text-xs">{dev?.hostname ?? "—"}</p>
                      <p className="text-slate-500 text-[10px]">{dev?.assigned_user ?? "unassigned"}</p>
                    </div>
                  </div>
                </td>

                {/* Health */}
                <td className="py-3 px-4">
                  <div className="flex items-center gap-2">
                    <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase", healthBadge(r.health_status))}>
                      {r.health_status}
                    </span>
                    <span className="text-xs font-mono text-slate-500">{r.health_score}</span>
                  </div>
                </td>

                {/* Culprit */}
                <td className="py-3 px-4">
                  {topApp ? (
                    <div>
                      <p className="text-xs text-slate-300 truncate max-w-[140px]">{topApp.app_name}</p>
                      <p className="text-[10px] text-slate-500 font-mono">{Math.round(topApp.ram_mb)} MB RAM</p>
                    </div>
                  ) : (
                    <span className="text-slate-600 text-xs">—</span>
                  )}
                </td>

                {/* RAM */}
                <td className="py-3 px-4">
                  <MetricPill value={r.metrics_snapshot?.ram_pct ?? null} warnAt={80} critAt={90} />
                </td>

                {/* CPU */}
                <td className="py-3 px-4">
                  <MetricPill value={r.metrics_snapshot?.cpu_pct ?? null} warnAt={75} critAt={90} />
                </td>

                {/* Time */}
                <td className="py-3 px-4 text-[10px] text-slate-500 font-mono">
                  {timeAgo(r.generated_at)}
                </td>

                {/* Arrow */}
                <td className="py-3 px-4">
                  <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-slate-400 transition-colors" />
                </td>
              </motion.tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
