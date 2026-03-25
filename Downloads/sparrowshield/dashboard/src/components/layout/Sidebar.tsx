import { NavLink } from "react-router-dom";
import { LayoutDashboard, BellRing, Activity, Download, Apple, Monitor, Laptop } from "lucide-react";
import { useState } from "react";
import { cn } from "../../lib/utils";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";

const nav = [
  { to: "/", label: "Fleet Overview", icon: LayoutDashboard },
  { to: "/devices", label: "Device List", icon: Laptop },
  { to: "/alerts", label: "Alerts", icon: BellRing },
];

const MAC_AGENT_PATH   = "/agents/sparrowshield-mac-agent.zip";
const WIN_AGENT_PATH   = "/agents/sparrowshield-windows-agent.zip";
const CONFIG_PATH      = "/agents/config.json";

export default function Sidebar() {
  const [expanded, setExpanded] = useState(false);

  const { data: deviceCount = 0 } = useQuery<number>({
    queryKey: ["device-count"],
    queryFn: async () => {
      const { count } = await supabase.from("devices").select("*", { count: "exact", head: true });
      return count ?? 0;
    },
    refetchInterval: 30_000,
  });

  function downloadFile(url: string, filename: string) {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
  }

  return (
    <aside className="fixed left-0 top-0 h-full w-56 bg-slate-900 border-r border-slate-800 flex flex-col z-20">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-lg">🩺</div>
          <div>
            <p className="text-sm font-semibold text-white leading-none">HealSparrow</p>
            <p className="text-[10px] text-slate-500 mt-0.5">Fleet Health</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {nav.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-indigo-600/20 text-indigo-400 border border-indigo-600/30"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              )
            }
          >
            <Icon className="w-4 h-4" />
            <span className="flex-1">{label}</span>
            {to === "/devices" && deviceCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-indigo-600/30 text-indigo-400 text-[10px] font-bold border border-indigo-600/40">
                {deviceCount}
              </span>
            )}
          </NavLink>
        ))}

        {/* ── Download Agents ── */}
        <div className="pt-3">
          <p className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-600">
            Agents
          </p>

          {/* Toggle button */}
          <button
            onClick={() => setExpanded((v) => !v)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <Download className="w-4 h-4" />
            <span className="flex-1 text-left">Download Agent</span>
            <span className={cn("text-xs transition-transform duration-200", expanded ? "rotate-180" : "")}>▾</span>
          </button>

          {/* Expanded download options */}
          {expanded && (
            <div className="mt-1 ml-3 space-y-1 border-l border-slate-700 pl-3">

              {/* macOS */}
              <button
                onClick={() => downloadFile(MAC_AGENT_PATH, "sparrowshield-mac-agent.zip")}
                className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors group"
              >
                <span className="w-6 h-6 rounded-md bg-slate-800 group-hover:bg-indigo-600/30 flex items-center justify-center transition-colors">
                  <Apple className="w-3.5 h-3.5" />
                </span>
                <div className="text-left">
                  <p className="text-slate-300 font-medium">macOS Agent</p>
                  <p className="text-slate-600 text-[10px]">agent + config.json</p>
                </div>
              </button>

              {/* Windows */}
              <button
                onClick={() => downloadFile(WIN_AGENT_PATH, "sparrowshield-windows-agent.zip")}
                className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors group"
              >
                <span className="w-6 h-6 rounded-md bg-slate-800 group-hover:bg-blue-600/30 flex items-center justify-center transition-colors">
                  <Monitor className="w-3.5 h-3.5" />
                </span>
                <div className="text-left">
                  <p className="text-slate-300 font-medium">Windows Agent</p>
                  <p className="text-slate-600 text-[10px]">agent + config.json</p>
                </div>
              </button>

              {/* Config */}
              <button
                onClick={() => downloadFile(CONFIG_PATH, "config.json")}
                className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors group"
              >
                <span className="w-6 h-6 rounded-md bg-slate-800 group-hover:bg-emerald-600/30 flex items-center justify-center transition-colors">
                  <span className="text-[10px]">⚙️</span>
                </span>
                <div className="text-left">
                  <p className="text-slate-300 font-medium">Config File</p>
                  <p className="text-slate-600 text-[10px]">config.json</p>
                </div>
              </button>

              {/* Install instructions hint */}
              <div className="px-2 py-2 mt-1 rounded-lg bg-slate-800/60 border border-slate-700/50">
                <p className="text-[10px] text-slate-500 leading-relaxed">
                  📦 Each ZIP includes the <span className="text-slate-400">agent</span> + <span className="text-slate-400">config.json</span> — unzip and run.
                </p>
              </div>
            </div>
          )}
        </div>
      </nav>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-slate-800">
        <div className="flex items-center gap-2 text-xs text-slate-600">
          <Activity className="w-3 h-3" />
          <span>Auto-refresh 30s</span>
        </div>
      </div>
    </aside>
  );
}
