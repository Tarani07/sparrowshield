import { Play, Puzzle, AlertTriangle } from "lucide-react";
import { cn } from "../../lib/utils";
import type { Device } from "../../lib/types";

interface Props {
  device: Device;
}

export default function StartupItemsCard({ device }: Props) {
  const { login_items, third_party_kexts, login_item_count } = device;
  const hasData = login_items?.length || third_party_kexts?.length || login_item_count != null;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Play className="w-5 h-5 text-indigo-400" />
        <h2 className="text-sm font-semibold text-slate-200">Startup Items</h2>
        {login_item_count != null && (
          <span className="ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/30">
            {login_item_count} items
          </span>
        )}
      </div>

      {!hasData ? (
        <p className="text-xs text-slate-500">No data yet</p>
      ) : (
        <div className="space-y-4">
          {login_items && login_items.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Play className="w-3.5 h-3.5 text-slate-500" />
                <span className="text-xs text-slate-500">Login Items</span>
              </div>
              <div className="space-y-1">
                {login_items.map((item, i) => (
                  <div key={i} className="bg-slate-800/60 rounded-lg px-3 py-2">
                    <span className="text-xs text-slate-300">{item}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {third_party_kexts && third_party_kexts.length > 0 && (
            <div className="border-t border-slate-800 pt-3">
              <div className="flex items-center gap-1.5 mb-2">
                <Puzzle className="w-3.5 h-3.5 text-slate-500" />
                <span className="text-xs text-slate-500">Third-Party Kernel Extensions</span>
                <AlertTriangle className="w-3 h-3 text-amber-400" />
              </div>
              <div className="space-y-1">
                {third_party_kexts.map((kext, i) => (
                  <div key={i} className="bg-slate-800/60 rounded-lg px-3 py-2">
                    <span className="text-xs font-mono text-amber-300">{kext}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
