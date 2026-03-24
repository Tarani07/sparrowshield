import { NavLink } from "react-router-dom";
import { LayoutDashboard, BellRing, Activity } from "lucide-react";
import { cn } from "../../lib/utils";

const nav = [
  { to: "/", label: "Fleet Overview", icon: LayoutDashboard },
  { to: "/alerts", label: "Alerts", icon: BellRing },
];

export default function Sidebar() {
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
            {label}
          </NavLink>
        ))}
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
