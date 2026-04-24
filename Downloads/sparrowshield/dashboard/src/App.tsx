import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { AuthProvider, useAuth } from "./lib/AuthContext";
import { supabase } from "./lib/supabase";
import Sidebar from "./components/layout/Sidebar";
import FleetOverview from "./pages/FleetOverview";
import DeviceDetail from "./pages/DeviceDetail";
import AlertCenter from "./pages/AlertCenter";
import DeviceList from "./pages/DeviceList";
import Settings from "./pages/Settings";
import Reports from "./pages/Reports";
import Compliance from "./pages/Compliance";
import About from "./pages/About";
import Login from "./pages/Login";

// Handles the magic-link / OTP redirect from Supabase email
function AuthCallback() {
  const navigate = useNavigate();
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      navigate(session ? "/" : "/login", { replace: true });
    });
  }, [navigate]);
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <p className="text-slate-400 text-sm animate-pulse">Signing you in…</p>
    </div>
  );
}

// Wraps all dashboard routes — redirects to /login if not authenticated
function ProtectedLayout() {
  const { session, loading, signOut } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <p className="text-slate-400 text-sm animate-pulse">Loading…</p>
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-950 font-sans">
      <Sidebar onSignOut={signOut} userEmail={session.user.email} />
      <main className="flex-1 ml-56 flex flex-col overflow-hidden">
        <Routes>
          <Route path="/" element={<FleetOverview />} />
          <Route path="/devices" element={<DeviceList />} />
          <Route path="/device/:id" element={<DeviceDetail />} />
          <Route path="/alerts" element={<AlertCenter />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/compliance" element={<Compliance />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/about" element={<About />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/*" element={<ProtectedLayout />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
