(function () {
  const API_URL = "https://script.google.com/macros/s/AKfycbx2bQ-SSeUHoihjbkYmkJ5-0Dw8JPqH8bhBQR3fbvLsOhDhbuPv0MdVeTdMW6zoVTsWsw/exec";

  function getToken() {
    return sessionStorage.getItem("ats_admin_token_v1") || "";
  }

  function getDevice() {
    return localStorage.getItem("ats_device_key_v1") || "";
  }

  function jsonp(url) {
    return new Promise((resolve, reject) => {
      const cb = "cb_" + Math.random().toString(36).slice(2);
      const script = document.createElement("script");

      window[cb] = (data) => {
        try { resolve(data); }
        finally {
          try { delete window[cb]; } catch (e) {}
          try { script.remove(); } catch (e) {}
        }
      };

      script.onerror = () => reject(new Error("Jobs JSONP failed"));
      script.src = url + (url.includes("?") ? "&" : "?") + "callback=" + cb;
      document.body.appendChild(script);
    });
  }

  function escapeHtml(s) {
    return String(s || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function mapLink(address) {
    return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(address || "");
  }

function setSelectedJob(job) {
  const select = document.getElementById("jobSelect");
  if (!select) return false;

  const jobId = job.scheduleKey || job.clientId || job.jobName || "";
  const jobName = job.jobName || job.clientName || "";
  const jobPay = job.jobPay || job.pay || "";

  let opt = Array.from(select.options).find(o => o.value === jobId);

  if (!opt) {
    opt = document.createElement("option");
    opt.value = jobId;
    opt.textContent = jobName;
    select.appendChild(opt);
  }

  opt.dataset.name = jobName;
  opt.dataset.pay = jobPay;

  select.value = jobId;

  select.dispatchEvent(new Event("change", { bubbles: true }));

  return true;
}

    setSelectedJob(job);

    if (typeof window.clockIn === "function") {
      window.clockIn();
    } else if (typeof clockIn === "function") {
      clockIn();
    } else {
      alert("Clock system not loaded.");
    }
  };

  async function loadJobs() {
    const list =
      document.getElementById("todayJobsList") ||
      document.getElementById("jobsList");

    if (!list) return;

    list.innerHTML = "Loading today’s jobs...";

    try {
      const emp = new URLSearchParams(window.location.search).get("emp") || "";
const url = `${API_URL}?action=clock_today_jobs&emp=${encodeURIComponent(emp)}`;

      const res = await jsonp(url);

      if (!res || !res.ok) {
        list.innerHTML = "Could not load today’s jobs.";
        return;
      }

      const jobs = Array.isArray(res.jobs) ? res.jobs : [];
      window.ATS_TODAY_JOBS = jobs;

      if (!jobs.length) {
        list.innerHTML = "No jobs scheduled today.";
        return;
      }

      list.innerHTML = jobs.map((j, index) => {
        const jobName = escapeHtml(j.jobName || j.clientName || "Cleaning Job");
        const address = escapeHtml(j.address || "");
        const notes = escapeHtml(j.notes || j.note || "");

        return `
          <div style="margin-bottom:16px;padding:14px;border:1px solid rgba(255,255,255,.18);border-radius:14px;background:rgba(255,255,255,.06);">
            <strong>${jobName}</strong><br>

            ${
              address
                ? `<a href="${mapLink(j.address)}" target="_blank" rel="noopener">📍 ${address}</a><br>`
                : `<span style="opacity:.75;">No address listed</span><br>`
            }

            ${notes ? `<div style="margin-top:6px;opacity:.85;">${notes}</div>` : ""}

            <button class="button" type="button" style="margin-top:10px;" onclick="clockInJob(${index})">
              Clock In
            </button>
          </div>
        `;
      }).join("");

    } catch (err) {
      list.innerHTML = "Error loading today’s jobs.";
      console.error(err);
    }
  }

  document.addEventListener("DOMContentLoaded", loadJobs);
})();
function setSelectedJob(job) {
  const select = document.getElementById("jobSelect");
  if (!select) return false;

  const jobId = job.scheduleKey || job.clientId || job.jobName || "";
  const jobName = job.jobName || job.clientName || "";
  const jobPay = job.jobPay || job.pay || "";

  let opt = Array.from(select.options).find(o => o.value === jobId);

  if (!opt) {
    opt = document.createElement("option");
    opt.value = jobId;
    opt.textContent = jobName;
    select.appendChild(opt);
  }

  opt.dataset.name = jobName;
  opt.dataset.pay = jobPay;

  select.value = jobId;

  // 🔥 THIS is the missing trigger
  select.dispatchEvent(new Event("change", { bubbles: true }));

  return true;
}

window.clockInJob = function (index) {
  const jobs = window.ATS_TODAY_JOBS || [];
  const job = jobs[index];

  if (!job) {
    alert("Job not found.");
    return;
  }

  const selected = setSelectedJob(job);
  if (!selected) {
    alert("Could not select job.");
    return;
  }

  if (typeof window.clockIn === "function") {
    window.clockIn();
  } else {
    alert("Clock system not loaded.");
  }
};
