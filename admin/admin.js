/* =========================================================
   FILE: /admin/admin.js
   TYPE: .js
   ATS Admin Panel — v1.9.2 fixed role display
   ✅ Correct Clock URL: /clock.html
   ✅ Strict frontend role handling
   ✅ Role-based admin cards
   ✅ Visible header now shows ONLY E## • Name, not role
   ✅ Removed markdown code fence that broke JavaScript
========================================================= */

(() => {
  const API_URL = "https://script.google.com/macros/s/AKfycbx2bQ-SSeUHoihjbkYmkJ5-0Dw8JPqH8bhBQR3fbvLsOhDhbuPv0MdVeTdMW6zoVTsWsw/exec";

  const DEVICE_KEY_STORAGE = "ats_device_key_v1";
  const AUTH_STORAGE  = "ats_admin_auth_v1";
  const TOKEN_STORAGE = "ats_admin_token_v1";
  const TOKEN_LOCAL   = "ats_admin_token_local_v1";

  const ROLE_TOOLS = {
    full_admin: ["clock", "estimator", "estimate_form", "payroll", "legacy", "schedule", "admin_tools", "site_report"],
    schedule_payroll: ["clock", "payroll", "schedule"],
    payroll: ["clock", "payroll"],
    clock_only: ["clock"]
  };

  const statusEl = document.getElementById("status");
  const whoEl = document.getElementById("who");
  const cardsEl = document.getElementById("cards");
  const debugEl = document.getElementById("debug");

  const clockBtn = document.getElementById("clockBtn");

  const desktopLogin = document.getElementById("desktopLogin");
  const desktopToken = document.getElementById("desktopToken");
  const rememberDevice = document.getElementById("rememberDevice");
  const btnDesktopSignIn = document.getElementById("btnDesktopSignIn");
  const btnClearAccess = document.getElementById("btnClearAccess");

  function normalizeRole(role, employeeId) {
    const r = String(role || "").trim().toLowerCase();
    const id = String(employeeId || "").trim().toUpperCase();

    if (r === "admin") {
      if (id === "E01" || id === "E04") return "full_admin";
      if (id === "E02") return "schedule_payroll";
      return "clock_only";
    }

    if (r === "full_admin") return "full_admin";
    if (r === "schedule_payroll") return "schedule_payroll";
    if (r === "payroll") return "payroll";
    if (r === "clock_only") return "clock_only";

    if (id === "E01" || id === "E04") return "full_admin";
    if (id === "E02") return "schedule_payroll";
    return "clock_only";
  }

  function canUse(role, tool) {
    role = normalizeRole(role);
    return (ROLE_TOOLS[role] || ROLE_TOOLS.clock_only).includes(tool);
  }

  function setStatus(msg, state) {
    if (!statusEl) return;
    statusEl.textContent = msg || "";
    statusEl.classList.remove("is-loading", "is-success", "is-error");
    if (state === "loading") statusEl.classList.add("is-loading");
    if (state === "success") statusEl.classList.add("is-success");
    if (state === "error") statusEl.classList.add("is-error");
  }

  function setDebug(msg) {
    if (debugEl) debugEl.textContent = msg || "";
  }

  function getDeviceKey() {
    let key = localStorage.getItem(DEVICE_KEY_STORAGE);
    if (!key) {
      key = "dev_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem(DEVICE_KEY_STORAGE, key);
    }
    return key;
  }

  function removeTokenFromUrl() {
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("t");
      window.history.replaceState({}, "", url.pathname + (url.search ? url.search : ""));
    } catch (e) {}
  }

  function jsonp(url) {
    return new Promise((resolve, reject) => {
      const cb = "cb_" + Math.random().toString(36).slice(2);
      const script = document.createElement("script");
      script.async = true;

      const cleanup = () => {
        try { delete window[cb]; } catch (e) {}
        try { script.remove(); } catch (e) {}
      };

      window[cb] = (data) => {
        try { resolve(data); } finally { cleanup(); }
      };

      script.onerror = () => {
        cleanup();
        reject(new Error("JSONP failed to load: " + url));
      };

      script.src = url + (url.includes("?") ? "&" : "?") + "callback=" + cb;
      document.body.appendChild(script);
    });
  }

  async function ping() {
    return jsonp(`${API_URL}?action=ping`);
  }

  async function auth(token, deviceKey) {
    const url =
      `${API_URL}?action=auth` +
      `&t=${encodeURIComponent(token)}` +
      `&d=${encodeURIComponent(deviceKey)}`;
    return jsonp(url);
  }

  function saveSessionAuth(authObj) {
    try { sessionStorage.setItem(AUTH_STORAGE, JSON.stringify(authObj)); } catch (e) {}
  }

  function saveToken(token, remember) {
    try { sessionStorage.setItem(TOKEN_STORAGE, token); } catch (e) {}
    if (remember) {
      try { localStorage.setItem(TOKEN_LOCAL, token); } catch (e) {}
    }
  }

  function loadAnyTokenFromStorage() {
    try {
      const s = (sessionStorage.getItem(TOKEN_STORAGE) || "").trim();
      if (s) return s;
    } catch (e) {}

    try {
      const l = (localStorage.getItem(TOKEN_LOCAL) || "").trim();
      if (l) return l;
    } catch (e) {}

    return "";
  }

  function clearAccess() {
    try { sessionStorage.removeItem(TOKEN_STORAGE); } catch(e){}
    try { sessionStorage.removeItem(AUTH_STORAGE); } catch(e){}
    try { localStorage.removeItem(TOKEN_LOCAL); } catch(e){}

    setStatus("Access cleared. Reload to sign in again.", "loading");
    if (cardsEl) cardsEl.classList.add("hidden");
    if (desktopLogin) desktopLogin.classList.remove("hidden");
    if (whoEl) whoEl.textContent = "";
  }

  function applyCardPermissions(role) {
    document.querySelectorAll("[data-tool]").forEach(card => {
      const tool = card.getAttribute("data-tool");
      if (canUse(role, tool)) card.classList.remove("hidden");
      else card.classList.add("hidden");
    });
  }

  function showCards(employeeId, employeeName, role) {
    role = normalizeRole(role, employeeId);

    if (whoEl) whoEl.textContent = `${employeeId} • ${employeeName}`;

    if (clockBtn) clockBtn.href = `/clock.html?emp=${encodeURIComponent(employeeId)}`;

    applyCardPermissions(role);

    if (cardsEl) cardsEl.classList.remove("hidden");
    if (desktopLogin) desktopLogin.classList.add("hidden");
  }

  async function runAuthFlow(token, remember) {
    const deviceKey = getDeviceKey();

    setDebug(`API_URL: ${API_URL}`);

    setStatus("Checking secure API (ping)…", "loading");
    const p = await ping();
    if (!p || p.ok !== true) {
      setStatus("Error: ping failed.\n\n" + JSON.stringify(p || {}, null, 2), "error");
      return;
    }

    setStatus("Checking access…", "loading");
    const res = await auth(token, deviceKey);
    if (!res || !res.ok) {
      setStatus(
        `Denied: ${res && res.error ? res.error : "unauthorized"}\n\n${JSON.stringify(res || {}, null, 2)}`,
        "error"
      );
      return;
    }

    const authObj = {
      ok: true,
      employeeId: res.employeeId,
      employeeName: res.employeeName,
      role: normalizeRole(res.role, res.employeeId),
      authedAt: new Date().toISOString()
    };

    saveSessionAuth(authObj);
    saveToken(token, remember);

    showCards(authObj.employeeId, authObj.employeeName, authObj.role);
    setStatus("Access granted ✅", "success");
    removeTokenFromUrl();
    setDebug("Device binding active. Token saved. Token removed from address bar.");

    window.dispatchEvent(new CustomEvent("ats-auth-ready", { detail: authObj }));
  }

  async function boot() {
    const url = new URL(window.location.href);
    const tokenFromUrl = (url.searchParams.get("t") || "").trim();
    const token = tokenFromUrl || loadAnyTokenFromStorage();

    if (!token) {
      setStatus("Desktop sign-in required.\n\n(Or open via NFC link that includes ?t=TOKEN)", "loading");
      if (desktopLogin) desktopLogin.classList.remove("hidden");

      if (btnDesktopSignIn) {
        btnDesktopSignIn.onclick = () => {
          const t = (desktopToken?.value || "").trim();
          if (!t) { alert("Enter your desktop token."); return; }
          runAuthFlow(t, !!rememberDevice?.checked).catch(err =>
            setStatus(String(err?.message || err), "error")
          );
        };
      }

      if (btnClearAccess) btnClearAccess.onclick = () => clearAccess();
      return;
    }

    await runAuthFlow(token, true);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () =>
      boot().catch(err => setStatus(String(err?.message || err), "error"))
    );
  } else {
    boot().catch(err => setStatus(String(err?.message || err), "error"));
  }
})();
