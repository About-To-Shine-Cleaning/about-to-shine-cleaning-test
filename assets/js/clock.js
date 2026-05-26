// ==============================
// FILE: /assets/js/clock.js
// TYPE: .js
// ATS Clock + Client Specs
// Updated:
// ✅ Future jobs disabled until actual service day
// ✅ Search bar X clear button
// ✅ Preserved clock in/out/break logic
// ✅ Preserved GPS/location logic
// ✅ Preserved client specs loading
// ✅ Preserved Weekly Board direct job params + auto-select
// ✅ Restores active clocked-in job after refresh/browser close/NFC retap
// ✅ Shared employee-specific localStorage state: activeClockState_E##
// ==============================

// ==============================
// 👷 Employees
// ==============================
const employees = {
  E01: "Shannon Kovecses",
  E02: "Shauna Bari",
  E03: "Caprea Kovecses",
  E04: "Matthew Bari",
  E05: "Allison Walck",
  E06: "Employee Six",
  E07: "Employee Seven",
  E08: "Employee Eight",
  E09: "Employee Nine",
  E10: "Employee Ten"
};

// ==============================
// 🔗 Google Apps Script Web App URLs
// ==============================
const SHEET_URL =
  "https://script.google.com/macros/s/AKfycbyCCv30Q3l0Gg2zGs2sHD6a9jHm678QQKV_mdTm_GFnjR-xsmaYdDonmlBugX3TeHPiJA/exec";

const UNIFIED_URL =
  "https://script.google.com/macros/s/AKfycbx2bQ-SSeUHoihjbkYmkJ5-0Dw8JPqH8bhBQR3fbvLsOhDhbuPv0MdVeTdMW6zoVTsWsw/exec";

// ==============================
// DOM
// ==============================
const display = document.getElementById("employee-display");
const statusEl = document.getElementById("clock-status");
const jobSelect = document.getElementById("jobSelect");
const jobSearch = document.getElementById("jobSearch");
const jobResults = document.getElementById("jobResults");
const notesEl = document.getElementById("jobNotes");

const btnClockIn = document.getElementById("btnClockIn");
const btnBreakStart = document.getElementById("btnBreakStart");
const btnBreakEnd = document.getElementById("btnBreakEnd");
const btnClockOut = document.getElementById("btnClockOut");

const clientSpecsCard = document.getElementById("clientSpecsCard");
const clientSpecsBody = document.getElementById("clientSpecsBody");
const btnToggleClientSpecs = document.getElementById("btnToggleClientSpecs");

// ==============================
// Employee from URL
// ==============================
const params = new URLSearchParams(window.location.search);
const employeeId = String(params.get("emp") || "").trim().toUpperCase();
const employeeName = employees[employeeId];

const directJobFromWeeklyBoard = {
  source: String(params.get("source") || "").trim(),
  intent: String(params.get("intent") || "").trim(),
  serviceDate: String(params.get("serviceDate") || "").trim(),
  clientId: String(params.get("clientId") || "").trim(),
  clientName: String(params.get("clientName") || "").trim(),
  jobName: String(params.get("jobName") || params.get("clientName") || "").trim(),
  address: String(params.get("address") || "").trim()
};

if (!employeeName) {
  if (display) display.textContent = "Unauthorized Access";
  throw new Error("Invalid employee ID");
}

if (display) display.textContent = `Welcome, ${employeeName}`;

// ==============================
// State
// ==============================
let selectedJob = null;
let allJobs = [];
let activeClientSpecs = null;
let jobSearchClearBtn = null;

let onBreak = false;
let isClockedIn = false;

const activeClockStateKey = `activeClockState_${employeeId}`;
const lastJobKey = `lastJob_${employeeId}`;
const activeSpecsKey = `activeClientSpecs_${employeeId}`;

// ==============================
// Future service-day logic
// ==============================
function todayDateKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function normalizeDateKey(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const direct = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (direct) return raw;

  const parsed = new Date(raw);
  if (isNaN(parsed.getTime())) return "";

  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, "0");
  const d = String(parsed.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isFutureServiceDate(dateStr) {
  const normalized = normalizeDateKey(dateStr);
  if (!normalized) return false;
  return normalized > todayDateKey();
}

function currentSelectedJobIsFutureLocked() {
  if (!selectedJob) return false;
  return !!selectedJob.futureLocked;
}

// ==============================
// UI helpers
// ==============================
function setStatus(msg, kind = "info") {
  const styles = {
    info: "background:#fff;border:1px solid rgba(0,0,0,0.15);padding:10px 12px;border-radius:10px;",
    ok: "background:#eaffea;border:1px solid rgba(0,0,0,0.15);padding:10px 12px;border-radius:10px;",
    warn: "background:#fff7db;border:1px solid rgba(0,0,0,0.15);padding:10px 12px;border-radius:10px;",
    err: "background:#ffeaea;border:1px solid rgba(0,0,0,0.15);padding:10px 12px;border-radius:10px;"
  };

  if (!statusEl) return;
  statusEl.setAttribute("style", styles[kind] + "margin:12px 0;");
  statusEl.textContent = msg;
}

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function isNumericValue(value) {
  const s = String(value ?? "").trim();
  return s !== "" && !isNaN(Number(s));
}

function slugJobId(label) {
  return String(label || "JOB")
    .trim()
    .replace(/[—–-]\s*(Full|\.5|Half)\s*$/i, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase() || "JOB";
}

function normalizeBaseClientName(name) {
  return String(name || "")
    .replace(/[—–-]\s*(Full|\.5|Half)\s*$/i, "")
    .trim();
}

function normalizeMatchKey(name) {
  return normalizeBaseClientName(name)
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "");
}

function normalizeJob(raw) {
  raw = raw || {};

  let id = String(raw.id ?? raw.jobId ?? raw.clientId ?? "").trim();
  let name = String(raw.name ?? raw.jobName ?? raw.clientName ?? raw.client ?? "").trim();
  let pay = String(raw.pay ?? raw.jobPay ?? raw.amount ?? "").trim();
  let address = String(raw.address ?? "").trim();
  let clientName = String(raw.clientName ?? raw.client ?? "").trim();

  if (isNumericValue(name) && !isNumericValue(id) && !pay) {
    pay = name;
    name = id;
    id = slugJobId(name);
  }

  if (!name && id && !isNumericValue(id)) name = id;
  if (!id && name) id = slugJobId(name);
  if (!clientName) clientName = normalizeBaseClientName(name);

  const serviceDate = String(raw.serviceDate || raw.date || raw.jobDate || "").trim();
  const futureLocked = isFutureServiceDate(serviceDate);

  return {
    id,
    name,
    clientName,
    pay: isNumericValue(pay) ? Number(pay) : 0,
    address,
    serviceDate,
    futureLocked
  };
}

function getMapUrl(address) {
  const encoded = encodeURIComponent(address || "");
  return /iPhone|iPad|iPod/i.test(navigator.userAgent)
    ? "http://maps.apple.com/?q=" + encoded
    : "https://www.google.com/maps/search/?api=1&query=" + encoded;
}

function showSelectedJobAddress(address) {
  const linkEl = document.getElementById("jobAddressLink");
  if (!linkEl) return;

  if (address) {
    linkEl.innerHTML = `<a href="${getMapUrl(address)}" target="_blank" rel="noopener">📍 Open in Maps</a>`;
  } else {
    linkEl.innerHTML = "";
  }
}

function forceActionButtonStyle(btn) {
  if (!btn) return;
  btn.style.setProperty("background", "#000", "important");
  btn.style.setProperty("background-color", "#000", "important");
  btn.style.setProperty("color", "#ffe600", "important");
  btn.style.setProperty("-webkit-text-fill-color", "#ffe600", "important");
  btn.style.setProperty("border", "1px solid rgba(255,230,0,.55)", "important");
  btn.style.setProperty("filter", "none", "important");
  btn.style.setProperty("opacity", "1", "important");
}

function setActionButtonReady(btn, isReady) {
  if (!btn) return;

  btn.disabled = false;

  btn.dataset.ready = isReady ? "true" : "false";
  btn.setAttribute("aria-disabled", isReady ? "false" : "true");
  btn.classList.toggle("clock-action-locked", !isReady);
  btn.classList.toggle("is-disabled", !isReady);

  if (isReady) {
    btn.style.setProperty("cursor", "pointer", "important");
    btn.style.setProperty("pointer-events", "auto", "important");
  } else {
    btn.style.setProperty("cursor", "not-allowed", "important");
    btn.style.setProperty("pointer-events", "none", "important");
  }

  forceActionButtonStyle(btn);
}

function updateButtons() {
  const hasJob = !!selectedJob;
  const futureLocked = currentSelectedJobIsFutureLocked();

  setActionButtonReady(btnClockIn, !isClockedIn && hasJob && !futureLocked);
  setActionButtonReady(btnBreakStart, isClockedIn && !onBreak && hasJob && !futureLocked);
  setActionButtonReady(btnBreakEnd, isClockedIn && onBreak && hasJob && !futureLocked);
  setActionButtonReady(btnClockOut, isClockedIn && hasJob && !futureLocked);

  if (notesEl) notesEl.disabled = !isClockedIn || futureLocked;
}

function actionIsReady(btn) {
  return btn && btn.dataset.ready === "true";
}

function ensureJobSearchClearButton() {
  if (!jobSearch) return;

  const parent = jobSearch.parentElement;
  if (!parent) return;

  parent.style.position = "relative";

  jobSearch.style.paddingRight = "52px";

  let btn = document.getElementById("jobSearchClearBtn");

  if (!btn) {
    btn = document.createElement("button");
    btn.type = "button";
    btn.id = "jobSearchClearBtn";
    btn.innerHTML = "×";
    btn.setAttribute("aria-label", "Clear job search");

    btn.style.position = "absolute";
    btn.style.right = "10px";
    btn.style.top = "50%";
    btn.style.transform = "translateY(-50%)";
    btn.style.width = "32px";
    btn.style.height = "32px";
    btn.style.borderRadius = "999px";
    btn.style.border = "1px solid rgba(255,255,255,.15)";
    btn.style.background = "rgba(0,0,0,.35)";
    btn.style.color = "#ffe600";
    btn.style.fontSize = "20px";
    btn.style.fontWeight = "900";
    btn.style.cursor = "pointer";
    btn.style.display = "none";
    btn.style.alignItems = "center";
    btn.style.justifyContent = "center";
    btn.style.zIndex = "5";

    parent.appendChild(btn);

    btn.addEventListener("click", () => {
      if (isClockedIn && selectedJob) {
        setStatus("You are clocked into a job. Clock out before clearing the active job.", "warn");
        return;
      }

      jobSearch.value = "";
      if (jobResults) jobResults.innerHTML = "";
      btn.style.display = "none";
      jobSearch.focus();
      selectedJob = null;
      writeInactiveClockState(false);
      updateButtons();
    });
  }

  jobSearchClearBtn = btn;

  updateJobSearchClearVisibility();
}

function updateJobSearchClearVisibility() {
  if (!jobSearch || !jobSearchClearBtn) return;
  jobSearchClearBtn.style.display = jobSearch.value.trim() ? "flex" : "none";
}

// ==============================
// Shared Active Clock State
// ==============================
function readActiveClockState() {
  try {
    const raw = localStorage.getItem(activeClockStateKey) || "";
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function buildActiveJobPayload(job) {
  const normalized = normalizeJob(job || selectedJob || {});

  return {
    id: normalized.id || "",
    name: normalized.name || "",
    clientName: normalized.clientName || normalizeBaseClientName(normalized.name || ""),
    address: normalized.address || "",
    pay: Number(normalized.pay || 0),
    serviceDate: normalized.serviceDate || ""
  };
}

function persistActiveClockState() {
  const payload = {
    isClockedIn: !!isClockedIn,
    onBreak: !!onBreak,
    activeJob: selectedJob ? buildActiveJobPayload(selectedJob) : null,
    updatedAt: new Date().toISOString()
  };

  try { localStorage.setItem(activeClockStateKey, JSON.stringify(payload)); } catch (e) {}

  if (selectedJob) {
    try { sessionStorage.setItem(lastJobKey, selectedJob.id || selectedJob.name || ""); } catch (e) {}
  }
}

function writeInactiveClockState(clearSelected = true) {
  isClockedIn = false;
  onBreak = false;

  const payload = {
    isClockedIn: false,
    onBreak: false,
    activeJob: null,
    updatedAt: new Date().toISOString()
  };

  try { localStorage.setItem(activeClockStateKey, JSON.stringify(payload)); } catch (e) {}
  try { sessionStorage.removeItem(lastJobKey); } catch (e) {}

  if (clearSelected) selectedJob = null;
}

function restoreActiveClockState(sourceLabel = "Restored active job") {
  const state = readActiveClockState();
  if (!state) return false;

  isClockedIn = !!state.isClockedIn;
  onBreak = !!state.onBreak;

  if (!isClockedIn || !state.activeJob) {
    updateButtons();
    return false;
  }

  const normalized = normalizeJob(state.activeJob);
  if (!normalized || !normalized.name) return false;

  selectedJob = normalized;

  if (jobSearch) {
    jobSearch.value = selectedJob.name;
    updateJobSearchClearVisibility();
  }

  if (jobResults) jobResults.innerHTML = "";

  if (jobSelect && selectedJob.id) {
    const matchingOption = Array.from(jobSelect.options).find(opt => String(opt.value || "") === String(selectedJob.id || ""));
    if (matchingOption) jobSelect.value = matchingOption.value;
  }

  showSelectedJobAddress(selectedJob.address || "");

  if (selectedJob.futureLocked) {
    setStatus("This active job is locked because the saved service date is in the future.", "warn");
  } else {
    setStatus(`${sourceLabel}: ${selectedJob.name}. You can clock out when finished.`, "ok");
  }

  updateButtons();
  return true;
}

// Backwards-compatible wrapper names so old calls do not break
function persistActiveJobState() {
  persistActiveClockState();
}

function clearActiveJobState(clearSelected = true) {
  writeInactiveClockState(clearSelected);
}

function restoreActiveJobState(sourceLabel = "Restored active job") {
  return restoreActiveClockState(sourceLabel);
}

// ==============================
// JSONP helper
// ==============================
function jsonp(action, paramsObj = {}) {
  return new Promise((resolve, reject) => {
    const cb = "cb_" + Math.random().toString(36).slice(2);
    const qs = new URLSearchParams({
      action,
      ...paramsObj,
      callback: cb
    });

    const script = document.createElement("script");
    script.async = true;

    window[cb] = function (res) {
      try { resolve(res); }
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

    script.src = UNIFIED_URL + "?" + qs.toString();
    document.body.appendChild(script);
  });
}

// ==============================
// Client Specs Panel
// ==============================
function formatSpecLine(label, value) {
  const clean = String(value || "").trim();
  if (!clean) return "";
  return `
    <div style="margin:0 0 12px;">
      <div style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#4b5563;margin-bottom:4px;">${escapeHtml(label)}</div>
      <div style="white-space:pre-wrap;line-height:1.45;">${escapeHtml(clean)}</div>
    </div>
  `;
}

function renderClientSpecs(specs) {
  if (!clientSpecsCard || !clientSpecsBody) return;

  if (!specs || !specs.ok) {
    clientSpecsBody.innerHTML = `<div style="color:#6b7280;">No client specs found for this job.</div>`;
    clientSpecsCard.style.display = "block";
    return;
  }

  const address = specs.address || "";
  const mapHtml = address
    ? `<p style="margin:8px 0 14px;"><a href="${getMapUrl(address)}" target="_blank" rel="noopener">📍 Open address in Maps</a></p>`
    : "";

  clientSpecsBody.innerHTML = `
    <div style="font-size:18px;font-weight:850;margin-bottom:4px;">${escapeHtml(specs.clientName || selectedJob?.clientName || selectedJob?.name || "Client")}</div>
    ${address ? `<div style="margin-bottom:8px;color:#374151;">${escapeHtml(address)}</div>` : ""}
    ${mapHtml}
    ${formatSpecLine("Frequency", specs.frequency)}
    ${formatSpecLine("Specs", specs.specs)}
    ${formatSpecLine("Special Info", specs.specialInfo)}
  `;

  clientSpecsCard.style.display = "block";
}

function hideClientSpecs() {
  activeClientSpecs = null;
  try { sessionStorage.removeItem(activeSpecsKey); } catch (e) {}
  if (clientSpecsCard) clientSpecsCard.style.display = "none";
  if (clientSpecsBody) clientSpecsBody.innerHTML = "";
}

async function loadClientSpecsForClient(clientName, jobName, jobId) {
  return jsonp("client_specs", {
    clientName: clientName || "",
    jobName: jobName || clientName || "",
    jobId: jobId || ""
  });
}

async function loadClientSpecsForSelectedJob() {
  if (!selectedJob) return;

  if (clientSpecsCard && clientSpecsBody) {
    clientSpecsCard.style.display = "block";
    clientSpecsBody.innerHTML = "Loading client info...";
  }

  try {
    const res = await loadClientSpecsForClient(
      selectedJob.clientName || normalizeBaseClientName(selectedJob.name || ""),
      selectedJob.name || "",
      selectedJob.id || ""
    );

    activeClientSpecs = res;
    try { sessionStorage.setItem(activeSpecsKey, JSON.stringify(res)); } catch (e) {}
    renderClientSpecs(res);
  } catch (err) {
    renderClientSpecs({ ok: false });
  }
}

if (btnToggleClientSpecs) {
  btnToggleClientSpecs.addEventListener("click", function () {
    if (!clientSpecsBody) return;
    const hidden = clientSpecsBody.style.display === "none";
    clientSpecsBody.style.display = hidden ? "block" : "none";
    btnToggleClientSpecs.textContent = hidden ? "Hide" : "Show";
  });
}

try {
  const rawSpecs = sessionStorage.getItem(activeSpecsKey);
  if (rawSpecs) {
    activeClientSpecs = JSON.parse(rawSpecs);
    const state = readActiveClockState();
    if (state && state.isClockedIn) renderClientSpecs(activeClientSpecs);
  }
} catch (e) {}

// ==============================
// Job selection helpers
// ==============================
function setSelectedJobFromOption(opt, sourceMessage) {
  if (opt && opt.value) {
    selectedJob = {
      id: opt.dataset.jobId || opt.value,
      name: opt.dataset.jobName || opt.dataset.name || opt.textContent || "",
      clientName: opt.dataset.clientName || normalizeBaseClientName(opt.dataset.jobName || opt.dataset.name || opt.textContent || ""),
      pay: Number(opt.dataset.jobPay || opt.dataset.pay || 0),
      address: opt.dataset.address || "",
      serviceDate: opt.dataset.serviceDate || "",
      futureLocked: String(opt.dataset.futureLocked || "") === "true"
    };

    try { sessionStorage.setItem(lastJobKey, selectedJob.id); } catch (e) {}

    if (isClockedIn) persistActiveJobState();

    if (jobSearch) {
      jobSearch.value = selectedJob.name;
      updateJobSearchClearVisibility();
    }

    if (jobResults) jobResults.innerHTML = "";

    if (selectedJob.futureLocked) {
      const dateText = normalizeDateKey(selectedJob.serviceDate) || selectedJob.serviceDate || "future date";
      setStatus(`⏳ This job is scheduled for ${dateText}. Clock actions unlock on the actual service day.`, "warn");
    } else {
      setStatus(sourceMessage || `Selected: ${selectedJob.name}`, "info");
    }

    showSelectedJobAddress(selectedJob.address);
  } else {
    selectedJob = null;
    if (!isClockedIn) writeInactiveClockState(false);

    if (jobSearch) {
      jobSearch.value = "";
      updateJobSearchClearVisibility();
    }

    if (jobResults) jobResults.innerHTML = "";

    setStatus("Please select a job to continue.", "warn");
    showSelectedJobAddress("");
    hideClientSpecs();
  }

  updateButtons();
}

function selectJobById(jobId, sourceMessage) {
  if (!jobSelect) return false;

  jobSelect.value = jobId;
  const opt = jobSelect.selectedOptions[0];
  if (!opt || !opt.value) return false;

  setSelectedJobFromOption(opt, sourceMessage);
  return true;
}

function findBestJobForDirectWeeklyBoardJob() {
  if (!directJobFromWeeklyBoard.clientName && !directJobFromWeeklyBoard.jobName && !directJobFromWeeklyBoard.clientId) return null;

  const directClientKey = normalizeMatchKey(directJobFromWeeklyBoard.clientName || directJobFromWeeklyBoard.jobName || "");
  const directId = String(directJobFromWeeklyBoard.clientId || "").trim();
  const directServiceDate = normalizeDateKey(directJobFromWeeklyBoard.serviceDate);

  let matches = allJobs.filter(job => {
    const jobClientKey = normalizeMatchKey(job.clientName || job.name || "");
    const jobNameKey = normalizeMatchKey(job.name || "");
    const jobServiceDate = normalizeDateKey(job.serviceDate);

    const idMatch = directId && String(job.id || "").indexOf(directId) >= 0;
    const nameMatch = directClientKey && (
      jobClientKey === directClientKey ||
      jobNameKey === directClientKey ||
      jobNameKey.indexOf(directClientKey) >= 0 ||
      directClientKey.indexOf(jobClientKey) >= 0
    );
    const dateCompatible = !directServiceDate || !jobServiceDate || directServiceDate === jobServiceDate;

    return (idMatch || nameMatch) && dateCompatible;
  });

  if (!matches.length) return null;

  matches.sort((a, b) => {
    const aName = String(a.name || "").toLowerCase();
    const bName = String(b.name || "").toLowerCase();

    const aFull = /full/i.test(aName) ? 0 : 1;
    const bFull = /full/i.test(bName) ? 0 : 1;
    if (aFull !== bFull) return aFull - bFull;

    return aName.localeCompare(bName);
  });

  return matches[0];
}

function addWeeklyBoardFallbackJob() {
  const name = directJobFromWeeklyBoard.jobName || directJobFromWeeklyBoard.clientName || "Weekly Board Job";
  const id = directJobFromWeeklyBoard.clientId || slugJobId(name);
  const clientName = directJobFromWeeklyBoard.clientName || normalizeBaseClientName(name);

  const fallback = normalizeJob({
    id,
    name,
    clientName,
    pay: 0,
    address: directJobFromWeeklyBoard.address || "",
    serviceDate: directJobFromWeeklyBoard.serviceDate || ""
  });

  allJobs.unshift(fallback);
  return fallback;
}

function applyDirectWeeklyBoardJobIfPresent() {
  if (directJobFromWeeklyBoard.source !== "weekly_board") return false;

  let job = findBestJobForDirectWeeklyBoardJob();
  if (!job) job = addWeeklyBoardFallbackJob();

  let opt = Array.from(jobSelect.options).find(option => String(option.value || "") === String(job.id || ""));

  if (!opt) {
    opt = document.createElement("option");
    opt.value = job.id;
    opt.textContent = job.name;
    opt.dataset.jobId = job.id;
    opt.dataset.jobName = job.name;
    opt.dataset.clientName = job.clientName || normalizeBaseClientName(job.name);
    opt.dataset.jobPay = String(job.pay || 0);
    opt.dataset.name = job.name;
    opt.dataset.pay = String(job.pay || 0);
    opt.dataset.address = job.address || directJobFromWeeklyBoard.address || "";
    opt.dataset.serviceDate = job.serviceDate || directJobFromWeeklyBoard.serviceDate || "";
    opt.dataset.futureLocked = job.futureLocked ? "true" : "false";
    jobSelect.appendChild(opt);
  }

  return selectJobById(job.id, `Selected from Weekly Board: ${job.name}`);
}

function renderJobResults(term) {
  if (!jobResults) return;

  const q = String(term || "").trim().toLowerCase();

  if (!q) {
    jobResults.innerHTML = "";
    return;
  }

  const matches = allJobs
    .filter(job => String(job.name || "").toLowerCase().includes(q) || String(job.clientName || "").toLowerCase().includes(q))
    .slice(0, 10);

  if (!matches.length) {
    jobResults.innerHTML = `<div style="opacity:.75;margin:8px 0;">No matching jobs</div>`;
    return;
  }

  jobResults.innerHTML = matches.map(job => {
    const id = escapeHtml(job.id);
    const name = escapeHtml(job.name || "");
    const address = escapeHtml(job.address || "");
    const isFuture = !!job.futureLocked;
    const dateText = normalizeDateKey(job.serviceDate) || job.serviceDate || "future service day";

    return `
      <button
        type="button"
        class="job-result-btn"
        data-job-id="${id}"
        style="display:block;width:100%;margin:6px 0;text-align:left;padding:12px;border-radius:10px;${isFuture ? 'opacity:.65;border:1px solid rgba(255,230,0,.25);' : ''}"
      >
        <strong>${name}</strong>
        ${address ? `<br><small style="opacity:.8;">📍 ${address}</small>` : ""}
        ${isFuture ? `<br><small style="color:#ffe600;">⏳ Locked until ${escapeHtml(dateText)}</small>` : ""}
      </button>
    `;
  }).join("");
}

if (jobSearch) {
  jobSearch.addEventListener("input", function () {
    updateJobSearchClearVisibility();
    renderJobResults(this.value);
  });

  jobSearch.addEventListener("focus", function () {
    if (this.value) renderJobResults(this.value);
  });
}

if (jobResults) {
  jobResults.addEventListener("click", function (e) {
    const btn = e.target.closest("[data-job-id]");
    if (!btn) return;

    selectJobById(btn.dataset.jobId);
  });
}

if (jobSelect) {
  jobSelect.addEventListener("change", function (e) {
    setSelectedJobFromOption(e.target.selectedOptions[0]);
  });
}

// ==============================
// 📋 Job load (JSONP)
// ==============================
window.loadJobs = function (res) {
  const jobs = Array.isArray(res) ? res : (res && Array.isArray(res.jobs) ? res.jobs : []);
  allJobs = jobs.map(normalizeJob);

  if (!jobSelect) return;

  while (jobSelect.options.length > 1) jobSelect.remove(1);

  allJobs.forEach((job) => {
    const opt = document.createElement("option");
    opt.value = job.id;
    opt.textContent = job.name;
    opt.dataset.jobId = job.id;
    opt.dataset.jobName = job.name;
    opt.dataset.clientName = job.clientName || normalizeBaseClientName(job.name);
    opt.dataset.jobPay = String(job.pay || 0);
    opt.dataset.name = job.name;
    opt.dataset.pay = String(job.pay || 0);
    opt.dataset.address = job.address || "";
    opt.dataset.serviceDate = job.serviceDate || "";
    opt.dataset.futureLocked = job.futureLocked ? "true" : "false";
    jobSelect.appendChild(opt);
  });

  if (applyDirectWeeklyBoardJobIfPresent()) {
    if (isClockedIn) persistActiveJobState();
    updateButtons();
    return;
  }

  if (restoreActiveJobState("Restored clocked-in job")) return;

  const lastJobId = sessionStorage.getItem(lastJobKey);
  if (lastJobId) {
    jobSelect.value = lastJobId;
    const opt = jobSelect.selectedOptions[0];

    if (opt && opt.value) {
      setSelectedJobFromOption(opt, isClockedIn ? "Restored clocked-in job" : undefined);
      return;
    }
  }

  setStatus("Start typing a client name, then tap Full or .5.", "info");
  updateButtons();
};

(function injectJobsScript() {
  restoreActiveJobState("Restored clocked-in job");

  const s = document.createElement("script");
  s.src = `${UNIFIED_URL}?action=clock_jobs_list&callback=loadJobs`;
  s.async = true;
  s.onerror = () => setStatus("Jobs failed to load (script error).", "err");
  document.body.appendChild(s);
})();

// ==============================
// GPS helper
// ==============================
function getLocation(callback) {
  if (!navigator.geolocation) {
    callback(null, true);
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (pos) => callback(pos.coords, false),
    () => callback(null, true),
    { enableHighAccuracy: true, timeout: 8000 }
  );
}

// ==============================
// Log event
// ==============================
function logEvent(action) {
  const notesValue =
    action === "Clock Out"
      ? (document.getElementById("jobNotes")?.value || "").trim()
      : "";

  getLocation((coords, gpsDenied) => {
    if (!gpsDenied && coords && Number(coords.accuracy || 0) > 150) {
      setStatus("⚠️ GPS weak — move closer to job location if possible.", "warn");
    }

    const routeMap = {
      "Clock In": "clock_in",
      "Clock Out": "clock_out",
      "Break Start": "break_start",
      "Break End": "break_end"
    };

    const route = routeMap[action] || "clock_in";

    const qs = new URLSearchParams({
      action: route,
      clockAction: action,
      emp: employeeId,
      employeeId: employeeId,
      employeeName: employeeName,
      jobId: selectedJob?.id || "",
      jobName: selectedJob?.name || "",
      jobPay: selectedJob?.pay || "",
      notes: notesValue,
      latitude: coords?.latitude || "",
      longitude: coords?.longitude || "",
      accuracy: coords?.accuracy || "",
      gpsDenied: gpsDenied ? "YES" : "NO",
      clientTimestamp: new Date().toISOString()
    });

    const cb = "cb_" + Math.random().toString(36).slice(2);

    window[cb] = function (res) {
      try { delete window[cb]; } catch (e) {}

      if (!res || !res.ok) {
        setStatus("Clock event did not save: " + (res?.error || "unknown error"), "err");
      }
    };

    const s = document.createElement("script");
    s.src = UNIFIED_URL + "?" + qs.toString() + "&callback=" + cb;
    s.onerror = function () {
      setStatus("Clock event failed to save.", "err");
    };

    document.body.appendChild(s);
  });
}

// ==============================
// Actions
// ==============================
window.clockIn = function () {
  if (!actionIsReady(btnClockIn)) return;
  if (!selectedJob) return setStatus("Please select a job before clocking in.", "warn");
  if (selectedJob.futureLocked) return setStatus("This job is locked until the actual service day.", "warn");
  if (isClockedIn) return setStatus("You are already clocked in.", "warn");

  onBreak = false;
  isClockedIn = true;
  persistActiveJobState();

  logEvent("Clock In");
  setStatus(`Clocked In ✅ (${selectedJob.name})`, "ok");
  loadClientSpecsForSelectedJob();
  updateButtons();
};

window.startBreak = function () {
  if (!actionIsReady(btnBreakStart)) return;
  if (!selectedJob) return setStatus("Select a job before starting break.", "warn");
  if (selectedJob.futureLocked) return setStatus("This job is locked until the actual service day.", "warn");
  if (!isClockedIn) return setStatus("You must Clock In before starting break.", "warn");
  if (onBreak) return setStatus("Break is already active.", "warn");

  onBreak = true;
  persistActiveJobState();

  logEvent("Break Start");
  setStatus("Break Started 🟡", "ok");
  updateButtons();
};

window.endBreak = function () {
  if (!actionIsReady(btnBreakEnd)) return;
  if (!selectedJob) return setStatus("Select a job before ending break.", "warn");
  if (selectedJob.futureLocked) return setStatus("This job is locked until the actual service day.", "warn");
  if (!isClockedIn) return setStatus("You must Clock In before ending break.", "warn");
  if (!onBreak) return setStatus("No active break to end.", "warn");

  onBreak = false;
  persistActiveJobState();

  logEvent("Break End");
  setStatus("Break Ended ✅", "ok");
  updateButtons();
};

window.clockOut = function () {
  if (!selectedJob && isClockedIn) restoreActiveJobState("Restored clocked-in job");

  if (!actionIsReady(btnClockOut)) return;
  if (!selectedJob) return setStatus("Please select a job before clocking out.", "warn");
  if (selectedJob.futureLocked) return setStatus("This job is locked until the actual service day.", "warn");
  if (!isClockedIn) return setStatus("You are not clocked in.", "warn");

  if (onBreak) {
    logEvent("Break End");
    onBreak = false;
  }

  logEvent("Clock Out");

  isClockedIn = false;
  onBreak = false;

  setStatus("Clocked Out ✅ (Notes saved if entered)", "ok");

  if (notesEl) notesEl.value = "";

  hideClientSpecs();
  clearActiveJobState(true);

  if (jobSearch) {
    jobSearch.value = "";
    updateJobSearchClearVisibility();
  }

  if (jobSelect) jobSelect.value = "";

  showSelectedJobAddress("");
  updateButtons();
};

// Init
ensureJobSearchClearButton();
restoreActiveJobState("Restored clocked-in job");
updateButtons();

window.addEventListener("load", updateButtons);
setTimeout(updateButtons, 50);
setTimeout(updateButtons, 250);
setTimeout(updateButtons, 750);

window.addEventListener("storage", function (event) {
  if (event.key !== activeClockStateKey) return;
  restoreActiveJobState("Restored clocked-in job");
  updateButtons();
});

window.addEventListener("pageshow", function () {
  restoreActiveJobState("Restored clocked-in job");
  updateButtons();
});

document.addEventListener("DOMContentLoaded", function () {
  if (directJobFromWeeklyBoard.source === "weekly_board") {
    restoreActiveJobState("Restored clocked-in job");
    updateButtons();
    return;
  }

  if (jobSearch && !isClockedIn) jobSearch.focus();
  restoreActiveJobState("Restored clocked-in job");
  updateButtons();
  ensureJobSearchClearButton();
});
