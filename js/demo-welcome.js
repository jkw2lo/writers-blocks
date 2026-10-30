/* Demo or fresh start, for visitors arriving from Jen's portfolio.

   The portfolio's "Open the app" links add ?from=portfolio. When a page opened that way has
   nothing saved yet, this offers two ways in: see the demo (the app filled with sample data,
   so nothing is locked and there's no setup) or start fresh as a new user. While the demo is
   in use, a small banner says so and offers Start fresh. Anyone who comes in another way, or
   already has their own data, never sees any of it.

   The same file is copied into each app (the master is projects/tools/demo-welcome.js); the
   app supplies what differs:

     DemoWelcome.init({
       id: "nihongo-quest",          // names this app's flag in localStorage
       name: "Nihongo Quest",
       accent: "#c2412d",            // the app's own colour, for the demo button
       demo: "What the demo has",    // one line under See the demo
       fresh: "What fresh means",    // one line under Start fresh
       isEmpty: () => true,          // nothing saved yet (may return a promise)
       loadDemo: () => {},           // fill the app with the sample (may return a promise)
       clear: () => {},              // remove the sample again (may return a promise)
       stillDemo: () => true,        // optional: is the sample still what's on screen?
       banner: true,                 // false when the app already marks its sample
       bannerAt: "bottom",           // or "top", if the app has a bar along the bottom
     });
*/
(function () {
  "use strict";

  var FROM = /([?&])from=portfolio(&|$)/;
  var cfg = null, host = null, bannerHost = null, poll = null;

  var flagKey = function () { return "demo-welcome:" + cfg.id; };
  var isOn = function () { try { return localStorage.getItem(flagKey()) === "on"; } catch (e) { return false; } };
  var setOn = function (on) { try { on ? localStorage.setItem(flagKey(), "on") : localStorage.removeItem(flagKey()); } catch (e) {} };
  var later = function (v) { return Promise.resolve(typeof v === "function" ? v() : v); };

  var CSS = [
    ":host { all: initial; }",
    "* { box-sizing: border-box; }",
    ".scrim { position: fixed; inset: 0; z-index: 2147483000; display: grid; place-items: center; padding: 16px;",
    "  background: rgba(20, 18, 16, 0.42); -webkit-backdrop-filter: blur(4px); backdrop-filter: blur(4px);",
    "  font: 400 15px/1.5 ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1d1b18; }",
    ".card { width: min(460px, 100%); max-height: calc(100vh - 32px); overflow: auto; padding: 26px 24px 20px; border-radius: 20px;",
    "  background: #fffdf9; box-shadow: 0 2px 6px rgba(0,0,0,.08), 0 30px 70px -20px rgba(0,0,0,.45); }",
    ".eyebrow { margin: 0; font-size: 12px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase; color: #8a847a; }",
    "h2 { margin: 6px 0 0; font: 600 26px/1.15 ui-serif, Georgia, 'Times New Roman', serif; letter-spacing: -.01em; }",
    ".lead { margin: 8px 0 18px; color: #5a554d; }",
    ".opt { display: block; width: 100%; margin: 0 0 10px; padding: 14px 16px; border-radius: 14px; text-align: left; cursor: pointer;",
    "  font: inherit; color: inherit; background: #fff; border: 1.5px solid #e6e0d6; transition: border-color .15s, transform .15s; }",
    ".opt:hover { border-color: #bdb5a8; transform: translateY(-1px); }",
    ".opt:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }",
    ".opt b { display: block; font-size: 16px; }",
    ".opt span { display: block; margin-top: 2px; color: #6b665e; font-size: 14px; }",
    ".opt.demo { background: var(--accent); border-color: var(--accent); color: var(--on); }",
    ".opt.demo span { color: inherit; opacity: .88; }",
    ".opt.demo:hover { filter: brightness(1.06); }",
    ".fine { margin: 6px 0 0; font-size: 12.5px; color: #8a847a; }",
    ".banner { position: fixed; left: 12px; z-index: 2147483000; display: flex; align-items: center; gap: 10px; max-width: calc(100vw - 24px);",
    "  padding: 6px 6px 6px 12px; border-radius: 999px; background: rgba(29, 27, 24, .9); color: #fff; box-shadow: 0 4px 16px rgba(0,0,0,.25);",
    "  font: 500 13px/1.3 ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }",
    ".banner.bottom { bottom: calc(12px + env(safe-area-inset-bottom, 0px)); }",
    ".banner.top { top: calc(12px + env(safe-area-inset-top, 0px)); }",
    ".banner .short { display: none; }",
    "@media (max-width: 420px) { .banner .long { display: none; } .banner .short { display: inline; } }",
    ".banner i { width: 8px; height: 8px; flex: none; border-radius: 50%; background: var(--accent); }",
    ".banner button { flex: none; padding: 5px 11px; border: 0; border-radius: 999px; cursor: pointer; font: inherit; font-weight: 600; font-size: 12.5px;",
    "  background: #fff; color: #1d1b18; }",
    ".banner button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }",
    "@media (prefers-color-scheme: dark) {",
    "  .scrim { color: #f1ede6; }",
    "  .card { background: #22201d; }",
    "  .lead { color: #c9c3b8; } .eyebrow, .fine { color: #9b958b; }",
    "  .opt { background: #2b2925; border-color: #3d3a35; } .opt:hover { border-color: #5a564f; } .opt span { color: #b5afa5; }",
    "}",
    "@media (prefers-reduced-motion: reduce) { .opt { transition: none; } .opt:hover { transform: none; } }",
  ].join("\n");

  // white or near-black text, whichever reads better on the accent
  function inkOn(hex) {
    var n = parseInt(String(hex).slice(1), 16);
    if (isNaN(n)) return "#fff";
    var lum = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(function (v) {
      v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * lum[0] + 0.7152 * lum[1] + 0.0722 * lum[2] > 0.4 ? "#1d1b18" : "#fff";
  }

  function mount(tag) {
    var el = document.createElement(tag);
    var root = el.attachShadow({ mode: "open" });
    root.innerHTML = "<style>" + CSS + "</style>";
    el.style.setProperty("--accent", cfg.accent || "#1d1b18");
    el.style.setProperty("--on", inkOn(cfg.accent || "#1d1b18"));
    document.body.appendChild(el);
    return root;
  }
  var esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; });
  };

  function showChoice() {
    var root = mount("demo-welcome");
    host = root.host;
    var wrap = document.createElement("div");
    wrap.className = "scrim";
    wrap.innerHTML =
      '<div class="card" role="dialog" aria-modal="true" aria-labelledby="dw-title">' +
        '<p class="eyebrow">From Jen’s portfolio</p>' +
        '<h2 id="dw-title">' + esc(cfg.name) + "</h2>" +
        '<p class="lead">Look around with sample data already in it, or start from a blank slate the way a new user would.</p>' +
        '<button type="button" class="opt demo" data-pick="demo"><b>See the demo</b><span>' + esc(cfg.demo) + "</span></button>" +
        '<button type="button" class="opt" data-pick="fresh"><b>Start fresh</b><span>' + esc(cfg.fresh) + "</span></button>" +
        (cfg.banner === false ? "" : '<p class="fine">You can leave the demo and start fresh at any time.</p>') +
      "</div>";
    root.appendChild(wrap);
    var close = function () { if (host) { host.remove(); host = null; } document.removeEventListener("keydown", onKey, true); };
    var onKey = function (e) { if (e.key === "Escape") { e.stopPropagation(); close(); } };
    document.addEventListener("keydown", onKey, true);
    wrap.addEventListener("click", function (e) {
      var b = e.target.closest && e.target.closest("[data-pick]");
      if (!b) return;
      close();
      if (b.dataset.pick === "demo") {
        setOn(true);
        later(cfg.loadDemo).then(showBanner, function (err) { setOn(false); console.warn("demo didn't load", err); });
      }
    });
    root.querySelector(".opt.demo").focus();
  }

  function showBanner() {
    if (cfg.banner === false || bannerHost || !isOn()) return;
    var root = mount("demo-welcome-banner");
    bannerHost = root.host;
    var bar = document.createElement("div");
    bar.className = "banner " + (cfg.bannerAt === "top" ? "top" : "bottom");
    bar.setAttribute("role", "status");
    bar.innerHTML = "<i></i><span class=\"long\">You’re looking at a demo</span><span class=\"short\">Demo</span>" +
      "<button type=\"button\">Start fresh</button>";
    root.appendChild(bar);
    bar.querySelector("button").addEventListener("click", function () {
      if (!confirm("Start fresh? The demo’s sample data goes away, and you start as a new user.")) return;
      leave();
    });
    // an app whose sample can be closed by other means (Writers Blocks) says when it's gone
    if (cfg.stillDemo) poll = setInterval(function () { if (!cfg.stillDemo()) { setOn(false); hideBanner(); } }, 1000);
  }
  function hideBanner() {
    clearInterval(poll);
    if (bannerHost) { bannerHost.remove(); bannerHost = null; }
  }
  function leave() {
    hideBanner();
    later(cfg.clear).then(function () { setOn(false); });
  }

  window.DemoWelcome = {
    init: function (c) {
      cfg = c;
      var fromPortfolio = FROM.test(location.search);
      if (fromPortfolio) {
        // tidy the address so a reload or a shared link doesn't ask again
        var q = location.search.replace(FROM, function (m, a, b) { return b ? a : ""; }).replace(/^&/, "?");
        try { history.replaceState(history.state, "", location.pathname + (q === "?" ? "" : q) + location.hash); } catch (e) {}
      }
      if (isOn()) {
        if (cfg.stillDemo && !cfg.stillDemo()) setOn(false); else showBanner();
      }
      if (!fromPortfolio || isOn()) return;
      later(cfg.isEmpty).then(function (empty) { if (empty) showChoice(); });
    },
    // for an app's own "start fresh" or reset, so the banner goes with it
    off: function () { setOn(false); hideBanner(); },
  };
})();
