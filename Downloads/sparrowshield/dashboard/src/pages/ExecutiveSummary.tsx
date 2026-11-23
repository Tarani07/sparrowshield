import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import {
  Shield, Printer, AlertTriangle, Monitor, CheckCircle, Activity, Bug, RefreshCw, ArrowRight, ShieldCheck, Laptop,
} from "lucide-react";
import TopBar from "../components/layout/TopBar";
import { supabase } from "../lib/supabase";
import { timeAgo } from "../lib/utils";
import { Page, PageHeader, Panel, StatTile, SeverityBadge, Badge, Button, EmptyState, SEVERITY_ORDER } from "../components/ui";

type Dev = {
  id: string; hostname: string; status: string | null; last_seen: string | null; cis_score_pct: number | null; os_type: string;
  vulnerability_count: number | null; filevault_enabled: boolean | null; firewall_enabled: boolean | null;
};
type OpenAlert = { id: string; severity: string; alert_type: string; message: string; created_at: string; device_id: string; devices: { hostname: string } | null };
type TrendAlert = { created_at: string; resolved: boolean; resolved_at: string | null; severity: string };
type VulnRow = { device_id: string; severity: string };

const DAY = 86400_000;
const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);
const normSev = (s: string) => (s === "warning" ? "medium" : s);

function grade(score: number) {
  if (score >= 90) return { letter: "A", tone: "ok" as const, label: "Strong" };
  if (score >= 80) return { letter: "B", tone: "ok" as const, label: "Good" };
  if (score >= 70) return { letter: "C", tone: "medium" as const, label: "Fair" };
  if (score >= 60) return { letter: "D", tone: "high" as const, label: "Weak" };
  return { letter: "F", tone: "critical" as const, label: "At risk" };
}
const TONE_VAR = { ok: "var(--ok)", medium: "var(--sev-medium)", high: "var(--sev-high)", critical: "var(--sev-critical)" };
const scoreColor = (s: number) => TONE_VAR[grade(s).tone];

/** Circular score gauge. */
function ScoreRing({ score }: { score: number }) {
  const r = 52, c = 2 * Math.PI * r;
  const color = scoreColor(score);
  return (
    <svg viewBox="0 0 128 128" className="w-[132px] h-[132px] shrink-0" role="img" aria-label={`Posture score ${score} of 100`}>
      <circle cx="64" cy="64" r={r} fill="none" stroke="var(--c-card2)" strokeWidth="12" />
      <circle cx="64" cy="64" r={r} fill="none" stroke={color} strokeWidth="12" strokeLinecap="round"
        strokeDasharray={`${(score / 100) * c} ${c}`} transform="rotate(-90 64 64)" />
      <text x="64" y="62" textAnchor="middle" fontSize="32" fontWeight="600" fill="var(--c-strong)">{score}</text>
      <text x="64" y="82" textAnchor="middle" fontSize="11" fill="var(--c-muted)">of 100</text>
    </svg>
  );
}

function Meter({ label, value, sub, to }: { label: string; value: number | null; sub?: string; to?: string }) {
  const body = (
    <div className="py-2">
      <div className="flex items-center justify-between text-[12.5px] mb-1.5 gap-2">
        <span className="font-medium truncate" style={{ color: "var(--c-text)" }}>{label}</span>
        <span className="tabular-nums font-semibold shrink-0" style={{ color: "var(--c-strong)" }}>{value == null ? "n/a" : `${value}%`}</span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--c-card2)" }}>
        <div className="h-full rounded-full" style={{ width: `${value ?? 0}%`, background: value == null ? "var(--c-border2)" : scoreColor(value) }} />
      </div>
      {sub && <p className="mt-1 text-[11px]" style={{ color: "var(--c-muted)" }}>{sub}</p>}
    </div>
  );
  return to ? <Link to={to} className="block rounded hover:bg-[var(--c-row-hover)] -mx-2 px-2">{body}</Link> : body;
}

const chartTooltip = {
  contentStyle: { background: "var(--c-card)", border: "1px solid var(--c-border2)", borderRadius: 6, fontSize: 12 },
  labelStyle: { color: "var(--c-strong)", fontWeight: 600 },
};

export default function ExecutiveSummary() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const since30 = useMemo(() => new Date(Date.now() - 30 * DAY).toISOString(), []);
  const since7 = useMemo(() => new Date(Date.now() - 7 * DAY).toISOString(), []);

  const { data: devices = [], error: devError } = useQuery<Dev[]>({
    queryKey: ["exec-devices"],
    queryFn: async () => {
      const { data, error } = await supabase.from("devices")
        .select("id, hostname, status, last_seen, cis_score_pct, os_type, vulnerability_count, filevault_enabled, firewall_enabled");
      if (error) throw error;
      return (data ?? []) as Dev[];
    },
  });

  const { data: alerts = [] } = useQuery<OpenAlert[]>({
    queryKey: ["exec-alerts"],
    queryFn: async () => {
      const { data } = await supabase
        .from("alerts")
        .select("id, severity, alert_type, message, created_at, device_id, devices(hostname)")
        .eq("resolved", false)
        .order("created_at", { ascending: false });
      return (data ?? []) as unknown as OpenAlert[];
    },
  });

  const { data: trendAlerts = [] } = useQuery<TrendAlert[]>({
    queryKey: ["exec-alert-trend"],
    queryFn: async () => (await supabase.from("alerts")
      .select("created_at, resolved, resolved_at, severity")
      .gte("created_at", since30).limit(5000)).data as TrendAlert[] ?? [],
  });

  const { data: threatCount = 0 } = useQuery({
    queryKey: ["exec-threats"],
    queryFn: async () => {
      const { count } = await supabase
        .from("edr_events")
        .select("*", { count: "exact", head: true })
        .gte("created_at", since7);
      return count ?? 0;
    },
  });

  const { data: edrTrend = [] } = useQuery<{ created_at: string }[]>({
    queryKey: ["exec-edr-trend"],
    queryFn: async () => (await supabase.from("edr_events")
      .select("created_at").gte("created_at", since30).limit(10000)).data ?? [],
  });

  const { data: openVulns = [] } = useQuery<VulnRow[]>({
    queryKey: ["exec-vulns"],
    queryFn: async () => (await supabase.from("vulnerabilities")
      .select("device_id, severity").eq("patched", false).limit(5000)).data as VulnRow[] ?? [],
  });

  const { data: policy } = useQuery({
    queryKey: ["exec-policy"],
    queryFn: async () => {
      const [cats, web, apps] = await Promise.all([
        supabase.from("web_categories").select("enabled"),
        supabase.from("web_filter_rules").select("*", { count: "exact", head: true }).eq("enabled", true),
        supabase.from("software_lists").select("*", { count: "exact", head: true }).eq("list_type", "blocklist"),
      ]);
      const c = (cats.data ?? []) as { enabled: boolean }[];
      return { catsOn: c.filter(x => x.enabled).length, catsTotal: c.length, webRules: web.count ?? 0, blockedApps: apps.count ?? 0 };
    },
  });

  /* ── Derived metrics ─────────────────────────────────────────────────── */
  const total = devices.length;
  const seenWithin = (d: Dev, ms: number) => !!d.last_seen && Date.now() - new Date(d.last_seen).getTime() < ms;
  const online = devices.filter(d => (d.last_seen ? seenWithin(d, 15 * 60_000) : d.status === "online")).length;
  const reporting24h = devices.filter(d => seenWithin(d, DAY)).length;

  const cisScores = devices.map(d => d.cis_score_pct).filter((v): v is number => v != null);
  const avgCis = cisScores.length ? Math.round(cisScores.reduce((a, b) => a + b, 0) / cisScores.length) : null;
  const compliantCount = devices.filter(d => (d.cis_score_pct ?? 0) >= 80).length;

  const enc = devices.filter(d => d.filevault_enabled != null);
  const fw = devices.filter(d => d.firewall_enabled != null);
  const encPct = enc.length ? pct(enc.filter(d => d.filevault_enabled).length, enc.length) : null;
  const fwPct = fw.length ? pct(fw.filter(d => d.firewall_enabled).length, fw.length) : null;

  const sevCount = (s: string) => alerts.filter(a => normSev(a.severity) === s).length;
  const crit = sevCount("critical"), high = sevCount("high"), med = sevCount("medium");

  const vulnDevices = new Set(openVulns.map(v => v.device_id));
  const vulnFreePct = total ? pct(total - devices.filter(d => vulnDevices.has(d.id) || (d.vulnerability_count ?? 0) > 0).length, total) : null;

  const components = [
    { label: "Configuration compliance (avg CIS)", value: avgCis, to: "/compliance",
      sub: avgCis == null ? "No CIS results yet" : `${compliantCount} of ${total} devices at 80% or higher` },
    { label: "Threat exposure", value: Math.max(0, 100 - (crit * 20 + high * 8 + med * 2)), to: "/alerts",
      sub: `${crit} critical · ${high} high · ${med} medium open alerts` },
    { label: "Vulnerability exposure", value: vulnFreePct, to: "/vulnerabilities",
      sub: `${openVulns.length} open findings on ${vulnDevices.size} devices` },
    { label: "Endpoint hardening", value: encPct == null && fwPct == null ? null : Math.round(((encPct ?? fwPct!) + (fwPct ?? encPct!)) / 2), to: "/devices",
      sub: `Disk encryption ${encPct ?? "n/a"}% · Firewall ${fwPct ?? "n/a"}%` },
    { label: "Visibility (reported in 24h)", value: total ? pct(reporting24h, total) : null, to: "/devices",
      sub: `${reporting24h} of ${total} endpoints checked in` },
  ];
  const scored = components.filter(c => c.value != null) as { value: number }[];
  const posture = scored.length ? Math.round(scored.reduce((a, c) => a + c.value, 0) / scored.length) : 0;
  const g = grade(posture);

  // 30-day detections raised vs resolved
  const trend = useMemo(() => {
    const days: Record<string, { day: string; raised: number; resolved: number; threats: number }> = {};
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * DAY);
      days[d.toISOString().slice(0, 10)] = { day: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }), raised: 0, resolved: 0, threats: 0 };
    }
    for (const a of trendAlerts) {
      const k = a.created_at.slice(0, 10);
      if (days[k]) days[k].raised++;
      const r = a.resolved_at?.slice(0, 10);
      if (a.resolved && r && days[r]) days[r].resolved++;
    }
    for (const e of edrTrend) { const k = e.created_at.slice(0, 10); if (days[k]) days[k].threats++; }
    return Object.values(days);
  }, [trendAlerts, edrTrend]);
  const raised30 = trendAlerts.length;
  const resolved30 = trendAlerts.filter(a => a.resolved).length;
  const edr30 = edrTrend.length;

  // Top risk endpoints
  const riskiest = useMemo(() => {
    const byDev = new Map<string, { crit: number; high: number }>();
    for (const a of alerts) {
      const s = normSev(a.severity);
      const e = byDev.get(a.device_id) ?? { crit: 0, high: 0 };
      if (s === "critical") e.crit++; else if (s === "high") e.high++;
      byDev.set(a.device_id, e);
    }
    const vulnsBy = new Map<string, number>();
    for (const v of openVulns) vulnsBy.set(v.device_id, (vulnsBy.get(v.device_id) ?? 0) + 1);
    return devices.map(d => {
      const al = byDev.get(d.id) ?? { crit: 0, high: 0 };
      const vulns = vulnsBy.get(d.id) ?? d.vulnerability_count ?? 0;
      const cis = d.cis_score_pct;
      const score = al.crit * 10 + al.high * 4 + vulns * 2 + (cis == null ? 0 : cis < 50 ? 10 : cis < 80 ? 4 : 0);
      const reasons: string[] = [];
      if (al.crit) reasons.push(`${al.crit} critical alert${al.crit > 1 ? "s" : ""}`);
      if (al.high) reasons.push(`${al.high} high alert${al.high > 1 ? "s" : ""}`);
      if (vulns) reasons.push(`${vulns} vulnerabilit${vulns > 1 ? "ies" : "y"}`);
      if (cis != null && cis < 80) reasons.push(`CIS ${cis}%`);
      return { d, score, reasons };
    }).filter(r => r.score > 0).sort((a, b) => b.score - a.score).slice(0, 6);
  }, [devices, alerts, openVulns]);

  const topAlerts = [...alerts]
    .filter(a => ["critical", "high"].includes(normSev(a.severity)))
    .sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9) || b.created_at.localeCompare(a.created_at))
    .slice(0, 6);

  const generatedAt = new Date().toLocaleString();

  return (
    <div className="flex flex-col min-h-full exec-report">
      <style>{`
        @media print {
          .no-print, aside { display: none !important; }
          main { margin-left: 0 !important; overflow: visible !important; }
          .h-screen { height: auto !important; overflow: visible !important; }
          .exec-report section { break-inside: avoid; }
        }
      `}</style>

      <div className="no-print">
        <TopBar title="Executive Summary" />
      </div>

      <Page className="max-w-[1200px]">
        <PageHeader
          title="Executive Summary"
          icon={Shield}
          crumbs={[{ label: "Operations" }, { label: "Executive Summary" }]}
          description={<>Security posture report for leadership · generated {generatedAt}</>}
          actions={<div className="no-print flex flex-wrap gap-2">
            <Button icon={RefreshCw} onClick={() => qc.invalidateQueries({ predicate: q => String(q.queryKey[0]).startsWith("exec-") })}>Refresh</Button>
            <Button variant="primary" icon={Printer} onClick={() => window.print()}>Print / save PDF</Button>
          </div>}
        />

        {devError && <p className="mb-3 text-[12.5px]" style={{ color: "var(--sev-critical)" }}>Could not load devices: {(devError as Error).message}</p>}

        {/* Headline: posture score + components */}
        <Panel title="Overall security posture" subtitle="Equal-weighted average of the measured areas below" className="mb-3">
          <div className="flex flex-col md:flex-row gap-6 md:items-center">
            <div className="flex items-center gap-5">
              <ScoreRing score={posture} />
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: "var(--c-muted)" }}>Grade</p>
                <p className="text-[44px] leading-[48px] font-semibold" style={{ color: scoreColor(posture) }}>{g.letter}</p>
                <Badge tone={g.tone}>{g.label}</Badge>
              </div>
            </div>
            <div className="flex-1 min-w-0 grid grid-cols-1 lg:grid-cols-2 gap-x-6">
              {components.map(c => <Meter key={c.label} label={c.label} value={c.value} sub={c.sub} to={c.to} />)}
            </div>
          </div>
        </Panel>

        {/* KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
          <StatTile label="Endpoints" icon={Monitor} tone="accent" value={total}
            sub={`${online} online now · ${pct(online, total)}%`} onClick={() => navigate("/devices")} />
          <StatTile label="Compliance" icon={CheckCircle} tone={avgCis == null ? "neutral" : avgCis >= 80 ? "ok" : avgCis >= 60 ? "medium" : "high"}
            value={avgCis == null ? "—" : `${avgCis}%`} sub={`${compliantCount} of ${total} compliant`} onClick={() => navigate("/compliance")} />
          <StatTile label="Open alerts" icon={AlertTriangle} tone={crit ? "critical" : high ? "high" : alerts.length ? "medium" : "ok"}
            value={alerts.length} sub={`${crit} critical · ${high} high`} onClick={() => navigate("/alerts")} />
          <StatTile label="Threat events (7d)" icon={Activity} tone={threatCount ? "high" : "ok"} value={threatCount}
            sub="EDR detections" onClick={() => navigate("/edr/detections")} />
        </div>

        {/* Trends */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-3">
          <Panel title="Alerts raised vs resolved — 30 days" subtitle={`${raised30} raised · ${resolved30} resolved`}
            actions={<div className="hidden sm:flex items-center gap-3 text-[11px]" style={{ color: "var(--c-muted)" }}>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm" style={{ background: "var(--sev-high)" }} />Raised</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm" style={{ background: "var(--ok)" }} />Resolved</span>
            </div>}>
            <div className="h-[200px] -ml-3">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke="var(--c-border)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="day" tick={{ fill: "var(--c-muted)", fontSize: 11 }} axisLine={false} tickLine={false} interval={6} />
                  <YAxis allowDecimals={false} tick={{ fill: "var(--c-muted)", fontSize: 11 }} axisLine={false} tickLine={false} width={32} />
                  <Tooltip {...chartTooltip} />
                  <Area type="monotone" dataKey="raised" name="Raised" stroke="var(--sev-high)" fill="var(--sev-high)" fillOpacity={0.2} strokeWidth={1.5} />
                  <Area type="monotone" dataKey="resolved" name="Resolved" stroke="var(--ok)" fill="var(--ok)" fillOpacity={0.15} strokeWidth={1.5} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <Panel title="EDR threat events — 30 days" subtitle={`${edr30} events detected and handled by endpoint agents`}>
            <div className="h-[200px] -ml-3">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trend} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke="var(--c-border)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="day" tick={{ fill: "var(--c-muted)", fontSize: 11 }} axisLine={false} tickLine={false} interval={6} />
                  <YAxis allowDecimals={false} tick={{ fill: "var(--c-muted)", fontSize: 11 }} axisLine={false} tickLine={false} width={32} />
                  <Tooltip {...chartTooltip} cursor={{ fill: "var(--c-row-hover)" }} />
                  <Bar dataKey="threats" name="Threat events" fill="var(--c-accent)" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>
        </div>

        {/* Top risks */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-3">
          <Panel title="Highest-risk endpoints" subtitle="Ranked by open alerts, vulnerabilities and compliance" noPad
            actions={<Link to="/devices" className="no-print text-[12px] font-medium flex items-center gap-1" style={{ color: "var(--c-accent)" }}>All devices <ArrowRight className="w-3.5 h-3.5" /></Link>}>
            {riskiest.length === 0 ? (
              <EmptyState icon={ShieldCheck} title="No endpoints at elevated risk" hint="No open critical/high alerts, vulnerabilities or failing compliance." />
            ) : (
              <ol>
                {riskiest.map((r, i) => (
                  <li key={r.d.id}>
                    <button onClick={() => navigate(`/device/${r.d.id}`)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-left border-b hover:bg-[var(--c-row-hover)]" style={{ borderColor: "var(--c-divider)" }}>
                      <span className="w-5 text-[12px] tabular-nums font-semibold" style={{ color: "var(--c-muted)" }}>{i + 1}</span>
                      <Laptop className="w-4 h-4 shrink-0" style={{ color: "var(--c-muted)" }} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium truncate" style={{ color: "var(--c-strong)" }}>{r.d.hostname}</p>
                        <p className="text-[11.5px] truncate" style={{ color: "var(--c-muted)" }}>{r.reasons.join(" · ")}</p>
                      </div>
                      <Badge tone={r.score >= 20 ? "critical" : r.score >= 8 ? "high" : "medium"}>Risk {r.score}</Badge>
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </Panel>

          <Panel title="Top open threats" subtitle="Critical and high alerts awaiting action" noPad
            actions={<Link to="/alerts" className="no-print text-[12px] font-medium flex items-center gap-1" style={{ color: "var(--c-accent)" }}>Alert queue <ArrowRight className="w-3.5 h-3.5" /></Link>}>
            {topAlerts.length === 0 ? (
              <EmptyState icon={ShieldCheck} title="No critical or high alerts open" hint="The fleet has no outstanding high-severity detections." />
            ) : (
              <ul>
                {topAlerts.map(a => (
                  <li key={a.id}>
                    <button onClick={() => navigate(`/alerts?id=${a.id}`)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-left border-b hover:bg-[var(--c-row-hover)]" style={{ borderColor: "var(--c-divider)" }}>
                      <SeverityBadge severity={a.severity} />
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] truncate" style={{ color: "var(--c-strong)" }}>{a.message}</p>
                        <p className="text-[11.5px] truncate" style={{ color: "var(--c-muted)" }}>{a.devices?.hostname ?? "—"} · {a.alert_type.replace(/_/g, " ")}</p>
                      </div>
                      <span className="text-[11.5px] whitespace-nowrap" style={{ color: "var(--c-muted)" }}>{timeAgo(a.created_at)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        {/* Coverage */}
        <Panel title="Protection coverage" subtitle="How much of the fleet each control reaches" className="mb-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
            <Meter label="Agents reporting (24h)" value={total ? pct(reporting24h, total) : null} sub={`${reporting24h} of ${total} endpoints`} to="/devices" />
            <Meter label="Disk encryption enabled" value={encPct} sub={enc.length ? `${enc.filter(d => d.filevault_enabled).length} of ${enc.length} reporting` : "Not reported yet"} />
            <Meter label="Host firewall enabled" value={fwPct} sub={fw.length ? `${fw.filter(d => d.firewall_enabled).length} of ${fw.length} reporting` : "Not reported yet"} />
            <Meter label="CIS compliant (80% or higher)" value={total ? pct(compliantCount, total) : null} sub={`${compliantCount} of ${total} endpoints`} to="/compliance" />
            <Meter label="Web categories blocked" value={policy && policy.catsTotal ? pct(policy.catsOn, policy.catsTotal) : null}
              sub={policy ? `${policy.catsOn} of ${policy.catsTotal} categories · ${policy.webRules} custom rules` : "…"} to="/web-filter" />
            <Meter label="Free of known vulnerabilities" value={vulnFreePct} sub={`${openVulns.length} open findings`} to="/vulnerabilities" />
          </div>
          <div className="mt-3 pt-3 border-t flex flex-wrap gap-2 text-[12px]" style={{ borderColor: "var(--c-border)", color: "var(--c-muted)" }}>
            <Badge tone="accent"><Bug className="w-3 h-3" /> {openVulns.length} open vulnerabilities</Badge>
            <Badge tone="accent">{policy?.blockedApps ?? 0} blocked applications</Badge>
            <Badge tone="accent">{devices.filter(d => d.os_type === "windows").length} Windows · {devices.filter(d => d.os_type !== "windows").length} macOS</Badge>
          </div>
        </Panel>

        <p className="text-center text-[11px] py-4" style={{ color: "var(--c-muted)" }}>SparrowShield Security Platform · Report generated {generatedAt}</p>
      </Page>
    </div>
  );
}
