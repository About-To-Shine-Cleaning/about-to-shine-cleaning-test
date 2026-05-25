// =========================================================
// FILE: /admin/my-weekly-board/my-weekly-board.js
// TYPE: .js
// ATS My Weekly Board - employee schedule + approved Full Week view
// Full Week: E01/E02/E04 only
// Clock Into This Job: today only
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
const DAYS = ["Saturday", "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

const pageTitle = document.getElementById("pageTitle");
const weekLabel = document.getElementById("weekLabel");
const statusBox = document.getElementById("statusBox");
const weekBoard = document.getElementById("weekBoard");
const clientSpecsCard = document.getElementById("clientSpecsCard");
const clientSpecsBody = document.getElementById("clientSpecsBody");
const specTitle = document.getElementById("specTitle");
const closeSpecsBtn = document.getElementById("closeSpecsBtn");
const viewToolbar = document.getElementById("viewToolbar");
const btnMyJobs = document.getElementById("btnMyJobs");
const btnFullWeek = document.getElementById("btnFullWeek");
const viewHelp = document.getElementById("viewHelp");

let employeeId = "";
let employeeName = "";
let currentWeekStart = "";
let currentView = "mine";

function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getStoredAuth() {
  try {
    return JSON.parse(sessionStorage.getItem(AUTH_STORAGE) || "{}");
  } catch (error) {
    return {};
  }
}

function getStoredToken() {
  try {
    const sessionToken = String(sessionStorage.getItem(TOKEN_STORAGE) || "").trim();
    if (sessionToken) return sessionToken;
  } catch (error) {}

  try {
    const localToken = String(localStorage.getItem(TOKEN_LOCAL) || "").trim();
    if (localToken) return localToken;
  } catch (error) {}

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
  } catch (error) {
    return "";
  }
}

function canViewFullWeek() {
  return FULL_WEEK_ALLOWED.has(String(employeeId || "").trim().toUpperCase());
}

function formatYMD(date) {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + day;
}

function todayYMD() {
  return formatYMD(new Date());
}

function getSaturdayForDate(date) {
  const d = date ? new Date(date) : new Date();
  d.setHours(12, 0, 0, 0);
  while (d.getDay() !== 6) d.setDate(d.getDate() - 1);
  return d;
}

function prettyDate(ymd) {
  const d = new Date(String(ymd || "") + "T12:00:00");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function prettyDay(ymd) {
  const d = new Date(String(ymd || "") + "T12:00:00");
  return d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

function isPastDateYMD(ymd) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const d = new Date(String(ymd || "") + "T12:00:00");
  d.setHours(0, 0, 0, 0);

  return d < today;
}

function isTodayYMD(ymd) {
  return String(ymd || "") === todayYMD();
}

function getMapUrl(address) {
  const encoded = encodeURIComponent(address || "");
  if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
    return "http://maps.apple.com/?q=" + encoded;
  }
  return "https://www.google.com/maps/search/?api=1&query=" + encoded;
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

  return "/admin/clock/?" + qs.toString();
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

  if (pageTitle) pageTitle.textContent = employeeName + "'s Weekly Board";

  const fullAllowed = canViewFullWeek();
  if (viewToolbar) {
    viewToolbar.classList.toggle("open", fullAllowed);
    viewToolbar.style.display = fullAllowed ? "flex" : "none";
  }

  if (btnFullWeek) {
    btnFullWeek.style.display = fullAllowed ? "inline-flex" : "none";
  }
}

function jsonp(action, paramsObj) {
  return new Promise((resolve, reject) => {
    const cb = "cb_" + Math.random().toString(36).slice(2);
    const qs = new URLSearchParams({ action: action, callback: cb });
    const params = paramsObj || {};

    Object.keys(params).forEach(key => {
      qs.set(key, params[key]);
    });

    const script = document.createElement("script");
    script.async = true;

    window[cb] = function (res) {
      try {
        resolve(res);
      } finally {
        try { delete window[cb]; } catch (error) {}
        try { script.remove(); } catch (error) {}
      }
    };

    script.onerror = function () {
      try { delete window[cb]; } catch (error) {}
      try { script.remove(); } catch (error) {}
      reject(new Error("JSONP failed: " + action));
    };

    script.src = API_URL + "?" + qs.toString();
    document.body.appendChild(script);
  });
}

function authedJsonp(action, paramsObj) {
  const token = getStoredToken();
  const device = getDeviceKey();

  if (!token) throw new Error("Missing saved admin token. Return to Admin Home first.");
  if (!device) throw new Error("Missing device key. Return to Admin Home first.");

  const params = Object.assign({}, paramsObj || {}, { t: token, d: device });
  return jsonp(action, params);
}

function groupByDate(rows) {
  const grouped = {};
  (rows || []).forEach(row => {
    const date = String(row.serviceDate || "").trim();
    if (!date) return;
    if (!grouped[date]) grouped[date] = [];
    grouped[date].push(row);
  });
  return grouped;
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
      : "My Jobs shows maps and specs. Clock-in only appears on today's jobs.";
  }
}

function updateWeekLabel(rows, weekStart, labelMode) {
  const start = new Date(String(weekStart || "") + "T12:00:00");
  const end = new Date(start);
  end.setDate(end.getDate() + 6);

  if (weekLabel) {
    const viewName = labelMode === "full" ? "Full Week" : "My Jobs";
    const count = (rows || []).length;
    weekLabel.textContent = prettyDate(weekStart) + " to " + prettyDate(formatYMD(end)) + " - " + count + " " + (count === 1 ? "job" : "jobs") + " - " + viewName;
  }
}

function renderWeek(rows, weekStart, labelMode) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const grouped = groupByDate(safeRows);

  updateWeekLabel(safeRows, weekStart, labelMode || "mine");

  if (statusBox) {
    if (labelMode === "full") {
      statusBox.textContent = safeRows.length
        ? "Full Week view is read-only and shows employee + client only."
        : "No assignments posted for this week yet.";
    } else {
      statusBox.textContent = safeRows.length
        ? "Tap a client name to view specs. Clock Into This Job only appears on today's jobs."
        : "No assignments posted for this week yet.";
    }
  }

  if (!weekBoard) return;
  weekBoard.innerHTML = "";

  const start = new Date(String(weekStart || "") + "T12:00:00");

  DAYS.forEach((dayName, index) => {
    const d = new Date(start);
    d.setDate(d.getDate() + index);
    const ymd = formatYMD(d);
    const jobs = grouped[ymd] || [];
    const isPast = isPastDateYMD(ymd);
    const isToday = isTodayYMD(ymd);

    const card = document.createElement("section");
    card.className = "my-day-card" + (isPast ? " past-day" : "") + (isToday ? " today-day" : "");

    card.innerHTML =
      '<div class="my-day-title">' + escapeHtml(dayName) + '</div>' +
      '<div class="my-day-date">' + escapeHtml(prettyDay(ymd)) + '</div>' +
      (jobs.length
        ? jobs.map(job => labelMode === "full" ? renderFullWeekJob(job) : renderMyJob(job, isPast, isToday)).join("")
        : '<div class="empty-day">No jobs assigned.</div>');

    weekBoard.appendChild(card);
  });
}

function renderFullWeekJob(job) {
  return '' +
    '<div class="my-job-card full-week-job">' +
      '<div class="full-week-employee">' + escapeHtml(job.employeeName || job.employeeId || "Employee") + '</div>' +
      '<div class="full-week-client">' + escapeHtml(job.clientName || "Client") + '</div>' +
    '</div>';
}

function renderMyJob(job, isPast, isToday) {
  const clientNameRaw = job.clientName || "Client";
  const clientName = escapeHtml(clientNameRaw);
  const address = String(job.address || "").trim();
  const notes = String(job.notes || "").trim();
  const shared = Array.isArray(job.sharedEmployees) ? job.sharedEmployees : [];
  const sharedText = shared.length ? shared.join(", ") : "";

  let actionHtml = '<span class="my-job-date-lock">Locked Until Service Day</span>';
  if (isPast) actionHtml = '<span class="my-job-date-lock">Past Day</span>';
  if (isToday) actionHtml = '<a class="my-clock-job-btn" href="' + escapeHtml(getClockUrl(job)) + '">Clock Into This Job</a>';

  return '' +
    '<div class="my-job-card">' +
      '<button class="my-client-btn" type="button" ' + (isPast ? 'disabled aria-disabled="true" ' : '') + 'data-client-name="' + clientName + '" data-client-id="' + escapeHtml(job.clientId || "") + '">' +
        clientName +
      '</button>' +
      (address ? '<div class="my-job-address"><a href="' + escapeHtml(getMapUrl(address)) + '" target="_blank" rel="noopener">Open Map</a><br>' + escapeHtml(address) + '</div>' : '') +
      (sharedText ? '<div class="my-job-shared">With: ' + escapeHtml(sharedText) + '</div>' : '') +
      (notes ? '<div class="my-job-notes">' + escapeHtml(notes) + '</div>' : '') +
      actionHtml +
    '</div>';
}

function formatSpecLine(label, value) {
  const clean = String(value || "").trim();
  if (!clean) return "";

  return '' +
    '<div class="spec-line">' +
      '<div class="spec-label">' + escapeHtml(label) + '</div>' +
      '<div class="spec-value">' + escapeHtml(clean) + '</div>' +
    '</div>';
}

function renderSpecs(specs, fallbackName) {
  if (!clientSpecsCard || !clientSpecsBody) return;

  clientSpecsCard.classList.add("open");

  if (!specs || !specs.ok) {
    if (specTitle) specTitle.textContent = fallbackName || "Client Specs";
    clientSpecsBody.innerHTML = '<div>No client specs found.</div>';
    clientSpecsCard.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  const address = specs.address || "";
  if (specTitle) specTitle.textContent = specs.clientName || fallbackName || "Client Specs";

  clientSpecsBody.innerHTML =
    (address ? '<p style="margin:0 0 12px;"><a href="' + escapeHtml(getMapUrl(address)) + '" target="_blank" rel="noopener">Open address in Maps</a><br>' + escapeHtml(address) + '</p>' : '') +
    formatSpecLine("Frequency", specs.frequency) +
    formatSpecLine("Specs", specs.specs) +
    formatSpecLine("Special Info", specs.specialInfo);

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
    const res = await jsonp("client_specs", { clientName: clientName, clientId: clientId || "" });
    renderSpecs(res, clientName);
  } catch (error) {
    renderSpecs({ ok: false }, clientName);
  }
}

async function loadMyBoard() {
  setViewMode("mine");

  const res = await jsonp("weekly_board_employee_view", {
    employeeId: employeeId,
    emp: employeeId,
    weekStart: currentWeekStart
  });

  if (!res || !res.ok) {
    throw new Error(res && res.error ? res.error : "weekly_board_employee_view failed");
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
    throw new Error(res && res.error ? res.error : "weekly_board_full_week failed");
  }

  renderWeek(res.rows || [], res.weekStart || currentWeekStart, "full");
}

async function loadBoard() {
  resolveEmployee();
  currentWeekStart = formatYMD(getSaturdayForDate(new Date()));
  await loadMyBoard();
}

if (btnMyJobs) {
  btnMyJobs.addEventListener("click", () => {
    loadMyBoard().catch(error => {
      if (statusBox) statusBox.textContent = String(error && error.message ? error.message : error);
    });
  });
}

if (btnFullWeek) {
  btnFullWeek.addEventListener("click", () => {
    loadFullWeekBoard().catch(error => {
      if (statusBox) statusBox.textContent = String(error && error.message ? error.message : error);
    });
  });
}

if (weekBoard) {
  weekBoard.addEventListener("click", event => {
    const btn = event.target.closest("[data-client-name]");
    if (!btn) return;
    if (btn.closest(".past-day")) return;
    openClientSpecs(btn.dataset.clientName || "", btn.dataset.clientId || "");
  });
}

if (closeSpecsBtn) {
  closeSpecsBtn.addEventListener("click", () => {
    if (clientSpecsCard) clientSpecsCard.classList.remove("open");
  });
}

function startPage() {
  loadBoard().catch(error => {
    if (statusBox) statusBox.textContent = String(error && error.message ? error.message : error);
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", startPage);
} else {
  startPage();
}
