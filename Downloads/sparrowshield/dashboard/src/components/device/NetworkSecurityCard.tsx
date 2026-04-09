import { Globe, Shield, Server, Radio } from "lucide-react";
import { cn } from "../../lib/utils";
import type { Device } from "../../lib/types";

interface Props {
  device: Device;
}

export default function NetworkSecurityCard({ device }: Props) {
  const { listening_ports, open_connections_count, dns_servers, proxy_configured } = device;
  const hasData = listening_ports?.length || open_connections_count != null || dns_servers?.length || proxy_configured != null;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Globe className="w-5 h-5 text-indigo-400" />
        <h2 className="text-sm font-semibold text-slate-200">Network Security</h2>
        {open_connections_count != null && (
          <span className="ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/30">
            {open_connections_count} connections
          </span>
        )}
      </div>

      {!hasData ? (
        <p className="text-xs text-slate-500">No data yet</p>
      ) : (
        <div className="space-y-4">
          {listening_ports && listening_ports.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <Server className="w-3.5 h-3.5 text-slate-500" />
                <span className="text-xs text-slate-500">Listening Ports</span>
              </div>
              <div className="bg-slate-800/60 rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[10px] text-slate-500 uppercase tracking-wider">
                      <th className="text-left px-3 py-1.5">Port</th>
                      <th className="text-left px-3 py-1.5">Process</th>
                      <th className="text-left px-3 py-1.5">Proto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {listening_ports.slice(0, 8).map((lp, i) => (
                      <tr key={i} className="border-t border-slate-700/50">
                        <td className="px-3 py-1.5 font-mono text-amber-400">{lp.port}</td>
                        <td className="px-3 py-1.5 text-slate-300 truncate max-w-[120px]">{lp.process}</td>
                        <td className="px-3 py-1.5 text-slate-500 uppercase">{lp.protocol}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {listening_ports.length > 8 && (
                  <p className="text-[10px] text-slate-500 px-3 py-1.5">
                    +{listening_ports.length - 8} more
                  </p>
                )}
              </div>
            </div>
          )}

          {dns_servers && dns_servers.length > 0 && (
            <div className="flex items-start justify-between border-t border-slate-800 pt-3">
              <div className="flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 text-slate-500" />
                <span className="text-xs text-slate-500">DNS Servers</span>
              </div>
              <div className="text-right space-y-0.5">
                {dns_servers.map((dns, i) => (
                  <p key={i} className="text-xs font-mono text-slate-300">{dns}</p>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between border-t border-slate-800 pt-3">
            <div className="flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-slate-500" />
              <span className="text-xs text-slate-500">Proxy</span>
            </div>
            <span className={cn(
              "text-[10px] font-semibold px-2 py-0.5 rounded-full border",
              proxy_configured
                ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
                : "bg-slate-500/15 text-slate-400 border-slate-500/30"
            )}>
              {proxy_configured == null ? "Unknown" : proxy_configured ? "Configured" : "None"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
