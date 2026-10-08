import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Bell, User } from "lucide-react";
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
    <header className="h-16 flex items-center px-6 gap-4 sticky top-0 z-10 flex-shrink-0"
      style={{
        background: "var(--c-card)",
        borderBottom: "1px solid var(--c-border)",
      }}>

      <h1 className="text-base font-bold flex-shrink-0 tracking-tight" style={{ color: "var(--c-strong)" }}>
        {title}
      </h1>

      {/* Search */}
      <form onSubmit={handleSearch} className="flex-1 max-w-md mx-4">
        <div className="relative flex items-center">
          <Search className="absolute left-3.5 w-4 h-4 pointer-events-none" style={{ color: "var(--c-muted)" }} />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search devices…"
            className="w-full rounded-2xl pl-10 pr-16 py-2.5 text-sm focus:outline-none transition-all"
            style={{
              background: "var(--c-bg)",
              border: "1px solid var(--c-border2)",
              color: "var(--c-text)",
            }}
            onFocus={e => (e.currentTarget.style.borderColor = "var(--c-primary)")}
            onBlur={e => (e.currentTarget.style.borderColor = "var(--c-border2)")}
          />
          <kbd className="absolute right-3 text-[10px] font-mono rounded px-1.5 py-0.5 pointer-events-none"
            style={{ background: "var(--c-border)", color: "var(--c-muted)" }}>
            ⌘ F
          </kbd>
        </div>
      </form>

      <div className="ml-auto flex items-center gap-3">
        {/* Bell */}
        <button
          onClick={() => navigate("/alerts")}
          className="relative w-9 h-9 rounded-xl flex items-center justify-center transition-colors"
          style={{ background: "var(--c-bg)", border: "1px solid var(--c-border)", color: "var(--c-muted)" }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--c-border2)")}
          onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--c-border)")}
        >
          <Bell className="w-4 h-4" />
          {openCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 rounded-full text-[9px] font-bold text-white flex items-center justify-center">
              {openCount > 9 ? "9+" : openCount}
            </span>
          )}
        </button>

        {/* User avatar */}
        <div className="flex items-center gap-2.5 pl-3" style={{ borderLeft: "1px solid var(--c-border)" }}>
          <div className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, #1B5E37, #2E7D52)" }}>
            <User className="w-4 h-4 text-white" />
          </div>
          <div className="hidden sm:block">
            <p className="text-xs font-semibold leading-none" style={{ color: "var(--c-strong)" }}>SparrowShield</p>
            <p className="text-[10px] mt-0.5" style={{ color: "var(--c-muted)" }}>Security Admin</p>
          </div>
        </div>
      </div>
    </header>
  );
}
