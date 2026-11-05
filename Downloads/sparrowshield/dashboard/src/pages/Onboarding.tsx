import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Shield, Zap, Bell, Eye, Apple, Monitor, Terminal, Download, CheckCircle, ArrowRight, ChevronRight } from "lucide-react";
import { supabase } from "../lib/supabase";

type Platform = "macos" | "windows" | "linux";

const STEPS = ["Welcome", "Platform", "Install", "Waiting"];

function StepDots({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-2 mb-10">
      {STEPS.map((_, i) => (
        <div
          key={i}
          className="rounded-full transition-all duration-300"
          style={{
            width: i === current ? 24 : 8,
            height: 8,
            background: i === current
              ? "var(--c-primary)"
              : i < current
                ? "rgba(46,125,82,0.4)"
                : "var(--c-border)",
          }}
        />
      ))}
    </div>
  );
}

function Step1({ onNext }: { onNext: () => void }) {
  return (
    <div className="flex flex-col items-center text-center max-w-lg w-full">
      <div
        className="w-20 h-20 rounded-2xl flex items-center justify-center mb-6 shadow-lg"
        style={{ background: "linear-gradient(135deg, #1B5E37, #2E7D52)" }}
      >
        <Shield className="w-10 h-10 text-white" />
      </div>

      <h1 className="text-3xl font-bold mb-3" style={{ color: "var(--c-strong)" }}>
        Welcome to SparrowShield
      </h1>
      <p className="text-base mb-10" style={{ color: "var(--c-muted)" }}>
        Cross-platform EDR security in minutes. Monitor your fleet, detect threats, and respond in real time.
      </p>

      <div className="grid grid-cols-3 gap-4 w-full mb-10">
        {[
          { icon: Zap, label: "Threat Detection", desc: "ML-powered behavioural analysis" },
          { icon: Bell, label: "Real-time Alerts", desc: "Slack & email notifications" },
          { icon: Eye, label: "Fleet Visibility", desc: "Every device, one dashboard" },
        ].map(({ icon: Icon, label, desc }) => (
          <div
            key={label}
            className="rounded-xl p-4 flex flex-col items-center gap-2 text-center"
            style={{ background: "var(--c-card-bg, var(--c-sidebar-bg))", border: "1px solid var(--c-border)" }}
          >
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center"
              style={{ background: "rgba(46,125,82,0.15)" }}
            >
              <Icon className="w-4 h-4" style={{ color: "var(--c-primary)" }} />
            </div>
            <p className="text-xs font-semibold" style={{ color: "var(--c-strong)" }}>{label}</p>
            <p className="text-[11px]" style={{ color: "var(--c-muted)" }}>{desc}</p>
          </div>
        ))}
      </div>

      <button
        onClick={onNext}
        className="flex items-center gap-2 px-8 py-3 rounded-xl text-sm font-semibold text-white transition-all"
        style={{ background: "linear-gradient(135deg, #1B5E37, #2E7D52)" }}
        onMouseEnter={e => (e.currentTarget.style.opacity = "0.9")}
        onMouseLeave={e => (e.currentTarget.style.opacity = "1")}
      >
        Get Started <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  );
}

function Step2({ onNext, selected, onSelect }: {
  onNext: () => void;
  selected: Platform | null;
  onSelect: (p: Platform) => void;
}) {
  const platforms: { id: Platform; label: string; icon: React.ElementType; color: string }[] = [
    { id: "macos",   label: "macOS",   icon: Apple,    color: "#a78bfa" },
    { id: "windows", label: "Windows", icon: Monitor,  color: "#60a5fa" },
    { id: "linux",   label: "Linux",   icon: Terminal, color: "#34d399" },
  ];

  return (
    <div className="flex flex-col items-center text-center max-w-lg w-full">
      <h2 className="text-2xl font-bold mb-2" style={{ color: "var(--c-strong)" }}>
        Choose your platform
      </h2>
      <p className="text-sm mb-8" style={{ color: "var(--c-muted)" }}>
        Select the OS to install the SparrowShield sensor on first.
      </p>

      <div className="grid grid-cols-3 gap-4 w-full mb-8">
        {platforms.map(({ id, label, icon: Icon, color }) => (
          <button
            key={id}
            onClick={() => onSelect(id)}
            className="rounded-xl p-6 flex flex-col items-center gap-3 transition-all"
            style={{
              background: "var(--c-card-bg, var(--c-sidebar-bg))",
              border: `2px solid ${selected === id ? color : "var(--c-border)"}`,
              boxShadow: selected === id ? `0 0 0 1px ${color}30` : "none",
            }}
          >
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center"
              style={{ background: selected === id ? `${color}20` : "var(--c-border)" }}
            >
              <Icon className="w-6 h-6" style={{ color: selected === id ? color : "var(--c-muted)" }} />
            </div>
            <span className="text-sm font-semibold" style={{ color: selected === id ? "var(--c-strong)" : "var(--c-muted)" }}>
              {label}
            </span>
            {selected === id && (
              <CheckCircle className="w-4 h-4" style={{ color }} />
            )}
          </button>
        ))}
      </div>

      <button
        onClick={onNext}
        disabled={!selected}
        className="flex items-center gap-2 px-8 py-3 rounded-xl text-sm font-semibold text-white transition-all disabled:opacity-40"
        style={{ background: "linear-gradient(135deg, #1B5E37, #2E7D52)" }}
      >
        Continue <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}

function Step3({ platform, onNext }: { platform: Platform; onNext: () => void }) {
  const info: Record<Platform, { file: string; dl: string; cmd: string }> = {
    macos:   { file: "/agents/SparrowShield-Mac-Install.sh",   dl: "SparrowShield-Mac-Install.sh",   cmd: "sudo bash SparrowShield-Mac-Install.sh" },
    windows: { file: "/agents/SparrowShieldInstaller.bat",     dl: "SparrowShieldInstaller.bat",     cmd: "Run SparrowShieldInstaller.bat as Administrator" },
    linux:   { file: "/agents/SparrowShield-Linux-Install.sh", dl: "SparrowShield-Linux-Install.sh", cmd: "sudo bash SparrowShield-Linux-Install.sh" },
  };
  const { file, dl, cmd } = info[platform];

  function download() {
    fetch(file)
      .then(r => {
        if (!r.ok) { alert("File not available yet — download from GitHub releases."); return null; }
        return r.blob();
      })
      .then(blob => {
        if (!blob) return;
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = dl;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      })
      .catch(() => alert("Download failed. Check your internet connection."));
  }

  const platformLabel = platform === "macos" ? "macOS" : platform === "windows" ? "Windows" : "Linux";

  return (
    <div className="flex flex-col items-center text-center max-w-lg w-full">
      <h2 className="text-2xl font-bold mb-2" style={{ color: "var(--c-strong)" }}>
        Install the {platformLabel} sensor
      </h2>
      <p className="text-sm mb-8" style={{ color: "var(--c-muted)" }}>
        Download the installer and run the command below.
      </p>

      <button
        onClick={download}
        className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-white w-full mb-4 justify-center"
        style={{ background: "linear-gradient(135deg, #1B5E37, #2E7D52)" }}
      >
        <Download className="w-4 h-4" />
        Download {dl}
      </button>

      <div
        className="w-full rounded-xl p-4 mb-8 text-left"
        style={{ background: "rgba(0,0,0,0.3)", border: "1px solid var(--c-border)" }}
      >
        <p className="text-[11px] font-semibold mb-2 uppercase tracking-widest" style={{ color: "var(--c-muted)" }}>
          Run this command
        </p>
        <code className="text-sm font-mono" style={{ color: "#34d399" }}>{cmd}</code>
      </div>

      <div
        className="w-full rounded-xl p-4 mb-8 text-left"
        style={{ background: "rgba(46,125,82,0.08)", border: "1px solid rgba(46,125,82,0.2)" }}
      >
        <p className="text-xs" style={{ color: "var(--c-muted)" }}>
          <span className="font-semibold" style={{ color: "var(--c-primary)" }}>Note: </span>
          {platform === "macos" && "Requires macOS 11+, python3, and root access. The sensor runs as a background daemon."}
          {platform === "windows" && "Requires Windows 10/11 and Administrator rights. The sensor runs as a Windows service."}
          {platform === "linux" && "Requires a systemd-based distro (Ubuntu 20+, Debian 11+, etc.) and root access."}
        </p>
      </div>

      <button
        onClick={onNext}
        className="flex items-center gap-2 px-8 py-3 rounded-xl text-sm font-semibold text-white transition-all"
        style={{ background: "linear-gradient(135deg, #1B5E37, #2E7D52)" }}
      >
        I've installed it <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}

function Step4({ onDone, onSkip }: { onDone: () => void; onSkip: () => void }) {
  const [deviceCount, setDeviceCount] = useState(0);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      while (!cancelled) {
        try {
          const { count } = await supabase
            .from("devices")
            .select("*", { count: "exact", head: true });
          if (!cancelled) {
            setDeviceCount(count ?? 0);
            setChecking(false);
          }
        } catch {
          // ignore
        }
        await new Promise(r => setTimeout(r, 5000));
      }
    }

    poll();
    return () => { cancelled = true; };
  }, []);

  const detected = deviceCount > 0;

  return (
    <div className="flex flex-col items-center text-center max-w-lg w-full">
      <h2 className="text-2xl font-bold mb-2" style={{ color: "var(--c-strong)" }}>
        Waiting for your device
      </h2>
      <p className="text-sm mb-10" style={{ color: "var(--c-muted)" }}>
        Once the sensor starts, your device will appear here automatically.
      </p>

      <div
        className="w-32 h-32 rounded-full flex items-center justify-center mb-8 relative"
        style={{
          border: `3px solid ${detected ? "#34d399" : "var(--c-border)"}`,
          background: detected ? "rgba(52,211,153,0.1)" : "var(--c-card-bg, var(--c-sidebar-bg))",
          transition: "all 0.5s ease",
        }}
      >
        {detected ? (
          <CheckCircle className="w-12 h-12" style={{ color: "#34d399" }} />
        ) : (
          <>
            <div
              className="absolute inset-0 rounded-full animate-ping opacity-20"
              style={{ background: "var(--c-primary)" }}
            />
            <Shield className="w-10 h-10" style={{ color: "var(--c-primary)" }} />
          </>
        )}
      </div>

      {detected ? (
        <>
          <p className="text-lg font-semibold mb-1" style={{ color: "#34d399" }}>
            Your device appeared! 🎉
          </p>
          <p className="text-sm mb-8" style={{ color: "var(--c-muted)" }}>
            {deviceCount} device{deviceCount !== 1 ? "s" : ""} enrolled and reporting.
          </p>
          <button
            onClick={onDone}
            className="flex items-center gap-2 px-8 py-3 rounded-xl text-sm font-semibold text-white"
            style={{ background: "linear-gradient(135deg, #1B5E37, #2E7D52)" }}
          >
            Go to Dashboard <ArrowRight className="w-4 h-4" />
          </button>
        </>
      ) : (
        <>
          <p className="text-sm mb-2" style={{ color: "var(--c-muted)" }}>
            {checking ? "Connecting to database..." : "Listening for devices..."}
          </p>
          <p className="text-xs mb-8" style={{ color: "var(--c-faint, var(--c-muted))" }}>
            Checking every 5 seconds
          </p>
          <button
            onClick={onSkip}
            className="text-xs underline"
            style={{ color: "var(--c-muted)" }}
          >
            Skip for now
          </button>
        </>
      )}
    </div>
  );
}

export default function Onboarding() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [platform, setPlatform] = useState<Platform | null>(null);

  function finish() {
    try { localStorage.setItem("onboarding_done", "1"); } catch { /* ignore */ }
    navigate("/");
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ background: "var(--c-bg)" }}
    >
      <StepDots current={step} />

      <div
        className="w-full max-w-lg flex flex-col items-center"
        style={{ animation: "fadeIn 0.3s ease" }}
      >
        {step === 0 && <Step1 onNext={() => setStep(1)} />}
        {step === 1 && (
          <Step2
            selected={platform}
            onSelect={setPlatform}
            onNext={() => setStep(2)}
          />
        )}
        {step === 2 && platform && (
          <Step3 platform={platform} onNext={() => setStep(3)} />
        )}
        {step === 3 && (
          <Step4 onDone={finish} onSkip={finish} />
        )}
      </div>

      <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }`}</style>
    </div>
  );
}
