import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ShieldCheck, Plus, RefreshCw, Trash2, CheckCircle2, XCircle, Laptop, ListChecks, X } from "lucide-react";
import { supabase } from "../lib/supabase";
import { timeAgo } from "../lib/utils";
import { useAuth } from "../lib/AuthContext";
import TopBar from "../components/layout/TopBar";
import { Page, PageHeader, Panel, StatTile, DataTable, Badge, Button, Drawer, Tabs, inputClass, SeverityBadge, type Column } from "../components/ui";

type Framework = { id: string; name: string; enabled: boolean; description: string | null; builtin: boolean };
type Check = { field: string; expect: unknown; operator?: string; max_age_hours?: number };
type Control = { id: string; framework_id: string; control_id: string; control_name: string; description: string | null; severity: string; field_checks: Check[] };
type Snapshot = { id: string; device_id: string; hostname: string | null; os_type: string | null; framework: string; framework_id: string | null;
  score: number; pass_count: number; fail_count: number; snapshot_at: string;
  details: { control_id: string; control_name?: string; pass: boolean; field_values: Record<string, unknown> }[] };

// Device attributes a control can test. kind decides which operators/values make sense.
const FIELDS: { field: string; label: string; kind: "bool" | "num" | "version" | "present" | "recent" }[] = [
  { field: "filevault_enabled", label: "FileVault disk encryption", kind: "bool" },
  { field: "firewall_enabled", label: "Firewall", kind: "bool" },
  { field: "sip_enabled", label: "System Integrity Protection", kind: "bool" },
  { field: "gatekeeper_enabled", label: "Gatekeeper", kind: "bool" },
  { field: "screen_lock_enabled", label: "Screen lock", kind: "bool" },
  { field: "screen_lock_delay_sec", label: "Screen lock delay (seconds)", kind: "num" },
  { field: "mdm_enrolled", label: "Enrolled in MDM", kind: "bool" },
  { field: "auto_update_enabled", label: "Automatic OS updates", kind: "bool" },
  { field: "pending_update_count", label: "Pending OS/app updates", kind: "num" },
  { field: "os_version", label: "OS version", kind: "version" },
  { field: "antivirus_installed", label: "Antivirus installed", kind: "present" },
  { field: "agent_version", label: "SparrowShield agent installed", kind: "present" },
  { field: "timemachine_enabled", label: "Time Machine backups", kind: "bool" },
  { field: "timemachine_last_backup", label: "Last backup", kind: "recent" },
  { field: "last_seen", label: "Agent checked in", kind: "recent" },
  { field: "remote_desktop_enabled", label: "Remote desktop enabled", kind: "bool" },
  { field: "ssh_enabled", label: "SSH (Remote Login) enabled", kind: "bool" },
  { field: "guest_enabled", label: "Guest account enabled", kind: "bool" },
  { field: "login_item_count", label: "Login items", kind: "num" },
  { field: "vulnerability_count", label: "Known vulnerabilities", kind: "num" },
  { field: "crash_count_24h", label: "App crashes (24h)", kind: "num" },
  { field: "defender_enabled", label: "Windows Defender", kind: "bool" },
  { field: "uac_enabled", label: "Windows UAC", kind: "bool" },
  { field: "rdp_enabled", label: "Windows RDP enabled", kind: "bool" },
];
const fieldLabel = (f: string) => FIELDS.find(x => x.field === f)?.label ?? f;

function describeCheck(c: Check) {
  const label = fieldLabel(c.field);
  if (c.expect === "not_null") return `${label} is present`;
  if (c.expect === "recent") return `${label} within ${c.max_age_hours ?? 24}h`;
  if (typeof c.expect === "boolean") return `${label} is ${c.expect ? "on" : "off"}`;
  const op = c.operator ?? "==";
  const words: Record<string, string> = { "==": "is", "!=": "is not", "<=": "≤", ">=": "≥", "<": "<", ">": ">", version_gte: "≥", contains: "contains" };
  return `${label} ${words[op] ?? op} ${String(c.expect)}`;
}

type DraftControl = { control_id: string; control_name: string; severity: string; checks: Check[] };
const emptyCheck = (): Check => ({ field: "filevault_enabled", expect: true, operator: "==" });

function CheckEditor({ check, onChange, onRemove }: { check: Check; onChange: (c: Check) => void; onRemove: () => void }) {
  const kind = FIELDS.find(f => f.field === check.field)?.kind ?? "bool";
  const setField = (field: string) => {
    const k = FIELDS.find(f => f.field === field)?.kind;
    onChange(k === "bool" ? { field, expect: true, operator: "==" }
      : k === "num" ? { field, expect: 0, operator: "<=" }
      : k === "version" ? { field, expect: "14.0", operator: "version_gte" }
      : k === "recent" ? { field, expect: "recent", max_age_hours: 24 }
      : { field, expect: "not_null" });
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select className={`${inputClass} flex-1 min-w-[180px]`} value={check.field} onChange={e => setField(e.target.value)} aria-label="Device attribute">
        {FIELDS.map(f => <option key={f.field} value={f.field}>{f.label}</option>)}
      </select>
      {kind === "bool" && (
        <select className={inputClass} value={String(check.expect)} onChange={e => onChange({ ...check, expect: e.target.value === "true", operator: "==" })} aria-label="Expected">
          <option value="true">must be on</option><option value="false">must be off</option>
        </select>
      )}
      {kind === "num" && (<>
        <select className={inputClass} value={check.operator ?? "<="} onChange={e => onChange({ ...check, operator: e.target.value })} aria-label="Operator">
          <option value="<=">at most</option><option value=">=">at least</option><option value="==">exactly</option>
        </select>
        <input type="number" className={`${inputClass} w-24`} value={Number(check.expect)} onChange={e => onChange({ ...check, expect: Number(e.target.value) })} aria-label="Value" />
      </>)}
      {kind === "version" && (<>
        <span className="text-[12px]" style={{ color: "var(--c-muted)" }}>at least</span>
        <input className={`${inputClass} w-24 font-mono`} value={String(check.expect)} onChange={e => onChange({ ...check, operator: "version_gte", expect: e.target.value })} aria-label="Minimum version" />
      </>)}
      {kind === "recent" && (<>
        <span className="text-[12px]" style={{ color: "var(--c-muted)" }}>within</span>
        <input type="number" className={`${inputClass} w-20`} value={check.max_age_hours ?? 24} onChange={e => onChange({ ...check, expect: "recent", max_age_hours: Number(e.target.value) })} aria-label="Hours" />
        <span className="text-[12px]" style={{ color: "var(--c-muted)" }}>hours</span>
      </>)}
      {kind === "present" && <span className="text-[12px]" style={{ color: "var(--c-muted)" }}>must be present</span>}
      <button onClick={onRemove} className="p-1 rounded hover:bg-[var(--c-card2)]" style={{ color: "var(--c-muted)" }} aria-label="Remove check"><X className="w-4 h-4" /></button>
    </div>
  );
}

export default function Compliance() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<"devices" | "controls">("devices");
  const [builderOpen, setBuilderOpen] = useState(false);
  const [draft, setDraft] = useState<{ name: string; description: string; controls: DraftControl[] }>({ name: "", description: "", controls: [] });
  const [deviceRow, setDeviceRow] = useState<Snapshot | null>(null);
  const [evalMsg, setEvalMsg] = useState<string | null>(null);

  const { data: frameworks = [] } = useQuery<Framework[]>({
    queryKey: ["compliance-frameworks"],
    queryFn: async () => (await supabase.from("compliance_frameworks").select("id, name, enabled, description, builtin").order("name")).data as Framework[] ?? [],
  });
  const { data: controls = [] } = useQuery<Control[]>({
    queryKey: ["compliance-controls"],
    queryFn: async () => (await supabase.from("compliance_controls").select("*").order("control_id")).data as Control[] ?? [],
  });
  const { data: snapshots = [], isLoading } = useQuery<Snapshot[]>({
    queryKey: ["compliance-snapshots"],
    queryFn: async () => (await supabase.from("compliance_snapshots").select("*")).data as Snapshot[] ?? [],
    refetchInterval: 60_000,
  });

  const fwSnaps = (fw: Framework) => snapshots.filter(s => s.framework_id === fw.id || (!s.framework_id && s.framework === fw.name));
  const avg = (list: Snapshot[]) => list.length ? Math.round(list.reduce((a, s) => a + Number(s.score), 0) / list.length) : null;
  const current = frameworks.find(f => f.id === selected) ?? frameworks[0] ?? null;
  const curSnaps = current ? fwSnaps(current) : [];
  const curControls = controls.filter(c => c.framework_id === current?.id);
  const lastRun = snapshots.reduce<string | null>((m, s) => (!m || s.snapshot_at > m ? s.snapshot_at : m), null);

  const evaluate = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("compliance-evaluate", { body: {} });
      if (error) throw error;
      return data as { evaluated: number };
    },
    onMutate: () => setEvalMsg(null),
    onSuccess: d => { setEvalMsg(`Evaluated ${d?.evaluated ?? 0} device/framework results.`); qc.invalidateQueries({ queryKey: ["compliance-snapshots"] }); },
    onError: e => setEvalMsg(`Could not evaluate: ${(e as Error).message}`),
  });

  const toggleFramework = useMutation({
    mutationFn: async (fw: Framework) => {
      const { error } = await supabase.from("compliance_frameworks").update({ enabled: !fw.enabled }).eq("id", fw.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["compliance-frameworks"] }),
  });

  const deleteFramework = useMutation({
    mutationFn: async (fw: Framework) => {
      const { error } = await supabase.from("compliance_frameworks").delete().eq("id", fw.id);
      if (error) throw error;
    },
    onSuccess: () => { setSelected(null); qc.invalidateQueries(); },
  });

  const saveFramework = useMutation({
    mutationFn: async () => {
      const { data: fw, error } = await supabase.from("compliance_frameworks")
        .insert({ name: draft.name.trim(), description: draft.description.trim() || null, enabled: true, builtin: false }).select("id").single();
      if (error || !fw) throw error ?? new Error("Could not create framework");
      const rows = draft.controls.filter(c => c.control_name.trim() && c.checks.length).map((c, i) => ({
        framework_id: fw.id, control_id: c.control_id.trim() || `C-${i + 1}`, control_name: c.control_name.trim(),
        description: c.checks.map(describeCheck).join("; "), severity: c.severity, field_checks: c.checks,
      }));
      if (rows.length) {
        const { error: cErr } = await supabase.from("compliance_controls").insert(rows);
        if (cErr) throw cErr;
      }
      await supabase.functions.invoke("compliance-evaluate", { body: { framework_id: fw.id } });
      return fw.id as string;
    },
    onSuccess: id => {
      setBuilderOpen(false); setDraft({ name: "", description: "", controls: [] }); setSelected(id);
      qc.invalidateQueries();
    },
  });

  const controlStats = useMemo(() => curControls.map(c => {
    const results = curSnaps.map(s => s.details?.find(d => d.control_id === c.control_id)).filter(Boolean) as Snapshot["details"];
    const passed = results.filter(r => r.pass).length;
    return { ...c, passed, total: results.length, rate: results.length ? Math.round((passed / results.length) * 100) : null };
  }), [curControls, curSnaps]);

  const deviceCols: Column<Snapshot>[] = [
    { key: "hostname", header: "Device", render: s => <span className="font-medium" style={{ color: "var(--c-strong)" }}>{s.hostname ?? s.device_id}</span> },
    { key: "score", header: "Score", value: s => Number(s.score), render: s => (
      <div className="flex items-center gap-2 min-w-[140px]">
        <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--c-card2)" }}>
          <div className="h-full rounded-full" style={{ width: `${s.score}%`, background: s.score >= 90 ? "var(--ok)" : s.score >= 70 ? "var(--sev-medium)" : "var(--sev-critical)" }} />
        </div>
        <span className="tabular-nums font-semibold w-10 text-right" style={{ color: "var(--c-strong)" }}>{Number(s.score)}%</span>
      </div>) },
    { key: "fail_count", header: "Failing", value: s => s.fail_count, render: s => s.fail_count ? <Badge tone="high">{s.fail_count} failing</Badge> : <Badge tone="ok">All pass</Badge> },
    { key: "failing", header: "Failing controls", hideBelow: "lg", sortable: false,
      render: s => <span className="text-[12px] truncate max-w-[360px] inline-block align-middle" style={{ color: "var(--c-muted)" }}>
        {(s.details ?? []).filter(d => !d.pass).map(d => d.control_id).join(", ") || "—"}</span> },
    { key: "snapshot_at", header: "Evaluated", hideBelow: "md", render: s => timeAgo(s.snapshot_at) },
  ];
  const controlCols: Column<typeof controlStats[number]>[] = [
    { key: "control_id", header: "Control", render: c => <span className="font-mono text-[12px]" style={{ color: "var(--c-strong)" }}>{c.control_id}</span> },
    { key: "control_name", header: "Requirement", render: c => (
      <div><p style={{ color: "var(--c-strong)" }}>{c.control_name}</p>
        <p className="text-[11.5px]" style={{ color: "var(--c-muted)" }}>{(c.field_checks ?? []).map(describeCheck).join(" · ")}</p></div>) },
    { key: "severity", header: "Severity", render: c => <SeverityBadge severity={c.severity} /> },
    { key: "rate", header: "Pass rate", value: c => c.rate ?? -1, render: c => c.rate == null ? <span style={{ color: "var(--c-muted)" }}>Not evaluated</span>
      : <span className="tabular-nums font-semibold" style={{ color: c.rate === 100 ? "var(--ok)" : c.rate >= 70 ? "var(--sev-medium)" : "var(--sev-critical)" }}>{c.rate}% <span className="font-normal" style={{ color: "var(--c-muted)" }}>({c.passed}/{c.total})</span></span> },
  ];

  return (
    <div className="flex flex-col min-h-full">
      <TopBar title="Compliance" />
      <Page>
        <PageHeader
          title="Compliance"
          crumbs={[{ label: "Vulnerability & Compliance" }, { label: "Compliance" }]}
          description={<>Continuous evaluation of every device against built-in and custom frameworks. Re-evaluated automatically every hour{lastRun ? <> — last run {timeAgo(lastRun)}</> : null}.</>}
          actions={<>
            <Button icon={RefreshCw} adminOnly onClick={() => evaluate.mutate()} disabled={evaluate.isPending}>{evaluate.isPending ? "Evaluating…" : "Evaluate now"}</Button>
            <Button variant="primary" icon={Plus} onClick={() => { setDraft({ name: "", description: "", controls: [{ control_id: "C-1", control_name: "", severity: "high", checks: [emptyCheck()] }] }); setBuilderOpen(true); }}>New framework</Button>
          </>}
        />
        {evalMsg && <p className="mb-3 text-[12.5px]" style={{ color: evalMsg.startsWith("Could not") ? "var(--sev-critical)" : "var(--c-text)" }}>{evalMsg}</p>}

        {/* Framework cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-4">
          {frameworks.map(fw => {
            const s = fwSnaps(fw); const a = avg(s);
            const tone = a == null ? "neutral" : a >= 90 ? "ok" : a >= 70 ? "medium" : "critical";
            return (
              <StatTile key={fw.id} label={fw.name + (fw.builtin ? "" : " · custom")} icon={ShieldCheck} tone={fw.enabled ? tone : "neutral"}
                value={fw.enabled ? (a == null ? "—" : `${a}%`) : "Off"}
                sub={fw.enabled ? `${s.filter(x => x.fail_count === 0).length}/${s.length} devices fully compliant · ${controls.filter(c => c.framework_id === fw.id).length} controls` : "Disabled — not evaluated"}
                onClick={() => setSelected(fw.id)} active={current?.id === fw.id} />
            );
          })}
        </div>

        {current && (
          <Panel title={current.name} subtitle={current.description ?? (current.builtin ? "Built-in framework" : "Custom framework")} noPad
            actions={isAdmin && <>
              <Button size="sm" adminOnly onClick={() => toggleFramework.mutate(current)}>{current.enabled ? "Disable" : "Enable"}</Button>
              {!current.builtin && <Button size="sm" variant="danger" icon={Trash2} onClick={() => deleteFramework.mutate(current)}>Delete</Button>}
            </>}>
            <div className="px-4 pt-2">
              <Tabs value={tab} onChange={setTab} tabs={[
                { id: "devices", label: "Devices", count: curSnaps.length },
                { id: "controls", label: "Controls", count: curControls.length },
              ]} />
            </div>
            <div className="p-4">
              {tab === "devices" ? (
                <DataTable rows={curSnaps} columns={deviceCols} rowKey={s => s.id} loading={isLoading} onRowClick={setDeviceRow}
                  searchPlaceholder="Search devices…" exportName={`compliance-${current.name}`} initialSort={{ key: "score", dir: "asc" }}
                  filters={[{ key: "state", label: "Status", options: [{ value: "pass", label: "Compliant" }, { value: "fail", label: "Failing" }], get: s => (s.fail_count ? "fail" : "pass") }]}
                  empty={current.enabled ? "Not evaluated yet — click Evaluate now." : "This framework is disabled."} />
              ) : (
                <DataTable rows={controlStats} columns={controlCols} rowKey={c => c.id} searchPlaceholder="Search controls…"
                  exportName={`controls-${current.name}`} initialSort={{ key: "rate", dir: "asc" }} empty="This framework has no controls." />
              )}
            </div>
          </Panel>
        )}
      </Page>

      {/* Device result */}
      <Drawer open={!!deviceRow} onClose={() => setDeviceRow(null)} title={deviceRow?.hostname ?? "Device"}
        subtitle={deviceRow && `${current?.name} · ${deviceRow.score}% · ${deviceRow.fail_count} failing`}
        footer={deviceRow && <Button icon={Laptop} onClick={() => navigate(`/device/${deviceRow.device_id}`)}>Open device</Button>}>
        <ul className="space-y-2">
          {(deviceRow?.details ?? []).map(d => {
            const c = curControls.find(x => x.control_id === d.control_id);
            return (
              <li key={d.control_id} className="rounded-md border p-3" style={{ borderColor: "var(--c-border)", background: "var(--c-card2)" }}>
                <div className="flex items-center gap-2">
                  {d.pass ? <CheckCircle2 className="w-4 h-4" style={{ color: "var(--ok)" }} /> : <XCircle className="w-4 h-4" style={{ color: "var(--sev-critical)" }} />}
                  <span className="font-mono text-[12px]" style={{ color: "var(--c-strong)" }}>{d.control_id}</span>
                  <span className="text-[13px] flex-1" style={{ color: "var(--c-strong)" }}>{c?.control_name ?? d.control_name}</span>
                </div>
                <div className="mt-1.5 ml-6 text-[12px] space-y-0.5" style={{ color: "var(--c-muted)" }}>
                  {Object.entries(d.field_values ?? {}).map(([k, v]) => (
                    <p key={k}>{fieldLabel(k)}: <span className="font-mono" style={{ color: "var(--c-text)" }}>{v == null ? "unknown" : String(v)}</span></p>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      </Drawer>

      {/* Framework builder */}
      <Drawer open={builderOpen} onClose={() => setBuilderOpen(false)} title="New compliance framework" width={640}
        footer={<>
          <Button onClick={() => setBuilderOpen(false)}>Cancel</Button>
          <Button variant="primary" icon={ListChecks} onClick={() => saveFramework.mutate()}
            disabled={!draft.name.trim() || !draft.controls.some(c => c.control_name.trim() && c.checks.length) || saveFramework.isPending}>
            {saveFramework.isPending ? "Saving…" : "Create & evaluate"}
          </Button>
        </>}>
        <div className="space-y-4">
          <label className="block">
            <span className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--c-text)" }}>Framework name</span>
            <input autoFocus className={`${inputClass} w-full`} value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} placeholder="e.g. ISO 27001 laptop baseline" />
          </label>
          <label className="block">
            <span className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--c-text)" }}>Description (optional)</span>
            <input className={`${inputClass} w-full`} value={draft.description} onChange={e => setDraft(d => ({ ...d, description: e.target.value }))} placeholder="What this standard is for" />
          </label>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--c-muted)" }}>Controls</span>
              <Button size="sm" icon={Plus} onClick={() => setDraft(d => ({ ...d, controls: [...d.controls, { control_id: `C-${d.controls.length + 1}`, control_name: "", severity: "medium", checks: [emptyCheck()] }] }))}>Add control</Button>
            </div>
            {draft.controls.map((c, i) => (
              <div key={i} className="rounded-md border p-3 space-y-2.5" style={{ borderColor: "var(--c-border2)", background: "var(--c-card2)" }}>
                <div className="flex flex-wrap gap-2">
                  <input className={`${inputClass} w-24 font-mono`} value={c.control_id} aria-label="Control ID"
                    onChange={e => setDraft(d => ({ ...d, controls: d.controls.map((x, j) => j === i ? { ...x, control_id: e.target.value } : x) }))} />
                  <input className={`${inputClass} flex-1 min-w-[180px]`} value={c.control_name} placeholder="Requirement, e.g. Disks must be encrypted" aria-label="Control name"
                    onChange={e => setDraft(d => ({ ...d, controls: d.controls.map((x, j) => j === i ? { ...x, control_name: e.target.value } : x) }))} />
                  <select className={inputClass} value={c.severity} aria-label="Severity"
                    onChange={e => setDraft(d => ({ ...d, controls: d.controls.map((x, j) => j === i ? { ...x, severity: e.target.value } : x) }))}>
                    <option value="critical">Critical</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
                  </select>
                  <button onClick={() => setDraft(d => ({ ...d, controls: d.controls.filter((_, j) => j !== i) }))}
                    className="p-1.5 rounded hover:bg-[var(--c-card)]" style={{ color: "var(--c-muted)" }} aria-label="Remove control"><Trash2 className="w-4 h-4" /></button>
                </div>
                <p className="text-[11.5px]" style={{ color: "var(--c-muted)" }}>Passes when all of these are true:</p>
                {c.checks.map((chk, k) => (
                  <CheckEditor key={k} check={chk}
                    onChange={nc => setDraft(d => ({ ...d, controls: d.controls.map((x, j) => j === i ? { ...x, checks: x.checks.map((y, m) => m === k ? nc : y) } : x) }))}
                    onRemove={() => setDraft(d => ({ ...d, controls: d.controls.map((x, j) => j === i ? { ...x, checks: x.checks.filter((_, m) => m !== k) } : x) }))} />
                ))}
                <button className="text-[12px] font-medium" style={{ color: "var(--c-accent)" }}
                  onClick={() => setDraft(d => ({ ...d, controls: d.controls.map((x, j) => j === i ? { ...x, checks: [...x.checks, emptyCheck()] } : x) }))}>+ Add condition</button>
              </div>
            ))}
          </div>
          {saveFramework.isError && <p className="text-[12.5px]" style={{ color: "var(--sev-critical)" }}>{(saveFramework.error as Error).message}</p>}
        </div>
      </Drawer>
    </div>
  );
}

