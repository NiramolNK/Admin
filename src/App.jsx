// ════════════════════════════════════════════════════════════════════════════
// App.jsx — top-level wrapper
//
// Responsibilities:
//   1. Initialize Supabase storage shim (sets window.storage globally)
//   2. Handle sign-in / sign-up / sign-out via Supabase Auth
//   3. Bridge Supabase auth into the existing AllocationPanel by pre-seeding
//      the userAccounts state and overriding the role detection
//
// The original AllocationPanel keeps its login screen as a fallback, but
// once you're signed in via Supabase, we skip straight to the app.
// ════════════════════════════════════════════════════════════════════════════

import { useState, useEffect } from "react";
import AllocationPanel from "./AllocationRoster2026.jsx";
import {
  initStorage,
  signIn,
  signUp,
  signOut,
  getCurrentRole,
  onAuthChange,
  supabase,
} from "./supabase.js";

export default function App() {
  const [booting, setBooting]   = useState(true);
  const [profile, setProfile]   = useState(null);
  const [authMode, setAuthMode] = useState("signin"); // "signin" | "signup"
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [err, setErr]           = useState("");
  const [busy, setBusy]         = useState(false);

  // Bootstrap: init storage shim, check current session
  useEffect(() => {
    (async () => {
      await initStorage();
      const p = await getCurrentRole();
      setProfile(p);
      setBooting(false);
    })();

    const { data: sub } = onAuthChange(async (event) => {
      if (event === "SIGNED_OUT") {
        setProfile(null);
      } else if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        const p = await getCurrentRole();
        setProfile(p);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Once we have a profile, inject it into the AllocationPanel's expected
  // shape by patching the global storage. The panel reads userAccounts and
  // role from storage on mount; we make sure both reflect the real user.
  useEffect(() => {
    if (!profile) return;
    (async () => {
      const existing = await window.storage.get("nirm-all");
      const state = existing?.value ? JSON.parse(existing.value) : {};
      state.role = profile.role;
      state.prefs = { ...(state.prefs || {}), loginUser: profile.username };
      // Ensure the current user appears in userAccounts so user-mgmt UI works
      const accounts = state.userAccounts || [];
      if (!accounts.find((a) => a.username.toLowerCase() === profile.username.toLowerCase())) {
        accounts.push({
          username: profile.username,
          password: "__supabase__",
          role: profile.role,
        });
      }
      state.userAccounts = accounts;
      await window.storage.set("nirm-all", JSON.stringify(state));
    })();
  }, [profile]);

  const handleSignIn = async (e) => {
    e?.preventDefault();
    setErr("");
    setBusy(true);
    const { error } = await signIn(email, password);
    setBusy(false);
    if (error) setErr(error.message);
  };

  const handleSignUp = async (e) => {
    e?.preventDefault();
    setErr("");
    if (!username.trim()) { setErr("Username required"); return; }
    setBusy(true);
    // First user becomes manager. Subsequent: viewer (manager can promote).
    const { count } = await supabase
      .from("profiles")
      .select("*", { count: "exact", head: true });
    const role = (count || 0) === 0 ? "manager" : "viewer";

    const { error } = await signUp(email, password, username.trim(), role);
    setBusy(false);
    if (error) setErr(error.message);
    else setErr("Check your email to confirm, then sign in.");
  };

  if (booting) {
    return (
      <div style={loadingStyle}>
        <div style={{ textAlign: "center" }}>
          <div style={spinnerStyle} />
          <div style={{ color: "#64748B", fontSize: 13, marginTop: 12 }}>
            Connecting…
          </div>
        </div>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  if (!profile) {
    return <AuthScreen
      mode={authMode} setMode={setAuthMode}
      email={email} setEmail={setEmail}
      password={password} setPassword={setPassword}
      username={username} setUsername={setUsername}
      err={err} busy={busy}
      onSignIn={handleSignIn} onSignUp={handleSignUp}
    />;
  }

  // Signed in — hand off to the original component.
  // The Sign-Out button in the sidebar still works because we listen to
  // SIGNED_OUT events above. We also expose a global helper the component
  // can use if needed.
  window.__nirmSignOut = signOut;

  return <AllocationPanel />;
}

// ─── Auth screen ───────────────────────────────────────────────────────────

function AuthScreen({
  mode, setMode, email, setEmail, password, setPassword,
  username, setUsername, err, busy, onSignIn, onSignUp,
}) {
  const isSignUp = mode === "signup";
  const submit = isSignUp ? onSignUp : onSignIn;

  return (
    <div style={authPageStyle}>
      <form onSubmit={submit} style={authCardStyle}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <Logo />
          <div style={{ fontSize: 22, fontWeight: 700, color: "#0F172A", marginTop: 16 }}>
            NiRM
          </div>
          <div style={{ fontSize: 13, color: "#94A3B8", marginTop: 4 }}>
            {isSignUp ? "Create your account" : "Sign in to your workspace"}
          </div>
        </div>

        {isSignUp && (
          <Field
            label="Username" type="text" value={username}
            onChange={setUsername} placeholder="e.g. April"
            autoComplete="username"
          />
        )}

        <Field
          label="Email" type="email" value={email}
          onChange={setEmail} placeholder="you@company.com"
          autoComplete="email" autoFocus={!isSignUp}
        />

        <Field
          label="Password" type="password" value={password}
          onChange={setPassword} placeholder="••••••••"
          autoComplete={isSignUp ? "new-password" : "current-password"}
        />

        {err && (
          <div style={{
            fontSize: 12, color: err.startsWith("Check") ? "#059669" : "#EF4444",
            fontWeight: 600, marginBottom: 16, padding: "8px 12px",
            background: err.startsWith("Check") ? "#ECFDF5" : "#FEF2F2",
            borderRadius: 8,
          }}>
            {err}
          </div>
        )}

        <button type="submit" disabled={busy} style={primaryBtnStyle}>
          {busy ? "…" : (isSignUp ? "Create account" : "Sign in")}
        </button>

        <div style={{ textAlign: "center", marginTop: 16, fontSize: 12, color: "#64748B" }}>
          {isSignUp ? "Already have an account? " : "First time? "}
          <button
            type="button"
            onClick={() => setMode(isSignUp ? "signin" : "signup")}
            style={linkBtnStyle}
          >
            {isSignUp ? "Sign in" : "Create one"}
          </button>
        </div>
      </form>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap');
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(16px) } to { opacity: 1; transform: translateY(0) } }
        button:hover:not(:disabled) { opacity: 0.9; }
        input:focus { border-color: #0D9488 !important; outline: none; }
      `}</style>
    </div>
  );
}

function Field({ label, type, value, onChange, placeholder, autoComplete, autoFocus }) {
  const id = `f_${label.toLowerCase()}`;
  return (
    <div style={{ marginBottom: 16 }}>
      <label htmlFor={id} style={labelStyle}>{label}</label>
      <input
        id={id} type={type} value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        style={inputStyle}
      />
    </div>
  );
}

function Logo() {
  return (
    <svg width={48} height={48} viewBox="0 0 36 36" fill="none">
      <rect width="36" height="36" rx="10" fill="#0D9488"/>
      <rect x="7"  y="20" width="5" height="9"  rx="2" fill="#fff" opacity="0.45"/>
      <rect x="15.5" y="14" width="5" height="15" rx="2" fill="#fff" opacity="0.7"/>
      <rect x="24" y="7"  width="5" height="22" rx="2" fill="#fff"/>
      <circle cx="27" cy="7" r="2.5" fill="#fff"/>
    </svg>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────

const loadingStyle = {
  minHeight: "100vh", display: "flex", alignItems: "center",
  justifyContent: "center", background: "#FAFBFC",
  fontFamily: "'DM Sans', sans-serif",
};

const spinnerStyle = {
  width: 40, height: 40, border: "3px solid #E2E8F0",
  borderTop: "3px solid #14B8A6", borderRadius: "50%",
  animation: "spin 0.8s linear infinite", margin: "0 auto",
};

const authPageStyle = {
  minHeight: "100vh", display: "flex", alignItems: "center",
  justifyContent: "center", background: "#FAFBFC", padding: 32,
  fontFamily: "'DM Sans', sans-serif",
};

const authCardStyle = {
  width: "100%", maxWidth: 380, padding: 32,
  animation: "fadeUp 0.4s ease",
};

const labelStyle = {
  fontSize: 11, fontWeight: 600, color: "#94A3B8",
  textTransform: "uppercase", letterSpacing: 0.5,
  display: "block", marginBottom: 6,
};

const inputStyle = {
  width: "100%", padding: "12px 14px", borderRadius: 10,
  border: "1.5px solid #E2E8F0", background: "#fff",
  color: "#1A1D2E", fontSize: 14, fontFamily: "inherit",
  outline: "none", boxSizing: "border-box",
  transition: "border 0.15s",
};

const primaryBtnStyle = {
  width: "100%", padding: 13, borderRadius: 10, border: "none",
  background: "#0D9488", color: "#fff", fontSize: 14,
  fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
};

const linkBtnStyle = {
  background: "none", border: "none", color: "#0D9488",
  fontWeight: 600, cursor: "pointer", fontSize: 12,
  fontFamily: "inherit", padding: 0,
};
