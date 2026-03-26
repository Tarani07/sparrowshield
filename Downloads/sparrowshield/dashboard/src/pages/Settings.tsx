import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Save, Send, Check, Loader2, Slack } from "lucide-react";
import TopBar from "../components/layout/TopBar";
import { supabase } from "../lib/supabase";
import { cn } from "../lib/utils";

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

export default function Settings() {
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
        {/* Page header */}
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

              {/* Toggle switch */}
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
      </div>
    </div>
  );
}
