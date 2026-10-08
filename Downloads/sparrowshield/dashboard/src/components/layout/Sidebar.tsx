import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, BellRing, Activity, ChevronDown, ChevronUp,
  Apple, Monitor, Laptop, Settings, FileText, ShieldCheck,
  Info, Package, Shield, Download, ScanLine, Trash2,
  Network, WifiOff, Bug, Sun, Moon,
} from "lucide-react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { useTheme } from "../../lib/ThemeContext";

type NavItem = { to: string; label: string; icon: React.ElementType };

function SectionLabel({ label }: { label: string }) {
  return (
    <p className="px-4 mb-1 mt-1 text-[10px] font-bold uppercase tracking-widest"
      style={{ color: "var(--c-faint)" }}>
      {label}
    </p>
  );
}

function NavGroup({ items, badge, isLight }: {
  items: NavItem[];
  badge?: Record<string, number>;
  isLight: boolean;
}) {
  return (
    <div className="space-y-0.5">
      {items.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === "/"}
          style={({ isActive }) => isActive
            ? {
                display: "flex", alignItems: "center", gap: 10,
                padding: "8px 16px",
                borderRadius: 10,
                fontSize: 13, fontWeight: 600,
                background: "var(--c-nav-active-bg)",
                color: "var(--c-nav-active)",
                borderLeft: isLight ? "3px solid var(--c-primary)" : "none",
              }
            : {
                display: "flex", alignItems: "center", gap: 10,
                padding: "8px 16px",
                borderRadius: 10,
                fontSize: 13, fontWeight: 500,
                color: "var(--c-muted)",
                borderLeft: "3px solid transparent",
              }
          }
          className="transition-all duration-150 hover:opacity-80"
        >
          {({ isActive }) => (
            <>
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1">{label}</span>
              {badge?.[to] ? (
                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold"
                  style={{
                    background: isActive ? "var(--c-primary-bg)" : "var(--c-border2)",
                    color: isActive ? "var(--c-nav-active)" : "var(--c-muted)",
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
  const { theme, toggle } = useTheme();
  const isLight = theme === "light";
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

  const { data: alertCount = 0 } = useQuery<number>({
    queryKey: ["open-alert-count"],
    queryFn: async () => {
      const { count } = await supabase.from("alerts")
        .select("*", { count: "exact", head: true })
        .eq("resolved", false);
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

  const alertBadge: Record<string, number> = {};
  if (alertCount > 0) alertBadge["/alerts"] = alertCount;

  const fleetNav: NavItem[] = [
    { to: "/",        label: "Overview",    icon: LayoutDashboard },
    { to: "/devices", label: "All Devices", icon: Laptop          },
    { to: "/alerts",  label: "Alerts",      icon: BellRing        },
  ];

  const macNav: NavItem[] = [
    { to: "/mac/devices", label: "Mac Devices",      icon: Apple    },
    { to: "/mac/av",      label: "AV Scanner",       icon: ScanLine },
    { to: "/mac/edr",     label: "EDR Detections",   icon: BellRing },
    { to: "/mac/network", label: "Network Activity", icon: Network  },
  ];

  const winNav: NavItem[] = [
    { to: "/windows/devices",   label: "Win Devices",    icon: Monitor  },
    { to: "/windows/av",        label: "AV Scanner",     icon: ScanLine },
    { to: "/windows/edr",       label: "EDR Detections", icon: BellRing },
    { to: "/windows/isolation", label: "Host Isolation", icon: WifiOff  },
  ];

  const mgmtNav: NavItem[] = [
    { to: "/patches",         label: "Patches",         icon: Package    },
    { to: "/compliance",      label: "Compliance",      icon: ShieldCheck},
    { to: "/vulnerabilities", label: "Vulnerabilities", icon: Bug        },
    { to: "/reports",         label: "Reports",         icon: FileText   },
  ];

  const systemNav: NavItem[] = [
    { to: "/settings", label: "Settings", icon: Settings },
    { to: "/about",    label: "About",    icon: Info     },
  ];

  return (
    <aside className="fixed left-0 top-0 h-full w-56 flex flex-col z-20"
      style={{
        background: "var(--c-sidebar-bg)",
        borderRight: "1px solid var(--c-border)",
        transition: "background 0.2s",
      }}>

      {/* Logo */}
      <div className="px-4 pt-6 pb-5" style={{ borderBottom: "1px solid var(--c-border)" }}>
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: "linear-gradient(135deg, #1B5E37, #2E7D52)" }}>
            <Shield className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-bold leading-none tracking-tight" style={{ color: "var(--c-strong)" }}>SparrowShield</p>
            <p className="text-[10px] mt-1" style={{ color: "var(--c-muted)" }}>Security Platform</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-2 py-4 space-y-5 overflow-y-auto">

        <div>
          <SectionLabel label="Menu" />
          <NavGroup items={fleetNav} badge={alertBadge} isLight={isLight} />
        </div>

        <div>
          <div className="flex items-center gap-2 px-4 mb-1">
            <Apple className="w-3 h-3" style={{ color: "#a78bfa" }} />
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--c-faint)" }}>macOS</p>
            {macCount > 0 && (
              <span className="ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded"
                style={{ background: "rgba(167,139,250,0.15)", color: "#a78bfa" }}>
                {macCount}
              </span>
            )}
          </div>
          <NavGroup items={macNav} isLight={isLight} />
        </div>

        <div>
          <div className="flex items-center gap-2 px-4 mb-1">
            <Monitor className="w-3 h-3" style={{ color: "#60a5fa" }} />
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "var(--c-faint)" }}>Windows</p>
            {winCount > 0 && (
              <span className="ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded"
                style={{ background: "rgba(96,165,250,0.15)", color: "#60a5fa" }}>
                {winCount}
              </span>
            )}
          </div>
          <NavGroup items={winNav} isLight={isLight} />
        </div>

        <div>
          <SectionLabel label="Management" />
          <NavGroup items={mgmtNav} isLight={isLight} />
        </div>

        <div>
          <SectionLabel label="General" />
          <NavGroup items={systemNav} isLight={isLight} />
        </div>

        {/* Download agents collapsible */}
        <div>
          <SectionLabel label="Agents" />
          <button
            onClick={() => setExpanded(v => !v)}
            className="w-full flex items-center gap-2.5 px-4 py-2 rounded-lg text-[13px] font-medium transition-all"
            style={{ color: "var(--c-muted)", borderLeft: "3px solid transparent" }}
          >
            <Download className="w-4 h-4" />
            <span className="flex-1 text-left">Download Agent</span>
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>

          {expanded && (
            <div className="mt-1 ml-4 pl-3 space-y-0.5" style={{ borderLeft: "1px solid var(--c-border)" }}>
              {[
                { label: "macOS Agent (.py)", icon: Apple,   file: "/agents/sparrowshield_agent.py", dl: "sparrowshield_agent.py" },
                { label: "Windows EXE",       icon: Monitor, file: "/agents/SparrowShieldAgent.exe", dl: "SparrowShieldAgent.exe" },
                { label: "Windows (.py)",     icon: Monitor, file: "/agents/agent_windows.py",       dl: "agent_windows.py" },
              ].map(item => (
                <button
                  key={item.label}
                  onClick={() => downloadFile(item.file, item.dl)}
                  className="w-full flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-xs transition-all text-left"
                  style={{ color: "var(--c-muted)" }}
                  onMouseEnter={e => { e.currentTarget.style.background = "var(--c-divider)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                >
                  <item.icon className="w-3.5 h-3.5 flex-shrink-0" />
                  <span style={{ fontSize: 11 }}>{item.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </nav>

      {/* Footer */}
      <div className="mx-3 mb-3 rounded-xl p-4 space-y-3"
        style={{ background: "linear-gradient(135deg, #1B5E37, #154D2D)", flexShrink: 0 }}>
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-white opacity-80" />
          <span className="text-xs font-semibold text-white">Quick Deploy</span>
        </div>
        <p className="text-[10px] text-white opacity-60 leading-relaxed">
          Install agents on your devices to start monitoring
        </p>
        <button
          onClick={() => setExpanded(v => !v)}
          className="w-full py-1.5 rounded-lg text-[11px] font-semibold text-center transition-all"
          style={{ background: "rgba(255,255,255,0.15)", color: "#fff" }}
          onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.25)")}
          onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.15)")}
        >
          Get Agent
        </button>
        {/* Theme toggle in footer */}
        <div className="flex items-center justify-between pt-1" style={{ borderTop: "1px solid rgba(255,255,255,0.1)" }}>
          <div className="flex items-center gap-1.5">
            {theme === "dark" ? <Moon className="w-3 h-3 text-white opacity-60" /> : <Sun className="w-3 h-3 text-white opacity-60" />}
            <span className="text-[10px] text-white opacity-60">{theme === "dark" ? "Dark" : "Light"}</span>
          </div>
          <button
            onClick={toggle}
            className="relative flex-shrink-0 rounded-full transition-all"
            style={{
              width: 32, height: 18,
              background: "rgba(255,255,255,0.2)",
              border: "1px solid rgba(255,255,255,0.3)",
            }}
            aria-label="Toggle theme"
          >
            <span
              className="absolute top-0.5 rounded-full transition-all duration-200"
              style={{
                width: 14, height: 14,
                background: "#ffffff",
                left: theme === "dark" ? 1 : 15,
              }}
            />
          </button>
        </div>
      </div>
    </aside>
  );
}
