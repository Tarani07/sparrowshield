import { Wifi, WifiOff, Upload, Download, User, MonitorOff } from "lucide-react";
import { cn } from "../../lib/utils";
import type { Device } from "../../lib/types";

interface Props {
  device: Device;
}

/** Convert RSSI dBm to a 0–5 bar count */
function rssiBars(rssi: number | null): number {
  if (rssi == null) return 0;
  if (rssi >= -55) return 5;
  if (rssi >= -65) return 4;
  if (rssi >= -75) return 3;
  if (rssi >= -85) return 2;
  return 1;
}

function rssiLabel(rssi: number | null): string {
  if (rssi == null) return "No signal";
  if (rssi >= -55) return "Excellent";
  if (rssi >= -65) return "Good";
  if (rssi >= -75) return "Fair";
  if (rssi >= -85) return "Weak";
  return "Very Weak";
}

function rssiColor(rssi: number | null): string {
  if (rssi == null) return "text-slate-500";
  if (rssi >= -65) return "text-green-400";
  if (rssi >= -75) return "text-amber-400";
  return "text-red-400";
}

function SignalBars({ rssi }: { rssi: number | null }) {
  const bars = rssiBars(rssi);
  const heights = ["h-1.5", "h-2.5", "h-3.5", "h-4.5", "h-6"];
  const activeColor = rssi != null && rssi >= -65
    ? "bg-green-400"
    : rssi != null && rssi >= -75
      ? "bg-amber-400"
      : "bg-red-400";

  return (
    <div className="flex items-end gap-0.5">
      {heights.map((h, i) => (
        <div
          key={i}
          className={cn(
            "w-1.5 rounded-sm transition-colors",
            h,
            i < bars ? activeColor : "bg-slate-700"
          )}
        />
      ))}
    </div>
  );
}

function formatMb(mb: number | null): string {
  if (mb == null) return "—";
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb.toFixed(0)} MB`;
}

export default function NetworkCard({ device }: Props) {
  const {
    wifi_ssid,
    wifi_rssi,
    net_upload_mb,
    net_download_mb,
    active_user,
    remote_session_active,
  } = device;

  const isConnected = wifi_ssid != null;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        {isConnected
          ? <Wifi className="w-5 h-5 text-indigo-400" />
          : <WifiOff className="w-5 h-5 text-slate-500" />}
        <h2 className="text-sm font-semibold text-slate-200">Network</h2>
        {remote_session_active && (
          <span className="ml-auto flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/30">
            <MonitorOff className="w-3 h-3" />
            Remote Session Active
          </span>
        )}
      </div>

      <div className="space-y-4">
        {/* WiFi SSID + signal */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500">WiFi Network</p>
            <p className="text-sm font-semibold text-slate-200 mt-0.5">
              {wifi_ssid ?? "Not connected"}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <SignalBars rssi={wifi_rssi} />
            <span className={cn("text-[10px] font-mono", rssiColor(wifi_rssi))}>
              {wifi_rssi != null ? `${wifi_rssi} dBm` : ""} {rssiLabel(wifi_rssi)}
            </span>
          </div>
        </div>

        {/* Upload / Download */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-slate-800/60 rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Upload className="w-3 h-3 text-blue-400" />
              <span className="text-[10px] text-slate-500 uppercase tracking-wider">Upload</span>
            </div>
            <p className="text-sm font-bold font-mono text-blue-400">{formatMb(net_upload_mb)}</p>
          </div>
          <div className="bg-slate-800/60 rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Download className="w-3 h-3 text-emerald-400" />
              <span className="text-[10px] text-slate-500 uppercase tracking-wider">Download</span>
            </div>
            <p className="text-sm font-bold font-mono text-emerald-400">{formatMb(net_download_mb)}</p>
          </div>
        </div>

        {/* Active user */}
        <div className="flex items-center justify-between border-t border-slate-800 pt-3">
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <User className="w-3.5 h-3.5" />
            <span>Active User</span>
          </div>
          <span className="text-sm font-semibold text-slate-200">
            {active_user ?? "—"}
          </span>
        </div>
      </div>
    </div>
  );
}
