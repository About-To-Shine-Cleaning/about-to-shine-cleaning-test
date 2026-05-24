// =========================================================
// FILE: /admin/my-weekly-board/my-weekly-board.js
// TYPE: .js
// ATS My Weekly Board - employee schedule + approved Full Week view
// Default My Jobs, Full Week for E01/E02/E04
// Clock button appears ONLY on current-day jobs
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
  return String(s == null ? "" : s)
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

function todayYMD() {
  return formatYMD(new Date());
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

function isTodayYMD(ymd) {
  return String(ymd || "") === todayYMD();
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

  return `/admin/clock/index.html?${qs.toString()}`;
}
