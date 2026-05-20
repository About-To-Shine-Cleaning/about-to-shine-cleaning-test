// =========================================================
// FILE: /admin/client-info/client-info.js
// TYPE: .js
// ATS Client Info Lookup
// =========================================================

const API_URL = "https://script.google.com/macros/s/AKfycbx2bQ-SSeUHoihjbkYmkJ5-0Dw8JPqH8bhBQR3fbvLsOhDhbuPv0MdVeTdMW6zoVTsWsw/exec";

const DEVICE_KEY_STORAGE = "ats_device_key_v1";
const TOKEN_STORAGE = "ats_admin_token_v1";
const TOKEN_LOCAL = "ats_admin_token_local_v1";

const searchInput = document.getElementById("clientSearch");
const resultsEl = document.getElementById("clientResults");
const clientCard = document.getElementById("clientCard");

let clients = [];

function getDeviceKey() {
  let key = localStorage.getItem(DEVICE_KEY_STORAGE);
  if (!key) {
    key = "dev_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem(DEVICE_KEY_STORAGE, key);
  }
  return key;
}

function getToken() {
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

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function jsonp(action, paramsObj = {}) {
  return new Promise((resolve, reject) => {
    const token = getToken();
    const device = getDeviceKey();

    if (!token) {
      reject(new Error("Missing admin token. Open this from the Admin Panel first."));
      return;
    }

    const cb = "cb_" + Math.random().toString(36).slice(2);
    const script = document.createElement("script");
    script.async = true;

    const params = new URLSearchParams({
      action,
      t: token,
      d: device,
      callback: cb,
      ...paramsObj
    });

    window[cb] = function (data) {
      try { resolve(data); }
      finally {
        try { delete window[cb]; } catch (e) {}
        try { script.remove(); } catch (e) {}
      }
    };

    script.onerror = function () {
      try { delete window[cb]; } catch (e) {}
      try { script.remove(); } catch (e) {}
      reject(new Error("JSONP failed: " + action));
    };

    script.src = API_URL + "?" + params.toString();
    document.body.appendChild(script);
  });
}

async function init() {
  try {
    const data = await jsonp("board_clients");
    if (!data || !data.ok) throw new Error(data?.error || "board_clients failed");

    clients = Array.isArray(data.rows) ? data.rows : [];

    if (searchInput) {
      searchInput.addEventListener("input", handleSearch);
      searchInput.focus();
    }
  } catch (err) {
    console.error(err);
    if (resultsEl) {
      resultsEl.innerHTML = `<div class="client-result">${escapeHtml(String(err?.message || err))}</div>`;
    }
  }
}

function handleSearch() {
  if (!searchInput || !resultsEl) return;

  const q = searchInput.value.trim().toLowerCase();
  resultsEl.innerHTML = "";

  if (!q) return;

  const matches = clients
    .filter(client => String(client.clientName || "").toLowerCase().includes(q))
    .slice(0, 12);

  if (!matches.length) {
    resultsEl.innerHTML = `<div class="client-result">No matching clients.</div>`;
    return;
  }

  matches.forEach(client => {
    const div = document.createElement("div");
    div.className = "client-result";
    div.innerHTML = `
      <strong>${escapeHtml(client.clientName)}</strong>
      <div style="margin-top:4px;opacity:.8;">${escapeHtml(client.address || "")}</div>
      <div style="margin-top:4px;opacity:.7;font-size:13px;">${escapeHtml(client.type || "")}</div>
    `;

    div.addEventListener("click", () => showClient(client));
    resultsEl.appendChild(div);
  });
}

function showClient(client) {
  if (!clientCard) return;

  clientCard.classList.add("open");

  document.getElementById("clientName").textContent = client.clientName || "—";
  document.getElementById("clientAddress").textContent = client.address || "—";
  document.getElementById("clientFrequency").textContent = client.frequency || "—";
  document.getElementById("clientPayout").textContent = client.payout ? "Recorded internally" : "—";
  document.getElementById("clientSpecs").textContent = client.specs || "—";
  document.getElementById("clientSpecialInfo").textContent = client.specialInfo || "—";

  const mapLink = document.getElementById("mapLink");
  if (mapLink) {
    const addr = encodeURIComponent(client.address || "");
    mapLink.href = addr ? `https://www.google.com/maps/search/?api=1&query=${addr}` : "#";
    mapLink.style.display = addr ? "inline-flex" : "none";
  }

  if (resultsEl) resultsEl.innerHTML = "";
  if (searchInput) searchInput.value = client.clientName || "";
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
