import { motion } from "framer-motion";
import { cn, metricColor } from "../../lib/utils";

interface Props {
  label: string;
  value: number | null;
  icon: string;
  warnAt?: number;
  critAt?: number;
  unit?: string;
}

export default function MetricBar({ label, value, icon, warnAt = 75, critAt = 90, unit = "%" }: Props) {
  const pct = value ?? 0;
  const color = metricColor(pct, warnAt, critAt);
  const textColor = pct >= critAt ? "text-red-400" : pct >= warnAt ? "text-amber-400" : "text-green-400";

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-slate-400 font-medium">{icon} {label}</span>
        <span className={cn("text-lg font-bold font-mono", value == null ? "text-slate-600" : textColor)}>
          {value == null ? "—" : `${Math.round(value)}${unit}`}
        </span>
      </div>
      <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(pct, 100)}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className={cn("h-full rounded-full", color)}
        />
      </div>
      {/* Threshold markers */}
      <div className="relative h-1 mt-0.5">
        <div className="absolute w-px h-2 bg-amber-500/40" style={{ left: `${warnAt}%` }} />
        <div className="absolute w-px h-2 bg-red-500/40" style={{ left: `${critAt}%` }} />
      </div>
    </div>
  );
}
