// Renders one JumpCloud system's System Insights (shared by the inventory drawer and device page).
import type { ReactNode } from "react";
import { KeyValue, Badge } from "../ui";

export type JcSystem = {
  jc_id: string; device_id: string | null; hostname: string | null; display_name: string | null; serial_number: string | null;
  os: string | null; os_version: string | null; arch: string | null; agent_version: string | null; active: boolean | null;
  last_contact: string | null; remote_ip: string | null; fde_active: boolean | null; fde_key_present: boolean | null;
  insights: Record<string, Record<string, unknown>[]>; synced_at: string;
};

const first = (s: JcSystem, t: string) => (s.insights?.[t] ?? [])[0] as Record<string, unknown> | undefined;
const yesNo = (v: unknown, onLabel = "On", offLabel = "Off"): ReactNode =>
  v == null ? "—" : <Badge tone={v === true || v === 1 || v === "1" ? "ok" : "high"}>{v === true || v === 1 || v === "1" ? onLabel : offLabel}</Badge>;
const gb = (bytes: unknown) => (bytes == null || isNaN(Number(bytes)) ? null : `${(Number(bytes) / 1024 ** 3).toFixed(0)} GB`);

export function JumpCloudInsights({ s }: { s: JcSystem }) {
  const info = first(s, "system_info");
  const os = first(s, "os_version");
  const up = first(s, "uptime");
  const alf = first(s, "alf");
  const bat = first(s, "battery");
  const enc = s.insights?.disk_encryption ?? [];
  const users = s.insights?.logged_in_users ?? [];

  return (
    <div className="space-y-5">
      <KeyValue items={[
        { label: "JumpCloud agent", value: <span className="inline-flex items-center gap-2">{s.agent_version ?? "—"} {s.active != null && <Badge tone={s.active ? "ok" : "neutral"} dot>{s.active ? "Active" : "Inactive"}</Badge>}</span> },
        { label: "Last contact", value: s.last_contact ? new Date(s.last_contact).toLocaleString() : "—" },
        { label: "Operating system", value: os ? `${os.name ?? s.os} ${os.version ?? s.os_version ?? ""}${os.build ? ` (${os.build})` : ""}` : `${s.os ?? ""} ${s.os_version ?? ""}` },
        { label: "Hardware", value: info ? `${info.hardware_model ?? ""}${info.cpu_brand ? ` · ${info.cpu_brand}` : ""}${gb(info.physical_memory) ? ` · ${gb(info.physical_memory)} RAM` : ""}` : (s.arch ?? "—") },
        { label: "Serial number", value: <span className="font-mono">{s.serial_number ?? (info?.hardware_serial as string) ?? "—"}</span> },
        { label: "Public IP", value: <span className="font-mono">{s.remote_ip ?? "—"}</span> },
        { label: "Disk encryption", value: <span className="inline-flex items-center gap-2">{yesNo(s.fde_active, "Encrypted", "Not encrypted")}{s.fde_key_present != null && <Badge tone={s.fde_key_present ? "ok" : "medium"}>{s.fde_key_present ? "Recovery key escrowed" : "No recovery key"}</Badge>}</span> },
        ...(alf ? [{ label: "macOS firewall", value: yesNo(Number(alf.global_state) > 0, "On", "Off") }] : []),
        ...(up ? [{ label: "Uptime", value: `${up.days ?? 0}d ${up.hours ?? 0}h` }] : []),
        ...(bat ? [{ label: "Battery", value: `${bat.percent_remaining ?? "—"}% · ${bat.condition ?? bat.health ?? ""} · ${bat.cycle_count ?? "—"} cycles` }] : []),
      ]} />

      {enc.length > 0 && (
        <div>
          <h4 className="text-[11px] font-semibold uppercase tracking-[0.06em] mb-2" style={{ color: "var(--c-muted)" }}>Volumes</h4>
          <ul className="space-y-1 text-[12.5px]">
            {enc.map((v, i) => (
              <li key={i} className="flex items-center justify-between gap-2">
                <span className="font-mono truncate" style={{ color: "var(--c-text)" }}>{String(v.name ?? v.uuid ?? `Volume ${i + 1}`)}</span>
                {yesNo(v.encrypted, "Encrypted", "Not encrypted")}
              </li>
            ))}
          </ul>
        </div>
      )}

      {users.length > 0 && (
        <div>
          <h4 className="text-[11px] font-semibold uppercase tracking-[0.06em] mb-2" style={{ color: "var(--c-muted)" }}>Signed-in users</h4>
          <div className="flex flex-wrap gap-1.5">
            {[...new Set(users.map(u => String(u.user ?? "")).filter(Boolean))].map(u => <Badge key={u} tone="accent">{u}</Badge>)}
          </div>
        </div>
      )}
      <p className="text-[11px]" style={{ color: "var(--c-muted)" }}>From JumpCloud System Insights · synced {new Date(s.synced_at).toLocaleString()}</p>
    </div>
  );
}
