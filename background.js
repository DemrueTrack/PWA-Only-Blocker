// PWA-Only Blocker — background service worker
// Intercepts main-frame navigation to user-blocked domains in NORMAL browser
// windows only. Installed PWA windows are `app` type and pass through.

const DEFAULT_STATE = {
  blockedDomains: [],
  enabled: true,
  // Tab IDs temporarily allowed (user clicked "continue anyway")
  // Kept in memory only — cleared on SW restart, which is fine.
};

const bypassTabs = new Set();

// --- Storage helpers -------------------------------------------------------

async function getState() {
  const stored = await chrome.storage.sync.get(["blockedDomains", "enabled"]);
  return {
    blockedDomains: stored.blockedDomains ?? [],
    enabled: stored.enabled ?? true,
  };
}

async function setBlockedDomains(list) {
  const normalized = [...new Set(list.map(normalizeDomain).filter(Boolean))];
  await chrome.storage.sync.set({ blockedDomains: normalized });
  return normalized;
}

function normalizeDomain(input) {
  if (!input) return "";
  let s = String(input).trim().toLowerCase();
  // Strip scheme and path
  s = s.replace(/^https?:\/\//, "").replace(/^www\./, "");
  s = s.split("/")[0].split("?")[0].split("#")[0];
  // Must look like a hostname
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(s)) return "";
  return s;
}

function hostMatchesBlocked(host, blockedList) {
  if (!host) return null;
  const h = host.replace(/^www\./, "").toLowerCase();
  for (const domain of blockedList) {
    // Exact match only — each subdomain is its own "service".
    // User adds music.youtube.com explicitly if they want it blocked.
    if (h === domain) {
      return domain;
    }
  }
  return null;
}

// --- Navigation interception ----------------------------------------------

chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  // Main frame only
  if (details.frameId !== 0) return;

  const url = details.url;
  if (!url || !/^https?:/i.test(url)) return;

  const { blockedDomains, enabled } = await getState();
  if (!enabled || blockedDomains.length === 0) return;

  let host;
  try {
    host = new URL(url).hostname;
  } catch {
    return;
  }

  const matched = hostMatchesBlocked(host, blockedDomains);
  if (!matched) return;

  // Check the window type. PWA windows are "app", regular browser is "normal".
  let windowType = "normal";
  try {
    const win = await chrome.windows.get(details.tabId === -1 ? 0 : (await chrome.tabs.get(details.tabId)).windowId);
    windowType = win.type;
  } catch (e) {
    // If we can't determine, fall back to tab lookup
    try {
      const tab = await chrome.tabs.get(details.tabId);
      const win = await chrome.windows.get(tab.windowId);
      windowType = win.type;
    } catch {
      windowType = "normal";
    }
  }

  if (windowType !== "normal") {
    // It's a PWA/app window — let it through.
    return;
  }

  // Tab-specific one-time bypass
  if (bypassTabs.has(details.tabId)) {
    bypassTabs.delete(details.tabId);
    return;
  }

  // Redirect to the blocked page
  const blockedUrl = chrome.runtime.getURL(
    `blocked.html?url=${encodeURIComponent(url)}&domain=${encodeURIComponent(matched)}`
  );
  chrome.tabs.update(details.tabId, { url: blockedUrl });
});

// --- Message handling for blocked page actions ----------------------------

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "BYPASS_ONCE" && typeof msg.tabId === "number" && msg.url) {
    bypassTabs.add(msg.tabId);
    chrome.tabs.update(msg.tabId, { url: msg.url });
    sendResponse({ ok: true });
    return true;
  }
  if (msg?.type === "GET_STATE") {
    getState().then(sendResponse);
    return true; // async
  }
  if (msg?.type === "SET_DOMAINS") {
    setBlockedDomains(msg.domains).then((d) =>
      sendResponse({ ok: true, blockedDomains: d })
    );
    return true;
  }
  if (msg?.type === "SET_ENABLED") {
    chrome.storage.sync.set({ enabled: !!msg.enabled }).then(() =>
      sendResponse({ ok: true })
    );
    return true;
  }
});

// --- First-run defaults ---------------------------------------------------

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === "install") {
    await chrome.storage.sync.set({
      blockedDomains: ["youtube.com", "x.com", "twitter.com"],
      enabled: true,
    });
    chrome.runtime.openOptionsPage();
  }
});
