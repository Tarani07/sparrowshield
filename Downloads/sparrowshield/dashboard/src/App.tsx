import { BrowserRouter, Routes, Route } from "react-router-dom";
import Sidebar from "./components/layout/Sidebar";
import FleetOverview from "./pages/FleetOverview";
import DeviceDetail from "./pages/DeviceDetail";
import AlertCenter from "./pages/AlertCenter";

export default function App() {
  return (
    <BrowserRouter>
      <div className="flex h-screen overflow-hidden bg-slate-950 font-sans">
        <Sidebar />
        <main className="flex-1 ml-56 flex flex-col overflow-hidden">
          <Routes>
            <Route path="/" element={<FleetOverview />} />
            <Route path="/device/:id" element={<DeviceDetail />} />
            <Route path="/alerts" element={<AlertCenter />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
