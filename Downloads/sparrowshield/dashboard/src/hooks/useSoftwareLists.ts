import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import type { SoftwareListEntry, SoftwareViolation, SoftwareCatalogEntry, DeploymentTask } from "../lib/types";

/* ── Software Allowlist/Blocklist ── */
export function useSoftwareLists(listType?: "allowlist" | "blocklist") {
  return useQuery<SoftwareListEntry[]>({
    queryKey: ["software-lists", listType],
    queryFn: async () => {
      let q = supabase.from("software_lists").select("*").order("created_at", { ascending: false });
      if (listType) q = q.eq("list_type", listType);
      const { data, error } = await q;
      if (error) throw error;
      return data as SoftwareListEntry[];
    },
  });
}

export function useAddSoftwareList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (entry: Partial<SoftwareListEntry>) => {
      const { error } = await supabase.from("software_lists").insert(entry);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["software-lists"] }),
  });
}

export function useDeleteSoftwareList() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("software_lists").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["software-lists"] }),
  });
}

export function useSoftwareViolations(deviceId?: string) {
  return useQuery<SoftwareViolation[]>({
    queryKey: ["software-violations", deviceId],
    queryFn: async () => {
      let q = supabase
        .from("software_violations")
        .select("*, devices(hostname)")
        .eq("resolved", false)
        .order("detected_at", { ascending: false })
        .limit(100);
      if (deviceId) q = q.eq("device_id", deviceId);
      const { data, error } = await q;
      if (error) throw error;
      return data as unknown as SoftwareViolation[];
    },
    refetchInterval: 30_000,
  });
}

/* ── Software Catalog ── */
export function useSoftwareCatalog() {
  return useQuery<SoftwareCatalogEntry[]>({
    queryKey: ["software-catalog"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("software_catalog")
        .select("*")
        .order("category")
        .order("name");
      if (error) throw error;
      return data as SoftwareCatalogEntry[];
    },
  });
}

export function useAddCatalogEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (entry: Partial<SoftwareCatalogEntry>) => {
      const { error } = await supabase.from("software_catalog").insert(entry);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["software-catalog"] }),
  });
}

export function useDeleteCatalogEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("software_catalog").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["software-catalog"] }),
  });
}

/* ── Deployment Tasks ── */
export function useDeploymentTasks(deviceId?: string) {
  return useQuery<DeploymentTask[]>({
    queryKey: ["deployment-tasks", deviceId],
    queryFn: async () => {
      let q = supabase
        .from("deployment_tasks")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (deviceId) q = q.eq("device_id", deviceId);
      const { data, error } = await q;
      if (error) throw error;
      return data as DeploymentTask[];
    },
    refetchInterval: 10_000,
  });
}

export function useDeploySoftware() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      deviceId,
      softwareName,
      action,
      method,
      softwareId,
    }: {
      deviceId: string;
      softwareName: string;
      action: "install" | "uninstall";
      method: string;
      softwareId?: string;
    }) => {
      // Insert device_command
      const { error: cmdErr } = await supabase.from("device_commands").insert({
        device_id: deviceId,
        command_type: action === "install" ? "install_software" : "uninstall_software",
        payload: { name: softwareName, method },
        status: "pending",
      });
      if (cmdErr) throw cmdErr;
      // Insert deployment task
      const { error: taskErr } = await supabase.from("deployment_tasks").insert({
        device_id: deviceId,
        software_id: softwareId || null,
        software_name: softwareName,
        action,
        method,
        status: "pending",
      });
      if (taskErr) throw taskErr;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["deployment-tasks"] });
      qc.invalidateQueries({ queryKey: ["commands"] });
    },
  });
}
