import { BrowserRouter, Routes, Route } from "react-router-dom";
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

// Shared AV + EDR (legacy / all-platform)
import AVScanner from "./pages/av/AVScanner";
import Quarantine from "./pages/av/Quarantine";
import Definitions from "./pages/av/Definitions";
import Detections from "./pages/edr/Detections";
import DetectionRules from "./pages/edr/DetectionRules";
import ProcessMonitor from "./pages/edr/ProcessMonitor";
import NetworkActivity from "./pages/edr/NetworkActivity";

export default function App() {
  return (
    <BrowserRouter>
      <div className="flex h-screen overflow-hidden font-sans" style={{ background: "#0d0f16" }}>
        <Sidebar />
        <main className="flex-1 ml-56 flex flex-col overflow-y-auto">
          <Routes>
            {/* Fleet */}
            <Route path="/" element={<FleetOverview />} />
            <Route path="/devices" element={<DeviceList />} />
            <Route path="/device/:id" element={<DeviceDetail />} />

            {/* macOS */}
            <Route path="/mac/devices" element={<MacDevices />} />
            <Route path="/mac/av" element={<MacAV />} />
            <Route path="/mac/edr" element={<MacEDR />} />
            <Route path="/mac/network" element={<MacNetwork />} />

            {/* Windows */}
            <Route path="/windows/devices" element={<WindowsDevices />} />
            <Route path="/windows/av" element={<WindowsAV />} />
            <Route path="/windows/edr" element={<WindowsEDR />} />
            <Route path="/windows/isolation" element={<HostIsolation />} />

            {/* Shared / all-platform AV + EDR */}
            <Route path="/av/scanner" element={<AVScanner />} />
            <Route path="/av/quarantine" element={<Quarantine />} />
            <Route path="/av/definitions" element={<Definitions />} />
            <Route path="/edr/detections" element={<Detections />} />
            <Route path="/edr/rules" element={<DetectionRules />} />
            <Route path="/edr/processes" element={<ProcessMonitor />} />
            <Route path="/edr/network" element={<NetworkActivity />} />

            {/* Legacy */}
            <Route path="/alerts" element={<AlertCenter />} />

            {/* Management */}
            <Route path="/patches" element={<PatchManager />} />
            <Route path="/compliance" element={<Compliance />} />
            <Route path="/vulnerabilities" element={<VulnerabilityManager />} />
            <Route path="/reports" element={<Reports />} />

            {/* System */}
            <Route path="/settings" element={<Settings />} />
            <Route path="/about" element={<About />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
