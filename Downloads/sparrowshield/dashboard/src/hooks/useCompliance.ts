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
      let q = supabase
        .from("compliance_snapshots")
        .select("*, devices(hostname)")
        .order("snapshot_at", { ascending: false })
        .limit(200);
      if (framework) q = q.eq("framework", framework);
      if (deviceId) q = q.eq("device_id", deviceId);
      const { data, error } = await q;
      if (error) throw error;
      return data as unknown as ComplianceSnapshot[];
    },
    refetchInterval: 30_000,
  });
}

/** Evaluate compliance for all devices (calls edge function) */
export function useEvaluateCompliance() {
  return async () => {
    const { error } = await supabase.functions.invoke("compliance-evaluate");
    if (error) throw error;
  };
}
