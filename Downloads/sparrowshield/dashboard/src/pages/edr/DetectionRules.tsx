import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ListChecks, Flame, AlertTriangle, Apple, Monitor, ExternalLink, Info, CheckCircle2 } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { timeAgo } from "../../lib/utils";
import TopBar from "../../components/layout/TopBar";
import {
  Page, PageHeader, StatTile, DataTable, SeverityBadge, Badge, Drawer, KeyValue,
  SEVERITY_ORDER, type Column, type FilterDef,
} from "../../components/ui";

interface Rule {
  rule_id: string;
  name: string;
  description: string;
  severity: string;
  mitre_id: string | null;
  mitre_technique: string | null;
  mitre_name: string | null;
  os_type: string | null;
  enabled: boolean;
  created_at: string;
}

interface AlertHit {
  id: string;
  alert_type: string;
  severity: string;
  message: string;
  resolved: boolean;
  created_at: string;
  device_id: string;
  devices: { hostname: string | null } | null;
}

const technique = (r: Rule) => r.mitre_id ?? r.mitre_technique ?? null;
const platform = (r: Rule) => (r.os_type === "mac" ? "macOS" : r.os_type === "windows" ? "Windows" : "All platforms");
const normSev = (s: string) => (s === "warning" ? "medium" : s);

export default function DetectionRules() {
  const [sev, setSev] = useState<string | null>(null);
  const [plat, setPlat] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: rules = [], isLoading, error } = useQuery<Rule[]>({
    queryKey: ["detection-rules"],
    queryFn: async () => {
      const { data, error: e } = await supabase.from("detection_rules").select("*").order("severity");
      if (e) throw e;
      return (data ?? []) as Rule[];
    },
  });

  // Detections per rule (alerts.alert_type is the rule_id prefix the agent raised).
  const { data: hits = [] } = useQuery<AlertHit[]>({
    queryKey: ["detection-rules-hits"],
    queryFn: async () => {
      const { data, error: e } = await supabase.from("alerts")
        .select("id, alert_type, severity, message, resolved, created_at, device_id, devices(hostname)")
        .order("created_at", { ascending: false }).limit(2000);
      if (e) throw e;
      return (data ?? []) as unknown as AlertHit[];
    },
    refetchInterval: 60_000,
  });

  const hitCount = useMemo(() => {
    const m: Record<string, { total: number; open: number }> = {};
    for (const h of hits) {
      const k = h.alert_type;
      m[k] ??= { total: 0, open: 0 };
      m[k].total++;
      if (!h.resolved) m[k].open++;
    }
    return m;
  }, [hits]);

  const rows = rules
    .filter(r => !sev || normSev(r.severity) === sev)
    .filter(r => !plat || (plat === "all" ? !r.os_type : r.os_type === plat));

  const selected = rules.find(r => r.rule_id === selectedId) ?? null;
  const selectedHits = selected ? hits.filter(h => h.alert_type === selected.rule_id) : [];

  const enabled = rules.filter(r => r.enabled).length;
  const countSev = (s: string) => rules.filter(r => normSev(r.severity) === s).length;
  const tactics = [...new Set(rules.map(r => r.mitre_name).filter(Boolean) as string[])].sort();

  const columns: Column<Rule>[] = [
    { key: "severity", header: "Severity", width: "110px", value: r => SEVERITY_ORDER[r.severity] ?? 9,
      render: r => <SeverityBadge severity={r.severity} /> },
    { key: "name", header: "Rule", value: r => r.name, render: r => (
      <div className="min-w-0">
        <p className="font-medium truncate max-w-[440px]" style={{ color: "var(--c-strong)" }}>{r.name}</p>
        <p className="text-[11.5px] truncate max-w-[440px]" style={{ color: "var(--c-muted)" }}>{r.description}</p>
      </div>) },
    { key: "mitre", header: "MITRE", value: r => technique(r) ?? "",
      render: r => technique(r) ? <Badge tone="accent" className="font-mono">{technique(r)}</Badge> : <span style={{ color: "var(--c-muted)" }}>—</span> },
    { key: "platform", header: "Platform", hideBelow: "md", value: r => platform(r) },
    { key: "hits", header: "Detections", align: "right", hideBelow: "md", value: r => hitCount[r.rule_id]?.total ?? 0,
      render: r => {
        const h = hitCount[r.rule_id];
        if (!h) return <span style={{ color: "var(--c-muted)" }}>0</span>;
        return <span className="tabular-nums">{h.total}{h.open > 0 && <Badge tone="high" className="ml-2">{h.open} open</Badge>}</span>;
      } },
    { key: "enabled", header: "Status", value: r => (r.enabled ? "Enabled" : "Disabled"),
      render: r => <Badge tone={r.enabled ? "ok" : "neutral"} dot>{r.enabled ? "Enabled" : "Disabled"}</Badge> },
    { key: "rule_id", header: "Rule ID", hideBelow: "xl", value: r => r.rule_id,
      render: r => <code className="text-[11.5px] font-mono" style={{ color: "var(--c-muted)" }}>{r.rule_id}</code> },
  ];

  const filters: FilterDef<Rule>[] = [
    { key: "status", label: "Status", options: [{ value: "Enabled", label: "Enabled" }, { value: "Disabled", label: "Disabled" }],
      get: r => (r.enabled ? "Enabled" : "Disabled") },
    { key: "tactic", label: "Technique", options: tactics.map(t => ({ value: t, label: t })), get: r => r.mitre_name ?? "" },
  ];

  return (
    <div className="flex flex-col min-h-full">
      <TopBar title="Detection Rules" />
      <Page>
        <PageHeader
          title="Detection Rules"
          icon={ListChecks}
          crumbs={[{ label: "Detection & Response" }, { label: "Detection Rules" }]}
          description="The rules the endpoint detection engine evaluates on every heartbeat, with their MITRE ATT&CK mapping and how often they have fired."
          actions={<Badge tone="ok" dot>{enabled} / {rules.length} enabled</Badge>}
        />

        {error && (
          <div className="mb-4 rounded-md border px-3 py-2 text-[13px]" style={{ borderColor: "var(--sev-critical)", color: "var(--c-strong)" }}>
            Could not load rules: {(error as Error).message}
          </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
          <StatTile label="Rules" icon={ListChecks} tone="accent" value={rules.length} sub={`${enabled} enabled`}
            onClick={() => { setSev(null); setPlat(null); }} active={!sev && !plat} />
          <StatTile label="Critical" icon={Flame} tone="critical" value={countSev("critical")}
            onClick={() => setSev(sev === "critical" ? null : "critical")} active={sev === "critical"} />
          <StatTile label="High" icon={AlertTriangle} tone="high" value={countSev("high")}
            onClick={() => setSev(sev === "high" ? null : "high")} active={sev === "high"} />
          <StatTile label="macOS-only" icon={Apple} tone="neutral" value={rules.filter(r => r.os_type === "mac").length}
            onClick={() => setPlat(plat === "mac" ? null : "mac")} active={plat === "mac"} />
          <StatTile label="Windows-only" icon={Monitor} tone="neutral" value={rules.filter(r => r.os_type === "windows").length}
            onClick={() => setPlat(plat === "windows" ? null : "windows")} active={plat === "windows"} />
        </div>

        <DataTable
          rows={rows}
          columns={columns}
          rowKey={r => r.rule_id}
          loading={isLoading}
          filters={filters}
          searchPlaceholder="Search rules, techniques, IDs…"
          searchText={r => [r.name, r.description, r.rule_id, technique(r), r.mitre_name].join(" ")}
          initialSort={{ key: "severity", dir: "asc" }}
          onRowClick={r => setSelectedId(r.rule_id)}
          selectedKey={selectedId}
          exportName="detection-rules"
          empty="No detection rules found."
          rowTone={r => `var(--sev-${normSev(r.severity) === "info" ? "info" : normSev(r.severity)})`}
        />
      </Page>

      <Drawer
        open={!!selected}
        onClose={() => setSelectedId(null)}
        title={selected?.name ?? ""}
        subtitle={selected && <span className="flex items-center gap-2"><SeverityBadge severity={selected.severity} /> <code className="font-mono">{selected.rule_id}</code></span>}
      >
        {selected && (
          <div className="space-y-6">
            <p className="text-[13px]" style={{ color: "var(--c-text)" }}>{selected.description}</p>
            <KeyValue items={[
              { label: "Status", value: <Badge tone={selected.enabled ? "ok" : "neutral"} dot>{selected.enabled ? "Enabled" : "Disabled"}</Badge> },
              { label: "Platform", value: platform(selected) },
              { label: "MITRE ATT&CK", value: technique(selected)
                  ? <a className="inline-flex items-center gap-1 font-mono hover:underline" style={{ color: "var(--c-accent)" }}
                      href={`https://attack.mitre.org/techniques/${technique(selected)!.replace(".", "/")}/`} target="_blank" rel="noreferrer">
                      {technique(selected)} <ExternalLink className="w-3 h-3" />
                    </a> : "—" },
              { label: "Technique", value: selected.mitre_name ?? "—" },
              { label: "Added", value: selected.created_at ? new Date(selected.created_at).toLocaleDateString() : "—" },
              { label: "Detections", value: `${selectedHits.length} total, ${selectedHits.filter(h => !h.resolved).length} open` },
            ]} />
            <div>
              <h4 className="text-[11px] font-semibold uppercase tracking-[0.06em] mb-2" style={{ color: "var(--c-muted)" }}>Recent detections from this rule</h4>
              {selectedHits.length === 0 ? (
                <p className="text-[12.5px] flex items-center gap-2" style={{ color: "var(--c-muted)" }}>
                  <CheckCircle2 className="w-3.5 h-3.5" style={{ color: "var(--ok)" }} /> This rule has not fired.
                </p>
              ) : (
                <ul className="space-y-2">
                  {selectedHits.slice(0, 10).map(h => (
                    <li key={h.id} className="rounded-md border px-3 py-2" style={{ borderColor: "var(--c-border)", background: "var(--c-card2)" }}>
                      <div className="flex items-center gap-2">
                        <Badge tone={h.resolved ? "ok" : "high"} dot>{h.resolved ? "Resolved" : "Open"}</Badge>
                        <Link to={`/device/${h.device_id}`} className="text-[12.5px] font-medium hover:underline truncate" style={{ color: "var(--c-strong)" }}>
                          {h.devices?.hostname ?? h.device_id}
                        </Link>
                        <span className="ml-auto text-[11px] shrink-0" style={{ color: "var(--c-muted)" }}>{timeAgo(h.created_at)}</span>
                      </div>
                      <p className="mt-1 text-[12px]" style={{ color: "var(--c-muted)" }}>{h.message}</p>
                    </li>
                  ))}
                </ul>
              )}
              {selectedHits.length > 0 && (
                <Link to="/alerts" className="mt-3 inline-flex items-center gap-1 text-[12px] hover:underline" style={{ color: "var(--c-accent)" }}>
                  <Info className="w-3.5 h-3.5" /> Manage these in Alerts
                </Link>
              )}
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
