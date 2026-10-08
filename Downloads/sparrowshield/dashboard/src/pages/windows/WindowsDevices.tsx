import { useNavigate } from "react-router-dom";
import { Monitor, Wifi, Lock, Shield, ShieldCheck, ChevronRight, WifiOff } from "lucide-react";
import TopBar from "../../components/layout/TopBar";
import { useAllDevices } from "../../hooks/useDevices";
import { cn, timeAgo } from "../../lib/utils";
import type { Device } from "../../lib/types";

function computeStatus(d: Device) {
  if (!d.last_seen) return "offline";
  return (Date.now() - new Date(d.last_seen).getTime()) / 60000 > 15 ? "offline" : d.isolated ? "isolated" : "online";
}

function posture(d: Device) {
  const checks = [d.bitlocker_enabled, d.firewall_enabled, d.defender_enabled, d.uac_enabled];
  const pass = checks.filter(Boolean).length;
  return { pass, total: checks.filter(v => v !== null && v !== undefined).length || 4, pct: Math.round((pass / 4) * 100) };
}

function Check({ val }: { val: boolean | null }) {
  if (val === null || val === undefined)
    return <span className="text-[10px] text-slate-700">—</span>;
  return val
    ? <span className="text-[10px] text-green-400 font-semibold">✓ On</span>
    : <span className="text-[10px] text-red-400 font-semibold">✗ Off</span>;
}

export default function WindowsDevices() {
  const navigate = useNavigate();
  const { data: allDevices = [], isLoading } = useAllDevices();
  const devices = allDevices.filter(d => d.os_type === "windows");

  const online   = devices.filter(d => computeStatus(d) === "online").length;
  const isolated = devices.filter(d => d.isolated).length;
  const blOff    = devices.filter(d => d.bitlocker_enabled === false).length;
  const defOff   = devices.filter(d => d.defender_enabled === false).length;

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--c-bg)" }}>
      <TopBar title="Windows Devices" />
      <div className="flex-1 overflow-y-auto p-6 space-y-5">

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: "Total Windows",   value: devices.length, icon: Monitor,     color: "#60a5fa", sub: "enrolled" },
            { label: "Online",          value: online,         icon: Wifi,        color: "#34d399", sub: `${devices.length - online} offline` },
            { label: "BitLocker Off",   value: blOff,          icon: Lock,        color: blOff  ? "#f87171" : "#34d399", sub: "unencrypted" },
            { label: "Defender Off",    value: defOff,         icon: ShieldCheck, color: defOff ? "#f87171" : "#34d399", sub: "unprotected" },
          ].map(s => (
            <div key={s.label} className="rounded-xl p-4 flex items-center gap-3"
              style={{ background: "var(--c-card)", border: "1px solid var(--c-border)" }}>
              <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: `${s.color}15` }}>
                <s.icon className="w-4 h-4" style={{ color: s.color }} />
              </div>
              <div>
                <p className="text-xl font-bold text-white tabular-nums">{s.value}</p>
                <p className="text-[10px] text-slate-500">{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Security Summary Bar */}
        {devices.length > 0 && (
          <div className="rounded-xl p-4 flex flex-wrap gap-6"
            style={{ background: "var(--c-card)", border: "1px solid var(--c-border)" }}>
            <p className="text-xs font-semibold text-slate-400 self-center">Security Posture</p>
            {[
              { label: "BitLocker",  pass: devices.filter(d => d.bitlocker_enabled).length,  total: devices.length },
              { label: "Firewall",   pass: devices.filter(d => d.firewall_enabled).length,   total: devices.length },
              { label: "Defender",   pass: devices.filter(d => d.defender_enabled).length,   total: devices.length },
              { label: "UAC",        pass: devices.filter(d => d.uac_enabled).length,        total: devices.length },
              { label: "RDP Off",    pass: devices.filter(d => !d.rdp_enabled).length,       total: devices.length },
            ].map(c => (
              <div key={c.label} className="flex items-center gap-2">
                <span className={cn("text-[10px] font-semibold",
                  c.pass === c.total ? "text-green-400" : c.pass >= c.total * 0.7 ? "text-amber-400" : "text-red-400")}>
                  {c.pass}/{c.total}
                </span>
                <span className="text-xs text-slate-500">{c.label}</span>
              </div>
            ))}
            {isolated > 0 && (
              <div className="ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-500/10 border border-red-500/20">
                <WifiOff className="w-3 h-3 text-red-400" />
                <span className="text-[10px] text-red-400 font-semibold">{isolated} Isolated</span>
              </div>
            )}
          </div>
        )}

        {/* Device Table */}
        <div className="rounded-xl overflow-hidden"
          style={{ background: "var(--c-card)", border: "1px solid var(--c-border)" }}>
          <div className="px-5 py-4 border-b border-slate-800/60">
            <h2 className="text-sm font-semibold text-white">{devices.length} Windows Devices</h2>
          </div>

          {isLoading ? (
            <div className="py-16 text-center text-sm text-slate-600">Loading…</div>
          ) : devices.length === 0 ? (
            <div className="py-16 text-center">
              <Monitor className="w-8 h-8 text-slate-700 mx-auto mb-2" />
              <p className="text-sm text-slate-600">No Windows devices enrolled</p>
              <p className="text-xs text-slate-700 mt-1">Run SparrowShieldAgent.exe to enrol a device</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] text-slate-600 uppercase tracking-wider border-b border-slate-800/60">
                  {["Device", "Status", "BitLocker", "Firewall", "Defender", "UAC", "Posture", "Last Seen", ""].map(h => (
                    <th key={h} className="text-left py-3 px-4 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {devices.map(d => {
                  const status = computeStatus(d);
                  const p = posture(d);
                  return (
                    <tr key={d.id}
                      onClick={() => navigate(`/device/${d.id}`)}
                      className="border-b border-slate-800/40 hover:bg-slate-800/30 cursor-pointer transition-colors group">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="relative">
                            <Monitor className="w-4 h-4 text-blue-400" />
                            <span className={cn("absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full border border-[#13141a]",
                              status === "online" ? "bg-green-500" : status === "isolated" ? "bg-red-500" : "bg-slate-600")} />
                          </div>
                          <div>
                            <p className="font-medium text-slate-200 text-xs">{d.hostname ?? "—"}</p>
                            <p className="text-slate-600 text-[10px]">{d.assigned_user ?? "—"}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className={cn("text-[10px] font-semibold px-2 py-0.5 rounded-full",
                          status === "online"   ? "bg-green-500/10 text-green-400" :
                          status === "isolated" ? "bg-red-500/10 text-red-400" :
                                                  "bg-slate-700/50 text-slate-500")}>
                          {status === "isolated" ? "🔒 Isolated" : status}
                        </span>
                      </td>
                      <td className="py-3 px-4"><Check val={d.bitlocker_enabled} /></td>
                      <td className="py-3 px-4"><Check val={d.firewall_enabled} /></td>
                      <td className="py-3 px-4"><Check val={d.defender_enabled} /></td>
                      <td className="py-3 px-4"><Check val={d.uac_enabled} /></td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          <div className="w-16 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                            <div className="h-full rounded-full transition-all"
                              style={{
                                width: `${p.pct}%`,
                                background: p.pct >= 75 ? "#22c55e" : p.pct >= 50 ? "#f59e0b" : "#ef4444",
                              }} />
                          </div>
                          <span className="text-[10px] text-slate-500">{p.pct}%</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-[10px] text-slate-600 font-mono">
                        {d.last_seen ? timeAgo(d.last_seen) : "—"}
                      </td>
                      <td className="py-3 px-4">
                        <ChevronRight className="w-4 h-4 text-slate-700 group-hover:text-slate-400 transition-colors" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
