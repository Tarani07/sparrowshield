import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import type { Alert } from "../lib/types";

export function useAlerts(deviceId?: string, resolved = false) {
  return useQuery<Alert[]>({
    queryKey: ["alerts", deviceId, resolved],
    queryFn: async () => {
      let q = supabase
        .from("alerts")
        .select("*, devices(hostname)")
        .eq("resolved", resolved)
        .order("created_at", { ascending: false })
        .limit(200);
      if (deviceId) q = q.eq("device_id", deviceId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Alert[];
    },
    refetchInterval: 30_000,
  });
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
