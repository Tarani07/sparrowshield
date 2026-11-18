import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { Megaphone, Send, Trash2 } from "lucide-react";
import TopBar from "../components/layout/TopBar";
import { Page, PageHeader, Panel, Badge, Button, inputClass } from "../components/ui";

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

  const live = notices.filter(isLive).length;

  return (
    <div className="flex flex-col min-h-full">
      <TopBar title="IT Notices" />
      <Page className="max-w-5xl">
        <PageHeader
          title="IT Notices"
          icon={Megaphone}
          crumbs={[{ label: "Operations" }, { label: "IT Notices" }]}
          description="Broadcast a message to every Mac. It pops up for the logged-in user within about a minute, once per Mac; sleeping Macs see it when they wake, until it expires."
          actions={<Badge tone={live ? "ok" : "neutral"} dot>{live} live</Badge>}
        />

        <Panel title="New notice" className="mb-4">
          <form onSubmit={e => { e.preventDefault(); if (message.trim()) send.mutate(); }} className="space-y-3">
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="e.g. Please restart your Mac before 6 PM today to install security updates."
              className="w-full px-3 py-2 rounded-md border text-[13px] outline-none resize-y bg-[var(--c-card2)] border-[var(--c-border2)] text-[var(--c-strong)] focus:border-[var(--c-accent)]"
            />
            <div className="flex flex-wrap items-center gap-2">
              <input value={sender} onChange={e => setSender(e.target.value)} placeholder="From" className={`${inputClass} w-44`} aria-label="From" />
              <select value={expiry} onChange={e => setExpiry(Number(e.target.value))} className={inputClass} aria-label="Expiry">
                {EXPIRY_OPTIONS.map(o => <option key={o.hours} value={o.hours}>Expires: {o.label}</option>)}
              </select>
              <span className="text-[11.5px] tabular-nums" style={{ color: "var(--c-muted)" }}>{message.length}/500</span>
              <Button type="submit" variant="primary" icon={Send} className="ml-auto" disabled={!message.trim() || send.isPending}>
                {send.isPending ? "Sending…" : "Send to all Macs"}
              </Button>
            </div>
            {send.isError && <p className="text-[12.5px]" style={{ color: "var(--sev-critical)" }}>Could not send: {(send.error as Error).message}</p>}
          </form>
        </Panel>

        <Panel title="Sent notices" noPad>
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
        </Panel>
      </Page>
    </div>
  );
}
