// Device page: live state of every hardware sensor the agent can see, with a "Check now" action.
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Cpu } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { timeAgo } from "../../lib/utils";
import { Panel, Badge, Button, EmptyState } from "../ui";
import { type SensorRow, STATUS_META, categoryRank, categoryLabel, sensorIcon, isIssue } from "../../lib/sensors";

export default function SensorHealthPanel({ deviceId, online }: { deviceId: string; online?: boolean }) {
  const qc = useQueryClient();
  const [check, setCheck] = useState<"idle" | "running" | "done" | "failed">("idle");
  const [showAll, setShowAll] = useState(false);

  const { data: rows = [], isLoading } = useQuery<SensorRow[]>({
    queryKey: ["device-sensors", deviceId],
    queryFn: async () => ((await supabase.from("device_sensors").select("*").eq("device_id", deviceId)).data ?? []) as SensorRow[],
  });

  const runCheck = async () => {
    setCheck("running");
    const { data, error } = await supabase.from("device_commands")
      .insert({ device_id: deviceId, command_type: "check_sensors", payload: {} }).select("id").single();
    if (error || !data) { setCheck("failed"); return; }
    const started = Date.now();
    const poll = async () => {
      const { data: row } = await supabase.from("device_commands").select("status").eq("id", data.id).single();
      if (row?.status === "done" || row?.status === "failed") {
        setCheck(row.status === "done" ? "done" : "failed");
        qc.invalidateQueries({ queryKey: ["device-sensors", deviceId] });
        return;
      }
      if (Date.now() - started > 3 * 60_000) { setCheck("failed"); return; }
      setTimeout(poll, 3000);
    };
    setTimeout(poll, 3000);
  };

  const sorted = [...rows].sort((a, b) =>
    STATUS_META[a.status].rank - STATUS_META[b.status].rank || categoryRank(a.category) - categoryRank(b.category) || a.name.localeCompare(b.name));
  const present = sorted.filter(r => r.status !== "not_present");
  const absent = sorted.filter(r => r.status === "not_present");
  const issues = rows.filter(r => isIssue(r.status));
  const lastCheck = rows.reduce<string | null>((m, r) => (!m || r.updated_at > m ? r.updated_at : m), null);

  return (
    <Panel
      title="Sensor health"
      subtitle={rows.length
        ? <>{present.length} sensors detected · {issues.length ? <span style={{ color: "var(--sev-high)" }}>{issues.length} with issues</span> : "all working"}{lastCheck && <> · checked {timeAgo(lastCheck)}</>}</>
        : "Hardware sensors reported by the agent"}
      actions={<Button adminOnly size="sm" icon={RefreshCw} onClick={runCheck} disabled={check === "running" || online === false}
        title={online === false ? "Device is offline" : undefined}>
        {check === "running" ? "Checking…" : check === "done" ? "Checked ✓" : check === "failed" ? "Check failed — retry" : "Check now"}
      </Button>}
    >
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-[68px] rounded-lg animate-pulse" style={{ background: "var(--c-card2)" }} />)}
        </div>
      ) : !rows.length ? (
        <EmptyState icon={Cpu} title="No sensor report yet"
          hint="The agent checks sensors every 10 minutes after it updates. Use Check now to run it immediately." />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
            {present.map(r => <SensorTile key={r.sensor} r={r} />)}
          </div>
          {absent.length > 0 && (
            <div className="mt-3">
              <button className="text-[12px] font-medium" style={{ color: "var(--c-accent)" }} onClick={() => setShowAll(v => !v)}>
                {showAll ? "Hide" : "Show"} {absent.length} sensor{absent.length === 1 ? "" : "s"} this model doesn't have
              </button>
              {showAll && (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5 mt-2">
                  {absent.map(r => <SensorTile key={r.sensor} r={r} />)}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </Panel>
  );
}

function SensorTile({ r }: { r: SensorRow }) {
  const Icon = sensorIcon(r.sensor);
  const meta = STATUS_META[r.status];
  const issue = isIssue(r.status);
  const dim = r.status === "not_present";
  return (
    <div className="rounded-lg border px-3 py-2.5 flex gap-3 min-w-0"
      style={{
        background: issue ? "color-mix(in srgb, var(--sev-" + (r.status === "error" ? "critical" : "medium") + ") 8%, var(--c-card))" : "var(--c-card)",
        borderColor: issue ? `var(--sev-${r.status === "error" ? "critical" : "medium"})` : "var(--c-border)",
        opacity: dim ? 0.7 : 1,
      }}>
      <Icon className="w-4 h-4 mt-0.5 shrink-0" style={{ color: issue ? `var(--sev-${r.status === "error" ? "critical" : "medium"})` : "var(--c-muted)" }} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[13px] font-medium truncate" style={{ color: "var(--c-strong)" }}>{r.name}</p>
          <Badge tone={meta.tone} dot>{meta.label}</Badge>
        </div>
        <p className="text-[12px] mt-0.5 line-clamp-2" style={{ color: "var(--c-text)" }}>{r.detail || categoryLabel(r.category)}</p>
        {issue && r.last_ok_at && (
          <p className="text-[11px] mt-0.5" style={{ color: "var(--c-muted)" }}>Last working {timeAgo(r.last_ok_at)}</p>
        )}
      </div>
    </div>
  );
}
