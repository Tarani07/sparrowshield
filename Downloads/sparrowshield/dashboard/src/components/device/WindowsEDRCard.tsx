import { ShieldCheck, ShieldX, Lock, Unlock, Monitor, AlertTriangle, CheckCircle2 } from "lucide-react";
import type { Device } from "../../lib/types";

interface Props {
  device: Device;
}

type StatusRow = {
  label: string;
  value: boolean | null;
  goodWhen: boolean;
  mitre?: string;
  icon?: React.ElementType;
};

function StatusItem({ label, value, goodWhen, mitre }: StatusRow) {
  const unknown = value === null || value === undefined;
  const ok = !unknown && value === goodWhen;
  const bad = !unknown && !ok;
  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-800/60 last:border-0">
      <div className="flex items-center gap-2">
        {ok  && <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />}
        {bad && <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />}
        {unknown && <div className="w-3.5 h-3.5 rounded-full border border-slate-600 shrink-0" />}
        <span className="text-sm text-slate-300">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        {mitre && bad && (
          <span className="text-[10px] font-mono text-slate-500 bg-slate-800 px-1.5 py-0.5 rounded">
            {mitre}
          </span>
        )}
        <span className={`text-xs font-semibold ${
          unknown ? "text-slate-600" : ok ? "text-green-400" : "text-red-400"
        }`}>
          {unknown ? "N/A" : ok ? "Pass" : "Fail"}
        </span>
      </div>
    </div>
  );
}

export default function WindowsEDRCard({ device }: Props) {
  if (device.os_type !== "windows") return null;

  const checks: StatusRow[] = [
    { label: "BitLocker Encryption",    value: device.bitlocker_enabled,    goodWhen: true,  mitre: "T1486" },
    { label: "Windows Firewall",        value: device.firewall_enabled,     goodWhen: true,  mitre: "T1562.004" },
    { label: "Windows Defender",        value: device.defender_enabled,     goodWhen: true,  mitre: "T1562.001" },
    { label: "UAC Enabled",             value: device.uac_enabled,          goodWhen: true,  mitre: "T1548.002" },
    { label: "RDP Disabled",            value: device.rdp_enabled,          goodWhen: false, mitre: "T1021.001" },
    { label: "Guest Account Disabled",  value: device.guest_enabled,        goodWhen: false, mitre: "T1078.003" },
    { label: "Auto-Logon Disabled",     value: device.autologon_enabled,    goodWhen: false, mitre: "T1552.002" },
  ];

  const pass  = checks.filter(c => c.value !== null && c.value === c.goodWhen).length;
  const total = checks.filter(c => c.value !== null).length;
  const score = total ? Math.round((pass / total) * 100) : null;

  const defSigAge = device.defender_sig_age_days;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-blue-400" />
          <span className="text-sm font-semibold text-white">Windows Security Posture</span>
        </div>
        {score !== null && (
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${
            score >= 80 ? "bg-green-500/15 border-green-500/30 text-green-400"
            : score >= 50 ? "bg-amber-500/15 border-amber-500/30 text-amber-400"
            : "bg-red-500/15 border-red-500/30 text-red-400"
          }`}>
            {score}% ({pass}/{total})
          </span>
        )}
      </div>

      <div>
        {checks.map(c => <StatusItem key={c.label} {...c} />)}
      </div>

      {defSigAge !== null && defSigAge !== undefined && (
        <div className={`mt-3 flex items-center gap-2 text-xs px-3 py-2 rounded-lg border ${
          defSigAge <= 1 ? "bg-green-500/10 border-green-500/20 text-green-400"
          : defSigAge <= 3 ? "bg-amber-500/10 border-amber-500/20 text-amber-400"
          : "bg-red-500/10 border-red-500/20 text-red-400"
        }`}>
          <Lock className="w-3.5 h-3.5 shrink-0" />
          Defender signatures {defSigAge === 0 ? "updated today"
            : defSigAge === 1 ? "1 day old"
            : `${defSigAge} days old`}
          {defSigAge > 3 && " — update recommended"}
        </div>
      )}

      {device.defender_mode && (
        <p className="mt-2 text-xs text-slate-500">
          Defender mode: <span className="text-slate-400 font-mono">{device.defender_mode}</span>
        </p>
      )}
    </div>
  );
}
