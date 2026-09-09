import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import {
  RefreshCw, Package, CheckCircle2, AlertTriangle,
  Monitor, Apple, Loader2, ChevronDown, ChevronUp,
  Zap, ShieldCheck, Clock
} from "lucide-react";

interface OutdatedApp {
  name: string;
  current_version: string;
  latest_version: string;
  source: "brew" | "brew-cask" | "softwareupdate" | "mas" | "winget" | "windows_update";
}

interface Device {
  id: string;
  hostname: string;
  os_type: string;
  last_seen: string | null;
  outdated_apps?: OutdatedApp[];
}

interface Metric {
  outdated_apps?: OutdatedApp[];
}

function sourceLabel(source: string) {
  const map: Record<string, string> = {
    "brew": "Homebrew",
    "brew-cask": "Homebrew Cask",
    "softwareupdate": "macOS Update",
    "mas": "App Store",
    "winget": "winget",
    "windows_update": "Windows Update",
  };
  return map[source] || source;
}

function sourceBadgeColor(source: string) {
  if (source.startsWith("brew")) return "bg-orange-500/15 text-orange-400 border-orange-500/20";
  if (source === "softwareupdate" || source === "mas") return "bg-blue-500/15 text-blue-400 border-blue-500/20";
  if (source === "winget") return "bg-cyan-500/15 text-cyan-400 border-cyan-500/20";
  if (source === "windows_update") return "bg-indigo-500/15 text-indigo-400 border-indigo-500/20";
  return "bg-slate-500/15 text-slate-400 border-slate-500/20";
}

function computeStatus(lastSeen: string | null) {
  if (!lastSeen) return "offline";
  const mins = (Date.now() - new Date(lastSeen).getTime()) / 60000;
  return mins > 15 ? "offline" : "online";
}

export default function PatchManager() {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [patching, setPatching] = useState<Record<string, boolean>>({});

  // Fetch all devices
  const { data: devices = [], isLoading } = useQuery<Device[]>({
    queryKey: ["patch-devices"],
    queryFn: async () => {
      const { data: devs } = await supabase
        .from("devices")
        .select("id, hostname, os_type, last_seen")
        .order("hostname");
      if (!devs?.length) return [];

      // For each device, get latest metric to read outdated_apps
      const result: Device[] = [];
      for (const dev of devs) {
        const { data: metric } = await supabase
          .from("metrics")
          .select("outdated_apps")
          .eq("device_id", dev.id)
          .order("timestamp", { ascending: false })
          .limit(1)
          .single();
        result.push({
          ...dev,
          outdated_apps: (metric as Metric | null)?.outdated_apps || [],
        });
      }
      return result;
    },
    refetchInterval: 60_000,
  });

  // Send a patch command
  const patchMutation = useMutation({
    mutationFn: async ({ deviceId, appName, source, patchAll }: {
      deviceId: string; appName?: string; source?: string; patchAll?: boolean;
    }) => {
      const { error } = await supabase.from("device_commands").insert({
        device_id: deviceId,
        command_type: patchAll ? "patch_all_apps" : "patch_app",
        payload: patchAll ? {} : { app_name: appName, source },
        status: "pending",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["patch-devices"] });
    },
  });

  async function patchApp(deviceId: string, app: OutdatedApp) {
    const key = `${deviceId}-${app.name}`;
    setPatching(p => ({ ...p, [key]: true }));
    await patchMutation.mutateAsync({ deviceId, appName: app.name, source: app.source });
    setTimeout(() => setPatching(p => ({ ...p, [key]: false })), 3000);
  }

  async function patchAll(deviceId: string) {
    const key = `${deviceId}-all`;
    setPatching(p => ({ ...p, [key]: true }));
    await patchMutation.mutateAsync({ deviceId, patchAll: true });
    setTimeout(() => setPatching(p => ({ ...p, [key]: false })), 3000);
  }

  const totalOutdated = devices.reduce((s, d) => s + (d.outdated_apps?.length || 0), 0);
  const devicesWithUpdates = devices.filter(d => (d.outdated_apps?.length || 0) > 0);
  const upToDate = devices.filter(d => (d.outdated_apps?.length || 0) === 0);

  return (
    <div className="flex-1 overflow-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Package className="w-5 h-5 text-indigo-400" />
            Patch Manager
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Detect and update outdated applications across your fleet
          </p>
        </div>
        <button
          onClick={() => queryClient.invalidateQueries({ queryKey: ["patch-devices"] })}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700/50">
          <p className="text-2xl font-bold text-white">{devices.length}</p>
          <p className="text-xs text-slate-400 mt-0.5">Total Devices</p>
        </div>
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
          <p className="text-2xl font-bold text-amber-400">{devicesWithUpdates.length}</p>
          <p className="text-xs text-amber-300/80 mt-0.5">Need Updates</p>
        </div>
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20">
          <p className="text-2xl font-bold text-red-400">{totalOutdated}</p>
          <p className="text-xs text-red-300/80 mt-0.5">Outdated Apps</p>
        </div>
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
          <p className="text-2xl font-bold text-emerald-400">{upToDate.length}</p>
          <p className="text-xs text-emerald-300/80 mt-0.5">Up to Date</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" />
          <span className="ml-2 text-slate-400 text-sm">Scanning fleet...</span>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Devices needing updates first */}
          {[...devicesWithUpdates, ...upToDate].map(device => {
            const isOnline = computeStatus(device.last_seen) === "online";
            const isOpen = expanded[device.id];
            const apps = device.outdated_apps || [];
            const hasUpdates = apps.length > 0;
            const allKey = `${device.id}-all`;

            return (
              <div
                key={device.id}
                className={`rounded-xl border transition-colors ${
                  hasUpdates
                    ? "bg-slate-800/50 border-amber-500/20"
                    : "bg-slate-800/30 border-slate-700/30"
                }`}
              >
                {/* Device Row */}
                <div className="flex items-center gap-3 px-5 py-4">
                  {/* OS icon */}
                  {device.os_type?.toLowerCase() === "mac" ? (
                    <Apple className="w-4 h-4 text-slate-400 flex-shrink-0" />
                  ) : (
                    <Monitor className="w-4 h-4 text-blue-400 flex-shrink-0" />
                  )}

                  {/* Hostname */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{device.hostname}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isOnline ? "bg-emerald-500" : "bg-slate-600"}`} />
                      <span className="text-[11px] text-slate-500">{isOnline ? "Online" : "Offline"}</span>
                      {device.last_seen && (
                        <span className="text-[11px] text-slate-600">
                          · {new Date(device.last_seen).toLocaleString()}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Status */}
                  {hasUpdates ? (
                    <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/15 border border-amber-500/25 text-xs font-semibold text-amber-400">
                      <AlertTriangle className="w-3 h-3" />
                      {apps.length} update{apps.length !== 1 ? "s" : ""}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/25 text-xs font-semibold text-emerald-400">
                      <CheckCircle2 className="w-3 h-3" />
                      Up to date
                    </span>
                  )}

                  {/* Patch All button */}
                  {hasUpdates && (
                    <button
                      onClick={() => patchAll(device.id)}
                      disabled={patching[allKey] || !isOnline}
                      title={!isOnline ? "Device is offline" : "Update all apps"}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold transition-colors"
                    >
                      {patching[allKey] ? (
                        <><Loader2 className="w-3 h-3 animate-spin" /> Queued</>
                      ) : (
                        <><Zap className="w-3 h-3" /> Update All</>
                      )}
                    </button>
                  )}

                  {/* Expand toggle */}
                  {hasUpdates && (
                    <button
                      onClick={() => setExpanded(e => ({ ...e, [device.id]: !e[device.id] }))}
                      className="text-slate-500 hover:text-slate-300 transition-colors"
                    >
                      {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  )}
                </div>

                {/* App list */}
                {isOpen && hasUpdates && (
                  <div className="px-5 pb-4">
                    <div className="rounded-lg overflow-hidden border border-slate-700/50">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-slate-900/60">
                            <th className="text-left py-2 px-3 text-slate-500 font-semibold">Application</th>
                            <th className="text-left py-2 px-3 text-slate-500 font-semibold hidden sm:table-cell">Current</th>
                            <th className="text-left py-2 px-3 text-slate-500 font-semibold hidden sm:table-cell">Latest</th>
                            <th className="text-left py-2 px-3 text-slate-500 font-semibold">Source</th>
                            <th className="py-2 px-3" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60">
                          {apps.map(app => {
                            const key = `${device.id}-${app.name}`;
                            return (
                              <tr key={app.name} className="hover:bg-slate-800/30">
                                <td className="py-2.5 px-3 text-slate-200 font-medium">{app.name}</td>
                                <td className="py-2.5 px-3 text-slate-500 hidden sm:table-cell font-mono">{app.current_version}</td>
                                <td className="py-2.5 px-3 text-emerald-400 hidden sm:table-cell font-mono">{app.latest_version}</td>
                                <td className="py-2.5 px-3">
                                  <span className={`px-2 py-0.5 rounded-full border text-[10px] font-semibold ${sourceBadgeColor(app.source)}`}>
                                    {sourceLabel(app.source)}
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 text-right">
                                  <button
                                    onClick={() => patchApp(device.id, app)}
                                    disabled={patching[key] || !isOnline}
                                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-700 hover:bg-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed text-slate-300 hover:text-white text-[11px] font-semibold transition-colors ml-auto"
                                  >
                                    {patching[key] ? (
                                      <><Loader2 className="w-3 h-3 animate-spin" /> Queued</>
                                    ) : (
                                      <><RefreshCw className="w-3 h-3" /> Update</>
                                    )}
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Info note */}
                    <div className="mt-3 flex items-start gap-2 text-[11px] text-slate-500">
                      <Clock className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                      <span>
                        Commands are queued and executed by the agent within ~10 seconds.
                        {!isOnline && <span className="text-amber-400 ml-1">Device is offline — commands will execute when it reconnects.</span>}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {devices.length === 0 && (
            <div className="text-center py-20">
              <ShieldCheck className="w-10 h-10 text-slate-700 mx-auto mb-3" />
              <p className="text-slate-400 text-sm">No devices enrolled yet.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
