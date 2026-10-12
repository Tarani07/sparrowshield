import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Bell, LogOut, ChevronDown } from "lucide-react";
import { useAlerts } from "../../hooks/useAlerts";
import { useAuth } from "../../lib/AuthContext";

export default function TopBar({ title }: { title: string }) {
  const [query, setQuery] = useState("");
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { data: alerts } = useAlerts(undefined, false);
  const openCount = alerts?.length ?? 0;
  const { user, signOut } = useAuth();

  const email = user?.email ?? "Admin";
  const initials = email.slice(0, 2).toUpperCase();

  // Close menu on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim()) navigate(`/?search=${encodeURIComponent(query.trim())}`);
  }

  async function handleSignOut() {
    setUserMenuOpen(false);
    await signOut();
    navigate("/login");
  }

  return (
    <header className="h-16 flex items-center px-6 gap-4 sticky top-0 z-10 flex-shrink-0"
      style={{ background: "var(--c-card)", borderBottom: "1px solid var(--c-border)" }}>

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
            style={{ background: "var(--c-bg)", border: "1px solid var(--c-border2)", color: "var(--c-text)" }}
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
        {/* Alert bell */}
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

        {/* User menu */}
        <div className="relative" ref={menuRef} style={{ borderLeft: "1px solid var(--c-border)", paddingLeft: 12 }}>
          <button
            onClick={() => setUserMenuOpen(v => !v)}
            className="flex items-center gap-2 rounded-xl px-2 py-1.5 transition-colors"
            style={{ color: "var(--c-strong)" }}
            onMouseEnter={e => (e.currentTarget.style.background = "var(--c-bg)")}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
          >
            {/* Avatar */}
            <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
              style={{ background: "linear-gradient(135deg, #1B5E37, #2E7D52)" }}>
              {initials}
            </div>
            <div className="hidden sm:block text-left">
              <p className="text-xs font-semibold leading-none truncate max-w-[120px]" style={{ color: "var(--c-strong)" }}>
                {email.split("@")[0]}
              </p>
              <p className="text-[10px] mt-0.5 truncate max-w-[120px]" style={{ color: "var(--c-muted)" }}>
                {email.includes("@") ? email.split("@")[1] : "Security Admin"}
              </p>
            </div>
            <ChevronDown className="w-3 h-3 hidden sm:block" style={{ color: "var(--c-muted)" }} />
          </button>

          {/* Dropdown */}
          {userMenuOpen && (
            <div className="absolute right-0 top-full mt-2 w-52 rounded-xl shadow-xl z-50 overflow-hidden"
              style={{ background: "var(--c-card)", border: "1px solid var(--c-border2)" }}>
              <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--c-border)" }}>
                <p className="text-xs font-semibold" style={{ color: "var(--c-strong)" }}>{email}</p>
                <p className="text-[10px] mt-0.5" style={{ color: "var(--c-muted)" }}>Security Admin</p>
              </div>
              <div className="py-1">
                <button
                  onClick={() => { setUserMenuOpen(false); navigate("/settings"); }}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left text-sm transition-colors"
                  style={{ color: "var(--c-text)" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "var(--c-bg)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  Settings
                </button>
                <button
                  onClick={handleSignOut}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left text-sm transition-colors"
                  style={{ color: "#ef4444" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "var(--c-bg)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
