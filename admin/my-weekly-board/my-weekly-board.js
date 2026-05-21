// =========================================================
// FILE: /admin/my-weekly-board/my-weekly-board.js
// TYPE: .js
// ATS My Weekly Board — read-only employee schedule
// Adds: direct Clock Into This Job links for weekly-board assignments
// DO NOT paste this into /admin/weekly-board/weekly-board.js
// =========================================================

const API_URL = "https://script.google.com/macros/s/AKfycbx2bQ-SSeUHoihjbkYmkJ5-0Dw8JPqH8bhBQR3fbvLsOhDhbuPv0MdVeTdMW6zoVTsWsw/exec";

const AUTH_STORAGE = "ats_admin_auth_v1";

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

const pageTitle = document.getElementById("pageTitle");
const weekLabel = document.getElementById("weekLabel");
const statusBox = document.getElementById("statusBox");
const weekBoard = document.getElementById("weekBoard");
const clockLink = document.getElementById("clockLink");
const clientSpecsCard = document.getElementById("clientSpecsCard");
const clientSpecsBody = document.getElementById("clientSpecsBody");
const specTitle = document.getElementById("specTitle");
const closeSpecsBtn = document.getElementById("closeSpecsBtn");

const DAYS = ["Saturday", "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

let employeeId = "";
let employeeName = "";
let activeRows = [];

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
  if (clockLink) clockLink.href = `/clock.html?emp=${encodeURIComponent(employeeId)}`;
}

function jsonp(action, paramsObj = {}) {
  return new Promise((resolve, reject) => {
    const cb = "cb_" + Math.random().toString(36).slice(2);
    const qs = new URLSearchParams({ action, ...paramsObj, callback: cb });
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

    script.src = API_URL + "?" + qs.toString();
    document.body.appendChild(script);
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

function getMapUrl(address) {
  const encoded = encodeURIComponent(address || "");
  return /iPhone|iPad|iPod/i.test(navigator.userAgent)
    ? "http://maps.apple.com/?q=" + encoded
    : "https://www.google.com/maps/search/?api=1&query=" + encoded;
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

function buildClockUrl(job) {
  const qs = new URLSearchParams({
    emp: employeeId,
    source: "weekly_board",
    serviceDate: job.serviceDate || "",
    clientId: job.clientId || "",
    clientName: job.clientName || "",
    jobName: job.clientName || "",
    address: job.address || ""
  });

  return `/clock.html?${qs.toString()}`;
}

function renderWeek(rows, weekStart) {
  activeRows = Array.isArray(rows) ? rows : [];
  const grouped = groupByDate(activeRows);

  const start = new Date(weekStart + "T12:00:00");
  const end = new Date(start);
  end.setDate(end.getDate() + 6);

  if (weekLabel) {
    weekLabel.textContent = `${prettyDate(weekStart)} → ${prettyDate(formatYMD(end))} • ${activeRows.length} job${activeRows.length === 1 ? "" : "s"}`;
  }

  if (statusBox) {
    statusBox.textContent = activeRows.length
      ? "Tap a client name to view specs, or tap Clock Into This Job to open the clock already selected."
      : "No assignments posted for this week yet.";
  }

  if (!weekBoard) return;
  weekBoard.innerHTML = "";

  DAYS.forEach((day, index) => {
    const d = new Date(start);
    d.setDate(d.getDate() + index);
    const ymd = formatYMD(d);
    const jobs = grouped[ymd] || [];

    const card = document.createElement("section");
    card.className = "my-day-card";

    card.innerHTML = `
      <div class="my-day-title">${escapeHtml(day)}</div>
      <div class="my-day-date">${escapeHtml(prettyDay(ymd))}</div>
      ${jobs.length ? jobs.map(renderJob).join("") : `<div class="empty-day">No jobs assigned.</div>`}
    `;

    weekBoard.appendChild(card);
  });
}

function renderJob(job) {
  const clientName = escapeHtml(job.clientName || "Client");
  const address = String(job.address || "").trim();
  const notes = String(job.notes || "").trim();
  const shared = Array.isArray(job.sharedEmployees) ? job.sharedEmployees : [];
  const sharedText = shared.length ? shared.join(", ") : "";
  const clockUrl = buildClockUrl(job);

  return `
    <div class="my-job-card">
      <button class="my-client-btn" type="button" data-client-name="${clientName}" data-client-id="${escapeHtml(job.clientId || "")}">
        ${clientName}
      </button>
      ${address ? `<div class="my-job-address"><a href="${getMapUrl(address)}" target="_blank" rel="noopener">📍 Open Map</a><br>${escapeHtml(address)}</div>` : ""}
      ${sharedText ? `<div class="my-job-shared">With: ${escapeHtml(sharedText)}</div>` : ""}
      ${notes ? `<div class="my-job-notes">${escapeHtml(notes)}</div>` : ""}
      <a class="button my-clock-btn" href="${clockUrl}">Clock Into This Job</a>
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
  if (!clientName) return;

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

async function loadBoard() {
  resolveEmployee();

  const start = getSaturdayForDate(new Date());
  const weekStart = formatYMD(start);

  const res = await jsonp("weekly_board_employee_view", {
    employeeId,
    emp: employeeId,
    weekStart
  });

  if (!res || !res.ok) {
    throw new Error(res?.error || "weekly_board_employee_view failed");
  }

  renderWeek(res.rows || [], res.weekStart || weekStart);
}

if (weekBoard) {
  weekBoard.addEventListener("click", function (e) {
    const btn = e.target.closest("[data-client-name]");
    if (!btn) return;
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
