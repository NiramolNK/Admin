// NiRM — pwa.js
// Registers the service worker (public/sw.js) and turns its lifecycle into two
// window events the UI can listen to:
//   "nirm:pwa-update"   → a new build is installed and waiting; detail.apply()
//                         activates it and reloads.
//   "nirm:pwa-install"  → the browser offers native install (Android/Chrome);
//                         detail.prompt() shows the dialog.
// Nothing here touches app data. Registration is skipped in dev (vite serve)
// so hot-reload is never fought by a cached shell.

export function registerPwa() {
  if (typeof window === "undefined") return;

  // Native install prompt (Chrome/Edge on Android + desktop). Must be captured
  // at load time or it's gone, hence this lives here and not in a component.
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    window.__nirmInstallPrompt = e;
    window.dispatchEvent(new CustomEvent("nirm:pwa-install", {
      detail: { prompt: () => e.prompt() },
    }));
  });
  window.addEventListener("appinstalled", () => {
    window.__nirmInstallPrompt = null;
    try { localStorage.setItem("nirm-pwa-installed", "1"); } catch (_) {}
  });

  if (!("serviceWorker" in navigator)) return;
  if (import.meta.env && import.meta.env.DEV) return;

  window.addEventListener("load", async () => {
    let reg;
    try {
      reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    } catch (err) {
      console.warn("[pwa] service worker registration failed", err);
      return;
    }

    const announce = (worker) => {
      window.dispatchEvent(new CustomEvent("nirm:pwa-update", {
        detail: {
          apply: () => {
            if (!worker) return;
            // controllerchange below reloads once the new worker takes over.
            worker.postMessage({ type: "SKIP_WAITING" });
          },
        },
      }));
    };

    // A build was already waiting when this page loaded.
    if (reg.waiting && navigator.serviceWorker.controller) announce(reg.waiting);

    reg.addEventListener("updatefound", () => {
      const nw = reg.installing;
      if (!nw) return;
      nw.addEventListener("statechange", () => {
        // "installed" with an existing controller = update, not first install.
        if (nw.state === "installed" && navigator.serviceWorker.controller) announce(nw);
      });
    });

    // Reload only when a NEW worker replaces an OLD one (i.e. after Reload was
    // pressed). On the very first visit clients.claim() also fires
    // controllerchange, and reloading there would make every first open
    // flicker — so that case is ignored.
    const hadController = !!navigator.serviceWorker.controller;
    let reloading = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!hadController || reloading) return;
      reloading = true;
      window.location.reload();
    });

    // Check for a new deploy whenever the app comes back to the foreground
    // (agents keep NiRM open on the phone all shift).
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") reg.update().catch(() => {});
    });
  });
}
