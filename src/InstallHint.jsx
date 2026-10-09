// NiRM — InstallHint.jsx
// Two small bars shown at the bottom of the screen, only when relevant:
//   1. "Install NiRM" — phones/tablets viewing in a browser tab (not yet on the
//      home screen), and Windows/Mac desktops in Edge or Chrome (2026-10-09:
//      installs as a NiRM app in the Start menu/taskbar with its own window). Android/Chrome gets a real Install button; iPhone/iPad get
//      the Share → Add to Home Screen instruction, since iOS has no prompt API.
//      Dismiss hides it for 14 days (localStorage, per browser).
//   2. "NiRM updated" — a new deploy is ready; Reload applies it. Never
//      auto-reloads, so nobody loses a half-typed count or reply.
// Rendered only after sign-in (mounted from App.jsx), so the login screen stays clean.

import { useEffect, useState } from "react";

const DISMISS_KEY = "nirm-install-hint-dismissed";
const DISMISS_DAYS = 14;
const BP_DESKTOP = 1100; // same as AllocationRoster2026.jsx

function isStandalone() {
  if (typeof window === "undefined") return true;
  return (
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
    window.navigator.standalone === true ||
    document.referrer.startsWith("android-app://")
  );
}
function isIOS() {
  const ua = navigator.userAgent || "";
  const iPadOS = navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
  return /iPhone|iPad|iPod/.test(ua) || iPadOS;
}
function recentlyDismissed() {
  try {
    const t = Number(localStorage.getItem(DISMISS_KEY) || 0);
    return t && Date.now() - t < DISMISS_DAYS * 86400e3;
  } catch (_) { return false; }
}

const barStyle = {
  position: "fixed", left: 12, right: 12, bottom: 12, zIndex: 9998,
  display: "flex", alignItems: "center", gap: 10,
  padding: "10px 12px", borderRadius: 14,
  background: "#0F172A", color: "#fff",
  boxShadow: "0 10px 30px rgba(15,23,42,.28)",
  fontFamily: "'DM Sans', sans-serif", fontSize: 14, lineHeight: 1.3,
  // keep clear of the iPhone home indicator in standalone / Safari
  marginBottom: "env(safe-area-inset-bottom, 0px)",
};
const btnStyle = {
  flex: "none", border: 0, borderRadius: 10, padding: "8px 14px",
  background: "#2FB380", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer",
};
const xStyle = {
  flex: "none", border: 0, background: "transparent", color: "#CBD5E1",
  fontSize: 20, lineHeight: 1, padding: "4px 6px", cursor: "pointer",
};

export default function InstallHint() {
  const [installEvt, setInstallEvt] = useState(() => window.__nirmInstallPrompt || null);
  const [update, setUpdate] = useState(null);
  const [hidden, setHidden] = useState(() => isStandalone() || recentlyDismissed());
  const [narrow, setNarrow] = useState(() => window.innerWidth < BP_DESKTOP);

  useEffect(() => {
    const onInstall = (e) => setInstallEvt(e.detail);
    const onUpdate = (e) => setUpdate(e.detail);
    const onResize = () => setNarrow(window.innerWidth < BP_DESKTOP);
    window.addEventListener("nirm:pwa-install", onInstall);
    window.addEventListener("nirm:pwa-update", onUpdate);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("nirm:pwa-install", onInstall);
      window.removeEventListener("nirm:pwa-update", onUpdate);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  const dismiss = () => {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch (_) {}
    setHidden(true);
  };

  // Update bar wins — it matters on every device, installed or not.
  if (update) {
    return (
      <div role="status" style={barStyle}>
        <span style={{ flex: 1 }}>
          <strong>NiRM updated.</strong> Reload to get the latest version.
        </span>
        <button style={btnStyle} onClick={() => update.apply()}>Reload</button>
        <button aria-label="Later" style={xStyle} onClick={() => setUpdate(null)}>×</button>
      </div>
    );
  }

  if (hidden) return null;
  // Desktop: only when the browser can actually install (Edge/Chrome); a
  // small card in the corner rather than a full-width bar.
  if (!narrow && !installEvt) return null;
  const style = narrow ? barStyle : { ...barStyle, left: "auto", right: 20, bottom: 20, maxWidth: 400 };

  if (installEvt) {
    return (
      <div role="status" style={style}>
        <img src="/icon-192.png" alt="" width={32} height={32} style={{ flex: "none", borderRadius: 8 }} />
        <span style={{ flex: 1 }}>
          <strong>Install NiRM</strong> — {narrow ? "opens full-screen from your home screen." : "its own window, pinned to your taskbar."}
        </span>
        <button
          style={btnStyle}
          onClick={async () => {
            try {
              const p = window.__nirmInstallPrompt;
              if (p) { await p.prompt(); const c = await p.userChoice; if (c?.outcome === "accepted") setHidden(true); }
              else installEvt.prompt?.();
            } catch (_) {}
          }}
        >
          Install
        </button>
        <button aria-label="Not now" style={xStyle} onClick={dismiss}>×</button>
      </div>
    );
  }

  if (isIOS()) {
    return (
      <div role="status" style={barStyle}>
        <img src="/icon-192.png" alt="" width={32} height={32} style={{ flex: "none", borderRadius: 8 }} />
        <span style={{ flex: 1 }}>
          <strong>Add NiRM to your Home Screen:</strong> tap{" "}
          <svg width="14" height="16" viewBox="0 0 24 28" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: -2 }} aria-label="Share">
            <path d="M12 2v14M6 8l6-6 6 6" /><path d="M5 12v10h14V12" />
          </svg>{" "}
          Share, then <strong>Add to Home Screen</strong>.
        </span>
        <button aria-label="Not now" style={xStyle} onClick={dismiss}>×</button>
      </div>
    );
  }

  return null;
}
