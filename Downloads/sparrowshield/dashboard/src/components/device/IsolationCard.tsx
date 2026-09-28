import { useState } from "react";
import { Shield, ShieldOff, AlertTriangle, Wifi, WifiOff } from "lucide-react";
import { supabase } from "../../lib/supabase";
import type { Device } from "../../lib/types";

interface IsolationCardProps {
  device: Device;
}

export default function IsolationCard({ device }: IsolationCardProps) {
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState<"isolate" | "unisolate" | null>(null);
  const isIsolated = device.isolated ?? false;

  async function sendCommand(cmd: "isolate" | "unisolate") {
    setLoading(true);
    try {
      await supabase.from("device_commands").insert({
        device_id:    device.id,
        command_type: cmd,
        payload:      {},
        status:       "pending",
      });
      setSent(cmd);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={`rounded-xl border p-5 ${isIsolated
      ? "bg-red-950/30 border-red-700/50"
      : "bg-slate-900 border-slate-800"}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {isIsolated
            ? <WifiOff className="w-4 h-4 text-red-400" />
            : <Wifi className="w-4 h-4 text-slate-400" />}
          <span className="text-sm font-semibold text-white">Host Isolation</span>
          {isIsolated && (
            <span className="px-2 py-0.5 bg-red-500/20 border border-red-500/40 rounded-full text-xs text-red-400 font-semibold">
              ISOLATED
            </span>
          )}
        </div>
      </div>

      {isIsolated ? (
        <div className="space-y-3">
          <p className="text-xs text-red-300/80">
            This device is network-isolated. All traffic is blocked except the SparrowShield management channel.
          </p>
          <div className="flex items-center gap-2 text-xs text-red-400/70 bg-red-950/50 rounded-lg px-3 py-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>User cannot access the internet or internal network until unisolated.</span>
          </div>
          <button
            onClick={() => sendCommand("unisolate")}
            disabled={loading || sent === "unisolate"}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg
              bg-green-600/20 border border-green-500/40 text-green-400 text-sm font-medium
              hover:bg-green-600/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <ShieldOff className="w-4 h-4" />
            {loading ? "Sending…" : sent === "unisolate" ? "Command sent — waiting for agent" : "Unisolate Device"}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-slate-400">
            Isolate this device to immediately cut off all network access while keeping the management channel alive.
          </p>
          <div className="text-xs text-slate-500 space-y-1">
            <div className="flex items-center gap-1.5"><span className="text-green-500">✓</span> Blocks all inbound and outbound traffic</div>
            <div className="flex items-center gap-1.5"><span className="text-green-500">✓</span> Allowlists Supabase so agent stays connected</div>
            <div className="flex items-center gap-1.5"><span className="text-green-500">✓</span> Can be reversed remotely via Unisolate</div>
          </div>
          <button
            onClick={() => sendCommand("isolate")}
            disabled={loading || sent === "isolate"}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg
              bg-red-600/20 border border-red-500/40 text-red-400 text-sm font-medium
              hover:bg-red-600/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Shield className="w-4 h-4" />
            {loading ? "Sending…" : sent === "isolate" ? "Command queued — agent will isolate shortly" : "Isolate Device"}
          </button>
        </div>
      )}
    </div>
  );
}
