import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ScrollText, PlusCircle, Pencil, Trash2, Users } from "lucide-react";
import { supabase } from "../lib/supabase";
import { timeAgo } from "../lib/utils";
import TopBar from "../components/layout/TopBar";
import { Page, PageHeader, StatTile, DataTable, Badge, Drawer, KeyValue, type Column, type FilterDef } from "../components/ui";

type Entry = {
  id: number; at: string; actor_email: string | null; action: "INSERT" | "UPDATE" | "DELETE";
  table_name: string; record_id: string | null; summary: string | null; changes: Record<string, unknown> | null;
};

// Plain-language names for what was changed.
const AREA: Record<string, string> = {
  software_lists: "Application rule", web_filter_rules: "Web rule", web_categories: "Web category",
  block_rules: "Process policy", device_groups: "Device group", device_group_members: "Group membership",
  it_notices: "IT notice", device_commands: "Device action", alerts: "Alert", devices: "Device",
  config: "Setting", console_users: "User access", compliance_frameworks: "Compliance framework",
  compliance_controls: "Compliance control", remediation_rules: "Remediation rule",
  software_violations: "App violation", vulnerabilities: "Vulnerability", report_schedules: "Report schedule",
};
const VERB: Record<string, string> = { INSERT: "Created", UPDATE: "Changed", DELETE: "Deleted" };
const TONE = { INSERT: "ok", UPDATE: "accent", DELETE: "critical" } as const;
const area = (t: string) => AREA[t] ?? t.replace(/_/g, " ");

function describe(e: Entry): string {
  if (e.table_name === "device_commands" && e.action === "INSERT") return `Sent “${(e.changes?.command_type as string ?? "").replace(/_/g, " ")}” to a device`;
  if (e.table_name === "alerts" && e.action === "UPDATE" && e.changes && "resolved" in e.changes) {
    const [, now] = e.changes.resolved as [boolean, boolean];
    return `${now ? "Resolved" : "Reopened"} alert: ${e.summary ?? ""}`;
  }
  return `${VERB[e.action]} ${area(e.table_name).toLowerCase()}: ${e.summary ?? e.record_id ?? ""}`;
}

const fmt = (v: unknown) => v == null ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v);

export default function AuditLog() {
  const [selected, setSelected] = useState<Entry | null>(null);
  const [days, setDays] = useState(30);
  const since = useMemo(() => new Date(Date.now() - days * 86400_000).toISOString(), [days]);

  const { data: entries = [], isLoading, error } = useQuery<Entry[]>({
    queryKey: ["audit-log", days],
    queryFn: async () => {
      const { data, error } = await supabase.from("audit_log")
        .select("id, at, actor_email, action, table_name, record_id, summary, changes")
        .gte("at", since).order("at", { ascending: false }).limit(5000);
      if (error) throw error;
      return data as Entry[];
    },
    refetchInterval: 30_000,
  });

  const actors = [...new Set(entries.map(e => e.actor_email).filter(Boolean) as string[])].sort();
  const tables = [...new Set(entries.map(e => e.table_name))].sort();
  const today = entries.filter(e => Date.now() - new Date(e.at).getTime() < 86400_000).length;

  const columns: Column<Entry>[] = [
    { key: "at", header: "When", width: "150px", render: e => <span title={new Date(e.at).toLocaleString()}>{timeAgo(e.at)}</span> },
    { key: "actor_email", header: "Who", value: e => e.actor_email ?? "", render: e => <span style={{ color: "var(--c-strong)" }}>{e.actor_email ?? "system"}</span> },
    { key: "action", header: "Action", width: "100px", render: e => <Badge tone={TONE[e.action]}>{VERB[e.action]}</Badge> },
    { key: "table_name", header: "Area", hideBelow: "md", value: e => area(e.table_name) },
    { key: "summary", header: "What", value: e => describe(e), render: e => <span className="truncate max-w-[520px] inline-block align-middle">{describe(e)}</span> },
  ];
  const filters: FilterDef<Entry>[] = [
    { key: "actor", label: "Who", options: actors.map(a => ({ value: a, label: a })), get: e => e.actor_email ?? "" },
    { key: "action", label: "Action", options: [{ value: "INSERT", label: "Created" }, { value: "UPDATE", label: "Changed" }, { value: "DELETE", label: "Deleted" }], get: e => e.action },
    { key: "area", label: "Area", options: tables.map(t => ({ value: t, label: area(t) })), get: e => e.table_name },
  ];

  return (
    <div className="flex flex-col min-h-full">
      <TopBar title="Audit Log" />
      <Page>
        <PageHeader
          title="Audit Log"
          crumbs={[{ label: "Administration" }, { label: "Audit Log" }]}
          description="Every change made by a person in this console — policies, device actions, alerts, users and settings. Entries cannot be edited or deleted."
          actions={
            <select value={days} onChange={e => setDays(Number(e.target.value))} aria-label="Time range"
              className="h-8 px-2.5 rounded-md border text-[13px] bg-[var(--c-card2)] border-[var(--c-border2)] text-[var(--c-strong)]">
              <option value={1}>Last 24 hours</option><option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option><option value={90}>Last 90 days</option><option value={365}>Last year</option>
            </select>}
        />

        {error && <p className="mb-3 text-[12.5px]" style={{ color: "var(--sev-critical)" }}>Only admins can view the audit log.</p>}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <StatTile label={`Changes (${days}d)`} icon={ScrollText} value={entries.length} />
          <StatTile label="Last 24 hours" icon={Pencil} tone="accent" value={today} />
          <StatTile label="Deletions" icon={Trash2} tone="critical" value={entries.filter(e => e.action === "DELETE").length} />
          <StatTile label="People" icon={Users} value={actors.length} />
        </div>

        <DataTable rows={entries} columns={columns} rowKey={e => String(e.id)} loading={isLoading} filters={filters}
          searchPlaceholder="Search who, what, or record…" searchText={e => [e.actor_email, describe(e), e.record_id, e.table_name].join(" ")}
          initialSort={{ key: "at", dir: "desc" }} onRowClick={setSelected} selectedKey={selected ? String(selected.id) : null}
          exportName="audit-log" pageSize={50} empty="No changes recorded in this period." />
      </Page>

      <Drawer open={!!selected} onClose={() => setSelected(null)} title={selected ? describe(selected) : ""}
        subtitle={selected && <span className="flex items-center gap-2"><Badge tone={TONE[selected.action]}>{VERB[selected.action]}</Badge>{area(selected.table_name)}</span>}>
        {selected && (
          <div className="space-y-6">
            <KeyValue items={[
              { label: "When", value: new Date(selected.at).toLocaleString() },
              { label: "Who", value: selected.actor_email ?? "system" },
              { label: "Area", value: area(selected.table_name) },
              { label: "Record", value: <span className="font-mono text-[12px] break-all">{selected.record_id ?? "—"}</span> },
            ]} />
            <div>
              <h4 className="text-[11px] font-semibold uppercase tracking-[0.06em] mb-2" style={{ color: "var(--c-muted)" }}>
                {selected.action === "UPDATE" ? "Changed fields" : selected.action === "INSERT" ? "Created with" : "Deleted record"}
              </h4>
              <div className="rounded-md border overflow-hidden" style={{ borderColor: "var(--c-border)" }}>
                <table className="w-full text-[12px]">
                  <thead style={{ background: "var(--c-card2)" }}>
                    <tr>
                      <th className="text-left px-3 py-2 font-semibold" style={{ color: "var(--c-muted)" }}>Field</th>
                      {selected.action === "UPDATE" && <th className="text-left px-3 py-2 font-semibold" style={{ color: "var(--c-muted)" }}>Before</th>}
                      <th className="text-left px-3 py-2 font-semibold" style={{ color: "var(--c-muted)" }}>{selected.action === "UPDATE" ? "After" : "Value"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(selected.changes ?? {}).map(([k, v]) => {
                      const pair = selected.action === "UPDATE" && Array.isArray(v) ? v as [unknown, unknown] : null;
                      return (
                        <tr key={k} className="border-t align-top" style={{ borderColor: "var(--c-divider)" }}>
                          <td className="px-3 py-2 font-mono" style={{ color: "var(--c-strong)" }}>{k}</td>
                          {pair && <td className="px-3 py-2 font-mono break-all" style={{ color: "var(--sev-critical)" }}>{fmt(pair[0])}</td>}
                          <td className="px-3 py-2 font-mono break-all" style={{ color: pair ? "var(--ok)" : "var(--c-text)" }}>{fmt(pair ? pair[1] : v)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
