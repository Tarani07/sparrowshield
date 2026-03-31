import { Users, Clock, LogIn } from "lucide-react";
import { cn } from "../../lib/utils";
import type { Device } from "../../lib/types";

interface Props {
  device: Device;
}

function eventBadge(type: string): { color: string; bg: string } {
  if (type === "login") return { color: "text-green-400", bg: "bg-green-500/15 border-green-500/30" };
  if (type === "logout") return { color: "text-slate-400", bg: "bg-slate-500/15 border-slate-500/30" };
  return { color: "text-amber-400", bg: "bg-amber-500/15 border-amber-500/30" };
}

export default function SessionsCard({ device }: Props) {
  const { user_sessions, login_history } = device;
  const hasData = user_sessions?.length || login_history?.length;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Users className="w-5 h-5 text-indigo-400" />
        <h2 className="text-sm font-semibold text-slate-200">Sessions</h2>
      </div>

      {!hasData ? (
        <p className="text-xs text-slate-500">No data yet</p>
      ) : (
        <div className="space-y-4">
          {user_sessions && user_sessions.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Clock className="w-3.5 h-3.5 text-slate-500" />
                <span className="text-xs text-slate-500">Active Sessions</span>
              </div>
              <div className="space-y-1">
                {user_sessions.map((s, i) => (
                  <div key={i} className="bg-slate-800/60 rounded-lg px-3 py-2 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold text-slate-300">{s.username}</p>
                      <p className="text-[10px] text-slate-500">{s.terminal} &middot; {s.host}</p>
                    </div>
                    <span className="text-[10px] font-mono text-slate-500">
                      {new Date(s.login_time).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {login_history && login_history.length > 0 && (
            <div className="border-t border-slate-800 pt-3">
              <div className="flex items-center gap-1.5 mb-2">
                <LogIn className="w-3.5 h-3.5 text-slate-500" />
                <span className="text-xs text-slate-500">Recent Login History</span>
              </div>
              <div className="space-y-1">
                {login_history.slice(0, 10).map((evt, i) => {
                  const badge = eventBadge(evt.type);
                  return (
                    <div key={i} className="bg-slate-800/60 rounded-lg px-3 py-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-300">{evt.username}</span>
                        <span className={cn(
                          "text-[10px] font-semibold px-1.5 py-0.5 rounded-full border capitalize",
                          badge.color,
                          badge.bg
                        )}>
                          {evt.type}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-slate-500">
                        {new Date(evt.time).toLocaleString()}
                      </span>
                    </div>
                  );
                })}
                {login_history.length > 10 && (
                  <p className="text-[10px] text-slate-500 px-3">+{login_history.length - 10} more</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
