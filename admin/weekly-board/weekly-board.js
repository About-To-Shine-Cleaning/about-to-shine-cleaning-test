// =========================================================
// FILE: /admin/weekly-board/weekly-board.js
// TYPE: .js
// ATS Weekly Assignment Board EDITOR
// Admin / Payroll / Scheduler only
// =========================================================

const API_URL = "https://script.google.com/macros/s/AKfycbx2bQ-SSeUHoihjbkYmkJ5-0Dw8JPqH8bhBQR3fbvLsOhDhbuPv0MdVeTdMW6zoVTsWsw/exec";

const DEVICE_KEY_STORAGE = "ats_device_key_v1";
const TOKEN_STORAGE = "ats_admin_token_v1";
const TOKEN_LOCAL = "ats_admin_token_local_v1";
const AUTH_STORAGE = "ats_admin_auth_v1";

const boardEl = document.getElementById("weekBoard");
const weekLabel = document.getElementById("weekLabel");
const modal = document.getElementById("assignmentModal");
const modalTitle = document.getElementById("modalTitle");
const employeeSelect = document.getElementById("employeeSelect");
const clientSearch = document.getElementById("clientSearch");
const clientSuggestions = document.getElementById("clientSuggestions");
const assignmentList = document.getElementById("assignmentList");
const btnSaveWeek = document.getElementById("btnSaveWeek");
const closeModalBtn = document.getElementById("closeModal");
const btnAddAssignment = document.getElementById("btnAddAssignment");

const DAYS = ["Saturday", "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

let currentDay = null;
let selectedClient = null;
let employees = [];
let clients = [];
let assignments = [];
let currentWeekStart = "";
let auth = null;

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

function canEditWeeklyBoard(authObj) {
  const role = normalizeRole(authObj?.role, authObj?.employeeId);
  return role === "full_admin" || role === "schedule_payroll" || role === "payroll";
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setMessage(msg, isError) {
  if (!weekLabel) return;
  weekLabel.textContent = msg;
  if (isError) weekLabel.style.color = "#ffb4b4";
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

function getWeekStart() {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  while (d.getDay() !== 6) d.setDate(d.getDate() - 1);
  return d;
}

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function prettyDate(ymd) {
  const d = new Date(ymd + "T12:00:00");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

async function init() {
  try {
    const authRes = await jsonp("auth");
    if (!authRes || !authRes.ok) throw new Error(authRes?.error || "Not authorized");
    auth = authRes;

    try { sessionStorage.setItem(AUTH_STORAGE, JSON.stringify(authRes)); } catch (e) {}
    window.dispatchEvent(new Event("ats-auth-ready"));

    if (!canEditWeeklyBoard(auth)) {
      setMessage("Weekly Board editor is not available for this role.", true);
      if (boardEl) {
        boardEl.innerHTML = `
          <div class="assignment" style="grid-column:1/-1;">
            This page is for office/admin editing only. Your read-only weekly board is on the clock screen.
          </div>
        `;
      }
      if (btnSaveWeek) btnSaveWeek.style.display = "none";
      return;
    }

    const start = getWeekStart();
    currentWeekStart = formatDate(start);

    await Promise.all([
      loadEmployees(),
      loadClients(),
      loadBoard(currentWeekStart)
    ]);

    buildWeekBoard();

    closeModalBtn?.addEventListener("click", closeModal);
    btnAddAssignment?.addEventListener("click", addAssignment);
    clientSearch?.addEventListener("input", handleClientSearch);
    btnSaveWeek?.addEventListener("click", saveBoard);

    modal?.addEventListener("click", (e) => {
      if (e.target === modal) closeModal();
    });
  } catch (err) {
    console.error(err);
    setMessage(String(err?.message || err), true);
    alert(String(err?.message || err));
  }
}

async function loadEmployees() {
  const data = await jsonp("board_employees");
  if (!data || !data.ok) throw new Error(data?.error || "board_employees failed");

  employees = Array.isArray(data.rows) ? data.rows : [];

  if (employeeSelect) {
    employeeSelect.innerHTML = employees.map(emp => `
      <option value="${escapeHtml(emp.employeeId)}">${escapeHtml(emp.employeeId)} • ${escapeHtml(emp.employeeName)}</option>
    `).join("");
  }
}

async function loadClients() {
  const data = await jsonp("board_clients");
  if (!data || !data.ok) throw new Error(data?.error || "board_clients failed");
  clients = Array.isArray(data.rows) ? data.rows : [];
}

async function loadBoard(weekStart) {
  const data = await jsonp("weekly_board_get", { weekStart });
  if (!data || !data.ok) throw new Error(data?.error || "weekly_board_get failed");
  assignments = Array.isArray(data.rows) ? data.rows : [];
}

function buildWeekBoard() {
  if (!boardEl) return;
  boardEl.innerHTML = "";

  const start = new Date(currentWeekStart + "T12:00:00");
  const end = new Date(start);
  end.setDate(end.getDate() + 6);

  if (weekLabel) weekLabel.textContent = `${prettyDate(currentWeekStart)} → ${prettyDate(formatDate(end))}`;

  DAYS.forEach((day, index) => {
    const current = new Date(start);
    current.setDate(current.getDate() + index);
    const dateStr = formatDate(current);

    const card = document.createElement("div");
    card.className = "day-card";
    card.innerHTML = `
      <div class="day-header">
        <div>
          <div class="day-name">${escapeHtml(day)}</div>
          <div class="day-date">${escapeHtml(dateStr)}</div>
        </div>
        <button class="button button-small" type="button">Edit</button>
      </div>
      <div id="assignments-${escapeHtml(dateStr)}"></div>
    `;

    card.querySelector("button")?.addEventListener("click", () => openDay(dateStr, day));
    boardEl.appendChild(card);
    renderAssignments(dateStr);
  });
}

function openDay(dateStr, day) {
  currentDay = dateStr;
  selectedClient = null;
  if (clientSearch) clientSearch.value = "";
  if (clientSuggestions) clientSuggestions.innerHTML = "";
  if (modalTitle) modalTitle.textContent = `${day} • ${dateStr}`;
  renderModalAssignments();
  modal?.classList.add("open");
}

function closeModal() {
  modal?.classList.remove("open");
}

function groupedByEmployee(rows) {
  const map = {};
  rows.forEach(r => {
    const key = r.employeeId || r.employeeName || "Unassigned";
    if (!map[key]) map[key] = { employeeName: r.employeeName || key, items: [] };
    map[key].items.push(r);
  });
  return map;
}

function renderAssignments(dateStr) {
  const container = document.getElementById(`assignments-${dateStr}`);
  if (!container) return;

  const rows = assignments.filter(x => x.serviceDate === dateStr && String(x.active || "YES").toUpperCase() !== "NO");

  if (!rows.length) {
    container.innerHTML = `<div style="opacity:.65;font-size:13px;">No assignments yet.</div>`;
    return;
  }

  const grouped = groupedByEmployee(rows);
  container.innerHTML = Object.keys(grouped).map(key => {
    const group = grouped[key];
    return `
      <div class="assignment">
        <strong>${escapeHtml(group.employeeName)}</strong>
        ${group.items.map(item => `
          <div class="assignment-client">
            <span>• ${escapeHtml(item.clientName)}</span>
          </div>
        `).join("")}
      </div>
    `;
  }).join("");
}

function renderModalAssignments() {
  if (!assignmentList) return;

  const rows = assignments
    .map((row, realIndex) => ({ row, realIndex }))
    .filter(x => x.row.serviceDate === currentDay && String(x.row.active || "YES").toUpperCase() !== "NO");

  if (!rows.length) {
    assignmentList.innerHTML = `<div style="opacity:.7;margin-top:12px;">No assignments for this day yet.</div>`;
    return;
  }

  assignmentList.innerHTML = rows.map(x => `
    <div class="assignment">
      <strong>${escapeHtml(x.row.employeeName)}</strong>
      ${escapeHtml(x.row.clientName)}
      ${x.row.address ? `<div class="assignment-address">${escapeHtml(x.row.address)}</div>` : ""}
      <button class="button button-secondary" type="button" data-remove-index="${x.realIndex}">Remove</button>
    </div>
  `).join("");

  assignmentList.querySelectorAll("[data-remove-index]").forEach(btn => {
    btn.addEventListener("click", () => {
      const index = Number(btn.dataset.removeIndex);
      assignments.splice(index, 1);
      renderModalAssignments();
      renderAssignments(currentDay);
    });
  });
}

function handleClientSearch() {
  if (!clientSuggestions || !clientSearch) return;

  const q = clientSearch.value.trim().toLowerCase();
  selectedClient = null;
  clientSuggestions.innerHTML = "";
  if (!q) return;

  const matches = clients
    .filter(x => String(x.clientName || "").toLowerCase().includes(q))
    .slice(0, 8);

  if (!matches.length) {
    clientSuggestions.innerHTML = `<div style="opacity:.7;margin-top:8px;">No matching clients.</div>`;
    return;
  }

  matches.forEach(client => {
    const div = document.createElement("div");
    div.className = "assignment";
    div.style.cursor = "pointer";
    div.innerHTML = `
      <strong>${escapeHtml(client.clientName)}</strong>
      <div style="opacity:.75;font-size:13px;">${escapeHtml(client.address || "")}</div>
    `;

    div.addEventListener("click", () => {
      selectedClient = client;
      clientSearch.value = client.clientName;
      clientSuggestions.innerHTML = "";
    });

    clientSuggestions.appendChild(div);
  });
}

function getDayNameFromYMD(ymd) {
  const d = new Date(ymd + "T12:00:00");
  return d.toLocaleDateString(undefined, { weekday: "long" });
}

function addAssignment() {
  if (!currentDay) return alert("Choose a day first.");
  if (!selectedClient) return alert("Select a client from the search results.");

  const employeeId = employeeSelect?.value || "";
  const employee = employees.find(x => x.employeeId === employeeId);
  if (!employee) return alert("Select an employee.");

  assignments.push({
    weekStart: currentWeekStart,
    serviceDate: currentDay,
    dayName: getDayNameFromYMD(currentDay),
    employeeId: employee.employeeId,
    employeeName: employee.employeeName,
    clientId: selectedClient.clientId || "",
    clientName: selectedClient.clientName,
    address: selectedClient.address || "",
    notes: "",
    active: "YES"
  });

  selectedClient = null;
  if (clientSearch) clientSearch.value = "";
  if (clientSuggestions) clientSuggestions.innerHTML = "";

  renderModalAssignments();
  renderAssignments(currentDay);
}

async function saveBoard() {
  try {
    btnSaveWeek.disabled = true;
    btnSaveWeek.textContent = "Saving...";

    const res = await jsonp("weekly_board_save", {
      weekStart: currentWeekStart,
      payload: JSON.stringify({ assignments })
    });

    if (!res || !res.ok) throw new Error(res?.error || "weekly_board_save failed");

    alert("Weekly board saved ✅");
    await loadBoard(currentWeekStart);
    buildWeekBoard();
  } catch (err) {
    console.error(err);
    alert(String(err?.message || err));
  } finally {
    btnSaveWeek.disabled = false;
    btnSaveWeek.textContent = "Save Weekly Board";
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
