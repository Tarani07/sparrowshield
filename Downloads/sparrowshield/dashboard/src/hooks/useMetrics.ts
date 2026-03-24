import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import type { MetricRow } from "../lib/types";

export function useMetrics(deviceId: string, hours = 24) {
  return useQuery<MetricRow[]>({
    queryKey: ["metrics", deviceId, hours],
    queryFn: async () => {
      const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("metrics")
        .select("timestamp, cpu_pct, ram_pct, disk_pct, battery_health_pct")
        .eq("device_id", deviceId)
        .gte("timestamp", since)
        .order("timestamp", { ascending: true });
      if (error) throw error;
      return (data ?? []) as MetricRow[];
    },
    enabled: !!deviceId,
  });
}
