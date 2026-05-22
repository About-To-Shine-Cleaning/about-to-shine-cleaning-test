/* ATS Admin Nav v10 — employee-aware global navigation
   ✅ E01/E02/E03/E05 hamburger matches cards
   ✅ E04 hamburger sees all admin panel tools
   ✅ Preserves emp=... for clock and my weekly board links
*/
(function () {
  const AUTH_STORAGE = "ats_admin_auth_v1";

  const ALL_TOOLS = [
    { key: "home", label: "Home", href: "/admin/" },
    { key: "clock", label: "Clock", href: "/clock.html" },
    { key: "payroll", label: "Payroll", href: "/admin/payroll/" },
    { key: "my_weekly_board", label: "My Weekly Board", href: "/admin/my-weekly-board/" },
    { key: "weekly_board", label: "Weekly Board Editor", href: "/admin/weekly-board/" },
    { key: "client_info", label: "Client Info", href: "/admin/client-info/" },
    { key: "estimator", label: "Estimator", href: "/admin/estimator/" },
    { key: "estimate_form", label: "Estimate Form", href: "/admin/estimate-form/" },
    { key: "legacy", label: "Legacy Pricing", href: "/admin/legacy/" },
    { key: "site_report", label: "Site Report", href: "/admin/tools/site-report/" },
    { key: "admin_tools", label: "Admin Tools", href: "/admin/tools/" }
  ];

  const MENU_BY_EMPLOYEE = {
    E01: ["home", "clock", "payroll", "weekly_board", "client_info"],
    E02: ["home", "clock", "payroll", "my_weekly_board", "weekly_board", "client_info"],
    E03: ["home", "clock", "my_weekly_board", "client_info"],
    E04: ["home", "clock", "payroll", "my_weekly_board", "weekly_board", "client_info", "estimator", "estimate_form", "legacy", "site_report", "admin_tools"],
    E05: ["home", "clock", "my_weekly_board", "client_info"]
  };

  const FALLBACK_MENU = ["home", "clock", "my_weekly_board", "client_info"];

  function getStoredAuth() {
    try {
      return JSON.parse(sessionStorage.getItem(AUTH_STORAGE) || "{}");
    } catch (e) {
      return {};
    }
  }

  function getEmployeeId() {
    const auth = getStoredAuth();
    return String(auth.employeeId || "").trim().toUpperCase();
  }

  function getVisibleToolKeys() {
    const id = getEmployeeId();
    return MENU_BY_EMPLOYEE[id] || FALLBACK_MENU;
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

  function shouldCarryEmp(href) {
    return href.includes("clock.html") || href.includes("/admin/my-weekly-board/");
  }

  function withEmp(href) {
    const empQ = getEmpQuery();
    if (!empQ || !shouldCarryEmp(href)) return href;

    const hash = href.includes("#") ? href.substring(href.indexOf("#")) : "";
    const base = hash ? href.substring(0, href.indexOf("#")) : href;
    return (base.includes("?") ? `${base}&${empQ}` : `${base}?${empQ}`) + hash;
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

    const current = normalizePath(window.location.pathname);
    const visibleKeys = getVisibleToolKeys();
    const visibleTools = visibleKeys
      .map(key => ALL_TOOLS.find(item => item.key === key))
      .filter(Boolean);

    const backdrop = document.createElement("div");
    backdrop.className = "ats-nav-backdrop";
    backdrop.id = "atsNavBackdrop";

    const drawer = document.createElement("aside");
    drawer.className = "ats-nav-drawer";
    drawer.id = "atsNavDrawer";
    drawer.setAttribute("role", "dialog");
    drawer.setAttribute("aria-modal", "true");
    drawer.setAttribute("aria-label", "Navigation");

    drawer.innerHTML = `
      <header>
        <h2>Tools</h2>
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

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();

  window.addEventListener("ats-auth-ready", mount);
})();
