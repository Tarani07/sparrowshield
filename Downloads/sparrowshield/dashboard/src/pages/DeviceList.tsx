import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Apple, Monitor, Laptop, Wifi, WifiOff, ShieldAlert, Bot, Trash2, ExternalLink, Lock, Flame, ShieldCheck, RefreshCw } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useAllDevices } from "../hooks/useDevices";
import type { Device } from "../lib/types";
import { timeAgo } from "../lib/utils";
import TopBar from "../components/layout/TopBar";
import { Page, PageHeader, StatTile, DataTable, Badge, Button, Drawer, type Column, type FilterDef } from "../components/ui";

const ONLINE_MS = 15 * 60_000;
export const deviceOnline = (d: Pick<Device, "last_seen">) => !!d.last_seen && Date.now() - new Date(d.last_seen).getTime() < ONLINE_MS;

type Row = Device & { group_id?: string | null; agent_version?: string | null };

/** Security posture checks that apply to the device's OS. */
function postureIssues(d: Row): string[] {
  const issues: string[] = [];
  if (d.os_type === "windows") {
    if (d.bitlocker_enabled === false) issues.push("BitLocker off");
  } else {
    if (d.filevault_enabled === false) issues.push("FileVault off");
    if (d.sip_enabled === false) issues.push("SIP off");
    if (d.gatekeeper_enabled === false) issues.push("Gatekeeper off");
  }
  if (d.firewall_enabled === false) issues.push("Firewall off");
  return issues;
}

function PostureIcons({ d }: { d: Row }) {
  const items = [
    { on: d.os_type === "windows" ? d.bitlocker_enabled : d.filevault_enabled, icon: Lock, label: d.os_type === "windows" ? "BitLocker" : "FileVault" },
    { on: d.firewall_enabled, icon: Flame, label: "Firewall" },
    ...(d.os_type === "windows" ? [] : [{ on: d.sip_enabled, icon: ShieldCheck, label: "SIP" }]),
  ];
  return (
    <div className="flex items-center gap-1.5">
      {items.map(i => (
        <span key={i.label} title={`${i.label}: ${i.on == null ? "unknown" : i.on ? "on" : "off"}`}
          className="w-6 h-6 rounded flex items-center justify-center border"
          style={{
            color: i.on == null ? "var(--c-muted)" : i.on ? "var(--ok)" : "var(--sev-critical)",
            borderColor: "var(--c-border)", background: "var(--c-card2)",
          }}>
          <i.icon className="w-3.5 h-3.5" />
        </span>
      ))}
    </div>
  );
}

export default function DeviceList({ os }: { os?: "mac" | "windows" } = {}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: all = [], isLoading, refetch, isFetching } = useAllDevices();
  const [deleteTarget, setDeleteTarget] = useState<Row | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [latestAgent, setLatestAgent] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/agents/version.json?t=${Date.now()}`).then(r => r.json()).then(m => setLatestAgent(m.version ?? null)).catch(() => {});
  }, []);

  const { data: groups = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["device-groups-lite"],
    queryFn: async () => (await supabase.from("device_groups").select("id, name").order("name")).data ?? [],
  });
  const groupName = (id?: string | null) => groups.find(g => g.id === id)?.name ?? null;

  const devices = (all as Row[]).filter(d => !os || (os === "windows" ? d.os_type === "windows" : d.os_type !== "windows"));
  const online = devices.filter(deviceOnline).length;
  const atRisk = devices.filter(d => postureIssues(d).length > 0).length;
  const outdated = latestAgent ? devices.filter(d => d.os_type !== "windows" && d.agent_version !== latestAgent).length : 0;

  const rows = useMemo(() => devices.filter(d => {
    if (statusFilter === "online") return deviceOnline(d);
    if (statusFilter === "offline") return !deviceOnline(d);
    if (statusFilter === "risk") return postureIssues(d).length > 0;
    if (statusFilter === "outdated") return latestAgent && d.os_type !== "windows" && d.agent_version !== latestAgent;
    return true;
  }), [devices, statusFilter, latestAgent]);

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true); setDeleteError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const r = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-device?id=${deleteTarget.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
      });
      if (!r.ok) throw new Error(`Server returned ${r.status}`);
      qc.invalidateQueries({ queryKey: ["all-devices"] });
      setDeleteTarget(null);
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  const columns: Column<Row>[] = [
    {
      key: "hostname", header: "Device",
      render: d => (
        <div className="flex items-center gap-2.5 min-w-0">
          {d.os_type === "windows" ? <Monitor className="w-4 h-4 shrink-0" style={{ color: "var(--sev-low)" }} />
            : <Apple className="w-4 h-4 shrink-0" style={{ color: "var(--c-muted)" }} />}
          <div className="min-w-0">
            <p className="font-medium truncate max-w-[260px]" style={{ color: "var(--c-strong)" }}>{d.hostname}</p>
            <p className="text-[11.5px] truncate max-w-[260px]" style={{ color: "var(--c-muted)" }}>
              {d.assigned_user || d.active_user || "Unassigned"} · {d.serial_number}
            </p>
          </div>
        </div>
      ),
      value: d => d.hostname,
    },
    { key: "status", header: "Status", value: d => (deviceOnline(d) ? "Online" : "Offline"),
      render: d => <Badge tone={deviceOnline(d) ? "ok" : "neutral"} dot>{deviceOnline(d) ? "Online" : "Offline"}</Badge> },
    { key: "os_version", header: "OS", hideBelow: "md", value: d => `${d.os_type === "windows" ? "Windows" : "macOS"} ${d.os_version ?? ""}`.trim() },
    { key: "group", header: "Group", hideBelow: "lg", value: d => groupName(d.group_id) ?? "",
      render: d => groupName(d.group_id) ? <Badge tone="accent">{groupName(d.group_id)}</Badge> : <span style={{ color: "var(--c-muted)" }}>—</span> },
    { key: "posture", header: "Posture", sortable: true, value: d => postureIssues(d).length,
      render: d => (
        <div className="flex items-center gap-2">
          <PostureIcons d={d} />
          {postureIssues(d).length > 0 && <Badge tone="high">{postureIssues(d).length} issue{postureIssues(d).length > 1 ? "s" : ""}</Badge>}
        </div>
      ) },
    { key: "agent_version", header: "Agent", hideBelow: "lg",
      render: d => d.os_type === "windows" ? <span style={{ color: "var(--c-muted)" }}>—</span>
        : !d.agent_version ? <Badge tone="medium">Legacy</Badge>
        : <span className="inline-flex items-center gap-1.5 font-mono text-[12px]">
            {d.agent_version}
            {latestAgent && d.agent_version !== latestAgent && <Badge tone="medium">Updating</Badge>}
          </span> },
    { key: "last_seen", header: "Last seen", value: d => d.last_seen ?? "", render: d => (
      <span title={d.last_seen ? new Date(d.last_seen).toLocaleString() : ""}>{d.last_seen ? timeAgo(d.last_seen) : "Never"}</span>) },
    { key: "actions", header: "", sortable: false, align: "right", width: "80px", render: d => (
      <div className="flex items-center justify-end gap-1" onClick={e => e.stopPropagation()}>
        <button onClick={() => navigate(`/device/${d.id}`)} title="Open device" className="p-1.5 rounded hover:bg-[var(--c-card2)]" style={{ color: "var(--c-muted)" }}>
          <ExternalLink className="w-4 h-4" />
        </button>
        <button onClick={() => { setDeleteError(null); setDeleteTarget(d); }} title="Remove from console" className="p-1.5 rounded hover:bg-[var(--c-card2)]" style={{ color: "var(--c-muted)" }}>
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    ) },
  ];

  const filters: FilterDef<Row>[] = [
    ...(os ? [] : [{ key: "os", label: "OS", options: [{ value: "mac", label: "macOS" }, { value: "windows", label: "Windows" }],
      get: (d: Row) => (d.os_type === "windows" ? "windows" : "mac") }]),
    { key: "group", label: "Group", options: groups.map(g => ({ value: g.id, label: g.name })), get: d => d.group_id ?? "" },
    { key: "posture", label: "Posture", options: [{ value: "ok", label: "Compliant" }, { value: "risk", label: "At risk" }],
      get: d => (postureIssues(d).length ? "risk" : "ok") },
  ];

  const title = os === "windows" ? "Windows Endpoints" : os === "mac" ? "macOS Endpoints" : "All Devices";

  return (
    <div className="flex flex-col min-h-full">
      <TopBar title={title} />
      <Page>
        <PageHeader
          title={title}
          crumbs={[{ label: "Endpoints" }, { label: title }]}
          description="Every enrolled endpoint with live status, security posture and agent version. Click a row to open it."
          actions={<Button icon={RefreshCw} onClick={() => refetch()} disabled={isFetching}>{isFetching ? "Refreshing…" : "Refresh"}</Button>}
        />

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
          <StatTile label="Total" icon={Laptop} value={devices.length} onClick={() => setStatusFilter(null)} active={statusFilter === null} />
          <StatTile label="Online" icon={Wifi} tone="ok" value={online} onClick={() => setStatusFilter("online")} active={statusFilter === "online"} />
          <StatTile label="Offline" icon={WifiOff} value={devices.length - online} onClick={() => setStatusFilter("offline")} active={statusFilter === "offline"} />
          <StatTile label="At risk" icon={ShieldAlert} tone={atRisk ? "high" : "ok"} value={atRisk} sub="Encryption / firewall / SIP off"
            onClick={() => setStatusFilter("risk")} active={statusFilter === "risk"} />
          <StatTile label="Agent updating" icon={Bot} tone={outdated ? "medium" : "ok"} value={outdated}
            sub={latestAgent ? `Latest ${latestAgent}` : undefined} onClick={() => setStatusFilter("outdated")} active={statusFilter === "outdated"} />
        </div>

        <DataTable
          rows={rows}
          columns={columns}
          rowKey={d => d.id}
          loading={isLoading}
          filters={filters}
          searchPlaceholder="Search hostname, user, serial…"
          searchText={d => [d.hostname, d.assigned_user, d.active_user, d.serial_number, d.os_version].join(" ")}
          initialSort={{ key: "hostname", dir: "asc" }}
          onRowClick={d => navigate(`/device/${d.id}`)}
          exportName="devices"
          empty="No devices enrolled yet — use Deploy agent in the sidebar."
          rowTone={d => (postureIssues(d).length ? "var(--sev-high)" : undefined)}
        />
      </Page>

      <Drawer
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Remove device from console"
        subtitle={deleteTarget?.hostname}
        width={440}
        footer={<>
          <Button onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button variant="danger" icon={Trash2} onClick={confirmDelete} disabled={deleting}>{deleting ? "Removing…" : "Remove device"}</Button>
        </>}
      >
        <p className="text-[13px]" style={{ color: "var(--c-text)" }}>
          This deletes the device record and its alerts, metrics and history from SparrowShield. It does not uninstall
          the agent — if the agent is still running it will enroll again on its next check-in.
        </p>
        {deleteError && <p className="mt-3 text-[12.5px]" style={{ color: "var(--sev-critical)" }}>Could not remove: {deleteError}</p>}
      </Drawer>
    </div>
  );
}
