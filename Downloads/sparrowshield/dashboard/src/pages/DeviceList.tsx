import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import type { Device } from "../lib/types";
import { useNavigate } from "react-router-dom";
import { Monitor, Apple, Wifi, WifiOff, AlertTriangle, CheckCircle, XCircle, RefreshCw, Trash2 } from "lucide-react";
import { cn } from "../lib/utils";
import { useState } from "react";

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
  if (os === "mac") return <Apple className="w-4 h-4 text-slate-400" />;
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

  const { data: devices = [], isLoading, refetch, isFetching } = useQuery<Device[]>({
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

  const total    = devices.length;
  const online   = devices.filter(d => d.status === "online").length;
  const offline  = devices.filter(d => d.status === "offline").length;
  const warning  = devices.filter(d => d.status === "warning").length;
  const critical = devices.filter(d => d.status === "critical").length;
  const macs     = devices.filter(d => d.os_type === "mac").length;
  const windows  = devices.filter(d => d.os_type === "windows").length;

  return (
    <div className="flex-1 overflow-y-auto bg-slate-950 p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Device List</h1>
          <p className="text-sm text-slate-500 mt-0.5">All enrolled devices across your fleet</p>
        </div>
        <button
          onClick={() => refetch()}
          className={cn("flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 text-slate-400 hover:text-white text-sm transition-colors", isFetching && "opacity-60 pointer-events-none")}
        >
          <RefreshCw className={cn("w-4 h-4", isFetching && "animate-spin")} />
          Refresh
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {[
          { label: "Total",    value: total,    cls: "text-white"          },
          { label: "Online",   value: online,   cls: "text-emerald-400"    },
          { label: "Offline",  value: offline,  cls: "text-slate-400"      },
          { label: "Warning",  value: warning,  cls: "text-amber-400"      },
          { label: "Critical", value: critical, cls: "text-red-400"        },
          { label: "macOS",    value: macs,     cls: "text-indigo-400"     },
        ].map(c => (
          <div key={c.label} className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-center">
            <p className={cn("text-2xl font-bold", c.cls)}>{c.value}</p>
            <p className="text-xs text-slate-500 mt-0.5">{c.label}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
          <p className="text-sm font-semibold text-white">
            Enrolled Devices <span className="ml-2 px-2 py-0.5 rounded-full bg-indigo-600/20 text-indigo-400 text-xs border border-indigo-600/30">{total}</span>
          </p>
          <p className="text-xs text-slate-500">{macs} macOS · {windows} Windows</p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-slate-500 text-sm">Loading devices...</div>
        ) : devices.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-500">
            <Monitor className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm">No devices enrolled yet</p>
            <p className="text-xs mt-1 text-slate-600">Download the agent from the sidebar and run it on a device</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-500 uppercase tracking-wider border-b border-slate-800">
                <th className="text-left px-5 py-3">Device</th>
                <th className="text-left px-4 py-3">Serial No.</th>
                <th className="text-left px-4 py-3">OS</th>
                <th className="text-left px-4 py-3">Model</th>
                <th className="text-left px-4 py-3">RAM</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Last Seen</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {devices.map(d => (
                <tr
                  key={d.id}
                  onClick={() => navigate(`/device/${d.id}`)}
                  className="hover:bg-slate-800/50 cursor-pointer transition-colors group"
                >
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <OsIcon os={d.os_type} />
                      <div>
                        <p className="font-medium text-white group-hover:text-indigo-400 transition-colors">{d.hostname}</p>
                        <p className="text-xs text-slate-500">{d.assigned_user || "—"}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-slate-400 font-mono text-xs">{d.serial_number || "—"}</td>
                  <td className="px-4 py-3.5 text-slate-400">{d.os_version || d.os_type}</td>
                  <td className="px-4 py-3.5 text-slate-400 max-w-[160px] truncate">{(d as any).cpu_model || "—"}</td>
                  <td className="px-4 py-3.5 text-slate-400">{(d as any).ram_total_gb ? `${(d as any).ram_total_gb} GB` : "—"}</td>
                  <td className="px-4 py-3.5"><StatusBadge status={d.status} /></td>
                  <td className="px-4 py-3.5 text-slate-500 text-xs">
                    {d.last_seen ? new Date(d.last_seen).toLocaleString() : "Never"}
                  </td>
                  <td className="px-4 py-3.5" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => setDeleteTarget(d)}
                      className="p-1.5 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
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
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-white">Delete Device</h2>
                <p className="text-xs text-slate-500">This action cannot be undone</p>
              </div>
            </div>
            <p className="text-sm text-slate-300 mb-1">
              Are you sure you want to remove <span className="font-semibold text-white">{deleteTarget.hostname}</span>?
            </p>
            <p className="text-xs text-slate-500 mb-5">
              S/N: {deleteTarget.serial_number} · All metrics, alerts and history will be permanently deleted.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 px-4 py-2 rounded-lg bg-slate-800 text-slate-300 text-sm hover:bg-slate-700 transition-colors"
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
