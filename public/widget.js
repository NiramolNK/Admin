/* ═══════════════════════════════════════════════════════════════
   SVCR Webchat Widget — served from the NiRM app domain
   Embed on any brand site (Shopify: theme.liquid before </body>):

   <script src="https://nirmroster.vercel.app/widget.js"
           data-brand="BRAND_KEY"
           data-host="https://bequrilwgooesolepubv.supabase.co/functions/v1/webchat"
           data-color="#313A7E"
           data-name="Customer Care" defer></script>

   data-brand must equal the accountId set for Webchat in SVCR
   Settings for that brand. No keys in the browser — talks only to
   the webchat edge function. Replies arrive by 4s polling while
   the panel is open. Shadow DOM: host CSS can't break it.
   On Shopify storefronts it auto-captures shop / page type /
   product / customer id / live cart into the inquiry meta.
   ═══════════════════════════════════════════════════════════════ */
(function () {
  "use strict";
  var script = document.currentScript;
  var CFG = {
    brand: script.dataset.brand || "default",
    host: (script.dataset.host || "").replace(/\/$/, ""),
    color: script.dataset.color || "#313A7E",
    accent: script.dataset.accent || "#7A3E9C",
    title: script.dataset.name || "Chat with us",
    greeting: script.dataset.greeting || "Hi! How can we help today? 🙏",
  };
  if (!CFG.host) { console.warn("[svcr-chat] data-host missing"); return; }

  /* ── visitor session persists across page loads ── */
  var SKEY = "svcr_chat_" + CFG.brand;
  var session = null;
  try { session = JSON.parse(localStorage.getItem(SKEY) || "null"); } catch (e) {}
  if (!session) {
    session = { id: "wc_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8), name: "" };
    localStorage.setItem(SKEY, JSON.stringify(session));
  }
  var lastAt = 0, timer = null, open = false, unread = 0;

  /* ── shadow root ── */
  var hostEl = document.createElement("div");
  hostEl.id = "svcr-chat";
  document.body.appendChild(hostEl);
  var root = hostEl.attachShadow({ mode: "open" });

  var css = "\n" +
    ":host { all: initial; }\n" +
    "* { box-sizing: border-box; font-family: 'Galano Grotesque','IBM Plex Sans','IBM Plex Sans Thai',system-ui,sans-serif; }\n" +
    ".bubble { position: fixed; bottom: 22px; right: 22px; width: 58px; height: 58px; border-radius: 50%; background: " + CFG.color + "; color: #fff; border: none; cursor: pointer; z-index: 999999; box-shadow: 0 8px 26px rgba(0,0,0,.24); display: grid; place-items: center; transition: transform .15s; }\n" +
    ".bubble:hover { transform: scale(1.06); }\n" +
    ".bubble svg { width: 26px; height: 26px; }\n" +
    ".badge { position: absolute; top: -4px; right: -4px; min-width: 20px; height: 20px; border-radius: 10px; background: #E62214; color: #fff; font-size: 11.5px; font-weight: 700; display: grid; place-items: center; padding: 0 5px; }\n" +
    ".panel { position: fixed; bottom: 94px; right: 22px; width: 360px; max-width: calc(100vw - 32px); height: 520px; max-height: calc(100vh - 120px); border-radius: 16px; overflow: hidden; z-index: 999999; background: #fff; box-shadow: 0 24px 64px rgba(0,0,0,.28); display: none; flex-direction: column; }\n" +
    ".panel.open { display: flex; }\n" +
    ".hd { background: " + CFG.color + "; color: #fff; padding: 16px 18px; }\n" +
    ".hd b { font-size: 15px; display: block; }\n" +
    ".hd span { font-size: 12px; opacity: .78; }\n" +
    ".hd .x { position: absolute; top: 12px; right: 12px; background: none; border: none; color: #fff; cursor: pointer; font-size: 18px; opacity: .8; }\n";
  css +=
    ".msgs { flex: 1; overflow-y: auto; padding: 14px; background: #F5F3FA; display: flex; flex-direction: column; gap: 8px; }\n" +
    ".m { max-width: 78%; padding: 9px 13px; border-radius: 13px; font-size: 13.5px; line-height: 1.45; white-space: pre-wrap; }\n" +
    ".m.v { align-self: flex-end; background: " + CFG.accent + "; color: #fff; border-bottom-right-radius: 4px; }\n" +
    ".m.a { align-self: flex-start; background: #fff; color: #1E2432; border: 1px solid #E5E4F1; border-bottom-left-radius: 4px; }\n" +
    ".m .t { display: block; font-size: 10px; opacity: .6; margin-top: 3px; }\n" +
    ".pre { padding: 16px; display: flex; flex-direction: column; gap: 8px; }\n" +
    ".pre label { font-size: 12.5px; color: #5D6188; font-weight: 600; }\n" +
    "input, textarea { border: 1.5px solid #E5E4F1; border-radius: 10px; padding: 10px 12px; font-size: 13.5px; outline: none; resize: none; }\n" +
    "input:focus, textarea:focus { border-color: " + CFG.accent + "; }\n" +
    ".ft { display: flex; gap: 8px; padding: 12px; border-top: 1px solid #E5E4F1; background: #fff; }\n" +
    ".ft textarea { flex: 1; height: 42px; }\n" +
    ".send { width: 42px; height: 42px; border-radius: 10px; border: none; background: " + CFG.color + "; color: #fff; cursor: pointer; display: grid; place-items: center; flex: none; }\n" +
    ".send:disabled { opacity: .4; cursor: default; }\n" +
    ".send svg { width: 18px; height: 18px; }\n" +
    ".go { background: " + CFG.color + "; color: #fff; border: none; border-radius: 10px; padding: 11px; font-size: 14px; font-weight: 700; cursor: pointer; }\n" +
    ".note { font-size: 10.5px; color: #8B8FB0; text-align: center; padding: 0 12px 10px; background: #fff; }\n";

  var el = document.createElement("div");
  el.innerHTML =
    "<style>" + css + "</style>" +
    "<button class='bubble' aria-label='Open chat'>" +
      "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'><path d='M21 11.5a8.4 8.4 0 0 1-9 8.4 8.6 8.6 0 0 1-3.9-.9L3 20l1-4.9a8.4 8.4 0 1 1 17-3.6z'/></svg>" +
      "<span class='badge' style='display:none'></span>" +
    "</button>" +
    "<div class='panel' role='dialog' aria-label='Chat'>" +
      "<div class='hd' style='position:relative'>" +
        "<b>" + CFG.title + "</b><span>We usually reply within business hours (Mon–Fri 09:00–18:00)</span>" +
        "<button class='x' aria-label='Close'>✕</button>" +
      "</div>" +
      "<div class='pre'>" +
        "<label>Your name</label><input class='nm' placeholder='Name' maxlength='60'/>" +
        "<label>How can we help?</label><textarea class='first' rows='3' placeholder='Type your message…' maxlength='1000'></textarea>" +
        "<button class='go'>Start chat</button>" +
      "</div>" +
      "<div class='msgs' style='display:none'></div>" +
      "<div class='ft' style='display:none'>" +
        "<textarea placeholder='Type a message…' maxlength='1000'></textarea>" +
        "<button class='send'><svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'><path d='M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z'/></svg></button>" +
      "</div>" +
      "<div class='note' style='display:none'>Powered by SVCR · Your chat may be stored to improve service</div>" +
    "</div>";
  root.appendChild(el);

  var $ = function (sel) { return root.querySelector(sel); };
  var bubble = $(".bubble"), badge = $(".badge"), panel = $(".panel");
  var pre = $(".pre"), msgs = $(".msgs"), ft = $(".ft"), note = $(".note");
  var input = ft.querySelector("textarea"), sendBtn = $(".send");

  function esc(s) { var d = document.createElement("div"); d.textContent = s; return d.innerHTML; }
  function hhmm(t) { var d = new Date(t); return ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2); }
  function push(from, text, at) {
    var m = document.createElement("div");
    m.className = "m " + (from === "visitor" ? "v" : "a");
    m.innerHTML = esc(text) + "<span class='t'>" + hhmm(at) + "</span>";
    msgs.appendChild(m);
    msgs.scrollTop = msgs.scrollHeight;
  }

  function api(path, opts) {
    opts = opts || {};
    opts.headers = { "Content-Type": "application/json" };
    return fetch(CFG.host + path, opts).then(function (r) {
      if (!r.ok) throw new Error("http " + r.status);
      return r.json();
    });
  }

  /* ── Shopify context (auto-detected on Shopify storefronts) ── */
  function shopifyCtx() {
    try {
      var sh = window.Shopify || {};
      var meta = (window.ShopifyAnalytics && window.ShopifyAnalytics.meta) || {};
      if (!sh.shop && !meta.page) return null;
      return {
        platform: "shopify",
        shop: sh.shop || null,
        pageType: meta.page ? meta.page.pageType : null,
        productId: meta.product ? meta.product.id : null,
        customerId: meta.page ? (meta.page.customerId || null) : null,
        currency: sh.currency ? sh.currency.active : null,
      };
    } catch (e) { return null; }
  }
  function cartCtx() {
    return fetch("/cart.js", { credentials: "same-origin" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (c) { return c ? { cartItems: c.item_count, cartTotal: c.total_price, cartToken: c.token } : null; })
      .catch(function () { return null; });
  }

  function sendMsg(text) {
    push("visitor", text, Date.now());
    var base = { brand: CFG.brand, session: session.id, name: session.name, text: text, page: location.href };
    var sctx = shopifyCtx();
    var body = sctx
      ? cartCtx().then(function (cart) {
          var merged = {}; for (var k in sctx) merged[k] = sctx[k];
          if (cart) for (var c in cart) merged[c] = cart[c];
          base.context = merged; return base;
        })
      : Promise.resolve(base);
    return body.then(function (payload) {
      return api("/message", { method: "POST", body: JSON.stringify(payload) });
    }).catch(function () {
      push("agent", "⚠ Could not send — please try again.", Date.now());
    });
  }

  function poll() {
    api("/poll?session=" + encodeURIComponent(session.id) + "&after=" + lastAt)
      .then(function (j) {
        (j.messages || []).forEach(function (m) {
          if (m.at > lastAt) lastAt = m.at;
          if (m.from === "agent") {
            push("agent", m.text, m.at);
            if (!open) { unread++; badge.textContent = unread; badge.style.display = "grid"; }
          }
        });
      }).catch(function () {});
  }

  function startChatUI() {
    pre.style.display = "none";
    msgs.style.display = "flex";
    ft.style.display = "flex";
    note.style.display = "block";
    if (!msgs.children.length) push("agent", CFG.greeting, Date.now());
    if (!timer) timer = setInterval(poll, 4000);
    input.focus();
  }

  $(".go").addEventListener("click", function () {
    var nm = $(".nm").value.trim();
    var first = $(".first").value.trim();
    if (!first) { $(".first").focus(); return; }
    session.name = nm;
    session.started = true;
    localStorage.setItem(SKEY, JSON.stringify(session));
    startChatUI();
    sendMsg(first);
  });

  function submit() {
    var text = input.value.trim();
    if (!text) return;
    input.value = "";
    sendMsg(text);
  }
  sendBtn.addEventListener("click", submit);
  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
  });

  bubble.addEventListener("click", function () {
    open = !panel.classList.contains("open");
    panel.classList.toggle("open", open);
    if (open) {
      unread = 0; badge.style.display = "none";
      if (session.started) { startChatUI(); poll(); }
      else $(".nm").focus();
    }
  });
  $(".x").addEventListener("click", function () {
    open = false; panel.classList.remove("open");
  });

  /* restore an existing thread on page load (history via poll from 0) */
  if (session.started) {
    api("/poll?session=" + encodeURIComponent(session.id) + "&after=0")
      .then(function (j) {
        var hist = j.messages || [];
        if (hist.length) {
          pre.style.display = "none";
          msgs.style.display = "flex"; ft.style.display = "flex"; note.style.display = "block";
          hist.forEach(function (m) {
            push(m.from === "agent" ? "agent" : "visitor", m.text, m.at);
            if (m.at > lastAt) lastAt = m.at;
          });
          if (!timer) timer = setInterval(poll, 4000);
        }
      }).catch(function () {});
  }
})();
