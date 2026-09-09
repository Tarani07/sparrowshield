import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Bell } from "lucide-react";
import { useAlerts } from "../../hooks/useAlerts";

export default function TopBar({ title }: { title: string }) {
  const [query, setQuery] = useState("");
  const navigate = useNavigate();
  const { data: alerts } = useAlerts(undefined, false);
  const openCount = alerts?.length ?? 0;

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim()) navigate(`/?search=${encodeURIComponent(query.trim())}`);
  }

  return (
    <header className="h-14 flex items-center px-6 gap-4 sticky top-0 z-10 flex-shrink-0"
      style={{
        background: "rgba(13,15,22,0.85)",
        backdropFilter: "blur(12px)",
        borderBottom: "1px solid rgba(255,255,255,0.05)",
      }}>

      <h1 className="text-sm font-semibold text-white flex-shrink-0 tracking-tight">{title}</h1>

      <form onSubmit={handleSearch} className="flex-1 max-w-xs ml-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: "#3a4060" }} />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search devices…"
            className="w-full rounded-lg pl-9 pr-3 py-2 text-xs text-slate-300 placeholder-slate-600 focus:outline-none transition-colors"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
            onFocus={e => (e.currentTarget.style.borderColor = "rgba(99,102,241,0.5)")}
            onBlur={e => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.06)")}
          />
        </div>
      </form>

      <div className="ml-auto flex items-center gap-2">
        <button
          onClick={() => navigate("/alerts")}
          className="relative w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
          style={{ color: "#4b5270" }}
          onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; e.currentTarget.style.color = "#94a3b8"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#4b5270"; }}
        >
          <Bell className="w-4 h-4" />
          {openCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 rounded-full text-[9px] font-bold text-white flex items-center justify-center">
              {openCount > 9 ? "9+" : openCount}
            </span>
          )}
        </button>
      </div>
    </header>
  );
}
