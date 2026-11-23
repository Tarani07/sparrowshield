import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Radio, ShieldAlert, Flame, AlertTriangle, CheckCircle2, Check, Laptop, X, ExternalLink, Pause, Play } from "lucide-react";
import TopBar from "../components/layout/TopBar";
import { supabase } from "../lib/supabase";
import { timeAgo } from "../lib/utils";
import {
  Page, PageHeader, StatTile, DataTable, SeverityBadge, Badge, Button, Drawer, KeyValue,
  type Column, type FilterDef,
} from "../components/ui";

/* ── Types ── */
interface LiveAlert {
  id: string;
  alert_type: string | null;
  severity: string | null;
  severity_id?: number | null;
  message: string | null;
  resolved: boolean;
  created_at: string | null;
  resolved_at: string | null;
  device_id: string | null;
  mitre_technique?: string | null;
  rule_id?: string | null;
  cmdline?: string | null;
  file_path?: string | null;
  dst_ip?: string | null;
  rule_name?: string | null;
  devices?: { hostname: string | null } | null;
  _live?: boolean;
}

type Flash = { tone: "ok" | "error"; text: string } | null;

/* ── Helpers ── */
function severityNum(a: LiveAlert): number {
  if (a.severity_id != null) return a.severity_id;
  switch (a.severity) {
    case "critical": return 5;
    case "high":     return 4;
    case "medium":
    case "warning":  return 3;
    case "low":      return 2;
    default:         return 1;
  }
}
const sevKey = (a: LiveAlert) => {
  const n = severityNum(a);
  return n >= 5 ? "critical" : n === 4 ? "high" : n === 3 ? "medium" : n === 2 ? "low" : "info";
};
const titleOf = (a: LiveAlert) => a.rule_name ?? a.alert_type?.replace(/_/g, " ").replace(/^\w/, c => c.toUpperCase()) ?? "Unknown alert";

export default function LiveAlerts() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sev, setSev] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [held, setHeld] = useState<LiveAlert[]>([]);
  const [flash, setFlash] = useState<Flash>(null);

  /* ── Initial fetch ── */
  const { data: initialAlerts = [], isLoading } = useQuery<LiveAlert[]>({
    queryKey: ["live-alerts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("alerts")
        .select("id, alert_type, severity, message, resolved, created_at, resolved_at, device_id, mitre_technique, rule_id, devices(hostname)")
        .eq("resolved", false)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as LiveAlert[];
    },
  });

  // Hostname lookup for rows that arrive over realtime (payloads carry only device_id).
  const { data: hostMap = {} } = useQuery<Record<string, string>>({
    queryKey: ["live-alerts-hosts"],
    queryFn: async () => {
      const { data } = await supabase.from("devices").select("id, hostname");
      return Object.fromEntries(((data ?? []) as { id: string; hostname: string }[]).map(d => [d.id, d.hostname]));
    },
    staleTime: 5 * 60_000,
  });

  /* ── Live stream (prepend new alerts) ── */
  const [streamAlerts, setStreamAlerts] = useState<LiveAlert[]>([]);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => {
    const push = (a: LiveAlert) => {
      if (pausedRef.current) setHeld(prev => [a, ...prev]);
      else setStreamAlerts(prev => [a, ...prev]);
    };
    const channel = supabase
      .channel("live-alerts")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "alerts" },
        payload => push({ ...(payload.new as LiveAlert), _live: true }))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "edr_events" },
        payload => {
          const row = payload.new as Record<string, unknown>;
          const sevId = typeof row.severity_id === "number" ? row.severity_id : 0;
          if (sevId >= 4) {
            push({
              id: `edr-${row.id ?? Date.now()}`,
              alert_type: "edr_detection",
              severity: sevId >= 5 ? "critical" : "high",
              severity_id: sevId,
              message: null,
              resolved: false,
              created_at: typeof row.event_time === "string" ? row.event_time : new Date().toISOString(),
              resolved_at: null,
              device_id: typeof row.device_uid === "string" ? row.device_uid : typeof row.device_id === "string" ? row.device_id : null,
              cmdline: typeof row.cmdline === "string" ? row.cmdline : null,
              file_path: typeof row.image_path === "string" ? row.image_path : typeof row.process_path === "string" ? row.process_path : null,
              dst_ip: typeof row.dst_ip === "string" ? row.dst_ip : null,
              rule_name: typeof row.process_name === "string" ? `EDR: ${row.process_name}` : "EDR Detection",
              _live: true,
            });
          }
        })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [pausedRef]);

  function resume() {
    setPaused(false);
    setStreamAlerts(prev => [...held, ...prev]);
    setHeld([]);
  }

  /* ── Resolve ── */
  const resolveMut = useMutation({
    mutationFn: async (alertId: string) => {
      if (alertId.startsWith("edr-")) return "dismissed"; // synthetic, skip DB write
      const { error } = await supabase
        .from("alerts")
        .update({ resolved: true, resolved_at: new Date().toISOString() })
        .eq("id", alertId);
      if (error) throw error;
      return "resolved";
    },
    onSuccess: (what, id) => {
      setStreamAlerts(prev => prev.filter(a => a.id !== id));
      setFlash({ tone: "ok", text: what === "dismissed" ? "Sensor event dismissed from the stream." : "Alert resolved." });
      if (selectedId === id) setSelectedId(null);
      qc.invalidateQueries({ queryKey: ["live-alerts"] });
      qc.invalidateQueries({ queryKey: ["alerts-resolved-today"] });
      qc.invalidateQueries({ queryKey: ["alerts"] });
    },
    onError: e => setFlash({ tone: "error", text: `Could not resolve alert: ${(e as Error).message}` }),
  });

  /* ── Merge stream + initial ── */
  const allAlerts: LiveAlert[] = useMemo(() => [
    ...streamAlerts,
    ...initialAlerts.filter(a => !streamAlerts.some(s => s.id === a.id)),
  ].map(a => ({ ...a, devices: a.devices ?? (a.device_id && hostMap[a.device_id] ? { hostname: hostMap[a.device_id] } : null) })),
  [streamAlerts, initialAlerts, hostMap]);

  /* ── Stats ── */
  const openCount     = allAlerts.length;
  const criticalCount = allAlerts.filter(a => severityNum(a) >= 5).length;
  const highCount     = allAlerts.filter(a => severityNum(a) === 4).length;
  const mediumCount   = allAlerts.filter(a => severityNum(a) === 3).length;

  const { data: resolvedToday = 0 } = useQuery<number>({
    queryKey: ["alerts-resolved-today"],
    queryFn: async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const { count } = await supabase
        .from("alerts")
        .select("*", { count: "exact", head: true })
        .eq("resolved", true)
        .gte("resolved_at", today.toISOString());
      return count ?? 0;
    },
    refetchInterval: 30_000,
  });

  const rows = allAlerts.filter(a => !sev || sevKey(a) === sev);
  const selected = allAlerts.find(a => a.id === selectedId) ?? null;
  const hosts = [...new Set(allAlerts.map(a => a.devices?.hostname).filter(Boolean) as string[])].sort();
  const types = [...new Set(allAlerts.map(a => a.alert_type).filter(Boolean) as string[])].sort();

  const columns: Column<LiveAlert>[] = [
    { key: "severity", header: "Severity", width: "110px", value: a => 6 - severityNum(a),
      render: a => <SeverityBadge severity={sevKey(a)} /> },
    { key: "title", header: "Alert", value: a => titleOf(a), render: a => (
      <div className="min-w-0">
        <p className="font-medium truncate max-w-[460px] flex items-center gap-2" style={{ color: "var(--c-strong)" }}>
          {titleOf(a)} {a._live && <Badge tone="accent">New</Badge>}
        </p>
        <p className="text-[11.5px] truncate max-w-[460px]" style={{ color: "var(--c-muted)" }}>{a.message ?? a.cmdline ?? a.file_path ?? "—"}</p>
      </div>) },
    { key: "device", header: "Device", hideBelow: "md", value: a => a.devices?.hostname ?? a.device_id ?? "" },
    { key: "created_at", header: "Time", value: a => a.created_at ?? "",
      render: a => a.created_at ? <span title={new Date(a.created_at).toLocaleString()}>{timeAgo(a.created_at)}</span> : "—" },
    { key: "actions", header: "", sortable: false, align: "right", width: "110px", render: a => (
      <div onClick={e => e.stopPropagation()}>
        <Button size="sm" icon={Check} disabled={resolveMut.isPending} onClick={() => resolveMut.mutate(a.id)}>
          {a.id.startsWith("edr-") ? "Dismiss" : "Resolve"}
        </Button>
      </div>) },
  ];

  const filters: FilterDef<LiveAlert>[] = [
    { key: "device", label: "Device", options: hosts.map(h => ({ value: h, label: h })), get: a => a.devices?.hostname ?? "" },
    { key: "type", label: "Type", options: types.map(t => ({ value: t, label: t.replace(/_/g, " ") })), get: a => a.alert_type ?? "" },
  ];

  const sevTile = (key: string, label: string, n: number, tone: "critical" | "high" | "medium", Icon: typeof Flame) => (
    <StatTile label={label} icon={Icon} tone={tone} value={n} onClick={() => setSev(sev === key ? null : key)} active={sev === key} />
  );

  return (
    <div className="flex flex-col min-h-full">
      <TopBar title="Live Alerts" />
      <Page>
        <PageHeader
          title="Live Alerts"
          icon={Radio}
          crumbs={[{ label: "Detection & Response" }, { label: "Live Alerts" }]}
          description="Open alerts and high-severity sensor events, streamed in real time as endpoints report them."
          actions={<>
            <Badge tone={paused ? "medium" : "ok"} dot>{paused ? `Paused${held.length ? ` · ${held.length} waiting` : ""}` : "Live"}</Badge>
            {paused
              ? <Button icon={Play} onClick={resume}>Resume</Button>
              : <Button icon={Pause} onClick={() => setPaused(true)}>Pause stream</Button>}
          </>}
        />

        {flash && (
          <div role="status" className="mb-4 flex items-start gap-2 rounded-md border px-3 py-2 text-[13px]"
            style={{ borderColor: `color-mix(in srgb, ${flash.tone === "ok" ? "var(--ok)" : "var(--sev-critical)"} 40%, transparent)`,
              background: `color-mix(in srgb, ${flash.tone === "ok" ? "var(--ok)" : "var(--sev-critical)"} 10%, transparent)`, color: "var(--c-strong)" }}>
            {flash.tone === "ok" ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "var(--ok)" }} /> : <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "var(--sev-critical)" }} />}
            <span className="flex-1">{flash.text}</span>
            <button onClick={() => setFlash(null)} aria-label="Dismiss" style={{ color: "var(--c-muted)" }}><X className="w-3.5 h-3.5" /></button>
          </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
          <StatTile label="Open" icon={ShieldAlert} tone={openCount ? "high" : "ok"} value={openCount} onClick={() => setSev(null)} active={!sev} />
          {sevTile("critical", "Critical", criticalCount, "critical", Flame)}
          {sevTile("high", "High", highCount, "high", AlertTriangle)}
          {sevTile("medium", "Medium", mediumCount, "medium", AlertTriangle)}
          <StatTile label="Resolved today" icon={CheckCircle2} tone="ok" value={resolvedToday} />
        </div>

        <DataTable
          rows={rows}
          columns={columns}
          rowKey={a => a.id}
          loading={isLoading}
          filters={filters}
          searchPlaceholder="Search alerts, devices, commands…"
          searchText={a => [titleOf(a), a.message, a.devices?.hostname, a.cmdline, a.file_path, a.dst_ip, a.mitre_technique].join(" ")}
          initialSort={{ key: "created_at", dir: "desc" }}
          onRowClick={a => setSelectedId(a.id)}
          selectedKey={selectedId}
          exportName="live-alerts"
          rowTone={a => `var(--sev-${sevKey(a)})`}
          empty="No open alerts — all clear. New alerts appear here instantly."
          toolbar={sev ? <Badge tone="accent">Severity: {sev} <button onClick={() => setSev(null)} aria-label="Clear severity"><X className="w-3 h-3" /></button></Badge> : undefined}
        />
      </Page>

      <Drawer
        open={!!selected}
        onClose={() => setSelectedId(null)}
        title={selected ? titleOf(selected) : ""}
        subtitle={selected && <span className="flex items-center gap-2"><SeverityBadge severity={sevKey(selected)} /> {selected.devices?.hostname ?? selected.device_id ?? "Unknown device"}</span>}
        footer={selected && <>
          {selected.device_id && !selected.id.startsWith("edr-") && (
            <Button icon={Laptop} onClick={() => navigate(`/device/${selected.device_id}`)}>Open device</Button>
          )}
          <Button variant="primary" icon={Check} disabled={resolveMut.isPending} onClick={() => resolveMut.mutate(selected.id)}>
            {selected.id.startsWith("edr-") ? "Dismiss" : "Resolve"}
          </Button>
        </>}
      >
        {selected && (
          <div className="space-y-5">
            {selected.message && <p className="text-[13px] break-words" style={{ color: "var(--c-text)" }}>{selected.message}</p>}
            <KeyValue items={[
              { label: "Device", value: selected.device_id && !selected.id.startsWith("edr-")
                  ? <Link className="hover:underline" style={{ color: "var(--c-accent)" }} to={`/device/${selected.device_id}`}>{selected.devices?.hostname ?? selected.device_id}</Link>
                  : (selected.devices?.hostname ?? selected.device_id ?? "—") },
              { label: "Raised", value: selected.created_at ? new Date(selected.created_at).toLocaleString() : "—" },
              { label: "Source", value: selected.id.startsWith("edr-") ? "EDR sensor event" : "Detection engine alert" },
              { label: "Rule", value: <span className="font-mono text-[12px]">{selected.rule_id ?? "—"}</span> },
              { label: "MITRE ATT&CK", value: selected.mitre_technique
                  ? <a className="inline-flex items-center gap-1 font-mono hover:underline" style={{ color: "var(--c-accent)" }}
                      href={`https://attack.mitre.org/techniques/${selected.mitre_technique.replace(".", "/")}/`} target="_blank" rel="noreferrer">
                      {selected.mitre_technique} <ExternalLink className="w-3 h-3" />
                    </a> : "—" },
            ]} />
            {[["Command line", selected.cmdline], ["File path", selected.file_path], ["Destination IP", selected.dst_ip]].filter(([, v]) => v).map(([label, v]) => (
              <div key={label as string}>
                <h4 className="text-[11px] font-semibold uppercase tracking-[0.06em] mb-1.5" style={{ color: "var(--c-muted)" }}>{label}</h4>
                <pre className="rounded-md border px-3 py-2 font-mono text-[11.5px] whitespace-pre-wrap break-all"
                  style={{ borderColor: "var(--c-border)", background: "var(--c-card2)", color: "var(--c-strong)" }}>{v}</pre>
              </div>
            ))}
          </div>
        )}
      </Drawer>
    </div>
  );
}
