import { useState } from "react";
import { Shield, X, ExternalLink, Loader2, AlertTriangle, CheckCircle2, Search } from "lucide-react";
import { useVirusTotalLookup } from "../../hooks/useVirusTotal";

interface Props {
  hash: string;
  name?: string;
  trigger?: React.ReactNode;
}

const SHA256_RE = /^[0-9a-f]{64}$/i;
const MD5_RE    = /^[0-9a-f]{32}$/i;

function isHash(s: string) { return SHA256_RE.test(s) || MD5_RE.test(s); }

export default function VirusTotalModal({ hash, name, trigger }: Props) {
  const [open, setOpen] = useState(false);
  const { lookup, loading, result, error, hasKey } = useVirusTotalLookup();
  const realHash = isHash(hash);

  function handleOpen() {
    setOpen(true);
    if (!result && realHash) lookup(hash);
  }

  const verdict = result
    ? result.malicious > 0 ? "malicious"
    : result.suspicious > 0 ? "suspicious"
    : "clean"
    : null;

  const verdictColor = verdict === "malicious" ? "#ef4444" : verdict === "suspicious" ? "#f59e0b" : "#22c55e";
  const verdictBg   = verdict === "malicious" ? "rgba(239,68,68,0.12)" : verdict === "suspicious" ? "rgba(245,158,11,0.12)" : "rgba(34,197,94,0.12)";

  return (
    <>
      <span onClick={handleOpen} className="cursor-pointer">
        {trigger ?? (
          <button className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-md transition-colors"
            style={{ background: "rgba(59,130,246,0.12)", color: "#3b82f6" }}>
            <Shield className="w-2.5 h-2.5" />VT
          </button>
        )}
      </span>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <div
            className="relative w-full max-w-sm rounded-2xl shadow-2xl"
            style={{ background: "var(--c-card)", border: "1px solid var(--c-border2)" }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center gap-3 p-4" style={{ borderBottom: "1px solid var(--c-border)" }}>
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "rgba(59,130,246,0.15)" }}>
                <Shield className="w-4 h-4 text-blue-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold truncate" style={{ color: "var(--c-strong)" }}>
                  {name ?? "Hash Lookup"}
                </p>
                <p className="text-[10px] font-mono truncate" style={{ color: "var(--c-muted)" }}>{hash}</p>
              </div>
              <button onClick={() => setOpen(false)} style={{ color: "var(--c-muted)" }}>
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="p-4">
              {loading && (
                <div className="flex items-center justify-center gap-2 py-8" style={{ color: "var(--c-muted)" }}>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="text-sm">Querying VirusTotal…</span>
                </div>
              )}

              {error && (
                <div className="flex items-start gap-2 rounded-xl p-3" style={{ background: "rgba(239,68,68,0.1)" }}>
                  <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-red-400">{error}</p>
                </div>
              )}

              {result && !loading && (
                <div className="space-y-3">
                  {/* Verdict */}
                  <div className="rounded-xl p-3 text-center" style={{ background: verdictBg }}>
                    <div className="flex items-center justify-center gap-2 mb-1">
                      {verdict === "clean"
                        ? <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                        : <AlertTriangle className="w-5 h-5" style={{ color: verdictColor }} />
                      }
                      <span className="text-base font-bold capitalize" style={{ color: verdictColor }}>
                        {verdict}
                      </span>
                    </div>
                    <p className="text-xs" style={{ color: "var(--c-muted)" }}>
                      {result.malicious} malicious / {result.suspicious} suspicious / {result.total} engines
                    </p>
                  </div>

                  {/* Engine bar */}
                  <div>
                    <div className="flex gap-1 h-2 rounded-full overflow-hidden">
                      {result.malicious > 0 && (
                        <div className="bg-red-500 rounded-l-full" style={{ flex: result.malicious }} />
                      )}
                      {result.suspicious > 0 && (
                        <div className="bg-amber-500" style={{ flex: result.suspicious }} />
                      )}
                      {result.harmless > 0 && (
                        <div className="bg-emerald-500" style={{ flex: result.harmless }} />
                      )}
                      {result.undetected > 0 && (
                        <div className="rounded-r-full" style={{ flex: result.undetected, background: "var(--c-border2)" }} />
                      )}
                    </div>
                    <div className="flex justify-between mt-1">
                      <span className="text-[9px]" style={{ color: "var(--c-muted)" }}>
                        {result.malicious + result.suspicious} detections
                      </span>
                      <span className="text-[9px]" style={{ color: "var(--c-muted)" }}>
                        {result.total} engines
                      </span>
                    </div>
                  </div>

                  {/* Meta */}
                  <div className="space-y-1.5">
                    {[
                      ["Type",       result.type || "—"],
                      ["Size",       result.size ? `${(result.size / 1024).toFixed(1)} KB` : "—"],
                      ["First seen", result.firstSeen || "—"],
                      ["Last seen",  result.lastSeen || "—"],
                    ].map(([label, value]) => (
                      <div key={label} className="flex justify-between">
                        <span className="text-[11px]" style={{ color: "var(--c-muted)" }}>{label}</span>
                        <span className="text-[11px] font-medium" style={{ color: "var(--c-text)" }}>{value}</span>
                      </div>
                    ))}
                  </div>

                  {/* VT link */}
                  <a
                    href={`https://www.virustotal.com/gui/file/${hash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-1.5 w-full py-2 rounded-xl text-xs font-semibold transition-colors"
                    style={{ background: "rgba(59,130,246,0.12)", color: "#3b82f6" }}
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    View full report on VirusTotal
                  </a>
                </div>
              )}

              {!realHash && !loading && (
                <div className="text-center py-4 space-y-3">
                  <Search className="w-8 h-8 mx-auto" style={{ color: "var(--c-muted)" }} />
                  <p className="text-sm font-medium" style={{ color: "var(--c-strong)" }}>No hash available</p>
                  <p className="text-xs" style={{ color: "var(--c-muted)" }}>
                    Search VirusTotal for this filename instead:
                  </p>
                  <a
                    href={`https://www.virustotal.com/gui/search/${encodeURIComponent(name ?? hash)}`}
                    target="_blank" rel="noopener noreferrer"
                    className="flex items-center justify-center gap-1.5 w-full py-2 rounded-xl text-xs font-semibold"
                    style={{ background: "rgba(59,130,246,0.12)", color: "#3b82f6" }}
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Search "{name ?? hash}" on VirusTotal
                  </a>
                </div>
              )}

              {!hasKey && realHash && !loading && !result && !error && (
                <div className="text-center py-4">
                  <Search className="w-8 h-8 mx-auto mb-2" style={{ color: "var(--c-muted)" }} />
                  <p className="text-sm font-medium" style={{ color: "var(--c-strong)" }}>No API Key</p>
                  <p className="text-xs mt-1" style={{ color: "var(--c-muted)" }}>
                    Add your VirusTotal API key in Settings → Integrations
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
