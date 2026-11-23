import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BookOpen, CheckCircle2, Flame, History, ExternalLink, X } from "lucide-react";
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
  enabled: boolean;
}

const AV_RULE_IDS = [
  "crypto_miner_process", "malicious_app_installed", "tunneling_tool_detected",
  "shell_on_port", "suspicious_port", "high_cpu_non_system",
];
const technique = (r: Rule) => r.mitre_id ?? r.mitre_technique ?? null;
const normSev = (s: string) => (s === "warning" ? "medium" : s);

export default function Definitions() {
  const [onlyCritical, setOnlyCritical] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: rules = [], isLoading, error } = useQuery<Rule[]>({
    queryKey: ["av-definitions"],
    queryFn: async () => {
      const { data, error: e } = await supabase
        .from("detection_rules")
        .select("rule_id, name, description, severity, mitre_id, mitre_technique, mitre_name, enabled")
        .in("rule_id", AV_RULE_IDS)
        .order("severity");
      if (e) throw e;
      return (data ?? []) as Rule[];
    },
  });

  const { data: lastScan } = useQuery<{ scanned_at: string; hostname: string | null } | null>({
    queryKey: ["av-definitions-last-scan"],
    queryFn: async () => {
      const { data } = await supabase.from("av_scan_results").select("scanned_at, hostname")
        .order("scanned_at", { ascending: false }).limit(1);
      return (data?.[0] as { scanned_at: string; hostname: string | null }) ?? null;
    },
    refetchInterval: 60_000,
  });

  const { data: hits = {} } = useQuery<Record<string, number>>({
    queryKey: ["av-definitions-hits"],
    queryFn: async () => {
      const { data } = await supabase.from("alerts").select("alert_type").in("alert_type", AV_RULE_IDS).limit(5000);
      const m: Record<string, number> = {};
      for (const r of (data ?? []) as { alert_type: string }[]) m[r.alert_type] = (m[r.alert_type] ?? 0) + 1;
      return m;
    },
    refetchInterval: 60_000,
  });

  const active = rules.filter(r => r.enabled).length;
  const critical = rules.filter(r => r.severity === "critical").length;
  const rows = onlyCritical ? rules.filter(r => r.severity === "critical") : rules;
  const selected = rules.find(r => r.rule_id === selectedId) ?? null;

  const columns: Column<Rule>[] = [
    { key: "severity", header: "Severity", width: "110px", value: r => SEVERITY_ORDER[r.severity] ?? 9, render: r => <SeverityBadge severity={r.severity} /> },
    { key: "name", header: "Signature", value: r => r.name, render: r => (
      <div className="min-w-0">
        <p className="font-medium truncate max-w-[420px]" style={{ color: "var(--c-strong)" }}>{r.name}</p>
        <p className="text-[11.5px] truncate max-w-[420px]" style={{ color: "var(--c-muted)" }}>{r.description}</p>
      </div>) },
    { key: "mitre", header: "MITRE", hideBelow: "md", value: r => technique(r) ?? "",
      render: r => technique(r) ? <Badge tone="accent" className="font-mono">{technique(r)}</Badge> : <span style={{ color: "var(--c-muted)" }}>—</span> },
    { key: "hits", header: "Matches", align: "right", hideBelow: "md", value: r => hits[r.rule_id] ?? 0 },
    { key: "enabled", header: "Status", value: r => (r.enabled ? "Active" : "Disabled"),
      render: r => <Badge tone={r.enabled ? "ok" : "neutral"} dot>{r.enabled ? "Active" : "Disabled"}</Badge> },
    { key: "rule_id", header: "ID", hideBelow: "lg", value: r => r.rule_id,
      render: r => <code className="text-[11.5px] font-mono" style={{ color: "var(--c-muted)" }}>{r.rule_id}</code> },
  ];

  const filters: FilterDef<Rule>[] = [
    { key: "status", label: "Status", options: [{ value: "Active", label: "Active" }, { value: "Disabled", label: "Disabled" }], get: r => (r.enabled ? "Active" : "Disabled") },
  ];

  return (
    <div className="flex flex-col min-h-full">
      <TopBar title="AV Definitions" />
      <Page>
        <PageHeader
          title="AV Definitions"
          icon={BookOpen}
          crumbs={[{ label: "Antivirus" }, { label: "Definitions" }]}
          description="Behavioural threat signatures used by the antivirus engine. File-hash signatures (ClamAV, MalwareBazaar, VirusTotal) are refreshed by each agent automatically."
        />

        {error && (
          <div className="mb-4 rounded-md border px-3 py-2 text-[13px]" style={{ borderColor: "var(--sev-critical)", color: "var(--c-strong)" }}>
            Could not load definitions: {(error as Error).message}
          </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <StatTile label="Signatures" icon={BookOpen} tone="accent" value={rules.length} onClick={() => setOnlyCritical(false)} active={!onlyCritical} />
          <StatTile label="Active" icon={CheckCircle2} tone="ok" value={active} sub={`${rules.length - active} disabled`} />
          <StatTile label="Critical" icon={Flame} tone="critical" value={critical} onClick={() => setOnlyCritical(v => !v)} active={onlyCritical} />
          <StatTile label="Last engine run" icon={History} tone={lastScan ? "ok" : "neutral"}
            value={<span className="text-[18px]">{lastScan ? timeAgo(lastScan.scanned_at) : "Never"}</span>}
            sub={lastScan?.hostname ?? "No scans reported"} />
        </div>

        <DataTable
          rows={rows}
          columns={columns}
          rowKey={r => r.rule_id}
          loading={isLoading}
          filters={filters}
          searchPlaceholder="Search signatures…"
          searchText={r => [r.name, r.description, r.rule_id, technique(r)].join(" ")}
          initialSort={{ key: "severity", dir: "asc" }}
          onRowClick={r => setSelectedId(r.rule_id)}
          selectedKey={selectedId}
          exportName="av-definitions"
          empty="No AV definitions found."
          rowTone={r => `var(--sev-${normSev(r.severity) === "info" ? "info" : normSev(r.severity)})`}
          toolbar={onlyCritical ? <Badge tone="accent">Critical only <button onClick={() => setOnlyCritical(false)} aria-label="Clear"><X className="w-3 h-3" /></button></Badge> : undefined}
        />
      </Page>

      <Drawer open={!!selected} onClose={() => setSelectedId(null)} title={selected?.name ?? ""}
        subtitle={selected && <span className="flex items-center gap-2"><SeverityBadge severity={selected.severity} /> <code className="font-mono">{selected.rule_id}</code></span>}>
        {selected && (
          <div className="space-y-5">
            <p className="text-[13px]" style={{ color: "var(--c-text)" }}>{selected.description}</p>
            <KeyValue items={[
              { label: "Status", value: <Badge tone={selected.enabled ? "ok" : "neutral"} dot>{selected.enabled ? "Active" : "Disabled"}</Badge> },
              { label: "Matches", value: hits[selected.rule_id] ?? 0 },
              { label: "MITRE ATT&CK", value: technique(selected)
                  ? <a className="inline-flex items-center gap-1 font-mono hover:underline" style={{ color: "var(--c-accent)" }}
                      href={`https://attack.mitre.org/techniques/${technique(selected)!.replace(".", "/")}/`} target="_blank" rel="noreferrer">
                      {technique(selected)} <ExternalLink className="w-3 h-3" />
                    </a> : "—" },
              { label: "Technique", value: selected.mitre_name ?? "—" },
            ]} />
          </div>
        )}
      </Drawer>
    </div>
  );
}
