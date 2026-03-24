import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle, ExternalLink } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import TopBar from "../components/layout/TopBar";
import { useAlerts, useResolveAlert } from "../hooks/useAlerts";
import { cn, healthBadge, timeAgo } from "../lib/utils";

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

export default function AlertCenter() {
  const navigate = useNavigate();
  const [showResolved, setShowResolved] = useState(false);
  const [severityFilter, setSeverityFilter] = useState("all");

  const { data: openAlerts = [], isLoading: loadingOpen } = useAlerts(undefined, false);
  const { data: resolvedAlerts = [], isLoading: loadingResolved } = useAlerts(undefined, true);
  const { mutate: resolve, isPending } = useResolveAlert();

  const alerts = showResolved ? resolvedAlerts : openAlerts;

  const filtered = severityFilter === "all"
    ? alerts
    : alerts.filter((a) => a.severity === severityFilter);

  const isLoading = showResolved ? loadingResolved : loadingOpen;

  return (
    <div className="flex flex-col h-full">
      <TopBar title="Alert Center" />

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-lg font-bold text-white">Alerts</h1>
            <p className="text-xs text-slate-500 mt-0.5">
              {openAlerts.length} open · {resolvedAlerts.length} resolved
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
