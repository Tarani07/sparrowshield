import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { format } from "date-fns";
import type { MetricRow } from "../../lib/types";

interface Props { metrics: MetricRow[] }

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-slate-900 border border-slate-700 rounded-lg p-3 text-xs space-y-1.5">
      <p className="text-slate-400 mb-1">{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-slate-300 capitalize">{p.name}:</span>
          <span className="font-mono font-bold text-white">{p.value != null ? `${Math.round(p.value)}%` : "—"}</span>
        </div>
      ))}
    </div>
  );
};

export default function MetricsTrendChart({ metrics }: Props) {
  if (metrics.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-slate-500 text-sm">
        No metric history available
      </div>
    );
  }

  const data = metrics.map((m) => ({
    time: format(new Date(m.timestamp), "HH:mm"),
    CPU: m.cpu_pct != null ? Math.round(m.cpu_pct) : null,
    RAM: m.ram_pct != null ? Math.round(m.ram_pct) : null,
    Disk: m.disk_pct != null ? Math.round(m.disk_pct) : null,
  }));

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
        <XAxis dataKey="time" tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
        <YAxis domain={[0, 100]} tick={{ fill: "#64748b", fontSize: 10 }} tickLine={false} axisLine={false} />
        <Tooltip content={<CustomTooltip />} />
        <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} />
        <Line type="monotone" dataKey="CPU"  stroke="#6366f1" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="RAM"  stroke="#ef4444" strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="Disk" stroke="#f59e0b" strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
