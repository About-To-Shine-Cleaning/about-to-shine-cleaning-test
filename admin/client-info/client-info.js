// =========================================================
// FILE: /admin/client-info/client-info.js
// TYPE: .js
// ATS Client Info Lookup — v3 Screenshot Style UI
// Adds: search clear X, Add Client modal, Edit Client modal, client_save hook
// Preserves: board_clients route, futuristic expandable layout, client specs,
// current rendering/search/filter behavior, auth/device JSONP pattern
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

// Add/Edit Client modal elements are added in /admin/client-info/index.html.
// These lookups are intentionally tolerant so the page still works if the HTML
// is pasted before/after this JS update.
const clientSearchWrap = searchInput ? searchInput.closest(".client-search-wrap") || searchInput.parentElement : null;
const addClientBtn = document.getElementById("addClientBtn");
const editClientBtn = document.getElementById("editClientBtn");
const clientModal = document.getElementById("clientModal");
const clientModalTitle = document.getElementById("clientModalTitle");
const clientModalSubtitle = document.getElementById("clientModalSubtitle");
const clientModalClose = document.getElementById("clientModalClose");
const clientModalCancel = document.getElementById("clientModalCancel");
const clientModalForm = document.getElementById("clientModalForm");
const clientModalMode = document.getElementById("clientModalMode");
const clientModalOriginalKey = document.getElementById("clientModalOriginalKey");
const clientModalStatus = document.getElementById("clientModalStatus");
const clientModalSave = document.getElementById("clientModalSave");

let clients = [];
let currentFilter = "all";
let selectedClientKey = "";
let selectedClient = null;
let visibleCount = 12;
let lastMatches = [];
let searchClearBtn = null;
let savingClient = false;

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
  return String(client?.clientId || client?.id || client?.clientName || "").trim().toLowerCase();
}

function normalizeClientType(client) {
  const raw = String(client?.type || client?.clientType || client?.category || "").trim().toLowerCase();
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
  wireSearchClear();
  wireClientModal();

  try {
    await loadClients();

    if (searchInput) {
      searchInput.addEventListener("input", () => {
        visibleCount = 12;
        updateSearchClear();
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

async function loadClients(options = {}) {
  const keepSelection = options.keepSelection !== false;
  const data = await jsonp("board_clients");
  if (!data || !data.ok) throw new Error(data?.error || "board_clients failed");

  clients = Array.isArray(data.rows) ? data.rows : [];
  updateClientCount(clients.length);
  renderInitialResults();

  if (keepSelection && selectedClientKey) {
    const refreshed = clients.find(c => clientKey(c) === selectedClientKey);
    if (refreshed) showClient(refreshed, { preserveSearch: true, skipMobileSwap: true });
  }
}

function updateClientCount(count) {
  if (!clientCount) return;
  clientCount.textContent = typeof count === "number" ? `${count} clients` : String(count || "0 clients");
}

function wireSearchClear() {
  if (!searchInput) return;

  searchClearBtn = document.getElementById("clientSearchClear");

  if (!searchClearBtn) {
    searchClearBtn = document.createElement("button");
    searchClearBtn.type = "button";
    searchClearBtn.id = "clientSearchClear";
    searchClearBtn.className = "client-search-clear";
    searchClearBtn.setAttribute("aria-label", "Clear client search");
    searchClearBtn.innerHTML = "×";

    const parent = clientSearchWrap || searchInput.parentElement;
    if (parent) {
      parent.classList.add("has-client-search-clear");
      parent.appendChild(searchClearBtn);
    }
  }

  searchClearBtn.addEventListener("click", () => {
    searchInput.value = "";
    visibleCount = 12;
    selectedClientKey = selectedClient ? clientKey(selectedClient) : selectedClientKey;
    updateSearchClear();
    handleSearch();
    searchInput.focus();
  });

  updateSearchClear();
}

function updateSearchClear() {
  if (!searchClearBtn || !searchInput) return;
  searchClearBtn.classList.toggle("show", !!searchInput.value.trim());
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

function wireClientModal() {
  if (addClientBtn) {
    addClientBtn.addEventListener("click", () => openClientModal("add"));
  }

  if (editClientBtn) {
    editClientBtn.addEventListener("click", () => {
      if (!selectedClient) {
        setModalStatus("Select a client first, then tap Edit Client.", "warn");
        return;
      }
      openClientModal("edit", selectedClient);
    });
  }

  if (clientModalClose) clientModalClose.addEventListener("click", closeClientModal);
  if (clientModalCancel) clientModalCancel.addEventListener("click", closeClientModal);

  if (clientModal) {
    clientModal.addEventListener("click", (e) => {
      if (e.target === clientModal) closeClientModal();
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && clientModal?.classList.contains("open")) closeClientModal();
  });

  if (clientModalForm) {
    clientModalForm.addEventListener("submit", handleClientSave);
  }
}

function setModalStatus(message = "", type = "") {
  if (!clientModalStatus) return;
  clientModalStatus.textContent = message;
  clientModalStatus.className = "client-modal-status";
  if (type) clientModalStatus.classList.add(type);
}

function setSavingState(isSaving) {
  savingClient = isSaving;
  if (clientModalSave) {
    clientModalSave.disabled = isSaving;
    clientModalSave.textContent = isSaving ? "Saving..." : "Save Client";
  }
}

function modalField(name) {
  if (!clientModalForm) return null;
  return clientModalForm.elements[name] || document.getElementById(name);
}

function setModalValue(name, value) {
  const field = modalField(name);
  if (!field) return;
  field.value = String(value ?? "");
}

function getModalValue(name) {
  const field = modalField(name);
  return field ? String(field.value || "").trim() : "";
}

function openClientModal(mode, client = null) {
  if (!clientModal || !clientModalForm) return;

  const isEdit = mode === "edit";
  clientModalForm.reset();
  setModalStatus("");
  setSavingState(false);

  if (clientModalMode) clientModalMode.value = isEdit ? "edit" : "add";
  if (clientModalOriginalKey) clientModalOriginalKey.value = isEdit ? clientKey(client) : "";

  if (clientModalTitle) clientModalTitle.textContent = isEdit ? "Edit Client" : "Add Client";
  if (clientModalSubtitle) {
    clientModalSubtitle.textContent = isEdit
      ? "Update this client profile and save it directly to the Client List sheet."
      : "Add a new client profile directly to the Client List sheet.";
  }

  if (isEdit && client) {
    setModalValue("clientId", client.clientId || client.id || "");
    setModalValue("clientName", client.clientName || "");
    setModalValue("clientType", normalizeClientType(client));
    setModalValue("frequency", client.frequency || "");
    setModalValue("address", client.address || "");
    setModalValue("cleaner", firstNonEmpty(client.cleaner, client.assignedCleaner, client.employeeName, client.employee));
    setModalValue("phone", firstNonEmpty(client.phone, client.clientPhone, client.phoneNumber));
    setModalValue("email", firstNonEmpty(client.email, client.clientEmail));
    setModalValue("accessInfo", firstNonEmpty(client.accessInfo, client.doorCode, client.entryInfo, client.parking, client.pets));
    setModalValue("specs", client.specs || "");
    setModalValue("specialInfo", client.specialInfo || "");
    setModalValue("notes", firstNonEmpty(client.notes, client.officeNotes));
  } else {
    setModalValue("clientType", currentFilter !== "all" ? currentFilter : "residential");
  }

  clientModal.classList.add("open");
  clientModal.setAttribute("aria-hidden", "false");
  setTimeout(() => modalField("clientName")?.focus(), 50);
}

function closeClientModal() {
  if (savingClient) return;
  if (!clientModal) return;
  clientModal.classList.remove("open");
  clientModal.setAttribute("aria-hidden", "true");
  setModalStatus("");
}

function buildClientPayload() {
  const mode = getModalValue("mode") || clientModalMode?.value || "add";
  const originalKey = getModalValue("originalKey") || clientModalOriginalKey?.value || "";

  const payload = {
    mode,
    originalKey,
    clientId: getModalValue("clientId"),
    clientName: getModalValue("clientName"),
    type: getModalValue("clientType") || "residential",
    frequency: getModalValue("frequency"),
    address: getModalValue("address"),
    cleaner: getModalValue("cleaner"),
    phone: getModalValue("phone"),
    email: getModalValue("email"),
    accessInfo: getModalValue("accessInfo"),
    specs: getModalValue("specs"),
    specialInfo: getModalValue("specialInfo"),
    notes: getModalValue("notes")
  };

  payload.clientName = payload.clientName.trim();
  payload.type = payload.type.trim().toLowerCase();

  return payload;
}

function encodePayload(obj) {
  const json = JSON.stringify(obj || {});
  try {
    return btoa(unescape(encodeURIComponent(json)));
  } catch (e) {
    return btoa(json);
  }
}

async function handleClientSave(e) {
  e.preventDefault();
  if (savingClient) return;

  const payload = buildClientPayload();

  if (!payload.clientName) {
    setModalStatus("Client name is required.", "error");
    modalField("clientName")?.focus();
    return;
  }

  try {
    setSavingState(true);
    setModalStatus("Saving client...", "working");

    // Code.gs addition comes later. This frontend is already wired for it.
    // payload64 keeps long notes/specs safe through JSONP query strings.
    const data = await jsonp("client_save", { payload64: encodePayload(payload) });
    if (!data || !data.ok) throw new Error(data?.error || "client_save failed");

    setModalStatus("Saved.", "success");

    const newKey = String(data.clientKey || data.clientId || payload.clientId || payload.clientName || "").trim().toLowerCase();
    if (newKey) selectedClientKey = newKey;

    await loadClients({ keepSelection: true });

    const refreshed = clients.find(c => clientKey(c) === selectedClientKey)
      || clients.find(c => String(c.clientName || "").trim().toLowerCase() === payload.clientName.toLowerCase());

    if (refreshed) {
      showClient(refreshed, { preserveSearch: false });
    }

    setTimeout(closeClientModal, 350);
  } catch (err) {
    console.error(err);
    setModalStatus(String(err?.message || err), "error");
  } finally {
    setSavingState(false);
  }
}

function getFilteredClients(term = "") {
  const q = String(term || "").trim().toLowerCase();

  return clients.filter(client => {
    const type = normalizeClientType(client);
    const matchesFilter = currentFilter === "all" || type === currentFilter || String(client.type || "").toLowerCase().includes(currentFilter);
    if (!matchesFilter) return false;
    if (!q) return true;

    const haystack = [
      client.clientId,
      client.id,
      client.clientName,
      client.address,
      client.frequency,
      client.type,
      client.clientType,
      client.category,
      client.cleaner,
      client.assignedCleaner,
      client.employeeName,
      client.employee,
      client.phone,
      client.clientPhone,
      client.email,
      client.clientEmail,
      client.accessInfo,
      client.doorCode,
      client.entryInfo,
      client.specs,
      client.specialInfo,
      client.notes
    ].join(" ").toLowerCase();

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

function showClient(client, options = {}) {
  if (!clientCard) return;
  selectedClient = client;
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

  if (searchInput && !options.preserveSearch) {
    searchInput.value = client.clientName || "";
    updateSearchClear();
  }
  handleSearch();

  if (!options.skipMobileSwap && window.innerWidth <= 980) {
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
