import { useState } from "react";
import { RefreshCw, Check } from "lucide-react";
import { supabase } from "../lib/supabase";

export default function ScanNowButton() {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [count, setCount] = useState(0);

  async function send() {
    setState("sending");
    const { data: devices, error } = await supabase
      .from("devices").select("id").in("os_type", ["mac", "macos", "darwin"]);
    if (error || !devices?.length) { setState("error"); return; }
    // Don't queue another full scan for a Mac that already has one waiting or running.
    const { data: queued } = await supabase
      .from("device_commands").select("device_id")
      .eq("command_type", "run_edr_scan").in("status", ["pending", "running"]);
    const busy = new Set((queued ?? []).map((q: { device_id: string }) => q.device_id));
    const targets = devices.filter((d: { id: string }) => !busy.has(d.id));
    if (targets.length) {
      const { error: insErr } = await supabase.from("device_commands").insert(
        targets.map((d: { id: string }) => ({ device_id: d.id, command_type: "run_edr_scan", payload: {} })),
      );
      if (insErr) { setState("error"); return; }
    }
    setCount(devices.length);
    setState("sent");
    setTimeout(() => setState("idle"), 6000);
  }

  return (
    <button
      onClick={send}
      disabled={state === "sending"}
      title="Tell every Mac agent to re-download rules and scan now"
      className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border text-[13px] font-medium whitespace-nowrap hover:brightness-110 disabled:opacity-60"
      style={{ background: "var(--c-accent)", borderColor: "var(--c-accent)", color: "#fff" }}
    >
      {state === "sent"
        ? <><Check className="w-4 h-4" /> Sent to {count} device{count === 1 ? "" : "s"}</>
        : state === "error"
          ? <>Could not send — retry</>
          : <><RefreshCw className={`w-4 h-4 ${state === "sending" ? "animate-spin" : ""}`} /> Scan &amp; apply now</>}
    </button>
  );
}
