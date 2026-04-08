import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import type { ComplianceFramework, ComplianceControl, ComplianceSnapshot } from "../lib/types";

export function useFrameworks() {
  return useQuery<ComplianceFramework[]>({
    queryKey: ["compliance-frameworks"],
    queryFn: async () => {
      const { data, error } = await supabase.from("compliance_frameworks").select("*");
      if (error) throw error;
      return data as ComplianceFramework[];
    },
  });
}

export function useControls(frameworkId?: string) {
  return useQuery<ComplianceControl[]>({
    queryKey: ["compliance-controls", frameworkId],
    queryFn: async () => {
      let q = supabase.from("compliance_controls").select("*").order("control_id");
      if (frameworkId) q = q.eq("framework_id", frameworkId);
      const { data, error } = await q;
      if (error) throw error;
      return data as unknown as ComplianceControl[];
    },
    enabled: !!frameworkId,
  });
}

export function useComplianceSnapshots(framework?: string, deviceId?: string) {
  return useQuery<ComplianceSnapshot[]>({
    queryKey: ["compliance-snapshots", framework, deviceId],
    queryFn: async () => {
      // Select only needed columns — avoids fetching large detail blobs unnecessarily
      let q = supabase
        .from("compliance_snapshots")
        .select("id, device_id, framework, score, pass_count, fail_count, details, snapshot_at, devices(hostname)")
        .order("device_id",   { ascending: true })
        .order("snapshot_at", { ascending: false })
        .limit(500);
      if (framework) q = q.eq("framework", framework);
      if (deviceId)  q = q.eq("device_id",  deviceId);
      const { data, error } = await q;
      if (error) throw error;
      return data as unknown as ComplianceSnapshot[];
    },
    staleTime: 5 * 60_000,
    refetchInterval: 10 * 60_000, // compliance changes slowly — poll every 10 min
  });
}

/** Evaluate compliance for all devices (calls edge function) */
export function useEvaluateCompliance() {
  return async () => {
    const { error } = await supabase.functions.invoke("compliance-evaluate");
    if (error) throw error;
  };
}
