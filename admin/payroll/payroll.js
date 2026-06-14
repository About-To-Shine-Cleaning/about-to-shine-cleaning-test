// =========================================================
// FILE: Payroll.gs
// ATS Payroll backend routes + payroll-only helpers
// Split from ATS Unified Web App. Same function names/routes preserved.
// =========================================================

function getCurrentPayPeriod_() {
  var start = getSaturdayForDate_(new Date());
  var end = addDaysYMD_(start, 6);

  return {
    id: start + "_to_" + end,
    periodId: start + "_to_" + end,
    period: start + "_to_" + end,
    startDate: start,
    endDate: end,
    start: start,
    end: end
  };
}

// =========================================================
// PAYROLL - Saturday-to-Friday pay period
// Scheduler can stay Monday-to-Sunday; payroll now uses Saturday-to-Friday.
// =========================================================
function payrollPeriodId_(period) {
  period = period || getCurrentPayPeriod_();
  return (period.startDate || period.start) + "_to_" + (period.endDate || period.end);
}

function getPayrollPeriodFromRequest_(e) {
  var explicitStart =
    getParam_(e, "startDate") ||
    getParam_(e, "start") ||
    getParam_(e, "periodStart");

  if (explicitStart) {
    var start = getSaturdayForDate_(explicitStart);
    var end = addDaysYMD_(start, 6);
    return {
      id: start + "_to_" + end,
      periodId: start + "_to_" + end,
      period: start + "_to_" + end,
      start: start,
      end: end,
      startDate: start,
      endDate: end
    };
  }

  var periodId =
    getParam_(e, "period_id") ||
    getParam_(e, "periodId") ||
    getParam_(e, "currentPeriodId") ||
    getParam_(e, "period");

  if (periodId) {
    var m = String(periodId).match(/(\d{4}-\d{2}-\d{2})_to_(\d{4}-\d{2}-\d{2})/);
    if (m) {
      // Preserve exact historical period IDs when loading old payroll.
      // New/current payroll periods are now created Saturday through Friday.
      var lockedStart = m[1];
      var lockedEnd = m[2];
      return {
        id: lockedStart + "_to_" + lockedEnd,
        periodId: lockedStart + "_to_" + lockedEnd,
        period: lockedStart + "_to_" + lockedEnd,
        start: lockedStart,
        end: lockedEnd,
        startDate: lockedStart,
        endDate: lockedEnd
      };
    }
  }

  return getCurrentPayPeriod_();
}

function ensurePayrollSummarySheet_() {
  var ss = getClockSS_();
  var sh = ss.getSheetByName(PAYROLL_SUMMARY);
  if (!sh) sh = ss.insertSheet(PAYROLL_SUMMARY);

  // Payroll_Summary structure A:AA
  // A:O keeps original gross/payroll columns stable.
  // P:Y keeps final net-pay + QuickBooks audit fields stable.
  // Z:AA adds payroll-only gross adjustments. These do NOT touch Logs.
  var headers = [
    "PeriodID",
    "StartDate",
    "EndDate",
    "EmployeeID",
    "EmployeeName",
    "JobsCompleted",
    "TotalPay",
    "ExceptionCount",
    "LastUpdate",
    "Status",
    "PaidAt",
    "PaidBy",
    "PaidMethod",
    "Reference",
    "PaymentNotes",
    "NetPay",
    "TaxAdjustments",
    "FinalPaidAt",
    "FinalPaidBy",
    "FinalPaidMethod",
    "FinalReference",
    "FinalPaymentNotes",
    "QBExportedAt",
    "QBExportedBy",
    "QBStatus",
    "GrossAdjustment",
    "GrossAdjustmentReason"
  ];

  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    return sh;
  }

  var existing = sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0]
    .map(function(h) { return String(h || "").trim(); });

  // Preserve existing columns and append missing columns only.
  // This avoids shifting locked payroll columns if the sheet already exists.
  headers.forEach(function(h, i) {
    if (i < existing.length && existing[i] === h) return;

    var found = existing.indexOf(h);
    if (found >= 0) return;

    sh.insertColumnAfter(sh.getLastColumn());
    sh.getRange(1, sh.getLastColumn()).setValue(h);
    existing.push(h);
  });

  // Ensure first 25 locked headers stay named correctly without moving data.
  for (var c = 0; c < Math.min(25, headers.length); c++) {
    sh.getRange(1, c + 1).setValue(headers[c]);
  }

  // Ensure adjustment headers exist at Z:AA for predictable reads/writes.
  sh.getRange(1, 26).setValue("GrossAdjustment");
  sh.getRange(1, 27).setValue("GrossAdjustmentReason");

  return sh;
}



function ensurePayrollPeriodsSheet_() {
  var ss = getClockSS_();
  var sh = ss.getSheetByName(PAYROLL_PERIODS);
  if (!sh) sh = ss.insertSheet(PAYROLL_PERIODS);

  var headers = [
    "PeriodID",
    "StartDate",
    "EndDate",
    "Status",
    "LockedAt",
    "LockedBy",
    "LastUpdate"
  ];

  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  }

  return sh;
}


function ensurePayrollUnlockLogSheet_() {
  var ss = getClockSS_();
  var sh = ss.getSheetByName(PAYROLL_UNLOCK_LOG);
  if (!sh) sh = ss.insertSheet(PAYROLL_UNLOCK_LOG);

  var headers = [
    "Timestamp",
    "PeriodID",
    "UnlockedBy",
    "Reason",
    "PreviousStatus",
    "NewStatus"
  ];

  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  }

  return sh;
}

function verifyPayrollUnlockPin_(auth, pin) {
  pin = String(pin || "").trim();
  if (!pin) throw new Error("missing_employee_pin");

  var ss = SpreadsheetApp.openById(ADMIN_SPREADSHEET_ID);
  var sh = ss.getSheetByName(AUTH_SHEET);
  if (!sh) throw new Error("Auth sheet not found");

  var data = sh.getDataRange().getValues();
  if (data.length < 2) throw new Error("Auth sheet is empty");

  var headers = data[0].map(function(h) { return String(h || "").trim().toLowerCase(); });
  function idx(name) { return headers.indexOf(String(name || "").trim().toLowerCase()); }

  var employeeIdIdx = idx("employeeid");
  var pinIdx = idx("payrollpin");
  if (pinIdx < 0) pinIdx = idx("pin");
  if (pinIdx < 0) pinIdx = idx("employeepin");
  if (pinIdx < 0) throw new Error("PayrollPIN column not found in Auth sheet");

  var authId = String((auth && auth.employeeId) || "").trim().toUpperCase();
  if (!authId) throw new Error("missing_auth_employee");

  for (var i = 1; i < data.length; i++) {
    var rowId = employeeIdIdx >= 0 ? String(data[i][employeeIdIdx] || "").trim().toUpperCase() : "";
    if (rowId !== authId) continue;

    var savedPin = String(data[i][pinIdx] || "").trim();
    if (!savedPin) throw new Error("employee_pin_not_set");
    if (savedPin !== pin) throw new Error("invalid_employee_pin");
    return true;
  }

  throw new Error("employee_pin_row_not_found");
}

function reopenPayrollSummaryRows_(periodId) {
  var sh = ensurePayrollSummarySheet_();
  var data = sh.getDataRange().getValues();
  if (data.length < 2) return 0;

  var PERIOD_COL = 1;
  var STATUS_COL = 10;
  var QB_STATUS_COL = 25;
  var updated = 0;

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][PERIOD_COL - 1] || "").trim() === String(periodId || "").trim()) {
      sh.getRange(i + 1, STATUS_COL).setValue("OPEN");
      sh.getRange(i + 1, QB_STATUS_COL).setValue("REOPENED");
      updated++;
    }
  }

  return updated;
}

function handlePayrollUnlock_(e) {
  try {
    var auth = requireAdmin_(e);
    var period = getPayrollPeriodFromRequest_(e);
    var periodId = payrollPeriodId_(period);
    var pin = getParam_(e, "pin") || getParam_(e, "employeePin") || getParam_(e, "payrollPin") || "";
    var reason = getParam_(e, "reason") || getParam_(e, "unlockReason") || "";

    if (!periodId) throw new Error("missing_period_id");
    if (!String(reason || "").trim()) throw new Error("missing_unlock_reason");

    verifyPayrollUnlockPin_(auth, pin);

    var previousStatus = getPayrollPeriodStatus_(periodId) || "OPEN";
    upsertPayrollPeriod_(period, "OPEN", auth);
    var reopenedRows = reopenPayrollSummaryRows_(periodId);

    var logSh = ensurePayrollUnlockLogSheet_();
    logSh.appendRow([
      new Date(),
      periodId,
      auth.employeeId || auth.employeeName || "",
      reason,
      previousStatus,
      "OPEN"
    ]);

    return jsonp_(e, {
      ok: true,
      unlocked: true,
      periodId: periodId,
      period: periodId,
      previousStatus: previousStatus,
      status: "OPEN",
      qbStatus: "REOPENED",
      reopenedRows: reopenedRows
    });
  } catch (err) {
    return jsonp_(e, {
      ok: false,
      error: String(err && err.message ? err.message : err)
    });
  }
}

function getPayrollPeriodStatus_(periodId) {
  var sh = ensurePayrollPeriodsSheet_();
  var data = sh.getDataRange().getValues();
  if (data.length < 2) return "OPEN";

  var headers = data[0];
  var idIdx = findHeaderIndex_(headers, ["PeriodID", "PeriodId", "Period", "period_id"]);
  var statusIdx = findHeaderIndex_(headers, ["Status", "status"]);
  if (idIdx < 0 || statusIdx < 0) return "OPEN";

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][idIdx] || "") === String(periodId)) {
      return String(data[i][statusIdx] || "OPEN").trim() || "OPEN";
    }
  }

  return "OPEN";
}

function upsertPayrollPeriod_(period, status, auth) {
  var sh = ensurePayrollPeriodsSheet_();
  var data = sh.getDataRange().getValues();
  var headers = data[0];

  var idIdx = findHeaderIndex_(headers, ["PeriodID", "PeriodId", "Period", "period_id"]);
  var startIdx = findHeaderIndex_(headers, ["StartDate", "start"]);
  var endIdx = findHeaderIndex_(headers, ["EndDate", "end"]);
  var statusIdx = findHeaderIndex_(headers, ["Status", "status"]);
  var lockedAtIdx = findHeaderIndex_(headers, ["LockedAt", "locked_at"]);
  var lockedByIdx = findHeaderIndex_(headers, ["LockedBy", "locked_by"]);
  var updateIdx = findHeaderIndex_(headers, ["LastUpdate", "last_update"]);

  var periodId = payrollPeriodId_(period);
  var rowNum = -1;

  for (var i = 1; i < data.length; i++) {
    if (idIdx >= 0 && String(data[i][idIdx] || "") === periodId) {
      rowNum = i + 1;
      break;
    }
  }

  if (rowNum < 0) rowNum = sh.getLastRow() + 1;

  if (idIdx >= 0) sh.getRange(rowNum, idIdx + 1).setValue(periodId);
  if (startIdx >= 0) sh.getRange(rowNum, startIdx + 1).setValue(period.startDate || period.start);
  if (endIdx >= 0) sh.getRange(rowNum, endIdx + 1).setValue(period.endDate || period.end);
  if (statusIdx >= 0) sh.getRange(rowNum, statusIdx + 1).setValue(status || "OPEN");
  if (lockedAtIdx >= 0 && String(status || "").toUpperCase() === "LOCKED") sh.getRange(rowNum, lockedAtIdx + 1).setValue(new Date());
  if (lockedByIdx >= 0 && String(status || "").toUpperCase() === "LOCKED") sh.getRange(rowNum, lockedByIdx + 1).setValue((auth && (auth.employeeId || auth.employeeName)) || "");
  if (updateIdx >= 0) sh.getRange(rowNum, updateIdx + 1).setValue(new Date());
}

function normalizeActionForPayroll_(action) {
  return String(action || "").trim().toUpperCase().replace(/[\s-]+/g, "_");
}

function isClockOutAction_(action) {
  var a = normalizeActionForPayroll_(action);
  return a === "CLOCK_OUT" ||
    a === "CLOCKOUT" ||
    a === "OUT" ||
    a === "PAYROLL_MANUAL_JOB" ||
    a === "MANUAL_PAYROLL_JOB" ||
    a.indexOf("CLOCK_OUT") >= 0 ||
    a.indexOf("PAYROLL_MANUAL_JOB") >= 0;
}

function normalizePayrollMoney_(value) {
  if (value === null || value === undefined || value === "") return 0;
  var cleaned = String(value)
    .replace(/\$/g, "")
    .replace(/,/g, "")
    .trim();
  var n = Number(cleaned);
  return isNaN(n) ? 0 : n;
}

function inferPayrollJobType_(jobId, jobName) {
  var id = String(jobId || "").trim().toUpperCase();
  var name = String(jobName || "").trim().toUpperCase();

  if (/_FULL$/.test(id) || /\bFULL\b/.test(name)) return "FULL";
  if (/_HALF$/.test(id) || /_\.5$/.test(id) || /\bHALF\b/.test(name) || /(?:^|\s|-|-)\.5(?:\s|$)/.test(name)) return "HALF";
  if (/_JOB$/.test(id)) return "JOB";

  return "";
}

function payrollBaseClientIdFromJobId_(jobId) {
  var id = String(jobId || "").trim();
  if (!id) return "";

  return id
    .replace(/_(FULL|HALF|JOB)$/i, "")
    .replace(/_\.5$/i, "")
    .trim();
}

function pickPayrollPayFromClientRow_(clientRow, jobType) {
  if (!clientRow) return 0;

  var jobPay = normalizePayrollMoney_(clientRow.jobPay);
  var fullPay = normalizePayrollMoney_(clientRow.fullPay);
  var halfPay = normalizePayrollMoney_(clientRow.halfPay);

  if (jobType === "FULL") return fullPay || jobPay || halfPay || 0;
  if (jobType === "HALF") return halfPay || jobPay || fullPay || 0;
  if (jobType === "JOB") return jobPay || fullPay || halfPay || 0;

  return jobPay || fullPay || halfPay || 0;
}

function buildPayrollPayoutIndex_() {
  var rows = [];
  try {
    rows = getClientsSheetRaw_();
  } catch (err) {
    rows = [];
  }

  var byClientId = {};
  var byClientName = {};

  rows.forEach(function(row) {
    row = row || {};
    var clientId = String(row.clientId || "").trim();
    var clientName = String(row.clientName || "").trim();
    if (!clientId && !clientName) return;

    if (clientId) byClientId[clientId.toLowerCase()] = row;

    var nameKey = "";
    try {
      nameKey = clientMatchKey_(clientName);
    } catch (err) {
      nameKey = String(clientName || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
    }

    if (nameKey) byClientName[nameKey] = row;
  });

  return {
    byClientId: byClientId,
    byClientName: byClientName
  };
}

function resolvePayrollPayForLogRow_(row, payoutIndex) {
  row = row || {};
  payoutIndex = payoutIndex || buildPayrollPayoutIndex_();

  var logsPay = normalizePayrollMoney_(row.jobPay);
  if (logsPay > 0) return logsPay;

  var jobId = String(row.jobId || "").trim();
  var jobName = String(row.jobName || "").trim();
  var jobType = inferPayrollJobType_(jobId, jobName);

  var baseClientId = payrollBaseClientIdFromJobId_(jobId);
  if (baseClientId) {
    var byId = payoutIndex.byClientId[String(baseClientId).toLowerCase()];
    var byIdPay = pickPayrollPayFromClientRow_(byId, jobType);
    if (byIdPay > 0) return byIdPay;
  }

  var cleanName = "";
  try {
    cleanName = cleanClientBaseName_(jobName);
  } catch (err1) {
    cleanName = String(jobName || "")
      .replace(/[---]\s*(Full|\.5|Half)\s*$/i, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  var nameKey = "";
  try {
    nameKey = clientMatchKey_(cleanName);
  } catch (err2) {
    nameKey = String(cleanName || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
  }

  if (nameKey) {
    var byName = payoutIndex.byClientName[nameKey];
    var byNamePay = pickPayrollPayFromClientRow_(byName, jobType);
    if (byNamePay > 0) return byNamePay;

    // Soft fallback for names with small spelling/formatting differences.
    var keys = Object.keys(payoutIndex.byClientName || {});
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (!k) continue;
      if (k.indexOf(nameKey) >= 0 || nameKey.indexOf(k) >= 0) {
        var softPay = pickPayrollPayFromClientRow_(payoutIndex.byClientName[k], jobType);
        if (softPay > 0) return softPay;
      }
    }
  }

  return 0;
}

function logsInPayrollPeriod_(period) {
  var ss = getClockSS_();
  var sh = ss.getSheetByName(LOGS_SHEET);
  if (!sh) return [];

  var data = sh.getDataRange().getValues();
  if (data.length < 2) return [];

  var headers = data[0];
  var timestampIdx = findHeaderIndex_(headers, ["timestamp", "Timestamp", "client timestamp", "Client Timestamp"]);
  var employeeIdIdx = findHeaderIndex_(headers, ["employee id", "Employee ID", "employeeId", "EmployeeID"]);
  var employeeNameIdx = findHeaderIndex_(headers, ["employee name", "Employee Name", "employeeName", "EmployeeName"]);
  var actionIdx = findHeaderIndex_(headers, ["action", "Action"]);
  var jobNameIdx = findHeaderIndex_(headers, ["job name", "Job Name", "job", "Job"]);
  var jobIdIdx = findHeaderIndex_(headers, ["job id", "Job ID", "jobId", "JobID"]);
  var jobPayIdx = findHeaderIndex_(headers, ["job pay", "Job Pay", "pay", "Pay"]);

  var start = parseLocalYMD_(period.startDate || period.start);
  var end = parseLocalYMD_(period.endDate || period.end);
  if (!start || !end) return [];

  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);

  var rows = [];

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var rawTs = timestampIdx >= 0 ? row[timestampIdx] : row[0];
    var ts = parseLocalYMD_(rawTs);
    if (!ts) continue;
    if (ts < start || ts > end) continue;

    rows.push({
      timestamp: ts,
      timestampText: rawTs,
      employeeId: employeeIdIdx >= 0 ? String(row[employeeIdIdx] || "") : "",
      employeeName: employeeNameIdx >= 0 ? String(row[employeeNameIdx] || "") : "",
      action: actionIdx >= 0 ? String(row[actionIdx] || "") : "",
      jobId: jobIdIdx >= 0 ? String(row[jobIdIdx] || "") : "",
      jobName: jobNameIdx >= 0 ? String(row[jobNameIdx] || "") : "",
      jobPay: jobPayIdx >= 0 ? Number(row[jobPayIdx] || 0) : 0
    });
  }

  return rows;
}


function getWeeklyBoardAddOnsInPayrollPeriod_(period) {
  var weekStart = ymd_(period.startDate || period.start);
  var start = String(period.startDate || period.start || "");
  var end = String(period.endDate || period.end || "");
  if (!weekStart || !start || !end) return [];

  var rows = readWeeklyBoardRowsForWeek_(weekStart);
  return rows.filter(function(row) {
    var serviceDate = String(row.serviceDate || "");
    if (!serviceDate || serviceDate < start || serviceDate > end) return false;
    return normalizeAssignmentType_(row.assignmentType || "") === "ADD_ON";
  }).map(function(row) {
    row.payrollEnteredPay = normalizePayrollEnteredPay_(row.payrollEnteredPay);
    return row;
  });
}


function payrollEmployeeIdentityKeys_(employeeId, employeeName) {
  var keys = [];
  var id = String(employeeId || "").trim().toUpperCase();
  var name = String(employeeName || "").trim();

  if (id) keys.push("ID:" + id);
  if (name) {
    try {
      keys.push("NAME:" + clientMatchKey_(name));
    } catch (err) {
      keys.push("NAME:" + String(name).toLowerCase().replace(/[^a-z0-9]+/g, ""));
    }
  }

  return keys.filter(function(k, idx, arr) {
    return k && arr.indexOf(k) === idx;
  });
}

function payrollJobIdentityKeys_(clientId, clientName) {
  var keys = [];
  var rawId = String(clientId || "").trim();
  var baseId = payrollBaseClientIdFromJobId_(rawId);
  var name = String(clientName || "").trim();

  if (rawId) keys.push("ID:" + rawId.toLowerCase());
  if (baseId && String(baseId).toLowerCase() !== String(rawId).toLowerCase()) {
    keys.push("ID:" + String(baseId).toLowerCase());
  }

  if (name) {
    try {
      keys.push("NAME:" + clientMatchKey_(cleanClientBaseName_(name)));
    } catch (err) {
      keys.push("NAME:" + String(name).toLowerCase().replace(/[^a-z0-9]+/g, ""));
    }
  }

  return keys.filter(function(k, idx, arr) {
    return k && arr.indexOf(k) === idx;
  });
}

function payrollAssignmentCompositeKeys_(employeeId, employeeName, serviceDate, clientId, clientName) {
  var empKeys = payrollEmployeeIdentityKeys_(employeeId, employeeName);
  var jobKeys = payrollJobIdentityKeys_(clientId, clientName);
  var date = String(serviceDate || "").trim();
  var out = [];

  if (!date) return out;

  empKeys.forEach(function(empKey) {
    jobKeys.forEach(function(jobKey) {
      out.push(empKey + "|" + date + "|" + jobKey);
    });
  });

  return out;
}

function isPayrollManualJobAction_(action) {
  var a = normalizeActionForPayroll_(action || "");
  return a === "PAYROLL_MANUAL_JOB" ||
    a === "MANUAL_PAYROLL_JOB" ||
    a.indexOf("PAYROLL_MANUAL_JOB") >= 0 ||
    a.indexOf("MANUAL_PAYROLL_JOB") >= 0;
}

function buildWeeklyBoardPayrollAssignmentIndex_(period) {
  var start = String(period.startDate || period.start || "");
  var end = String(period.endDate || period.end || "");
  var weekStart = ymd_(period.startDate || period.start);

  var index = {
    addOnKeys: {},
    regularKeys: {}
  };

  if (!weekStart || !start || !end) return index;

  var rows = [];
  try {
    rows = readWeeklyBoardRowsForWeek_(weekStart);
  } catch (err) {
    rows = [];
  }

  rows.forEach(function(row) {
    row = row || {};
    var serviceDate = String(row.serviceDate || "");
    if (!serviceDate || serviceDate < start || serviceDate > end) return;

    var keys = payrollAssignmentCompositeKeys_(
      row.employeeId || "",
      row.employeeName || "",
      serviceDate,
      row.clientId || "",
      row.clientName || ""
    );

    var target = normalizeAssignmentType_(row.assignmentType || "") === "ADD_ON"
      ? index.addOnKeys
      : index.regularKeys;

    keys.forEach(function(k) {
      target[k] = true;
    });
  });

  return index;
}

function shouldSkipPayrollLogBecauseItIsAddOnOnly_(row, weeklyAssignmentIndex) {
  row = row || {};
  weeklyAssignmentIndex = weeklyAssignmentIndex || {};

  // Manual payroll adjustments are intentional payroll entries and must never be suppressed.
  if (isPayrollManualJobAction_(row.action)) return false;

  var serviceDate = ymd_(row.timestamp || row.timestampText || "");
  if (!serviceDate) return false;

  var keys = payrollAssignmentCompositeKeys_(
    row.employeeId || "",
    row.employeeName || "",
    serviceDate,
    row.jobId || "",
    row.jobName || ""
  );

  if (!keys.length) return false;

  var addOnMatch = keys.some(function(k) {
    return !!(weeklyAssignmentIndex.addOnKeys || {})[k];
  });

  if (!addOnMatch) return false;

  var regularMatch = keys.some(function(k) {
    return !!(weeklyAssignmentIndex.regularKeys || {})[k];
  });

  // If the employee also has a normal assignment for this client/date, keep the log as regular pay.
  // If the only board assignment match is ADD_ON, payroll must ignore the log and pay only PayrollEnteredPay.
  return !regularMatch;
}


function addWeeklyBoardAddOnsToPayrollSummaryRows_(period, rows) {
  rows = Array.isArray(rows) ? rows : [];
  var byEmployee = {};
  rows.forEach(function(r) {
    var key = String(r.employeeId || r.employeeName || "UNKNOWN").trim();
    if (key) byEmployee[key] = r;
  });

  var addons = getWeeklyBoardAddOnsInPayrollPeriod_(period);
  addons.forEach(function(addon) {
    var key = String(addon.employeeId || addon.employeeName || "UNKNOWN").trim();
    if (!key) key = "UNKNOWN";

    if (!byEmployee[key]) {
      byEmployee[key] = {
        employeeId: addon.employeeId || key,
        employeeName: addon.employeeName || addon.employeeId || key,
        employee: addon.employeeName || addon.employeeId || key,
        jobsCompleted: 0,
        jobs: 0,
        totalPay: 0,
        total: 0,
        exceptionCount: 0,
        exceptions: 0,
        lastUpdate: parseLocalYMD_(addon.serviceDate) || new Date(),
        status: "NOT PAID",
        periodId: payrollPeriodId_(period),
        period: payrollPeriodId_(period)
      };
      rows.push(byEmployee[key]);
    }

    var pay = normalizePayrollEnteredPay_(addon.payrollEnteredPay);
    pay = pay === "" ? 0 : Number(pay || 0);

    byEmployee[key].jobsCompleted = Number(byEmployee[key].jobsCompleted || byEmployee[key].jobs || 0) + 1;
    byEmployee[key].jobs = byEmployee[key].jobsCompleted;
    byEmployee[key].totalPay = Number(byEmployee[key].totalPay || byEmployee[key].total || 0) + pay;
    byEmployee[key].total = byEmployee[key].totalPay;

    var d = parseLocalYMD_(addon.serviceDate);
    if (d && (!byEmployee[key].lastUpdate || d > byEmployee[key].lastUpdate)) {
      byEmployee[key].lastUpdate = d;
    }
  });

  return rows;
}

function handlePayrollAddonPay_(e) {
  try {
    var auth = requireAdmin_(e);
    var period = getPayrollPeriodFromRequest_(e);
    var periodId = payrollPeriodId_(period);
    var currentStatus = String(getPayrollPeriodStatus_(periodId) || "OPEN").toUpperCase();

    if (currentStatus === "LOCKED") {
      return jsonp_(e, {
        ok: false,
        error: "period_locked",
        message: "Unlock this payroll period before entering Add-On pay."
      });
    }

    var rowId = getParam_(e, "rowId") || getParam_(e, "row_id") || "";
    var employeeId = String(getParam_(e, "employeeId") || getParam_(e, "employee_id") || "").trim().toUpperCase();
    var serviceDate = ymd_(getParam_(e, "serviceDate") || getParam_(e, "service_date") || getParam_(e, "date") || "");
    var clientName = String(getParam_(e, "clientName") || getParam_(e, "client") || "").trim();
    var addOnType = String(getParam_(e, "addOnType") || getParam_(e, "addonType") || getParam_(e, "AddOnType") || "").trim();
    var enteredPay = normalizePayrollEnteredPay_(getParam_(e, "payrollEnteredPay") || getParam_(e, "pay") || getParam_(e, "amount") || "");

    if (enteredPay === "" || Number(enteredPay) <= 0) throw new Error("missing_addon_pay");

    var sh = ensureWeeklyAssignmentsSheet_();
    var data = sh.getDataRange().getValues();
    if (data.length < 2) throw new Error("weekly_assignments_empty");

    var headers = data[0].map(function(h) { return String(h || "").trim(); });
    var rowIdIdx = findHeaderIndex_(headers, ["RowID", "Row ID", "row_id"]);
    var serviceDateIdx = findHeaderIndex_(headers, ["ServiceDate", "service_date", "Date"]);
    var empIdIdx = findHeaderIndex_(headers, ["EmployeeID", "Employee Id", "Employee ID"]);
    var clientNameIdx = findHeaderIndex_(headers, ["ClientName", "Client Name"]);
    var assignmentTypeIdx = findHeaderIndex_(headers, ["AssignmentType", "Assignment Type"]);
    var addOnTypeIdx = findHeaderIndex_(headers, ["AddOnType", "Add-On Type", "AddonType", "Add On Type"]);
    var payrollEnteredPayIdx = findHeaderIndex_(headers, ["PayrollEnteredPay", "Payroll Entered Pay", "AddOnPay", "Add-On Pay"]);
    var payrollEnteredByIdx = findHeaderIndex_(headers, ["PayrollEnteredBy", "Payroll Entered By"]);
    var payrollEnteredAtIdx = findHeaderIndex_(headers, ["PayrollEnteredAt", "Payroll Entered At"]);

    if (payrollEnteredPayIdx < 0) throw new Error("PayrollEnteredPay_column_not_found");
    if (assignmentTypeIdx < 0) throw new Error("AssignmentType_column_not_found");

    var matchedRowNumber = 0;

    for (var i = 1; i < data.length; i++) {
      var sheetRow = {
        rowId: rowIdIdx >= 0 ? String(data[i][rowIdIdx] || "").trim() : "",
        serviceDate: serviceDateIdx >= 0 ? ymdCell_(data[i][serviceDateIdx]) : "",
        employeeId: empIdIdx >= 0 ? String(data[i][empIdIdx] || "").trim().toUpperCase() : "",
        clientName: clientNameIdx >= 0 ? String(data[i][clientNameIdx] || "").trim() : "",
        assignmentType: assignmentTypeIdx >= 0 ? String(data[i][assignmentTypeIdx] || "").trim() : "",
        addOnType: addOnTypeIdx >= 0 ? String(data[i][addOnTypeIdx] || "").trim() : ""
      };

      if (normalizeAssignmentType_(sheetRow.assignmentType) !== "ADD_ON") continue;

      if (weeklyBoardAddOnRowMatches_(sheetRow, {
        rowId: rowId,
        employeeId: employeeId,
        serviceDate: serviceDate,
        clientName: clientName,
        addOnType: addOnType
      })) {
        matchedRowNumber = i + 1;
        break;
      }
    }

    if (!matchedRowNumber) throw new Error("addon_assignment_not_found");

    sh.getRange(matchedRowNumber, payrollEnteredPayIdx + 1).setValue(Number(enteredPay));
    if (payrollEnteredByIdx >= 0) sh.getRange(matchedRowNumber, payrollEnteredByIdx + 1).setValue(auth.employeeId || auth.employeeName || "");
    if (payrollEnteredAtIdx >= 0) sh.getRange(matchedRowNumber, payrollEnteredAtIdx + 1).setValue(new Date());

    // Refresh open payroll summary so finalization gross reflects entered Add-On pay immediately.
    var rows = buildPayrollSummaryFromLogs_(period);
    writePayrollSummaryRows_(period, rows);
    upsertPayrollPeriod_(period, currentStatus || "OPEN", auth);

    return jsonp_(e, {
      ok: true,
      saved: true,
      periodId: periodId,
      rowNumber: matchedRowNumber,
      payrollEnteredPay: Number(enteredPay)
    });
  } catch (err) {
    return jsonp_(e, { ok: false, error: String(err && err.message ? err.message : err) });
  }
}


function buildPayrollSummaryFromLogs_(period) {
  var logs = logsInPayrollPeriod_(period);
  var payoutIndex = buildPayrollPayoutIndex_();
  var weeklyAssignmentIndex = buildWeeklyBoardPayrollAssignmentIndex_(period);
  var byEmployee = {};

  logs.forEach(function(row) {
    if (!isClockOutAction_(row.action)) return;

    // ADD_ON payroll rule:
    // If this clock-out matches an Add-On-only Weekly_Assignments row, do not pay it from Logs
    // or Master_Schedule. Add-On pay is added separately from PayrollEnteredPay only.
    if (shouldSkipPayrollLogBecauseItIsAddOnOnly_(row, weeklyAssignmentIndex)) return;

    var key = row.employeeId || row.employeeName || "UNKNOWN";
    if (!byEmployee[key]) {
      byEmployee[key] = {
        employeeId: row.employeeId || key,
        employeeName: row.employeeName || row.employeeId || key,
        jobsCompleted: 0,
        totalPay: 0,
        exceptionCount: 0,
        lastUpdate: row.timestamp
      };
    }

    var resolvedPay = resolvePayrollPayForLogRow_(row, payoutIndex);

    byEmployee[key].jobsCompleted += 1;
    byEmployee[key].totalPay += Number(resolvedPay || 0);
    if (row.timestamp > byEmployee[key].lastUpdate) byEmployee[key].lastUpdate = row.timestamp;
  });

  var rows = Object.keys(byEmployee).map(function(key) {
    var item = byEmployee[key];
    return {
      employeeId: item.employeeId,
      employeeName: item.employeeName,
      employee: item.employeeName,
      jobsCompleted: item.jobsCompleted,
      jobs: item.jobsCompleted,
      totalPay: item.totalPay,
      total: item.totalPay,
      exceptionCount: item.exceptionCount,
      exceptions: item.exceptionCount,
      lastUpdate: item.lastUpdate,
      status: "NOT PAID",
      periodId: payrollPeriodId_(period),
      period: payrollPeriodId_(period)
    };
  });

  return addWeeklyBoardAddOnsToPayrollSummaryRows_(period, rows);
}

function writePayrollSummaryRows_(period, rows) {
  var sh = ensurePayrollSummarySheet_();
  var existing = sh.getDataRange().getValues();
  var periodId = payrollPeriodId_(period);

  var savedMap = {};
  for (var i = 1; i < existing.length; i++) {
    var row = existing[i];
    var rowPeriod = String(row[0] || "").trim();
    var rowEmp = String(row[3] || "").trim();
    if (rowPeriod === periodId && rowEmp) {
      savedMap[rowEmp] = {
        status: row[9] || "OPEN",
        paidAt: row[10] || "",
        paidBy: row[11] || "",
        paidMethod: row[12] || "",
        reference: row[13] || "",
        paymentNotes: row[14] || "",
        netPay: row[15] || "",
        taxAdjustments: row[16] || "",
        finalPaidAt: row[17] || "",
        finalPaidBy: row[18] || "",
        finalPaidMethod: row[19] || "",
        finalReference: row[20] || "",
        finalPaymentNotes: row[21] || "",
        qbExportedAt: row[22] || "",
        qbExportedBy: row[23] || "",
        qbStatus: row[24] || "",
        grossAdjustment: row[25] || "",
        grossAdjustmentReason: row[26] || ""
      };
    }
  }

  for (var r = existing.length - 1; r >= 1; r--) {
    if (String(existing[r][0] || "").trim() === periodId) sh.deleteRow(r + 1);
  }

  var values = (rows || []).map(function(r) {
    var empId = String(r.employeeId || "").trim();
    var saved = savedMap[empId] || {};
    return [
      periodId,
      period.startDate || period.start,
      period.endDate || period.end,
      empId,
      r.employeeName || r.employee || "",
      Number(r.jobsCompleted || r.jobs || 0),
      Number(r.totalPay || r.total || 0),
      Number(r.exceptionCount || r.exceptions || 0),
      r.lastUpdate || new Date(),
      saved.status || r.status || "OPEN",
      saved.paidAt || "",
      saved.paidBy || "",
      saved.paidMethod || "",
      saved.reference || "",
      saved.paymentNotes || "",
      saved.netPay || "",
      saved.taxAdjustments || "",
      saved.finalPaidAt || "",
      saved.finalPaidBy || "",
      saved.finalPaidMethod || "",
      saved.finalReference || "",
      saved.finalPaymentNotes || "",
      saved.qbExportedAt || "",
      saved.qbExportedBy || "",
      saved.qbStatus || "",
      saved.grossAdjustment || "",
      saved.grossAdjustmentReason || ""
    ];
  });

  if (values.length) sh.getRange(sh.getLastRow() + 1, 1, values.length, 27).setValues(values);
}



function readPayrollSummaryRows_(period) {
  var sh = ensurePayrollSummarySheet_();
  var data = sh.getDataRange().getValues();
  if (data.length < 2) return [];

  var headers = data[0];
  var periodIdx = findHeaderIndex_(headers, ["PeriodID", "PeriodId", "Period", "period_id"]);
  var employeeIdIdx = findHeaderIndex_(headers, ["EmployeeID", "EmployeeId", "Employee Id", "employee_id"]);
  var employeeNameIdx = findHeaderIndex_(headers, ["EmployeeName", "Employee Name", "employee"]);
  var jobsIdx = findHeaderIndex_(headers, ["JobsCompleted", "Jobs Completed", "Jobs", "JobCount", "jobs"]);
  var totalIdx = findHeaderIndex_(headers, ["TotalPay", "Total Pay", "Total", "total"]);
  var exceptionsIdx = findHeaderIndex_(headers, ["ExceptionCount", "Exception Count", "Exceptions", "exceptions"]);
  var updateIdx = findHeaderIndex_(headers, ["LastUpdate", "Last Update", "Updated", "last_update"]);
  var statusIdx = findHeaderIndex_(headers, ["Status", "status"]);
  var paidAtIdx = findHeaderIndex_(headers, ["PaidAt", "Paid At", "paid_at"]);
  var paidByIdx = findHeaderIndex_(headers, ["PaidBy", "Paid By", "paid_by"]);
  var paidMethodIdx = findHeaderIndex_(headers, ["PaidMethod", "Paid Method", "PaymentMethod", "payment_method"]);
  var referenceIdx = findHeaderIndex_(headers, ["Reference", "CheckNumber", "Check #", "check_number", "ref"]);
  var paymentNotesIdx = findHeaderIndex_(headers, ["PaymentNotes", "Payment Notes", "Notes", "payment_notes"]);
  var netPayIdx = findHeaderIndex_(headers, ["NetPay", "Net Pay", "FinalNetPay", "Final Net Pay"]);
  var taxAdjustmentsIdx = findHeaderIndex_(headers, ["TaxAdjustments", "Tax Adjustments", "TaxesAdjustments", "Taxes / Adj", "Taxes/Adj"]);
  var finalPaidAtIdx = findHeaderIndex_(headers, ["FinalPaidAt", "Final Paid At"]);
  var finalPaidByIdx = findHeaderIndex_(headers, ["FinalPaidBy", "Final Paid By"]);
  var finalPaidMethodIdx = findHeaderIndex_(headers, ["FinalPaidMethod", "Final Paid Method"]);
  var finalReferenceIdx = findHeaderIndex_(headers, ["FinalReference", "Final Reference"]);
  var finalPaymentNotesIdx = findHeaderIndex_(headers, ["FinalPaymentNotes", "Final Payment Notes"]);
  var qbExportedAtIdx = findHeaderIndex_(headers, ["QBExportedAt", "QB Exported At"]);
  var qbExportedByIdx = findHeaderIndex_(headers, ["QBExportedBy", "QB Exported By"]);
  var qbStatusIdx = findHeaderIndex_(headers, ["QBStatus", "QB Status"]);
  var grossAdjustmentIdx = findHeaderIndex_(headers, ["GrossAdjustment", "Gross Adjustment", "PayrollAdjustment", "Payroll Adjustment"]);
  var grossAdjustmentReasonIdx = findHeaderIndex_(headers, ["GrossAdjustmentReason", "Gross Adjustment Reason", "PayrollAdjustmentReason", "Payroll Adjustment Reason"]);

  var periodId = payrollPeriodId_(period);
  var out = [];

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    if (periodIdx >= 0 && String(row[periodIdx] || "") !== periodId) continue;

    var employeeId = employeeIdIdx >= 0 ? String(row[employeeIdIdx] || "") : "";
    var employeeName = employeeNameIdx >= 0 ? String(row[employeeNameIdx] || "") : "";
    if (!employeeId && !employeeName) continue;

    var status = statusIdx >= 0 ? String(row[statusIdx] || "OPEN") : "OPEN";
    var netPay = netPayIdx >= 0 ? row[netPayIdx] : "";
    var grossAdjustment = grossAdjustmentIdx >= 0 ? row[grossAdjustmentIdx] : "";
    var grossAdjustmentReason = grossAdjustmentReasonIdx >= 0 ? row[grossAdjustmentReasonIdx] : "";

    out.push({
      employeeId: employeeId,
      employeeName: employeeName,
      employee: employeeName || employeeId,
      jobsCompleted: jobsIdx >= 0 ? Number(row[jobsIdx] || 0) : 0,
      jobs: jobsIdx >= 0 ? Number(row[jobsIdx] || 0) : 0,
      totalPay: totalIdx >= 0 ? Number(row[totalIdx] || 0) : 0,
      total: totalIdx >= 0 ? Number(row[totalIdx] || 0) : 0,
      grossPay: totalIdx >= 0 ? Number(row[totalIdx] || 0) : 0,
      grossAdjustment: grossAdjustment,
      payrollAdjustment: grossAdjustment,
      grossAdjustmentReason: grossAdjustmentReason,
      payrollAdjustmentReason: grossAdjustmentReason,
      adjustedGross: (totalIdx >= 0 ? Number(row[totalIdx] || 0) : 0) + normalizePayrollMoney_(grossAdjustment),
      exceptionCount: exceptionsIdx >= 0 ? Number(row[exceptionsIdx] || 0) : 0,
      exceptions: exceptionsIdx >= 0 ? Number(row[exceptionsIdx] || 0) : 0,
      lastUpdate: updateIdx >= 0 ? row[updateIdx] : "",
      status: status,
      paid: String(status || "").toUpperCase() === "PAID" || String(status || "").toUpperCase() === "NET_PAID",
      finalPaid: String(status || "").toUpperCase() === "NET_PAID" || String(status || "").toUpperCase() === "PAID",
      paidAt: paidAtIdx >= 0 ? row[paidAtIdx] : "",
      paidBy: paidByIdx >= 0 ? row[paidByIdx] : "",
      paidMethod: paidMethodIdx >= 0 ? row[paidMethodIdx] : "",
      reference: referenceIdx >= 0 ? row[referenceIdx] : "",
      paymentNotes: paymentNotesIdx >= 0 ? row[paymentNotesIdx] : "",
      netPay: netPay,
      finalNetPay: netPay,
      taxAdjustments: taxAdjustmentsIdx >= 0 ? row[taxAdjustmentsIdx] : "",
      taxesAdjustments: taxAdjustmentsIdx >= 0 ? row[taxAdjustmentsIdx] : "",
      finalPaidAt: finalPaidAtIdx >= 0 ? row[finalPaidAtIdx] : "",
      finalPaidBy: finalPaidByIdx >= 0 ? row[finalPaidByIdx] : "",
      finalPaidMethod: finalPaidMethodIdx >= 0 ? row[finalPaidMethodIdx] : "",
      finalReference: finalReferenceIdx >= 0 ? row[finalReferenceIdx] : "",
      finalPaymentNotes: finalPaymentNotesIdx >= 0 ? row[finalPaymentNotesIdx] : "",
      qbExportedAt: qbExportedAtIdx >= 0 ? row[qbExportedAtIdx] : "",
      qbExportedBy: qbExportedByIdx >= 0 ? row[qbExportedByIdx] : "",
      qbStatus: qbStatusIdx >= 0 ? row[qbStatusIdx] : "",
      periodId: periodId,
      period: periodId
    });
  }

  return out;
}





function isPlaceholderEmployeeName_(name) {
  var s = String(name || "").trim().toLowerCase();
  if (!s) return true;

  var placeholders = {
    "employee one": true,
    "employee two": true,
    "employee three": true,
    "employee four": true,
    "employee five": true,
    "employee six": true,
    "employee seven": true,
    "employee eight": true,
    "employee nine": true,
    "employee ten": true
  };

  return !!placeholders[s];
}

function isActiveAuthValue_(value) {
  var s = String(value == null ? "" : value).trim().toLowerCase();
  return (
    s === "" ||
    s === "yes" ||
    s === "y" ||
    s === "true" ||
    s === "1" ||
    s === "active" ||
    s === "approved"
  );
}

function readActivePayrollEmployeesFromAuth_() {
  var ss = SpreadsheetApp.openById(ADMIN_SPREADSHEET_ID);
  var sh = ss.getSheetByName(AUTH_SHEET);
  if (!sh) throw new Error("Auth sheet not found");

  var data = sh.getDataRange().getValues();
  if (data.length < 2) return [];

  var headers = data[0];
  var employeeIdIdx = findHeaderIndex_(headers, ["EmployeeId", "EmployeeID", "Employee ID", "employee id", "ID", "EmpID", "Emp ID"]);
  var employeeNameIdx = findHeaderIndex_(headers, ["EmployeeName", "Employee Name", "employee name", "Name", "Cleaner", "Cleaner Name"]);
  var activeIdx = findHeaderIndex_(headers, ["Active", "active", "Status", "status"]);
  var approvalIdx = findHeaderIndex_(headers, ["ApprovalStatus", "Approval Status", "approval status"]);

  if (employeeIdIdx < 0) throw new Error("EmployeeId column not found in Auth sheet");
  if (employeeNameIdx < 0) throw new Error("EmployeeName column not found in Auth sheet");

  var seen = {};
  var employees = [];

  for (var i = 1; i < data.length; i++) {
    var row = data[i];

    var employeeId = String(row[employeeIdIdx] || "").trim().toUpperCase();
    var employeeName = String(row[employeeNameIdx] || "").trim();

    if (!employeeId) continue;
    if (!employeeName) continue;
    if (isPlaceholderEmployeeName_(employeeName)) continue;

    var activeRaw = activeIdx >= 0 ? row[activeIdx] : "YES";
    if (!isActiveAuthValue_(activeRaw)) continue;

    var approvalRaw = approvalIdx >= 0 ? String(row[approvalIdx] || "").trim().toLowerCase() : "";
    if (approvalRaw === "no" || approvalRaw === "denied" || approvalRaw === "inactive" || approvalRaw === "disabled") continue;

    if (seen[employeeId]) continue;
    seen[employeeId] = true;

    employees.push({
      employeeId: employeeId,
      employeeName: employeeName,
      id: employeeId,
      name: employeeName
    });
  }

  employees.sort(function(a, b) {
    return String(a.employeeId || "").localeCompare(String(b.employeeId || ""));
  });

  return employees;
}

function handlePayrollEmployees_(e) {
  try {
    requireAdmin_(e);

    var employees = readActivePayrollEmployeesFromAuth_();

    return jsonp_(e, {
      ok: true,
      source: "ADMIN_AUTH",
      employees: employees,
      rows: employees,
      count: employees.length
    });
  } catch (err) {
    return jsonp_(e, {
      ok: false,
      error: String(err && err.message ? err.message : err)
    });
  }
}

function getActivePayrollEmployeeById_(employeeId) {
  employeeId = String(employeeId || "").trim().toUpperCase();
  if (!employeeId) return null;

  var employees = readActivePayrollEmployeesFromAuth_();

  for (var i = 0; i < employees.length; i++) {
    if (String(employees[i].employeeId || "").trim().toUpperCase() === employeeId) {
      return {
        employeeId: employees[i].employeeId,
        employeeName: employees[i].employeeName
      };
    }
  }

  return null;
}

function getPayrollJobById_(jobId) {
  jobId = String(jobId || "").trim();
  if (!jobId) return null;

  var rows = getClientsSheetRaw_();
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i] || {};
    var active = String(r.active || "").trim().toUpperCase();
    if (active === "NO" || active === "FALSE" || active === "0" || active === "INACTIVE") continue;

    var clientId = String(r.clientId || "").trim();
    var clientName = String(r.clientName || "").trim();
    if (!clientName) continue;

    var baseId = clientId || clientName.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    var jobIdPlain = baseId + "_JOB";
    var fullId = baseId + "_FULL";
    var halfId = baseId + "_HALF";

    if (jobId === jobIdPlain && String(r.jobPay || "").trim() !== "") {
      return {
        id: jobIdPlain,
        name: clientName,
        clientName: clientName,
        pay: Number(r.jobPay || 0),
        address: r.address || ""
      };
    }

    if (jobId === fullId && String(r.fullPay || "").trim() !== "") {
      return {
        id: fullId,
        name: clientName + " - Full",
        clientName: clientName,
        pay: Number(r.fullPay || 0),
        address: r.address || ""
      };
    }

    if (jobId === halfId && String(r.halfPay || "").trim() !== "") {
      return {
        id: halfId,
        name: clientName + " - .5",
        clientName: clientName,
        pay: Number(r.halfPay || 0),
        address: r.address || ""
      };
    }
  }

  return null;
}

function appendPayrollManualJobLog_(serviceDate, employeeId, employeeName, job, notes, auth) {
  var sh = ensureLogsSheet_();
  var dt = parseLocalYMD_(serviceDate) || new Date();
  dt.setHours(12, 0, 0, 0);

  var noteText = "Manual payroll add";
  if (notes) noteText += ": " + notes;
  if (auth && (auth.employeeId || auth.employeeName)) {
    noteText += " | Added by " + (auth.employeeId || auth.employeeName);
  }

  sh.appendRow([
    dt,
    employeeId,
    employeeName,
    "Payroll Manual Job",
    job.id || "MANUAL",
    job.name || job.clientName || "Manual Job",
    Number(job.pay || 0),
    noteText,
    "",
    "",
    "",
    "",
    new Date()
  ]);
}

function payrollCorrectionDateTime_(serviceDate, timeValue, fallbackHour, fallbackMinute) {
  var base = parseLocalYMD_(serviceDate) || new Date();
  var h = Number(fallbackHour || 12);
  var m = Number(fallbackMinute || 0);
  var t = String(timeValue || "").trim();
  var match = t.match(/^(\d{1,2}):(\d{2})/);
  if (match) {
    h = Number(match[1]);
    m = Number(match[2]);
  }
  base.setHours(h, m, 0, 0);
  return base;
}

function payrollCorrectionSameServiceDate_(value, serviceDate) {
  return String(ymd_(value || "")) === String(ymd_(serviceDate || ""));
}

function payrollCorrectionLogMatchesJob_(rowJobId, rowJobName, job) {
  var targetId = String((job && job.id) || "").trim().toLowerCase();
  var targetName = String((job && (job.name || job.clientName)) || "").trim().toLowerCase();
  var baseTargetName = "";
  try { baseTargetName = cleanClientBaseName_(targetName).toLowerCase(); } catch (err) { baseTargetName = targetName; }

  var currentId = String(rowJobId || "").trim().toLowerCase();
  var currentName = String(rowJobName || "").trim().toLowerCase();
  var baseCurrentName = "";
  try { baseCurrentName = cleanClientBaseName_(currentName).toLowerCase(); } catch (err2) { baseCurrentName = currentName; }

  if (targetId && currentId && targetId === currentId) return true;
  if (targetName && currentName && targetName === currentName) return true;
  if (baseTargetName && baseCurrentName && baseTargetName === baseCurrentName) return true;
  return false;
}

function upsertPayrollCorrectionClockLog_(serviceDate, employeeId, employeeName, actionLabel, job, whenValue, notes, auth) {
  var sh = ensureLogsSheet_();
  var data = sh.getDataRange().getValues();
  var headers = data.length ? data[0] : [];

  var timestampIdx = findHeaderIndex_(headers, ["timestamp", "Timestamp", "client timestamp", "Client Timestamp"]);
  var employeeIdIdx = findHeaderIndex_(headers, ["employee id", "Employee ID", "employeeId", "EmployeeID"]);
  var employeeNameIdx = findHeaderIndex_(headers, ["employee name", "Employee Name", "employeeName", "EmployeeName"]);
  var actionIdx = findHeaderIndex_(headers, ["action", "Action"]);
  var jobIdIdx = findHeaderIndex_(headers, ["job id", "Job ID", "jobId", "JobID"]);
  var jobNameIdx = findHeaderIndex_(headers, ["job name", "Job Name", "job", "Job"]);
  var jobPayIdx = findHeaderIndex_(headers, ["job pay", "Job Pay", "pay", "Pay"]);
  var notesIdx = findHeaderIndex_(headers, ["notes", "Notes"]);
  var gpsDeniedIdx = findHeaderIndex_(headers, ["gps denied", "GPS Denied", "gpsDenied"]);
  var clientTimestampIdx = findHeaderIndex_(headers, ["client timestamp", "Client Timestamp", "clientTimestamp"]);

  if (timestampIdx < 0) timestampIdx = 0;
  if (employeeIdIdx < 0) employeeIdIdx = 1;
  if (employeeNameIdx < 0) employeeNameIdx = 2;
  if (actionIdx < 0) actionIdx = 3;
  if (jobIdIdx < 0) jobIdIdx = 4;
  if (jobNameIdx < 0) jobNameIdx = 5;
  if (jobPayIdx < 0) jobPayIdx = 6;
  if (notesIdx < 0) notesIdx = 7;
  if (gpsDeniedIdx < 0) gpsDeniedIdx = 11;
  if (clientTimestampIdx < 0) clientTimestampIdx = 12;

  var isOut = isClockOutAction_(actionLabel);
  var dt = payrollCorrectionDateTime_(serviceDate, whenValue, isOut ? 12 : 8, 0);
  var correctedBy = (auth && (auth.employeeId || auth.employeeName)) || "ADMIN";
  var noteText = "ADMIN PAYROLL CORRECTION by " + correctedBy + ": " + String(notes || "").trim();
  var targetActionNorm = normalizeActionForPayroll_(actionLabel);
  var matchedRow = 0;

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var rowEmp = String(row[employeeIdIdx] || "").trim().toUpperCase();
    if (rowEmp !== String(employeeId || "").trim().toUpperCase()) continue;
    if (!payrollCorrectionSameServiceDate_(row[timestampIdx], serviceDate)) continue;
    if (normalizeActionForPayroll_(row[actionIdx]) !== targetActionNorm) continue;
    if (!payrollCorrectionLogMatchesJob_(row[jobIdIdx], row[jobNameIdx], job)) continue;
    matchedRow = i + 1;
    break;
  }

  var rowValues = [
    dt,
    employeeId,
    employeeName,
    actionLabel,
    job.id || "MANUAL",
    job.name || job.clientName || "Manual Job",
    isOut ? Number(job.pay || 0) : "",
    noteText,
    "",
    "",
    "",
    "ADMIN",
    dt
  ];

  if (matchedRow) {
    sh.getRange(matchedRow, timestampIdx + 1).setValue(dt);
    sh.getRange(matchedRow, employeeIdIdx + 1).setValue(employeeId);
    sh.getRange(matchedRow, employeeNameIdx + 1).setValue(employeeName);
    sh.getRange(matchedRow, actionIdx + 1).setValue(actionLabel);
    sh.getRange(matchedRow, jobIdIdx + 1).setValue(job.id || "MANUAL");
    sh.getRange(matchedRow, jobNameIdx + 1).setValue(job.name || job.clientName || "Manual Job");
    sh.getRange(matchedRow, jobPayIdx + 1).setValue(isOut ? Number(job.pay || 0) : "");
    sh.getRange(matchedRow, notesIdx + 1).setValue(noteText);
    sh.getRange(matchedRow, gpsDeniedIdx + 1).setValue("ADMIN");
    sh.getRange(matchedRow, clientTimestampIdx + 1).setValue(dt);
    return { mode: "updated", row: matchedRow };
  }

  sh.appendRow(rowValues);
  return { mode: "added", row: sh.getLastRow() };
}

function handlePayrollCorrection_(e) {
  try {
    var auth = requireAdmin_(e);
    var period = getPayrollPeriodFromRequest_(e);
    var periodId = payrollPeriodId_(period);
    var status = String(getPayrollPeriodStatus_(periodId) || "OPEN").toUpperCase();

    var serviceDate = getParam_(e, "serviceDate") || getParam_(e, "date") || ymd_(new Date());
    var employeeId = String(getParam_(e, "employeeId") || getParam_(e, "employee_id") || "").trim().toUpperCase();
    var jobId = String(getParam_(e, "jobId") || getParam_(e, "job_id") || "").trim();
    var clockIn = String(getParam_(e, "clockIn") || getParam_(e, "clock_in") || "").trim();
    var clockOut = String(getParam_(e, "clockOut") || getParam_(e, "clock_out") || "").trim();
    var notes = getParam_(e, "notes") || getParam_(e, "reason") || "";
    var pin = getParam_(e, "pin") || getParam_(e, "employeePin") || getParam_(e, "payrollPin") || "";
    var reason = getParam_(e, "reason") || getParam_(e, "unlockReason") || notes || "";

    if (!periodId) throw new Error("missing_period_id");
    if (!serviceDate) throw new Error("missing_service_date");
    if (!employeeId) throw new Error("missing_employee_id");
    if (!jobId) throw new Error("missing_job_id");
    if (!String(notes || "").trim()) throw new Error("missing_correction_reason");

    var start = parseLocalYMD_(period.startDate || period.start);
    var end = parseLocalYMD_(period.endDate || period.end);
    var svc = parseLocalYMD_(serviceDate);
    if (!svc || !start || !end) throw new Error("invalid_service_date");
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    svc.setHours(12, 0, 0, 0);
    if (svc < start || svc > end) throw new Error("job_date_outside_payroll_period");

    var payrollEmployee = getActivePayrollEmployeeById_(employeeId);
    var employeeName = payrollEmployee ? payrollEmployee.employeeName : "";
    if (!employeeName) throw new Error("invalid_or_inactive_employee");

    var job = getPayrollJobById_(jobId);
    if (!job) throw new Error("job_not_found_or_missing_pay");
    if (!Number(job.pay || 0)) throw new Error("job_missing_pay");

    if (status === "LOCKED") {
      if (!pin) {
        return jsonp_(e, {
          ok: false,
          error: "period_locked_pin_required",
          periodId: periodId,
          status: "LOCKED",
          message: "This payroll period is locked. Enter employee PIN and reason to unlock before applying the correction."
        });
      }
      if (!String(reason || "").trim()) throw new Error("missing_unlock_reason");

      verifyPayrollUnlockPin_(auth, pin);
      var previousStatus = getPayrollPeriodStatus_(periodId) || "LOCKED";
      upsertPayrollPeriod_(period, "OPEN", auth);
      reopenPayrollSummaryRows_(periodId);

      var logSh = ensurePayrollUnlockLogSheet_();
      logSh.appendRow([
        new Date(),
        periodId,
        auth.employeeId || auth.employeeName || "",
        "Payroll Correction: " + reason,
        previousStatus,
        "OPEN"
      ]);
    }

    var corrections = [];
    if (clockIn) corrections.push(upsertPayrollCorrectionClockLog_(ymd_(svc), employeeId, employeeName, "Clock In", job, clockIn, notes, auth));
    if (clockOut) corrections.push(upsertPayrollCorrectionClockLog_(ymd_(svc), employeeId, employeeName, "Clock Out", job, clockOut, notes, auth));

    if (!clockIn && !clockOut) {
      appendPayrollManualJobLog_(ymd_(svc), employeeId, employeeName, job, notes, auth);
      corrections.push({ mode: "manual_payroll_job", row: "" });
    }

    var rows = buildPayrollSummaryFromLogs_(period);
    writePayrollSummaryRows_(period, rows);
    upsertPayrollPeriod_(period, "OPEN", auth);

    return jsonp_(e, {
      ok: true,
      corrected: true,
      unlocked: status === "LOCKED",
      periodId: periodId,
      period: periodId,
      status: "OPEN",
      employeeId: employeeId,
      employeeName: employeeName,
      jobId: job.id,
      jobName: job.name,
      jobPay: Number(job.pay || 0),
      clockIn: clockIn,
      clockOut: clockOut,
      corrections: corrections,
      rows: readPayrollSummaryRows_(period)
    });
  } catch (err) {
    return jsonp_(e, {
      ok: false,
      error: String(err && err.message ? err.message : err)
    });
  }
}

function handlePayrollAddJob_(e) {
  try {
    var auth = requireAdmin_(e);
    var period = getPayrollPeriodFromRequest_(e);
    var periodId = payrollPeriodId_(period);
    var status = String(getPayrollPeriodStatus_(periodId) || "OPEN").toUpperCase();

    var serviceDate = getParam_(e, "serviceDate") || getParam_(e, "date") || ymd_(new Date());
    var employeeId = String(getParam_(e, "employeeId") || getParam_(e, "employee_id") || "").trim().toUpperCase();
    var jobId = String(getParam_(e, "jobId") || getParam_(e, "job_id") || "").trim();
    var notes = getParam_(e, "notes") || "";
    var pin = getParam_(e, "pin") || getParam_(e, "employeePin") || getParam_(e, "payrollPin") || "";
    var reason = getParam_(e, "reason") || getParam_(e, "unlockReason") || "";

    if (!periodId) throw new Error("missing_period_id");
    if (!serviceDate) throw new Error("missing_service_date");
    if (!employeeId) throw new Error("missing_employee_id");
    if (!jobId) throw new Error("missing_job_id");

    var start = parseLocalYMD_(period.startDate || period.start);
    var end = parseLocalYMD_(period.endDate || period.end);
    var svc = parseLocalYMD_(serviceDate);
    if (!svc || !start || !end) throw new Error("invalid_service_date");
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    svc.setHours(12, 0, 0, 0);
    if (svc < start || svc > end) throw new Error("job_date_outside_payroll_period");

    var payrollEmployee = getActivePayrollEmployeeById_(employeeId);
    var employeeName = payrollEmployee ? payrollEmployee.employeeName : "";
    if (!employeeName) throw new Error("invalid_or_inactive_employee");

    var job = getPayrollJobById_(jobId);
    if (!job) throw new Error("job_not_found_or_missing_pay");
    if (!Number(job.pay || 0)) throw new Error("job_missing_pay");

    if (status === "LOCKED") {
      if (!pin) {
        return jsonp_(e, {
          ok: false,
          error: "period_locked_pin_required",
          periodId: periodId,
          status: "LOCKED",
          message: "This payroll period is locked. Enter employee PIN and reason to unlock before adding the job."
        });
      }
      if (!String(reason || "").trim()) throw new Error("missing_unlock_reason");

      verifyPayrollUnlockPin_(auth, pin);
      var previousStatus = getPayrollPeriodStatus_(periodId) || "LOCKED";
      upsertPayrollPeriod_(period, "OPEN", auth);
      reopenPayrollSummaryRows_(periodId);

      var logSh = ensurePayrollUnlockLogSheet_();
      logSh.appendRow([
        new Date(),
        periodId,
        auth.employeeId || auth.employeeName || "",
        "Add Job to Employee: " + reason,
        previousStatus,
        "OPEN"
      ]);
    }

    appendPayrollManualJobLog_(ymd_(svc), employeeId, employeeName, job, notes, auth);

    var rows = buildPayrollSummaryFromLogs_(period);
    writePayrollSummaryRows_(period, rows);
    upsertPayrollPeriod_(period, "OPEN", auth);

    return jsonp_(e, {
      ok: true,
      added: true,
      unlocked: status === "LOCKED",
      periodId: periodId,
      period: periodId,
      status: "OPEN",
      employeeId: employeeId,
      employeeName: employeeName,
      jobId: job.id,
      jobName: job.name,
      jobPay: Number(job.pay || 0),
      rows: readPayrollSummaryRows_(period)
    });
  } catch (err) {
    return jsonp_(e, {
      ok: false,
      error: String(err && err.message ? err.message : err)
    });
  }
}

function handlePayrollCurrent_(e) {
  try {
    var auth = requireAdmin_(e);
    var period = getPayrollPeriodFromRequest_(e);
    var periodId = payrollPeriodId_(period);
    var status = getPayrollPeriodStatus_(periodId);

    return jsonp_(e, {
      ok: true,
      authorized: true,
      employeeId: auth.employeeId || "",
      employeeName: auth.employeeName || "",
      id: periodId,
      periodId: periodId,
      period_id: periodId,
      currentPeriodId: periodId,
      current_period_id: periodId,
      period: periodId,
      startDate: period.startDate,
      endDate: period.endDate,
      start: period.startDate,
      end: period.endDate,
      periodStart: period.startDate,
      periodEnd: period.endDate,
      status: status || "OPEN",
      payday: "",
      current: {
        id: periodId,
        periodId: periodId,
        period_id: periodId,
        startDate: period.startDate,
        endDate: period.endDate,
        start: period.startDate,
        end: period.endDate,
        status: status || "OPEN"
      }
    });
  } catch (err) {
    return jsonp_(e, { ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function handlePayrollSummary_(e) {
  try {
    requireAdmin_(e);
    var period = getPayrollPeriodFromRequest_(e);
    var periodId = payrollPeriodId_(period);
    var rows = readPayrollSummaryRows_(period);

    return jsonp_(e, {
      ok: true,
      periodId: periodId,
      period: periodId,
      startDate: period.startDate,
      endDate: period.endDate,
      summaryRows: rows,
      rows: rows,
      summary: rows
    });
  } catch (err) {
    return jsonp_(e, { ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function handlePayrollGenerate_(e) {
  try {
    var auth = requireAdmin_(e);
    var period = getPayrollPeriodFromRequest_(e);
    var periodId = payrollPeriodId_(period);
    var currentStatus = String(getPayrollPeriodStatus_(periodId) || "OPEN").toUpperCase();

    if (currentStatus === "LOCKED") {
      return jsonp_(e, {
        ok: false,
        error: "period_locked",
        message: "This payroll period is locked. Unlock or create an adjustment instead of regenerating.",
        periodId: periodId,
        period: periodId,
        status: "LOCKED"
      });
    }

    var rows = buildPayrollSummaryFromLogs_(period);

    writePayrollSummaryRows_(period, rows);
    upsertPayrollPeriod_(period, currentStatus || "OPEN", auth);

    return jsonp_(e, {
      ok: true,
      generated: true,
      periodId: periodId,
      period: periodId,
      startDate: period.startDate,
      endDate: period.endDate,
      summaryRows: readPayrollSummaryRows_(period),
      rows: readPayrollSummaryRows_(period),
      summary: readPayrollSummaryRows_(period)
    });
  } catch (err) {
    return jsonp_(e, { ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function handlePayrollLock_(e) {
  try {
    var auth = requireAdmin_(e);
    var period = getPayrollPeriodFromRequest_(e);
    var periodId = payrollPeriodId_(period);

    upsertPayrollPeriod_(period, "LOCKED", auth);

    return jsonp_(e, {
      ok: true,
      locked: true,
      periodId: periodId,
      period: periodId,
      startDate: period.startDate,
      endDate: period.endDate,
      status: "LOCKED"
    });
  } catch (err) {
    return jsonp_(e, { ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function handlePayrollPayouts_(e) {
  try {
    requireAdmin_(e);
    var period = getPayrollPeriodFromRequest_(e);
    var periodId = payrollPeriodId_(period);
    var summaryRows = readPayrollSummaryRows_(period);
    var logs = logsInPayrollPeriod_(period);
    var payoutIndex = buildPayrollPayoutIndex_();
    var weeklyAssignmentIndex = buildWeeklyBoardPayrollAssignmentIndex_(period);
    var addOns = getWeeklyBoardAddOnsInPayrollPeriod_(period);

    var employeesMap = {};
    summaryRows.forEach(function(r) {
      var key = r.employeeId || r.employeeName || "UNKNOWN";
      employeesMap[key] = {
        employeeId: r.employeeId || key,
        employeeName: r.employeeName || r.employee || key,
        totalPay: Number(r.totalPay || r.total || 0),
        jobs: []
      };
    });

    logs.forEach(function(row) {
      if (!isClockOutAction_(row.action)) return;

      // ADD_ON payroll rule:
      // Suppress the normal Logs/Master_Schedule payout when the only matching board row is ADD_ON.
      // The add-on card below is still shown and paid only by PayrollEnteredPay.
      if (shouldSkipPayrollLogBecauseItIsAddOnOnly_(row, weeklyAssignmentIndex)) return;

      var key = row.employeeId || row.employeeName || "UNKNOWN";
      if (!employeesMap[key]) {
        employeesMap[key] = {
          employeeId: row.employeeId || key,
          employeeName: row.employeeName || row.employeeId || key,
          totalPay: 0,
          jobs: []
        };
      }

      var jobName = String(row.jobName || "").trim();
      var jobId = String(row.jobId || "").trim();
      var pay = resolvePayrollPayForLogRow_(row, payoutIndex);

      employeesMap[key].jobs.push({
        date: ymd_(row.timestamp),
        serviceDate: ymd_(row.timestamp),
        jobId: jobId,
        jobName: jobName || jobId || "-",
        clientName: jobName || jobId || "-",
        assignmentType: "FULL",
        jobPay: pay,
        pay: pay
      });
    });

    addOns.forEach(function(addon) {
      var key = addon.employeeId || addon.employeeName || "UNKNOWN";
      if (!employeesMap[key]) {
        employeesMap[key] = {
          employeeId: addon.employeeId || key,
          employeeName: addon.employeeName || addon.employeeId || key,
          totalPay: 0,
          jobs: []
        };
      }

      var enteredPay = normalizePayrollEnteredPay_(addon.payrollEnteredPay);
      var pay = enteredPay === "" ? 0 : Number(enteredPay || 0);

      employeesMap[key].jobs.push({
        rowId: addon.rowId || "",
        date: addon.serviceDate || "",
        serviceDate: addon.serviceDate || "",
        jobId: addon.rowId || "",
        jobName: addon.clientName || "Add-On",
        clientName: addon.clientName || "Add-On",
        assignmentType: "ADD_ON",
        addOnType: addon.addOnType || "",
        addOnNotes: addon.addOnNotes || "",
        payrollEnteredPay: enteredPay,
        payrollEnteredBy: addon.payrollEnteredBy || "",
        payrollEnteredAt: addon.payrollEnteredAt || "",
        jobPay: pay,
        pay: pay
      });
    });

    var employees = Object.keys(employeesMap).map(function(k) {
      var emp = employeesMap[k];
      var jobsTotal = (emp.jobs || []).reduce(function(sum, j) {
        if (normalizeAssignmentType_(j.assignmentType || "") === "ADD_ON") {
          var addonPay = normalizePayrollEnteredPay_(j.payrollEnteredPay);
          return sum + (addonPay === "" ? 0 : Number(addonPay || 0));
        }
        return sum + Number(j.jobPay || j.pay || 0);
      }, 0);

      // Payroll job breakdown is the most current source here because it rehydrates
      // blank/zero Logs.Job Pay values from Master_Schedule and includes Weekly Board Add-Ons.
      emp.totalPay = jobsTotal;
      return emp;
    });

    var grandTotal = employees.reduce(function(sum, emp) {
      return sum + Number(emp.totalPay || 0);
    }, 0);

    return jsonp_(e, {
      ok: true,
      periodId: periodId,
      period: periodId,
      startDate: period.startDate,
      endDate: period.endDate,
      payouts: {
        employees: employees,
        grandTotal: grandTotal
      },
      payoutRows: employees,
      rows: employees
    });
  } catch (err) {
    return jsonp_(e, { ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function handlePayrollPayments_(e) {
  try {
    requireAdmin_(e);
    var period = getPayrollPeriodFromRequest_(e);
    var periodId = payrollPeriodId_(period);
    var rows = readPayrollSummaryRows_(period).map(function(r) {
      var gross = Number(r.totalPay || r.total || 0);
      var grossAdjustment = normalizePayrollMoney_(r.grossAdjustment || r.payrollAdjustment || 0);
      return {
        employeeId: r.employeeId || "",
        employeeName: r.employeeName || r.employee || "",
        periodId: periodId,
        period: periodId,
        startDate: period.startDate,
        endDate: period.endDate,
        totalPay: gross,
        grossPay: gross,
        grossAdjustment: r.grossAdjustment || "",
        payrollAdjustment: r.grossAdjustment || "",
        grossAdjustmentReason: r.grossAdjustmentReason || "",
        payrollAdjustmentReason: r.grossAdjustmentReason || "",
        adjustedGross: gross + grossAdjustment,
        paid: String(r.status || "").toUpperCase() === "PAID" || String(r.status || "").toUpperCase() === "NET_PAID",
        finalPaid: String(r.status || "").toUpperCase() === "NET_PAID" || String(r.status || "").toUpperCase() === "PAID",
        paidAt: r.paidAt || "",
        paidBy: r.paidBy || "",
        paidMethod: r.paidMethod || "",
        reference: r.reference || "",
        paymentNotes: r.paymentNotes || "",
        netPay: r.netPay || "",
        finalNetPay: r.finalNetPay || r.netPay || "",
        taxAdjustments: r.taxAdjustments || r.taxesAdjustments || "",
        taxesAdjustments: r.taxAdjustments || r.taxesAdjustments || "",
        finalPaidAt: r.finalPaidAt || "",
        finalPaidBy: r.finalPaidBy || "",
        finalPaidMethod: r.finalPaidMethod || r.paidMethod || "",
        finalReference: r.finalReference || r.reference || "",
        finalPaymentNotes: r.finalPaymentNotes || r.paymentNotes || "",
        qbExportedAt: r.qbExportedAt || "",
        qbExportedBy: r.qbExportedBy || "",
        qbStatus: r.qbStatus || "",
        status: r.status || "OPEN"
      };
    });

    return jsonp_(e, {
      ok: true,
      periodId: periodId,
      period: {
        periodId: periodId,
        startDate: period.startDate,
        endDate: period.endDate,
        status: getPayrollPeriodStatus_(periodId) || "OPEN"
      },
      rows: rows
    });
  } catch (err) {
    return jsonp_(e, { ok: false, error: String(err && err.message ? err.message : err) });
  }
}





function handlePayrollPeriods_(e) {
  try {
    requireAdmin_(e);

    var current = getCurrentPayPeriod_();
    var currentId = payrollPeriodId_(current);
    var byId = {};

    function addPeriod_(periodId, startDate, endDate, status, lockedAt, lockedBy, lastUpdate) {
      if (!periodId) return;
      byId[String(periodId)] = {
        periodId: String(periodId),
        period: String(periodId),
        startDate: startDate || "",
        endDate: endDate || "",
        status: status || "OPEN",
        lockedAt: lockedAt || "",
        lockedBy: lockedBy || "",
        lastUpdate: lastUpdate || ""
      };
    }

    addPeriod_(currentId, current.startDate, current.endDate, getPayrollPeriodStatus_(currentId), "", "", "");

    var periodsSh = ensurePayrollPeriodsSheet_();
    var pData = periodsSh.getDataRange().getValues();
    if (pData.length >= 2) {
      var pHeaders = pData[0];
      var idIdx = findHeaderIndex_(pHeaders, ["PeriodID", "PeriodId", "Period", "period_id"]);
      var startIdx = findHeaderIndex_(pHeaders, ["StartDate", "start"]);
      var endIdx = findHeaderIndex_(pHeaders, ["EndDate", "end"]);
      var statusIdx = findHeaderIndex_(pHeaders, ["Status", "status"]);
      var lockedAtIdx = findHeaderIndex_(pHeaders, ["LockedAt", "locked_at"]);
      var lockedByIdx = findHeaderIndex_(pHeaders, ["LockedBy", "locked_by"]);
      var updateIdx = findHeaderIndex_(pHeaders, ["LastUpdate", "last_update"]);

      for (var i = 1; i < pData.length; i++) {
        var r = pData[i];
        addPeriod_(
          idIdx >= 0 ? r[idIdx] : "",
          startIdx >= 0 ? r[startIdx] : "",
          endIdx >= 0 ? r[endIdx] : "",
          statusIdx >= 0 ? r[statusIdx] : "OPEN",
          lockedAtIdx >= 0 ? r[lockedAtIdx] : "",
          lockedByIdx >= 0 ? r[lockedByIdx] : "",
          updateIdx >= 0 ? r[updateIdx] : ""
        );
      }
    }

    var summarySh = ensurePayrollSummarySheet_();
    var sData = summarySh.getDataRange().getValues();
    if (sData.length >= 2) {
      var sHeaders = sData[0];
      var sPeriodIdx = findHeaderIndex_(sHeaders, ["PeriodID", "PeriodId", "Period", "period_id"]);
      var sStartIdx = findHeaderIndex_(sHeaders, ["StartDate", "start"]);
      var sEndIdx = findHeaderIndex_(sHeaders, ["EndDate", "end"]);
      var sUpdateIdx = findHeaderIndex_(sHeaders, ["LastUpdate", "last_update"]);

      for (var j = 1; j < sData.length; j++) {
        var sr = sData[j];
        var pid = sPeriodIdx >= 0 ? String(sr[sPeriodIdx] || "").trim() : "";
        if (!pid) continue;
        if (!byId[pid]) {
          addPeriod_(
            pid,
            sStartIdx >= 0 ? sr[sStartIdx] : "",
            sEndIdx >= 0 ? sr[sEndIdx] : "",
            getPayrollPeriodStatus_(pid),
            "",
            "",
            sUpdateIdx >= 0 ? sr[sUpdateIdx] : ""
          );
        }
      }
    }

    var periods = Object.keys(byId).map(function(k) { return byId[k]; });
    periods.sort(function(a, b) {
      return String(b.startDate || b.periodId).localeCompare(String(a.startDate || a.periodId));
    });

    return jsonp_(e, { ok: true, periods: periods, rows: periods });
  } catch (err) {
    return jsonp_(e, { ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function csvEscape_(value) {
  var s = String(value == null ? "" : value);
  if (value instanceof Date) s = Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function handlePayrollExportQB_(e) {
  try {
    requireAdmin_(e);
    var period = getPayrollPeriodFromRequest_(e);
    var periodId = payrollPeriodId_(period);
    var rows = readPayrollSummaryRows_(period);

    // Reuse ONE master Payroll Exports spreadsheet.
    // Each export creates/replaces one tab for that payroll period.
    var headers = [
      "Employee ID",
      "Employee Name",
      "Pay Period",
      "Period Start",
      "Period End",
      "Jobs Completed",
      "Job Gross",
      "Payroll Adjustment",
      "Adjusted Gross",
      "Payroll Adjustment Reason",
      "Taxes / Adjustments",
      "Net Pay",
      "Payment Status",
      "Final Payment Method",
      "Check / Reference #",
      "Final Payment Notes",
      "QB Status"
    ];

    var sheetRows = [headers];

    rows.forEach(function(r) {
      var gross = Number(r.totalPay || r.total || 0);
      var grossAdjustment = normalizePayrollMoney_(r.grossAdjustment || r.payrollAdjustment || 0);
      sheetRows.push([
        r.employeeId || "",
        r.employeeName || r.employee || "",
        periodId,
        period.startDate || period.start || "",
        period.endDate || period.end || "",
        Number(r.jobsCompleted || r.jobs || 0),
        gross,
        grossAdjustment,
        gross + grossAdjustment,
        r.grossAdjustmentReason || r.payrollAdjustmentReason || "",
        r.taxAdjustments || r.taxesAdjustments || "",
        r.netPay || "",
        r.status || "OPEN",
        r.finalPaidMethod || r.paidMethod || "",
        r.finalReference || r.reference || "",
        r.finalPaymentNotes || r.paymentNotes || "",
        r.qbStatus || "EXPORTED_TO_QB"
      ]);
    });

    var exportSS = SpreadsheetApp.openById(PAYROLL_EXPORT_SPREADSHEET_ID);

    // Sheet tab names cannot contain some characters and max length is 100.
    var tabName = String(periodId || "Payroll Export")
      .replace(/[\\\/\?\*\[\]:]/g, "-")
      .substring(0, 99);

    var existing = exportSS.getSheetByName(tabName);
    if (existing) {
      existing.clear();
      existing.clearFormats();
    } else {
      existing = exportSS.insertSheet(tabName);
    }

    existing.getRange(1, 1, sheetRows.length, headers.length).setValues(sheetRows);

    // Formatting for readability.
    existing.getRange(1, 1, 1, headers.length)
      .setFontWeight("bold")
      .setBackground("#4b2e83")
      .setFontColor("#ffffff");

    existing.setFrozenRows(1);

    if (existing.getFilter()) {
      existing.getFilter().remove();
    }
    existing.getRange(1, 1, sheetRows.length, headers.length).createFilter();

    if (sheetRows.length > 1) {
      existing.getRange(2, 7, sheetRows.length - 1, 6).setNumberFormat("$#,##0.00");
    }

    existing.autoResizeColumns(1, headers.length);

    // Keep CSV available too, in case QuickBooks import/download is still needed later.
    var csvRows = [headers];
    rows.forEach(function(r) {
      var gross = Number(r.totalPay || r.total || 0);
      var grossAdjustment = normalizePayrollMoney_(r.grossAdjustment || r.payrollAdjustment || 0);
      csvRows.push([
        r.employeeId || "",
        r.employeeName || r.employee || "",
        periodId,
        period.startDate || period.start || "",
        period.endDate || period.end || "",
        Number(r.jobsCompleted || r.jobs || 0),
        "$" + gross.toFixed(2),
        "$" + grossAdjustment.toFixed(2),
        "$" + (gross + grossAdjustment).toFixed(2),
        r.grossAdjustmentReason || r.payrollAdjustmentReason || "",
        r.taxAdjustments || r.taxesAdjustments ? "$" + Number(r.taxAdjustments || r.taxesAdjustments || 0).toFixed(2) : "",
        r.netPay ? "$" + Number(r.netPay || 0).toFixed(2) : "",
        r.status || "OPEN",
        r.finalPaidMethod || r.paidMethod || "",
        r.finalReference || r.reference || "",
        r.finalPaymentNotes || r.paymentNotes || "",
        r.qbStatus || "EXPORTED_TO_QB"
      ]);
    });

    var csv = "\uFEFF" + csvRows.map(function(row) {
      return row.map(csvEscape_).join(",");
    }).join("\r\n");

    var filename = "ATS_Payroll_Readable_" + periodId.replace(/[^0-9A-Za-z_-]+/g, "_") + ".csv";

    // Mark this period as exported to QB in Payroll_Summary audit columns W:Y.
    var summarySh = ensurePayrollSummarySheet_();
    var summaryData = summarySh.getDataRange().getValues();
    var exportedAt = new Date();
    var exportedBy = "";
    try {
      var exportAuth = requireAdmin_(e);
      exportedBy = exportAuth.employeeId || exportAuth.employeeName || "";
    } catch (authErr) {}

    for (var ex = 1; ex < summaryData.length; ex++) {
      if (String(summaryData[ex][0] || "").trim() === periodId) {
        summarySh.getRange(ex + 1, 23).setValue(exportedAt);
        summarySh.getRange(ex + 1, 24).setValue(exportedBy);
        summarySh.getRange(ex + 1, 25).setValue("EXPORTED_TO_QB");
      }
    }

    var sheetUrl = exportSS.getUrl() + "#gid=" + existing.getSheetId();

    return jsonp_(e, {
      ok: true,
      periodId: periodId,
      filename: filename,
      csv: csv,
      rowCount: rows.length,
      rows: rows,
      sheetCreated: true,
      spreadsheetId: exportSS.getId(),
      sheetName: tabName,
      sheetId: existing.getSheetId(),
      sheetUrl: sheetUrl,
      url: sheetUrl
    });
  } catch (err) {
    return jsonp_(e, { ok: false, error: String(err && err.message ? err.message : err) });
  }
}



function handlePayrollMarkPaid_(e) {
  try {
    var auth = requireAdmin_(e);

    var periodId = getParam_(e, "periodId");
    var employeeId = getParam_(e, "employeeId");
    var netPay = getParam_(e, "netPay") || getParam_(e, "finalNetPay") || "";
    var taxAdjustments = getParam_(e, "taxAdjustments") || getParam_(e, "taxesAdjustments") || "";
    var grossAdjustment = getParam_(e, "grossAdjustment") || getParam_(e, "payrollAdjustment") || "";
    var grossAdjustmentReason = getParam_(e, "grossAdjustmentReason") || getParam_(e, "payrollAdjustmentReason") || "";
    var finalPaidMethod = getParam_(e, "finalPaidMethod") || getParam_(e, "paidMethod") || "";
    var finalReference = getParam_(e, "finalReference") || getParam_(e, "reference") || "";
    var finalPaymentNotes = getParam_(e, "finalPaymentNotes") || getParam_(e, "notes") || "";

    if (!periodId) throw new Error("missing_period_id");
    if (!employeeId) throw new Error("missing_employee_id");
    if (!netPay || Number(netPay) <= 0) throw new Error("missing_net_pay");

    var grossAdjNum = grossAdjustment === "" || grossAdjustment === null || grossAdjustment === undefined ? "" : Number(grossAdjustment || 0);
    if (grossAdjNum !== "" && grossAdjNum !== 0 && !String(grossAdjustmentReason || "").trim()) {
      throw new Error("missing_payroll_adjustment_reason");
    }

    var sh = ensurePayrollSummarySheet_();
    var data = sh.getDataRange().getValues();

    var PERIOD_COL = 1;
    var EMPLOYEE_COL = 4;
    var STATUS_COL = 10;
    var PAID_AT_COL = 11;
    var PAID_BY_COL = 12;
    var METHOD_COL = 13;
    var REF_COL = 14;
    var NOTES_COL = 15;
    var NET_PAY_COL = 16;
    var TAX_ADJUST_COL = 17;
    var FINAL_PAID_AT_COL = 18;
    var FINAL_PAID_BY_COL = 19;
    var FINAL_METHOD_COL = 20;
    var FINAL_REF_COL = 21;
    var FINAL_NOTES_COL = 22;
    var GROSS_ADJUST_COL = 26;
    var GROSS_ADJUST_REASON_COL = 27;

    var targetRow = -1;
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][PERIOD_COL - 1] || "").trim() === periodId &&
          String(data[i][EMPLOYEE_COL - 1] || "").trim() === employeeId) {
        targetRow = i + 1;
        break;
      }
    }

    if (targetRow < 0) throw new Error("payment_row_not_found");

    var now = new Date();
    var by = auth.employeeId || auth.employeeName || "";

    sh.getRange(targetRow, STATUS_COL).setValue("NET_PAID");

    // Legacy payment fields are mirrored so older exports/views still work.
    sh.getRange(targetRow, PAID_AT_COL).setValue(now);
    sh.getRange(targetRow, PAID_BY_COL).setValue(by);
    sh.getRange(targetRow, METHOD_COL).setValue(finalPaidMethod);
    sh.getRange(targetRow, REF_COL).setValue(finalReference);
    sh.getRange(targetRow, NOTES_COL).setValue(finalPaymentNotes);

    // True final net payment audit fields.
    sh.getRange(targetRow, NET_PAY_COL).setValue(Number(netPay));
    sh.getRange(targetRow, TAX_ADJUST_COL).setValue(taxAdjustments === "" ? "" : Number(taxAdjustments));
    sh.getRange(targetRow, FINAL_PAID_AT_COL).setValue(now);
    sh.getRange(targetRow, FINAL_PAID_BY_COL).setValue(by);
    sh.getRange(targetRow, FINAL_METHOD_COL).setValue(finalPaidMethod);
    sh.getRange(targetRow, FINAL_REF_COL).setValue(finalReference);
    sh.getRange(targetRow, FINAL_NOTES_COL).setValue(finalPaymentNotes);

    // Payroll-only gross adjustment fields. These do not alter Logs.
    sh.getRange(targetRow, GROSS_ADJUST_COL).setValue(grossAdjNum === "" ? "" : grossAdjNum);
    sh.getRange(targetRow, GROSS_ADJUST_REASON_COL).setValue(grossAdjustmentReason || "");

    return jsonp_(e, {
      ok: true,
      paid: true,
      finalPaid: true,
      status: "NET_PAID",
      periodId: periodId,
      employeeId: employeeId,
      netPay: Number(netPay),
      taxAdjustments: taxAdjustments === "" ? "" : Number(taxAdjustments),
      grossAdjustment: grossAdjNum === "" ? "" : grossAdjNum,
      grossAdjustmentReason: grossAdjustmentReason || ""
    });
  } catch (err) {
    return jsonp_(e, {
      ok: false,
      error: String(err && err.message ? err.message : err)
    });
  }
}




function handlePayrollFinalizeQB_(e) {
  try {
    var auth = requireAdmin_(e);
    var period = getPayrollPeriodFromRequest_(e);
    var periodId = payrollPeriodId_(period);

    var payload = parsePayloadParam_(e);
    if (!payload || !Object.keys(payload).length) {
      payload = parseJsonBody_(e);
    }

    var finalRows = payload && Array.isArray(payload.rows) ? payload.rows : [];
    if (!finalRows.length) throw new Error("missing_final_payment_rows");

    var sh = ensurePayrollSummarySheet_();
    var data = sh.getDataRange().getValues();

    var PERIOD_COL = 1;
    var EMPLOYEE_COL = 4;
    var STATUS_COL = 10;
    var PAID_AT_COL = 11;
    var PAID_BY_COL = 12;
    var METHOD_COL = 13;
    var REF_COL = 14;
    var NOTES_COL = 15;
    var NET_PAY_COL = 16;
    var TAX_ADJUST_COL = 17;
    var FINAL_PAID_AT_COL = 18;
    var FINAL_PAID_BY_COL = 19;
    var FINAL_METHOD_COL = 20;
    var FINAL_REF_COL = 21;
    var FINAL_NOTES_COL = 22;
    var QB_EXPORTED_AT_COL = 23;
    var QB_EXPORTED_BY_COL = 24;
    var QB_STATUS_COL = 25;
    var GROSS_ADJUST_COL = 26;
    var GROSS_ADJUST_REASON_COL = 27;

    var rowMap = {};
    for (var i = 1; i < data.length; i++) {
      if (String(data[i][PERIOD_COL - 1] || "").trim() === periodId) {
        var emp = String(data[i][EMPLOYEE_COL - 1] || "").trim();
        if (emp) rowMap[emp] = i + 1;
      }
    }

    var now = new Date();
    var by = auth.employeeId || auth.employeeName || "";

    finalRows.forEach(function(item) {
      var employeeId = String(item.employeeId || "").trim();
      var netPay = Number(item.netPay || item.finalNetPay || 0);
      var taxAdjustments = item.taxAdjustments !== undefined ? item.taxAdjustments : item.taxesAdjustments;
      var taxAdjNum = taxAdjustments === "" || taxAdjustments === null || taxAdjustments === undefined ? "" : Number(taxAdjustments || 0);
      var grossAdjustment = item.grossAdjustment !== undefined ? item.grossAdjustment : item.payrollAdjustment;
      var grossAdjNum = grossAdjustment === "" || grossAdjustment === null || grossAdjustment === undefined ? "" : Number(grossAdjustment || 0);
      var grossAdjustmentReason = String(item.grossAdjustmentReason || item.payrollAdjustmentReason || "").trim();
      var method = String(item.finalPaidMethod || item.paidMethod || "").trim();
      var reference = String(item.finalReference || item.reference || "").trim();
      var notes = String(item.finalPaymentNotes || item.notes || "").trim();

      if (!employeeId) throw new Error("missing_employee_id");
      if (!netPay || netPay <= 0) throw new Error("missing_net_pay_for_" + employeeId);
      if (method === "Check" && !reference) throw new Error("missing_check_number_for_" + employeeId);
      if (grossAdjNum !== "" && grossAdjNum !== 0 && !grossAdjustmentReason) {
        throw new Error("missing_payroll_adjustment_reason_for_" + employeeId);
      }

      var targetRow = rowMap[employeeId];
      if (!targetRow) throw new Error("payment_row_not_found_for_" + employeeId);

      sh.getRange(targetRow, STATUS_COL).setValue("NET_PAID");

      // Legacy payment fields are mirrored so older exports/views still work.
      sh.getRange(targetRow, PAID_AT_COL).setValue(now);
      sh.getRange(targetRow, PAID_BY_COL).setValue(by);
      sh.getRange(targetRow, METHOD_COL).setValue(method);
      sh.getRange(targetRow, REF_COL).setValue(reference);
      sh.getRange(targetRow, NOTES_COL).setValue(notes);

      // True final net payment audit fields.
      sh.getRange(targetRow, NET_PAY_COL).setValue(netPay);
      sh.getRange(targetRow, TAX_ADJUST_COL).setValue(taxAdjNum === "" ? "" : taxAdjNum);
      sh.getRange(targetRow, FINAL_PAID_AT_COL).setValue(now);
      sh.getRange(targetRow, FINAL_PAID_BY_COL).setValue(by);
      sh.getRange(targetRow, FINAL_METHOD_COL).setValue(method);
      sh.getRange(targetRow, FINAL_REF_COL).setValue(reference);
      sh.getRange(targetRow, FINAL_NOTES_COL).setValue(notes);

      // Payroll-only gross adjustment fields. These do not alter Logs.
      sh.getRange(targetRow, GROSS_ADJUST_COL).setValue(grossAdjNum === "" ? "" : grossAdjNum);
      sh.getRange(targetRow, GROSS_ADJUST_REASON_COL).setValue(grossAdjustmentReason || "");

      // QuickBooks audit fields.
      sh.getRange(targetRow, QB_EXPORTED_AT_COL).setValue(now);
      sh.getRange(targetRow, QB_EXPORTED_BY_COL).setValue(by);
      sh.getRange(targetRow, QB_STATUS_COL).setValue("ENTERED_IN_QB");
    });

    // Lock the whole payroll period after all rows are confirmed entered in QuickBooks.
    upsertPayrollPeriod_(period, "LOCKED", auth);

    var rowsAfter = readPayrollSummaryRows_(period);
    var snapshot = createPayrollAuditSnapshot_(period, periodId, rowsAfter, auth);

    return jsonp_(e, {
      ok: true,
      finalized: true,
      locked: true,
      periodId: periodId,
      period: periodId,
      status: "LOCKED",
      qbStatus: "ENTERED_IN_QB",
      rowCount: rowsAfter.length,
      sheetUrl: snapshot.sheetUrl || "",
      url: snapshot.sheetUrl || ""
    });
  } catch (err) {
    return jsonp_(e, {
      ok: false,
      error: String(err && err.message ? err.message : err)
    });
  }
}



function createPayrollAuditSnapshot_(period, periodId, rows, auth) {
  rows = rows || [];

  var headers = [
    "Employee ID",
    "Employee Name",
    "Pay Period",
    "Period Start",
    "Period End",
    "Jobs Completed",
    "Job Gross",
    "Payroll Adjustment",
    "Adjusted Gross",
    "Payroll Adjustment Reason",
    "Taxes / Adjustments",
    "Net Pay",
    "Payment Status",
    "Final Payment Method",
    "Check / Reference #",
    "Final Payment Notes",
    "QB Status"
  ];

  var sheetRows = [headers];

  rows.forEach(function(r) {
    var gross = Number(r.totalPay || r.total || 0);
    var grossAdjustment = normalizePayrollMoney_(r.grossAdjustment || r.payrollAdjustment || 0);
    sheetRows.push([
      r.employeeId || "",
      r.employeeName || r.employee || "",
      periodId,
      period.startDate || period.start || "",
      period.endDate || period.end || "",
      Number(r.jobsCompleted || r.jobs || 0),
      gross,
      grossAdjustment,
      gross + grossAdjustment,
      r.grossAdjustmentReason || r.payrollAdjustmentReason || "",
      r.taxAdjustments || r.taxesAdjustments || "",
      r.netPay || "",
      r.status || "OPEN",
      r.finalPaidMethod || r.paidMethod || "",
      r.finalReference || r.reference || "",
      r.finalPaymentNotes || r.paymentNotes || "",
      r.qbStatus || "ENTERED_IN_QB"
    ]);
  });

  var exportSS = SpreadsheetApp.openById(PAYROLL_EXPORT_SPREADSHEET_ID);

  var tabName = String(periodId || "Payroll Export")
    .replace(/[\\\/\?\*\[\]:]/g, "-")
    .substring(0, 99);

  var existing = exportSS.getSheetByName(tabName);
  if (existing) {
    existing.clear();
    existing.clearFormats();
  } else {
    existing = exportSS.insertSheet(tabName);
  }

  existing.getRange(1, 1, sheetRows.length, headers.length).setValues(sheetRows);

  existing.getRange(1, 1, 1, headers.length)
    .setFontWeight("bold")
    .setBackground("#4b2e83")
    .setFontColor("#ffffff");

  existing.setFrozenRows(1);

  if (existing.getFilter()) {
    existing.getFilter().remove();
  }
  existing.getRange(1, 1, sheetRows.length, headers.length).createFilter();

  if (sheetRows.length > 1) {
    existing.getRange(2, 7, sheetRows.length - 1, 6).setNumberFormat("$#,##0.00");
  }

  existing.autoResizeColumns(1, headers.length);

  return {
    spreadsheetId: exportSS.getId(),
    sheetName: tabName,
    sheetId: existing.getSheetId(),
    sheetUrl: exportSS.getUrl() + "#gid=" + existing.getSheetId()
  };
}

// =========================================================
// PAYROLL DASHBOARD - one-call payroll load for faster Admin UI
// Returns current period, payment rows, payout review rows, employees, jobs, and periods.
// Existing payroll routes remain unchanged as fallback.
// =========================================================
function buildPayrollPaymentRowsForPeriod_(period) {
  var periodId = payrollPeriodId_(period);
  return readPayrollSummaryRows_(period).map(function(r) {
    var gross = Number(r.totalPay || r.total || 0);
    var grossAdjustment = normalizePayrollMoney_(r.grossAdjustment || r.payrollAdjustment || 0);
    return {
      employeeId: r.employeeId || "",
      employeeName: r.employeeName || r.employee || "",
      periodId: periodId,
      period: periodId,
      startDate: period.startDate,
      endDate: period.endDate,
      totalPay: gross,
      grossPay: gross,
      grossAdjustment: r.grossAdjustment || "",
      payrollAdjustment: r.grossAdjustment || "",
      grossAdjustmentReason: r.grossAdjustmentReason || "",
      payrollAdjustmentReason: r.grossAdjustmentReason || "",
      adjustedGross: gross + grossAdjustment,
      paid: String(r.status || "").toUpperCase() === "PAID" || String(r.status || "").toUpperCase() === "NET_PAID",
      finalPaid: String(r.status || "").toUpperCase() === "NET_PAID" || String(r.status || "").toUpperCase() === "PAID",
      paidAt: r.paidAt || "",
      paidBy: r.paidBy || "",
      paidMethod: r.paidMethod || "",
      reference: r.reference || "",
      paymentNotes: r.paymentNotes || "",
      netPay: r.netPay || "",
      finalNetPay: r.finalNetPay || r.netPay || "",
      taxAdjustments: r.taxAdjustments || r.taxesAdjustments || "",
      taxesAdjustments: r.taxAdjustments || r.taxesAdjustments || "",
      finalPaidAt: r.finalPaidAt || "",
      finalPaidBy: r.finalPaidBy || "",
      finalPaidMethod: r.finalPaidMethod || r.paidMethod || "",
      finalReference: r.finalReference || r.reference || "",
      finalPaymentNotes: r.finalPaymentNotes || r.paymentNotes || "",
      qbExportedAt: r.qbExportedAt || "",
      qbExportedBy: r.qbExportedBy || "",
      qbStatus: r.qbStatus || "",
      status: r.status || "OPEN"
    };
  });
}

function buildPayrollPayoutPayloadForPeriod_(period) {
  var periodId = payrollPeriodId_(period);
  var summaryRows = readPayrollSummaryRows_(period);
  var logs = logsInPayrollPeriod_(period);
  var payoutIndex = buildPayrollPayoutIndex_();
  var weeklyAssignmentIndex = buildWeeklyBoardPayrollAssignmentIndex_(period);
  var addOns = getWeeklyBoardAddOnsInPayrollPeriod_(period);

  var employeesMap = {};
  summaryRows.forEach(function(r) {
    var key = r.employeeId || r.employeeName || "UNKNOWN";
    employeesMap[key] = {
      employeeId: r.employeeId || key,
      employeeName: r.employeeName || r.employee || key,
      totalPay: Number(r.totalPay || r.total || 0),
      jobs: []
    };
  });

  logs.forEach(function(row) {
    if (!isClockOutAction_(row.action)) return;
    if (shouldSkipPayrollLogBecauseItIsAddOnOnly_(row, weeklyAssignmentIndex)) return;

    var key = row.employeeId || row.employeeName || "UNKNOWN";
    if (!employeesMap[key]) {
      employeesMap[key] = {
        employeeId: row.employeeId || key,
        employeeName: row.employeeName || row.employeeId || key,
        totalPay: 0,
        jobs: []
      };
    }

    var jobName = String(row.jobName || "").trim();
    var jobId = String(row.jobId || "").trim();
    var pay = resolvePayrollPayForLogRow_(row, payoutIndex);

    employeesMap[key].jobs.push({
      date: ymd_(row.timestamp),
      serviceDate: ymd_(row.timestamp),
      jobId: jobId,
      jobName: jobName || jobId || "-",
      clientName: jobName || jobId || "-",
      assignmentType: "FULL",
      jobPay: pay,
      pay: pay
    });
  });

  addOns.forEach(function(addon) {
    var key = addon.employeeId || addon.employeeName || "UNKNOWN";
    if (!employeesMap[key]) {
      employeesMap[key] = {
        employeeId: addon.employeeId || key,
        employeeName: addon.employeeName || addon.employeeId || key,
        totalPay: 0,
        jobs: []
      };
    }

    var enteredPay = normalizePayrollEnteredPay_(addon.payrollEnteredPay);
    var pay = enteredPay === "" ? 0 : Number(enteredPay || 0);

    employeesMap[key].jobs.push({
      rowId: addon.rowId || "",
      date: addon.serviceDate || "",
      serviceDate: addon.serviceDate || "",
      jobId: addon.rowId || "",
      jobName: addon.clientName || "Add-On",
      clientName: addon.clientName || "Add-On",
      assignmentType: "ADD_ON",
      addOnType: addon.addOnType || "",
      addOnNotes: addon.addOnNotes || "",
      payrollEnteredPay: enteredPay,
      payrollEnteredBy: addon.payrollEnteredBy || "",
      payrollEnteredAt: addon.payrollEnteredAt || "",
      jobPay: pay,
      pay: pay
    });
  });

  var employees = Object.keys(employeesMap).map(function(k) {
    var emp = employeesMap[k];
    var jobsTotal = (emp.jobs || []).reduce(function(sum, j) {
      if (normalizeAssignmentType_(j.assignmentType || "") === "ADD_ON") {
        var addonPay = normalizePayrollEnteredPay_(j.payrollEnteredPay);
        return sum + (addonPay === "" ? 0 : Number(addonPay || 0));
      }
      return sum + Number(j.jobPay || j.pay || 0);
    }, 0);
    emp.totalPay = jobsTotal;
    return emp;
  });

  var grandTotal = employees.reduce(function(sum, emp) {
    return sum + Number(emp.totalPay || 0);
  }, 0);

  return {
    employees: employees,
    grandTotal: grandTotal,
    periodId: periodId,
    period: periodId
  };
}

function buildPayrollJobsListForDashboard_() {
  var rows = getClientsSheetRaw_();
  var jobs = [];
  var seen = {};

  rows.forEach(function(r) {
    var active = String(r.active || "").trim().toUpperCase();
    if (active === "NO" || active === "FALSE" || active === "0" || active === "INACTIVE") return;

    var clientId = String(r.clientId || "").trim();
    var clientName = String(r.clientName || "").trim();
    var address = String(r.address || "").trim();
    var jobPay = String(r.jobPay || "").trim();
    var fullPay = String(r.fullPay || "").trim();
    var halfPay = String(r.halfPay || "").trim();

    if (!clientName) return;

    function safeBaseId_() {
      return clientId || clientName.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    }

    function addJob_(suffix, label, pay) {
      if (pay === "" || Number(pay) <= 0) return;
      var id = safeBaseId_() + suffix;
      if (seen[id]) return;
      seen[id] = true;
      jobs.push({
        id: id,
        name: clientName + label,
        clientName: clientName,
        pay: Number(pay),
        address: address
      });
    }

    addJob_("_JOB", "", jobPay);
    addJob_("_FULL", " - Full", fullPay);
    addJob_("_HALF", " - .5", halfPay);
  });

  jobs.sort(function(a, b) {
    return String(a.clientName || "").localeCompare(String(b.clientName || "")) ||
           String(a.name || "").localeCompare(String(b.name || ""));
  });

  return jobs;
}

function buildPayrollPeriodsForDashboard_() {
  var current = getCurrentPayPeriod_();
  var currentId = payrollPeriodId_(current);
  var byId = {};

  function addPeriod_(periodId, startDate, endDate, status, lockedAt, lockedBy, lastUpdate) {
    if (!periodId) return;
    byId[String(periodId)] = {
      periodId: String(periodId),
      period: String(periodId),
      startDate: startDate || "",
      endDate: endDate || "",
      status: status || "OPEN",
      lockedAt: lockedAt || "",
      lockedBy: lockedBy || "",
      lastUpdate: lastUpdate || ""
    };
  }

  addPeriod_(currentId, current.startDate, current.endDate, getPayrollPeriodStatus_(currentId), "", "", "");

  var periodsSh = ensurePayrollPeriodsSheet_();
  var pData = periodsSh.getDataRange().getValues();
  if (pData.length >= 2) {
    var pHeaders = pData[0];
    var idIdx = findHeaderIndex_(pHeaders, ["PeriodID", "PeriodId", "Period", "period_id"]);
    var startIdx = findHeaderIndex_(pHeaders, ["StartDate", "start"]);
    var endIdx = findHeaderIndex_(pHeaders, ["EndDate", "end"]);
    var statusIdx = findHeaderIndex_(pHeaders, ["Status", "status"]);
    var lockedAtIdx = findHeaderIndex_(pHeaders, ["LockedAt", "locked_at"]);
    var lockedByIdx = findHeaderIndex_(pHeaders, ["LockedBy", "locked_by"]);
    var updateIdx = findHeaderIndex_(pHeaders, ["LastUpdate", "last_update"]);

    for (var i = 1; i < pData.length; i++) {
      var r = pData[i];
      addPeriod_(
        idIdx >= 0 ? r[idIdx] : "",
        startIdx >= 0 ? r[startIdx] : "",
        endIdx >= 0 ? r[endIdx] : "",
        statusIdx >= 0 ? r[statusIdx] : "OPEN",
        lockedAtIdx >= 0 ? r[lockedAtIdx] : "",
        lockedByIdx >= 0 ? r[lockedByIdx] : "",
        updateIdx >= 0 ? r[updateIdx] : ""
      );
    }
  }

  var summarySh = ensurePayrollSummarySheet_();
  var sData = summarySh.getDataRange().getValues();
  if (sData.length >= 2) {
    var sHeaders = sData[0];
    var sPeriodIdx = findHeaderIndex_(sHeaders, ["PeriodID", "PeriodId", "Period", "period_id"]);
    var sStartIdx = findHeaderIndex_(sHeaders, ["StartDate", "start"]);
    var sEndIdx = findHeaderIndex_(sHeaders, ["EndDate", "end"]);
    var sUpdateIdx = findHeaderIndex_(sHeaders, ["LastUpdate", "last_update"]);

    for (var j = 1; j < sData.length; j++) {
      var sr = sData[j];
      var pid = sPeriodIdx >= 0 ? String(sr[sPeriodIdx] || "").trim() : "";
      if (!pid) continue;
      if (!byId[pid]) {
        addPeriod_(
          pid,
          sStartIdx >= 0 ? sr[sStartIdx] : "",
          sEndIdx >= 0 ? sr[sEndIdx] : "",
          getPayrollPeriodStatus_(pid),
          "",
          "",
          sUpdateIdx >= 0 ? sr[sUpdateIdx] : ""
        );
      }
    }
  }

  var periods = Object.keys(byId).map(function(k) { return byId[k]; });
  periods.sort(function(a, b) {
    return String(b.startDate || b.periodId).localeCompare(String(a.startDate || a.periodId));
  });

  return periods;
}

function handlePayrollDashboard_(e) {
  try {
    var auth = requireAdmin_(e);
    var requestedPeriodId =
      getParam_(e, "period_id") ||
      getParam_(e, "periodId") ||
      getParam_(e, "currentPeriodId") ||
      getParam_(e, "period") ||
      "";

    var period = getPayrollPeriodFromRequest_(e);
    var periodId = payrollPeriodId_(period);
    var status = String(getPayrollPeriodStatus_(periodId) || "OPEN").toUpperCase();
    var generated = false;

    // Match the old payroll page boot behavior: only auto-generate on current-period load.
    // Past periods are loaded as saved.
    if (!requestedPeriodId && status !== "LOCKED") {
      var rows = buildPayrollSummaryFromLogs_(period);
      writePayrollSummaryRows_(period, rows);
      upsertPayrollPeriod_(period, status || "OPEN", auth);
      generated = true;
      status = String(getPayrollPeriodStatus_(periodId) || status || "OPEN").toUpperCase();
    }

    var paymentRows = buildPayrollPaymentRowsForPeriod_(period);
    var payoutPayload = buildPayrollPayoutPayloadForPeriod_(period);
    var employees = readActivePayrollEmployeesFromAuth_();
    var jobs = buildPayrollJobsListForDashboard_();
    var periods = buildPayrollPeriodsForDashboard_();

    return jsonp_(e, {
      ok: true,
      dashboard: true,
      generated: generated,
      authorized: true,
      employeeId: auth.employeeId || "",
      employeeName: auth.employeeName || "",
      id: periodId,
      periodId: periodId,
      period_id: periodId,
      currentPeriodId: periodId,
      current_period_id: periodId,
      period: {
        id: periodId,
        periodId: periodId,
        period_id: periodId,
        startDate: period.startDate,
        endDate: period.endDate,
        start: period.startDate,
        end: period.endDate,
        status: status || "OPEN"
      },
      current: {
        id: periodId,
        periodId: periodId,
        period_id: periodId,
        startDate: period.startDate,
        endDate: period.endDate,
        start: period.startDate,
        end: period.endDate,
        status: status || "OPEN"
      },
      startDate: period.startDate,
      endDate: period.endDate,
      start: period.startDate,
      end: period.endDate,
      periodStart: period.startDate,
      periodEnd: period.endDate,
      status: status || "OPEN",
      payments: paymentRows,
      paymentRows: paymentRows,
      rows: paymentRows,
      payouts: payoutPayload,
      payoutRows: payoutPayload.employees || [],
      employees: employees,
      employeeRows: employees,
      jobs: jobs,
      jobRows: jobs,
      periods: periods
    });
  } catch (err) {
    return jsonp_(e, { ok: false, error: String(err && err.message ? err.message : err) });
  }
}
