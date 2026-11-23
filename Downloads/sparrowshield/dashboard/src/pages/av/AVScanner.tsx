import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ScanLine, ShieldCheck, AlertTriangle, Flame, RefreshCw, CheckCircle2, Check, RotateCcw, Laptop, X, History, FileSearch,
} from "lucide-react";
import { supabase } from "../../lib/supabase";
import { timeAgo } from "../../lib/utils";
import TopBar from "../../components/layout/TopBar";
import {
  Page, PageHeader, StatTile, DataTable, SeverityBadge, Badge, Button, Drawer, KeyValue, Tabs,
  SEVERITY_ORDER, type Column, type FilterDef,
} from "../../components/ui";

interface ThreatRow {
  id: string;
  device_id: string;
  hostname: string;
  os_type: string | null;
  alert_type: string;
  severity: string;
  message: string;
  rule_id: string | null;
  mitre_technique: string | null;
  created_at: string;
  resolved: boolean;
  resolved_at: string | null;
}

interface ScanRow {
  id: string;
  device_id: string;
  hostname: string | null;
  scan_type: string | null;
  status: string | null;
  threats_found: number | null;
  files_scanned: number | null;
  scan_duration_sec: number | null;
  threats: Array<{ path?: string; signature?: string; engine?: string; quarantined?: boolean }> | null;
  scanned_at: string;
  devices: { hostname: string | null; os_type: string | null } | null;
}

type Flash = { tone: "ok" | "error"; text: string } | null;

const MAC_OS = ["mac", "macos", "darwin"];
const THREAT_TYPES = ["malware", "c2_connection", "proc_suspicious_path", "shell_from_app",
  "crypto_miner_process", "malicious_app_installed", "tunneling_tool_detected", "shell_on_port"];
const typeLabel = (t: string) => t.replace(/_/g, " ").replace(/^\w/, c => c.toUpperCase());
const normSev = (s: string) => (s === "warning" ? "medium" : s);
const isWindows = (os?: string | null) => (os ?? "").toLowerCase() === "windows";
const isMac = (os?: string | null) => MAC_OS.includes((os ?? "").toLowerCase());

export default function AVScanner({ osFilter }: { osFilter?: "mac" | "windows" }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [scanning, setScanning] = useState(false);
  const [flash, setFlash] = useState<Flash>(null);
  const [tab, setTab] = useState<"threats" | "scans">("threats");
  const [status, setStatus] = useState<"active" | "resolved" | "all">("active");
  const [sev, setSev] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedScan, setSelectedScan] = useState<ScanRow | null>(null);

  const osName = osFilter === "mac" ? "macOS" : osFilter === "windows" ? "Windows" : null;

  const { data: threats = [], isLoading, refetch, error } = useQuery<ThreatRow[]>({
    queryKey: ["av-threats", osFilter],
    queryFn: async () => {
      // Resolve device IDs for the requested OS first
      let deviceIds: string[] | null = null;
      if (osFilter) {
        const osValues = osFilter === "mac" ? MAC_OS : ["windows"];
        const { data: devs, error: dErr } = await supabase.from("devices").select("id").in("os_type", osValues);
        if (dErr) throw dErr;
        deviceIds = (devs ?? []).map((d: { id: string }) => d.id);
        if (deviceIds.length === 0) return [];
      }
      let q = supabase
        .from("alerts")
        .select("id, device_id, alert_type, severity, message, rule_id, mitre_technique, created_at, resolved, resolved_at, devices(hostname, os_type)")
        .in("alert_type", THREAT_TYPES)
        .order("created_at", { ascending: false })
        .limit(500);
      if (deviceIds) q = q.in("device_id", deviceIds);
      const { data, error: e } = await q;
      if (e) throw e;
      return (data ?? []).map((r: Record<string, unknown>) => {
        const dev = r.devices as { hostname?: string; os_type?: string } | null;
        return { ...r, hostname: dev?.hostname ?? "", os_type: dev?.os_type ?? null };
      }) as ThreatRow[];
    },
    refetchInterval: 30_000,
  });

  const { data: scans = [], isLoading: scansLoading } = useQuery<ScanRow[]>({
    queryKey: ["av-scan-results", osFilter],
    queryFn: async () => {
      const { data, error: e } = await supabase.from("av_scan_results")
        .select("id, device_id, hostname, scan_type, status, threats_found, files_scanned, scan_duration_sec, threats, scanned_at, devices(hostname, os_type)")
        .order("scanned_at", { ascending: false }).limit(500);
      if (e) throw e;
      const rows = (data ?? []) as unknown as ScanRow[];
      if (!osFilter) return rows;
      return rows.filter(r => (osFilter === "mac" ? isMac(r.devices?.os_type) : isWindows(r.devices?.os_type)));
    },
    refetchInterval: 60_000,
  });

  const setResolved = useMutation({
    mutationFn: async ({ id, resolved }: { id: string; resolved: boolean }) => {
      const { error: e } = await supabase.from("alerts")
        .update({ resolved, resolved_at: resolved ? new Date().toISOString() : null }).eq("id", id);
      if (e) throw e;
      return resolved;
    },
    onSuccess: resolved => {
      setFlash({ tone: "ok", text: resolved ? "Threat marked resolved." : "Threat reopened." });
      qc.invalidateQueries({ queryKey: ["av-threats"] });
      qc.invalidateQueries({ queryKey: ["alerts"] });
    },
    onError: e => setFlash({ tone: "error", text: `Could not update threat: ${(e as Error).message}` }),
  });

  const scanDevice = useMutation({
    mutationFn: async ({ deviceId, os }: { deviceId: string; os: string | null }) => {
      const { error: e } = await supabase.from("device_commands").insert({
        device_id: deviceId, command_type: isWindows(os) ? "defender_scan" : "run_edr_scan", payload: {},
      });
      if (e) throw e;
    },
    onSuccess: () => setFlash({ tone: "ok", text: "Scan queued for this device. Results appear here within a few minutes." }),
    onError: e => setFlash({ tone: "error", text: `Could not start scan: ${(e as Error).message}` }),
  });

  // Queue a real scan on every endpoint of this OS (Mac: SparrowShield engine, Windows: Defender).
  async function handleScan() {
    setScanning(true); setFlash(null);
    try {
      const osValues = osFilter === "windows" ? ["windows"] : osFilter === "mac" ? MAC_OS : null;
      let dq = supabase.from("devices").select("id, os_type");
      if (osValues) dq = dq.in("os_type", osValues);
      const { data: devs, error: dErr } = await dq;
      if (dErr) throw dErr;
      const { data: queued } = await supabase.from("device_commands").select("device_id")
        .in("command_type", ["run_edr_scan", "defender_scan"]).in("status", ["pending", "running"]);
      const busy = new Set((queued ?? []).map((q: { device_id: string }) => q.device_id));
      const rows = (devs ?? []).filter((d: { id: string }) => !busy.has(d.id)).map((d: { id: string; os_type: string }) => ({
        device_id: d.id, command_type: d.os_type === "windows" ? "defender_scan" : "run_edr_scan", payload: {},
      }));
      if (rows.length) {
        const { error: insErr } = await supabase.from("device_commands").insert(rows);
        if (insErr) throw insErr;
      }
      setFlash({ tone: "ok", text: `Scan started on ${rows.length} device${rows.length === 1 ? "" : "s"}` +
        (busy.size ? ` (${busy.size} already scanning)` : "") + ". Results appear here as devices report — usually 1–3 minutes." });
      setTimeout(() => { refetch(); qc.invalidateQueries({ queryKey: ["av-scan-results"] }); }, 60_000);
    } catch (e) {
      setFlash({ tone: "error", text: `Could not start scan: ${e instanceof Error ? e.message : "unknown error"}` });
    } finally {
      setScanning(false);
    }
  }

  const active = threats.filter(t => !t.resolved);
  const resolvedCount = threats.length - active.length;
  const critical = active.filter(t => t.severity === "critical").length;
  const scans24h = scans.filter(s => Date.now() - new Date(s.scanned_at).getTime() < 86400_000);
  const lastScan = scans[0];

  const rows = threats
    .filter(t => (status === "active" ? !t.resolved : status === "resolved" ? t.resolved : true))
    .filter(t => !sev || normSev(t.severity) === sev);

  const selected = threats.find(t => t.id === selectedId) ?? null;

  const hosts = [...new Set(threats.map(t => t.hostname).filter(Boolean))].sort();
  const types = [...new Set(threats.map(t => t.alert_type))].sort();

  const columns: Column<ThreatRow>[] = [
    { key: "severity", header: "Severity", width: "110px", value: t => SEVERITY_ORDER[t.severity] ?? 9,
      render: t => <SeverityBadge severity={t.severity} /> },
    { key: "message", header: "Threat", value: t => t.message, render: t => (
      <div className="min-w-0">
        <p className="truncate max-w-[480px] font-medium" style={{ color: "var(--c-strong)" }}>{typeLabel(t.alert_type)}</p>
        <p className="text-[11.5px] truncate max-w-[480px]" style={{ color: "var(--c-muted)" }}>{t.message}</p>
      </div>) },
    { key: "hostname", header: "Device", hideBelow: "md", value: t => t.hostname },
    { key: "created_at", header: "Detected", value: t => t.created_at,
      render: t => <span title={new Date(t.created_at).toLocaleString()}>{timeAgo(t.created_at)}</span> },
    { key: "status", header: "Status", hideBelow: "md", value: t => (t.resolved ? "Resolved" : "Active"),
      render: t => <Badge tone={t.resolved ? "ok" : "critical"} dot>{t.resolved ? "Resolved" : "Active"}</Badge> },
    { key: "actions", header: "", sortable: false, align: "right", width: "110px", render: t => (
      <div onClick={e => e.stopPropagation()}>
        {t.resolved
          ? <Button size="sm" variant="ghost" icon={RotateCcw} disabled={setResolved.isPending} onClick={() => setResolved.mutate({ id: t.id, resolved: false })}>Reopen</Button>
          : <Button size="sm" icon={Check} disabled={setResolved.isPending} onClick={() => setResolved.mutate({ id: t.id, resolved: true })}>Resolve</Button>}
      </div>) },
  ];

  const filters: FilterDef<ThreatRow>[] = [
    { key: "type", label: "Type", options: types.map(t => ({ value: t, label: typeLabel(t) })), get: t => t.alert_type },
    { key: "device", label: "Device", options: hosts.map(h => ({ value: h, label: h })), get: t => t.hostname },
  ];

  const scanHost = (s: ScanRow) => s.devices?.hostname ?? s.hostname ?? s.device_id;
  const scanHosts = [...new Set(scans.map(scanHost))].sort();
  const scanColumns: Column<ScanRow>[] = [
    { key: "scanned_at", header: "Scanned", value: s => s.scanned_at,
      render: s => <span title={new Date(s.scanned_at).toLocaleString()}>{timeAgo(s.scanned_at)}</span> },
    { key: "host", header: "Device", value: scanHost },
    { key: "scan_type", header: "Type", hideBelow: "md", value: s => s.scan_type ?? "",
      render: s => <span className="capitalize">{s.scan_type ?? "—"}</span> },
    { key: "status", header: "Result", value: s => s.status ?? "",
      render: s => s.status === "clean"
        ? <Badge tone="ok" dot>Clean</Badge>
        : <Badge tone="critical" dot>{(s.status ?? "unknown").replace(/_/g, " ")}</Badge> },
    { key: "threats_found", header: "Threats", align: "right", value: s => s.threats_found ?? 0 },
    { key: "files_scanned", header: "Files", align: "right", hideBelow: "md", value: s => s.files_scanned ?? 0 },
    { key: "scan_duration_sec", header: "Duration", align: "right", hideBelow: "lg", value: s => s.scan_duration_sec ?? 0,
      render: s => `${s.scan_duration_sec ?? 0}s` },
  ];

  return (
    <div className="flex flex-col min-h-full">
      <TopBar title={osName ? `${osName} Antivirus` : "Threat Scanner"} />
      <Page>
        <PageHeader
          title="Threat Scanner"
          icon={ScanLine}
          crumbs={[{ label: "Antivirus" }, ...(osName ? [{ label: osName }] : []), { label: "Threat Scanner" }]}
          description={osName
            ? `Malware and malicious-activity detections from ${osName} endpoints${osFilter === "windows" ? " (Microsoft Defender)" : " (SparrowShield engine)"}.`
            : "Malware and malicious-activity detections from every enrolled endpoint."}
          actions={<Button variant="primary" icon={RefreshCw} disabled={scanning} onClick={handleScan}
            className={scanning ? "[&>svg]:animate-spin" : undefined}>{scanning ? "Starting…" : "Scan all devices"}</Button>}
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
        {error && (
          <div className="mb-4 rounded-md border px-3 py-2 text-[13px]" style={{ borderColor: "var(--sev-critical)", color: "var(--c-strong)" }}>
            Could not load threats: {(error as Error).message}
          </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
          <StatTile label="Active threats" icon={AlertTriangle} tone={active.length ? "critical" : "ok"} value={active.length}
            onClick={() => { setTab("threats"); setStatus("active"); setSev(null); }} active={tab === "threats" && status === "active" && !sev} />
          <StatTile label="Critical" icon={Flame} tone="critical" value={critical}
            onClick={() => { setTab("threats"); setStatus("active"); setSev(sev === "critical" ? null : "critical"); }} active={tab === "threats" && sev === "critical"} />
          <StatTile label="Resolved" icon={ShieldCheck} tone="ok" value={resolvedCount}
            onClick={() => { setTab("threats"); setStatus("resolved"); setSev(null); }} active={tab === "threats" && status === "resolved"} />
          <StatTile label="Scans (24h)" icon={History} tone="accent" value={scans24h.length}
            sub={`${scans24h.filter(s => (s.threats_found ?? 0) > 0).length} with findings`}
            onClick={() => setTab("scans")} active={tab === "scans"} />
          <StatTile label="Last scan" icon={FileSearch} tone={lastScan?.status === "clean" ? "ok" : lastScan ? "critical" : "neutral"}
            value={<span className="text-[18px]">{lastScan ? timeAgo(lastScan.scanned_at) : "Never"}</span>}
            sub={lastScan ? `${scanHost(lastScan)} · ${lastScan.status ?? ""}` : "Run a scan to start"}
            onClick={() => setTab("scans")} />
        </div>

        <div className="mb-3">
          <Tabs value={tab} onChange={setTab} tabs={[
            { id: "threats", label: "Threats", count: threats.length },
            { id: "scans", label: "Scan history", count: scans.length },
          ]} />
        </div>

        {tab === "threats" ? (
          <>
            <div className="flex flex-wrap gap-2 mb-3">
              {(["active", "resolved", "all"] as const).map(s => (
                <Button key={s} size="sm" variant={status === s ? "primary" : "secondary"} onClick={() => setStatus(s)}>
                  {s === "active" ? "Active" : s === "resolved" ? "Resolved" : "All"}
                </Button>
              ))}
            </div>
            <DataTable
              rows={rows}
              columns={columns}
              rowKey={t => t.id}
              loading={isLoading}
              filters={filters}
              searchPlaceholder="Search threats, devices…"
              searchText={t => [t.message, t.alert_type, t.hostname, t.rule_id].join(" ")}
              initialSort={{ key: "severity", dir: "asc" }}
              onRowClick={t => setSelectedId(t.id)}
              selectedKey={selectedId}
              exportName={osFilter ? `${osFilter}-av-threats` : "av-threats"}
              rowTone={t => (t.resolved ? undefined : `var(--sev-${normSev(t.severity) === "info" ? "info" : normSev(t.severity)})`)}
              empty={status === "active" ? "No active threats — all endpoints are clean." : "No threats recorded."}
              toolbar={sev ? <Badge tone="accent">Severity: {sev} <button onClick={() => setSev(null)} aria-label="Clear severity"><X className="w-3 h-3" /></button></Badge> : undefined}
            />
          </>
        ) : (
          <DataTable
            rows={scans}
            columns={scanColumns}
            rowKey={s => s.id}
            loading={scansLoading}
            filters={[
              { key: "device", label: "Device", options: scanHosts.map(h => ({ value: h, label: h })), get: scanHost },
              { key: "result", label: "Result", options: [{ value: "clean", label: "Clean" }, { value: "threats_found", label: "Threats found" }], get: s => s.status ?? "" },
            ]}
            searchPlaceholder="Search scans…"
            initialSort={{ key: "scanned_at", dir: "desc" }}
            onRowClick={setSelectedScan}
            selectedKey={selectedScan?.id}
            exportName={osFilter ? `${osFilter}-av-scans` : "av-scans"}
            rowTone={s => (s.status && s.status !== "clean" ? "var(--sev-critical)" : undefined)}
            empty="No scans recorded yet. Use “Scan all devices” to run one."
          />
        )}
      </Page>

      <Drawer
        open={!!selected}
        onClose={() => setSelectedId(null)}
        title={selected ? typeLabel(selected.alert_type) : ""}
        subtitle={selected && <span className="flex items-center gap-2"><SeverityBadge severity={selected.severity} /> {selected.hostname}</span>}
        footer={selected && <>
          <Button icon={Laptop} onClick={() => navigate(`/device/${selected.device_id}`)}>Open device</Button>
          <Button icon={ScanLine} disabled={scanDevice.isPending} onClick={() => scanDevice.mutate({ deviceId: selected.device_id, os: selected.os_type })}>
            {isWindows(selected.os_type) ? "Defender scan" : "Rescan device"}
          </Button>
          {selected.resolved
            ? <Button icon={RotateCcw} disabled={setResolved.isPending} onClick={() => setResolved.mutate({ id: selected.id, resolved: false })}>Reopen</Button>
            : <Button variant="primary" icon={Check} disabled={setResolved.isPending} onClick={() => setResolved.mutate({ id: selected.id, resolved: true })}>Resolve</Button>}
        </>}
      >
        {selected && (
          <div className="space-y-5">
            {flash && <p className="text-[12.5px]" style={{ color: flash.tone === "ok" ? "var(--ok)" : "var(--sev-critical)" }}>{flash.text}</p>}
            <p className="text-[13px] break-words" style={{ color: "var(--c-text)" }}>{selected.message}</p>
            <KeyValue items={[
              { label: "Status", value: <Badge tone={selected.resolved ? "ok" : "critical"} dot>{selected.resolved ? "Resolved" : "Active"}</Badge> },
              { label: "Device", value: <Link className="hover:underline" style={{ color: "var(--c-accent)" }} to={`/device/${selected.device_id}`}>{selected.hostname || selected.device_id}</Link> },
              { label: "Detected", value: new Date(selected.created_at).toLocaleString() },
              { label: "Resolved", value: selected.resolved_at ? new Date(selected.resolved_at).toLocaleString() : "—" },
              { label: "Rule", value: <span className="font-mono text-[12px]">{selected.rule_id ?? "—"}</span> },
              { label: "MITRE ATT&CK", value: selected.mitre_technique ? <Badge tone="accent" className="font-mono">{selected.mitre_technique}</Badge> : "—" },
            ]} />
          </div>
        )}
      </Drawer>

      <Drawer
        open={!!selectedScan}
        onClose={() => setSelectedScan(null)}
        title={selectedScan ? `Scan on ${scanHost(selectedScan)}` : ""}
        subtitle={selectedScan && new Date(selectedScan.scanned_at).toLocaleString()}
        footer={selectedScan && <>
          <Button icon={Laptop} onClick={() => navigate(`/device/${selectedScan.device_id}`)}>Open device</Button>
          <Button variant="primary" icon={ScanLine} disabled={scanDevice.isPending}
            onClick={() => scanDevice.mutate({ deviceId: selectedScan.device_id, os: selectedScan.devices?.os_type ?? null })}>Scan again</Button>
        </>}
      >
        {selectedScan && (
          <div className="space-y-5">
            {flash && <p className="text-[12.5px]" style={{ color: flash.tone === "ok" ? "var(--ok)" : "var(--sev-critical)" }}>{flash.text}</p>}
            <KeyValue items={[
              { label: "Result", value: selectedScan.status === "clean" ? <Badge tone="ok" dot>Clean</Badge> : <Badge tone="critical" dot>{selectedScan.status ?? "—"}</Badge> },
              { label: "Scan type", value: selectedScan.scan_type ?? "—" },
              { label: "Files scanned", value: selectedScan.files_scanned ?? 0 },
              { label: "Threats found", value: selectedScan.threats_found ?? 0 },
              { label: "Duration", value: `${selectedScan.scan_duration_sec ?? 0}s` },
            ]} />
            {Array.isArray(selectedScan.threats) && selectedScan.threats.length > 0 && (
              <div>
                <h4 className="text-[11px] font-semibold uppercase tracking-[0.06em] mb-2" style={{ color: "var(--c-muted)" }}>Findings</h4>
                <ul className="space-y-2">
                  {selectedScan.threats.map((t, i) => (
                    <li key={i} className="rounded-md border px-3 py-2" style={{ borderColor: "var(--c-border)", background: "var(--c-card2)" }}>
                      <p className="font-mono text-[12px] break-all" style={{ color: "var(--c-strong)" }}>{t.path ?? "—"}</p>
                      <p className="mt-1 text-[11.5px] flex flex-wrap gap-2" style={{ color: "var(--c-muted)" }}>
                        <span>{t.signature ?? "unknown signature"}</span>
                        {t.engine && <span>· {t.engine}</span>}
                        {t.quarantined != null && <Badge tone={t.quarantined ? "ok" : "high"}>{t.quarantined ? "Quarantined" : "Not quarantined"}</Badge>}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
}
