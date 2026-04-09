import { HardDrive, ArrowDown, ArrowUp, Clock } from "lucide-react";
import { cn } from "../../lib/utils";
import type { Device } from "../../lib/types";

interface Props {
  device: Device;
}

function formatGb(gb: number): string {
  return gb >= 1024 ? `${(gb / 1024).toFixed(1)} TB` : `${gb.toFixed(1)} GB`;
}

function usageColor(pct: number): string {
  if (pct < 70) return "bg-green-500";
  if (pct < 90) return "bg-amber-500";
  return "bg-red-500";
}

function formatMb(mb: number | null): string {
  if (mb == null) return "—";
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb.toFixed(0)} MB`;
}

export default function StorageCard({ device }: Props) {
  const { storage_volumes, disk_read_mb, disk_write_mb, timemachine_enabled, timemachine_last_backup } = device;
  const hasData = storage_volumes?.length || disk_read_mb != null || disk_write_mb != null || timemachine_enabled != null;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <HardDrive className="w-5 h-5 text-indigo-400" />
        <h2 className="text-sm font-semibold text-slate-200">Storage</h2>
      </div>

      {!hasData ? (
        <p className="text-xs text-slate-500">No data yet</p>
      ) : (
        <div className="space-y-4">
          {storage_volumes?.map((vol, i) => (
            <div key={i}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-slate-400 truncate max-w-[60%]">{vol.name}</span>
                <span className="text-[10px] text-slate-500 font-mono">
                  {formatGb(vol.used_gb)} / {formatGb(vol.total_gb)}
                </span>
              </div>
              <div className="w-full h-2 bg-slate-700/60 rounded-full overflow-hidden">
                <div
                  className={cn("h-full rounded-full transition-all duration-700", usageColor(vol.percent))}
                  style={{ width: `${vol.percent}%` }}
                />
              </div>
              <p className="text-[10px] text-slate-500 mt-0.5">{vol.mount_point} ({vol.fs_type})</p>
            </div>
          ))}

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-800/60 rounded-lg p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <ArrowDown className="w-3 h-3 text-emerald-400" />
                <span className="text-[10px] text-slate-500 uppercase tracking-wider">Read</span>
              </div>
              <p className="text-sm font-bold font-mono text-emerald-400">{formatMb(disk_read_mb)}</p>
            </div>
            <div className="bg-slate-800/60 rounded-lg p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <ArrowUp className="w-3 h-3 text-blue-400" />
                <span className="text-[10px] text-slate-500 uppercase tracking-wider">Write</span>
              </div>
              <p className="text-sm font-bold font-mono text-blue-400">{formatMb(disk_write_mb)}</p>
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-slate-800 pt-3">
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-slate-500" />
              <span className="text-xs text-slate-500">Time Machine</span>
            </div>
            <div className="text-right">
              <span className={cn(
                "text-[10px] font-semibold px-2 py-0.5 rounded-full border",
                timemachine_enabled
                  ? "bg-green-500/15 text-green-400 border-green-500/30"
                  : "bg-red-500/15 text-red-400 border-red-500/30"
              )}>
                {timemachine_enabled ? "Enabled" : "Disabled"}
              </span>
              {timemachine_last_backup && (
                <p className="text-[10px] text-slate-500 mt-1">
                  Last: {new Date(timemachine_last_backup).toLocaleString()}
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
