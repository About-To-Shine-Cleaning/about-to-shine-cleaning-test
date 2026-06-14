// =========================================================
// FILE: /admin/weekly-board/weekly-board.js
// TYPE: .js
// ATS Weekly Assignment Board EDITOR
// v3029 Ghost Scheduler + Save All + Mobile Tab Duplicate Fix
// ? Preserves current week navigation
// ? Preserves current board save behavior
// ? Keeps Change Day
// ? Normal jobs no longer display "Full Clean" / "Half Clean"
// ? Only Add-On jobs display Add-On label
// ? Supports Add-On checkbox + typed Add-On Job Name
// ? Adds Misc only to Add-On client picker
// ? Requires notes when Misc is selected
// ? Prevents Add-On from accidentally keeping/creating same employee/client regular cleaning row
// ? Adds Ghost Scheduler side panel using weekly_board_ghost
// ? Adds Save All Changes button for one-click multi-day saving
// ? Ghost assignments stay local until Save All Changes or Update This Day
// ? Fixes duplicate mobile Board / Ghost Scheduler tabs
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
const closeModalBtn = document.getElementById("closeModal");
const btnAddAssignment = document.getElementById("btnAddAssignment");
const btnPrevWeek = document.getElementById("btnPrevWeek");
const btnCurrentWeek = document.getElementById("btnCurrentWeek");
const btnNextWeek = document.getElementById("btnNextWeek");
const weekSourceLabel = document.getElementById("weekSourceLabel");

const isAddOnAssignment = document.getElementById("isAddOnAssignment");
const addOnFields = document.getElementById("addOnFields");
const addOnTypeInput = document.getElementById("addOnTypeInput");
const addOnNotes = document.getElementById("addOnNotes");

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
let dayDirty = false;
let btnUpdateDay = null;
let btnSaveAllChanges = null;
let saveAllBarEl = null;
let allowEmptyCurrentDaySave = false;
let movedDayDates = new Set();
let dirtyDates = new Set();
let ghostScheduler = { ghosts: [], scheduled: [], dueClients: [], ghostCount: 0, scheduledCount: 0, dueCount: 0 };
let ghostPanelEl = null;

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

function removeDuplicateHtmlMobileTabs() {
  document.querySelectorAll(".mobile-editor-tabs").forEach(el => {
    el.remove();
  });
}

function ensureGhostStyles() {
  if (document.getElementById("atsGhostSchedulerStyles")) return;

  const style = document.createElement("style");
  style.id = "atsGhostSchedulerStyles";
  style.textContent = `
    .mobile-editor-tabs{
      display:none !important;
    }
    .ats-mobile-board-tabs{
      display:none;
    }
    .ats-board-with-ghost{
      display:grid;
      grid-template-columns:minmax(0,4fr) minmax(300px,1fr);
      gap:16px;
      align-items:start;
      width:100%;
      margin-top:16px;
    }
    .ats-ghost-panel{
      border:1px solid rgba(255,255,255,.16);
      background:rgba(12,7,28,.74);
      border-radius:18px;
      padding:14px;
      box-shadow:0 16px 40px rgba(0,0,0,.25);
      position:sticky;
      top:86px;
      min-width:0;
    }
    .ats-ghost-title{
      display:flex;
      justify-content:space-between;
      gap:10px;
      align-items:flex-start;
      margin-bottom:10px;
    }
    .ats-ghost-title h3{
      margin:0;
      font-size:18px;
      line-height:1.15;
    }
    .ats-ghost-subtitle{
      font-size:12px;
      opacity:.76;
      margin-top:4px;
      line-height:1.35;
    }
    .ats-ghost-count{
      background:rgba(255,215,0,.16);
      border:1px solid rgba(255,215,0,.42);
      color:#ffe889;
      border-radius:999px;
      padding:5px 9px;
      font-size:12px;
      font-weight:900;
      white-space:nowrap;
    }
    .ats-ghost-list{
      display:flex;
      flex-direction:column;
      gap:10px;
      max-height:calc(100dvh - 250px);
      overflow:auto;
      padding-right:2px;
    }
    .ats-ghost-card{
      border:1px solid rgba(255,255,255,.13);
      background:rgba(255,255,255,.055);
      border-radius:14px;
      padding:11px;
    }
    .ats-ghost-name{
      display:flex;
      align-items:center;
      gap:8px;
      font-weight:950;
      line-height:1.25;
    }
    .ats-frequency-pill,
    .ats-addon-pill{
      display:inline-flex;
      align-items:center;
      justify-content:center;
      min-width:24px;
      min-height:22px;
      padding:2px 7px;
      border-radius:999px;
      font-size:11px;
      line-height:1;
      font-weight:950;
      letter-spacing:.02em;
      border:1px solid rgba(255,215,0,.48);
      background:rgba(255,215,0,.14);
      color:#ffe889;
      flex:0 0 auto;
    }
    .ats-addon-pill{
      min-width:auto;
      border-color:rgba(123,220,255,.55);
      background:rgba(123,220,255,.13);
      color:#bfefff;
    }
    .ats-ghost-meta{
      margin-top:7px;
      font-size:12px;
      opacity:.78;
      line-height:1.35;
    }
    .ats-ghost-controls{
      display:grid;
      grid-template-columns:1fr 1fr;
      gap:8px;
      margin-top:10px;
    }
    .ats-ghost-controls select{
      width:100%;
      min-width:0;
      padding:9px;
      border-radius:10px;
      border:1px solid rgba(255,255,255,.22);
      background:rgba(255,255,255,.95);
      color:#181026;
      font-size:13px;
    }
    .ats-ghost-controls button{
      grid-column:1/-1;
      width:100%;
    }
    .ats-ghost-empty{
      opacity:.75;
      font-size:13px;
      line-height:1.45;
      border:1px dashed rgba(255,255,255,.18);
      border-radius:14px;
      padding:12px;
    }
    .ats-save-all-bar{
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:12px;
      margin:12px 0 0 0;
      padding:12px 14px;
      border:1px solid rgba(255,215,0,.28);
      background:rgba(255,215,0,.08);
      border-radius:16px;
    }
    .ats-save-all-text{
      font-size:13px;
      line-height:1.35;
      opacity:.9;
    }
    .ats-save-all-count{
      font-weight:950;
      color:#ffe889;
    }
    .ats-save-all-bar.is-clean{
      opacity:.72;
      border-color:rgba(255,255,255,.14);
      background:rgba(255,255,255,.045);
    }
    .ats-save-all-bar .button{
      width:min(360px,42%);
      min-width:240px;
    }
    @media (max-width: 1280px){
      .ats-board-with-ghost{
        grid-template-columns:minmax(0,3.5fr) minmax(280px,1fr);
        gap:12px;
      }
      .ats-ghost-panel{
        padding:12px;
      }
    }
    @media (max-width: 980px){
      .ats-mobile-board-tabs{
        display:grid;
        grid-template-columns:1fr 1fr;
        gap:8px;
        margin:14px 0 12px;
        padding:6px;
        border:1px solid rgba(255,255,255,.12);
        background:rgba(255,255,255,.055);
        border-radius:16px;
      }
      .ats-mobile-board-tab{
        width:100%;
        min-height:44px;
        border-radius:12px;
        border:1px solid rgba(255,255,255,.14);
        background:rgba(0,0,0,.26);
        color:rgba(255,255,255,.86);
        font-weight:950;
        cursor:pointer;
      }
      .ats-mobile-board-tab.is-active{
        background:#000;
        color:#ffe600;
        border-color:rgba(255,230,0,.68);
      }
      .ats-board-with-ghost{
        display:block;
        margin-top:12px;
      }
      .ats-board-with-ghost.mobile-show-board .ats-ghost-panel{
        display:none;
      }
      .ats-board-with-ghost.mobile-show-ghost #weekBoard{
        display:none !important;
      }
      .ats-board-with-ghost.mobile-show-ghost .ats-ghost-panel{
        display:block;
      }
      .ats-ghost-panel{
        position:relative;
        top:auto;
        margin:0;
      }
      .ats-ghost-list{
        max-height:none;
      }
      .ats-save-all-bar{
        align-items:stretch;
        flex-direction:column;
        margin-top:12px;
      }
      .ats-save-all-bar .button{
        width:100%;
        min-width:0;
      }
    }
    @media (max-width: 760px){
      .ats-save-all-bar{
        position:sticky;
        top:76px;
        z-index:20;
        box-shadow:0 14px 34px rgba(0,0,0,.36);
        backdrop-filter:blur(10px);
      }
      .ats-ghost-controls{
        grid-template-columns:1fr;
      }
    }
  `;
  document.head.appendChild(style);
}

function normalizeFrequencyBadge(value) {
  const raw = String(value || "").trim().toUpperCase();
  if (!raw || raw === "N" || raw === "NO" || raw === "NONE") return "";
  if (raw === "W" || raw === "WEEKLY") return "W";
  if (raw === "A" || raw.includes("BIWEEKLY A") || raw.includes("BI-WEEKLY A")) return "A";
  if (raw === "B" || raw.includes("BIWEEKLY B") || raw.includes("BI-WEEKLY B")) return "B";
  if (raw === "M1") return "1";
  if (raw === "M2") return "2";
  if (raw === "M3") return "3";
  if (raw === "M4") return "4";
  if (["1", "2", "3", "4"].includes(raw)) return raw;
  if (raw === "TBDM" || raw === "TBD MONTHLY" || raw === "TBD-M") return "TBDM";
  return raw;
}

function frequencyPillHtml(label, isAddOn = false) {
  const text = isAddOn ? "ADD-ON" : normalizeFrequencyBadge(label);
  if (!text) return "";
  return `<span class="${isAddOn ? "ats-addon-pill" : "ats-frequency-pill"}">${escapeHtml(text)}</span>`;
}

function baseClientIdFromJobId(id) {
  return String(id || "")
    .replace(/_(FULL|HALF|JOB)$/i, "")
    .replace(/_\.5$/i, "")
    .trim();
}

function getRowFrequencyBadge(row) {
  if (isAddOnRow(row)) return "ADD-ON";

  const rowBaseId = baseClientIdFromJobId(row?.clientId || "").toLowerCase();
  const rowNameKey = clientKey(row?.clientName || "");

  const match = clients.find(c => {
    const cBaseId = String(c.baseClientId || baseClientIdFromJobId(c.clientId || "") || "").trim().toLowerCase();
    const cNameKey = clientKey(c.baseClientName || c.clientName || c.name || "");
    return (rowBaseId && cBaseId && rowBaseId === cBaseId) || (rowNameKey && cNameKey && rowNameKey === cNameKey);
  });

  return normalizeFrequencyBadge(match?.frequency || row?.frequency || "");
}

function makePillForRow(row) {
  if (isAddOnRow(row)) return frequencyPillHtml("ADD-ON", true);
  return frequencyPillHtml(getRowFrequencyBadge(row), false);
}

function ensureGhostPanel() {
  ensureGhostStyles();
  removeDuplicateHtmlMobileTabs();

  if (ghostPanelEl) return ghostPanelEl;

  ghostPanelEl = document.getElementById("ghostSchedulerPanel");
  if (!ghostPanelEl) {
    ghostPanelEl = document.createElement("aside");
    ghostPanelEl.id = "ghostSchedulerPanel";
    ghostPanelEl.className = "ats-ghost-panel";
  }

  let tabs = document.getElementById("atsMobileBoardTabs");
  let wrap = document.getElementById("atsBoardGhostWrap");

  if (boardEl && boardEl.parentElement && !wrap) {
    tabs = document.createElement("div");
    tabs.id = "atsMobileBoardTabs";
    tabs.className = "ats-mobile-board-tabs";
    tabs.innerHTML = `
      <button class="ats-mobile-board-tab is-active" type="button" data-board-tab="board">Board</button>
      <button class="ats-mobile-board-tab" type="button" data-board-tab="ghost">Ghost Scheduler</button>
    `;

    wrap = document.createElement("div");
    wrap.id = "atsBoardGhostWrap";
    wrap.className = "ats-board-with-ghost mobile-show-board";

    boardEl.parentElement.insertBefore(tabs, boardEl);
    boardEl.parentElement.insertBefore(wrap, boardEl);
    wrap.appendChild(boardEl);
    wrap.appendChild(ghostPanelEl);

    tabs.querySelectorAll("[data-board-tab]").forEach(btn => {
      btn.addEventListener("click", () => {
        const tab = String(btn.dataset.boardTab || "board");
        wrap.classList.toggle("mobile-show-ghost", tab === "ghost");
        wrap.classList.toggle("mobile-show-board", tab !== "ghost");
        tabs.querySelectorAll("[data-board-tab]").forEach(x => x.classList.toggle("is-active", x === btn));
      });
    });
  } else if (boardEl && boardEl.parentElement && !ghostPanelEl.parentElement) {
    boardEl.parentElement.appendChild(ghostPanelEl);
  }

  document.querySelectorAll("#atsMobileBoardTabs").forEach((el, index) => {
    if (index > 0) el.remove();
  });

  return ghostPanelEl;
}

function dateOptionsHtml(selectedDate) {
  return DAYS.map((day, index) => {
    const date = addDaysToYMD(currentWeekStart, index);
    const label = `${day} � ${date}`;
    return `<option value="${escapeHtml(date)}" ${date === selectedDate ? "selected" : ""}>${escapeHtml(label)}</option>`;
  }).join("");
}

function employeeOptionsHtml(selectedEmployeeName) {
  const targetName = String(selectedEmployeeName || "").trim().toLowerCase();
  return employees.map(emp => {
    const selected = targetName && String(emp.employeeName || "").trim().toLowerCase() === targetName ? "selected" : "";
    return `<option value="${escapeHtml(emp.employeeId)}" ${selected}>${escapeHtml(emp.employeeId)} � ${escapeHtml(emp.employeeName)}</option>`;
  }).join("");
}

function findBoardClientForGhost(ghost) {
  ghost = ghost || {};

  const ghostId = String(ghost.clientId || "").trim().toLowerCase();
  const ghostBaseId = String(
    ghost.baseClientId ||
    baseClientIdFromJobId(ghost.clientId || "") ||
    ""
  ).trim().toLowerCase();

  const ghostName = clientKey(ghost.baseClientName || ghost.clientName || "");
  const ghostJobType = normalizeAssignmentType(ghost.jobType || ghost.assignmentType || "");

  const matches = clients.filter(c => {
    const cId = String(c.clientId || "").trim().toLowerCase();
    const cBaseId = String(
      c.baseClientId ||
      baseClientIdFromJobId(c.clientId || "") ||
      ""
    ).trim().toLowerCase();

    const cName = clientKey(c.baseClientName || c.clientName || c.name || "");
    const cJobType = normalizeAssignmentType(c.jobType || "");

    const sameClient =
      (ghostId && cId && ghostId === cId) ||
      (ghostBaseId && cBaseId && ghostBaseId === cBaseId) ||
      (ghostName && cName && ghostName === cName);

    if (!sameClient) return false;

    if (ghostJobType) {
      return cJobType === ghostJobType;
    }

    return true;
  });

  if (matches.length) return matches[0];

  return {
    clientId: ghost.clientId || "",
    clientName: ghost.clientName || "",
    baseClientName: ghost.baseClientName || ghost.clientName || "",
    address: ghost.address || "",
    frequency: ghost.frequency || "",
    jobType: ghostJobType || ""
  };
}


function ghostBaseIdForCard(ghost) {
  ghost = ghost || {};
  return String(
    ghost.baseClientId ||
    baseClientIdFromJobId(ghost.clientId || "") ||
    ghost.clientId ||
    ""
  ).trim();
}

function ghostBaseKeyForCard(ghost) {
  ghost = ghost || {};
  const baseId = ghostBaseIdForCard(ghost).toLowerCase();
  const baseName = clientKey(ghost.baseClientName || ghost.clientName || "");
  return baseId || baseName;
}

function ghostVariantType(ghost) {
  return normalizeAssignmentType(ghost?.jobType || ghost?.assignmentType || "") || "FULL";
}

function boardClientForBaseAndType(baseGhost, jobType) {
  const targetType = normalizeAssignmentType(jobType || "");
  const baseId = ghostBaseIdForCard(baseGhost).toLowerCase();
  const baseName = clientKey(baseGhost?.baseClientName || baseGhost?.clientName || "");

  const matches = clients.filter(c => {
    const cType = normalizeAssignmentType(c.jobType || "");
    if (targetType && cType !== targetType) return false;

    const cBaseId = String(
      c.baseClientId ||
      baseClientIdFromJobId(c.clientId || "") ||
      ""
    ).trim().toLowerCase();

    const cName = clientKey(c.baseClientName || c.clientName || c.name || "");

    return (baseId && cBaseId && baseId === cBaseId) ||
      (baseName && cName && baseName === cName);
  });

  if (matches.length) return matches[0];

  const baseClientId = ghostBaseIdForCard(baseGhost);
  const suffix = targetType === "HALF" ? "_HALF" : (targetType === "JOB" ? "_JOB" : "_FULL");

  return {
    clientId: baseClientId ? `${baseClientId}${suffix}` : (baseGhost?.clientId || ""),
    clientName: baseGhost?.baseClientName || baseGhost?.clientName || "",
    baseClientName: baseGhost?.baseClientName || baseGhost?.clientName || "",
    address: baseGhost?.address || "",
    frequency: baseGhost?.frequency || "",
    jobType: targetType || "FULL"
  };
}

function ghostWithJobType(baseGhost, jobType) {
  baseGhost = baseGhost || {};
  const targetType = normalizeAssignmentType(jobType || "") || "FULL";
  const boardClient = boardClientForBaseAndType(baseGhost, targetType);

  return {
    ...baseGhost,
    clientId: boardClient.clientId || baseGhost.clientId || "",
    clientName: boardClient.baseClientName || baseGhost.baseClientName || baseGhost.clientName || boardClient.clientName || "",
    baseClientId: boardClient.baseClientId || ghostBaseIdForCard(baseGhost),
    baseClientName: boardClient.baseClientName || baseGhost.baseClientName || baseGhost.clientName || "",
    address: boardClient.address || baseGhost.address || "",
    jobType: targetType,
    assignmentType: targetType,
    ghostKey: `${boardClient.clientId || baseGhost.clientId || ""}|${targetType}`
  };
}

function buildGhostCardModels() {
  const ghosts = Array.isArray(ghostScheduler.ghosts) ? ghostScheduler.ghosts : [];
  const groups = new Map();

  ghosts.forEach((ghost, originalIndex) => {
    const key = ghostBaseKeyForCard(ghost) || `ghost_${originalIndex}`;
    const type = ghostVariantType(ghost);

    if (!groups.has(key)) {
      groups.set(key, {
        key,
        ghosts: [],
        variants: {},
        originalIndex,
        mainGhost: ghost,
        hasHalfOption: false
      });
    }

    const group = groups.get(key);
    group.ghosts.push(ghost);
    group.variants[type] = ghost;

    if (type === "HALF") group.hasHalfOption = true;

    const currentMainType = ghostVariantType(group.mainGhost);
    const rank = { FULL: 1, JOB: 2, HALF: 3 };
    if ((rank[type] || 9) < (rank[currentMainType] || 9)) {
      group.mainGhost = ghost;
    }
  });

  return Array.from(groups.values()).map(group => {
    const mainGhost = group.variants.FULL || group.variants.JOB || group.variants.HALF || group.mainGhost || {};
    return {
      ...group,
      mainGhost,
      fullGhost: group.variants.FULL || ghostWithJobType(mainGhost, "FULL"),
      halfGhost: group.variants.HALF || ghostWithJobType(mainGhost, "HALF"),
      assignType: group.variants.FULL ? "FULL" : (group.variants.JOB ? "JOB" : ghostVariantType(mainGhost))
    };
  });
}

function removeGhostGroupFromPanelByCard(card) {
  const groupKey = String(card?.key || ghostBaseKeyForCard(card?.mainGhost || card || "") || "").trim();
  const idsToRemove = new Set((card?.ghosts || [card?.mainGhost || card || {}]).map(g => String(g?.clientId || "").trim().toLowerCase()).filter(Boolean));

  ghostScheduler.ghosts = (ghostScheduler.ghosts || []).filter(item => {
    const itemGroupKey = String(ghostBaseKeyForCard(item) || "").trim();
    const itemId = String(item.clientId || "").trim().toLowerCase();

    if (groupKey && itemGroupKey && groupKey === itemGroupKey) return false;
    if (itemId && idsToRemove.has(itemId)) return false;

    return true;
  });

  ghostScheduler.ghostCount = buildGhostCardModels().length;
}

function renderGhostSchedulerPanel() {
  const panel = ensureGhostPanel();
  if (!panel) return;

  const ghostCards = buildGhostCardModels();
  const count = ghostCards.length;
  const scheduledCount = Number(ghostScheduler.scheduledCount || 0);
  const dueCount = Number(ghostScheduler.dueCount || count + scheduledCount || 0);
  const rotationWeek = ghostScheduler.rotationWeek || "";

  panel.innerHTML = `
    <div class="ats-ghost-title">
      <div>
        <h3>Ghost Scheduler</h3>
        <div class="ats-ghost-subtitle">Due this week but not saved to the board yet.</div>
      </div>
      <div class="ats-ghost-count">${escapeHtml(count)} open</div>
    </div>
    <div class="ats-ghost-subtitle" style="margin-bottom:10px;">
      ${escapeHtml(dueCount)} due • ${escapeHtml(scheduledCount)} scheduled${rotationWeek ? ` • M${escapeHtml(rotationWeek)}` : ""}<br>
      Assign as many as needed, then click Save All Changes.
    </div>
    <div class="ats-ghost-list">
      ${ghostCards.length ? ghostCards.map((card, index) => {
        const ghost = card.mainGhost || {};
        const suggestedDate = ghost.suggestedServiceDate || currentWeekStart;
        const pill = frequencyPillHtml(ghost.frequencyBadge || ghost.frequency || "");
        const preferred = ghost.preferredDay && ghost.suggestedServiceDate
          ? `${ghost.preferredDay} • ${ghost.suggestedServiceDate}`
          : "Needs day picked";
        const availabilityNote = ghost.needsAvailability ? `<div class="ats-ghost-meta">Monthly availability needed later.</div>` : "";
        return `
          <div class="ats-ghost-card" data-ghost-card="${index}">
            <div class="ats-ghost-name">${pill}${escapeHtml(ghost.baseClientName || ghost.clientName || "Unnamed client")}</div>
            <div class="ats-ghost-meta">Suggested: ${escapeHtml(preferred)}</div>
            ${ghost.cleaner ? `<div class="ats-ghost-meta">Usual cleaner: ${escapeHtml(ghost.cleaner)}</div>` : ""}
            ${availabilityNote}
            <label class="ats-ghost-meta" style="display:flex;align-items:center;gap:8px;margin-top:10px;font-weight:900;opacity:.95;">
              <input type="checkbox" data-ghost-second-toggle="${index}">
              Needs 2nd cleaner
            </label>
            <div class="ats-ghost-controls" data-ghost-controls="${index}">
              <select data-ghost-employee="${index}">${employeeOptionsHtml(ghost.cleaner)}</select>
              <select data-ghost-date="${index}">${dateOptionsHtml(suggestedDate)}</select>
              <select data-ghost-second-employee="${index}" style="display:none;">${employeeOptionsHtml("")}</select>
              <button class="button button-secondary" type="button" data-ghost-assign="${index}">Assign</button>
            </div>
          </div>
        `;
      }).join("") : `<div class="ats-ghost-empty">No missing due clients for this week. Anything already saved to Weekly Assignments will not show here.</div>`}
    </div>
  `;

  panel.querySelectorAll("[data-ghost-second-toggle]").forEach(toggle => {
    toggle.addEventListener("change", () => {
      const index = Number(toggle.dataset.ghostSecondToggle);
      const secondSel = panel.querySelector(`[data-ghost-second-employee="${index}"]`);
      const assignBtn = panel.querySelector(`[data-ghost-assign="${index}"]`);
      const isTwoCleaner = !!toggle.checked;

      if (secondSel) secondSel.style.display = isTwoCleaner ? "" : "none";
      if (assignBtn) assignBtn.textContent = isTwoCleaner ? "Assign Both" : "Assign";
    });
  });

  panel.querySelectorAll("[data-ghost-assign]").forEach(btn => {
    btn.addEventListener("click", () => {
      const index = Number(btn.dataset.ghostAssign);
      const empSel = panel.querySelector(`[data-ghost-employee="${index}"]`);
      const dateSel = panel.querySelector(`[data-ghost-date="${index}"]`);
      const secondToggle = panel.querySelector(`[data-ghost-second-toggle="${index}"]`);
      const secondSel = panel.querySelector(`[data-ghost-second-employee="${index}"]`);

      assignGhostToBoard(
        index,
        empSel?.value || "",
        dateSel?.value || "",
        secondToggle?.checked ? (secondSel?.value || "") : ""
      );
    });
  });
}

function removeGhostFromPanelByClient(ghost) {
  const targetGhostKey = String(ghost?.ghostKey || "").trim();
  const targetId = String(ghost?.clientId || "").trim().toLowerCase();
  const targetName = clientKey(ghost?.clientName || "");
  const targetJobType = normalizeAssignmentType(ghost?.jobType || ghost?.assignmentType || "");

  ghostScheduler.ghosts = (ghostScheduler.ghosts || []).filter(item => {
    const itemGhostKey = String(item.ghostKey || "").trim();
    if (targetGhostKey && itemGhostKey && itemGhostKey === targetGhostKey) return false;

    const itemId = String(item.clientId || "").trim().toLowerCase();
    const itemName = clientKey(item.clientName || "");
    const itemJobType = normalizeAssignmentType(item.jobType || item.assignmentType || "");

    if (targetId && itemId && targetId === itemId) return false;
    if (targetName && itemName && targetName === itemName && (!targetJobType || targetJobType === itemJobType)) return false;

    return true;
  });

  ghostScheduler.ghostCount = ghostScheduler.ghosts.length;
}

function makeGhostAssignmentRow(ghost, employee, targetDate, sortOrder) {
  const boardClient = findBoardClientForGhost(ghost);
  const newClientId = boardClient.clientId || ghost.clientId || "";
  const newClientName = boardClient.clientName || boardClient.name || ghost.clientName || "";

  return {
    rowId: "",
    weekStart: currentWeekStart,
    serviceDate: targetDate,
    dayName: getDayNameFromYMD(targetDate),
    employeeId: employee.employeeId,
    employeeName: employee.employeeName,
    clientId: newClientId,
    clientName: newClientName,
    address: boardClient.address || ghost.address || "",
    notes: ghost.notes || "",
    assignmentType: normalizeAssignmentType(ghost.jobType || ghost.assignmentType || boardClient.jobType || ""),
    addOnType: "",
    addOnNotes: "",
    payrollEnteredPay: "",
    payrollEnteredBy: "",
    payrollEnteredAt: "",
    frequency: ghost.frequency || ghost.frequencyBadge || "",
    ghostSource: { ...ghost },
    sortOrder: sortOrder,
    active: "YES"
  };
}

function ghostAssignmentDuplicateExists(targetDate, employee, ghost) {
  const boardClient = findBoardClientForGhost(ghost);
  const newClientName = boardClient.clientName || boardClient.name || ghost.clientName || "";
  const newClientId = boardClient.clientId || ghost.clientId || "";
  const newType = normalizeAssignmentType(ghost.jobType || ghost.assignmentType || boardClient.jobType || "");

  return assignments.some(row => {
    if (String(row.active || "YES").toUpperCase() === "NO") return false;
    return String(row.serviceDate || "") === targetDate
      && String(row.employeeId || "").trim().toUpperCase() === String(employee.employeeId || "").trim().toUpperCase()
      && (
        String(row.clientId || "").trim().toLowerCase() === String(newClientId || "").trim().toLowerCase() ||
        clientKey(row.clientName || "") === clientKey(newClientName || ghost.clientName || "")
      )
      && normalizeAssignmentType(row.assignmentType || row.AssignmentType || "") === newType;
  });
}

function assignGhostToBoard(index, employeeId, serviceDate, secondEmployeeId = "") {
  if (isSavingChange) return;

  const card = buildGhostCardModels()[index];
  if (!card || !card.mainGhost) return alert("Ghost suggestion not found. Reload the week and try again.");

  const mainGhost = ghostWithJobType(card.mainGhost, card.assignType || "FULL");
  const halfGhost = ghostWithJobType(card.halfGhost || card.mainGhost, "HALF");

  const employee = getEmployeeById(employeeId);
  if (!employee) return alert("Choose an employee first.");

  const targetDate = String(serviceDate || mainGhost.suggestedServiceDate || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) return alert("Choose a valid day for this ghost job.");

  const secondEmployee = secondEmployeeId ? getEmployeeById(secondEmployeeId) : null;
  if (secondEmployeeId && !secondEmployee) return alert("Choose a valid second cleaner.");
  if (secondEmployee && String(secondEmployee.employeeId || "").trim().toUpperCase() === String(employee.employeeId || "").trim().toUpperCase()) {
    return alert("Choose a different employee for the 2nd cleaner.");
  }

  if (ghostAssignmentDuplicateExists(targetDate, employee, mainGhost)) {
    return alert("That main cleaner assignment already exists on the selected day.");
  }

  if (secondEmployee && ghostAssignmentDuplicateExists(targetDate, secondEmployee, halfGhost)) {
    return alert("That 2nd cleaner assignment already exists on the selected day.");
  }

  const startSort = getRowsPayloadForDate(targetDate).length + 1;
  const newRows = [
    makeGhostAssignmentRow(mainGhost, employee, targetDate, startSort)
  ];

  if (secondEmployee) {
    newRows.push(makeGhostAssignmentRow(halfGhost, secondEmployee, targetDate, startSort + 1));
  }

  assignments.push(...newRows);
  removeGhostGroupFromPanelByCard(card);
  markDateDirty(targetDate, true);

  if (currentDay === targetDate) {
    dayDirty = true;
    updateDayButtonState();
    renderModalAssignments();
  }

  buildWeekBoard();
  updateSaveAllButtonState();

  const wrap = document.getElementById("atsBoardGhostWrap");
  const tabs = document.getElementById("atsMobileBoardTabs");
  if (wrap && tabs && window.matchMedia && window.matchMedia("(max-width: 980px)").matches) {
    wrap.classList.remove("mobile-show-ghost");
    wrap.classList.add("mobile-show-board");
    tabs.querySelectorAll("[data-board-tab]").forEach(btn => {
      btn.classList.toggle("is-active", String(btn.dataset.boardTab || "") === "board");
    });
  }
}

function clientKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "");
}

function normalizeAssignmentType(value) {
  const raw = String(value || "").trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (raw === "ADDON" || raw === "ADD_ON" || raw === "ADD_ON_JOB") return "ADD_ON";
  if (raw === "HALF" || raw === ".5" || raw === "0.5" || raw === "HALF_CLEAN") return "HALF";
  if (raw === "FULL" || raw === "FULL_CLEAN") return "FULL";
  return "";
}

function isAddOnRow(row) {
  return normalizeAssignmentType(row?.assignmentType || row?.AssignmentType || row?.type || "") === "ADD_ON";
}

function getCurrentAssignmentType() {
  return isAddOnAssignment?.checked ? "ADD_ON" : "";
}

function getMiscAddOnClient() {
  return {
    clientId: "ADDON_MISC",
    clientName: "Misc",
    baseClientName: "Misc",
    name: "Misc",
    address: "",
    isMiscAddOn: true
  };
}

function isMiscAddOnClient(client) {
  if (!client) return false;
  if (client.isMiscAddOn) return true;
  return clientKey(client.baseClientName || client.clientName || client.name || "") === "misc";
}

function getBaseClientKeyFromRow(row) {
  return clientKey(
    row?.baseClientName ||
    row?.clientName ||
    row?.name ||
    ""
  );
}

function getBaseClientKeyFromClient(client) {
  return clientKey(
    client?.baseClientName ||
    client?.clientName ||
    client?.name ||
    ""
  );
}

function removeSameEmployeeBaseCleaningRowForAddOn(employeeId, serviceDate, client) {
  const targetEmployee = String(employeeId || "").trim().toUpperCase();
  const targetClientKey = getBaseClientKeyFromClient(client);

  if (!targetEmployee || !serviceDate || !targetClientKey) return 0;

  let removed = 0;

  assignments = assignments.filter(row => {
    const rowEmployee = String(row.employeeId || "").trim().toUpperCase();
    const rowDate = String(row.serviceDate || "").trim();
    const rowClientKey = getBaseClientKeyFromRow(row);
    const rowActive = String(row.active || "YES").toUpperCase() !== "NO";
    const rowIsAddOn = isAddOnRow(row);

    const shouldRemove =
      rowActive &&
      !rowIsAddOn &&
      rowDate === serviceDate &&
      rowEmployee === targetEmployee &&
      rowClientKey === targetClientKey;

    if (shouldRemove) removed++;
    return !shouldRemove;
  });

  if (removed > 0) {
    allowEmptyCurrentDaySave = true;
  }

  return removed;
}

function syncAddOnFields() {
  const isAddOn = !!isAddOnAssignment?.checked;

  if (addOnFields) addOnFields.classList.toggle("open", isAddOn);
  if (addOnTypeInput) addOnTypeInput.disabled = !isAddOn;
  if (addOnNotes) addOnNotes.disabled = !isAddOn;

  if (!isAddOn) {
    if (addOnTypeInput) addOnTypeInput.value = "";
    if (addOnNotes) addOnNotes.value = "";
  }

  clearClientSelection();
}

function resetAssignmentEntryFields() {
  if (isAddOnAssignment) isAddOnAssignment.checked = false;
  if (addOnTypeInput) addOnTypeInput.value = "";
  if (addOnNotes) addOnNotes.value = "";
  syncAddOnFields();
}

function addOnTypeLabel(value) {
  return String(value || "").trim() || "Add-On";
}

function rowAssignmentMeta(row) {
  if (!isAddOnRow(row)) return "";
  const addOnType = addOnTypeLabel(row.addOnType || row.AddOnType || "");
  return `Add-On � ${addOnType}`;
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

function addDaysToYMD(ymd, days) {
  const d = new Date(ymd + "T12:00:00");
  d.setDate(d.getDate() + Number(days || 0));
  return formatDate(d);
}

function getCurrentWeekStartYMD() {
  return formatDate(getWeekStart());
}

function resetWeekEditState() {
  currentDay = null;
  editMode = null;
  dayDirty = false;
  allowEmptyCurrentDaySave = false;
  movedDayDates.clear();
  dirtyDates.clear();
  modal?.classList.remove("open");
  updateDayButtonState();
  updateSaveAllButtonState();
}

function setWeekSourceLabel(source, count) {
  if (!weekSourceLabel) return;

  const src = String(source || "").toUpperCase();
  if (src === "SAVED") {
    weekSourceLabel.textContent = `Saved assignments loaded � ${count || 0} row(s)`;
  } else {
    weekSourceLabel.textContent = "No saved assignments for this week yet.";
  }
}

async function switchWeek(newWeekStart) {
  if (isSavingChange) return;

  if (dayDirty || dirtyDates.size) {
    const ok = confirm("You have unsaved changes. Switch weeks and lose those changes?");
    if (!ok) return;
  }

  resetWeekEditState();
  currentWeekStart = newWeekStart;

  setMessage("Loading week...", false);

  await loadBoard(currentWeekStart);
  buildWeekBoard();
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

function getClientDisplayName(client, addOnMode) {
  if (!client) return "";
  return addOnMode
    ? String(client.baseClientName || client.clientName || client.name || "").trim()
    : String(client.clientName || client.name || "").trim();
}

function findClientFromInput() {
  const typed = String(clientSearch?.value || "").trim();
  if (!typed) return null;

  const addOnMode = !!isAddOnAssignment?.checked;

  if (addOnMode && clientKey(typed) === "misc") {
    return getMiscAddOnClient();
  }

  if (selectedClient && clientKey(getClientDisplayName(selectedClient, addOnMode)) === clientKey(typed)) {
    return selectedClient;
  }

  const exact = clients.find(c => clientKey(getClientDisplayName(c, addOnMode)) === clientKey(typed));
  if (exact) return exact;

  const contains = clients.filter(c =>
    getClientDisplayName(c, addOnMode).toLowerCase().includes(typed.toLowerCase())
  );

  if (contains.length === 1) return contains[0];

  return null;
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
  const assignmentType = normalizeAssignmentType(row.assignmentType || row.AssignmentType || row.type || "");

  return {
    rowId: row.rowId || "",
    weekStart: row.weekStart || currentWeekStart,
    serviceDate: serviceDate,
    dayName: row.dayName || getDayNameFromYMD(serviceDate),
    employeeId: row.employeeId || "",
    employeeName: row.employeeName || "",
    clientId: row.clientId || "",
    clientName: row.clientName || "",
    address: row.address || "",
    notes: row.notes || "",
    assignmentType: assignmentType,
    addOnType: row.addOnType || row.AddOnType || "",
    addOnNotes: row.addOnNotes || row.AddOnNotes || "",
    payrollEnteredPay: row.payrollEnteredPay || row.PayrollEnteredPay || "",
    payrollEnteredBy: row.payrollEnteredBy || row.PayrollEnteredBy || "",
    payrollEnteredAt: row.payrollEnteredAt || row.PayrollEnteredAt || "",
    sortOrder: row.sortOrder || index + 1,
    active: row.active || "YES"
  };
}

function getRowsPayloadForDate(serviceDate) {
  return assignments
    .filter(row => row.serviceDate === serviceDate && String(row.active || "YES").toUpperCase() !== "NO")
    .map((row, index) => {
      const payload = rowPayload(row, index);
      payload.serviceDate = serviceDate;
      payload.dayName = getDayNameFromYMD(serviceDate);
      payload.sortOrder = index + 1;

      if (payload.employeeId && !payload.employeeName) {
        const emp = getEmployeeById(payload.employeeId);
        if (emp) payload.employeeName = emp.employeeName || "";
      }

      if (payload.clientName) {
        const match = clients.find(c => clientKey(c.clientName) === clientKey(payload.clientName));
        if (match) {
          if (!payload.clientId) payload.clientId = match.clientId || "";
          if (!payload.address) payload.address = match.address || "";
        }
      }

      payload.assignmentType = normalizeAssignmentType(payload.assignmentType);

      if (payload.assignmentType !== "ADD_ON") {
        payload.addOnType = "";
        payload.addOnNotes = "";
      } else {
        payload.addOnType = addOnTypeLabel(payload.addOnType);
      }

      return payload;
    })
    .filter(row => row.weekStart && row.serviceDate && row.employeeId && row.employeeName && row.clientName);
}

function getCurrentDayRowsPayload() {
  return getRowsPayloadForDate(currentDay);
}

function ensureSaveAllButton() {
  if (btnSaveAllChanges) return btnSaveAllChanges;

  saveAllBarEl = document.createElement("div");
  saveAllBarEl.id = "atsSaveAllBar";
  saveAllBarEl.className = "ats-save-all-bar is-clean";
  saveAllBarEl.innerHTML = `
    <div class="ats-save-all-text">
      <div><strong>Scheduling changes</strong></div>
      <div><span class="ats-save-all-count" id="atsSaveAllCount">0</span> changed day(s) ready to save.</div>
    </div>
    <button class="button" id="btnSaveAllChanges" type="button" disabled>Save All Changes</button>
  `;

  btnSaveAllChanges = saveAllBarEl.querySelector("#btnSaveAllChanges");
  btnSaveAllChanges?.addEventListener("click", saveAllChangedDays);

  const target = document.getElementById("atsBoardGhostWrap") || boardEl;
  if (weekSourceLabel && weekSourceLabel.parentNode) {
    weekSourceLabel.parentNode.insertBefore(saveAllBarEl, weekSourceLabel.nextSibling);
  } else if (target && target.parentNode) {
    target.parentNode.insertBefore(saveAllBarEl, target);
  } else if (document.body) {
    document.body.appendChild(saveAllBarEl);
  }

  updateSaveAllButtonState();
  return btnSaveAllChanges;
}

function getDirtyDatesArray() {
  return Array.from(dirtyDates || [])
    .filter(Boolean)
    .sort();
}

function markDateDirty(serviceDate, isDirty = true) {
  const date = String(serviceDate || "").trim();
  if (!date) return;

  if (isDirty) dirtyDates.add(date);
  else dirtyDates.delete(date);

  updateSaveAllButtonState();
}

function updateSaveAllButtonState() {
  const dates = getDirtyDatesArray();
  const count = dates.length;

  if (btnSaveAllChanges) {
    btnSaveAllChanges.disabled = isSavingChange || count === 0;
    btnSaveAllChanges.textContent = count
      ? `Save All Changes (${count})`
      : "Save All Changes";
  }

  if (saveAllBarEl) {
    saveAllBarEl.classList.toggle("is-clean", count === 0);
    const countEl = saveAllBarEl.querySelector("#atsSaveAllCount");
    if (countEl) countEl.textContent = String(count);
  }
}

function getAllRowsPayloadForWeek() {
  const weekDates = new Set(DAYS.map((day, index) => addDaysToYMD(currentWeekStart, index)));

  return assignments
    .filter(row => weekDates.has(String(row.serviceDate || "").trim()))
    .filter(row => String(row.active || "YES").toUpperCase() !== "NO")
    .map((row, index) => {
      const serviceDate = String(row.serviceDate || "").trim();
      const payload = rowPayload(row, index);

      payload.weekStart = currentWeekStart;
      payload.serviceDate = serviceDate;
      payload.dayName = getDayNameFromYMD(serviceDate);
      payload.sortOrder = payload.sortOrder || index + 1;

      if (payload.employeeId && !payload.employeeName) {
        const emp = getEmployeeById(payload.employeeId);
        if (emp) payload.employeeName = emp.employeeName || "";
      }

      if (payload.clientName) {
        const match = clients.find(c => clientKey(c.clientName) === clientKey(payload.clientName));
        if (match) {
          if (!payload.clientId) payload.clientId = match.clientId || "";
          if (!payload.address) payload.address = match.address || "";
        }
      }

      payload.assignmentType = normalizeAssignmentType(payload.assignmentType);

      if (payload.assignmentType !== "ADD_ON") {
        payload.addOnType = "";
        payload.addOnNotes = "";
        payload.payrollEnteredPay = "";
        payload.payrollEnteredBy = "";
        payload.payrollEnteredAt = "";
      } else {
        payload.addOnType = addOnTypeLabel(payload.addOnType);
      }

      return payload;
    })
    .filter(row => row.weekStart && row.serviceDate && row.employeeId && row.employeeName && row.clientName)
    .sort((a, b) => {
      return String(a.serviceDate || "").localeCompare(String(b.serviceDate || "")) ||
        Number(a.sortOrder || 9999) - Number(b.sortOrder || 9999) ||
        String(a.employeeName || "").localeCompare(String(b.employeeName || "")) ||
        String(a.clientName || "").localeCompare(String(b.clientName || ""));
    });
}

function makeWeeklyBoardSaveId() {
  return "wb_save_" +
    String(currentWeekStart || "week").replace(/[^0-9A-Za-z_-]+/g, "_") + "_" +
    Date.now().toString(36) + "_" +
    Math.random().toString(36).slice(2, 10);
}

function splitTextIntoChunks(text, chunkSize) {
  const raw = String(text || "");
  const size = Math.max(500, Number(chunkSize || 7000));
  const chunks = [];

  for (let i = 0; i < raw.length; i += size) {
    chunks.push(raw.slice(i, i + size));
  }

  return chunks.length ? chunks : [""];
}

async function saveWeeklyBoardBatchPayload(payload) {
  const saveId = makeWeeklyBoardSaveId();
  const rawPayload = JSON.stringify(payload || { assignments: [] });
  const chunks = splitTextIntoChunks(rawPayload, 1200);

  const startRes = await jsonp("weekly_board_save_start", {
    weekStart: currentWeekStart,
    saveId: saveId
  });

  if (!startRes || !startRes.ok) throw new Error(startRes?.error || "weekly_board_save_start failed");
  console.log("Weekly board Save All batch start result:", startRes);

  for (let i = 0; i < chunks.length; i++) {
    const chunkRes = await jsonp("weekly_board_save_chunk", {
      weekStart: currentWeekStart,
      saveId: saveId,
      index: String(i),
      chunk: chunks[i]
    });

    if (!chunkRes || !chunkRes.ok) throw new Error(chunkRes?.error || `weekly_board_save_chunk failed at chunk ${i + 1}`);
    console.log("Weekly board Save All batch chunk result:", chunkRes);
  }

  const finishRes = await jsonp("weekly_board_save_finish", {
    weekStart: currentWeekStart,
    saveId: saveId,
    totalChunks: String(chunks.length)
  });

  if (!finishRes || !finishRes.ok) throw new Error(finishRes?.error || "weekly_board_save_finish failed");
  console.log("Weekly board Save All batch finish result:", finishRes);

  return finishRes;
}

async function saveAllChangedDays() {
  if (isSavingChange) return;

  const datesToSave = getDirtyDatesArray();
  if (!datesToSave.length) return alert("No unsaved scheduling changes.");

  if (!confirm(`Save changes for ${datesToSave.length} day(s)?`)) return;

  try {
    setBusy("Saving all changes...");

    const rows = getAllRowsPayloadForWeek();
    const payload = {
      weekStart: currentWeekStart,
      changedDates: datesToSave.slice(),
      assignments: rows
    };

    const savedByDate = new Map();

for (const serviceDate of datesToSave) {
  const result = await saveOneBoardDay(serviceDate, true);
  savedByDate.set(serviceDate, result.rows.slice());
  console.log("Weekly board Save All result:", result.res);
}

    try {
      await loadBoard(currentWeekStart);
    } catch (reloadErr) {
      console.warn("weekly_board_get reload failed after Save All batch; keeping local rows", reloadErr);
      assignments = rows.slice();
    }

    datesToSave.forEach(date => dirtyDates.delete(date));
    movedDayDates.clear();
    allowEmptyCurrentDaySave = false;
    dayDirty = false;

    updateDayButtonState();
    updateSaveAllButtonState();
    buildWeekBoard();
    if (currentDay) renderModalAssignments();

    alert("All scheduling changes saved.");
  } catch (err) {
    console.error(err);
    alert(String(err?.message || err));
  } finally {
    clearBusy();
  }
}

function ensureUpdateDayButton() {
  if (btnUpdateDay) return btnUpdateDay;

  btnUpdateDay = document.createElement("button");
  btnUpdateDay.id = "btnUpdateDay";
  btnUpdateDay.type = "button";
  btnUpdateDay.className = "button";
  btnUpdateDay.textContent = "Day Saved ?";
  btnUpdateDay.style.marginTop = "12px";
  btnUpdateDay.addEventListener("click", saveCurrentDay);

  if (assignmentList && assignmentList.parentNode) {
    assignmentList.parentNode.insertBefore(btnUpdateDay, assignmentList);
  }

  updateDayButtonState();
  return btnUpdateDay;
}

function markDayDirty(isDirty = true) {
  dayDirty = !!isDirty;
  if (currentDay) markDateDirty(currentDay, isDirty);
  updateDayButtonState();
  updateSaveAllButtonState();
}

function updateDayButtonState() {
  if (!btnUpdateDay) return;
  btnUpdateDay.disabled = isSavingChange || !dayDirty;
  btnUpdateDay.textContent = dayDirty ? "Update This Day" : "Day Saved ?";
  btnUpdateDay.style.opacity = dayDirty ? "1" : ".55";
}

function setBusy(message) {
  isSavingChange = true;
  if (btnAddAssignment) btnAddAssignment.disabled = true;
  if (btnSaveAllChanges) btnSaveAllChanges.disabled = true;
  if (btnUpdateDay) {
    btnUpdateDay.disabled = true;
    btnUpdateDay.textContent = message || "Working...";
  }
  updateSaveAllButtonState();
}

function clearBusy() {
  isSavingChange = false;
  if (btnAddAssignment) btnAddAssignment.disabled = false;
  updateDayButtonState();
  updateSaveAllButtonState();
}

async function saveOneBoardDay(serviceDate, allowEmptyDay) {
  const rows = getRowsPayloadForDate(serviceDate);
  const payload = {
    serviceDate: serviceDate,
    assignments: rows
  };

  const res = await jsonp("weekly_board_save_day", {
    weekStart: currentWeekStart,
    serviceDate: serviceDate,
    expectedCount: String(rows.length),
    allowEmptyDay: rows.length === 0 && allowEmptyDay ? "YES" : "NO",
    payload: JSON.stringify(payload)
  });

  if (!res || !res.ok) throw new Error(res?.error || "weekly_board_save_day failed");
  return { serviceDate, rows, res };
}

async function saveCurrentDay() {
  if (isSavingChange) return;
  if (!currentDay) return alert("Choose a day first.");

  const datesToSave = Array.from(new Set([currentDay, ...Array.from(movedDayDates || [])]))
    .filter(Boolean)
    .sort();

  const currentRowsBeforeSave = getCurrentDayRowsPayload();
  const hasMoveSave = datesToSave.length > 1 || movedDayDates.has(currentDay);

  if (!currentRowsBeforeSave.length && !allowEmptyCurrentDaySave && !hasMoveSave) {
    return alert("No assignments were added. Pick a client from the search results, click Add Assignment, then click Update This Day.");
  }

  try {
    setBusy("Updating day...");

    const savedByDate = new Map();

    for (const serviceDate of datesToSave) {
      const allowEmpty = serviceDate === currentDay
        ? (allowEmptyCurrentDaySave || hasMoveSave)
        : true;

      const result = await saveOneBoardDay(serviceDate, allowEmpty);
      savedByDate.set(serviceDate, result.rows.slice());
      console.log("Weekly board day save result:", result.res);
    }

    try {
      await loadBoard(currentWeekStart);

      savedByDate.forEach((localRows, serviceDate) => {
        const stillHasDate = assignments.some(row => row.serviceDate === serviceDate && String(row.active || "YES").toUpperCase() !== "NO");
        if (localRows.length && !stillHasDate) {
          assignments = assignments.filter(row => row.serviceDate !== serviceDate).concat(localRows);
        }
      });
    } catch (reloadErr) {
      console.warn("weekly_board_get reload failed after save; keeping local rows", reloadErr);
      savedByDate.forEach((localRows, serviceDate) => {
        assignments = assignments.filter(row => row.serviceDate !== serviceDate).concat(localRows);
      });
    }

    allowEmptyCurrentDaySave = false;
    datesToSave.forEach(date => dirtyDates.delete(date));
    movedDayDates.clear();
    dayDirty = false;
    updateDayButtonState();
    updateSaveAllButtonState();
    buildWeekBoard();
    renderModalAssignments();
  } catch (err) {
    console.error(err);
    alert(String(err?.message || err));
  } finally {
    clearBusy();
  }
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
        boardEl.innerHTML = `<div class="assignment" style="grid-column:1/-1;">This page is for office/admin editing only. Your read-only weekly board is on My Weekly Board.</div>`;
      }
      return;
    }

    currentWeekStart = getCurrentWeekStartYMD();

    await Promise.all([
      loadEmployees(),
      loadClients(),
      loadBoard(currentWeekStart)
    ]);

    buildWeekBoard();
    ensureSaveAllButton();
    ensureUpdateDayButton();

    btnPrevWeek?.addEventListener("click", () => {
      switchWeek(addDaysToYMD(currentWeekStart, -7));
    });

    btnCurrentWeek?.addEventListener("click", () => {
      switchWeek(getCurrentWeekStartYMD());
    });

    btnNextWeek?.addEventListener("click", () => {
      switchWeek(addDaysToYMD(currentWeekStart, 7));
    });

    closeModalBtn?.addEventListener("click", closeModal);
    btnAddAssignment?.addEventListener("click", addAssignment);
    isAddOnAssignment?.addEventListener("change", syncAddOnFields);
    syncAddOnFields();

    clientSearch?.addEventListener("input", handleClientSearch);
    clientSearch?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        addAssignment();
      }
    });

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
      <option value="${escapeHtml(emp.employeeId)}">${escapeHtml(emp.employeeId)} � ${escapeHtml(emp.employeeName)}</option>
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

  setWeekSourceLabel(data.source || (assignments.length ? "SAVED" : "EMPTY"), assignments.length);

  try {
    const ghostData = await jsonp("weekly_board_ghost", { weekStart });
    if (ghostData && ghostData.ok) {
      ghostScheduler = {
        ghosts: Array.isArray(ghostData.ghosts) ? ghostData.ghosts : [],
        scheduled: Array.isArray(ghostData.scheduled) ? ghostData.scheduled : [],
        dueClients: Array.isArray(ghostData.dueClients) ? ghostData.dueClients : [],
        ghostCount: Number(ghostData.ghostCount || 0),
        scheduledCount: Number(ghostData.scheduledCount || 0),
        dueCount: Number(ghostData.dueCount || 0),
        rotationWeek: ghostData.rotationWeek || ""
      };
    } else {
      console.warn("weekly_board_ghost failed", ghostData);
      ghostScheduler = { ghosts: [], scheduled: [], dueClients: [], ghostCount: 0, scheduledCount: 0, dueCount: 0 };
    }
  } catch (ghostErr) {
    console.warn("weekly_board_ghost unavailable", ghostErr);
    ghostScheduler = { ghosts: [], scheduled: [], dueClients: [], ghostCount: 0, scheduledCount: 0, dueCount: 0 };
  }
}

function buildWeekBoard() {
  if (!boardEl) return;
  boardEl.innerHTML = "";

  const start = new Date(currentWeekStart + "T12:00:00");
  const end = new Date(start);
  end.setDate(end.getDate() + 6);

  if (weekLabel) weekLabel.textContent = `Week of ${prettyDate(currentWeekStart)} ? ${prettyDate(formatDate(end))}`;

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

  renderGhostSchedulerPanel();
  ensureSaveAllButton();
  updateSaveAllButtonState();
}

function openDay(dateStr, day) {
  if ((dayDirty || dirtyDates.size) && currentDay && currentDay !== dateStr) {
    if (!confirm("You have unsaved changes for this day. Switch days and lose those changes?")) return;
    movedDayDates.clear();
    markDayDirty(false);
  }

  currentDay = dateStr;
  editMode = null;
  allowEmptyCurrentDaySave = false;
  movedDayDates.clear();
  clearClientSelection();
  resetAssignmentEntryFields();
  ensureUpdateDayButton();
  markDayDirty(false);
  if (modalTitle) modalTitle.textContent = `${day} � ${dateStr}`;
  renderModalAssignments();
  modal?.classList.add("open");
}

function closeModal() {
  if (dayDirty && !confirm("You have unsaved changes for this day. Close without updating this day?")) return;
  editMode = null;
  movedDayDates.clear();
  markDayDirty(false);
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
        ${group.items.map(item => {
          const meta = rowAssignmentMeta(item);
          return `
            <div class="assignment-client">
              <span>? ${makePillForRow(item)} ${escapeHtml(item.clientName)}</span>
              ${meta ? `<span class="assignment-meta">${escapeHtml(meta)}</span>` : ""}
              ${isAddOnRow(item) && (item.addOnNotes || item.AddOnNotes)
                ? `<span class="assignment-notes">${escapeHtml(item.addOnNotes || item.AddOnNotes)}</span>`
                : ""}
            </div>
          `;
        }).join("")}
      </div>
    `;
  }).join("");
}

function renderEmployeeEditPanel(row, realIndex) {
  const options = employees.map(emp => `
    <option value="${escapeHtml(emp.employeeId)}" ${String(emp.employeeId) === String(row.employeeId) ? "selected" : ""}>
      ${escapeHtml(emp.employeeId)} � ${escapeHtml(emp.employeeName)}
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

function renderDayEditPanel(row, realIndex) {
  const employeeLabel = `${row.employeeId || ""}${row.employeeName ? " � " + row.employeeName : ""}`.trim();
  const currentDate = row.serviceDate || currentDay;
  const meta = rowAssignmentMeta(row);

  return `
    <div class="assignment" style="margin-top:14px;background:rgba(255,255,255,.06);">
      <strong>Choose new day</strong>
      <div style="margin-top:10px;font-size:14px;line-height:1.5;opacity:.92;">
        <div><strong>Employee:</strong> ${escapeHtml(employeeLabel || "Unassigned")}</div>
        <div><strong>Client/Job:</strong> ${escapeHtml(row.clientName || "")}</div>
        ${meta ? `<div><strong>Type:</strong> ${escapeHtml(meta)}</div>` : ""}
      </div>
      <input type="date" data-day-picker-index="${realIndex}" value="${escapeHtml(currentDate)}" style="width:100%;margin-top:10px;padding:12px;border-radius:12px;">
      <div style="margin-top:8px;font-size:13px;opacity:.72;">
        This moves the assignment locally. Click Update This Day to save the old day and the new day.
      </div>
      <div class="assignment-actions">
        <button class="button button-secondary" type="button" data-apply-day-index="${realIndex}">Apply Day</button>
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
    const isDayEdit = editMode && editMode.type === "day" && editMode.index === x.realIndex;
    const meta = rowAssignmentMeta(x.row);

    return `
      <div class="assignment">
        <strong>${escapeHtml(x.row.employeeName)}</strong>
        <div style="margin-top:8px;font-size:20px;font-weight:800;">${makePillForRow(x.row)} ${escapeHtml(x.row.clientName)}</div>
        ${meta ? `<div class="assignment-meta">${escapeHtml(meta)}</div>` : ""}
        ${isAddOnRow(x.row) && (x.row.addOnNotes || x.row.AddOnNotes)
          ? `<div class="assignment-notes">${escapeHtml(x.row.addOnNotes || x.row.AddOnNotes)}</div>`
          : ""}
        ${x.row.address ? `<div class="assignment-address">${escapeHtml(x.row.address)}</div>` : ""}

        <div class="assignment-actions">
          <button class="button button-secondary" type="button" data-open-employee-edit="${x.realIndex}">Change Employee</button>
          <button class="button button-secondary" type="button" data-open-job-edit="${x.realIndex}">Change Job</button>
          <button class="button button-secondary" type="button" data-open-day-edit="${x.realIndex}">Change Day</button>
          <button class="button button-secondary" type="button" data-remove-index="${x.realIndex}">Remove</button>
        </div>

        ${isEmployeeEdit ? renderEmployeeEditPanel(x.row, x.realIndex) : ""}
        ${isJobEdit ? renderJobEditPanel(x.row, x.realIndex) : ""}
        ${isDayEdit ? renderDayEditPanel(x.row, x.realIndex) : ""}
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

  assignmentList.querySelectorAll("[data-open-day-edit]").forEach(btn => {
    btn.addEventListener("click", () => {
      editMode = { type: "day", index: Number(btn.dataset.openDayEdit) };
      renderModalAssignments();
      const input = assignmentList.querySelector(`[data-day-picker-index="${editMode.index}"]`);
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

  assignmentList.querySelectorAll("[data-apply-day-index]").forEach(btn => {
    btn.addEventListener("click", () => {
      const index = Number(btn.dataset.applyDayIndex);
      const picker = assignmentList.querySelector(`[data-day-picker-index="${index}"]`);
      const newDate = picker?.value || "";
      applyDayChange(index, newDate);
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
    row.innerHTML = `<strong>${escapeHtml(client.clientName)}</strong>`;
    row.addEventListener("click", () => applyJobChange(index, client));
    box.appendChild(row);
  });
}

function applyEmployeeChange(index, employeeId) {
  if (isSavingChange) return;

  const row = assignments[index];
  if (!row) return alert("Assignment not found.");

  const employee = getEmployeeById(employeeId);
  if (!employee) return alert("Employee not found.");

  row.employeeId = employee.employeeId;
  row.employeeName = employee.employeeName;
  row.weekStart = currentWeekStart;
  row.serviceDate = currentDay;
  row.dayName = getDayNameFromYMD(currentDay);
  row.assignmentType = normalizeAssignmentType(row.assignmentType || row.AssignmentType || "");
  if (row.assignmentType !== "ADD_ON") {
    row.addOnType = "";
    row.addOnNotes = "";
  }
  row.active = row.active || "YES";

  markDayDirty(true);
  editMode = null;
  renderModalAssignments();
  renderAssignments(currentDay);
}

function applyJobChange(index, client) {
  if (isSavingChange) return;

  const row = assignments[index];
  if (!row) return alert("Assignment not found.");
  if (!client) return alert("Client not found.");

  row.clientId = client.clientId || "";
  row.clientName = client.clientName || client.name || "";
  row.address = client.address || "";
  row.weekStart = currentWeekStart;
  row.serviceDate = currentDay;
  row.dayName = getDayNameFromYMD(currentDay);
  row.assignmentType = normalizeAssignmentType(row.assignmentType || row.AssignmentType || "");
  if (row.assignmentType !== "ADD_ON") {
    row.addOnType = "";
    row.addOnNotes = "";
  }
  row.active = row.active || "YES";

  if (!row.clientName) return alert("Selected client is missing a client name.");

  markDayDirty(true);
  editMode = null;
  renderModalAssignments();
  renderAssignments(currentDay);
}

function applyDayChange(index, newDate) {
  if (isSavingChange) return;

  const row = assignments[index];
  if (!row) return alert("Assignment not found.");

  const targetDate = String(newDate || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) return alert("Choose a valid new date.");

  const oldDate = row.serviceDate || currentDay;
  if (!oldDate) return alert("Original assignment day was not found.");

  if (targetDate === oldDate) {
    editMode = null;
    renderModalAssignments();
    return;
  }

  const duplicateExists = assignments.some((existing, existingIndex) => {
    if (existingIndex === index) return false;
    if (String(existing.active || "YES").toUpperCase() === "NO") return false;
    return existing.serviceDate === targetDate
      && String(existing.employeeId || "").trim().toUpperCase() === String(row.employeeId || "").trim().toUpperCase()
      && String(existing.clientId || "").trim() === String(row.clientId || "").trim()
      && clientKey(existing.clientName) === clientKey(row.clientName)
      && normalizeAssignmentType(existing.assignmentType || existing.AssignmentType || "") === normalizeAssignmentType(row.assignmentType || row.AssignmentType || "")
      && String(existing.addOnType || existing.AddOnType || "").trim().toLowerCase() === String(row.addOnType || row.AddOnType || "").trim().toLowerCase();
  });

  if (duplicateExists) {
    return alert("That employee/client assignment already exists on the selected day. No duplicate was created.");
  }

  row.rowId = "";
  row.weekStart = currentWeekStart;
  row.serviceDate = targetDate;
  row.dayName = getDayNameFromYMD(targetDate);
  row.assignmentType = normalizeAssignmentType(row.assignmentType || row.AssignmentType || "");
  if (row.assignmentType !== "ADD_ON") {
    row.addOnType = "";
    row.addOnNotes = "";
  }
  row.active = row.active || "YES";
  row.sortOrder = getRowsPayloadForDate(targetDate).length + 1;

  movedDayDates.add(oldDate);
  movedDayDates.add(targetDate);
  markDateDirty(oldDate, true);
  markDateDirty(targetDate, true);
  allowEmptyCurrentDaySave = true;

  markDayDirty(true);
  editMode = null;
  renderModalAssignments();
  renderAssignments(oldDate);
  renderAssignments(targetDate);
}

function handleClientSearch() {
  if (!clientSuggestions || !clientSearch) return;

  const q = clientSearch.value.trim().toLowerCase();
  const addOnMode = !!isAddOnAssignment?.checked;

  selectedClient = null;
  clientSuggestions.innerHTML = "";

  if (!q) return;

  const seen = {};
  let searchPool = [...clients];

  if (addOnMode) {
    searchPool.push(getMiscAddOnClient());
  }

  const matches = searchPool
    .filter(client => {
      const displayName = getClientDisplayName(client, addOnMode);
      const key = clientKey(displayName);

      if (!displayName) return false;
      if (!displayName.toLowerCase().includes(q)) return false;

      if (addOnMode) {
        if (seen[key]) return false;
        seen[key] = true;
      }

      return true;
    })
    .slice(0, 10);

  if (!matches.length) {
    clientSuggestions.innerHTML = `<div style="opacity:.7;margin-top:8px;">No matching clients.</div>`;
    return;
  }

  matches.forEach(client => {
    const displayName = getClientDisplayName(client, addOnMode);

    const div = document.createElement("button");
    div.type = "button";
    div.className = "assignment";
    div.style.cursor = "pointer";
    div.style.width = "100%";
    div.style.textAlign = "left";
    div.innerHTML = `<strong>${escapeHtml(displayName)}</strong>`;

    div.addEventListener("click", () => {
      selectedClient = client;
      clientSearch.value = displayName;
      clientSuggestions.innerHTML = "";
    });

    clientSuggestions.appendChild(div);
  });
}

function addAssignment() {
  if (isSavingChange) return;
  if (!currentDay) return alert("Choose a day first.");

  const client = findClientFromInput();
  if (!client) {
    return alert("Select a client from the search results first. If you typed the full name, click the matching client suggestion or press Enter.");
  }

  const employeeId = employeeSelect?.value || "";
  const employee = getEmployeeById(employeeId);
  if (!employee) return alert("Select an employee.");

  const assignmentType = getCurrentAssignmentType();
  const addOnType = assignmentType === "ADD_ON" ? addOnTypeLabel(addOnTypeInput?.value || "") : "";
  const addOnNoteText = assignmentType === "ADD_ON" ? String(addOnNotes?.value || "").trim() : "";

  if (assignmentType === "ADD_ON" && !addOnType.trim()) {
    return alert("Type the Add-On job name first, like Windows, Oven, Basement, Carpet Shampooing, etc.");
  }

  if (assignmentType === "ADD_ON" && isMiscAddOnClient(client) && !addOnNoteText) {
    return alert("Notes are required when Misc is selected.");
  }

  if (assignmentType === "ADD_ON") {
    removeSameEmployeeBaseCleaningRowForAddOn(employee.employeeId, currentDay, client);
  }

  const newRow = {
    rowId: "",
    weekStart: currentWeekStart,
    serviceDate: currentDay,
    dayName: getDayNameFromYMD(currentDay),
    employeeId: employee.employeeId,
    employeeName: employee.employeeName,
    clientId: client.clientId || "",
    clientName: assignmentType === "ADD_ON"
      ? getClientDisplayName(client, true)
      : (client.clientName || client.name || ""),
    address: client.address || "",
    notes: "",
    assignmentType: assignmentType,
    addOnType: addOnType,
    addOnNotes: addOnNoteText,
    payrollEnteredPay: "",
    payrollEnteredBy: "",
    payrollEnteredAt: "",
    sortOrder: getActiveRowsForCurrentDay().length + 1,
    active: "YES"
  };

  if (!newRow.clientName) return alert("Selected client is missing a client name.");

  assignments.push(newRow);
  allowEmptyCurrentDaySave = false;
  markDayDirty(true);
  clearClientSelection();
  resetAssignmentEntryFields();
  renderModalAssignments();
  renderAssignments(currentDay);
}

function ghostKeyFromRow(row) {
  row = row || {};
  const type = normalizeAssignmentType(row.assignmentType || row.AssignmentType || row.jobType || "");
  const id = String(row.clientId || "").trim().toLowerCase();
  const name = clientKey(row.clientName || "");
  return `${id}|${name}|${type}`;
}

function restoreGhostFromRemovedAssignment(row) {
  row = row || {};
  if (isAddOnRow(row)) return;

  const source = row.ghostSource || row.GhostSource || null;
  if (!source) return;

  const restore = { ...source };
  restore.scheduled = false;
  restore.scheduledRows = [];

  const restoreKey = String(restore.ghostKey || "").trim();
  const restoreCompareKey = ghostKeyFromRow({
    clientId: restore.clientId || row.clientId || "",
    clientName: restore.clientName || row.clientName || "",
    assignmentType: restore.jobType || restore.assignmentType || row.assignmentType || ""
  });

  const alreadyOpen = (ghostScheduler.ghosts || []).some(item => {
    const itemKey = String(item.ghostKey || "").trim();
    if (restoreKey && itemKey && restoreKey === itemKey) return true;

    const itemCompareKey = ghostKeyFromRow({
      clientId: item.clientId || "",
      clientName: item.clientName || "",
      assignmentType: item.jobType || item.assignmentType || ""
    });

    return restoreCompareKey && itemCompareKey && restoreCompareKey === itemCompareKey;
  });

  if (alreadyOpen) return;

  ghostScheduler.ghosts = [restore].concat(ghostScheduler.ghosts || []);
  ghostScheduler.ghostCount = ghostScheduler.ghosts.length;
  ghostScheduler.scheduledCount = Math.max(0, Number(ghostScheduler.scheduledCount || 0) - 1);
  ghostScheduler.dueCount = Math.max(Number(ghostScheduler.dueCount || 0), ghostScheduler.ghostCount + Number(ghostScheduler.scheduledCount || 0));
}

function removeAssignment(index) {
  if (isSavingChange) return;

  const row = assignments[index];
  if (!row) return;
  if (!confirm("Remove this assignment from this day? Click Update This Day to save changes.")) return;

  const removedRow = { ...row };
  assignments.splice(index, 1);

  restoreGhostFromRemovedAssignment(removedRow);

  allowEmptyCurrentDaySave = true;
  markDayDirty(true);
  editMode = null;
  renderModalAssignments();
  renderAssignments(currentDay);
  renderGhostSchedulerPanel();
  buildWeekBoard();
  updateSaveAllButtonState();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
