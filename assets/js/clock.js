// ==============================
// FILE: /assets/js/clock.js
// TYPE: .js
// ATS Clock + Client Specs
// Shared activeClockState_E## sync build
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

const SHEET_URL =
  "https://script.google.com/macros/s/AKfycbyCCv30Q3l0Gg2zGs2sHD6a9jHm678QQKV_mdTm_GFnjR-xsmaYdDonmlBugX3TeHPiJA/exec";

const UNIFIED_URL =
  "https://script.google.com/macros/s/AKfycbx2bQ-SSeUHoihjbkYmkJ5-0Dw8JPqH8bhBQR3fbvLsOhDhbuPv0MdVeTdMW6zoVTsWsw/exec";

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

const params = new URLSearchParams(window.location.search);

const employeeId = String(params.get("emp") || "").trim().toUpperCase();
const employeeName = employees[employeeId];

const ACTIVE_CLOCK_STATE_KEY = `activeClockState_${employeeId}`;

const directJobFromWeeklyBoard = {
  source: String(params.get("source") || "").trim(),
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

if (display) {
  display.textContent = `Welcome, ${employeeName}`;
}

let selectedJob = null;
let allJobs = [];
let activeClientSpecs = null;
let jobSearchClearBtn = null;

let isClockedIn = false;
let onBreak = false;

const activeSpecsKey = `activeClientSpecs_${employeeId}`;

function readClockState() {
  try {
    const raw = localStorage.getItem(ACTIVE_CLOCK_STATE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);

    return {
      isClockedIn: !!parsed.isClockedIn,
      onBreak: !!parsed.onBreak,
      activeJob: parsed.activeJob || null
    };
  } catch (e) {
    return null;
  }
}

function writeClockState() {
  const payload = {
    isClockedIn,
    onBreak,
    activeJob: selectedJob
      ? {
          id: selectedJob.id || "",
          name: selectedJob.name || "",
          clientName: selectedJob.clientName || "",
          address: selectedJob.address || "",
          pay: Number(selectedJob.pay || 0),
          serviceDate: selectedJob.serviceDate || ""
        }
      : null
  };

  try {
    localStorage.setItem(ACTIVE_CLOCK_STATE_KEY, JSON.stringify(payload));
  } catch (e) {}
}

function clearClockState() {
  try {
    localStorage.removeItem(ACTIVE_CLOCK_STATE_KEY);
  } catch (e) {}
}

function restoreClockState() {
  const state = readClockState();

  if (!state) return false;

  isClockedIn = !!state.isClockedIn;
  onBreak = !!state.onBreak;

  if (state.activeJob) {
    selectedJob = normalizeJob(state.activeJob);

    if (jobSearch) {
      jobSearch.value = selectedJob.name || "";
    }

    showSelectedJobAddress(selectedJob.address || "");
  }

  return !!selectedJob;
}

restoreClockState();

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

  return {
    id,
    name,
    clientName,
    pay: isNumericValue(pay) ? Number(pay) : 0,
    address,
    serviceDate,
    futureLocked: isFutureServiceDate(serviceDate)
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
    linkEl.innerHTML =
      `<a href="${getMapUrl(address)}" target="_blank" rel="noopener">📍 Open in Maps</a>`;
  } else {
    linkEl.innerHTML = "";
  }
}

function updateButtons() {
  const hasJob = !!selectedJob;
  const futureLocked = currentSelectedJobIsFutureLocked();

  btnClockIn.disabled = isClockedIn || !hasJob || futureLocked;
  btnBreakStart.disabled = !isClockedIn || onBreak || !hasJob || futureLocked;
  btnBreakEnd.disabled = !isClockedIn || !onBreak || !hasJob || futureLocked;
  btnClockOut.disabled = !isClockedIn || !hasJob || futureLocked;

  if (notesEl) {
    notesEl.disabled = !isClockedIn || futureLocked;
  }
}

function jsonp(action, paramsObj = {}) {
  return new Promise((resolve, reject) => {
    const cb = "cb_" + Math.random().toString(36).slice(2);

    const qs = new URLSearchParams({
      action,
      ...paramsObj,
      callback: cb
    });

    const script = document.createElement("script");

    window[cb] = function (res) {
      try {
        resolve(res);
      } finally {
        try { delete window[cb]; } catch (e) {}
        try { script.remove(); } catch (e) {}
      }
    };

    script.onerror = function () {
      reject(new Error("JSONP failed"));
    };

    script.src = UNIFIED_URL + "?" + qs.toString();

    document.body.appendChild(script);
  });
}

window.loadJobs = function (res) {
  const jobs = Array.isArray(res)
    ? res
    : (res && Array.isArray(res.jobs) ? res.jobs : []);

  allJobs = jobs.map(normalizeJob);

  while (jobSelect.options.length > 1) {
    jobSelect.remove(1);
  }

  allJobs.forEach(job => {
    const opt = document.createElement("option");

    opt.value = job.id;
    opt.textContent = job.name;

    opt.dataset.jobId = job.id;
    opt.dataset.jobName = job.name;
    opt.dataset.clientName = job.clientName;
    opt.dataset.jobPay = String(job.pay || 0);
    opt.dataset.address = job.address || "";
    opt.dataset.serviceDate = job.serviceDate || "";
    opt.dataset.futureLocked = job.futureLocked ? "true" : "false";

    jobSelect.appendChild(opt);
  });

  if (selectedJob) {
    const match = allJobs.find(j =>
      String(j.id || "") === String(selectedJob.id || "")
    );

    if (match) {
      selectedJob = match;
      jobSelect.value = match.id;
      showSelectedJobAddress(match.address || "");
    }
  }

  updateButtons();
};

(function injectJobsScript() {
  const s = document.createElement("script");

  s.src = `${UNIFIED_URL}?action=clock_jobs_list&callback=loadJobs`;

  s.async = true;

  document.body.appendChild(s);
})();

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

function logEvent(action) {
  const notesValue =
    action === "Clock Out"
      ? (notesEl?.value || "").trim()
      : "";

  getLocation((coords, gpsDenied) => {
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
      employeeId,
      employeeName,
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

    window[cb] = function () {
      try { delete window[cb]; } catch (e) {}
    };

    const s = document.createElement("script");

    s.src = UNIFIED_URL + "?" + qs.toString() + "&callback=" + cb;

    document.body.appendChild(s);
  });
}

if (jobSelect) {
  jobSelect.addEventListener("change", function (e) {
    const opt = e.target.selectedOptions[0];

    if (!opt || !opt.value) return;

    selectedJob = normalizeJob({
      id: opt.dataset.jobId || opt.value,
      name: opt.dataset.jobName || opt.textContent || "",
      clientName: opt.dataset.clientName || "",
      pay: opt.dataset.jobPay || 0,
      address: opt.dataset.address || "",
      serviceDate: opt.dataset.serviceDate || ""
    });

    writeClockState();

    if (jobSearch) {
      jobSearch.value = selectedJob.name || "";
    }

    showSelectedJobAddress(selectedJob.address || "");

    updateButtons();
  });
}

window.clockIn = function () {
  if (!selectedJob) {
    setStatus("Please select a job before clocking in.", "warn");
    return;
  }

  if (selectedJob.futureLocked) {
    setStatus("This job is locked until the actual service day.", "warn");
    return;
  }

  isClockedIn = true;
  onBreak = false;

  writeClockState();

  logEvent("Clock In");

  setStatus(`Clocked In ✅ (${selectedJob.name})`, "ok");

  updateButtons();
};

window.startBreak = function () {
  if (!isClockedIn) return;

  onBreak = true;

  writeClockState();

  logEvent("Break Start");

  setStatus("Break Started 🟡", "ok");

  updateButtons();
};

window.endBreak = function () {
  if (!isClockedIn) return;

  onBreak = false;

  writeClockState();

  logEvent("Break End");

  setStatus("Break Ended ✅", "ok");

  updateButtons();
};

window.clockOut = function () {
  if (!selectedJob) {
    restoreClockState();
  }

  if (!selectedJob) {
    setStatus("Please select a job before clocking out.", "warn");
    return;
  }

  if (onBreak) {
    onBreak = false;
    logEvent("Break End");
  }

  logEvent("Clock Out");

  isClockedIn = false;
  onBreak = false;

  clearClockState();

  setStatus("Clocked Out ✅", "ok");

  if (notesEl) {
    notesEl.value = "";
  }

  selectedJob = null;

  if (jobSearch) {
    jobSearch.value = "";
  }

  if (jobSelect) {
    jobSelect.value = "";
  }

  showSelectedJobAddress("");

  updateButtons();
};

window.addEventListener("storage", function (e) {
  if (e.key !== ACTIVE_CLOCK_STATE_KEY) return;

  restoreClockState();
  updateButtons();
});

window.addEventListener("pageshow", function () {
  restoreClockState();
  updateButtons();
});

window.addEventListener("load", function () {
  restoreClockState();
  updateButtons();
});

updateButtons();
