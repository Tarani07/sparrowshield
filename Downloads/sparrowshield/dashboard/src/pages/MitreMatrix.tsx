import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X, ExternalLink } from "lucide-react";
import { supabase } from "../lib/supabase";

// ─── Static ATT&CK schema ───────────────────────────────────────────────────

const TACTICS_ORDER = [
  "Reconnaissance",
  "Resource Development",
  "Initial Access",
  "Execution",
  "Persistence",
  "Privilege Escalation",
  "Defense Evasion",
  "Credential Access",
  "Discovery",
  "Lateral Movement",
  "Collection",
  "Command and Control",
  "Exfiltration",
  "Impact",
];

const ATTACK_MATRIX = [
  // Execution
  { id: "T1059.001", name: "PowerShell",           tactic: "Execution" },
  { id: "T1059.003", name: "Windows Cmd Shell",    tactic: "Execution" },
  { id: "T1059.005", name: "Visual Basic",         tactic: "Execution" },
  { id: "T1204.002", name: "Malicious File",       tactic: "Execution" },
  { id: "T1218.005", name: "Mshta",                tactic: "Execution" },
  { id: "T1218.010", name: "Regsvr32",             tactic: "Execution" },
  { id: "T1569.002", name: "Service Execution",    tactic: "Execution" },
  // Persistence
  { id: "T1543.003", name: "Windows Service",      tactic: "Persistence" },
  { id: "T1543.004", name: "Launch Daemon",        tactic: "Persistence" },
  { id: "T1547.001", name: "Run Keys / Startup",   tactic: "Persistence" },
  // Privilege Escalation
  { id: "T1548.002", name: "Bypass UAC",           tactic: "Privilege Escalation" },
  // Defense Evasion
  { id: "T1027.010", name: "Cmd Obfuscation",      tactic: "Defense Evasion" },
  { id: "T1036.007", name: "Double Extension",     tactic: "Defense Evasion" },
  { id: "T1112",     name: "Modify Registry",      tactic: "Defense Evasion" },
  { id: "T1562.001", name: "Disable Tools",        tactic: "Defense Evasion" },
  // Credential Access
  { id: "T1003.001", name: "LSASS Memory",         tactic: "Credential Access" },
  { id: "T1110",     name: "Brute Force",          tactic: "Credential Access" },
  { id: "T1555",     name: "Password Stores",      tactic: "Credential Access" },
  // Discovery
  { id: "T1057",     name: "Process Discovery",    tactic: "Discovery" },
  { id: "T1082",     name: "System Info",          tactic: "Discovery" },
  { id: "T1083",     name: "File/Dir Discovery",   tactic: "Discovery" },
  // Lateral Movement
  { id: "T1021.002", name: "SMB/Admin Shares",     tactic: "Lateral Movement" },
  { id: "T1080",     name: "Taint Shared Content", tactic: "Lateral Movement" },
  // Collection
  { id: "T1005",     name: "Local System Data",    tactic: "Collection" },
  // Command and Control
  { id: "T1071.001", name: "Web Protocols",        tactic: "Command and Control" },
  { id: "T1095",     name: "Non-App Layer Proto",  tactic: "Command and Control" },
  { id: "T1571",     name: "Non-Standard Port",    tactic: "Command and Control" },
  { id: "T1573",     name: "Encrypted Channel",    tactic: "Command and Control" },
  // Exfiltration
  { id: "T1041",     name: "Exfil Over C2",        tactic: "Exfiltration" },
  { id: "T1048",     name: "Exfil Alt Protocol",   tactic: "Exfiltration" },
  // Impact
  { id: "T1486",     name: "Data Encrypted",       tactic: "Impact" },
  { id: "T1489",     name: "Service Stop",         tactic: "Impact" },
  { id: "T1490",     name: "Inhibit Recovery",     tactic: "Impact" },
  { id: "T1496",     name: "Resource Hijacking",   tactic: "Impact" },
];

// ─── Types ───────────────────────────────────────────────────────────────────

type Technique = typeof ATTACK_MATRIX[number];

interface EdrEvent {
  mitre_technique_id: string | null;
  mitre_tactic: string | null;
}

interface RecentEvent {
  id: string;
  process_name: string | null;
  device_uid: string | null;
  event_time: string | null;
  threat_score: number | null;
  mitre_technique_id: string | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function hitColor(hits: number): { background: string; color: string } {
  if (hits === 0)
    return { background: "var(--c-card)", color: "var(--c-muted)" };
  if (hits < 5)
    return { background: "rgba(245,158,11,0.25)", color: "#f59e0b" };
  return { background: "rgba(239,68,68,0.25)", color: "#ef4444" };
}

function mitreUrl(id: string) {
  const base = id.replace(".", "/");
  return `https://attack.mitre.org/techniques/${base}/`;
}

function fmtTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

// ─── Slide-over panel ────────────────────────────────────────────────────────

function SlideOver({
  technique,
  hits,
  onClose,
}: {
  technique: Technique;
  hits: number;
  onClose: () => void;
}) {
  const { data: events = [], isLoading } = useQuery<RecentEvent[]>({
    queryKey: ["mitre-events", technique.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("edr_events")
        .select("id, process_name, device_uid, event_time, threat_score, mitre_technique_id")
        .eq("mitre_technique_id", technique.id)
        .order("event_time", { ascending: false })
        .limit(10);
      return (data as RecentEvent[]) ?? [];
    },
    refetchInterval: 60_000,
  });

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-30"
        style={{ background: "rgba(0,0,0,0.4)" }}
        onClick={onClose}
      />
      {/* Panel */}
      <div
        className="fixed right-0 top-0 h-full z-40 flex flex-col overflow-hidden"
        style={{
          width: 420,
          background: "var(--c-card)",
          borderLeft: "1px solid var(--c-border)",
          boxShadow: "-8px 0 32px rgba(0,0,0,0.3)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-start justify-between p-5"
          style={{ borderBottom: "1px solid var(--c-border)" }}
        >
          <div>
            <p className="text-xs font-mono mb-1" style={{ color: "var(--c-muted)" }}>
              {technique.id}
            </p>
            <h2 className="text-base font-bold" style={{ color: "var(--c-strong)" }}>
              {technique.name}
            </h2>
            <p className="text-xs mt-1" style={{ color: "var(--c-muted)" }}>
              {technique.tactic}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg transition-all"
            style={{ color: "var(--c-muted)" }}
            aria-label="Close panel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Meta */}
        <div className="px-5 py-4 flex items-center gap-4" style={{ borderBottom: "1px solid var(--c-border)" }}>
          <div>
            <p className="text-xs" style={{ color: "var(--c-muted)" }}>Hits (7d)</p>
            <p
              className="text-2xl font-bold"
              style={hits >= 5 ? { color: "#ef4444" } : hits > 0 ? { color: "#f59e0b" } : { color: "var(--c-muted)" }}
            >
              {hits}
            </p>
          </div>
          <a
            href={mitreUrl(technique.id)}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
            style={{ background: "var(--c-bg)", color: "var(--c-muted)", border: "1px solid var(--c-border)" }}
          >
            MITRE ATT&CK
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        {/* Event list */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          <p className="text-xs font-semibold mb-3" style={{ color: "var(--c-muted)" }}>
            RECENT EVENTS
          </p>
          {isLoading ? (
            <p className="text-xs" style={{ color: "var(--c-muted)" }}>Loading…</p>
          ) : events.length === 0 ? (
            <p className="text-xs" style={{ color: "var(--c-muted)" }}>No events found.</p>
          ) : (
            events.map((ev) => (
              <div
                key={ev.id}
                className="rounded-lg p-3 text-xs space-y-1"
                style={{ background: "var(--c-bg)", border: "1px solid var(--c-border)" }}
              >
                <p className="font-semibold font-mono" style={{ color: "var(--c-strong)" }}>
                  {ev.process_name ?? "unknown"}
                </p>
                <div className="flex items-center justify-between">
                  <span style={{ color: "var(--c-muted)" }}>{ev.device_uid ?? "—"}</span>
                  {ev.threat_score != null && (
                    <span
                      className="px-1.5 py-0.5 rounded text-[10px] font-bold"
                      style={
                        ev.threat_score >= 70
                          ? { background: "rgba(239,68,68,0.2)", color: "#ef4444" }
                          : ev.threat_score >= 40
                          ? { background: "rgba(245,158,11,0.2)", color: "#f59e0b" }
                          : { background: "rgba(100,200,100,0.15)", color: "#4ade80" }
                      }
                    >
                      {ev.threat_score}
                    </span>
                  )}
                </div>
                <p style={{ color: "var(--c-muted)" }}>{fmtTime(ev.event_time)}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function MitreMatrix() {
  const [selected, setSelected] = useState<Technique | null>(null);

  // Fetch raw events (last 7 days, non-null technique)
  const { data: rawEvents = [] } = useQuery<EdrEvent[]>({
    queryKey: ["mitre-heatmap"],
    queryFn: async () => {
      const { data } = await supabase
        .from("edr_events")
        .select("mitre_technique_id, mitre_tactic")
        .not("mitre_technique_id", "is", null)
        .gte(
          "event_time",
          new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
        );
      return (data as EdrEvent[]) ?? [];
    },
    refetchInterval: 60_000,
  });

  // Count hits per technique_id
  const hitMap: Record<string, number> = {};
  for (const ev of rawEvents) {
    if (ev.mitre_technique_id) {
      hitMap[ev.mitre_technique_id] = (hitMap[ev.mitre_technique_id] ?? 0) + 1;
    }
  }

  // Hero stats
  const totalEvents = rawEvents.length;
  const techniquesDetected = ATTACK_MATRIX.filter((t) => (hitMap[t.id] ?? 0) > 0).length;
  const tacticsWithHits = new Set(
    ATTACK_MATRIX.filter((t) => (hitMap[t.id] ?? 0) > 0).map((t) => t.tactic)
  ).size;
  const highestHit = ATTACK_MATRIX.reduce<{ t: Technique | null; n: number }>(
    (acc, t) => {
      const n = hitMap[t.id] ?? 0;
      return n > acc.n ? { t, n } : acc;
    },
    { t: null, n: 0 }
  );

  const isEmpty = totalEvents === 0;

  // Group techniques by tactic (only show tactics that have at least one technique in our list)
  const tacticGroups = TACTICS_ORDER.map((tactic) => ({
    tactic,
    techniques: ATTACK_MATRIX.filter((t) => t.tactic === tactic),
  })).filter((g) => g.techniques.length > 0);

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--c-bg)" }}>
      {/* Page header */}
      <div
        className="px-6 py-5 flex-shrink-0"
        style={{ borderBottom: "1px solid var(--c-border)" }}
      >
        <h1 className="text-xl font-bold" style={{ color: "var(--c-strong)" }}>
          MITRE ATT&CK Matrix
        </h1>
        <p className="text-sm mt-0.5" style={{ color: "var(--c-muted)" }}>
          Enterprise techniques — 7-day detection heatmap
        </p>
      </div>

      {/* Hero stats */}
      <div
        className="grid grid-cols-4 gap-4 px-6 py-4 flex-shrink-0"
        style={{ borderBottom: "1px solid var(--c-border)" }}
      >
        {[
          { label: "Techniques Detected", value: techniquesDetected },
          { label: "Tactics Covered",     value: tacticsWithHits },
          { label: "Total Events (7d)",   value: totalEvents },
          {
            label: "Highest-Hit Technique",
            value: highestHit.t ? `${highestHit.t.name} (${highestHit.n})` : "—",
            wide: true,
          },
        ].map(({ label, value, wide }) => (
          <div
            key={label}
            className={`rounded-xl p-4 ${wide ? "col-span-1" : ""}`}
            style={{ background: "var(--c-card)", border: "1px solid var(--c-border)" }}
          >
            <p className="text-xs" style={{ color: "var(--c-muted)" }}>{label}</p>
            <p
              className="text-xl font-bold mt-1 truncate"
              style={{ color: "var(--c-strong)" }}
            >
              {value}
            </p>
          </div>
        ))}
      </div>

      {/* Empty-state banner */}
      {isEmpty && (
        <div
          className="mx-6 mt-4 rounded-xl px-5 py-3 text-sm flex-shrink-0"
          style={{
            background: "rgba(245,158,11,0.08)",
            border: "1px solid rgba(245,158,11,0.3)",
            color: "#f59e0b",
          }}
        >
          No ATT&CK events yet — install a sensor to start detecting
        </div>
      )}

      {/* Matrix */}
      <div className="flex-1 overflow-x-auto overflow-y-auto p-6">
        <div className="flex gap-3 min-w-max">
          {tacticGroups.map(({ tactic, techniques }) => (
            <div key={tactic} style={{ width: 148 }}>
              {/* Tactic header */}
              <div
                className="rounded-lg px-2 py-1.5 mb-2 text-center"
                style={{
                  background: "var(--c-card)",
                  border: "1px solid var(--c-border)",
                }}
              >
                <p
                  className="text-[10px] font-bold uppercase tracking-wide leading-tight"
                  style={{ color: "var(--c-strong)" }}
                >
                  {tactic}
                </p>
              </div>

              {/* Technique cards */}
              <div className="space-y-1.5">
                {techniques.map((tech) => {
                  const hits = hitMap[tech.id] ?? 0;
                  const style = hitColor(hits);
                  return (
                    <button
                      key={tech.id}
                      onClick={() => setSelected(tech)}
                      className="w-full text-left rounded-lg px-2 py-2 transition-all"
                      style={{
                        height: 52,
                        background: style.background,
                        border: "1px solid var(--c-border)",
                        opacity: isEmpty ? 0.55 : 1,
                      }}
                    >
                      <p
                        className="text-[9px] font-mono leading-none mb-0.5"
                        style={{ color: style.color, opacity: 0.7 }}
                      >
                        {tech.id}
                      </p>
                      <p
                        className="text-[11px] font-semibold leading-tight line-clamp-2"
                        style={{ color: style.color }}
                      >
                        {tech.name}
                      </p>
                      {hits > 0 && (
                        <p
                          className="text-[9px] font-bold mt-0.5"
                          style={{ color: style.color, opacity: 0.85 }}
                        >
                          {hits} hit{hits !== 1 ? "s" : ""}
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Slide-over */}
      {selected && (
        <SlideOver
          technique={selected}
          hits={hitMap[selected.id] ?? 0}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
