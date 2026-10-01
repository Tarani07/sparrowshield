import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { WifiOff, Wifi, Shield, AlertTriangle, ChevronRight, Monitor } from "lucide-react";
import TopBar from "../../components/layout/TopBar";
import { useAllDevices } from "../../hooks/useDevices";
import { supabase } from "../../lib/supabase";
import { cn, timeAgo } from "../../lib/utils";
import type { Device } from "../../lib/types";

function computeStatus(d: Device) {
  if (!d.last_seen) return "offline";
  return (Date.now() - new Date(d.last_seen).getTime()) / 60000 > 15 ? "offline" : "online";
}

export default function HostIsolation() {
  const navigate = useNavigate();
  const { data: allDevices = [], isLoading, refetch } = useAllDevices();
  const [sending, setSending] = useState<Record<string, boolean>>({});
  const [sent, setSent]       = useState<Record<string, "isolate" | "unisolate">>({});

  const devices = allDevices.filter(d => d.os_type === "windows");
  const isolated    = devices.filter(d => d.isolated);
  const notIsolated = devices.filter(d => !d.isolated);

  async function sendCommand(deviceId: string, cmd: "isolate" | "unisolate") {
    setSending(p => ({ ...p, [deviceId]: true }));
    try {
      await supabase.from("device_commands").insert({
        device_id:    deviceId,
        command_type: cmd,
        payload:      {},
        status:       "pending",
      });
      setSent(p => ({ ...p, [deviceId]: cmd }));
    } finally {
      setSending(p => ({ ...p, [deviceId]: false }));
    }
  }

  return (
    <div className="flex flex-col h-full" style={{ background: "#0d0f16" }}>
      <TopBar title="Host Isolation" />
      <div className="flex-1 overflow-y-auto p-6 space-y-5">

        {/* Header info */}
        <div className="rounded-xl p-5 flex items-start gap-4"
          style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)" }}>
          <WifiOff className="w-5 h-5 text-red-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-red-300 mb-1">Host Isolation</p>
            <p className="text-xs text-red-300/70 leading-relaxed">
              Isolating a device immediately blocks all network traffic on the endpoint via Windows Firewall —
              except the SparrowShield management channel which stays open so you can unisolate remotely.
              Use during incident response to contain a compromised machine.
            </p>
          </div>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Total Windows",    value: devices.length,    color: "#60a5fa" },
            { label: "Currently Isolated", value: isolated.length, color: "#f87171" },
            { label: "Not Isolated",     value: notIsolated.length, color: "#34d399" },
          ].map(s => (
            <div key={s.label} className="rounded-xl p-4 text-center"
              style={{ background: "#13141a", border: "1px solid rgba(255,255,255,0.05)" }}>
              <p className="text-3xl font-bold tabular-nums mb-1" style={{ color: s.color }}>{s.value}</p>
              <p className="text-xs text-slate-500">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Isolated devices */}
        {isolated.length > 0 && (
          <div className="rounded-xl overflow-hidden"
            style={{ background: "#13141a", border: "1px solid rgba(239,68,68,0.25)" }}>
            <div className="px-5 py-4 border-b border-red-900/40 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <h2 className="text-sm font-semibold text-red-300">Isolated Devices ({isolated.length})</h2>
            </div>
            <div className="divide-y divide-slate-800/50">
              {isolated.map(d => (
                <DeviceRow key={d.id} device={d} onNavigate={() => navigate(`/device/${d.id}`)}
                  sending={!!sending[d.id]} sentCmd={sent[d.id]}
                  onIsolate={() => sendCommand(d.id, "isolate")}
                  onUnisolate={() => sendCommand(d.id, "unisolate")} />
              ))}
            </div>
          </div>
        )}

        {/* Active devices */}
        <div className="rounded-xl overflow-hidden"
          style={{ background: "#13141a", border: "1px solid rgba(255,255,255,0.05)" }}>
          <div className="px-5 py-4 border-b border-slate-800/60">
            <h2 className="text-sm font-semibold text-white">Active Devices ({notIsolated.length})</h2>
            <p className="text-[11px] text-slate-600 mt-0.5">Click Isolate to immediately cut off network access</p>
          </div>
          {isLoading ? (
            <div className="py-12 text-center text-sm text-slate-600">Loading…</div>
          ) : notIsolated.length === 0 ? (
            <div className="py-12 text-center">
              <Shield className="w-8 h-8 text-slate-700 mx-auto mb-2" />
              <p className="text-sm text-slate-500">All Windows devices are isolated</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-800/50">
              {notIsolated.map(d => (
                <DeviceRow key={d.id} device={d} onNavigate={() => navigate(`/device/${d.id}`)}
                  sending={!!sending[d.id]} sentCmd={sent[d.id]}
                  onIsolate={() => sendCommand(d.id, "isolate")}
                  onUnisolate={() => sendCommand(d.id, "unisolate")} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DeviceRow({ device, onNavigate, sending, sentCmd, onIsolate, onUnisolate }: {
  device: Device;
  onNavigate: () => void;
  sending: boolean;
  sentCmd?: "isolate" | "unisolate";
  onIsolate: () => void;
  onUnisolate: () => void;
}) {
  const status = computeStatus(device);
  const isIsolated = device.isolated;

  return (
    <div className="flex items-center gap-4 px-5 py-4 hover:bg-slate-800/20 transition-colors">
      {/* Device info */}
      <div className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer" onClick={onNavigate}>
        <div className="relative shrink-0">
          <Monitor className="w-4 h-4 text-blue-400" />
          <span className={cn("absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-[#13141a]",
            isIsolated ? "bg-red-500" : status === "online" ? "bg-green-500" : "bg-slate-600")} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-200 truncate">{device.hostname ?? "—"}</p>
          <p className="text-[11px] text-slate-600 truncate">{device.assigned_user ?? "—"} · {device.os_version ?? "Windows"}</p>
        </div>
      </div>

      {/* Status */}
      <div className="shrink-0">
        {isIsolated ? (
          <span className="flex items-center gap-1.5 text-[10px] font-semibold text-red-400 bg-red-500/10 px-2.5 py-1 rounded-full border border-red-500/20">
            <WifiOff className="w-3 h-3" /> Isolated
          </span>
        ) : (
          <span className={cn("flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1 rounded-full border",
            status === "online"
              ? "text-green-400 bg-green-500/10 border-green-500/20"
              : "text-slate-500 bg-slate-700/30 border-slate-700/30")}>
            {status === "online" ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            {status}
          </span>
        )}
      </div>

      {/* Last seen */}
      <p className="text-[11px] text-slate-600 font-mono shrink-0 w-20 text-right">
        {device.last_seen ? timeAgo(device.last_seen) : "—"}
      </p>

      {/* Action button */}
      <div className="shrink-0">
        {sentCmd ? (
          <span className="text-[10px] text-slate-500 italic">
            {sentCmd === "isolate" ? "Isolating…" : "Unisolating…"}
          </span>
        ) : isIsolated ? (
          <button onClick={onUnisolate} disabled={sending}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors
              bg-green-500/10 border border-green-500/30 text-green-400
              hover:bg-green-500/20 disabled:opacity-50">
            {sending ? "…" : "Unisolate"}
          </button>
        ) : (
          <button onClick={onIsolate} disabled={sending || status === "offline"}
            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors
              bg-red-500/10 border border-red-500/30 text-red-400
              hover:bg-red-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
            title={status === "offline" ? "Device is offline — cannot send isolation command" : ""}>
            {sending ? "…" : "Isolate"}
          </button>
        )}
      </div>

      {/* Navigate */}
      <ChevronRight className="w-4 h-4 text-slate-700 cursor-pointer hover:text-slate-400 transition-colors"
        onClick={onNavigate} />
    </div>
  );
}
