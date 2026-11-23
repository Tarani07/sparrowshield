// Scheduled report delivery (email via Resend + Slack). Delivered hourly by pg_cron → send-reports.
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { CalendarClock, Plus, Send, Trash2, Pause, Play, Mail, MessageSquare, AlertTriangle } from "lucide-react";
import { supabase } from "../lib/supabase";
import { timeAgo } from "../lib/utils";
import { useAuth } from "../lib/AuthContext";
import { DataTable, Badge, Button, Drawer, inputClass, type Column } from "./ui";

type Schedule = {
  id: string; name: string; report_type: "executive" | "alerts" | "compliance" | "devices"; frequency: "daily" | "weekly" | "monthly";
  day_of_week: number | null; hour_utc: number; recipients: string[]; send_slack: boolean; enabled: boolean;
  next_run_at: string | null; last_run_at: string | null; last_status: string | null; last_message: string | null;
};

const TYPES = {
  executive: { label: "Executive summary", desc: "Posture KPIs, open alerts, compliance and at-risk devices" },
  alerts: { label: "Alert digest", desc: "Every alert raised in the period, by severity" },
  compliance: { label: "Compliance", desc: "Framework scores and devices with failing controls" },
  devices: { label: "Device inventory", desc: "All endpoints with OS, user, posture issues and last check-in" },
} as const;
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
// Show the delivery time in the viewer's local time zone; stored as UTC hour.
const localHour = (utcHour: number) => {
  const d = new Date(); d.setUTCHours(utcHour, 0, 0, 0);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
};
const cadence = (s: Pick<Schedule, "frequency" | "day_of_week" | "hour_utc">) =>
  s.frequency === "daily" ? `Daily at ${localHour(s.hour_utc)}`
  : s.frequency === "weekly" ? `Weekly on ${DAYS[s.day_of_week ?? 1]} at ${localHour(s.hour_utc)}`
  : `Monthly on the 1st at ${localHour(s.hour_utc)}`;

const EMPTY = { name: "", report_type: "executive" as Schedule["report_type"], frequency: "weekly" as Schedule["frequency"],
  day_of_week: 1, local_hour: 9, recipients: "", send_slack: true };

export default function ReportSchedules() {
  const qc = useQueryClient();
  const { isAdmin, user } = useAuth();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...EMPTY, recipients: user?.email ?? "" });
  const [rowMsg, setRowMsg] = useState<Record<string, string>>({});

  const { data: schedules = [], isLoading } = useQuery<Schedule[]>({
    queryKey: ["report-schedules"],
    queryFn: async () => (await supabase.from("report_schedules").select("*").order("created_at")).data as Schedule[] ?? [],
    refetchInterval: 30_000,
  });
  const { data: email } = useQuery({
    queryKey: ["integration-status", "email"],
    queryFn: async () => (await supabase.from("integration_status").select("configured").eq("name", "email").maybeSingle()).data,
  });

  const create = useMutation({
    mutationFn: async () => {
      // Convert the chosen local hour to UTC for storage.
      const d = new Date(); d.setHours(form.local_hour, 0, 0, 0);
      const recipients = form.recipients.split(/[\s,;]+/).map(r => r.trim()).filter(r => /@/.test(r));
      const { error } = await supabase.from("report_schedules").insert({
        name: form.name.trim() || `${TYPES[form.report_type].label} (${form.frequency})`,
        report_type: form.report_type, frequency: form.frequency,
        day_of_week: form.frequency === "weekly" ? form.day_of_week : null,
        hour_utc: d.getUTCHours(), recipients, send_slack: form.send_slack, enabled: true,
      });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["report-schedules"] }); setOpen(false); setForm({ ...EMPTY, recipients: user?.email ?? "" }); },
  });
  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Schedule> }) => {
      const { error } = await supabase.from("report_schedules").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["report-schedules"] }),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("report_schedules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["report-schedules"] }),
  });
  const sendNow = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.functions.invoke("send-reports", { body: { schedule_id: id } });
      if (error) throw error;
      return { id, message: (data as { results?: { message: string }[] })?.results?.[0]?.message ?? "Sent" };
    },
    onMutate: id => setRowMsg(m => ({ ...m, [id]: "Sending…" })),
    onSuccess: r => { setRowMsg(m => ({ ...m, [r.id]: r.message })); qc.invalidateQueries({ queryKey: ["report-schedules"] }); },
    onError: (e, id) => setRowMsg(m => ({ ...m, [id]: `Failed: ${(e as Error).message}` })),
  });

  const columns: Column<Schedule>[] = [
    { key: "name", header: "Schedule", render: s => (
      <div className="min-w-0">
        <p className="font-medium truncate" style={{ color: "var(--c-strong)" }}>{s.name}</p>
        <p className="text-[11.5px]" style={{ color: "var(--c-muted)" }}>{TYPES[s.report_type].label} · {cadence(s)}</p>
      </div>) },
    { key: "delivery", header: "Delivery", sortable: false, render: s => (
      <div className="flex flex-wrap gap-1.5">
        {s.recipients.length > 0 && <Badge tone="accent"><Mail className="w-3 h-3" />{s.recipients.length} email</Badge>}
        {s.send_slack && <Badge tone="accent"><MessageSquare className="w-3 h-3" />Slack</Badge>}
        {!s.recipients.length && !s.send_slack && <Badge tone="medium">No destination</Badge>}
      </div>) },
    { key: "next_run_at", header: "Next", hideBelow: "md", value: s => s.next_run_at ?? "",
      render: s => s.enabled ? (s.next_run_at ? new Date(s.next_run_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "—") : <Badge tone="neutral">Paused</Badge> },
    { key: "last_run_at", header: "Last delivery", value: s => s.last_run_at ?? "", render: s => (
      <div className="min-w-0 max-w-[280px]">
        {s.last_run_at ? <>
          <Badge tone={s.last_status === "ok" ? "ok" : s.last_status === "partial" ? "medium" : "critical"}>{s.last_status === "ok" ? "Delivered" : s.last_status === "partial" ? "Partly delivered" : "Failed"}</Badge>
          <p className="text-[11px] mt-0.5 truncate" title={s.last_message ?? ""} style={{ color: "var(--c-muted)" }}>{timeAgo(s.last_run_at)} · {s.last_message}</p>
        </> : <span style={{ color: "var(--c-muted)" }}>Not sent yet</span>}
        {rowMsg[s.id] && <p className="text-[11px] mt-0.5" style={{ color: rowMsg[s.id].startsWith("Failed") ? "var(--sev-critical)" : "var(--c-text)" }}>{rowMsg[s.id]}</p>}
      </div>) },
    { key: "actions", header: "", sortable: false, align: "right", width: "230px", render: s => isAdmin ? (
      <div className="flex items-center justify-end gap-1.5">
        <Button size="sm" icon={Send} adminOnly disabled={sendNow.isPending} onClick={() => sendNow.mutate(s.id)}>Send now</Button>
        <Button size="sm" icon={s.enabled ? Pause : Play} adminOnly onClick={() => update.mutate({ id: s.id, patch: { enabled: !s.enabled } })}>{s.enabled ? "Pause" : "Resume"}</Button>
        <button onClick={() => remove.mutate(s.id)} title="Delete schedule" className="p-1.5 rounded hover:bg-[var(--c-card2)]" style={{ color: "var(--c-muted)" }}><Trash2 className="w-4 h-4" /></button>
      </div>) : null },
  ];

  return (
    <div className="space-y-3">
      {email && !email.configured && (
        <div className="rounded-md border px-3 py-2 text-[12.5px] flex items-start gap-2" style={{ borderColor: "var(--c-border2)", background: "var(--c-card2)", color: "var(--c-text)" }}>
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "var(--sev-medium)" }} />
          <span>Email delivery isn't set up yet — reports go to Slack only. Add a Resend API key in{" "}
            <Link to="/settings?tab=integrations" className="underline" style={{ color: "var(--c-accent)" }}>Settings → Integrations</Link>.</span>
        </div>
      )}
      <DataTable rows={schedules} columns={columns} rowKey={s => s.id} loading={isLoading}
        searchPlaceholder="Search schedules…" exportName="report-schedules"
        toolbar={<Button variant="primary" size="sm" icon={Plus} onClick={() => setOpen(true)}>New schedule</Button>}
        empty={<span className="inline-flex items-center gap-2"><CalendarClock className="w-4 h-4" /> No scheduled reports — create one to receive a weekly summary automatically.</span>} />

      <Drawer open={open} onClose={() => setOpen(false)} title="Schedule a report" width={480}
        footer={<>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="primary" icon={CalendarClock} onClick={() => create.mutate()} disabled={create.isPending || (!form.send_slack && !form.recipients.trim())}>
            {create.isPending ? "Saving…" : "Create schedule"}
          </Button>
        </>}>
        <div className="space-y-4">
          <fieldset className="space-y-2">
            <legend className="text-[12px] font-medium mb-1.5" style={{ color: "var(--c-text)" }}>Report</legend>
            {(Object.keys(TYPES) as (keyof typeof TYPES)[]).map(t => (
              <label key={t} className="flex items-start gap-2.5 rounded-md border p-2.5 cursor-pointer"
                style={{ borderColor: form.report_type === t ? "var(--c-accent)" : "var(--c-border2)", background: form.report_type === t ? "var(--c-accent-bg)" : "var(--c-card2)" }}>
                <input type="radio" name="rtype" className="mt-0.5" checked={form.report_type === t} onChange={() => setForm(f => ({ ...f, report_type: t }))} />
                <span><span className="block text-[13px] font-medium" style={{ color: "var(--c-strong)" }}>{TYPES[t].label}</span>
                  <span className="block text-[12px]" style={{ color: "var(--c-muted)" }}>{TYPES[t].desc}</span></span>
              </label>
            ))}
          </fieldset>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--c-text)" }}>Frequency</span>
              <select className={`${inputClass} w-full`} value={form.frequency} onChange={e => setForm(f => ({ ...f, frequency: e.target.value as Schedule["frequency"] }))}>
                <option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly (1st)</option>
              </select>
            </label>
            {form.frequency === "weekly" && (
              <label className="block">
                <span className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--c-text)" }}>Day</span>
                <select className={`${inputClass} w-full`} value={form.day_of_week} onChange={e => setForm(f => ({ ...f, day_of_week: Number(e.target.value) }))}>
                  {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
                </select>
              </label>
            )}
            <label className="block">
              <span className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--c-text)" }}>Time (your time zone)</span>
              <select className={`${inputClass} w-full`} value={form.local_hour} onChange={e => setForm(f => ({ ...f, local_hour: Number(e.target.value) }))}>
                {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{new Date(2000, 0, 1, h).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</option>)}
              </select>
            </label>
          </div>
          <label className="block">
            <span className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--c-text)" }}>Email recipients</span>
            <textarea rows={2} className="w-full px-2.5 py-2 rounded-md border text-[13px] outline-none bg-[var(--c-card2)] border-[var(--c-border2)] text-[var(--c-strong)] focus:border-[var(--c-accent)]"
              value={form.recipients} onChange={e => setForm(f => ({ ...f, recipients: e.target.value }))} placeholder="security@company.com, cto@company.com" />
          </label>
          <label className="flex items-center gap-2 text-[13px]" style={{ color: "var(--c-strong)" }}>
            <input type="checkbox" checked={form.send_slack} onChange={e => setForm(f => ({ ...f, send_slack: e.target.checked }))} />
            Also post a summary to Slack
          </label>
          <label className="block">
            <span className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--c-text)" }}>Name (optional)</span>
            <input className={`${inputClass} w-full`} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder={`${TYPES[form.report_type].label} (${form.frequency})`} />
          </label>
          {create.isError && <p className="text-[12.5px]" style={{ color: "var(--sev-critical)" }}>{(create.error as Error).message}</p>}
        </div>
      </Drawer>
    </div>
  );
}
