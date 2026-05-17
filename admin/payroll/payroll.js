/* =========================================================
   ATS Payroll (Admin UI) — Clean QuickBooks Payroll Flow
   - Auto-loads current payroll
   - Combines payroll review + job breakdown
   - Payroll finalization saves net pay, creates audit snapshot, and locks period
   - Hidden admin tools include past payroll and unlock with PIN/reason
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
  const periodStartEl = document.getElementById("periodStart");
  const periodEndEl = document.getElementById("periodEnd");
  const periodPaydayEl = document.getElementById("periodPayday");
  const periodStatusEl = document.getElementById("periodStatus");

  const btnFinalizeQB = document.getElementById("btnFinalizeQB");
  const pastPayrollSelect = document.getElementById("pastPayrollSelect");
  const btnLoadPastPayroll = document.getElementById("btnLoadPastPayroll");
  const pastPayrollHint = document.getElementById("pastPayrollHint");
  const unlockPin = document.getElementById("unlockPin");
  const unlockReason = document.getElementById("unlockReason");
  const btnUnlockPeriod = document.getElementById("btnUnlockPeriod");

  const payoutCard = document.getElementById("payoutCard");
  const payoutHint = document.getElementById("payoutHint");
  const payoutBody = document.getElementById("payoutBody");
  const payoutTotals = document.getElementById("payoutTotals");

  const paymentsHint = document.getElementById("paymentsHint");
  const paymentsBody = document.getElementById("paymentsBody");
  const paymentsTotals = document.getElementById("paymentsTotals");

  let currentPeriodId = "";
  let currentPeriodStatus = "";

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

  function money(v) {
    return "$" + Number(v || 0).toFixed(2);
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

  function renderPeriod(p) {
    currentPeriodId = p?.periodId || p?.period || p?.id || currentPeriodId || "";
    currentPeriodStatus = p?.status || currentPeriodStatus || "";
    if (periodIdEl) periodIdEl.textContent = currentPeriodId || "—";
    if (periodStartEl) periodStartEl.textContent = p?.startDate || p?.start || "—";
    if (periodEndEl) periodEndEl.textContent = p?.endDate || p?.end || "—";
    if (periodPaydayEl) periodPaydayEl.textContent = p?.payday || "—";
    if (periodStatusEl) periodStatusEl.textContent = currentPeriodStatus || "—";
  }

  function renderPayments(rows, period) {
    if (!paymentsBody) return;

    const data = Array.isArray(rows) ? rows : [];
    const start = period?.startDate || data[0]?.startDate || "";
    const end = period?.endDate || data[0]?.endDate || "";

    if (paymentsHint) {
      paymentsHint.textContent = start && end
        ? `Enter final net pay and payment details for ${start} → ${end}. Click Finalize Payroll once after ALL employees are finalized.`
        : "Enter final net payments, then click Finalize Payroll once.";
    }

    if (!data.length) {
      paymentsBody.innerHTML = `<tr><td colspan="8" style="color:#6b7280;padding:10px 12px;">No payment rows yet.</td></tr>`;
      if (paymentsTotals) paymentsTotals.textContent = "";
      return;
    }

    const grossTotal = data.reduce((sum, r) => sum + Number(r.totalPay || r.total || 0), 0);
    const netTotal = data.reduce((sum, r) => sum + Number(r.netPay || r.finalNetPay || 0), 0);
    if (paymentsTotals) paymentsTotals.textContent = `Gross Total: ${money(grossTotal)}${netTotal ? ` • Net Recorded: ${money(netTotal)}` : ""}`;

    paymentsBody.innerHTML = data.map(r => {
      const empName = r.employeeName || r.employeeId || "—";
      const periodText = `${r.startDate || start} → ${r.endDate || end}`;
      const gross = Number(r.totalPay || r.total || 0).toFixed(2);
      const employeeId = r.employeeId || "";
      const netPay = r.netPay || r.finalNetPay || "";
      const finalMethod = r.finalPaidMethod || r.paidMethod || "Check";
      const finalRef = r.finalReference || r.reference || "";
      const finalNotes = r.finalPaymentNotes || r.paymentNotes || "";
      const statusText = String(r.status || "").toUpperCase();
      const qbStatus = String(r.qbStatus || "").toUpperCase();
      const periodUnlocked = String(currentPeriodStatus || "").toUpperCase() === "OPEN";
      const isReopened = qbStatus === "REOPENED" || statusText === "OPEN" || statusText === "REOPENED";
      const isFinalPaid = !periodUnlocked && !isReopened && (r.finalPaid || statusText === "NET_PAID" || statusText === "PAID" || qbStatus === "ENTERED_IN_QB");

      if (isFinalPaid) {
        return `
          <tr>
            <td>${escapeHtml(empName)}</td>
            <td>${escapeHtml(periodText)}</td>
            <td class="right">$${escapeHtml(gross)}</td>
            <td class="right">$${Number(netPay || 0).toFixed(2)}</td>
            <td>${escapeHtml(finalMethod || "Recorded")}</td>
            <td>${escapeHtml(finalRef || "")}</td>
            <td>${escapeHtml(finalNotes || "")}</td>
            <td>✔ Entered in QuickBooks</td>
          </tr>
        `;
      }

      return `
        <tr>
          <td>${escapeHtml(empName)}</td>
          <td>${escapeHtml(periodText)}</td>
          <td class="right">$${escapeHtml(gross)}</td>
          <td class="right"><input class="pay-input net-pay-input" data-emp="${escapeHtml(employeeId)}" placeholder="0.00" inputmode="decimal" value="${escapeHtml(netPay)}" /></td>
          <td>
            <select class="pay-method" data-emp="${escapeHtml(employeeId)}">
              <option value="Check" ${finalMethod === "Check" ? "selected" : ""}>Check</option>
              <option value="Zelle" ${finalMethod === "Zelle" ? "selected" : ""}>Zelle</option>
              <option value="Venmo" ${finalMethod === "Venmo" ? "selected" : ""}>Venmo</option>
              <option value="Cash App" ${finalMethod === "Cash App" ? "selected" : ""}>Cash App</option>
              <option value="Cash" ${finalMethod === "Cash" ? "selected" : ""}>Cash</option>
              <option value="Other" ${finalMethod === "Other" ? "selected" : ""}>Other</option>
            </select>
          </td>
          <td><input class="pay-input check-ref" data-emp="${escapeHtml(employeeId)}" placeholder="Check # / Ref" value="${escapeHtml(finalRef)}" /></td>
          <td><input class="pay-input pay-notes" data-emp="${escapeHtml(employeeId)}" placeholder="Notes" value="${escapeHtml(finalNotes)}" /></td>
          <td class="qb-row-status" data-emp="${escapeHtml(employeeId)}">Ready</td>
        </tr>
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
      payoutBody.innerHTML = `<tr><td colspan="5" style="color:#6b7280;padding:10px 12px;">No job lines found for this period.</td></tr>`;
      payoutHint.textContent = currentPeriodId ? `Payroll review for ${currentPeriodId}` : "—";
      payoutTotals.textContent = `Grand Total: ${money(grandTotal)}`;
      payoutCard.classList.remove("hidden");
      return;
    }

    const rows = [];
    employees.forEach(emp => {
      const jobs = Array.isArray(emp.jobs) ? emp.jobs : [];
      const employeeTotal = Number(emp.totalPay || jobs.reduce((sum, j) => sum + Number(j.jobPay ?? j.pay ?? j.amount ?? 0), 0));

      if (!jobs.length) {
        rows.push({ employee: emp.employeeName || emp.employeeId, date: "", job: "No job lines", pay: 0, employeeTotal, showTotal: true });
        return;
      }

      jobs.forEach((j, idx) => {
        const rawJob = j.clientName || j.jobName || j.job || j.client || j.jobId || "";
        const rawPay = j.jobPay ?? j.pay ?? j.amount ?? 0;
        rows.push({
          employee: emp.employeeName || emp.employeeId,
          date: j.date || "",
          job: rawJob,
          pay: Number(rawPay || 0),
          employeeTotal,
          showTotal: idx === 0
        });
      });
    });

    payoutBody.innerHTML = rows.map(r => `
      <tr>
        <td>${escapeHtml(r.employee)}</td>
        <td>${escapeHtml(r.date)}</td>
        <td>${escapeHtml(r.job)}</td>
        <td class="right">${money(r.pay)}</td>
        <td class="right employee-total">${r.showTotal ? money(r.employeeTotal) : ""}</td>
      </tr>
    `).join("");

    payoutHint.textContent = currentPeriodId ? `Payroll review for ${currentPeriodId}` : "—";
    payoutTotals.textContent = `Grand Total: ${money(grandTotal)}`;
    payoutCard.classList.remove("hidden");
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

    renderPeriod({ periodId, startDate: sum.startDate || "", endDate: sum.endDate || "", status: sum.status || currentPeriodStatus || "—", payday: "" });

    const payoutRes = await payrollPayouts(periodId);
    if (payoutRes && payoutRes.ok) renderPayouts(payoutRes.payouts);

    const pay = await payrollPayments(periodId);
    if (!pay || !pay.ok) throw new Error(pay?.error || "payroll_payments failed");
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

    // Auto-generate current payroll when period is open. If locked, load existing records.
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
      const label = `${id} • ${p.status || "OPEN"}`;
      return `<option value="${escapeHtml(id)}" ${id === currentPeriodId ? "selected" : ""}>${escapeHtml(label)}</option>`;
    }).join("");

    if (pastPayrollHint) pastPayrollHint.textContent = `${periods.length} saved payroll period(s).`;
  }

  function collectFinalPaymentRows() {
    if (!paymentsBody) return [];
    const rows = [];

    paymentsBody.querySelectorAll(".net-pay-input").forEach(input => {
      const empId = input.dataset.emp || "";
      const netPay = Number(String(input.value || "").replace(/[$,]/g, ""));
      const method = paymentsBody.querySelector(`.pay-method[data-emp="${empId}"]`)?.value || "";
      const reference = paymentsBody.querySelector(`.check-ref[data-emp="${empId}"]`)?.value || "";
      const notes = paymentsBody.querySelector(`.pay-notes[data-emp="${empId}"]`)?.value || "";

      rows.push({ employeeId: empId, netPay, finalPaidMethod: method, finalReference: reference, finalPaymentNotes: notes });
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
      if (!row.netPay || row.netPay <= 0) return setStatus(`Enter net pay for ${row.employeeId} before clicking Entered in QuickBooks.`, "err");
      if (row.finalPaidMethod === "Check" && !String(row.finalReference || "").trim()) return setStatus(`Enter a check number for ${row.employeeId}.`, "err");
    }

    const ok = confirm(
      `Confirm payroll finalization for ${currentPeriodId}?\n\n` +
      "This will save final net payment details, update the master payroll audit sheet, and lock the period."
    );
    if (!ok) return;

    try {
      if (btnFinalizeQB) { btnFinalizeQB.disabled = true; btnFinalizeQB.textContent = "Finalizing..."; }
      setStatus(`Finalizing payroll for ${currentPeriodId}…`);
      const res = await payrollFinalizeQB(currentPeriodId, rows);
      if (!res || !res.ok) throw new Error(res?.error || "payroll_finalize_qb failed");
      currentPeriodStatus = "LOCKED";
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
      currentPeriodStatus = "OPEN";
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

    await autoloadCurrentPayroll();
    showPastPayrollPicker().catch(err => setStatus(String(err?.message || err), "err"));

    if (btnLoadPastPayroll) btnLoadPastPayroll.onclick = () => loadPeriod(pastPayrollSelect?.value || "").catch(err => setStatus(String(err?.message || err), "err"));
    if (btnFinalizeQB) btnFinalizeQB.onclick = () => finalizeEnteredInQuickBooks();
    if (btnUnlockPeriod) btnUnlockPeriod.onclick = () => unlockCurrentPeriod();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => boot().catch(err => setStatus(String(err?.message || err), "err")));
  } else {
    boot().catch(err => setStatus(String(err?.message || err), "err"));
  }
})();
