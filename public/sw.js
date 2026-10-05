/* NiRM service worker — app-shell cache so the PWA opens instantly from the
 * home screen and still paints when the network is flaky.
 *
 * Rules (deliberately conservative — NiRM is a live data tool):
 *   • Only same-origin GET requests and Google Fonts are handled. Everything
 *     else — Supabase, Twilio, Graph, Vercel functions — goes straight to the
 *     network untouched, so no roster/CRM/payroll data is ever cached here.
 *   • Navigations (index.html) are network-first with cache fallback, so a
 *     fresh deploy is picked up on the next open and the old shell is only
 *     used when offline.
 *   • /assets/* are Vite's content-hashed bundles: immutable, so cache-first.
 *     The cache is trimmed so old deploys don't pile up on the phone.
 *   • A new worker waits until the page tells it to take over (the "NiRM
 *     updated — Reload" bar in InstallHint.jsx), so an agent mid-tally is
 *     never yanked into a reload.
 *
 * Bump SW_VERSION when changing this file's caching rules; the asset cache is
 * self-pruning and does not need a bump per deploy.
 */
const SW_VERSION = "nirm-sw-v1";
const SHELL_CACHE = `${SW_VERSION}-shell`;
const ASSET_CACHE = `${SW_VERSION}-assets`;
const FONT_CACHE = `${SW_VERSION}-fonts`;
const MAX_ASSET_ENTRIES = 60;

const SHELL_URLS = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/favicon.ico",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-maskable-192.png",
  "/icon-maskable-512.png",
  "/apple-touch-icon.png",
  "/nirm-wordmark.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      // addAll fails the whole install if one file 404s; add one by one so a
      // missing optional asset can't block the worker.
      Promise.all(
        SHELL_URLS.map((u) =>
          cache.add(new Request(u, { cache: "reload" })).catch(() => null)
        )
      )
    )
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL_CACHE, ASSET_CACHE, FONT_CACHE]);
      const names = await caches.keys();
      await Promise.all(
        names.filter((n) => n.startsWith("nirm-sw-") && !keep.has(n)).map((n) => caches.delete(n))
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

async function trimCache(name, max) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  if (keys.length <= max) return;
  // Cache.keys() returns in insertion order → oldest first.
  await Promise.all(keys.slice(0, keys.length - max).map((k) => cache.delete(k)));
}

async function networkFirst(request, cacheName, fallbackUrl) {
  const cache = await caches.open(cacheName);
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  } catch (_) {
    const cached = (await cache.match(request)) || (fallbackUrl && (await cache.match(fallbackUrl)));
    if (cached) return cached;
    throw _;
  }
}

async function cacheFirst(request, cacheName, max) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const fresh = await fetch(request);
  if (fresh && (fresh.ok || fresh.type === "opaque")) {
    cache.put(request, fresh.clone());
    if (max) trimCache(cacheName, max);
  }
  return fresh;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const refresh = fetch(request)
    .then((fresh) => {
      if (fresh && (fresh.ok || fresh.type === "opaque")) cache.put(request, fresh.clone());
      return fresh;
    })
    .catch(() => null);
  return cached || (await refresh) || Response.error();
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;

  // Google Fonts (DM Sans): cache so the shell renders in the right face offline.
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(staleWhileRevalidate(request, FONT_CACHE));
    return;
  }

  if (!sameOrigin) return; // Supabase, Twilio, Graph, etc. — never touched.

  // Vercel serverless functions live under /api — live data, never cached.
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, SHELL_CACHE, "/index.html"));
    return;
  }

  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(cacheFirst(request, ASSET_CACHE, MAX_ASSET_ENTRIES));
    return;
  }

  if (SHELL_URLS.includes(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request, SHELL_CACHE));
    return;
  }
  // Anything else same-origin (widget.js, robots.txt, …): default browser behaviour.
});
