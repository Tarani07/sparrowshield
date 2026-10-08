import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useAllDevices } from "../hooks/useDevices";
import type { Device } from "../lib/types";
import { useNavigate } from "react-router-dom";
import { Monitor, Apple, Wifi, WifiOff, AlertTriangle, CheckCircle, XCircle, RefreshCw, Trash2 } from "lucide-react";
import { cn } from "../lib/utils";
import { useState } from "react";

// Compute real status from last_seen — don't trust the DB field which never resets
function computeStatus(device: Device): string {
  if (!device.last_seen) return "offline";
  const minutesAgo = (Date.now() - new Date(device.last_seen).getTime()) / 60000;
  if (minutesAgo > 15) return "offline";
  return device.status || "online";
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; icon: React.ElementType; cls: string }> = {
    online:   { label: "Online",   icon: Wifi,          cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" },
    offline:  { label: "Offline",  icon: WifiOff,       cls: "bg-slate-500/10  text-slate-400   border-slate-500/30"  },
    warning:  { label: "Warning",  icon: AlertTriangle, cls: "bg-amber-500/10   text-amber-400   border-amber-500/30"  },
    critical: { label: "Critical", icon: XCircle,       cls: "bg-red-500/10     text-red-400     border-red-500/30"    },
    healthy:  { label: "Healthy",  icon: CheckCircle,   cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"},
  };
  const s = map[status] ?? map.offline;
  const Icon = s.icon;
  return (
    <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border", s.cls)}>
      <Icon className="w-3 h-3" /> {s.label}
    </span>
  );
}

function OsIcon({ os }: { os: string }) {
  if (os === "mac") return <Apple className="w-4 h-4" style={{ color: "var(--c-muted)" }} />;
  return <Monitor className="w-4 h-4 text-blue-400" />;
}

export default function DeviceList() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [deleteTarget, setDeleteTarget] = useState<Device | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-device?id=${deleteTarget.id}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
        }
      );
      queryClient.invalidateQueries({ queryKey: ["all-devices"] });
      queryClient.invalidateQueries({ queryKey: ["device-count"] });
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }

  const { data: devices = [], isLoading, refetch, isFetching, error } = useAllDevices();

  const total    = devices.length;
  const online   = devices.filter(d => computeStatus(d) === "online").length;
  const offline  = devices.filter(d => computeStatus(d) === "offline").length;
  const warning  = devices.filter(d => computeStatus(d) === "warning").length;
  const critical = devices.filter(d => computeStatus(d) === "critical").length;
  const macs     = devices.filter(d => d.os_type === "mac").length;
  const windows  = devices.filter(d => d.os_type === "windows").length;

  return (
    <div style={{ background: "var(--c-bg)", minHeight: "100vh" }} className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--c-strong)" }}>Device List</h1>
          <p className="text-sm mt-1" style={{ color: "var(--c-muted)" }}>All enrolled devices across your fleet</p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className={cn("flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors", isFetching && "opacity-60 pointer-events-none")}
          style={{ background: "var(--c-card)", color: "var(--c-muted)", border: "1px solid var(--c-border)" }}
        >
          <RefreshCw className={cn("w-4 h-4", isFetching && "animate-spin")} />
          Refresh
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: "Total",    value: total,    color: "var(--c-strong)"  },
          { label: "Online",   value: online,   color: "#22c55e"          },
          { label: "Offline",  value: offline,  color: "var(--c-muted)"   },
          { label: "Warning",  value: warning,  color: "#f59e0b"          },
          { label: "Critical", value: critical, color: "#ef4444"          },
          { label: "macOS",    value: macs,     color: "var(--c-primary)" },
        ].map(c => (
          <div key={c.label} style={{ background: "var(--c-card)", border: "1px solid var(--c-border)", borderRadius: 16, padding: "16px 20px", textAlign: "center" }}>
            <p style={{ fontSize: 24, fontWeight: 800, color: c.color }}>{c.value}</p>
            <p style={{ fontSize: 11, color: "var(--c-muted)", marginTop: 2 }}>{c.label}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-xl overflow-hidden" style={{ background: "var(--c-card)", border: "1px solid var(--c-border)" }}>
        <div className="px-5 py-3.5 flex items-center justify-between" style={{ borderBottom: "1px solid var(--c-border)" }}>
          <p className="text-sm font-semibold" style={{ color: "var(--c-strong)" }}>
            Enrolled Devices{" "}
            <span className="ml-2 px-2 py-0.5 rounded-full text-xs" style={{ background: "rgba(27,94,55,0.15)", color: "#1B5E37", border: "1px solid rgba(27,94,55,0.25)" }}>
              {total}
            </span>
          </p>
          <p className="text-xs" style={{ color: "var(--c-muted)" }}>{macs} macOS · {windows} Windows</p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-sm" style={{ color: "var(--c-muted)" }}>Loading devices...</div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Monitor className="w-10 h-10 mb-3 opacity-30" style={{ color: "var(--c-muted)" }} />
            <p className="text-sm text-red-400">Failed to load devices</p>
            <p className="text-xs mt-1 font-mono" style={{ color: "var(--c-faint)" }}>{String(error)}</p>
          </div>
        ) : devices.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Monitor className="w-10 h-10 mb-3 opacity-30" style={{ color: "var(--c-muted)" }} />
            <p className="text-sm" style={{ color: "var(--c-muted)" }}>No devices enrolled yet</p>
            <p className="text-xs mt-1" style={{ color: "var(--c-faint)" }}>Download the agent from the sidebar and run it on a device</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--c-border)" }}>
                {["Device", "Serial No.", "OS", "Model", "RAM", "Status", "Last Seen", ""].map(h => (
                  <th key={h} className="text-left px-5 py-3" style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--c-muted)" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {devices.map(d => (
                <tr
                  key={d.id}
                  onClick={() => navigate(`/device/${d.id}`)}
                  className="cursor-pointer transition-colors group"
                  style={{ borderBottom: "1px solid var(--c-divider)" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "var(--c-bg)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "")}
                >
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <OsIcon os={d.os_type} />
                      <div>
                        <p className="font-medium group-hover:text-green-600 transition-colors" style={{ color: "var(--c-strong)" }}>{d.hostname}</p>
                        <p className="text-xs" style={{ color: "var(--c-muted)" }}>{d.assigned_user || "—"}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 font-mono text-xs" style={{ color: "var(--c-muted)" }}>{d.serial_number || "—"}</td>
                  <td className="px-4 py-3.5" style={{ color: "var(--c-muted)" }}>{d.os_version || d.os_type}</td>
                  <td className="px-4 py-3.5 max-w-[160px] truncate" style={{ color: "var(--c-muted)" }}>{(d as any).cpu_model || "—"}</td>
                  <td className="px-4 py-3.5" style={{ color: "var(--c-muted)" }}>{(d as any).ram_total_gb ? `${(d as any).ram_total_gb} GB` : "—"}</td>
                  <td className="px-4 py-3.5"><StatusBadge status={computeStatus(d)} /></td>
                  <td className="px-4 py-3.5 text-xs" style={{ color: "var(--c-muted)" }}>
                    {d.last_seen ? new Date(d.last_seen).toLocaleString() : "Never"}
                  </td>
                  <td className="px-4 py-3.5" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => setDeleteTarget(d)}
                      className="p-1.5 rounded-lg hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      style={{ color: "var(--c-faint)" }}
                      title="Delete device"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="rounded-2xl p-6 w-full max-w-sm shadow-2xl" style={{ background: "var(--c-card)", border: "1px solid var(--c-border2)" }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h2 className="text-sm font-semibold" style={{ color: "var(--c-strong)" }}>Delete Device</h2>
                <p className="text-xs" style={{ color: "var(--c-muted)" }}>This action cannot be undone</p>
              </div>
            </div>
            <p className="text-sm mb-1" style={{ color: "var(--c-text)" }}>
              Are you sure you want to remove <span className="font-semibold" style={{ color: "var(--c-strong)" }}>{deleteTarget.hostname}</span>?
            </p>
            <p className="text-xs mb-5" style={{ color: "var(--c-muted)" }}>
              S/N: {deleteTarget.serial_number} · All metrics, alerts and history will be permanently deleted.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 px-4 py-2 rounded-lg text-sm transition-colors"
                style={{ background: "var(--c-card2)", color: "var(--c-text)", border: "1px solid var(--c-border)" }}
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleting}
                className="flex-1 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-500 disabled:opacity-50 transition-colors"
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
