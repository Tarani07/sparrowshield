import { NavLink } from "react-router-dom";
import {
  LayoutDashboard, BellRing, Activity, ChevronDown, ChevronUp,
  Apple, Monitor, Laptop, Settings, FileText, ShieldCheck,
  Info, Package, Shield, Download,
} from "lucide-react";
import { useState } from "react";
import { cn } from "../../lib/utils";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";

const nav = [
  { to: "/",          label: "Overview",    icon: LayoutDashboard },
  { to: "/devices",   label: "Devices",     icon: Laptop         },
  { to: "/alerts",    label: "Alerts",      icon: BellRing       },
  { to: "/patches",   label: "Patches",     icon: Package        },
  { to: "/reports",   label: "Reports",     icon: FileText       },
  { to: "/compliance",label: "Compliance",  icon: ShieldCheck    },
  { to: "/settings",  label: "Settings",    icon: Settings       },
  { to: "/about",     label: "About",       icon: Info           },
];

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
    <aside className="fixed left-0 top-0 h-full w-56 flex flex-col z-20"
      style={{ background: "#0d0f16", borderRight: "1px solid rgba(255,255,255,0.05)" }}>

      {/* Logo */}
      <div className="px-5 pt-6 pb-5" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, #4f46e5, #7c3aed)" }}>
            <Shield className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white leading-none tracking-tight">SparrowShield</p>
            <p className="text-[10px] mt-0.5" style={{ color: "#4b5270" }}>Fleet Management</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {nav.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all duration-150",
                isActive
                  ? "text-white"
                  : "hover:text-slate-200"
              )
            }
            style={({ isActive }) => isActive
              ? { background: "rgba(99,102,241,0.15)", color: "#a5b4fc" }
              : { color: "#4b5270" }
            }
          >
            {({ isActive }) => (
              <>
                <Icon className="w-4 h-4 flex-shrink-0" />
                <span className="flex-1">{label}</span>
                {to === "/devices" && deviceCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-bold"
                    style={{
                      background: isActive ? "rgba(99,102,241,0.3)" : "rgba(255,255,255,0.06)",
                      color: isActive ? "#a5b4fc" : "#4b5270",
                    }}>
                    {deviceCount}
                  </span>
                )}
              </>
            )}
          </NavLink>
        ))}

        {/* Download Agents */}
        <div className="pt-4">
          <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-widest" style={{ color: "#2d3252" }}>
            Agents
          </p>
          <button
            onClick={() => setExpanded(v => !v)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all"
            style={{ color: "#4b5270" }}
            onMouseEnter={e => (e.currentTarget.style.color = "#94a3b8")}
            onMouseLeave={e => (e.currentTarget.style.color = "#4b5270")}
          >
            <Download className="w-4 h-4" />
            <span className="flex-1 text-left">Download Agent</span>
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>

          {expanded && (
            <div className="mt-1 ml-4 pl-3 space-y-0.5" style={{ borderLeft: "1px solid rgba(255,255,255,0.05)" }}>
              {[
                { label: "macOS Agent", sub: "agent + config", icon: Apple, file: "/agents/sparrowshield-mac-agent.zip", dl: "sparrowshield-mac-agent.zip" },
                { label: "Windows Agent", sub: "agent + config", icon: Monitor, file: "/agents/sparrowshield-windows-agent.zip", dl: "sparrowshield-windows-agent.zip" },
              ].map(item => (
                <button
                  key={item.label}
                  onClick={() => downloadFile(item.file, item.dl)}
                  className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-xs transition-all text-left"
                  style={{ color: "#4b5270" }}
                  onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; e.currentTarget.style.color = "#94a3b8"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#4b5270"; }}
                >
                  <item.icon className="w-3.5 h-3.5 flex-shrink-0" />
                  <div>
                    <p className="font-medium text-slate-300" style={{ fontSize: 11 }}>{item.label}</p>
                    <p style={{ fontSize: 10, color: "#2d3252" }}>{item.sub}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </nav>

      {/* Footer */}
      <div className="px-4 py-4" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
        <div className="flex items-center gap-2" style={{ color: "#2d3252" }}>
          <Activity className="w-3 h-3" />
          <span className="text-[10px]">Auto-refresh every 30s</span>
        </div>
      </div>
    </aside>
  );
}
