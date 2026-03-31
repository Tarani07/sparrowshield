import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Save, Send, Check, Loader2, Slack, Zap, ShieldAlert, Package, Trash2, Plus, X } from "lucide-react";
import TopBar from "../components/layout/TopBar";
import { supabase } from "../lib/supabase";
import { cn } from "../lib/utils";
import { timeAgo } from "../lib/utils";
import {
  useRemediationRules,
  useCreateRule,
  useUpdateRule,
  useDeleteRule,
  useRemediationLog,
} from "../hooks/useRemediation";
import {
  useSoftwareLists,
  useAddSoftwareList,
  useDeleteSoftwareList,
  useSoftwareViolations,
  useSoftwareCatalog,
  useAddCatalogEntry,
  useDeleteCatalogEntry,
} from "../hooks/useSoftwareLists";

/* ─── Types ─── */
interface NotificationToggles {
  slack_webhook_url: string;
  slack_notify_new_app: boolean;
  slack_notify_system_critical: boolean;
  slack_notify_security_alert: boolean;
  slack_notify_device_offline: boolean;
  slack_notify_disk_health: boolean;
}

const TOGGLE_KEYS: {
  key: keyof NotificationToggles;
  label: string;
  description: string;
}[] = [
  {
    key: "slack_notify_new_app",
    label: "New App Installed",
    description: "Notify when a new application is installed on any device",
  },
  {
    key: "slack_notify_system_critical",
    label: "System Critical",
    description: "CPU > 90%, RAM > 90%, Disk > 90%, or Battery < 10%",
  },
  {
    key: "slack_notify_security_alert",
    label: "Security Alerts",
    description: "FileVault, Firewall, or SIP disabled; new USB storage detected",
  },
  {
    key: "slack_notify_device_offline",
    label: "Device Offline",
    description: "Device has not reported in for more than 15 minutes",
  },
  {
    key: "slack_notify_disk_health",
    label: "Disk Health Warnings",
    description: "S.M.A.R.T. disk health returns non-Verified status",
  },
];

const TABS = [
  { key: "slack", label: "Slack Notifications", icon: Slack },
  { key: "remediation", label: "Auto-Remediation", icon: Zap },
  { key: "software-lists", label: "Software Lists", icon: ShieldAlert },
  { key: "software-catalog", label: "Software Catalog", icon: Package },
] as const;

/* ─── Fetch settings ─── */
async function fetchSettings(): Promise<NotificationToggles> {
  const keys = [
    "slack_webhook_url",
    "slack_notify_new_app",
    "slack_notify_system_critical",
    "slack_notify_security_alert",
    "slack_notify_device_offline",
    "slack_notify_disk_health",
  ];

  const { data, error } = await supabase
    .from("config")
    .select("key, value")
    .in("key", keys);

  if (error) throw error;

  const result: Record<string, unknown> = {};
  for (const row of data ?? []) {
    result[row.key] = row.value;
  }

  return {
    slack_webhook_url: (result.slack_webhook_url as string) ?? "",
    slack_notify_new_app: result.slack_notify_new_app !== false,
    slack_notify_system_critical: result.slack_notify_system_critical !== false,
    slack_notify_security_alert: result.slack_notify_security_alert !== false,
    slack_notify_device_offline: result.slack_notify_device_offline !== false,
    slack_notify_disk_health: result.slack_notify_disk_health !== false,
  };
}

/* ─── Main Component ─── */
export default function Settings() {
  const [activeTab, setActiveTab] = useState<string>("slack");

  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useQuery({
    queryKey: ["slack-settings"],
    queryFn: fetchSettings,
  });

  const [webhookUrl, setWebhookUrl] = useState("");
  const [toggles, setToggles] = useState<Record<string, boolean>>({
    slack_notify_new_app: true,
    slack_notify_system_critical: true,
    slack_notify_security_alert: true,
    slack_notify_device_offline: true,
    slack_notify_disk_health: true,
  });
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [testStatus, setTestStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  useEffect(() => {
    if (settings) {
      setWebhookUrl(
        settings.slack_webhook_url === '""' ? "" : settings.slack_webhook_url
      );
      setToggles({
        slack_notify_new_app: settings.slack_notify_new_app,
        slack_notify_system_critical: settings.slack_notify_system_critical,
        slack_notify_security_alert: settings.slack_notify_security_alert,
        slack_notify_device_offline: settings.slack_notify_device_offline,
        slack_notify_disk_health: settings.slack_notify_disk_health,
      });
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const updates = [
        { key: "slack_webhook_url", value: webhookUrl },
        ...Object.entries(toggles).map(([key, value]) => ({ key, value })),
      ];

      for (const { key, value } of updates) {
        const { error } = await supabase
          .from("config")
          .upsert({ key, value }, { onConflict: "key" });
        if (error) throw error;
      }
    },
    onMutate: () => setSaveStatus("saving"),
    onSuccess: () => {
      setSaveStatus("saved");
      queryClient.invalidateQueries({ queryKey: ["slack-settings"] });
      setTimeout(() => setSaveStatus("idle"), 2000);
    },
    onError: () => setSaveStatus("idle"),
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("slack-notify", {
        body: {
          event_type: "system_critical",
          title: "Test Notification",
          message: "This is a test notification from Sparrow IT Admin. If you see this, Slack notifications are working correctly!",
          severity: "info",
          fields: [
            { title: "Source", value: "Settings Page" },
            { title: "Status", value: "Test" },
          ],
        },
      });
      if (error) throw error;
      return data;
    },
    onMutate: () => setTestStatus("sending"),
    onSuccess: () => {
      setTestStatus("sent");
      setTimeout(() => setTestStatus("idle"), 3000);
    },
    onError: () => {
      setTestStatus("error");
      setTimeout(() => setTestStatus("idle"), 3000);
    },
  });

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <TopBar title="Settings" />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-6 h-6 text-slate-500 animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <TopBar title="Settings" />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Tab selector */}
        <div className="flex items-center gap-2 flex-wrap">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border",
                  activeTab === t.key
                    ? "bg-indigo-600/20 text-indigo-400 border-indigo-600/30"
                    : "bg-slate-800/50 text-slate-400 border-slate-700 hover:text-slate-200 hover:bg-slate-800"
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>

        {/* ─── Tab: Slack Notifications ─── */}
        {activeTab === "slack" && (
          <>
            <div>
              <h1 className="text-lg font-bold text-white">Slack Notifications</h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Configure Slack webhook and notification preferences for fleet monitoring alerts.
              </p>
            </div>

            {/* Webhook URL */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-purple-600/20 flex items-center justify-center">
                  <Slack className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-white">Slack Webhook URL</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Create an{" "}
                    <a
                      href="https://api.slack.com/messaging/webhooks"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-400 hover:text-indigo-300 underline"
                    >
                      Incoming Webhook
                    </a>{" "}
                    in your Slack workspace and paste the URL below.
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <input
                  type="url"
                  value={webhookUrl}
                  onChange={(e) => setWebhookUrl(e.target.value)}
                  placeholder="https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX"
                  className="flex-1 px-4 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all"
                />
                <button
                  onClick={() => testMutation.mutate()}
                  disabled={!webhookUrl || testStatus === "sending"}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs font-medium border transition-all disabled:opacity-40 disabled:cursor-not-allowed",
                    testStatus === "sent"
                      ? "bg-green-500/10 text-green-400 border-green-500/30"
                      : testStatus === "error"
                      ? "bg-red-500/10 text-red-400 border-red-500/30"
                      : "bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700 hover:text-white"
                  )}
                >
                  {testStatus === "sending" ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : testStatus === "sent" ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )}
                  {testStatus === "sending"
                    ? "Sending..."
                    : testStatus === "sent"
                    ? "Sent!"
                    : testStatus === "error"
                    ? "Failed"
                    : "Test"}
                </button>
              </div>
            </div>

            {/* Notification toggles */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-800">
                <h2 className="text-sm font-semibold text-white">Notification Types</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Choose which events trigger Slack notifications.
                </p>
              </div>

              {TOGGLE_KEYS.map(({ key, label, description }, i) => (
                <div
                  key={key}
                  className={cn(
                    "flex items-center justify-between px-5 py-4",
                    i < TOGGLE_KEYS.length - 1 && "border-b border-slate-800/50"
                  )}
                >
                  <div className="flex-1 min-w-0 pr-4">
                    <p className="text-sm font-medium text-slate-200">{label}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{description}</p>
                  </div>

                  <button
                    onClick={() =>
                      setToggles((prev) => ({ ...prev, [key]: !prev[key] }))
                    }
                    className={cn(
                      "relative inline-flex h-6 w-11 items-center rounded-full transition-colors flex-shrink-0",
                      toggles[key] ? "bg-indigo-600" : "bg-slate-700"
                    )}
                  >
                    <span
                      className={cn(
                        "inline-block h-4 w-4 rounded-full bg-white transition-transform",
                        toggles[key] ? "translate-x-6" : "translate-x-1"
                      )}
                    />
                  </button>
                </div>
              ))}
            </div>

            {/* Save button */}
            <div className="flex justify-end">
              <button
                onClick={() => saveMutation.mutate()}
                disabled={saveStatus === "saving"}
                className={cn(
                  "flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all",
                  saveStatus === "saved"
                    ? "bg-green-600 text-white"
                    : "bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-60"
                )}
              >
                {saveStatus === "saving" ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : saveStatus === "saved" ? (
                  <Check className="w-4 h-4" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                {saveStatus === "saving"
                  ? "Saving..."
                  : saveStatus === "saved"
                  ? "Saved!"
                  : "Save Settings"}
              </button>
            </div>
          </>
        )}

        {/* ─── Tab: Auto-Remediation ─── */}
        {activeTab === "remediation" && <RemediationTab />}

        {/* ─── Tab: Software Lists ─── */}
        {activeTab === "software-lists" && <SoftwareListsTab />}

        {/* ─── Tab: Software Catalog ─── */}
        {activeTab === "software-catalog" && <SoftwareCatalogTab />}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Tab 2: Auto-Remediation
   ═══════════════════════════════════════════════════════════ */

const METRICS = ["cpu_pct", "ram_pct", "disk_pct", "battery_pct", "memory_pressure", "thermal_state"];
const OPERATORS = ["gt", "gte", "lt", "lte", "eq"];
const OPERATOR_LABELS: Record<string, string> = { gt: ">", gte: ">=", lt: "<", lte: "<=", eq: "=" };
const ACTIONS = ["optimize_memory", "clear_cache", "restart_ui", "kill_background_services"];

function RemediationTab() {
  const { data: rules = [], isLoading } = useRemediationRules();
  const createRule = useCreateRule();
  const updateRule = useUpdateRule();
  const deleteRule = useDeleteRule();
  const { data: logEntries = [] } = useRemediationLog();

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: "",
    metric: "cpu_pct",
    operator: "gt",
    threshold: 90,
    consecutive_beats: 3,
    action_type: "optimize_memory",
    cooldown_minutes: 30,
  });

  const resetForm = () => {
    setForm({ name: "", metric: "cpu_pct", operator: "gt", threshold: 90, consecutive_beats: 3, action_type: "optimize_memory", cooldown_minutes: 30 });
    setShowForm(false);
  };

  const handleSave = () => {
    if (!form.name.trim()) return;
    createRule.mutate({
      name: form.name,
      metric: form.metric,
      operator: form.operator,
      threshold: form.threshold,
      consecutive_beats: form.consecutive_beats,
      action_type: form.action_type,
      cooldown_minutes: form.cooldown_minutes,
      enabled: true,
      scope: "all",
      scope_value: null,
      action_payload: {},
    }, { onSuccess: resetForm });
  };

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-white">Auto-Remediation Rules</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Define rules that automatically trigger actions when device metrics exceed thresholds.
          </p>
        </div>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-500 transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Rule
          </button>
        )}
      </div>

      {/* Inline form */}
      {showForm && (
        <div className="bg-slate-900 border border-indigo-500/30 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">New Rule</h3>
            <button onClick={resetForm} className="text-slate-500 hover:text-slate-300">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="col-span-2">
              <label className="text-[11px] text-slate-500 font-medium mb-1 block">Name</label>
              <input
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="e.g. High CPU Auto-Optimize"
                className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              />
            </div>
            <div>
              <label className="text-[11px] text-slate-500 font-medium mb-1 block">Metric</label>
              <select
                value={form.metric}
                onChange={(e) => setForm((p) => ({ ...p, metric: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              >
                {METRICS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] text-slate-500 font-medium mb-1 block">Operator</label>
              <select
                value={form.operator}
                onChange={(e) => setForm((p) => ({ ...p, operator: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              >
                {OPERATORS.map((o) => <option key={o} value={o}>{OPERATOR_LABELS[o]} ({o})</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] text-slate-500 font-medium mb-1 block">Threshold</label>
              <input
                type="number"
                value={form.threshold}
                onChange={(e) => setForm((p) => ({ ...p, threshold: Number(e.target.value) }))}
                className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              />
            </div>
            <div>
              <label className="text-[11px] text-slate-500 font-medium mb-1 block">Consecutive Beats</label>
              <input
                type="number"
                value={form.consecutive_beats}
                onChange={(e) => setForm((p) => ({ ...p, consecutive_beats: Number(e.target.value) }))}
                className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              />
            </div>
            <div>
              <label className="text-[11px] text-slate-500 font-medium mb-1 block">Action Type</label>
              <select
                value={form.action_type}
                onChange={(e) => setForm((p) => ({ ...p, action_type: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              >
                {ACTIONS.map((a) => <option key={a} value={a}>{a.replace(/_/g, " ")}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] text-slate-500 font-medium mb-1 block">Cooldown (min)</label>
              <input
                type="number"
                value={form.cooldown_minutes}
                onChange={(e) => setForm((p) => ({ ...p, cooldown_minutes: Number(e.target.value) }))}
                className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={resetForm} className="px-4 py-2 rounded-lg text-xs font-medium text-slate-400 border border-slate-700 hover:bg-slate-800 transition-all">
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!form.name.trim() || createRule.isPending}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-500 transition-all disabled:opacity-60"
            >
              {createRule.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Save
            </button>
          </div>
        </div>
      )}

      {/* Rules table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800">
          <h2 className="text-sm font-semibold text-white">Active Rules</h2>
        </div>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 text-slate-500 animate-spin" />
          </div>
        ) : rules.length === 0 ? (
          <div className="px-5 py-8 text-center text-xs text-slate-500">No remediation rules configured yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-500">
                  <th className="text-left px-5 py-3 font-medium">Name</th>
                  <th className="text-left px-5 py-3 font-medium">Metric</th>
                  <th className="text-left px-5 py-3 font-medium">Condition</th>
                  <th className="text-center px-5 py-3 font-medium">Beats</th>
                  <th className="text-left px-5 py-3 font-medium">Action</th>
                  <th className="text-center px-5 py-3 font-medium">Cooldown</th>
                  <th className="text-center px-5 py-3 font-medium">Enabled</th>
                  <th className="text-center px-5 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => (
                  <tr key={rule.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                    <td className="px-5 py-3 text-slate-200 font-medium">{rule.name}</td>
                    <td className="px-5 py-3 text-slate-400 font-mono">{rule.metric}</td>
                    <td className="px-5 py-3 text-slate-400">
                      <span className="font-mono">{OPERATOR_LABELS[rule.operator] ?? rule.operator} {rule.threshold}</span>
                    </td>
                    <td className="px-5 py-3 text-center text-slate-400">{rule.consecutive_beats}</td>
                    <td className="px-5 py-3 text-slate-400">{rule.action_type.replace(/_/g, " ")}</td>
                    <td className="px-5 py-3 text-center text-slate-400">{rule.cooldown_minutes}m</td>
                    <td className="px-5 py-3 text-center">
                      <button
                        onClick={() => updateRule.mutate({ id: rule.id, enabled: !rule.enabled })}
                        className={cn(
                          "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
                          rule.enabled ? "bg-indigo-600" : "bg-slate-700"
                        )}
                      >
                        <span className={cn("inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform", rule.enabled ? "translate-x-4.5" : "translate-x-0.5")} />
                      </button>
                    </td>
                    <td className="px-5 py-3 text-center">
                      <button
                        onClick={() => deleteRule.mutate(rule.id)}
                        className="text-slate-600 hover:text-red-400 transition-colors"
                      >
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

      {/* Remediation log */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800">
          <h2 className="text-sm font-semibold text-white">Recent Remediation Log</h2>
          <p className="text-xs text-slate-500 mt-0.5">Last 10 triggered actions.</p>
        </div>
        {logEntries.length === 0 ? (
          <div className="px-5 py-8 text-center text-xs text-slate-500">No remediation actions triggered yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-500">
                  <th className="text-left px-5 py-3 font-medium">Rule</th>
                  <th className="text-left px-5 py-3 font-medium">Device</th>
                  <th className="text-left px-5 py-3 font-medium">Action</th>
                  <th className="text-center px-5 py-3 font-medium">Value</th>
                  <th className="text-left px-5 py-3 font-medium">Status</th>
                  <th className="text-left px-5 py-3 font-medium">Triggered</th>
                </tr>
              </thead>
              <tbody>
                {logEntries.slice(0, 10).map((entry) => (
                  <tr key={entry.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                    <td className="px-5 py-3 text-slate-200 font-medium">{entry.remediation_rules?.name ?? entry.rule_id.slice(0, 8)}</td>
                    <td className="px-5 py-3 text-slate-400">{entry.devices?.hostname ?? entry.device_id.slice(0, 8)}</td>
                    <td className="px-5 py-3 text-slate-400">{entry.action_type.replace(/_/g, " ")}</td>
                    <td className="px-5 py-3 text-center text-slate-400 font-mono">{entry.metric_value}</td>
                    <td className="px-5 py-3">
                      <span className={cn(
                        "px-2 py-0.5 rounded-full text-[10px] font-semibold border",
                        entry.status === "success" ? "bg-green-500/10 text-green-400 border-green-500/30" :
                        entry.status === "failed" ? "bg-red-500/10 text-red-400 border-red-500/30" :
                        "bg-amber-500/10 text-amber-400 border-amber-500/30"
                      )}>
                        {entry.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-slate-500">{timeAgo(entry.triggered_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════
   Tab 3: Software Lists
   ═══════════════════════════════════════════════════════════ */

function SoftwareListsTab() {
  const [subTab, setSubTab] = useState<"blocklist" | "allowlist">("blocklist");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ app_name: "", reason: "" });

  const { data: entries = [], isLoading } = useSoftwareLists(subTab);
  const addEntry = useAddSoftwareList();
  const deleteEntry = useDeleteSoftwareList();
  const { data: violations = [] } = useSoftwareViolations();

  const resetForm = () => {
    setForm({ app_name: "", reason: "" });
    setShowForm(false);
  };

  const handleSave = () => {
    if (!form.app_name.trim()) return;
    addEntry.mutate({
      list_type: subTab,
      app_name: form.app_name,
      reason: form.reason || null,
      added_by: "admin",
    }, { onSuccess: resetForm });
  };

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-white">Software Lists</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage blocked and allowed applications across your fleet.
          </p>
        </div>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-500 transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            Add App
          </button>
        )}
      </div>

      {/* Sub-tabs */}
      <div className="flex items-center gap-2">
        {(["blocklist", "allowlist"] as const).map((t) => (
          <button
            key={t}
            onClick={() => { setSubTab(t); setShowForm(false); }}
            className={cn(
              "px-3 py-1.5 rounded-lg text-xs font-medium transition-all border",
              subTab === t
                ? t === "blocklist"
                  ? "bg-red-500/20 text-red-400 border-red-500/30"
                  : "bg-green-500/20 text-green-400 border-green-500/30"
                : "bg-slate-800/50 text-slate-400 border-slate-700 hover:text-slate-200 hover:bg-slate-800"
            )}
          >
            {t === "blocklist" ? "Blocklist" : "Allowlist"}
          </button>
        ))}
      </div>

      {/* Inline form */}
      {showForm && (
        <div className="bg-slate-900 border border-indigo-500/30 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Add to {subTab === "blocklist" ? "Blocklist" : "Allowlist"}</h3>
            <button onClick={resetForm} className="text-slate-500 hover:text-slate-300">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-slate-500 font-medium mb-1 block">App Name</label>
              <input
                value={form.app_name}
                onChange={(e) => setForm((p) => ({ ...p, app_name: e.target.value }))}
                placeholder="e.g. Spotify"
                className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              />
            </div>
            <div>
              <label className="text-[11px] text-slate-500 font-medium mb-1 block">Reason</label>
              <input
                value={form.reason}
                onChange={(e) => setForm((p) => ({ ...p, reason: e.target.value }))}
                placeholder="e.g. Not approved for corporate use"
                className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={resetForm} className="px-4 py-2 rounded-lg text-xs font-medium text-slate-400 border border-slate-700 hover:bg-slate-800 transition-all">
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!form.app_name.trim() || addEntry.isPending}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-500 transition-all disabled:opacity-60"
            >
              {addEntry.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Save
            </button>
          </div>
        </div>
      )}

      {/* Entries table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800">
          <h2 className="text-sm font-semibold text-white">{subTab === "blocklist" ? "Blocked" : "Allowed"} Applications</h2>
        </div>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 text-slate-500 animate-spin" />
          </div>
        ) : entries.length === 0 ? (
          <div className="px-5 py-8 text-center text-xs text-slate-500">
            No entries in the {subTab} yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-500">
                  <th className="text-left px-5 py-3 font-medium">App Name</th>
                  <th className="text-left px-5 py-3 font-medium">Reason</th>
                  <th className="text-left px-5 py-3 font-medium">Added By</th>
                  <th className="text-left px-5 py-3 font-medium">Date</th>
                  <th className="text-center px-5 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                    <td className="px-5 py-3 text-slate-200 font-medium">{e.app_name}</td>
                    <td className="px-5 py-3 text-slate-400">{e.reason ?? "—"}</td>
                    <td className="px-5 py-3 text-slate-400">{e.added_by ?? "—"}</td>
                    <td className="px-5 py-3 text-slate-500">{timeAgo(e.created_at)}</td>
                    <td className="px-5 py-3 text-center">
                      <button
                        onClick={() => deleteEntry.mutate(e.id)}
                        className="text-slate-600 hover:text-red-400 transition-colors"
                      >
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

      {/* Active violations */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800">
          <h2 className="text-sm font-semibold text-white">Active Violations</h2>
          <p className="text-xs text-slate-500 mt-0.5">Devices running software that violates your lists.</p>
        </div>
        {violations.length === 0 ? (
          <div className="px-5 py-8 text-center text-xs text-slate-500">No active violations detected.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-500">
                  <th className="text-left px-5 py-3 font-medium">Device</th>
                  <th className="text-left px-5 py-3 font-medium">App</th>
                  <th className="text-left px-5 py-3 font-medium">Violation Type</th>
                  <th className="text-left px-5 py-3 font-medium">Detected</th>
                </tr>
              </thead>
              <tbody>
                {violations.map((v) => (
                  <tr key={v.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                    <td className="px-5 py-3 text-slate-200 font-medium">{v.devices?.hostname ?? v.device_id.slice(0, 8)}</td>
                    <td className="px-5 py-3 text-slate-400">{v.app_name}</td>
                    <td className="px-5 py-3">
                      <span className={cn(
                        "px-2 py-0.5 rounded-full text-[10px] font-semibold border",
                        v.violation_type === "blocklist" ? "bg-red-500/10 text-red-400 border-red-500/30" : "bg-amber-500/10 text-amber-400 border-amber-500/30"
                      )}>
                        {v.violation_type}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-slate-500">{timeAgo(v.detected_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════
   Tab 4: Software Catalog
   ═══════════════════════════════════════════════════════════ */

function SoftwareCatalogTab() {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", category: "", install_method: "brew", platform: "mac" });

  const { data: catalog = [], isLoading } = useSoftwareCatalog();
  const addEntry = useAddCatalogEntry();
  const deleteEntry = useDeleteCatalogEntry();

  const INSTALL_METHODS = ["brew", "winget", "choco", "dmg_url", "pkg_url"];
  const PLATFORMS = ["mac", "windows", "both"];

  const resetForm = () => {
    setForm({ name: "", category: "", install_method: "brew", platform: "mac" });
    setShowForm(false);
  };

  const handleSave = () => {
    if (!form.name.trim()) return;
    addEntry.mutate({
      name: form.name,
      category: form.category || "general",
      install_method: form.install_method,
      platform: form.platform,
    }, { onSuccess: resetForm });
  };

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-white">Software Catalog</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Maintain a catalog of approved software with installation methods.
          </p>
        </div>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-500 transition-all"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Software
          </button>
        )}
      </div>

      {/* Inline form */}
      {showForm && (
        <div className="bg-slate-900 border border-indigo-500/30 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white">Add Catalog Entry</h3>
            <button onClick={resetForm} className="text-slate-500 hover:text-slate-300">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="text-[11px] text-slate-500 font-medium mb-1 block">Name</label>
              <input
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder="e.g. Visual Studio Code"
                className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              />
            </div>
            <div>
              <label className="text-[11px] text-slate-500 font-medium mb-1 block">Category</label>
              <input
                value={form.category}
                onChange={(e) => setForm((p) => ({ ...p, category: e.target.value }))}
                placeholder="e.g. development"
                className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              />
            </div>
            <div>
              <label className="text-[11px] text-slate-500 font-medium mb-1 block">Install Method</label>
              <select
                value={form.install_method}
                onChange={(e) => setForm((p) => ({ ...p, install_method: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              >
                {INSTALL_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[11px] text-slate-500 font-medium mb-1 block">Platform</label>
              <select
                value={form.platform}
                onChange={(e) => setForm((p) => ({ ...p, platform: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              >
                {PLATFORMS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={resetForm} className="px-4 py-2 rounded-lg text-xs font-medium text-slate-400 border border-slate-700 hover:bg-slate-800 transition-all">
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!form.name.trim() || addEntry.isPending}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-500 transition-all disabled:opacity-60"
            >
              {addEntry.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Save
            </button>
          </div>
        </div>
      )}

      {/* Catalog table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800">
          <h2 className="text-sm font-semibold text-white">Catalog Entries</h2>
          <p className="text-xs text-slate-500 mt-0.5">{catalog.length} software package{catalog.length !== 1 ? "s" : ""} registered.</p>
        </div>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 text-slate-500 animate-spin" />
          </div>
        ) : catalog.length === 0 ? (
          <div className="px-5 py-8 text-center text-xs text-slate-500">No software catalog entries yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-500">
                  <th className="text-left px-5 py-3 font-medium">Name</th>
                  <th className="text-left px-5 py-3 font-medium">Category</th>
                  <th className="text-left px-5 py-3 font-medium">Install Method</th>
                  <th className="text-left px-5 py-3 font-medium">Platform</th>
                  <th className="text-center px-5 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {catalog.map((entry) => (
                  <tr key={entry.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                    <td className="px-5 py-3 text-slate-200 font-medium">{entry.name}</td>
                    <td className="px-5 py-3">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/30">
                        {entry.category}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-slate-400 font-mono">{entry.install_method}</td>
                    <td className="px-5 py-3">
                      <span className={cn(
                        "px-2 py-0.5 rounded-full text-[10px] font-semibold border",
                        entry.platform === "mac" ? "bg-slate-500/10 text-slate-300 border-slate-500/30" :
                        entry.platform === "windows" ? "bg-blue-500/10 text-blue-400 border-blue-500/30" :
                        "bg-purple-500/10 text-purple-400 border-purple-500/30"
                      )}>
                        {entry.platform}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-center">
                      <button
                        onClick={() => deleteEntry.mutate(entry.id)}
                        className="text-slate-600 hover:text-red-400 transition-colors"
                      >
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
    </>
  );
}
