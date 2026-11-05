import { useNavigate } from "react-router-dom";
import { Terminal, Wifi, Shield, ChevronRight } from "lucide-react";
import TopBar from "../../components/layout/TopBar";
import { useAllDevices } from "../../hooks/useDevices";
import { timeAgo } from "../../lib/utils";
import type { Device } from "../../lib/types";

function computeStatus(d: Device) {
  if (!d.last_seen) return "offline";
  return (Date.now() - new Date(d.last_seen).getTime()) / 60000 > 15 ? "offline" : "online";
}

export default function LinuxDevices() {
  const navigate = useNavigate();
  const { data: allDevices = [], isLoading } = useAllDevices();
  const devices = allDevices.filter(d =>
    ["linux", "debian", "ubuntu", "centos", "rhel"].includes((d.os_type ?? "").toLowerCase())
  );

  const online  = devices.filter(d => computeStatus(d) === "online").length;
  const offline = devices.length - online;

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--c-bg)" }}>
      <TopBar title="Linux Devices" />
      <div className="flex-1 overflow-y-auto p-6 space-y-5">

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {[
            { label: "Total Linux",  value: devices.length, icon: Terminal, color: "#34d399", sub: "enrolled" },
            { label: "Online",       value: online,          icon: Wifi,     color: "#34d399", sub: `${offline} offline` },
            { label: "Sensors",      value: online,          icon: Shield,   color: "#3b82f6", sub: "reporting" },
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

        {/* Device list */}
        <div className="rounded-2xl overflow-hidden" style={{ background: "var(--c-card)", border: "1px solid var(--c-border)" }}>
          <div className="px-5 py-3 flex items-center justify-between"
            style={{ borderBottom: "1px solid var(--c-border)", background: "var(--c-bg)" }}>
            <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--c-faint)" }}>
              Linux Endpoints
            </p>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded"
              style={{ background: "rgba(52,211,153,0.12)", color: "#34d399" }}>
              {devices.length} enrolled
            </span>
          </div>

          {isLoading ? (
            <div className="py-12 text-center text-sm" style={{ color: "var(--c-muted)" }}>Loading…</div>
          ) : devices.length === 0 ? (
            <div className="py-16 text-center space-y-3">
              <Terminal className="w-10 h-10 mx-auto" style={{ color: "var(--c-faint)" }} />
              <p className="text-sm font-semibold" style={{ color: "var(--c-strong)" }}>No Linux devices enrolled</p>
              <p className="text-xs" style={{ color: "var(--c-muted)" }}>
                Download the Linux installer from the sidebar → Get Agent → Linux Install (.sh)
              </p>
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: "var(--c-border)" }}>
              {devices.map(d => {
                const status = computeStatus(d);
                return (
                  <button
                    key={d.id}
                    onClick={() => navigate(`/device/${d.id}`)}
                    className="w-full flex items-center gap-4 px-5 py-4 text-left transition-all hover:opacity-80"
                    style={{ background: "var(--c-card)" }}
                  >
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: "rgba(52,211,153,0.12)" }}>
                      <Terminal className="w-4 h-4" style={{ color: "#34d399" }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate" style={{ color: "var(--c-strong)" }}>
                        {d.hostname ?? d.id}
                      </p>
                      <p className="text-[10px] truncate" style={{ color: "var(--c-muted)" }}>
                        {d.os_version ?? d.os_type ?? "Linux"} · {d.last_seen ? timeAgo(d.last_seen) : "Never"}
                      </p>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0"
                      style={{
                        background: status === "online" ? "rgba(34,197,94,0.12)" : "rgba(107,114,128,0.12)",
                        color: status === "online" ? "#22c55e" : "#9ca3af",
                      }}>
                      {status}
                    </span>
                    <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--c-faint)" }} />
                  </button>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
