import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Crosshair, Shield, Pause, Play, ExternalLink, Activity, Ban, AlertTriangle, Radio, Laptop, CheckCircle2, X, XCircle,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from "recharts";
import { supabase } from "../lib/supabase";
import { timeAgo } from "../lib/utils";
import TopBar from "../components/layout/TopBar";
import {
  Page, PageHeader, Panel, StatTile, DataTable, Badge, Button, Drawer, KeyValue,
  type Column, type FilterDef,
} from "../components/ui";

interface EDREvent {
  id: string;
  device_id: string;
  event_type?: string | null;
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
  raw: Record<string, unknown> | string | null;
  timestamp: string;
  created_at: string;
  devices?: { hostname: string; os_type: string };
}

type Flash = { tone: "ok" | "error"; text: string } | null;
const MAC_OS = ["mac", "macos", "darwin"];

/* edr_events has no event_type column; the agent keeps it inside the raw JSON. */
function evType(e: EDREvent): string {
  if (e.event_type) return String(e.event_type).toUpperCase();
  let raw = e.raw;
  if (typeof raw === "string") { try { raw = JSON.parse(raw); } catch { raw = null; } }
  const t = raw && typeof raw === "object" ? (raw as Record<string, unknown>).event_type : null;
  return t ? String(t).toUpperCase() : "EVENT";
}
const score01 = (s: number | null | undefined) => { const v = s ?? 0; return v > 1 ? v / 100 : v; };
const riskTone = (s: number) => (s > 0.7 ? "critical" : s > 0.4 ? "medium" : "ok") as "critical" | "medium" | "ok";
const riskColor = (s: number) => (s > 0.7 ? "var(--sev-critical)" : s > 0.4 ? "var(--sev-medium)" : "var(--ok)");
const tsOf = (e: EDREvent) => e.timestamp || e.created_at;
const osLabel = (os?: string) => (!os ? "—" : MAC_OS.includes(os.toLowerCase()) ? "macOS" : os.toLowerCase() === "windows" ? "Windows" : os);

function ScoreBar({ score }: { score: number }) {
  const s = score01(score);
  return (
    <span className="inline-flex items-center gap-2">
      <span className="w-14 h-1.5 rounded-full overflow-hidden hidden sm:inline-block" style={{ background: "var(--c-border2)" }}>
        <span className="block h-full rounded-full" style={{ width: `${Math.round(s * 100)}%`, background: riskColor(s) }} />
      </span>
      <span className="tabular-nums text-[12px] w-7 text-right" style={{ color: "var(--c-strong)" }}>{Math.round(s * 100)}</span>
    </span>
  );
}

function ActionBadge({ action }: { action: string }) {
  if (action === "blocked") return <Badge tone="critical">Blocked</Badge>;
  if (action === "allowed") return <Badge tone="ok">Allowed</Badge>;
  return <Badge tone="neutral">Notify</Badge>;
}

// ── Process lineage (grandparent → parent → current) ───────
function Lineage({ event, allEvents }: { event: EDREvent; allEvents: EDREvent[] }) {
  const findByPid = (pid: number) => allEvents.find(e => e.pid === pid && e.device_id === event.device_id);
  const parent = event.ppid ? findByPid(event.ppid) : null;
  const grandparent = parent?.ppid ? findByPid(parent.ppid) : null;
  const chain: { label: string; current?: boolean; faint?: boolean }[] = [];
  if (grandparent) chain.push({ label: grandparent.process_name || `PID ${grandparent.pid}` });
  if (parent) chain.push({ label: parent.process_name || `PID ${parent.pid}` });
  else chain.push({ label: event.ppid ? `PPID ${event.ppid} (not in view)` : "root", faint: true });
  chain.push({ label: event.process_name || `PID ${event.pid}`, current: true });
  return (
    <ol className="relative border-l pl-4 space-y-2" style={{ borderColor: "var(--c-border2)" }}>
      {chain.map((n, i) => (
        <li key={i} className="relative">
          <span className="absolute -left-[21px] top-1.5 w-2 h-2 rounded-full" style={{ background: n.current ? "var(--c-accent)" : "var(--c-faint)" }} />
          <span className={`font-mono text-[12.5px] ${n.current ? "font-semibold" : ""}`}
            style={{ color: n.current ? "var(--c-strong)" : n.faint ? "var(--c-muted)" : "var(--c-text)" }}>{n.label}</span>
        </li>
      ))}
    </ol>
  );
}

// ── Main component ─────────────────────────────────────────
export default function ThreatHunt() {
  const navigate = useNavigate();
  const [events,       setEvents]       = useState<EDREvent[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [loadError,    setLoadError]    = useState<string | null>(null);
  const [selectedId,   setSelectedId]   = useState<string | null>(null);
  const [isPaused,     setIsPaused]     = useState(false);
  const [pendingQueue, setPendingQueue] = useState<EDREvent[]>([]);
  const [quick,        setQuick]        = useState<"blocked" | "high" | null>(null);
  const [minScore,     setMinScore]     = useState(0);
  const [flash,        setFlash]        = useState<Flash>(null);
  const [busy,         setBusy]         = useState<string | null>(null);

  // ── Initial load ─────────────────────────────
  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("edr_events")
        .select("*, devices(hostname, os_type)")
        .order("timestamp", { ascending: false })
        .limit(200);
      if (error) setLoadError(error.message);
      else if (data) setEvents(data as EDREvent[]);
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
        if (ev.device_id) {
          const { data } = await supabase.from("devices").select("hostname, os_type").eq("id", ev.device_id).single();
          if (data) ev.devices = data as EDREvent["devices"];
        }
        if (isPausedRef.current) setPendingQueue(q => [ev, ...q]);
        else setEvents(prev => [ev, ...prev].slice(0, 500));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const handleResume = useCallback(() => {
    setIsPaused(false);
    setEvents(prev => [...pendingQueue, ...prev].slice(0, 500));
    setPendingQueue([]);
  }, [pendingQueue]);

  // ── Block rule helper ─────────────────────────
  async function addBlockRule(ruleType: "path" | "signing_id" | "process_name", pattern: string, label: string) {
    if (!pattern) return;
    setBusy(ruleType);
    const { error } = await supabase.from("block_rules").insert({
      name: `Block ${label}`, rule_type: ruleType, pattern, action: "block", severity: "high", enabled: true,
    });
    setBusy(null);
    setFlash(error
      ? { tone: "error", text: `Could not add block rule: ${error.message}` }
      : { tone: "ok", text: `Block rule added for ${ruleType.replace("_", " ")} “${pattern}”. Endpoints enforce it on their next rule sync.` });
  }

  async function killProcess(ev: EDREvent) {
    setBusy("kill");
    const { error } = await supabase.from("device_commands").insert({
      device_id: ev.device_id, command_type: "kill_process", payload: { process_name: ev.process_name },
    });
    setBusy(null);
    setFlash(error
      ? { tone: "error", text: `Could not queue kill: ${error.message}` }
      : { tone: "ok", text: `Kill “${ev.process_name}” queued for ${ev.devices?.hostname ?? "the device"}.` });
  }

  // ── Filtered events ───────────────────────────
  const filtered = useMemo(() => events.filter(e => {
    if (quick === "blocked" && e.action !== "blocked") return false;
    if (quick === "high" && score01(e.threat_score) <= 0.7) return false;
    if (score01(e.threat_score) < minScore) return false;
    return true;
  }), [events, quick, minScore]);

  const blockedCount = events.filter(e => e.action === "blocked").length;
  const highThreat   = events.filter(e => score01(e.threat_score) > 0.7).length;
  const liveSources  = new Set(events.map(e => e.device_id)).size;

  // ── Timeline (12 × 5-minute buckets, last hour) ──
  const timeline = useMemo(() => {
    const now = Date.now(), BUCKET = 5 * 60_000, NUM = 12;
    const b = Array.from({ length: NUM }, (_, i) => ({ label: `-${(NUM - i) * 5}m`, count: 0, max: 0 }));
    for (const e of filtered) {
      const age = now - new Date(tsOf(e)).getTime();
      if (age < 0 || age > NUM * BUCKET) continue;
      const idx = NUM - 1 - Math.min(NUM - 1, Math.floor(age / BUCKET));
      b[idx].count++;
      b[idx].max = Math.max(b[idx].max, score01(e.threat_score));
    }
    return b;
  }, [filtered]);

  const selected = events.find(e => e.id === selectedId) ?? null;
  const selIsMac = MAC_OS.includes((selected?.devices?.os_type ?? "").toLowerCase());

  const types = [...new Set(events.map(evType))].sort();
  const hosts = [...new Set(events.map(e => e.devices?.hostname).filter(Boolean) as string[])].sort();

  const columns: Column<EDREvent>[] = [
    { key: "time", header: "Time", width: "110px", value: e => tsOf(e),
      render: e => <span className="text-[12px]" title={new Date(tsOf(e)).toLocaleString()}>{timeAgo(tsOf(e))}</span> },
    { key: "process", header: "Process", value: e => e.process_name ?? "", render: e => (
      <div className="min-w-0">
        <p className="font-mono text-[12.5px] font-medium truncate max-w-[300px]" style={{ color: "var(--c-strong)" }}>{e.process_name || "unknown"}</p>
        <p className="font-mono text-[11px] truncate max-w-[300px]" style={{ color: "var(--c-muted)" }}>{e.file_path || e.process_path || "—"}</p>
      </div>) },
    { key: "type", header: "Type", hideBelow: "md", value: evType, render: e => <Badge tone="neutral">{evType(e)}</Badge> },
    { key: "action", header: "Action", value: e => e.action ?? "", render: e => <ActionBadge action={e.action} /> },
    { key: "score", header: "Risk", align: "right", value: e => score01(e.threat_score), render: e => <ScoreBar score={e.threat_score} /> },
    { key: "mitre", header: "MITRE", hideBelow: "lg", value: e => e.mitre_id ?? "",
      render: e => e.mitre_id ? <Badge tone="accent" className="font-mono">{e.mitre_id}</Badge> : <span style={{ color: "var(--c-muted)" }}>—</span> },
    { key: "device", header: "Device", hideBelow: "md", value: e => e.devices?.hostname ?? e.device_id?.slice(0, 8) ?? "" },
  ];

  const filters: FilterDef<EDREvent>[] = [
    { key: "type", label: "Type", options: types.map(t => ({ value: t, label: t })), get: evType },
    { key: "action", label: "Action", options: [{ value: "blocked", label: "Blocked" }, { value: "notify", label: "Notify" }, { value: "allowed", label: "Allowed" }], get: e => e.action ?? "notify" },
    { key: "device", label: "Device", options: hosts.map(h => ({ value: h, label: h })), get: e => e.devices?.hostname ?? "" },
    { key: "os", label: "OS", options: [{ value: "macOS", label: "macOS" }, { value: "Windows", label: "Windows" }], get: e => osLabel(e.devices?.os_type) },
  ];

  const flashBar = flash && (
    <div role="status" className="mb-4 flex items-start gap-2 rounded-md border px-3 py-2 text-[13px]"
      style={{ borderColor: `color-mix(in srgb, ${flash.tone === "ok" ? "var(--ok)" : "var(--sev-critical)"} 40%, transparent)`,
        background: `color-mix(in srgb, ${flash.tone === "ok" ? "var(--ok)" : "var(--sev-critical)"} 10%, transparent)`, color: "var(--c-strong)" }}>
      {flash.tone === "ok" ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "var(--ok)" }} /> : <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "var(--sev-critical)" }} />}
      <span className="flex-1 min-w-0 break-words">{flash.text}</span>
      <button onClick={() => setFlash(null)} aria-label="Dismiss" style={{ color: "var(--c-muted)" }}><X className="w-3.5 h-3.5" /></button>
    </div>
  );

  return (
    <div className="flex flex-col min-h-full">
      <TopBar title="Threat Hunt" />
      <Page>
        <PageHeader
          title="Threat Hunt"
          icon={Crosshair}
          crumbs={[{ label: "Detection & Response" }, { label: "Threat Hunt" }]}
          description="Real-time endpoint sensor event stream. Pivot on any process to see its lineage and block it fleet-wide."
          actions={<>
            <Badge tone={isPaused ? "medium" : "ok"} dot>{isPaused ? `Paused${pendingQueue.length ? ` · ${pendingQueue.length} queued` : ""}` : "Live"}</Badge>
            {isPaused
              ? <Button icon={Play} onClick={handleResume}>Resume{pendingQueue.length ? ` (${pendingQueue.length})` : ""}</Button>
              : <Button icon={Pause} onClick={() => setIsPaused(true)}>Pause</Button>}
          </>}
        />

        {flashBar}
        {loadError && (
          <div className="mb-4 rounded-md border px-3 py-2 text-[13px]" style={{ borderColor: "var(--sev-critical)", color: "var(--c-strong)" }}>
            Could not load sensor events: {loadError}
          </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <StatTile label="Events" icon={Activity} tone="accent" value={events.length} sub={`${filtered.length} shown`}
            onClick={() => { setQuick(null); setMinScore(0); }} active={!quick && minScore === 0} />
          <StatTile label="Blocked" icon={Ban} tone={blockedCount ? "critical" : "neutral"} value={blockedCount}
            onClick={() => setQuick(quick === "blocked" ? null : "blocked")} active={quick === "blocked"} />
          <StatTile label="High threat (>70)" icon={AlertTriangle} tone={highThreat ? "high" : "ok"} value={highThreat}
            onClick={() => setQuick(quick === "high" ? null : "high")} active={quick === "high"} />
          <StatTile label="Live sources" icon={Radio} tone="ok" value={liveSources} sub="Devices streaming events" />
        </div>

        <Panel title="Event timeline" subtitle="Last 60 minutes, 5-minute buckets — bar colour is the highest risk in the bucket" className="mb-4">
          <div className="h-[120px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={timeline} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
                <CartesianGrid stroke="var(--c-border)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: "var(--c-muted)", fontSize: 11 }} axisLine={false} tickLine={false} interval={2} />
                <YAxis allowDecimals={false} tick={{ fill: "var(--c-muted)", fontSize: 11 }} axisLine={false} tickLine={false} width={28} />
                <Tooltip
                  cursor={{ fill: "var(--c-row-hover)" }}
                  contentStyle={{ background: "var(--c-card)", border: "1px solid var(--c-border2)", borderRadius: 6, fontSize: 12 }}
                  labelStyle={{ color: "var(--c-strong)" }} itemStyle={{ color: "var(--c-text)" }}
                  formatter={(v: number) => [v, "Events"]}
                />
                <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                  {timeline.map((b, i) => <Cell key={i} fill={b.count ? riskColor(b.max) : "var(--c-border2)"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <DataTable
          rows={filtered}
          columns={columns}
          rowKey={e => e.id}
          loading={loading}
          filters={filters}
          searchPlaceholder="Search process, path, signer, technique…"
          searchText={e => [e.process_name, e.file_path, e.process_path, e.signing_id, e.mitre_id, e.mitre_name, e.devices?.hostname].join(" ")}
          initialSort={{ key: "time", dir: "desc" }}
          onRowClick={e => setSelectedId(e.id)}
          selectedKey={selectedId}
          exportName="threat-hunt-events"
          rowTone={e => (score01(e.threat_score) > 0.7 ? "var(--sev-critical)" : e.action === "blocked" ? "var(--sev-high)" : undefined)}
          empty="No sensor events yet. Deploy the macOS ES sensor or the Windows minifilter driver to start streaming process and file events."
          toolbar={
            <label className="flex items-center gap-2 text-[12px]" style={{ color: "var(--c-muted)" }}>
              Min risk
              <input type="range" min={0} max={1} step={0.1} value={minScore} onChange={e => setMinScore(parseFloat(e.target.value))}
                className="w-20 accent-[var(--c-accent)]" aria-label="Minimum risk score" />
              <span className="tabular-nums w-8" style={{ color: "var(--c-strong)" }}>{Math.round(minScore * 100)}</span>
            </label>
          }
        />
      </Page>

      <Drawer
        open={!!selected}
        onClose={() => setSelectedId(null)}
        title={<span className="font-mono break-all">{selected?.process_name || "unknown"}</span>}
        subtitle={selected && <span className="flex flex-wrap items-center gap-2"><ActionBadge action={selected.action} /> <Badge tone="neutral">{evType(selected)}</Badge> {selected.devices?.hostname}</span>}
        footer={selected && <>
          {selected.device_id && <Button icon={Laptop} onClick={() => navigate(`/device/${selected.device_id}`)}>Open device</Button>}
          {selIsMac && selected.process_name && (
            <Button variant="danger" icon={XCircle} disabled={busy === "kill"} onClick={() => killProcess(selected)}>Kill process</Button>
          )}
        </>}
      >
        {selected && (
          <div className="space-y-6">
            {flashBar}
            <div className="flex items-center gap-4 rounded-md border px-4 py-3" style={{ borderColor: "var(--c-border)", background: "var(--c-card2)" }}>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--c-muted)" }}>Risk score</p>
                <p className="text-[26px] leading-8 font-semibold tabular-nums" style={{ color: riskColor(score01(selected.threat_score)) }}>
                  {Math.round(score01(selected.threat_score) * 100)}
                </p>
              </div>
              <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "var(--c-border2)" }}>
                <div className="h-full rounded-full" style={{ width: `${Math.round(score01(selected.threat_score) * 100)}%`, background: riskColor(score01(selected.threat_score)) }} />
              </div>
              <Badge tone={riskTone(score01(selected.threat_score))}>
                {score01(selected.threat_score) > 0.7 ? "High" : score01(selected.threat_score) > 0.4 ? "Medium" : "Low"}
              </Badge>
            </div>

            <KeyValue items={[
              { label: "Device", value: selected.device_id
                  ? <Link className="hover:underline" style={{ color: "var(--c-accent)" }} to={`/device/${selected.device_id}`}>{selected.devices?.hostname ?? selected.device_id}</Link>
                  : "—" },
              { label: "Platform", value: osLabel(selected.devices?.os_type) },
              { label: "Observed", value: new Date(tsOf(selected)).toLocaleString() },
              { label: "PID / PPID", value: <span className="font-mono">{selected.pid ?? "—"} / {selected.ppid ?? "—"}</span> },
              { label: "Signing ID", value: selected.signing_id ? <span className="font-mono text-[12px] break-all">{selected.signing_id}</span> : "Unsigned / unknown" },
              { label: "MITRE ATT&CK", value: selected.mitre_id
                  ? <a className="inline-flex items-center gap-1 hover:underline" style={{ color: "var(--c-accent)" }}
                      href={`https://attack.mitre.org/techniques/${selected.mitre_id.replace(".", "/")}/`} target="_blank" rel="noreferrer">
                      <span className="font-mono">{selected.mitre_id}</span> {selected.mitre_name ? `· ${selected.mitre_name}` : ""} <ExternalLink className="w-3 h-3" />
                    </a> : "Not mapped" },
            ]} />

            <div>
              <h4 className="text-[11px] font-semibold uppercase tracking-[0.06em] mb-2" style={{ color: "var(--c-muted)" }}>Process lineage</h4>
              <Lineage event={selected} allEvents={events} />
            </div>

            {[["Process path", selected.process_path], ["File path", selected.file_path]].filter(([, v]) => v).map(([label, v]) => (
              <div key={label as string}>
                <h4 className="text-[11px] font-semibold uppercase tracking-[0.06em] mb-1.5" style={{ color: "var(--c-muted)" }}>{label}</h4>
                <pre className="rounded-md border px-3 py-2 font-mono text-[11.5px] whitespace-pre-wrap break-all"
                  style={{ borderColor: "var(--c-border)", background: "var(--c-card2)", color: "var(--c-strong)" }}>{v}</pre>
              </div>
            ))}

            <div>
              <h4 className="text-[11px] font-semibold uppercase tracking-[0.06em] mb-2" style={{ color: "var(--c-muted)" }}>Block fleet-wide</h4>
              <div className="flex flex-wrap gap-2">
                {selected.process_path && (
                  <Button variant="danger" size="sm" icon={Shield} disabled={busy === "path"}
                    onClick={() => addBlockRule("path", selected.process_path, selected.process_name || selected.process_path)}>Block process path</Button>
                )}
                {selected.signing_id && (
                  <Button variant="danger" size="sm" icon={Shield} disabled={busy === "signing_id"}
                    onClick={() => addBlockRule("signing_id", selected.signing_id, selected.signing_id)}>Block signing ID</Button>
                )}
                {selected.process_name && (
                  <Button variant="danger" size="sm" icon={Shield} disabled={busy === "process_name"}
                    onClick={() => addBlockRule("process_name", selected.process_name, selected.process_name)}>Block process name</Button>
                )}
              </div>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
