/* =========================================================
   ATS Payroll (Admin UI) — Card Layout Version
   - Auto-loads current payroll
   - Renders Payroll Review as expandable employee cards
   - Renders Payroll Finalization as employee cards instead of wide table
   - Keeps Add Job to Employee, Past Payroll, Unlock, QB popup, and finalize routes working
   - Uses JSONP unified Apps Script backend
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
  const periodReadableEl = document.getElementById("periodReadable");
  const periodStartEl = document.getElementById("periodStart");
  const periodEndEl = document.getElementById("periodEnd");
  const periodPaydayEl = document.getElementById("periodPayday");
  const periodStatusEl = document.getElementById("periodStatus");

  const btnOpenQB = document.getElementById("btnOpenQB");
  const btnFinalizeQB = document.getElementById("btnFinalizeQB");
  const pastPayrollSelect = document.getElementById("pastPayrollSelect");
  const btnLoadPastPayroll = document.getElementById("btnLoadPastPayroll");
  const pastPayrollHint = document.getElementById("pastPayrollHint");
  const unlockPin = document.getElementById("unlockPin");
  const unlockReason = document.getElementById("unlockReason");
  const btnUnlockPeriod = document.getElementById("btnUnlockPeriod");

  const addJobDate = document.getElementById("addJobDate");
  const addJobEmployee = document.getElementById("addJobEmployee");
  const addJobSearch = document.getElementById("addJobSearch");
  const addJobSuggestions = document.getElementById("addJobSuggestions");
  const addJobSelected = document.getElementById("addJobSelected");
  const addJobNotes = document.getElementById("addJobNotes");
  const btnAddJobToEmployee = document.getElementById("btnAddJobToEmployee");

  const payoutCard = document.getElementById("payoutCard");
  const payoutHint = document.getElementById("payoutHint");
  const payoutBody = document.getElementById("payoutBody");
  const payoutTotals = document.getElementById("payoutTotals");

  const paymentsHint = document.getElementById("paymentsHint");
  const paymentsBody = document.getElementById("paymentsBody");
  const paymentsTotals = document.getElementById("paymentsTotals");

  let currentPeriodId = "";
  let currentPeriodStatus = "";
  let currentPeriodStart = "";
  let currentPeriodEnd = "";
  let payrollEmployees = [];
  let allJobs = [];
  let selectedAddJob = null;
  let employeeRouteLoaded = false;
  let jobsRouteLoaded = false;

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function normalizeStatusLabel(status, qbStatus) {
    const s = String(status || "").toUpperCase();
    const qb = String(qbStatus || "").toUpperCase();

    if (s === "LOCKED" || qb === "ENTERED_IN_QB") return "FINALIZED";
    if (s === "NET_PAID" || s === "PAID") return "FINALIZED";
    if (s === "REOPENED" || qb === "REOPENED") return "REOPENED";
    if (s === "OPEN") return "OPEN";
    return s || "OPEN";
  }

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
    try { return (sessionStorage.getItem(TOKEN_STORAGE) || "").trim(); }
    catch (e) { return ""; }
  }

  function saveTokenToSession(token) {
    try { sessionStorage.setItem(TOKEN_STORAGE, token); } catch (e) {}
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
    return ["full_admin", "schedule_payroll", "payroll", "admin"].includes(role);
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

  function cleanMoneyNumber(v) {
    const raw = String(v ?? "").replace(/[$,]/g, "").trim();
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  }

  function money(v) {
    return "$" + cleanMoneyNumber(v).toFixed(2);
  }

  function employeeInitials(name) {
    const parts = String(name || "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    if (!parts.length) return "?";
    return parts.slice(0, 2).map(p => p.charAt(0).toUpperCase()).join("");
  }

  function formatDisplayDate(ymd) {
    const s = String(ymd || "").trim();
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return s || "—";
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  }

  function formatDisplayRange(start, end) {
    const s = String(start || "").trim();
    const e = String(end || "").trim();
    if (!s || !e) return "—";

    const sm = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const em = e.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!sm || !em) return `${s} → ${e}`;

    const sd = new Date(Number(sm[1]), Number(sm[2]) - 1, Number(sm[3]));
    const ed = new Date(Number(em[1]), Number(em[2]) - 1, Number(em[3]));

    if (sd.getFullYear() === ed.getFullYear() && sd.getMonth() === ed.getMonth()) {
      return `${sd.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${ed.toLocaleDateString(undefined, { day: "numeric", year: "numeric" })}`;
    }

    return `${formatDisplayDate(s)} – ${formatDisplayDate(e)}`;
  }

  function jsonp(url) {
    return new Promise((resolve, reject) => {
      const cb = "cb_" + Math.random().toString(36).slice(2);
      const script = document.createElement("script");
      script.async = true;

      window[cb] = (data) => {
        try { resolve(data); }
        finally {
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
    const base = `${API_URL}?action=${encodeURIComponent(action)}&t=${encodeURIComponent(t)}&d=${encodeURIComponent(d)}`;
    return extraQs ? base + "&" + extraQs : base;
  }

  async function ping() { return jsonp(`${API_URL}?action=ping`); }
  async function payrollCurrent() { return jsonp(secureUrl("payroll_current")); }
  async function payrollSummary(periodId) { return jsonp(secureUrl("payroll_summary", `period_id=${encodeURIComponent(periodId)}`)); }
  async function payrollGenerate(periodId) { return jsonp(secureUrl("payroll_generate", `period_id=${encodeURIComponent(periodId)}`)); }
  async function payrollPayouts(periodId) { return jsonp(secureUrl("payroll_payouts", `period_id=${encodeURIComponent(periodId)}`)); }
  async function payrollPayments(periodId) { return jsonp(secureUrl("payroll_payments", `period_id=${encodeURIComponent(periodId)}`)); }
  async function payrollPeriods() { return jsonp(secureUrl("payroll_periods")); }
  async function payrollEmployeesList() { return jsonp(secureUrl("payroll_employees")); }
  async function clockJobsList() { return jsonp(secureUrl("clock_jobs_list")); }

  async function payrollAddJob(periodId, payload) {
    const qs = new URLSearchParams();
    qs.set("periodId", periodId || "");
    Object.entries(payload || {}).forEach(([key, value]) => qs.set(key, value == null ? "" : String(value)));
    return jsonp(secureUrl("payroll_add_job", qs.toString()));
  }

  async function payrollFinalizeQB(periodId, rows) {
    const payload = encodeURIComponent(JSON.stringify({ rows: rows || [] }));
    return jsonp(secureUrl("payroll_finalize_qb", `periodId=${encodeURIComponent(periodId)}&payload=${payload}`));
  }

  async function payrollUnlock(periodId, pin, reason) {
    return jsonp(secureUrl(
      "payroll_unlock",
      `periodId=${encodeURIComponent(periodId)}&pin=${encodeURIComponent(pin)}&reason=${encodeURIComponent(reason)}`
    ));
  }

  function openQuickBooksPopup(e) {
    if (e) e.preventDefault();

    const screenW = window.screen.availWidth || 1920;
    const screenH = window.screen.availHeight || 1080;
    const qbWidth = Math.floor(screenW * 0.52);
    const qbHeight = Math.floor(screenH * 0.95);
    const left = screenW - qbWidth;
    const top = 20;

    const qbWindow = window.open(
      "https://www.quickbooks.com",
      "ATSQuickBooksPayroll",
      [
        `width=${qbWidth}`,
        `height=${qbHeight}`,
        `left=${left}`,
        `top=${top}`,
        "resizable=yes",
        "scrollbars=yes"
      ].join(",")
    );

    if (qbWindow) {
      try { qbWindow.focus(); } catch (err) {}
    }

    try {
      window.moveTo(0, 0);
      window.resizeTo(screenW - qbWidth, screenH);
    } catch (err) {
      console.log("Browser blocked window resize:", err);
    }
  }

  function renderPeriod(p) {
    currentPeriodId = p?.periodId || p?.period || p?.id || currentPeriodId || "";
    currentPeriodStatus = p?.status || currentPeriodStatus || "";
    currentPeriodStart = p?.startDate || p?.start || currentPeriodStart || "";
    currentPeriodEnd = p?.endDate || p?.end || currentPeriodEnd || "";

    if (periodReadableEl) periodReadableEl.textContent = formatDisplayRange(currentPeriodStart, currentPeriodEnd);
    if (periodIdEl) periodIdEl.textContent = currentPeriodId || "—";
    if (periodStartEl) periodStartEl.textContent = formatDisplayDate(currentPeriodStart);
    if (periodEndEl) periodEndEl.textContent = formatDisplayDate(currentPeriodEnd);
    if (periodPaydayEl) periodPaydayEl.textContent = p?.payday || "—";
    if (periodStatusEl) periodStatusEl.textContent = normalizeStatusLabel(currentPeriodStatus);
  }

  function normalizeEmployeeList(list) {
    const seen = {};
    const placeholderPattern = /^employee\s+(one|two|three|four|five|six|seven|eight|nine|ten)$/i;

    return (Array.isArray(list) ? list : [])
      .map(e => ({
        employeeId: String(e.employeeId || e.id || e.EmployeeID || e["Employee ID"] || "").trim().toUpperCase(),
        employeeName: String(e.employeeName || e.name || e.EmployeeName || e["Employee Name"] || "").trim(),
        active: e.active
      }))
      .filter(e =>
        e.employeeId &&
        e.employeeName &&
        !placeholderPattern.test(e.employeeName) &&
        !seen[e.employeeId] &&
        (seen[e.employeeId] = true)
      );
  }

  function renderAddJobEmployees(rows) {
    const fallback = normalizeEmployeeList(rows);
    if (!payrollEmployees.length && fallback.length) payrollEmployees = fallback;

    if (!addJobEmployee) return;
    const current = addJobEmployee.value;

    addJobEmployee.innerHTML = `<option value="">Choose employee…</option>` + payrollEmployees.map(e =>
      `<option value="${escapeHtml(e.employeeId)}">${escapeHtml(e.employeeId)} • ${escapeHtml(e.employeeName)}</option>`
    ).join("");

    if (current && payrollEmployees.some(e => e.employeeId === current)) addJobEmployee.value = current;
  }

  async function loadPayrollEmployeesList() {
    const res = await payrollEmployeesList();
    if (!res || !res.ok) throw new Error(res?.error || "payroll_employees failed");

    const list = res.employees || res.rows || res.employeeRows || [];
    payrollEmployees = normalizeEmployeeList(list);
    employeeRouteLoaded = true;
    renderAddJobEmployees([]);
  }

  function normalizeJobList(list) {
    const seen = {};
    return (Array.isArray(list) ? list : [])
      .map(j => {
        const clientName = String(j.clientName || j.client || j.name || j.jobName || "").trim();
        const name = String(j.name || j.jobName || clientName || "").trim();
        const id = String(j.id || j.jobId || j.clientId || name.replace(/\s+/g, "_")).trim();
        const pay = cleanMoneyNumber(j.pay ?? j.jobPay ?? j.amount ?? j.fullPay ?? j.halfPay ?? 0);
        return {
          id,
          name,
          clientName,
          pay,
          address: String(j.address || "").trim()
        };
      })
      .filter(j => j.id && j.name && j.pay > 0 && !seen[j.id] && (seen[j.id] = true));
  }

  async function loadClockJobsList() {
    const res = await clockJobsList();
    if (!res || !res.ok) throw new Error(res?.error || "clock_jobs_list failed");
    allJobs = normalizeJobList(res.jobs || res.rows || res.clientRows || []);
    jobsRouteLoaded = true;
  }

  function renderPayments(rows, period) {
    if (!paymentsBody) return;

    const data = Array.isArray(rows) ? rows : [];
    const start = period?.startDate || data[0]?.startDate || currentPeriodStart || "";
    const end = period?.endDate || data[0]?.endDate || currentPeriodEnd || "";

    if (paymentsHint) {
      paymentsHint.textContent = start && end
        ? `Enter Taxes/Adjustments and final net pay for ${formatDisplayRange(start, end)}. Click Finalize Payroll once after ALL employees are finalized.`
        : "Enter Taxes/Adjustments and final net pay, then click Finalize Payroll once.";
    }

    renderAddJobEmployees(data);

    if (!data.length) {
      paymentsBody.innerHTML = `<div class="empty-card">No payment rows yet.</div>`;
      if (paymentsTotals) paymentsTotals.textContent = "";
      return;
    }

    const grossTotal = data.reduce((sum, r) => sum + cleanMoneyNumber(r.totalPay || r.grossPay || r.total || 0), 0);
    const taxTotal = data.reduce((sum, r) => sum + cleanMoneyNumber(r.taxAdjustments || r.taxesAdjustments || r.taxAdjustment || 0), 0);
    const netTotal = data.reduce((sum, r) => sum + cleanMoneyNumber(r.netPay || r.finalNetPay || 0), 0);
    if (paymentsTotals) {
      paymentsTotals.textContent = `Gross Total: ${money(grossTotal)} • Taxes/Adj: ${money(taxTotal)}${netTotal ? ` • Net Recorded: ${money(netTotal)}` : ""}`;
    }

    paymentsBody.innerHTML = data.map(r => {
      const empName = r.employeeName || r.employeeId || "—";
      const employeeId = r.employeeId || "";
      const startDate = r.startDate || start;
      const endDate = r.endDate || end;
      const periodText = `${formatDisplayDate(startDate)} → ${formatDisplayDate(endDate)}`;
      const gross = Number(r.totalPay || r.grossPay || r.total || 0).toFixed(2);
      const taxAdjustments = r.taxAdjustments || r.taxesAdjustments || r.taxAdjustment || "";
      const netPay = r.netPay || r.finalNetPay || "";
      const finalMethod = r.finalPaidMethod || r.paidMethod || "Check";
      const finalRef = r.finalReference || r.reference || "";
      const finalNotes = r.finalPaymentNotes || r.paymentNotes || "";
      const statusText = String(r.status || "").toUpperCase();
      const qbStatus = String(r.qbStatus || "").toUpperCase();
      const periodUnlocked = String(currentPeriodStatus || "").toUpperCase() === "OPEN";
      const isReopened = qbStatus === "REOPENED" || statusText === "OPEN" || statusText === "REOPENED";
      const isFinalPaid = !periodUnlocked && !isReopened && (r.finalPaid || statusText === "NET_PAID" || statusText === "PAID" || qbStatus === "ENTERED_IN_QB");
      const cleanStatus = normalizeStatusLabel(statusText, qbStatus);

      if (isFinalPaid) {
        return `
          <div class="final-employee-card">
            <div class="final-top">
              <div class="final-name-block">
                <div class="payroll-avatar">${escapeHtml(employeeInitials(empName))}</div>
                <div>
                  <div class="final-name">${escapeHtml(empName)}</div>
                  <div class="final-period">${escapeHtml(periodText)}</div>
                </div>
              </div>
              <div class="final-status">✔ ${escapeHtml(cleanStatus)}</div>
            </div>
            <div class="final-body">
              <div class="final-field"><label>Gross</label><div class="final-value">$${escapeHtml(gross)}</div></div>
              <div class="final-field"><label>Taxes / Adj</label><div class="final-value">${money(taxAdjustments)}</div></div>
              <div class="final-field"><label>Net Paid</label><div class="final-value gold">${money(netPay)}</div></div>
              <div class="final-field"><label>Method</label><div class="final-value">${escapeHtml(finalMethod || "Recorded")}</div></div>
              <div class="final-field"><label>Reference</label><div class="final-value">${escapeHtml(finalRef || "")}</div></div>
              <div class="final-field"><label>Notes</label><div class="final-value">${escapeHtml(finalNotes || "")}</div></div>
            </div>
          </div>
        `;
      }

      return `
        <div class="final-employee-card">
          <div class="final-top">
            <div class="final-name-block">
              <div class="payroll-avatar">${escapeHtml(employeeInitials(empName))}</div>
              <div>
                <div class="final-name">${escapeHtml(empName)}</div>
                <div class="final-period">${escapeHtml(periodText)}</div>
              </div>
            </div>
            <div class="final-status">${escapeHtml(cleanStatus === "FINALIZED" ? "READY" : cleanStatus)}</div>
          </div>
          <div class="final-body">
            <div class="final-field"><label>Gross</label><div class="final-value">$${escapeHtml(gross)}</div></div>
            <div class="final-field"><label>Taxes / Adj</label><input class="pay-input tax-adjustment-input" data-emp="${escapeHtml(employeeId)}" placeholder="0.00" inputmode="decimal" value="${escapeHtml(taxAdjustments)}" /></div>
            <div class="final-field"><label>Net Paid</label><input class="pay-input net-pay-input" data-emp="${escapeHtml(employeeId)}" placeholder="0.00" inputmode="decimal" value="${escapeHtml(netPay)}" /></div>
            <div class="final-field">
              <label>Method</label>
              <select class="pay-method" data-emp="${escapeHtml(employeeId)}">
                <option value="Check" ${finalMethod === "Check" ? "selected" : ""}>Check</option>
                <option value="Zelle" ${finalMethod === "Zelle" ? "selected" : ""}>Zelle</option>
                <option value="Venmo" ${finalMethod === "Venmo" ? "selected" : ""}>Venmo</option>
                <option value="Cash App" ${finalMethod === "Cash App" ? "selected" : ""}>Cash App</option>
                <option value="Cash" ${finalMethod === "Cash" ? "selected" : ""}>Cash</option>
                <option value="Other" ${finalMethod === "Other" ? "selected" : ""}>Other</option>
              </select>
            </div>
            <div class="final-field"><label>Reference</label><input class="pay-input check-ref" data-emp="${escapeHtml(employeeId)}" placeholder="Check # / Ref" value="${escapeHtml(finalRef)}" /></div>
            <div class="final-field"><label>Notes</label><input class="pay-input pay-notes" data-emp="${escapeHtml(employeeId)}" placeholder="Notes" value="${escapeHtml(finalNotes)}" /><div class="small qb-row-status" data-emp="${escapeHtml(employeeId)}">${escapeHtml(cleanStatus)}</div></div>
          </div>
        </div>
      `;
    }).join("");

    paymentsBody.querySelectorAll(".pay-method").forEach(sel => {
      sel.addEventListener("change", () => {
        const emp = sel.dataset.emp;
        const refInput = paymentsBody.querySelector(`.check-ref[data-emp="${emp}"]`);
        if (!refInput) return;
        refInput.placeholder = sel.value === "Check" ? "Check #" : "Ref # optional";
      });
      sel.dispatchEvent(new Event("change"));
    });
  }

  function renderPayouts(payouts) {
    if (!payoutCard || !payoutBody || !payoutHint || !payoutTotals) return;

    const employees = payouts?.employees || [];
    const grandTotal = Number(payouts?.grandTotal || 0);

    if (!employees.length) {
      payoutBody.innerHTML = `<div class="empty-card">No job lines found for this period.</div>`;
      payoutHint.textContent = currentPeriodId ? `Payroll review for ${currentPeriodId}` : "—";
      payoutTotals.textContent = `Grand Total: ${money(grandTotal)}`;
      payoutCard.classList.remove("hidden");
      return;
    }

    payoutBody.innerHTML = employees.map(emp => {
      const jobs = Array.isArray(emp.jobs) ? emp.jobs : [];
      const employeeTotal = Number(emp.totalPay || jobs.reduce((sum, j) => sum + Number(j.jobPay ?? j.pay ?? j.amount ?? 0), 0));
      const hasManyJobs = jobs.length > 2;

      return `
        <details class="payroll-employee-card" ${hasManyJobs ? "" : "open"}>
          <summary>
            <div class="payroll-card-main">
              <div class="payroll-person">
                <div class="payroll-avatar">${escapeHtml(employeeInitials(emp.employeeName || emp.employeeId))}</div>
                <div>
                  <div class="payroll-name">${escapeHtml(emp.employeeName || emp.employeeId || "—")}</div>
                  <div class="payroll-sub">${jobs.length} job${jobs.length === 1 ? "" : "s"}${hasManyJobs ? " • click to expand" : ""}</div>
                </div>
              </div>
              <div class="payroll-total">
                <div class="payroll-total-label">Total</div>
                <div class="payroll-total-amount">${money(employeeTotal)}</div>
                <div class="payroll-expand-note">${hasManyJobs ? "View jobs" : ""}</div>
              </div>
            </div>
          </summary>
          <div class="payroll-card-body">
            ${jobs.length ? jobs.map(j => {
              const rawJob = j.clientName || j.jobName || j.job || j.client || j.jobId || "—";
              const rawPay = j.jobPay ?? j.pay ?? j.amount ?? 0;
              return `
                <div class="job-line">
                  <div class="job-date">${escapeHtml(formatDisplayDate(j.date || ""))}</div>
                  <div class="job-name">${escapeHtml(rawJob)}</div>
                  <div class="job-pay">${money(rawPay)}</div>
                </div>
              `;
            }).join("") : `<div class="empty-card">No job lines found.</div>`}
          </div>
        </details>
      `;
    }).join("");

    payoutHint.textContent = currentPeriodStart && currentPeriodEnd
      ? `Payroll review for ${formatDisplayRange(currentPeriodStart, currentPeriodEnd)}`
      : (currentPeriodId ? `Payroll review for ${currentPeriodId}` : "—");
    payoutTotals.textContent = `Grand Total: ${money(grandTotal)}`;
    payoutCard.classList.remove("hidden");
  }

  async function loadPeriod(periodId) {
    if (!periodId) return;
    currentPeriodId = periodId;

    setStatus(`Loading payroll period ${periodId}…`);
    const sum = await payrollSummary(periodId);
    if (!sum || !sum.ok) throw new Error(sum?.error || "payroll_summary failed");

    const periodStatus = sum.status || sum.periodStatus || currentPeriodStatus || "OPEN";
    renderPeriod({ periodId, startDate: sum.startDate || "", endDate: sum.endDate || "", status: periodStatus, payday: "" });
    setAddJobDateDefault();

    const payoutRes = await payrollPayouts(periodId);
    if (payoutRes && payoutRes.ok) renderPayouts(payoutRes.payouts);

    const pay = await payrollPayments(periodId);
    if (!pay || !pay.ok) throw new Error(pay?.error || "payroll_payments failed");
    if (pay.period && (pay.period.status || pay.periodStatus)) currentPeriodStatus = pay.period.status || pay.periodStatus;
    renderPayments(pay.rows, pay.period);

    setStatus(`${periodId} loaded ✅`, "ok");
  }

  async function autoloadCurrentPayroll() {
    setStatus("Loading…");
    const cur = await payrollCurrent();
    if (!cur || !cur.ok) throw new Error(cur?.error || "payroll_current failed");
    renderPeriod(cur);

    if (!currentPeriodId) {
      setStatus("No current period id returned.", "err");
      return;
    }

    if (String(cur.status || "").toUpperCase() !== "LOCKED") {
      setStatus("Updating…");
      const gen = await payrollGenerate(currentPeriodId);
      if (!gen || !gen.ok) {
        if (String(gen?.error || "") !== "period_locked") throw new Error(gen?.message || gen?.error || "payroll_generate failed");
      }
    }

    await loadPeriod(currentPeriodId);
  }

  async function showPastPayrollPicker() {
    if (!pastPayrollSelect) return;
    const res = await payrollPeriods();
    if (!res || !res.ok) throw new Error(res?.error || "payroll_periods failed");

    const periods = Array.isArray(res.periods) ? res.periods : [];
    if (!periods.length) {
      pastPayrollSelect.innerHTML = `<option value="">No saved periods found</option>`;
      if (pastPayrollHint) pastPayrollHint.textContent = "No past payroll periods found yet.";
      return;
    }

    pastPayrollSelect.innerHTML = periods.map(p => {
      const id = p.periodId || p.period || "";
      const label = `${id} • ${normalizeStatusLabel(p.status || "OPEN")}`;
      return `<option value="${escapeHtml(id)}" ${id === currentPeriodId ? "selected" : ""}>${escapeHtml(label)}</option>`;
    }).join("");

    if (pastPayrollHint) pastPayrollHint.textContent = `${periods.length} saved payroll period(s).`;
  }

  function todayYmd() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  function setAddJobDateDefault() {
    if (!addJobDate) return;
    if (!addJobDate.value) addJobDate.value = currentPeriodStart || todayYmd();
    if (currentPeriodStart) addJobDate.min = currentPeriodStart;
    if (currentPeriodEnd) addJobDate.max = currentPeriodEnd;
  }

  function clearSelectedAddJob() {
    selectedAddJob = null;
    if (addJobSelected) {
      addJobSelected.textContent = "No job selected";
      addJobSelected.classList.add("hidden");
    }
  }

  function chooseAddJob(job) {
    selectedAddJob = job || null;
    if (addJobSearch && job) addJobSearch.value = job.name || job.clientName || "";
    if (addJobSelected && job) {
      addJobSelected.textContent = `${job.name || job.clientName || "Selected job"} • ${money(job.pay || 0)}`;
      addJobSelected.classList.remove("hidden");
    }
    hideAddJobSuggestions();
  }

  function hideAddJobSuggestions() {
    if (!addJobSuggestions) return;
    addJobSuggestions.innerHTML = "";
    addJobSuggestions.classList.add("hidden");
  }

  function renderAddJobSuggestions(query) {
    if (!addJobSuggestions) return;
    const q = String(query || "").trim().toLowerCase();
    if (!q) {
      hideAddJobSuggestions();
      return;
    }

    if (!jobsRouteLoaded) {
      addJobSuggestions.innerHTML = `<div class="job-suggestion"><strong>Job list still loading</strong><span>Wait a second, then type again. If this stays, Code.gs is missing clock_jobs_list.</span></div>`;
      addJobSuggestions.classList.remove("hidden");
      return;
    }

    if (!allJobs.length) {
      addJobSuggestions.innerHTML = `<div class="job-suggestion"><strong>No jobs loaded</strong><span>Code.gs route returned no jobs. Check Master_Schedule has active clients with JobPay, FullPay, or HalfPay.</span></div>`;
      addJobSuggestions.classList.remove("hidden");
      return;
    }

    const matches = allJobs
      .filter(job => String(`${job.name || ""} ${job.clientName || ""}`).toLowerCase().includes(q))
      .slice(0, 10);

    if (!matches.length) {
      addJobSuggestions.innerHTML = `<div class="job-suggestion"><strong>No matching job found</strong><span>Try a shorter search or check the client name/pay in Master_Schedule.</span></div>`;
      addJobSuggestions.classList.remove("hidden");
      return;
    }

    addJobSuggestions.innerHTML = matches.map((job, idx) => `
      <div class="job-suggestion" data-idx="${idx}">
        <strong>${escapeHtml(job.name || job.clientName || "Job")}</strong>
        <span>${money(job.pay || 0)}${job.address ? " • " + escapeHtml(job.address) : ""}</span>
      </div>
    `).join("");

    addJobSuggestions.querySelectorAll(".job-suggestion").forEach(el => {
      el.addEventListener("mousedown", (ev) => {
        ev.preventDefault();
        const idx = Number(el.dataset.idx || 0);
        chooseAddJob(matches[idx]);
      });
    });

    addJobSuggestions.classList.remove("hidden");
  }

  function promptUnlockForAddJob() {
    const pin = window.prompt("This payroll period is locked. Enter employee PIN to unlock and add this job:");
    if (!pin) return null;
    const reason = window.prompt("Reason for unlocking payroll:", "Add Job to Employee");
    if (!reason) return null;
    return { pin, reason };
  }

  async function addJobToEmployee() {
    if (!currentPeriodId) return setStatus("No payroll period loaded.", "err");
    const serviceDate = addJobDate?.value || "";
    const employeeId = addJobEmployee?.value || "";
    const notes = addJobNotes?.value || "";

    if (!serviceDate) return setStatus("Choose a date for the job.", "err");
    if (!employeeId) return setStatus("Choose an employee.", "err");
    if (!selectedAddJob || !selectedAddJob.id) return setStatus("Start typing and select a client/job first.", "err");

    const basePayload = {
      serviceDate,
      employeeId,
      jobId: selectedAddJob.id,
      notes
    };

    try {
      if (btnAddJobToEmployee) { btnAddJobToEmployee.disabled = true; btnAddJobToEmployee.textContent = "Adding..."; }
      setStatus("Adding job to employee…");
      let res = await payrollAddJob(currentPeriodId, basePayload);

      if (res && !res.ok && res.error === "period_locked_pin_required") {
        const unlock = promptUnlockForAddJob();
        if (!unlock) {
          setStatus("Add job cancelled. Payroll period is still locked.", "err");
          return;
        }
        res = await payrollAddJob(currentPeriodId, { ...basePayload, pin: unlock.pin, reason: unlock.reason });
      }

      if (!res || !res.ok) throw new Error(res?.error || "payroll_add_job failed");

      currentPeriodStatus = "OPEN";
      if (addJobSearch) addJobSearch.value = "";
      if (addJobNotes) addJobNotes.value = "";
      clearSelectedAddJob();
      await sleep(500);
      await showPastPayrollPicker();
      await loadPeriod(currentPeriodId);
      setStatus(`Added ${res.jobName || "job"} to ${res.employeeName || employeeId} ✅`, "ok");
    } catch (err) {
      setStatus(String(err?.message || err), "err");
    } finally {
      if (btnAddJobToEmployee) { btnAddJobToEmployee.disabled = false; btnAddJobToEmployee.textContent = "Add Job"; }
    }
  }

  function wireAddJobControls() {
    setAddJobDateDefault();
    if (addJobSearch) {
      addJobSearch.addEventListener("input", () => {
        clearSelectedAddJob();
        renderAddJobSuggestions(addJobSearch.value);
      });
      addJobSearch.addEventListener("focus", () => renderAddJobSuggestions(addJobSearch.value));
      addJobSearch.addEventListener("blur", () => setTimeout(hideAddJobSuggestions, 180));
    }
    if (btnAddJobToEmployee) btnAddJobToEmployee.onclick = () => addJobToEmployee();
  }

  function collectFinalPaymentRows() {
    if (!paymentsBody) return [];
    const rows = [];

    paymentsBody.querySelectorAll(".net-pay-input").forEach(input => {
      const empId = input.dataset.emp || "";
      const taxInput = paymentsBody.querySelector(`.tax-adjustment-input[data-emp="${empId}"]`);
      const netPay = cleanMoneyNumber(input.value || "");
      const taxAdjustments = cleanMoneyNumber((taxInput && taxInput.value) || "");
      const method = paymentsBody.querySelector(`.pay-method[data-emp="${empId}"]`)?.value || "";
      const reference = paymentsBody.querySelector(`.check-ref[data-emp="${empId}"]`)?.value || "";
      const notes = paymentsBody.querySelector(`.pay-notes[data-emp="${empId}"]`)?.value || "";

      rows.push({ employeeId: empId, taxAdjustments, netPay, finalPaidMethod: method, finalReference: reference, finalPaymentNotes: notes });
    });

    return rows;
  }

  async function finalizeEnteredInQuickBooks() {
    if (!currentPeriodId) return;
    const rows = collectFinalPaymentRows();

    if (!rows.length) {
      setStatus("No open payment rows found. This period may already be finalized.", "err");
      return;
    }

    for (const row of rows) {
      if (!row.employeeId) return setStatus("Missing employee ID in one payment row.", "err");
      if (!row.netPay || row.netPay <= 0) return setStatus(`Enter net pay for ${row.employeeId} before clicking Finalize Payroll.`, "err");
      if (row.taxAdjustments < 0 || Number.isNaN(row.taxAdjustments)) return setStatus(`Enter valid Taxes/Adjustments for ${row.employeeId}.`, "err");
      if (row.finalPaidMethod === "Check" && !String(row.finalReference || "").trim()) return setStatus(`Enter a check number for ${row.employeeId}.`, "err");
    }

    const ok = confirm(
      `Confirm payroll finalization for ${currentPeriodId}?\n\n` +
      "This will save Taxes/Adjustments, final net payment details, update the master payroll audit sheet, and lock the period."
    );
    if (!ok) return;

    try {
      if (btnFinalizeQB) { btnFinalizeQB.disabled = true; btnFinalizeQB.textContent = "Finalizing..."; }
      setStatus(`Finalizing payroll for ${currentPeriodId}…`);
      const res = await payrollFinalizeQB(currentPeriodId, rows);
      if (!res || !res.ok) throw new Error(res?.error || "payroll_finalize_qb failed");
      currentPeriodStatus = "LOCKED";
      await sleep(400);
      await loadPeriod(currentPeriodId);
      setStatus("Payroll finalized, audit records updated, and period locked ✅", "ok");
    } catch (err) {
      setStatus(String(err?.message || err), "err");
    } finally {
      if (btnFinalizeQB) { btnFinalizeQB.disabled = false; btnFinalizeQB.textContent = "Finalize Payroll"; }
    }
  }

  async function unlockCurrentPeriod() {
    const periodId = pastPayrollSelect?.value || currentPeriodId;
    const pin = unlockPin?.value || "";
    const reason = unlockReason?.value || "";

    if (!periodId) return setStatus("Choose a payroll period to unlock.", "err");
    if (!pin.trim()) return setStatus("Enter employee PIN before unlocking.", "err");
    if (!reason.trim()) return setStatus("Enter a reason before unlocking.", "err");

    const ok = confirm(`Unlock payroll period ${periodId}?\n\nThis will be logged with your employee ID and reason.`);
    if (!ok) return;

    try {
      if (btnUnlockPeriod) { btnUnlockPeriod.disabled = true; btnUnlockPeriod.textContent = "Unlocking..."; }
      setStatus(`Unlocking ${periodId}…`);
      const res = await payrollUnlock(periodId, pin, reason);
      if (!res || !res.ok) throw new Error(res?.error || "payroll_unlock failed");

      if (unlockPin) unlockPin.value = "";
      if (unlockReason) unlockReason.value = "";
      currentPeriodId = periodId;
      currentPeriodStatus = "OPEN";
      renderPeriod({ periodId, status: "OPEN" });

      await sleep(650);
      await showPastPayrollPicker();
      await loadPeriod(periodId);
      setStatus(`${periodId} unlocked for corrections ✅`, "ok");
    } catch (err) {
      setStatus(String(err?.message || err), "err");
    } finally {
      if (btnUnlockPeriod) { btnUnlockPeriod.disabled = false; btnUnlockPeriod.textContent = "Unlock Period"; }
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

    const p = await ping();
    if (!p || !p.ok) throw new Error("Ping did not return ok");

    await Promise.allSettled([
      loadPayrollEmployeesList(),
      loadClockJobsList()
    ]);

    await autoloadCurrentPayroll();
    renderAddJobEmployees(payrollEmployees);
    wireAddJobControls();
    showPastPayrollPicker().catch(err => setStatus(String(err?.message || err), "err"));

    setDebug(`employees=${payrollEmployees.length}; jobs=${allJobs.length}; employeeRouteLoaded=${employeeRouteLoaded}; jobsRouteLoaded=${jobsRouteLoaded}`);

    if (btnOpenQB) btnOpenQB.onclick = openQuickBooksPopup;

    if (btnLoadPastPayroll) {
      btnLoadPastPayroll.onclick = () =>
        loadPeriod(pastPayrollSelect?.value || "")
          .catch(err => setStatus(String(err?.message || err), "err"));
    }

    if (btnFinalizeQB) btnFinalizeQB.onclick = () => finalizeEnteredInQuickBooks();
    if (btnUnlockPeriod) btnUnlockPeriod.onclick = () => unlockCurrentPeriod();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => boot().catch(err => setStatus(String(err?.message || err), "err")));
  } else {
    boot().catch(err => setStatus(String(err?.message || err), "err"));
  }
})();
