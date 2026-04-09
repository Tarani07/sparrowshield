import { Clock, Thermometer, Fan, Gauge } from "lucide-react";
import { cn } from "../../lib/utils";
import type { Device } from "../../lib/types";

interface Props {
  device: Device;
}

function formatUptime(seconds: number | null): string {
  if (seconds == null) return "—";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  return days > 0 ? `${days} days ${hours} hours` : `${hours} hours`;
}

function thermalColor(state: string | null): string {
  if (!state) return "text-slate-500";
  if (state === "nominal") return "text-green-400";
  if (state === "fair") return "text-yellow-400";
  if (state === "serious") return "text-orange-400";
  return "text-red-400";
}

function thermalBg(state: string | null): string {
  if (!state) return "bg-slate-500/15 border-slate-500/30";
  if (state === "nominal") return "bg-green-500/15 border-green-500/30";
  if (state === "fair") return "bg-yellow-500/15 border-yellow-500/30";
  if (state === "serious") return "bg-orange-500/15 border-orange-500/30";
  return "bg-red-500/15 border-red-500/30";
}

function pressureColor(pressure: string | null): string {
  if (!pressure) return "text-slate-500";
  if (pressure === "normal") return "text-green-400";
  if (pressure === "warning") return "text-amber-400";
  return "text-red-400";
}

function pressureBg(pressure: string | null): string {
  if (!pressure) return "bg-slate-500/15 border-slate-500/30";
  if (pressure === "normal") return "bg-green-500/15 border-green-500/30";
  if (pressure === "warning") return "bg-amber-500/15 border-amber-500/30";
  return "bg-red-500/15 border-red-500/30";
}

export default function SystemInfoCard({ device }: Props) {
  const { uptime_seconds, last_reboot, thermal_state, fan_speed_rpm, memory_pressure } = device;
  const hasData = uptime_seconds != null || last_reboot || thermal_state || fan_speed_rpm != null || memory_pressure;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Clock className="w-5 h-5 text-indigo-400" />
        <h2 className="text-sm font-semibold text-slate-200">System Info</h2>
      </div>

      {!hasData ? (
        <p className="text-xs text-slate-500">No data yet</p>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500">Uptime</span>
            <span className="text-sm font-semibold font-mono text-slate-200">
              {formatUptime(uptime_seconds)}
            </span>
          </div>

          {last_reboot && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500">Last Reboot</span>
              <span className="text-xs font-mono text-slate-400">
                {new Date(last_reboot).toLocaleString()}
              </span>
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Thermometer className="w-3.5 h-3.5 text-slate-500" />
              <span className="text-xs text-slate-500">Thermal State</span>
            </div>
            <span className={cn(
              "text-[10px] font-semibold px-2 py-0.5 rounded-full border capitalize",
              thermalColor(thermal_state),
              thermalBg(thermal_state)
            )}>
              {thermal_state ?? "Unknown"}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Fan className="w-3.5 h-3.5 text-slate-500" />
              <span className="text-xs text-slate-500">Fan Speed</span>
            </div>
            <span className="text-sm font-semibold font-mono text-slate-200">
              {fan_speed_rpm != null ? `${fan_speed_rpm} RPM` : "—"}
            </span>
          </div>

          <div className="flex items-center justify-between border-t border-slate-800 pt-3">
            <div className="flex items-center gap-1.5">
              <Gauge className="w-3.5 h-3.5 text-slate-500" />
              <span className="text-xs text-slate-500">Memory Pressure</span>
            </div>
            <span className={cn(
              "text-[10px] font-semibold px-2 py-0.5 rounded-full border capitalize",
              pressureColor(memory_pressure),
              pressureBg(memory_pressure)
            )}>
              {memory_pressure ?? "Unknown"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
