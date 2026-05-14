/* =========================================================
   ATS Payroll (Admin UI) — Simple Powerful Payroll Screen
   - Keeps payroll flow
   - Allows full_admin / schedule_payroll / payroll / admin
   - Simple payroll run screen, export route preserved for future/admin use
========================================================= */

(() => {
  const API_URL = "https://script.google.com/macros/s/AKfycbx2bQ-SSeUHoihjbkYmkJ5-0Dw8JPqH8bhBQR3fbvLsOhDhbuPv0MdVeTdMW6zoVTsWsw/exec";

  const DEVICE_KEY_STORAGE = "ats_device_key_v1";
  const AUTH_STORAGE = "ats_admin_auth_v1";
  const TOKEN_STORAGE = "ats_admin_token_v1";

  const pillWho = document.getElementById("pillWho");
  const statusBox = document.getElementById("statusBox");
  const debugEl = document.getElementById("debug");

  const periodIdEl = document.getElementById("periodId");
  const periodStartEl = document.getElementById("periodStart");
  const periodEndEl = document.getElementById("periodEnd");
  const periodPaydayEl = document.getElementById("periodPayday");
  const periodStatusEl = document.getElementById("periodStatus");

  const btnGenerate = document.getElementById("btnGenerate");
  const btnRefresh = document.getElementById("btnRefresh");
  const btnLock = document.getElementById("btnLock");
  const btnAddOverride = document.getElementById("btnAddOverride");
  const btnPayouts = document.getElementById("btnPayouts");
  const btnPastPayroll = document.getElementById("btnPastPayroll");
  const btnExportQB = document.getElementById("btnExportQB");
  const btnExportQB2 = document.getElementById("btnExportQB2");

  const pastPayrollCard = document.getElementById("pastPayrollCard");
  const pastPayrollSelect = document.getElementById("pastPayrollSelect");
  const btnLoadPastPayroll = document.getElementById("btnLoadPastPayroll");
  const pastPayrollHint = document.getElementById("pastPayrollHint");

  const summaryHint = document.getElementById("summaryHint");
  const summaryBody = document.getElementById("summaryBody");

  const payoutCard = document.getElementById("payoutCard");
  const payoutHint = document.getElementById("payoutHint");
  const payoutBody = document.getElementById("payoutBody");
  const payoutTotals = document.getElementById("payoutTotals");

  const paymentsHint = document.getElementById("paymentsHint");
  const paymentsBody = document.getElementById("paymentsBody");
  const paymentsTotals = document.getElementById("paymentsTotals");

  let currentPeriodId = "";

  function setStatus(msg, kind) {
    if (!statusBox) return;
    statusBox.classList.remove("ok", "err");
    if (kind === "ok") statusBox.classList.add("ok");
    if (kind === "err") statusBox.classList.add("err");
    statusBox.textContent = msg || "";
  }

  function setDebug(msg) {
    if (debugEl) debugEl.textContent = msg || "";
  }

  function getDeviceKey() {
    let key = localStorage.getItem(DEVICE_KEY_STORAGE);
    if (!key) {
      key = "dev_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem(DEVICE_KEY_STORAGE, key);
    }
    return key;
  }

  function getTokenFromSession() {
    try {
      return (sessionStorage.getItem(TOKEN_STORAGE) || "").trim();
    } catch (e) {
      return "";
    }
  }

  function saveTokenToSession(token) {
    try {
      sessionStorage.setItem(TOKEN_STORAGE, token);
    } catch (e) {}
  }

  function captureTokenFromUrl() {
    try {
      const url = new URL(window.location.href);
      const t = (url.searchParams.get("t") || "").trim();

      if (t) {
        saveTokenToSession(t);
        url.searchParams.delete("t");
        window.history.replaceState({}, "", url.pathname + (url.search ? url.search : ""));
      }
    } catch (e) {}
  }

  function loadSessionAuth() {
    try {
      const raw = sessionStorage.getItem(AUTH_STORAGE);
      if (!raw) return null;

      const obj = JSON.parse(raw);
      if (obj && obj.ok && obj.employeeId && obj.role) return obj;
    } catch (e) {}

    return null;
  }

  function requireAdmin(authObj) {
    if (!authObj || !authObj.ok) return false;

    const role = String(authObj.role || "").trim().toLowerCase();

    return [
      "full_admin",
      "schedule_payroll",
      "payroll",
      "admin"
    ].includes(role);
  }

  function setWho(authObj) {
    if (!pillWho) return;
    pillWho.textContent = `${authObj.employeeId} • ${authObj.employeeName || authObj.employeeId}`;
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function jsonp(url) {
    return new Promise((resolve, reject) => {
      const cb = "cb_" + Math.random().toString(36).slice(2);
      const script = document.createElement("script");
      script.async = true;

      window[cb] = (data) => {
        try {
          resolve(data);
        } finally {
          try { delete window[cb]; } catch (e) {}
          try { script.remove(); } catch (e) {}
        }
      };

      script.onerror = () => {
        try { delete window[cb]; } catch (e) {}
        try { script.remove(); } catch (e) {}
        reject(new Error("JSONP failed to load: " + url));
      };

      script.src = url + (url.includes("?") ? "&" : "?") + "callback=" + cb;
      document.body.appendChild(script);
    });
  }

  function secureUrl(action, extraQs = "") {
    const t = getTokenFromSession();
    const d = getDeviceKey();

    const base =
      `${API_URL}?action=${encodeURIComponent(action)}` +
      `&t=${encodeURIComponent(t)}` +
      `&d=${encodeURIComponent(d)}`;

    return extraQs ? base + "&" + extraQs : base;
  }

  async function ping() {
    return jsonp(`${API_URL}?action=ping`);
  }

  async function payrollCurrent() {
    return jsonp(secureUrl("payroll_current"));
  }

  async function payrollSummary(periodId) {
    return jsonp(secureUrl("payroll_summary", `period_id=${encodeURIComponent(periodId)}`));
  }

  async function payrollGenerate(periodId) {
    return jsonp(secureUrl("payroll_generate", `period_id=${encodeURIComponent(periodId)}`));
  }

  async function payrollLock(periodId) {
    return jsonp(secureUrl("payroll_lock", `period_id=${encodeURIComponent(periodId)}`));
  }

  async function payrollPayouts(periodId) {
    return jsonp(secureUrl("payroll_payouts", `period_id=${encodeURIComponent(periodId)}`));
  }

  async function payrollPayments(periodId) {
    return jsonp(secureUrl("payroll_payments", `period_id=${encodeURIComponent(periodId)}`));
  }

  async function payrollPeriods() {
    return jsonp(secureUrl("payroll_periods"));
  }

  async function payrollExportQB(periodId) {
    return jsonp(secureUrl("payroll_export_qb", `period_id=${encodeURIComponent(periodId)}`));
  }

  function renderPeriod(p) {
    currentPeriodId = p?.periodId || p?.period || p?.id || currentPeriodId || "";

    if (periodIdEl) periodIdEl.textContent = currentPeriodId || "—";
    if (periodStartEl) periodStartEl.textContent = p?.startDate || p?.start || "—";
    if (periodEndEl) periodEndEl.textContent = p?.endDate || p?.end || "—";
    if (periodPaydayEl) periodPaydayEl.textContent = p?.payday || "—";
    if (periodStatusEl) periodStatusEl.textContent = p?.status || "—";

    if (summaryHint) {
      summaryHint.textContent = currentPeriodId
        ? `Review job count and total pay for ${currentPeriodId}.`
        : "Review job count and total pay before marking anyone paid.";
    }
  }

  function renderSummary(rows) {
    if (!summaryBody) return;

    const data = Array.isArray(rows) ? rows : [];

    if (!data.length) {
      summaryBody.innerHTML = `<tr><td colspan="5" style="color:#6b7280;padding:10px 12px;">No payroll summary yet. Click Generate / Refresh Payroll.</td></tr>`;
      return;
    }

    summaryBody.innerHTML = data.map(r => {
      const emp = r.employeeName || r.employeeId || "—";
      const jobs = Number(r.jobsCompleted || r.jobs || 0);
      const pay = Number(r.totalPay || r.total || 0).toFixed(2);
      const exc = Number(r.exceptionCount || r.exceptions || 0);
      const lu = r.lastUpdate || "";

      return `
        <tr>
          <td>${escapeHtml(emp)}</td>
          <td class="right">${jobs}</td>
          <td class="right">$${pay}</td>
          <td class="right">${exc}</td>
          <td>${escapeHtml(lu)}</td>
        </tr>
      `;
    }).join("");
  }

  function renderPayments(rows, period) {
    if (!paymentsBody) return;

    const data = Array.isArray(rows) ? rows : [];
    const start = period?.startDate || data[0]?.startDate || "";
    const end = period?.endDate || data[0]?.endDate || "";

    if (paymentsHint) {
      paymentsHint.textContent = start && end
        ? `Mark employees paid for ${start} → ${end}.`
        : "Mark payroll as paid after you review totals.";
    }

    if (!data.length) {
      paymentsBody.innerHTML = `<tr><td colspan="5" style="color:#6b7280;padding:10px 12px;">No payment rows yet. Generate payroll first.</td></tr>`;
      if (paymentsTotals) paymentsTotals.textContent = "";
      return;
    }

    const grand = data.reduce((sum, r) => sum + Number(r.totalPay || r.total || 0), 0);

    if (paymentsTotals) {
      paymentsTotals.textContent = `Grand Total: $${grand.toFixed(2)}`;
    }

    paymentsBody.innerHTML = data.map(r => {
      const empName = r.employeeName || r.employeeId || "—";
      const periodText = `${r.startDate || start} → ${r.endDate || end}`;
      const total = Number(r.totalPay || r.total || 0).toFixed(2);

      const paidAtText = r.paidAt ? ` • ${escapeHtml(r.paidAt)}` : "";
      const refText = r.reference ? ` • Ref: ${escapeHtml(r.reference)}` : "";
      const methodText = r.paidMethod ? ` • ${escapeHtml(r.paidMethod)}` : "";

      const isPaid = r.paid || String(r.status || "").toUpperCase() === "PAID";

      const status = isPaid
        ? `✔ PAID${paidAtText}${methodText}${refText}`
        : "NOT PAID";

      const btn = isPaid
        ? `<button class="btn secondary" disabled style="width:auto; padding:10px 12px; border-radius:12px;">PAID</button>`
        : `<button class="btn mark-paid-btn" data-period="${escapeHtml(r.periodId || currentPeriodId)}" data-emp="${escapeHtml(r.employeeId)}" style="width:auto; padding:10px 12px; border-radius:12px;">Mark Paid</button>`;

      return `
        <tr>
          <td>${escapeHtml(empName)}</td>
          <td>${escapeHtml(periodText)}</td>
          <td class="right">$${escapeHtml(total)}</td>
          <td>${status}</td>
          <td class="right">${btn}</td>
        </tr>
      `;
    }).join("");

    paymentsBody.querySelectorAll("button[data-emp]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const empId = btn.getAttribute("data-emp");
        if (!empId || !currentPeriodId) return;

        const ok = confirm(`Mark ${empId} as PAID for ${currentPeriodId}?`);
        if (!ok) return;

        const method = prompt("Paid method? (Check / ACH / Cash)", "Check") || "";
        const reference = prompt("Reference? (optional: check # / bank ref)", "") || "";
        const notes = prompt("Notes? (optional)", "") || "";

        try {
          setStatus("Marking as paid…");

          const res = await jsonp(secureUrl(
            "payroll_mark_paid",
            "periodId=" + encodeURIComponent(currentPeriodId) +
            "&employeeId=" + encodeURIComponent(empId) +
            "&paidMethod=" + encodeURIComponent(method) +
            "&reference=" + encodeURIComponent(reference) +
            "&notes=" + encodeURIComponent(notes)
          ));

          if (!res || !res.ok) throw new Error(res?.error || "payroll_mark_paid failed");

          await refreshPaymentsOnly();
          setStatus("Paid saved ✅", "ok");
        } catch (err) {
          setStatus(String(err?.message || err), "err");
        }
      });
    });
  }

  function renderPayouts(payouts) {
    if (!payoutCard || !payoutBody || !payoutHint || !payoutTotals) return;

    const employees = payouts?.employees || [];
    const grandTotal = Number(payouts?.grandTotal || 0).toFixed(2);

    if (!employees.length) {
      payoutBody.innerHTML = `<tr><td colspan="4" style="color:#6b7280;padding:10px 12px;">No job lines found for this period.</td></tr>`;
      payoutHint.textContent = currentPeriodId ? `Job lines for ${currentPeriodId}` : "—";
      payoutTotals.textContent = `Grand Total: $${grandTotal}`;
      payoutCard.classList.remove("hidden");
      return;
    }

    const rows = [];

    employees.forEach(emp => {
      (emp.jobs || []).forEach(j => {
        rows.push({
          employee: emp.employeeName || emp.employeeId,
          date: j.date || "",
          job: j.jobName || "",
          pay: Number(j.jobPay || 0).toFixed(2)
        });
      });
    });

    payoutBody.innerHTML = rows.map(r => `
      <tr>
        <td>${escapeHtml(r.employee)}</td>
        <td>${escapeHtml(r.date)}</td>
        <td>${escapeHtml(r.job)}</td>
        <td class="right">$${escapeHtml(r.pay)}</td>
      </tr>
    `).join("");

    payoutHint.textContent = currentPeriodId ? `Job lines for ${currentPeriodId}` : "—";
    payoutTotals.textContent = `Grand Total: $${grandTotal}`;
    payoutCard.classList.remove("hidden");
    payoutCard.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function refreshPaymentsOnly() {
    if (!currentPeriodId) return;

    const pay = await payrollPayments(currentPeriodId);
    if (!pay || !pay.ok) throw new Error(pay?.error || "payroll_payments failed");

    renderPayments(pay.rows, pay.period);
  }

  async function loadPeriod(periodId) {
    if (!periodId) return;

    currentPeriodId = periodId;

    setStatus(`Loading payroll period ${periodId}…`);

    const sum = await payrollSummary(periodId);
    if (!sum || !sum.ok) throw new Error(sum?.error || "payroll_summary failed");

    renderPeriod({
      periodId,
      startDate: sum.startDate || "",
      endDate: sum.endDate || "",
      status: sum.status || "—",
      payday: ""
    });

    renderSummary(sum.rows);

    const pay = await payrollPayments(periodId);
    if (!pay || !pay.ok) throw new Error(pay?.error || "payroll_payments failed");

    renderPayments(pay.rows, pay.period);

    if (payoutCard) payoutCard.classList.add("hidden");

    setStatus(`Loaded ${periodId} ✅`, "ok");
  }

  async function refreshAll() {
    setStatus("Loading current payroll week…");

    const cur = await payrollCurrent();
    if (!cur || !cur.ok) throw new Error(cur?.error || "payroll_current failed");

    renderPeriod(cur);

    if (!currentPeriodId) {
      setStatus("No current period id returned.", "err");
      return;
    }

    setStatus("Loading payroll summary…");

    const sum = await payrollSummary(currentPeriodId);
    if (!sum || !sum.ok) throw new Error(sum?.error || "payroll_summary failed");

    renderSummary(sum.rows);

    setStatus("Loading payment rows…");

    await refreshPaymentsOnly();

    if (payoutCard) payoutCard.classList.add("hidden");

    setStatus("Ready ✅", "ok");
  }

  async function showPastPayrollPicker() {
    if (!pastPayrollCard || !pastPayrollSelect) {
      const raw = prompt("Enter payroll period ID to view (YYYY-MM-DD_to_YYYY-MM-DD):", currentPeriodId || "");
      if (raw) await loadPeriod(raw.trim());
      return;
    }

    pastPayrollCard.classList.toggle("hidden");
    if (pastPayrollCard.classList.contains("hidden")) return;

    setStatus("Loading past payroll periods…");

    const res = await payrollPeriods();
    if (!res || !res.ok) throw new Error(res?.error || "payroll_periods failed");

    const periods = Array.isArray(res.periods) ? res.periods : [];

    if (!periods.length) {
      pastPayrollSelect.innerHTML = `<option value="">No saved periods found</option>`;
      if (pastPayrollHint) pastPayrollHint.textContent = "No past payroll periods found yet.";
      setStatus("No past payroll periods found yet.", "ok");
      return;
    }

    pastPayrollSelect.innerHTML = periods.map(p => {
      const id = p.periodId || p.period || "";
      const label = `${id} • ${p.status || "OPEN"}`;
      return `<option value="${escapeHtml(id)}" ${id === currentPeriodId ? "selected" : ""}>${escapeHtml(label)}</option>`;
    }).join("");

    if (pastPayrollHint) {
      pastPayrollHint.textContent = `${periods.length} payroll period(s) found.`;
    }

    setStatus("Choose a payroll period, then click Load Selected Week.", "ok");
  }

  async function exportCurrentQB() {
    if (!currentPeriodId) return;

    setStatus(`Opening payroll export sheet for ${currentPeriodId}…`);

    const res = await payrollExportQB(currentPeriodId);
    if (!res || !res.ok) throw new Error(res?.error || "payroll_export_qb failed");

    if (res.url) {
      window.open(res.url, "_blank");
    } else {
      alert("No sheet URL returned.");
    }

    setStatus(`Payroll export sheet opened for ${currentPeriodId} ✅`, "ok");
  }

  async function addOneOffJob() {
    try {
      const employeeId = prompt("Employee ID (e.g., E04):");
      if (!employeeId) return;

      const date = prompt("Date (YYYY-MM-DD):");
      if (!date) return;

      const jobName = prompt("Job Name:");
      if (!jobName) return;

      const jobPay = prompt("Job Pay (number):", "");
      const startTime = prompt("Start Time (HH:MM, optional):", "");
      const endTime = prompt("End Time (HH:MM, optional):", "");
      const address = prompt("Address (optional):", "");
      const notes = prompt("Notes (optional):", "");

      const t = getTokenFromSession();
      const d = getDeviceKey();

      setStatus("Adding one-off job to Overrides…");

      await fetch(`${API_URL}?action=schedule_override_add&t=${encodeURIComponent(t)}&d=${encodeURIComponent(d)}`, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          employeeId,
          date,
          jobName,
          jobPay,
          startTime,
          endTime,
          address,
          notes
        })
      });

      setStatus("One-off job added ✅", "ok");
      alert("Added. This will appear in Today/This Week once the schedule page reads Overrides.");
    } catch (err) {
      setStatus(String(err?.message || err), "err");
    }
  }

  async function boot() {
    setDebug(`API_URL: ${API_URL}`);
    captureTokenFromUrl();

    const authObj = loadSessionAuth();

    if (!requireAdmin(authObj)) {
      setStatus("Denied: admin access required.\n\nOpen this from the Admin Panel.", "err");
      if (pillWho) pillWho.textContent = "Denied";
      return;
    }

    setWho(authObj);

    if (!getTokenFromSession()) {
      setStatus("Denied: missing token.\n\nOpen from Admin Panel or use a link with ?t=TOKEN once.", "err");
      return;
    }

    setStatus("Checking secure API…");

    const p = await ping();
    if (!p || !p.ok) throw new Error("Ping did not return ok");

    await refreshAll();

    if (btnRefresh) {
      btnRefresh.onclick = () =>
        refreshAll().catch(err => setStatus(String(err?.message || err), "err"));
    }

    if (btnGenerate) {
      btnGenerate.onclick = async () => {
        try {
          if (!currentPeriodId) return;

          setStatus("Generating / rebuilding payroll summary…");

          const res = await payrollGenerate(currentPeriodId);
          if (!res || !res.ok) throw new Error(res?.message || res?.error || "payroll_generate failed");

          await loadPeriod(currentPeriodId);
          setStatus("Payroll summary rebuilt ✅", "ok");
        } catch (err) {
          setStatus(String(err?.message || err), "err");
        }
      };
    }

    if (btnLock) {
      btnLock.onclick = async () => {
        try {
          if (!currentPeriodId) return;

          const ok = confirm(`Lock payroll period ${currentPeriodId}?`);
          if (!ok) return;

          setStatus("Locking period…");

          const res = await payrollLock(currentPeriodId);
          if (!res || !res.ok) throw new Error(res?.error || "payroll_lock failed");

          await loadPeriod(currentPeriodId);
          setStatus("Payroll period locked ✅", "ok");
        } catch (err) {
          setStatus(String(err?.message || err), "err");
        }
      };
    }

    if (btnAddOverride) {
      btnAddOverride.onclick = () => addOneOffJob();
    }

    if (btnPastPayroll) {
      btnPastPayroll.onclick = () =>
        showPastPayrollPicker().catch(err => setStatus(String(err?.message || err), "err"));
    }

    if (btnLoadPastPayroll) {
      btnLoadPastPayroll.onclick = () =>
        loadPeriod(pastPayrollSelect?.value || "").catch(err => setStatus(String(err?.message || err), "err"));
    }

    if (btnExportQB) {
      btnExportQB.onclick = () =>
        exportCurrentQB().catch(err => setStatus(String(err?.message || err), "err"));
    }

    if (btnExportQB2) {
      btnExportQB2.onclick = () =>
        exportCurrentQB().catch(err => setStatus(String(err?.message || err), "err"));
    }

    if (btnPayouts) {
      btnPayouts.onclick = async () => {
        try {
          if (!currentPeriodId) return;

          setStatus("Loading job breakdown…");

          const res = await payrollPayouts(currentPeriodId);
          if (!res || !res.ok) throw new Error(res?.error || "payroll_payouts failed");

          renderPayouts(res.payouts);
          setStatus("Job breakdown loaded ✅", "ok");
        } catch (err) {
          setStatus(String(err?.message || err), "err");
        }
      };
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () =>
      boot().catch(err => setStatus(String(err?.message || err), "err"))
    );
  } else {
    boot().catch(err => setStatus(String(err?.message || err), "err"));
  }
})();
