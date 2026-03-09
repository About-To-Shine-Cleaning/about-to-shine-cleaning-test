/* ATS Admin Nav v2 — visual-only global navigation (hamburger + drawer)
   Keeps existing admin look and preserves emp=... when present. */
(function () {
  const TOOLS = [
    { label: "Admin Home", href: "/admin/" },
    { label: "Clock", href: "/clock.html" },
    { label: "Estimator", href: "/admin/estimator/" },
    { label: "Payroll", href: "/admin/payroll/" },
    { label: "Legacy Pricing", href: "/admin/legacy/" },
    { label: "Schedule", href: "/admin/schedule/" },
    { label: "Admin Tools", href: "/admin/tools/" },
    { label: "Site Report", href: "/admin/tools/site-report/" }
  ];

  function getEmpQuery() {
    try {
      const p = new URLSearchParams(window.location.search);
      const emp = p.get("emp");
      return emp ? `emp=${encodeURIComponent(emp)}` : "";
    } catch (e) {
      return "";
    }
  }

  function withEmp(href) {
    const empQ = getEmpQuery();
    if (!empQ) return href;
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

  function mount() {
    if (document.getElementById("atsNavDrawer")) return;
    const current = normalizePath(window.location.pathname);

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

    const list = drawer.querySelector('.ats-nav-list');
    TOOLS.forEach(item => {
      const a = document.createElement('a');
      a.className = 'ats-nav-item';
      a.href = withEmp(item.href);
      a.textContent = item.label;
      if (normalizePath(item.href) === current) a.setAttribute('aria-current', 'page');
      list.appendChild(a);
    });

    document.body.appendChild(backdrop);
    document.body.appendChild(drawer);

    const burger = document.querySelector('.ats-burger');
    const closeBtn = drawer.querySelector('.ats-nav-close');
    if (!burger) return;

    function openNav() {
      backdrop.classList.add('open');
      drawer.classList.add('open');
      burger.setAttribute('aria-expanded', 'true');
      document.body.style.overflow = 'hidden';
    }

    function closeNav() {
      backdrop.classList.remove('open');
      drawer.classList.remove('open');
      burger.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
    }

    burger.addEventListener('click', openNav);
    closeBtn.addEventListener('click', closeNav);
    backdrop.addEventListener('click', closeNav);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && drawer.classList.contains('open')) closeNav();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
