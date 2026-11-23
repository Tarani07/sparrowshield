import { useState, type ElementType } from "react";
import { ScanLine, Wifi, WifiOff, CheckCircle2, Loader2, RotateCcw, RefreshCw, Globe, Bug, AlertTriangle, XCircle, Terminal } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { Panel, Badge, Button } from "../ui";
import { CommandProgress } from "../layout/CommandActivity";

interface Props {
  deviceId: string;
  deviceOs: string;
  isIsolated?: boolean;
}

type Action = { key: string; label: string; desc: string; icon: ElementType; command: string; confirm?: string; danger?: boolean };
type RunState = { status: "queued" | "running" | "done" | "failed"; result?: string; progress?: number | null; message?: string | null };

// Only commands the agent for that OS actually implements (agent_mac.py / agent_windows.py).
const MAC_ACTIONS: Action[] = [
  { key: "scan", label: "Run full security scan", desc: "Malware signatures, threat intel, behaviour and policy checks", icon: ScanLine, command: "run_edr_scan" },
  { key: "web", label: "Apply web filter now", desc: "Re-download blocklists and update this Mac immediately", icon: Globe, command: "sync_web_filter" },
  { key: "update", label: "Update agent now", desc: "Install the latest agent from the console (normally hourly)", icon: RefreshCw, command: "update_agent" },
  { key: "restart", label: "Restart device", desc: "Reboot the Mac in 5 seconds — unsaved work is lost", icon: RotateCcw, command: "restart_device", confirm: "The user will lose unsaved work.", danger: true },
];
const WIN_ACTIONS: Action[] = [
  { key: "scan", label: "Run Defender full scan", desc: "Microsoft Defender full scan on this PC", icon: ScanLine, command: "defender_scan" },
  { key: "vuln", label: "Run vulnerability scan", desc: "Check installed software for known CVEs", icon: Bug, command: "run_vulnerability_scan" },
  { key: "isolate", label: "Isolate host", desc: "Block all network traffic except the SparrowShield console", icon: WifiOff, command: "isolate", confirm: "The PC loses network access until you reconnect it.", danger: true },
  { key: "unisolate", label: "Reconnect host", desc: "Restore full network access after isolation", icon: Wifi, command: "unisolate" },
];

export default function RemoteActionsCard({ deviceId, deviceOs, isIsolated }: Props) {
  const [runs, setRuns] = useState<Record<string, RunState>>({});
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const isWin = deviceOs === "windows";

  const actions = (isWin ? WIN_ACTIONS : MAC_ACTIONS).filter(a =>
    !(a.key === "isolate" && isIsolated) && !(a.key === "unisolate" && !isIsolated));

  async function run(a: Action) {
    setConfirmKey(null);
    setRuns(r => ({ ...r, [a.key]: { status: "queued" } }));
    const { data, error } = await supabase.from("device_commands")
      .insert({ device_id: deviceId, command_type: a.command, payload: {} }).select("id").single();
    if (error || !data) {
      setRuns(r => ({ ...r, [a.key]: { status: "failed", result: error?.message ?? "Could not queue command" } }));
      return;
    }
    // Follow the command until the agent reports back (agents poll every ~5–10s).
    const started = Date.now();
    const poll = async () => {
      const { data: row } = await supabase.from("device_commands").select("status, result, progress, progress_message").eq("id", data.id).single();
      const status = row?.status as RunState["status"] | undefined;
      if (status === "done" || status === "failed") {
        setRuns(r => ({ ...r, [a.key]: { status, result: row?.result ?? "" } }));
        return;
      }
      if (Date.now() - started > 5 * 60_000) {
        setRuns(r => ({ ...r, [a.key]: { status: "queued", result: "Still waiting — the device may be asleep or offline. It will run when it reconnects." } }));
        return;
      }
      setRuns(r => ({ ...r, [a.key]: { status: status === "running" ? "running" : "queued", progress: row?.progress, message: row?.progress_message } }));
      setTimeout(poll, 1500);
    };
    setTimeout(poll, 2000);
  }

  return (
    <Panel title="Response actions" actions={isIsolated ? <Badge tone="critical" dot>Isolated</Badge> : undefined}>
      <div className="space-y-2">
        {actions.map(a => {
          const st = runs[a.key];
          const busy = st && (st.status === "queued" || st.status === "running") && !st.result;
          return (
            <div key={a.key} className="rounded-md border" style={{ borderColor: "var(--c-border)", background: "var(--c-card2)" }}>
              <div className="flex items-center gap-3 px-3 py-2.5">
                <a.icon className="w-4 h-4 shrink-0" style={{ color: a.danger ? "var(--sev-high)" : "var(--c-accent)" }} />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium" style={{ color: "var(--c-strong)" }}>{a.label}</p>
                  <p className="text-[11.5px]" style={{ color: "var(--c-muted)" }}>{a.desc}</p>
                </div>
                {busy ? (
                  <span className="flex items-center gap-1.5 text-[12px]" style={{ color: "var(--c-muted)" }}>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> {st.status === "running" ? "Running…" : "Queued…"}
                  </span>
                ) : (
                  <Button adminOnly size="sm" variant={a.danger ? "danger" : "secondary"}
                    onClick={() => (a.confirm ? setConfirmKey(a.key) : run(a))}>
                    Run
                  </Button>
                )}
              </div>

              {busy && (
                <div className="px-3 pb-2.5">
                  <CommandProgress c={{ status: st.status === "queued" ? "pending" : "running", progress: st.progress ?? null, progress_message: st.message ?? null }} />
                </div>
              )}

              {confirmKey === a.key && (
                <div className="flex items-center gap-2 px-3 py-2 border-t" style={{ borderColor: "var(--c-border)" }}>
                  <AlertTriangle className="w-4 h-4 shrink-0" style={{ color: "var(--sev-high)" }} />
                  <p className="flex-1 text-[12px]" style={{ color: "var(--c-text)" }}>{a.confirm}</p>
                  <Button size="sm" onClick={() => setConfirmKey(null)}>Cancel</Button>
                  <Button size="sm" variant="danger" onClick={() => run(a)}>Confirm</Button>
                </div>
              )}

              {st && (st.status === "done" || st.status === "failed" || st.result) && (
                <div className="flex items-start gap-2 px-3 py-2 border-t text-[12px]" style={{ borderColor: "var(--c-border)" }}>
                  {st.status === "done" ? <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: "var(--ok)" }} />
                    : st.status === "failed" ? <XCircle className="w-4 h-4 shrink-0" style={{ color: "var(--sev-critical)" }} />
                    : <Terminal className="w-4 h-4 shrink-0" style={{ color: "var(--c-muted)" }} />}
                  <pre className="flex-1 min-w-0 whitespace-pre-wrap break-words font-mono text-[11px] max-h-40 overflow-y-auto" style={{ color: "var(--c-text)" }}>
                    {st.status === "done" ? (st.result || "Completed") : st.result}
                  </pre>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
