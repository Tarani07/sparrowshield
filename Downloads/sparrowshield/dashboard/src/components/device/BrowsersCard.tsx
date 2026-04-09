import { Globe, Star, Users, Shield } from "lucide-react";
import type { Device } from "../../lib/types";
import { cn } from "../../lib/utils";

const BROWSER_ICONS: Record<string, { color: string; bg: string }> = {
  "Google Chrome":   { color: "text-yellow-400",  bg: "bg-yellow-500/10" },
  "Safari":          { color: "text-blue-400",     bg: "bg-blue-500/10" },
  "Firefox":         { color: "text-orange-400",   bg: "bg-orange-500/10" },
  "Microsoft Edge":  { color: "text-cyan-400",     bg: "bg-cyan-500/10" },
  "Brave Browser":   { color: "text-orange-300",   bg: "bg-orange-400/10" },
  "Opera":           { color: "text-red-400",      bg: "bg-red-500/10" },
  "Vivaldi":         { color: "text-rose-400",     bg: "bg-rose-500/10" },
  "Arc":             { color: "text-violet-400",   bg: "bg-violet-500/10" },
  "Tor Browser":     { color: "text-purple-400",   bg: "bg-purple-500/10" },
  "Chromium":        { color: "text-sky-400",      bg: "bg-sky-500/10" },
  "Orion":           { color: "text-indigo-400",   bg: "bg-indigo-500/10" },
  "DuckDuckGo":      { color: "text-amber-400",    bg: "bg-amber-500/10" },
};

interface Props {
  device: Device;
}

export default function BrowsersCard({ device }: Props) {
  const browsers = device.installed_browsers;

  if (!browsers || browsers.length === 0) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
          <Globe className="w-4 h-4 text-cyan-400" />
          Installed Browsers
        </h2>
        <p className="text-xs text-slate-600 mt-3 text-center py-4">
          No browser data yet — agent sends this hourly
        </p>
      </div>
    );
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
        <div>
          <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <Globe className="w-4 h-4 text-cyan-400" />
            Installed Browsers
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {browsers.length} browser{browsers.length !== 1 ? "s" : ""} detected
          </p>
        </div>
        {browsers.find(b => b.is_default) && (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-semibold">
            <Star className="w-3 h-3" />
            Default: {browsers.find(b => b.is_default)?.name}
          </span>
        )}
      </div>

      {/* Browser list */}
      <div className="divide-y divide-slate-800/40">
        {browsers.map((browser, i) => {
          const style = BROWSER_ICONS[browser.name] ?? { color: "text-slate-400", bg: "bg-slate-700/30" };
          return (
            <div
              key={browser.name}
              className="flex items-center gap-3 px-5 py-3 hover:bg-slate-800/30 transition-colors"
            >
              {/* Icon circle */}
              <div className={cn(
                "w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0",
                style.bg
              )}>
                <Globe className={cn("w-4.5 h-4.5", style.color)} />
              </div>

              {/* Name + engine */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-medium text-slate-200 truncate">
                    {browser.name}
                  </p>
                  {browser.is_default && (
                    <span className="flex-shrink-0 px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 text-[9px] font-bold uppercase tracking-wider border border-emerald-500/20">
                      Default
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="text-[10px] text-slate-500">
                    {browser.engine}
                  </span>
                  {browser.profiles > 0 && (
                    <span className="flex items-center gap-1 text-[10px] text-slate-600">
                      <Users className="w-2.5 h-2.5" />
                      {browser.profiles} profile{browser.profiles !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>
              </div>

              {/* Version */}
              <div className="flex-shrink-0 text-right">
                <span className="text-xs font-mono text-slate-400">
                  {browser.version ?? "—"}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Engine summary */}
      <div className="border-t border-slate-800 px-5 py-3 bg-slate-950/40">
        <div className="flex items-center gap-4">
          <span className="text-[10px] text-slate-600 font-semibold uppercase tracking-wider">Engines:</span>
          {Array.from(new Set(browsers.map(b => b.engine))).map(engine => (
            <span
              key={engine}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] border bg-slate-800/60 text-slate-400 border-slate-700"
            >
              <Shield className="w-2.5 h-2.5" />
              {engine}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
