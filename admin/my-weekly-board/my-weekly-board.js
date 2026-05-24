// =========================================================
// FILE: /admin/my-weekly-board/my-weekly-board.js
// ATS My Weekly Board
// READ ONLY cleaner board
// =========================================================

const API_URL =
  "https://script.google.com/macros/s/AKfycbx2bQ-SSeUHoihjbkYmkJ5-0Dw8JPqH8bhBQR3fbvLsOhDhbuPv0MdVeTdMW6zoVTsWsw/exec";

const DAYS = [
  "Saturday",
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday"
];

const boardEl = document.getElementById("weekBoard");
const weekLabel = document.getElementById("weekLabel");
const statusBox = document.getElementById("statusBox");

const specsCard = document.getElementById("clientSpecsCard");
const specsBody = document.getElementById("clientSpecsBody");
const specsTitle = document.getElementById("specTitle");
const closeSpecsBtn = document.getElementById("closeSpecsBtn");

let employeeId = "";
let employeeName = "";
let currentWeekStart = "";
let boardRows = [];

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getWeekStart() {
  const d = new Date();
  d.setHours(12, 0, 0, 0);

  while (d.getDay() !== 6) {
    d.setDate(d.getDate() - 1);
  }

  return d;
}

function formatDate(date) {
  return `${date.getFullYear()}-${String(
    date.getMonth() + 1
  ).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function prettyDate(ymd) {
  const d = new Date(ymd + "T12:00:00");

  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function prettyDay(ymd) {
  const d = new Date(ymd + "T12:00:00");

  return d.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric"
  });
}

function isPastDate(ymd) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const d = new Date(ymd + "T12:00:00");
  d.setHours(0, 0, 0, 0);

  return d < today;
}

function jsonp(action, params = {}) {
  return new Promise((resolve, reject) => {
    const callbackName =
      "jsonp_" + Math.random().toString(36).slice(2);

    const script = document.createElement("script");

    const query = new URLSearchParams({
      action,
      callback: callbackName,
      ...params
    });

    window[callbackName] = data => {
      try {
        resolve(data);
      } finally {
        delete window[callbackName];
        script.remove();
      }
    };

    script.onerror = () => {
      delete window[callbackName];
      script.remove();
      reject(new Error("JSONP failed"));
    };

    script.src = API_URL + "?" + query.toString();

    document.body.appendChild(script);
  });
}

function getMapLink(address) {
  const encoded = encodeURIComponent(address || "");

  if (/iPhone|iPad|iPod/i.test(navigator.userAgent)) {
    return `http://maps.apple.com/?q=${encoded}`;
  }

  return `https://www.google.com/maps/search/?api=1&query=${encoded}`;
}

function groupByDate(rows) {
  const grouped = {};

  rows.forEach(row => {
    const date = row.serviceDate;

    if (!grouped[date]) {
      grouped[date] = [];
    }

    grouped[date].push(row);
  });

  return grouped;
}

async function loadBoard() {
  statusBox.textContent = "Loading assignments...";

  const res = await jsonp("weekly_board_employee_view", {
    employeeId,
    weekStart: currentWeekStart
  });

  if (!res || !res.ok) {
    throw new Error(res?.error || "Failed loading board");
  }

  boardRows = Array.isArray(res.rows)
    ? res.rows
    : [];

  renderBoard();
}

function renderBoard() {
  boardEl.innerHTML = "";

  const grouped = groupByDate(boardRows);

  statusBox.textContent =
    "Tap a client name to view specs.";

  DAYS.forEach((dayName, index) => {
    const d = new Date(
      currentWeekStart + "T12:00:00"
    );

    d.setDate(d.getDate() + index);

    const ymd = formatDate(d);

    const rows = grouped[ymd] || [];

    const past = isPastDate(ymd);

    const card = document.createElement("section");

    card.className =
      "my-day-card" + (past ? " past-day" : "");

    card.innerHTML = `
      <div class="my-day-title">
        ${escapeHtml(dayName)}
      </div>

      <div class="my-day-date">
        ${escapeHtml(prettyDay(ymd))}
      </div>

      ${
        rows.length
          ? rows
              .map(row =>
                renderJob(row, past)
              )
              .join("")
          : `<div class="empty-day">
              No jobs assigned.
            </div>`
      }
    `;

    boardEl.appendChild(card);
  });

  weekLabel.textContent =
    prettyDate(currentWeekStart);
}

function renderJob(row, isPast) {
  const address = row.address || "";

  return `
    <div class="my-job-card">

      <button
        class="my-client-btn"
        ${
          isPast
            ? "disabled aria-disabled='true'"
            : ""
        }
        data-client="${escapeHtml(
          row.clientName || ""
        )}"
      >
        ${escapeHtml(row.clientName || "Client")}
      </button>

      ${
        address
          ? `
            <div class="my-job-address">
              <a
                href="${getMapLink(address)}"
                target="_blank"
              >
                📍 Open Map
              </a>
              <br>
              ${escapeHtml(address)}
            </div>
          `
          : ""
      }

      ${
        row.notes
          ? `
            <div class="my-job-notes">
              ${escapeHtml(row.notes)}
            </div>
          `
          : ""
      }

      <div class="my-job-date-lock">
        ${
          isPast
            ? "Past Day"
            : "Clock in from Clock page"
        }
      </div>

    </div>
  `;
}

async function openClientSpecs(clientName) {
  specsCard.classList.add("open");

  specsTitle.textContent = clientName;

  specsBody.innerHTML =
    "Loading client info...";

  try {
    const res = await jsonp("client_specs", {
      clientName
    });

    if (!res || !res.ok) {
      throw new Error("No specs");
    }

    specsBody.innerHTML = `
      ${
        res.address
          ? `
          <p>
            <a
              href="${getMapLink(
                res.address
              )}"
              target="_blank"
            >
              📍 Open Address
            </a>
            <br>
            ${escapeHtml(res.address)}
          </p>
        `
          : ""
      }

      ${
        res.frequency
          ? `
            <div class="spec-line">
              <div class="spec-label">
                Frequency
              </div>

              <div class="spec-value">
                ${escapeHtml(
                  res.frequency
                )}
              </div>
            </div>
          `
          : ""
      }

      ${
        res.specs
          ? `
            <div class="spec-line">
              <div class="spec-label">
                Cleaning Specs
              </div>

              <div class="spec-value">
                ${escapeHtml(res.specs)}
              </div>
            </div>
          `
          : ""
      }

      ${
        res.specialInfo
          ? `
            <div class="spec-line">
              <div class="spec-label">
                Special Info
              </div>

              <div class="spec-value">
                ${escapeHtml(
                  res.specialInfo
                )}
              </div>
            </div>
          `
          : ""
      }
    `;
  } catch (err) {
    specsBody.innerHTML =
      "No client specs found.";
  }
}

function wireEvents() {
  boardEl.addEventListener("click", e => {
    const btn = e.target.closest(
      ".my-client-btn"
    );

    if (!btn || btn.disabled) return;

    openClientSpecs(
      btn.dataset.client || ""
    );
  });

  closeSpecsBtn?.addEventListener(
    "click",
    () => {
      specsCard.classList.remove("open");
    }
  );
}

async function init() {
  try {
    employeeId =
      new URLSearchParams(
        window.location.search
      ).get("emp") || "";

    if (!employeeId) {
      throw new Error(
        "Missing employee ID"
      );
    }

    employeeName = employeeId;

    currentWeekStart = formatDate(
      getWeekStart()
    );

    wireEvents();

    await loadBoard();
  } catch (err) {
    console.error(err);

    statusBox.textContent =
      err.message || "Error";
  }
}

document.addEventListener(
  "DOMContentLoaded",
  init
);
