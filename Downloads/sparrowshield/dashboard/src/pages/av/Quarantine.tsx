import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Archive, ShieldCheck, Undo2, Package, Laptop, CheckCircle2, AlertTriangle, X, Clock, Info } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { timeAgo } from "../../lib/utils";
import TopBar from "../../components/layout/TopBar";
import {
  Page, PageHeader, StatTile, DataTable, SeverityBadge, Badge, Button, Drawer, KeyValue, Tabs,
  SEVERITY_ORDER, type Column, type FilterDef,
} from "../../components/ui";

interface ResolvedThreat {
  id: string;
  device_id: string;
  alert_type: string;
  severity: string;
  message: string;
  created_at: string;
  resolved_at: string | null;
  devices: { hostname: string | null } | null;
}

interface Cmd {
  id: string;
  device_id: string;
  command_type: string;
  payload: Record<string, unknown> | null;
  status: string;
  result: string | null;
  created_at: string;
  executed_at: string | null;
  devices: { hostname: string | null; os_type: string | null } | null;
}

interface QuarantinedApp {
  id: string;
  deviceId: string;
  hostname: string;
  osType: string | null;
  app: string;
  source: "remove_app" | "uninstall_software";
  quarantinedAt: string;
  paths: { from?: string; quarantine?: string }[];
  state: "quarantined" | "restore_pending" | "restored";
  restoreAt: string | null;
}

type Flash = { tone: "ok" | "error"; text: string } | null;
const MAC_OS = ["mac", "macos", "darwin"];
const isMac = (os?: string | null) => MAC_OS.includes((os ?? "").toLowerCase());
const typeLabel = (t: string) => t.replace(/_/g, " ").replace(/^\w/, c => c.toUpperCase());
const appOf = (p: Record<string, unknown> | null) => String((p ?? {}).app_name ?? (p ?? {}).name ?? "");

function parseRemoved(result: string | null): { from?: string; quarantine?: string }[] {
  if (!result) return [];
  try {
    const r = JSON.parse(result);
    return Array.isArray(r?.removed) ? r.removed : [];
  } catch { return []; }
}

export default function Quarantine() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"apps" | "threats">("apps");
  const [stateFilter, setStateFilter] = useState<string | null>("quarantined");
  const [selected, setSelected] = useState<QuarantinedApp | null>(null);
  const [selectedThreat, setSelectedThreat] = useState<ResolvedThreat | null>(null);
  const [flash, setFlash] = useState<Flash>(null);

  // alerts has no hostname column — it comes from the devices relation.
  const { data: items = [], isLoading } = useQuery<ResolvedThreat[]>({
    queryKey: ["quarantine"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("alerts")
        .select("id, device_id, alert_type, severity, message, created_at, resolved_at, devices(hostname)")
        .eq("resolved", true)
        .in("alert_type", ["malware", "crypto_miner_process", "malicious_app_installed", "tunneling_tool_detected", "shell_on_port"])
        .order("resolved_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as unknown as ResolvedThreat[];
    },
    refetchInterval: 60_000,
  });

  // App bundles moved to /var/quarantine by the Mac agent (remove_app / uninstall_software), and restores.
  const { data: cmds = [], isLoading: cmdsLoading, error: cmdError } = useQuery<Cmd[]>({
    queryKey: ["quarantine-commands"],
    queryFn: async () => {
      const { data, error } = await supabase.from("device_commands")
        .select("id, device_id, command_type, payload, status, result, created_at, executed_at, devices(hostname, os_type)")
        .in("command_type", ["remove_app", "uninstall_software", "restore_app"])
        .order("created_at", { ascending: false }).limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as Cmd[];
    },
    refetchInterval: 20_000,
  });

  const apps: QuarantinedApp[] = useMemo(() => {
    const restores = cmds.filter(c => c.command_type === "restore_app");
    return cmds
      .filter(c => (c.command_type === "remove_app" || c.command_type === "uninstall_software") && c.status === "done")
      .map(c => {
        const app = appOf(c.payload);
        const at = c.executed_at ?? c.created_at;
        const later = restores.filter(r => r.device_id === c.device_id && appOf(r.payload).toLowerCase() === app.toLowerCase()
          && new Date(r.created_at).getTime() > new Date(at).getTime());
        const done = later.find(r => r.status === "done");
        const pending = later.find(r => r.status === "pending" || r.status === "running" || r.status === "awaiting_approval");
        return {
          id: c.id, deviceId: c.device_id, hostname: c.devices?.hostname ?? c.device_id, osType: c.devices?.os_type ?? null,
          app, source: c.command_type as QuarantinedApp["source"], quarantinedAt: at, paths: parseRemoved(c.result),
          state: done ? "restored" : pending ? "restore_pending" : "quarantined",
          restoreAt: done ? (done.executed_at ?? done.created_at) : null,
        } as QuarantinedApp;
      });
  }, [cmds]);

  const restore = useMutation({
    mutationFn: async (a: QuarantinedApp) => {
      const { error } = await supabase.from("device_commands").insert({
        device_id: a.deviceId, command_type: "restore_app", payload: { app_name: a.app },
      });
      if (error) throw error;
      return a;
    },
    onSuccess: a => {
      setFlash({ tone: "ok", text: `Restore of “${a.app}” queued for ${a.hostname}. The agent moves it back on its next check-in.` });
      qc.invalidateQueries({ queryKey: ["quarantine-commands"] });
    },
    onError: e => setFlash({ tone: "error", text: `Could not queue restore: ${(e as Error).message}` }),
  });

  const stateLabel = { quarantined: "In quarantine", restore_pending: "Restore pending", restored: "Restored" } as const;
  const appRows = apps.filter(a => !stateFilter || a.state === stateFilter);
  const inQ = apps.filter(a => a.state === "quarantined").length;
  const pendingRestore = apps.filter(a => a.state === "restore_pending").length;
  const restored = apps.filter(a => a.state === "restored").length;

  const appHosts = [...new Set(apps.map(a => a.hostname))].sort();
  const appColumns: Column<QuarantinedApp>[] = [
    { key: "app", header: "Application", value: a => a.app, render: a => (
      <div className="min-w-0">
        <p className="font-medium truncate max-w-[360px]" style={{ color: "var(--c-strong)" }}>{a.app || "—"}</p>
        <p className="text-[11.5px] font-mono truncate max-w-[360px]" style={{ color: "var(--c-muted)" }}>{a.paths[0]?.from ?? (a.source === "remove_app" ? "Removed by policy" : "Uninstalled by admin")}</p>
      </div>) },
    { key: "hostname", header: "Device", hideBelow: "md", value: a => a.hostname },
    { key: "source", header: "Action", hideBelow: "lg", value: a => (a.source === "remove_app" ? "Removed" : "Uninstalled") },
    { key: "quarantinedAt", header: "Quarantined", value: a => a.quarantinedAt,
      render: a => <span title={new Date(a.quarantinedAt).toLocaleString()}>{timeAgo(a.quarantinedAt)}</span> },
    { key: "state", header: "Status", value: a => stateLabel[a.state],
      render: a => <Badge tone={a.state === "restored" ? "ok" : a.state === "restore_pending" ? "medium" : "accent"} dot>{stateLabel[a.state]}</Badge> },
    { key: "actions", header: "", sortable: false, align: "right", width: "110px", render: a => (
      <div onClick={e => e.stopPropagation()}>
        {a.state === "quarantined" && isMac(a.osType) && (
          <Button size="sm" icon={Undo2} disabled={restore.isPending} onClick={() => restore.mutate(a)}>Restore</Button>
        )}
      </div>) },
  ];

  const threatHosts = [...new Set(items.map(i => i.devices?.hostname).filter(Boolean) as string[])].sort();
  const threatColumns: Column<ResolvedThreat>[] = [
    { key: "alert_type", header: "Threat", value: i => typeLabel(i.alert_type), render: i => (
      <div className="min-w-0">
        <p className="font-medium" style={{ color: "var(--c-strong)" }}>{typeLabel(i.alert_type)}</p>
        <p className="text-[11.5px] truncate max-w-[420px]" style={{ color: "var(--c-muted)" }}>{i.message}</p>
      </div>) },
    { key: "severity", header: "Severity", value: i => SEVERITY_ORDER[i.severity] ?? 9, render: i => <SeverityBadge severity={i.severity} /> },
    { key: "device", header: "Device", hideBelow: "md", value: i => i.devices?.hostname ?? "" },
    { key: "created_at", header: "Detected", hideBelow: "lg", value: i => i.created_at, render: i => new Date(i.created_at).toLocaleDateString() },
    { key: "resolved_at", header: "Resolved", value: i => i.resolved_at ?? "",
      render: i => i.resolved_at ? <span title={new Date(i.resolved_at).toLocaleString()}>{timeAgo(i.resolved_at)}</span> : "—" },
  ];
  const threatFilters: FilterDef<ResolvedThreat>[] = [
    { key: "device", label: "Device", options: threatHosts.map(h => ({ value: h, label: h })), get: i => i.devices?.hostname ?? "" },
    { key: "type", label: "Type", options: [...new Set(items.map(i => i.alert_type))].map(t => ({ value: t, label: typeLabel(t) })), get: i => i.alert_type },
  ];

  return (
    <div className="flex flex-col min-h-full">
      <TopBar title="Quarantine" />
      <Page>
        <PageHeader
          title="Quarantine"
          icon={Archive}
          crumbs={[{ label: "Antivirus" }, { label: "Quarantine" }]}
          description="Application bundles the macOS agent moved into quarantine, and threats the agent neutralised. Quarantined apps can be restored to their original location."
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
        {cmdError && (
          <div className="mb-4 rounded-md border px-3 py-2 text-[13px]" style={{ borderColor: "var(--sev-critical)", color: "var(--c-strong)" }}>
            Could not load quarantine actions: {(cmdError as Error).message}
          </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <StatTile label="In quarantine" icon={Package} tone={inQ ? "accent" : "neutral"} value={inQ}
            onClick={() => { setTab("apps"); setStateFilter("quarantined"); }} active={tab === "apps" && stateFilter === "quarantined"} />
          <StatTile label="Restore pending" icon={Clock} tone={pendingRestore ? "medium" : "neutral"} value={pendingRestore}
            onClick={() => { setTab("apps"); setStateFilter("restore_pending"); }} active={tab === "apps" && stateFilter === "restore_pending"} />
          <StatTile label="Restored" icon={Undo2} tone="ok" value={restored}
            onClick={() => { setTab("apps"); setStateFilter("restored"); }} active={tab === "apps" && stateFilter === "restored"} />
          <StatTile label="Threats neutralised" icon={ShieldCheck} tone="ok" value={items.length}
            onClick={() => setTab("threats")} active={tab === "threats"} />
        </div>

        <div className="mb-3">
          <Tabs value={tab} onChange={setTab} tabs={[
            { id: "apps", label: "Quarantined apps", count: apps.length },
            { id: "threats", label: "Neutralised threats", count: items.length },
          ]} />
        </div>

        {tab === "apps" ? (
          <DataTable
            rows={appRows}
            columns={appColumns}
            rowKey={a => a.id}
            loading={cmdsLoading}
            filters={[{ key: "device", label: "Device", options: appHosts.map(h => ({ value: h, label: h })), get: a => a.hostname }]}
            searchPlaceholder="Search apps, devices…"
            initialSort={{ key: "quarantinedAt", dir: "desc" }}
            onRowClick={setSelected}
            selectedKey={selected?.id}
            exportName="quarantined-apps"
            empty={stateFilter ? `Nothing ${stateLabel[stateFilter as keyof typeof stateLabel].toLowerCase()}.` : "Quarantine is empty."}
            toolbar={stateFilter ? <Badge tone="accent">{stateLabel[stateFilter as keyof typeof stateLabel]}
              <button onClick={() => setStateFilter(null)} aria-label="Show all"><X className="w-3 h-3" /></button></Badge> : undefined}
          />
        ) : (
          <DataTable
            rows={items}
            columns={threatColumns}
            rowKey={i => i.id}
            loading={isLoading}
            filters={threatFilters}
            searchPlaceholder="Search threats, devices…"
            searchText={i => [i.message, i.alert_type, i.devices?.hostname].join(" ")}
            initialSort={{ key: "resolved_at", dir: "desc" }}
            onRowClick={setSelectedThreat}
            selectedKey={selectedThreat?.id}
            exportName="neutralised-threats"
            empty="No neutralised threats yet."
          />
        )}
      </Page>

      <Drawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.app ?? ""}
        subtitle={selected?.hostname}
        footer={selected && <>
          <Button icon={Laptop} onClick={() => navigate(`/device/${selected.deviceId}`)}>Open device</Button>
          {selected.state === "quarantined" && isMac(selected.osType) && (
            <Button variant="primary" icon={Undo2} disabled={restore.isPending} onClick={() => restore.mutate(selected)}>Restore app</Button>
          )}
        </>}
      >
        {selected && (
          <div className="space-y-5">
            {flash && <p className="text-[12.5px]" style={{ color: flash.tone === "ok" ? "var(--ok)" : "var(--sev-critical)" }}>{flash.text}</p>}
            <KeyValue items={[
              { label: "Status", value: <Badge tone={selected.state === "restored" ? "ok" : selected.state === "restore_pending" ? "medium" : "accent"} dot>{stateLabel[selected.state]}</Badge> },
              { label: "Device", value: <Link className="hover:underline" style={{ color: "var(--c-accent)" }} to={`/device/${selected.deviceId}`}>{selected.hostname}</Link> },
              { label: "Action", value: selected.source === "remove_app" ? "Removed (app policy)" : "Uninstalled by admin" },
              { label: "Quarantined", value: new Date(selected.quarantinedAt).toLocaleString() },
              { label: "Restored", value: selected.restoreAt ? new Date(selected.restoreAt).toLocaleString() : "—" },
            ]} />
            {selected.paths.length > 0 && (
              <div>
                <h4 className="text-[11px] font-semibold uppercase tracking-[0.06em] mb-2" style={{ color: "var(--c-muted)" }}>Moved bundles</h4>
                <ul className="space-y-2">
                  {selected.paths.map((p, i) => (
                    <li key={i} className="rounded-md border px-3 py-2 font-mono text-[11.5px] break-all" style={{ borderColor: "var(--c-border)", background: "var(--c-card2)", color: "var(--c-text)" }}>
                      <div><span style={{ color: "var(--c-muted)" }}>from </span>{p.from ?? "—"}</div>
                      <div><span style={{ color: "var(--c-muted)" }}>to </span>{p.quarantine ?? "—"}</div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {!isMac(selected.osType) && (
              <p className="text-[12.5px] flex items-center gap-2" style={{ color: "var(--c-muted)" }}>
                <Info className="w-3.5 h-3.5" /> Restore is only supported by the macOS agent.
              </p>
            )}
          </div>
        )}
      </Drawer>

      <Drawer
        open={!!selectedThreat}
        onClose={() => setSelectedThreat(null)}
        title={selectedThreat ? typeLabel(selectedThreat.alert_type) : ""}
        subtitle={selectedThreat && <span className="flex items-center gap-2"><SeverityBadge severity={selectedThreat.severity} /> {selectedThreat.devices?.hostname}</span>}
        footer={selectedThreat && <Button icon={Laptop} onClick={() => navigate(`/device/${selectedThreat.device_id}`)}>Open device</Button>}
      >
        {selectedThreat && (
          <div className="space-y-5">
            <p className="text-[13px] break-words" style={{ color: "var(--c-text)" }}>{selectedThreat.message}</p>
            <KeyValue items={[
              { label: "Device", value: selectedThreat.devices?.hostname ?? selectedThreat.device_id },
              { label: "Detected", value: new Date(selectedThreat.created_at).toLocaleString() },
              { label: "Resolved", value: selectedThreat.resolved_at ? new Date(selectedThreat.resolved_at).toLocaleString() : "—" },
            ]} />
          </div>
        )}
      </Drawer>
    </div>
  );
}
