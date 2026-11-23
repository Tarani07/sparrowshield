import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Radar, CheckCircle2, Cpu, Crosshair, ExternalLink } from "lucide-react";
import { supabase } from "../lib/supabase";
import { timeAgo } from "../lib/utils";
import { useAuth } from "../lib/AuthContext";
import TopBar from "../components/layout/TopBar";
import { Page, PageHeader, StatTile, DataTable, Badge, Drawer, KeyValue, SeverityBadge, SEVERITY_ORDER, type Column, type FilterDef } from "../components/ui";

type Analytic = {
  id: string; source_ref: string | null; name: string; category: string; description: string | null; method: string;
  definition: Record<string, unknown>; severity: string; mitre: string | null; enabled: boolean; requires_es: boolean;
};
type Hit = { id: string; description: string; created_at: string; hostname: string | null; details: Record<string, unknown> | null };

const METHOD: Record<string, string> = {
  cmdline: "Command line", parent_child: "Process lineage", process: "Process", listen: "Network listener",
  persistence: "Persistence monitor", file_scan: "File scan", log: "Unified log", config: "Configuration",
  malware: "Malware signatures & IOCs", es_sensor: "Endpoint Security sensor", builtin: "Built-in sensor",
};
const CATEGORY_ORDER = ["Living Off the Land", "Privilege Escalation", "Known Malicious File", "Common Attacker Technique",
  "System Tampering", "Exploitation", "Credential Harvesting", "System Visibility", "Evasion", "Persistence", "Apple Security"];

function explain(a: Analytic): string {
  const d = a.definition as Record<string, any>;
  switch (a.method) {
    case "cmdline": return "Flags any running process whose command line matches one of the patterns below. Checked every 30 seconds.";
    case "parent_child": return `Flags a child process matching “${d.children}” started by a parent matching “${d.parents}”.`;
    case "process": return d.check === "exe_deleted" ? "Flags a process that keeps running after its own executable was deleted."
      : `Flags processes${d.name ? ` named /${d.name}/` : ""}${d.exe ? ` running from /${d.exe}/` : ""}${d.exe_not ? ` outside /${d.exe_not}/` : ""}.`;
    case "listen": return `Flags ${d.process} listening on any port other than ${(d.allowed_ports ?? []).join(", ")}.`;
    case "persistence": return d.check === "new" ? `Learns what is already in ${(d.paths ?? []).join(", ")} and alerts on anything new (${d.glob}).`
      : d.check === "changed" ? `Alerts when items in ${(d.paths ?? []).join(", ")} are added or modified.`
      : d.check === "disguised" ? `Alerts when a ${d.glob} launch item runs a program outside the vendor's expected locations.`
      : d.check === "hidden_target" ? "Alerts when a launch item runs a binary from a hidden (dot) path."
      : d.check === "dyld_insert" ? "Alerts when a launch item injects a library with DYLD_INSERT_LIBRARIES." : "Persistence check.";
    case "file_scan": return `Scans ${(d.paths ?? []).join(", ")} for ${String(d.check).replace(/_/g, " ")}${d.max_age_minutes ? ` (files from the last ${d.max_age_minutes} min)` : ""}. Every 5 minutes.`;
    case "log": return `Searches the macOS unified log (${d.predicate}) every 5 minutes for /${d.regex}/.`;
    case "config": return {
      jamf_url_insecure: "Alerts if the Jamf Pro server URL uses plain HTTP.",
      jamf_url_changed: "Learns the Jamf Pro server URL and alerts if it changes.",
      jamf_binary_changed: "Learns the Jamf binary's fingerprint and alerts if it changes or is removed.",
      proxy_localhost: "Alerts if an HTTP, HTTPS or SOCKS proxy is set to this computer (traffic interception).",
      login_hook: "Alerts if a LoginHook is configured.",
    }[d.check as string] ?? "Configuration check.";
    case "malware": return `Matches malware-engine detections named ${(d.keywords ?? []).join(" / ")}${(d.paths ?? []).length ? `, and known indicator files (${d.paths.length})` : ""}${(d.apps ?? []).length ? `, and the app(s) ${d.apps.join(", ")}` : ""}.`;
    case "es_sensor": return "Needs the Endpoint Security sensor (kernel-level events). Listed for coverage; not evaluated until the sensor is deployed.";
    case "builtin": return "Reported by the agent's built-in USB monitor.";
    default: return "";
  }
}

export default function Analytics() {
  const qc = useQueryClient();
  const { isAdmin } = useAuth();
  const [selected, setSelected] = useState<Analytic | null>(null);
  const [category, setCategory] = useState<string | null>(null);

  const { data: analytics = [], isLoading } = useQuery<Analytic[]>({
    queryKey: ["analytics"],
    queryFn: async () => (await supabase.from("analytics").select("*").order("name")).data as Analytic[] ?? [],
  });
  const since = useMemo(() => new Date(Date.now() - 30 * 86400_000).toISOString(), []);
  const { data: hitCounts = {} } = useQuery<Record<string, { n: number; last: string }>>({
    queryKey: ["analytics-hits"],
    queryFn: async () => {
      const { data } = await supabase.from("alerts").select("rule_id, created_at").like("rule_id", "analytic:%").gte("created_at", since).limit(5000);
      const out: Record<string, { n: number; last: string }> = {};
      for (const r of data ?? []) {
        const id = String(r.rule_id).slice(9);
        out[id] = { n: (out[id]?.n ?? 0) + 1, last: out[id]?.last && out[id].last > r.created_at ? out[id].last : r.created_at };
      }
      return out;
    },
    refetchInterval: 60_000,
  });
  const { data: hits = [] } = useQuery<Hit[]>({
    queryKey: ["analytic-events", selected?.id],
    enabled: !!selected,
    queryFn: async () => (await supabase.from("security_events").select("id, description, created_at, hostname, details")
      .eq("event_type", "analytic").contains("details", { rule_id: selected!.id }).order("created_at", { ascending: false }).limit(20)).data as Hit[] ?? [],
  });

  const toggle = useMutation({
    mutationFn: async (a: Analytic) => {
      const { error } = await supabase.from("analytics").update({ enabled: !a.enabled, updated_at: new Date().toISOString() }).eq("id", a.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["analytics"] }),
  });

  const byCat = CATEGORY_ORDER.map(c => {
    const list = analytics.filter(a => a.category === c);
    return { c, total: list.length, on: list.filter(a => a.enabled).length };
  }).filter(x => x.total);
  const detections = Object.values(hitCounts).reduce((s, h) => s + h.n, 0);
  const rows = analytics.filter(a => !category || a.category === category);

  const Switch = ({ a }: { a: Analytic }) => (
    <button role="switch" aria-checked={a.enabled} aria-label={`Enable ${a.name}`} disabled={!isAdmin || toggle.isPending}
      onClick={e => { e.stopPropagation(); toggle.mutate(a); }}
      className="relative w-9 h-5 rounded-full transition-colors disabled:opacity-50"
      style={{ background: a.enabled ? "var(--c-accent)" : "var(--c-border2)" }}>
      <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all" style={{ left: a.enabled ? 18 : 2 }} />
    </button>
  );

  const columns: Column<Analytic>[] = [
    { key: "name", header: "Analytic", render: a => (
      <div className="min-w-0">
        <p className="font-medium truncate max-w-[360px]" style={{ color: "var(--c-strong)" }}>{a.name}</p>
        <p className="text-[11.5px] truncate max-w-[360px]" style={{ color: "var(--c-muted)" }}>{a.description}</p>
      </div>) },
    { key: "category", header: "Category", hideBelow: "lg" },
    { key: "severity", header: "Severity", value: a => SEVERITY_ORDER[a.severity] ?? 9, render: a => <SeverityBadge severity={a.severity} /> },
    { key: "mitre", header: "MITRE", hideBelow: "md", render: a => a.mitre ? <Badge tone="accent" className="font-mono">{a.mitre}</Badge> : <span style={{ color: "var(--c-muted)" }}>—</span> },
    { key: "method", header: "Detection", hideBelow: "xl", value: a => METHOD[a.method] ?? a.method },
    { key: "hits", header: "Hits (30d)", align: "right", value: a => hitCounts[a.id]?.n ?? 0,
      render: a => hitCounts[a.id] ? <span className="font-semibold tabular-nums" style={{ color: "var(--sev-high)" }}>{hitCounts[a.id].n}</span> : <span style={{ color: "var(--c-muted)" }}>0</span> },
    { key: "enabled", header: "Status", value: a => (a.requires_es ? 2 : a.enabled ? 0 : 1), render: a => (
      <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
        {a.requires_es ? <Badge tone="neutral">Needs ES sensor</Badge> : <Switch a={a} />}
      </div>) },
  ];
  const filters: FilterDef<Analytic>[] = [
    { key: "status", label: "Status", options: [{ value: "on", label: "Enabled" }, { value: "off", label: "Disabled" }, { value: "es", label: "Needs ES sensor" }],
      get: a => (a.requires_es ? "es" : a.enabled ? "on" : "off") },
    { key: "severity", label: "Severity", options: ["critical", "high", "medium", "low"].map(s => ({ value: s, label: s[0].toUpperCase() + s.slice(1) })), get: a => a.severity },
    { key: "method", label: "Detection", options: Object.entries(METHOD).map(([v, l]) => ({ value: v, label: l })), get: a => a.method },
  ];

  return (
    <div className="flex flex-col min-h-full">
      <TopBar title="Detection Analytics" />
      <Page>
        <PageHeader
          title="Detection Analytics"
          icon={Radar}
          crumbs={[{ label: "Detection & Response" }, { label: "Analytics" }]}
          description="The behaviours SparrowShield watches for on every Mac — reverse shells, persistence, privilege escalation, known malware, tampering and more. Each match raises an alert tagged with its MITRE ATT&CK technique."
        />

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <StatTile label="Analytics" icon={Radar} value={analytics.length} onClick={() => setCategory(null)} active={!category} />
          <StatTile label="Enabled" icon={CheckCircle2} tone="ok" value={analytics.filter(a => a.enabled && !a.requires_es).length} />
          <StatTile label="Need ES sensor" icon={Cpu} value={analytics.filter(a => a.requires_es).length} sub="Listed, not yet evaluated" />
          <StatTile label="Detections (30d)" icon={Crosshair} tone={detections ? "high" : "ok"} value={detections} />
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          {byCat.map(({ c, total, on }) => (
            <button key={c} onClick={() => setCategory(category === c ? null : c)}
              className="h-8 px-3 rounded-md border text-[12.5px] font-medium inline-flex items-center gap-2"
              style={category === c
                ? { background: "var(--c-accent-bg)", borderColor: "var(--c-accent)", color: "var(--c-accent)" }
                : { background: "var(--c-card2)", borderColor: "var(--c-border2)", color: "var(--c-text)" }}>
              {c} <span className="tabular-nums text-[11.5px]" style={{ color: "var(--c-muted)" }}>{on}/{total}</span>
            </button>
          ))}
        </div>

        <DataTable rows={rows} columns={columns} rowKey={a => a.id} loading={isLoading} filters={filters} pageSize={50}
          searchPlaceholder="Search analytics, MITRE technique…" searchText={a => [a.name, a.description, a.category, a.mitre].join(" ")}
          initialSort={{ key: "severity", dir: "asc" }} onRowClick={setSelected} selectedKey={selected?.id ?? null} exportName="analytics" />
      </Page>

      <Drawer open={!!selected} onClose={() => setSelected(null)} title={selected?.name ?? ""} width={600}
        subtitle={selected && <span className="flex items-center gap-2"><SeverityBadge severity={selected.severity} />{selected.category}</span>}>
        {selected && (
          <div className="space-y-6">
            <KeyValue items={[
              { label: "What it detects", value: selected.description },
              { label: "Status", value: selected.requires_es ? <Badge tone="neutral">Needs Endpoint Security sensor</Badge>
                : <span className="inline-flex items-center gap-2"><Switch a={selected} /> {selected.enabled ? "Enabled" : "Disabled"}</span> },
              { label: "Detection method", value: METHOD[selected.method] ?? selected.method },
              { label: "MITRE ATT&CK", value: selected.mitre ? <a href={`https://attack.mitre.org/techniques/${selected.mitre.replace(".", "/")}/`} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1 font-mono hover:underline" style={{ color: "var(--c-accent)" }}>{selected.mitre} <ExternalLink className="w-3 h-3" /></a> : "—" },
              { label: "Hits (30 days)", value: hitCounts[selected.id] ? `${hitCounts[selected.id].n} · last ${timeAgo(hitCounts[selected.id].last)}` : "None" },
            ]} />
            <div>
              <h4 className="text-[11px] font-semibold uppercase tracking-[0.06em] mb-2" style={{ color: "var(--c-muted)" }}>How it works</h4>
              <p className="text-[13px]" style={{ color: "var(--c-text)" }}>{explain(selected)}</p>
              {Array.isArray((selected.definition as { patterns?: string[] }).patterns) && (
                <ul className="mt-2 space-y-1">
                  {((selected.definition as { patterns: string[] }).patterns).map(p => (
                    <li key={p}><code className="block text-[11.5px] font-mono rounded px-2 py-1 break-all" style={{ background: "var(--c-card2)", color: "var(--c-strong)" }}>{p}</code></li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h4 className="text-[11px] font-semibold uppercase tracking-[0.06em] mb-2" style={{ color: "var(--c-muted)" }}>Recent detections</h4>
              {hits.length === 0 ? <p className="text-[12.5px]" style={{ color: "var(--c-muted)" }}>No detections yet.</p> : (
                <ul className="space-y-2">
                  {hits.map(h => (
                    <li key={h.id} className="rounded-md border p-2.5" style={{ borderColor: "var(--c-border)", background: "var(--c-card2)" }}>
                      <p className="text-[12.5px] break-words" style={{ color: "var(--c-strong)" }}>{h.description}</p>
                      <p className="text-[11px]" style={{ color: "var(--c-muted)" }}>{h.hostname ?? "—"} · {timeAgo(h.created_at)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {selected.source_ref && <p className="text-[11px]" style={{ color: "var(--c-muted)" }}>Mirrors Jamf Protect analytic {selected.source_ref}</p>}
          </div>
        )}
      </Drawer>
    </div>
  );
}
