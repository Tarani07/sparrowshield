import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import type { PatchHistoryEntry } from "../lib/types";

export function usePatchHistory(deviceId?: string) {
  return useQuery<PatchHistoryEntry[]>({
    queryKey: ["patch-history", deviceId],
    queryFn: async () => {
      let q = supabase
        .from("patch_history")
        .select("*, devices(hostname)")
        .order("started_at", { ascending: false })
        .limit(50);
      if (deviceId) q = q.eq("device_id", deviceId);
      const { data, error } = await q;
      if (error) throw error;
      return data as unknown as PatchHistoryEntry[];
    },
    refetchInterval: 15_000,
  });
}

export function useInstallUpdates() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (deviceId: string) => {
      // Create command
      const { data: cmd, error: cmdErr } = await supabase
        .from("device_commands")
        .insert({
          device_id: deviceId,
          command_type: "install_updates",
          payload: {},
          status: "pending",
        })
        .select("id")
        .single();
      if (cmdErr) throw cmdErr;

      // Create patch history entry
      const { error: phErr } = await supabase.from("patch_history").insert({
        device_id: deviceId,
        command_id: cmd.id,
        status: "pending",
        initiated_by: "manual",
      });
      if (phErr) throw phErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["patch-history"] });
      qc.invalidateQueries({ queryKey: ["commands"] });
    },
  });
}

export function useFleetPatchCompliance() {
  return useQuery<{ total: number; compliant: number; pct: number }>({
    queryKey: ["patch-compliance"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("devices")
        .select("id, pending_update_count");
      if (error) throw error;
      const total = data.length;
      const compliant = data.filter(
        (d) => d.pending_update_count == null || d.pending_update_count === 0
      ).length;
      return { total, compliant, pct: total > 0 ? Math.round((compliant / total) * 100) : 100 };
    },
    refetchInterval: 30_000,
  });
}
