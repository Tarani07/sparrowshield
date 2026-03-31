import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import type { RemediationRule, RemediationLogEntry } from "../lib/types";

export function useRemediationRules() {
  return useQuery<RemediationRule[]>({
    queryKey: ["remediation-rules"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("remediation_rules")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as RemediationRule[];
    },
  });
}

export function useCreateRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rule: Partial<RemediationRule>) => {
      const { error } = await supabase.from("remediation_rules").insert(rule);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["remediation-rules"] }),
  });
}

export function useUpdateRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<RemediationRule> & { id: string }) => {
      const { error } = await supabase
        .from("remediation_rules")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["remediation-rules"] }),
  });
}

export function useDeleteRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("remediation_rules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["remediation-rules"] }),
  });
}

export function useRemediationLog(deviceId?: string) {
  return useQuery<RemediationLogEntry[]>({
    queryKey: ["remediation-log", deviceId],
    queryFn: async () => {
      let q = supabase
        .from("remediation_log")
        .select("*, remediation_rules(name), devices(hostname)")
        .order("triggered_at", { ascending: false })
        .limit(50);
      if (deviceId) q = q.eq("device_id", deviceId);
      const { data, error } = await q;
      if (error) throw error;
      return data as unknown as RemediationLogEntry[];
    },
    refetchInterval: 15_000,
  });
}
