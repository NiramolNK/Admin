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
  // Modes: "signin" | "forgot" | "recovery" (after clicking email link)
  const [authMode, setAuthMode] = useState("signin");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState(""); // kept for backward-compat; unused
  const [err, setErr]           = useState("");
  const [info, setInfo]         = useState("");
  const [busy, setBusy]         = useState(false);

  // Bootstrap: init storage shim, check current session
  useEffect(() => {
    // FIX (password reset reliability): the Supabase client parses the URL
    // hash SYNCHRONOUSLY at module-import time, so the PASSWORD_RECOVERY event
    // can fire before our onAuthChange listener below is registered. Detect
    // the recovery flag directly from the URL on mount as a safety net — if
    // the user landed here from an email link, force "recovery" mode no
    // matter whether the event fired in time.
    const hash = typeof window !== "undefined" ? (window.location.hash || "") : "";
    const search = typeof window !== "undefined" ? (window.location.search || "") : "";
    const isRecoveryLink =
      hash.includes("type=recovery") ||
      hash.includes("type%3Drecovery") ||
      search.includes("type=recovery");
    if (isRecoveryLink) {
      setAuthMode("recovery");
    }

    (async () => {
      await initStorage();
      const p = await getCurrentRole();
      // Don't bounce a recovery-link user into the signed-in app. They need to
      // see the "Set a new password" form first.
      if (!isRecoveryLink) setProfile(p);
      setBooting(false);
    })();

    const { data: sub } = onAuthChange(async (event) => {
      if (event === "SIGNED_OUT") {
        setProfile(null);
      } else if (event === "PASSWORD_RECOVERY") {
        // User clicked the recovery email link. Force them to set a new password.
        setAuthMode("recovery");
        setProfile(null);
      } else if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        // If we're in the middle of a recovery flow, the SIGNED_IN event fires
        // as a side-effect of the recovery token being exchanged. Don't bounce
        // the user into the app before they've set a new password.
        if (authMode === "recovery") return;
        const p = await getCurrentRole();
        setProfile(p);
      }
    });
    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Once we have a profile, inject it into the AllocationPanel's expected
  // shape by patching the global storage. The panel reads userAccounts and
  // role from storage on mount; we make sure both reflect the real user.
  //
  // FIX (data-loss bug #2 from senior-dev review):
  // This effect previously ran on every profile change (including token
  // refresh) and unconditionally wrote `state` back to storage. If the
  // AllocationPanel had unsaved in-memory edits, this read-modify-write
  // would silently clobber them with a stale snapshot from storage.
  //
  // Mitigations applied:
  //   1. SKIP the write entirely if the current user is already present in
  //      userAccounts with the right role and prefs.loginUser matches —
  //      there is nothing to patch.
  //   2. Re-read storage RIGHT BEFORE writing (already does) and write
  //      only the minimal patched object — no full-state replace if
  //      counts shrank in a suspicious way.
  //   3. Refuse to write if the existing state has agents and the patched
  //      state would shrink any major collection.
  useEffect(() => {
    if (!profile) return;
    let cancelled = false;
    (async () => {
      const existing = await window.storage.get("nirm-all");
      const before = existing?.value ? JSON.parse(existing.value) : {};

      const accounts = Array.isArray(before.userAccounts) ? [...before.userAccounts] : [];
      const matchIdx = accounts.findIndex(
        (a) => a && a.username && a.username.toLowerCase() === profile.username.toLowerCase()
      );
      const accountInSync =
        matchIdx >= 0 &&
        accounts[matchIdx].role === profile.role &&
        accounts[matchIdx].password === "__supabase__";

      const prefsInSync =
        before.role === profile.role &&
        before.prefs &&
        before.prefs.loginUser === profile.username;

      // Nothing to do — avoid a needless write that could race with the panel.
      if (accountInSync && prefsInSync) return;
      if (cancelled) return;

      // Build a patched state without losing anything that was already there.
      const patched = { ...before };
      patched.role = profile.role;
      patched.prefs = { ...(before.prefs || {}), loginUser: profile.username };
      if (matchIdx >= 0) {
        accounts[matchIdx] = { ...accounts[matchIdx], role: profile.role, password: "__supabase__" };
      } else {
        accounts.push({ username: profile.username, password: "__supabase__", role: profile.role });
      }
      patched.userAccounts = accounts;

      // Shrink guard — refuse to write if any major collection got smaller.
      const shrank = (a, b) =>
        Array.isArray(a) && Array.isArray(b) && b.length < a.length;
      if (
        shrank(before.agents, patched.agents) ||
        shrank(before.brands, patched.brands) ||
        shrank(before.userAccounts, patched.userAccounts)
      ) {
        console.warn("[App] Refused to patch nirm-all: shrink detected", { before, patched });
        return;
      }

      await window.storage.set("nirm-all", JSON.stringify(patched));
    })();
    return () => { cancelled = true; };
  }, [profile]);

  const handleSignIn = async (e) => {
    e?.preventDefault();
    setErr("");
    setBusy(true);
    const { error } = await signIn(email, password);
    setBusy(false);
    if (error) setErr(error.message);
  };

  // Self-signup is disabled — manager invites users via Supabase Dashboard.
  // We keep handleSignUp as a no-op so the component still compiles.
  const handleSignUp = async (e) => { e?.preventDefault(); };

  const handleForgotPassword = async (e) => {
    e?.preventDefault();
    setErr(""); setInfo("");
    if (!email.trim()) { setErr("Enter your email first"); return; }
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin,
    });
    setBusy(false);
    if (error) setErr(error.message);
    else setInfo("Password reset email sent. Check your inbox (and spam folder).");
  };

  const handleSetNewPassword = async (e) => {
    e?.preventDefault();
    setErr(""); setInfo("");
    if (!password || password.length < 6) { setErr("Password must be at least 6 characters"); return; }
    setBusy(true);
    try {
      // FIX (password reset reliability): updateUser fails with "Auth session
      // missing!" if the recovery token from the email URL hash never
      // established a session — most often because the user navigated/
      // refreshed after landing on the page, or the page was opened in a
      // browser where Supabase couldn't pick up the hash. Before giving up,
      // try to recover the session from the URL hash one more time.
      let { data: sessData } = await supabase.auth.getSession();
      if (!sessData?.session) {
        const rawHash = window.location.hash?.startsWith("#")
          ? window.location.hash.slice(1)
          : (window.location.hash || "");
        const params = new URLSearchParams(rawHash);
        const access_token = params.get("access_token");
        const refresh_token = params.get("refresh_token");
        const tokenType = params.get("type");
        if (access_token && refresh_token && tokenType === "recovery") {
          const { error: setErr2 } = await supabase.auth.setSession({ access_token, refresh_token });
          if (setErr2) {
            setErr("Reset link has expired or already been used. Request a new password reset email.");
            setBusy(false);
            return;
          }
          ({ data: sessData } = await supabase.auth.getSession());
        }
      }
      if (!sessData?.session) {
        setErr("Reset link has expired or already been used. Request a new password reset email.");
        setBusy(false);
        return;
      }
      const { error } = await supabase.auth.updateUser({ password });
      setBusy(false);
      if (error) { setErr(error.message); return; }
      setInfo("Password updated. Signing you in…");
      // Clear the recovery hash so a refresh doesn't bounce back into recovery mode.
      try {
        if (window.location.hash) {
          window.history.replaceState(null, "", window.location.pathname + window.location.search);
        }
      } catch (_) { /* non-fatal */ }
      setAuthMode("signin");
      const p = await getCurrentRole();
      setProfile(p);
    } catch (e2) {
      setBusy(false);
      setErr(e2?.message || "Could not update password. Try requesting a new reset email.");
    }
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
      err={err} info={info} busy={busy}
      onSignIn={handleSignIn}
      onForgotPassword={handleForgotPassword}
      onSetNewPassword={handleSetNewPassword}
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
  err, info, busy, onSignIn, onForgotPassword, onSetNewPassword,
}) {
  // Three modes:
  //   "signin"   — normal email + password sign in
  //   "forgot"   — enter email to receive reset link
  //   "recovery" — landed here from email link, set new password
  const isForgot   = mode === "forgot";
  const isRecovery = mode === "recovery";

  const submit = isRecovery ? onSetNewPassword
               : isForgot   ? onForgotPassword
               : onSignIn;

  const title = isRecovery ? "Set a new password"
              : isForgot   ? "Reset your password"
              :              "Sign in to your workspace";

  return (
    <div style={authPageStyle}>
      <form onSubmit={submit} style={authCardStyle}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <Logo />
          <div style={{ fontSize: 22, fontWeight: 700, color: "#0F172A", marginTop: 16 }}>
            NiRM
          </div>
          <div style={{ fontSize: 13, color: "#94A3B8", marginTop: 4 }}>
            {title}
          </div>
        </div>

        {!isRecovery && (
          <Field
            label="Email" type="email" value={email}
            onChange={setEmail} placeholder="you@company.com"
            autoComplete="email" autoFocus
          />
        )}

        {!isForgot && (
          <Field
            label={isRecovery ? "New password" : "Password"}
            type="password" value={password}
            onChange={setPassword} placeholder="••••••••"
            autoComplete={isRecovery ? "new-password" : "current-password"}
            autoFocus={isRecovery}
          />
        )}

        {(err || info) && (
          <div style={{
            fontSize: 12, color: info ? "#059669" : "#EF4444",
            fontWeight: 600, marginBottom: 16, padding: "8px 12px",
            background: info ? "#ECFDF5" : "#FEF2F2",
            borderRadius: 8,
          }}>
            {info || err}
          </div>
        )}

        <button type="submit" disabled={busy} style={primaryBtnStyle}>
          {busy ? "…"
            : isRecovery ? "Update password"
            : isForgot   ? "Send reset link"
            :              "Sign in"}
        </button>

        {!isRecovery && (
          <div style={{ textAlign: "center", marginTop: 16, fontSize: 12, color: "#64748B" }}>
            {isForgot ? (
              <button type="button" onClick={() => setMode("signin")} style={linkBtnStyle}>
                Back to sign in
              </button>
            ) : (
              <button type="button" onClick={() => setMode("forgot")} style={linkBtnStyle}>
                Forgot password?
              </button>
            )}
          </div>
        )}

        {mode === "signin" && (
          <div style={{ textAlign: "center", marginTop: 12, fontSize: 11, color: "#94A3B8" }}>
            Access is by invitation only. Contact your manager to add your account.
          </div>
        )}
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
