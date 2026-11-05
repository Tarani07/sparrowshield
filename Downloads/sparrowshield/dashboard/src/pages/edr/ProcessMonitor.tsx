import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { Cpu, AlertTriangle } from "lucide-react";

interface Device {
  id: string;
  hostname: string;
  status: string;
  top_processes: Array<{ name: string; pid: number; cpu: number; mem: number }> | null;
}

export default function ProcessMonitor() {
  const { data: devices = [], isLoading } = useQuery<Device[]>({
    queryKey: ["edr-processes"],
    queryFn: async () => {
      const { data } = await supabase
        .from("devices")
        .select("id, hostname, status, top_processes")
        .eq("status", "online")
        .order("hostname");
      return data ?? [];
    },
    refetchInterval: 30_000,
  });

  const allProcs = devices.flatMap(d =>
    (d.top_processes ?? []).map(p => ({ ...p, hostname: d.hostname }))
  ).sort((a, b) => b.cpu - a.cpu);

  return (
    <div className="p-6 space-y-5" style={{ color: "var(--c-text)" }}>
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2" style={{ color: "var(--c-strong)" }}>
            <Cpu className="w-5 h-5" style={{ color: "var(--c-primary)" }} />
            Process Monitor
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--c-muted)" }}>
            Top processes across all online endpoints, sorted by CPU
          </p>
        </div>
      </div>

      <div className="rounded-xl overflow-hidden" style={{ background: "var(--c-card)", border: "1px solid var(--c-border)" }}>
        <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--c-border)" }}>
          <span className="text-sm font-bold" style={{ color: "var(--c-strong)" }}>
            {devices.length} online device{devices.length !== 1 ? "s" : ""}
          </span>
          <span className="ml-2 text-xs" style={{ color: "var(--c-muted)" }}>· {allProcs.length} processes</span>
        </div>

        {isLoading ? (
          <div className="p-8 text-center" style={{ color: "var(--c-muted)" }}>Loading…</div>
        ) : allProcs.length === 0 ? (
          <div className="p-10 text-center">
            <AlertTriangle className="w-10 h-10 mx-auto mb-3" style={{ color: "var(--c-muted)" }} />
            <p className="text-sm font-medium" style={{ color: "var(--c-strong)" }}>No process data available</p>
            <p className="text-xs mt-1" style={{ color: "var(--c-muted)" }}>
              Agent must be running and reporting top_processes
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--c-border)" }}>
                {["Process", "PID", "Device", "CPU %", "Mem %"].map(h => (
                  <th key={h} className="px-5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider"
                    style={{ color: "var(--c-muted)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: "var(--c-divider)" }}>
              {allProcs.slice(0, 50).map((p, i) => (
                <tr key={i} className="group transition-colors"
                  style={{ borderBottom: "1px solid var(--c-divider)" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "var(--c-bg)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "")}>
                  <td className="px-5 py-2.5">
                    <span className="font-medium font-mono text-xs" style={{ color: "var(--c-strong)" }}>{p.name}</span>
                  </td>
                  <td className="px-5 py-2.5 text-xs font-mono" style={{ color: "var(--c-muted)" }}>{p.pid}</td>
                  <td className="px-5 py-2.5 text-xs" style={{ color: "var(--c-muted)" }}>{p.hostname}</td>
                  <td className="px-5 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--c-border2)" }}>
                        <div className="h-full rounded-full"
                          style={{
                            width: `${Math.min(p.cpu, 100)}%`,
                            background: p.cpu > 80 ? "#ef4444" : p.cpu > 40 ? "#f59e0b" : "#4ade80",
                          }} />
                      </div>
                      <span className="text-xs tabular-nums"
                        style={{ color: p.cpu > 80 ? "#f87171" : p.cpu > 40 ? "#fbbf24" : "#4ade80" }}>
                        {p.cpu.toFixed(1)}%
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--c-border2)" }}>
                        <div className="h-full rounded-full"
                          style={{
                            width: `${Math.min(p.mem, 100)}%`,
                            background: p.mem > 80 ? "#ef4444" : "#1B5E37",
                          }} />
                      </div>
                      <span className="text-xs tabular-nums" style={{ color: "#1B5E37" }}>
                        {p.mem.toFixed(1)}%
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
