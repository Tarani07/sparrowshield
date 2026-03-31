import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle, ExternalLink, ShieldAlert, ThumbsUp, X, Zap, Clock } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import TopBar from "../components/layout/TopBar";
import { useAlerts, useResolveAlert } from "../hooks/useAlerts";
import { cn, healthBadge, timeAgo } from "../lib/utils";
import { supabase } from "../lib/supabase";

const SEVERITY_FILTERS = [
  { key: "all", label: "All" },
  { key: "critical", label: "🔴 Critical" },
  { key: "warning", label: "⚠️ Warning" },
];

const ALERT_TYPE_LABELS: Record<string, string> = {
  high_disk: "High Disk Usage",
  high_ram: "High RAM Usage",
  device_offline: "Device Offline",
  low_battery: "Low Battery",
  encryption_disabled: "Encryption Off",
  firewall_disabled: "Firewall Off",
};

const ACTION_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  kill_process: { label: "Kill Process", color: "text-red-400 bg-red-500/10 border-red-500/30", icon: "🔪" },
  optimize_memory: { label: "Optimize Memory", color: "text-blue-400 bg-blue-500/10 border-blue-500/30", icon: "🧹" },
  clear_cache: { label: "Clear Cache", color: "text-amber-400 bg-amber-500/10 border-amber-500/30", icon: "🗑️" },
  restart_ui: { label: "Restart UI", color: "text-purple-400 bg-purple-500/10 border-purple-500/30", icon: "🔄" },
  kill_background_services: { label: "Kill Background Services", color: "text-orange-400 bg-orange-500/10 border-orange-500/30", icon: "⚡" },
  install_software: { label: "Install Software", color: "text-green-400 bg-green-500/10 border-green-500/30", icon: "📦" },
  uninstall_software: { label: "Uninstall Software", color: "text-pink-400 bg-pink-500/10 border-pink-500/30", icon: "🗑️" },
  install_updates: { label: "Install Updates", color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/30", icon: "⬆️" },
};

interface PendingCommand {
  id: string;
  device_id: string;
  command_type: string;
  payload: Record<string, unknown>;
  status: string;
  created_at: string;
  devices?: { hostname: string };
}

export default function AlertCenter() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showResolved, setShowResolved] = useState(false);
  const [severityFilter, setSeverityFilter] = useState("all");

  const { data: openAlerts = [], isLoading: loadingOpen } = useAlerts(undefined, false);
  const { data: resolvedAlerts = [], isLoading: loadingResolved } = useAlerts(undefined, true);
  const { mutate: resolve, isPending } = useResolveAlert();

  // ── Pending Approval Commands ──
  const { data: pendingCommands = [], isLoading: loadingPending } = useQuery<PendingCommand[]>({
    queryKey: ["pending-approvals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("device_commands")
        .select("id, device_id, command_type, payload, status, created_at, devices(hostname)")
        .eq("status", "awaiting_approval")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as PendingCommand[];
    },
    refetchInterval: 10_000,
  });

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: async (commandId: string) => {
      const { data, error } = await supabase.functions.invoke("approve-command", {
        body: { command_id: commandId, action: "approve" },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pending-approvals"] });
      queryClient.invalidateQueries({ queryKey: ["remediation-log"] });
    },
  });

  // Dismiss mutation
  const dismissMutation = useMutation({
    mutationFn: async (commandId: string) => {
      const { data, error } = await supabase.functions.invoke("approve-command", {
        body: { command_id: commandId, action: "dismiss" },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pending-approvals"] });
      queryClient.invalidateQueries({ queryKey: ["remediation-log"] });
    },
  });

  const alerts = showResolved ? resolvedAlerts : openAlerts;

  const filtered = severityFilter === "all"
    ? alerts
    : alerts.filter((a) => a.severity === severityFilter);

  const isLoading = showResolved ? loadingResolved : loadingOpen;

  return (
    <div className="flex flex-col h-full">
      <TopBar title="Alert Center" />

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {/* ── Pending Approvals Banner ── */}
        {pendingCommands.length > 0 && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-3 border-b border-amber-500/20 bg-amber-500/10">
              <ShieldAlert className="w-5 h-5 text-amber-400" />
              <div className="flex-1">
                <p className="text-sm font-bold text-amber-300">
                  {pendingCommands.length} Action{pendingCommands.length > 1 ? "s" : ""} Awaiting Your Approval
                </p>
                <p className="text-[11px] text-amber-400/70 mt-0.5">
                  The system detected issues and recommends these actions. Review and approve or dismiss.
                </p>
              </div>
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-amber-500/20 border border-amber-500/30">
                <Clock className="w-3 h-3 text-amber-400" />
                <span className="text-[10px] font-bold text-amber-400">MANUAL APPROVAL REQUIRED</span>
              </div>
            </div>

            <div className="divide-y divide-amber-500/10">
              <AnimatePresence>
                {pendingCommands.map((cmd, i) => {
                  const actionInfo = ACTION_LABELS[cmd.command_type] ?? {
                    label: cmd.command_type.replace(/_/g, " "),
                    color: "text-slate-400 bg-slate-500/10 border-slate-500/30",
                    icon: "⚡",
                  };

                  return (
                    <motion.div
                      key={cmd.id}
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: 50 }}
                      transition={{ delay: i * 0.05 }}
                      className="flex items-center gap-4 px-5 py-3.5 hover:bg-amber-500/5 transition-colors group"
                    >
                      {/* Action type badge */}
                      <span className={cn(
                        "text-[10px] font-bold px-2.5 py-1 rounded-lg border flex items-center gap-1.5",
                        actionInfo.color
                      )}>
                        <span>{actionInfo.icon}</span>
                        {actionInfo.label}
                      </span>

                      {/* Device & details */}
                      <div className="flex-1 min-w-0">
                        <button
                          onClick={() => navigate(`/device/${cmd.device_id}`)}
                          className="text-xs font-semibold text-slate-200 hover:text-indigo-400 transition-colors flex items-center gap-1"
                        >
                          {cmd.devices?.hostname ?? "Unknown device"}
                          <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </button>
                        {cmd.payload && Object.keys(cmd.payload).length > 0 && (
                          <p className="text-[10px] text-slate-500 mt-0.5 font-mono">
                            {Object.entries(cmd.payload).map(([k, v]) => `${k}: ${v}`).join(", ")}
                          </p>
                        )}
                      </div>

                      {/* Time */}
                      <span className="text-[10px] text-slate-600 font-mono flex-shrink-0">
                        {timeAgo(cmd.created_at)}
                      </span>

                      {/* Approve / Dismiss buttons */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => approveMutation.mutate(cmd.id)}
                          disabled={approveMutation.isPending}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-500/10 text-green-400 border border-green-500/30 hover:bg-green-500/20 hover:border-green-500/50 transition-all disabled:opacity-50"
                        >
                          <ThumbsUp className="w-3.5 h-3.5" />
                          Approve
                        </button>
                        <button
                          onClick={() => dismissMutation.mutate(cmd.id)}
                          disabled={dismissMutation.isPending}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 text-slate-400 border border-slate-700 hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30 transition-all disabled:opacity-50"
                        >
                          <X className="w-3.5 h-3.5" />
                          Dismiss
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-lg font-bold text-white">Alerts</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              {openAlerts.length} open · {resolvedAlerts.length} resolved
              {pendingCommands.length > 0 && (
                <span className="text-amber-400 ml-1">· {pendingCommands.length} pending approval</span>
              )}
            </p>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2 flex-wrap">
            {SEVERITY_FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setSeverityFilter(f.key)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                  severityFilter === f.key
                    ? "bg-indigo-600 text-white"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
                )}
              >
                {f.label}
              </button>
            ))}

            <div className="w-px h-5 bg-slate-700 mx-1" />

            <button
              onClick={() => setShowResolved(!showResolved)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                showResolved
                  ? "bg-slate-700 text-slate-200"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              )}
            >
              {showResolved ? "← Open Alerts" : "Show Resolved"}
            </button>
          </div>
        </div>

        {/* Alert list */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          {isLoading ? (
            <div className="py-16 text-center text-slate-500 text-sm">Loading alerts…</div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-slate-400 text-sm font-medium">
                {showResolved ? "No resolved alerts" : "🎉 No open alerts — fleet looks healthy!"}
              </p>
            </div>
          ) : (
            <AnimatePresence>
              {filtered.map((alert, i) => (
                <motion.div
                  key={alert.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 8 }}
                  transition={{ delay: i * 0.03 }}
                  className="flex items-center gap-4 px-5 py-4 border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors group"
                >
                  {/* Severity badge */}
                  <span className={cn(
                    "text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase flex-shrink-0",
                    healthBadge(alert.resolved ? "healthy" : alert.severity === "critical" ? "critical" : "warning")
                  )}>
                    {alert.resolved ? "Resolved" : alert.severity}
                  </span>

                  {/* Device */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => navigate(`/device/${alert.device_id}`)}
                        className="text-xs font-semibold text-slate-200 hover:text-indigo-400 transition-colors flex items-center gap-1"
                      >
                        {alert.devices?.hostname ?? "Unknown device"}
                        <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </button>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {ALERT_TYPE_LABELS[alert.alert_type] ?? alert.alert_type.replace(/_/g, " ")}
                      <span className="mx-1.5 text-slate-600">·</span>
                      {alert.message}
                    </p>
                  </div>

                  {/* Time */}
                  <span className="text-[10px] text-slate-600 font-mono flex-shrink-0">
                    {timeAgo(alert.created_at)}
                  </span>

                  {/* Resolve button */}
                  {!alert.resolved && (
                    <button
                      onClick={() => resolve(alert.id)}
                      disabled={isPending}
                      className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 text-slate-400 hover:bg-green-500/10 hover:text-green-400 border border-slate-700 hover:border-green-500/30 transition-all disabled:opacity-50"
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      Resolve
                    </button>
                  )}

                  {alert.resolved && alert.resolved_at && (
                    <span className="text-[10px] text-slate-600 font-mono flex-shrink-0">
                      ✓ {timeAgo(alert.resolved_at)}
                    </span>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </div>
      </div>
    </div>
  );
}
