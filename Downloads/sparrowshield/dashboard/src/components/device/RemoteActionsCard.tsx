import { useState } from "react";
import { ShieldX, Wifi, WifiOff, Search, AlertTriangle, CheckCircle2, Loader2, Terminal, X } from "lucide-react";
import { supabase } from "../../lib/supabase";

interface Props {
  deviceId: string;
  deviceOs: string;
  isIsolated?: boolean;
}

type ActionStatus = "idle" | "running" | "success" | "error";

interface ActionState {
  status: ActionStatus;
  message: string;
}

const ACTIONS = [
  {
    key: "scan",
    label: "Full AV Scan",
    desc: "Trigger a full antivirus scan on this device",
    icon: Search,
    color: "#3b82f6",
    bg: "rgba(59,130,246,0.1)",
    command: "av_scan",
  },
  {
    key: "isolate",
    label: "Isolate Host",
    desc: "Block all network traffic except Supabase telemetry",
    icon: WifiOff,
    color: "#ef4444",
    bg: "rgba(239,68,68,0.1)",
    command: "isolate",
    confirm: true,
  },
  {
    key: "unisolate",
    label: "Re-connect Host",
    desc: "Restore full network access after isolation",
    icon: Wifi,
    color: "#22c55e",
    bg: "rgba(34,197,94,0.1)",
    command: "unisolate",
  },
  {
    key: "kill_suspicious",
    label: "Kill Suspicious Processes",
    desc: "Terminate all processes with threat score > 0.7",
    icon: ShieldX,
    color: "#f59e0b",
    bg: "rgba(245,158,11,0.1)",
    command: "kill_suspicious",
    confirm: true,
  },
];

export default function RemoteActionsCard({ deviceId, deviceOs, isIsolated }: Props) {
  const [states, setStates] = useState<Record<string, ActionState>>({});
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const [customCmd, setCustomCmd] = useState("");
  const [cmdState, setCmdState] = useState<ActionState>({ status: "idle", message: "" });

  function setState(key: string, s: ActionState) {
    setStates(prev => ({ ...prev, [key]: s }));
  }

  async function runAction(command: string, key: string, payload?: object) {
    setState(key, { status: "running", message: "" });
    try {
      const { error } = await supabase.from("commands").insert({
        device_id: deviceId,
        command_type: command,
        status: "pending",
        payload: payload ?? {},
        created_at: new Date().toISOString(),
      });
      if (error) throw error;
      setState(key, { status: "success", message: "Command queued — agent will execute on next check-in." });
    } catch (err: any) {
      setState(key, { status: "error", message: err.message ?? "Failed to queue command." });
    }
    setTimeout(() => setState(key, { status: "idle", message: "" }), 5000);
  }

  async function runCustomCmd(e: React.FormEvent) {
    e.preventDefault();
    if (!customCmd.trim()) return;
    setCmdState({ status: "running", message: "" });
    try {
      const { error } = await supabase.from("commands").insert({
        device_id: deviceId,
        command_type: "shell",
        status: "pending",
        payload: { cmd: customCmd.trim() },
        created_at: new Date().toISOString(),
      });
      if (error) throw error;
      setCmdState({ status: "success", message: "Shell command queued." });
      setCustomCmd("");
    } catch (err: any) {
      setCmdState({ status: "error", message: err.message ?? "Failed." });
    }
    setTimeout(() => setCmdState({ status: "idle", message: "" }), 5000);
  }

  const visibleActions = ACTIONS.filter(a => {
    if (a.key === "isolate" && isIsolated) return false;
    if (a.key === "unisolate" && !isIsolated) return false;
    return true;
  });

  return (
    <div className="rounded-2xl p-5" style={{ background: "var(--c-card)", border: "1px solid var(--c-border)" }}>
      <div className="flex items-center gap-2 mb-4">
        <Terminal className="w-4 h-4" style={{ color: "var(--c-primary)" }} />
        <h3 className="text-sm font-bold" style={{ color: "var(--c-strong)" }}>Remote Actions</h3>
        {isIsolated && (
          <span className="ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/15 text-red-500">
            ISOLATED
          </span>
        )}
      </div>

      <div className="space-y-2 mb-4">
        {visibleActions.map(action => {
          const state = states[action.key] ?? { status: "idle", message: "" };
          const isRunning = state.status === "running";

          return (
            <div key={action.key}>
              {confirmKey === action.key ? (
                <div className="rounded-xl p-3 flex items-center gap-3"
                  style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)" }}>
                  <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
                  <p className="text-xs flex-1" style={{ color: "var(--c-text)" }}>
                    Are you sure? This will <strong>{action.label.toLowerCase()}</strong>.
                  </p>
                  <button
                    onClick={() => { setConfirmKey(null); runAction(action.command, action.key); }}
                    className="text-[11px] font-bold px-3 py-1 rounded-lg bg-red-500 text-white"
                  >Confirm</button>
                  <button
                    onClick={() => setConfirmKey(null)}
                    className="w-6 h-6 flex items-center justify-center rounded-lg"
                    style={{ color: "var(--c-muted)" }}
                  ><X className="w-3.5 h-3.5" /></button>
                </div>
              ) : (
                <button
                  disabled={isRunning}
                  onClick={() => action.confirm ? setConfirmKey(action.key) : runAction(action.command, action.key)}
                  className="w-full flex items-center gap-3 rounded-xl p-3 text-left transition-all disabled:opacity-60"
                  style={{ background: state.status === "success" ? "rgba(34,197,94,0.08)" : action.bg,
                           border: `1px solid ${state.status === "success" ? "rgba(34,197,94,0.3)" : "transparent"}` }}
                  onMouseEnter={e => { if (!isRunning) e.currentTarget.style.opacity = "0.85"; }}
                  onMouseLeave={e => { e.currentTarget.style.opacity = "1"; }}
                >
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: action.bg }}>
                    {isRunning
                      ? <Loader2 className="w-4 h-4 animate-spin" style={{ color: action.color }} />
                      : state.status === "success"
                        ? <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        : <action.icon className="w-4 h-4" style={{ color: action.color }} />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold" style={{ color: "var(--c-strong)" }}>{action.label}</p>
                    <p className="text-[10px] mt-0.5" style={{ color: "var(--c-muted)" }}>
                      {state.status === "success" ? state.message
                       : state.status === "error" ? <span className="text-red-400">{state.message}</span>
                       : action.desc}
                    </p>
                  </div>
                  {!isRunning && state.status === "idle" && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md"
                      style={{ background: "var(--c-border)", color: "var(--c-muted)" }}>
                      Run
                    </span>
                  )}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Custom shell command */}
      <div style={{ borderTop: "1px solid var(--c-border)", paddingTop: 14 }}>
        <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: "var(--c-faint)" }}>
          Custom Shell Command
        </p>
        <form onSubmit={runCustomCmd} className="flex gap-2">
          <input
            value={customCmd}
            onChange={e => setCustomCmd(e.target.value)}
            placeholder={deviceOs === "windows" ? "e.g. ipconfig /all" : "e.g. ps aux | head -20"}
            className="flex-1 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none transition-all"
            style={{
              background: "var(--c-bg)",
              border: "1px solid var(--c-border2)",
              color: "var(--c-text)",
            }}
            onFocus={e => (e.currentTarget.style.borderColor = "var(--c-primary)")}
            onBlur={e => (e.currentTarget.style.borderColor = "var(--c-border2)")}
          />
          <button
            type="submit"
            disabled={!customCmd.trim() || cmdState.status === "running"}
            className="px-3 py-2 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
            style={{ background: "var(--c-primary)", color: "#fff" }}
          >
            {cmdState.status === "running"
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : "Send"}
          </button>
        </form>
        {cmdState.status === "success" && (
          <p className="text-[10px] text-emerald-500 mt-1.5">{cmdState.message}</p>
        )}
        {cmdState.status === "error" && (
          <p className="text-[10px] text-red-400 mt-1.5">{cmdState.message}</p>
        )}
      </div>
    </div>
  );
}
