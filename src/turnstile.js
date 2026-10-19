// Cloudflare Turnstile on the sign-in screen (anti-bot, 19 Oct 2026).
//
// Turnstile is Cloudflare's free, no-puzzle CAPTCHA. It runs a background
// check in the visitor's browser and hands back a one-time token; Supabase
// Auth verifies that token (Authentication → Attack Protection → CAPTCHA,
// provider "Turnstile", with the SECRET key) before it will issue a session.
// A script hitting /auth/v1/token directly with a stolen password list never
// has a valid token, so it never gets in.
//
// SWITCHED ON BY CONFIG, NOT CODE: with no VITE_TURNSTILE_SITE_KEY the hook is
// inert and the login form behaves exactly as before. Roll-out order matters:
//   1. set VITE_TURNSTILE_SITE_KEY in Vercel (and locally), redeploy;
//   2. only then enable CAPTCHA in Supabase Auth with the secret key —
//      doing it the other way round locks everyone out until the deploy lands.
import { useEffect, useRef, useState, useCallback } from "react";

export const TURNSTILE_SITE_KEY = (import.meta.env.VITE_TURNSTILE_SITE_KEY || "").trim();
export const TURNSTILE_ENABLED = TURNSTILE_SITE_KEY.length > 0;

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let scriptPromise = null;
function loadScript() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = SCRIPT_SRC; s.async = true; s.defer = true;
      s.onload = () => resolve(window.turnstile);
      s.onerror = () => { scriptPromise = null; reject(new Error("Turnstile script failed to load")); };
      document.head.appendChild(s);
    });
  }
  return scriptPromise;
}

// Renders the widget into `containerRef` while `active` is true and returns
// { token, reset, error }. Tokens are single-use: call reset() after every
// sign-in attempt (success or failure) so the next attempt gets a fresh one.
export function useTurnstile(containerRef, active) {
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const widgetId = useRef(null);

  useEffect(() => {
    if (!TURNSTILE_ENABLED || !active || !containerRef.current) return undefined;
    let cancelled = false;
    loadScript().then((ts) => {
      if (cancelled || !containerRef.current || widgetId.current !== null) return;
      widgetId.current = ts.render(containerRef.current, {
        sitekey: TURNSTILE_SITE_KEY,
        theme: "light",
        size: "flexible",
        callback: (t) => { setToken(t); setError(""); },
        "expired-callback": () => setToken(""),
        "timeout-callback": () => setToken(""),
        "error-callback": () => { setToken(""); setError("Bot check could not run. Reload the page and try again."); },
      });
    }).catch((e) => setError(e.message));
    return () => {
      cancelled = true;
      if (widgetId.current !== null && window.turnstile) {
        try { window.turnstile.remove(widgetId.current); } catch { /* already gone */ }
      }
      widgetId.current = null;
      setToken("");
    };
  }, [containerRef, active]);

  const reset = useCallback(() => {
    setToken("");
    if (widgetId.current !== null && window.turnstile) {
      try { window.turnstile.reset(widgetId.current); } catch { /* ignore */ }
    }
  }, []);

  return { token, reset, error };
}
