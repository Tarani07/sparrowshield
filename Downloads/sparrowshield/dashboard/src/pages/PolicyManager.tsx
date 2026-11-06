import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Shield, Plus, Trash2, AlertTriangle, Ban, Bell, X, ChevronDown } from "lucide-react";
import { supabase } from "../lib/supabase";
import { cn } from "../lib/utils";

interface BlockRule {
  id: string;
  name: string;
  rule_type: "path" | "signing_id" | "team_id" | "process_name" | "hash";
  pattern: string;
  action: "block" | "alert";
  platform: "all" | "macos" | "windows" | "linux";
  device_id: string | null;
  enabled: boolean;
  severity: "info" | "warning" | "high" | "critical";
  description: string | null;
  mitre_id: string | null;
  created_at: string;
}

const RULE_TYPE_PLACEHOLDERS: Record<string, string> = {
  path:        "/tmp/  or  C:\\Users\\Public\\",
  signing_id:  "com.malicious.app",
  team_id:     "ABCDEF1234",
  process_name:"mshta.exe  or  osascript",
  hash:        "sha256:aabbcc...",
};

const SEVERITY_COLORS: Record<string, string> = {
  info:     "rgba(96,165,250,0.15)",
  warning:  "rgba(245,158,11,0.15)",
  high:     "rgba(249,115,22,0.15)",
  critical: "rgba(239,68,68,0.15)",
};
const SEVERITY_TEXT: Record<string, string> = {
  info:     "#60a5fa",
  warning:  "#f59e0b",
  high:     "#f97316",
  critical: "#ef4444",
};

const PLATFORM_ICONS: Record<string, string> = {
  all:     "🌐",
  macos:   "",
  windows: "🪟",
  linux:   "🐧",
};

function useBlockRules() {
  return useQuery<BlockRule[]>({
    queryKey: ["block-rules"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("block_rules")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as BlockRule[];
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

const EMPTY_FORM = {
  name: "",
  rule_type: "process_name" as BlockRule["rule_type"],
  pattern: "",
  action: "block" as BlockRule["action"],
  platform: "all" as BlockRule["platform"],
  severity: "high" as BlockRule["severity"],
  mitre_id: "",
  description: "",
};

export default function PolicyManager() {
  const qc = useQueryClient();
  const { data: rules = [], isLoading } = useBlockRules();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<BlockRule | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });

  const totalRules = rules.length;
  const activeBlocks = rules.filter(r => r.action === "block" && r.enabled).length;
  const alertOnly   = rules.filter(r => r.action === "alert"  && r.enabled).length;
  const platforms   = new Set(rules.map(r => r.platform)).size;

  async function saveRule() {
    if (!form.name || !form.pattern) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("block_rules").insert({
        name:        form.name,
        rule_type:   form.rule_type,
        pattern:     form.pattern,
        action:      form.action,
        platform:    form.platform,
        severity:    form.severity,
        mitre_id:    form.mitre_id || null,
        description: form.description || null,
        enabled:     true,
      });
      if (error) throw error;
      setDrawerOpen(false);
      setForm({ ...EMPTY_FORM });
      qc.invalidateQueries({ queryKey: ["block-rules"] });
    } catch (e) {
      if (import.meta.env.DEV) console.error("Save rule failed:", e);
    } finally {
      setSaving(false);
    }
  }

  async function toggleEnabled(rule: BlockRule) {
    await supabase.from("block_rules").update({ enabled: !rule.enabled }).eq("id", rule.id);
    qc.invalidateQueries({ queryKey: ["block-rules"] });
  }

  async function deleteRule(rule: BlockRule) {
    await supabase.from("block_rules").delete().eq("id", rule.id);
    setDeleteTarget(null);
    qc.invalidateQueries({ queryKey: ["block-rules"] });
  }

  return (
    <div style={{ background: "var(--c-bg)", minHeight: "100vh" }} className="p-6 space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Shield className="w-5 h-5" style={{ color: "var(--c-primary)" }} />
            <h1 className="text-xl font-bold" style={{ color: "var(--c-strong)" }}>Policy Manager</h1>
          </div>
          <p className="text-sm" style={{ color: "var(--c-muted)" }}>
            Define what the kernel sensor blocks or alerts on in real time
          </p>
        </div>
        <button
          onClick={() => { setForm({ ...EMPTY_FORM }); setDrawerOpen(true); }}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-colors"
          style={{ background: "var(--c-primary)", color: "#fff" }}
        >
          <Plus className="w-4 h-4" /> Add Rule
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total Rules",        value: totalRules,   color: "var(--c-strong)" },
          { label: "Active Blocks",      value: activeBlocks, color: "#ef4444"         },
          { label: "Alert-Only",         value: alertOnly,    color: "#f59e0b"         },
          { label: "Platforms",          value: platforms,    color: "var(--c-primary)"},
        ].map(s => (
          <div key={s.label}
            style={{ background: "var(--c-card)", border: "1px solid var(--c-border)", borderRadius: 16, padding: "16px 20px", textAlign: "center" }}>
            <p style={{ fontSize: 28, fontWeight: 800, color: s.color }}>{s.value}</p>
            <p style={{ fontSize: 11, color: "var(--c-muted)", marginTop: 2 }}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* Rules table */}
      <div className="rounded-xl overflow-hidden" style={{ background: "var(--c-card)", border: "1px solid var(--c-border)" }}>
        <div className="px-5 py-3.5 flex items-center justify-between" style={{ borderBottom: "1px solid var(--c-border)" }}>
          <p className="text-sm font-semibold" style={{ color: "var(--c-strong)" }}>
            Block Rules
            <span className="ml-2 px-2 py-0.5 rounded-full text-xs"
              style={{ background: "rgba(27,94,55,0.15)", color: "#1B5E37", border: "1px solid rgba(27,94,55,0.25)" }}>
              {totalRules}
            </span>
          </p>
          <p className="text-xs" style={{ color: "var(--c-muted)" }}>
            Changes take effect within 5 min on enrolled devices
          </p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-sm" style={{ color: "var(--c-muted)" }}>
            Loading rules…
          </div>
        ) : rules.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Shield className="w-10 h-10 mb-3 opacity-20" style={{ color: "var(--c-muted)" }} />
            <p className="text-sm" style={{ color: "var(--c-muted)" }}>No rules defined yet</p>
            <p className="text-xs mt-1" style={{ color: "var(--c-faint)" }}>Click "Add Rule" to create the first policy</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--c-border)" }}>
                  {["Name", "Type", "Pattern", "Action", "Platform", "Severity", "MITRE", "Enabled", ""].map(h => (
                    <th key={h} className="text-left px-5 py-3"
                      style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--c-muted)" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rules.map(rule => (
                  <tr key={rule.id}
                    style={{ borderBottom: "1px solid var(--c-divider)", opacity: rule.enabled ? 1 : 0.45 }}
                    onMouseEnter={e => (e.currentTarget.style.background = "var(--c-bg)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "")}>
                    <td className="px-5 py-3.5">
                      <p className="font-medium" style={{ color: "var(--c-strong)" }}>{rule.name}</p>
                      {rule.description && (
                        <p className="text-xs mt-0.5" style={{ color: "var(--c-faint)" }}>{rule.description}</p>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="font-mono text-xs px-2 py-0.5 rounded"
                        style={{ background: "var(--c-bg)", color: "var(--c-muted)", border: "1px solid var(--c-border)" }}>
                        {rule.rule_type}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 max-w-[160px]">
                      <span className="font-mono text-xs truncate block" style={{ color: "var(--c-text)" }} title={rule.pattern}>
                        {rule.pattern}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      {rule.action === "block" ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
                          style={{ background: "rgba(239,68,68,0.12)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.25)" }}>
                          <Ban className="w-3 h-3" /> Block
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
                          style={{ background: "rgba(245,158,11,0.12)", color: "#f59e0b", border: "1px solid rgba(245,158,11,0.25)" }}>
                          <Bell className="w-3 h-3" /> Alert
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-xs" style={{ color: "var(--c-muted)" }}>
                      {PLATFORM_ICONS[rule.platform]} {rule.platform}
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="text-xs font-medium px-2 py-0.5 rounded"
                        style={{ background: SEVERITY_COLORS[rule.severity], color: SEVERITY_TEXT[rule.severity] }}>
                        {rule.severity}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 font-mono text-xs" style={{ color: "var(--c-muted)" }}>
                      {rule.mitre_id || "—"}
                    </td>
                    <td className="px-4 py-3.5">
                      <button
                        onClick={() => toggleEnabled(rule)}
                        className="relative rounded-full transition-all"
                        style={{ width: 36, height: 20, background: rule.enabled ? "var(--c-primary)" : "var(--c-border2)", flexShrink: 0 }}
                        aria-label={rule.enabled ? "Disable" : "Enable"}>
                        <span className="absolute top-1 rounded-full transition-all duration-200"
                          style={{ width: 12, height: 12, background: "#fff", left: rule.enabled ? 20 : 4 }} />
                      </button>
                    </td>
                    <td className="px-4 py-3.5">
                      <button
                        onClick={() => setDeleteTarget(rule)}
                        className="p-1.5 rounded-lg hover:text-red-400 hover:bg-red-500/10 transition-colors"
                        style={{ color: "var(--c-faint)" }}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Rule Drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end" style={{ background: "rgba(0,0,0,0.5)" }}
          onClick={e => { if (e.target === e.currentTarget) setDrawerOpen(false); }}>
          <div className="w-full max-w-md h-full overflow-y-auto flex flex-col"
            style={{ background: "var(--c-card)", borderLeft: "1px solid var(--c-border2)" }}>
            <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: "1px solid var(--c-border)" }}>
              <h2 className="font-semibold" style={{ color: "var(--c-strong)" }}>New Block Rule</h2>
              <button onClick={() => setDrawerOpen(false)} className="p-1.5 rounded-lg" style={{ color: "var(--c-muted)" }}>
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--c-muted)" }}>Rule Name *</label>
                <input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Block Temp Execution"
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={{ background: "var(--c-bg)", border: "1px solid var(--c-border2)", color: "var(--c-strong)" }}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--c-muted)" }}>Rule Type</label>
                  <select
                    value={form.rule_type}
                    onChange={e => setForm(f => ({ ...f, rule_type: e.target.value as BlockRule["rule_type"] }))}
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                    style={{ background: "var(--c-bg)", border: "1px solid var(--c-border2)", color: "var(--c-strong)" }}>
                    <option value="process_name">Process Name</option>
                    <option value="path">Path</option>
                    <option value="signing_id">Signing ID</option>
                    <option value="team_id">Team ID</option>
                    <option value="hash">Hash</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--c-muted)" }}>Platform</label>
                  <select
                    value={form.platform}
                    onChange={e => setForm(f => ({ ...f, platform: e.target.value as BlockRule["platform"] }))}
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                    style={{ background: "var(--c-bg)", border: "1px solid var(--c-border2)", color: "var(--c-strong)" }}>
                    <option value="all">All Platforms</option>
                    <option value="macos">macOS</option>
                    <option value="windows">Windows</option>
                    <option value="linux">Linux</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--c-muted)" }}>Pattern *</label>
                <input
                  value={form.pattern}
                  onChange={e => setForm(f => ({ ...f, pattern: e.target.value }))}
                  placeholder={RULE_TYPE_PLACEHOLDERS[form.rule_type]}
                  className="w-full px-3 py-2 rounded-lg text-sm font-mono outline-none"
                  style={{ background: "var(--c-bg)", border: "1px solid var(--c-border2)", color: "var(--c-strong)" }}
                />
                <p className="text-xs mt-1" style={{ color: "var(--c-faint)" }}>
                  Substring match — partial patterns supported
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium mb-2" style={{ color: "var(--c-muted)" }}>Action</label>
                <div className="flex rounded-lg overflow-hidden" style={{ border: "1px solid var(--c-border2)" }}>
                  {(["block", "alert"] as const).map(a => (
                    <button key={a}
                      onClick={() => setForm(f => ({ ...f, action: a }))}
                      className="flex-1 py-2 text-sm font-medium transition-colors"
                      style={{
                        background: form.action === a
                          ? (a === "block" ? "rgba(239,68,68,0.15)" : "rgba(245,158,11,0.15)")
                          : "transparent",
                        color: form.action === a
                          ? (a === "block" ? "#ef4444" : "#f59e0b")
                          : "var(--c-muted)",
                      }}>
                      {a === "block" ? "🚫 Block" : "🔔 Alert Only"}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--c-muted)" }}>Severity</label>
                <select
                  value={form.severity}
                  onChange={e => setForm(f => ({ ...f, severity: e.target.value as BlockRule["severity"] }))}
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={{ background: "var(--c-bg)", border: "1px solid var(--c-border2)", color: "var(--c-strong)" }}>
                  <option value="info">Info</option>
                  <option value="warning">Warning</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--c-muted)" }}>MITRE ID (optional)</label>
                  <input
                    value={form.mitre_id}
                    onChange={e => setForm(f => ({ ...f, mitre_id: e.target.value }))}
                    placeholder="T1059.001"
                    className="w-full px-3 py-2 rounded-lg text-sm font-mono outline-none"
                    style={{ background: "var(--c-bg)", border: "1px solid var(--c-border2)", color: "var(--c-strong)" }}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--c-muted)" }}>Description (optional)</label>
                <textarea
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  rows={2}
                  placeholder="Why this rule exists…"
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none resize-none"
                  style={{ background: "var(--c-bg)", border: "1px solid var(--c-border2)", color: "var(--c-strong)" }}
                />
              </div>
            </div>

            <div className="px-6 py-4 flex gap-3" style={{ borderTop: "1px solid var(--c-border)" }}>
              <button onClick={() => setDrawerOpen(false)}
                className="flex-1 py-2 rounded-xl text-sm transition-colors"
                style={{ background: "var(--c-bg)", color: "var(--c-muted)", border: "1px solid var(--c-border)" }}>
                Cancel
              </button>
              <button
                onClick={saveRule}
                disabled={saving || !form.name || !form.pattern}
                className="flex-1 py-2 rounded-xl text-sm font-semibold transition-colors disabled:opacity-40"
                style={{ background: "var(--c-primary)", color: "#fff" }}>
                {saving ? "Saving…" : "Save Rule"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="rounded-2xl p-6 w-full max-w-sm shadow-2xl"
            style={{ background: "var(--c-card)", border: "1px solid var(--c-border2)" }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-red-400" />
              </div>
              <div>
                <h2 className="text-sm font-semibold" style={{ color: "var(--c-strong)" }}>Delete Rule</h2>
                <p className="text-xs" style={{ color: "var(--c-muted)" }}>Cannot be undone</p>
              </div>
            </div>
            <p className="text-sm mb-5" style={{ color: "var(--c-text)" }}>
              Delete <span className="font-semibold" style={{ color: "var(--c-strong)" }}>{deleteTarget.name}</span>?
              Devices will no longer enforce this policy.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)}
                className="flex-1 px-4 py-2 rounded-lg text-sm transition-colors"
                style={{ background: "var(--c-bg)", color: "var(--c-text)", border: "1px solid var(--c-border)" }}>
                Cancel
              </button>
              <button onClick={() => deleteRule(deleteTarget)}
                className="flex-1 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-500 transition-colors">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
