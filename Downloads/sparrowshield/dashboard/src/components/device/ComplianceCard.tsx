import { ClipboardCheck } from "lucide-react";
import { cn } from "../../lib/utils";
import type { Device } from "../../lib/types";

interface Props {
  device: Device;
}

interface ComplianceItem {
  label: string;
  points: number;
  met: boolean | null;
}

function complianceScore(items: ComplianceItem[]): number {
  return items.reduce((sum, item) => (item.met === true ? sum + item.points : sum), 0);
}

function scoreColor(score: number): string {
  if (score >= 80) return "text-green-400";
  if (score >= 50) return "text-amber-400";
  return "text-red-400";
}

function scoreBarColor(score: number): string {
  if (score >= 80) return "bg-green-500";
  if (score >= 50) return "bg-amber-500";
  return "bg-red-500";
}

function scoreLabel(score: number): string {
  if (score >= 80) return "Compliant";
  if (score >= 50) return "Needs Attention";
  return "At Risk";
}

export default function ComplianceCard({ device }: Props) {
  const {
    filevault_enabled,
    firewall_enabled,
    sip_enabled,
    gatekeeper_enabled,
    mdm_enrolled,
    antivirus_installed,
  } = device;

  const items: ComplianceItem[] = [
    { label: "FileVault Encryption", points: 20, met: filevault_enabled },
    { label: "Firewall Active",      points: 20, met: firewall_enabled },
    { label: "SIP Enabled",          points: 15, met: sip_enabled },
    { label: "Gatekeeper Active",    points: 15, met: gatekeeper_enabled },
    { label: "MDM Enrolled",         points: 15, met: mdm_enrolled },
    { label: "Antivirus Installed",  points: 15, met: antivirus_installed != null && antivirus_installed.trim() !== "" },
  ];

  const score = complianceScore(items);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <ClipboardCheck className="w-5 h-5 text-purple-400" />
        <h2 className="text-sm font-semibold text-slate-200">Compliance Score</h2>
        <span className={cn(
          "ml-auto text-xs font-bold px-2.5 py-0.5 rounded-full border",
          score >= 80
            ? "bg-green-500/15 text-green-400 border-green-500/30"
            : score >= 50
              ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
              : "bg-red-500/15 text-red-400 border-red-500/30"
        )}>
          {scoreLabel(score)}
        </span>
      </div>

      {/* Score gauge */}
      <div className="mb-5">
        <div className="flex items-end justify-between mb-2">
          <span className="text-xs text-slate-500">Overall</span>
          <span className={cn("text-3xl font-bold font-mono", scoreColor(score))}>
            {score}<span className="text-base text-slate-500">/100</span>
          </span>
        </div>
        <div className="w-full h-2.5 bg-slate-700/60 rounded-full overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all duration-700", scoreBarColor(score))}
            style={{ width: `${score}%` }}
          />
        </div>
      </div>

      {/* Checklist */}
      <div className="space-y-2">
        {items.map(({ label, points, met }) => (
          <div key={label} className="flex items-center gap-2">
            <span className={cn(
              "w-4 h-4 rounded-full flex-shrink-0 flex items-center justify-center text-[9px] font-bold",
              met === true
                ? "bg-green-500/20 text-green-400"
                : met === false
                  ? "bg-red-500/20 text-red-400"
                  : "bg-slate-700 text-slate-500"
            )}>
              {met === true ? "✓" : met === false ? "✗" : "?"}
            </span>
            <span className={cn("flex-1 text-xs", met === true ? "text-slate-300" : met === false ? "text-slate-500" : "text-slate-600")}>
              {label}
            </span>
            <span className={cn("text-[10px] font-mono font-semibold", met === true ? "text-green-400" : "text-slate-600")}>
              {met === true ? `+${points}` : `+0`}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
