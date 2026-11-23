import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  RefreshCw, Package, CheckCircle2, AlertTriangle, Monitor, Apple, Loader2, Zap, Laptop, Check, Clock, Bug,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { timeAgo } from "../lib/utils";
import TopBar from "../components/layout/TopBar";
import {
  Page, PageHeader, StatTile, DataTable, Badge, Button, Drawer, KeyValue, Tabs, EmptyState, StatusBadge,
  type Column, type FilterDef,
} from "../components/ui";

interface OutdatedApp {
  name: string;
  current_version: string;
  latest_version: string;
  source: "brew" | "brew-cask" | "softwareupdate" | "mas" | "winget" | "windows_update";
}

interface Device {
  id: string;
  hostname: string;
  os_type: string;
  last_seen: string | null;
  outdated_apps?: OutdatedApp[];
}

interface Metric {
  outdated_apps?: OutdatedApp[];
}

/** One row per outdated app per device (the "By application" view). */
interface AppRow extends OutdatedApp {
  key: string;
  device: Device;
}

type Feedback = { state: "sending" | "ok" | "error"; text: string };

function sourceLabel(source: string) {
  const map: Record<string, string> = {
    "brew": "Homebrew",
    "brew-cask": "Homebrew Cask",
    "softwareupdate": "macOS Update",
    "mas": "App Store",
    "winget": "winget",
    "windows_update": "Windows Update",
  };
  return map[source] || source;
}

function isOnline(lastSeen: string | null) {
  if (!lastSeen) return false;
  return (Date.now() - new Date(lastSeen).getTime()) / 60000 <= 15;
}

const isWindows = (d: Device) => d.os_type?.toLowerCase() === "windows";

export default function PatchManager() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"devices" | "apps">("devices");
  const [view, setView] = useState<"all" | "needs" | "current">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Record<string, Feedback>>({});

  // Fetch all devices, then each device's latest metric to read outdated_apps.
  const { data: devices = [], isLoading, error: loadError } = useQuery<Device[]>({
    queryKey: ["patch-devices"],
    queryFn: async () => {
      const { data: devs, error } = await supabase
        .from("devices")
        .select("id, hostname, os_type, last_seen")
        .order("hostname");
      if (error) throw error;
      if (!devs?.length) return [];

      // Per-device latest metric, fetched in parallel (was sequential).
      return Promise.all(devs.map(async dev => {
        const { data: metric } = await supabase
          .from("metrics")
          .select("outdated_apps")
          .eq("device_id", dev.id)
          .order("timestamp", { ascending: false })
          .limit(1)
          .maybeSingle();
        return { ...dev, outdated_apps: (metric as Metric | null)?.outdated_apps || [] } as Device;
      }));
    },
    refetchInterval: 60_000,
  });

  // Send a patch command
  const patchMutation = useMutation({
    mutationFn: async ({ device, appName, source, patchAll }: {
      key: string; device: Device; appName?: string; source?: string; patchAll?: boolean;
    }) => {
      const { error } = await supabase.from("device_commands").insert({
        device_id: device.id,
        // Mac agent: patch_all_apps · Windows agent: patch_all
        command_type: patchAll ? (isWindows(device) ? "patch_all" : "patch_all_apps") : "patch_app",
        payload: patchAll ? {} : { app_name: appName, source },
        status: "pending",
      });
      if (error) throw error;
    },
    onMutate: v => setFeedback(f => ({ ...f, [v.key]: { state: "sending", text: "Sending…" } })),
    onSuccess: (_d, v) => {
      setFeedback(f => ({ ...f, [v.key]: { state: "ok", text: "Queued" } }));
      queryClient.invalidateQueries({ queryKey: ["patch-devices"] });
    },
    onError: (e, v) => setFeedback(f => ({ ...f, [v.key]: { state: "error", text: `Failed: ${(e as Error).message}` } })),
  });

  const patchApp = (device: Device, app: OutdatedApp) =>
    patchMutation.mutate({ key: `${device.id}-${app.name}`, device, appName: app.name, source: app.source });
  const patchAll = (device: Device) =>
    patchMutation.mutate({ key: `${device.id}-all`, device, patchAll: true });

  const totalOutdated = devices.reduce((s, d) => s + (d.outdated_apps?.length || 0), 0);
  const devicesWithUpdates = devices.filter(d => (d.outdated_apps?.length || 0) > 0);
  const upToDate = devices.filter(d => (d.outdated_apps?.length || 0) === 0);
  const coverage = devices.length ? Math.round((upToDate.length / devices.length) * 100) : 100;

  const deviceRows = view === "needs" ? devicesWithUpdates : view === "current" ? upToDate : devices;
  const appRows: AppRow[] = useMemo(() => devices.flatMap(d =>
    (d.outdated_apps ?? []).map(a => ({ ...a, key: `${d.id}-${a.name}`, device: d }))), [devices]);

  const selected = devices.find(d => d.id === selectedId) ?? null;

  /** Patch button with inline feedback; disabled while the device is offline (unchanged behaviour). */
  function patchButton({ device, app, label, variant = "secondary" }: { device: Device; app?: OutdatedApp; label: string; variant?: "primary" | "secondary" }) {
    const key = app ? `${device.id}-${app.name}` : `${device.id}-all`;
    const fb = feedback[key];
    const online = isOnline(device.last_seen);
    if (fb && fb.state !== "sending") {
      return (
        <span className="inline-flex items-center gap-1 text-[11.5px] font-medium" title={fb.text}
          style={{ color: fb.state === "ok" ? "var(--ok)" : "var(--sev-critical)" }}>
          {fb.state === "ok" ? <Check className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
          <span className="max-w-[180px] truncate">{fb.text}</span>
          {fb.state === "error" && (
            <button className="underline ml-1" onClick={() => (app ? patchApp(device, app) : patchAll(device))}>Retry</button>
          )}
        </span>
      );
    }
    return (
      <Button size="sm" variant={variant} icon={fb ? Loader2 : app ? RefreshCw : Zap}
        disabled={!!fb || !online}
        title={!online ? "Device is offline" : app ? `Update ${app.name}` : "Update all apps"}
        onClick={() => (app ? patchApp(device, app) : patchAll(device))}>
        {fb ? "Sending…" : label}
      </Button>
    );
  }

  const OsIcon = ({ d }: { d: Device }) => isWindows(d)
    ? <Monitor className="w-4 h-4 shrink-0" style={{ color: "var(--c-muted)" }} />
    : <Apple className="w-4 h-4 shrink-0" style={{ color: "var(--c-muted)" }} />;

  const deviceCols: Column<Device>[] = [
    { key: "hostname", header: "Device", render: d => (
      <div className="flex items-center gap-2.5 min-w-0">
        <OsIcon d={d} />
        <span className="font-medium truncate max-w-[240px]" style={{ color: "var(--c-strong)" }}>{d.hostname}</span>
      </div>) },
    { key: "os_type", header: "OS", hideBelow: "md", value: d => (isWindows(d) ? "Windows" : "macOS") },
    { key: "status", header: "Status", value: d => (isOnline(d.last_seen) ? "Online" : "Offline"),
      render: d => <StatusBadge online={isOnline(d.last_seen)} /> },
    { key: "updates", header: "Updates", value: d => d.outdated_apps?.length ?? 0, render: d => {
      const n = d.outdated_apps?.length ?? 0;
      return n ? <Badge tone="medium">{n} update{n !== 1 ? "s" : ""}</Badge> : <Badge tone="ok">Up to date</Badge>;
    } },
    { key: "last_seen", header: "Last seen", hideBelow: "lg", value: d => d.last_seen ?? "",
      render: d => d.last_seen ? <span title={new Date(d.last_seen).toLocaleString()}>{timeAgo(d.last_seen)}</span> : "never" },
    { key: "actions", header: "", sortable: false, align: "right", width: "170px", render: d => (
      <div onClick={e => e.stopPropagation()}>
        {(d.outdated_apps?.length ?? 0) > 0 && patchButton({device: d, label: "Update all"})}
      </div>) },
  ];

  const appCols: Column<AppRow>[] = [
    { key: "name", header: "Application", render: a => <span className="font-medium" style={{ color: "var(--c-strong)" }}>{a.name}</span> },
    { key: "device", header: "Device", value: a => a.device.hostname },
    { key: "current_version", header: "Installed", hideBelow: "md", render: a => <span className="font-mono text-[12px]">{a.current_version}</span> },
    { key: "latest_version", header: "Available", hideBelow: "md",
      render: a => <span className="font-mono text-[12px]" style={{ color: "var(--ok)" }}>{a.latest_version}</span> },
    { key: "source", header: "Source", hideBelow: "lg", value: a => sourceLabel(a.source),
      render: a => <Badge tone="accent">{sourceLabel(a.source)}</Badge> },
    { key: "actions", header: "", sortable: false, align: "right", width: "150px", render: a => (
      <div onClick={e => e.stopPropagation()}>{patchButton({device: a.device, app: a, label: "Update"})}</div>) },
  ];

  const deviceFilters: FilterDef<Device>[] = [
    { key: "os", label: "OS", options: [{ value: "macos", label: "macOS" }, { value: "windows", label: "Windows" }], get: d => (isWindows(d) ? "windows" : "macos") },
    { key: "status", label: "Status", options: [{ value: "online", label: "Online" }, { value: "offline", label: "Offline" }], get: d => (isOnline(d.last_seen) ? "online" : "offline") },
  ];
  const sources = [...new Set(appRows.map(a => a.source))];
  const appFilters: FilterDef<AppRow>[] = [
    { key: "source", label: "Source", options: sources.map(s => ({ value: s, label: sourceLabel(s) })), get: a => a.source },
    { key: "device", label: "Device", options: [...new Set(appRows.map(a => a.device.hostname))].sort().map(h => ({ value: h, label: h })), get: a => a.device.hostname },
  ];

  return (
    <div className="flex flex-col min-h-full">
      <TopBar title="Patch Management" />
      <Page>
        <PageHeader
          title="Patch Management"
          icon={Package}
          crumbs={[{ label: "Vulnerability & Compliance" }, { label: "Patch Management" }]}
          description="Outdated applications reported by each agent. Update a single app or everything on a device — Homebrew / App Store on Mac, winget on Windows."
          actions={<>
            <Button icon={RefreshCw} onClick={() => queryClient.invalidateQueries({ queryKey: ["patch-devices"] })}>Refresh</Button>
            <Button icon={Bug} onClick={() => navigate("/vulnerabilities")}>Vulnerabilities</Button>
          </>}
        />

        {loadError && (
          <p className="mb-3 text-[12.5px]" style={{ color: "var(--sev-critical)" }}>Could not load devices: {(loadError as Error).message}</p>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <StatTile label="Devices" icon={Laptop} tone="neutral" value={devices.length}
            sub={`${coverage}% fully patched`}
            onClick={() => { setTab("devices"); setView("all"); }} active={tab === "devices" && view === "all"} />
          <StatTile label="Need updates" icon={AlertTriangle} tone={devicesWithUpdates.length ? "medium" : "ok"} value={devicesWithUpdates.length}
            onClick={() => { setTab("devices"); setView("needs"); }} active={tab === "devices" && view === "needs"} />
          <StatTile label="Outdated apps" icon={Package} tone={totalOutdated ? "high" : "ok"} value={totalOutdated}
            sub="Across all devices" onClick={() => setTab("apps")} active={tab === "apps"} />
          <StatTile label="Up to date" icon={CheckCircle2} tone="ok" value={upToDate.length}
            onClick={() => { setTab("devices"); setView("current"); }} active={tab === "devices" && view === "current"} />
        </div>

        <div className="mb-3">
          <Tabs value={tab} onChange={setTab} tabs={[
            { id: "devices", label: "By device", count: deviceRows.length },
            { id: "apps", label: "By application", count: appRows.length },
          ]} />
        </div>

        {tab === "devices" ? (
          <DataTable
            rows={deviceRows}
            columns={deviceCols}
            rowKey={d => d.id}
            loading={isLoading}
            filters={deviceFilters}
            searchPlaceholder="Search devices or apps…"
            searchText={d => [d.hostname, d.os_type, ...(d.outdated_apps ?? []).map(a => a.name)].join(" ")}
            initialSort={{ key: "updates", dir: "desc" }}
            onRowClick={d => setSelectedId(d.id)}
            selectedKey={selectedId}
            exportName="patch-status"
            rowTone={d => ((d.outdated_apps?.length ?? 0) > 0 ? "var(--sev-medium)" : undefined)}
            empty={devices.length === 0 ? "No devices enrolled yet." : "No devices in this view."}
            toolbar={view !== "all" ? <Button size="sm" variant="ghost" onClick={() => setView("all")}>{view === "needs" ? "Needs updates" : "Up to date"} ×</Button> : undefined}
          />
        ) : (
          <DataTable
            rows={appRows}
            columns={appCols}
            rowKey={a => a.key}
            loading={isLoading}
            filters={appFilters}
            searchPlaceholder="Search applications or devices…"
            initialSort={{ key: "name", dir: "asc" }}
            onRowClick={a => setSelectedId(a.device.id)}
            exportName="outdated-apps"
            empty="Every application on every device is up to date."
          />
        )}

        <p className="mt-3 flex items-center gap-1.5 text-[11.5px]" style={{ color: "var(--c-muted)" }}>
          <Clock className="w-3.5 h-3.5" /> Commands are queued and executed by the agent within ~10 seconds. Offline devices must reconnect before they can be patched.
        </p>
      </Page>

      <Drawer
        open={!!selected}
        onClose={() => setSelectedId(null)}
        width={600}
        title={selected?.hostname ?? ""}
        subtitle={selected && <span className="flex items-center gap-2">
          <StatusBadge online={isOnline(selected.last_seen)} /> {isWindows(selected) ? "Windows" : "macOS"}
        </span>}
        footer={selected && <>
          <Button icon={Laptop} onClick={() => navigate(`/device/${selected.id}`)}>Open device</Button>
          {(selected.outdated_apps?.length ?? 0) > 0 && patchButton({device: selected, label: "Update all", variant: "primary"})}
        </>}
      >
        {selected && (
          <div className="space-y-5">
            <KeyValue items={[
              { label: "Device", value: <Link className="hover:underline" style={{ color: "var(--c-accent)" }} to={`/device/${selected.id}`}>{selected.hostname}</Link> },
              { label: "Last seen", value: selected.last_seen ? new Date(selected.last_seen).toLocaleString() : "never" },
              { label: "Outdated apps", value: String(selected.outdated_apps?.length ?? 0) },
            ]} />
            {!isOnline(selected.last_seen) && (
              <p className="text-[12px] rounded-md border px-3 py-2" style={{ color: "var(--sev-medium)", borderColor: "var(--c-border)", background: "var(--c-card2)" }}>
                Device is offline — updates can be sent once it reconnects.
              </p>
            )}
            {(selected.outdated_apps?.length ?? 0) === 0 ? (
              <EmptyState icon={CheckCircle2} title="Up to date" hint="The agent reports no outdated applications on this device." />
            ) : (
              <div className="rounded-md border overflow-x-auto" style={{ borderColor: "var(--c-border)" }}>
                <table className="w-full text-[12.5px]">
                  <thead>
                    <tr style={{ background: "var(--c-card2)" }}>
                      {["Application", "Installed", "Available", ""].map(h => (
                        <th key={h} className="text-left h-8 px-3 text-[11px] font-semibold uppercase tracking-[0.05em]" style={{ color: "var(--c-muted)" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {selected.outdated_apps!.map(app => (
                      <tr key={app.name} className="border-t" style={{ borderColor: "var(--c-divider)" }}>
                        <td className="px-3 py-2">
                          <p className="font-medium" style={{ color: "var(--c-strong)" }}>{app.name}</p>
                          <p className="text-[11px]" style={{ color: "var(--c-muted)" }}>{sourceLabel(app.source)}</p>
                        </td>
                        <td className="px-3 py-2 font-mono" style={{ color: "var(--c-muted)" }}>{app.current_version}</td>
                        <td className="px-3 py-2 font-mono" style={{ color: "var(--ok)" }}>{app.latest_version}</td>
                        <td className="px-3 py-2 text-right">{patchButton({device: selected, app: app, label: "Update"})}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}
