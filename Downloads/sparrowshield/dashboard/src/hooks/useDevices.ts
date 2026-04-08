import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import type { Device } from "../lib/types";

/** Full device record — used on DeviceDetail page */
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
    staleTime: 60_000, // single device — refresh every 1 min
  });
}

/** Slim device list — only columns needed for Fleet/List pages
 *  NOTE: cpu_pct, ram_pct, disk_pct live in the metrics table, NOT devices */
const FLEET_COLS = [
  "id", "hostname", "serial_number", "os_type", "os_version",
  "assigned_user", "department", "cpu_model", "cpu_cores", "ram_total_gb",
  "status", "last_seen", "enrolled_at",
  "battery_pct", "battery_health",
  "filevault_enabled", "firewall_enabled", "sip_enabled",
  "gatekeeper_enabled", "mdm_enrolled", "antivirus_installed",
  "pending_update_count",
].join(", ");

export function useAllDevices() {
  return useQuery<Device[]>({
    queryKey: ["all-devices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("devices")
        .select(FLEET_COLS)
        .order("last_seen", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Device[];
    },
    staleTime: 60_000,        // fresh for 1 min
    refetchInterval: 2 * 60_000, // poll every 2 min (was 30s)
  });
}
