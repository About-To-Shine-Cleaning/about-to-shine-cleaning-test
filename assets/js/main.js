document.addEventListener("DOMContentLoaded", () => {
  // Normalize bio whitespace so extra blank lines don't create huge gaps.
  document.querySelectorAll(".bio-text").forEach((el) => {
    const raw = (el.textContent || "").replace(/\r\n/g, "\n");
    const normalized = raw.replace(/\n{3,}/g, "\n\n").trim();
    el.textContent = normalized;
  });

  // Mobile nav toggle
  const toggle = document.querySelector(".nav-toggle");
  const nav = document.querySelector(".main-nav");

  if (toggle && nav) {
    toggle.addEventListener("click", () => {
      nav.classList.toggle("open");
    });
  }

  // About page: Read More / Read Less toggle (keeps original formatting)
  document.querySelectorAll(".bio-toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-target");
      const bio = id ? document.getElementById(id) : null;
      if (!bio) return;

      const isExpanded = btn.getAttribute("aria-expanded") === "true";
      if (isExpanded) {
        bio.classList.add("bio-collapsed");
        btn.setAttribute("aria-expanded", "false");
        btn.textContent = "Read More";
      } else {
        bio.classList.remove("bio-collapsed");
        btn.setAttribute("aria-expanded", "true");
        btn.textContent = "Read Less";
      }
    });
  });

  // Text button (iOS-friendly)
  window.handleTextClick = function () {
    const phone = "14842238496";

    const guidedBody =
      "Hello I like what I seen on the About To Shine Cleaning Website and would like a free quote!\n\n" +
      "Floors:\nBedrooms:\nBathrooms:\nPets?:\nCity:";

    const wantsGuided = confirm("Would you like a guided quote text template?");
    const smsBase = `sms:${phone}`;

    if (wantsGuided) {
      const encoded = encodeURIComponent(guidedBody);
      // iOS is more reliable with &body=
      window.location.href = `${smsBase}&body=${encoded}`;
    } else {
      window.location.href = smsBase;
    }
  };
});


// ATS dropdown (mobile click)
(function () {
  function isMobileNav() {
    return window.matchMedia("(max-width: 900px)").matches;
  }

  const dropdownBtns = document.querySelectorAll(".nav-item.dropdown > .dropbtn");
  dropdownBtns.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      if (!isMobileNav()) return; // desktop uses hover
      e.preventDefault();
      const parent = btn.closest(".nav-item.dropdown");
      if (!parent) return;

      // close other dropdowns
      document.querySelectorAll(".nav-item.dropdown.open").forEach((el) => {
        if (el !== parent) el.classList.remove("open");
      });

      parent.classList.toggle("open");
    });
  });

  // Close if clicking outside
  document.addEventListener("click", (e) => {
    if (!isMobileNav()) return;
    const inside = e.target.closest(".nav-item.dropdown");
    if (!inside) {
      document.querySelectorAll(".nav-item.dropdown.open").forEach((el) => el.classList.remove("open"));
    }
  });

  // Close dropdowns on resize up to desktop
  window.addEventListener("resize", () => {
    if (!isMobileNav()) {
      document.querySelectorAll(".nav-item.dropdown.open").forEach((el) => el.classList.remove("open"));
    }
  });
})();
