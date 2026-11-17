import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import {
  Globe, Plus, Trash2, ToggleLeft, ToggleRight, AlertCircle,
  Bug, Fish, Lock, Cpu, EyeOff, Dices, Gamepad2, MessageCircle, Eye,
} from "lucide-react";
import TopBar from "../components/layout/TopBar";
import ScanNowButton from "../components/ScanNowButton";

interface WebRule {
  id: string;
  domain: string;
  action: "block" | "allow";
  category: string;
  notes: string | null;
  enabled: boolean;
  created_at: string;
}

interface Category {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
}

const CATEGORY_COLORS: Record<string, string> = {
  malware:      "#ef4444",
  phishing:     "#f97316",
  ransomware:   "#dc2626",
  crypto_mining:"#7c3aed",
  adult:        "#ec4899",
  gambling:     "#f59e0b",
  gaming:       "#3b82f6",
  social:       "#06b6d4",
  tracking:     "#6b7280",
};

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  malware:       Bug,
  phishing:      Fish,
  ransomware:    Lock,
  crypto_mining: Cpu,
  adult:         EyeOff,
  gambling:      Dices,
  gaming:        Gamepad2,
  social:        MessageCircle,
  tracking:      Eye,
};

export default function WebFilter() {
  const qc = useQueryClient();
  const [tab, setTab]           = useState<"categories" | "custom">("categories");
  const [newDomain, setNewDomain] = useState("");
  const [newAction, setNewAction] = useState<"block" | "allow">("block");
  const [newNotes, setNewNotes]   = useState("");
  const [adding, setAdding]       = useState(false);

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["web-categories"],
    queryFn: async () => {
      const { data } = await supabase
        .from("web_categories")
        .select("id, name, description, enabled")
        .order("name");
      return data ?? [];
    },
  });

  const { data: rules = [], isLoading } = useQuery<WebRule[]>({
    queryKey: ["web-filter-rules"],
    queryFn: async () => {
      const { data } = await supabase
        .from("web_filter_rules")
        .select("id, domain, action, category, notes, enabled, created_at")
        .order("action").order("domain");
      return data ?? [];
    },
  });

  // Push website-rule changes to every Mac right away (fast web-filter-only sync, no full scan).
  async function pushWebFilter() {
    const { data: devices } = await supabase
      .from("devices").select("id").in("os_type", ["mac", "macos", "darwin"]);
    const { data: queued } = await supabase
      .from("device_commands").select("device_id")
      .eq("command_type", "sync_web_filter").eq("status", "pending");
    const busy = new Set((queued ?? []).map((q: { device_id: string }) => q.device_id));
    const targets = (devices ?? []).filter((d: { id: string }) => !busy.has(d.id));
    if (targets.length) {
      await supabase.from("device_commands").insert(
        targets.map((d: { id: string }) => ({ device_id: d.id, command_type: "sync_web_filter", payload: {} })),
      );
    }
  }

  const toggleCategory = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { error } = await supabase
        .from("web_categories")
        .update({ enabled, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["web-categories"] }); pushWebFilter(); },
  });

  const addRule = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("web_filter_rules").insert({
        domain:   newDomain.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0],
        action:   newAction,
        category: "custom",
        notes:    newNotes.trim() || null,
        enabled:  true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["web-filter-rules"] });
      setNewDomain(""); setNewNotes(""); setAdding(false);
      pushWebFilter();
    },
  });

  const deleteRule = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("web_filter_rules").delete().eq("id", id);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["web-filter-rules"] }); pushWebFilter(); },
  });

  const toggleRule = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      await supabase.from("web_filter_rules").update({ enabled }).eq("id", id);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["web-filter-rules"] }); pushWebFilter(); },
  });

  // Turning a Block rule off only removes *your* block; a category (e.g. Gaming) may still
  // list the site. Converting it to Allow overrides categories too.
  const allowInstead = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("web_filter_rules").update({ action: "allow", enabled: true }).eq("id", id);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["web-filter-rules"] }); pushWebFilter(); },
  });

  const enabledCategories = categories.filter(c => c.enabled).length;
  const blockedDomains    = rules.filter(r => r.action === "block" && r.enabled).length;
  const allowedDomains    = rules.filter(r => r.action === "allow" && r.enabled).length;

  return (
    <div style={{ background: "var(--c-bg)", minHeight: "100vh" }}>
      <TopBar title="Web Filter" />
      <div className="p-6 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2" style={{ color: "var(--c-strong)" }}>
              <Globe className="w-5 h-5" style={{ color: "#10b981" }} />
              Web Filter
            </h1>
            <p className="text-sm mt-1" style={{ color: "var(--c-muted)" }}>
              Block websites by category or manage a custom domain whitelist/blacklist
            </p>
          </div>
          <div className="flex gap-2">
            <ScanNowButton />
            {tab === "custom" && (
              <button onClick={() => setAdding(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white"
                style={{ background: "#10b981" }}>
                <Plus className="w-4 h-4" /> Add Domain
              </button>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Active Categories", value: enabledCategories, color: "#ef4444" },
            { label: "Blocked Domains",   value: blockedDomains,    color: "#f97316" },
            { label: "Allowed Domains",   value: allowedDomains,    color: "#10b981" },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-xl p-4 border" style={{ background: "var(--c-surface)", borderColor: "var(--c-border)" }}>
              <p className="text-xs mb-1" style={{ color: "var(--c-muted)" }}>{label}</p>
              <p className="text-2xl font-bold" style={{ color: "var(--c-strong)" }}>{value}</p>
              <div className="mt-1 h-1 rounded-full" style={{ background: color, width: "30%" }} />
            </div>
          ))}
        </div>

        {/* Info banner */}
        <div className="flex items-start gap-3 p-3 rounded-lg border" style={{ borderColor: "#fbbf24", background: "#fefce8" }}>
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: "#d97706" }} />
          <p className="text-xs" style={{ color: "#92400e" }}>
            Category blocklists are downloaded by the agent and applied to <strong>/etc/hosts</strong> (up to 250,000 domains, shared fairly across enabled categories; custom rules always apply). Changes are pushed to every Mac as soon as you save them (usually applied within ~10 seconds; browsers may keep a site open until you reload or reopen the tab). The agent must run as root.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 rounded-lg w-fit" style={{ background: "var(--c-surface)" }}>
          {(["categories", "custom"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className="px-4 py-1.5 rounded-md text-sm font-medium transition-all capitalize"
              style={{
                background: tab === t ? "var(--c-bg)" : "transparent",
                color: tab === t ? "var(--c-strong)" : "var(--c-muted)",
              }}>
              {t === "categories" ? "Categories" : "Custom Domains"}
            </button>
          ))}
        </div>

        {/* Categories Grid */}
        {tab === "categories" && (
          <div className="grid grid-cols-3 gap-4">
            {categories.map(cat => {
              const color = CATEGORY_COLORS[cat.name] ?? "#6b7280";
              const Icon  = CATEGORY_ICONS[cat.name] ?? Globe;
              return (
                <div key={cat.id}
                  className="rounded-xl p-4 border transition-all"
                  style={{
                    background:   "var(--c-surface)",
                    borderColor:  cat.enabled ? color : "var(--c-border)",
                    borderWidth:  cat.enabled ? "2px" : "1px",
                  }}>
                  <div className="flex items-center justify-between mb-2">
                    <Icon className="w-5 h-5" style={{ color }} />
                    <button onClick={() => toggleCategory.mutate({ id: cat.id, enabled: !cat.enabled })}>
                      {cat.enabled
                        ? <ToggleRight className="w-6 h-6" style={{ color }} />
                        : <ToggleLeft  className="w-6 h-6" style={{ color: "var(--c-muted)" }} />}
                    </button>
                  </div>
                  <p className="font-semibold capitalize text-sm" style={{ color: "var(--c-strong)" }}>
                    {cat.name.replace("_", " ")}
                  </p>
                  <p className="text-xs mt-1" style={{ color: "var(--c-muted)" }}>{cat.description}</p>
                  <div className="mt-2">
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium"
                      style={{
                        background: cat.enabled ? `${color}22` : "var(--c-bg)",
                        color:      cat.enabled ? color : "var(--c-muted)",
                      }}>
                      {cat.enabled ? "Blocking" : "Disabled"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Custom Domains */}
        {tab === "custom" && (
          <div className="space-y-4">
            {adding && (
              <div className="rounded-xl p-4 border space-y-3" style={{ background: "var(--c-surface)", borderColor: "#10b981" }}>
                <p className="text-sm font-semibold" style={{ color: "var(--c-strong)" }}>Add Domain Rule</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs mb-1 block" style={{ color: "var(--c-muted)" }}>Domain</label>
                    <input
                      value={newDomain}
                      onChange={e => setNewDomain(e.target.value)}
                      placeholder="e.g. reddit.com or https://reddit.com"
                      className="w-full px-3 py-2 rounded-lg text-sm border"
                      style={{ background: "var(--c-bg)", borderColor: "var(--c-border)", color: "var(--c-fg)" }}
                    />
                  </div>
                  <div>
                    <label className="text-xs mb-1 block" style={{ color: "var(--c-muted)" }}>Action</label>
                    <select
                      value={newAction}
                      onChange={e => setNewAction(e.target.value as "block" | "allow")}
                      className="w-full px-3 py-2 rounded-lg text-sm border"
                      style={{ background: "var(--c-bg)", borderColor: "var(--c-border)", color: "var(--c-fg)" }}>
                      <option value="block">Block</option>
                      <option value="allow">Allow (whitelist)</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="text-xs mb-1 block" style={{ color: "var(--c-muted)" }}>Notes (optional)</label>
                  <input
                    value={newNotes}
                    onChange={e => setNewNotes(e.target.value)}
                    placeholder="Reason for this rule"
                    className="w-full px-3 py-2 rounded-lg text-sm border"
                    style={{ background: "var(--c-bg)", borderColor: "var(--c-border)", color: "var(--c-fg)" }}
                  />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => addRule.mutate()} disabled={!newDomain.trim() || addRule.isPending}
                    className="px-4 py-2 rounded-lg text-sm font-medium text-white"
                    style={{ background: "#10b981", opacity: !newDomain.trim() ? 0.5 : 1 }}>
                    {addRule.isPending ? "Adding…" : "Add Rule"}
                  </button>
                  <button onClick={() => setAdding(false)} className="px-4 py-2 rounded-lg text-sm" style={{ color: "var(--c-muted)" }}>
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <div className="rounded-xl border overflow-hidden" style={{ borderColor: "var(--c-border)" }}>
              {isLoading ? (
                <div className="p-8 text-center text-sm" style={{ color: "var(--c-muted)" }}>Loading…</div>
              ) : rules.length === 0 ? (
                <div className="p-8 text-center text-sm" style={{ color: "var(--c-muted)" }}>
                  No custom domain rules. Add a domain to block or whitelist it.
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead style={{ background: "var(--c-surface)" }}>
                    <tr>
                      {["Domain", "Action", "Notes", "Status", ""].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold" style={{ color: "var(--c-muted)" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rules.map(rule => (
                      <tr key={rule.id} style={{ borderTop: "1px solid var(--c-border)", opacity: rule.enabled ? 1 : 0.5 }}>
                        <td className="px-4 py-3 font-mono text-xs" style={{ color: "var(--c-strong)" }}>{rule.domain}</td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium"
                            style={{
                              background: rule.action === "block" ? "#fee2e2" : "#dcfce7",
                              color:      rule.action === "block" ? "#ef4444" : "#16a34a",
                            }}>
                            {rule.action === "block" ? "Block" : "Allow"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs" style={{ color: "var(--c-muted)" }}>{rule.notes ?? "—"}</td>
                        <td className="px-4 py-3">
                          <button onClick={() => toggleRule.mutate({ id: rule.id, enabled: !rule.enabled })}>
                            {rule.enabled
                              ? <ToggleRight className="w-5 h-5" style={{ color: "#10b981" }} />
                              : <ToggleLeft  className="w-5 h-5" style={{ color: "var(--c-muted)" }} />}
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2 justify-end">
                            {rule.action === "block" && (
                              <button onClick={() => allowInstead.mutate(rule.id)}
                                title="Unblock this site even if a category (e.g. Gaming) lists it"
                                className="text-xs px-2 py-1 rounded whitespace-nowrap"
                                style={{ color: "#16a34a", background: "var(--c-surface)" }}>
                                Allow instead
                              </button>
                            )}
                            <button onClick={() => deleteRule.mutate(rule.id)} className="p-1 rounded" style={{ color: "#ef4444" }}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <p className="text-xs mt-2" style={{ color: "var(--c-muted)" }}>
              Turning a <b>Block</b> rule off removes only your own block — if an enabled category
              (such as Gaming) also lists the site, it stays blocked. To unblock it everywhere, use
              <b> Allow instead</b> or add the domain as <b>Allow</b>.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
