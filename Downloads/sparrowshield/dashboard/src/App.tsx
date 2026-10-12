import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "./lib/ThemeContext";
import { AuthProvider, useAuth } from "./lib/AuthContext";
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

function ProtectedLayout() {
  const { session, loading } = useAuth();

  if (loading) return (
    <div className="flex h-screen items-center justify-center" style={{ background: "var(--c-bg)" }}>
      <div className="w-8 h-8 rounded-full border-2 animate-spin"
        style={{ borderColor: "var(--c-border2)", borderTopColor: "var(--c-primary)" }} />
    </div>
  );

  if (!session) return <Navigate to="/login" replace />;

  return (
    <div className="flex h-screen overflow-hidden font-sans" style={{ background: "var(--c-bg)" }}>
      <Sidebar />
      <main className="flex-1 ml-56 flex flex-col overflow-y-auto">
        <Routes>
          <Route path="/" element={<FleetOverview />} />
          <Route path="/devices" element={<DeviceList />} />
          <Route path="/device/:id" element={<DeviceDetail />} />

          <Route path="/mac/devices" element={<MacDevices />} />
          <Route path="/mac/av" element={<MacAV />} />
          <Route path="/mac/edr" element={<MacEDR />} />
          <Route path="/mac/network" element={<MacNetwork />} />

          <Route path="/windows/devices" element={<WindowsDevices />} />
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

          <Route path="/settings" element={<Settings />} />
          <Route path="/about" element={<About />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
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
