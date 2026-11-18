import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ShieldAlert, Flame, AlertTriangle, Info, CheckCircle2, ExternalLink, RotateCcw, Check, X, Laptop } from "lucide-react";
import { supabase } from "../lib/supabase";
import { timeAgo } from "../lib/utils";
import TopBar from "../components/layout/TopBar";
import {
  Page, PageHeader, Panel, StatTile, DataTable, SeverityBadge, Badge, Button, Drawer, KeyValue, Tabs,
  SEVERITY_ORDER, type Column, type FilterDef,
} from "../components/ui";

type AlertRow = {
  id: string; device_id: string; alert_type: string; severity: string; message: string; resolved: boolean;
  created_at: string; resolved_at: string | null; mitre_technique: string | null; rule_id: string | null;
  threat_score: number | null; devices: { hostname: string } | null;
};
type PendingCommand = { id: string; device_id: string; command_type: string; payload: Record<string, unknown>; created_at: string; devices?: { hostname: string } };
type SecEvent = { id: string; event_type: string; severity: string; description: string; created_at: string };

const TYPE_LABELS: Record<string, string> = {
  blocked_app: "Blocked application", malware: "Malware", policy: "Process policy", firewall_disabled: "Firewall disabled",
  device_offline: "Device offline", low_battery: "Low battery", encryption_disabled: "Encryption off",
  high_cpu: "High CPU", high_ram: "High memory", disk_full: "Disk full", c2_connection: "C2 connection",
};
const typeLabel = (t: string) => TYPE_LABELS[t] ?? t.replace(/_/g, " ").replace(/^\w/, c => c.toUpperCase());
const normSev = (s: string) => (s === "warning" ? "medium" : s);

export default function AlertCenter() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<"open" | "resolved" | "all">("open");
  const [sev, setSev] = useState<string | null>(params.get("severity"));
  const [selectedId, setSelectedId] = useState<string | null>(params.get("id"));

  const { data: alerts = [], isLoading } = useQuery<AlertRow[]>({
    queryKey: ["alerts", "center"],
    queryFn: async () => {
      const { data, error } = await supabase.from("alerts")
        .select("id, device_id, alert_type, severity, message, resolved, created_at, resolved_at, mitre_technique, rule_id, threat_score, devices(hostname)")
        .order("created_at", { ascending: false }).limit(2000);
      if (error) throw error;
      return (data ?? []) as unknown as AlertRow[];
    },
    refetchInterval: 20_000,
  });

  const { data: pending = [] } = useQuery<PendingCommand[]>({
    queryKey: ["pending-approvals"],
    queryFn: async () => (await supabase.from("device_commands")
      .select("id, device_id, command_type, payload, created_at, devices(hostname)")
      .eq("status", "awaiting_approval").order("created_at", { ascending: false })).data as unknown as PendingCommand[] ?? [],
    refetchInterval: 30_000,
  });

  const setResolved = useMutation({
    mutationFn: async ({ id, resolved }: { id: string; resolved: boolean }) => {
      const { error } = await supabase.from("alerts")
        .update({ resolved, resolved_at: resolved ? new Date().toISOString() : null }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["alerts"] }); qc.invalidateQueries({ queryKey: ["open-alert-count"] }); },
  });

  const decide = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: "approve" | "dismiss" }) => {
      const { error } = await supabase.functions.invoke("approve-command", { body: { command_id: id, action } });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pending-approvals"] }),
  });

  // keep URL in sync so links like /alerts?severity=high work and are shareable
  useEffect(() => {
    const next = new URLSearchParams();
    if (sev) next.set("severity", sev);
    if (selectedId) next.set("id", selectedId);
    setParams(next, { replace: true });
  }, [sev, selectedId, setParams]);

  const open = alerts.filter(a => !a.resolved);
  const count = (s: string) => open.filter(a => normSev(a.severity) === s).length;
  const resolved30 = alerts.filter(a => a.resolved && a.resolved_at && Date.now() - new Date(a.resolved_at).getTime() < 30 * 86400_000).length;

  const rows = useMemo(() => alerts
    .filter(a => (tab === "open" ? !a.resolved : tab === "resolved" ? a.resolved : true))
    .filter(a => !sev || normSev(a.severity) === sev), [alerts, tab, sev]);

  const selected = alerts.find(a => a.id === selectedId) ?? null;

  const { data: related = [] } = useQuery<SecEvent[]>({
    queryKey: ["alert-related", selected?.device_id],
    enabled: !!selected,
    queryFn: async () => (await supabase.from("security_events")
      .select("id, event_type, severity, description, created_at")
      .eq("device_id", selected!.device_id).order("created_at", { ascending: false }).limit(8)).data as SecEvent[] ?? [],
  });

  const types = [...new Set(alerts.map(a => a.alert_type))].sort();
  const hosts = [...new Set(alerts.map(a => a.devices?.hostname).filter(Boolean) as string[])].sort();

  const columns: Column<AlertRow>[] = [
    { key: "severity", header: "Severity", width: "110px", value: a => SEVERITY_ORDER[a.severity] ?? 9,
      render: a => <SeverityBadge severity={a.severity} /> },
    { key: "message", header: "Detection", value: a => a.message, render: a => (
      <div className="min-w-0">
        <p className="truncate max-w-[520px] font-medium" style={{ color: "var(--c-strong)" }}>{a.message}</p>
        <p className="text-[11.5px]" style={{ color: "var(--c-muted)" }}>{typeLabel(a.alert_type)}</p>
      </div>) },
    { key: "device", header: "Device", hideBelow: "md", value: a => a.devices?.hostname ?? "",
      render: a => <span className="truncate max-w-[200px] inline-block align-middle">{a.devices?.hostname ?? "—"}</span> },
    { key: "mitre_technique", header: "MITRE", hideBelow: "lg", value: a => a.mitre_technique ?? "",
      render: a => a.mitre_technique ? <Badge tone="accent" className="font-mono">{a.mitre_technique}</Badge> : <span style={{ color: "var(--c-muted)" }}>—</span> },
    { key: "created_at", header: "Detected", value: a => a.created_at,
      render: a => <span title={new Date(a.created_at).toLocaleString()}>{timeAgo(a.created_at)}</span> },
    { key: "status", header: "Status", value: a => (a.resolved ? "Resolved" : "Open"),
      render: a => <Badge tone={a.resolved ? "ok" : "high"} dot>{a.resolved ? "Resolved" : "Open"}</Badge> },
    { key: "actions", header: "", sortable: false, align: "right", width: "110px", render: a => (
      <div onClick={e => e.stopPropagation()}>
        {a.resolved
          ? <Button size="sm" variant="ghost" icon={RotateCcw} onClick={() => setResolved.mutate({ id: a.id, resolved: false })}>Reopen</Button>
          : <Button size="sm" icon={Check} onClick={() => setResolved.mutate({ id: a.id, resolved: true })}>Resolve</Button>}
      </div>) },
  ];

  const filters: FilterDef<AlertRow>[] = [
    { key: "type", label: "Type", options: types.map(t => ({ value: t, label: typeLabel(t) })), get: a => a.alert_type },
    { key: "device", label: "Device", options: hosts.map(h => ({ value: h, label: h })), get: a => a.devices?.hostname ?? "" },
  ];

  const sevTile = (key: string, label: string, tone: "critical" | "high" | "medium" | "low", Icon: typeof Flame) => (
    <StatTile label={label} icon={Icon} tone={tone} value={key === "medium" ? count("medium") : key === "low" ? count("low") + count("info") : count(key)}
      onClick={() => { setTab("open"); setSev(sev === key ? null : key); }} active={sev === key} />
  );

  return (
    <div className="flex flex-col min-h-full">
      <TopBar title="Alerts" />
      <Page>
        <PageHeader
          title="Alerts"
          crumbs={[{ label: "Detection & Response" }, { label: "Alerts" }]}
          description="Every detection raised by your endpoints, prioritised by severity. Click an alert for details and response actions."
        />

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
          <StatTile label="Open" icon={ShieldAlert} tone={open.length ? "high" : "ok"} value={open.length}
            onClick={() => { setTab("open"); setSev(null); }} active={tab === "open" && !sev} />
          {sevTile("critical", "Critical", "critical", Flame)}
          {sevTile("high", "High", "high", AlertTriangle)}
          {sevTile("medium", "Medium", "medium", AlertTriangle)}
          <StatTile label="Resolved (30d)" icon={CheckCircle2} tone="ok" value={resolved30}
            onClick={() => { setTab("resolved"); setSev(null); }} active={tab === "resolved"} />
        </div>

        {pending.length > 0 && (
          <Panel title={`Awaiting approval (${pending.length})`} subtitle="Automated remediations that need an admin decision" className="mb-4" noPad>
            <ul>
              {pending.map(c => (
                <li key={c.id} className="flex items-center gap-3 px-4 h-12 border-b" style={{ borderColor: "var(--c-divider)" }}>
                  <Badge tone="medium">{c.command_type.replace(/_/g, " ")}</Badge>
                  <Link to={`/device/${c.device_id}`} className="text-[13px] font-medium hover:underline" style={{ color: "var(--c-strong)" }}>
                    {c.devices?.hostname ?? c.device_id}
                  </Link>
                  <span className="flex-1 text-[12px] truncate" style={{ color: "var(--c-muted)" }}>
                    {Object.entries(c.payload ?? {}).map(([k, v]) => `${k}: ${String(v)}`).join(" · ")}
                  </span>
                  <span className="text-[12px]" style={{ color: "var(--c-muted)" }}>{timeAgo(c.created_at)}</span>
                  <Button size="sm" variant="primary" icon={Check} disabled={decide.isPending} onClick={() => decide.mutate({ id: c.id, action: "approve" })}>Approve</Button>
                  <Button size="sm" icon={X} disabled={decide.isPending} onClick={() => decide.mutate({ id: c.id, action: "dismiss" })}>Dismiss</Button>
                </li>
              ))}
            </ul>
            {decide.isError && <p className="px-4 py-2 text-[12px]" style={{ color: "var(--sev-critical)" }}>Action failed: {(decide.error as Error).message}</p>}
          </Panel>
        )}

        <div className="mb-3">
          <Tabs
            value={tab}
            onChange={t => setTab(t)}
            tabs={[
              { id: "open", label: "Open", count: open.length },
              { id: "resolved", label: "Resolved", count: alerts.length - open.length },
              { id: "all", label: "All", count: alerts.length },
            ]}
          />
        </div>

        <DataTable
          rows={rows}
          columns={columns}
          rowKey={a => a.id}
          loading={isLoading}
          filters={filters}
          searchPlaceholder="Search detections, devices, rules…"
          searchText={a => [a.message, a.alert_type, a.devices?.hostname, a.mitre_technique, a.rule_id].join(" ")}
          initialSort={{ key: "severity", dir: "asc" }}
          onRowClick={a => setSelectedId(a.id)}
          selectedKey={selectedId}
          exportName="alerts"
          empty={tab === "open" ? "No open alerts — all clear." : "No alerts."}
          rowTone={a => (a.resolved ? undefined : `var(--sev-${normSev(a.severity) === "info" ? "info" : normSev(a.severity)})`)}
          toolbar={sev ? <Badge tone="accent">Severity: {sev} <button onClick={() => setSev(null)} aria-label="Clear severity"><X className="w-3 h-3" /></button></Badge> : undefined}
        />
      </Page>

      <Drawer
        open={!!selected}
        onClose={() => setSelectedId(null)}
        title={selected?.message ?? ""}
        subtitle={selected && <span className="flex items-center gap-2"><SeverityBadge severity={selected.severity} /> {typeLabel(selected.alert_type)}</span>}
        footer={selected && <>
          <Button icon={Laptop} onClick={() => navigate(`/device/${selected.device_id}`)}>Open device</Button>
          {selected.resolved
            ? <Button icon={RotateCcw} onClick={() => setResolved.mutate({ id: selected.id, resolved: false })}>Reopen</Button>
            : <Button variant="primary" icon={Check} onClick={() => setResolved.mutate({ id: selected.id, resolved: true })}>Resolve</Button>}
        </>}
      >
        {selected && (
          <div className="space-y-6">
            <KeyValue items={[
              { label: "Status", value: <Badge tone={selected.resolved ? "ok" : "high"} dot>{selected.resolved ? "Resolved" : "Open"}</Badge> },
              { label: "Device", value: <Link className="hover:underline" style={{ color: "var(--c-accent)" }} to={`/device/${selected.device_id}`}>{selected.devices?.hostname ?? selected.device_id}</Link> },
              { label: "Detected", value: new Date(selected.created_at).toLocaleString() },
              { label: "Resolved", value: selected.resolved_at ? new Date(selected.resolved_at).toLocaleString() : "—" },
              { label: "Rule", value: <span className="font-mono text-[12px]">{selected.rule_id ?? "—"}</span> },
              { label: "MITRE ATT&CK", value: selected.mitre_technique
                  ? <a className="inline-flex items-center gap-1 font-mono hover:underline" style={{ color: "var(--c-accent)" }}
                      href={`https://attack.mitre.org/techniques/${selected.mitre_technique.replace(".", "/")}/`} target="_blank" rel="noreferrer">
                      {selected.mitre_technique} <ExternalLink className="w-3 h-3" />
                    </a> : "—" },
              ...(selected.threat_score != null ? [{ label: "Threat score", value: String(selected.threat_score) }] : []),
            ]} />
            <div>
              <h4 className="text-[11px] font-semibold uppercase tracking-[0.06em] mb-2" style={{ color: "var(--c-muted)" }}>Recent activity on this device</h4>
              {related.length === 0 ? (
                <p className="text-[12.5px] flex items-center gap-2" style={{ color: "var(--c-muted)" }}><Info className="w-3.5 h-3.5" /> No recent security events.</p>
              ) : (
                <ol className="relative border-l pl-4 space-y-3" style={{ borderColor: "var(--c-border2)" }}>
                  {related.map(e => (
                    <li key={e.id} className="relative">
                      <span className="absolute -left-[21px] top-1.5 w-2 h-2 rounded-full" style={{ background: "var(--c-accent)" }} />
                      <p className="text-[12.5px]" style={{ color: "var(--c-strong)" }}>{e.description}</p>
                      <p className="text-[11px]" style={{ color: "var(--c-muted)" }}>{e.event_type.replace(/_/g, " ")} · {timeAgo(e.created_at)}</p>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
