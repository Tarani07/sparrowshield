import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Shield, Mail, Loader2, ArrowRight, KeyRound, Building2 } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/AuthContext";

type Step = "email" | "otp";

// Supabase returns this when a provider hasn't been switched on in Authentication → Providers.
const friendly = (msg: string) =>
  /provider is not enabled|Unsupported provider|not enabled/i.test(msg)
    ? "This sign-in method isn't enabled yet. An admin can turn it on in Supabase → Authentication → Providers."
    : /Signups not allowed|User not found|not found/i.test(msg)
      ? "This email hasn't been invited to SparrowShield. Ask an admin to add you."
      : msg;

export default function Login() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [ssoDomain, setSsoDomain] = useState("");
  const [showSso, setShowSso] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState("");

  // Already signed in (code verified, SSO redirect, or email link clicked) → go to the console.
  useEffect(() => { if (session) navigate("/", { replace: true }); }, [session, navigate]);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setLoading("email");
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: false, emailRedirectTo: window.location.origin },
    });
    setLoading(null);
    if (error) setError(friendly(error.message)); else setStep("otp");
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setLoading("otp");
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: otp, type: "email" });
    setLoading(null);
    if (error) setError(/expired|invalid/i.test(error.message) ? "That code is invalid or has expired. Request a new one." : error.message);
  }

  async function oauth(provider: "google" | "azure") {
    setError(""); setLoading(provider);
    const { error } = await supabase.auth.signInWithOAuth({
      provider, options: { redirectTo: window.location.origin, scopes: provider === "azure" ? "email" : undefined },
    });
    if (error) { setLoading(null); setError(friendly(error.message)); }
  }

  async function sso(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setLoading("sso");
    const { data, error } = await supabase.auth.signInWithSSO({ domain: ssoDomain.trim(), options: { redirectTo: window.location.origin } });
    if (error) { setLoading(null); setError(friendly(error.message)); return; }
    if (data?.url) window.location.href = data.url;
  }

  const field = "w-full h-10 rounded-md border px-3 text-[14px] outline-none bg-[var(--c-card2)] border-[var(--c-border2)] text-[var(--c-strong)] placeholder:text-[var(--c-muted)] focus:border-[var(--c-accent)]";
  const primary = "w-full h-10 rounded-md text-[14px] font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-60 hover:brightness-110";
  const secondary = "w-full h-10 rounded-md border text-[13.5px] font-medium flex items-center justify-center gap-2.5 hover:bg-[var(--c-row-hover)] disabled:opacity-60";

  return (
    <div className="min-h-screen grid lg:grid-cols-2" style={{ background: "var(--c-bg)" }}>
      {/* Brand panel */}
      <div className="hidden lg:flex flex-col justify-between p-12 border-r" style={{ background: "var(--c-sb-bg)", borderColor: "var(--c-sb-border)" }}>
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-md flex items-center justify-center" style={{ background: "linear-gradient(135deg,#10b981,#047857)" }}>
            <Shield className="w-4 h-4 text-white" />
          </div>
          <span className="text-[15px] font-semibold" style={{ color: "#eef2fa" }}>SparrowShield</span>
        </div>
        <div>
          <h2 className="text-[28px] leading-9 font-semibold tracking-tight max-w-md" style={{ color: "#eef2fa" }}>
            Endpoint security for every Mac and PC in your company.
          </h2>
          <ul className="mt-6 space-y-2.5 text-[14px]" style={{ color: "#8c9ab8" }}>
            {["Malware and suspicious-behaviour detection mapped to MITRE ATT&CK",
              "Application control and web filtering by team",
              "Live fleet monitoring with one-click response actions"].map(t => (
              <li key={t} className="flex items-start gap-2.5"><span className="mt-2 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "#34d399" }} />{t}</li>
            ))}
          </ul>
        </div>
        <p className="text-[12px]" style={{ color: "#62718f" }}>Access is limited to invited administrators. All actions are audited.</p>
      </div>

      {/* Sign-in */}
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-2.5 mb-8">
            <div className="w-8 h-8 rounded-md flex items-center justify-center" style={{ background: "linear-gradient(135deg,#10b981,#047857)" }}>
              <Shield className="w-4 h-4 text-white" />
            </div>
            <span className="text-[15px] font-semibold" style={{ color: "var(--c-strong)" }}>SparrowShield</span>
          </div>

          {step === "email" ? (
            <>
              <h1 className="text-[22px] font-semibold tracking-tight" style={{ color: "var(--c-strong)" }}>Sign in to the console</h1>
              <p className="mt-1 text-[13.5px]" style={{ color: "var(--c-muted)" }}>Use your work account.</p>

              <div className="mt-6 space-y-2.5">
                <button onClick={() => oauth("google")} disabled={!!loading} className={secondary}
                  style={{ borderColor: "var(--c-border2)", color: "var(--c-strong)", background: "var(--c-card)" }}>
                  {loading === "google" ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                    <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden><path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.9-5.5 3.9-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.3 14.6 2.3 12 2.3 6.7 2.3 2.4 6.6 2.4 12s4.3 9.7 9.6 9.7c5.5 0 9.2-3.9 9.2-9.4 0-.6-.1-1.1-.2-1.6H12z"/></svg>
                  )}
                  Continue with Google
                </button>
                <button onClick={() => oauth("azure")} disabled={!!loading} className={secondary}
                  style={{ borderColor: "var(--c-border2)", color: "var(--c-strong)", background: "var(--c-card)" }}>
                  {loading === "azure" ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                    <svg viewBox="0 0 24 24" className="w-4 h-4" aria-hidden><path fill="#F25022" d="M3 3h8.5v8.5H3z"/><path fill="#7FBA00" d="M12.5 3H21v8.5h-8.5z"/><path fill="#00A4EF" d="M3 12.5h8.5V21H3z"/><path fill="#FFB900" d="M12.5 12.5H21V21h-8.5z"/></svg>
                  )}
                  Continue with Microsoft
                </button>
                <button onClick={() => setShowSso(s => !s)} disabled={!!loading} className={secondary}
                  style={{ borderColor: "var(--c-border2)", color: "var(--c-strong)", background: "var(--c-card)" }}>
                  <Building2 className="w-4 h-4" /> Single sign-on (Okta, SAML)
                </button>
                {showSso && (
                  <form onSubmit={sso} className="flex gap-2 pt-1">
                    <input value={ssoDomain} onChange={e => setSsoDomain(e.target.value)} required placeholder="company.com" className={field} aria-label="Company domain" />
                    <button type="submit" disabled={!!loading} className="h-10 px-3 rounded-md text-[13px] font-semibold text-white shrink-0" style={{ background: "var(--c-accent)" }}>
                      {loading === "sso" ? <Loader2 className="w-4 h-4 animate-spin" /> : "Go"}
                    </button>
                  </form>
                )}
              </div>

              <div className="flex items-center gap-3 my-6 text-[11.5px] uppercase tracking-wider" style={{ color: "var(--c-muted)" }}>
                <span className="flex-1 h-px" style={{ background: "var(--c-border)" }} /> or use email <span className="flex-1 h-px" style={{ background: "var(--c-border)" }} />
              </div>

              <form onSubmit={sendCode} className="space-y-3">
                <label className="block">
                  <span className="block text-[12.5px] font-medium mb-1.5" style={{ color: "var(--c-text)" }}>Work email</span>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: "var(--c-muted)" }} />
                    <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com"
                      className={`${field} pl-9`} autoComplete="email" />
                  </div>
                </label>
                <button type="submit" disabled={!!loading} className={primary} style={{ background: "var(--c-accent)" }}>
                  {loading === "email" ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Email me a sign-in code <ArrowRight className="w-4 h-4" /></>}
                </button>
              </form>
            </>
          ) : (
            <>
              <h1 className="text-[22px] font-semibold tracking-tight" style={{ color: "var(--c-strong)" }}>Check your email</h1>
              <p className="mt-1 text-[13.5px]" style={{ color: "var(--c-muted)" }}>
                We sent a sign-in code to <b style={{ color: "var(--c-strong)" }}>{email}</b>. Enter it below — or click the link in
                the email <i>on this computer</i>.
              </p>
              <form onSubmit={verifyCode} className="mt-6 space-y-3">
                <label className="block">
                  <span className="block text-[12.5px] font-medium mb-1.5" style={{ color: "var(--c-text)" }}>Sign-in code</span>
                  <div className="relative">
                    <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: "var(--c-muted)" }} />
                    <input autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={10} required value={otp}
                      onChange={e => setOtp(e.target.value.replace(/\D/g, ""))} placeholder="123456"
                      className={`${field} pl-9 font-mono tracking-[0.35em] text-[16px]`} />
                  </div>
                </label>
                <button type="submit" disabled={!!loading || otp.length < 6} className={primary} style={{ background: "var(--c-accent)" }}>
                  {loading === "otp" ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Verify &amp; sign in <ArrowRight className="w-4 h-4" /></>}
                </button>
                <div className="flex justify-between text-[12.5px]">
                  <button type="button" onClick={() => { setStep("email"); setOtp(""); setError(""); }} style={{ color: "var(--c-muted)" }} className="hover:underline">
                    ← Use a different email
                  </button>
                  <button type="button" onClick={e => sendCode(e as unknown as React.FormEvent)} style={{ color: "var(--c-accent)" }} className="hover:underline">
                    Resend code
                  </button>
                </div>
              </form>
            </>
          )}

          {error && (
            <p className="mt-4 text-[12.5px] rounded-md border px-3 py-2" style={{ color: "var(--sev-critical)", borderColor: "var(--c-border2)", background: "var(--c-card2)" }}>
              {error}
            </p>
          )}
          <p className="mt-8 text-[11.5px]" style={{ color: "var(--c-muted)" }}>Only invited accounts can access this console. Sign-ins are logged.</p>
        </div>
      </div>
    </div>
  );
}
