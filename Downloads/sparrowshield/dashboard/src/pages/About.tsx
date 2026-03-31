import {
  Shield, Cpu, Activity, Bell, FileText, ShieldCheck, Settings, Download,
  Monitor, Apple, Laptop, Zap, RefreshCw, Package, Bug, Eye, Wifi,
  HardDrive, Battery, Globe, Lock, Users, Terminal, BarChart3, Clock,
  CheckCircle2, ArrowRight, Layers, Database, Server, ChevronDown, ChevronUp,
  Heart, Gauge, Brain, AlertTriangle, Wrench, ListChecks
} from "lucide-react";
import { useState } from "react";

/* ── Accordion Section ── */
function Section({ icon: Icon, title, children, defaultOpen = false }: {
  icon: React.ElementType; title: string; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-slate-700/50 rounded-xl overflow-hidden bg-slate-800/30 backdrop-blur">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-slate-800/50 transition-colors"
      >
        <div className="w-9 h-9 rounded-lg bg-indigo-600/20 flex items-center justify-center flex-shrink-0">
          <Icon className="w-5 h-5 text-indigo-400" />
        </div>
        <span className="flex-1 text-sm font-semibold text-white">{title}</span>
        {open ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
      </button>
      {open && <div className="px-5 pb-5 pt-1">{children}</div>}
    </div>
  );
}

/* ── Feature Card ── */
function FeatureCard({ icon: Icon, title, desc, color }: {
  icon: React.ElementType; title: string; desc: string; color: string;
}) {
  return (
    <div className="flex gap-3 p-3 rounded-lg bg-slate-900/50 border border-slate-700/30">
      <div className={`w-8 h-8 rounded-lg ${color} flex items-center justify-center flex-shrink-0`}>
        <Icon className="w-4 h-4 text-white" />
      </div>
      <div>
        <p className="text-xs font-semibold text-slate-200">{title}</p>
        <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}

/* ── Step Card ── */
function StepCard({ step, title, desc }: { step: number; title: string; desc: string }) {
  return (
    <div className="flex gap-3 items-start">
      <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center flex-shrink-0">
        <span className="text-xs font-bold text-white">{step}</span>
      </div>
      <div>
        <p className="text-xs font-semibold text-slate-200">{title}</p>
        <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}

/* ── Architecture Block ── */
function ArchBlock({ icon: Icon, label, sub, color }: {
  icon: React.ElementType; label: string; sub: string; color: string;
}) {
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${color}`}>
      <Icon className="w-4 h-4" />
      <div>
        <p className="text-[11px] font-semibold">{label}</p>
        <p className="text-[10px] opacity-60">{sub}</p>
      </div>
    </div>
  );
}

export default function About() {
  return (
    <div className="flex-1 overflow-auto p-6 space-y-5">
      {/* ── Header ── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600/20 via-slate-800/80 to-purple-600/20 border border-indigo-500/20 p-8">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-500/10 via-transparent to-transparent" />
        <div className="relative z-10">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-14 h-14 rounded-2xl bg-indigo-600 flex items-center justify-center text-2xl shadow-lg shadow-indigo-600/30">
              🩺
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">SparrowIT</h1>
              <p className="text-sm text-indigo-300">Self-Healing Fleet Management Platform</p>
            </div>
          </div>
          <p className="text-sm text-slate-300 max-w-3xl leading-relaxed">
            SparrowIT (HealSparrow) is a comprehensive IT fleet management tool that monitors, diagnoses, and
            auto-heals your Mac and Windows fleet. It provides real-time device health monitoring, AI-powered
            diagnostics, remote management, compliance mapping, and self-healing remediation — all from a single
            beautiful dashboard.
          </p>
          <div className="flex flex-wrap gap-2 mt-4">
            {["macOS", "Windows", "Real-time", "Self-Healing", "SOC2", "HIPAA", "Remote Management"].map(tag => (
              <span key={tag} className="px-2.5 py-1 rounded-full bg-indigo-600/20 border border-indigo-500/30 text-[11px] font-medium text-indigo-300">
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ── Architecture Overview ── */}
      <Section icon={Layers} title="Architecture Overview" defaultOpen={true}>
        <p className="text-xs text-slate-400 mb-4 leading-relaxed">
          SparrowIT follows a 3-tier architecture: lightweight Python agents on each device, Supabase Edge Functions
          as the serverless backend, and a React dashboard for IT admins.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          <div className="p-4 rounded-xl bg-slate-900/60 border border-blue-500/20">
            <div className="flex items-center gap-2 mb-2">
              <Laptop className="w-5 h-5 text-blue-400" />
              <p className="text-xs font-bold text-blue-400">Device Agents</p>
            </div>
            <ul className="space-y-1.5 text-[11px] text-slate-400">
              <li className="flex items-center gap-1.5"><Apple className="w-3 h-3" /> macOS Agent (Python + psutil)</li>
              <li className="flex items-center gap-1.5"><Monitor className="w-3 h-3" /> Windows Agent (Python + WMI)</li>
              <li className="flex items-center gap-1.5"><Clock className="w-3 h-3" /> Heartbeat every 5 min</li>
              <li className="flex items-center gap-1.5"><RefreshCw className="w-3 h-3" /> Commands poll every 10s</li>
              <li className="flex items-center gap-1.5"><Package className="w-3 h-3" /> Inventory every 60 min</li>
            </ul>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/60 border border-purple-500/20">
            <div className="flex items-center gap-2 mb-2">
              <Server className="w-5 h-5 text-purple-400" />
              <p className="text-xs font-bold text-purple-400">Supabase Backend</p>
            </div>
            <ul className="space-y-1.5 text-[11px] text-slate-400">
              <li className="flex items-center gap-1.5"><Database className="w-3 h-3" /> PostgreSQL (20+ tables)</li>
              <li className="flex items-center gap-1.5"><Zap className="w-3 h-3" /> Edge Functions (Deno/TS)</li>
              <li className="flex items-center gap-1.5"><Bell className="w-3 h-3" /> Real-time subscriptions</li>
              <li className="flex items-center gap-1.5"><Lock className="w-3 h-3" /> Row Level Security</li>
              <li className="flex items-center gap-1.5"><Globe className="w-3 h-3" /> REST API</li>
            </ul>
          </div>

          <div className="p-4 rounded-xl bg-slate-900/60 border border-emerald-500/20">
            <div className="flex items-center gap-2 mb-2">
              <BarChart3 className="w-5 h-5 text-emerald-400" />
              <p className="text-xs font-bold text-emerald-400">React Dashboard</p>
            </div>
            <ul className="space-y-1.5 text-[11px] text-slate-400">
              <li className="flex items-center gap-1.5"><Gauge className="w-3 h-3" /> Fleet Overview & Health</li>
              <li className="flex items-center gap-1.5"><Eye className="w-3 h-3" /> Device Deep Dive (20+ cards)</li>
              <li className="flex items-center gap-1.5"><Brain className="w-3 h-3" /> AI-powered Diagnostics</li>
              <li className="flex items-center gap-1.5"><FileText className="w-3 h-3" /> 24 Downloadable Reports</li>
              <li className="flex items-center gap-1.5"><ShieldCheck className="w-3 h-3" /> Compliance Dashboard</li>
            </ul>
          </div>
        </div>

        {/* Data Flow */}
        <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-700/30">
          <p className="text-[11px] font-semibold text-slate-300 mb-3">Data Flow</p>
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <ArchBlock icon={Laptop} label="Agent" sub="Python" color="border-blue-500/30 text-blue-400 bg-blue-500/10" />
            <ArrowRight className="w-4 h-4 text-slate-600" />
            <ArchBlock icon={Globe} label="Heartbeat API" sub="Edge Function" color="border-yellow-500/30 text-yellow-400 bg-yellow-500/10" />
            <ArrowRight className="w-4 h-4 text-slate-600" />
            <ArchBlock icon={Database} label="Supabase DB" sub="PostgreSQL" color="border-purple-500/30 text-purple-400 bg-purple-500/10" />
            <ArrowRight className="w-4 h-4 text-slate-600" />
            <ArchBlock icon={BarChart3} label="Dashboard" sub="React + Vite" color="border-emerald-500/30 text-emerald-400 bg-emerald-500/10" />
          </div>
        </div>
      </Section>

      {/* ── Core Features ── */}
      <Section icon={Zap} title="Core Features" defaultOpen={true}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          <FeatureCard icon={Heart} title="Real-Time Health Monitoring" desc="Live CPU, memory, disk, battery, temperature, network stats from every device. Health score computed from 6 weighted metrics." color="bg-red-600/80" />
          <FeatureCard icon={Brain} title="AI-Powered Diagnostics" desc="Automatic diagnosis of unhealthy devices with culprit app detection, severity scoring, and actionable recommendations." color="bg-purple-600/80" />
          <FeatureCard icon={Zap} title="Self-Healing Remediation" desc="Auto-remediation rules engine that triggers actions (kill process, optimize memory, restart services) when thresholds are breached." color="bg-amber-600/80" />
          <FeatureCard icon={Terminal} title="Remote Command Execution" desc="Send commands to any device: kill processes, clear caches, optimize memory, restart UI, manage background services." color="bg-blue-600/80" />
          <FeatureCard icon={Package} title="Software Management" desc="Remote install/uninstall via brew cask (Mac), winget/choco (Windows). Software catalog with 12+ pre-configured apps." color="bg-green-600/80" />
          <FeatureCard icon={Shield} title="Software Allowlist / Blocklist" desc="Define approved and banned software lists. Automatic violation detection with per-device tracking and compliance alerts." color="bg-indigo-600/80" />
          <FeatureCard icon={RefreshCw} title="Patch Management" desc="Remote OS update installation. Fleet-wide patch compliance tracking. History of all patches with success/failure status." color="bg-cyan-600/80" />
          <FeatureCard icon={ShieldCheck} title="SOC2 & HIPAA Compliance" desc="Built-in compliance frameworks with control mappings. Fleet-wide compliance scoring. Per-device evaluation against 20+ controls." color="bg-teal-600/80" />
          <FeatureCard icon={Bell} title="Smart Alerts & Notifications" desc="Threshold-based alerts for CPU, memory, disk, battery. Slack integration for real-time IT team notifications." color="bg-orange-600/80" />
          <FeatureCard icon={FileText} title="24 Downloadable Reports" desc="Comprehensive CSV reports: fleet health, inventory, security, compliance, alerts, patches, software violations, and more." color="bg-pink-600/80" />
          <FeatureCard icon={Globe} title="Browser Detection" desc="Detect 12+ browsers across fleet with version, rendering engine, default status, and profile count per device." color="bg-sky-600/80" />
          <FeatureCard icon={Eye} title="Deep Device Inspection" desc="20+ detail cards per device: health gauge, apps, network, security, storage, peripherals, sessions, startup items, crashes, and more." color="bg-violet-600/80" />
        </div>
      </Section>

      {/* ── Feature Status Dashboard ── */}
      <Section icon={ListChecks} title="Feature Status Dashboard (55 Features — 76% Complete)">
        {/* Summary Stats */}
        <div className="grid grid-cols-4 gap-3 mb-5">
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-center">
            <p className="text-2xl font-bold text-emerald-400">42</p>
            <p className="text-[10px] text-emerald-300 font-semibold uppercase tracking-wider">Working</p>
          </div>
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-center">
            <p className="text-2xl font-bold text-amber-400">7</p>
            <p className="text-[10px] text-amber-300 font-semibold uppercase tracking-wider">Partial</p>
          </div>
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-center">
            <p className="text-2xl font-bold text-red-400">6</p>
            <p className="text-[10px] text-red-300 font-semibold uppercase tracking-wider">Not Built</p>
          </div>
          <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-center">
            <p className="text-2xl font-bold text-indigo-400">76%</p>
            <p className="text-[10px] text-indigo-300 font-semibold uppercase tracking-wider">Complete</p>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mb-5">
          <div className="h-3 rounded-full bg-slate-800 overflow-hidden flex">
            <div className="bg-emerald-500 transition-all" style={{ width: "76%" }} />
            <div className="bg-amber-500 transition-all" style={{ width: "13%" }} />
            <div className="bg-red-500 transition-all" style={{ width: "11%" }} />
          </div>
          <div className="flex justify-between mt-1.5 text-[10px] text-slate-500">
            <span>42 Working</span>
            <span>7 Partial</span>
            <span>6 Not Built</span>
          </div>
        </div>

        {/* Feature Table */}
        <div className="overflow-x-auto rounded-xl border border-slate-700/50">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="bg-slate-800/80">
                <th className="text-left py-2.5 px-3 text-slate-400 font-semibold w-8">#</th>
                <th className="text-left py-2.5 px-3 text-slate-400 font-semibold">Feature</th>
                <th className="text-center py-2.5 px-3 text-slate-400 font-semibold hidden md:table-cell">Agent</th>
                <th className="text-center py-2.5 px-3 text-slate-400 font-semibold hidden md:table-cell">Backend</th>
                <th className="text-center py-2.5 px-3 text-slate-400 font-semibold hidden md:table-cell">Database</th>
                <th className="text-center py-2.5 px-3 text-slate-400 font-semibold hidden md:table-cell">Dashboard</th>
                <th className="text-center py-2.5 px-3 text-slate-400 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40">
              {/* ── Core Monitoring ── */}
              <tr className="bg-blue-500/5">
                <td colSpan={7} className="px-3 py-2 text-[11px] font-bold text-blue-400 uppercase tracking-wider">
                  Core Monitoring — 20 Features
                </td>
              </tr>
              {([
                [1,"Device Enrollment","✅","✅","✅","✅","working"],
                [2,"Heartbeat (60+ fields)","✅","✅","✅","✅","working"],
                [3,"CPU Monitoring","✅","✅","✅","✅","working"],
                [4,"RAM Monitoring","✅","✅","✅","✅","working"],
                [5,"Disk Monitoring","✅","✅","✅","✅","working"],
                [6,"Battery Health","✅","✅","✅","✅","working"],
                [7,"WiFi / Network Info","✅","✅","✅","✅","working"],
                [8,"Security Status (6 checks)","✅","✅","✅","✅","working"],
                [9,"Installed Applications","✅","✅","✅","✅","working"],
                [10,"Top Processes (live)","✅","✅","✅","✅","working"],
                [11,"Location Tracking (GPS + IP)","✅","✅","✅","✅","working"],
                [12,"Crash Reports","✅","✅","✅","✅","working"],
                [13,"Thermal / Fan Speed","✅","✅","✅","✅","working"],
                [14,"Memory Pressure","✅","✅","✅","✅","working"],
                [15,"Disk I/O (Read/Write)","✅","✅","✅","✅","working"],
                [16,"Storage Volumes","✅","✅","✅","✅","working"],
                [17,"Time Machine Status","✅","✅","✅","✅","working"],
                [18,"Network Security (Ports/DNS)","✅","✅","✅","✅","working"],
                [19,"Startup Items / Kexts","✅","✅","✅","✅","working"],
                [20,"Peripherals (USB/BT/Display)","✅","✅","✅","✅","working"],
              ] as const).map(([n,name,ag,be,db,da,st]) => (
                <tr key={n} className="hover:bg-slate-800/20">
                  <td className="px-3 py-2 text-slate-600 font-mono">{n}</td>
                  <td className="px-3 py-2 text-slate-300">{name}</td>
                  <td className="px-3 py-2 text-center hidden md:table-cell">{ag}</td>
                  <td className="px-3 py-2 text-center hidden md:table-cell">{be}</td>
                  <td className="px-3 py-2 text-center hidden md:table-cell">{db}</td>
                  <td className="px-3 py-2 text-center hidden md:table-cell">{da}</td>
                  <td className="px-3 py-2 text-center">
                    <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">Working</span>
                  </td>
                </tr>
              ))}

              {/* ── Intelligence & Alerts ── */}
              <tr className="bg-purple-500/5">
                <td colSpan={7} className="px-3 py-2 text-[11px] font-bold text-purple-400 uppercase tracking-wider">
                  Intelligence & Alerts — 8 Features
                </td>
              </tr>
              {([
                [21,"User Sessions & Login History","✅","✅","✅","✅","working"],
                [22,"Pending OS Updates","✅","✅","✅","✅","working"],
                [23,"Screen Lock Status","✅","✅","✅","✅","working"],
                [24,"Alert Generation (auto)","—","✅","✅","✅","working"],
                [25,"Alert Auto-Resolution","—","✅","✅","✅","working"],
                [26,"AI Health Reports (Claude)","—","✅","✅","✅","working"],
                [27,"AI Culprit App Detection","—","✅","✅","✅","working"],
                [28,"24h Metrics Trend Chart","—","—","✅","✅","working"],
              ] as const).map(([n,name,ag,be,db,da,st]) => (
                <tr key={n} className="hover:bg-slate-800/20">
                  <td className="px-3 py-2 text-slate-600 font-mono">{n}</td>
                  <td className="px-3 py-2 text-slate-300">{name}</td>
                  <td className="px-3 py-2 text-center hidden md:table-cell">{ag === "—" ? <span className="text-slate-700">—</span> : ag}</td>
                  <td className="px-3 py-2 text-center hidden md:table-cell">{be === "—" ? <span className="text-slate-700">—</span> : be}</td>
                  <td className="px-3 py-2 text-center hidden md:table-cell">{db}</td>
                  <td className="px-3 py-2 text-center hidden md:table-cell">{da}</td>
                  <td className="px-3 py-2 text-center">
                    <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">Working</span>
                  </td>
                </tr>
              ))}

              {/* ── Remote Management ── */}
              <tr className="bg-amber-500/5">
                <td colSpan={7} className="px-3 py-2 text-[11px] font-bold text-amber-400 uppercase tracking-wider">
                  Remote Management — 10 Features
                </td>
              </tr>
              {([
                [29,"Kill Process (remote)","✅","—","✅","✅","working",null],
                [30,"Optimize Memory","✅","—","✅","✅","working",null],
                [31,"Clear Cache","✅","—","✅","✅","working",null],
                [32,"Restart UI (Dock/Finder)","✅","—","✅","✅","working",null],
                [33,"Kill Background Services","✅","—","✅","✅","working",null],
                [34,"Remote Software Install","✅","—","⚠️","✅","partial","device_commands table gap"],
                [35,"Remote Software Uninstall","✅","—","⚠️","✅","partial","device_commands table gap"],
                [36,"Patch Management","✅","✅","⚠️","✅","partial","device_commands table gap"],
                [37,"Browser Detection (12+)","✅","✅","⚠️","✅","partial","Missing DB column"],
                [38,"Software Allowlist Mode","—","✅","✅","✅","partial","Allowlist logic not in check-alerts"],
              ] as const).map(([n,name,ag,be,db,da,st,note]) => (
                <tr key={n} className="hover:bg-slate-800/20">
                  <td className="px-3 py-2 text-slate-600 font-mono">{n}</td>
                  <td className="px-3 py-2">
                    <span className="text-slate-300">{name}</span>
                    {note && <p className="text-[9px] text-slate-600 mt-0.5">{note}</p>}
                  </td>
                  <td className="px-3 py-2 text-center hidden md:table-cell">{ag === "—" ? <span className="text-slate-700">—</span> : ag}</td>
                  <td className="px-3 py-2 text-center hidden md:table-cell">{be === "—" ? <span className="text-slate-700">—</span> : be}</td>
                  <td className="px-3 py-2 text-center hidden md:table-cell">{db}</td>
                  <td className="px-3 py-2 text-center hidden md:table-cell">{da}</td>
                  <td className="px-3 py-2 text-center">
                    {st === "working" ? (
                      <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">Working</span>
                    ) : (
                      <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/20">Partial</span>
                    )}
                  </td>
                </tr>
              ))}

              {/* ── Compliance & Reporting ── */}
              <tr className="bg-teal-500/5">
                <td colSpan={7} className="px-3 py-2 text-[11px] font-bold text-teal-400 uppercase tracking-wider">
                  Compliance & Reporting — 10 Features
                </td>
              </tr>
              {([
                [39,"SOC2 Compliance Mapping","✅","✅","✅","✅","working",null],
                [40,"HIPAA Compliance Mapping","✅","✅","✅","✅","working",null],
                [41,"Software Blocklist Enforcement","—","⚠️","✅","✅","partial","UI + DB exist, no agent-side detection engine"],
                [42,"Auto-Remediation Rules Engine","—","⚠️","✅","✅","partial","UI + DB + hooks exist, no auto-trigger edge function"],
                [43,"Slack Notifications (multi-event)","—","⚠️","✅","✅","partial","Only approve-command sends Slack, check-alerts doesn't"],
                [44,"Device Offline Detection","—","✅","✅","✅","working",null],
                [45,"24 CSV Reports + Download All","—","—","—","✅","working",null],
                [46,"Fleet Overview Dashboard","—","—","—","✅","working",null],
                [47,"Device List + Search + Filter","—","✅","✅","✅","working",null],
                [48,"Device Delete (cascade)","—","✅","✅","✅","working",null],
              ] as const).map(([n,name,ag,be,db,da,st,note]) => (
                <tr key={n} className="hover:bg-slate-800/20">
                  <td className="px-3 py-2 text-slate-600 font-mono">{n}</td>
                  <td className="px-3 py-2">
                    <span className="text-slate-300">{name}</span>
                    {note && <p className="text-[9px] text-slate-600 mt-0.5">{note}</p>}
                  </td>
                  <td className="px-3 py-2 text-center hidden md:table-cell">{ag === "—" ? <span className="text-slate-700">—</span> : ag}</td>
                  <td className="px-3 py-2 text-center hidden md:table-cell">{be === "—" ? <span className="text-slate-700">—</span> : be}</td>
                  <td className="px-3 py-2 text-center hidden md:table-cell">{db === "—" ? <span className="text-slate-700">—</span> : db}</td>
                  <td className="px-3 py-2 text-center hidden md:table-cell">{da}</td>
                  <td className="px-3 py-2 text-center">
                    {st === "working" ? (
                      <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">Working</span>
                    ) : (
                      <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/20">Partial</span>
                    )}
                  </td>
                </tr>
              ))}

              {/* ── Platform & Infrastructure ── */}
              <tr className="bg-red-500/5">
                <td colSpan={7} className="px-3 py-2 text-[11px] font-bold text-red-400 uppercase tracking-wider">
                  Platform & Infrastructure — 7 Features
                </td>
              </tr>
              {([
                [49,"macOS Agent + LaunchAgent Auto-Start","✅","—","—","—","working",null],
                [50,"Menu Bar App (macOS — rumps)","✅","—","—","—","working",null],
                [51,"Agent Download from Dashboard","—","—","—","✅","working",null],
                [52,"Windows Agent (WMI + PowerShell)","❌","✅","✅","✅","notbuilt","Files exist locally, not deployed"],
                [53,"Login / Authentication","❌","❌","❌","❌","notbuilt","No auth on any route or endpoint"],
                [54,"Role-Based Access Control (RBAC)","❌","❌","❌","❌","notbuilt","Admin vs Viewer vs Agent roles"],
                [55,"Audit Log","❌","❌","❌","❌","notbuilt","Track who did what, when"],
              ] as const).map(([n,name,ag,be,db,da,st,note]) => (
                <tr key={n} className="hover:bg-slate-800/20">
                  <td className="px-3 py-2 text-slate-600 font-mono">{n}</td>
                  <td className="px-3 py-2">
                    <span className="text-slate-300">{name}</span>
                    {note && <p className="text-[9px] text-slate-600 mt-0.5">{note}</p>}
                  </td>
                  <td className="px-3 py-2 text-center hidden md:table-cell">{ag === "—" ? <span className="text-slate-700">—</span> : ag}</td>
                  <td className="px-3 py-2 text-center hidden md:table-cell">{be === "—" ? <span className="text-slate-700">—</span> : be}</td>
                  <td className="px-3 py-2 text-center hidden md:table-cell">{db === "—" ? <span className="text-slate-700">—</span> : db}</td>
                  <td className="px-3 py-2 text-center hidden md:table-cell">{da === "—" ? <span className="text-slate-700">—</span> : da}</td>
                  <td className="px-3 py-2 text-center">
                    {st === "working" ? (
                      <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">Working</span>
                    ) : st === "partial" ? (
                      <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/20">Partial</span>
                    ) : (
                      <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-500/15 text-red-400 border border-red-500/20">Not Built</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Legend */}
        <div className="mt-4 flex flex-wrap gap-4 text-[11px] text-slate-500">
          <span className="flex items-center gap-1.5">✅ = Fully implemented</span>
          <span className="flex items-center gap-1.5">⚠️ = Partial (pipeline gap)</span>
          <span className="flex items-center gap-1.5">❌ = Not built yet</span>
          <span className="flex items-center gap-1.5">— = Not applicable</span>
        </div>

        {/* Problems Solved */}
        <div className="mt-5 p-4 rounded-xl bg-slate-900/40 border border-slate-700/20">
          <p className="text-xs font-bold text-white mb-3">Problems SparrowIT Solves</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {[
              { problem: '"My laptop is slow" — #1 IT helpdesk ticket', solution: 'Real-time health scores, culprit app detection, 1-click optimizer' },
              { problem: 'No visibility into fleet health', solution: 'Fleet Overview dashboard with color-coded device health grid' },
              { problem: 'Reactive IT instead of proactive', solution: 'Auto-remediation rules fix issues before users notice' },
              { problem: 'Shadow IT / unauthorized software', solution: 'Software blocklist with auto-detection and Slack alerts' },
              { problem: 'SOC2/HIPAA audit nightmares', solution: 'Compliance dashboard evaluates 400 devices in seconds' },
              { problem: 'Patch management chaos', solution: 'Remote OS updates with fleet-wide compliance tracking' },
              { problem: 'No centralized software deployment', solution: 'Software catalog with 1-click remote install via brew/winget' },
              { problem: 'JumpCloud MDM gaps', solution: '30+ real-time metrics, AI diagnostics, self-healing — things JumpCloud cannot do' },
              { problem: 'Security blind spots', solution: 'FileVault, Firewall, SIP, Gatekeeper, AV checked every heartbeat' },
              { problem: 'Offline / ghost devices', solution: 'Heartbeat monitoring flags devices that go dark' },
              { problem: 'No reporting for management', solution: '24 downloadable CSV reports with 1-click Download All' },
              { problem: 'Multi-OS management headache', solution: 'Single dashboard for Mac + Windows with unified data' },
            ].map(({ problem, solution }) => (
              <div key={problem} className="p-2.5 rounded-lg bg-slate-800/40 border border-slate-700/20">
                <p className="text-[11px] font-semibold text-red-400 mb-0.5">{problem}</p>
                <p className="text-[10px] text-slate-400">{solution}</p>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* ── Monitoring Capabilities ── */}
      <Section icon={Activity} title="Monitoring Capabilities (30+ Metrics)">
        <p className="text-xs text-slate-400 mb-3 leading-relaxed">
          Each agent collects 30+ system metrics every heartbeat cycle. Data powers health scoring, AI diagnosis, alerts, and compliance checks.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {[
            { icon: Cpu, label: "CPU Usage & Load Average", color: "text-blue-400" },
            { icon: Activity, label: "Memory Usage & Pressure", color: "text-green-400" },
            { icon: HardDrive, label: "Disk Usage & Health (SMART)", color: "text-amber-400" },
            { icon: Battery, label: "Battery Level & Cycle Count", color: "text-emerald-400" },
            { icon: Wifi, label: "Network Speed & Wi-Fi Signal", color: "text-cyan-400" },
            { icon: Gauge, label: "System Temperature (CPU/GPU)", color: "text-red-400" },
            { icon: Lock, label: "FileVault / BitLocker Encryption", color: "text-indigo-400" },
            { icon: Shield, label: "Firewall & Gatekeeper Status", color: "text-purple-400" },
            { icon: Bug, label: "SIP / Antivirus / Defender Status", color: "text-pink-400" },
            { icon: RefreshCw, label: "Pending OS Updates Count", color: "text-teal-400" },
            { icon: Clock, label: "Uptime & Last Boot Time", color: "text-orange-400" },
            { icon: Users, label: "Active User Sessions", color: "text-sky-400" },
            { icon: Package, label: "Installed Apps & Versions", color: "text-lime-400" },
            { icon: Globe, label: "Installed Browsers & Engines", color: "text-violet-400" },
            { icon: Wrench, label: "Startup Items & Launch Agents", color: "text-fuchsia-400" },
            { icon: Terminal, label: "USB & Peripheral Devices", color: "text-yellow-400" },
            { icon: AlertTriangle, label: "Recent Crash Reports", color: "text-rose-400" },
            { icon: Wifi, label: "Open Ports & DNS Servers", color: "text-blue-300" },
            { icon: Lock, label: "Screen Lock & Auto-Lock Timer", color: "text-indigo-300" },
            { icon: HardDrive, label: "Storage Breakdown (System/Apps/User)", color: "text-amber-300" },
            { icon: Monitor, label: "Windows Domain Join & Activation", color: "text-slate-300" },
          ].map(({ icon: I, label, color }) => (
            <div key={label} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-900/40 border border-slate-700/20">
              <I className={`w-3.5 h-3.5 ${color}`} />
              <span className="text-[11px] text-slate-300">{label}</span>
            </div>
          ))}
        </div>
      </Section>

      {/* ── Dashboard Pages ── */}
      <Section icon={BarChart3} title="Dashboard Pages Guide">
        <div className="space-y-4">
          {[
            {
              title: "Fleet Overview", icon: Gauge, color: "text-indigo-400",
              desc: "Bird's-eye view of your entire fleet. Shows fleet health score, online/offline/critical device counts, device health grid with color-coded tiles, and real-time metrics trends.",
              tips: ["Click any device tile to drill into device detail", "Health score is weighted: CPU 20%, Memory 25%, Disk 20%, Battery 10%, Temp 15%, Uptime 10%", "Auto-refreshes every 30 seconds"]
            },
            {
              title: "Device List", icon: Laptop, color: "text-blue-400",
              desc: "Sortable, filterable table of all enrolled devices with hostname, OS, status, health score, last seen time, and quick actions.",
              tips: ["Search by hostname or serial number", "Filter by OS (macOS/Windows), status (Online/Offline/Critical)", "Click any row to view full device details"]
            },
            {
              title: "Device Detail", icon: Eye, color: "text-purple-400",
              desc: "Deep dive into any device with 20+ information cards covering every aspect of the machine — from hardware specs to security posture.",
              tips: ["Health Gauge shows real-time score with color coding", "AI Diagnosis card auto-detects issues and suggests fixes", "Send remote commands (kill process, optimize memory, install updates)", "Browser card shows all installed browsers with versions and engines"]
            },
            {
              title: "Alerts", icon: Bell, color: "text-amber-400",
              desc: "Central alert management showing all triggered alerts with severity levels, device info, metric values, and acknowledgment status.",
              tips: ["Alerts auto-trigger when metrics exceed configured thresholds", "Acknowledge alerts to track IT response", "Slack notifications sent in real-time for critical alerts"]
            },
            {
              title: "Reports", icon: FileText, color: "text-emerald-400",
              desc: "24 downloadable CSV reports organized into 6 categories: Fleet Health, Inventory, Security, Alerts, Compliance, and Software.",
              tips: ["Download individual reports or use 'Download All' for a complete export", "Reports generate from live data — always up to date", "Categories: Fleet Health (4), Inventory (5), Security (4), Alerts (3), Compliance (4), Software (4)"]
            },
            {
              title: "Compliance", icon: ShieldCheck, color: "text-teal-400",
              desc: "SOC2 and HIPAA compliance dashboard with framework selector, fleet-wide compliance score, controls table, and per-device compliance status.",
              tips: ["Switch between SOC2 and HIPAA frameworks", "Controls map to specific device fields (encryption, firewall, etc.)", "Click 'Evaluate Now' to run compliance checks against all devices", "Score color: Green >80%, Amber >60%, Red <60%"]
            },
            {
              title: "Settings", icon: Settings, color: "text-slate-400",
              desc: "Configuration center with 4 tabs: Slack Notifications, Auto-Remediation Rules, Software Allowlist/Blocklist, and Software Catalog.",
              tips: ["Slack tab: Configure webhook URL and alert thresholds", "Remediation tab: Create rules like 'if CPU > 90% for 3 beats, kill top process'", "Software Lists tab: Add apps to allowlist or blocklist", "Catalog tab: Pre-configured software packages for remote deployment"]
            },
          ].map(({ title, icon: I, color, desc, tips }) => (
            <div key={title} className="p-4 rounded-xl bg-slate-900/40 border border-slate-700/20">
              <div className="flex items-center gap-2 mb-2">
                <I className={`w-4 h-4 ${color}`} />
                <p className="text-xs font-bold text-white">{title}</p>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed mb-2">{desc}</p>
              <ul className="space-y-1">
                {tips.map(tip => (
                  <li key={tip} className="flex items-start gap-1.5 text-[11px] text-slate-500">
                    <CheckCircle2 className="w-3 h-3 text-emerald-500 mt-0.5 flex-shrink-0" />
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>

      {/* ── Agent Setup Guide ── */}
      <Section icon={Download} title="Agent Setup Guide">
        <div className="space-y-5">
          {/* macOS */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Apple className="w-4 h-4 text-slate-300" />
              <p className="text-xs font-bold text-white">macOS Agent Installation</p>
            </div>
            <div className="space-y-3">
              <StepCard step={1} title="Download the Agent" desc="Click 'Download Agent → macOS Agent' from the sidebar. This downloads a ZIP with agent_mac.py, menubar_mac.py, and config.json." />
              <StepCard step={2} title="Unzip & Configure" desc="Unzip to any folder (recommended: ~/sparrow-agent/). Edit config.json with your Supabase URL and anon key if needed." />
              <StepCard step={3} title="Install Dependencies" desc="Run: pip3 install psutil requests rumps plistlib. These are the required Python packages." />
              <StepCard step={4} title="Run the Agent" desc="Run: python3 agent_mac.py — The agent auto-enrolls, starts heartbeats, and begins monitoring. It also installs a LaunchAgent for auto-start on boot." />
              <StepCard step={5} title="Menu Bar App (Optional)" desc="Run: python3 menubar_mac.py — Adds a system tray icon with quick actions: Optimize All, Memory Check, Security Check, Disk Health, Raise IT Ticket." />
            </div>
            <div className="mt-3 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <p className="text-[11px] text-blue-300 leading-relaxed">
                <strong>Auto-start:</strong> The agent creates a LaunchAgent plist at ~/Library/LaunchAgents/ so it starts automatically on login. To stop: <code className="bg-blue-900/30 px-1 rounded">launchctl unload ~/Library/LaunchAgents/com.sparrowshield.agent.plist</code>
              </p>
            </div>
          </div>

          {/* Windows */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Monitor className="w-4 h-4 text-blue-400" />
              <p className="text-xs font-bold text-white">Windows Agent Installation</p>
            </div>
            <div className="space-y-3">
              <StepCard step={1} title="Download the Agent" desc="Click 'Download Agent → Windows Agent' from the sidebar. This downloads a ZIP with agent_windows.py, tray_windows.py, and config.json." />
              <StepCard step={2} title="Unzip & Configure" desc="Unzip to C:\SparrowIT\ or any folder. Edit config.json with your Supabase URL and anon key if needed." />
              <StepCard step={3} title="Install Dependencies" desc="Run: pip install psutil requests wmi pystray Pillow. WMI is Windows-only. Pillow is for tray icon rendering." />
              <StepCard step={4} title="Run as Administrator" desc="Right-click → Run as Administrator: python agent_windows.py — Admin is needed for WMI queries, firewall checks, and update management." />
              <StepCard step={5} title="System Tray App (Optional)" desc="Run: python tray_windows.py — Adds a system tray icon with quick actions identical to the macOS menu bar app." />
            </div>
            <div className="mt-3 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <p className="text-[11px] text-blue-300 leading-relaxed">
                <strong>Auto-start:</strong> Create a Scheduled Task or add to registry HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Run for auto-start on login.
              </p>
            </div>
          </div>
        </div>
      </Section>

      {/* ── Uninstall Guide ── */}
      <Section icon={AlertTriangle} title="Uninstall SparrowIT Agent">
        <div className="space-y-5">
          {/* macOS */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Apple className="w-4 h-4 text-slate-300" />
              <p className="text-xs font-bold text-white">macOS — Remove Agent</p>
            </div>
            <div className="space-y-2">
              {[
                { step: 1, title: "Stop the Agent", cmd: "launchctl unload ~/Library/LaunchAgents/com.sparrowshield.agent.plist" },
                { step: 2, title: "Remove Auto-Start", cmd: "rm ~/Library/LaunchAgents/com.sparrowshield.agent.plist" },
                { step: 3, title: "Delete Agent Files", cmd: "rm -rf ~/.sparrow-agent/" },
                { step: 4, title: "Kill Menu Bar App", cmd: "pkill -f menubar_mac.py" },
                { step: 5, title: "Remove Source (optional)", cmd: "rm -rf ~/Downloads/sparrowshield-mac-agent/" },
              ].map(({ step, title, cmd }) => (
                <div key={step} className="flex gap-3 items-start">
                  <div className="w-6 h-6 rounded-full bg-red-600/80 flex items-center justify-center flex-shrink-0">
                    <span className="text-[10px] font-bold text-white">{step}</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-[11px] font-semibold text-slate-200">{title}</p>
                    <code className="block mt-1 text-[10px] text-red-300 bg-red-900/20 px-2 py-1.5 rounded border border-red-500/20 font-mono">{cmd}</code>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Windows */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Monitor className="w-4 h-4 text-blue-400" />
              <p className="text-xs font-bold text-white">Windows — Remove Agent</p>
            </div>
            <div className="space-y-2">
              {[
                { step: 1, title: "Stop the Agent", cmd: 'taskkill /F /IM python.exe /FI "WINDOWTITLE eq agent_windows*"' },
                { step: 2, title: "Remove Auto-Start (Registry)", cmd: 'reg delete "HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run" /v SparrowIT /f' },
                { step: 3, title: "Remove Scheduled Task", cmd: 'schtasks /Delete /TN "SparrowIT Agent" /F' },
                { step: 4, title: "Kill System Tray App", cmd: 'taskkill /F /IM python.exe /FI "WINDOWTITLE eq tray_windows*"' },
                { step: 5, title: "Delete Agent Files", cmd: "rmdir /S /Q C:\\SparrowIT\\" },
              ].map(({ step, title, cmd }) => (
                <div key={step} className="flex gap-3 items-start">
                  <div className="w-6 h-6 rounded-full bg-red-600/80 flex items-center justify-center flex-shrink-0">
                    <span className="text-[10px] font-bold text-white">{step}</span>
                  </div>
                  <div className="flex-1">
                    <p className="text-[11px] font-semibold text-slate-200">{title}</p>
                    <code className="block mt-1 text-[10px] text-red-300 bg-red-900/20 px-2 py-1.5 rounded border border-red-500/20 font-mono">{cmd}</code>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Remove from Dashboard */}
          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <p className="text-[11px] text-amber-300 leading-relaxed">
              <strong>Remove from Dashboard:</strong> After uninstalling the agent, the device will show as "Offline". Go to Device Detail → click <strong>Delete Device</strong> to permanently remove it and all associated data (metrics, alerts, history).
            </p>
          </div>
        </div>
      </Section>

      {/* ── Remote Commands ── */}
      <Section icon={Terminal} title="Remote Commands Available">
        <p className="text-xs text-slate-400 mb-3 leading-relaxed">
          Send commands to any device from the Device Detail page. The agent polls for commands every 10 seconds and executes them immediately.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {[
            { cmd: "kill_process", desc: "Kill a specific process by name or PID", platform: "Mac + Win" },
            { cmd: "optimize_memory", desc: "Force memory cleanup: purge caches, kill heavy processes", platform: "Mac + Win" },
            { cmd: "clear_cache", desc: "Clear system caches, browser caches, temp files", platform: "Mac + Win" },
            { cmd: "restart_ui", desc: "Restart Finder/Explorer, Dock/Taskbar, SystemUIServer", platform: "Mac + Win" },
            { cmd: "kill_background_services", desc: "Kill non-essential background processes consuming resources", platform: "Mac + Win" },
            { cmd: "install_software", desc: "Install software via brew/winget/choco/DMG/PKG/MSI", platform: "Mac + Win" },
            { cmd: "uninstall_software", desc: "Remove software and clean up leftover files", platform: "Mac + Win" },
            { cmd: "install_updates", desc: "Install pending OS and software updates", platform: "Mac + Win" },
          ].map(({ cmd, desc, platform }) => (
            <div key={cmd} className="flex items-start gap-3 p-3 rounded-lg bg-slate-900/40 border border-slate-700/20">
              <Terminal className="w-4 h-4 text-indigo-400 mt-0.5 flex-shrink-0" />
              <div>
                <div className="flex items-center gap-2">
                  <code className="text-[11px] font-mono text-indigo-300 bg-indigo-900/30 px-1.5 py-0.5 rounded">{cmd}</code>
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-slate-700 text-slate-400">{platform}</span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* ── Compliance Frameworks ── */}
      <Section icon={ListChecks} title="Compliance Frameworks">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 rounded-xl bg-slate-900/40 border border-blue-500/20">
            <p className="text-xs font-bold text-blue-400 mb-2">SOC2 Controls</p>
            <ul className="space-y-1.5 text-[11px] text-slate-400">
              <li><strong className="text-slate-300">CC6.1</strong> — Encryption at rest (FileVault/BitLocker)</li>
              <li><strong className="text-slate-300">CC6.6</strong> — Firewall enabled</li>
              <li><strong className="text-slate-300">CC6.7</strong> — Screen lock within 5 min</li>
              <li><strong className="text-slate-300">CC6.8</strong> — Software up to date (≤5 pending)</li>
              <li><strong className="text-slate-300">CC7.1</strong> — SIP / Gatekeeper enabled</li>
              <li><strong className="text-slate-300">CC7.2</strong> — Antivirus / Defender active</li>
              <li><strong className="text-slate-300">CC8.1</strong> — Device heartbeat within 24h</li>
              <li><strong className="text-slate-300">CC9.1</strong> — No banned software installed</li>
            </ul>
          </div>
          <div className="p-4 rounded-xl bg-slate-900/40 border border-emerald-500/20">
            <p className="text-xs font-bold text-emerald-400 mb-2">HIPAA Technical Safeguards</p>
            <ul className="space-y-1.5 text-[11px] text-slate-400">
              <li><strong className="text-slate-300">§164.312(a)(1)</strong> — Access control (screen lock)</li>
              <li><strong className="text-slate-300">§164.312(a)(2)(iv)</strong> — Encryption at rest</li>
              <li><strong className="text-slate-300">§164.312(c)(1)</strong> — Integrity (SIP enabled)</li>
              <li><strong className="text-slate-300">§164.312(d)</strong> — Authentication (password required)</li>
              <li><strong className="text-slate-300">§164.312(e)(1)</strong> — Transmission security (firewall)</li>
              <li><strong className="text-slate-300">§164.312(e)(2)(ii)</strong> — Encryption in transit</li>
              <li><strong className="text-slate-300">§164.308(a)(5)</strong> — OS updates current</li>
              <li><strong className="text-slate-300">§164.308(a)(6)</strong> — Security incident (heartbeat fresh)</li>
            </ul>
          </div>
        </div>
      </Section>

      {/* ── Auto-Remediation ── */}
      <Section icon={Wrench} title="Auto-Remediation Rules Engine">
        <p className="text-xs text-slate-400 mb-3 leading-relaxed">
          Create rules that automatically fix issues when device metrics breach thresholds. Rules run server-side during heartbeat processing.
        </p>
        <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-700/20 mb-3">
          <p className="text-[11px] font-semibold text-slate-300 mb-2">How It Works</p>
          <div className="space-y-2">
            <StepCard step={1} title="Define a Rule" desc="Set a metric (cpu_percent, memory_percent, etc.), operator (>, <, =), threshold, and consecutive beats required." />
            <StepCard step={2} title="Choose an Action" desc="Actions: kill_process, optimize_memory, clear_cache, restart_ui, install_updates, or any custom command." />
            <StepCard step={3} title="Set Scope & Cooldown" desc="Apply to all devices, specific OS, or individual devices. Set cooldown (e.g., 30 min) to prevent action spam." />
            <StepCard step={4} title="Auto-Trigger" desc="When heartbeat arrives, check-alerts evaluates all rules. If conditions met for N consecutive beats, command is dispatched automatically." />
          </div>
        </div>
        <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <p className="text-[11px] text-amber-300 leading-relaxed">
            <strong>Example Rule:</strong> "If CPU &gt; 90% for 3 consecutive heartbeats, send optimize_memory command with 30-minute cooldown."
          </p>
        </div>
      </Section>

      {/* ── Reports List ── */}
      <Section icon={FileText} title="All 24 Reports">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {[
            { cat: "Fleet Health", color: "text-emerald-400", reports: ["Fleet Health Summary", "Device Health Trends", "Offline Devices", "Critical Devices"] },
            { cat: "Inventory", color: "text-blue-400", reports: ["Hardware Inventory", "Software Inventory", "OS Distribution", "Browser Inventory", "Network Inventory"] },
            { cat: "Security", color: "text-red-400", reports: ["Security Posture", "Encryption Status", "Firewall Compliance", "Pending Updates"] },
            { cat: "Alerts", color: "text-amber-400", reports: ["Active Alerts", "Alert History", "Alert Frequency"] },
            { cat: "Compliance", color: "text-purple-400", reports: ["SOC2 Compliance", "HIPAA Compliance", "Software Violations", "Remediation History"] },
            { cat: "Software", color: "text-pink-400", reports: ["Software Deployments", "Patch Compliance", "Blocklist Violations", "License Summary"] },
          ].map(({ cat, color, reports }) => (
            <div key={cat} className="p-3 rounded-lg bg-slate-900/40 border border-slate-700/20">
              <p className={`text-[11px] font-bold ${color} mb-2`}>{cat}</p>
              <ul className="space-y-1">
                {reports.map(r => (
                  <li key={r} className="flex items-center gap-1.5 text-[11px] text-slate-400">
                    <FileText className="w-3 h-3 text-slate-600" />
                    {r}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>

      {/* ── Tech Stack ── */}
      <Section icon={Layers} title="Technology Stack">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {[
            { label: "Frontend", items: "React 18, Vite, TypeScript, TailwindCSS, TanStack Query, Recharts, Lucide Icons" },
            { label: "Backend", items: "Supabase Edge Functions (Deno/TypeScript), PostgreSQL, Row Level Security, Real-time Subscriptions" },
            { label: "macOS Agent", items: "Python 3, psutil, requests, rumps (menubar), plistlib, subprocess, launchctl" },
            { label: "Windows Agent", items: "Python 3, psutil, WMI, pystray, Pillow, winreg, PowerShell, netsh" },
            { label: "Notifications", items: "Slack Webhooks (configurable per-channel, per-threshold)" },
            { label: "Deployment", items: "Supabase Cloud, GitHub, LaunchAgents (macOS), Scheduled Tasks (Windows)" },
          ].map(({ label, items }) => (
            <div key={label} className="p-3 rounded-lg bg-slate-900/40 border border-slate-700/20">
              <p className="text-[11px] font-bold text-indigo-400 mb-1">{label}</p>
              <p className="text-[11px] text-slate-400 leading-relaxed">{items}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* ── JumpCloud Comparison ── */}
      <Section icon={Shield} title="Why SparrowIT over JumpCloud?">
        <p className="text-xs text-slate-400 mb-3 leading-relaxed">
          SparrowIT fills critical gaps that JumpCloud's MDM doesn't cover — real-time health monitoring, AI diagnostics, and self-healing.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left py-2 px-3 text-slate-400 font-semibold">Capability</th>
                <th className="text-center py-2 px-3 text-slate-400 font-semibold">JumpCloud</th>
                <th className="text-center py-2 px-3 text-indigo-400 font-semibold">SparrowIT</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {[
                ["Real-time CPU/Memory/Temp monitoring", "❌", "✅"],
                ["AI-powered diagnostics", "❌", "✅"],
                ["Self-healing remediation rules", "❌", "✅"],
                ["Device health scoring", "❌", "✅"],
                ["Culprit app detection", "❌", "✅"],
                ["Remote kill process / optimize memory", "❌", "✅"],
                ["Software allowlist / blocklist", "❌", "✅"],
                ["Remote software install/uninstall", "Partial", "✅"],
                ["SOC2 + HIPAA compliance mapping", "Partial", "✅"],
                ["Browser detection with engine info", "❌", "✅"],
                ["24 downloadable reports", "Limited", "✅"],
                ["Slack alert notifications", "Partial", "✅"],
                ["System tray / menu bar app", "❌", "✅"],
                ["Fleet health trend charts", "❌", "✅"],
                ["Open ports & network security", "❌", "✅"],
              ].map(([cap, jc, ss]) => (
                <tr key={cap} className="hover:bg-slate-800/30">
                  <td className="py-2 px-3 text-slate-300">{cap}</td>
                  <td className="py-2 px-3 text-center">{jc}</td>
                  <td className="py-2 px-3 text-center">{ss}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* ── Footer ── */}
      <div className="text-center py-6">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-800/50 border border-slate-700/30">
          <span className="text-lg">🩺</span>
          <span className="text-xs text-slate-400">
            <strong className="text-white">SparrowIT v1.0</strong> — Built for IT teams managing 400+ devices
          </span>
        </div>
        <p className="text-[10px] text-slate-600 mt-2">Self-Healing Fleet Management • macOS + Windows • Real-time Monitoring • AI Diagnostics</p>
      </div>
    </div>
  );
}
