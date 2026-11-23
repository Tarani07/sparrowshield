import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppWindow, Plus, Trash2, Ban, CheckCircle2, PackageX, Loader2, RotateCcw, Check } from "lucide-react";
import { supabase } from "../lib/supabase";
import { timeAgo } from "../lib/utils";
import TopBar from "../components/layout/TopBar";
import { useAuth } from "../lib/AuthContext";
import ScanNowButton from "../components/ScanNowButton";
import { Page, PageHeader, StatTile, DataTable, Badge, Button, Drawer, Tabs, inputClass, type Column, type FilterDef } from "../components/ui";

interface AppRule { id: string; app_name: string; list_type: "allowlist" | "blocklist"; platform: string; reason: string | null; created_at: string; group_id: string | null }
interface Violation { id: string; app_name: string; app_version: string | null; violation_type: string; detected_at: string; resolved: boolean; device_id: string; hostname: string | null }
interface AppCommand { device_id: string; command_type: "remove_app" | "restore_app"; status: string; result: string | null; payload: { app_name?: string }; created_at: string }

export default function AppFilter() {
  const qc = useQueryClient();
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState<"rules" | "violations">("rules");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ app: "", type: "blocklist" as "blocklist" | "allowlist", reason: "", group: "" });

  const { data: rules = [], isLoading } = useQuery<AppRule[]>({
    queryKey: ["app-filter-rules"],
    queryFn: async () => (await supabase.from("software_lists")
      .select("id, app_name, list_type, platform, reason, created_at, group_id").order("app_name")).data as AppRule[] ?? [],
  });
  const { data: groups = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["device-groups-lite"],
    queryFn: async () => (await supabase.from("device_groups").select("id, name").order("name")).data ?? [],
  });
  const { data: violations = [], isLoading: vLoading } = useQuery<Violation[]>({
    queryKey: ["app-violations"],
    queryFn: async () => {
      const { data } = await supabase.from("software_violations")
        .select("id, app_name, app_version, violation_type, detected_at, resolved, device_id, devices(hostname)")
        .order("detected_at", { ascending: false }).limit(500);
      return (data ?? []).map((v: Record<string, unknown>) => ({
        ...(v as unknown as Violation),
        hostname: (v.devices as { hostname?: string } | null)?.hostname ?? null,
      }));
    },
    refetchInterval: 30_000,
  });
  // Latest remove/restore command per device+app drives each row's action state.
  const { data: appCommands = [] } = useQuery<AppCommand[]>({
    queryKey: ["app-commands"],
    queryFn: async () => (await supabase.from("device_commands")
      .select("device_id, command_type, status, result, payload, created_at")
      .in("command_type", ["remove_app", "restore_app"]).order("created_at", { ascending: false }).limit(300)).data as AppCommand[] ?? [],
    refetchInterval: 5_000,
  });

  const addRule = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("software_lists").insert({
        app_name: form.app.trim(), list_type: form.type, platform: "all",
        reason: form.reason.trim() || null, group_id: form.group || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["app-filter-rules"] });
      setForm({ app: "", type: "blocklist", reason: "", group: "" });
      setAdding(false);
    },
  });
  const deleteRule = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("software_lists").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["app-filter-rules"] }),
  });
  const resolveViolation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("software_violations").update({ resolved: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["app-violations"] }),
  });
  const appAction = useMutation({
    mutationFn: async (v: { device_id: string; app_name: string; command: "remove_app" | "restore_app" }) => {
      const { error } = await supabase.from("device_commands").insert({ device_id: v.device_id, command_type: v.command, payload: { app_name: v.app_name } });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["app-commands"] }),
  });

  const lastCommand = (v: Violation) => appCommands.find(c => c.device_id === v.device_id
    && (c.payload?.app_name ?? "").toLowerCase() === v.app_name.toLowerCase());
  const groupName = (id: string | null) => groups.find(g => g.id === id)?.name ?? null;

  const blocked = rules.filter(r => r.list_type === "blocklist");
  const allowed = rules.filter(r => r.list_type === "allowlist");
  const openViolations = violations.filter(v => !v.resolved);

  const ruleCols: Column<AppRule>[] = [
    { key: "app_name", header: "Application", render: r => <span className="font-medium" style={{ color: "var(--c-strong)" }}>{r.app_name}</span> },
    { key: "list_type", header: "Action", value: r => (r.list_type === "blocklist" ? "Block" : "Allow"),
      render: r => <Badge tone={r.list_type === "blocklist" ? "critical" : "ok"}>{r.list_type === "blocklist" ? "Block" : "Allow"}</Badge> },
    { key: "scope", header: "Scope", value: r => groupName(r.group_id) ?? "All devices",
      render: r => groupName(r.group_id) ? <Badge tone="accent">{groupName(r.group_id)}</Badge> : <span>All devices</span> },
    { key: "reason", header: "Reason", hideBelow: "md", value: r => r.reason ?? "" ,
      render: r => <span style={{ color: r.reason ? "var(--c-text)" : "var(--c-muted)" }}>{r.reason ?? "—"}</span> },
    { key: "created_at", header: "Added", hideBelow: "lg", render: r => timeAgo(r.created_at) },
    { key: "actions", header: "", sortable: false, align: "right", width: "60px", render: r => (
      isAdmin && <button onClick={() => deleteRule.mutate(r.id)} disabled={deleteRule.isPending} title="Delete rule"
        className="p-1.5 rounded hover:bg-[var(--c-card2)]" style={{ color: "var(--c-muted)" }}>
        <Trash2 className="w-4 h-4" />
      </button>) },
  ];

  const violationCols: Column<Violation>[] = [
    { key: "app_name", header: "Application", render: v => (
      <div><p className="font-medium" style={{ color: "var(--c-strong)" }}>{v.app_name}</p>
        {v.app_version && <p className="text-[11.5px]" style={{ color: "var(--c-muted)" }}>v{v.app_version}</p>}</div>) },
    { key: "hostname", header: "Device", value: v => v.hostname ?? "" },
    { key: "detected_at", header: "Detected", render: v => timeAgo(v.detected_at) },
    { key: "state", header: "Status", value: v => (v.resolved ? "Resolved" : "Open"), render: v => {
      const c = lastCommand(v);
      if (c?.command_type === "remove_app" && c.status === "done") return <Badge tone="ok">Removed · quarantined</Badge>;
      if (c && (c.status === "pending" || c.status === "running"))
        return <Badge tone="accent"><Loader2 className="w-3 h-3 animate-spin" />{c.command_type === "remove_app" ? "Removing…" : "Restoring…"}</Badge>;
      if (c?.status === "failed") return <span title={c.result ?? ""}><Badge tone="critical">{c.command_type === "remove_app" ? "Remove failed" : "Restore failed"}</Badge></span>;
      return <Badge tone={v.resolved ? "ok" : "high"} dot>{v.resolved ? "Resolved" : "Open"}</Badge>;
    } },
    { key: "actions", header: "", sortable: false, align: "right", width: "260px", render: v => {
      const c = lastCommand(v);
      const busy = c && (c.status === "pending" || c.status === "running");
      const removed = c?.command_type === "remove_app" && c.status === "done";
      return (
        <div className="flex items-center justify-end gap-1.5" onClick={e => e.stopPropagation()}>
          {removed && !busy && (
            <Button adminOnly size="sm" icon={RotateCcw} onClick={() => appAction.mutate({ device_id: v.device_id, app_name: v.app_name, command: "restore_app" })}>Restore</Button>
          )}
          {!v.resolved && !busy && !removed && (
            <Button size="sm" variant="danger" icon={PackageX} onClick={() => appAction.mutate({ device_id: v.device_id, app_name: v.app_name, command: "remove_app" })}>Remove app</Button>
          )}
          {!v.resolved && (
            <Button adminOnly size="sm" icon={Check} onClick={() => resolveViolation.mutate(v.id)}>Resolve</Button>
          )}
        </div>
      );
    } },
  ];

  const ruleFilters: FilterDef<AppRule>[] = [
    { key: "type", label: "Action", options: [{ value: "blocklist", label: "Block" }, { value: "allowlist", label: "Allow" }], get: r => r.list_type },
    { key: "scope", label: "Scope", options: [{ value: "", label: "All devices" }, ...groups.map(g => ({ value: g.id, label: g.name }))].filter(o => o.value),
      get: r => r.group_id ?? "" },
  ];
  const violationFilters: FilterDef<Violation>[] = [
    { key: "status", label: "Status", options: [{ value: "open", label: "Open" }, { value: "resolved", label: "Resolved" }], get: v => (v.resolved ? "resolved" : "open") },
    { key: "device", label: "Device", options: [...new Set(violations.map(v => v.hostname).filter(Boolean) as string[])].map(h => ({ value: h, label: h })), get: v => v.hostname ?? "" },
  ];

  return (
    <div className="flex flex-col min-h-full">
      <TopBar title="Application Control" />
      <Page>
        <PageHeader
          title="Application Control"
          crumbs={[{ label: "Protection Policies" }, { label: "Application Control" }]}
          description={<>Block or allow applications fleet-wide or per team. Blocked apps are closed within ~15 seconds of opening;
            use <b>Remove app</b> on a violation to uninstall it (moved to quarantine, restorable).</>}
          actions={<><ScanNowButton /><Button variant="primary" icon={Plus} onClick={() => setAdding(true)}>Add rule</Button></>}
        />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <StatTile label="Blocked applications" icon={Ban} tone="critical" value={blocked.length} onClick={() => setTab("rules")} />
          <StatTile label="Allowed applications" icon={CheckCircle2} tone="ok" value={allowed.length} onClick={() => setTab("rules")} />
          <StatTile label="Open violations" icon={PackageX} tone={openViolations.length ? "high" : "ok"} value={openViolations.length}
            sub="Blocked apps found installed" onClick={() => setTab("violations")} active={tab === "violations"} />
        </div>

        <div className="mb-3">
          <Tabs value={tab} onChange={setTab} tabs={[
            { id: "rules", label: "Rules", count: rules.length },
            { id: "violations", label: "Violations", count: openViolations.length },
          ]} />
        </div>

        {tab === "rules" ? (
          <DataTable rows={rules} columns={ruleCols} rowKey={r => r.id} loading={isLoading} filters={ruleFilters}
            searchPlaceholder="Search applications…" exportName="app-rules" initialSort={{ key: "app_name", dir: "asc" }}
            empty="No application rules yet — click Add rule." />
        ) : (
          <DataTable rows={violations} columns={violationCols} rowKey={v => v.id} loading={vLoading} filters={violationFilters}
            initialFilters={{ status: "open" }} searchPlaceholder="Search apps or devices…" exportName="app-violations"
            initialSort={{ key: "detected_at", dir: "desc" }} empty="No violations — no blocked apps are installed."
            rowTone={v => (v.resolved ? undefined : "var(--sev-high)")} />
        )}
      </Page>

      <Drawer open={adding} onClose={() => setAdding(false)} title="Add application rule" width={460}
        footer={<>
          <Button onClick={() => setAdding(false)}>Cancel</Button>
          <Button variant="primary" onClick={() => addRule.mutate()} disabled={!form.app.trim() || addRule.isPending}>
            {addRule.isPending ? "Adding…" : "Add rule"}
          </Button>
        </>}>
        <div className="space-y-4">
          <label className="block">
            <span className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--c-text)" }}>Application name</span>
            <input autoFocus className={`${inputClass} w-full`} value={form.app} onChange={e => setForm(f => ({ ...f, app: e.target.value }))}
              placeholder="e.g. Slack, VLC, BitTorrent" />
            <span className="block text-[11.5px] mt-1" style={{ color: "var(--c-muted)" }}>Matches the app's name in /Applications (case-insensitive, partial match).</span>
          </label>
          <label className="block">
            <span className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--c-text)" }}>Action</span>
            <select className={`${inputClass} w-full`} value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value as "blocklist" | "allowlist" }))}>
              <option value="blocklist">Block — close on launch and flag as violation</option>
              <option value="allowlist">Allow — exempt from blocking</option>
            </select>
          </label>
          <label className="block">
            <span className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--c-text)" }}>Scope</span>
            <select className={`${inputClass} w-full`} value={form.group} onChange={e => setForm(f => ({ ...f, group: e.target.value }))}>
              <option value="">All devices</option>
              {groups.map(g => <option key={g.id} value={g.id}>Team: {g.name}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--c-text)" }}>Reason (optional)</span>
            <input className={`${inputClass} w-full`} value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
              placeholder="e.g. Not approved by IT" />
          </label>
          {addRule.isError && <p className="text-[12.5px]" style={{ color: "var(--sev-critical)" }}>Could not add rule: {(addRule.error as Error).message}</p>}
        </div>
      </Drawer>
    </div>
  );
}
