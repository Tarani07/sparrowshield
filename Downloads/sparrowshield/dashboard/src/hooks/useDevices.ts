import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import type { Device } from "../lib/types";

export function useDevice(deviceId: string) {
  return useQuery<Device>({
    queryKey: ["device", deviceId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("devices")
        .select("*")
        .eq("id", deviceId)
        .single();
      if (error) throw error;
      return data as Device;
    },
    enabled: !!deviceId,
  });
}

export function useAllDevices() {
  return useQuery<Device[]>({
    queryKey: ["all-devices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("devices")
        .select("*")
        .order("last_seen", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Device[];
    },
    refetchInterval: 30_000,
  });
}
