import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import type { SecurityEvent } from "../lib/types";

/** Fetch the security event log for a device (USB inserts, failed logins,
 *  remote sessions, crashes, malware detections) — newest first. */
export function useSecurityEvents(deviceId?: string) {
  return useQuery<SecurityEvent[]>({
    queryKey: ["security_events", deviceId ?? "all"],
    queryFn: async () => {
      let q = supabase
        .from("security_events")
        .select("id, device_id, event_type, severity, description, metadata, created_at")
        .order("created_at", { ascending: false })
        .limit(100);
      if (deviceId) q = q.eq("device_id", deviceId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as SecurityEvent[];
    },
    enabled: !!deviceId,
    staleTime: 60_000,
    refetchInterval: 2 * 60_000,
  });
}
