import { useState, useRef, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Search, Bell, LogOut, ChevronDown, Settings, Apple, Monitor, Menu } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/AuthContext";

type DeviceHit = { id: string; hostname: string; serial_number: string | null; os_type: string; status: string | null; assigned_user: string | null };

export default function TopBar({ title }: { title: string }) {
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { user, signOut } = useAuth();

  const { data: openCount = 0 } = useQuery<number>({
    queryKey: ["open-alert-count"],
    queryFn: async () => (await supabase.from("alerts").select("*", { count: "exact", head: true }).eq("resolved", false)).count ?? 0,
    refetchInterval: 30_000,
  });

  const { data: devices = [] } = useQuery<DeviceHit[]>({
    queryKey: ["topbar-devices"],
    queryFn: async () => {
      const { data } = await supabase.from("devices").select("id, hostname, serial_number, os_type, status, assigned_user").limit(1000);
      return (data ?? []) as DeviceHit[];
    },
    staleTime: 60_000,
  });

  const hits = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return devices.filter(d =>
      [d.hostname, d.serial_number, d.assigned_user].some(v => (v ?? "").toLowerCase().includes(q))).slice(0, 8);
  }, [devices, query]);

  const email = user?.email ?? "admin@local";
  const initials = email.slice(0, 2).toUpperCase();

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setUserMenuOpen(false);
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); inputRef.current?.focus(); setSearchOpen(true); }
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => { document.removeEventListener("mousedown", handleClick); document.removeEventListener("keydown", handleKey); };
  }, []);

  function openDevice(id: string) {
    setQuery(""); setSearchOpen(false);
    navigate(`/device/${id}`);
  }

  async function handleSignOut() {
    setUserMenuOpen(false);
    await signOut();
    navigate("/login");
  }

  return (
    <header className="h-14 flex items-center px-3 sm:px-6 gap-2 sm:gap-4 sticky top-0 z-10 shrink-0 border-b backdrop-blur"
      style={{ background: "color-mix(in srgb, var(--c-card) 92%, transparent)", borderColor: "var(--c-border)" }}>
      <button onClick={() => window.dispatchEvent(new Event("ss-toggle-nav"))} aria-label="Open navigation"
        className="lg:hidden w-9 h-9 rounded-md flex items-center justify-center border hover:bg-[var(--c-card2)]"
        style={{ borderColor: "var(--c-border)", color: "var(--c-text)" }}>
        <Menu className="w-4 h-4" />
      </button>
      <span className="hidden md:block text-[13px] font-semibold truncate max-w-[220px]" style={{ color: "var(--c-strong)" }}>{title}</span>

      {/* Global device search */}
      <div ref={searchRef} className="relative flex-1 max-w-lg mx-auto">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: "var(--c-muted)" }} />
        <input
          ref={inputRef}
          value={query}
          onChange={e => { setQuery(e.target.value); setSearchOpen(true); }}
          onFocus={() => setSearchOpen(true)}
          onKeyDown={e => {
            if (e.key === "Enter" && hits[0]) openDevice(hits[0].id);
            if (e.key === "Escape") { setSearchOpen(false); inputRef.current?.blur(); }
          }}
          placeholder="Search devices…"
          className="w-full h-9 rounded-md pl-9 pr-3 sm:pr-14 text-[13px] border outline-none focus:border-[var(--c-accent)]"
          style={{ background: "var(--c-card2)", borderColor: "var(--c-border2)", color: "var(--c-strong)" }}
        />
        <kbd className="hidden sm:block absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-mono rounded px-1.5 py-0.5 border pointer-events-none"
          style={{ borderColor: "var(--c-border2)", color: "var(--c-muted)" }}>⌘K</kbd>
        {searchOpen && query.trim() && (
          <div className="absolute left-0 right-0 top-full mt-1.5 rounded-lg border shadow-2xl overflow-hidden z-40"
            style={{ background: "var(--c-card)", borderColor: "var(--c-border2)" }}>
            {hits.length === 0 ? (
              <p className="px-3 py-3 text-[12.5px]" style={{ color: "var(--c-muted)" }}>No devices match “{query}”.</p>
            ) : hits.map(d => {
              const Icon = d.os_type === "windows" ? Monitor : Apple;
              return (
                <button key={d.id} onClick={() => openDevice(d.id)}
                  className="w-full flex items-center gap-3 px-3 h-11 text-left hover:bg-[var(--c-row-hover)]">
                  <Icon className="w-4 h-4 shrink-0" style={{ color: "var(--c-muted)" }} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium truncate" style={{ color: "var(--c-strong)" }}>{d.hostname}</p>
                    <p className="text-[11px] truncate" style={{ color: "var(--c-muted)" }}>{d.serial_number ?? "—"}{d.assigned_user ? ` · ${d.assigned_user}` : ""}</p>
                  </div>
                  <span className="w-2 h-2 rounded-full" style={{ background: d.status === "online" ? "var(--ok)" : "var(--c-faint)" }} />
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button onClick={() => navigate("/alerts")} aria-label="Open alerts"
          className="relative w-9 h-9 rounded-md flex items-center justify-center border hover:bg-[var(--c-card2)]"
          style={{ borderColor: "var(--c-border)", color: "var(--c-text)" }}>
          <Bell className="w-4 h-4" />
          {openCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold text-white flex items-center justify-center"
              style={{ background: "var(--sev-critical)" }}>
              {openCount > 99 ? "99+" : openCount}
            </span>
          )}
        </button>

        <div className="relative pl-2 ml-1 border-l" ref={menuRef} style={{ borderColor: "var(--c-border)" }}>
          <button onClick={() => setUserMenuOpen(v => !v)} className="flex items-center gap-2 rounded-md px-1.5 h-9 hover:bg-[var(--c-card2)]">
            <div className="w-7 h-7 rounded-md flex items-center justify-center text-white text-[11px] font-bold"
              style={{ background: "linear-gradient(135deg,#3b6cf6,#1d4ed8)" }}>{initials}</div>
            <div className="hidden md:block text-left leading-tight">
              <p className="text-[12px] font-semibold truncate max-w-[140px]" style={{ color: "var(--c-strong)" }}>{email.split("@")[0]}</p>
              <p className="text-[10.5px]" style={{ color: "var(--c-muted)" }}>Security Admin</p>
            </div>
            <ChevronDown className="w-3.5 h-3.5 hidden md:block" style={{ color: "var(--c-muted)" }} />
          </button>
          {userMenuOpen && (
            <div className="absolute right-0 top-full mt-2 w-56 rounded-lg border shadow-2xl z-50 overflow-hidden"
              style={{ background: "var(--c-card)", borderColor: "var(--c-border2)" }}>
              <div className="px-3.5 py-3 border-b" style={{ borderColor: "var(--c-border)" }}>
                <p className="text-[12.5px] font-semibold truncate" style={{ color: "var(--c-strong)" }}>{email}</p>
                <p className="text-[11px]" style={{ color: "var(--c-muted)" }}>Security Admin</p>
              </div>
              <button onClick={() => { setUserMenuOpen(false); navigate("/settings"); }}
                className="w-full flex items-center gap-2.5 px-3.5 h-9 text-[13px] hover:bg-[var(--c-card2)]" style={{ color: "var(--c-text)" }}>
                <Settings className="w-3.5 h-3.5" /> Settings
              </button>
              <button onClick={handleSignOut}
                className="w-full flex items-center gap-2.5 px-3.5 h-9 text-[13px] hover:bg-[var(--c-card2)]" style={{ color: "var(--sev-critical)" }}>
                <LogOut className="w-3.5 h-3.5" /> Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
