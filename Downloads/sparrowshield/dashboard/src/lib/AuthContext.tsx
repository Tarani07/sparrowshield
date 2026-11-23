import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "./supabase";

export type ConsoleRole = "admin" | "viewer" | null;

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  /** Role in console_users; null = signed in but not invited to this console. */
  role: ConsoleRole;
  roleLoading: boolean;
  isAdmin: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null, user: null, loading: true, role: null, roleLoading: true, isAdmin: false, signOut: async () => {},
});

// Local design previews (dev server only) run signed out with admin UI.
const DEV_PREVIEW = import.meta.env.DEV && import.meta.env.VITE_DEV_NO_AUTH === "1";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<ConsoleRole>(null);
  const [roleLoading, setRoleLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setLoading(false);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Resolve the console role whenever the signed-in user changes.
  useEffect(() => {
    let cancelled = false;
    const uid = session?.user?.id;
    if (!uid) { setRole(DEV_PREVIEW ? "admin" : null); setRoleLoading(false); return; }
    setRoleLoading(true);
    supabase.from("console_users").select("role").eq("user_id", uid).maybeSingle().then(({ data }) => {
      if (cancelled) return;
      setRole((data?.role as ConsoleRole) ?? null);
      setRoleLoading(false);
      if (data) supabase.rpc("touch_console_user").then(() => {});
    });
    return () => { cancelled = true; };
  }, [session?.user?.id]);

  async function signOut() {
    await supabase.auth.signOut();
    setSession(null);
    setRole(null);
  }

  return (
    <AuthContext.Provider value={{
      session, user: session?.user ?? null, loading, role, roleLoading, isAdmin: role === "admin", signOut,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
