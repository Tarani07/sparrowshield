import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Grid3x3, Crosshair, Layers, Activity, ShieldCheck, Info } from "lucide-react";
import TopBar from "../components/layout/TopBar";
import { supabase } from "../lib/supabase";
import { timeAgo } from "../lib/utils";
import { Page, PageHeader, Panel, StatTile, Badge, Button, Drawer, KeyValue, SeverityBadge } from "../components/ui";

// ─── Static ATT&CK schema ───────────────────────────────────────────────────

const TACTICS_ORDER = [
  "Reconnaissance", "Resource Development", "Initial Access", "Execution", "Persistence", "Privilege Escalation",
  "Defense Evasion", "Credential Access", "Discovery", "Lateral Movement", "Collection", "Command and Control",
  "Exfiltration", "Impact", "Other",
];

const ATTACK_MATRIX: { id: string; name: string; tactic: string }[] = [
  // Initial Access
  { id: "T1078",     name: "Valid Accounts",       tactic: "Initial Access" },
  { id: "T1091",     name: "Removable Media",      tactic: "Initial Access" },
  // Execution
  { id: "T1059",     name: "Cmd & Scripting",      tactic: "Execution" },
  { id: "T1059.001", name: "PowerShell",           tactic: "Execution" },
  { id: "T1059.002", name: "AppleScript",          tactic: "Execution" },
  { id: "T1059.003", name: "Windows Cmd Shell",    tactic: "Execution" },
  { id: "T1059.005", name: "Visual Basic",         tactic: "Execution" },
  { id: "T1203",     name: "Client Exploitation",  tactic: "Execution" },
  { id: "T1204",     name: "User Execution",       tactic: "Execution" },
  { id: "T1204.002", name: "Malicious File",       tactic: "Execution" },
  { id: "T1218.005", name: "Mshta",                tactic: "Execution" },
  { id: "T1218.010", name: "Regsvr32",             tactic: "Execution" },
  { id: "T1569.002", name: "Service Execution",    tactic: "Execution" },
  // Persistence
  { id: "T1136.001", name: "Local Account",        tactic: "Persistence" },
  { id: "T1176",     name: "Browser Extensions",   tactic: "Persistence" },
  { id: "T1543.001", name: "Launch Agent",         tactic: "Persistence" },
  { id: "T1543.003", name: "Windows Service",      tactic: "Persistence" },
  { id: "T1543.004", name: "Launch Daemon",        tactic: "Persistence" },
  { id: "T1546.003", name: "WMI Subscription",     tactic: "Persistence" },
  { id: "T1547.001", name: "Run Keys / Startup",   tactic: "Persistence" },
  // Privilege Escalation
  { id: "T1078.003", name: "Local Accounts",       tactic: "Privilege Escalation" },
  { id: "T1548.002", name: "Bypass UAC",           tactic: "Privilege Escalation" },
  // Defense Evasion
  { id: "T1027.010", name: "Cmd Obfuscation",      tactic: "Defense Evasion" },
  { id: "T1036.007", name: "Double Extension",     tactic: "Defense Evasion" },
  { id: "T1112",     name: "Modify Registry",      tactic: "Defense Evasion" },
  { id: "T1218",     name: "System Binary Proxy",  tactic: "Defense Evasion" },
  { id: "T1553.001", name: "Gatekeeper Bypass",    tactic: "Defense Evasion" },
  { id: "T1553.004", name: "Install Root Cert",    tactic: "Defense Evasion" },
  { id: "T1562.001", name: "Disable Tools",        tactic: "Defense Evasion" },
  { id: "T1562.004", name: "Disable Firewall",     tactic: "Defense Evasion" },
  // Credential Access
  { id: "T1003.001", name: "LSASS Memory",         tactic: "Credential Access" },
  { id: "T1110",     name: "Brute Force",          tactic: "Credential Access" },
  { id: "T1110.003", name: "Password Spraying",    tactic: "Credential Access" },
  { id: "T1552.002", name: "Creds in Registry",    tactic: "Credential Access" },
  { id: "T1555",     name: "Password Stores",      tactic: "Credential Access" },
  // Discovery
  { id: "T1049",     name: "Network Connections",  tactic: "Discovery" },
  { id: "T1057",     name: "Process Discovery",    tactic: "Discovery" },
  { id: "T1082",     name: "System Info",          tactic: "Discovery" },
  { id: "T1083",     name: "File/Dir Discovery",   tactic: "Discovery" },
  // Lateral Movement
  { id: "T1021.001", name: "Remote Desktop",       tactic: "Lateral Movement" },
  { id: "T1021.002", name: "SMB/Admin Shares",     tactic: "Lateral Movement" },
  { id: "T1021.005", name: "VNC",                  tactic: "Lateral Movement" },
  { id: "T1080",     name: "Taint Shared Content", tactic: "Lateral Movement" },
  { id: "T1550.003", name: "Pass the Ticket",      tactic: "Lateral Movement" },
  // Collection
  { id: "T1005",     name: "Local System Data",    tactic: "Collection" },
  { id: "T1530",     name: "Data from Storage",    tactic: "Collection" },
  // Command and Control
  { id: "T1071.001", name: "Web Protocols",        tactic: "Command and Control" },
  { id: "T1095",     name: "Non-App Layer Proto",  tactic: "Command and Control" },
  { id: "T1571",     name: "Non-Standard Port",    tactic: "Command and Control" },
  { id: "T1572",     name: "Protocol Tunneling",   tactic: "Command and Control" },
  { id: "T1573",     name: "Encrypted Channel",    tactic: "Command and Control" },
  // Exfiltration
  { id: "T1041",     name: "Exfil Over C2",        tactic: "Exfiltration" },
  { id: "T1048",     name: "Exfil Alt Protocol",   tactic: "Exfiltration" },
  // Impact
  { id: "T1485",     name: "Data Destruction",     tactic: "Impact" },
  { id: "T1486",     name: "Data Encrypted",       tactic: "Impact" },
  { id: "T1489",     name: "Service Stop",         tactic: "Impact" },
  { id: "T1490",     name: "Inhibit Recovery",     tactic: "Impact" },
  { id: "T1496",     name: "Resource Hijacking",   tactic: "Impact" },
];

// ─── Types ───────────────────────────────────────────────────────────────────

type Technique = { id: string; name: string; tactic: string };

interface EdrHit { mitre_technique_id: string | null; mitre_id: string | null }
interface AlertHit { mitre_technique: string | null }
interface RuleRow { rule_id: string; name: string; severity: string; mitre_id: string | null; mitre_technique: string | null; mitre_name: string | null; enabled: boolean }

interface RecentEvent {
  id: string;
  process_name: string | null;
  device_uid: string | null;
  device_id: string | null;
  event_time: string | null;
  threat_score: number | null;
  devices: { hostname: string | null } | null;
}
interface RecentAlert {
  id: string; device_id: string; message: string; severity: string; resolved: boolean; created_at: string;
  devices: { hostname: string | null } | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const mitreUrl = (id: string) => `https://attack.mitre.org/techniques/${id.replace(".", "/")}/`;
const ruleTech = (r: RuleRow) => r.mitre_id ?? r.mitre_technique ?? null;

function heat(hits: number, max: number): { bg: string; fg: string; border: string } {
  if (hits === 0) return { bg: "var(--c-card)", fg: "var(--c-muted)", border: "var(--c-border)" };
  const c = hits >= 5 ? "var(--sev-critical)" : hits >= 2 ? "var(--sev-high)" : "var(--sev-medium)";
  const pct = Math.round(14 + 26 * Math.min(1, hits / Math.max(1, max)));
  return { bg: `color-mix(in srgb, ${c} ${pct}%, var(--c-card))`, fg: "var(--c-strong)", border: `color-mix(in srgb, ${c} 55%, transparent)` };
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function MitreMatrix() {
  const [days, setDays] = useState<7 | 30>(7);
  const [selected, setSelected] = useState<Technique | null>(null);
  const [view, setView] = useState<"all" | "detected" | "covered">("all");
  const since = useMemo(() => new Date(Date.now() - days * 86400_000).toISOString(), [days]);

  // Sensor events: the Windows sensor writes mitre_technique_id, the macOS agent writes mitre_id.
  const { data: rawEvents = [] } = useQuery<EdrHit[]>({
    queryKey: ["mitre-heatmap", days],
    queryFn: async () => {
      const { data } = await supabase
        .from("edr_events")
        .select("mitre_technique_id, mitre_id")
        .or("mitre_technique_id.not.is.null,mitre_id.not.is.null")
        .gte("event_time", since)
        .limit(10000);
      return (data as EdrHit[]) ?? [];
    },
    refetchInterval: 60_000,
  });

  // Detection-engine alerts are tagged with a technique too.
  const { data: alertHits = [] } = useQuery<AlertHit[]>({
    queryKey: ["mitre-heatmap-alerts", days],
    queryFn: async () => {
      const { data } = await supabase.from("alerts").select("mitre_technique")
        .not("mitre_technique", "is", null).gte("created_at", since).limit(10000);
      return (data as AlertHit[]) ?? [];
    },
    refetchInterval: 60_000,
  });

  const { data: rules = [] } = useQuery<RuleRow[]>({
    queryKey: ["mitre-rules"],
    queryFn: async () => {
      const { data } = await supabase.from("detection_rules").select("rule_id, name, severity, mitre_id, mitre_technique, mitre_name, enabled");
      return (data as RuleRow[]) ?? [];
    },
  });

  const hitMap = useMemo(() => {
    const m: Record<string, number> = {};
    for (const ev of rawEvents) { const id = ev.mitre_technique_id ?? ev.mitre_id; if (id) m[id] = (m[id] ?? 0) + 1; }
    for (const a of alertHits) { if (a.mitre_technique) m[a.mitre_technique] = (m[a.mitre_technique] ?? 0) + 1; }
    return m;
  }, [rawEvents, alertHits]);

  const rulesByTech = useMemo(() => {
    const m: Record<string, RuleRow[]> = {};
    for (const r of rules) { const t = ruleTech(r); if (t) (m[t] ??= []).push(r); }
    return m;
  }, [rules]);

  // Matrix = static list + any detected / covered technique not in it ("Other").
  const matrix: Technique[] = useMemo(() => {
    const known = new Set(ATTACK_MATRIX.map(t => t.id));
    const extra = [...new Set([...Object.keys(hitMap), ...Object.keys(rulesByTech)])]
      .filter(id => !known.has(id) && /^T\d{4}/.test(id))
      .map(id => ({ id, name: rulesByTech[id]?.[0]?.mitre_name ?? id, tactic: "Other" }));
    return [...ATTACK_MATRIX, ...extra];
  }, [hitMap, rulesByTech]);

  const totalEvents = Object.values(hitMap).reduce((s, n) => s + n, 0);
  const detected = matrix.filter(t => (hitMap[t.id] ?? 0) > 0);
  const tacticsWithHits = new Set(detected.map(t => t.tactic)).size;
  const covered = matrix.filter(t => (rulesByTech[t.id]?.length ?? 0) > 0);
  const maxHits = Math.max(1, ...matrix.map(t => hitMap[t.id] ?? 0));
  const top = detected.slice().sort((a, b) => (hitMap[b.id] ?? 0) - (hitMap[a.id] ?? 0))[0];

  const visible = (t: Technique) => view === "all" || (view === "detected" ? (hitMap[t.id] ?? 0) > 0 : (rulesByTech[t.id]?.length ?? 0) > 0);
  const tacticGroups = TACTICS_ORDER.map(tactic => ({ tactic, techniques: matrix.filter(t => t.tactic === tactic && visible(t)) }))
    .filter(g => g.techniques.length > 0);

  // Drawer data
  const { data: events = [], isLoading: evLoading } = useQuery<RecentEvent[]>({
    queryKey: ["mitre-events", selected?.id],
    enabled: !!selected,
    queryFn: async () => {
      const { data } = await supabase
        .from("edr_events")
        .select("id, process_name, device_uid, device_id, event_time, threat_score, devices(hostname)")
        .or(`mitre_technique_id.eq.${selected!.id},mitre_id.eq.${selected!.id}`)
        .order("event_time", { ascending: false })
        .limit(10);
      return (data as unknown as RecentEvent[]) ?? [];
    },
    refetchInterval: 60_000,
  });
  const { data: techAlerts = [] } = useQuery<RecentAlert[]>({
    queryKey: ["mitre-alerts", selected?.id],
    enabled: !!selected,
    queryFn: async () => {
      const { data } = await supabase.from("alerts")
        .select("id, device_id, message, severity, resolved, created_at, devices(hostname)")
        .eq("mitre_technique", selected!.id).order("created_at", { ascending: false }).limit(10);
      return (data as unknown as RecentAlert[]) ?? [];
    },
  });

  return (
    <div className="flex flex-col min-h-full">
      <TopBar title="MITRE ATT&CK" />
      <Page>
        <PageHeader
          title="MITRE ATT&CK Matrix"
          icon={Grid3x3}
          crumbs={[{ label: "Detection & Response" }, { label: "MITRE ATT&CK" }]}
          description="Techniques observed across your fleet (sensor events and detection alerts) mapped onto the ATT&CK enterprise matrix, with detection-rule coverage."
          actions={<div className="flex items-center gap-1 p-0.5 rounded-md border" style={{ borderColor: "var(--c-border2)", background: "var(--c-card2)" }}>
            {([7, 30] as const).map(d => (
              <button key={d} onClick={() => setDays(d)} className="h-7 px-2.5 rounded text-[12px] font-medium"
                style={days === d ? { background: "var(--c-accent-bg)", color: "var(--c-accent)" } : { color: "var(--c-muted)" }}>
                Last {d} days
              </button>
            ))}
          </div>}
        />

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <StatTile label="Techniques detected" icon={Crosshair} tone={detected.length ? "high" : "ok"} value={detected.length}
            sub={top ? `Top: ${top.name} (${hitMap[top.id]})` : "No activity"} onClick={() => setView(view === "detected" ? "all" : "detected")} active={view === "detected"} />
          <StatTile label="Tactics hit" icon={Layers} tone="neutral" value={tacticsWithHits} sub={`of ${TACTICS_ORDER.length - 1} tactics`} />
          <StatTile label={`Observations (${days}d)`} icon={Activity} tone="accent" value={totalEvents} sub={`${rawEvents.length} sensor · ${alertHits.length} alerts`} />
          <StatTile label="Rule coverage" icon={ShieldCheck} tone="ok" value={covered.length} sub="Techniques with a detection rule"
            onClick={() => setView(view === "covered" ? "all" : "covered")} active={view === "covered"} />
        </div>

        <Panel
          noPad
          title="Enterprise matrix"
          subtitle="Click a technique for recent activity and the rules that detect it"
          actions={<div className="hidden md:flex items-center gap-3 text-[11px]" style={{ color: "var(--c-muted)" }}>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm border" style={{ background: heat(1, 10).bg, borderColor: heat(1, 10).border }} />1</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm border" style={{ background: heat(3, 10).bg, borderColor: heat(3, 10).border }} />2–4</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm border" style={{ background: heat(10, 10).bg, borderColor: heat(10, 10).border }} />5+</span>
            <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--ok)" }} />Rule coverage</span>
          </div>}
        >
          {totalEvents === 0 && (
            <div className="flex items-center gap-2 px-4 py-2.5 border-b text-[12.5px]" style={{ borderColor: "var(--c-border)", color: "var(--c-muted)" }}>
              <Info className="w-3.5 h-3.5 shrink-0" /> No ATT&CK activity in the last {days} days. Coverage from detection rules is still shown.
            </div>
          )}
          <div className="overflow-x-auto p-4">
            <div className="flex gap-2.5 min-w-max">
              {tacticGroups.map(({ tactic, techniques }) => {
                const tHits = techniques.reduce((s, t) => s + (hitMap[t.id] ?? 0), 0);
                return (
                  <div key={tactic} className="w-[150px] shrink-0">
                    <div className="rounded-md px-2 py-2 mb-2 border" style={{ background: "var(--c-card2)", borderColor: "var(--c-border)" }}>
                      <p className="text-[10.5px] font-semibold uppercase tracking-[0.05em] leading-tight" style={{ color: "var(--c-strong)" }}>{tactic}</p>
                      <p className="text-[10.5px] mt-0.5" style={{ color: tHits ? "var(--sev-high)" : "var(--c-muted)" }}>
                        {techniques.length} techniques{tHits ? ` · ${tHits} hits` : ""}
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      {techniques.map(tech => {
                        const hits = hitMap[tech.id] ?? 0;
                        const h = heat(hits, maxHits);
                        const cov = (rulesByTech[tech.id]?.length ?? 0) > 0;
                        const sel = selected?.id === tech.id;
                        return (
                          <button key={tech.id} onClick={() => setSelected(tech)}
                            className="relative w-full text-left rounded-md px-2 py-1.5 border transition-[filter] hover:brightness-110 min-h-[52px]"
                            style={{ background: h.bg, borderColor: sel ? "var(--c-accent)" : h.border, boxShadow: sel ? "inset 0 0 0 1px var(--c-accent)" : undefined }}>
                            {cov && <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full" title="Covered by a detection rule" style={{ background: "var(--ok)" }} />}
                            <p className="text-[10px] font-mono leading-none mb-1" style={{ color: "var(--c-muted)" }}>{tech.id}</p>
                            <p className="text-[11.5px] font-medium leading-tight line-clamp-2 pr-2" style={{ color: hits ? h.fg : "var(--c-text)" }}>{tech.name}</p>
                            {hits > 0 && <p className="text-[10px] font-semibold mt-0.5 tabular-nums" style={{ color: "var(--c-strong)" }}>{hits} hit{hits !== 1 ? "s" : ""}</p>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </Panel>
      </Page>

      <Drawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.name ?? ""}
        subtitle={selected && <span className="flex items-center gap-2"><span className="font-mono">{selected.id}</span> · {selected.tactic}</span>}
        footer={selected && (
          <a href={mitreUrl(selected.id)} target="_blank" rel="noopener noreferrer">
            <Button icon={ExternalLink}>View on MITRE ATT&CK</Button>
          </a>
        )}
      >
        {selected && (
          <div className="space-y-6">
            <KeyValue items={[
              { label: `Hits (${days}d)`, value: <span className="tabular-nums font-semibold">{hitMap[selected.id] ?? 0}</span> },
              { label: "Tactic", value: selected.tactic },
              { label: "Detection rules", value: rulesByTech[selected.id]?.length
                  ? <div className="flex flex-wrap gap-1.5">{rulesByTech[selected.id].map(r => (
                      <Badge key={r.rule_id} tone={r.enabled ? "ok" : "neutral"} className="font-mono">{r.rule_id}</Badge>))}</div>
                  : <span style={{ color: "var(--c-muted)" }}>No rule covers this technique</span> },
            ]} />

            <div>
              <h4 className="text-[11px] font-semibold uppercase tracking-[0.06em] mb-2" style={{ color: "var(--c-muted)" }}>Recent alerts</h4>
              {techAlerts.length === 0 ? (
                <p className="text-[12.5px]" style={{ color: "var(--c-muted)" }}>No alerts tagged with this technique.</p>
              ) : (
                <ul className="space-y-2">
                  {techAlerts.map(a => (
                    <li key={a.id} className="rounded-md border px-3 py-2" style={{ borderColor: "var(--c-border)", background: "var(--c-card2)" }}>
                      <div className="flex items-center gap-2">
                        <SeverityBadge severity={a.severity} />
                        <Link to={`/device/${a.device_id}`} className="text-[12.5px] font-medium hover:underline truncate" style={{ color: "var(--c-strong)" }}>
                          {a.devices?.hostname ?? a.device_id}
                        </Link>
                        <span className="ml-auto text-[11px] shrink-0" style={{ color: "var(--c-muted)" }}>{timeAgo(a.created_at)}</span>
                      </div>
                      <p className="mt-1 text-[12px]" style={{ color: "var(--c-muted)" }}>{a.message}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <h4 className="text-[11px] font-semibold uppercase tracking-[0.06em] mb-2" style={{ color: "var(--c-muted)" }}>Recent sensor events</h4>
              {evLoading ? (
                <p className="text-[12.5px]" style={{ color: "var(--c-muted)" }}>Loading…</p>
              ) : events.length === 0 ? (
                <p className="text-[12.5px]" style={{ color: "var(--c-muted)" }}>No sensor events for this technique.</p>
              ) : (
                <ul className="space-y-2">
                  {events.map(ev => (
                    <li key={ev.id} className="rounded-md border px-3 py-2" style={{ borderColor: "var(--c-border)", background: "var(--c-card2)" }}>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[12.5px] font-medium truncate" style={{ color: "var(--c-strong)" }}>{ev.process_name ?? "unknown"}</span>
                        {ev.threat_score != null && <Badge tone={ev.threat_score > (ev.threat_score > 1 ? 70 : 0.7) ? "critical" : "medium"}>{ev.threat_score}</Badge>}
                        <span className="ml-auto text-[11px] shrink-0" style={{ color: "var(--c-muted)" }}>{ev.event_time ? timeAgo(ev.event_time) : "—"}</span>
                      </div>
                      <p className="mt-1 text-[11.5px]" style={{ color: "var(--c-muted)" }}>{ev.devices?.hostname ?? ev.device_uid ?? ev.device_id ?? "—"}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
