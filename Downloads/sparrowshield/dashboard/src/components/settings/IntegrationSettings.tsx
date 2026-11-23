// Settings → Email and Settings → Integrations. Secret keys go through the `integrations` edge
// function into internal_secrets — the browser can save or replace them but never read them back.
import { useEffect, useState, type ElementType, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Mail, Cloud, Key, RefreshCw, Unplug, CheckCircle2, AlertTriangle, Send, Save, Shield, ExternalLink } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { timeAgo } from "../../lib/utils";
import { useAuth } from "../../lib/AuthContext";
import { Panel, Badge, Button, inputClass } from "../ui";

type Status = { name: string; configured: boolean; settings: Record<string, unknown>; last_sync_at: string | null; last_status: string | null; last_message: string | null };

async function callIntegrations(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke("integrations", { body });
  if (error) {
    const ctx = (error as { context?: Response }).context;
    const msg = ctx ? (await ctx.json().catch(() => null))?.error : null;
    throw new Error(msg ?? error.message);
  }
  return data;
}

function useStatus(name: string) {
  return useQuery<Status | null>({
    queryKey: ["integration-status", name],
    queryFn: async () => (await supabase.from("integration_status").select("*").eq("name", name).maybeSingle()).data as Status | null,
    refetchInterval: 30_000,
  });
}

function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--c-text)" }}>{label}</span>
      {children}
      {hint && <span className="block text-[11.5px] mt-1" style={{ color: "var(--c-muted)" }}>{hint}</span>}
    </label>
  );
}

function StatusLine({ status }: { status?: Status | null }) {
  if (!status?.last_message) return null;
  const ok = status.last_status === "ok";
  return (
    <p className="mt-3 flex items-start gap-2 text-[12.5px] rounded-md border px-3 py-2"
      style={{ borderColor: "var(--c-border)", background: "var(--c-card2)", color: ok ? "var(--c-text)" : "var(--sev-critical)" }}>
      {ok ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-px" style={{ color: "var(--ok)" }} /> : <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />}
      <span>{status.last_message}{status.last_sync_at && <span style={{ color: "var(--c-muted)" }}> · {timeAgo(status.last_sync_at)}</span>}</span>
    </p>
  );
}

function Header({ icon: Icon, title, desc, right }: { icon: ElementType; title: string; desc: string; right?: ReactNode }) {
  return (
    <div className="flex items-start gap-3 mb-4">
      <span className="w-9 h-9 rounded-md border flex items-center justify-center shrink-0" style={{ borderColor: "var(--c-border)", background: "var(--c-card2)" }}>
        <Icon className="w-4 h-4" style={{ color: "var(--c-accent)" }} />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-semibold" style={{ color: "var(--c-strong)" }}>{title}</p>
        <p className="text-[12.5px]" style={{ color: "var(--c-muted)" }}>{desc}</p>
      </div>
      {right}
    </div>
  );
}

/* ── Email ─────────────────────────────────────────────────────────────── */
export function EmailSettings() {
  const qc = useQueryClient();
  const { isAdmin, user } = useAuth();
  const { data: status } = useStatus("email");
  const [key, setKey] = useState("");
  const [from, setFrom] = useState("");
  const [alerts, setAlerts] = useState({ enabled: false, to: "" });
  const [msg, setMsg] = useState<string | null>(null);

  const { data: cfg } = useQuery({
    queryKey: ["email-config"],
    queryFn: async () => (await supabase.from("config").select("value").eq("key", "email_config").maybeSingle()).data?.value as { enabled?: boolean; to?: string } | undefined,
  });
  useEffect(() => { if (cfg) setAlerts({ enabled: !!cfg.enabled, to: cfg.to ?? "" }); }, [cfg]);
  useEffect(() => { const f = (status?.settings as { from?: string } | undefined)?.from; if (f) setFrom(f); }, [status]);

  const save = useMutation({
    mutationFn: async () => {
      await callIntegrations({ action: "save_email", resend_api_key: key, from });
      // Alert e-mails (sent by check-alerts) — non-secret settings only.
      const { error } = await supabase.from("config").upsert({ key: "email_config", value: { enabled: alerts.enabled, to: alerts.to.trim(), from } }, { onConflict: "key" });
      if (error) throw error;
    },
    onMutate: () => setMsg(null),
    onSuccess: () => { setKey(""); setMsg("Saved."); qc.invalidateQueries({ queryKey: ["integration-status"] }); qc.invalidateQueries({ queryKey: ["email-config"] }); },
    onError: e => setMsg((e as Error).message),
  });
  const test = useMutation({
    mutationFn: () => callIntegrations({ action: "test_email", to: user?.email }),
    onMutate: () => setMsg(null),
    onSuccess: () => setMsg(`Test email sent to ${user?.email}.`),
    onError: e => setMsg((e as Error).message),
  });
  const remove = useMutation({
    mutationFn: () => callIntegrations({ action: "remove_email" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["integration-status"] }),
  });

  return (
    <Panel>
      <Header icon={Mail} title="Email delivery (Resend)" desc="Used for scheduled reports and alert e-mails."
        right={<Badge tone={status?.configured ? "ok" : "neutral"} dot>{status?.configured ? "Configured" : "Not configured"}</Badge>} />
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Resend API key" hint={<>{status?.configured ? "A key is saved. Enter a new one only to replace it. " : ""}Free key at{" "}
          <a href="https://resend.com/api-keys" target="_blank" rel="noreferrer" className="underline" style={{ color: "var(--c-accent)" }}>resend.com</a> (3,000 emails/month).</>}>
          <input type="password" className={`${inputClass} w-full`} value={key} onChange={e => setKey(e.target.value)} disabled={!isAdmin}
            placeholder={status?.configured ? "•••••••••••• (saved)" : "re_xxxxxxxx"} autoComplete="off" />
        </Field>
        <Field label="From address" hint="Must be a verified sender/domain in Resend.">
          <input className={`${inputClass} w-full`} value={from} onChange={e => setFrom(e.target.value)} disabled={!isAdmin} placeholder="SparrowShield <security@yourcompany.com>" />
        </Field>
        <Field label="Alert e-mails go to" hint="Receives an e-mail for every new critical/high alert.">
          <input type="email" className={`${inputClass} w-full`} value={alerts.to} onChange={e => setAlerts(a => ({ ...a, to: e.target.value }))} disabled={!isAdmin} placeholder="security-team@yourcompany.com" />
        </Field>
        <label className="flex items-center gap-2 text-[13px] self-end pb-2" style={{ color: "var(--c-strong)" }}>
          <input type="checkbox" checked={alerts.enabled} disabled={!isAdmin} onChange={e => setAlerts(a => ({ ...a, enabled: e.target.checked }))} /> Send alert e-mails
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2 mt-4">
        <Button variant="primary" icon={Save} onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? "Saving…" : "Save"}</Button>
        <Button icon={Send} adminOnly onClick={() => test.mutate()} disabled={!status?.configured || test.isPending}>{test.isPending ? "Sending…" : "Send test email"}</Button>
        {status?.configured && <Button variant="danger" icon={Unplug} onClick={() => remove.mutate()} disabled={remove.isPending}>Remove key</Button>}
        {msg && <span className="text-[12.5px]" style={{ color: /saved|sent/i.test(msg) ? "var(--ok)" : "var(--sev-critical)" }}>{msg}</span>}
      </div>
    </Panel>
  );
}

/* ── Integrations ──────────────────────────────────────────────────────── */
export function IntegrationsPanel() {
  const qc = useQueryClient();
  const { isAdmin } = useAuth();
  const { data: jc } = useStatus("jumpcloud");
  const [jcKey, setJcKey] = useState("");
  const [orgId, setOrgId] = useState("");
  const [jcMsg, setJcMsg] = useState<string | null>(null);
  const [vtKey, setVtKey] = useState(() => { try { return localStorage.getItem("vt_api_key") ?? ""; } catch { return ""; } });
  const [vtSaved, setVtSaved] = useState(false);

  useEffect(() => { const o = (jc?.settings as { org_id?: string } | undefined)?.org_id; if (o) setOrgId(o); }, [jc]);

  const { data: counts } = useQuery({
    queryKey: ["jumpcloud-counts"],
    enabled: !!jc?.configured,
    queryFn: async () => {
      const [all, matched] = await Promise.all([
        supabase.from("jumpcloud_systems").select("*", { count: "exact", head: true }),
        supabase.from("jumpcloud_systems").select("*", { count: "exact", head: true }).not("device_id", "is", null),
      ]);
      return { total: all.count ?? 0, matched: matched.count ?? 0 };
    },
  });

  const saveJc = useMutation({
    mutationFn: () => callIntegrations({ action: "save_jumpcloud", api_key: jcKey, org_id: orgId }),
    onMutate: () => setJcMsg(null),
    onSuccess: async (d: { systems?: number }) => {
      setJcKey(""); setJcMsg(`Connected — ${d?.systems ?? 0} systems found. Syncing now…`);
      qc.invalidateQueries({ queryKey: ["integration-status"] });
      await syncJc.mutateAsync().catch(() => {});
    },
    onError: e => setJcMsg((e as Error).message),
  });
  const syncJc = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("jumpcloud-sync", { body: {} });
      if (error) {
        const ctx = (error as { context?: Response }).context;
        throw new Error((ctx ? (await ctx.json().catch(() => null))?.error : null) ?? error.message);
      }
      return data as { systems: number; matched: number };
    },
    onMutate: () => setJcMsg("Syncing with JumpCloud…"),
    onSuccess: d => { setJcMsg(`Synced ${d?.systems ?? 0} systems · ${d?.matched ?? 0} matched to SparrowShield devices.`); qc.invalidateQueries(); },
    onError: e => setJcMsg((e as Error).message),
  });
  const removeJc = useMutation({
    mutationFn: () => callIntegrations({ action: "remove_jumpcloud" }),
    onSuccess: () => { setJcMsg("Disconnected."); qc.invalidateQueries(); },
  });

  return (
    <div className="space-y-4">
      <Panel>
        <Header icon={Cloud} title="JumpCloud" desc="Import every managed Mac and PC with System Insights (OS, encryption, users, uptime, firewall, battery) and find machines missing the SparrowShield agent."
          right={<Badge tone={jc?.configured ? "ok" : "neutral"} dot>{jc?.configured ? "Connected" : "Not connected"}</Badge>} />
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="JumpCloud API key" hint={<>JumpCloud admin console → your name (top right) → <b>My API Key</b>. A read-only admin is enough.
            {jc?.configured ? " A key is saved — enter a new one only to replace it." : ""}</>}>
            <input type="password" className={`${inputClass} w-full`} value={jcKey} onChange={e => setJcKey(e.target.value)} disabled={!isAdmin}
              placeholder={jc?.configured ? "•••••••••••• (saved)" : "Paste API key"} autoComplete="off" />
          </Field>
          <Field label="Organization ID (multi-tenant only)" hint="Leave blank unless you manage several JumpCloud organizations.">
            <input className={`${inputClass} w-full font-mono`} value={orgId} onChange={e => setOrgId(e.target.value)} disabled={!isAdmin} placeholder="optional" />
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-4">
          <Button variant="primary" icon={Key} onClick={() => saveJc.mutate()} disabled={saveJc.isPending || (!jcKey.trim() && !jc?.configured)}>
            {saveJc.isPending ? "Testing…" : jc?.configured ? "Save & re-test" : "Connect"}
          </Button>
          {jc?.configured && <>
            <Button icon={RefreshCw} adminOnly onClick={() => syncJc.mutate()} disabled={syncJc.isPending}>{syncJc.isPending ? "Syncing…" : "Sync now"}</Button>
            <Link to="/jumpcloud" className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border text-[13px] font-medium"
              style={{ borderColor: "var(--c-border2)", background: "var(--c-card2)", color: "var(--c-strong)" }}>
              View inventory{counts ? ` (${counts.total})` : ""} <ExternalLink className="w-3.5 h-3.5" />
            </Link>
            <Button variant="danger" icon={Unplug} onClick={() => removeJc.mutate()} disabled={removeJc.isPending}>Disconnect</Button>
          </>}
        </div>
        {jcMsg ? <p className="mt-3 text-[12.5px]" style={{ color: /fail|reject|error|\d{3}/i.test(jcMsg) && !/Synced|Connected/.test(jcMsg) ? "var(--sev-critical)" : "var(--c-text)" }}>{jcMsg}</p>
          : <StatusLine status={jc} />}
        {jc?.configured && counts && counts.total > counts.matched && (
          <p className="mt-2 text-[12.5px] flex items-center gap-2" style={{ color: "var(--sev-high)" }}>
            <AlertTriangle className="w-4 h-4" /> {counts.total - counts.matched} JumpCloud-managed machine{counts.total - counts.matched === 1 ? "" : "s"} don't have the SparrowShield agent.
          </p>
        )}
        <p className="mt-3 text-[11.5px]" style={{ color: "var(--c-muted)" }}>Synced automatically every hour. The key is stored server-side and never sent back to the browser.</p>
      </Panel>

      <Panel>
        <Header icon={Key} title="VirusTotal" desc="Hash look-ups from Process Tree and Live Activity."
          right={<a href="https://www.virustotal.com/gui/my-apikey" target="_blank" rel="noreferrer" className="text-[12px] font-medium" style={{ color: "var(--c-accent)" }}>Get free API key →</a>} />
        <div className="flex flex-wrap gap-2">
          <input type="password" className={`${inputClass} flex-1 min-w-[220px]`} value={vtKey} onChange={e => setVtKey(e.target.value)} placeholder="Enter your VirusTotal API key…" />
          <Button variant="primary" adminOnly={false} icon={vtSaved ? CheckCircle2 : Save} onClick={() => {
            try { vtKey.trim() ? localStorage.setItem("vt_api_key", vtKey.trim()) : localStorage.removeItem("vt_api_key"); } catch { /* storage blocked */ }
            setVtSaved(true); setTimeout(() => setVtSaved(false), 2000);
          }}>{vtSaved ? "Saved" : "Save"}</Button>
        </div>
        <p className="text-[11.5px] mt-2" style={{ color: "var(--c-muted)" }}>Stored only in this browser. Free tier: 500 look-ups per day.</p>
      </Panel>

      {[
        { name: "CrowdStrike", desc: "Import IOC feeds and threat intelligence" },
        { name: "Splunk / SIEM", desc: "Forward alerts and EDR events to your SIEM" },
        { name: "Shodan", desc: "External attack-surface monitoring" },
      ].map(i => (
        <Panel key={i.name}>
          <Header icon={Shield} title={i.name} desc={i.desc} right={<Badge tone="neutral">Planned</Badge>} />
        </Panel>
      ))}
    </div>
  );
}
