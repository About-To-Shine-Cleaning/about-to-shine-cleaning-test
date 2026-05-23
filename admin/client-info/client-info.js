// =========================================================
// FILE: /admin/client-info/client-info.js
// TYPE: .js
// ATS Client Info Lookup — v3 Screenshot Style UI
// Frontend-only redesign. Uses existing board_clients route.
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
const loadMoreBtn = document.getElementById("loadMoreClients");
const clientListPanel = document.getElementById("clientListPanel");
const clientProfileShell = document.getElementById("clientProfileShell");
const mobileBackBtn = document.getElementById("mobileBackBtn");

let clients = [];
let currentFilter = "all";
let selectedClientKey = "";
let visibleCount = 12;
let lastMatches = [];

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

function getClientIcon(client) {
  const type = normalizeClientType(client);
  if (type === "commercial") return "🏢";
  return "⌂";
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
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

    const params = new URLSearchParams({ action, t: token, d: device, callback: cb, ...paramsObj });

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
  wireMobileBack();
  wireSideActions();

  try {
    const data = await jsonp("board_clients");
    if (!data || !data.ok) throw new Error(data?.error || "board_clients failed");

    clients = Array.isArray(data.rows) ? data.rows : [];
    updateClientCount(clients.length);
    renderInitialResults();

    if (searchInput) {
      searchInput.addEventListener("input", () => {
        visibleCount = 12;
        handleSearch();
      });
      searchInput.focus();
    }
  } catch (err) {
    console.error(err);
    updateClientCount("Error");
    if (resultsEl) resultsEl.innerHTML = `<div class="client-result">${escapeHtml(String(err?.message || err))}</div>`;
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
      visibleCount = 12;
      handleSearch();
    });
  });

  if (loadMoreBtn) {
    loadMoreBtn.addEventListener("click", () => {
      visibleCount += 12;
      renderResults(lastMatches);
    });
  }
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

function wireMobileBack() {
  if (!mobileBackBtn) return;
  mobileBackBtn.addEventListener("click", () => {
    if (clientListPanel) clientListPanel.classList.remove("mobile-hidden");
    if (clientProfileShell) clientProfileShell.classList.add("mobile-hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
}

function wireSideActions() {
  document.addEventListener("click", (e) => {
    const sectionBtn = e.target.closest("[data-open-section]");
    if (!sectionBtn) return;
    const section = sectionBtn.dataset.openSection;
    const item = document.querySelector(`.client-accordion-item[data-section="${section}"]`);
    if (!item) return;
    item.classList.add("open");
    item.querySelector(".client-accordion-btn")?.setAttribute("aria-expanded", "true");
    item.scrollIntoView({ behavior: "smooth", block: "center" });
  });
}

function getFilteredClients(term = "") {
  const q = String(term || "").trim().toLowerCase();

  return clients.filter(client => {
    const type = normalizeClientType(client);
    const matchesFilter = currentFilter === "all" || type === currentFilter || String(client.type || "").toLowerCase().includes(currentFilter);
    if (!matchesFilter) return false;
    if (!q) return true;

    const haystack = [client.clientName, client.address, client.frequency, client.type, client.specs, client.specialInfo].join(" ").toLowerCase();
    return haystack.includes(q);
  });
}

function renderInitialResults() {
  const list = getFilteredClients("");
  renderResults(list, !clients.length ? "No clients found." : "Start typing to search clients.");
}

function handleSearch() {
  if (!resultsEl) return;
  const q = searchInput ? searchInput.value.trim() : "";
  const matches = getFilteredClients(q);
  renderResults(matches, q ? "No matching clients." : "No clients in this filter.");
}

function renderResults(matches, emptyMessage = "No matching clients.") {
  if (!resultsEl) return;
  lastMatches = matches || [];
  const shown = lastMatches.slice(0, visibleCount);

  if (!shown.length) {
    resultsEl.innerHTML = `<div class="client-result">${escapeHtml(emptyMessage)}</div>`;
    if (loadMoreBtn) loadMoreBtn.style.display = "none";
    return;
  }

  resultsEl.innerHTML = "";

  shown.forEach(client => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "client-result";
    btn.dataset.clientKey = clientKey(client);
    if (selectedClientKey && selectedClientKey === clientKey(client)) btn.classList.add("active");

    const type = normalizeClientType(client);
    const typeLabel = titleCase(type);
    const frequency = cleanText(client.frequency, "No frequency");
    const address = cleanText(client.address, "No address saved");

    btn.innerHTML = `
      <span class="client-result-icon">${escapeHtml(getClientIcon(client))}</span>
      <span class="client-result-main">
        <span class="client-result-name">${escapeHtml(client.clientName || "Unnamed Client")}</span>
        <span class="client-result-address">${escapeHtml(address)}</span>
      </span>
      <span class="client-result-badges">
        <span class="client-chip purple">${escapeHtml(typeLabel)}</span>
        <span class="client-chip yellow">${escapeHtml(frequency)}</span>
      </span>
    `;

    btn.addEventListener("click", () => showClient(client));
    resultsEl.appendChild(btn);
  });

  if (loadMoreBtn) {
    loadMoreBtn.style.display = lastMatches.length > visibleCount ? "inline-flex" : "none";
  }
}

function setText(id, value, fallback = "—") {
  const el = document.getElementById(id);
  if (!el) return;
  const text = cleanText(value, fallback);
  el.textContent = text;

  if (el.classList.contains("client-accordion-body")) {
    const empty = cleanText(value, "") === "" || text === "—";
    el.classList.toggle("empty", empty);
    if (empty) el.textContent = "Nothing saved yet.";
  }
}

function setHtml(id, html) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = html || "—";
}

function updateMapLinks(address) {
  const encoded = encodeURIComponent(address || "");
  const href = encoded ? `https://www.google.com/maps/search/?api=1&query=${encoded}` : "#";
  ["mapLink", "quickMapLink", "mapLinkSide"].forEach(id => {
    const link = document.getElementById(id);
    if (!link) return;
    link.href = href;
    link.style.display = encoded ? "inline-flex" : "none";
  });
}

function previewText(text, max = 135) {
  const clean = String(text || "").trim();
  if (!clean) return "No notes saved yet.";
  return clean.length > max ? clean.slice(0, max).trim() + "..." : clean;
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
  const assignedCleaner = firstNonEmpty(client.cleaner, client.assignedCleaner, client.employeeName, client.employee) || "—";
  const lastCleaned = firstNonEmpty(client.lastCleaned, client.lastCleanDate) || "—";
  const nextScheduled = firstNonEmpty(client.nextScheduled, client.nextCleanDate, client.serviceDate) || "—";
  const accessInfo = firstNonEmpty(client.accessInfo, client.doorCode, client.entryInfo, client.parking, client.pets);
  const notesPreview = previewText(firstNonEmpty(client.specs, client.specialInfo));

  setText("clientTypeBadge", `${typeLabel} Client`);
  setText("clientName", client.clientName);
  setText("clientAddress", client.address);
  setText("clientAddressSide", client.address, "No address saved");
  setText("clientFrequency", frequency);
  setText("clientFrequencySub", frequency === "—" ? "No frequency set" : "Saved in client list");
  setText("clientType", typeLabel);
  setText("clientAssignedCleaner", assignedCleaner);
  setText("clientLastCleaned", lastCleaned);
  setText("clientNextScheduled", nextScheduled);
  setText("clientSpecs", client.specs);
  setText("clientSpecialInfo", client.specialInfo);
  setText("clientAccessInfo", accessInfo, "No access information saved yet.");
  setText("clientNotesPreview", notesPreview);

  const avatar = document.getElementById("clientAvatar");
  if (avatar) avatar.textContent = getClientIcon(client);

  const scheduleHtml = [
    `<strong>Frequency:</strong> ${escapeHtml(frequency)}`,
    `<strong>Type:</strong> ${escapeHtml(typeLabel)}`,
    client.address ? `<strong>Address:</strong> ${escapeHtml(client.address)}` : "",
    assignedCleaner !== "—" ? `<strong>Assigned Cleaner:</strong> ${escapeHtml(assignedCleaner)}` : "",
    nextScheduled !== "—" ? `<strong>Next Scheduled:</strong> ${escapeHtml(nextScheduled)}` : ""
  ].filter(Boolean).join("\n");

  setHtml("clientScheduleInfo", scheduleHtml);
  setHtml("clientOfficeInfo", payoutText === "—" ? "No internal payout note displayed." : "Payout is recorded internally and hidden from public/client side.");
  updateMapLinks(client.address || "");

  if (searchInput) searchInput.value = client.clientName || "";
  handleSearch();

  if (window.innerWidth <= 980) {
    if (clientListPanel) clientListPanel.classList.add("mobile-hidden");
    if (clientProfileShell) clientProfileShell.classList.remove("mobile-hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
