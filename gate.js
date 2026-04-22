// PWA-Only Blocker — gate content script
// Runs at document_start on every page, activates only when:
//   1. Window is in standalone (PWA) display mode.
//   2. Current hostname is in the user's block list.
// After correct domain input, a 10-second countdown runs before dismissal.

const COUNTDOWN_SECONDS = 10;

(async function () {
  // ---- 1. Quick exits ---------------------------------------------------

  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: window-controls-overlay)").matches ||
    window.matchMedia("(display-mode: minimal-ui)").matches;

  if (!isStandalone) return;
  if (window.top !== window) return;

  const host = location.hostname.replace(/^www\./, "").toLowerCase();
  if (!host) return;

  let stored;
  try {
    stored = await chrome.storage.sync.get(["blockedDomains", "enabled"]);
  } catch {
    return;
  }
  const blocked = stored.blockedDomains || [];
  const enabled = stored.enabled !== false;
  if (!enabled) return;
  if (!blocked.includes(host)) return;

  // ---- 2. Mount overlay -------------------------------------------------

  const mountHost = document.createElement("div");
  mountHost.id = "__pwa_gate_mount__";
  mountHost.style.cssText =
    "all: initial; position: fixed; inset: 0; z-index: 2147483647;";
  (document.documentElement || document).appendChild(mountHost);

  const shadow = mountHost.attachShadow({ mode: "closed" });

  shadow.innerHTML = `
    <style>
      @import url("https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,400;1,9..144,400&family=JetBrains+Mono:wght@400;500&display=swap");

      :host, .wrap, .wrap * { box-sizing: border-box; }

      .wrap {
        position: fixed; inset: 0;
        background: #13110f;
        color: #f4efe6;
        font-family: "Fraunces", Georgia, serif;
        display: grid;
        place-items: center;
        opacity: 0;
        animation: fadeIn 0.35s ease forwards;
        -webkit-font-smoothing: antialiased;
        overflow: hidden;
      }
      .wrap::before {
        content: ""; position: absolute; inset: 0;
        background:
          radial-gradient(circle at 30% 20%, rgba(139,46,31,0.15), transparent 55%),
          radial-gradient(circle at 75% 85%, rgba(244,239,230,0.04), transparent 60%);
        pointer-events: none;
      }
      .wrap::after {
        content: ""; position: absolute; inset: 0;
        background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.05 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>");
        opacity: 0.8; mix-blend-mode: screen; pointer-events: none;
      }

      .card {
        position: relative; z-index: 1;
        max-width: 560px; width: calc(100% - 48px);
        text-align: center;
        display: grid; gap: 28px;
      }

      .marker {
        font-family: "JetBrains Mono", monospace;
        font-size: 11px; letter-spacing: 0.2em; text-transform: uppercase;
        color: rgba(244,239,230,0.55);
        display: flex; align-items: center; justify-content: center; gap: 14px;
      }
      .marker::before, .marker::after {
        content: ""; width: 24px; height: 1px; background: rgba(244,239,230,0.35);
      }

      h1 {
        font-weight: 300; font-size: clamp(28px, 5vw, 44px);
        line-height: 1.1; letter-spacing: -0.02em; margin: 0;
      }
      h1 em { font-style: italic; color: #e8826f; font-weight: 400; }

      .domain {
        font-family: "JetBrains Mono", monospace;
        font-size: clamp(20px, 3.5vw, 28px); letter-spacing: 0.04em;
        font-weight: 500; color: #f4efe6; padding: 14px 0;
        border-top: 1px solid rgba(244,239,230,0.15);
        border-bottom: 1px solid rgba(244,239,230,0.15);
      }

      .input-wrap { display: grid; gap: 0; }

      input {
        width: 100%; font-family: "JetBrains Mono", monospace; font-size: 20px;
        padding: 18px 20px; border: 1px solid rgba(244,239,230,0.3);
        background: transparent; color: #f4efe6; outline: none;
        text-align: center; letter-spacing: 0.05em;
        transition: border-color 0.15s, box-shadow 0.15s;
      }
      input::placeholder {
        color: rgba(244,239,230,0.3); font-style: italic;
        font-family: "Fraunces", serif; letter-spacing: 0;
      }
      input:focus { border-color: #e8826f; box-shadow: 0 0 0 1px rgba(232,130,111,0.25); }
      input.shake { animation: shake 0.35s ease; border-color: #c44; }
      input.success { border-color: #6a9a4a; color: #8fc060; }

      /* countdown bar — shown below input after correct entry */
      .countdown-wrap {
        display: none;
        flex-direction: column;
        gap: 8px;
        padding: 14px 0 2px;
      }
      .countdown-wrap.show { display: flex; }
      .countdown-label {
        font-family: "JetBrains Mono", monospace;
        font-size: 12px; letter-spacing: 0.14em; text-transform: uppercase;
        color: rgba(244,239,230,0.6);
        display: flex; justify-content: space-between;
      }
      .countdown-label .tick {
        color: #8fc060; font-weight: 500;
        transition: color 0.3s;
      }
      .bar-track {
        width: 100%; height: 2px;
        background: rgba(244,239,230,0.12);
        position: relative; overflow: hidden;
      }
      .bar-fill {
        position: absolute; top: 0; left: 0; height: 100%;
        background: #6a9a4a;
        width: 100%;
      }

      .hint {
        font-size: 14px; color: rgba(244,239,230,0.5);
        font-family: "Fraunces", serif; line-height: 1.5;
      }
      .hint em { color: rgba(244,239,230,0.8); font-style: italic; }

      .row {
        display: flex; gap: 12px; justify-content: center; flex-wrap: wrap;
      }
      button {
        font-family: "JetBrains Mono", monospace; font-size: 11px;
        letter-spacing: 0.15em; text-transform: uppercase;
        padding: 10px 18px; border: 1px solid rgba(244,239,230,0.3);
        background: transparent; color: rgba(244,239,230,0.7); cursor: pointer;
        transition: all 0.15s;
      }
      button:hover { color: #f4efe6; border-color: #f4efe6; }

      @keyframes fadeIn  { to { opacity: 1; } }
      @keyframes fadeOut { to { opacity: 0; } }
      @keyframes shake {
        0%, 100% { transform: translateX(0); }
        20%  { transform: translateX(-8px); }
        40%  { transform: translateX(8px); }
        60%  { transform: translateX(-5px); }
        80%  { transform: translateX(5px); }
      }
      .wrap.dismissing { animation: fadeOut 0.4s ease forwards; }
    </style>

    <div class="wrap" part="wrap">
      <div class="card">
        <div class="marker">PWA entry gate</div>
        <h1>To enter, type the <em>domain</em>.</h1>
        <div class="domain" id="domain"></div>

        <div class="input-wrap">
          <input
            id="input" type="text"
            autocomplete="off" autocapitalize="off"
            autocorrect="off" spellcheck="false"
            placeholder="type it out" />
          <div class="countdown-wrap" id="countdownWrap">
            <div class="countdown-label">
              <span>entering in</span>
              <span class="tick" id="tick">${COUNTDOWN_SECONDS}s</span>
            </div>
            <div class="bar-track">
              <div class="bar-fill" id="barFill"></div>
            </div>
          </div>
        </div>

        <div class="hint" id="hint">
          Loaded and waiting. <em>Type the domain above</em> to continue.
        </div>

        <div class="row">
          <button id="cancel">Close window</button>
        </div>
      </div>
    </div>
  `;

  const wrap        = shadow.querySelector(".wrap");
  const input       = shadow.getElementById("input");
  const domainEl    = shadow.getElementById("domain");
  const cancelBtn   = shadow.getElementById("cancel");
  const countdownWrap = shadow.getElementById("countdownWrap");
  const tickEl      = shadow.getElementById("tick");
  const barFill     = shadow.getElementById("barFill");
  const hintEl      = shadow.getElementById("hint");

  domainEl.textContent = host;

  // Focus management
  const focusInput = () => {
    try { input.focus({ preventScroll: true }); } catch {}
  };
  focusInput();
  setTimeout(focusInput, 60);
  setTimeout(focusInput, 250);
  setTimeout(focusInput, 800);

  document.addEventListener("focusin", (e) => {
    if (mountHost.isConnected && !mountHost.contains(e.target)) focusInput();
  }, true);

  // Swallow page keyboard events while gate is up
  const swallow = (e) => {
    if (!mountHost.isConnected) return;
    if (shadow.contains(e.composedPath()[0])) return;
    e.stopPropagation();
  };
  window.addEventListener("keydown",  swallow, true);
  window.addEventListener("keyup",    swallow, true);
  window.addEventListener("keypress", swallow, true);

  function normalizeAttempt(raw) {
    if (!raw) return "";
    let s = String(raw).trim().toLowerCase();
    s = s.replace(/^https?:\/\//, "").replace(/^www\./, "");
    s = s.split("/")[0].split("?")[0].split("#")[0];
    return s;
  }

  function dismiss() {
    wrap.classList.add("dismissing");
    setTimeout(() => {
      mountHost.remove();
      window.removeEventListener("keydown",  swallow, true);
      window.removeEventListener("keyup",    swallow, true);
      window.removeEventListener("keypress", swallow, true);
    }, 420);
  }

  let countingDown = false;

  function startCountdown() {
    if (countingDown) return;
    countingDown = true;

    input.disabled = true;
    input.classList.add("success");
    countdownWrap.classList.add("show");
    hintEl.innerHTML = "Committed. Sit with it for a moment.";

    let remaining = COUNTDOWN_SECONDS;
    tickEl.textContent = `${remaining}s`;
    // bar starts full; set transition to match countdown duration exactly
    barFill.style.width = "100%";
    barFill.style.transition = `width ${COUNTDOWN_SECONDS}s linear, background ${COUNTDOWN_SECONDS}s linear`;

    // kick off the drain after a frame so the transition fires
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        barFill.style.width = "0%";
        barFill.style.background = "#c44";
      });
    });

    const interval = setInterval(() => {
      remaining -= 1;
      tickEl.textContent = remaining > 0 ? `${remaining}s` : "now";
      if (remaining <= 0) {
        clearInterval(interval);
        dismiss();
      }
    }, 1000);
  }

  input.addEventListener("input", () => {
    if (countingDown) return;
    input.classList.remove("shake");
    if (normalizeAttempt(input.value) === host) {
      startCountdown();
    }
  });

  input.addEventListener("keydown", (e) => {
    if (countingDown) return;
    if (e.key === "Enter") {
      if (normalizeAttempt(input.value) !== host) {
        input.classList.remove("shake");
        void input.offsetWidth;
        input.classList.add("shake");
      }
    }
    if (e.key === "Escape") cancelBtn.click();
  });

  cancelBtn.addEventListener("click", () => {
    try { window.close(); } catch {}
    try { history.back(); } catch {}
  });
})();
