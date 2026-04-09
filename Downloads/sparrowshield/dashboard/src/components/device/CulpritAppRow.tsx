import { Lightbulb } from "lucide-react";
import { cn, formatBytes, impactColor } from "../../lib/utils";
import type { CulpritApp } from "../../lib/types";

interface Props {
  app: CulpritApp;
  maxRam: number;
}

export default function CulpritAppRow({ app, maxRam }: Props) {
  const barWidth = maxRam > 0 ? Math.min((app.ram_mb / maxRam) * 100, 100) : 0;

  return (
    <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700/50 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase", impactColor(app.impact))}>
            {app.impact}
          </span>
          <span className="text-sm font-semibold text-slate-200 truncate">{app.app_name}</span>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0 text-xs font-mono text-slate-400">
          <span className="text-slate-300 font-semibold">{formatBytes(app.ram_mb)}</span>
          <span>{app.cpu_pct.toFixed(1)}% CPU</span>
        </div>
      </div>

      {/* RAM bar */}
      <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all",
            app.impact === "high" ? "bg-red-500" : app.impact === "medium" ? "bg-amber-500" : "bg-slate-500"
          )}
          style={{ width: `${barWidth}%` }}
        />
      </div>

      {/* Recommendation */}
      <div className="flex items-start gap-2 text-xs text-slate-400">
        <Lightbulb className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
        <span>{app.recommendation}</span>
      </div>
    </div>
  );
}
