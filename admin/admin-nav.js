/* ATS Admin Nav v4 — fixed role-aware global navigation
   ✅ Correct Clock URL: /clock.html
   ✅ Strict frontend role handling
   ✅ Preserves emp=... for clock link only
*/
(function () {
  const AUTH_STORAGE = "ats_admin_auth_v1";

  const TOOLS = [
    { key: "admin_home", label: "Admin Home", href: "/admin/", roles: ["full_admin", "schedule_payroll", "payroll"] },
    { key: "clock", label: "Clock", href: "/clock.html", roles: ["full_admin", "schedule_payroll", "payroll", "clock_only"] },
    { key: "estimator", label: "Estimator", href: "/admin/estimator/", roles: ["full_admin"] },
    { key: "estimate_form", label: "Estimate Form", href: "/admin/estimate-form/", roles: ["full_admin"] },
    { key: "payroll", label: "Payroll", href: "/admin/payroll/", roles: ["full_admin", "schedule_payroll", "payroll"] },
    { key: "legacy", label: "Legacy Pricing", href: "/admin/legacy/", roles: ["full_admin"] },
    { key: "schedule", label: "Schedule", href: "/admin/schedule/", roles: ["full_admin", "schedule_payroll"] },
    { key: "admin_tools", label: "Admin Tools", href: "/admin/tools/", roles: ["full_admin"] },
    { key: "site_report", label: "Site Report", href: "/admin/tools/site-report/", roles: ["full_admin"] }
  ];

  function normalizeRole(role, employeeId) {
    const r = String(role || "").trim().toLowerCase();
    const id = String(employeeId || "").trim().toUpperCase();

    // Safety fallback if backend still sends older "admin" role.
    if (r === "admin") {
      if (id === "E01" || id === "E04") return "full_admin";
      if (id === "E02") return "schedule_payroll";
      return "clock_only";
    }

    if (r === "full_admin") return "full_admin";
    if (r === "schedule_payroll") return "schedule_payroll";
    if (r === "payroll") return "payroll";
    if (r === "clock_only") return "clock_only";

    if (id === "E01" || id === "E04") return "full_admin";
    if (id === "E02") return "schedule_payroll";
    return "clock_only";
  }

  function getStoredAuth() {
    try {
      return JSON.parse(sessionStorage.getItem(AUTH_STORAGE) || "{}");
    } catch (e) {
      return {};
    }
  }

  function getRole() {
    const auth = getStoredAuth();
    return normalizeRole(auth.role, auth.employeeId);
  }

  function allowed(item, role) {
    role = normalizeRole(role);
    return (item.roles || []).map(r => normalizeRole(r)).includes(role);
  }

  function getEmpQuery() {
    try {
      const p = new URLSearchParams(window.location.search);
      const auth = getStoredAuth();
      const emp = p.get("emp") || auth.employeeId || "";
      return emp ? `emp=${encodeURIComponent(emp)}` : "";
    } catch (e) {
      return "";
    }
  }

  function withEmp(href) {
    const empQ = getEmpQuery();
    if (!empQ) return href;
    if (!href.includes("clock.html")) return href;
    return href.includes("?") ? `${href}&${empQ}` : `${href}?${empQ}`;
  }

  function normalizePath(p) {
    try {
      const u = new URL(p, window.location.origin);
      p = u.pathname;
    } catch (e) {}
    if (!p) return "/";
    if (p.length > 1 && p.endsWith("index.html")) p = p.slice(0, -10);
    if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);
    return p;
  }

  function removeExisting() {
    const existingDrawer = document.getElementById("atsNavDrawer");
    const existingBackdrop = document.getElementById("atsNavBackdrop");
    if (existingDrawer) existingDrawer.remove();
    if (existingBackdrop) existingBackdrop.remove();
  }

  function mount() {
    removeExisting();

    const role = getRole();
    const current = normalizePath(window.location.pathname);
    const visibleTools = TOOLS.filter(item => allowed(item, role));

    const backdrop = document.createElement("div");
    backdrop.className = "ats-nav-backdrop";
    backdrop.id = "atsNavBackdrop";

    const drawer = document.createElement("aside");
    drawer.className = "ats-nav-drawer";
    drawer.id = "atsNavDrawer";
    drawer.setAttribute("role", "dialog");
    drawer.setAttribute("aria-modal", "true");
    drawer.setAttribute("aria-label", "Admin navigation");

    drawer.innerHTML = `
      <header>
        <h2>Admin Tools</h2>
        <button class="ats-nav-close" type="button" aria-label="Close menu">✕</button>
      </header>
      <nav class="ats-nav-list"></nav>
      <div class="ats-nav-footer">
        <a class="ats-live-btn" href="https://abouttoshinecleaning.com" target="_blank" rel="noopener">Go to Live Website</a>
      </div>
    `;

    const list = drawer.querySelector(".ats-nav-list");
    visibleTools.forEach(item => {
      const a = document.createElement("a");
      a.className = "ats-nav-item";
      a.href = withEmp(item.href);
      a.textContent = item.label;
      if (normalizePath(item.href) === current) a.setAttribute("aria-current", "page");
      list.appendChild(a);
    });

    document.body.appendChild(backdrop);
    document.body.appendChild(drawer);

    const burger = document.querySelector(".ats-burger");
    const closeBtn = drawer.querySelector(".ats-nav-close");
    if (!burger) return;

    function openNav() {
      backdrop.classList.add("open");
      drawer.classList.add("open");
      burger.setAttribute("aria-expanded", "true");
      document.body.style.overflow = "hidden";
    }

    function closeNav() {
      backdrop.classList.remove("open");
      drawer.classList.remove("open");
      burger.setAttribute("aria-expanded", "false");
      document.body.style.overflow = "";
    }

    burger.onclick = openNav;
    closeBtn.onclick = closeNav;
    backdrop.onclick = closeNav;
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && drawer.classList.contains("open")) closeNav();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }

  window.addEventListener("ats-auth-ready", mount);
})();
