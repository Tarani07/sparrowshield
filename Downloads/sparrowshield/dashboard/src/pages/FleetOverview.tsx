import { useEffect, useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import {
  Laptop, ShieldAlert, Ban, PackageX, RefreshCw, ArrowRight, Apple, Monitor, Globe, AppWindow, ShieldCheck, Bot,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { timeAgo } from "../lib/utils";
import TopBar from "../components/layout/TopBar";
import ScanNowButton from "../components/ScanNowButton";
import { Page, PageHeader, Panel, StatTile, SeverityBadge, Badge, Button, EmptyState, SEVERITY_ORDER } from "../components/ui";

type Dev = { id: string; hostname: string; os_type: string; os_version: string | null; last_seen: string | null; agent_version: string | null; assigned_user: string | null };
type Al = { id: string; severity: string; created_at: string; resolved: boolean; mitre_technique: string | null; message: string; alert_type: string; device_id: string; devices: { hostname: string } | null };

const ONLINE_MS = 15 * 60_000;
const isOnline = (d: Dev) => !!d.last_seen && Date.now() - new Date(d.last_seen).getTime() < ONLINE_MS;
const SEV_COLORS: Record<string, string> = { critical: "var(--sev-critical)", high: "var(--sev-high)", medium: "var(--sev-medium)", low: "var(--sev-low)" };
const normSev = (s: string) => (s === "warning" ? "medium" : s === "info" ? "low" : s);

export default function FleetOverview() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const since30 = useMemo(() => new Date(Date.now() - 30 * 86400_000).toISOString(), []);
  const since1 = useMemo(() => new Date(Date.now() - 86400_000).toISOString(), []);

  const { data: devices = [], isLoading: devLoading } = useQuery<Dev[]>({
    queryKey: ["ov-devices"],
    queryFn: async () => (await supabase.from("devices")
      .select("id, hostname, os_type, os_version, last_seen, agent_version, assigned_user")).data as Dev[] ?? [],
    refetchInterval: 30_000,
  });
  const { data: alerts = [] } = useQuery<Al[]>({
    queryKey: ["ov-alerts"],
    queryFn: async () => (await supabase.from("alerts")
      .select("id, severity, created_at, resolved, mitre_technique, message, alert_type, device_id, devices(hostname)")
      .gte("created_at", since30).order("created_at", { ascending: false }).limit(1000)).data as unknown as Al[] ?? [],
    refetchInterval: 30_000,
  });
  const { data: blocked24 = 0 } = useQuery<number>({
    queryKey: ["ov-blocked"],
    queryFn: async () => (await supabase.from("security_events").select("*", { count: "exact", head: true })
      .in("event_type", ["blocked_app_killed", "policy_blocked", "malware_detected", "blocked_app_running"])
      .gte("created_at", since1)).count ?? 0,
    refetchInterval: 60_000,
  });
  const { data: violations = 0 } = useQuery<number>({
    queryKey: ["ov-violations"],
    queryFn: async () => (await supabase.from("software_violations").select("*", { count: "exact", head: true }).eq("resolved", false)).count ?? 0,
    refetchInterval: 60_000,
  });
  const { data: coverage } = useQuery({
    queryKey: ["ov-coverage"],
    queryFn: async () => {
      const [cats, web, apps] = await Promise.all([
        supabase.from("web_categories").select("name, enabled"),
        supabase.from("web_filter_rules").select("*", { count: "exact", head: true }).eq("enabled", true),
        supabase.from("software_lists").select("*", { count: "exact", head: true }).eq("list_type", "blocklist"),
      ]);
      return {
        categories: (cats.data ?? []) as { name: string; enabled: boolean }[],
        webRules: web.count ?? 0,
        blockedApps: apps.count ?? 0,
      };
    },
    refetchInterval: 60_000,
  });
  const [latestAgent, setLatestAgent] = useState<string | null>(null);
  useEffect(() => {
    fetch(`/agents/version.json?t=${Date.now()}`).then(r => r.json()).then(m => setLatestAgent(m.version ?? null)).catch(() => {});
  }, []);

  const open = alerts.filter(a => !a.resolved);
  const openCritical = open.filter(a => ["critical", "high"].includes(a.severity)).length;
  const online = devices.filter(isOnline).length;
  const upToDate = latestAgent ? devices.filter(d => d.agent_version === latestAgent).length : null;

  // 14-day detections by severity
  const trend = useMemo(() => {
    const days: Record<string, Record<string, number | string>> = {};
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400_000);
      const k = d.toISOString().slice(0, 10);
      days[k] = { day: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }), critical: 0, high: 0, medium: 0, low: 0 };
    }
    for (const a of alerts) {
      const k = a.created_at.slice(0, 10);
      const s = normSev(a.severity);
      if (days[k] && s in SEV_COLORS) days[k][s] = Number(days[k][s]) + 1;
    }
    return Object.values(days);
  }, [alerts]);

  const bySeverity = useMemo(() => {
    const c: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const a of open) { const s = normSev(a.severity); if (s in c) c[s]++; }
    return c;
  }, [open]);

  const techniques = useMemo(() => {
    const c = new Map<string, number>();
    for (const a of alerts) if (a.mitre_technique) c.set(a.mitre_technique, (c.get(a.mitre_technique) ?? 0) + 1);
    return [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [alerts]);

  const recent = [...open].sort((a, b) =>
    (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9) || b.created_at.localeCompare(a.created_at)).slice(0, 7);
  const maxTech = techniques[0]?.[1] ?? 1;
  const totalOpen = Math.max(1, open.length);

  return (
    <div className="flex flex-col min-h-full">
      <TopBar title="Security Overview" />
      <Page>
        <PageHeader
          title="Security Overview"
          description="Real-time posture of every enrolled endpoint — detections, policy enforcement and agent health."
          actions={<>
            <Button icon={RefreshCw} onClick={() => qc.invalidateQueries()}>Refresh</Button>
            <ScanNowButton />
          </>}
        />

        {/* KPI row */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <StatTile label="Endpoints online" icon={Laptop} tone="ok" onClick={() => navigate("/devices")}
            value={<>{online}<span className="text-[15px] font-medium" style={{ color: "var(--c-muted)" }}> / {devices.length}</span></>}
            sub={devices.length - online ? `${devices.length - online} offline > 15 min` : "All endpoints reporting"} />
          <StatTile label="Open alerts" icon={ShieldAlert} tone={openCritical ? "critical" : open.length ? "medium" : "ok"}
            onClick={() => navigate("/alerts")} value={open.length} sub={`${openCritical} critical / high`} />
          <StatTile label="Blocked (24h)" icon={Ban} tone="accent" value={blocked24} sub="Apps, processes and malware stopped" />
          <StatTile label="Policy violations" icon={PackageX} tone={violations ? "high" : "ok"}
            onClick={() => navigate("/app-filter")} value={violations} sub="Blocked apps still installed" />
          <StatTile label="Agents up to date" icon={Bot} tone={upToDate != null && upToDate < devices.length ? "medium" : "ok"}
            value={upToDate == null ? "—" : <>{upToDate}<span className="text-[15px] font-medium" style={{ color: "var(--c-muted)" }}> / {devices.length}</span></>}
            sub={latestAgent ? `Latest ${latestAgent} · auto-update hourly` : "Checking latest version…"} />
        </div>

        {/* Trend + severity mix */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-3 mt-3">
          <Panel title="Detections — last 14 days" subtitle="Alerts raised per day, by severity" className="xl:col-span-2"
            actions={<div className="hidden md:flex items-center gap-3 text-[11px]" style={{ color: "var(--c-muted)" }}>
              {Object.entries(SEV_COLORS).map(([k, c]) => (
                <span key={k} className="flex items-center gap-1.5 capitalize"><span className="w-2 h-2 rounded-sm" style={{ background: c }} />{k}</span>
              ))}
            </div>}>
            <div className="h-[220px] -ml-3">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke="var(--c-border)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="day" tick={{ fill: "var(--c-muted)", fontSize: 11 }} axisLine={false} tickLine={false} interval={1} />
                  <YAxis allowDecimals={false} tick={{ fill: "var(--c-muted)", fontSize: 11 }} axisLine={false} tickLine={false} width={32} />
                  <Tooltip
                    contentStyle={{ background: "var(--c-card)", border: "1px solid var(--c-border2)", borderRadius: 6, fontSize: 12 }}
                    labelStyle={{ color: "var(--c-strong)", fontWeight: 600 }} itemStyle={{ textTransform: "capitalize" }} />
                  {(["low", "medium", "high", "critical"] as const).map(k => (
                    <Area key={k} type="monotone" dataKey={k} stackId="1" stroke={SEV_COLORS[k]} fill={SEV_COLORS[k]} fillOpacity={0.25} strokeWidth={1.5} />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <Panel title="Open alerts by severity" actions={<Link to="/alerts" className="text-[12px] font-medium" style={{ color: "var(--c-accent)" }}>View all</Link>}>
            <div className="space-y-3.5">
              {(["critical", "high", "medium", "low"] as const).map(k => (
                <button key={k} onClick={() => navigate(`/alerts?severity=${k}`)} className="w-full text-left group">
                  <div className="flex items-center justify-between text-[12.5px] mb-1.5">
                    <span className="capitalize font-medium group-hover:underline" style={{ color: "var(--c-text)" }}>{k}</span>
                    <span className="tabular-nums font-semibold" style={{ color: "var(--c-strong)" }}>{bySeverity[k]}</span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--c-card2)" }}>
                    <div className="h-full rounded-full" style={{ width: `${(bySeverity[k] / totalOpen) * 100}%`, background: SEV_COLORS[k] }} />
                  </div>
                </button>
              ))}
            </div>
            <div className="mt-5 pt-4 border-t grid grid-cols-2 gap-3 text-[12px]" style={{ borderColor: "var(--c-border)" }}>
              <div><p style={{ color: "var(--c-muted)" }}>Raised (30d)</p><p className="text-[18px] font-semibold tabular-nums" style={{ color: "var(--c-strong)" }}>{alerts.length}</p></div>
              <div><p style={{ color: "var(--c-muted)" }}>Resolved (30d)</p><p className="text-[18px] font-semibold tabular-nums" style={{ color: "var(--c-strong)" }}>{alerts.length - open.length}</p></div>
            </div>
          </Panel>
        </div>

        {/* Recent alerts + endpoints */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-3 mt-3">
          <Panel title="Highest-priority open alerts" className="xl:col-span-2" noPad
            actions={<Link to="/alerts" className="text-[12px] font-medium flex items-center gap-1" style={{ color: "var(--c-accent)" }}>Alert queue <ArrowRight className="w-3.5 h-3.5" /></Link>}>
            {recent.length === 0 ? (
              <EmptyState icon={ShieldCheck} title="No open alerts" hint="Every detection has been resolved." />
            ) : (
              <ul>
                {recent.map(a => (
                  <li key={a.id}>
                    <button onClick={() => navigate(`/alerts?id=${a.id}`)}
                      className="w-full flex items-center gap-3 px-4 h-12 text-left border-b hover:bg-[var(--c-row-hover)]" style={{ borderColor: "var(--c-divider)" }}>
                      <SeverityBadge severity={a.severity} />
                      <span className="flex-1 min-w-0 truncate text-[13px]" style={{ color: "var(--c-strong)" }}>{a.message}</span>
                      <span className="hidden md:inline text-[12px] truncate max-w-[180px]" style={{ color: "var(--c-muted)" }}>{a.devices?.hostname ?? "—"}</span>
                      {a.mitre_technique && <Badge tone="accent" className="hidden lg:inline-flex font-mono">{a.mitre_technique}</Badge>}
                      <span className="text-[11.5px] whitespace-nowrap w-24 text-right" style={{ color: "var(--c-muted)" }}>{timeAgo(a.created_at)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Endpoints" noPad
            actions={<Link to="/devices" className="text-[12px] font-medium" style={{ color: "var(--c-accent)" }}>All devices</Link>}>
            {devLoading ? null : devices.length === 0 ? (
              <EmptyState icon={Laptop} title="No endpoints enrolled" hint="Use Deploy agent in the sidebar to install the first one." />
            ) : (
              <ul className="max-h-[340px] overflow-y-auto">
                {devices.slice(0, 12).map(d => {
                  const Icon = d.os_type === "windows" ? Monitor : Apple;
                  const on = isOnline(d);
                  return (
                    <li key={d.id}>
                      <button onClick={() => navigate(`/device/${d.id}`)}
                        className="w-full flex items-center gap-3 px-4 h-12 text-left border-b hover:bg-[var(--c-row-hover)]" style={{ borderColor: "var(--c-divider)" }}>
                        <Icon className="w-4 h-4 shrink-0" style={{ color: "var(--c-muted)" }} />
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-medium truncate" style={{ color: "var(--c-strong)" }}>{d.hostname}</p>
                          <p className="text-[11px] truncate" style={{ color: "var(--c-muted)" }}>
                            {d.os_version ?? d.os_type} · {d.last_seen ? timeAgo(d.last_seen) : "never"}
                          </p>
                        </div>
                        <Badge tone={on ? "ok" : "neutral"} dot>{on ? "Online" : "Offline"}</Badge>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </div>

        {/* MITRE + coverage */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-3">
          <Panel title="Top MITRE ATT&CK techniques (30d)" actions={<Link to="/mitre" className="text-[12px] font-medium" style={{ color: "var(--c-accent)" }}>Matrix</Link>}>
            {techniques.length === 0 ? (
              <p className="text-[12.5px]" style={{ color: "var(--c-muted)" }}>No technique-tagged detections in the last 30 days.</p>
            ) : (
              <div className="space-y-2.5">
                {techniques.map(([t, n]) => (
                  <div key={t} className="flex items-center gap-3">
                    <span className="w-24 shrink-0 font-mono text-[12px]" style={{ color: "var(--c-strong)" }}>{t}</span>
                    <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "var(--c-card2)" }}>
                      <div className="h-full rounded-full" style={{ width: `${(n / maxTech) * 100}%`, background: "var(--c-accent)" }} />
                    </div>
                    <span className="w-8 text-right tabular-nums text-[12px] font-semibold" style={{ color: "var(--c-strong)" }}>{n}</span>
                  </div>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Protection coverage">
            <div className="grid grid-cols-2 gap-3">
              <Link to="/web-filter" className="rounded-md border p-3 hover:border-[var(--c-border2)]" style={{ borderColor: "var(--c-border)", background: "var(--c-card2)" }}>
                <div className="flex items-center gap-2 text-[12px] font-semibold" style={{ color: "var(--c-strong)" }}><Globe className="w-4 h-4" style={{ color: "var(--c-accent)" }} /> Web filtering</div>
                <p className="mt-1 text-[12px]" style={{ color: "var(--c-muted)" }}>
                  {coverage ? `${coverage.categories.filter(c => c.enabled).length} of ${coverage.categories.length} categories blocked · ${coverage.webRules} custom rules` : "…"}
                </p>
              </Link>
              <Link to="/app-filter" className="rounded-md border p-3 hover:border-[var(--c-border2)]" style={{ borderColor: "var(--c-border)", background: "var(--c-card2)" }}>
                <div className="flex items-center gap-2 text-[12px] font-semibold" style={{ color: "var(--c-strong)" }}><AppWindow className="w-4 h-4" style={{ color: "var(--c-accent)" }} /> Application control</div>
                <p className="mt-1 text-[12px]" style={{ color: "var(--c-muted)" }}>{coverage ? `${coverage.blockedApps} blocked applications` : "…"}</p>
              </Link>
            </div>
            {coverage && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {coverage.categories.map(c => (
                  <Badge key={c.name} tone={c.enabled ? "critical" : "neutral"} className="capitalize">{c.name.replace("_", " ")}{c.enabled ? " · blocked" : ""}</Badge>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </Page>
    </div>
  );
}
