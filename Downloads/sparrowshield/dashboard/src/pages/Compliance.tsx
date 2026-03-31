import { useState, useMemo } from "react";
import { Shield, CheckCircle2, XCircle, AlertTriangle, RefreshCw, Loader2 } from "lucide-react";
import TopBar from "../components/layout/TopBar";
import { useFrameworks, useControls, useComplianceSnapshots } from "../hooks/useCompliance";
import { useAllDevices } from "../hooks/useDevices";
import { cn } from "../lib/utils";
import { supabase } from "../lib/supabase";
import { timeAgo } from "../lib/utils";

export default function Compliance() {
  const { data: frameworks = [] } = useFrameworks();
  const { data: devices = [] } = useAllDevices();

  const [selectedFramework, setSelectedFramework] = useState<string>("SOC2");
  const [evaluating, setEvaluating] = useState(false);

  // Get framework ID for controls query
  const frameworkObj = frameworks.find(
    (f) => f.name.toUpperCase().replace(/[^A-Z0-9]/g, "") === selectedFramework.replace(/[^A-Z0-9]/g, "")
  );

  const { data: controls = [] } = useControls(frameworkObj?.id);
  const { data: snapshots = [] } = useComplianceSnapshots(selectedFramework);

  // Compute latest snapshot per device for selected framework
  const latestPerDevice = useMemo(() => {
    const map = new Map<string, (typeof snapshots)[0]>();
    for (const s of snapshots) {
      const existing = map.get(s.device_id);
      if (!existing || new Date(s.snapshot_at) > new Date(existing.snapshot_at)) {
        map.set(s.device_id, s);
      }
    }
    return Array.from(map.values());
  }, [snapshots]);

  // Fleet average score
  const fleetAvg = useMemo(() => {
    if (latestPerDevice.length === 0) return null;
    const sum = latestPerDevice.reduce((acc, s) => acc + s.score, 0);
    return Math.round(sum / latestPerDevice.length);
  }, [latestPerDevice]);

  // Control pass rates across fleet
  const controlStats = useMemo(() => {
    const stats = new Map<string, { pass: number; fail: number }>();
    for (const snap of latestPerDevice) {
      for (const d of snap.details ?? []) {
        const entry = stats.get(d.control_id) ?? { pass: 0, fail: 0 };
        if (d.pass) entry.pass++;
        else entry.fail++;
        stats.set(d.control_id, entry);
      }
    }
    return stats;
  }, [latestPerDevice]);

  const handleEvaluate = async () => {
    setEvaluating(true);
    try {
      await supabase.functions.invoke("compliance-evaluate");
    } catch {
      // silently fail
    } finally {
      setTimeout(() => setEvaluating(false), 2000);
    }
  };

  const FRAMEWORK_TABS = [
    { key: "SOC2", label: "SOC 2" },
    { key: "HIPAA", label: "HIPAA" },
  ];

  const hasData = latestPerDevice.length > 0;

  return (
    <div className="flex flex-col h-full">
      <TopBar title="Compliance" />

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">Compliance Overview</h1>
            <p className="text-sm text-slate-400 mt-1">
              SOC 2 and HIPAA compliance status across your fleet.
            </p>
          </div>
          <button
            onClick={handleEvaluate}
            disabled={evaluating}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-500 transition-all disabled:opacity-60"
          >
            {evaluating ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            {evaluating ? "Evaluating..." : "Evaluate Now"}
          </button>
        </div>

        {/* Framework selector */}
        <div className="flex items-center gap-2">
          {FRAMEWORK_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setSelectedFramework(t.key)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-all border",
                selectedFramework === t.key
                  ? "bg-indigo-600/20 text-indigo-400 border-indigo-600/30"
                  : "bg-slate-800/50 text-slate-400 border-slate-700 hover:text-slate-200 hover:bg-slate-800"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {!hasData ? (
          /* Empty state */
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 flex flex-col items-center justify-center text-center">
            <div className="w-14 h-14 rounded-xl bg-slate-800 flex items-center justify-center mb-4">
              <Shield className="w-7 h-7 text-slate-500" />
            </div>
            <h3 className="text-sm font-semibold text-white mb-1">No compliance data yet</h3>
            <p className="text-xs text-slate-500 mb-5 max-w-sm">
              Compliance evaluation runs every 15 minutes. Click the button below to trigger a manual evaluation now.
            </p>
            <button
              onClick={handleEvaluate}
              disabled={evaluating}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-500 transition-all disabled:opacity-60"
            >
              {evaluating ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              {evaluating ? "Evaluating..." : "Evaluate Now"}
            </button>
          </div>
        ) : (
          <>
            {/* Fleet-wide compliance score */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
              <div className="flex items-center gap-4">
                <div
                  className={cn(
                    "w-14 h-14 rounded-xl flex items-center justify-center",
                    fleetAvg !== null && fleetAvg > 80
                      ? "bg-green-500/20"
                      : fleetAvg !== null && fleetAvg > 60
                      ? "bg-amber-500/20"
                      : "bg-red-500/20"
                  )}
                >
                  <Shield
                    className={cn(
                      "w-7 h-7",
                      fleetAvg !== null && fleetAvg > 80
                        ? "text-green-400"
                        : fleetAvg !== null && fleetAvg > 60
                        ? "text-amber-400"
                        : "text-red-400"
                    )}
                  />
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">
                    Fleet {selectedFramework} Score
                  </p>
                  <p
                    className={cn(
                      "text-4xl font-bold",
                      fleetAvg !== null && fleetAvg > 80
                        ? "text-green-400"
                        : fleetAvg !== null && fleetAvg > 60
                        ? "text-amber-400"
                        : "text-red-400"
                    )}
                  >
                    {fleetAvg ?? "—"}%
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Average across {latestPerDevice.length} device{latestPerDevice.length !== 1 ? "s" : ""}
                  </p>
                </div>
              </div>
            </div>

            {/* Controls table */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-800">
                <h2 className="text-sm font-semibold text-white">Controls</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Pass/fail rates for each {selectedFramework} control across the fleet.
                </p>
              </div>

              {controls.length === 0 ? (
                <div className="px-5 py-8 text-center text-xs text-slate-500">
                  No controls defined for this framework.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-500">
                        <th className="text-left px-5 py-3 font-medium">Control ID</th>
                        <th className="text-left px-5 py-3 font-medium">Name</th>
                        <th className="text-left px-5 py-3 font-medium hidden xl:table-cell">Description</th>
                        <th className="text-center px-5 py-3 font-medium">Pass</th>
                        <th className="text-center px-5 py-3 font-medium">Fail</th>
                        <th className="text-left px-5 py-3 font-medium w-48">Pass Rate</th>
                      </tr>
                    </thead>
                    <tbody>
                      {controls.map((ctrl) => {
                        const stats = controlStats.get(ctrl.control_id) ?? { pass: 0, fail: 0 };
                        const total = stats.pass + stats.fail;
                        const rate = total > 0 ? Math.round((stats.pass / total) * 100) : 0;

                        return (
                          <tr key={ctrl.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                            <td className="px-5 py-3 font-mono text-indigo-400 font-medium">{ctrl.control_id}</td>
                            <td className="px-5 py-3 text-slate-200 font-medium">{ctrl.control_name}</td>
                            <td className="px-5 py-3 text-slate-500 hidden xl:table-cell max-w-xs truncate">
                              {ctrl.description ?? "—"}
                            </td>
                            <td className="px-5 py-3 text-center">
                              <span className="text-green-400 font-medium">{stats.pass}</span>
                            </td>
                            <td className="px-5 py-3 text-center">
                              <span className="text-red-400 font-medium">{stats.fail}</span>
                            </td>
                            <td className="px-5 py-3">
                              <div className="flex items-center gap-2">
                                <div className="flex-1 h-2 rounded-full bg-slate-800 overflow-hidden">
                                  <div
                                    className={cn(
                                      "h-full rounded-full transition-all",
                                      rate > 80 ? "bg-green-500" : rate > 60 ? "bg-amber-500" : "bg-red-500"
                                    )}
                                    style={{ width: `${rate}%` }}
                                  />
                                </div>
                                <span
                                  className={cn(
                                    "text-[11px] font-semibold w-10 text-right",
                                    rate > 80 ? "text-green-400" : rate > 60 ? "text-amber-400" : "text-red-400"
                                  )}
                                >
                                  {rate}%
                                </span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Device compliance table */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-800">
                <h2 className="text-sm font-semibold text-white">Device Compliance</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Per-device compliance scores for {selectedFramework}.
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-500">
                      <th className="text-left px-5 py-3 font-medium">Hostname</th>
                      <th className="text-center px-5 py-3 font-medium">Score</th>
                      <th className="text-center px-5 py-3 font-medium">Pass</th>
                      <th className="text-center px-5 py-3 font-medium">Fail</th>
                      <th className="text-left px-5 py-3 font-medium">Last Evaluated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {latestPerDevice
                      .sort((a, b) => a.score - b.score)
                      .map((snap) => (
                        <tr key={snap.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                          <td className="px-5 py-3 text-slate-200 font-medium">
                            {snap.devices?.hostname ?? snap.device_id.slice(0, 8)}
                          </td>
                          <td className="px-5 py-3 text-center">
                            <span
                              className={cn(
                                "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold border",
                                snap.score > 80
                                  ? "bg-green-500/10 text-green-400 border-green-500/30"
                                  : snap.score > 60
                                  ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                                  : "bg-red-500/10 text-red-400 border-red-500/30"
                              )}
                            >
                              {snap.score > 80 ? (
                                <CheckCircle2 className="w-3 h-3" />
                              ) : snap.score > 60 ? (
                                <AlertTriangle className="w-3 h-3" />
                              ) : (
                                <XCircle className="w-3 h-3" />
                              )}
                              {snap.score}%
                            </span>
                          </td>
                          <td className="px-5 py-3 text-center text-green-400 font-medium">{snap.pass_count}</td>
                          <td className="px-5 py-3 text-center text-red-400 font-medium">{snap.fail_count}</td>
                          <td className="px-5 py-3 text-slate-500">{timeAgo(snap.snapshot_at)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
