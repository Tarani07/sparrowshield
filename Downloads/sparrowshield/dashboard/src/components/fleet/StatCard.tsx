import { motion } from "framer-motion";
import { cn } from "../../lib/utils";

interface Props {
  label: string;
  value: number;
  sub?: string;
  color: "default" | "green" | "amber" | "red";
  icon: string;
}

const colorMap = {
  default: "border-slate-700 bg-slate-800/50",
  green:   "border-green-500/30 bg-green-500/5",
  amber:   "border-amber-500/30 bg-amber-500/5",
  red:     "border-red-500/30 bg-red-500/5",
};

const valueColor = {
  default: "text-white",
  green:   "text-green-400",
  amber:   "text-amber-400",
  red:     "text-red-400",
};

export default function StatCard({ label, value, sub, color, icon }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn("rounded-xl border p-5 flex flex-col gap-3", colorMap[color])}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">{label}</span>
        <span className="text-xl">{icon}</span>
      </div>
      <div>
        <p className={cn("text-3xl font-bold font-mono", valueColor[color])}>{value}</p>
        {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
      </div>
    </motion.div>
  );
}
