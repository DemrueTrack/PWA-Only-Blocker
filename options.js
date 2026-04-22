(function () {
  const listEl = document.getElementById("list");
  const input = document.getElementById("input");
  const addBtn = document.getElementById("add");
  const toast = document.getElementById("toast");
  const switchEl = document.getElementById("switch");
  const switchLabel = document.getElementById("switchLabel");

  let state = { blockedDomains: [], enabled: true };

  function normalize(raw) {
    if (!raw) return "";
    let s = String(raw).trim().toLowerCase();
    s = s.replace(/^https?:\/\//, "").replace(/^www\./, "");
    s = s.split("/")[0].split("?")[0].split("#")[0];
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(s)) return "";
    return s;
  }

  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add("show");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toast.classList.remove("show"), 1500);
  }

  function render() {
    listEl.innerHTML = "";
    if (state.blockedDomains.length === 0) {
      const li = document.createElement("li");
      li.className = "empty";
      li.textContent = "Nothing blocked yet. Add a domain above.";
      listEl.appendChild(li);
      return;
    }
    state.blockedDomains
      .slice()
      .sort()
      .forEach((domain) => {
        const li = document.createElement("li");
        const span = document.createElement("span");
        span.textContent = domain;
        const btn = document.createElement("button");
        btn.className = "remove";
        btn.textContent = "Remove";
        btn.addEventListener("click", () => removeDomain(domain));
        li.appendChild(span);
        li.appendChild(btn);
        listEl.appendChild(li);
      });

    switchEl.classList.toggle("on", state.enabled);
    switchLabel.textContent = state.enabled ? "Active" : "Disabled";
  }

  async function addDomain() {
    const clean = normalize(input.value);
    if (!clean) {
      showToast("Invalid domain");
      input.focus();
      return;
    }
    if (state.blockedDomains.includes(clean)) {
      showToast("Already on list");
      input.value = "";
      return;
    }
    const newList = [...state.blockedDomains, clean];
    const resp = await chrome.runtime.sendMessage({
      type: "SET_DOMAINS",
      domains: newList,
    });
    state.blockedDomains = resp.blockedDomains;
    input.value = "";
    render();
    showToast("Added");
  }

  async function removeDomain(d) {
    const newList = state.blockedDomains.filter((x) => x !== d);
    const resp = await chrome.runtime.sendMessage({
      type: "SET_DOMAINS",
      domains: newList,
    });
    state.blockedDomains = resp.blockedDomains;
    render();
    showToast("Removed");
  }

  async function toggleEnabled() {
    state.enabled = !state.enabled;
    await chrome.runtime.sendMessage({
      type: "SET_ENABLED",
      enabled: state.enabled,
    });
    render();
    showToast(state.enabled ? "Active" : "Disabled");
  }

  addBtn.addEventListener("click", addDomain);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") addDomain();
  });
  switchEl.addEventListener("click", toggleEnabled);

  chrome.runtime.sendMessage({ type: "GET_STATE" }, (s) => {
    if (s) {
      state = s;
      render();
    }
  });
})();
