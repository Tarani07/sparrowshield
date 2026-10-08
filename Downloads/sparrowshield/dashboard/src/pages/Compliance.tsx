import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { ShieldCheck, ShieldAlert, TrendingUp, Monitor, Apple } from "lucide-react";

interface Snapshot {
  id: string;
  device_id: string;
  hostname: string;
  os_type: string;
  framework: string;
  score_pct: number;
  passed: number;
  total: number;
  details: Record<string, boolean | number>;
  snapshot_at: string;
}

const CIS_LABELS: Record<string, string> = {
  filevault:                   "FileVault Encryption",
  firewall:                    "Host Firewall",
  firewall_enabled:            "Host Firewall",
  sip:                         "System Integrity Protection",
  gatekeeper:                  "Gatekeeper",
  screen_lock:                 "Screen Lock ≤5 min",
  bluetooth_managed:           "Bluetooth Managed",
  ssh_disabled:                "SSH Disabled",
  ard_disabled:                "ARD/Remote Desktop Off",
  airdrop_restricted:          "AirDrop Restricted",
  auto_update:                 "Automatic Updates",
  auto_update_enabled:         "Automatic Updates",
  password_policy:             "Password Policy",
  guest_disabled:              "Guest Account Disabled",
  no_autologin:                "No Auto-Login",
  screensaver_password:        "Screensaver Requires Password",
  firmware_password:           "Firmware/Activation Lock",
  audit_logging:               "Audit Logging",
  crash_reporter:              "Crash Reporter",
  location_services_managed:   "Location Services Managed",
  uac_enabled:                 "UAC Enabled",
  no_autologon:                "No Auto-Logon",
  laps_installed:              "LAPS Installed",
  smb_signing:                 "SMB Signing Required",
  llmnr_disabled:              "LLMNR Disabled",
  rdp_controlled:              "RDP Controlled",
  bitlocker_enabled:           "BitLocker Encryption",
  secure_boot:                 "Secure Boot",
  credential_guard:            "Credential Guard",
  defender_enabled:            "Windows Defender Active",
  defender_signatures_fresh:   "Defender Signatures Fresh (<7d)",
  tamper_protection:           "Tamper Protection",
  applocker_enabled:           "AppLocker Policy",
  ps_script_block_logging:     "PowerShell Script Block Logging",
  ps_module_logging:           "PowerShell Module Logging",
  windows_hello:               "Windows Hello",
};

function scoreColor(pct: number) {
  if (pct >= 80) return { text: "#4ade80", bg: "rgba(34,197,94,0.1)",  border: "rgba(34,197,94,0.2)"  };
  if (pct >= 60) return { text: "#fbbf24", bg: "rgba(251,191,36,0.1)", border: "rgba(251,191,36,0.2)" };
  return            { text: "#f87171",  bg: "rgba(239,68,68,0.1)",  border: "rgba(239,68,68,0.2)"  };
}

function ScoreRing({ pct }: { pct: number }) {
  const col     = scoreColor(pct);
  const radius  = 36;
  const circ    = 2 * Math.PI * radius;
  const dash    = (pct / 100) * circ;
  return (
    <svg width={90} height={90} viewBox="0 0 90 90">
      <circle cx={45} cy={45} r={radius} fill="none" stroke="var(--c-border2)" strokeWidth={8} />
      <circle cx={45} cy={45} r={radius} fill="none" stroke={col.text} strokeWidth={8}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        transform="rotate(-90 45 45)" />
      <text x={45} y={45} textAnchor="middle" dominantBaseline="central"
        fill={col.text} fontSize={16} fontWeight="bold">{pct}%</text>
    </svg>
  );
}

function DeviceComplianceCard({ snap }: { snap: Snapshot }) {
  const col    = scoreColor(snap.score_pct);
  const checks = Object.entries(snap.details).filter(([k]) => !k.startsWith("_"));
  const failed = checks.filter(([, v]) => !v);

  return (
    <div className="rounded-xl p-4 space-y-3" style={{ background: "var(--c-card)", border: `1px solid ${col.border}` }}>
      <div className="flex items-center gap-3">
        {snap.os_type === "mac" || snap.os_type === "macos"
          ? <Apple className="w-4 h-4 flex-shrink-0" style={{ color: "#a855f7" }} />
          : <Monitor className="w-4 h-4 flex-shrink-0" style={{ color: "#60a5fa" }} />
        }
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white truncate">{snap.hostname}</p>
          <p className="text-[11px]" style={{ color: "var(--c-muted)" }}>{snap.framework}</p>
        </div>
        <ScoreRing pct={snap.score_pct} />
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        {checks.slice(0, 10).map(([key, val]) => (
          <div key={key} className="flex items-center gap-1.5 text-[11px]">
            <div className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ background: val ? "#4ade80" : "#f87171" }} />
            <span style={{ color: val ? "#94a3b8" : "#f87171" }} className="truncate">
              {CIS_LABELS[key] || key.replace(/_/g, " ")}
            </span>
          </div>
        ))}
      </div>

      {failed.length > 0 && (
        <div className="text-[11px] px-2 py-1 rounded"
          style={{ background: "rgba(239,68,68,0.08)", color: "#f87171" }}>
          {failed.length} control{failed.length > 1 ? "s" : ""} failing
        </div>
      )}

      <p className="text-[10px]" style={{ color: "var(--c-faint)" }}>
        Last check: {new Date(snap.snapshot_at).toLocaleString()}
      </p>
    </div>
  );
}

export default function Compliance() {
  const { data: snapshots = [], isLoading } = useQuery<Snapshot[]>({
    queryKey: ["compliance"],
    queryFn: async () => {
      // Get most recent snapshot per device
      const { data } = await supabase
        .from("compliance_snapshots")
        .select("*")
        .order("snapshot_at", { ascending: false })
        .limit(200);
      if (!data) return [];
      // Deduplicate: keep latest per device
      const seen = new Set<string>();
      return data.filter(s => {
        if (seen.has(s.device_id)) return false;
        seen.add(s.device_id);
        return true;
      });
    },
    refetchInterval: 60_000,
  });

  const { data: deviceScores = [] } = useQuery({
    queryKey: ["device-cis-scores"],
    queryFn: async () => {
      const { data } = await supabase
        .from("devices")
        .select("id, hostname, os_type, cis_score_pct, cis_passed, cis_total")
        .not("cis_score_pct", "is", null);
      return data ?? [];
    },
    refetchInterval: 60_000,
  });

  const avgScore = snapshots.length
    ? Math.round(snapshots.reduce((a, s) => a + s.score_pct, 0) / snapshots.length)
    : 0;
  const passing = snapshots.filter(s => s.score_pct >= 80).length;
  const failing = snapshots.filter(s => s.score_pct < 60).length;
  const macSnaps = snapshots.filter(s => ["mac","macos","darwin"].includes(s.os_type));
  const winSnaps = snapshots.filter(s => s.os_type === "windows");

  return (
    <div className="p-6 space-y-6" style={{ color: "var(--c-text)" }}>
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <ShieldCheck className="w-5 h-5" style={{ color: "#4ade80" }} />
          Compliance
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--c-muted)" }}>
          CIS macOS &amp; Windows Benchmark — per-device control pass/fail
        </p>
      </div>

      {/* Fleet summary */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Fleet Avg Score", value: `${avgScore}%`, color: scoreColor(avgScore).text, bg: scoreColor(avgScore).bg },
          { label: "Passing (≥80%)",  value: passing,        color: "#4ade80", bg: "rgba(34,197,94,0.08)"  },
          { label: "At Risk (<60%)",  value: failing,        color: "#f87171", bg: "rgba(239,68,68,0.08)"  },
          { label: "Devices Audited", value: snapshots.length, color: "#a5b4fc", bg: "rgba(99,102,241,0.08)" },
        ].map(s => (
          <div key={s.label} className="rounded-xl p-4" style={{ background: s.bg, border: `1px solid ${s.color}18` }}>
            <p className="text-[11px] uppercase tracking-wider" style={{ color: s.color }}>{s.label}</p>
            <p className="text-3xl font-bold mt-1" style={{ color: s.color }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* OS breakdown */}
      {(macSnaps.length > 0 || winSnaps.length > 0) && (
        <div className="grid grid-cols-2 gap-4">
          {/* Mac */}
          <div className="rounded-xl p-4 space-y-2" style={{ background: "var(--c-card)", border: "1px solid rgba(168,85,247,0.15)" }}>
            <div className="flex items-center gap-2">
              <Apple className="w-4 h-4" style={{ color: "#a855f7" }} />
              <span className="text-sm font-semibold text-white">macOS Fleet</span>
              <span className="ml-auto text-[11px]" style={{ color: "#a855f7" }}>{macSnaps.length} devices</span>
            </div>
            <div className="text-2xl font-bold" style={{ color: "#a855f7" }}>
              {macSnaps.length ? Math.round(macSnaps.reduce((a,s) => a + s.score_pct, 0) / macSnaps.length) : 0}%
              <span className="text-sm font-normal ml-1" style={{ color: "var(--c-muted)" }}>avg score</span>
            </div>
            <p className="text-[11px]" style={{ color: "var(--c-muted)" }}>Framework: CIS macOS Benchmark</p>
          </div>
          {/* Windows */}
          <div className="rounded-xl p-4 space-y-2" style={{ background: "var(--c-card)", border: "1px solid rgba(96,165,250,0.15)" }}>
            <div className="flex items-center gap-2">
              <Monitor className="w-4 h-4" style={{ color: "#60a5fa" }} />
              <span className="text-sm font-semibold text-white">Windows Fleet</span>
              <span className="ml-auto text-[11px]" style={{ color: "#60a5fa" }}>{winSnaps.length} devices</span>
            </div>
            <div className="text-2xl font-bold" style={{ color: "#60a5fa" }}>
              {winSnaps.length ? Math.round(winSnaps.reduce((a,s) => a + s.score_pct, 0) / winSnaps.length) : 0}%
              <span className="text-sm font-normal ml-1" style={{ color: "var(--c-muted)" }}>avg score</span>
            </div>
            <p className="text-[11px]" style={{ color: "var(--c-muted)" }}>Framework: CIS Windows Benchmark</p>
          </div>
        </div>
      )}

      {/* Device cards */}
      {isLoading ? (
        <div className="p-8 text-center" style={{ color: "var(--c-muted)" }}>Loading compliance data…</div>
      ) : snapshots.length === 0 ? (
        <div className="rounded-xl p-10 text-center" style={{ background: "var(--c-card)", border: "1px solid var(--c-border)" }}>
          <ShieldAlert className="w-10 h-10 mx-auto mb-3" style={{ color: "var(--c-muted)" }} />
          <p className="text-sm font-medium text-white">No compliance data yet</p>
          <p className="text-xs mt-1" style={{ color: "var(--c-muted)" }}>
            Agent v2.0 pushes CIS snapshots every 6 hours. Data appears after the first check.
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4" style={{ color: "var(--c-muted)" }} />
            <span className="text-sm font-semibold text-white">Device Compliance</span>
            <span className="ml-auto text-xs" style={{ color: "var(--c-muted)" }}>{snapshots.length} devices</span>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {[...snapshots].sort((a, b) => a.score_pct - b.score_pct).map(snap => (
              <DeviceComplianceCard key={snap.id} snap={snap} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
