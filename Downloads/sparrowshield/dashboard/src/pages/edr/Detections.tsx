import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BellRing, Flame, AlertTriangle, CheckCircle2, ShieldAlert, Check, RotateCcw, Laptop, ExternalLink,
  ScanLine, ShieldOff, X, Info,
} from "lucide-react";
import { supabase } from "../../lib/supabase";
import { timeAgo } from "../../lib/utils";
import TopBar from "../../components/layout/TopBar";
import {
  Page, PageHeader, StatTile, DataTable, SeverityBadge, Badge, Button, Drawer, KeyValue, Tabs,
  SEVERITY_ORDER, type Column, type FilterDef,
} from "../../components/ui";

interface Detection {
  id: string;
  device_id: string;
  alert_type: string;
  severity: string;
  message: string;
  rule_id: string | null;
  mitre_technique: string | null;
  threat_score: number | null;
  created_at: string;
  resolved: boolean;
  resolved_at: string | null;
  devices: { hostname: string | null; os_type: string | null } | null;
}

type Flash = { tone: "ok" | "error"; text: string } | null;

const MAC_OS = ["mac", "macos", "darwin"];
const normSev = (s: string) => (s === "warning" ? "medium" : s);
const typeLabel = (t: string) => t.replace(/_/g, " ").replace(/^\w/, c => c.toUpperCase());
const isMac = (os?: string | null) => MAC_OS.includes((os ?? "").toLowerCase());
const isWindows = (os?: string | null) => (os ?? "").toLowerCase() === "windows";

function FlashBar({ flash, onClose }: { flash: Flash; onClose: () => void }) {
  if (!flash) return null;
  const c = flash.tone === "ok" ? "var(--ok)" : "var(--sev-critical)";
  return (
    <div role="status" className="mb-4 flex items-start gap-2 rounded-md border px-3 py-2 text-[13px]"
      style={{ borderColor: `color-mix(in srgb, ${c} 40%, transparent)`, background: `color-mix(in srgb, ${c} 10%, transparent)`, color: "var(--c-strong)" }}>
      {flash.tone === "ok" ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" style={{ color: c }} /> : <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: c }} />}
      <span className="flex-1 min-w-0 break-words">{flash.text}</span>
      <button onClick={onClose} aria-label="Dismiss" style={{ color: "var(--c-muted)" }}><X className="w-3.5 h-3.5" /></button>
    </div>
  );
}

export default function Detections({ osFilter }: { osFilter?: "mac" | "windows" }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"open" | "resolved" | "all">("open");
  const [sev, setSev] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [flash, setFlash] = useState<Flash>(null);
  const [confirmIsolate, setConfirmIsolate] = useState(false);

  const osName = osFilter === "mac" ? "macOS" : osFilter === "windows" ? "Windows" : null;

  // alerts has no hostname column — the host comes from the devices relation.
  const { data: alerts = [], isLoading, error } = useQuery<Detection[]>({
    queryKey: ["edr-detections", osFilter],
    queryFn: async () => {
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
        .select("id, device_id, alert_type, severity, message, rule_id, mitre_technique, threat_score, created_at, resolved, resolved_at, devices(hostname, os_type)")
        .order("created_at", { ascending: false })
        .limit(1000);
      if (deviceIds) q = q.in("device_id", deviceIds);
      const { data, error: qErr } = await q;
      if (qErr) throw qErr;
      return (data ?? []) as unknown as Detection[];
    },
    refetchInterval: 20_000,
  });

  const setResolved = useMutation({
    mutationFn: async ({ id, resolved }: { id: string; resolved: boolean }) => {
      const { error: e } = await supabase.from("alerts")
        .update({ resolved, resolved_at: resolved ? new Date().toISOString() : null }).eq("id", id);
      if (e) throw e;
      return resolved;
    },
    onSuccess: resolved => {
      setFlash({ tone: "ok", text: resolved ? "Detection resolved." : "Detection reopened." });
      qc.invalidateQueries({ queryKey: ["edr-detections"] });
      qc.invalidateQueries({ queryKey: ["alerts"] });
      qc.invalidateQueries({ queryKey: ["open-alert-count"] });
    },
    onError: e => setFlash({ tone: "error", text: `Could not update detection: ${(e as Error).message}` }),
  });

  const sendCommand = useMutation({
    mutationFn: async ({ deviceId, command, label }: { deviceId: string; command: string; label: string }) => {
      const { error: e } = await supabase.from("device_commands").insert({ device_id: deviceId, command_type: command, payload: {} });
      if (e) throw e;
      return label;
    },
    onSuccess: label => { setFlash({ tone: "ok", text: `${label} queued. The agent picks it up on its next check-in.` }); setConfirmIsolate(false); },
    onError: e => setFlash({ tone: "error", text: `Could not queue command: ${(e as Error).message}` }),
  });

  const open = alerts.filter(a => !a.resolved);
  const count = (s: string) => open.filter(a => normSev(a.severity) === s).length;

  const rows = useMemo(() => alerts
    .filter(a => (tab === "open" ? !a.resolved : tab === "resolved" ? a.resolved : true))
    .filter(a => !sev || normSev(a.severity) === sev || (sev === "low" && ["low", "info"].includes(a.severity))),
  [alerts, tab, sev]);

  const selected = alerts.find(a => a.id === selectedId) ?? null;

  const types = [...new Set(alerts.map(a => a.alert_type))].sort();
  const hosts = [...new Set(alerts.map(a => a.devices?.hostname).filter(Boolean) as string[])].sort();
  const techniques = [...new Set(alerts.map(a => a.mitre_technique).filter(Boolean) as string[])].sort();

  const columns: Column<Detection>[] = [
    { key: "severity", header: "Severity", width: "110px", value: a => SEVERITY_ORDER[a.severity] ?? 9,
      render: a => <SeverityBadge severity={a.severity} /> },
    { key: "message", header: "Detection", value: a => a.message, render: a => (
      <div className="min-w-0">
        <p className="truncate max-w-[480px] font-medium" style={{ color: "var(--c-strong)" }}>{a.message}</p>
        <p className="text-[11.5px]" style={{ color: "var(--c-muted)" }}>{typeLabel(a.alert_type)}</p>
      </div>) },
    { key: "device", header: "Device", hideBelow: "md", value: a => a.devices?.hostname ?? "",
      render: a => <span className="truncate max-w-[180px] inline-block align-middle">{a.devices?.hostname ?? "—"}</span> },
    { key: "mitre_technique", header: "MITRE", hideBelow: "lg", value: a => a.mitre_technique ?? "",
      render: a => a.mitre_technique ? <Badge tone="accent" className="font-mono">{a.mitre_technique}</Badge> : <span style={{ color: "var(--c-muted)" }}>—</span> },
    { key: "created_at", header: "Detected", value: a => a.created_at,
      render: a => <span title={new Date(a.created_at).toLocaleString()}>{timeAgo(a.created_at)}</span> },
    { key: "status", header: "Status", hideBelow: "md", value: a => (a.resolved ? "Resolved" : "Open"),
      render: a => <Badge tone={a.resolved ? "ok" : "high"} dot>{a.resolved ? "Resolved" : "Open"}</Badge> },
    { key: "actions", header: "", sortable: false, align: "right", width: "110px", render: a => (
      <div onClick={e => e.stopPropagation()}>
        {a.resolved
          ? <Button size="sm" variant="ghost" icon={RotateCcw} disabled={setResolved.isPending} onClick={() => setResolved.mutate({ id: a.id, resolved: false })}>Reopen</Button>
          : <Button size="sm" icon={Check} disabled={setResolved.isPending} onClick={() => setResolved.mutate({ id: a.id, resolved: true })}>Resolve</Button>}
      </div>) },
  ];

  const filters: FilterDef<Detection>[] = [
    { key: "type", label: "Type", options: types.map(t => ({ value: t, label: typeLabel(t) })), get: a => a.alert_type },
    { key: "device", label: "Device", options: hosts.map(h => ({ value: h, label: h })), get: a => a.devices?.hostname ?? "" },
    { key: "mitre", label: "MITRE", options: techniques.map(t => ({ value: t, label: t })), get: a => a.mitre_technique ?? "" },
  ];

  const sevTile = (key: string, label: string, tone: "critical" | "high" | "medium" | "low", Icon: typeof Flame) => (
    <StatTile label={label} icon={Icon} tone={tone}
      value={key === "low" ? count("low") + count("info") : count(key)}
      onClick={() => { setTab("open"); setSev(sev === key ? null : key); }} active={sev === key} />
  );

  const selOs = selected?.devices?.os_type;

  return (
    <div className="flex flex-col min-h-full">
      <TopBar title={osName ? `${osName} EDR` : "EDR Detections"} />
      <Page>
        <PageHeader
          title={osName ? `${osName} Detections` : "EDR Detections"}
          icon={BellRing}
          crumbs={[{ label: "Detection & Response" }, ...(osName ? [{ label: osName }] : []), { label: "Detections" }]}
          description={osName
            ? `Detections raised by the detection engine on ${osName} endpoints, tagged with MITRE ATT&CK techniques.`
            : "MITRE ATT&CK–tagged detections raised by the detection engine across all endpoints."}
        />

        <FlashBar flash={flash} onClose={() => setFlash(null)} />
        {error && <FlashBar flash={{ tone: "error", text: `Could not load detections: ${(error as Error).message}` }} onClose={() => qc.invalidateQueries({ queryKey: ["edr-detections"] })} />}

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
          <StatTile label="Open" icon={ShieldAlert} tone={open.length ? "high" : "ok"} value={open.length}
            onClick={() => { setTab("open"); setSev(null); }} active={tab === "open" && !sev} />
          {sevTile("critical", "Critical", "critical", Flame)}
          {sevTile("high", "High", "high", AlertTriangle)}
          {sevTile("medium", "Medium", "medium", AlertTriangle)}
          <StatTile label="Resolved" icon={CheckCircle2} tone="ok" value={alerts.length - open.length}
            onClick={() => { setTab("resolved"); setSev(null); }} active={tab === "resolved"} />
        </div>

        <div className="mb-3">
          <Tabs value={tab} onChange={setTab} tabs={[
            { id: "open", label: "Open", count: open.length },
            { id: "resolved", label: "Resolved", count: alerts.length - open.length },
            { id: "all", label: "All", count: alerts.length },
          ]} />
        </div>

        <DataTable
          rows={rows}
          columns={columns}
          rowKey={a => a.id}
          loading={isLoading}
          filters={filters}
          searchPlaceholder="Search detections, devices, rules…"
          searchText={a => [a.message, a.alert_type, a.devices?.hostname, a.mitre_technique, a.rule_id].join(" ")}
          initialSort={{ key: "severity", dir: "asc" }}
          onRowClick={a => { setSelectedId(a.id); setConfirmIsolate(false); }}
          selectedKey={selectedId}
          exportName={osFilter ? `${osFilter}-detections` : "edr-detections"}
          empty={tab === "open" ? "No open detections — all clear." : "No detections."}
          rowTone={a => (a.resolved ? undefined : `var(--sev-${normSev(a.severity) === "info" ? "info" : normSev(a.severity)})`)}
          toolbar={sev ? <Badge tone="accent">Severity: {sev} <button onClick={() => setSev(null)} aria-label="Clear severity"><X className="w-3 h-3" /></button></Badge> : undefined}
        />
      </Page>

      <Drawer
        open={!!selected}
        onClose={() => setSelectedId(null)}
        title={selected?.message ?? ""}
        subtitle={selected && <span className="flex items-center gap-2"><SeverityBadge severity={selected.severity} /> {typeLabel(selected.alert_type)}</span>}
        footer={selected && <>
          <Button icon={Laptop} onClick={() => navigate(`/device/${selected.device_id}`)}>Open device</Button>
          {selected.resolved
            ? <Button icon={RotateCcw} disabled={setResolved.isPending} onClick={() => setResolved.mutate({ id: selected.id, resolved: false })}>Reopen</Button>
            : <Button variant="primary" icon={Check} disabled={setResolved.isPending} onClick={() => setResolved.mutate({ id: selected.id, resolved: true })}>Resolve</Button>}
        </>}
      >
        {selected && (
          <div className="space-y-6">
            <FlashBar flash={flash} onClose={() => setFlash(null)} />
            <KeyValue items={[
              { label: "Status", value: <Badge tone={selected.resolved ? "ok" : "high"} dot>{selected.resolved ? "Resolved" : "Open"}</Badge> },
              { label: "Device", value: <Link className="hover:underline" style={{ color: "var(--c-accent)" }} to={`/device/${selected.device_id}`}>{selected.devices?.hostname ?? selected.device_id}</Link> },
              { label: "Platform", value: isMac(selOs) ? "macOS" : isWindows(selOs) ? "Windows" : (selOs ?? "—") },
              { label: "Detected", value: new Date(selected.created_at).toLocaleString() },
              { label: "Resolved", value: selected.resolved_at ? new Date(selected.resolved_at).toLocaleString() : "—" },
              { label: "Rule", value: <span className="font-mono text-[12px]">{selected.rule_id ?? "—"}</span> },
              { label: "MITRE ATT&CK", value: selected.mitre_technique
                  ? <a className="inline-flex items-center gap-1 font-mono hover:underline" style={{ color: "var(--c-accent)" }}
                      href={`https://attack.mitre.org/techniques/${selected.mitre_technique.replace(".", "/")}/`} target="_blank" rel="noreferrer">
                      {selected.mitre_technique} <ExternalLink className="w-3 h-3" />
                    </a> : "—" },
              ...(selected.threat_score != null ? [{ label: "Threat score", value: String(selected.threat_score) }] : []),
            ]} />

            <div>
              <h4 className="text-[11px] font-semibold uppercase tracking-[0.06em] mb-2" style={{ color: "var(--c-muted)" }}>Response</h4>
              {isMac(selOs) ? (
                <div className="flex flex-wrap gap-2">
                  <Button icon={ScanLine} disabled={sendCommand.isPending}
                    onClick={() => sendCommand.mutate({ deviceId: selected.device_id, command: "run_edr_scan", label: "Full EDR scan" })}>
                    Run EDR scan
                  </Button>
                </div>
              ) : isWindows(selOs) ? (
                <div className="flex flex-wrap gap-2">
                  <Button icon={ScanLine} disabled={sendCommand.isPending}
                    onClick={() => sendCommand.mutate({ deviceId: selected.device_id, command: "defender_scan", label: "Defender scan" })}>
                    Run Defender scan
                  </Button>
                  {confirmIsolate ? (
                    <>
                      <Button variant="danger" icon={ShieldOff} disabled={sendCommand.isPending}
                        onClick={() => sendCommand.mutate({ deviceId: selected.device_id, command: "isolate", label: "Network isolation" })}>
                        Confirm isolate
                      </Button>
                      <Button variant="ghost" onClick={() => setConfirmIsolate(false)}>Cancel</Button>
                    </>
                  ) : (
                    <Button variant="danger" icon={ShieldOff} onClick={() => setConfirmIsolate(true)}>Isolate host</Button>
                  )}
                </div>
              ) : (
                <p className="text-[12.5px] flex items-center gap-2" style={{ color: "var(--c-muted)" }}>
                  <Info className="w-3.5 h-3.5" /> No remote response actions available for this platform.
                </p>
              )}
              {confirmIsolate && (
                <p className="mt-2 text-[12px]" style={{ color: "var(--c-muted)" }}>
                  Isolation cuts the host off the network except for the SparrowShield agent. Undo it from the device page.
                </p>
              )}
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
