import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { Megaphone, Send, Trash2 } from "lucide-react";
import TopBar from "../components/layout/TopBar";

interface Notice {
  id: string;
  message: string;
  sender: string | null;
  active: boolean;
  created_at: string;
  expires_at: string | null;
}

const EXPIRY_OPTIONS = [
  { label: "1 hour",   hours: 1 },
  { label: "1 day",    hours: 24 },
  { label: "1 week",   hours: 24 * 7 },
  { label: "No expiry", hours: 0 },
];

export default function ITNotices() {
  const qc = useQueryClient();
  const [message, setMessage] = useState("");
  const [sender, setSender]   = useState("IT Team");
  const [expiry, setExpiry]   = useState(24);

  const { data: notices = [], isLoading } = useQuery<Notice[]>({
    queryKey: ["it-notices"],
    queryFn: async () => {
      const { data } = await supabase
        .from("it_notices")
        .select("id, message, sender, active, created_at, expires_at")
        .order("created_at", { ascending: false })
        .limit(100);
      return data ?? [];
    },
    refetchInterval: 30_000,
  });

  const send = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("it_notices").insert({
        message: message.trim(),
        sender:  sender.trim() || "IT Team",
        active:  true,
        expires_at: expiry ? new Date(Date.now() + expiry * 3600_000).toISOString() : null,
      });
      if (error) throw error;
    },
    onSuccess: () => { setMessage(""); qc.invalidateQueries({ queryKey: ["it-notices"] }); },
  });

  const setActive = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from("it_notices").update({ active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["it-notices"] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("it_notices").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["it-notices"] }),
  });

  const isLive = (n: Notice) => n.active && (!n.expires_at || new Date(n.expires_at) > new Date());

  return (
    <div style={{ background: "var(--c-bg)", minHeight: "100vh" }}>
      <TopBar title="IT Notices" />
      <div className="p-6 space-y-6 max-w-4xl">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2" style={{ color: "var(--c-strong)" }}>
            <Megaphone className="w-5 h-5" style={{ color: "#f59e0b" }} /> IT Notices
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--c-muted)" }}>
            Send a message to every Mac. It pops up for the logged-in user within about a minute and is
            shown once per Mac. Macs that are asleep see it when they wake, until it expires.
          </p>
        </div>

        <form
          onSubmit={e => { e.preventDefault(); if (message.trim()) send.mutate(); }}
          className="rounded-xl border p-4 space-y-3"
          style={{ borderColor: "var(--c-border)", background: "var(--c-surface)" }}
        >
          <textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="e.g. Please restart your Mac before 6 PM today to install security updates."
            className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-y"
            style={{ background: "var(--c-bg)", border: "1px solid var(--c-border2)", color: "var(--c-strong)" }}
          />
          <div className="flex flex-wrap items-center gap-3">
            <input
              value={sender}
              onChange={e => setSender(e.target.value)}
              placeholder="From"
              className="px-3 py-2 rounded-lg text-sm outline-none w-40"
              style={{ background: "var(--c-bg)", border: "1px solid var(--c-border2)", color: "var(--c-strong)" }}
            />
            <select
              value={expiry}
              onChange={e => setExpiry(Number(e.target.value))}
              className="px-3 py-2 rounded-lg text-sm outline-none"
              style={{ background: "var(--c-bg)", border: "1px solid var(--c-border2)", color: "var(--c-strong)" }}
            >
              {EXPIRY_OPTIONS.map(o => <option key={o.hours} value={o.hours}>Expires: {o.label}</option>)}
            </select>
            <button
              type="submit"
              disabled={!message.trim() || send.isPending}
              className="ml-auto flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: "#f59e0b" }}
            >
              <Send className="w-4 h-4" /> {send.isPending ? "Sending…" : "Send to all Macs"}
            </button>
          </div>
          {send.isError && (
            <p className="text-xs" style={{ color: "#ef4444" }}>Could not send: {(send.error as Error).message}</p>
          )}
        </form>

        <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--c-border)" }}>
          {isLoading ? (
            <div className="p-8 text-center text-sm" style={{ color: "var(--c-muted)" }}>Loading…</div>
          ) : notices.length === 0 ? (
            <div className="p-8 text-center text-sm" style={{ color: "var(--c-muted)" }}>No notices sent yet.</div>
          ) : (
            <ul>
              {notices.map(n => (
                <li key={n.id} className="px-4 py-3 flex items-start gap-3"
                  style={{ borderTop: "1px solid var(--c-border)", opacity: isLive(n) ? 1 : 0.55 }}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm whitespace-pre-wrap break-words" style={{ color: "var(--c-strong)" }}>{n.message}</p>
                    <p className="text-xs mt-1" style={{ color: "var(--c-muted)" }}>
                      {n.sender ?? "IT Team"} · {new Date(n.created_at).toLocaleString()}
                      {n.expires_at && ` · expires ${new Date(n.expires_at).toLocaleString()}`}
                    </p>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded-full shrink-0"
                    style={{ background: isLive(n) ? "#dcfce7" : "var(--c-bg)", color: isLive(n) ? "#16a34a" : "var(--c-muted)" }}>
                    {isLive(n) ? "Live" : n.active ? "Expired" : "Stopped"}
                  </span>
                  {n.active && isLive(n) && (
                    <button onClick={() => setActive.mutate({ id: n.id, active: false })}
                      className="text-xs px-2 py-1 rounded shrink-0" style={{ color: "var(--c-muted)", background: "var(--c-surface)" }}>
                      Stop
                    </button>
                  )}
                  <button onClick={() => remove.mutate(n.id)} className="p-1 rounded shrink-0" style={{ color: "#ef4444" }}
                    title="Delete notice">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
