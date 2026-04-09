import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import type { Alert } from "../lib/types";

/** Fetch alerts — optionally filtered by device and/or resolved status.
 *  Pass resolved=undefined to get ALL alerts in one query (AlertCenter uses this). */
export function useAlerts(deviceId?: string, resolved?: boolean) {
  return useQuery<Alert[]>({
    queryKey: ["alerts", deviceId ?? "all", resolved ?? "all"],
    queryFn: async () => {
      let q = supabase
        .from("alerts")
        .select("id, device_id, alert_type, severity, message, resolved, created_at, resolved_at, devices(hostname)")
        .order("created_at", { ascending: false })
        .limit(200);
      if (deviceId)             q = q.eq("device_id", deviceId);
      if (resolved !== undefined) q = q.eq("resolved", resolved);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as Alert[];
    },
    staleTime: 60_000,
    refetchInterval: 2 * 60_000, // was 30s — alerts change slowly
  });
}

/** Convenience: fetch ALL alerts for a device (open + resolved) in one call */
export function useAllAlerts(deviceId?: string) {
  return useAlerts(deviceId, undefined);
}

export function useResolveAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (alertId: string) => {
      const { error } = await supabase
        .from("alerts")
        .update({ resolved: true, resolved_at: new Date().toISOString() })
        .eq("id", alertId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alerts"] }),
  });
}
