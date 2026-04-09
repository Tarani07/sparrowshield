import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { format } from "date-fns";
import type { HealthReport } from "../../lib/types";

interface Props {
  reports: HealthReport[];
}

function buildChartData(reports: HealthReport[]) {
  // Group by hour bucket, count statuses
  const buckets = new Map<string, { healthy: number; warning: number; critical: number }>();

  for (const r of reports) {
    const hour = format(new Date(r.generated_at), "MMM d HH:00");
    const existing = buckets.get(hour) ?? { healthy: 0, warning: 0, critical: 0 };
    existing[r.health_status as "healthy" | "warning" | "critical"]++;
    buckets.set(hour, existing);
  }

  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([time, counts]) => ({ time, ...counts }));
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg p-3 text-xs space-y-1">
      <p className="text-slate-400 font-medium mb-2">{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-slate-300 capitalize">{p.name}:</span>
          <span className="font-mono font-semibold text-white">{p.value}</span>
        </div>
      ))}
    </div>
  );
};

export default function FleetHealthChart({ reports }: Props) {
  const data = buildChartData(reports);

  if (data.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-slate-500 text-sm">
        No trend data yet — reports generate every 15 min
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={180}>
      <AreaChart data={data} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
        <defs>
          <linearGradient id="healthy" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="warning" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="critical" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="time" tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
        <YAxis tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={false} />
        <Tooltip content={<CustomTooltip />} />
        <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} />
        <Area type="monotone" dataKey="healthy" stroke="#22c55e" strokeWidth={2} fill="url(#healthy)" />
        <Area type="monotone" dataKey="warning" stroke="#f59e0b" strokeWidth={2} fill="url(#warning)" />
        <Area type="monotone" dataKey="critical" stroke="#ef4444" strokeWidth={2} fill="url(#critical)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
