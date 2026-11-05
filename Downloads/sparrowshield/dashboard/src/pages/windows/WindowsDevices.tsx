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
    return <span className="text-[10px]" style={{ color: "var(--c-faint)" }}>—</span>;
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
                <p className="text-xl font-bold tabular-nums" style={{ color: "var(--c-strong)" }}>{s.value}</p>
                <p className="text-[10px]" style={{ color: "var(--c-muted)" }}>{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Security Summary Bar */}
        {devices.length > 0 && (
          <div className="rounded-xl p-4 flex flex-wrap gap-6"
            style={{ background: "var(--c-card)", border: "1px solid var(--c-border)" }}>
            <p className="text-xs font-semibold self-center" style={{ color: "var(--c-muted)" }}>Security Posture</p>
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
                <span className="text-xs" style={{ color: "var(--c-muted)" }}>{c.label}</span>
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
          <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--c-border)" }}>
            <h2 className="text-sm font-semibold" style={{ color: "var(--c-strong)" }}>{devices.length} Windows Devices</h2>
          </div>

          {isLoading ? (
            <div className="py-16 text-center text-sm" style={{ color: "var(--c-faint)" }}>Loading…</div>
          ) : devices.length === 0 ? (
            <div className="py-16 text-center">
              <Monitor className="w-8 h-8 mx-auto mb-2" style={{ color: "var(--c-faint)" }} />
              <p className="text-sm" style={{ color: "var(--c-faint)" }}>No Windows devices enrolled</p>
              <p className="text-xs mt-1" style={{ color: "var(--c-faint)" }}>Run SparrowShieldAgent.exe to enrol a device</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider"
                  style={{ color: "var(--c-muted)", borderBottom: "1px solid var(--c-border)" }}>
                  {["Device", "Status", "BitLocker", "Firewall", "Defender", "UAC", "Posture", "Last Seen", ""].map(h => (
                    <th key={h} className="text-left py-3 px-4 font-semibold">{h}</th>
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
                      className="cursor-pointer transition-colors group"
                      style={{ borderBottom: "1px solid var(--c-divider)" }}
                      onMouseEnter={e => (e.currentTarget.style.background = "var(--c-bg)")}
                      onMouseLeave={e => (e.currentTarget.style.background = "")}>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="relative">
                            <Monitor className="w-4 h-4 text-blue-400" />
                            <span className={cn("absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full",
                              status === "online" ? "bg-green-500" : status === "isolated" ? "bg-red-500" : "bg-slate-600")}
                              style={{ border: "2px solid var(--c-card)" }} />
                          </div>
                          <div>
                            <p className="font-medium text-xs" style={{ color: "var(--c-text)" }}>{d.hostname ?? "—"}</p>
                            <p className="text-[10px]" style={{ color: "var(--c-faint)" }}>{d.assigned_user ?? "—"}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                          style={status === "online"
                            ? { background: "rgba(34,197,94,0.1)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.2)" }
                            : status === "isolated"
                            ? { background: "rgba(239,68,68,0.1)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.2)" }
                            : { background: "rgba(100,116,139,0.12)", color: "#94a3b8" }}>
                          {status === "isolated" ? "🔒 Isolated" : status}
                        </span>
                      </td>
                      <td className="py-3 px-4"><Check val={d.bitlocker_enabled} /></td>
                      <td className="py-3 px-4"><Check val={d.firewall_enabled} /></td>
                      <td className="py-3 px-4"><Check val={d.defender_enabled} /></td>
                      <td className="py-3 px-4"><Check val={d.uac_enabled} /></td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5">
                          <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--c-faint)" }}>
                            <div className="h-full rounded-full transition-all"
                              style={{
                                width: `${p.pct}%`,
                                background: p.pct >= 75 ? "#22c55e" : p.pct >= 50 ? "#f59e0b" : "#ef4444",
                              }} />
                          </div>
                          <span className="text-[10px]" style={{ color: "var(--c-muted)" }}>{p.pct}%</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-[10px] font-mono" style={{ color: "var(--c-faint)" }}>
                        {d.last_seen ? timeAgo(d.last_seen) : "—"}
                      </td>
                      <td className="py-3 px-4">
                        <ChevronRight className="w-4 h-4 transition-colors" style={{ color: "var(--c-faint)" }} />
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
