import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Cloud, ShieldCheck, ShieldOff, Lock, WifiOff, Laptop, Rocket } from "lucide-react";
import { supabase } from "../lib/supabase";
import { timeAgo } from "../lib/utils";
import TopBar from "../components/layout/TopBar";
import { Page, PageHeader, StatTile, DataTable, Badge, Button, Drawer, EmptyState, type Column, type FilterDef } from "../components/ui";
import { JumpCloudInsights, type JcSystem } from "../components/device/JumpCloudInsights";

const STALE_MS = 7 * 86400_000;

export default function JumpCloudInventory() {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<JcSystem | null>(null);
  const [focus, setFocus] = useState<string | null>(null);

  const { data: status } = useQuery({
    queryKey: ["integration-status", "jumpcloud"],
    queryFn: async () => (await supabase.from("integration_status").select("configured, last_sync_at, last_message").eq("name", "jumpcloud").maybeSingle()).data,
  });
  const { data: systems = [], isLoading } = useQuery<JcSystem[]>({
    queryKey: ["jumpcloud-systems"],
    queryFn: async () => (await supabase.from("jumpcloud_systems").select("*").order("hostname")).data as JcSystem[] ?? [],
  });

  const stale = (s: JcSystem) => !s.last_contact || Date.now() - new Date(s.last_contact).getTime() > STALE_MS;
  const missing = systems.filter(s => !s.device_id);
  const noFde = systems.filter(s => s.fde_active === false);
  const rows = systems.filter(s =>
    focus === "missing" ? !s.device_id : focus === "protected" ? !!s.device_id : focus === "fde" ? s.fde_active === false : focus === "stale" ? stale(s) : true);

  const columns: Column<JcSystem>[] = [
    { key: "hostname", header: "System", value: s => s.display_name ?? s.hostname ?? "", render: s => (
      <div className="min-w-0">
        <p className="font-medium truncate max-w-[260px]" style={{ color: "var(--c-strong)" }}>{s.display_name ?? s.hostname}</p>
        <p className="text-[11.5px] font-mono" style={{ color: "var(--c-muted)" }}>{s.serial_number ?? "no serial"}</p>
      </div>) },
    { key: "coverage", header: "SparrowShield", value: s => (s.device_id ? "Protected" : "Missing agent"), render: s => s.device_id
      ? <Badge tone="ok" dot>Protected</Badge> : <Badge tone="high" dot>Missing agent</Badge> },
    { key: "os", header: "OS", hideBelow: "md", value: s => `${s.os ?? ""} ${s.os_version ?? ""}` },
    { key: "fde_active", header: "Encryption", value: s => (s.fde_active == null ? "" : s.fde_active ? "Encrypted" : "Not encrypted"),
      render: s => s.fde_active == null ? <span style={{ color: "var(--c-muted)" }}>—</span> : <Badge tone={s.fde_active ? "ok" : "critical"}>{s.fde_active ? "Encrypted" : "Not encrypted"}</Badge> },
    { key: "last_contact", header: "Last contact", value: s => s.last_contact ?? "",
      render: s => <span style={{ color: stale(s) ? "var(--sev-high)" : undefined }}>{s.last_contact ? timeAgo(s.last_contact) : "never"}</span> },
    { key: "agent_version", header: "JumpCloud agent", hideBelow: "lg", render: s => <span className="font-mono text-[12px]">{s.agent_version ?? "—"}</span> },
  ];
  const filters: FilterDef<JcSystem>[] = [
    { key: "os", label: "OS", options: [...new Set(systems.map(s => s.os).filter(Boolean) as string[])].map(o => ({ value: o, label: o })), get: s => s.os ?? "" },
    { key: "cov", label: "SparrowShield", options: [{ value: "yes", label: "Protected" }, { value: "no", label: "Missing agent" }], get: s => (s.device_id ? "yes" : "no") },
  ];

  return (
    <div className="flex flex-col min-h-full">
      <TopBar title="JumpCloud Inventory" />
      <Page>
        <PageHeader
          title="JumpCloud Inventory"
          icon={Cloud}
          crumbs={[{ label: "Endpoints" }, { label: "JumpCloud" }]}
          description={<>Machines managed in JumpCloud, matched to SparrowShield by serial number. {status?.last_sync_at ? <>Last synced {timeAgo(status.last_sync_at)}.</> : null}</>}
          actions={<Link to="/settings?tab=integrations" className="inline-flex items-center h-8 px-3 rounded-md border text-[13px] font-medium"
            style={{ borderColor: "var(--c-border2)", background: "var(--c-card2)", color: "var(--c-strong)" }}>Integration settings</Link>}
        />

        {!status?.configured ? (
          <div className="rounded-lg border" style={{ background: "var(--c-card)", borderColor: "var(--c-border)" }}>
            <EmptyState icon={Cloud} title="JumpCloud isn't connected"
              hint="Connect JumpCloud to see System Insights for every managed machine and spot laptops that are missing the SparrowShield agent."
              action={<Button variant="primary" onClick={() => navigate("/settings?tab=integrations")}>Connect JumpCloud</Button>} />
          </div>
        ) : (<>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
            <StatTile label="JumpCloud systems" icon={Laptop} value={systems.length} onClick={() => setFocus(null)} active={!focus} />
            <StatTile label="Protected" icon={ShieldCheck} tone="ok" value={systems.length - missing.length} onClick={() => setFocus("protected")} active={focus === "protected"} />
            <StatTile label="Missing agent" icon={ShieldOff} tone={missing.length ? "high" : "ok"} value={missing.length} sub="Deploy SparrowShield to these" onClick={() => setFocus("missing")} active={focus === "missing"} />
            <StatTile label="Not encrypted" icon={Lock} tone={noFde.length ? "critical" : "ok"} value={noFde.length} onClick={() => setFocus("fde")} active={focus === "fde"} />
            <StatTile label="No contact > 7 days" icon={WifiOff} tone="medium" value={systems.filter(stale).length} onClick={() => setFocus("stale")} active={focus === "stale"} />
          </div>
          <DataTable rows={rows} columns={columns} rowKey={s => s.jc_id} loading={isLoading} filters={filters}
            searchPlaceholder="Search hostname, serial, OS…" exportName="jumpcloud-inventory" initialSort={{ key: "coverage", dir: "desc" }}
            onRowClick={setSelected} selectedKey={selected?.jc_id ?? null}
            rowTone={s => (s.device_id ? undefined : "var(--sev-high)")} empty="No systems synced yet — use Sync now in Integration settings." />
        </>)}
      </Page>

      <Drawer open={!!selected} onClose={() => setSelected(null)} title={selected?.display_name ?? selected?.hostname ?? ""}
        subtitle={selected && (selected.device_id ? <Badge tone="ok" dot>Protected by SparrowShield</Badge> : <Badge tone="high" dot>SparrowShield agent missing</Badge>)}
        footer={selected && (selected.device_id
          ? <Button icon={Laptop} onClick={() => navigate(`/device/${selected.device_id}`)}>Open SparrowShield device</Button>
          : <span className="text-[12px] flex items-center gap-1.5" style={{ color: "var(--c-muted)" }}><Rocket className="w-3.5 h-3.5" /> Install with: <code className="font-mono" style={{ color: "var(--c-strong)" }}>curl -fsSL sparrowshield.vercel.app/mac | sudo bash</code></span>)}>
        {selected && <JumpCloudInsights s={selected} />}
      </Drawer>
    </div>
  );
}
