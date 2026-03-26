import { BatteryCharging, Battery, BatteryFull, BatteryLow, BatteryMedium, BatteryWarning } from "lucide-react";
import { cn } from "../../lib/utils";
import type { Device } from "../../lib/types";

interface Props {
  device: Device;
}

function BatteryIcon({ pct, isCharging }: { pct: number | null; isCharging: boolean | null }) {
  if (isCharging) return <BatteryCharging className="w-5 h-5 text-green-400" />;
  if (pct == null) return <Battery className="w-5 h-5 text-slate-500" />;
  if (pct > 80)  return <BatteryFull className="w-5 h-5 text-green-400" />;
  if (pct > 50)  return <BatteryMedium className="w-5 h-5 text-green-400" />;
  if (pct > 20)  return <BatteryLow className="w-5 h-5 text-amber-400" />;
  return <BatteryWarning className="w-5 h-5 text-red-400" />;
}

function cycleColor(cycles: number | null): string {
  if (cycles == null) return "text-slate-500";
  if (cycles < 500)  return "text-green-400";
  if (cycles < 900)  return "text-amber-400";
  return "text-red-400";
}

function pctColor(pct: number | null): string {
  if (pct == null)  return "text-slate-500";
  if (pct > 50)     return "text-green-400";
  if (pct > 20)     return "text-amber-400";
  return "text-red-400";
}

function healthColor(health: string | null): string {
  if (!health) return "text-slate-500";
  if (health === "Good") return "text-green-400";
  if (health === "Fair") return "text-amber-400";
  return "text-red-400";
}

export default function BatteryCard({ device }: Props) {
  const { battery_pct, battery_cycles, battery_health, is_charging } = device;

  const cycleLabel = battery_cycles != null
    ? battery_cycles < 500
      ? "Good condition"
      : battery_cycles < 900
        ? "Moderate wear"
        : "High wear — consider replacement"
    : null;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <BatteryIcon pct={battery_pct} isCharging={is_charging ?? null} />
        <h2 className="text-sm font-semibold text-slate-200">Battery</h2>
        {is_charging && (
          <span className="ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-500/15 text-green-400 border border-green-500/30">
            Charging
          </span>
        )}
      </div>

      <div className="space-y-4">
        {/* Charge percentage */}
        <div>
          <div className="flex items-end justify-between mb-1.5">
            <span className="text-xs text-slate-500">Charge</span>
            <span className={cn("text-2xl font-bold font-mono", pctColor(battery_pct))}>
              {battery_pct != null ? `${battery_pct}%` : "—"}
            </span>
          </div>
          <div className="w-full h-2 bg-slate-700/60 rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-700",
                battery_pct != null && battery_pct > 50
                  ? "bg-green-500"
                  : battery_pct != null && battery_pct > 20
                    ? "bg-amber-500"
                    : "bg-red-500"
              )}
              style={{ width: `${battery_pct ?? 0}%` }}
            />
          </div>
        </div>

        {/* Cycle count */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500">Cycle Count</p>
            {cycleLabel && (
              <p className={cn("text-[10px] mt-0.5", cycleColor(battery_cycles))}>{cycleLabel}</p>
            )}
          </div>
          <span className={cn("text-lg font-bold font-mono", cycleColor(battery_cycles))}>
            {battery_cycles != null ? battery_cycles : "—"}
          </span>
        </div>

        {/* Health */}
        <div className="flex items-center justify-between border-t border-slate-800 pt-3">
          <span className="text-xs text-slate-500">Health Condition</span>
          <span className={cn("text-sm font-semibold", healthColor(battery_health))}>
            {battery_health ?? "Unknown"}
          </span>
        </div>
      </div>
    </div>
  );
}
