/*
 * Swipe deck. Host-agnostic: everything goes through window.MovieBridge,
 *   MovieBridge.send(action, payloadObject)   – user actions to the host
 *   MovieBridge.onState(callback)             – host pushes the deck state
 * On desktop the host is Python via QWebChannel. An Android WebView can provide
 * the same two functions (e.g. with addJavascriptInterface) and reuse this page.
 */
(function () {
  "use strict";

  // ---- host bridge ------------------------------------------------------
  const listeners = [];
  const MovieBridge = (window.MovieBridge = window.MovieBridge || {
    _host: null,
    send(action, payload) {
      const json = JSON.stringify(payload || {});
      if (this._host) this._host.action(action, json);
      else if (window.AndroidBridge) window.AndroidBridge.action(action, json);
      else console.log("[bridge:noop]", action, json);
    },
    onState(cb) { listeners.push(cb); },
  });
  window.__movieNightPushState = (json) =>
    listeners.forEach((cb) => cb(typeof json === "string" ? JSON.parse(json) : json));

  function connect() {
    if (window.qt && window.qt.webChannelTransport && window.QWebChannel) {
      new QWebChannel(qt.webChannelTransport, (channel) => {
        const host = channel.objects.bridge;
        MovieBridge._host = host;
        host.stateChanged.connect((s) => window.__movieNightPushState(s));
        MovieBridge.send("ready");
      });
    } else {
      MovieBridge.send("ready");
    }
  }

  // ---- rendering --------------------------------------------------------
  const stage = document.getElementById("stage");
  const banner = document.getElementById("banner");
  const meta = document.getElementById("meta");
  const undoBtn = document.getElementById("undo");
  const moreBtn = document.getElementById("more");
  const verdictButtons = Array.from(document.querySelectorAll("[data-verdict]"));

  const STAMPS = { no: "Ne", want: "Taip", seen_liked: "Matėm 👀", later: "Vėliau ⏳" };
  const SWIPE_DIR = { left: "no", right: "want", up: "seen_liked", down: "later" };
  const THRESHOLD = 110;

  let state = null;
  let pendingState = null;
  let animating = false;

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function cardHtml(m) {
    return `
      <div class="scroll">
        <div class="emoji">${esc(m.emoji || "🎬")}</div>
        <h1>${esc(m.title)}<span class="year">${esc(m.year)}</span></h1>
        <p class="desc">${esc(m.desc_lt)}</p>
        ${m.why_lt ? `<p class="why"><span class="label">Kodėl tinka</span>${esc(m.why_lt)}</p>` : ""}
        ${m.kid_note_lt ? `<p class="kid"><span class="label">🧒 6-mečiui</span>${esc(m.kid_note_lt)}</p>` : ""}
      </div>
      <div class="source">${m.source === "seed" ? "Pradinis sąrašas" : "🤖 AI pasiūlymas"}</div>
      ${Object.entries(STAMPS).map(([k, v]) => `<div class="stamp ${k}">${esc(v)}</div>`).join("")}`;
  }

  function statusCard(kind, html) {
    const el = document.createElement("div");
    el.className = `card status ${kind}`;
    el.innerHTML = html;
    return el;
  }

  function render(s) {
    state = s;
    const ai = s.ai || {};
    meta.textContent = `Liko kortelių: ${s.remaining} · Įvertinta: ${s.rated}`;
    undoBtn.disabled = !s.can_undo;
    moreBtn.disabled = ai.status === "loading";
    verdictButtons.forEach((b) => (b.disabled = !s.top));

    // Banner for background AI work while cards are still available.
    if (s.top && ai.status === "loading") {
      banner.className = "banner";
      banner.innerHTML = `<div class="spinner mini-spinner"></div> ${esc(ai.label)} ieško naujų filmų…`;
      banner.hidden = false;
    } else if (s.top && ai.status === "error") {
      banner.className = "banner error";
      banner.innerHTML = `⚠ ${esc(ai.message)} <button class="tool" data-retry>Bandyti dar kartą</button>`;
      banner.hidden = false;
    } else {
      banner.hidden = true;
    }

    stage.replaceChildren();
    if (s.top) {
      if (s.next) {
        const behind = document.createElement("div");
        behind.className = "card behind";
        behind.innerHTML = cardHtml(s.next);
        stage.appendChild(behind);
      }
      const card = document.createElement("div");
      card.className = "card";
      card.dataset.key = s.top.key;
      card.innerHTML = cardHtml(s.top);
      stage.appendChild(card);
      attachDrag(card);
    } else if (ai.status === "loading") {
      stage.appendChild(statusCard("loading", `
        <div class="spinner"></div>
        <h2>Ieškome naujų filmų…</h2>
        <p>${esc(ai.label)} renka pasiūlymus pagal jūsų įvertinimus. Tai gali užtrukti iki minutės.</p>`));
    } else if (ai.status === "error") {
      stage.appendChild(statusCard("error", `
        <div class="big">⚠️</div>
        <h2>Nepavyko gauti pasiūlymų</h2>
        <p class="msg">${esc(ai.message)}</p>
        <button class="primary" data-retry>Bandyti dar kartą</button>
        <p>Teikėją ir raktą galite pakeisti meniu „Nustatymai“.</p>`));
    } else {
      stage.appendChild(statusCard("empty", `
        <div class="big">🎉</div>
        <h2>Kortelės baigėsi</h2>
        <p>Peržiūrėkite sąrašą skirtuke „Sąrašas“ arba paprašykite AI daugiau.</p>
        <button class="primary" data-more>🤖 Daugiau pasiūlymų</button>`));
    }
  }

  function receive(s) {
    if (animating) pendingState = s;
    else render(s);
  }

  // ---- actions ----------------------------------------------------------
  function decide(verdict, card) {
    card = card || stage.querySelector(".card:not(.behind):not(.status)");
    if (!card || animating || !state || !state.top) return;
    flashButton(verdict);
    const dx = { no: -1, want: 1, super: 1, me_yes_kid_no: 1, kid_yes_me_no: 1 }[verdict] || 0;
    const dy = { seen_liked: -1, later: 1, super: -0.3 }[verdict] || 0;
    const w = stage.clientWidth * 1.4, h = stage.clientHeight * 1.2;
    animating = true;
    card.classList.remove("dragging");
    card.classList.add("animate");
    card.style.transform = `translate(${dx * w}px, ${dy * h}px) rotate(${dx * 18}deg)`;
    card.style.opacity = "0";
    const key = card.dataset.key;
    setTimeout(() => {
      animating = false;
      MovieBridge.send("rate", { key, verdict });
      if (pendingState) { const s = pendingState; pendingState = null; render(s); }
    }, 300);
  }

  function flashButton(verdict) {
    const b = verdictButtons.find((x) => x.dataset.verdict === verdict);
    if (!b) return;
    b.classList.add("flash");
    setTimeout(() => b.classList.remove("flash"), 250);
  }

  function attachDrag(card) {
    let start = null;
    const stamps = {};
    card.querySelectorAll(".stamp").forEach((el) => {
      stamps[[...el.classList].find((c) => c !== "stamp")] = el;
    });
    const direction = (dx, dy) => {
      if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? "right" : "left";
      return dy > 0 ? "down" : "up";
    };
    card.addEventListener("pointerdown", (e) => {
      if (animating || e.button !== 0) return;
      start = { x: e.clientX, y: e.clientY };
      card.setPointerCapture(e.pointerId);
      card.classList.add("dragging");
    });
    card.addEventListener("pointermove", (e) => {
      if (!start) return;
      const dx = e.clientX - start.x, dy = e.clientY - start.y;
      card.style.transform = `translate(${dx}px, ${dy}px) rotate(${dx / 18}deg)`;
      const dist = Math.max(Math.abs(dx), Math.abs(dy));
      const active = SWIPE_DIR[direction(dx, dy)];
      Object.entries(stamps).forEach(([k, el]) => {
        el.style.opacity = k === active ? Math.min(1, dist / THRESHOLD) : 0;
      });
    });
    const end = (e) => {
      if (!start) return;
      const dx = e.clientX - start.x, dy = e.clientY - start.y;
      start = null;
      if (Math.max(Math.abs(dx), Math.abs(dy)) >= THRESHOLD) {
        decide(SWIPE_DIR[direction(dx, dy)], card);
      } else {
        card.classList.remove("dragging");
        card.classList.add("animate");
        card.style.transform = "";
        Object.values(stamps).forEach((el) => (el.style.opacity = 0));
        setTimeout(() => card.classList.remove("animate"), 320);
      }
    };
    card.addEventListener("pointerup", end);
    card.addEventListener("pointercancel", end);
  }

  verdictButtons.forEach((b) => b.addEventListener("click", () => decide(b.dataset.verdict)));
  undoBtn.addEventListener("click", () => MovieBridge.send("undo"));
  moreBtn.addEventListener("click", () => MovieBridge.send("more"));
  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-retry]")) MovieBridge.send("retry");
    if (e.target.closest("[data-more]")) MovieBridge.send("more");
  });

  const KEYS = {
    ArrowLeft: "no", ArrowRight: "want", ArrowUp: "seen_liked", ArrowDown: "later",
    s: "super", a: "me_yes_kid_no", v: "kid_yes_me_no",
    1: "no", 2: "want", 3: "super", 4: "later", 5: "seen_liked", 6: "me_yes_kid_no", 7: "kid_yes_me_no",
  };
  document.addEventListener("keydown", (e) => {
    if (e.target.closest("input, textarea")) return;
    if ((e.key === "z" && (e.ctrlKey || e.metaKey)) || e.key === "Backspace") {
      e.preventDefault();
      MovieBridge.send("undo");
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    let verdict = KEYS[e.key.length === 1 ? e.key.toLowerCase() : e.key];
    if (e.key === "ArrowRight" && e.shiftKey) verdict = "super";
    if (verdict) { e.preventDefault(); decide(verdict); }
  });

  MovieBridge.onState(receive);
  connect();
})();
