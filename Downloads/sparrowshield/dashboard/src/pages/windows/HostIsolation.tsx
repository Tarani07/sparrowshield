import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { WifiOff, Wifi, ShieldAlert, Monitor, Laptop, RefreshCw, Loader2, Unlock, Lock, Clock, Info } from "lucide-react";
import TopBar from "../../components/layout/TopBar";
import { supabase } from "../../lib/supabase";
import { timeAgo } from "../../lib/utils";
import {
  Page, PageHeader, Panel, StatTile, DataTable, Badge, Button, Drawer, KeyValue,
  type Column, type FilterDef,
} from "../../components/ui";

interface WinDevice {
  id: string;
  hostname: string | null;
  os_version: string | null;
  assigned_user: string | null;
  last_seen: string | null;
  isolated: boolean | null;
}

interface IsoCommand {
  id: string;
  device_id: string;
  command_type: "isolate" | "unisolate";
  status: string;
  result: string | null;
  created_at: string;
}

type Feedback = { tone: "ok" | "critical"; text: string };

const isOnline = (d: WinDevice) => !!d.last_seen && (Date.now() - new Date(d.last_seen).getTime()) / 60000 <= 15;
const inFlight = (c?: IsoCommand) => !!c && (c.status === "pending" || c.status === "running");

function stateOf(d: WinDevice): "isolated" | "online" | "offline" {
  if (d.isolated) return "isolated";
  return isOnline(d) ? "online" : "offline";
}

export default function HostIsolation() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [stateFilter, setStateFilter] = useState<"isolated" | "online" | "offline" | null>(null);
  const [feedback, setFeedback] = useState<Record<string, Feedback>>({});

  // Own query: the shared fleet hook does not select `isolated`, which left every
  // device looking "not isolated" on this page.
  const { data: devices = [], isLoading, error } = useQuery<WinDevice[]>({
    queryKey: ["host-isolation-devices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("devices")
        .select("id, hostname, os_version, assigned_user, last_seen, isolated")
        .eq("os_type", "windows")
        .order("hostname");
      if (error) throw error;
      return (data ?? []) as WinDevice[];
    },
    refetchInterval: 15_000,
  });

  // Latest isolate / unisolate command per device drives the in-progress state.
  const { data: commands = [] } = useQuery<IsoCommand[]>({
    queryKey: ["isolation-commands"],
    queryFn: async () => (await supabase.from("device_commands")
      .select("id, device_id, command_type, status, result, created_at")
      .in("command_type", ["isolate", "unisolate"])
      .order("created_at", { ascending: false }).limit(200)).data as IsoCommand[] ?? [],
    refetchInterval: 5_000,
  });
  const lastCmd = (id: string) => commands.find(c => c.device_id === id);

  const send = useMutation({
    mutationFn: async ({ deviceId, cmd }: { deviceId: string; cmd: "isolate" | "unisolate" }) => {
      const { error } = await supabase.from("device_commands").insert({
        device_id:    deviceId,
        command_type: cmd,
        payload:      {},
        status:       "pending",
      });
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      setFeedback(f => ({ ...f, [v.deviceId]: { tone: "ok", text: v.cmd === "isolate" ? "Isolation queued — the agent applies it within seconds." : "Release queued — network access will be restored shortly." } }));
      qc.invalidateQueries({ queryKey: ["isolation-commands"] });
      qc.invalidateQueries({ queryKey: ["host-isolation-devices"] });
    },
    onError: (e, v) => setFeedback(f => ({ ...f, [v.deviceId]: { tone: "critical", text: `Failed to send ${v.cmd}: ${(e as Error).message}` } })),
  });

  const isolated = devices.filter(d => d.isolated);
  const online   = devices.filter(d => !d.isolated && isOnline(d));
  const offline  = devices.filter(d => !d.isolated && !isOnline(d));
  const pending  = devices.filter(d => inFlight(lastCmd(d.id)));
  const rows = stateFilter ? devices.filter(d => stateOf(d) === stateFilter) : devices;
  const selected = devices.find(d => d.id === selectedId) ?? null;

  function stateBadge(d: WinDevice) {
    const s = stateOf(d);
    if (s === "isolated") return <Badge tone="critical"><WifiOff className="w-3 h-3" /> Isolated</Badge>;
    if (s === "online") return <Badge tone="ok"><Wifi className="w-3 h-3" /> Online</Badge>;
    return <Badge tone="neutral"><WifiOff className="w-3 h-3" /> Offline</Badge>;
  }

  function cmdBadge(c?: IsoCommand) {
    if (!c) return <span style={{ color: "var(--c-muted)" }}>—</span>;
    const label = c.command_type === "isolate" ? "Isolate" : "Release";
    if (inFlight(c)) return <Badge tone="accent"><Loader2 className="w-3 h-3 animate-spin" />{c.command_type === "isolate" ? "Isolating…" : "Releasing…"}</Badge>;
    if (c.status === "failed") return <span title={c.result ?? ""}><Badge tone="critical">{label} failed</Badge></span>;
    return <span className="text-[12px]" style={{ color: "var(--c-muted)" }}>{label} {c.status} · {timeAgo(c.created_at)}</span>;
  }

  /** Isolation opens the drawer to confirm; release is sent directly. */
  function actionButton(d: WinDevice, inDrawer = false) {
    const c = lastCmd(d.id);
    if (inFlight(c)) return <Button size="sm" disabled icon={Loader2}>Working…</Button>;
    const busy = send.isPending && send.variables?.deviceId === d.id;
    if (d.isolated) {
      return (
        <Button size="sm" variant={inDrawer ? "primary" : "secondary"} icon={Unlock} disabled={busy}
          onClick={() => send.mutate({ deviceId: d.id, cmd: "unisolate" })}>
          {busy ? "Sending…" : "Release"}
        </Button>
      );
    }
    const off = !isOnline(d);
    return (
      <Button size="sm" variant="danger" icon={Lock} disabled={busy || off}
        title={off ? "Device is offline — cannot send isolation command" : "Cut off all network traffic except SparrowShield"}
        onClick={() => (inDrawer ? send.mutate({ deviceId: d.id, cmd: "isolate" }) : setSelectedId(d.id))}>
        {busy ? "Sending…" : inDrawer ? "Confirm isolation" : "Isolate…"}
      </Button>
    );
  }

  const columns: Column<WinDevice>[] = [
    { key: "hostname", header: "Host", value: d => d.hostname ?? "", render: d => (
      <div className="flex items-center gap-2.5 min-w-0">
        <Monitor className="w-4 h-4 shrink-0" style={{ color: "var(--c-muted)" }} />
        <div className="min-w-0">
          <p className="font-medium truncate max-w-[240px]" style={{ color: "var(--c-strong)" }}>{d.hostname ?? "—"}</p>
          <p className="text-[11.5px] truncate" style={{ color: "var(--c-muted)" }}>{d.os_version ?? "Windows"}</p>
        </div>
      </div>) },
    { key: "assigned_user", header: "User", hideBelow: "md", value: d => d.assigned_user ?? "" },
    { key: "state", header: "Network state", value: d => stateOf(d), render: stateBadge },
    { key: "last_cmd", header: "Last action", hideBelow: "lg", value: d => lastCmd(d.id)?.created_at ?? "", render: d => cmdBadge(lastCmd(d.id)) },
    { key: "last_seen", header: "Last seen", hideBelow: "md", value: d => d.last_seen ?? "",
      render: d => d.last_seen ? <span title={new Date(d.last_seen).toLocaleString()}>{timeAgo(d.last_seen)}</span> : "never" },
    { key: "actions", header: "", sortable: false, align: "right", width: "150px",
      render: d => <div onClick={e => e.stopPropagation()}>{actionButton(d)}</div> },
  ];

  const filters: FilterDef<WinDevice>[] = [
    { key: "user", label: "User", options: [...new Set(devices.map(d => d.assigned_user).filter(Boolean) as string[])].sort().map(u => ({ value: u, label: u })),
      get: d => d.assigned_user ?? "" },
  ];

  const tile = (key: "isolated" | "online" | "offline") => () => setStateFilter(f => (f === key ? null : key));

  return (
    <div className="flex flex-col min-h-full">
      <TopBar title="Host Isolation" />
      <Page>
        <PageHeader
          title="Host Isolation"
          icon={ShieldAlert}
          crumbs={[{ label: "Windows Console" }, { label: "Host Isolation" }]}
          description="Contain a compromised Windows endpoint. Isolation blocks all network traffic via Windows Firewall, except the SparrowShield management channel so you can release it remotely."
          actions={<Button icon={RefreshCw} onClick={() => { qc.invalidateQueries({ queryKey: ["host-isolation-devices"] }); qc.invalidateQueries({ queryKey: ["isolation-commands"] }); }}>Refresh</Button>}
        />

        {error && <p className="mb-3 text-[12.5px]" style={{ color: "var(--sev-critical)" }}>Could not load Windows devices: {(error as Error).message}</p>}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <StatTile label="Windows endpoints" icon={Laptop} tone="neutral" value={devices.length}
            onClick={() => setStateFilter(null)} active={!stateFilter} />
          <StatTile label="Isolated" icon={WifiOff} tone={isolated.length ? "critical" : "ok"} value={isolated.length}
            sub={isolated.length ? "Contained — network blocked" : "No hosts contained"} onClick={tile("isolated")} active={stateFilter === "isolated"} />
          <StatTile label="Online" icon={Wifi} tone="ok" value={online.length} sub="Can be isolated now" onClick={tile("online")} active={stateFilter === "online"} />
          <StatTile label="Offline" icon={Clock} tone={offline.length ? "medium" : "neutral"} value={offline.length}
            sub={pending.length ? `${pending.length} command${pending.length === 1 ? "" : "s"} in progress` : "Not reporting > 15 min"}
            onClick={tile("offline")} active={stateFilter === "offline"} />
        </div>

        {isolated.length > 0 && !stateFilter && (
          <Panel title={`Currently isolated (${isolated.length})`} subtitle="These hosts can only reach the SparrowShield console" className="mb-4" noPad>
            <ul>
              {isolated.map(d => (
                <li key={d.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 border-b" style={{ borderColor: "var(--c-divider)" }}>
                  <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: "var(--sev-critical)" }} />
                  <button onClick={() => setSelectedId(d.id)} className="flex-1 min-w-[140px] text-left text-[13px] font-medium truncate hover:underline" style={{ color: "var(--c-strong)" }}>
                    {d.hostname ?? d.id}
                  </button>
                  <span className="text-[12px]" style={{ color: "var(--c-muted)" }}>{d.assigned_user ?? "—"}</span>
                  {cmdBadge(lastCmd(d.id))}
                  {actionButton(d)}
                </li>
              ))}
            </ul>
          </Panel>
        )}

        {Object.entries(feedback).length > 0 && (
          <div className="mb-3 space-y-1.5">
            {Object.entries(feedback).map(([id, fb]) => (
              <div key={id} className="flex items-center gap-2 rounded-md border px-3 py-2 text-[12.5px]"
                style={{ color: `var(${fb.tone === "ok" ? "--ok" : "--sev-critical"})`, borderColor: "var(--c-border)", background: "var(--c-card)" }}>
                <span className="font-semibold">{devices.find(d => d.id === id)?.hostname ?? id}:</span>
                <span className="flex-1">{fb.text}</span>
                <button className="text-[12px] underline" style={{ color: "var(--c-muted)" }}
                  onClick={() => setFeedback(f => { const n = { ...f }; delete n[id]; return n; })}>Dismiss</button>
              </div>
            ))}
          </div>
        )}

        <DataTable
          rows={rows}
          columns={columns}
          rowKey={d => d.id}
          loading={isLoading}
          filters={filters}
          searchPlaceholder="Search hosts or users…"
          initialSort={{ key: "state", dir: "asc" }}
          onRowClick={d => setSelectedId(d.id)}
          selectedKey={selectedId}
          exportName="host-isolation"
          rowTone={d => (d.isolated ? "var(--sev-critical)" : undefined)}
          empty={devices.length === 0 ? "No Windows devices enrolled." : "No devices in this state."}
          toolbar={stateFilter ? <Button size="sm" variant="ghost" onClick={() => setStateFilter(null)}>State: {stateFilter} ×</Button> : undefined}
        />
      </Page>

      <Drawer
        open={!!selected}
        onClose={() => setSelectedId(null)}
        title={selected?.hostname ?? ""}
        subtitle={selected && <span className="flex items-center gap-2">{stateBadge(selected)} {selected.os_version ?? "Windows"}</span>}
        footer={selected && <>
          <Button icon={Laptop} onClick={() => navigate(`/device/${selected.id}`)}>Open device</Button>
          {actionButton(selected, true)}
        </>}
      >
        {selected && (
          <div className="space-y-5">
            <KeyValue items={[
              { label: "Device", value: <Link className="hover:underline" style={{ color: "var(--c-accent)" }} to={`/device/${selected.id}`}>{selected.hostname ?? selected.id}</Link> },
              { label: "User", value: selected.assigned_user ?? "—" },
              { label: "Network state", value: stateBadge(selected) },
              { label: "Last seen", value: selected.last_seen ? new Date(selected.last_seen).toLocaleString() : "never" },
              { label: "Last action", value: cmdBadge(lastCmd(selected.id)) },
            ]} />
            {feedback[selected.id] && (
              <p className="text-[12.5px]" style={{ color: `var(${feedback[selected.id].tone === "ok" ? "--ok" : "--sev-critical"})` }}>{feedback[selected.id].text}</p>
            )}
            <div className="rounded-md border p-3 text-[12.5px] flex gap-2.5" style={{ borderColor: "var(--c-border)", background: "var(--c-card2)", color: "var(--c-text)" }}>
              <Info className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "var(--c-accent)" }} />
              {selected.isolated ? (
                <p>This host is contained. <b>Release</b> restores normal network access; the agent removes the isolation firewall rules on its next check-in.</p>
              ) : (
                <p><b>Isolate</b> immediately blocks all inbound and outbound traffic on this host except the SparrowShield management channel.
                  The user will lose internet and network-share access until you release it.{!isOnline(selected) && " The device is offline, so isolation cannot be sent right now."}</p>
              )}
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
