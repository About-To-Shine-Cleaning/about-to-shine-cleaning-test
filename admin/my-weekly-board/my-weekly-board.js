# /admin/my-weekly-board/my-weekly-board.js

```javascript
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
```

# /admin/my-weekly-board/index.html

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>My Weekly Board | ATS Admin</title>

<meta
  name="viewport"
  content="width=device-width, initial-scale=1"
/>

<link
  rel="stylesheet"
  href="/admin/admin-layout.css?v=6008"
/>

<link
  rel="icon"
  type="image/png"
  href="/assets/images/logo-v2.png"
/>

<script
  defer
  src="/admin/admin-nav.js?v=6008"
></script>

<script
  defer
  src="./my-weekly-board.js?v=6009"
></script>

<style>

html,
body{
  width:100%;
  max-width:100%;
  overflow-x:hidden;
}

body.ats-admin{
  background:
    radial-gradient(
      circle at top left,
      rgba(138,92,255,.18),
      transparent 35%
    ),
    linear-gradient(
      180deg,
      #0c1020,
      #070b16
    );
}

.my-board-container{
  width:100%;
  max-width:1500px;
  margin:0 auto;
  padding:18px;
  box-sizing:border-box;
}

.my-board-shell{
  width:100%;
  overflow:hidden;
  padding:20px;
}

.my-board-top{
  display:flex;
  justify-content:space-between;
  align-items:flex-start;
  gap:18px;
  flex-wrap:wrap;
}

.my-board-actions{
  display:flex;
  align-items:center;
  justify-content:flex-end;
  gap:10px;
  flex-wrap:wrap;
}

.my-board-meta{
  opacity:.78;
  margin-top:8px;
  line-height:1.45;
}

#statusBox{
  margin-top:14px;
  line-height:1.45;
  opacity:.9;
}

.view-toolbar{
  display:none;
  align-items:center;
  gap:10px;
  flex-wrap:wrap;
  margin-top:18px;
}

.view-toolbar.open{
  display:flex;
}

.board-toggle-btn,
.my-clock-top-btn,
.my-clock-job-btn{
  min-height:42px;
  display:inline-flex;
  align-items:center;
  justify-content:center;
  gap:8px;
  padding:10px 16px;
  border-radius:999px;
  border:1px solid rgba(255,230,0,.44);
  background:rgba(255,230,0,.10);
  color:#ffe600;
  font-weight:950;
  text-decoration:none;
  cursor:pointer;
}

.board-toggle-btn.active,
.my-clock-top-btn,
.my-clock-job-btn{
  background:#ffe600;
  color:#10121f;
  border-color:#ffe600;
  box-shadow:0 0 22px rgba(255,230,0,.16);
}

.view-help{
  width:100%;
  color:rgba(255,255,255,.66);
  font-size:13px;
  line-height:1.4;
}

.my-board-week{
  display:grid;
  grid-template-columns:
    repeat(
      7,
      minmax(0,1fr)
    );

  gap:12px;
  margin-top:22px;
}

.my-day-card{
  background:
    linear-gradient(
      180deg,
      rgba(255,255,255,.06),
      rgba(255,255,255,.03)
    );

  border:
    1px solid
    rgba(255,255,255,.10);

  border-radius:20px;

  padding:14px;

  min-width:0;

  transition:
    transform .18s ease,
    border-color .18s ease;
}

.my-day-card:hover{
  transform:translateY(-2px);

  border-color:
    rgba(255,230,0,.25);
}

.my-day-card.past-day{
  opacity:.55;
  filter:grayscale(.55);
}

.my-day-title{
  font-size:18px;
  font-weight:900;
}

.my-day-date{
  margin-top:4px;
  margin-bottom:14px;

  font-size:12px;

  color:
    rgba(255,255,255,.68);
}

.my-job-card{
  background:
    rgba(0,0,0,.22);

  border:
    1px solid
    rgba(255,255,255,.10);

  border-radius:16px;

  padding:14px;

  margin-bottom:12px;
}

.my-client-btn{
  appearance:none;
  border:0;
  background:transparent;

  color:#fff;

  padding:0;
  margin:0;

  font:inherit;
  font-size:18px;
  font-weight:900;

  text-align:left;

  cursor:pointer;

  text-decoration:underline;
  text-underline-offset:3px;
}

.my-client-btn:disabled{
  cursor:not-allowed;
  opacity:.65;
  text-decoration:none;
}

.my-job-address,
.my-job-notes,
.my-job-shared{
  margin-top:10px;

  font-size:13px;

  line-height:1.45;

  color:
    rgba(255,255,255,.82);

  overflow-wrap:anywhere;
}

.my-job-address a{
  color:#ffe600;
  font-weight:900;
}

.my-clock-job-btn{
  width:100%;
  margin-top:12px;
  border-radius:14px;
}

.my-job-date-lock{
  margin-top:12px;

  display:inline-flex;
  align-items:center;
  justify-content:center;

  min-height:34px;

  padding:
    8px 12px;

  border-radius:999px;

  background:
    rgba(255,255,255,.07);

  border:
    1px solid
    rgba(255,255,255,.12);

  font-size:12px;
  font-weight:900;

  color:
    rgba(255,255,255,.72);
}

.full-week-job{
  display:grid;
  gap:6px;
}

.full-week-employee{
  color:#ffe600;
  font-size:13px;
  font-weight:950;
}

.full-week-client{
  color:#fff;
  font-size:16px;
  font-weight:950;
}

.empty-day{
  opacity:.58;
  font-size:13px;
}

.spec-card{
  display:none;

  margin-top:20px;

  background:
    linear-gradient(
      180deg,
      rgba(255,255,255,.06),
      rgba(255,255,255,.03)
    );

  border:
    1px solid
    rgba(255,255,255,.10);

  border-radius:20px;

  padding:20px;
}

.spec-card.open{
  display:block;
}

.spec-head{
  display:flex;
  justify-content:space-between;
  align-items:center;
  gap:12px;
  flex-wrap:wrap;

  margin-bottom:14px;
}

.spec-line{
  margin-bottom:18px;
}

.spec-label{
  font-size:12px;
  font-weight:900;

  text-transform:uppercase;

  letter-spacing:.06em;

  opacity:.68;

  margin-bottom:5px;
}

.spec-value{
  white-space:pre-wrap;
  line-height:1.55;
}

@media(max-width:1200px){

  .my-board-week{
    grid-template-columns:
      repeat(
        3,
        minmax(0,1fr)
      );
  }

}

@media(max-width:850px){

  .my-board-week{
    grid-template-columns:
      repeat(
        2,
        minmax(0,1fr)
      );
  }

}

@media(max-width:760px){

  .my-board-container{
    padding:12px;
  }

  .my-board-shell{
    padding:16px;
  }

  .my-board-week{
    grid-template-columns:1fr;
  }

  .my-board-actions{
    width:100%;
    justify-content:stretch;
  }

  .my-clock-top-btn,
  .board-toggle-btn{
    flex:1 1 auto;
  }

}

</style>
</head>

<body class="ats-admin">

<header class="ats-header">

  <div class="ats-header-inner">

    <a
      class="ats-brand"
      href="/admin/"
    >
      <img
        src="/assets/images/logo-v2.png"
        alt="About To Shine Cleaning"
      />
    </a>

    <div class="ats-header-actions">

      <a
        class="ats-live-btn"
        href="https://abouttoshinecleaning.com"
        target="_blank"
      >
        Go to Live Website
      </a>

      <button
        class="ats-burger"
        type="button"
        aria-label="Open menu"
      >
        <span></span>
        <span></span>
        <span></span>
      </button>

    </div>

  </div>

</header>

<main class="ats-main">

  <div class="my-board-container">

    <section class="ats-card my-board-shell">

      <div class="my-board-top">

        <div>

          <div class="ats-eyebrow">
            Employee Weekly Board
          </div>

          <h1 id="pageTitle">
            My Weekly Board
          </h1>

          <h2 id="weekLabel" style="margin:.35rem 0 0;">
            Loading week...
          </h2>

          <div
            class="my-board-meta"
            id="statusBox"
          >
            Loading assignments...
          </div>

        </div>

        <div class="my-board-actions">
          <a
            class="my-clock-top-btn"
            id="clockLink"
            href="/admin/clock/"
          >
            Open Clock
          </a>
        </div>

      </div>

      <div
        class="view-toolbar"
        id="viewToolbar"
      >
        <button
          class="board-toggle-btn active"
          type="button"
          id="btnMyJobs"
          aria-pressed="true"
        >
          My Jobs
        </button>

        <button
          class="board-toggle-btn"
          type="button"
          id="btnFullWeek"
          aria-pressed="false"
        >
          Full Week
        </button>

        <div
          class="view-help"
          id="viewHelp"
        >
          My Jobs shows maps, specs, and clock-in for active service days.
        </div>
      </div>

      <div
        class="my-board-week"
        id="weekBoard"
      ></div>

    </section>

    <section
      class="spec-card"
      id="clientSpecsCard"
    >

      <div class="spec-head">

        <h2
          id="specTitle"
          style="margin:0;"
        >
          Client Specs
        </h2>

        <button
          class="button button-secondary"
          type="button"
          id="closeSpecsBtn"
        >
          Close
        </button>

      </div>

      <div id="clientSpecsBody">
        Loading...
      </div>

    </section>

  </div>

</main>

</body>
</html>
```
