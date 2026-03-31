import { Bluetooth, Monitor, Printer } from "lucide-react";
import { cn } from "../../lib/utils";
import type { Device } from "../../lib/types";

interface Props {
  device: Device;
}

export default function PeripheralsCard({ device }: Props) {
  const { bluetooth_devices, connected_displays, printers } = device;
  const hasData = bluetooth_devices?.length || connected_displays?.length || printers?.length;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Bluetooth className="w-5 h-5 text-indigo-400" />
        <h2 className="text-sm font-semibold text-slate-200">Peripherals</h2>
      </div>

      {!hasData ? (
        <p className="text-xs text-slate-500">No data yet</p>
      ) : (
        <div className="space-y-4">
          {bluetooth_devices && bluetooth_devices.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Bluetooth className="w-3.5 h-3.5 text-blue-400" />
                <span className="text-xs text-slate-500">Bluetooth Devices</span>
              </div>
              <div className="space-y-1">
                {bluetooth_devices.map((bt, i) => (
                  <div key={i} className="bg-slate-800/60 rounded-lg px-3 py-2 flex items-center justify-between">
                    <div>
                      <p className="text-xs text-slate-300">{bt.name}</p>
                      <p className="text-[10px] text-slate-500">{bt.type}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {bt.battery_pct != null && (
                        <span className="text-[10px] font-mono text-slate-400">{bt.battery_pct}%</span>
                      )}
                      <span className={cn(
                        "w-2 h-2 rounded-full",
                        bt.connected ? "bg-green-400" : "bg-slate-600"
                      )} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {connected_displays && connected_displays.length > 0 && (
            <div className="border-t border-slate-800 pt-3">
              <div className="flex items-center gap-1.5 mb-2">
                <Monitor className="w-3.5 h-3.5 text-slate-500" />
                <span className="text-xs text-slate-500">Displays</span>
              </div>
              <div className="space-y-1">
                {connected_displays.map((disp, i) => (
                  <div key={i} className="bg-slate-800/60 rounded-lg px-3 py-2">
                    <p className="text-xs text-slate-300">{disp.name}</p>
                    <p className="text-[10px] text-slate-500">{disp.resolution} &middot; {disp.gpu}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {printers && printers.length > 0 && (
            <div className="border-t border-slate-800 pt-3">
              <div className="flex items-center gap-1.5 mb-2">
                <Printer className="w-3.5 h-3.5 text-slate-500" />
                <span className="text-xs text-slate-500">Printers</span>
              </div>
              <div className="space-y-1">
                {printers.map((p, i) => (
                  <div key={i} className="bg-slate-800/60 rounded-lg px-3 py-2">
                    <span className="text-xs text-slate-300">{p}</span>
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
