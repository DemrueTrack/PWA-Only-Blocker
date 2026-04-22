(async function () {
  const params = new URLSearchParams(window.location.search);
  const attemptedUrl = params.get("url") || "";
  const domain = params.get("domain") || "";

  let host = domain;
  try { host = new URL(attemptedUrl).host.replace(/^www\./, ""); } catch {}

  document.getElementById("host").textContent = host || domain || "unknown";
  document.getElementById("domain-foot").textContent = domain ? `re: ${domain}` : "";

  // ---- Browser detection ------------------------------------------------

  async function detectBrowser() {
    try {
      if (navigator.brave && typeof navigator.brave.isBrave === "function") {
        if (await navigator.brave.isBrave()) return "Brave";
      }
    } catch {}
    const brands = navigator.userAgentData?.brands?.map((b) => b.brand) || [];
    const has = (n) => brands.some((b) => b.toLowerCase().includes(n.toLowerCase()));
    if (has("Vivaldi")) return "Vivaldi";
    if (has("Opera")) return "Opera";
    if (has("Arc")) return "Arc";
    if (has("Edge") || has("Microsoft Edge")) return "Edge";
    if (has("Google Chrome")) return "Chrome";
    const ua = navigator.userAgent || "";
    if (/Vivaldi/i.test(ua)) return "Vivaldi";
    if (/OPR\//i.test(ua)) return "Opera";
    if (/Edg\//i.test(ua)) return "Edge";
    if (/Chrome\//i.test(ua)) return "Chrome";
    return "your browser";
  }

  detectBrowser().then((name) => {
    document.getElementById("browserName").textContent = name;
  });

  // ---- Buttons ----------------------------------------------------------

  document.getElementById("back").addEventListener("click", () => {
    if (history.length > 1) history.back();
    else window.close();
  });

  document.getElementById("options").addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
  });
})();
