import { useState, useEffect } from "react";
import catUrl from "./assets/cat-idle.png";

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
const store = { n: 0, shown: false, timer: null, subs: new Set() };
const emit = () => store.subs.forEach((fn) => fn(store.shown));

const show = () => {
  if (store.shown) return;
  store.shown = true;
  emit();
};
const hide = () => {
  if (!store.shown) return;
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
   FRAMES/FW/FH come straight from tools_sprite.py, which built the strip. If
   the sheet is ever replaced, re-run that script and update these three
   numbers — nothing else here needs to change. */
const FRAMES = 4, FW = 207, FH = 300;   // source frame size
const SCALE = 0.6;                      // drawn at 60%, so the art is 2x on a retina screen
const DW = Math.round(FW * SCALE), DH = Math.round(FH * SCALE);

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
/* the sprite: one strip, stepped one frame at a time */
@keyframes nirm-play { from { background-position: 0 0 } to { background-position: -${DW * FRAMES}px 0 } }
@keyframes nirm-in   { from { opacity:0; transform: translateY(10px) scale(.94) } to { opacity:1; transform:none } }
@keyframes nirm-dots { 0%,20% { content:"" } 40% { content:"." } 60% { content:".." } 80%,100% { content:"..." } }

.nirm-cat  { animation: nirm-play 1s steps(${FRAMES}) infinite; }
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
        <div style={{ fontSize: 11.5, color: "#64748B", marginTop: 2 }}>
          one moment please
        </div>
      </div>
    </div>
  );
}
