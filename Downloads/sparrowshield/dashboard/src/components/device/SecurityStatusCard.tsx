import { Lock, Unlock, Shield, ShieldAlert, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "../../lib/utils";
import type { Device } from "../../lib/types";

interface Props {
  device: Device;
}

interface SecurityRowProps {
  label: string;
  enabled: boolean | null;
  trueIcon: React.ReactNode;
  falseIcon: React.ReactNode;
  trueLabel?: string;
  falseLabel?: string;
}

function SecurityRow({ label, enabled, trueIcon, falseIcon, trueLabel, falseLabel }: SecurityRowProps) {
  const isEnabled = enabled === true;
  const isUnknown = enabled == null;

  return (
    <div className="flex items-center justify-between py-2.5 border-b border-slate-800 last:border-0">
      <span className="text-xs text-slate-400">{label}</span>
      <div className={cn(
        "flex items-center gap-1.5 text-xs font-semibold",
        isUnknown ? "text-slate-500" :
        isEnabled  ? "text-green-400" : "text-red-400"
      )}>
        {isUnknown ? (
          <span className="text-slate-500">Unknown</span>
        ) : isEnabled ? (
          <>{trueIcon}<span>{trueLabel ?? "Enabled"}</span></>
        ) : (
          <>{falseIcon}<span>{falseLabel ?? "Disabled"}</span></>
        )}
      </div>
    </div>
  );
}

function AntivirusRow({ antivirus }: { antivirus: string | null }) {
  const hasAv = antivirus != null && antivirus.trim() !== "";
  return (
    <div className="flex items-center justify-between py-2.5">
      <span className="text-xs text-slate-400">Antivirus / EDR</span>
      <div className={cn(
        "flex items-center gap-1.5 text-xs font-semibold",
        hasAv ? "text-green-400" : "text-red-400"
      )}>
        {hasAv ? (
          <><CheckCircle2 className="w-3.5 h-3.5" /><span>{antivirus}</span></>
        ) : (
          <><XCircle className="w-3.5 h-3.5" /><span>Not Found</span></>
        )}
      </div>
    </div>
  );
}

export default function SecurityStatusCard({ device }: Props) {
  const {
    filevault_enabled,
    firewall_enabled,
    sip_enabled,
    gatekeeper_enabled,
    mdm_enrolled,
    antivirus_installed,
  } = device;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Shield className="w-5 h-5 text-indigo-400" />
        <h2 className="text-sm font-semibold text-slate-200">Security Status</h2>
      </div>

      <div className="divide-y divide-slate-800">
        <SecurityRow
          label="FileVault"
          enabled={filevault_enabled}
          trueIcon={<Lock className="w-3.5 h-3.5" />}
          falseIcon={<Unlock className="w-3.5 h-3.5" />}
          trueLabel="Encrypted"
          falseLabel="Not Encrypted"
        />
        <SecurityRow
          label="Firewall"
          enabled={firewall_enabled}
          trueIcon={<Shield className="w-3.5 h-3.5" />}
          falseIcon={<ShieldAlert className="w-3.5 h-3.5" />}
        />
        <SecurityRow
          label="System Integrity Protection (SIP)"
          enabled={sip_enabled}
          trueIcon={<CheckCircle2 className="w-3.5 h-3.5" />}
          falseIcon={<XCircle className="w-3.5 h-3.5" />}
        />
        <SecurityRow
          label="Gatekeeper"
          enabled={gatekeeper_enabled}
          trueIcon={<CheckCircle2 className="w-3.5 h-3.5" />}
          falseIcon={<XCircle className="w-3.5 h-3.5" />}
        />
        <SecurityRow
          label="MDM Enrolled"
          enabled={mdm_enrolled}
          trueIcon={<CheckCircle2 className="w-3.5 h-3.5" />}
          falseIcon={<XCircle className="w-3.5 h-3.5" />}
        />
        <AntivirusRow antivirus={antivirus_installed ?? null} />
      </div>
    </div>
  );
}
