// Live console: one Supabase Realtime channel for the whole app. Any change to a watched
// table refreshes the queries currently on screen, so pages update without reloading.
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "./supabase";
import { useAuth } from "./AuthContext";

const TABLES = [
  "alerts", "devices", "device_commands", "security_events", "software_violations",
  "it_notices", "web_filter_rules", "web_categories", "software_lists", "av_scan_results", "edr_events",
];

type LiveStatus = "connecting" | "live" | "offline";
const LiveContext = createContext<{ status: LiveStatus; lastEventAt: number | null }>({ status: "connecting", lastEventAt: null });

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const { session } = useAuth();
  const [status, setStatus] = useState<LiveStatus>("connecting");
  const [lastEventAt, setLastEventAt] = useState<number | null>(null);
  const pending = useRef<number | null>(null);

  useEffect(() => {
    // Coalesce bursts (e.g. a scan writing many events) into one refresh per second.
    const refresh = () => {
      setLastEventAt(Date.now());
      if (pending.current) return;
      pending.current = window.setTimeout(() => {
        pending.current = null;
        qc.invalidateQueries({ refetchType: "active" });
      }, 1000);
    };

    const channel = supabase.channel("console-live");
    for (const table of TABLES) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, refresh);
    }
    channel.subscribe(s => {
      setStatus(s === "SUBSCRIBED" ? "live" : s === "CHANNEL_ERROR" || s === "TIMED_OUT" || s === "CLOSED" ? "offline" : "connecting");
    });
    return () => {
      if (pending.current) window.clearTimeout(pending.current);
      supabase.removeChannel(channel);
    };
    // Re-subscribe when the signed-in user changes so the channel uses their token.
  }, [qc, session?.access_token]);

  return <LiveContext.Provider value={{ status, lastEventAt }}>{children}</LiveContext.Provider>;
}

export const useLive = () => useContext(LiveContext);
