// ==============================
// FILE: /clock.js
// TYPE: .js
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

// ==============================
// Employee from URL
// ==============================
const params = new URLSearchParams(window.location.search);
const employeeId = params.get("emp");
const employeeName = employees[employeeId];

if (!employeeName) {
  if (display) display.textContent = "Unauthorized Access";
  throw new Error("Invalid employee ID");
}

if (display) display.textContent = `Welcome, ${employeeName}`;

// ==============================
// State (persisted)
// ==============================
let onBreak = sessionStorage.getItem("onBreak") === "true";
let isClockedIn = sessionStorage.getItem("isClockedIn") === "true";
let selectedJob = null;
let allJobs = [];

const lastJobKey = `lastJob_${employeeId}`;

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

function normalizeJob(raw) {
  raw = raw || {};

  let id = String(raw.id ?? raw.jobId ?? raw.clientId ?? "").trim();
  let name = String(raw.name ?? raw.jobName ?? raw.clientName ?? raw.client ?? "").trim();
  let pay = String(raw.pay ?? raw.jobPay ?? raw.amount ?? "").trim();
  let address = String(raw.address ?? "").trim();

  // Defensive fix for shifted backend/job-list data:
  // Example bad incoming object: { id: "Ziad — Full", name: "60", pay: "" }
  // Corrected to: jobId = ZIAD_FULL, jobName = Ziad — Full, jobPay = 60
  if (isNumericValue(name) && !isNumericValue(id) && !pay) {
    pay = name;
    name = id;
    id = slugJobId(name);
  }

  if (!name && id && !isNumericValue(id)) name = id;
  if (!id && name) id = slugJobId(name);

  return {
    id,
    name,
    pay: isNumericValue(pay) ? Number(pay) : 0,
    address
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

function updateButtons() {
  const hasJob = !!selectedJob;

  if (btnClockIn) btnClockIn.disabled = isClockedIn || !hasJob;
  if (btnBreakStart) btnBreakStart.disabled = !isClockedIn || onBreak || !hasJob;
  if (btnBreakEnd) btnBreakEnd.disabled = !isClockedIn || !onBreak || !hasJob;
  if (btnClockOut) btnClockOut.disabled = !isClockedIn || !hasJob;

  if (notesEl) notesEl.disabled = !isClockedIn;
}

// ==============================
// Job selection helpers
// ==============================
function setSelectedJobFromOption(opt) {
  if (opt && opt.value) {
    selectedJob = {
      id: opt.dataset.jobId || opt.value,
      name: opt.dataset.jobName || opt.dataset.name || opt.textContent || "",
      pay: Number(opt.dataset.jobPay || opt.dataset.pay || 0),
      address: opt.dataset.address || ""
    };

    sessionStorage.setItem(lastJobKey, selectedJob.id);

    if (jobSearch) jobSearch.value = selectedJob.name;
    if (jobResults) jobResults.innerHTML = "";

    setStatus(`Selected: ${selectedJob.name} ($${Number(selectedJob.pay || 0).toFixed(2)})`, "info");
    showSelectedJobAddress(selectedJob.address);
  } else {
    selectedJob = null;
    sessionStorage.removeItem(lastJobKey);

    if (jobSearch) jobSearch.value = "";
    if (jobResults) jobResults.innerHTML = "";

    setStatus("Please select a job to continue.", "warn");
    showSelectedJobAddress("");
  }

  updateButtons();
}

function selectJobById(jobId) {
  if (!jobSelect) return;

  jobSelect.value = jobId;
  const opt = jobSelect.selectedOptions[0];
  setSelectedJobFromOption(opt);
}

function renderJobResults(term) {
  if (!jobResults) return;

  const q = String(term || "").trim().toLowerCase();

  if (!q) {
    jobResults.innerHTML = "";
    return;
  }

  const matches = allJobs
    .filter(job => String(job.name || "").toLowerCase().includes(q))
    .slice(0, 10);

  if (!matches.length) {
    jobResults.innerHTML = `<div style="opacity:.75;margin:8px 0;">No matching jobs</div>`;
    return;
  }

  jobResults.innerHTML = matches.map(job => {
    const id = escapeHtml(job.id);
    const name = escapeHtml(job.name || "");
    const pay = Number(job.pay || 0).toFixed(2);
    const address = escapeHtml(job.address || "");

    return `
      <button
        type="button"
        class="button job-result-btn"
        data-job-id="${id}"
        style="display:block;width:100%;margin:6px 0;text-align:left;padding:12px;border-radius:10px;"
      >
        <strong>${name}</strong>
        <br><small style="opacity:.8;">Pay: $${pay}</small>
        ${address ? `<br><small style="opacity:.8;">📍 ${address}</small>` : ""}
      </button>
    `;
  }).join("");
}

// ==============================
// Job search / result events
// ==============================
if (jobSearch) {
  jobSearch.addEventListener("input", function () {
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
    opt.dataset.jobPay = String(job.pay || 0);
    opt.dataset.name = job.name;
    opt.dataset.pay = String(job.pay || 0);
    opt.dataset.address = job.address || "";
    jobSelect.appendChild(opt);
  });

  const lastJobId = sessionStorage.getItem(lastJobKey);
  if (lastJobId) {
    jobSelect.value = lastJobId;
    const opt = jobSelect.selectedOptions[0];

    if (opt && opt.value) {
      setSelectedJobFromOption(opt);
      return;
    }
  }

  setStatus("Start typing a client name, then tap Full or .5.", "info");
  updateButtons();
};

(function injectJobsScript() {
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
  if (!selectedJob) return setStatus("Please select a job before clocking in.", "warn");
  if (isClockedIn) return setStatus("You are already clocked in.", "warn");

  onBreak = false;
  isClockedIn = true;
  sessionStorage.setItem("onBreak", "false");
  sessionStorage.setItem("isClockedIn", "true");

  logEvent("Clock In");
  setStatus(`Clocked In ✅ (${selectedJob.name})`, "ok");
  updateButtons();
};

window.startBreak = function () {
  if (!selectedJob) return setStatus("Select a job before starting break.", "warn");
  if (!isClockedIn) return setStatus("You must Clock In before starting break.", "warn");
  if (onBreak) return setStatus("Break is already active.", "warn");

  onBreak = true;
  sessionStorage.setItem("onBreak", "true");

  logEvent("Break Start");
  setStatus("Break Started 🟡", "ok");
  updateButtons();
};

window.endBreak = function () {
  if (!selectedJob) return setStatus("Select a job before ending break.", "warn");
  if (!isClockedIn) return setStatus("You must Clock In before ending break.", "warn");
  if (!onBreak) return setStatus("No active break to end.", "warn");

  onBreak = false;
  sessionStorage.setItem("onBreak", "false");

  logEvent("Break End");
  setStatus("Break Ended ✅", "ok");
  updateButtons();
};

window.clockOut = function () {
  if (!selectedJob) return setStatus("Please select a job before clocking out.", "warn");
  if (!isClockedIn) return setStatus("You are not clocked in.", "warn");

  if (onBreak) {
    logEvent("Break End");
    onBreak = false;
    sessionStorage.setItem("onBreak", "false");
  }

  logEvent("Clock Out");

  isClockedIn = false;
  sessionStorage.setItem("isClockedIn", "false");

  setStatus("Clocked Out ✅ (Notes saved if entered)", "ok");

  if (notesEl) notesEl.value = "";

  updateButtons();
};

// Init
updateButtons();

document.addEventListener("DOMContentLoaded", function () {
  if (jobSearch) jobSearch.focus();
});
