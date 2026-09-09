import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { Network, AlertTriangle } from "lucide-react";

interface Device {
  id: string;
  hostname: string;
  status: string;
  listening_ports: Array<{ port: number; protocol: string; process: string }> | null;
  open_connections_count: number | null;
  public_ip: string | null;
}

const SUSPICIOUS_PORTS = new Set([4444, 1337, 31337, 4545, 6666, 7777, 12345, 54321, 9999, 5555]);

export default function NetworkActivity() {
  const { data: devices = [], isLoading } = useQuery<Device[]>({
    queryKey: ["edr-network"],
    queryFn: async () => {
      const { data } = await supabase
        .from("devices")
        .select("id, hostname, status, listening_ports, open_connections_count, public_ip")
        .order("hostname");
      return data ?? [];
    },
    refetchInterval: 30_000,
  });

  const allPorts = devices.flatMap(d =>
    (d.listening_ports ?? []).map(p => ({ ...p, hostname: d.hostname, suspicious: SUSPICIOUS_PORTS.has(p.port) }))
  ).sort((a, b) => (b.suspicious ? 1 : 0) - (a.suspicious ? 1 : 0));

  const suspiciousCount = allPorts.filter(p => p.suspicious).length;

  return (
    <div className="p-6 space-y-6" style={{ color: "#c8d0e8" }}>
      <div>
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <Network className="w-5 h-5" style={{ color: "#a5b4fc" }} />
          Network Activity
        </h1>
        <p className="text-sm mt-1" style={{ color: "#4b5270" }}>
          Listening ports and connections across all endpoints
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Total Ports",    value: allPorts.length,   color: "#a5b4fc", bg: "rgba(99,102,241,0.08)" },
          { label: "Suspicious",     value: suspiciousCount,   color: "#f87171", bg: "rgba(239,68,68,0.08)"  },
          { label: "Online Devices", value: devices.filter(d => d.status === "online").length, color: "#4ade80", bg: "rgba(34,197,94,0.08)" },
        ].map(s => (
          <div key={s.label} className="rounded-xl p-4" style={{ background: s.bg, border: `1px solid ${s.color}18` }}>
            <p className="text-[11px] uppercase tracking-wider" style={{ color: s.color }}>{s.label}</p>
            <p className="text-3xl font-bold mt-1" style={{ color: s.color }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Per-device table */}
      <div className="rounded-xl overflow-hidden" style={{ background: "#13141a", border: "1px solid rgba(255,255,255,0.05)" }}>
        <div className="px-5 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
          <span className="text-sm font-semibold text-white">Listening Ports</span>
          {suspiciousCount > 0 && (
            <span className="ml-3 text-[11px] px-2 py-0.5 rounded font-bold"
              style={{ background: "rgba(239,68,68,0.12)", color: "#f87171" }}>
              {suspiciousCount} suspicious
            </span>
          )}
        </div>

        {isLoading ? (
          <div className="p-8 text-center" style={{ color: "#4b5270" }}>Loading…</div>
        ) : allPorts.length === 0 ? (
          <div className="p-10 text-center">
            <AlertTriangle className="w-10 h-10 mx-auto mb-3" style={{ color: "#4b5270" }} />
            <p className="text-sm font-medium text-white">No port data available</p>
            <p className="text-xs mt-1" style={{ color: "#4b5270" }}>Agent must be reporting listening_ports</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                {["Port", "Protocol", "Process", "Device", "Flag"].map(h => (
                  <th key={h} className="px-5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider"
                    style={{ color: "#2d3252" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
              {allPorts.map((p, i) => (
                <tr key={i} style={{ background: p.suspicious ? "rgba(239,68,68,0.04)" : undefined }}>
                  <td className="px-5 py-2.5 font-mono text-xs font-bold"
                    style={{ color: p.suspicious ? "#f87171" : "#a5b4fc" }}>{p.port}</td>
                  <td className="px-5 py-2.5 text-xs font-mono uppercase" style={{ color: "#4b5270" }}>{p.protocol}</td>
                  <td className="px-5 py-2.5 text-xs font-mono text-white">{p.process}</td>
                  <td className="px-5 py-2.5 text-xs" style={{ color: "#94a3b8" }}>{p.hostname}</td>
                  <td className="px-5 py-2.5">
                    {p.suspicious ? (
                      <span className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded"
                        style={{ background: "rgba(239,68,68,0.12)", color: "#f87171" }}>
                        <AlertTriangle className="w-3 h-3" /> Suspicious
                      </span>
                    ) : (
                      <span className="text-[10px]" style={{ color: "#2d3252" }}>—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Device connection summary */}
      <div className="rounded-xl overflow-hidden" style={{ background: "#13141a", border: "1px solid rgba(255,255,255,0.05)" }}>
        <div className="px-5 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
          <span className="text-sm font-semibold text-white">Connection Count by Device</span>
        </div>
        <div className="divide-y" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
          {devices.filter(d => d.open_connections_count != null).map(d => (
            <div key={d.id} className="px-5 py-3 flex items-center gap-4">
              <div className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ background: d.status === "online" ? "#4ade80" : "#334155" }} />
              <span className="text-sm text-white flex-1">{d.hostname}</span>
              <span className="text-xs" style={{ color: "#4b5270" }}>{d.public_ip ?? "—"}</span>
              <span className="text-sm font-bold tabular-nums" style={{ color: "#a5b4fc" }}>
                {d.open_connections_count} conns
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
