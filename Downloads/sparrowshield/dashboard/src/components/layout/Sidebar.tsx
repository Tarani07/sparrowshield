import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, BellRing, Activity, ChevronDown, ChevronUp,
  Apple, Monitor, Laptop, Settings, FileText, ShieldCheck,
  Info, Package, Shield, Download, ScanLine, Trash2, BookOpen,
  Network, Cpu, ListChecks, WifiOff,
} from "lucide-react";
import { useState } from "react";
import { cn } from "../../lib/utils";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";

type NavItem = { to: string; label: string; icon: React.ElementType };

function SectionLabel({ label, color }: { label: string; color?: string }) {
  return (
    <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-widest"
      style={{ color: color ?? "#2d3252" }}>
      {label}
    </p>
  );
}

function OsSectionHeader({ icon: Icon, label, count, color }: {
  icon: React.ElementType; label: string; count: number; color: string;
}) {
  return (
    <div className="flex items-center gap-2 px-3 mb-1">
      <Icon className="w-3 h-3" style={{ color }} />
      <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "#2d3252" }}>{label}</p>
      <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.04)" }} />
      {count > 0 && (
        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded"
          style={{ background: "rgba(255,255,255,0.06)", color: "#4b5270" }}>
          {count}
        </span>
      )}
    </div>
  );
}

function NavGroup({ items, badge }: { items: NavItem[]; badge?: Record<string, number> }) {
  return (
    <div className="space-y-0.5">
      {items.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === "/"}
          className={({ isActive }) =>
            cn(
              "flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-150",
              isActive ? "text-white" : "hover:text-slate-200"
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
              {badge?.[to] ? (
                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold"
                  style={{
                    background: isActive ? "rgba(99,102,241,0.3)" : "rgba(255,255,255,0.06)",
                    color: isActive ? "#a5b4fc" : "#4b5270",
                  }}>
                  {badge[to]}
                </span>
              ) : null}
            </>
          )}
        </NavLink>
      ))}
    </div>
  );
}

export default function Sidebar() {
  const [expanded, setExpanded] = useState(false);

  const { data: macCount = 0 } = useQuery<number>({
    queryKey: ["mac-device-count"],
    queryFn: async () => {
      const { count } = await supabase.from("devices")
        .select("*", { count: "exact", head: true })
        .in("os_type", ["mac", "macos", "darwin"]);
      return count ?? 0;
    },
    refetchInterval: 30_000,
  });

  const { data: winCount = 0 } = useQuery<number>({
    queryKey: ["win-device-count"],
    queryFn: async () => {
      const { count } = await supabase.from("devices")
        .select("*", { count: "exact", head: true })
        .eq("os_type", "windows");
      return count ?? 0;
    },
    refetchInterval: 30_000,
  });

  const { data: macAlerts = 0 } = useQuery<number>({
    queryKey: ["mac-alert-count"],
    queryFn: async () => {
      const { count } = await supabase.from("alerts")
        .select("*, devices!inner(os_type)", { count: "exact", head: true })
        .eq("resolved", false)
        .in("devices.os_type", ["mac", "macos", "darwin"]);
      return count ?? 0;
    },
    refetchInterval: 30_000,
  });

  const { data: winAlerts = 0 } = useQuery<number>({
    queryKey: ["win-alert-count"],
    queryFn: async () => {
      const { count } = await supabase.from("alerts")
        .select("*, devices!inner(os_type)", { count: "exact", head: true })
        .eq("resolved", false)
        .eq("devices.os_type", "windows");
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

  const macBadge: Record<string, number> = {};
  if (macAlerts > 0) macBadge["/mac/edr"] = macAlerts;

  const winBadge: Record<string, number> = {};
  if (winAlerts > 0) winBadge["/windows/edr"] = winAlerts;

  const fleetNav: NavItem[] = [
    { to: "/",        label: "Overview",    icon: LayoutDashboard },
    { to: "/devices", label: "All Devices", icon: Laptop          },
  ];

  const macNav: NavItem[] = [
    { to: "/mac/devices", label: "Mac Devices",      icon: Apple    },
    { to: "/mac/av",      label: "AV Scanner",       icon: ScanLine },
    { to: "/mac/edr",     label: "EDR Detections",   icon: BellRing },
    { to: "/mac/network", label: "Network Activity", icon: Network  },
  ];

  const winNav: NavItem[] = [
    { to: "/windows/devices",   label: "Win Devices",     icon: Monitor    },
    { to: "/windows/av",        label: "AV Scanner",      icon: ScanLine   },
    { to: "/windows/edr",       label: "EDR Detections",  icon: BellRing   },
    { to: "/windows/isolation", label: "Host Isolation",  icon: WifiOff    },
  ];

  const mgmtNav: NavItem[] = [
    { to: "/patches",    label: "Patches",    icon: Package    },
    { to: "/compliance", label: "Compliance", icon: ShieldCheck},
    { to: "/reports",    label: "Reports",    icon: FileText   },
  ];

  const systemNav: NavItem[] = [
    { to: "/settings", label: "Settings", icon: Settings },
    { to: "/about",    label: "About",    icon: Info     },
  ];

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
            <p className="text-[10px] mt-0.5" style={{ color: "#4b5270" }}>Security Platform</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-4 overflow-y-auto">

        {/* Fleet */}
        <div>
          <SectionLabel label="Fleet" />
          <NavGroup items={fleetNav} />
        </div>

        {/* macOS section */}
        <div>
          <OsSectionHeader icon={Apple} label="macOS" count={macCount} color="#a78bfa" />
          <NavGroup items={macNav} badge={macBadge} />
        </div>

        {/* Windows section */}
        <div>
          <OsSectionHeader icon={Monitor} label="Windows" count={winCount} color="#60a5fa" />
          <NavGroup items={winNav} badge={winBadge} />
        </div>

        {/* Management */}
        <div>
          <SectionLabel label="Management" />
          <NavGroup items={mgmtNav} />
        </div>

        {/* System */}
        <div>
          <SectionLabel label="System" />
          <NavGroup items={systemNav} />
        </div>

        {/* Download Agents */}
        <div>
          <SectionLabel label="Agents" />
          <button
            onClick={() => setExpanded(v => !v)}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium transition-all"
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
                { label: "macOS Agent (.py)", icon: Apple,   file: "/agents/sparrowshield_agent.py",   dl: "sparrowshield_agent.py" },
                { label: "Windows EXE",       icon: Monitor, file: "/agents/SparrowShieldAgent.exe",   dl: "SparrowShieldAgent.exe" },
                { label: "Windows (.py)",      icon: Monitor, file: "/agents/agent_windows.py",         dl: "agent_windows.py" },
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
                  <p className="font-medium" style={{ fontSize: 11, color: "#94a3b8" }}>{item.label}</p>
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
