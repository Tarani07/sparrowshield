import { useState, type ElementType } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Globe, Plus, Trash2, Bug, Fish, Lock, Cpu, EyeOff, Dices, Gamepad2, MessageCircle, Eye, Ban, CheckCircle2, Layers, Unlock } from "lucide-react";
import { supabase } from "../lib/supabase";
import { timeAgo } from "../lib/utils";
import TopBar from "../components/layout/TopBar";
import { useAuth } from "../lib/AuthContext";
import ScanNowButton from "../components/ScanNowButton";
import { Page, PageHeader, Panel, StatTile, DataTable, Badge, Button, Drawer, Tabs, inputClass, type Column, type FilterDef } from "../components/ui";

interface WebRule { id: string; domain: string; action: "block" | "allow"; category: string; notes: string | null; enabled: boolean; created_at: string }
interface Category { id: string; name: string; description: string; enabled: boolean }

const CATEGORY_META: Record<string, { icon: ElementType; label: string; group: "Security" | "Content" }> = {
  malware:       { icon: Bug,           label: "Malware & C2",   group: "Security" },
  phishing:      { icon: Fish,          label: "Phishing",       group: "Security" },
  ransomware:    { icon: Lock,          label: "Ransomware",     group: "Security" },
  crypto_mining: { icon: Cpu,           label: "Crypto-mining",  group: "Security" },
  adult:         { icon: EyeOff,        label: "Adult content",  group: "Content" },
  gambling:      { icon: Dices,         label: "Gambling",       group: "Content" },
  gaming:        { icon: Gamepad2,      label: "Gaming",         group: "Content" },
  social:        { icon: MessageCircle, label: "Social media",   group: "Content" },
  tracking:      { icon: Eye,           label: "Ads & tracking", group: "Content" },
};

function Switch({ on, onChange, disabled, label }: { on: boolean; onChange: () => void; disabled?: boolean; label: string }) {
  const { isAdmin } = useAuth();
  disabled = disabled || !isAdmin;
  return (
    <button role="switch" aria-checked={on} aria-label={label} onClick={onChange} disabled={disabled}
      className="relative w-9 h-5 rounded-full transition-colors shrink-0 disabled:opacity-50"
      style={{ background: on ? "var(--c-accent)" : "var(--c-border2)" }}>
      <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all shadow" style={{ left: on ? 18 : 2 }} />
    </button>
  );
}

export default function WebFilter() {
  const qc = useQueryClient();
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState<"categories" | "custom">("categories");
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ domain: "", action: "block" as "block" | "allow", notes: "" });
  const [pushed, setPushed] = useState<string | null>(null);

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ["web-categories"],
    queryFn: async () => (await supabase.from("web_categories").select("id, name, description, enabled").order("name")).data ?? [],
  });
  const { data: rules = [], isLoading } = useQuery<WebRule[]>({
    queryKey: ["web-filter-rules"],
    queryFn: async () => (await supabase.from("web_filter_rules")
      .select("id, domain, action, category, notes, enabled, created_at").order("domain")).data as WebRule[] ?? [],
  });

  // Push website-rule changes to every Mac right away (fast web-filter-only sync, no full scan).
  async function pushWebFilter() {
    const { data: devices } = await supabase.from("devices").select("id").in("os_type", ["mac", "macos", "darwin"]);
    const { data: queued } = await supabase.from("device_commands").select("device_id")
      .eq("command_type", "sync_web_filter").eq("status", "pending");
    const busy = new Set((queued ?? []).map((q: { device_id: string }) => q.device_id));
    const targets = (devices ?? []).filter((d: { id: string }) => !busy.has(d.id));
    if (targets.length) {
      await supabase.from("device_commands").insert(targets.map((d: { id: string }) => ({ device_id: d.id, command_type: "sync_web_filter", payload: {} })));
    }
    setPushed(`Change sent to ${devices?.length ?? 0} Mac${devices?.length === 1 ? "" : "s"} — applied within ~10 seconds.`);
    setTimeout(() => setPushed(null), 6000);
  }

  const toggleCategory = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const { error } = await supabase.from("web_categories").update({ enabled, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["web-categories"] }); pushWebFilter(); },
  });
  const addRule = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("web_filter_rules").insert({
        domain: form.domain.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0],
        action: form.action, category: "custom", notes: form.notes.trim() || null, enabled: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["web-filter-rules"] });
      setForm({ domain: "", action: "block", notes: "" }); setAdding(false); setTab("custom");
      pushWebFilter();
    },
  });
  const updateRule = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<WebRule> }) => {
      const { error } = await supabase.from("web_filter_rules").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["web-filter-rules"] }); pushWebFilter(); },
  });
  const deleteRule = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("web_filter_rules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["web-filter-rules"] }); pushWebFilter(); },
  });

  const enabledCategories = categories.filter(c => c.enabled).length;
  const blockedDomains = rules.filter(r => r.action === "block" && r.enabled).length;
  const allowedDomains = rules.filter(r => r.action === "allow" && r.enabled).length;

  const columns: Column<WebRule>[] = [
    { key: "domain", header: "Domain", render: r => <span className="font-mono text-[12.5px]" style={{ color: "var(--c-strong)" }}>{r.domain}</span> },
    { key: "action", header: "Action", value: r => r.action,
      render: r => <Badge tone={r.action === "block" ? "critical" : "ok"}>{r.action === "block" ? "Block" : "Allow"}</Badge> },
    { key: "notes", header: "Notes", hideBelow: "md", value: r => r.notes ?? "",
      render: r => <span style={{ color: r.notes ? "var(--c-text)" : "var(--c-muted)" }}>{r.notes ?? "—"}</span> },
    { key: "created_at", header: "Added", hideBelow: "lg", render: r => timeAgo(r.created_at) },
    { key: "enabled", header: "Enabled", value: r => (r.enabled ? 1 : 0),
      render: r => <Switch on={r.enabled} label={`Enable ${r.domain}`} onChange={() => updateRule.mutate({ id: r.id, patch: { enabled: !r.enabled } })} /> },
    { key: "actions", header: "", sortable: false, align: "right", width: "170px", render: r => (
      <div className="flex items-center justify-end gap-1.5">
        {r.action === "block" && (
          <Button adminOnly size="sm" icon={Unlock} title="Unblock even if a category (e.g. Gaming) lists this site"
            onClick={() => updateRule.mutate({ id: r.id, patch: { action: "allow", enabled: true } })}>Allow instead</Button>
        )}
        {isAdmin && <button onClick={() => deleteRule.mutate(r.id)} title="Delete rule" className="p-1.5 rounded hover:bg-[var(--c-card2)]" style={{ color: "var(--c-muted)" }}>
          <Trash2 className="w-4 h-4" />
        </button>}
      </div>) },
  ];
  const filters: FilterDef<WebRule>[] = [
    { key: "action", label: "Action", options: [{ value: "block", label: "Block" }, { value: "allow", label: "Allow" }], get: r => r.action },
    { key: "enabled", label: "State", options: [{ value: "on", label: "Enabled" }, { value: "off", label: "Disabled" }], get: r => (r.enabled ? "on" : "off") },
  ];

  const grouped = (["Security", "Content"] as const).map(g => ({
    group: g, items: categories.filter(c => (CATEGORY_META[c.name]?.group ?? "Content") === g),
  }));

  return (
    <div className="flex flex-col min-h-full">
      <TopBar title="Web Filtering" />
      <Page>
        <PageHeader
          title="Web Filtering"
          crumbs={[{ label: "Protection Policies" }, { label: "Web Filtering" }]}
          description="Block whole categories of websites and manage your own allow / block lists. Every change is pushed to all Macs immediately (up to 250,000 domains per device)."
          actions={<><ScanNowButton /><Button variant="primary" icon={Plus} onClick={() => setAdding(true)}>Add domain</Button></>}
        />

        {pushed && (
          <div className="mb-4 rounded-md border px-3 py-2 text-[12.5px] flex items-center gap-2"
            style={{ borderColor: "var(--c-primary-border)", background: "var(--c-primary-bg)", color: "var(--c-strong)" }}>
            <CheckCircle2 className="w-4 h-4" style={{ color: "var(--ok)" }} /> {pushed}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <StatTile label="Categories blocked" icon={Layers} tone="accent" value={<>{enabledCategories}<span className="text-[15px] font-medium" style={{ color: "var(--c-muted)" }}> / {categories.length}</span></>}
            onClick={() => setTab("categories")} active={tab === "categories"} />
          <StatTile label="Blocked domains" icon={Ban} tone="critical" value={blockedDomains} sub="Custom block list" onClick={() => setTab("custom")} />
          <StatTile label="Allowed domains" icon={CheckCircle2} tone="ok" value={allowedDomains} sub="Override categories" onClick={() => setTab("custom")} />
        </div>

        <div className="mb-3">
          <Tabs value={tab} onChange={setTab} tabs={[
            { id: "categories", label: "Categories", count: categories.length },
            { id: "custom", label: "Custom rules", count: rules.length },
          ]} />
        </div>

        {tab === "categories" ? (
          <div className="space-y-4">
            {grouped.map(({ group, items }) => items.length > 0 && (
              <Panel key={group} title={group === "Security" ? "Security threats" : "Content categories"}
                subtitle={group === "Security" ? "Recommended: keep all of these blocked" : "Block by company policy (applies to all devices)"} noPad>
                <ul>
                  {items.map(cat => {
                    const meta = CATEGORY_META[cat.name] ?? { icon: Globe, label: cat.name, group: "Content" };
                    return (
                      <li key={cat.id} className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: "var(--c-divider)" }}>
                        <span className="w-8 h-8 rounded-md flex items-center justify-center border shrink-0"
                          style={{ borderColor: "var(--c-border)", background: "var(--c-card2)", color: cat.enabled ? "var(--sev-critical)" : "var(--c-muted)" }}>
                          <meta.icon className="w-4 h-4" />
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-medium" style={{ color: "var(--c-strong)" }}>{meta.label}</p>
                          <p className="text-[12px] truncate" style={{ color: "var(--c-muted)" }}>{cat.description}</p>
                        </div>
                        <Badge tone={cat.enabled ? "critical" : "neutral"}>{cat.enabled ? "Blocking" : "Allowed"}</Badge>
                        <Switch on={cat.enabled} label={`Block ${meta.label}`} disabled={toggleCategory.isPending}
                          onChange={() => toggleCategory.mutate({ id: cat.id, enabled: !cat.enabled })} />
                      </li>
                    );
                  })}
                </ul>
              </Panel>
            ))}
          </div>
        ) : (
          <>
            <DataTable rows={rules} columns={columns} rowKey={r => r.id} loading={isLoading} filters={filters}
              searchPlaceholder="Search domains or notes…" exportName="web-rules" initialSort={{ key: "domain", dir: "asc" }}
              empty="No custom rules — click Add domain to block or allow a site." />
            <p className="mt-2 text-[12px]" style={{ color: "var(--c-muted)" }}>
              Turning a <b>Block</b> rule off removes only your own block — if an enabled category (such as Gaming) also lists the site,
              it stays blocked. Use <b>Allow instead</b> to unblock it everywhere.
            </p>
          </>
        )}
      </Page>

      <Drawer open={adding} onClose={() => setAdding(false)} title="Add domain rule" width={460}
        footer={<>
          <Button onClick={() => setAdding(false)}>Cancel</Button>
          <Button variant="primary" onClick={() => addRule.mutate()} disabled={!form.domain.trim() || addRule.isPending}>
            {addRule.isPending ? "Adding…" : "Add rule"}
          </Button>
        </>}>
        <div className="space-y-4">
          <label className="block">
            <span className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--c-text)" }}>Domain</span>
            <input autoFocus className={`${inputClass} w-full font-mono`} value={form.domain}
              onChange={e => setForm(f => ({ ...f, domain: e.target.value }))} placeholder="example.com" />
            <span className="block text-[11.5px] mt-1" style={{ color: "var(--c-muted)" }}>Paste a URL or domain; www and subdomains are covered.</span>
          </label>
          <label className="block">
            <span className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--c-text)" }}>Action</span>
            <select className={`${inputClass} w-full`} value={form.action} onChange={e => setForm(f => ({ ...f, action: e.target.value as "block" | "allow" }))}>
              <option value="block">Block — always block this site</option>
              <option value="allow">Allow — never block, even if a category lists it</option>
            </select>
          </label>
          <label className="block">
            <span className="block text-[12px] font-medium mb-1.5" style={{ color: "var(--c-text)" }}>Notes (optional)</span>
            <input className={`${inputClass} w-full`} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="e.g. Approved by IT for marketing" />
          </label>
          {addRule.isError && <p className="text-[12.5px]" style={{ color: "var(--sev-critical)" }}>Could not add: {(addRule.error as Error).message}</p>}
        </div>
      </Drawer>
    </div>
  );
}
