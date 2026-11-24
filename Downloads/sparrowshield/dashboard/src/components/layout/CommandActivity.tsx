// Top-bar tray: every command sent to devices, with live status and progress.
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Activity, CheckCircle2, XCircle, Loader2, Clock } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { timeAgo } from "../../lib/utils";

type Cmd = {
  id: string; device_id: string; command_type: string; status: string; created_at: string;
  progress: number | null; progress_message: string | null; result: string | null; devices: { hostname: string } | null;
};

const LABEL: Record<string, string> = {
  run_edr_scan: "Full security scan", sync_web_filter: "Apply web filter", update_agent: "Update agent", check_sensors: "Check sensors",
  remove_app: "Remove application", restore_app: "Restore application", uninstall_software: "Uninstall application",
  restart_device: "Restart device", kill_process: "Kill process", patch_app: "Update application",
  patch_all_apps: "Update all applications", patch_all: "Update all applications", defender_scan: "Defender scan",
  isolate: "Isolate host", unisolate: "Reconnect host", clear_cache: "Clear cache", restart_ui: "Restart UI",
  optimize_memory: "Free memory", kill_background_services: "Stop background services", run_vulnerability_scan: "Vulnerability scan",
};
export const commandLabel = (t: string) => LABEL[t] ?? t.replace(/_/g, " ");

export function CommandProgress({ c }: { c: Pick<Cmd, "status" | "progress" | "progress_message"> }) {
  const running = c.status === "running";
  const pct = c.status === "done" || c.status === "failed" ? 100 : c.progress ?? (running ? 5 : 0);
  const color = c.status === "failed" ? "var(--sev-critical)" : c.status === "done" ? "var(--ok)" : "var(--c-accent)";
  return (
    <div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--c-card2)" }}>
        <div className={`h-full rounded-full transition-all duration-500 ${c.status === "pending" ? "animate-pulse" : ""}`}
          style={{ width: `${c.status === "pending" ? 100 : pct}%`, background: c.status === "pending" ? "var(--c-border2)" : color }} />
      </div>
      <p className="mt-1 text-[11px] truncate" style={{ color: "var(--c-muted)" }}>
        {c.status === "pending" ? "Waiting for the device to pick it up (devices check every ~5s)"
          : c.status === "running" ? `${c.progress_message ?? "Running"}${c.progress != null ? ` · ${c.progress}%` : ""}`
          : c.status === "done" ? "Completed" : c.status === "failed" ? "Failed" : c.status.replace(/_/g, " ")}
      </p>
    </div>
  );
}

export default function CommandActivity() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { data: cmds = [] } = useQuery<Cmd[]>({
    queryKey: ["command-activity"],
    queryFn: async () => (await supabase.from("device_commands")
      .select("id, device_id, command_type, status, created_at, progress, progress_message, result, devices(hostname)")
      .order("created_at", { ascending: false }).limit(25)).data as unknown as Cmd[] ?? [],
    // Realtime refreshes this instantly; polling is only a fallback.
    refetchInterval: 30_000,
  });

  useEffect(() => {
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const active = cmds.filter(c => c.status === "pending" || c.status === "running").length;

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(o => !o)} aria-label="Device actions activity"
        className="relative w-9 h-9 rounded-md flex items-center justify-center border hover:bg-[var(--c-card2)]"
        style={{ borderColor: "var(--c-border)", color: "var(--c-text)" }}>
        {active ? <Loader2 className="w-4 h-4 animate-spin" style={{ color: "var(--c-accent)" }} /> : <Activity className="w-4 h-4" />}
        {active > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold text-white flex items-center justify-center"
            style={{ background: "var(--c-accent)" }}>{active}</span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-[380px] max-w-[calc(100vw-24px)] rounded-lg border shadow-2xl z-50 overflow-hidden"
          style={{ background: "var(--c-card)", borderColor: "var(--c-border2)" }}>
          <div className="px-4 h-11 flex items-center justify-between border-b" style={{ borderColor: "var(--c-border)" }}>
            <span className="text-[13px] font-semibold" style={{ color: "var(--c-strong)" }}>Device actions</span>
            <span className="text-[11.5px]" style={{ color: "var(--c-muted)" }}>{active ? `${active} in progress` : "All finished"}</span>
          </div>
          <ul className="max-h-[420px] overflow-y-auto">
            {cmds.length === 0 && <li className="px-4 py-6 text-center text-[12.5px]" style={{ color: "var(--c-muted)" }}>No actions sent yet.</li>}
            {cmds.map(c => (
              <li key={c.id} className="px-4 py-3 border-b" style={{ borderColor: "var(--c-divider)" }}>
                <div className="flex items-center gap-2">
                  {c.status === "done" ? <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: "var(--ok)" }} />
                    : c.status === "failed" ? <XCircle className="w-4 h-4 shrink-0" style={{ color: "var(--sev-critical)" }} />
                    : c.status === "running" ? <Loader2 className="w-4 h-4 shrink-0 animate-spin" style={{ color: "var(--c-accent)" }} />
                    : <Clock className="w-4 h-4 shrink-0" style={{ color: "var(--c-muted)" }} />}
                  <span className="text-[13px] font-medium flex-1 truncate" style={{ color: "var(--c-strong)" }}>{commandLabel(c.command_type)}</span>
                  <span className="text-[11px] shrink-0" style={{ color: "var(--c-muted)" }}>{timeAgo(c.created_at)}</span>
                </div>
                <Link to={`/device/${c.device_id}`} onClick={() => setOpen(false)} className="block ml-6 text-[11.5px] hover:underline truncate" style={{ color: "var(--c-accent)" }}>
                  {c.devices?.hostname ?? "Device"}
                </Link>
                <div className="ml-6 mt-1.5"><CommandProgress c={c} /></div>
                {c.status === "failed" && c.result && (
                  <p className="ml-6 mt-1 text-[11px] line-clamp-2" style={{ color: "var(--sev-critical)" }}>{c.result}</p>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
