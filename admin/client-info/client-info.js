// =========================================================
// FILE: /admin/client-info/client-info.js
// TYPE: .js
// ATS Client Info Lookup — v2 Expandable UI
// Safe frontend-only redesign. Uses existing board_clients route.
// =========================================================

const API_URL = "https://script.google.com/macros/s/AKfycbx2bQ-SSeUHoihjbkYmkJ5-0Dw8JPqH8bhBQR3fbvLsOhDhbuPv0MdVeTdMW6zoVTsWsw/exec";

const DEVICE_KEY_STORAGE = "ats_device_key_v1";
const TOKEN_STORAGE = "ats_admin_token_v1";
const TOKEN_LOCAL = "ats_admin_token_local_v1";

const searchInput = document.getElementById("clientSearch");
const resultsEl = document.getElementById("clientResults");
const clientCard = document.getElementById("clientCard");
const clientEmptyState = document.getElementById("clientEmptyState");
const clientCount = document.getElementById("clientCount");
const filterButtons = Array.from(document.querySelectorAll("[data-filter]"));

let clients = [];
let currentFilter = "all";
let selectedClientKey = "";

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

function cleanText(value, fallback = "—") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function clientKey(client) {
  return String(client.clientId || client.id || client.clientName || "").trim().toLowerCase();
}

function normalizeClientType(client) {
  const raw = String(client.type || client.clientType || client.category || "").trim().toLowerCase();
  if (raw.includes("commercial")) return "commercial";
  if (raw.includes("residential")) return "residential";
  if (raw.includes("inactive")) return "inactive";
  return raw || "client";
}

function titleCase(value) {
  const s = String(value || "").trim();
  if (!s) return "Client";
  return s.replace(/\w\S*/g, txt => txt.charAt(0).toUpperCase() + txt.slice(1).toLowerCase());
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

    const timeout = setTimeout(() => {
      try { delete window[cb]; } catch (e) {}
      try { script.remove(); } catch (e) {}
      reject(new Error("JSONP timeout: " + action));
    }, 30000);

    window[cb] = function (data) {
      clearTimeout(timeout);
      try { resolve(data); }
      finally {
        try { delete window[cb]; } catch (e) {}
        try { script.remove(); } catch (e) {}
      }
    };

    script.onerror = function () {
      clearTimeout(timeout);
      try { delete window[cb]; } catch (e) {}
      try { script.remove(); } catch (e) {}
      reject(new Error("JSONP failed: " + action));
    };

    script.src = API_URL + "?" + params.toString();
    document.body.appendChild(script);
  });
}

async function init() {
  wireFilters();
  wireAccordion();

  try {
    const data = await jsonp("board_clients");
    if (!data || !data.ok) throw new Error(data?.error || "board_clients failed");

    clients = Array.isArray(data.rows) ? data.rows : [];
    updateClientCount(clients.length);
    renderInitialResults();

    if (searchInput) {
      searchInput.addEventListener("input", handleSearch);
      searchInput.focus();
    }
  } catch (err) {
    console.error(err);
    updateClientCount("Error");
    if (resultsEl) {
      resultsEl.innerHTML = `<div class="client-result">${escapeHtml(String(err?.message || err))}</div>`;
    }
  }
}

function updateClientCount(count) {
  if (!clientCount) return;
  clientCount.textContent = typeof count === "number" ? `${count} clients` : String(count || "0 clients");
}

function wireFilters() {
  filterButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      currentFilter = String(btn.dataset.filter || "all").toLowerCase();
      filterButtons.forEach(x => x.classList.toggle("active", x === btn));
      handleSearch();
    });
  });
}

function wireAccordion() {
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".client-accordion-btn");
    if (!btn) return;

    const item = btn.closest(".client-accordion-item");
    if (!item) return;

    const open = !item.classList.contains("open");
    item.classList.toggle("open", open);
    btn.setAttribute("aria-expanded", open ? "true" : "false");
  });
}

function getFilteredClients(term = "") {
  const q = String(term || "").trim().toLowerCase();

  return clients.filter(client => {
    const type = normalizeClientType(client);
    const matchesFilter = currentFilter === "all" || type === currentFilter || String(client.type || "").toLowerCase().includes(currentFilter);

    if (!matchesFilter) return false;
    if (!q) return true;

    const haystack = [
      client.clientName,
      client.address,
      client.frequency,
      client.type,
      client.specs,
      client.specialInfo
    ].join(" ").toLowerCase();

    return haystack.includes(q);
  });
}

function renderInitialResults() {
  const list = getFilteredClients("").slice(0, 10);
  renderResults(list, !clients.length ? "No clients found." : "Start typing to search clients.");
}

function handleSearch() {
  if (!resultsEl) return;

  const q = searchInput ? searchInput.value.trim() : "";
  const matches = getFilteredClients(q).slice(0, q ? 14 : 10);

  if (!matches.length) {
    renderResults([], q ? "No matching clients." : "No clients in this filter.");
    return;
  }

  renderResults(matches);
}

function renderResults(matches, emptyMessage = "No matching clients.") {
  if (!resultsEl) return;

  if (!matches.length) {
    resultsEl.innerHTML = `<div class="client-result">${escapeHtml(emptyMessage)}</div>`;
    return;
  }

  resultsEl.innerHTML = "";

  matches.forEach(client => {
    const div = document.createElement("button");
    div.type = "button";
    div.className = "client-result";
    div.dataset.clientKey = clientKey(client);

    if (selectedClientKey && selectedClientKey === clientKey(client)) {
      div.classList.add("active");
    }

    const type = normalizeClientType(client);
    const typeLabel = titleCase(type);
    const frequency = cleanText(client.frequency, "No frequency");
    const address = cleanText(client.address, "No address saved");

    div.innerHTML = `
      <div class="client-result-name">
        <span>${escapeHtml(client.clientName || "Unnamed Client")}</span>
        <span class="client-chip yellow">${escapeHtml(frequency)}</span>
      </div>
      <div class="client-result-address">${escapeHtml(address)}</div>
      <div class="client-result-meta">
        <span class="client-chip">${escapeHtml(typeLabel)}</span>
        ${client.specialInfo ? `<span class="client-chip">Special Info</span>` : ""}
        ${client.specs ? `<span class="client-chip">Specs</span>` : ""}
      </div>
    `;

    div.addEventListener("click", () => showClient(client));
    resultsEl.appendChild(div);
  });
}

function setText(id, value, fallback = "—") {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = cleanText(value, fallback);

  if (el.classList.contains("client-accordion-body")) {
    const isEmpty = cleanText(value, "") === "";
    el.classList.toggle("empty", isEmpty);
    if (isEmpty) el.textContent = "Nothing saved yet.";
  }
}

function setHtml(id, html) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = html;
}

function showClient(client) {
  if (!clientCard) return;

  selectedClientKey = clientKey(client);

  if (clientEmptyState) clientEmptyState.style.display = "none";
  clientCard.classList.add("open");

  const type = normalizeClientType(client);
  const typeLabel = titleCase(type);
  const frequency = cleanText(client.frequency);
  const payoutText = client.payout ? "Recorded internally" : "—";

  setText("clientName", client.clientName);
  setText("clientAddress", client.address);
  setText("clientFrequency", frequency);
  setText("clientType", typeLabel);
  setText("clientTypeBadge", `${typeLabel} Client`);
  setText("clientPayout", payoutText);
  setText("clientSpecs", client.specs);
  setText("clientSpecialInfo", client.specialInfo);

  const scheduleHtml = `
    <strong>Frequency:</strong> ${escapeHtml(frequency)}
    ${client.type ? `\n<strong>Type:</strong> ${escapeHtml(typeLabel)}` : ""}
    ${client.address ? `\n<strong>Address:</strong> ${escapeHtml(client.address)}` : ""}
  `.trim();

  setHtml("clientScheduleInfo", scheduleHtml || "Nothing saved yet.");
  setHtml("clientOfficeInfo", payoutText === "—" ? "No internal payout note displayed." : "Payout is recorded internally and hidden from the public/client side.");

  const mapLink = document.getElementById("mapLink");
  if (mapLink) {
    const addr = encodeURIComponent(client.address || "");
    mapLink.href = addr ? `https://www.google.com/maps/search/?api=1&query=${addr}` : "#";
    mapLink.style.display = addr ? "inline-flex" : "none";
  }

  if (searchInput) searchInput.value = client.clientName || "";
  handleSearch();

  if (window.innerWidth <= 980) {
    clientCard.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
