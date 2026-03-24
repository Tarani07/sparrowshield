import { RadialBarChart, RadialBar, ResponsiveContainer } from "recharts";
import { scoreColor } from "../../lib/utils";
import { motion } from "framer-motion";

interface Props {
  score: number;
  status: string;
}

export default function HealthGauge({ score, status }: Props) {
  const color = scoreColor(score);
  const data = [{ value: score, fill: color }];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center justify-center"
    >
      <div className="relative w-36 h-36">
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart
            cx="50%" cy="50%"
            innerRadius="70%" outerRadius="100%"
            startAngle={225} endAngle={-45}
            data={[{ value: 100, fill: "#1e293b" }, { value: score, fill: color }]}
            barSize={10}
          >
            <RadialBar dataKey="value" cornerRadius={5} background={false} />
          </RadialBarChart>
        </ResponsiveContainer>

        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold font-mono" style={{ color }}>{score}</span>
          <span className="text-[10px] text-slate-500 uppercase tracking-widest mt-0.5">/ 100</span>
        </div>
      </div>

      {/* Status badge */}
      <span
        className="mt-2 text-xs font-semibold uppercase tracking-wider px-3 py-1 rounded-full"
        style={{ color, background: `${color}18`, border: `1px solid ${color}30` }}
      >
        {status}
      </span>
    </motion.div>
  );
}
