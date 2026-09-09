import { type LucideIcon } from "lucide-react";

interface Props {
  label: string;
  value: number;
  sub?: string;
  color: "default" | "green" | "amber" | "red";
  icon: string;
  lucideIcon?: LucideIcon;
}

const palette = {
  default: { accent: "#6366f1", glow: "rgba(99,102,241,0.12)", text: "#a5b4fc" },
  green:   { accent: "#22c55e", glow: "rgba(34,197,94,0.1)",   text: "#4ade80" },
  amber:   { accent: "#f59e0b", glow: "rgba(245,158,11,0.1)",  text: "#fbbf24" },
  red:     { accent: "#ef4444", glow: "rgba(239,68,68,0.1)",   text: "#f87171" },
};

export default function StatCard({ label, value, sub, color, icon, lucideIcon: LucideIcon }: Props) {
  const p = palette[color];
  return (
    <div
      className="rounded-xl p-5 flex flex-col gap-3 transition-all duration-200 hover:translate-y-[-1px]"
      style={{
        background: "#13141a",
        border: "1px solid rgba(255,255,255,0.05)",
        boxShadow: value > 0 && color !== "default" ? `0 0 0 1px ${p.accent}18 inset` : undefined,
      }}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "#3a4060" }}>
          {label}
        </span>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center text-sm"
          style={{ background: p.glow }}>
          {LucideIcon
            ? <LucideIcon className="w-3.5 h-3.5" style={{ color: p.accent }} />
            : <span>{icon}</span>}
        </div>
      </div>
      <div>
        <p className="text-3xl font-bold tabular-nums" style={{ color: value === 0 ? "#94a3b8" : p.text }}>
          {value}
        </p>
        {sub && <p className="text-[11px] mt-1" style={{ color: "#3a4060" }}>{sub}</p>}
      </div>
    </div>
  );
}
