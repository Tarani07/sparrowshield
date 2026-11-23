import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "./lib/ThemeContext";
import { AuthProvider, useAuth } from "./lib/AuthContext";
import { ShieldOff, Eye } from "lucide-react";
import { RealtimeProvider } from "./lib/realtime";
import Sidebar from "./components/layout/Sidebar";
import FleetOverview from "./pages/FleetOverview";
import DeviceDetail from "./pages/DeviceDetail";
import DeviceList from "./pages/DeviceList";
import Settings from "./pages/Settings";
import Reports from "./pages/Reports";
import Compliance from "./pages/Compliance";
import VulnerabilityManager from "./pages/VulnerabilityManager";
import About from "./pages/About";
import PatchManager from "./pages/PatchManager";
import AlertCenter from "./pages/AlertCenter";
import ProcessTree from "./pages/ProcessTree";
import LiveAlerts from "./pages/LiveAlerts";
import MitreMatrix from "./pages/MitreMatrix";
import Login from "./pages/Login";
import Onboarding from "./pages/Onboarding";

// macOS
import MacDevices from "./pages/mac/MacDevices";
import MacAV from "./pages/mac/MacAV";
import MacEDR from "./pages/mac/MacEDR";
import MacNetwork from "./pages/mac/MacNetwork";


// Windows
import WindowsDevices from "./pages/windows/WindowsDevices";
import WindowsAV from "./pages/windows/WindowsAV";
import WindowsEDR from "./pages/windows/WindowsEDR";
import HostIsolation from "./pages/windows/HostIsolation";

// Shared AV + EDR
import AVScanner from "./pages/av/AVScanner";
import Quarantine from "./pages/av/Quarantine";
import Definitions from "./pages/av/Definitions";
import Detections from "./pages/edr/Detections";
import DetectionRules from "./pages/edr/DetectionRules";
import ProcessMonitor from "./pages/edr/ProcessMonitor";
import NetworkActivity from "./pages/edr/NetworkActivity";
import ExecutiveSummary from "./pages/ExecutiveSummary";
import PolicyManager from "./pages/PolicyManager";
import ThreatHunt from "./pages/ThreatHunt";
import AppFilter from "./pages/AppFilter";
import WebFilter from "./pages/WebFilter";
import DeviceGroups from "./pages/DeviceGroups";
import ITNotices from "./pages/ITNotices";
import UsersAccess from "./pages/UsersAccess";
import AuditLog from "./pages/AuditLog";

function NoAccess() {
  const { user, signOut } = useAuth();
  return (
    <div className="flex h-screen items-center justify-center p-6" style={{ background: "var(--c-bg)" }}>
      <div className="max-w-md w-full rounded-lg border p-6 text-center" style={{ background: "var(--c-card)", borderColor: "var(--c-border)" }}>
        <ShieldOff className="w-8 h-8 mx-auto mb-3" style={{ color: "var(--sev-high)" }} />
        <h1 className="text-[17px] font-semibold" style={{ color: "var(--c-strong)" }}>No access to this console</h1>
        <p className="mt-2 text-[13px]" style={{ color: "var(--c-muted)" }}>
          You're signed in as <b style={{ color: "var(--c-text)" }}>{user?.email}</b>, but this account hasn't been invited.
          Ask a SparrowShield admin to add you under Settings → Users &amp; roles.
        </p>
        <button onClick={signOut} className="mt-5 h-8 px-3 rounded-md border text-[13px] font-medium"
          style={{ background: "var(--c-card2)", borderColor: "var(--c-border2)", color: "var(--c-strong)" }}>
          Sign out
        </button>
      </div>
    </div>
  );
}

function ProtectedLayout() {
  const { session, loading, role, roleLoading } = useAuth();

  if (loading || (session && roleLoading)) return (
    <div className="flex h-screen items-center justify-center" style={{ background: "var(--c-bg)" }}>
      <div className="w-8 h-8 rounded-full border-2 animate-spin"
        style={{ borderColor: "var(--c-border2)", borderTopColor: "var(--c-primary)" }} />
    </div>
  );

  // Local design previews only: `import.meta.env.DEV` is false in every production build,
  // so this can never skip login on the deployed dashboard.
  const devPreview = import.meta.env.DEV && import.meta.env.VITE_DEV_NO_AUTH === "1";
  if (!session && !devPreview) return <Navigate to="/login" replace />;
  if (session && !role) return <NoAccess />;

  return (
    <RealtimeProvider>
    <div className="flex h-screen overflow-hidden font-sans" style={{ background: "var(--c-bg)" }}>
      <Sidebar />
      <main className="flex-1 lg:ml-60 flex flex-col overflow-y-auto min-w-0" data-readonly={role === "viewer" ? "" : undefined}>
        {role === "viewer" && (
          <div className="px-4 py-1.5 text-[12px] text-center border-b" style={{ background: "var(--c-accent-bg)", borderColor: "var(--c-border)", color: "var(--c-text)" }}>
            <Eye className="inline w-3.5 h-3.5 mr-1 -mt-0.5" /> Read-only access — you can view everything but changes are disabled. Ask an admin for edit rights.
          </div>
        )}
        <Routes>
          <Route path="/" element={<FleetOverview />} />
          <Route path="/devices" element={<DeviceList />} />
          <Route path="/device/:id" element={<DeviceDetail />} />


          <Route path="/mac/devices" element={<DeviceList os="mac" />} />
          <Route path="/mac/av" element={<MacAV />} />
          <Route path="/mac/edr" element={<MacEDR />} />
          <Route path="/mac/network" element={<MacNetwork />} />

          <Route path="/windows/devices" element={<DeviceList os="windows" />} />
          <Route path="/windows/av" element={<WindowsAV />} />
          <Route path="/windows/edr" element={<WindowsEDR />} />
          <Route path="/windows/isolation" element={<HostIsolation />} />

          <Route path="/av/scanner" element={<AVScanner />} />
          <Route path="/av/quarantine" element={<Quarantine />} />
          <Route path="/av/definitions" element={<Definitions />} />
          <Route path="/edr/detections" element={<Detections />} />
          <Route path="/edr/rules" element={<DetectionRules />} />
          <Route path="/edr/processes" element={<ProcessMonitor />} />
          <Route path="/edr/network" element={<NetworkActivity />} />

          <Route path="/alerts" element={<AlertCenter />} />
          <Route path="/process-tree" element={<ProcessTree />} />
          <Route path="/live-alerts" element={<LiveAlerts />} />

          <Route path="/mitre" element={<MitreMatrix />} />
          <Route path="/patches" element={<PatchManager />} />
          <Route path="/compliance" element={<Compliance />} />
          <Route path="/vulnerabilities" element={<VulnerabilityManager />} />
          <Route path="/reports" element={<Reports />} />

          <Route path="/executive"    element={<ExecutiveSummary />} />
          <Route path="/threat-hunt"  element={<ThreatHunt />} />
          <Route path="/policy"       element={<PolicyManager />} />
          <Route path="/web-filter"   element={<WebFilter />} />
          <Route path="/app-filter"   element={<AppFilter />} />
          <Route path="/groups"       element={<DeviceGroups />} />
          <Route path="/notices"      element={<ITNotices />} />
          <Route path="/users"        element={<UsersAccess />} />
          <Route path="/audit"        element={<AuditLog />} />

          <Route path="/settings" element={<Settings />} />
          <Route path="/about" element={<About />} />
          <Route path="/onboarding" element={<Onboarding />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
    </RealtimeProvider>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/*" element={<ProtectedLayout />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
