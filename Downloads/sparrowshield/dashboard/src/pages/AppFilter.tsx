import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { Package, Plus, Trash2, AlertTriangle, CheckCircle, Shield } from "lucide-react";
import TopBar from "../components/layout/TopBar";
import ScanNowButton from "../components/ScanNowButton";

interface AppRule {
  id: string;
  app_name: string;
  list_type: "allowlist" | "blocklist";
  platform: string;
  reason: string | null;
  created_at: string;
}

interface Violation {
  id: string;
  app_name: string;
  app_version: string | null;
  violation_type: string;
  detected_at: string;
  resolved: boolean;
  hostname: string | null;
}

export default function AppFilter() {
  const qc = useQueryClient();
  const [tab, setTab]           = useState<"rules" | "violations">("rules");
  const [newApp, setNewApp]     = useState("");
  const [newType, setNewType]   = useState<"blocklist" | "allowlist">("blocklist");
  const [newReason, setNewReason] = useState("");
  const [adding, setAdding]     = useState(false);

  const { data: rules = [], isLoading } = useQuery<AppRule[]>({
    queryKey: ["app-filter-rules"],
    queryFn: async () => {
      const { data } = await supabase
        .from("software_lists")
        .select("id, app_name, list_type, platform, reason, created_at")
        .order("list_type").order("app_name");
      return data ?? [];
    },
  });

  const { data: violations = [] } = useQuery<Violation[]>({
    queryKey: ["app-violations"],
    queryFn: async () => {
      const { data } = await supabase
        .from("software_violations")
        .select("id, app_name, app_version, violation_type, detected_at, resolved, devices(hostname)")
        .order("detected_at", { ascending: false })
        .limit(100);
      return (data ?? []).map((v: any) => ({
        ...v,
        hostname: Array.isArray(v.devices) ? v.devices[0]?.hostname ?? null : v.devices?.hostname ?? null,
      }));
    },
    refetchInterval: 30_000,
  });

  const addRule = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("software_lists").insert({
        app_name:  newApp.trim(),
        list_type: newType,
        platform:  "all",
        reason:    newReason.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["app-filter-rules"] });
      setNewApp(""); setNewReason(""); setAdding(false);
    },
  });

  const deleteRule = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("software_lists").delete().eq("id", id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["app-filter-rules"] }),
  });

  const resolveViolation = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("software_violations").update({ resolved: true }).eq("id", id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["app-violations"] }),
  });

  const blocked  = rules.filter(r => r.list_type === "blocklist");
  const allowed  = rules.filter(r => r.list_type === "allowlist");
  const openViolations = violations.filter(v => !v.resolved);

  return (
    <div style={{ background: "var(--c-bg)", minHeight: "100vh" }}>
      <TopBar title="Application Filter" />
      <div className="p-6 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2" style={{ color: "var(--c-strong)" }}>
              <Package className="w-5 h-5" style={{ color: "#6366f1" }} />
              Application Filter
            </h1>
            <p className="text-sm mt-1" style={{ color: "var(--c-muted)" }}>
              Allow or block specific applications across all enrolled devices
            </p>
          </div>
          <div className="flex gap-2">
            <ScanNowButton />
            <button
              onClick={() => setAdding(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
              style={{ background: "#6366f1" }}
            >
              <Plus className="w-4 h-4" /> Add Rule
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Blocked Apps", value: blocked.length, color: "#ef4444", icon: Shield },
            { label: "Allowed Apps", value: allowed.length, color: "#10b981", icon: CheckCircle },
            { label: "Open Violations", value: openViolations.length, color: "#f59e0b", icon: AlertTriangle },
          ].map(({ label, value, color, icon: Icon }) => (
            <div key={label} className="rounded-xl p-4 border" style={{ background: "var(--c-surface)", borderColor: "var(--c-border)" }}>
              <div className="flex items-center gap-2 mb-1">
                <Icon className="w-4 h-4" style={{ color }} />
                <span className="text-xs" style={{ color: "var(--c-muted)" }}>{label}</span>
              </div>
              <p className="text-2xl font-bold" style={{ color: "var(--c-strong)" }}>{value}</p>
            </div>
          ))}
        </div>

        {/* Add Rule Form */}
        {adding && (
          <div className="rounded-xl p-4 border space-y-3" style={{ background: "var(--c-surface)", borderColor: "#6366f1" }}>
            <p className="text-sm font-semibold" style={{ color: "var(--c-strong)" }}>Add Application Rule</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs mb-1 block" style={{ color: "var(--c-muted)" }}>Application Name</label>
                <input
                  value={newApp}
                  onChange={e => setNewApp(e.target.value)}
                  placeholder="e.g. BitTorrent, VLC, Zoom"
                  className="w-full px-3 py-2 rounded-lg text-sm border"
                  style={{ background: "var(--c-bg)", borderColor: "var(--c-border)", color: "var(--c-fg)" }}
                />
              </div>
              <div>
                <label className="text-xs mb-1 block" style={{ color: "var(--c-muted)" }}>Action</label>
                <select
                  value={newType}
                  onChange={e => setNewType(e.target.value as "blocklist" | "allowlist")}
                  className="w-full px-3 py-2 rounded-lg text-sm border"
                  style={{ background: "var(--c-bg)", borderColor: "var(--c-border)", color: "var(--c-fg)" }}
                >
                  <option value="blocklist">Block</option>
                  <option value="allowlist">Allow</option>
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs mb-1 block" style={{ color: "var(--c-muted)" }}>Reason (optional)</label>
              <input
                value={newReason}
                onChange={e => setNewReason(e.target.value)}
                placeholder="e.g. Security policy, unauthorized software"
                className="w-full px-3 py-2 rounded-lg text-sm border"
                style={{ background: "var(--c-bg)", borderColor: "var(--c-border)", color: "var(--c-fg)" }}
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => addRule.mutate()}
                disabled={!newApp.trim() || addRule.isPending}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white"
                style={{ background: "#6366f1", opacity: !newApp.trim() ? 0.5 : 1 }}
              >
                {addRule.isPending ? "Adding…" : "Add Rule"}
              </button>
              <button onClick={() => setAdding(false)} className="px-4 py-2 rounded-lg text-sm" style={{ color: "var(--c-muted)" }}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 p-1 rounded-lg w-fit" style={{ background: "var(--c-surface)" }}>
          {(["rules", "violations"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className="px-4 py-1.5 rounded-md text-sm font-medium transition-all capitalize"
              style={{
                background: tab === t ? "var(--c-bg)" : "transparent",
                color: tab === t ? "var(--c-strong)" : "var(--c-muted)",
              }}>
              {t === "violations" ? `Violations (${openViolations.length})` : "Rules"}
            </button>
          ))}
        </div>

        {/* Rules Table */}
        {tab === "rules" && (
          <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--c-border)" }}>
            {isLoading ? (
              <div className="p-8 text-center text-sm" style={{ color: "var(--c-muted)" }}>Loading rules…</div>
            ) : rules.length === 0 ? (
              <div className="p-8 text-center text-sm" style={{ color: "var(--c-muted)" }}>No rules configured. Add a rule to get started.</div>
            ) : (
              <table className="w-full text-sm">
                <thead style={{ background: "var(--c-surface)" }}>
                  <tr>
                    {["Application", "Action", "Platform", "Reason", ""].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold" style={{ color: "var(--c-muted)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rules.map(rule => (
                    <tr key={rule.id} style={{ borderTop: "1px solid var(--c-border)" }}>
                      <td className="px-4 py-3 font-medium" style={{ color: "var(--c-strong)" }}>{rule.app_name}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium"
                          style={{
                            background: rule.list_type === "blocklist" ? "#fee2e2" : "#dcfce7",
                            color:      rule.list_type === "blocklist" ? "#ef4444" : "#16a34a",
                          }}>
                          {rule.list_type === "blocklist" ? "Block" : "Allow"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: "var(--c-muted)" }}>{rule.platform}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: "var(--c-muted)" }}>{rule.reason ?? "—"}</td>
                      <td className="px-4 py-3">
                        <button onClick={() => deleteRule.mutate(rule.id)}
                          className="p-1 rounded hover:bg-red-50" style={{ color: "#ef4444" }}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Violations Table */}
        {tab === "violations" && (
          <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--c-border)" }}>
            {violations.length === 0 ? (
              <div className="p-8 text-center text-sm" style={{ color: "var(--c-muted)" }}>No violations detected.</div>
            ) : (
              <table className="w-full text-sm">
                <thead style={{ background: "var(--c-surface)" }}>
                  <tr>
                    {["Application", "Device", "Version", "Detected", "Status", ""].map(h => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold" style={{ color: "var(--c-muted)" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {violations.map(v => (
                    <tr key={v.id} style={{ borderTop: "1px solid var(--c-border)", opacity: v.resolved ? 0.5 : 1 }}>
                      <td className="px-4 py-3 font-medium" style={{ color: "var(--c-strong)" }}>{v.app_name}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: "var(--c-muted)" }}>
                        {v.hostname ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: "var(--c-muted)" }}>{v.app_version ?? "—"}</td>
                      <td className="px-4 py-3 text-xs" style={{ color: "var(--c-muted)" }}>
                        {new Date(v.detected_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-0.5 rounded-full text-xs"
                          style={{ background: v.resolved ? "#dcfce7" : "#fee2e2", color: v.resolved ? "#16a34a" : "#ef4444" }}>
                          {v.resolved ? "Resolved" : "Open"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {!v.resolved && (
                          <button onClick={() => resolveViolation.mutate(v.id)}
                            className="text-xs px-2 py-1 rounded" style={{ color: "#6366f1", background: "var(--c-surface)" }}>
                            Resolve
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
