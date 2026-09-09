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
    <div className="p-6 space-y-6" style={{ color: "#c8d0e8" }}>
      <div>
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <Cpu className="w-5 h-5" style={{ color: "#a5b4fc" }} />
          Process Monitor
        </h1>
        <p className="text-sm mt-1" style={{ color: "#4b5270" }}>
          Top processes across all online endpoints, sorted by CPU
        </p>
      </div>

      <div className="rounded-xl overflow-hidden" style={{ background: "#13141a", border: "1px solid rgba(255,255,255,0.05)" }}>
        <div className="px-5 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
          <span className="text-sm font-semibold text-white">
            {devices.length} online device{devices.length !== 1 ? "s" : ""}
          </span>
          <span className="ml-2 text-xs" style={{ color: "#4b5270" }}>· {allProcs.length} processes</span>
        </div>

        {isLoading ? (
          <div className="p-8 text-center" style={{ color: "#4b5270" }}>Loading…</div>
        ) : allProcs.length === 0 ? (
          <div className="p-10 text-center">
            <AlertTriangle className="w-10 h-10 mx-auto mb-3" style={{ color: "#4b5270" }} />
            <p className="text-sm font-medium text-white">No process data available</p>
            <p className="text-xs mt-1" style={{ color: "#4b5270" }}>
              Agent must be running and reporting top_processes
            </p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                {["Process", "PID", "Device", "CPU %", "Mem %"].map(h => (
                  <th key={h} className="px-5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider"
                    style={{ color: "#2d3252" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
              {allProcs.slice(0, 50).map((p, i) => (
                <tr key={i} className="group hover:bg-white/[0.02] transition-colors">
                  <td className="px-5 py-2.5">
                    <span className="font-medium text-white font-mono text-xs">{p.name}</span>
                  </td>
                  <td className="px-5 py-2.5 text-xs font-mono" style={{ color: "#4b5270" }}>{p.pid}</td>
                  <td className="px-5 py-2.5 text-xs" style={{ color: "#94a3b8" }}>{p.hostname}</td>
                  <td className="px-5 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
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
                      <div className="w-16 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                        <div className="h-full rounded-full"
                          style={{
                            width: `${Math.min(p.mem, 100)}%`,
                            background: p.mem > 80 ? "#ef4444" : "#6366f1",
                          }} />
                      </div>
                      <span className="text-xs tabular-nums" style={{ color: "#a5b4fc" }}>
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
