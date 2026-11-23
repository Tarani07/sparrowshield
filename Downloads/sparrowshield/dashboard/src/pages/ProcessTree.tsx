import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  ChevronRight, ChevronDown, GitBranch, AlertTriangle, Laptop, Clock, Activity, Search, X, XCircle, CheckCircle2,
  ChevronsDownUp, ChevronsUpDown, Info,
} from "lucide-react";
import TopBar from "../components/layout/TopBar";
import { supabase } from "../lib/supabase";
import { timeAgo } from "../lib/utils";
import VirusTotalModal from "../components/device/VirusTotalModal";
import {
  Page, PageHeader, Panel, StatTile, Badge, Button, Drawer, KeyValue, EmptyState, inputClass,
} from "../components/ui";

/* ── Types ── */
interface EdrEvent {
  id: string;
  pid: number;
  ppid: number | null;
  process_name: string | null;
  cmdline: string | null;
  image_path: string | null;
  process_path: string | null;
  threat_score: number | null;
  event_time: string | null;
  severity_id: number | null;
  device_uid: string | null;
  device_id: string | null;
  devices: { hostname: string | null; os_type: string | null } | null;
}

interface TreeNode extends EdrEvent {
  key: string;
  children: TreeNode[];
}

type Flash = { tone: "ok" | "error"; text: string } | null;
const MAC_OS = ["mac", "macos", "darwin"];
const deviceKey = (e: EdrEvent) => e.device_id ?? e.device_uid ?? "unknown";
const nodeKey = (e: EdrEvent) => `${deviceKey(e)}:${e.pid}`;
const hostOf = (e: EdrEvent) => e.devices?.hostname ?? e.device_uid ?? e.device_id ?? "Unknown device";
const pathOf = (e: EdrEvent) => e.image_path ?? e.process_path ?? null;

/* Threat scores are 0–1 from the Windows sensor; normalise anything on a 0–100 scale. */
const score01 = (s: number | null) => (s == null ? null : s > 1 ? s / 100 : s);
function scoreTone(score: number | null): "critical" | "medium" | "ok" | "neutral" {
  const s = score01(score);
  if (s == null) return "neutral";
  if (s > 0.7) return "critical";
  if (s >= 0.5) return "medium";
  return "ok";
}
function sevLabel(id: number | null) {
  switch (id) { case 5: return "critical"; case 4: return "high"; case 3: return "medium"; case 2: return "low"; default: return null; }
}

function buildForest(events: EdrEvent[]): Map<string, TreeNode[]> {
  const nodes = new Map<string, TreeNode>();
  // newest first from the query: keep the newest event for a reused pid
  for (const e of events) { const k = nodeKey(e); if (!nodes.has(k)) nodes.set(k, { ...e, key: k, children: [] }); }
  const byDevice = new Map<string, TreeNode[]>();
  for (const n of nodes.values()) {
    const parent = n.ppid != null ? nodes.get(`${deviceKey(n)}:${n.ppid}`) : undefined;
    if (parent && parent !== n) parent.children.push(n);
    else {
      const list = byDevice.get(deviceKey(n)) ?? [];
      list.push(n);
      byDevice.set(deviceKey(n), list);
    }
  }
  return byDevice;
}

const countDesc = (n: TreeNode): number => n.children.reduce((s, c) => s + 1 + countDesc(c), 0);

/* ── Tree row (recursive) ── */
function TreeRow({ node, depth, expanded, onToggle, onSelect, selectedKey }: {
  node: TreeNode; depth: number; expanded: Set<string>; onToggle: (k: string) => void;
  onSelect: (n: TreeNode) => void; selectedKey: string | null;
}) {
  const isExpanded = expanded.has(node.key);
  const hasChildren = node.children.length > 0;
  const sel = selectedKey === node.key;
  const tone = scoreTone(node.threat_score);
  const sev = sevLabel(node.severity_id);
  const s = score01(node.threat_score);

  return (
    <>
      <div
        className="flex items-center gap-2 h-10 pr-3 border-b cursor-pointer transition-colors min-w-[560px]"
        style={{ paddingLeft: 12 + depth * 20, borderColor: "var(--c-divider)", background: sel ? "var(--c-accent-bg)" : undefined }}
        onMouseEnter={e => { if (!sel) e.currentTarget.style.background = "var(--c-row-hover)"; }}
        onMouseLeave={e => { if (!sel) e.currentTarget.style.background = ""; }}
        onClick={() => onSelect(node)}
      >
        <button
          className="w-5 h-5 flex items-center justify-center rounded shrink-0"
          style={{ color: "var(--c-muted)", visibility: hasChildren ? "visible" : "hidden" }}
          onClick={e => { e.stopPropagation(); onToggle(node.key); }}
          aria-label={isExpanded ? "Collapse" : "Expand"}
        >
          {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </button>
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: tone === "neutral" ? "var(--c-faint)" : tone === "ok" ? "var(--ok)" : `var(--sev-${tone})` }} />
        <span className="text-[13px] font-medium font-mono truncate" style={{ color: "var(--c-strong)" }}>{node.process_name ?? "unknown"}</span>
        <span className="text-[11px] font-mono shrink-0" style={{ color: "var(--c-muted)" }}>PID {node.pid}</span>
        {hasChildren && !isExpanded && <span className="text-[11px] shrink-0" style={{ color: "var(--c-faint)" }}>+{countDesc(node)}</span>}
        <span className="flex-1" />
        {s != null && s > 0 && <Badge tone={tone === "neutral" ? "neutral" : tone}>{s.toFixed(2)}</Badge>}
        {sev && sev !== "low" && <Badge tone={sev === "critical" ? "critical" : sev === "high" ? "high" : "medium"}>{sev}</Badge>}
        {node.event_time && <span className="text-[11px] shrink-0 w-24 text-right hidden sm:inline" style={{ color: "var(--c-muted)" }}>{timeAgo(node.event_time)}</span>}
      </div>
      {isExpanded && node.children.map(child => (
        <TreeRow key={child.key} node={child} depth={depth + 1} expanded={expanded} onToggle={onToggle} onSelect={onSelect} selectedKey={selectedKey} />
      ))}
    </>
  );
}

const SEVERITY_FILTERS = [
  { key: "all", label: "All" }, { key: "critical", label: "Critical" }, { key: "high", label: "High" }, { key: "medium", label: "Medium" },
];

export default function ProcessTree() {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState("");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [quick, setQuick] = useState<"threat" | "hour" | null>(null);
  const [device, setDevice] = useState("");
  const [selected, setSelected] = useState<TreeNode | null>(null);
  const [flash, setFlash] = useState<Flash>(null);

  // Windows sensor: OCSF process-launch events (class 1007, activity 1).
  // macOS agent: rows without an OCSF class but with a pid. Both share one table.
  const { data: events = [], isLoading, error } = useQuery<EdrEvent[]>({
    queryKey: ["process-tree"],
    queryFn: async () => {
      const { data, error: e } = await supabase
        .from("edr_events")
        .select("id, pid, ppid, process_name, cmdline, image_path, process_path, threat_score, event_time, severity_id, device_uid, device_id, devices(hostname, os_type)")
        .or("and(ocsf_class_uid.eq.1007,activity_id.eq.1),and(ocsf_class_uid.is.null,pid.not.is.null)")
        .order("event_time", { ascending: false })
        .limit(500);
      if (e) throw e;
      return ((data ?? []) as unknown as EdrEvent[]).filter(ev => ev.pid != null);
    },
    refetchInterval: 10_000,
  });

  const kill = useMutation({
    mutationFn: async (n: TreeNode) => {
      const { error: e } = await supabase.from("device_commands").insert({
        device_id: n.device_id, command_type: "kill_process", payload: { process_name: n.process_name },
      });
      if (e) throw e;
      return n;
    },
    onSuccess: n => setFlash({ tone: "ok", text: `Kill "${n.process_name}" queued for ${hostOf(n)}.` }),
    onError: e => setFlash({ tone: "error", text: `Could not queue kill: ${(e as Error).message}` }),
  });

  /* ── Computed stats ── */
  const totalProcs = events.length;
  const highThreat = events.filter(e => (score01(e.threat_score) ?? 0) > 0.7).length;
  const devices = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of events) m.set(deviceKey(e), hostOf(e));
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [events]);
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  const lastHour = events.filter(e => e.event_time && new Date(e.event_time).getTime() > oneHourAgo).length;

  /* ── Filter + tree build ── */
  const filteredEvents = useMemo(() => {
    let evts = events;
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      evts = evts.filter(e => [e.process_name, e.cmdline, pathOf(e)].some(v => v?.toLowerCase().includes(q)));
    }
    if (severityFilter !== "all") {
      const sevMap: Record<string, number> = { critical: 5, high: 4, medium: 3 };
      evts = evts.filter(e => e.severity_id === sevMap[severityFilter]);
    }
    if (quick === "threat") evts = evts.filter(e => (score01(e.threat_score) ?? 0) > 0.7);
    if (quick === "hour") evts = evts.filter(e => e.event_time && new Date(e.event_time).getTime() > oneHourAgo);
    if (device) evts = evts.filter(e => deviceKey(e) === device);
    return evts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, searchTerm, severityFilter, quick, device]);

  const forest = useMemo(() => buildForest(filteredEvents), [filteredEvents]);

  function toggle(k: string) {
    setExpanded(prev => { const next = new Set(prev); if (next.has(k)) next.delete(k); else next.add(k); return next; });
  }
  function expandAll() {
    const all = new Set<string>();
    const walk = (n: TreeNode) => { if (n.children.length) { all.add(n.key); n.children.forEach(walk); } };
    forest.forEach(list => list.forEach(walk));
    setExpanded(all);
  }

  const tableNotFound = error != null && (
    String((error as { message?: string }).message ?? "").includes("does not exist") ||
    String((error as { code?: string }).code ?? "") === "42P01"
  );

  // ancestry for the drawer
  const lineage = useMemo(() => {
    if (!selected) return [] as EdrEvent[];
    const chain: EdrEvent[] = [];
    let cur: EdrEvent | undefined = selected;
    const seen = new Set<string>();
    while (cur && cur.ppid != null && !seen.has(nodeKey(cur))) {
      seen.add(nodeKey(cur));
      const ppid: number = cur.ppid;
      const dk = deviceKey(cur);
      cur = events.find(e => e.pid === ppid && deviceKey(e) === dk);
      if (cur) chain.unshift(cur);
    }
    return chain;
  }, [selected, events]);

  const selIsMac = MAC_OS.includes((selected?.devices?.os_type ?? "").toLowerCase()) && !!selected?.device_id;
  const filtersActive = !!(searchTerm || severityFilter !== "all" || quick || device);

  return (
    <div className="flex flex-col min-h-full">
      <TopBar title="Process Tree" />
      <Page>
        <PageHeader
          title="Process Tree"
          icon={GitBranch}
          crumbs={[{ label: "Detection & Response" }, { label: "Process Tree" }]}
          description="Parent → child execution chains reconstructed from endpoint sensor process events. Select a process to inspect its lineage and command line."
        />

        {flash && (
          <div role="status" className="mb-4 flex items-start gap-2 rounded-md border px-3 py-2 text-[13px]"
            style={{ borderColor: `color-mix(in srgb, ${flash.tone === "ok" ? "var(--ok)" : "var(--sev-critical)"} 40%, transparent)`, color: "var(--c-strong)" }}>
            {flash.tone === "ok" ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "var(--ok)" }} /> : <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "var(--sev-critical)" }} />}
            <span className="flex-1">{flash.text}</span>
            <button onClick={() => setFlash(null)} aria-label="Dismiss" style={{ color: "var(--c-muted)" }}><X className="w-3.5 h-3.5" /></button>
          </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <StatTile label="Process events" icon={Activity} tone="accent" value={totalProcs} onClick={() => setQuick(null)} active={!quick} />
          <StatTile label="High threat (>0.7)" icon={AlertTriangle} tone={highThreat ? "critical" : "ok"} value={highThreat}
            onClick={() => setQuick(quick === "threat" ? null : "threat")} active={quick === "threat"} />
          <StatTile label="Devices" icon={Laptop} tone="neutral" value={devices.length} />
          <StatTile label="Last hour" icon={Clock} tone="neutral" value={lastHour}
            onClick={() => setQuick(quick === "hour" ? null : "hour")} active={quick === "hour"} />
        </div>

        <Panel
          noPad
          title="Execution chains"
          subtitle={`${filteredEvents.length} event${filteredEvents.length === 1 ? "" : "s"} across ${forest.size} device${forest.size === 1 ? "" : "s"}`}
          actions={<>
            <Button size="sm" variant="ghost" icon={ChevronsUpDown} onClick={expandAll} disabled={!filteredEvents.length}><span className="hidden sm:inline">Expand all</span></Button>
            <Button size="sm" variant="ghost" icon={ChevronsDownUp} onClick={() => setExpanded(new Set())} disabled={!expanded.size}><span className="hidden sm:inline">Collapse</span></Button>
          </>}
        >
          <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 border-b" style={{ borderColor: "var(--c-border)" }}>
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: "var(--c-muted)" }} />
              <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Process, command line, path…"
                className={`${inputClass} w-full pl-8`} />
            </div>
            <select value={device} onChange={e => setDevice(e.target.value)} className={`${inputClass} pr-7`} aria-label="Device">
              <option value="">Device: All</option>
              {devices.map(([k, h]) => <option key={k} value={k}>Device: {h}</option>)}
            </select>
            <div className="flex items-center gap-1 p-0.5 rounded-md border" style={{ borderColor: "var(--c-border2)", background: "var(--c-card2)" }}>
              {SEVERITY_FILTERS.map(f => (
                <button key={f.key} onClick={() => setSeverityFilter(f.key)}
                  className="h-7 px-2.5 rounded text-[12px] font-medium"
                  style={severityFilter === f.key ? { background: "var(--c-accent-bg)", color: "var(--c-accent)" } : { color: "var(--c-muted)" }}>
                  {f.label}
                </button>
              ))}
            </div>
            {filtersActive && (
              <Button size="sm" variant="ghost" icon={X} onClick={() => { setSearchTerm(""); setSeverityFilter("all"); setQuick(null); setDevice(""); }}>Clear</Button>
            )}
          </div>

          {isLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-6 rounded animate-pulse" style={{ background: "var(--c-card2)", width: `${50 + ((i * 13) % 45)}%` }} />)}
            </div>
          ) : tableNotFound ? (
            <EmptyState icon={AlertTriangle} title="Process sensor not yet connected" hint="Install the SparrowShield sensor on an endpoint to record process events." />
          ) : error ? (
            <EmptyState icon={AlertTriangle} title="Could not load process events" hint={String((error as { message?: string }).message ?? error)} />
          ) : forest.size === 0 ? (
            <EmptyState icon={GitBranch}
              title={events.length === 0 ? "No process events recorded yet" : "No events match the current filters"}
              hint={events.length === 0 ? "Process launches appear here once an endpoint sensor starts streaming events." : undefined} />
          ) : (
            <div className="overflow-x-auto">
              {[...forest.entries()].map(([dk, roots]) => (
                <div key={dk}>
                  <div className="flex items-center gap-2 px-3 h-8 text-[11px] font-semibold uppercase tracking-[0.06em] border-b min-w-[560px]"
                    style={{ background: "var(--c-card2)", color: "var(--c-muted)", borderColor: "var(--c-border)" }}>
                    <Laptop className="w-3.5 h-3.5" /> {devices.find(([k]) => k === dk)?.[1] ?? dk}
                    <span className="font-normal normal-case tracking-normal">· {roots.reduce((s, r) => s + 1 + countDesc(r), 0)} processes</span>
                  </div>
                  {roots.map(root => (
                    <TreeRow key={root.key} node={root} depth={0} expanded={expanded} onToggle={toggle}
                      onSelect={n => { setSelected(n); setFlash(null); }} selectedKey={selected?.key ?? null} />
                  ))}
                </div>
              ))}
            </div>
          )}
        </Panel>
      </Page>

      <Drawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title={<span className="font-mono">{selected?.process_name ?? "unknown"}</span>}
        subtitle={selected && <span>PID {selected.pid} · {hostOf(selected)}</span>}
        footer={selected && <>
          {selected.device_id && <Button icon={Laptop} onClick={() => navigate(`/device/${selected.device_id}`)}>Open device</Button>}
          {selIsMac && selected.process_name && (
            <Button variant="danger" icon={XCircle} disabled={kill.isPending} onClick={() => kill.mutate(selected)}>Kill process</Button>
          )}
        </>}
      >
        {selected && (
          <div className="space-y-6">
            {flash && <p className="text-[12.5px]" style={{ color: flash.tone === "ok" ? "var(--ok)" : "var(--sev-critical)" }}>{flash.text}</p>}
            <KeyValue items={[
              { label: "Device", value: selected.device_id
                  ? <Link className="hover:underline" style={{ color: "var(--c-accent)" }} to={`/device/${selected.device_id}`}>{hostOf(selected)}</Link>
                  : hostOf(selected) },
              { label: "PID / PPID", value: <span className="font-mono">{selected.pid} / {selected.ppid ?? "—"}</span> },
              { label: "Started", value: selected.event_time ? new Date(selected.event_time).toLocaleString() : "—" },
              { label: "Threat score", value: score01(selected.threat_score) != null
                  ? <Badge tone={scoreTone(selected.threat_score) === "neutral" ? "neutral" : scoreTone(selected.threat_score) as "critical" | "medium" | "ok"}>{score01(selected.threat_score)!.toFixed(2)}</Badge> : "—" },
              { label: "Severity", value: sevLabel(selected.severity_id) ?? "—" },
              { label: "Children", value: selected.children.length },
              { label: "Reputation", value: pathOf(selected)
                  ? <VirusTotalModal hash={pathOf(selected)!.split(/[/\\]/).pop()?.toLowerCase() ?? pathOf(selected)!} name={selected.process_name ?? undefined} />
                  : "—" },
            ]} />

            <div>
              <h4 className="text-[11px] font-semibold uppercase tracking-[0.06em] mb-2" style={{ color: "var(--c-muted)" }}>Lineage</h4>
              <ol className="relative border-l pl-4 space-y-2" style={{ borderColor: "var(--c-border2)" }}>
                {lineage.length === 0 && (
                  <li className="text-[12px]" style={{ color: "var(--c-muted)" }}>{selected.ppid != null ? `Parent PID ${selected.ppid} not in the captured window` : "Root process"}</li>
                )}
                {lineage.map(p => (
                  <li key={nodeKey(p)} className="relative">
                    <span className="absolute -left-[21px] top-1.5 w-2 h-2 rounded-full" style={{ background: "var(--c-faint)" }} />
                    <span className="font-mono text-[12.5px]" style={{ color: "var(--c-text)" }}>{p.process_name ?? "unknown"}</span>
                    <span className="ml-2 text-[11px]" style={{ color: "var(--c-muted)" }}>PID {p.pid}</span>
                  </li>
                ))}
                <li className="relative">
                  <span className="absolute -left-[21px] top-1.5 w-2 h-2 rounded-full" style={{ background: "var(--c-accent)" }} />
                  <span className="font-mono text-[12.5px] font-semibold" style={{ color: "var(--c-strong)" }}>{selected.process_name ?? "unknown"}</span>
                  <span className="ml-2 text-[11px]" style={{ color: "var(--c-muted)" }}>PID {selected.pid}</span>
                </li>
              </ol>
            </div>

            {[["Command line", selected.cmdline], ["Image path", pathOf(selected)]].filter(([, v]) => v).map(([label, v]) => (
              <div key={label as string}>
                <h4 className="text-[11px] font-semibold uppercase tracking-[0.06em] mb-1.5" style={{ color: "var(--c-muted)" }}>{label}</h4>
                <pre className="rounded-md border px-3 py-2 font-mono text-[11.5px] whitespace-pre-wrap break-all"
                  style={{ borderColor: "var(--c-border)", background: "var(--c-card2)", color: "var(--c-strong)" }}>{v}</pre>
              </div>
            ))}

            {!selIsMac && (
              <p className="text-[12.5px] flex items-center gap-2" style={{ color: "var(--c-muted)" }}>
                <Info className="w-3.5 h-3.5 shrink-0" /> Remote process termination is only available for macOS endpoints.
              </p>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}
