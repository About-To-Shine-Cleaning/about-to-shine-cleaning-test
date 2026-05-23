// =========================================================
// FILE: /admin/weekly-board/weekly-board.js
// TYPE: .js
// ATS Weekly Assignment Board EDITOR
// Fixed v3004:
// ✅ Uses chunked weekly_board_save backend routes
// ✅ Fixes jobs disappearing after refresh when changing a job
// ✅ Avoids long JSONP URL truncation deleting/saving partial board data
// ✅ Add / Change Employee / Change Job / Remove persist correctly
// ✅ No rowId dependency
// ✅ Live client search / inline employee + job changes
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
let editMode = null;
let isSavingChange = false;

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

  if (id === "E01" || id === "E04") return "full_admin";
  if (id === "E02") return "schedule_payroll";

  if (r === "admin" || r === "full_admin") return "full_admin";
  if (r === "schedule_payroll" || r === "schedule_payr" || r === "scheduler_payroll") return "schedule_payroll";
  if (r === "payroll") return "payroll";
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
  weekLabel.style.color = isError ? "#ffb4b4" : "";
}

function jsonp(action, paramsObj = {}) {
  return new Promise((resolve, reject) => {
    const token = getToken();
    const device = getDeviceKey();

    if (!token) {
      reject(new Error("Missing admin token. Open this from the Home page first."));
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

function getDayNameFromYMD(ymd) {
  const d = new Date(ymd + "T12:00:00");
  return d.toLocaleDateString(undefined, { weekday: "long" });
}

function getEmployeeById(employeeId) {
  return employees.find(x => String(x.employeeId || "").trim().toUpperCase() === String(employeeId || "").trim().toUpperCase());
}

function clearClientSelection() {
  selectedClient = null;
  if (clientSearch) clientSearch.value = "";
  if (clientSuggestions) clientSuggestions.innerHTML = "";
}

function getActiveRowsForCurrentDay() {
  return assignments
    .map((row, realIndex) => ({ row, realIndex }))
    .filter(x => x.row.serviceDate === currentDay && String(x.row.active || "YES").toUpperCase() !== "NO");
}

function rowPayload(row, index = 0) {
  const serviceDate = row.serviceDate || currentDay;
  return {
    weekStart: row.weekStart || currentWeekStart,
    serviceDate: serviceDate,
    dayName: row.dayName || getDayNameFromYMD(serviceDate),
    employeeId: row.employeeId || "",
    employeeName: row.employeeName || "",
    clientId: row.clientId || "",
    clientName: row.clientName || "",
    address: row.address || "",
    notes: row.notes || "",
    sortOrder: row.sortOrder || index + 1,
    active: row.active || "YES"
  };
}

function makeSaveId() {
  return "wbs_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2);
}

function splitIntoChunks(text, size) {
  const out = [];
  const s = String(text || "");
  for (let i = 0; i < s.length; i += size) out.push(s.slice(i, i + size));
  return out;
}

async function persistAssignments() {
  const payload = {
    assignments: assignments
      .filter(row => String(row.active || "YES").toUpperCase() !== "NO")
      .map((row, index) => rowPayload(row, index))
      .filter(row => row.weekStart && row.serviceDate && row.employeeId && row.employeeName && row.clientName)
  };

  const raw = JSON.stringify(payload);
  const saveId = makeSaveId();
  const chunks = splitIntoChunks(raw, 1100);

  const startRes = await jsonp("weekly_board_save_start", {
    weekStart: currentWeekStart,
    saveId
  });
  if (!startRes || !startRes.ok) throw new Error(startRes?.error || "weekly_board_save_start failed");

  for (let i = 0; i < chunks.length; i++) {
    const chunkRes = await jsonp("weekly_board_save_chunk", {
      weekStart: currentWeekStart,
      saveId,
      index: String(i),
      chunk: chunks[i]
    });
    if (!chunkRes || !chunkRes.ok) throw new Error(chunkRes?.error || "weekly_board_save_chunk failed");
  }

  const finishRes = await jsonp("weekly_board_save_finish", {
    weekStart: currentWeekStart,
    saveId,
    totalChunks: String(chunks.length)
  });

  if (!finishRes || !finishRes.ok) throw new Error(finishRes?.error || "weekly_board_save_finish failed");
  return finishRes;
}

function setBusy(message) {
  isSavingChange = true;
  if (btnAddAssignment) btnAddAssignment.disabled = true;
  if (btnSaveWeek) {
    btnSaveWeek.disabled = true;
    btnSaveWeek.textContent = message || "Working...";
  }
}

function clearBusy() {
  isSavingChange = false;
  if (btnAddAssignment) btnAddAssignment.disabled = false;
  if (btnSaveWeek) {
    btnSaveWeek.disabled = false;
    btnSaveWeek.textContent = "Refresh Board";
  }
}

async function refreshBoard() {
  try {
    setBusy("Refreshing...");
    await loadBoard(currentWeekStart);
    buildWeekBoard();
    if (currentDay) renderModalAssignments();
  } catch (err) {
    console.error(err);
    alert(String(err?.message || err));
  } finally {
    clearBusy();
  }
}

async function init() {
  try {
    if (btnSaveWeek) btnSaveWeek.textContent = "Refresh Board";

    const authRes = await jsonp("auth");
    if (!authRes || !authRes.ok) throw new Error(authRes?.error || "Not authorized");
    auth = authRes;

    try { sessionStorage.setItem(AUTH_STORAGE, JSON.stringify(authRes)); } catch (e) {}
    window.dispatchEvent(new Event("ats-auth-ready"));

    if (!canEditWeeklyBoard(auth)) {
      setMessage("Weekly Board editor is not available for this role.", true);
      if (boardEl) {
        boardEl.innerHTML = `<div class="assignment" style="grid-column:1/-1;">This page is for office/admin editing only. Your read-only weekly board is on My Weekly Board.</div>`;
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
    btnSaveWeek?.addEventListener("click", refreshBoard);

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
  editMode = null;
  clearClientSelection();
  if (modalTitle) modalTitle.textContent = `${day} • ${dateStr}`;
  renderModalAssignments();
  modal?.classList.add("open");
}

function closeModal() {
  editMode = null;
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
          <div class="assignment-client"><span>• ${escapeHtml(item.clientName)}</span></div>
        `).join("")}
      </div>
    `;
  }).join("");
}

function renderEmployeeEditPanel(row, realIndex) {
  const options = employees.map(emp => `
    <option value="${escapeHtml(emp.employeeId)}" ${String(emp.employeeId) === String(row.employeeId) ? "selected" : ""}>
      ${escapeHtml(emp.employeeId)} • ${escapeHtml(emp.employeeName)}
    </option>
  `).join("");

  return `
    <div class="assignment" style="margin-top:14px;background:rgba(255,255,255,.06);">
      <strong>Choose new employee</strong>
      <select data-employee-picker-index="${realIndex}" style="width:100%;margin-top:10px;padding:12px;border-radius:12px;">
        ${options}
      </select>
      <div class="assignment-actions">
        <button class="button button-secondary" type="button" data-apply-employee-index="${realIndex}">Apply Employee</button>
        <button class="button button-secondary" type="button" data-cancel-edit="1">Cancel</button>
      </div>
    </div>
  `;
}

function renderJobEditPanel(row, realIndex) {
  return `
    <div class="assignment" style="margin-top:14px;background:rgba(255,255,255,.06);">
      <strong>Choose new client/job</strong>
      <input type="text" data-job-search-index="${realIndex}" placeholder="Start typing client name..." autocomplete="off" style="width:100%;margin-top:10px;padding:12px;border-radius:12px;">
      <div data-job-suggestions-index="${realIndex}" style="margin-top:10px;"></div>
      <div class="assignment-actions">
        <button class="button button-secondary" type="button" data-cancel-edit="1">Cancel</button>
      </div>
    </div>
  `;
}

function renderModalAssignments() {
  if (!assignmentList) return;

  const rows = getActiveRowsForCurrentDay();

  if (!rows.length) {
    assignmentList.innerHTML = `<div style="opacity:.7;margin-top:12px;">No assignments for this day yet.</div>`;
    return;
  }

  assignmentList.innerHTML = rows.map(x => {
    const isEmployeeEdit = editMode && editMode.type === "employee" && editMode.index === x.realIndex;
    const isJobEdit = editMode && editMode.type === "job" && editMode.index === x.realIndex;

    return `
      <div class="assignment">
        <strong>${escapeHtml(x.row.employeeName)}</strong>
        <div style="margin-top:8px;font-size:20px;font-weight:800;">${escapeHtml(x.row.clientName)}</div>
        ${x.row.address ? `<div class="assignment-address">${escapeHtml(x.row.address)}</div>` : ""}

        <div class="assignment-actions">
          <button class="button button-secondary" type="button" data-open-employee-edit="${x.realIndex}">Change Employee</button>
          <button class="button button-secondary" type="button" data-open-job-edit="${x.realIndex}">Change Job</button>
          <button class="button button-secondary" type="button" data-remove-index="${x.realIndex}">Remove</button>
        </div>

        ${isEmployeeEdit ? renderEmployeeEditPanel(x.row, x.realIndex) : ""}
        ${isJobEdit ? renderJobEditPanel(x.row, x.realIndex) : ""}
      </div>
    `;
  }).join("");

  wireModalAssignmentButtons();
}

function wireModalAssignmentButtons() {
  assignmentList.querySelectorAll("[data-open-employee-edit]").forEach(btn => {
    btn.addEventListener("click", () => {
      editMode = { type: "employee", index: Number(btn.dataset.openEmployeeEdit) };
      renderModalAssignments();
    });
  });

  assignmentList.querySelectorAll("[data-open-job-edit]").forEach(btn => {
    btn.addEventListener("click", () => {
      editMode = { type: "job", index: Number(btn.dataset.openJobEdit) };
      renderModalAssignments();
      const input = assignmentList.querySelector(`[data-job-search-index="${editMode.index}"]`);
      if (input) input.focus();
    });
  });

  assignmentList.querySelectorAll("[data-cancel-edit]").forEach(btn => {
    btn.addEventListener("click", () => {
      editMode = null;
      renderModalAssignments();
    });
  });

  assignmentList.querySelectorAll("[data-apply-employee-index]").forEach(btn => {
    btn.addEventListener("click", () => {
      const index = Number(btn.dataset.applyEmployeeIndex);
      const picker = assignmentList.querySelector(`[data-employee-picker-index="${index}"]`);
      const newEmployeeId = picker?.value || "";
      applyEmployeeChange(index, newEmployeeId);
    });
  });

  assignmentList.querySelectorAll("[data-job-search-index]").forEach(input => {
    input.addEventListener("input", () => {
      const index = Number(input.dataset.jobSearchIndex);
      renderInlineJobSuggestions(index, input.value);
    });
  });

  assignmentList.querySelectorAll("[data-remove-index]").forEach(btn => {
    btn.addEventListener("click", () => {
      const index = Number(btn.dataset.removeIndex);
      removeAssignment(index);
    });
  });
}

function renderInlineJobSuggestions(index, value) {
  const box = assignmentList.querySelector(`[data-job-suggestions-index="${index}"]`);
  if (!box) return;

  const q = String(value || "").trim().toLowerCase();
  box.innerHTML = "";

  if (!q) return;

  const matches = clients
    .filter(c => String(c.clientName || "").toLowerCase().includes(q))
    .slice(0, 10);

  if (!matches.length) {
    box.innerHTML = `<div style="opacity:.75;">No matching clients.</div>`;
    return;
  }

  matches.forEach(client => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "assignment";
    row.style.display = "block";
    row.style.width = "100%";
    row.style.cursor = "pointer";
    row.style.textAlign = "left";
    row.style.marginBottom = "8px";
    row.innerHTML = `
      <strong>${escapeHtml(client.clientName)}</strong>
      ${client.address ? `<div class="assignment-address">${escapeHtml(client.address)}</div>` : ""}
    `;
    row.addEventListener("click", () => applyJobChange(index, client));
    box.appendChild(row);
  });
}

async function applyEmployeeChange(index, employeeId) {
  if (isSavingChange) return;

  const row = assignments[index];
  if (!row) return alert("Assignment not found.");

  const employee = getEmployeeById(employeeId);
  if (!employee) return alert("Employee not found.");

  const oldAssignments = assignments.map(x => ({ ...x }));

  try {
    setBusy("Saving...");

    row.employeeId = employee.employeeId;
    row.employeeName = employee.employeeName;
    row.weekStart = currentWeekStart;
    row.serviceDate = currentDay;
    row.dayName = getDayNameFromYMD(currentDay);
    row.active = row.active || "YES";

    await persistAssignments();

    editMode = null;
    renderModalAssignments();
    renderAssignments(currentDay);
  } catch (err) {
    assignments = oldAssignments;
    console.error(err);
    alert(String(err?.message || err));
    renderModalAssignments();
    renderAssignments(currentDay);
  } finally {
    clearBusy();
  }
}

async function applyJobChange(index, client) {
  if (isSavingChange) return;

  const row = assignments[index];
  if (!row) return alert("Assignment not found.");
  if (!client) return alert("Client not found.");

  const oldAssignments = assignments.map(x => ({ ...x }));

  try {
    setBusy("Saving...");

    row.clientId = client.clientId || "";
    row.clientName = client.clientName || client.name || "";
    row.address = client.address || "";
    row.weekStart = currentWeekStart;
    row.serviceDate = currentDay;
    row.dayName = getDayNameFromYMD(currentDay);
    row.active = row.active || "YES";

    if (!row.clientName) throw new Error("Selected client is missing a client name.");

    await persistAssignments();

    editMode = null;
    renderModalAssignments();
    renderAssignments(currentDay);
  } catch (err) {
    assignments = oldAssignments;
    console.error(err);
    alert(String(err?.message || err));
    renderModalAssignments();
    renderAssignments(currentDay);
  } finally {
    clearBusy();
  }
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
    const div = document.createElement("button");
    div.type = "button";
    div.className = "assignment";
    div.style.cursor = "pointer";
    div.style.width = "100%";
    div.style.textAlign = "left";
    div.innerHTML = `
      <strong>${escapeHtml(client.clientName)}</strong>
      ${client.address ? `<div class="assignment-address">${escapeHtml(client.address)}</div>` : ""}
    `;

    div.addEventListener("click", () => {
      selectedClient = client;
      clientSearch.value = client.clientName;
      clientSuggestions.innerHTML = "";
    });

    clientSuggestions.appendChild(div);
  });
}

async function addAssignment() {
  if (isSavingChange) return;
  if (!currentDay) return alert("Choose a day first.");
  if (!selectedClient) return alert("Select a client from the search results.");

  const employeeId = employeeSelect?.value || "";
  const employee = getEmployeeById(employeeId);
  if (!employee) return alert("Select an employee.");

  const newRow = {
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
  };

  const oldAssignments = assignments.map(x => ({ ...x }));

  try {
    setBusy("Saving...");
    assignments.push(newRow);
    await persistAssignments();

    clearClientSelection();
    renderModalAssignments();
    renderAssignments(currentDay);
  } catch (err) {
    assignments = oldAssignments;
    console.error(err);
    alert(String(err?.message || err));
    renderModalAssignments();
    renderAssignments(currentDay);
  } finally {
    clearBusy();
  }
}

async function removeAssignment(index) {
  if (isSavingChange) return;

  const row = assignments[index];
  if (!row) return;
  if (!confirm("Remove this assignment?")) return;

  const oldAssignments = assignments.map(x => ({ ...x }));

  try {
    setBusy("Removing...");
    assignments.splice(index, 1);
    await persistAssignments();

    editMode = null;
    renderModalAssignments();
    renderAssignments(currentDay);
  } catch (err) {
    assignments = oldAssignments;
    console.error(err);
    alert(String(err?.message || err));
    renderModalAssignments();
    renderAssignments(currentDay);
  } finally {
    clearBusy();
  }
}

function saveBoard() {
  return refreshBoard();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
