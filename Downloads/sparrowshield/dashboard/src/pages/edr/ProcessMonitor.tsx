import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Cpu, MemoryStick, Laptop, Activity, XCircle, CheckCircle2, AlertTriangle, X, Info } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { timeAgo } from "../../lib/utils";
import TopBar from "../../components/layout/TopBar";
import {
  Page, PageHeader, StatTile, DataTable, Badge, StatusBadge, Button, Drawer, KeyValue, Tabs,
  type Column, type FilterDef,
} from "../../components/ui";

/* The Mac agent reports top_processes as {process_name, cpu_pct, ram_mb}; older builds used
   {name, pid, cpu, mem}. Both shapes are normalised here. */
type RawProc = { name?: string; process_name?: string; pid?: number; cpu?: number; cpu_pct?: number; mem?: number; ram_mb?: number };

interface Device {
  id: string;
  hostname: string;
  status: string;
  os_type: string | null;
  last_seen: string | null;
  top_processes: RawProc[] | null;
}

interface ProcRow {
  key: string;
  name: string;
  pid: number | null;
  cpu: number;
  ramMb: number | null;
  memPct: number | null;
  hostname: string;
  deviceId: string;
  online: boolean;
  os: string | null;
}

type Flash = { tone: "ok" | "error"; text: string } | null;
const MAC_OS = ["mac", "macos", "darwin"];
const isMac = (os?: string | null) => MAC_OS.includes((os ?? "").toLowerCase());

function Meter({ pct, label }: { pct: number; label: string }) {
  const color = pct > 80 ? "var(--sev-critical)" : pct > 40 ? "var(--sev-medium)" : "var(--ok)";
  return (
    <div className="flex items-center gap-2 justify-end">
      <div className="w-16 h-1.5 rounded-full overflow-hidden hidden sm:block" style={{ background: "var(--c-border2)" }}>
        <div className="h-full rounded-full" style={{ width: `${Math.min(pct, 100)}%`, background: color }} />
      </div>
      <span className="tabular-nums text-[12px] w-14 text-right" style={{ color: "var(--c-strong)" }}>{label}</span>
    </div>
  );
}

export default function ProcessMonitor() {
  const navigate = useNavigate();
  const [scope, setScope] = useState<"online" | "all">("online");
  const [hot, setHot] = useState<"cpu" | "ram" | null>(null);
  const [selected, setSelected] = useState<ProcRow | null>(null);
  const [flash, setFlash] = useState<Flash>(null);
  const [confirmKill, setConfirmKill] = useState(false);

  const { data: devices = [], isLoading, error } = useQuery<Device[]>({
    queryKey: ["edr-processes"],
    queryFn: async () => {
      const { data, error: e } = await supabase
        .from("devices")
        .select("id, hostname, status, os_type, last_seen, top_processes")
        .order("hostname");
      if (e) throw e;
      return (data ?? []) as Device[];
    },
    refetchInterval: 30_000,
  });

  const kill = useMutation({
    mutationFn: async (p: ProcRow) => {
      const { error: e } = await supabase.from("device_commands").insert({
        device_id: p.deviceId, command_type: "kill_process", payload: { process_name: p.name },
      });
      if (e) throw e;
      return p;
    },
    onSuccess: p => { setFlash({ tone: "ok", text: `Kill "${p.name}" queued for ${p.hostname}. The agent runs it on its next check-in.` }); setConfirmKill(false); },
    onError: e => setFlash({ tone: "error", text: `Could not queue kill: ${(e as Error).message}` }),
  });

  const scoped = devices.filter(d => (scope === "online" ? d.status === "online" : true));

  const allProcs: ProcRow[] = useMemo(() => scoped.flatMap(d =>
    (Array.isArray(d.top_processes) ? d.top_processes : []).map((p, i) => ({
      key: `${d.id}:${i}:${p.process_name ?? p.name ?? ""}`,
      name: p.process_name ?? p.name ?? "unknown",
      pid: p.pid ?? null,
      cpu: Number(p.cpu_pct ?? p.cpu ?? 0),
      ramMb: p.ram_mb != null ? Number(p.ram_mb) : null,
      memPct: p.mem != null ? Number(p.mem) : null,
      hostname: d.hostname,
      deviceId: d.id,
      online: d.status === "online",
      os: d.os_type,
    }))), [scoped]);

  const rows = allProcs.filter(p => (hot === "cpu" ? p.cpu > 40 : hot === "ram" ? (p.ramMb ?? 0) > 1024 || (p.memPct ?? 0) > 20 : true));

  const hotCpu = allProcs.filter(p => p.cpu > 40).length;
  const hotRam = allProcs.filter(p => (p.ramMb ?? 0) > 1024 || (p.memPct ?? 0) > 20).length;
  const reporting = scoped.filter(d => Array.isArray(d.top_processes) && d.top_processes.length > 0).length;
  const onlineCount = devices.filter(d => d.status === "online").length;
  const hosts = [...new Set(allProcs.map(p => p.hostname))].sort();

  const columns: Column<ProcRow>[] = [
    { key: "name", header: "Process", value: p => p.name,
      render: p => <span className="font-mono text-[12px] font-medium truncate max-w-[320px] inline-block align-middle" style={{ color: "var(--c-strong)" }}>{p.name}</span> },
    { key: "pid", header: "PID", hideBelow: "lg", value: p => p.pid ?? "",
      render: p => <span className="font-mono text-[12px]" style={{ color: "var(--c-muted)" }}>{p.pid ?? "—"}</span> },
    { key: "hostname", header: "Device", hideBelow: "md", value: p => p.hostname },
    { key: "cpu", header: "CPU", align: "right", value: p => p.cpu, render: p => <Meter pct={p.cpu} label={`${p.cpu.toFixed(1)}%`} /> },
    { key: "mem", header: "Memory", align: "right", value: p => p.ramMb ?? p.memPct ?? 0,
      render: p => p.ramMb != null
        ? <span className="tabular-nums text-[12px]" style={{ color: "var(--c-strong)" }}>{p.ramMb >= 1024 ? `${(p.ramMb / 1024).toFixed(1)} GB` : `${Math.round(p.ramMb)} MB`}</span>
        : p.memPct != null ? <Meter pct={p.memPct} label={`${p.memPct.toFixed(1)}%`} /> : <span style={{ color: "var(--c-muted)" }}>—</span> },
    { key: "online", header: "Host", hideBelow: "md", value: p => (p.online ? "Online" : "Offline"),
      render: p => <StatusBadge online={p.online} /> },
  ];

  const filters: FilterDef<ProcRow>[] = [
    { key: "device", label: "Device", options: hosts.map(h => ({ value: h, label: h })), get: p => p.hostname },
  ];

  const selDevice = selected ? devices.find(d => d.id === selected.deviceId) : null;

  return (
    <div className="flex flex-col min-h-full">
      <TopBar title="Process Monitor" />
      <Page>
        <PageHeader
          title="Process Monitor"
          icon={Cpu}
          crumbs={[{ label: "Detection & Response" }, { label: "Process Monitor" }]}
          description="Top resource-consuming processes from each endpoint's latest heartbeat. Select a process to inspect it or terminate it remotely."
        />

        {flash && (
          <div role="status" className="mb-4 flex items-start gap-2 rounded-md border px-3 py-2 text-[13px]"
            style={{ borderColor: `color-mix(in srgb, ${flash.tone === "ok" ? "var(--ok)" : "var(--sev-critical)"} 40%, transparent)`, color: "var(--c-strong)" }}>
            {flash.tone === "ok" ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "var(--ok)" }} /> : <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: "var(--sev-critical)" }} />}
            <span className="flex-1">{flash.text}</span>
            <button onClick={() => setFlash(null)} aria-label="Dismiss" style={{ color: "var(--c-muted)" }}><X className="w-3.5 h-3.5" /></button>
          </div>
        )}
        {error && (
          <div className="mb-4 rounded-md border px-3 py-2 text-[13px]" style={{ borderColor: "var(--sev-critical)", color: "var(--c-strong)" }}>
            Could not load processes: {(error as Error).message}
          </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <StatTile label="Processes" icon={Activity} tone="accent" value={allProcs.length}
            sub={`${reporting} device${reporting === 1 ? "" : "s"} reporting`} onClick={() => setHot(null)} active={!hot} />
          <StatTile label="High CPU (>40%)" icon={Cpu} tone={hotCpu ? "high" : "ok"} value={hotCpu}
            onClick={() => setHot(hot === "cpu" ? null : "cpu")} active={hot === "cpu"} />
          <StatTile label="High memory (>1 GB)" icon={MemoryStick} tone={hotRam ? "medium" : "ok"} value={hotRam}
            onClick={() => setHot(hot === "ram" ? null : "ram")} active={hot === "ram"} />
          <StatTile label="Online devices" icon={Laptop} tone="ok" value={`${onlineCount}/${devices.length}`}
            sub={scope === "online" ? "Showing online only" : "Showing all devices"}
            onClick={() => setScope(scope === "online" ? "all" : "online")} active={scope === "online"} />
        </div>

        <div className="mb-3">
          <Tabs value={scope} onChange={setScope} tabs={[
            { id: "online", label: "Online devices", count: onlineCount },
            { id: "all", label: "All devices (last report)", count: devices.length },
          ]} />
        </div>

        <DataTable
          rows={rows}
          columns={columns}
          rowKey={p => p.key}
          loading={isLoading}
          filters={filters}
          searchPlaceholder="Search process or device…"
          initialSort={{ key: "cpu", dir: "desc" }}
          onRowClick={p => { setSelected(p); setConfirmKill(false); }}
          selectedKey={selected?.key}
          exportName="processes"
          rowTone={p => (p.cpu > 80 ? "var(--sev-critical)" : p.cpu > 40 ? "var(--sev-medium)" : undefined)}
          empty={scope === "online" ? "No online device is reporting processes. Switch to “All devices” to see the last report from offline hosts." : "No process data reported yet."}
          toolbar={hot ? <Badge tone="accent">{hot === "cpu" ? "High CPU" : "High memory"}
            <button onClick={() => setHot(null)} aria-label="Clear filter"><X className="w-3 h-3" /></button></Badge> : undefined}
        />
      </Page>

      <Drawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.name ?? ""}
        subtitle={selected?.hostname}
        footer={selected && <>
          <Button icon={Laptop} onClick={() => navigate(`/device/${selected.deviceId}`)}>Open device</Button>
          {isMac(selected.os) && (confirmKill ? (
            <>
              <Button variant="ghost" onClick={() => setConfirmKill(false)}>Cancel</Button>
              <Button variant="danger" icon={XCircle} disabled={kill.isPending} onClick={() => kill.mutate(selected)}>Confirm kill</Button>
            </>
          ) : (
            <Button variant="danger" icon={XCircle} onClick={() => setConfirmKill(true)}>Kill process</Button>
          ))}
        </>}
      >
        {selected && (
          <div className="space-y-6">
            {flash && (
              <p className="text-[12.5px]" style={{ color: flash.tone === "ok" ? "var(--ok)" : "var(--sev-critical)" }}>{flash.text}</p>
            )}
            <KeyValue items={[
              { label: "Process", value: <span className="font-mono">{selected.name}</span> },
              { label: "PID", value: selected.pid ?? "—" },
              { label: "CPU", value: `${selected.cpu.toFixed(1)}%` },
              { label: "Memory", value: selected.ramMb != null ? `${Math.round(selected.ramMb)} MB` : selected.memPct != null ? `${selected.memPct.toFixed(1)}%` : "—" },
              { label: "Device", value: <Link className="hover:underline" style={{ color: "var(--c-accent)" }} to={`/device/${selected.deviceId}`}>{selected.hostname}</Link> },
              { label: "Device status", value: <StatusBadge online={selected.online} /> },
              { label: "Reported", value: selDevice?.last_seen ? timeAgo(selDevice.last_seen) : "—" },
            ]} />
            {confirmKill && (
              <p className="text-[12.5px]" style={{ color: "var(--c-muted)" }}>
                Every instance named “{selected.name}” on {selected.hostname} will be terminated; helper processes also close their parent app so it does not respawn.
              </p>
            )}
            {!isMac(selected.os) && (
              <p className="text-[12.5px] flex items-center gap-2" style={{ color: "var(--c-muted)" }}>
                <Info className="w-3.5 h-3.5" /> Remote process termination is only supported by the macOS agent.
              </p>
            )}
            {isMac(selected.os) && !selected.online && (
              <p className="text-[12.5px] flex items-center gap-2" style={{ color: "var(--c-muted)" }}>
                <Info className="w-3.5 h-3.5" /> This device is offline; a kill command will run when it reconnects.
              </p>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}
