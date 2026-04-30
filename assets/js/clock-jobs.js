(function () {
  const API_URL = "YOUR_APPS_SCRIPT_URL"; // same as clock.js

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
        delete window[cb];
        script.remove();
        resolve(data);
      };

      script.onerror = reject;
      script.src = url + "&callback=" + cb;
      document.body.appendChild(script);
    });
  }

  function mapLink(address) {
    return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(address);
  }

  async function loadJobs() {
    const list = document.getElementById("jobsList");
    if (!list) return;

    list.innerHTML = "Loading jobs...";

    try {
      const url = `${API_URL}?action=clock_today_jobs&t=${getToken()}&d=${getDevice()}`;
      const res = await jsonp(url);

      if (!res.ok || !res.jobs.length) {
        list.innerHTML = "No jobs scheduled today.";
        return;
      }

      list.innerHTML = res.jobs.map(j => `
        <div style="margin-bottom:12px;">
          <strong>${j.jobName}</strong><br>
          <a href="${mapLink(j.address)}" target="_blank">📍 ${j.address}</a><br>
          💰 $${j.pay}<br>
          <span class="muted">${j.notes || ""}</span>
        </div>
      `).join("");

    } catch (err) {
      list.innerHTML = "Error loading jobs.";
      console.error(err);
    }
  }

  document.addEventListener("DOMContentLoaded", loadJobs);
})();
