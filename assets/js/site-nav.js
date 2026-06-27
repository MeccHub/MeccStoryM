(function () {
  const currentScript = document.currentScript;
  const rootUrl = currentScript && currentScript.src
    ? new URL("../../", currentScript.src)
    : new URL("./", window.location.href);

  const defaultItems = [
    { id: "home", label: "Home", icon: "🏠", href: "index.html#home" },
    { id: "events", label: "Events", icon: "🎉", href: "index.html#events" },
    { id: "resets", label: "Resets", icon: "⏰", href: "index.html#resets" },
    { id: "guides", label: "Guides", icon: "🧭", href: "index.html#guides" },
    { id: "info", label: "FAQ", icon: "📚", href: "index.html#info" },
    { id: "newbie", label: "Newbie FAQ", icon: "🌱", href: "index.html#newbie" },
    { id: "dmg", label: "DMG Calculator", icon: "💥", href: "index.html#dmg" },
    { id: "mdc", label: "MDC Checker", icon: "🎯", href: "index.html#mdc" },
    { id: "meso", label: "Meso/hr", icon: "💰", href: "index.html#meso" },
    { id: "links", label: "Links", icon: "🔗", href: "index.html#links" }
  ];

  const config = window.MSM_SITE || {};
  const items = Array.isArray(config.navItems) ? config.navItems : defaultItems;
  const activeId = config.active || document.body.dataset.navActive || inferActiveId(items);
  const mount = document.querySelector(config.mount || "#site-nav") || document.body;

  function siteUrl(path) {
    return new URL(path, rootUrl).href;
  }

  function isActive(item) {
    return item.id === activeId;
  }

  function linkClass(item, baseClass) {
    return `${baseClass}${isActive(item) ? " is-active" : ""}`;
  }

  function renderLink(item, baseClass) {
    const active = isActive(item) ? ' aria-current="page"' : "";
    return `<a class="${linkClass(item, baseClass)}" data-nav-id="${item.id}" href="${siteUrl(item.href)}"${active}><span aria-hidden="true">${item.icon || ""}</span><span>${item.label}</span></a>`;
  }

  function renderNav() {
    const nav = document.createElement("div");
    nav.className = "msm-site-nav";
    nav.innerHTML = `
      <header class="msm-topbar" data-msm-topbar>
        <a class="msm-brand" href="${siteUrl("index.html#home")}" aria-label="MeccStoryM home">
          <span class="msm-brand-icon"><img src="${siteUrl("assets/meccstorym-logo.gif")}" alt=""></span>
          <span>
            <span class="msm-brand-name"><span class="msm-brand-mecc">Mecc</span><span class="msm-brand-story">Story</span><span class="msm-brand-m">M</span></span>
            <span class="msm-brand-sub">Tools by Mecc</span>
          </span>
        </a>
        <nav class="msm-nav" aria-label="Primary navigation">
          ${items.map(item => renderLink(item, "msm-nav-link")).join("")}
        </nav>
        <button class="msm-theme-btn" type="button" data-msm-theme-toggle aria-label="Toggle theme">🌙</button>
        <button class="msm-menu-btn" type="button" data-msm-menu-toggle aria-label="Menu" aria-expanded="false">
          <span></span><span></span><span></span>
        </button>
      </header>
      <nav class="msm-mobile-nav" data-msm-mobile-nav aria-label="Mobile navigation">
        ${items.map(item => renderLink(item, "msm-mobile-nav-link")).join("")}
      </nav>
    `;

    if (mount === document.body) {
      document.body.prepend(nav);
    } else {
      mount.replaceChildren(nav);
    }
  }

  function inferActiveId(navItems) {
    const hash = window.location.hash.replace(/^#/, "");
    if (hash && navItems.some(item => item.id === hash)) return hash;

    const path = window.location.pathname.split("/").pop() || "index.html";
    const match = navItems.find(item => item.href.split("#")[0].split("/").pop() === path);
    return match ? match.id : "home";
  }

  function applyTheme(theme) {
    const next = theme === "light" ? "light" : "dark";
    document.body.dataset.theme = next;
    const btn = document.querySelector("[data-msm-theme-toggle]");
    if (btn) {
      btn.textContent = next === "light" ? "☀️" : "🌙";
      btn.setAttribute("aria-label", next === "light" ? "Switch to dark mode" : "Switch to light mode");
    }
  }

  function initBehavior() {
    const topbar = document.querySelector("[data-msm-topbar]");
    const menuBtn = document.querySelector("[data-msm-menu-toggle]");
    const mobileNav = document.querySelector("[data-msm-mobile-nav]");
    const themeBtn = document.querySelector("[data-msm-theme-toggle]");

    function updateTopbarState() {
      if (topbar) topbar.classList.toggle("is-scrolled", window.scrollY > 8);
    }

    function closeMenu() {
      if (!menuBtn || !mobileNav) return;
      menuBtn.classList.remove("is-open");
      mobileNav.classList.remove("is-open");
      menuBtn.setAttribute("aria-expanded", "false");
    }

    if (menuBtn && mobileNav) {
      menuBtn.addEventListener("click", () => {
        const open = !mobileNav.classList.contains("is-open");
        menuBtn.classList.toggle("is-open", open);
        mobileNav.classList.toggle("is-open", open);
        menuBtn.setAttribute("aria-expanded", String(open));
      });

      mobileNav.addEventListener("click", event => {
        if (event.target.closest("a")) closeMenu();
      });
    }

    if (themeBtn) {
      themeBtn.addEventListener("click", () => {
        const current = document.body.dataset.theme || "dark";
        const next = current === "dark" ? "light" : "dark";
        localStorage.setItem("msm_theme", next);
        applyTheme(next);
      });
    }

    window.addEventListener("scroll", updateTopbarState, { passive: true });
    updateTopbarState();
    applyTheme(localStorage.getItem("msm_theme") || "dark");
  }

  renderNav();
  initBehavior();
})();
