import { ScrollText, Usb, KeyRound, MonitorSmartphone, Bug, AlertOctagon } from "lucide-react";
import { cn, timeAgo } from "../../lib/utils";
import { useSecurityEvents } from "../../hooks/useSecurityEvents";

interface Props {
  deviceId: string;
}

const EVENT_META: Record<string, { icon: React.ReactNode; label: string }> = {
  usb_inserted:     { icon: <Usb className="w-3.5 h-3.5" />,               label: "USB Inserted" },
  failed_login:     { icon: <KeyRound className="w-3.5 h-3.5" />,          label: "Failed Login" },
  remote_session:   { icon: <MonitorSmartphone className="w-3.5 h-3.5" />, label: "Remote Session" },
  crash:            { icon: <AlertOctagon className="w-3.5 h-3.5" />,      label: "Crash" },
  malware_detected: { icon: <Bug className="w-3.5 h-3.5" />,               label: "Malware Detected" },
};

function severityBadge(severity: string): string {
  if (severity === "critical") return "text-red-400 bg-red-500/15 border-red-500/30";
  if (severity === "warning")  return "text-amber-400 bg-amber-500/15 border-amber-500/30";
  return "text-slate-400 bg-slate-500/15 border-slate-500/30";
}

export default function SecurityLogCard({ deviceId }: Props) {
  const { data: events = [], isLoading } = useSecurityEvents(deviceId);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <ScrollText className="w-5 h-5 text-indigo-400" />
        <h2 className="text-sm font-semibold text-slate-200">Security Log</h2>
      </div>

      {isLoading ? (
        <p className="text-xs text-slate-500">Loading…</p>
      ) : events.length === 0 ? (
        <p className="text-xs text-slate-500">No security events recorded</p>
      ) : (
        <div className="space-y-1.5 max-h-80 overflow-y-auto">
          {events.map((evt) => {
            const meta = EVENT_META[evt.event_type] ?? { icon: <ScrollText className="w-3.5 h-3.5" />, label: evt.event_type.replace(/_/g, " ") };
            return (
              <div key={evt.id} className="bg-slate-800/60 rounded-lg px-3 py-2 flex items-start justify-between gap-3">
                <div className="flex items-start gap-2 min-w-0">
                  <span className="text-slate-500 mt-0.5 flex-shrink-0">{meta.icon}</span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded-full border capitalize", severityBadge(evt.severity))}>
                        {meta.label}
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 mt-1 break-words">{evt.description}</p>
                  </div>
                </div>
                <span className="text-[10px] font-mono text-slate-500 flex-shrink-0">{timeAgo(evt.created_at)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
