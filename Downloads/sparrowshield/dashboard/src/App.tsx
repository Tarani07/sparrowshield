import { BrowserRouter, Routes, Route } from "react-router-dom";
import Sidebar from "./components/layout/Sidebar";
import FleetOverview from "./pages/FleetOverview";
import DeviceDetail from "./pages/DeviceDetail";
import AlertCenter from "./pages/AlertCenter";
import DeviceList from "./pages/DeviceList";
import Settings from "./pages/Settings";

export default function App() {
  return (
    <BrowserRouter>
      <div className="flex h-screen overflow-hidden bg-slate-950 font-sans">
        <Sidebar />
        <main className="flex-1 ml-56 flex flex-col overflow-hidden">
          <Routes>
            <Route path="/" element={<FleetOverview />} />
            <Route path="/devices" element={<DeviceList />} />
            <Route path="/device/:id" element={<DeviceDetail />} />
            <Route path="/alerts" element={<AlertCenter />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
