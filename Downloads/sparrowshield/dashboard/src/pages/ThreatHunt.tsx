import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Crosshair, Shield, Pause, Play, Search,
  Monitor, Apple, Terminal as TerminalIcon,
  ExternalLink, Activity, ChevronRight,
} from "lucide-react";
import { supabase } from "../lib/supabase";

interface EDREvent {
  id: string;
  device_id: string;
  event_type: string;
  action: string;
  pid: number;
  ppid: number;
  process_name: string;
  process_path: string;
  signing_id: string;
  file_path: string;
  threat_score: number;
  mitre_id: string;
  mitre_name: string;
  raw: Record<string, unknown>;
  timestamp: string;
  created_at: string;
  devices?: { hostname: string; os_type: string };
}

type EventTypeFilter = "ALL" | "EXEC" | "CREATE" | "WRITE" | "RENAME";
type ActionFilter    = "ALL" | "BLOCKED" | "NOTIFY";

function relativeTime(ts: string) {
  const diff = (Date.now() - new Date(ts).getTime()) / 1000;
  if (diff < 60)  return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function threatColor(score: number) {
  if (score > 0.7) return "#ef4444";
  if (score > 0.4) return "#f59e0b";
  return "#22c55e";
}

function ThreatDot({ score }: { score: number }) {
  const c = threatColor(score);
  return (
    <span style={{
      display: "inline-block", width: 8, height: 8, borderRadius: "50%",
      background: c, flexShrink: 0, boxShadow: score > 0.7 ? `0 0 6px ${c}` : "none",
    }} />
  );
}

function ScoreBar({ score }: { score: number }) {
  const filled = Math.round((score ?? 0) * 10);
  const c = threatColor(score ?? 0);
  return (
    <span style={{ display: "inline-flex", gap: 1, alignItems: "center" }}>
      {Array.from({ length: 10 }, (_, i) => (
        <span key={i} style={{
          width: 4, height: 10, borderRadius: 2,
          background: i < filled ? c : "var(--c-border2)",
          transition: "background 0.15s",
        }} />
      ))}
      <span style={{ marginLeft: 4, fontSize: 10, color: "var(--c-muted)", fontFamily: "monospace" }}>
        {((score ?? 0) * 100).toFixed(0)}
      </span>
    </span>
  );
}

function ActionBadge({ action }: { action: string }) {
  const styles: Record<string, { bg: string; color: string; label: string }> = {
    blocked: { bg: "rgba(239,68,68,0.15)", color: "#ef4444",  label: "BLOCKED" },
    allowed: { bg: "rgba(34,197,94,0.12)", color: "#22c55e",  label: "ALLOWED" },
    notify:  { bg: "rgba(100,116,139,0.15)", color: "#94a3b8", label: "NOTIFY"  },
  };
  const s = styles[action] ?? styles.notify;
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, letterSpacing: "0.08em",
      padding: "2px 6px", borderRadius: 4,
      background: s.bg, color: s.color,
    }}>{s.label}</span>
  );
}

function EventTypeBadge({ type }: { type: string }) {
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, letterSpacing: "0.06em",
      padding: "2px 5px", borderRadius: 4,
      background: "var(--c-border2)", color: "var(--c-muted)",
    }}>{type}</span>
  );
}

function OsIcon({ os }: { os?: string }) {
  if (!os) return null;
  const lower = os.toLowerCase();
  if (lower === "mac" || lower === "macos" || lower === "darwin")
    return <Apple style={{ width: 10, height: 10, color: "#a78bfa", flexShrink: 0 }} />;
  if (lower === "windows")
    return <Monitor style={{ width: 10, height: 10, color: "#60a5fa", flexShrink: 0 }} />;
  return <TerminalIcon style={{ width: 10, height: 10, color: "#34d399", flexShrink: 0 }} />;
}

// ── Process Tree ───────────────────────────────────────────
function ProcessTree({ event, allEvents }: { event: EDREvent; allEvents: EDREvent[] }) {
  // Build up to 3 levels: grandparent → parent → current
  const findByPid = (pid: number) => allEvents.find(e => e.pid === pid && e.device_id === event.device_id);

  const parent = event.ppid ? findByPid(event.ppid) : null;
  const grandparent = parent?.ppid ? findByPid(parent.ppid) : null;

  const nodeStyle: React.CSSProperties = {
    padding: "5px 10px",
    borderRadius: 6,
    fontSize: 12,
    fontFamily: "monospace",
    color: "var(--c-fg-strong, var(--c-strong))",
    background: "var(--c-card2, var(--c-border2))",
    display: "inline-block",
    maxWidth: "100%",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  };

  const connStyle: React.CSSProperties = {
    marginLeft: 14,
    paddingLeft: 14,
    borderLeft: "1px solid var(--c-border2)",
    paddingTop: 4,
    paddingBottom: 2,
    position: "relative",
  };

  const elbowStyle: React.CSSProperties = {
    position: "absolute",
    left: 0,
    top: 0,
    width: 10,
    height: 12,
    borderBottom: "1px solid var(--c-border2)",
    borderLeft: "none",
  };

  return (
    <div style={{ fontSize: 12 }}>
      {grandparent ? (
        <div>
          <span style={{ ...nodeStyle, opacity: 0.7 }}>
            {grandparent.process_name || `PID ${grandparent.pid}`}
          </span>
          <div style={connStyle}>
            <span style={elbowStyle} />
            <span style={{ ...nodeStyle, opacity: 0.85 }}>
              {parent!.process_name || `PID ${parent!.pid}`}
            </span>
            <div style={connStyle}>
              <span style={elbowStyle} />
              <span style={{ ...nodeStyle, background: "rgba(99,102,241,0.15)", color: "#818cf8" }}>
                {event.process_name || `PID ${event.pid}`}
              </span>
            </div>
          </div>
        </div>
      ) : parent ? (
        <div>
          <span style={{ ...nodeStyle, opacity: 0.7 }}>
            {parent.process_name || `PPID ${event.ppid}`}
          </span>
          <div style={connStyle}>
            <span style={elbowStyle} />
            <span style={{ ...nodeStyle, background: "rgba(99,102,241,0.15)", color: "#818cf8" }}>
              {event.process_name || `PID ${event.pid}`}
            </span>
          </div>
        </div>
      ) : (
        <div>
          <span style={{ ...nodeStyle, opacity: 0.5, fontSize: 11 }}>
            {event.ppid ? `PPID ${event.ppid} (not in view)` : "root"}
          </span>
          <div style={connStyle}>
            <span style={elbowStyle} />
            <span style={{ ...nodeStyle, background: "rgba(99,102,241,0.15)", color: "#818cf8" }}>
              {event.process_name || `PID ${event.pid}`}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Circular threat gauge ──────────────────────────────────
function ThreatGauge({ score }: { score: number }) {
  const pct = Math.round((score ?? 0) * 100);
  const c   = threatColor(score ?? 0);
  const deg = Math.round(pct * 3.6);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <div style={{
        width: 80, height: 80, borderRadius: "50%",
        background: `conic-gradient(${c} 0deg ${deg}deg, var(--c-border2) ${deg}deg 360deg)`,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: "50%",
          background: "var(--c-card)",
          display: "flex", alignItems: "center", justifyContent: "center",
          flexDirection: "column",
        }}>
          <span style={{ fontSize: 18, fontWeight: 800, color: c, lineHeight: 1 }}>{pct}</span>
          <span style={{ fontSize: 9, color: "var(--c-muted)", letterSpacing: "0.06em" }}>RISK</span>
        </div>
      </div>
    </div>
  );
}

// ── Timeline bar ───────────────────────────────────────────
function TimelineBar({ events }: { events: EDREvent[] }) {
  const now    = Date.now();
  const WINDOW = 60 * 60 * 1000; // 1 hour
  const BUCKET = 5  * 60 * 1000; // 5 min
  const NUM    = 12;

  const buckets: { count: number; maxScore: number }[] = Array.from({ length: NUM }, () => ({ count: 0, maxScore: 0 }));

  for (const e of events) {
    const age = now - new Date(e.timestamp || e.created_at).getTime();
    if (age < 0 || age > WINDOW) continue;
    const idx = Math.min(NUM - 1, Math.floor(age / BUCKET));
    buckets[NUM - 1 - idx].count++;
    buckets[NUM - 1 - idx].maxScore = Math.max(buckets[NUM - 1 - idx].maxScore, e.threat_score ?? 0);
  }

  const maxCount = Math.max(1, ...buckets.map(b => b.count));

  return (
    <div style={{
      background: "var(--c-card)",
      borderTop: "1px solid var(--c-border)",
      padding: "8px 24px 10px",
      display: "flex",
      flexDirection: "column",
      gap: 4,
      flexShrink: 0,
    }}>
      <div style={{ fontSize: 10, color: "var(--c-muted)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>
        Event timeline — last 60 min
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 40 }}>
        {buckets.map((b, i) => {
          const h = b.count === 0 ? 2 : Math.max(4, Math.round((b.count / maxCount) * 36));
          const show15 = i % 3 === 0;
          const minsAgo = (NUM - i) * 5;
          return (
            <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
              <div style={{
                width: 4, height: h, borderRadius: 2,
                background: b.count === 0 ? "var(--c-border2)" : threatColor(b.maxScore),
                opacity: b.count === 0 ? 0.4 : 1,
                transition: "height 0.3s ease",
              }} />
              {show15 && (
                <span style={{ fontSize: 8, color: "var(--c-faint)", whiteSpace: "nowrap" }}>
                  -{minsAgo}m
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────
export default function ThreatHunt() {
  const navigate = useNavigate();
  const [events,       setEvents]       = useState<EDREvent[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [selected,     setSelected]     = useState<EDREvent | null>(null);
  const [isPaused,     setIsPaused]     = useState(false);
  const [pendingQueue, setPendingQueue] = useState<EDREvent[]>([]);
  const [typeFilter,   setTypeFilter]   = useState<EventTypeFilter>("ALL");
  const [actionFilter, setActionFilter] = useState<ActionFilter>("ALL");
  const [minScore,     setMinScore]     = useState(0);
  const [search,       setSearch]       = useState("");
  const [blockSuccess, setBlockSuccess] = useState<Record<string, string>>({});
  const [quickBlock,   setQuickBlock]   = useState<string | null>(null);
  const feedRef = useRef<HTMLDivElement>(null);

  // ── Initial load ─────────────────────────────
  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("edr_events")
        .select("*, devices(hostname, os_type)")
        .order("timestamp", { ascending: false })
        .limit(200);
      if (!error && data) setEvents(data as EDREvent[]);
      setLoading(false);
    })();
  }, []);

  // ── Realtime subscription ─────────────────────
  const isPausedRef = useRef(isPaused);
  isPausedRef.current = isPaused;

  useEffect(() => {
    const channel = supabase
      .channel("edr-live")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "edr_events" }, async (payload) => {
        const ev = payload.new as EDREvent;
        // Enrich with device info
        if (ev.device_id) {
          const { data } = await supabase.from("devices").select("hostname, os_type").eq("id", ev.device_id).single();
          if (data) (ev as any).devices = data;
        }
        if (isPausedRef.current) {
          setPendingQueue(q => [...q, ev]);
        } else {
          setEvents(prev => [ev, ...prev].slice(0, 500));
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // ── Resume from pause ─────────────────────────
  const handleResume = useCallback(() => {
    setIsPaused(false);
    setEvents(prev => [...pendingQueue, ...prev].slice(0, 500));
    setPendingQueue([]);
  }, [pendingQueue]);

  // ── Block rule helper ─────────────────────────
  async function addBlockRule(eventId: string, ruleType: "path" | "signing_id" | "process_name", pattern: string, label: string) {
    if (!pattern) return;
    const { error } = await supabase.from("block_rules").insert({
      name: `Block ${label}`,
      rule_type: ruleType,
      pattern,
      action: "block",
      severity: "high",
      enabled: true,
    });
    if (!error) {
      setBlockSuccess(s => ({ ...s, [eventId + ruleType]: "✓ Rule added" }));
      setTimeout(() => setBlockSuccess(s => { const n = { ...s }; delete n[eventId + ruleType]; return n; }), 2500);
    }
    setQuickBlock(null);
  }

  // ── Filtered events ───────────────────────────
  const filtered = events.filter(e => {
    if (typeFilter !== "ALL" && e.event_type !== typeFilter) return false;
    if (actionFilter === "BLOCKED" && e.action !== "blocked") return false;
    if (actionFilter === "NOTIFY"  && e.action === "blocked") return false;
    if ((e.threat_score ?? 0) < minScore) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!((e.process_name ?? "").toLowerCase().includes(q) ||
            (e.file_path    ?? "").toLowerCase().includes(q) ||
            (e.process_path ?? "").toLowerCase().includes(q))) return false;
    }
    return true;
  });

  // ── Stats ─────────────────────────────────────
  const totalEvents  = filtered.length;
  const blockedCount = filtered.filter(e => e.action === "blocked").length;
  const highThreat   = filtered.filter(e => (e.threat_score ?? 0) > 0.7).length;
  const liveSources  = new Set(filtered.map(e => e.device_id)).size;

  const stats = [
    { label: "Total Events",  value: totalEvents,  color: "var(--c-strong)" },
    { label: "Blocked",       value: blockedCount,  color: "#ef4444"         },
    { label: "High Threat",   value: highThreat,    color: "#f59e0b"         },
    { label: "Live Sources",  value: liveSources,   color: "#22c55e"         },
  ];

  const typeFilters: EventTypeFilter[] = ["ALL", "EXEC", "CREATE", "WRITE", "RENAME"];

  const emptyState = !loading && events.length === 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "var(--c-bg)", overflow: "hidden" }}>

      {/* Header */}
      <div style={{
        padding: "16px 24px",
        borderBottom: "1px solid var(--c-border)",
        display: "flex", alignItems: "center", gap: 12,
        flexShrink: 0,
      }}>
        <Crosshair style={{ width: 20, height: 20, color: "var(--c-primary)" }} />
        <div>
          <h1 style={{ fontSize: 17, fontWeight: 700, color: "var(--c-strong)", lineHeight: 1 }}>Threat Hunt</h1>
          <p style={{ fontSize: 11, color: "var(--c-muted)", marginTop: 2 }}>Real-time EDR event stream with inline blocking</p>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          {!isPaused && (
            <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#22c55e" }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#22c55e", animation: "pulse 2s infinite" }} />
              Live
            </span>
          )}
          <button
            onClick={isPaused ? handleResume : () => setIsPaused(true)}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "6px 12px", borderRadius: 8, fontSize: 12, fontWeight: 600,
              background: "var(--c-card)", border: "1px solid var(--c-border)",
              color: "var(--c-muted)", cursor: "pointer", position: "relative",
            }}
          >
            {isPaused
              ? <><Play style={{ width: 12, height: 12 }} /> Resume</>
              : <><Pause style={{ width: 12, height: 12 }} /> Pause</>}
            {isPaused && pendingQueue.length > 0 && (
              <span style={{
                position: "absolute", top: -6, right: -6,
                background: "#ef4444", color: "#fff",
                fontSize: 9, fontWeight: 800,
                padding: "1px 5px", borderRadius: 99,
              }}>{pendingQueue.length}</span>
            )}
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12,
        padding: "12px 24px", flexShrink: 0,
      }}>
        {stats.map(s => (
          <div key={s.label} style={{
            background: "var(--c-card)", border: "1px solid var(--c-border)",
            borderRadius: 10, padding: "10px 14px",
          }}>
            <p style={{ fontSize: 22, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</p>
            <p style={{ fontSize: 10, color: "var(--c-muted)", marginTop: 3, letterSpacing: "0.06em", textTransform: "uppercase" }}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* Main panels */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden", gap: 0 }}>

        {/* ── Left: Event Feed ────────────────────── */}
        <div style={{
          width: "55%", display: "flex", flexDirection: "column",
          borderRight: "1px solid var(--c-border)", overflow: "hidden",
        }}>
          {/* Filters */}
          <div style={{
            padding: "10px 16px", borderBottom: "1px solid var(--c-border)",
            display: "flex", flexDirection: "column", gap: 8, flexShrink: 0,
          }}>
            {/* Search */}
            <div style={{ position: "relative" }}>
              <Search style={{
                position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)",
                width: 13, height: 13, color: "var(--c-muted)",
              }} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search process, path…"
                style={{
                  width: "100%", paddingLeft: 30, paddingRight: 10, paddingTop: 6, paddingBottom: 6,
                  background: "var(--c-card)", border: "1px solid var(--c-border)",
                  borderRadius: 7, fontSize: 12, color: "var(--c-strong)", outline: "none",
                }}
              />
            </div>
            {/* Type + Action + Score */}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <div style={{ display: "flex", gap: 1, background: "var(--c-card)", borderRadius: 7, padding: 2, border: "1px solid var(--c-border)" }}>
                {typeFilters.map(t => (
                  <button
                    key={t}
                    onClick={() => setTypeFilter(t)}
                    style={{
                      padding: "3px 8px", borderRadius: 5, fontSize: 10, fontWeight: 600,
                      cursor: "pointer", letterSpacing: "0.06em",
                      background: typeFilter === t ? "var(--c-primary)" : "transparent",
                      color: typeFilter === t ? "#fff" : "var(--c-muted)",
                      border: "none",
                    }}
                  >{t}</button>
                ))}
              </div>
              <div style={{ display: "flex", gap: 1, background: "var(--c-card)", borderRadius: 7, padding: 2, border: "1px solid var(--c-border)" }}>
                {(["ALL", "BLOCKED", "NOTIFY"] as ActionFilter[]).map(a => (
                  <button
                    key={a}
                    onClick={() => setActionFilter(a)}
                    style={{
                      padding: "3px 8px", borderRadius: 5, fontSize: 10, fontWeight: 600,
                      cursor: "pointer",
                      background: actionFilter === a ? (a === "BLOCKED" ? "#ef4444" : "var(--c-primary)") : "transparent",
                      color: actionFilter === a ? "#fff" : "var(--c-muted)",
                      border: "none",
                    }}
                  >{a}</button>
                ))}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 10, color: "var(--c-muted)", whiteSpace: "nowrap" }}>Min risk:</span>
                <input
                  type="range" min={0} max={1} step={0.1}
                  value={minScore}
                  onChange={e => setMinScore(parseFloat(e.target.value))}
                  style={{ width: 70 }}
                />
                <span style={{ fontSize: 10, color: "var(--c-muted)", fontFamily: "monospace", minWidth: 24 }}>
                  {(minScore * 100).toFixed(0)}%
                </span>
              </div>
            </div>
          </div>

          {/* Feed */}
          <div
            ref={feedRef}
            style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}
          >
            {loading && (
              <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--c-muted)", fontSize: 13 }}>
                Loading events…
              </div>
            )}

            {emptyState && (
              <div style={{ padding: "60px 24px", textAlign: "center" }}>
                <Crosshair style={{ width: 32, height: 32, color: "var(--c-faint)", margin: "0 auto 12px" }} />
                <p style={{ color: "var(--c-muted)", fontSize: 13, marginBottom: 6 }}>No EDR events yet.</p>
                <p style={{ color: "var(--c-faint)", fontSize: 11, maxWidth: 300, margin: "0 auto", lineHeight: 1.5 }}>
                  Deploy the ES sensor on macOS or the minifilter driver on Windows to start seeing real-time events.
                </p>
              </div>
            )}

            {!loading && filtered.length === 0 && !emptyState && (
              <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--c-muted)", fontSize: 13 }}>
                No events match current filters.
              </div>
            )}

            {filtered.map(ev => {
              const isSelected = selected?.id === ev.id;
              return (
                <div
                  key={ev.id}
                  onClick={() => setSelected(ev)}
                  style={{
                    padding: "10px 16px",
                    borderBottom: "1px solid var(--c-divider, var(--c-border))",
                    borderLeft: isSelected ? "3px solid var(--c-primary)" : "3px solid transparent",
                    cursor: "pointer",
                    background: isSelected ? "var(--c-nav-active-bg, rgba(99,102,241,0.06))" : "transparent",
                    transition: "all 0.15s ease",
                    position: "relative",
                  }}
                  onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = "var(--c-card)"; }}
                  onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5 }}>
                    <ThreatDot score={ev.threat_score ?? 0} />
                    <EventTypeBadge type={ev.event_type} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--c-strong)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {ev.process_name || "unknown"}
                    </span>
                    {ev.mitre_id && (
                      <span style={{ fontSize: 9, fontFamily: "monospace", color: "var(--c-muted)", letterSpacing: "0.06em" }}>
                        {ev.mitre_id}
                      </span>
                    )}
                    <ActionBadge action={ev.action} />
                    <span style={{ fontSize: 10, color: "var(--c-faint)", whiteSpace: "nowrap", marginLeft: 4 }}>
                      {relativeTime(ev.timestamp || ev.created_at)}
                    </span>
                    {/* Quick block button */}
                    <div style={{ position: "relative" }}>
                      <button
                        onClick={e => { e.stopPropagation(); setQuickBlock(quickBlock === ev.id ? null : ev.id); }}
                        style={{
                          padding: "2px 5px", borderRadius: 5, border: "1px solid var(--c-border)",
                          background: "var(--c-card2, var(--c-card))", cursor: "pointer",
                          display: "flex", alignItems: "center",
                        }}
                        title="Quick block"
                      >
                        <Shield style={{ width: 10, height: 10, color: "var(--c-muted)" }} />
                      </button>
                      {quickBlock === ev.id && (
                        <div style={{
                          position: "absolute", right: 0, top: "calc(100% + 4px)", zIndex: 20,
                          background: "var(--c-card)", border: "1px solid var(--c-border2)",
                          borderRadius: 8, overflow: "hidden", boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
                          minWidth: 160,
                        }}
                          onClick={e => e.stopPropagation()}
                        >
                          {ev.process_path && (
                            <button
                              onClick={() => addBlockRule(ev.id, "path", ev.process_path, ev.process_name || ev.process_path)}
                              style={{ width: "100%", padding: "8px 12px", textAlign: "left", fontSize: 11, color: "var(--c-text, var(--c-fg))", background: "none", border: "none", cursor: "pointer", borderBottom: "1px solid var(--c-border)" }}
                              onMouseEnter={e => e.currentTarget.style.background = "var(--c-border2)"}
                              onMouseLeave={e => e.currentTarget.style.background = "none"}
                            >Block process path</button>
                          )}
                          {ev.signing_id && (
                            <button
                              onClick={() => addBlockRule(ev.id, "signing_id", ev.signing_id, ev.signing_id)}
                              style={{ width: "100%", padding: "8px 12px", textAlign: "left", fontSize: 11, color: "var(--c-text, var(--c-fg))", background: "none", border: "none", cursor: "pointer" }}
                              onMouseEnter={e => e.currentTarget.style.background = "var(--c-border2)"}
                              onMouseLeave={e => e.currentTarget.style.background = "none"}
                            >Block signing ID</button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 11, color: "var(--c-muted)", fontFamily: "monospace", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {ev.file_path || ev.process_path || "—"}
                    </span>
                    <ScoreBar score={ev.threat_score ?? 0} />
                    <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                      <OsIcon os={ev.devices?.os_type} />
                      <span style={{ fontSize: 10, color: "var(--c-faint)", fontFamily: "monospace" }}>
                        {ev.devices?.hostname || ev.device_id?.slice(0, 8) || "—"}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Right: Detail Panel ──────────────────── */}
        <div style={{
          width: "45%", overflowY: "auto",
          background: "var(--c-bg)",
        }}>
          {!selected ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 12 }}>
              <Crosshair style={{ width: 36, height: 36, color: "var(--c-faint)" }} />
              <p style={{ fontSize: 13, color: "var(--c-muted)" }}>Select an event to investigate</p>
            </div>
          ) : (
            <div style={{ padding: "20px 20px 32px" }}>

              {/* Process header */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginBottom: 8 }}>
                  <ThreatDot score={selected.threat_score ?? 0} />
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 17, fontWeight: 700, color: "var(--c-strong)", lineHeight: 1.2, wordBreak: "break-all" }}>
                      {selected.process_name || "unknown"}
                    </p>
                    <p style={{ fontSize: 11, color: "var(--c-muted)", fontFamily: "monospace", marginTop: 3, wordBreak: "break-all" }}>
                      {selected.process_path || "—"}
                    </p>
                  </div>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  <span style={{ fontSize: 10, fontFamily: "monospace", padding: "2px 7px", borderRadius: 5, background: "var(--c-border2)", color: "var(--c-muted)" }}>
                    PID {selected.pid}
                  </span>
                  <span style={{ fontSize: 10, fontFamily: "monospace", padding: "2px 7px", borderRadius: 5, background: "var(--c-border2)", color: "var(--c-muted)" }}>
                    PPID {selected.ppid}
                  </span>
                  {selected.signing_id && (
                    <span style={{ fontSize: 10, fontFamily: "monospace", padding: "2px 7px", borderRadius: 5, background: "rgba(99,102,241,0.12)", color: "#818cf8", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {selected.signing_id}
                    </span>
                  )}
                  <ActionBadge action={selected.action} />
                  <EventTypeBadge type={selected.event_type} />
                </div>
              </div>

              {/* Process tree */}
              <div style={{ marginBottom: 20 }}>
                <p style={{ fontSize: 10, fontWeight: 700, color: "var(--c-muted)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>Process Tree</p>
                <div style={{ background: "var(--c-card)", border: "1px solid var(--c-border)", borderRadius: 10, padding: 12 }}>
                  <ProcessTree event={selected} allEvents={events} />
                </div>
              </div>

              {/* Threat assessment */}
              <div style={{ marginBottom: 20 }}>
                <p style={{ fontSize: 10, fontWeight: 700, color: "var(--c-muted)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>Threat Assessment</p>
                <div style={{ background: "var(--c-card)", border: "1px solid var(--c-border)", borderRadius: 10, padding: 14, display: "flex", gap: 16, alignItems: "center" }}>
                  <ThreatGauge score={selected.threat_score ?? 0} />
                  <div style={{ flex: 1 }}>
                    {selected.mitre_id ? (
                      <div style={{ background: "var(--c-bg)", border: "1px solid var(--c-border)", borderRadius: 8, padding: 10 }}>
                        <p style={{ fontSize: 9, fontWeight: 700, color: "var(--c-muted)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>MITRE ATT&amp;CK</p>
                        <p style={{ fontSize: 13, fontWeight: 700, color: "var(--c-strong)", marginBottom: 2 }}>
                          {selected.mitre_id}
                        </p>
                        <p style={{ fontSize: 11, color: "var(--c-muted)", marginBottom: 6 }}>
                          {selected.mitre_name || "—"}
                        </p>
                        <a
                          href={`https://attack.mitre.org/techniques/${selected.mitre_id}/`}
                          target="_blank"
                          rel="noreferrer"
                          style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, color: "var(--c-primary)", textDecoration: "none" }}
                        >
                          View on ATT&amp;CK <ExternalLink style={{ width: 10, height: 10 }} />
                        </a>
                      </div>
                    ) : (
                      <p style={{ fontSize: 11, color: "var(--c-faint)" }}>No MITRE technique mapped</p>
                    )}
                  </div>
                </div>
              </div>

              {/* File path */}
              {selected.file_path && (
                <div style={{ marginBottom: 20 }}>
                  <p style={{ fontSize: 10, fontWeight: 700, color: "var(--c-muted)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>File Path</p>
                  <div style={{
                    background: "var(--c-card)", border: "1px solid var(--c-border)",
                    borderRadius: 10, padding: "10px 14px",
                    fontFamily: "monospace", fontSize: 11, color: "var(--c-fg, var(--c-text))",
                    wordBreak: "break-all",
                  }}>
                    {selected.file_path}
                  </div>
                </div>
              )}

              {/* Device info */}
              {selected.devices && (
                <div style={{ marginBottom: 20 }}>
                  <p style={{ fontSize: 10, fontWeight: 700, color: "var(--c-muted)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>Source Device</p>
                  <div style={{
                    background: "var(--c-card)", border: "1px solid var(--c-border)",
                    borderRadius: 10, padding: "10px 14px",
                    display: "flex", alignItems: "center", gap: 8,
                  }}>
                    <OsIcon os={selected.devices.os_type} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--c-strong)" }}>
                      {selected.devices.hostname}
                    </span>
                    <span style={{ fontSize: 10, color: "var(--c-faint)", fontFamily: "monospace", marginLeft: "auto" }}>
                      {relativeTime(selected.timestamp || selected.created_at)}
                    </span>
                  </div>
                </div>
              )}

              {/* Action buttons */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <p style={{ fontSize: 10, fontWeight: 700, color: "var(--c-muted)", letterSpacing: "0.1em", textTransform: "uppercase" }}>Actions</p>

                {selected.process_path && (
                  <button
                    onClick={() => addBlockRule(selected.id, "path", selected.process_path, selected.process_name || selected.process_path)}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "10px 14px", borderRadius: 9,
                      background: blockSuccess[selected.id + "path"] ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.1)",
                      border: `1px solid ${blockSuccess[selected.id + "path"] ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
                      color: blockSuccess[selected.id + "path"] ? "#22c55e" : "#ef4444",
                      fontSize: 13, fontWeight: 600, cursor: "pointer",
                    }}
                  >
                    <Shield style={{ width: 14, height: 14 }} />
                    {blockSuccess[selected.id + "path"] || "Block Process Path"}
                  </button>
                )}

                {selected.signing_id && (
                  <button
                    onClick={() => addBlockRule(selected.id, "signing_id", selected.signing_id, selected.signing_id)}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "10px 14px", borderRadius: 9,
                      background: blockSuccess[selected.id + "signing_id"] ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.1)",
                      border: `1px solid ${blockSuccess[selected.id + "signing_id"] ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
                      color: blockSuccess[selected.id + "signing_id"] ? "#22c55e" : "#ef4444",
                      fontSize: 13, fontWeight: 600, cursor: "pointer",
                    }}
                  >
                    <Shield style={{ width: 14, height: 14 }} />
                    {blockSuccess[selected.id + "signing_id"] || "Block Signing ID"}
                  </button>
                )}

                {selected.process_name && (
                  <button
                    onClick={() => addBlockRule(selected.id, "process_name", selected.process_name, selected.process_name)}
                    style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "10px 14px", borderRadius: 9,
                      background: blockSuccess[selected.id + "process_name"] ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.1)",
                      border: `1px solid ${blockSuccess[selected.id + "process_name"] ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
                      color: blockSuccess[selected.id + "process_name"] ? "#22c55e" : "#ef4444",
                      fontSize: 13, fontWeight: 600, cursor: "pointer",
                    }}
                  >
                    <Shield style={{ width: 14, height: 14 }} />
                    {blockSuccess[selected.id + "process_name"] || "Block Process Name"}
                  </button>
                )}

                <button
                  onClick={() => navigate(`/device/${selected.device_id}`)}
                  style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "10px 14px", borderRadius: 9,
                    background: "var(--c-card)", border: "1px solid var(--c-border)",
                    color: "var(--c-muted)", fontSize: 13, fontWeight: 600, cursor: "pointer",
                  }}
                >
                  <Activity style={{ width: 14, height: 14 }} />
                  View Device
                  <ChevronRight style={{ width: 12, height: 12, marginLeft: "auto" }} />
                </button>
              </div>

            </div>
          )}
        </div>
      </div>

      {/* Timeline bar */}
      <TimelineBar events={filtered} />

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
