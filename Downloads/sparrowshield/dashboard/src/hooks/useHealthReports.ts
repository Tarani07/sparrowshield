import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import type { HealthReport } from "../lib/types";

export function useFleetReports() {
  return useQuery<HealthReport[]>({
    queryKey: ["fleet-reports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("device_health_reports")
        .select(`
          id, device_id, health_status, health_score, summary, culprit_apps, metrics_snapshot, generated_at,
          devices!inner(hostname, os_type, assigned_user, status, last_seen, cpu_model, cpu_cores, ram_total_gb)
        `)
        .gte("generated_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .order("generated_at", { ascending: false });

      if (error) throw error;

      // Latest report per device
      const latest = new Map<string, HealthReport>();
      for (const row of (data ?? []) as HealthReport[]) {
        if (!latest.has(row.device_id)) latest.set(row.device_id, row);
      }
      return Array.from(latest.values());
    },
    refetchInterval: 30_000,
  });
}

export function useDeviceReport(deviceId: string) {
  return useQuery<HealthReport[]>({
    queryKey: ["device-report", deviceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("device_health_reports")
        .select("id, device_id, health_status, health_score, summary, culprit_apps, metrics_snapshot, generated_at")
        .eq("device_id", deviceId)
        .gte("generated_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .order("generated_at", { ascending: false })
        .limit(96);
      if (error) throw error;
      return (data ?? []) as HealthReport[];
    },
    enabled: !!deviceId,
  });
}
