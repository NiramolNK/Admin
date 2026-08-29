import { useState, useEffect } from "react";
// cat-idle.png is retired — the file is still in assets/ if it is ever wanted
// back, but nothing imports it, so Vite leaves it out of the bundle.
import catUrl from "./assets/cat-wait.png";

/* ═══════════════════════ CUTE LOADER ═══════════════════════
   A chibi mascot that appears while anything is being saved.

   Hooked in ONE place rather than at every save button: Supabase's client and
   the email functions both go through window.fetch, so counting the writes that
   pass through it covers every update in the app — cases, invoices, the roster,
   Daily Count, the Manual — without touching a single call site. Reads (GET)
   are ignored; nobody needs a mascot for scrolling a list.

   Two things keep it from becoming annoying:
     · it waits 250 ms before showing, so the many saves that finish instantly
       never flash anything on screen at all
     · the veil is pointer-events:none, so it can never swallow a click or trap
       someone mid-task, however long a request hangs

   The artwork is April's cat, animated from her own sprite sheet: four frames
   keyed off the magenta background, trimmed to one shared canvas and aligned
   on the feet so only the cat moves, not the cat's position. It ships as a
   single strip and plays with steps() — no GIF, no video, no JS timer, and
   the browser composites it on the GPU.                                      */

/* ── the store: a counter of in-flight writes ──────────────────────────────── */
/* Once she is on screen she stays for at least MIN_SHOW_MS, even if the save
   finished in 200 ms. Without it Aries appears and vanishes inside a single
   frame of her own animation and nobody ever sees her — which is exactly what
   happened to the first version of this.

   Holding a loader open past its work usually makes an app feel slower, and
   that would matter here if the veil blocked anything. It does not:
   pointer-events is none, so the desk stays fully clickable underneath for the
   whole time. */
const MIN_SHOW_MS = 4500;

const store = { n: 0, shown: false, timer: null, subs: new Set(), shownAt: 0, hold: null };
const emit = () => store.subs.forEach((fn) => fn(store.shown));

const show = () => {
  if (store.shown) return;
  store.shown = true;
  store.shownAt = Date.now();
  emit();
};
const hide = () => {
  if (!store.shown) return;
  const left = MIN_SHOW_MS - (Date.now() - store.shownAt);
  if (left > 0) {
    // already counting down — a second save finishing does not restart it
    if (store.hold) return;
    store.hold = setTimeout(() => {
      store.hold = null;
      // if new work arrived during the hold, stay up for that instead
      if (store.n === 0) { store.shown = false; emit(); }
    }, left);
    return;
  }
  store.shown = false;
  emit();
};

const begin = () => {
  store.n += 1;
  if (store.n === 1 && !store.timer) {
    // the grace period — a save that takes 80 ms should look instant
    store.timer = setTimeout(() => { store.timer = null; if (store.n > 0) show(); }, 250);
  }
};
const end = () => {
  store.n = Math.max(0, store.n - 1);
  if (store.n === 0) {
    if (store.timer) { clearTimeout(store.timer); store.timer = null; }
    hide();
  }
};

/* Manual control, for work that does not go through fetch (a long local
   calculation, say). Always pair them in a finally block. */
export const loaderBegin = begin;
export const loaderEnd = end;

/* ── the hook ──────────────────────────────────────────────────────────────
   Installed once at module load. It is a pass-through: the original fetch is
   called with the original arguments and its promise is returned untouched, so
   a failure still rejects exactly as it did before and no caller can tell the
   difference apart from the mascot.                                          */
const WRITE = /^(POST|PUT|PATCH|DELETE)$/i;
const SKIP = /\/(auth\/v1|realtime\/v1)\//;      // sign-in and websockets are not "updates"

if (typeof window !== "undefined" && !window.__nirmLoaderHooked) {
  window.__nirmLoaderHooked = true;
  const original = window.fetch.bind(window);
  window.fetch = (input, init) => {
    let counted = false;
    try {
      const method = (init?.method ?? (typeof input === "object" && input?.method) ?? "GET");
      const url = String(typeof input === "string" ? input : (input?.url ?? ""));
      if (WRITE.test(String(method)) && !SKIP.test(url)) { begin(); counted = true; }
    } catch { /* never let bookkeeping break a request */ }
    const p = original(input, init);
    if (!counted) return p;
    return p.finally(() => end());
  };
}

/* ── the mascot ───────────────────────────────────────────────────────────
   FW/FH come straight from tools_sprite.py, which built the strip. Replace the
   sheet, re-run the script, update FRAMES below — nothing else changes. */
const FW = 207, FH = 300;               // source frame size
const SCALE = 0.6;                      // drawn at 60%, so the art is 2x on a retina screen
const DW = Math.round(FW * SCALE), DH = Math.round(FH * SCALE);

/* One act: the reading cat. FRAMES is the only thing that changes if the strip
   is ever replaced — cut the new one to the same 207x300 frame, bottom-aligned
   on her feet, and update the count. */
const FRAMES = 6;
const CAT_DUR = ".9s";

/* Fetch it at startup rather than at first save, so her first appearance is
   not the moment the browser goes looking for a 97 KB image. */
if (typeof window !== "undefined") { const pre = new Image(); pre.src = catUrl; }

function Mascot() {
  return (
    <div className="nirm-cat" aria-hidden="true"
         style={{ width: DW, height: DH, margin: "0 auto",
                  backgroundImage: `url(${catUrl})`,
                  backgroundSize: `${DW * FRAMES}px ${DH}px`,
                  backgroundRepeat: "no-repeat",
                  filter: "drop-shadow(0 8px 12px rgba(15,23,42,.22))" }} />
  );
}

const CSS = `
/* the sprite: one strip, stepped one frame at a time. The travel distance is
   the frame count, so this and FRAMES must always agree. */
@keyframes nirm-play { from { background-position: 0 0 } to { background-position: -${DW * FRAMES}px 0 } }
.nirm-cat { animation: nirm-play ${CAT_DUR} steps(${FRAMES}) infinite; }
@keyframes nirm-in   { from { opacity:0; transform: translateY(10px) scale(.94) } to { opacity:1; transform:none } }
@keyframes nirm-dots { 0%,20% { content:"" } 40% { content:"." } 60% { content:".." } 80%,100% { content:"..." } }

.nirm-card { animation: nirm-in .28s cubic-bezier(.2,.8,.3,1) both; }
.nirm-say::after { content:""; animation: nirm-dots 1.4s steps(1,end) infinite; }

/* Anyone who has asked their system to calm animations down gets frame one
   and nothing moving. */
@media (prefers-reduced-motion: reduce) {
  .nirm-cat { animation: none !important; background-position: 0 0 !important; }
  .nirm-card, .nirm-say::after { animation: none !important; }
}
`;

/* ── the overlay ──────────────────────────────────────────────────────────── */
export default function CuteLoader({ label = "Loading" }) {
  const [on, setOn] = useState(store.shown);
  useEffect(() => {
    const fn = (v) => setOn(v);
    store.subs.add(fn);
    return () => { store.subs.delete(fn); };
  }, []);

  /* "Still going" must mean the WORK is still going, not that the card is
     still on screen — otherwise the minimum display time would trigger it on
     every save and the words would stop meaning anything. Hence store.n. */
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!on) { setSlow(false); return; }
    const t = setTimeout(() => setSlow(store.n > 0), MIN_SHOW_MS);
    return () => clearTimeout(t);
  }, [on]);

  if (!on) return null;
  return (
    <div
      /* pointer-events:none is deliberate — a stuck request must never leave
         the desk unable to click anything. */
      style={{ position: "fixed", inset: 0, zIndex: 9999, pointerEvents: "none",
               display: "flex", alignItems: "center", justifyContent: "center",
               background: "rgba(15,23,42,.28)", backdropFilter: "blur(2px)" }}
      role="status" aria-live="polite">
      <style>{CSS}</style>
      <div className="nirm-card"
           style={{ background: "#fff", borderRadius: 22, padding: "22px 30px 18px",
                    boxShadow: "0 18px 50px rgba(15,23,42,.28)", textAlign: "center",
                    border: "1px solid rgba(13,148,136,.18)" }}>
        <Mascot />
        <div className="nirm-say"
             style={{ marginTop: 4, fontSize: 14, fontWeight: 700, color: "#0F172A",
                      fontFamily: "inherit", letterSpacing: .2 }}>
          {label}
        </div>
        {/* The line changes with her. Saying "one moment please" for the tenth
            second running is how a loader starts to feel broken. */}
        <div style={{ fontSize: 11.5, color: "#64748B", marginTop: 2 }}>
          {slow ? "still going — thanks for waiting" : "one moment please"}
        </div>
      </div>
    </div>
  );
}
