import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";

export interface ProcessRow {
  id: string;
  process_name: string;
  cpu_pct: number | null;
  ram_mb: number | null;
  timestamp: string;
}

export interface DeviceCommand {
  id: string;
  device_id: string;
  command_type: string;
  payload: { process_name: string };
  status: "pending" | "running" | "done" | "failed";
  result: string | null;
  created_at: string;
  executed_at: string | null;
}

export function useTopProcesses(deviceId: string, limit = 10) {
  return useQuery<ProcessRow[]>({
    queryKey: ["top-processes", deviceId],
    queryFn: async () => {
      const { data: latest } = await supabase
        .from("processes")
        .select("timestamp")
        .eq("device_id", deviceId)
        .order("timestamp", { ascending: false })
        .limit(1)
        .single();

      if (!latest) return [];

      const { data, error } = await supabase
        .from("processes")
        .select("id, process_name, cpu_pct, ram_mb, timestamp")
        .eq("device_id", deviceId)
        .eq("timestamp", latest.timestamp)
        .order("ram_mb", { ascending: false })
        .limit(limit);

      if (error) throw error;
      return (data ?? []) as ProcessRow[];
    },
    enabled: !!deviceId,
    refetchInterval: 15_000,
  });
}

export function useExecuteCommand(deviceId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ type, payload }: { type: string; payload: Record<string, unknown> }) => {
      const { data, error } = await supabase
        .from("device_commands")
        .insert({ device_id: deviceId, command_type: type, payload, status: "pending" })
        .select()
        .single();
      if (error) throw error;
      return data as DeviceCommand;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["commands", deviceId] });
    },
  });
}

export function useKillProcess(deviceId: string) {
  const exec = useExecuteCommand(deviceId);
  return {
    ...exec,
    mutate: (processName: string) => exec.mutate({ type: "kill_process", payload: { process_name: processName } }),
    mutateAsync: (processName: string) => exec.mutateAsync({ type: "kill_process", payload: { process_name: processName } }),
  };
}

export function useCommands(deviceId: string) {
  return useQuery<DeviceCommand[]>({
    queryKey: ["commands", deviceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("device_commands")
        .select("*")
        .eq("device_id", deviceId)
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as DeviceCommand[];
    },
    enabled: !!deviceId,
    refetchInterval: 5_000,
  });
}
