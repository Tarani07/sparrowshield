import { useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Cpu, CheckCircle2, AlertTriangle, XCircle, Laptop, Apple, Monitor, BellRing } from "lucide-react";
import { supabase } from "../lib/supabase";
import { timeAgo } from "../lib/utils";
import TopBar from "../components/layout/TopBar";
import { Page, PageHeader, Panel, StatTile, DataTable, Badge, type Column, type FilterDef } from "../components/ui";
import { type SensorRow, CATEGORIES, STATUS_META, categoryLabel, categoryRank, sensorIcon, isIssue } from "../lib/sensors";

type Row = SensorRow & { devices: { hostname: string | null; os_type: string | null; assigned_user: string | null; status: string | null } | null };

const isMac = (os?: string | null) => ["mac", "macos", "darwin"].includes((os ?? "").toLowerCase());

export default function SensorHealth() {
  const navigate = useNavigate();
  const [focus, setFocus] = useState<"issues" | "error" | "warning" | "ok" | null>("issues");

  const { data: rows = [], isLoading } = useQuery<Row[]>({
    queryKey: ["fleet-sensors"],
    queryFn: async () => ((await supabase.from("device_sensors")
      .select("*, devices(hostname, os_type, assigned_user, status)")
      .order("updated_at", { ascending: false }).limit(5000)).data ?? []) as Row[],
  });

  const present = rows.filter(r => r.status !== "not_present");
  const errors = rows.filter(r => r.status === "error");
  const warnings = rows.filter(r => r.status === "warning");
  const devices = new Set(rows.map(r => r.device_id));
  const devicesWithIssues = new Set(rows.filter(r => isIssue(r.status)).map(r => r.device_id));

  const visible = (focus === "issues" ? rows.filter(r => isIssue(r.status))
    : focus ? rows.filter(r => r.status === focus) : present)
    .slice().sort((a, b) => STATUS_META[a.status].rank - STATUS_META[b.status].rank
      || categoryRank(a.category) - categoryRank(b.category) || (a.devices?.hostname ?? "").localeCompare(b.devices?.hostname ?? ""));

  // Coverage by category, split by platform (mirrors the Mac vs Windows sensor comparison).
  const coverage = useMemo(() => CATEGORIES.map(c => {
    const inCat = rows.filter(r => r.category === c.key);
    const side = (mac: boolean) => {
      const devs = new Set(rows.filter(r => isMac(r.devices?.os_type) === mac).map(r => r.device_id));
      const cat = inCat.filter(r => isMac(r.devices?.os_type) === mac);
      const has = new Set(cat.filter(r => r.status !== "not_present").map(r => r.device_id));
      const bad = new Set(cat.filter(r => isIssue(r.status)).map(r => r.device_id));
      const names = [...new Set(cat.filter(r => r.status !== "not_present").map(r => r.name))];
      return { total: devs.size, has: has.size, bad: bad.size, names };
    };
    return { ...c, mac: side(true), win: side(false) };
  }), [rows]);
  const hasMac = rows.some(r => isMac(r.devices?.os_type));
  const hasWin = rows.some(r => r.devices && !isMac(r.devices.os_type));

  const columns: Column<Row>[] = [
    { key: "device", header: "Device", value: r => r.devices?.hostname ?? "", render: r => (
      <div className="min-w-0">
        <p className="font-medium truncate max-w-[220px]" style={{ color: "var(--c-strong)" }}>{r.devices?.hostname ?? "Unknown"}</p>
        <p className="text-[11.5px]" style={{ color: "var(--c-muted)" }}>{isMac(r.devices?.os_type) ? "macOS" : "Windows"}{r.devices?.assigned_user ? ` · ${r.devices.assigned_user}` : ""}</p>
      </div>) },
    { key: "name", header: "Sensor", value: r => r.name, render: r => {
      const Icon = sensorIcon(r.sensor);
      return <span className="inline-flex items-center gap-2"><Icon className="w-4 h-4" style={{ color: "var(--c-muted)" }} />{r.name}</span>;
    } },
    { key: "category", header: "Type", hideBelow: "lg", value: r => categoryLabel(r.category) },
    { key: "status", header: "Status", value: r => STATUS_META[r.status].label,
      render: r => <Badge tone={STATUS_META[r.status].tone} dot>{STATUS_META[r.status].label}</Badge> },
    { key: "detail", header: "Detail", hideBelow: "md", value: r => r.detail ?? "",
      render: r => <span className="line-clamp-1 max-w-[380px]" style={{ color: "var(--c-text)" }}>{r.detail ?? "—"}</span> },
    { key: "changed_at", header: "Since", hideBelow: "xl", value: r => r.changed_at, render: r => timeAgo(r.changed_at) },
    { key: "updated_at", header: "Checked", value: r => r.updated_at, render: r => timeAgo(r.updated_at) },
  ];

  const filters: FilterDef<Row>[] = [
    { key: "cat", label: "Type", options: CATEGORIES.map(c => ({ value: c.key, label: c.label })), get: r => r.category },
    { key: "os", label: "OS", options: [{ value: "mac", label: "macOS" }, { value: "win", label: "Windows" }], get: r => (isMac(r.devices?.os_type) ? "mac" : "win") },
  ];

  return (
    <div className="flex flex-col min-h-full">
      <TopBar title="Sensor Health" />
      <Page>
        <PageHeader
          title="Sensor Health"
          icon={Cpu}
          crumbs={[{ label: "Endpoints" }, { label: "Sensor Health" }]}
          description={<>Hardware sensors on every laptop, checked by the agent every 10 minutes. A sensor that stops working raises an alert and a Slack message, and the alert closes itself when the sensor recovers.</>}
          actions={<Link to="/alerts" className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border text-[13px] font-medium"
            style={{ borderColor: "var(--c-border2)", background: "var(--c-card2)", color: "var(--c-strong)" }}><BellRing className="w-3.5 h-3.5" />Sensor alerts</Link>}
        />

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
          <StatTile label="Devices reporting" icon={Laptop} value={devices.size} sub={`${devicesWithIssues.size} with sensor issues`} />
          <StatTile label="Open issues" icon={AlertTriangle} tone={errors.length + warnings.length ? "high" : "ok"} value={errors.length + warnings.length}
            onClick={() => setFocus("issues")} active={focus === "issues"} />
          <StatTile label="Failures" icon={XCircle} tone={errors.length ? "critical" : "ok"} value={errors.length}
            onClick={() => setFocus("error")} active={focus === "error"} />
          <StatTile label="Warnings" icon={AlertTriangle} tone={warnings.length ? "medium" : "ok"} value={warnings.length}
            onClick={() => setFocus("warning")} active={focus === "warning"} />
          <StatTile label="Sensors working" icon={CheckCircle2} tone="ok" value={present.length - errors.length - warnings.length}
            sub="Click to list every sensor" onClick={() => setFocus(null)} active={focus === null} />
        </div>

        <DataTable rows={visible} columns={columns} rowKey={r => `${r.device_id}:${r.sensor}`} loading={isLoading} filters={filters}
          searchPlaceholder="Search device, sensor, detail…" exportName="sensor-health"
          onRowClick={r => navigate(`/device/${r.device_id}`)}
          rowTone={r => (r.status === "error" ? "var(--sev-critical)" : r.status === "warning" ? "var(--sev-medium)" : undefined)}
          empty={focus === "issues" ? "No sensor issues — every detected sensor is working." : rows.length ? "Nothing matches." : "No sensor reports yet. Agents send their first report about a minute after updating."} />

        <Panel className="mt-4" title="Sensor coverage by platform" subtitle="Devices where each sensor type is present, and how many have a problem" noPad>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-[0.06em]" style={{ color: "var(--c-muted)" }}>
                  <th className="px-4 py-2.5 font-semibold">Sensor type</th>
                  <th className="px-4 py-2.5 font-semibold"><span className="inline-flex items-center gap-1.5"><Apple className="w-3.5 h-3.5" />MacBook (macOS)</span></th>
                  <th className="px-4 py-2.5 font-semibold"><span className="inline-flex items-center gap-1.5"><Monitor className="w-3.5 h-3.5" />Windows laptops</span></th>
                </tr>
              </thead>
              <tbody>
                {coverage.map(c => (
                  <tr key={c.key} className="border-t" style={{ borderColor: "var(--c-divider)" }}>
                    <td className="px-4 py-2.5 font-medium" style={{ color: "var(--c-strong)" }}>{c.label}</td>
                    {[{ s: c.mac, on: hasMac }, { s: c.win, on: hasWin }].map(({ s, on }, i) => (
                      <td key={i} className="px-4 py-2.5 align-top">
                        {!on ? <span style={{ color: "var(--c-muted)" }}>No devices yet</span>
                          : s.has === 0 ? <span style={{ color: "var(--c-muted)" }}>Not available</span>
                          : (
                            <div className="flex flex-col gap-1">
                              <span className="inline-flex items-center gap-2 flex-wrap">
                                <span style={{ color: "var(--c-text)" }}>{s.has}/{s.total} devices</span>
                                {s.bad > 0 ? <Badge tone="critical" dot>{s.bad} with issues</Badge> : <Badge tone="ok" dot>Healthy</Badge>}
                              </span>
                              <span className="text-[11.5px]" style={{ color: "var(--c-muted)" }}>{s.names.join(", ")}</span>
                            </div>
                          )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </Page>
    </div>
  );
}
