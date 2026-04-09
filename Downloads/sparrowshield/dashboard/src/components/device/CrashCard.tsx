import { AlertTriangle, Bug } from "lucide-react";
import { cn } from "../../lib/utils";
import type { Device } from "../../lib/types";

interface Props {
  device: Device;
}

export default function CrashCard({ device }: Props) {
  const { crash_count_24h, last_crashed_app } = device;

  const count = crash_count_24h ?? 0;
  const severity = count === 0 ? "none" : count < 3 ? "low" : count < 10 ? "medium" : "high";

  const borderColor = {
    none:   "border-slate-800",
    low:    "border-amber-500/30",
    medium: "border-orange-500/30",
    high:   "border-red-500/30",
  }[severity];

  const countColor = {
    none:   "text-green-400",
    low:    "text-amber-400",
    medium: "text-orange-400",
    high:   "text-red-400",
  }[severity];

  return (
    <div className={cn("bg-slate-900 border rounded-xl p-5", borderColor)}>
      <div className="flex items-center gap-2 mb-4">
        <Bug className={cn(
          "w-5 h-5",
          severity === "none" ? "text-slate-500" : severity === "high" ? "text-red-400" : "text-amber-400"
        )} />
        <h2 className="text-sm font-semibold text-slate-200">Crash Reports</h2>
        <span className="text-xs text-slate-500 ml-1">last 24h</span>
      </div>

      <div className="flex items-center gap-6">
        {/* Count */}
        <div>
          <p className="text-xs text-slate-500 mb-0.5">Crashes</p>
          <p className={cn("text-3xl font-bold font-mono", countColor)}>
            {crash_count_24h ?? "—"}
          </p>
        </div>

        {/* Divider */}
        {last_crashed_app && <div className="w-px h-12 bg-slate-800" />}

        {/* Last crashed app */}
        {last_crashed_app && (
          <div className="flex-1 min-w-0">
            <p className="text-xs text-slate-500 mb-0.5">Last Crashed App</p>
            <div className="flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
              <p className="text-sm font-semibold text-slate-200 truncate">{last_crashed_app}</p>
            </div>
          </div>
        )}
      </div>

      {severity === "none" && (
        <p className="text-xs text-green-400/70 mt-3">No crashes in the last 24 hours</p>
      )}
      {severity === "high" && (
        <p className="text-xs text-red-400/70 mt-3">High crash frequency — may indicate system instability</p>
      )}
    </div>
  );
}
