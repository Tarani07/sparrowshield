import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Network, AlertTriangle, Laptop, Plug, Wifi, Activity, X } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { supabase } from "../../lib/supabase";
import { timeAgo } from "../../lib/utils";
import TopBar from "../../components/layout/TopBar";
import {
  Page, PageHeader, Panel, StatTile, DataTable, Badge, StatusBadge, Button, Drawer, KeyValue, EmptyState,
  type Column, type FilterDef,
} from "../../components/ui";

interface Device {
  id: string;
  hostname: string;
  status: string;
  os_type: string | null;
  last_seen: string | null;
  listening_ports: Array<{ port: number; protocol: string; process: string }> | null;
  open_connections_count: number | null;
  public_ip: string | null;
}

interface PortRow {
  key: string;
  port: number;
  protocol: string;
  process: string;
  hostname: string;
  deviceId: string;
  online: boolean;
  suspicious: boolean;
}

const SUSPICIOUS_PORTS = new Set([4444, 1337, 31337, 4545, 6666, 7777, 12345, 54321, 9999, 5555]);

export default function NetworkActivity({ osFilter }: { osFilter?: "mac" | "windows" }) {
  const navigate = useNavigate();
  const [view, setView] = useState<"all" | "suspicious" | "online">("all");
  const [selected, setSelected] = useState<PortRow | null>(null);

  const { data: devices = [], isLoading, error } = useQuery<Device[]>({
    queryKey: ["edr-network", osFilter],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q: any = supabase
        .from("devices")
        .select("id, hostname, status, os_type, last_seen, listening_ports, open_connections_count, public_ip")
        .order("hostname");
      if (osFilter === "mac") q = q.in("os_type", ["mac", "macos", "darwin"]);
      if (osFilter === "windows") q = q.eq("os_type", "windows");
      const { data, error: e } = await q;
      if (e) throw e;
      return (data ?? []) as Device[];
    },
    refetchInterval: 30_000,
  });

  const allPorts: PortRow[] = useMemo(() => devices.flatMap(d =>
    (Array.isArray(d.listening_ports) ? d.listening_ports : []).map((p, i) => ({
      key: `${d.id}:${p.protocol}:${p.port}:${i}`,
      port: Number(p.port),
      protocol: String(p.protocol ?? "").toLowerCase(),
      process: p.process ?? "",
      hostname: d.hostname,
      deviceId: d.id,
      online: d.status === "online",
      suspicious: SUSPICIOUS_PORTS.has(Number(p.port)),
    }))), [devices]);

  const suspiciousCount = allPorts.filter(p => p.suspicious).length;
  const onlineDevices = devices.filter(d => d.status === "online").length;
  const totalConns = devices.reduce((s, d) => s + (d.open_connections_count ?? 0), 0);
  const reporting = devices.filter(d => Array.isArray(d.listening_ports) && d.listening_ports.length > 0).length;

  const rows = allPorts.filter(p => (view === "suspicious" ? p.suspicious : view === "online" ? p.online : true));

  const connData = devices
    .filter(d => d.open_connections_count != null)
    .map(d => ({ host: d.hostname, conns: d.open_connections_count ?? 0, id: d.id }))
    .sort((a, b) => b.conns - a.conns)
    .slice(0, 12);

  const hosts = [...new Set(allPorts.map(p => p.hostname))].sort();
  const protocols = [...new Set(allPorts.map(p => p.protocol).filter(Boolean))].sort();

  const columns: Column<PortRow>[] = [
    { key: "port", header: "Port", width: "90px", value: p => p.port,
      render: p => <span className="font-mono font-semibold" style={{ color: p.suspicious ? "var(--sev-critical)" : "var(--c-strong)" }}>{p.port}</span> },
    { key: "protocol", header: "Protocol", width: "90px", value: p => p.protocol,
      render: p => <span className="font-mono uppercase text-[12px]" style={{ color: "var(--c-muted)" }}>{p.protocol || "—"}</span> },
    { key: "process", header: "Process", value: p => p.process,
      render: p => <span className="font-mono text-[12px]" style={{ color: "var(--c-strong)" }}>{p.process || "—"}</span> },
    { key: "hostname", header: "Device", hideBelow: "md", value: p => p.hostname },
    { key: "flag", header: "Assessment", value: p => (p.suspicious ? "Suspicious" : "Normal"),
      render: p => p.suspicious
        ? <Badge tone="critical"><AlertTriangle className="w-3 h-3" /> Suspicious</Badge>
        : <span style={{ color: "var(--c-muted)" }}>—</span> },
  ];

  const filters: FilterDef<PortRow>[] = [
    { key: "device", label: "Device", options: hosts.map(h => ({ value: h, label: h })), get: p => p.hostname },
    { key: "protocol", label: "Protocol", options: protocols.map(p => ({ value: p, label: p.toUpperCase() })), get: p => p.protocol },
  ];

  const selDevice = selected ? devices.find(d => d.id === selected.deviceId) : null;
  const sameDevicePorts = selected ? allPorts.filter(p => p.deviceId === selected.deviceId) : [];
  const osName = osFilter === "mac" ? "macOS" : osFilter === "windows" ? "Windows" : null;

  return (
    <div className="flex flex-col min-h-full">
      <TopBar title={osName ? `${osName} Network` : "Network Activity"} />
      <Page>
        <PageHeader
          title="Network Activity"
          icon={Network}
          crumbs={[{ label: "Detection & Response" }, ...(osName ? [{ label: osName }] : []), { label: "Network" }]}
          description={`Listening ports and open connections reported by ${osName ?? "all"} endpoints. Ports commonly used by backdoors and C2 tooling are flagged.`}
        />

        {error && (
          <div className="mb-4 rounded-md border px-3 py-2 text-[13px]" style={{ borderColor: "var(--sev-critical)", color: "var(--c-strong)" }}>
            Could not load network data: {(error as Error).message}
          </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <StatTile label="Listening ports" icon={Plug} tone="accent" value={allPorts.length}
            sub={`${reporting} device${reporting === 1 ? "" : "s"} reporting`}
            onClick={() => setView("all")} active={view === "all"} />
          <StatTile label="Suspicious ports" icon={AlertTriangle} tone={suspiciousCount ? "critical" : "ok"} value={suspiciousCount}
            sub="Known backdoor / C2 ports" onClick={() => setView(view === "suspicious" ? "all" : "suspicious")} active={view === "suspicious"} />
          <StatTile label="Online devices" icon={Wifi} tone="ok" value={`${onlineDevices}/${devices.length}`}
            sub="Show ports on online hosts" onClick={() => setView(view === "online" ? "all" : "online")} active={view === "online"} />
          <StatTile label="Open connections" icon={Activity} tone="neutral" value={totalConns} sub="Sum of last reports" />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="xl:col-span-2 min-w-0">
            <DataTable
              rows={rows}
              columns={columns}
              rowKey={p => p.key}
              loading={isLoading}
              filters={filters}
              searchPlaceholder="Search port, process, device…"
              initialSort={{ key: "flag", dir: "desc" }}
              onRowClick={setSelected}
              selectedKey={selected?.key}
              exportName={osFilter ? `${osFilter}-listening-ports` : "listening-ports"}
              rowTone={p => (p.suspicious ? "var(--sev-critical)" : undefined)}
              empty="No port data yet — agents report listening ports on every heartbeat."
              toolbar={view !== "all" ? (
                <Badge tone="accent">{view === "suspicious" ? "Suspicious only" : "Online hosts"}
                  <button onClick={() => setView("all")} aria-label="Clear view filter"><X className="w-3 h-3" /></button>
                </Badge>) : undefined}
            />
          </div>

          <Panel title="Open connections by device" subtitle="From each device's latest heartbeat">
            {connData.length === 0 ? (
              <EmptyState title="No connection data" hint="Devices report their open connection count on each heartbeat." icon={Network} />
            ) : (
              <div style={{ height: Math.max(160, connData.length * 34) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={connData} layout="vertical" margin={{ left: 0, right: 16, top: 4, bottom: 4 }}>
                    <CartesianGrid stroke="var(--c-border)" strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" allowDecimals={false} tick={{ fill: "var(--c-muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="host" width={96} tick={{ fill: "var(--c-muted)", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip
                      cursor={{ fill: "var(--c-row-hover)" }}
                      contentStyle={{ background: "var(--c-card)", border: "1px solid var(--c-border2)", borderRadius: 6, fontSize: 12, color: "var(--c-strong)" }}
                      labelStyle={{ color: "var(--c-strong)" }}
                      itemStyle={{ color: "var(--c-text)" }}
                      formatter={(v: number) => [v, "Connections"]}
                    />
                    <Bar dataKey="conns" fill="var(--c-accent)" radius={[0, 3, 3, 0]} cursor="pointer"
                      onClick={(d: { id?: string }) => d?.id && navigate(`/device/${d.id}`)} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Panel>
        </div>
      </Page>

      <Drawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected ? `${selected.protocol.toUpperCase()} ${selected.port} — ${selected.process || "unknown process"}` : ""}
        subtitle={selected?.hostname}
        footer={selected && <Button icon={Laptop} onClick={() => navigate(`/device/${selected.deviceId}`)}>Open device</Button>}
      >
        {selected && (
          <div className="space-y-6">
            {selected.suspicious && (
              <div className="rounded-md border px-3 py-2 text-[12.5px] flex gap-2"
                style={{ borderColor: "color-mix(in srgb, var(--sev-critical) 40%, transparent)", background: "color-mix(in srgb, var(--sev-critical) 10%, transparent)", color: "var(--c-strong)" }}>
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "var(--sev-critical)" }} />
                Port {selected.port} is commonly used by reverse shells and C2 frameworks. Confirm the owning process is expected on this host.
              </div>
            )}
            <KeyValue items={[
              { label: "Port", value: <span className="font-mono">{selected.port}</span> },
              { label: "Protocol", value: selected.protocol.toUpperCase() || "—" },
              { label: "Process", value: <span className="font-mono">{selected.process || "—"}</span> },
              { label: "Device", value: <Link className="hover:underline" style={{ color: "var(--c-accent)" }} to={`/device/${selected.deviceId}`}>{selected.hostname}</Link> },
              { label: "Device status", value: <StatusBadge online={selected.online} /> },
              { label: "Public IP", value: selDevice?.public_ip ?? "—" },
              { label: "Open connections", value: selDevice?.open_connections_count ?? "—" },
              { label: "Last report", value: selDevice?.last_seen ? timeAgo(selDevice.last_seen) : "—" },
            ]} />
            <div>
              <h4 className="text-[11px] font-semibold uppercase tracking-[0.06em] mb-2" style={{ color: "var(--c-muted)" }}>
                Other listening ports on this device ({sameDevicePorts.length})
              </h4>
              <div className="flex flex-wrap gap-1.5">
                {sameDevicePorts.map(p => (
                  <button key={p.key} onClick={() => setSelected(p)}>
                    <Badge tone={p.suspicious ? "critical" : p.key === selected.key ? "accent" : "neutral"} className="font-mono">
                      {p.protocol}/{p.port}
                    </Badge>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
