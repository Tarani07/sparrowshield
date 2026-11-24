import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard, BellRing, ChevronDown, Apple, Monitor, Laptop, Settings, FileText, ShieldCheck,
  Info, Package, Shield, Download, ScanLine, Network, WifiOff, Bug, Sun, Moon, GitBranch, Radio,
  Target, BarChart2, Crosshair, Globe, Users, AppWindow, Megaphone, Copy, Check, Rocket, UserCog, ScrollText, Cloud, Radar, Cpu,
} from "lucide-react";
import { useEffect, useRef, useState, type ElementType } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { useTheme } from "../../lib/ThemeContext";
import { useAuth } from "../../lib/AuthContext";

type NavItem = { to: string; label: string; icon: ElementType; count?: number; tone?: string };
type Section = { id: string; label?: string; items: NavItem[]; collapsible?: boolean; defaultOpen?: boolean };

const MAC_INSTALL = "curl -fsSL sparrowshield.vercel.app/mac | sudo bash";

function useCount(key: string, build: () => PromiseLike<{ count: number | null }>) {
  return useQuery<number>({
    queryKey: [key],
    queryFn: async () => (await build()).count ?? 0,
    refetchInterval: 30_000,
  }).data ?? 0;
}

function NavRow({ item }: { item: NavItem }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.to === "/"}
      className="group relative flex items-center gap-2.5 h-8 pl-3 pr-2 rounded-md text-[13px] transition-colors"
      style={({ isActive }) => ({
        background: isActive ? "var(--c-sb-active)" : undefined,
        color: isActive ? "var(--c-sb-strong)" : "var(--c-sb-text)",
        fontWeight: isActive ? 600 : 500,
      })}
    >
      {({ isActive }) => (
        <>
          {isActive && <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r" style={{ background: "var(--c-accent)" }} />}
          <Icon className="w-4 h-4 shrink-0" style={{ color: isActive ? "#8fb0ff" : undefined }} />
          <span className="flex-1 truncate group-hover:text-[var(--c-sb-strong)]">{item.label}</span>
          {item.count ? (
            <span className="min-w-[20px] h-[18px] px-1 rounded text-[10px] font-bold flex items-center justify-center tabular-nums"
              style={{ background: item.tone ?? "#1c2740", color: item.tone ? "#fff" : "var(--c-sb-text)" }}>
              {item.count > 99 ? "99+" : item.count}
            </span>
          ) : null}
        </>
      )}
    </NavLink>
  );
}

function NavSection({ section }: { section: Section }) {
  const storageKey = `ss-nav-${section.id}`;
  const [open, setOpen] = useState(() => {
    try {
      const v = localStorage.getItem(storageKey);
      return v == null ? section.defaultOpen !== false : v === "1";
    } catch { return section.defaultOpen !== false; }
  });
  useEffect(() => { try { localStorage.setItem(storageKey, open ? "1" : "0"); } catch { /* ignore */ } }, [open, storageKey]);

  return (
    <div>
      {section.label && (
        <button
          onClick={() => section.collapsible !== false && setOpen(o => !o)}
          className="w-full flex items-center justify-between px-3 pt-4 pb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.09em]"
          style={{ color: "#62718f" }}
        >
          {section.label}
          {section.collapsible !== false && (
            <ChevronDown className="w-3 h-3 transition-transform" style={{ transform: open ? undefined : "rotate(-90deg)" }} />
          )}
        </button>
      )}
      {open && <div className="space-y-px">{section.items.map(i => <NavRow key={i.to} item={i} />)}</div>}
    </div>
  );
}

function DeployMenu() {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  function download(url: string, filename: string) {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setOpen(false);
  }

  async function copy() {
    try { await navigator.clipboard.writeText(MAC_INSTALL); } catch { /* clipboard blocked */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full h-8 rounded-md text-[12.5px] font-semibold flex items-center justify-center gap-2 transition-[filter] hover:brightness-110"
        style={{ background: "var(--c-accent)", color: "#fff" }}
      >
        <Rocket className="w-3.5 h-3.5" /> Deploy agent
      </button>
      {open && (
        <div className="absolute bottom-full left-0 right-0 mb-2 rounded-lg border p-3 shadow-2xl z-30"
          style={{ background: "#0f1626", borderColor: "#283453" }}>
          <p className="text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "#8b9ab8" }}>macOS — one line</p>
          <div className="flex items-center gap-1.5 rounded-md border px-2 py-1.5" style={{ background: "#0a0f1a", borderColor: "#1c2740" }}>
            <code className="flex-1 text-[10.5px] font-mono truncate" style={{ color: "#dbe6ff" }}>{MAC_INSTALL}</code>
            <button onClick={copy} className="p-1 rounded hover:bg-white/10" style={{ color: copied ? "#34d399" : "#8b9ab8" }} aria-label="Copy install command">
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          </div>
          <p className="text-[10.5px] mt-1.5 leading-snug" style={{ color: "#8b9ab8" }}>Run in Terminal on the Mac. Agents update themselves hourly.</p>
          <div className="mt-3 space-y-px">
            {[
              { label: "macOS installer (.sh)", icon: Apple, file: "/agents/SparrowShield-Mac-Install.sh", dl: "SparrowShield-Mac-Install.sh" },
              { label: "Windows installer (.bat)", icon: Monitor, file: "/agents/SparrowShieldInstaller.bat", dl: "SparrowShieldInstaller.bat" },
            ].map(i => (
              <button key={i.label} onClick={() => download(i.file, i.dl)}
                className="w-full flex items-center gap-2 h-8 px-2 rounded-md text-[12px] hover:bg-white/5" style={{ color: "#c3cde0" }}>
                <i.icon className="w-3.5 h-3.5 opacity-80" />
                <span className="flex-1 text-left">{i.label}</span>
                <Download className="w-3.5 h-3.5 opacity-60" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Sidebar() {
  const { theme, toggle } = useTheme();
  const { isAdmin } = useAuth();
  const location = useLocation();
  // Below the lg breakpoint the sidebar is an overlay opened from the top bar's menu button.
  const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => {
    const t = () => setMobileOpen(o => !o);
    window.addEventListener("ss-toggle-nav", t);
    return () => window.removeEventListener("ss-toggle-nav", t);
  }, []);
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  const macCount = useCount("mac-device-count", () =>
    supabase.from("devices").select("*", { count: "exact", head: true }).in("os_type", ["mac", "macos", "darwin"]));
  const winCount = useCount("win-device-count", () =>
    supabase.from("devices").select("*", { count: "exact", head: true }).eq("os_type", "windows"));
  const alertCount = useCount("open-alert-count", () =>
    supabase.from("alerts").select("*", { count: "exact", head: true }).eq("resolved", false));

  const sensorIssues = useCount("sensor-issue-count", () =>
    supabase.from("device_sensors").select("*", { count: "exact", head: true }).in("status", ["error", "warning"]));

  const sections: Section[] = [
    { id: "home", items: [
      { to: "/", label: "Overview", icon: LayoutDashboard },
      { to: "/alerts", label: "Alerts", icon: BellRing, count: alertCount, tone: alertCount ? "#e11d48" : undefined },
      { to: "/live-alerts", label: "Live Activity", icon: Radio },
    ]},
    { id: "endpoints", label: "Endpoints", items: [
      { to: "/devices", label: "All Devices", icon: Laptop, count: macCount + winCount },
      { to: "/mac/devices", label: "macOS", icon: Apple, count: macCount },
      { to: "/windows/devices", label: "Windows", icon: Monitor, count: winCount },
      { to: "/groups", label: "Device Groups", icon: Users },
      { to: "/sensors", label: "Sensor Health", icon: Cpu, count: sensorIssues || undefined, tone: sensorIssues ? "#e11d48" : undefined },
      { to: "/jumpcloud", label: "JumpCloud", icon: Cloud },
    ]},
    { id: "detect", label: "Detection & Response", items: [
      { to: "/mac/edr", label: "Detections", icon: Crosshair },
      { to: "/analytics", label: "Analytics", icon: Radar },
      { to: "/mac/av", label: "Malware Scanner", icon: ScanLine },
      { to: "/threat-hunt", label: "Threat Hunting", icon: Target },
      { to: "/process-tree", label: "Process Tree", icon: GitBranch },
      { to: "/mac/network", label: "Network Activity", icon: Network },
      { to: "/mitre", label: "MITRE ATT&CK", icon: Shield },
    ]},
    { id: "policy", label: "Protection Policies", items: [
      { to: "/app-filter", label: "Application Control", icon: AppWindow },
      { to: "/web-filter", label: "Web Filtering", icon: Globe },
      { to: "/policy", label: "Process Policies", icon: ShieldCheck },
    ]},
    { id: "vuln", label: "Vulnerability & Compliance", items: [
      { to: "/vulnerabilities", label: "Vulnerabilities", icon: Bug },
      { to: "/patches", label: "Patch Management", icon: Package },
      { to: "/compliance", label: "Compliance", icon: ShieldCheck },
    ]},
    { id: "ops", label: "Operations", items: [
      { to: "/notices", label: "IT Notices", icon: Megaphone },
      { to: "/reports", label: "Reports", icon: FileText },
      { to: "/executive", label: "Executive Summary", icon: BarChart2 },
    ]},
    { id: "admin", label: "Administration", items: [
      { to: "/users", label: "Users & Roles", icon: UserCog },
      ...(isAdmin ? [{ to: "/audit", label: "Audit Log", icon: ScrollText }] : []),
      { to: "/settings", label: "Settings", icon: Settings },
    ]},
    { id: "win", label: "Windows Console", defaultOpen: false, items: [
      { to: "/windows/av", label: "Windows Antivirus", icon: ScanLine },
      { to: "/windows/edr", label: "Windows Detections", icon: Crosshair },
      { to: "/windows/isolation", label: "Host Isolation", icon: WifiOff },
    ]},
  ];

  return (
    <>
    {mobileOpen && <div className="fixed inset-0 bg-black/50 z-30 lg:hidden" onClick={() => setMobileOpen(false)} />}
    <aside className={`fixed left-0 top-0 h-full w-60 flex flex-col border-r transition-transform z-40 lg:z-20 lg:translate-x-0 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`}
      style={{ background: "var(--c-sb-bg)", borderColor: "var(--c-sb-border)" }}>
      {/* Brand */}
      <div className="h-14 px-4 flex items-center gap-2.5 border-b shrink-0" style={{ borderColor: "var(--c-sb-border)" }}>
        <div className="w-7 h-7 rounded-md flex items-center justify-center" style={{ background: "linear-gradient(135deg,#10b981,#047857)" }}>
          <Shield className="w-4 h-4 text-white" />
        </div>
        <div className="leading-tight">
          <p className="text-[14px] font-semibold tracking-tight" style={{ color: "var(--c-sb-strong)" }}>SparrowShield</p>
          <p className="text-[10.5px] font-medium" style={{ color: "#62718f" }}>Endpoint Security Console</p>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-4">
        {sections.map(s => <NavSection key={s.id} section={s} />)}
      </nav>

      {/* Footer */}
      <div className="shrink-0 border-t px-2 py-2 space-y-px" style={{ borderColor: "var(--c-sb-border)" }}>
        <NavRow item={{ to: "/about", label: "About & Docs", icon: Info }} />
        <button onClick={toggle}
          className="w-full flex items-center gap-2.5 h-8 pl-3 pr-2 rounded-md text-[13px] font-medium hover:text-[var(--c-sb-strong)]"
          style={{ color: "var(--c-sb-text)" }}>
          {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          {theme === "dark" ? "Light theme" : "Dark theme"}
        </button>
        <div className="pt-2 px-1"><DeployMenu /></div>
      </div>
    </aside>
    </>
  );
}
