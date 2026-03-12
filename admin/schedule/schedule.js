/* ======================================================
   ATS Scheduler v1
   Live Apps Script version
====================================================== */

const ATS_API =
  "https://script.google.com/macros/s/AKfycbypP0QPCfgX5LGUhEGol2RuOOYzRO_Nzdish8xRaPy49a0httlNJmNT2x59LvrM1RR-/exec";

let currentWeek = "this";
let scheduleData = {};
let weekStart = "";
let rotationWeek = "";
let cleaners = [];
let clients = [];

const DAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday"
];

function $(id) {
  return document.getElementById(id);
}

function setDebug(message, show = true) {
  const el = $("scheduleDebug");
  if (!el) return;
  el.textContent = message || "";
  el.classList.toggle("show", !!show && !!message);
}

function getStoredValue(keys) {
  for (const key of keys) {
    const fromSession = sessionStorage.getItem(key);
    if (fromSession) return fromSession;

    const fromLocal = localStorage.getItem(key);
    if (fromLocal) return fromLocal;
  }
  return "";
}

function getAdminToken() {
  return getStoredValue([
    "ats_admin_token_v1",
    "ats_admin_token",
    "adminToken",
    "admin_token",
    "token"
  ]);
}

function getDeviceKey() {
  return getStoredValue([
    "ats_device_key_v1",
    "ats_device_key",
    "deviceKey",
    "device_key",
    "boundDeviceKey"
  ]);
}

function ensureAuthPresent() {
  const token = getAdminToken();
  const deviceKey = getDeviceKey();

  if (!token || !deviceKey) {
    throw new Error("Missing admin token or device key in browser storage.");
  }
}

function buildAuthParams(extra = {}) {
  return {
    ...extra,
    t: getAdminToken(),
    d: getDeviceKey()
  };
}

function ensureDaysMount() {
  let mount = $("scheduleDays");
  if (mount) return mount;

  const host =
    document.querySelector(".schedule-grid") ||
    document.querySelector(".sched-grid") ||
    document.querySelector(".schedule-wrap") ||
    document.querySelector(".schedule-panel") ||
    document.querySelector("main") ||
    document.body;

  mount = document.createElement("div");
  mount.id = "scheduleDays";
  mount.className = "schedule-days-grid";
  host.appendChild(mount);
  return mount;
}

function ensureModal() {
  let modal = $("scheduleModal");
  if (modal) return modal;

  modal = document.createElement("div");
  modal.id = "scheduleModal";
  modal.className = "schedule-modal hidden";
  modal.innerHTML = `
    <div class="schedule-modal-backdrop" id="scheduleModalBackdrop"></div>
    <div class="schedule-modal-sheet">
      <div class="schedule-modal-head">
        <h3 id="scheduleModalTitle">Edit Day</h3>
        <button type="button" class="schedule-close-btn" id="scheduleModalClose">✕</button>
      </div>

      <div class="schedule-modal-body">
        <div id="scheduleExistingList" class="schedule-existing-list"></div>

        <div class="schedule-form-block">
          <label>Cleaner</label>
          <select id="scheduleCleanerSelect"></select>
        </div>

        <div class="schedule-form-block">
          <label>Client</label>
          <select id="scheduleClientSelect"></select>
        </div>

        <div class="schedule-form-actions">
          <button type="button" class="sched-btn primary" id="scheduleAddBtn">Add</button>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  $("scheduleModalClose").addEventListener("click", closeModal);
  $("scheduleModalBackdrop").addEventListener("click", closeModal);

  return modal;
}

function injectSchedulerStyles() {
  if ($("schedulerDynamicStyles")) return;

  const style = document.createElement("style");
  style.id = "schedulerDynamicStyles";
  style.textContent = `
    .schedule-days-grid{
      display:grid;
      grid-template-columns:repeat(1,minmax(0,1fr));
      gap:14px;
      margin-top:18px;
    }

    .schedule-day-card{
      background:rgba(255,255,255,.08);
      border:1px solid rgba(255,215,64,.35);
      border-radius:18px;
      padding:14px;
      box-shadow:0 10px 24px rgba(0,0,0,.18);
      backdrop-filter:blur(4px);
    }

    .schedule-day-head{
      display:flex;
      justify-content:space-between;
      align-items:center;
      gap:10px;
      margin-bottom:12px;
    }

    .schedule-day-title{
      margin:0;
      font-size:1.08rem;
      font-weight:800;
      color:#fff;
    }

    .schedule-day-date{
      font-size:.9rem;
      color:rgba(255,255,255,.8);
      font-weight:600;
    }

    .schedule-list{
      display:flex;
      flex-direction:column;
      gap:8px;
      margin-bottom:12px;
    }

    .schedule-item{
      display:flex;
      justify-content:space-between;
      gap:10px;
      align-items:flex-start;
      background:rgba(255,255,255,.08);
      border:1px solid rgba(255,255,255,.12);
      border-radius:12px;
      padding:10px 12px;
    }

    .schedule-item-main{
      min-width:0;
    }

    .schedule-item-client{
      font-weight:800;
      color:#fff;
      line-height:1.15;
    }

    .schedule-item-cleaner{
      font-size:.92rem;
      color:rgba(255,255,255,.82);
      margin-top:2px;
    }

    .schedule-item-btn,
    .schedule-add-day-btn,
    .schedule-action-btn{
      border:0;
      border-radius:12px;
      cursor:pointer;
      font-weight:800;
    }

    .schedule-item-btn{
      padding:8px 10px;
      background:rgba(246,199,68,.18);
      color:#fff;
      border:1px solid rgba(246,199,68,.45);
      flex:0 0 auto;
    }

    .schedule-add-day-btn{
      width:100%;
      padding:10px 12px;
      background:rgba(255,255,255,.1);
      color:#fff;
      border:1px solid rgba(255,255,255,.14);
    }

    .schedule-empty{
      color:rgba(255,255,255,.72);
      font-size:.94rem;
      padding:4px 0 2px;
    }

    .schedule-modal.hidden{
      display:none;
    }

    .schedule-modal{
      position:fixed;
      inset:0;
      z-index:9999;
    }

    .schedule-modal-backdrop{
      position:absolute;
      inset:0;
      background:rgba(0,0,0,.45);
    }

    .schedule-modal-sheet{
      position:absolute;
      left:0;
      right:0;
      bottom:0;
      background:#2f315f;
      border-top-left-radius:22px;
      border-top-right-radius:22px;
      padding:16px;
      max-height:86vh;
      overflow:auto;
      box-shadow:0 -20px 40px rgba(0,0,0,.35);
    }

    .schedule-modal-head{
      display:flex;
      justify-content:space-between;
      align-items:center;
      gap:10px;
      margin-bottom:14px;
    }

    .schedule-modal-head h3{
      margin:0;
      color:#fff;
      font-size:1.15rem;
    }

    .schedule-close-btn{
      border:0;
      background:transparent;
      color:#fff;
      font-size:1.1rem;
      cursor:pointer;
    }

    .schedule-existing-list{
      display:flex;
      flex-direction:column;
      gap:10px;
      margin-bottom:16px;
    }

    .schedule-existing-row{
      background:rgba(255,255,255,.08);
      border:1px solid rgba(255,255,255,.12);
      border-radius:12px;
      padding:10px 12px;
    }

    .schedule-existing-main{
      color:#fff;
      font-weight:700;
      margin-bottom:10px;
    }

    .schedule-existing-sub{
      color:rgba(255,255,255,.78);
      font-size:.92rem;
      margin-top:2px;
    }

    .schedule-existing-actions{
      display:flex;
      gap:8px;
      flex-wrap:wrap;
    }

    .schedule-action-btn{
      padding:8px 10px;
      background:rgba(255,255,255,.1);
      color:#fff;
      border:1px solid rgba(255,255,255,.16);
    }

    .schedule-form-block{
      margin-bottom:12px;
    }

    .schedule-form-block label{
      display:block;
      color:#fff;
      font-size:.92rem;
      font-weight:700;
      margin-bottom:6px;
    }

    .schedule-form-block select{
      width:100%;
      border-radius:12px;
      border:1px solid rgba(255,255,255,.18);
      background:rgba(255,255,255,.1);
      color:#fff;
      padding:12px;
      outline:none;
    }

    .schedule-form-actions{
      margin-top:8px;
    }

    .schedule-loading,
    .schedule-error{
      margin-top:18px;
      padding:14px;
      border-radius:14px;
      color:#fff;
      background:rgba(255,255,255,.08);
      border:1px solid rgba(255,255,255,.14);
    }

    @media (min-width: 860px){
      .schedule-days-grid{
        grid-template-columns:repeat(2,minmax(0,1fr));
      }
    }
  `;
  document.head.appendChild(style);
}

function api(action, params = {}) {
  return new Promise((resolve, reject) => {
    const cb = "cb_" + Math.random().toString(36).slice(2);
    const script = document.createElement("script");
    const token = getAdminToken();
    const deviceKey = getDeviceKey();

    const query = new URLSearchParams(
      buildAuthParams({
        action,
        callback: cb,
        ...params
      })
    );

    const requestUrl = ATS_API + "?" + query.toString();

    console.log("ATS_API", ATS_API);
    console.log("Scheduler token found?", !!token, token);
    console.log("Scheduler device found?", !!deviceKey, deviceKey);
    console.log("Scheduler request URL", requestUrl);

    let finished = false;

    const cleanup = () => {
      if (finished) return;
      finished = true;
      try { delete window[cb]; } catch (e) {}
      try { script.remove(); } catch (e) {}
    };

    window[cb] = function(data) {
      cleanup();
      resolve(data);
    };

    script.onerror = function() {
      cleanup();
      reject(new Error("API load failed: " + requestUrl));
    };

    setTimeout(() => {
      if (finished) return;
      cleanup();
      reject(new Error("API timeout: " + requestUrl));
    }, 15000);

    script.src = requestUrl;
    document.body.appendChild(script);
  });
}

async function postApi(action, payload = {}) {
  const token = getAdminToken();
  const deviceKey = getDeviceKey();

  const requestUrl =
    ATS_API +
    "?action=" + encodeURIComponent(action) +
    "&t=" + encodeURIComponent(token) +
    "&d=" + encodeURIComponent(deviceKey);

  console.log("Scheduler POST URL", requestUrl);

  const res = await fetch(requestUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch (err) {
    return { ok: false, error: "Invalid JSON response", raw: text };
  }
}

async function loadCleaners() {
  const res = await api("schedule_cleaners");
  if (!res.ok) throw new Error(res.error || "Failed to load cleaners");
  cleaners = Array.isArray(res.cleanerRows) ? res.cleanerRows : [];
  if (!cleaners.length && Array.isArray(res.cleaners)) {
    cleaners = res.cleaners.map(name => ({ employeeName: name, employeeId: name }));
  }
}

async function loadClients() {
  const res = await api("schedule_clients");
  if (!res.ok) throw new Error(res.error || "Failed to load clients");
  clients = Array.isArray(res.clientRows) ? res.clientRows : [];
  if (!clients.length && Array.isArray(res.clients)) {
    clients = res.clients.map(name => ({ clientName: name, clientId: name }));
  }
}

async function loadSchedule() {
  const mount = ensureDaysMount();
  mount.innerHTML = `<div class="schedule-loading">Loading schedule…</div>`;

  const res = await api("schedule_week", { week: currentWeek });
  if (!res.ok) {
    mount.innerHTML = `<div class="schedule-error">Could not load schedule.</div>`;
    throw new Error(res.error || "Failed to load schedule");
  }

  scheduleData = res.days || {};
  weekStart = res.weekStart || "";
  rotationWeek = res.rotationWeek || "";

  renderMeta();
  renderDays();
}

function renderMeta() {
  const weekViewEl = $("weekViewValue");
  const weekStartEl = $("weekStartValue");
  const rotationEl = $("rotationValue");

  if (weekViewEl) weekViewEl.textContent = currentWeek === "next" ? "Next Week" : "This Week";
  if (weekStartEl) weekStartEl.textContent = weekStart || "—";
  if (rotationEl) rotationEl.textContent = rotationWeek ? ("Week " + rotationWeek) : "—";

  const thisWeekBtn = $("thisWeekBtn");
  const nextWeekBtn = $("nextWeekBtn");
  const thisWeekBtnSecondary = $("thisWeekBtnSecondary");

  if (thisWeekBtn) thisWeekBtn.classList.toggle("is-active", currentWeek === "this");
  if (thisWeekBtnSecondary) thisWeekBtnSecondary.classList.toggle("is-active", currentWeek === "this");
  if (nextWeekBtn) nextWeekBtn.classList.toggle("is-active", currentWeek === "next");
}

function renderDays() {
  const mount = ensureDaysMount();
  mount.innerHTML = "";

  DAY_NAMES.forEach(day => {
    const items = Array.isArray(scheduleData[day]) ? scheduleData[day] : [];
    const card = document.createElement("section");
    card.className = "schedule-day-card";

    const dateLabel = getDateForDayLabel(day);

    const listHtml = items.length
      ? items.map(item => `
          <div class="schedule-item">
            <div class="schedule-item-main">
              <div class="schedule-item-client">${escapeHtml(item.client || "")}</div>
              <div class="schedule-item-cleaner">${escapeHtml(item.cleaner || "")}</div>
            </div>
            <button
              type="button"
              class="schedule-item-btn"
              data-day="${day}"
              data-client="${escapeAttr(item.client || "")}"
              data-client-id="${escapeAttr(item.clientId || "")}"
              data-cleaner="${escapeAttr(item.cleaner || "")}"
              data-service-date="${escapeAttr(item.serviceDate || "")}">
              Edit
            </button>
          </div>
        `).join("")
      : `<div class="schedule-empty">No jobs</div>`;

    card.innerHTML = `
      <div class="schedule-day-head">
        <h3 class="schedule-day-title">${day}</h3>
        <div class="schedule-day-date">${dateLabel}</div>
      </div>
      <div class="schedule-list">${listHtml}</div>
      <button type="button" class="schedule-add-day-btn" data-add-day="${day}">Add Job</button>
    `;

    mount.appendChild(card);
  });

  mount.querySelectorAll("[data-add-day]").forEach(btn => {
    btn.addEventListener("click", () => openDayModal(btn.getAttribute("data-add-day")));
  });

  mount.querySelectorAll(".schedule-item-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      openDayModal(
        btn.getAttribute("data-day"),
        {
          client: btn.getAttribute("data-client"),
          clientId: btn.getAttribute("data-client-id"),
          cleaner: btn.getAttribute("data-cleaner"),
          serviceDate: btn.getAttribute("data-service-date")
        }
      );
    });
  });
}

function getDateForDayLabel(dayName) {
  if (!weekStart) return "—";
  const base = new Date(weekStart + "T00:00:00");
  const map = {
    Monday: 0,
    Tuesday: 1,
    Wednesday: 2,
    Thursday: 3,
    Friday: 4,
    Saturday: 5,
    Sunday: 6
  };
  base.setDate(base.getDate() + (map[dayName] || 0));
  return base.toLocaleDateString();
}

let modalState = {
  day: "",
  item: null
};

function populateSelect(select, rows, labelKey, valueKey) {
  select.innerHTML = `<option value="">Select...</option>`;
  rows.forEach(row => {
    const opt = document.createElement("option");
    opt.value = row[valueKey] || row[labelKey] || "";
    opt.textContent = row[labelKey] || row[valueKey] || "";
    select.appendChild(opt);
  });
}

function openDayModal(day, item = null) {
  ensureModal();
  modalState = { day, item };

  const modal = $("scheduleModal");
  const title = $("scheduleModalTitle");
  const existing = $("scheduleExistingList");
  const cleanerSelect = $("scheduleCleanerSelect");
  const clientSelect = $("scheduleClientSelect");
  const addBtn = $("scheduleAddBtn");

  title.textContent = item ? `${day} — Edit Job` : `${day} — Add Job`;

  populateSelect(cleanerSelect, cleaners, "employeeName", "employeeName");
  populateSelect(clientSelect, clients, "clientName", "clientId");

  if (item) {
    cleanerSelect.value = item.cleaner || "";
    clientSelect.value = item.clientId || "";
  } else {
    cleanerSelect.value = "";
    clientSelect.value = "";
  }

  const dayItems = Array.isArray(scheduleData[day]) ? scheduleData[day] : [];
  existing.innerHTML = dayItems.length
    ? dayItems.map(row => `
        <div class="schedule-existing-row">
          <div class="schedule-existing-main">${escapeHtml(row.client || "")}</div>
          <div class="schedule-existing-sub">${escapeHtml(row.cleaner || "")}</div>
          <div class="schedule-existing-actions">
            <button
              type="button"
              class="schedule-action-btn"
              data-replace="${escapeAttr(row.client || "")}"
              data-client-id="${escapeAttr(row.clientId || "")}"
              data-cleaner="${escapeAttr(row.cleaner || "")}"
              data-service-date="${escapeAttr(row.serviceDate || "")}">
              Replace Cleaner
            </button>
            <button
              type="button"
              class="schedule-action-btn"
              data-reschedule="${escapeAttr(row.client || "")}"
              data-client-id="${escapeAttr(row.clientId || "")}"
              data-cleaner="${escapeAttr(row.cleaner || "")}"
              data-service-date="${escapeAttr(row.serviceDate || "")}">
              Temp Reschedule
            </button>
            <button
              type="button"
              class="schedule-action-btn"
              data-remove="${escapeAttr(row.client || "")}"
              data-client-id="${escapeAttr(row.clientId || "")}"
              data-cleaner="${escapeAttr(row.cleaner || "")}"
              data-service-date="${escapeAttr(row.serviceDate || "")}">
              Remove
            </button>
          </div>
        </div>
      `).join("")
    : `<div class="schedule-empty">No current assignments for ${day}.</div>`;

  existing.querySelectorAll("[data-replace]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const newCleaner = prompt("Replace with which cleaner?");
      if (!newCleaner) return;
      await replaceCleaner(day, {
        client: btn.getAttribute("data-replace"),
        clientId: btn.getAttribute("data-client-id"),
        cleaner: btn.getAttribute("data-cleaner"),
        serviceDate: btn.getAttribute("data-service-date")
      }, newCleaner);
    });
  });

  existing.querySelectorAll("[data-reschedule]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const newDay = prompt("Move to which day?");
      if (!newDay) return;
      await tempReschedule(day, {
        client: btn.getAttribute("data-reschedule"),
        clientId: btn.getAttribute("data-client-id"),
        cleaner: btn.getAttribute("data-cleaner"),
        serviceDate: btn.getAttribute("data-service-date")
      }, newDay);
    });
  });

  existing.querySelectorAll("[data-remove]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const ok = confirm("Remove this job for this cycle?");
      if (!ok) return;
      await removeJob(day, {
        client: btn.getAttribute("data-remove"),
        clientId: btn.getAttribute("data-client-id"),
        cleaner: btn.getAttribute("data-cleaner"),
        serviceDate: btn.getAttribute("data-service-date")
      });
    });
  });

  addBtn.onclick = async () => {
    const cleaner = cleanerSelect.value;
    const clientId = clientSelect.value;
    const clientRow = clients.find(c => (c.clientId || c.clientName) === clientId);
    const clientName = clientRow ? clientRow.clientName : "";

    if (!cleaner || !clientId) {
      alert("Pick a cleaner and client first.");
      return;
    }

    await addJob(day, cleaner, clientId, clientName);
  };

  modal.classList.remove("hidden");
}

function closeModal() {
  const modal = $("scheduleModal");
  if (modal) modal.classList.add("hidden");
}

async function addJob(day, cleaner, clientId, clientName) {
  const res = await postApi("schedule_add", {
    week: currentWeek,
    weekStart,
    day,
    cleaner,
    clientId,
    clientName
  });

  if (!res.ok) {
    alert(res.error || "Could not add job.");
    return;
  }

  closeModal();
  await loadSchedule();
}

async function replaceCleaner(day, item, newCleaner) {
  const res = await postApi("schedule_replace", {
    week: currentWeek,
    weekStart,
    day,
    client: item.client,
    clientId: item.clientId,
    cleaner: newCleaner,
    oldCleaner: item.cleaner,
    serviceDate: item.serviceDate
  });

  if (!res.ok) {
    alert(res.error || "Could not replace cleaner.");
    return;
  }

  closeModal();
  await loadSchedule();
}

async function tempReschedule(day, item, newDay) {
  const res = await postApi("schedule_reschedule", {
    week: currentWeek,
    weekStart,
    day,
    client: item.client,
    clientId: item.clientId,
    serviceDate: item.serviceDate,
    newDay,
    oldCleaner: item.cleaner
  });

  if (!res.ok) {
    alert(res.error || "Could not reschedule.");
    return;
  }

  closeModal();
  await loadSchedule();
}

async function removeJob(day, item) {
  const res = await postApi("schedule_remove", {
    week: currentWeek,
    weekStart,
    day,
    client: item.client,
    clientId: item.clientId,
    serviceDate: item.serviceDate,
    oldCleaner: item.cleaner
  });

  if (!res.ok) {
    alert(res.error || "Could not remove job.");
    return;
  }

  closeModal();
  await loadSchedule();
}

function bindWeekButtons() {
  const thisWeekBtn = $("thisWeekBtn");
  const nextWeekBtn = $("nextWeekBtn");
  const prevBtn = $("prevWeekBtn");
  const nextBtn = $("nextWeekNavBtn");
  const thisWeekBtnSecondary = $("thisWeekBtnSecondary");

  if (thisWeekBtn) {
    thisWeekBtn.addEventListener("click", async () => {
      currentWeek = "this";
      await loadSchedule();
    });
  }

  if (thisWeekBtnSecondary) {
    thisWeekBtnSecondary.addEventListener("click", async () => {
      currentWeek = "this";
      await loadSchedule();
    });
  }

  if (nextWeekBtn) {
    nextWeekBtn.addEventListener("click", async () => {
      currentWeek = "next";
      await loadSchedule();
    });
  }

  if (prevBtn) {
    prevBtn.addEventListener("click", async () => {
      currentWeek = "this";
      await loadSchedule();
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener("click", async () => {
      currentWeek = "next";
      await loadSchedule();
    });
  }
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(str) {
  return escapeHtml(str).replace(/'/g, "&#39;");
}

async function initScheduler() {
  injectSchedulerStyles();
  ensureDaysMount();
  ensureModal();
  bindWeekButtons();

  try {
    const token = getAdminToken();
    const deviceKey = getDeviceKey();

    setDebug(
      `Auth check → token: ${token ? "found" : "missing"} | device: ${deviceKey ? "found" : "missing"}`
    );

    ensureAuthPresent();
    await loadCleaners();
    await loadClients();
    await loadSchedule();
    setDebug("");
  } catch (err) {
    const mount = ensureDaysMount();
    mount.innerHTML = `<div class="schedule-error">Scheduler failed to load.</div>`;
    setDebug(String(err && err.message ? err.message : err), true);
    console.error(err);
  }
}

document.addEventListener("DOMContentLoaded", initScheduler);
