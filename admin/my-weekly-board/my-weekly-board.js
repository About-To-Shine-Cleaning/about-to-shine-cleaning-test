// =========================================================
// FILE: /admin/my-weekly-board/my-weekly-board.js
// TYPE: .js
// ATS My Weekly Board — employee schedule + approved Full Week view
// Updated:
// ✅ Default = My Jobs
// ✅ E01/E02/E04 can toggle Full Week
// ✅ Full Week stays clean: employee + client only
// ✅ My Jobs keeps specs/maps
// ✅ Restored Clock Into This Job for today/future active jobs
// ✅ Past days greyed out and inactive
// =========================================================

const API_URL = "https://script.google.com/macros/s/AKfycbx2bQ-SSeUHoihjbkYmkJ5-0Dw8JPqH8bhBQR3fbvLsOhDhbuPv0MdVeTdMW6zoVTsWsw/exec";

const AUTH_STORAGE = "ats_admin_auth_v1";
const TOKEN_STORAGE = "ats_admin_token_v1";
const TOKEN_LOCAL = "ats_admin_token_local_v1";
const DEVICE_KEY_STORAGE = "ats_device_key_v1";

const EMPLOYEES = {
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

const FULL_WEEK_ALLOWED = new Set(["E01", "E02", "E04"]);

const pageTitle = document.getElementById("pageTitle");
const weekLabel = document.getElementById("weekLabel");
const statusBox = document.getElementById("statusBox");
const weekBoard = document.getElementById("weekBoard");
const clockLink = document.getElementById("clockLink");
const clientSpecsCard = document.getElementById("clientSpecsCard");
const clientSpecsBody = document.getElementById("clientSpecsBody");
const specTitle = document.getElementById("specTitle");
const closeSpecsBtn = document.getElementById("closeSpecsBtn");

const viewToolbar = document.getElementById("viewToolbar");
const btnMyJobs = document.getElementById("btnMyJobs");
const btnFullWeek = document.getElementById("btnFullWeek");
const viewHelp = document.getElementById("viewHelp");

const DAYS = ["Saturday", "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

let employeeId = "";
let employeeName = "";
let activeRows = [];
let currentWeekStart = "";
let currentView = "mine";

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getStoredAuth() {
  try {
    return JSON.parse(sessionStorage.getItem(AUTH_STORAGE) || "{}");
  } catch (e) {
    return {};
  }
}

function getStoredToken() {
  try {
    const sessionToken = String(sessionStorage.getItem(TOKEN_STORAGE) || "").trim();
    if (sessionToken) return sessionToken;
  } catch (e) {}

  try {
    const localToken = String(localStorage.getItem(TOKEN_LOCAL) || "").trim();
    if (localToken) return localToken;
  } catch (e) {}

  return "";
}

function getDeviceKey() {
  try {
    let key = String(localStorage.getItem(DEVICE_KEY_STORAGE) || "").trim();
    if (!key) {
      key = "dev_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem(DEVICE_KEY_STORAGE, key);
    }
    return key;
  } catch (e) {
    return "";
  }
}

function canViewFullWeek() {
  return FULL_WEEK_ALLOWED.has(String(employeeId || "").trim().toUpperCase());
}

function resolveEmployee() {
  const params = new URLSearchParams(window.location.search);
  const auth = getStoredAuth();
  const fromUrl = String(params.get("emp") || "").trim().toUpperCase();
  const fromAuth = String(auth.employeeId || "").trim().toUpperCase();

  employeeId = fromUrl || fromAuth;
  employeeName = EMPLOYEES[employeeId] || auth.employeeName || employeeId;

  if (!employeeId || !employeeName) {
    throw new Error("Missing employee. Open this from the Home page or use ?emp=E05.");
  }

  if (pageTitle) pageTitle.textContent = `${employeeName}'s Weekly Board`;

  if (clockLink) clockLink.href = getClockUrl({});

  if (viewToolbar) {
    viewToolbar.classList.toggle("open", canViewFullWeek());
    viewToolbar.style.display = canViewFullWeek() ? "flex" : "none";
  }

  if (btnFullWeek) {
    btnFullWeek.style.display = canViewFullWeek() ? "inline-flex" : "none";
  }
}

function jsonp(action, paramsObj = {}) {
  return new Promise((resolve, reject) => {
    const cb = "cb_" + Math.random().toString(36).slice(2);
    const qs = new URLSearchParams({ action, ...paramsObj, callback: cb });
    const script = document.createElement("script");
    script.async = true;

    window[cb] = function (res) {
      try {
        resolve(res);
      } finally {
        try { delete window[cb]; } catch (e) {}
        try { script.remove(); } catch (e) {}
      }
    };

    script.onerror = function () {
      try { delete window[cb]; } catch (e) {}
      try { script.remove(); } catch (e) {}
      reject(new Error("JSONP failed: " + action));
    };

    script.src = API_URL + "?" + qs.toString();
    document.body.appendChild(script);
  });
}

function authedJsonp(action, paramsObj = {}) {
  const token = getStoredToken();
  const device = getDeviceKey();

  if (!token) throw new Error("Missing saved admin token. Return to Admin Home first.");
  if (!device) throw new Error("Missing device key. Return to Admin Home first.");

  return jsonp(action, {
    ...paramsObj,
    t: token,
    d: device
  });
}

function getSaturdayForDate(date = new Date()) {
  const d = new Date(date);
  d.setHours(12, 0, 0, 0);
  while (d.getDay() !== 6) d.setDate(d.getDate() - 1);
  return d;
}

function formatYMD(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function prettyDate(ymd) {
  const d = new Date(ymd + "T12:00:00");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function prettyDay(ymd) {
  const d = new Date(ymd + "T12:00:00");
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

function isPastDateYMD(ymd) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const d = new Date(ymd + "T12:00:00");
  d.setHours(0, 0, 0, 0);

  return d < today;
}

function getMapUrl(address) {
  const encoded = encodeURIComponent(address || "");
  return /iPhone|iPad|iPod/i.test(navigator.userAgent)
    ? "http://maps.apple.com/?q=" + encoded
    : "https://www.google.com/maps/search/?api=1&query=" + encoded;
}

function getClockUrl(job) {
  const qs = new URLSearchParams({ emp: employeeId });

  if (job && (job.clientName || job.clientId || job.serviceDate)) {
    qs.set("source", "weekly_board");
    qs.set("serviceDate", job.serviceDate || "");
    qs.set("clientId", job.clientId || "");
    qs.set("clientName", job.clientName || "");
    qs.set("jobName", job.clientName || "");
    qs.set("address", job.address || "");
  }

  return `/admin/clock/?${qs.toString()}`;
}

function groupByDate(rows) {
  const out = {};
  rows.forEach(row => {
    const date = row.serviceDate || "";
    if (!date) return;
    if (!out[date]) out[date] = [];
    out[date].push(row);
  });
  return out;
}

function setViewMode(mode) {
  currentView = mode === "full" ? "full" : "mine";

  if (btnMyJobs) {
    btnMyJobs.classList.toggle("active", currentView === "mine");
    btnMyJobs.setAttribute("aria-pressed", currentView === "mine" ? "true" : "false");
  }

  if (btnFullWeek) {
    btnFullWeek.classList.toggle("active", currentView === "full");
    btnFullWeek.setAttribute("aria-pressed", currentView === "full" ? "true" : "false");
  }

  if (clientSpecsCard && currentView === "full") {
    clientSpecsCard.classList.remove("open");
  }

  if (viewHelp) {
    viewHelp.textContent = currentView === "full"
      ? "Full Week shows employee + client only."
      : "My Jobs shows maps, specs, and clock-in for active service days.";
  }
}

function updateWeekLabel(rows, weekStart, labelMode) {
  const start = new Date(weekStart + "T12:00:00");
  const end = new Date(start);
  end.setDate(end.getDate() + 6);

  if (weekLabel) {
    const name = labelMode === "full" ? "Full Week" : "My Jobs";
    weekLabel.textContent = `${prettyDate(weekStart)} → ${prettyDate(formatYMD(end))} • ${rows.length} ${rows.length === 1 ? "job" : "jobs"} • ${name}`;
  }
}

function renderWeek(rows, weekStart, labelMode = "mine") {
  activeRows = Array.isArray(rows) ? rows : [];
  const grouped = groupByDate(activeRows);

  updateWeekLabel(activeRows, weekStart, labelMode);

  if (statusBox) {
    if (labelMode === "full") {
      statusBox.textContent = activeRows.length
        ? "Full Week view is read-only and shows employee + client only."
        : "No assignments posted for this week yet.";
    } else {
      statusBox.textContent = activeRows.length
        ? "Tap a client name to view specs. Use Clock Into This Job for today or upcoming service days."
        : "No assignments posted for this week yet.";
    }
  }

  if (!weekBoard) return;
  weekBoard.innerHTML = "";

  const start = new Date(weekStart + "T12:00:00");

  DAYS.forEach((day, index) => {
    const d = new Date(start);
    d.setDate(d.getDate() + index);
    const ymd = formatYMD(d);
    const jobs = grouped[ymd] || [];
    const isPast = isPastDateYMD(ymd);

    const card = document.createElement("section");
    card.className = "my-day-card" + (isPast ? " past-day" : "");

    card.innerHTML = `
      <div class="my-day-title">${escapeHtml(day)}</div>
      <div class="my-day-date">${escapeHtml(prettyDay(ymd))}</div>
      ${jobs.length ? jobs.map(job => labelMode === "full" ? renderFullWeekJob(job) : renderMyJob(job, isPast)).join("") : `<div class="empty-day">No jobs assigned.</div>`}
    `;

    weekBoard.appendChild(card);
  });
}

function renderFullWeekJob(job) {
  return `
    <div class="my-job-card full-week-job">
      <div class="full-week-employee">${escapeHtml(job.employeeName || job.employeeId || "Employee")}</div>
      <div class="full-week-client">${escapeHtml(job.clientName || "Client")}</div>
    </div>
  `;
}

function renderMyJob(job, isPast) {
  const clientName = escapeHtml(job.clientName || "Client");
  const address = String(job.address || "").trim();
  const notes = String(job.notes || "").trim();
  const shared = Array.isArray(job.sharedEmployees) ? job.sharedEmployees : [];
  const sharedText = shared.length ? shared.join(", ") : "";
  const clockUrl = getClockUrl(job);

  return `
    <div class="my-job-card">
      <button class="my-client-btn" type="button" ${isPast ? "disabled aria-disabled=\"true\"" : ""} data-client-name="${clientName}" data-client-id="${escapeHtml(job.clientId || "")}">
        ${clientName}
      </button>
      ${address ? `<div class="my-job-address"><a href="${getMapUrl(address)}" target="_blank" rel="noopener">📍 Open Map</a><br>${escapeHtml(address)}</div>` : ""}
      ${sharedText ? `<div class="my-job-shared">With: ${escapeHtml(sharedText)}</div>` : ""}
      ${notes ? `<div class="my-job-notes">${escapeHtml(notes)}</div>` : ""}
      ${isPast
        ? `<span class="my-job-date-lock">Past Day</span>`
        : `<a class="my-clock-job-btn" href="${clockUrl}">Clock Into This Job</a>`
      }
    </div>
  `;
}

function formatSpecLine(label, value) {
  const clean = String(value || "").trim();
  if (!clean) return "";
  return `
    <div class="spec-line">
      <div class="spec-label">${escapeHtml(label)}</div>
      <div class="spec-value">${escapeHtml(clean)}</div>
    </div>
  `;
}

function renderSpecs(specs, fallbackName) {
  if (!clientSpecsCard || !clientSpecsBody) return;

  clientSpecsCard.classList.add("open");

  if (!specs || !specs.ok) {
    if (specTitle) specTitle.textContent = fallbackName || "Client Specs";
    clientSpecsBody.innerHTML = `<div>No client specs found.</div>`;
    clientSpecsCard.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  const address = specs.address || "";
  if (specTitle) specTitle.textContent = specs.clientName || fallbackName || "Client Specs";

  clientSpecsBody.innerHTML = `
    ${address ? `<p style="margin:0 0 12px;"><a href="${getMapUrl(address)}" target="_blank" rel="noopener">📍 Open address in Maps</a><br>${escapeHtml(address)}</p>` : ""}
    ${formatSpecLine("Frequency", specs.frequency)}
    ${formatSpecLine("Specs", specs.specs)}
    ${formatSpecLine("Special Info", specs.specialInfo)}
  `;

  clientSpecsCard.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function openClientSpecs(clientName, clientId) {
  if (!clientName || currentView === "full") return;

  if (clientSpecsCard && clientSpecsBody) {
    clientSpecsCard.classList.add("open");
    if (specTitle) specTitle.textContent = clientName;
    clientSpecsBody.textContent = "Loading client info...";
  }

  try {
    const res = await jsonp("client_specs", { clientName, clientId: clientId || "" });
    renderSpecs(res, clientName);
  } catch (err) {
    renderSpecs({ ok: false }, clientName);
  }
}

async function loadMyBoard() {
  setViewMode("mine");

  const res = await jsonp("weekly_board_employee_view", {
    employeeId,
    emp: employeeId,
    weekStart: currentWeekStart
  });

  if (!res || !res.ok) {
    throw new Error(res?.error || "weekly_board_employee_view failed");
  }

  renderWeek(res.rows || [], res.weekStart || currentWeekStart, "mine");
}

async function loadFullWeekBoard() {
  if (!canViewFullWeek()) {
    throw new Error("Full Week view is not available for this profile.");
  }

  setViewMode("full");

  const res = await authedJsonp("weekly_board_full_week", {
    weekStart: currentWeekStart
  });

  if (!res || !res.ok) {
    throw new Error(res?.error || "weekly_board_full_week failed");
  }

  renderWeek(res.rows || [], res.weekStart || currentWeekStart, "full");
}

async function loadBoard() {
  resolveEmployee();

  const start = getSaturdayForDate(new Date());
  currentWeekStart = formatYMD(start);

  await loadMyBoard();
}

if (btnMyJobs) {
  btnMyJobs.addEventListener("click", () => {
    loadMyBoard().catch(err => {
      if (statusBox) statusBox.textContent = String(err?.message || err);
    });
  });
}

if (btnFullWeek) {
  btnFullWeek.addEventListener("click", () => {
    loadFullWeekBoard().catch(err => {
      if (statusBox) statusBox.textContent = String(err?.message || err);
    });
  });
}

if (weekBoard) {
  weekBoard.addEventListener("click", function (e) {
    const btn = e.target.closest("[data-client-name]");
    if (!btn) return;
    if (btn.closest(".past-day")) return;
    openClientSpecs(btn.dataset.clientName || "", btn.dataset.clientId || "");
  });
}

if (closeSpecsBtn) {
  closeSpecsBtn.addEventListener("click", function () {
    clientSpecsCard?.classList.remove("open");
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    loadBoard().catch(err => {
      if (statusBox) statusBox.textContent = String(err?.message || err);
    });
  });
} else {
  loadBoard().catch(err => {
    if (statusBox) statusBox.textContent = String(err?.message || err);
  });
}
