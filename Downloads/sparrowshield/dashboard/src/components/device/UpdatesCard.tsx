import { Download, Lock, ShieldCheck } from "lucide-react";
import { cn } from "../../lib/utils";
import type { Device } from "../../lib/types";

interface Props {
  device: Device;
}

export default function UpdatesCard({ device }: Props) {
  const { pending_updates, pending_update_count, screen_lock_enabled, screen_lock_delay_sec } = device;
  const hasData = pending_updates?.length || pending_update_count != null || screen_lock_enabled != null;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <ShieldCheck className="w-5 h-5 text-indigo-400" />
        <h2 className="text-sm font-semibold text-slate-200">Updates & Compliance</h2>
      </div>

      {!hasData ? (
        <p className="text-xs text-slate-500">No data yet</p>
      ) : (
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <Download className="w-3.5 h-3.5 text-slate-500" />
                <span className="text-xs text-slate-500">Pending Updates</span>
              </div>
              {pending_update_count != null && (
                <span className={cn(
                  "text-[10px] font-semibold px-2 py-0.5 rounded-full border",
                  pending_update_count > 0
                    ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                    : "bg-green-500/15 text-green-400 border-green-500/30"
                )}>
                  {pending_update_count} pending
                </span>
              )}
            </div>
            {pending_updates && pending_updates.length > 0 ? (
              <div className="space-y-1">
                {pending_updates.map((upd, i) => (
                  <div key={i} className="bg-slate-800/60 rounded-lg px-3 py-2">
                    <span className="text-xs text-slate-300">{upd}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-green-400">All up to date</p>
            )}
          </div>

          <div className="border-t border-slate-800 pt-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-slate-500" />
                <span className="text-xs text-slate-500">Screen Lock</span>
              </div>
              <div className="flex items-center gap-2">
                {screen_lock_delay_sec != null && (
                  <span className="text-[10px] font-mono text-slate-500">
                    {screen_lock_delay_sec}s delay
                  </span>
                )}
                <span className={cn(
                  "text-[10px] font-semibold px-2 py-0.5 rounded-full border",
                  screen_lock_enabled === true
                    ? "bg-green-500/15 text-green-400 border-green-500/30"
                    : screen_lock_enabled === false
                      ? "bg-red-500/15 text-red-400 border-red-500/30"
                      : "bg-slate-500/15 text-slate-400 border-slate-500/30"
                )}>
                  {screen_lock_enabled == null ? "Unknown" : screen_lock_enabled ? "Enabled" : "Disabled"}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
