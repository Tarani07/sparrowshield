import { useState, useMemo } from "react";
import { Package, Search, ArrowUpDown, Trash2, Download, Loader2, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { cn } from "../../lib/utils";
import { useDeploySoftware, useDeploymentTasks } from "../../hooks/useSoftwareLists";

interface InstalledApp {
  name: string;
  version: string;
  path?: string;
  last_modified?: string;
}

interface Props {
  apps: InstalledApp[];
  deviceId: string;
  osType?: string;
}

type SortKey = "name" | "version";

/* ── Derive brew cask name from app name ── */
function toBrew(name: string) {
  return name
    .replace(/\.app$/, "")
    .replace(/\s+/g, "-")
    .toLowerCase();
}

/* ── Determine best uninstall method ── */
function getUninstallMethod(appName: string, osType?: string) {
  if (osType === "windows") return "winget";
  // Default to brew for macOS, fallback to app removal
  return "brew";
}

/* ── Protected apps that should NEVER be uninstalled ── */
const PROTECTED_APPS = new Set([
  "Finder",
  "finder",
  "System Preferences",
  "System Settings",
  "Safari",         // system app
  "App Store",
  "Terminal",
  "Utilities",
  "Activity Monitor",
  "Console",
  "Disk Utility",
  "Migration Assistant",
  "Keychain Access",
  "Font Book",
  "TextEdit",
  "Preview",
  "Calculator",
  "Dictionary",
  "Stickies",
  "Photo Booth",
  "Time Machine",
  "Automator",
  "Script Editor",
  "Digital Color Meter",
  "ColorSync Utility",
  "Screenshot",
  "Siri",
  "sparrow-agent",
  "SparrowIT",
]);

function isProtected(appName: string) {
  const clean = appName.replace(/\.app$/, "").trim();
  return PROTECTED_APPS.has(clean);
}

/* ── Critical apps that need extra warning ── */
const CRITICAL_APPS = new Set([
  "Docker",
  "Docker Desktop",
  "Xcode",
  "Visual Studio Code",
  "Slack",
  "Microsoft Teams",
  "Zoom",
  "1Password",
  "LastPass",
  "Bitwarden",
  "CrowdStrike",
  "SentinelOne",
  "Microsoft Outlook",
  "Google Chrome",
  "Firefox",
]);

function isCritical(appName: string) {
  const clean = appName.replace(/\.app$/, "").trim();
  return CRITICAL_APPS.has(clean);
}

export default function InstalledAppsCard({ apps, deviceId, osType }: Props) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortAsc, setSortAsc] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [confirmApp, setConfirmApp] = useState<InstalledApp | null>(null);
  const [selectedApps, setSelectedApps] = useState<Set<string>>(new Set());
  const [bulkConfirm, setBulkConfirm] = useState(false);

  const deploySoftware = useDeploySoftware();
  const { data: deploymentTasks = [] } = useDeploymentTasks(deviceId);

  /* Track which apps have pending/recent uninstall tasks */
  const appDeployStatus = useMemo(() => {
    const map = new Map<string, { status: string; result: string | null }>();
    for (const task of deploymentTasks) {
      if (task.action === "uninstall") {
        const existing = map.get(task.software_name);
        if (!existing || new Date(task.created_at) > new Date()) {
          map.set(task.software_name, { status: task.status, result: task.result });
        }
      }
    }
    return map;
  }, [deploymentTasks]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const list = apps.filter(
      (a) =>
        a.name.toLowerCase().includes(q) ||
        a.version.toLowerCase().includes(q)
    );
    list.sort((a, b) => {
      const av = a[sortKey] ?? "";
      const bv = b[sortKey] ?? "";
      return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
    });
    return list;
  }, [apps, search, sortKey, sortAsc]);

  const displayed = showAll ? filtered : filtered.slice(0, 20);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else {
      setSortKey(key);
      setSortAsc(true);
    }
  };

  const toggleSelect = (appName: string) => {
    setSelectedApps(prev => {
      const next = new Set(prev);
      if (next.has(appName)) next.delete(appName);
      else next.add(appName);
      return next;
    });
  };

  const selectableSelected = useMemo(() => {
    return [...selectedApps].filter(name => !isProtected(name));
  }, [selectedApps]);

  const handleUninstall = (app: InstalledApp) => {
    const method = getUninstallMethod(app.name, osType);
    deploySoftware.mutate({
      deviceId,
      softwareName: app.name.replace(/\.app$/, ""),
      action: "uninstall",
      method,
    });
    setConfirmApp(null);
  };

  const handleBulkUninstall = () => {
    for (const appName of selectableSelected) {
      const method = getUninstallMethod(appName, osType);
      deploySoftware.mutate({
        deviceId,
        softwareName: appName.replace(/\.app$/, ""),
        action: "uninstall",
        method,
      });
    }
    setSelectedApps(new Set());
    setBulkConfirm(false);
  };

  if (!apps || apps.length === 0) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
          <Package className="w-4 h-4 text-indigo-400" />
          Installed Applications
        </h2>
        <p className="text-xs text-slate-600 mt-3 text-center py-4">
          No app inventory yet — agent sends this data hourly
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div>
            <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <Package className="w-4 h-4 text-indigo-400" />
              Installed Applications
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {apps.length} apps found · click <Trash2 className="w-3 h-3 inline text-red-400" /> to uninstall
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Bulk uninstall button */}
            {selectableSelected.length > 0 && (
              <button
                onClick={() => setBulkConfirm(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-medium hover:bg-red-500/20 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Uninstall {selectableSelected.length} selected
              </button>
            )}

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
              <input
                type="text"
                placeholder="Search apps..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-48 pl-8 pr-3 py-1.5 text-xs rounded-lg bg-slate-800 border border-slate-700 text-slate-300 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>
        </div>

        {/* Column headers */}
        <div className="flex items-center px-5 py-2 bg-slate-950/40 border-b border-slate-800 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
          <span className="w-8">#</span>
          <button
            onClick={() => toggleSort("name")}
            className="flex-1 flex items-center gap-1 hover:text-slate-300 transition-colors"
          >
            Application
            {sortKey === "name" && (
              <ArrowUpDown className="w-3 h-3" />
            )}
          </button>
          <button
            onClick={() => toggleSort("version")}
            className="w-28 text-right flex items-center justify-end gap-1 hover:text-slate-300 transition-colors"
          >
            Version
            {sortKey === "version" && (
              <ArrowUpDown className="w-3 h-3" />
            )}
          </button>
          <span className="w-24 text-right">Action</span>
        </div>

        {/* App list */}
        <div className="divide-y divide-slate-800/40 max-h-[500px] overflow-y-auto">
          {displayed.map((app, i) => {
            const cleanName = app.name.replace(/\.app$/, "");
            const status = appDeployStatus.get(cleanName);
            const isPending = status?.status === "pending" || status?.status === "running";
            const isDone = status?.status === "completed" || status?.status === "done";
            const isFailed = status?.status === "failed";
            const protected_ = isProtected(app.name);
            const critical = isCritical(app.name);
            const isSelected = selectedApps.has(app.name);

            return (
              <div
                key={`${app.name}-${i}`}
                className={cn(
                  "flex items-center px-5 py-2.5 hover:bg-slate-800/30 transition-colors group",
                  isSelected && "bg-red-500/5"
                )}
              >
                {/* Checkbox + Rank */}
                <div className="w-8 flex items-center">
                  {protected_ ? (
                    <span className="text-[10px] text-slate-600 font-mono">{i + 1}</span>
                  ) : (
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelect(app.name)}
                      className="w-3.5 h-3.5 rounded border-slate-600 bg-slate-800 text-indigo-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                    />
                  )}
                </div>

                {/* App info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-medium text-slate-200 truncate">
                      {app.name}
                    </p>
                    {protected_ && (
                      <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded bg-slate-700/50 text-slate-500 font-medium">
                        System
                      </span>
                    )}
                    {critical && !protected_ && (
                      <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 font-medium">
                        Critical
                      </span>
                    )}
                  </div>
                  {app.path && (
                    <p className="text-[10px] text-slate-600 truncate">
                      {app.path.replace(/^\/Applications\//, "")}
                    </p>
                  )}
                </div>

                {/* Version */}
                <span
                  className={cn(
                    "w-28 text-right text-xs font-mono",
                    app.version ? "text-slate-400" : "text-slate-700"
                  )}
                >
                  {app.version || "—"}
                </span>

                {/* Action button */}
                <div className="w-24 flex justify-end">
                  {isDone ? (
                    <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Removed
                    </span>
                  ) : isFailed ? (
                    <button
                      onClick={() => setConfirmApp(app)}
                      className="flex items-center gap-1 text-[10px] text-red-400 font-medium hover:text-red-300"
                      title={status?.result || "Uninstall failed — click to retry"}
                    >
                      <XCircle className="w-3.5 h-3.5" /> Retry
                    </button>
                  ) : isPending ? (
                    <span className="flex items-center gap-1 text-[10px] text-amber-400 font-medium">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Removing…
                    </span>
                  ) : protected_ ? (
                    <span className="text-[10px] text-slate-700">Protected</span>
                  ) : (
                    <button
                      onClick={() => setConfirmApp(app)}
                      className="opacity-0 group-hover:opacity-100 flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-[11px] font-medium hover:bg-red-500/20 transition-all"
                    >
                      <Trash2 className="w-3 h-3" /> Uninstall
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Show more / less */}
        {filtered.length > 20 && (
          <div className="border-t border-slate-800 px-5 py-2 text-center">
            <button
              onClick={() => setShowAll(!showAll)}
              className="text-[11px] text-indigo-400 hover:text-indigo-300 font-medium"
            >
              {showAll
                ? "Show less"
                : `Show all ${filtered.length} apps`}
            </button>
          </div>
        )}
      </div>

      {/* ── Single App Uninstall Confirmation Modal ── */}
      {confirmApp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            {/* Header */}
            <div className={cn(
              "px-6 py-4 border-b",
              isCritical(confirmApp.name)
                ? "border-amber-500/30 bg-amber-500/5"
                : "border-slate-800"
            )}>
              <div className="flex items-center gap-3">
                {isCritical(confirmApp.name) ? (
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
                    <AlertTriangle className="w-5 h-5 text-amber-400" />
                  </div>
                ) : (
                  <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center">
                    <Trash2 className="w-5 h-5 text-red-400" />
                  </div>
                )}
                <div>
                  <h3 className="text-sm font-bold text-white">
                    {isCritical(confirmApp.name) ? "Uninstall Critical App?" : "Confirm Uninstall"}
                  </h3>
                  <p className="text-xs text-slate-400">This action cannot be undone</p>
                </div>
              </div>
            </div>

            {/* Body */}
            <div className="px-6 py-5 space-y-4">
              <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/50 border border-slate-700/50">
                <Package className="w-8 h-8 text-slate-500" />
                <div>
                  <p className="text-sm font-semibold text-white">{confirmApp.name}</p>
                  <p className="text-xs text-slate-500">Version {confirmApp.version || "unknown"}</p>
                </div>
              </div>

              {isCritical(confirmApp.name) && (
                <div className="flex gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-300 leading-relaxed">
                    <strong>{confirmApp.name}</strong> is marked as a critical application.
                    Removing it may affect productivity, security, or other team members.
                    Make sure you have approval before proceeding.
                  </p>
                </div>
              )}

              <div className="text-xs text-slate-400 leading-relaxed">
                This will send an uninstall command to the device agent. The app will be removed
                using <code className="px-1.5 py-0.5 rounded bg-slate-800 text-indigo-300 font-mono text-[10px]">
                  {osType === "windows" ? "winget" : "brew --cask"}
                </code> and its support files will be cleaned up.
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-800 flex items-center justify-end gap-3">
              <button
                onClick={() => setConfirmApp(null)}
                className="px-4 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleUninstall(confirmApp)}
                disabled={deploySoftware.isPending}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50",
                  isCritical(confirmApp.name)
                    ? "bg-amber-500 text-black hover:bg-amber-400"
                    : "bg-red-500 text-white hover:bg-red-400"
                )}
              >
                {deploySoftware.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                Yes, Uninstall
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Bulk Uninstall Confirmation Modal ── */}
      {bulkConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            <div className="px-6 py-4 border-b border-red-500/30 bg-red-500/5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center">
                  <Trash2 className="w-5 h-5 text-red-400" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Bulk Uninstall</h3>
                  <p className="text-xs text-slate-400">Remove {selectableSelected.length} applications</p>
                </div>
              </div>
            </div>

            <div className="px-6 py-5 space-y-3">
              <p className="text-xs text-slate-400">The following apps will be uninstalled:</p>
              <div className="max-h-48 overflow-y-auto space-y-1.5">
                {selectableSelected.map(name => (
                  <div key={name} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800/50">
                    <Trash2 className="w-3 h-3 text-red-400" />
                    <span className="text-xs text-slate-200">{name}</span>
                    {isCritical(name) && (
                      <AlertTriangle className="w-3 h-3 text-amber-400 ml-auto" />
                    )}
                  </div>
                ))}
              </div>
              {selectableSelected.some(n => isCritical(n)) && (
                <div className="flex gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-300">Some selected apps are critical. Proceed with caution.</p>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-slate-800 flex items-center justify-end gap-3">
              <button
                onClick={() => setBulkConfirm(false)}
                className="px-4 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkUninstall}
                disabled={deploySoftware.isPending}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500 text-white text-xs font-semibold hover:bg-red-400 transition-colors disabled:opacity-50"
              >
                {deploySoftware.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                Uninstall All {selectableSelected.length}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
