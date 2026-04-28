
(() => {
  const API_URL = "https://script.google.com/macros/s/AKfycbx2bQ-SSeUHoihjbkYmkJ5-0Dw8JPqH8bhBQR3fbvLsOhDhbuPv0MdVeTdMW6zoVTsWsw/exec";
  const TOKEN_KEYS = ["ats_admin_token_v1","ats_admin_token_local_v1","ats_admin_token","adminToken","token"];
  const DEVICE_KEYS = ["ats_device_key_v1","ats_device_key","deviceKey","device_key","boundDeviceKey"];
  const NATIVE_W = 1191;
  const NATIVE_H = 1685;
  const TAX_RATE = 0.06;

  const coords = {
    name: [82, 274, 454, 34],
    address: [551, 274, 524, 34],
    phone: [82, 328, 454, 34],
    email: [551, 328, 524, 34],
    description: [78, 535, 1040, 320],
    initialBase: [716, 980, 334, 28],
    initialTax: [716, 1027, 334, 24],
    initialTotal: [716, 1076, 334, 24],
    leftBase: [328, 1187, 250, 24],
    leftTax: [328, 1234, 250, 24],
    leftTotal: [328, 1281, 250, 24],
    rightBase: [837, 1187, 250, 24],
    rightTax: [837, 1234, 250, 24],
    rightTotal: [837, 1281, 250, 24],
    preparedSig: [232, 1287, 364, 38],
    preparedDate: [674, 1294, 180, 26],
    clientDate: [670, 1594, 170, 26],
    residentialMark: [112, 450],
    commercialMark: [493, 450],
    moveMark: [877, 450]
  };

  const signatureAssets = {
    "Matthew Bari": "/admin/estimate-form/assets/MB.png",
    "Shannon Kovecses": "/admin/estimate-form/assets/SK.png"
  };

  const $ = (id) => document.getElementById(id);
  
  const formStatus = $("formStatus");
  const authWho = $("authWho");
  const formBg = $("formBg");
  const preparedBy = $("preparedBy");
  const estimateDate = $("estimateDate");
  const preparedSig = $("preparedSig");
  const preparedDate = $("preparedDate");
  const clientDate = $("clientDate");
  const modeWB = $("modeWB");
  const modeBM = $("modeBM");
  
  const finalizeBtn = $("finalizeBtn");

  let currentMode = "WB";
  let clientSignatureDataUrl = "";
  let authState = null;
  let isDrawing = false;

  function position(el, rect) {
    if (!el) return;
    const [x,y,w,h] = rect;
    el.style.left = ((x / NATIVE_W) * 100) + "%";
    el.style.top = ((y / NATIVE_H) * 100) + "%";
    if (w) el.style.width = ((w / NATIVE_W) * 100) + "%";
    if (h) el.style.height = ((h / NATIVE_H) * 100) + "%";
  }

  function positionPoint(el, x, y) {
    el.style.left = ((x / NATIVE_W) * 100) + "%";
    el.style.top = ((y / NATIVE_H) * 100) + "%";
  }

  function money(n) {
    const num = Number(n || 0);
    if (!num) return "";
    return "$" + num.toFixed(2);
  }

  function getStored(keys) {
    for (const key of keys) {
      try {
        const s = sessionStorage.getItem(key);
        if (s) return s;
      } catch(e){}
      try {
        const l = localStorage.getItem(key);
        if (l) return l;
      } catch(e){}
    }
    return "";
  }

  function getToken() { return getStored(TOKEN_KEYS); }
  function getDeviceKey() { return getStored(DEVICE_KEYS); }

  function setStatus(msg) { formStatus.textContent = msg; }

  function jsonp(url) {
    return new Promise((resolve, reject) => {
      const cb = "cb_" + Math.random().toString(36).slice(2);
      const script = document.createElement("script");
      script.async = true;
      window[cb] = (data) => { resolve(data); cleanup(); };
      function cleanup() {
        try { delete window[cb]; } catch(e) {}
        try { script.remove(); } catch(e) {}
      }
      script.onerror = () => { cleanup(); reject(new Error("JSONP failed")); };
      script.src = url + (url.includes("?") ? "&" : "?") + "callback=" + cb;
      document.body.appendChild(script);
    });
  }

  async function authCheck() {
    const token = getToken();
    const device = getDeviceKey();
    if (!token || !device) throw new Error("Missing admin token or device key. Open /admin/ first and sign in.");
    const res = await jsonp(API_URL + "?action=auth&t=" + encodeURIComponent(token) + "&d=" + encodeURIComponent(device));
    if (!res || !res.ok) throw new Error((res && res.error) || "Admin auth failed");
    authState = { token, device, employeeId: res.employeeId || "", employeeName: res.employeeName || "" };
    authWho.textContent = (res.employeeId || "") + " • " + (res.employeeName || "");
    autoSelectPreparedBy();
    setStatus("Ready. Fill the form and tap Finalize PDF.");
  }

  function autoSelectPreparedBy() {
    if (!authState) return;
    if (authState.employeeId === "E01") preparedBy.value = "Shannon Kovecses";
    else if (authState.employeeId === "E04") preparedBy.value = "Matthew Bari";
    refreshPreparedSignature();
  }

  function refreshPreparedSignature() {
    const src = signatureAssets[preparedBy.value] || "";
    if (!src) {
      preparedSig.classList.remove("on");
      return;
    }
    preparedSig.src = src;
    preparedSig.classList.add("on");
  }

  function setMode(mode) {
    currentMode = mode;
    modeWB.classList.toggle("active", mode === "WB");
    modeBM.classList.toggle("active", mode === "BM");
    formBg.src = mode === "WB" ? "/admin/estimate-form/assets/weekly-biweekly.png" : "/admin/estimate-form/assets/biweekly-monthly.png";
    recalc();
  }

  function recalc() {
    const initialBase = Number($("initialBase").value || 0);
    const leftBase = Number($("recurringLeftBase").value || 0);
    const rightBase = Number($("recurringRightBase").value || 0);
    $("initialTax").textContent = money(initialBase * TAX_RATE);
    $("initialTotal").textContent = money(initialBase * (1 + TAX_RATE));
    $("recurringLeftTax").textContent = money(leftBase * TAX_RATE);
    $("recurringLeftTotal").textContent = money(leftBase * (1 + TAX_RATE));
    $("recurringRightTax").textContent = money(rightBase * TAX_RATE);
    $("recurringRightTotal").textContent = money(rightBase * (1 + TAX_RATE));
    preparedDate.textContent = estimateDate.value || "";
    clientDate.textContent = estimateDate.value || "";
  }

  function bindOverlayPositions() {
    position($("clientName"), coords.name);
    position($("clientAddress"), coords.address);
    position($("clientPhone"), coords.phone);
    position($("clientEmail"), coords.email);
    position($("jobDescription"), coords.description);
    position($("initialBase"), coords.initialBase);
    position($("initialTax"), coords.initialTax);
    position($("initialTotal"), coords.initialTotal);
    position($("recurringLeftBase"), coords.leftBase);
    position($("recurringLeftTax"), coords.leftTax);
    position($("recurringLeftTotal"), coords.leftTotal);
    position($("recurringRightBase"), coords.rightBase);
    position($("recurringRightTax"), coords.rightTax);
    position($("recurringRightTotal"), coords.rightTotal);
    position(preparedSig, coords.preparedSig);
    position(preparedDate, coords.preparedDate);
    position(clientSigPreview, coords.clientSig);
    position(clientDate, coords.clientDate);
    positionPoint($("markResidential"), coords.residentialMark[0], coords.residentialMark[1]);
    positionPoint($("markCommercial"), coords.commercialMark[0], coords.commercialMark[1]);
    positionPoint($("markMove"), coords.moveMark[0], coords.moveMark[1]);
  }

  function refreshScopeMarks() {
    $("markResidential").classList.toggle("on", $("scopeResidential").checked);
    $("markCommercial").classList.toggle("on", $("scopeCommercial").checked);
    $("markMove").classList.toggle("on", $("scopeMove").checked);
  }

  function openSignature() { sigModal.hidden = false; }
  function closeSignature() { sigModal.hidden = true; }

  function canvasPoint(event) {
    const rect = sigPad.getBoundingClientRect();
    const point = event.touches ? event.touches[0] : event;
    return {
      x: (point.clientX - rect.left) * (sigPad.width / rect.width),
      y: (point.clientY - rect.top) * (sigPad.height / rect.height)
    };
  }

  function startDraw(event) {
    isDrawing = true;
    const p = canvasPoint(event);
    sigCtx.beginPath();
    sigCtx.moveTo(p.x, p.y);
    event.preventDefault();
  }

  function moveDraw(event) {
    if (!isDrawing) return;
    const p = canvasPoint(event);
    sigCtx.lineTo(p.x, p.y);
    sigCtx.strokeStyle = "#111";
    sigCtx.lineWidth = 3;
    sigCtx.lineCap = "round";
    sigCtx.lineJoin = "round";
    sigCtx.stroke();
    event.preventDefault();
  }

  function endDraw(event) { isDrawing = false; if (event) event.preventDefault(); }

  function clearSignature() {
    sigCtx.clearRect(0, 0, sigPad.width, sigPad.height);
    clientSignatureDataUrl = "";
    clientSigPreview.classList.remove("on");
    clientSigPreview.removeAttribute("src");
  }

  function saveSignature() {
    clientSignatureDataUrl = sigPad.toDataURL("image/png");
    clientSigPreview.src = clientSignatureDataUrl;
    clientSigPreview.classList.add("on");
    closeSignature();
  }

  function collectPayload() {
    const initialBase = Number($("initialBase").value || 0);
    const leftBase = Number($("recurringLeftBase").value || 0);
    const rightBase = Number($("recurringRightBase").value || 0);
    return {
      mode: currentMode,
      name: $("clientName").value.trim(),
      address: $("clientAddress").value.trim(),
      phone: $("clientPhone").value.trim(),
      email: $("clientEmail").value.trim(),
      description: $("jobDescription").value.trim(),
      scopeResidential: $("scopeResidential").checked,
      scopeCommercial: $("scopeCommercial").checked,
      scopeMove: $("scopeMove").checked,
      initialBase,
      initialTax: Number((initialBase * TAX_RATE).toFixed(2)),
      initialTotal: Number((initialBase * (1 + TAX_RATE)).toFixed(2)),
      recurringLeftLabel: currentMode === "WB" ? "Weekly Cleaning" : "Bi-Weekly Cleaning",
      recurringRightLabel: currentMode === "WB" ? "Bi-Weekly Cleaning" : "Monthly Cleaning",
      recurringLeftBase: leftBase,
      recurringLeftTax: Number((leftBase * TAX_RATE).toFixed(2)),
      recurringLeftTotal: Number((leftBase * (1 + TAX_RATE)).toFixed(2)),
      recurringRightBase: rightBase,
      recurringRightTax: Number((rightBase * TAX_RATE).toFixed(2)),
      recurringRightTotal: Number((rightBase * (1 + TAX_RATE)).toFixed(2)),
      preparedBy: preparedBy.value,
      estimateDate: estimateDate.value,
      clientSignature: clientSignatureDataUrl || "",
      employeeId: authState ? authState.employeeId : "",
      employeeName: authState ? authState.employeeName : ""
    };
  }

  function finalizeEstimate() {
    if (!authState) {
      alert("Admin auth is not ready yet.");
      return;
    }
    const payload = collectPayload();
    if (!payload.name) {
      alert("Enter the client name first.");
      return;
    }
    setStatus("Generating PDF…");
    finalizeBtn.disabled = true;

    const form = document.createElement("form");
    form.method = "POST";
    form.action = API_URL;
    form.target = "estimateFormSubmitFrame";
    form.style.display = "none";

    const fields = { action: "estimate_form_generate", t: authState.token, d: authState.device, payload: JSON.stringify(payload) };
    Object.keys(fields).forEach((key) => {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = key;
      input.value = fields[key];
      form.appendChild(input);
    });

    document.body.appendChild(form);
    form.submit();
    form.remove();
  }

  window.addEventListener("message", (event) => {
    const data = event.data || {};
    if (!data || data.source !== "ats_estimate_form") return;
    finalizeBtn.disabled = false;
    if (data.ok) {
      setStatus("PDF created and emailed. Starting download…");
      if (data.downloadUrl) window.location.href = data.downloadUrl;
    } else {
      setStatus("Error: " + (data.error || "Unknown error"));
      alert(data.error || "Estimate form failed.");
    }
  });

  function init() {
    bindOverlayPositions();
    estimateDate.value = new Date().toISOString().slice(0, 10);
    preparedDate.textContent = estimateDate.value;
    clientDate.textContent = estimateDate.value;
    refreshPreparedSignature();
    refreshScopeMarks();
    setMode("WB");

    [$("clientName"), $("clientAddress"), $("clientPhone"), $("clientEmail"), $("jobDescription"), $("initialBase"), $("recurringLeftBase"), $("recurringRightBase"), estimateDate].forEach((el) => {
      el.addEventListener("input", recalc);
      el.addEventListener("change", recalc);
    });

    ["scopeResidential","scopeCommercial","scopeMove"].forEach((id) => $(id).addEventListener("change", refreshScopeMarks));

    preparedBy.addEventListener("change", refreshPreparedSignature);
    modeWB.addEventListener("click", () => setMode("WB"));
    modeBM.addEventListener("click", () => setMode("BM"));
    $("toggleClientSig").addEventListener("click", openSignature);
    $("closeSig").addEventListener("click", closeSignature);
    $("sigBackdrop").addEventListener("click", closeSignature);
    $("clearSig").addEventListener("click", clearSignature);
    $("saveSig").addEventListener("click", saveSignature);
    finalizeBtn.addEventListener("click", finalizeEstimate);

    ["mousedown","touchstart"].forEach(evt => sigPad.addEventListener(evt, startDraw, { passive:false }));
    ["mousemove","touchmove"].forEach(evt => sigPad.addEventListener(evt, moveDraw, { passive:false }));
    ["mouseup","mouseleave","touchend","touchcancel"].forEach(evt => sigPad.addEventListener(evt, endDraw, { passive:false }));

    authCheck().catch((err) => {
      setStatus("Access error: " + (err && err.message ? err.message : err));
      authWho.textContent = "Auth required";
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
