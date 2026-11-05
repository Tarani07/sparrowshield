import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";

export interface EdrEventPoint {
  event_time: string;
  threat_score: number | null;
  severity_id: number | null;
  process_name: string | null;
  alert_type: string | null;
}

export function useThreatTimeline(deviceUid: string | undefined) {
  return useQuery<EdrEventPoint[]>({
    queryKey: ["threat-timeline", deviceUid],
    enabled: !!deviceUid,
    queryFn: async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("edr_events")
        .select("event_time, threat_score, severity_id, process_name, alert_type")
        .eq("device_uid", deviceUid!)
        .gte("event_time", since)
        .order("event_time", { ascending: true })
        .limit(500);
      if (error) {
        if ((error as any).code === "42P01") return []; // table not yet created
        throw error;
      }
      return (data ?? []) as EdrEventPoint[];
    },
    refetchInterval: 30_000,
  });
}
