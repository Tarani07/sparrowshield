import { X, Shield, AlertTriangle, ChevronRight } from "lucide-react";

interface ThreatDetailPanelProps {
  event: any | null;
  onClose: () => void;
}

export default function ThreatDetailPanel({ event, onClose }: ThreatDetailPanelProps) {
  if (!event) return null;

  const score = event.threat_score ?? 0;
  const scoreColor = score >= 0.9 ? "#ef4444" : score >= 0.7 ? "#f97316" : score >= 0.5 ? "#eab308" : "#22c55e";
  const scoreLabel = score >= 0.9 ? "Critical" : score >= 0.7 ? "High" : score >= 0.5 ? "Medium" : "Low";

  const mitreTechniques: string[] = [];
  if (event.mitre_technique) mitreTechniques.push(event.mitre_technique);
  if (event.raw_event?.unmapped?.mitre_techniques) {
    mitreTechniques.push(...event.raw_event.unmapped.mitre_techniques);
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        style={{ background: "rgba(0,0,0,0.4)" }}
        onClick={onClose}
      />
      <div
        className="fixed right-0 top-0 h-full z-50 flex flex-col overflow-hidden"
        style={{
          width: 480,
          background: "var(--c-card)",
          borderLeft: "1px solid var(--c-border)",
          boxShadow: "-8px 0 32px rgba(0,0,0,0.25)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: "1px solid var(--c-border)" }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: `${scoreColor}20` }}>
              <AlertTriangle className="w-4 h-4" style={{ color: scoreColor }} />
            </div>
            <div>
              <p className="text-sm font-bold" style={{ color: "var(--c-strong)" }}>Threat Detail</p>
              <p className="text-xs" style={{ color: "var(--c-muted)" }}>
                {event.hostname || event.device_uid || event.devices?.hostname || "Unknown device"}
              </p>
            </div>
          </div>
          <button onClick={onClose}
            className="p-1.5 rounded-lg transition-all hover:opacity-70"
            style={{ background: "var(--c-bg)", border: "1px solid var(--c-border)" }}>
            <X className="w-4 h-4" style={{ color: "var(--c-muted)" }} />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">

          {/* Threat score */}
          <div className="rounded-xl p-4" style={{ background: "var(--c-bg)", border: "1px solid var(--c-border)" }}>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--c-muted)" }}>
                Threat Score
              </span>
              <span className="text-xs font-bold px-2 py-0.5 rounded"
                style={{ background: `${scoreColor}20`, color: scoreColor }}>
                {scoreLabel}
              </span>
            </div>
            <div className="flex items-end gap-3">
              <span className="text-3xl font-bold" style={{ color: scoreColor }}>
                {Math.round(score * 100)}%
              </span>
              <div className="flex-1 mb-1.5">
                <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--c-border2)" }}>
                  <div className="h-full rounded-full transition-all"
                    style={{ width: `${score * 100}%`, background: scoreColor }} />
                </div>
              </div>
            </div>
          </div>

          {/* Alert / rule name */}
          {(event.rule_name || event.alert_type) && (
            <div className="rounded-xl p-4" style={{ background: "var(--c-bg)", border: "1px solid var(--c-border)" }}>
              <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--c-muted)" }}>Alert</p>
              <p className="text-sm font-semibold" style={{ color: "var(--c-strong)" }}>
                {event.rule_name ?? event.alert_type?.replace(/_/g, " ")}
              </p>
              {event.message && (
                <p className="text-xs mt-1" style={{ color: "var(--c-muted)" }}>{event.message}</p>
              )}
            </div>
          )}

          {/* Process info */}
          {(event.image_path || event.cmdline || event.process_name || event.file_path) && (
            <div className="rounded-xl p-4 space-y-3"
              style={{ background: "var(--c-bg)", border: "1px solid var(--c-border)" }}>
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--c-muted)" }}>Process</p>
              {(event.image_path || event.file_path) && (
                <div>
                  <p className="text-[10px] mb-1" style={{ color: "var(--c-faint)" }}>Path</p>
                  <code className="text-xs break-all" style={{ color: "var(--c-strong)" }}>
                    {event.image_path ?? event.file_path}
                  </code>
                </div>
              )}
              {event.cmdline && (
                <div>
                  <p className="text-[10px] mb-1" style={{ color: "var(--c-faint)" }}>Command Line</p>
                  <code className="text-xs break-all px-2 py-1.5 rounded block"
                    style={{ background: "var(--c-card)", color: "var(--c-strong)" }}>
                    {event.cmdline}
                  </code>
                </div>
              )}
              {event.pid && (
                <div className="flex gap-4">
                  <div>
                    <p className="text-[10px] mb-0.5" style={{ color: "var(--c-faint)" }}>PID</p>
                    <p className="text-sm font-mono" style={{ color: "var(--c-strong)" }}>{event.pid}</p>
                  </div>
                  {event.ppid && (
                    <div>
                      <p className="text-[10px] mb-0.5" style={{ color: "var(--c-faint)" }}>Parent PID</p>
                      <p className="text-sm font-mono" style={{ color: "var(--c-strong)" }}>{event.ppid}</p>
                    </div>
                  )}
                  {event.user && (
                    <div>
                      <p className="text-[10px] mb-0.5" style={{ color: "var(--c-faint)" }}>User</p>
                      <p className="text-sm font-mono" style={{ color: "var(--c-strong)" }}>{event.user}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Network info */}
          {(event.dst_ip || event.dst_port) && (
            <div className="rounded-xl p-4 space-y-3"
              style={{ background: "var(--c-bg)", border: "1px solid var(--c-border)" }}>
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--c-muted)" }}>Network</p>
              <div className="flex gap-4">
                {event.dst_ip && (
                  <div>
                    <p className="text-[10px] mb-0.5" style={{ color: "var(--c-faint)" }}>Destination IP</p>
                    <p className="text-sm font-mono" style={{ color: "var(--c-strong)" }}>{event.dst_ip}</p>
                  </div>
                )}
                {event.dst_port && (
                  <div>
                    <p className="text-[10px] mb-0.5" style={{ color: "var(--c-faint)" }}>Port</p>
                    <p className="text-sm font-mono" style={{ color: "var(--c-strong)" }}>{event.dst_port}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* MITRE ATT&CK */}
          {mitreTechniques.length > 0 && (
            <div className="rounded-xl p-4 space-y-2"
              style={{ background: "var(--c-bg)", border: "1px solid var(--c-border)" }}>
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--c-muted)" }}>
                MITRE ATT&CK
              </p>
              {mitreTechniques.map((t, i) => (
                <div key={i} className="flex items-center gap-2 p-2 rounded-lg"
                  style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)" }}>
                  <Shield className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#ef4444" }} />
                  <span className="text-xs font-medium" style={{ color: "#ef4444" }}>{t}</span>
                </div>
              ))}
            </div>
          )}

          {/* Recommended Actions */}
          <div className="rounded-xl p-4 space-y-2"
            style={{ background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.2)" }}>
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#3b82f6" }}>
              Recommended Actions
            </p>
            {score >= 0.9 ? (
              <ul className="space-y-1.5">
                <li className="flex items-start gap-2 text-xs" style={{ color: "var(--c-strong)" }}>
                  <ChevronRight className="w-3 h-3 mt-0.5 flex-shrink-0" style={{ color: "#3b82f6" }} />
                  Isolate host immediately to prevent lateral movement
                </li>
                <li className="flex items-start gap-2 text-xs" style={{ color: "var(--c-strong)" }}>
                  <ChevronRight className="w-3 h-3 mt-0.5 flex-shrink-0" style={{ color: "#3b82f6" }} />
                  Kill the suspicious process tree
                </li>
                <li className="flex items-start gap-2 text-xs" style={{ color: "var(--c-strong)" }}>
                  <ChevronRight className="w-3 h-3 mt-0.5 flex-shrink-0" style={{ color: "#3b82f6" }} />
                  Preserve forensic evidence before remediation
                </li>
              </ul>
            ) : score >= 0.7 ? (
              <ul className="space-y-1.5">
                <li className="flex items-start gap-2 text-xs" style={{ color: "var(--c-strong)" }}>
                  <ChevronRight className="w-3 h-3 mt-0.5 flex-shrink-0" style={{ color: "#3b82f6" }} />
                  Investigate process ancestry and network connections
                </li>
                <li className="flex items-start gap-2 text-xs" style={{ color: "var(--c-strong)" }}>
                  <ChevronRight className="w-3 h-3 mt-0.5 flex-shrink-0" style={{ color: "#3b82f6" }} />
                  Run a full AV scan on the affected device
                </li>
                <li className="flex items-start gap-2 text-xs" style={{ color: "var(--c-strong)" }}>
                  <ChevronRight className="w-3 h-3 mt-0.5 flex-shrink-0" style={{ color: "#3b82f6" }} />
                  Check for persistence mechanisms (cron, startup, scheduled tasks)
                </li>
              </ul>
            ) : (
              <ul className="space-y-1.5">
                <li className="flex items-start gap-2 text-xs" style={{ color: "var(--c-strong)" }}>
                  <ChevronRight className="w-3 h-3 mt-0.5 flex-shrink-0" style={{ color: "#3b82f6" }} />
                  Monitor for escalation of activity
                </li>
                <li className="flex items-start gap-2 text-xs" style={{ color: "var(--c-strong)" }}>
                  <ChevronRight className="w-3 h-3 mt-0.5 flex-shrink-0" style={{ color: "#3b82f6" }} />
                  Review process in context of normal user behavior
                </li>
              </ul>
            )}
          </div>

          {/* Raw OCSF event */}
          {event.raw_event && (
            <div className="rounded-xl p-4 space-y-2"
              style={{ background: "var(--c-bg)", border: "1px solid var(--c-border)" }}>
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--c-muted)" }}>
                Raw OCSF Event
              </p>
              <pre className="text-[10px] overflow-x-auto p-3 rounded-lg"
                style={{ background: "var(--c-card)", color: "var(--c-strong)", maxHeight: 200 }}>
                {JSON.stringify(event.raw_event, null, 2)}
              </pre>
            </div>
          )}

          {/* Timestamps */}
          <div className="rounded-xl p-4 grid grid-cols-2 gap-3"
            style={{ background: "var(--c-bg)", border: "1px solid var(--c-border)" }}>
            {event.created_at && (
              <div>
                <p className="text-[10px] mb-0.5" style={{ color: "var(--c-faint)" }}>Detected</p>
                <p className="text-xs" style={{ color: "var(--c-strong)" }}>
                  {new Date(event.created_at).toLocaleString()}
                </p>
              </div>
            )}
            {event.event_time && (
              <div>
                <p className="text-[10px] mb-0.5" style={{ color: "var(--c-faint)" }}>Event Time</p>
                <p className="text-xs" style={{ color: "var(--c-strong)" }}>
                  {new Date(event.event_time).toLocaleString()}
                </p>
              </div>
            )}
          </div>

        </div>
      </div>
    </>
  );
}
