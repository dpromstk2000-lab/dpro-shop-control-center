(() => {
  "use strict";

  const VERSION = "DPRO-CC-UI-V2-PHASE1-R1-20260921";
  const CONTACT_URL = "contact-v1.html";
  const SESSION_KEY = "dpro-control-center-auth-v1";
  const REFRESH_MS = 8000;

  if (document.body?.dataset?.dproContactPage === "true" || /\/contact-v1\.html$/i.test(location.pathname)) return;

  const state = {
    originalTitle: document.title,
    unread: 0,
    timer: null,
    navReady: false,
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const pageName = () => (location.pathname.split("/").pop() || "index.html").toLowerCase();

  const readAccessToken = () => {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return "";
      const data = JSON.parse(raw);
      return String(
        data?.access_token ||
        data?.accessToken ||
        data?.session?.access_token ||
        data?.currentSession?.access_token ||
        data?.data?.session?.access_token ||
        ""
      ).trim();
    } catch (_) {
      return "";
    }
  };

  const links = {
    home: { href: "index.html", icon: "⌂", label: "ホーム" },
    clients: { href: "index.html#view-clients", icon: "顧", label: "顧客一覧", view: "clients" },
    contracts: { href: "index.html#view-contracts", icon: "契", label: "契約・サービス", view: "contracts" },
    line: { href: "index.html#view-line", icon: "LINE", label: "LINE公式運用", view: "line" },
    websites: { href: "index.html#view-websites", icon: "WEB", label: "ホームページ", view: "websites" },

    start: { href: "start.html", icon: "始", label: "契約開始" },
    setup: { href: "setup.html", icon: "設", label: "契約セットアップ" },
    delivery: { href: "delivery.html", icon: "納", label: "制作・納品" },
    ready: { href: "ready-control-center.html", icon: "準", label: "本番準備", sub: "READY" },

    products: { href: "index.html#view-products", icon: "製", label: "DPRO製品一覧", view: "products" },
    productDev: { href: "product-development.html", icon: "新", label: "新しい製品を作る" },
    productRelease: { href: "product-release-package.html", icon: "販", label: "商品として公開" },

    master: { href: "master-standard.html", icon: "基", label: "DPRO基準", sub: "MASTER" },
    factory: { href: "factory-v2.html", icon: "品", label: "FACTORY品質", sub: "V2" },
    check: { href: "system-check.html", icon: "✓", label: "接続確認" },
    monitor: { href: "monitor.html", icon: "監", label: "自社サイト監視" },
    artifacts: { href: "artifacts.html", icon: "保", label: "保管資料" },
  };

  const sections = [
    { title: "ホーム", items: ["home"] },
    { title: "お客様", items: ["clients", "contracts", "line", "websites"] },
    { title: "導入・運用", items: ["start", "setup", "delivery", "ready"] },
    { title: "DPRO製品", items: ["products", "productDev", "productRelease"] },
    { title: "品質・管理", items: ["master", "factory", "check", "monitor", "artifacts"] },
  ];

  const currentKey = () => {
    const p = pageName();
    if (p === "start.html") return "start";
    if (p === "setup.html") return "setup";
    if (p === "delivery.html") return "delivery";
    if (p === "ready-control-center.html") return "ready";
    if (p === "product-development.html") return "productDev";
    if (p === "product-release-package.html") return "productRelease";
    if (p === "master-standard.html") return "master";
    if (p === "factory-v2.html" || p === "factory-v2-prebuild.html") return "factory";
    if (p === "system-check.html") return "check";
    if (p === "monitor.html" || p === "monitor-center.html") return "monitor";
    if (p === "artifacts.html") return "artifacts";
    if (p === "index.html" || p === "") {
      const h = location.hash.replace(/^#view-/, "");
      if (["clients","contracts","line","websites","products"].includes(h)) return h;
      return "home";
    }
    return "";
  };

  const makeIcon = (text) => {
    const i = document.createElement("span");
    i.className = "ccv2-nav-icon";
    i.textContent = text;
    return i;
  };

  const makeStaticLink = (key) => {
    const meta = links[key];
    const a = document.createElement("a");
    a.href = meta.href;
    a.className = "ccv2-nav-link";
    a.dataset.ccv2Key = key;
    if (currentKey() === key) a.classList.add("is-active");
    a.append(makeIcon(meta.icon));
    const label = document.createElement("span");
    label.className = "ccv2-nav-label";
    label.textContent = meta.label;
    a.append(label);
    if (meta.sub) {
      const sub = document.createElement("small");
      sub.textContent = meta.sub;
      a.append(sub);
    }
    return a;
  };

  const relabelIndexButton = (button, key) => {
    const meta = links[key];
    if (!button || !meta) return null;
    button.dataset.ccv2Key = key;
    button.innerHTML = "";
    button.append(makeIcon(meta.icon));
    const label = document.createElement("span");
    label.className = "ccv2-nav-label";
    label.textContent = meta.label;
    button.append(label);
    return button;
  };

  const sectionKeyForTitle = (title) => ({
    "ホーム": "home",
    "お客様": "customers",
    "導入・運用": "delivery",
    "DPRO製品": "products",
    "品質・管理": "quality",
    "管理ツール": "advanced",
  }[title] || title);

  const currentSectionKey = () => {
    const key = currentKey();
    if (key === "home") return "home";
    if (["clients","contracts","line","websites"].includes(key)) return "customers";
    if (["start","setup","delivery","ready"].includes(key)) return "delivery";
    if (["products","productDev","productRelease"].includes(key)) return "products";
    if (["master","factory","check","monitor","artifacts"].includes(key)) return "quality";
    return "";
  };

  const makeSection = (title) => {
    const box = document.createElement("div");
    box.className = "ccv2-nav-section";
    box.dataset.ccv2Section = sectionKeyForTitle(title);

    if (title === "ホーム") {
      box.classList.add("is-open", "is-home");
      return box;
    }

    const head = document.createElement("button");
    head.type = "button";
    head.className = "ccv2-nav-section-title";
    head.innerHTML = `<span>${title}</span><b aria-hidden="true">⌄</b>`;
    head.setAttribute("aria-expanded", "false");

    const body = document.createElement("div");
    body.className = "ccv2-nav-section-body";

    head.addEventListener("click", () => {
      const willOpen = !box.classList.contains("is-open");
      box.parentElement?.querySelectorAll(".ccv2-nav-section.is-open:not(.is-home)").forEach((other) => {
        if (other !== box) {
          other.classList.remove("is-open");
          other.querySelector(".ccv2-nav-section-title")?.setAttribute("aria-expanded", "false");
        }
      });
      box.classList.toggle("is-open", willOpen);
      head.setAttribute("aria-expanded", willOpen ? "true" : "false");
    });

    box.append(head, body);
    return box;
  };

  const appendSectionItem = (box, node) => {
    const body = box.querySelector(".ccv2-nav-section-body");
    (body || box).append(node);
  };

  const openCurrentSection = (nav) => {
    const key = currentSectionKey();
    if (!key || key === "home") return;
    const box = nav.querySelector(`[data-ccv2-section="${key}"]`);
    if (!box) return;
    box.classList.add("is-open");
    box.querySelector(".ccv2-nav-section-title")?.setAttribute("aria-expanded", "true");
  };

  const makePriorityContact = () => {
    const a = document.createElement("a");
    a.href = CONTACT_URL;
    a.className = "ccv2-contact-priority";
    a.setAttribute("aria-label", "顧客対応を開く");
    a.innerHTML = `
      <span class="ccv2-contact-icon">話</span>
      <span class="ccv2-contact-copy"><strong>顧客対応</strong><small>問い合わせを確認</small></span>
      <span class="ccv2-contact-badge" data-ccv2-contact-badge hidden>0</span>
    `;
    return a;
  };

  const normalizeIndexNav = (nav) => {
    const buttons = {};
    ["dashboard","clients","contracts","line","websites","products"].forEach((view) => {
      buttons[view] = nav.querySelector(`.nav-button[data-view="${view}"]`);
    });

    const keepMap = {
      home: relabelIndexButton(buttons.dashboard, "home"),
      clients: relabelIndexButton(buttons.clients, "clients"),
      contracts: relabelIndexButton(buttons.contracts, "contracts"),
      line: relabelIndexButton(buttons.line, "line"),
      websites: relabelIndexButton(buttons.websites, "websites"),
      products: relabelIndexButton(buttons.products, "products"),
    };

    const advanced = ["systems","tasks","support","security"]
      .map((view) => nav.querySelector(`.nav-button[data-view="${view}"]`))
      .filter(Boolean);

    nav.innerHTML = "";
    nav.classList.add("ccv2-nav");
    nav.append(makePriorityContact());

    for (const section of sections) {
      const box = makeSection(section.title);
      for (const key of section.items) {
        const node = keepMap[key] || makeStaticLink(key);
        if (node) appendSectionItem(box, node);
      }
      nav.append(box);
    }

    if (advanced.length) {
      const box = makeSection("管理ツール");
      box.classList.add("ccv2-advanced");
      for (const button of advanced) {
        const view = button.dataset.view;
        const labels = {
          systems: ["SYS","DPROシステム"],
          tasks: ["✓","タスク・確認待ち"],
          support: ["支","サポート案件"],
          security: ["鍵","コード復旧・一時サポート"],
        };
        const [icon,labelText] = labels[view] || ["・", view];
        button.innerHTML = "";
        button.append(makeIcon(icon));
        const label = document.createElement("span");
        label.className = "ccv2-nav-label";
        label.textContent = labelText;
        button.append(label);
        appendSectionItem(box, button);
      }
      nav.append(box);
    }

    openCurrentSection(nav);
  };

  const normalizeStaticNav = (nav) => {
    nav.innerHTML = "";
    nav.classList.add("ccv2-nav");
    nav.append(makePriorityContact());
    for (const section of sections) {
      const box = makeSection(section.title);
      for (const key of section.items) appendSectionItem(box, makeStaticLink(key));
      nav.append(box);
    }
    openCurrentSection(nav);
  };

  const buildDrawer = () => {
    if ($("#ccv2Drawer")) return;
    const drawer = document.createElement("div");
    drawer.id = "ccv2Drawer";
    drawer.className = "ccv2-drawer";
    drawer.setAttribute("aria-hidden", "true");

    const panel = document.createElement("aside");
    panel.className = "ccv2-drawer-panel";
    const head = document.createElement("div");
    head.className = "ccv2-drawer-head";
    head.innerHTML = `<strong>DPRO SHOP</strong><button type="button" data-ccv2-drawer-close aria-label="メニューを閉じる">×</button>`;
    panel.append(head);

    const nav = document.createElement("nav");
    nav.className = "ccv2-nav";
    nav.append(makePriorityContact());
    for (const section of sections) {
      const box = makeSection(section.title);
      for (const key of section.items) appendSectionItem(box, makeStaticLink(key));
      nav.append(box);
    }
    openCurrentSection(nav);
    panel.append(nav);
    drawer.append(panel);
    drawer.addEventListener("click", (event) => {
      if (event.target === drawer || event.target.closest("[data-ccv2-drawer-close]")) closeDrawer();
    });
    document.body.append(drawer);
  };

  const openDrawer = () => {
    buildDrawer();
    const drawer = $("#ccv2Drawer");
    drawer.classList.add("is-open");
    drawer.setAttribute("aria-hidden", "false");
  };

  const closeDrawer = () => {
    const drawer = $("#ccv2Drawer");
    if (!drawer) return;
    drawer.classList.remove("is-open");
    drawer.setAttribute("aria-hidden", "true");
  };

  const installFallbackMenuButton = () => {
    if ($("#ccv2FallbackMenu")) return;
    const existingSidebar = $("#sidebar") || $(".sidebar") || $(".cc9-sidebar");
    if (existingSidebar) return;
    const button = document.createElement("button");
    button.id = "ccv2FallbackMenu";
    button.className = "ccv2-fallback-menu";
    button.type = "button";
    button.innerHTML = "<span>D</span> メニュー";
    button.addEventListener("click", openDrawer);
    document.body.append(button);
  };

  const installNav = () => {
    if (state.navReady) return;
    const nav =
      $(".side-nav") ||
      $("#sidebar nav") ||
      $(".sidebar nav") ||
      $(".cc9-sidebar nav");

    if (nav) {
      if (nav.classList.contains("side-nav")) normalizeIndexNav(nav);
      else normalizeStaticNav(nav);
      state.navReady = true;
    } else {
      buildDrawer();
      installFallbackMenuButton();
      state.navReady = true;
    }
  };

  const installHeaderContact = () => {
    if ($("[data-ccv2-header-contact]")) return;
    const header = $(".topbar") || $(".cc9-topbar");
    const a = document.createElement("a");
    a.href = CONTACT_URL;
    a.dataset.ccv2HeaderContact = "true";
    a.className = "ccv2-header-contact";
    a.innerHTML = `<span>顧客対応</span><b data-ccv2-contact-badge hidden>0</b>`;
    a.setAttribute("aria-label", "顧客対応を開く");

    if (header) {
      const staff = $(".staff-chip", header) || $(".cc9-staff", header);
      if (staff) header.insertBefore(a, staff);
      else header.append(a);
    } else {
      a.classList.add("ccv2-header-contact-floating");
      document.body.append(a);
    }
  };

  const ensureDeepLink = () => {
    if (pageName() !== "index.html") return;
    const view = location.hash.replace(/^#view-/, "");
    if (!view) return;

    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      const button = document.querySelector(`.nav-button[data-view="${CSS.escape(view)}"]`);
      if (button) {
        button.click();
        clearInterval(timer);
        return;
      }
      if (tries >= 50) clearInterval(timer);
    }, 100);
  };

  const updateUnread = (count) => {
    const n = Math.max(0, Number(count) || 0);
    state.unread = n;
    $$("[data-ccv2-contact-badge]").forEach((badge) => {
      badge.textContent = String(n);
      badge.hidden = n <= 0;
    });
    $$(".ccv2-contact-priority").forEach((link) => {
      link.classList.toggle("has-unread", n > 0);
      link.setAttribute("aria-label", n > 0 ? `顧客対応、先方から返信 ${n}件` : "顧客対応を開く");
    });
    $$("[data-ccv2-header-contact]").forEach((link) => {
      link.classList.toggle("has-unread", n > 0);
      link.setAttribute("aria-label", n > 0 ? `顧客対応、先方から返信 ${n}件` : "顧客対応を開く");
    });
    const homeAlert = $("#ccv2ContactAlert");
    if (homeAlert) {
      homeAlert.hidden = n <= 0;
      homeAlert.setAttribute("aria-label", n > 0 ? `先方から返信 ${n}件。顧客対応を開く` : "顧客対応を開く");
    }
    $$("[data-ccv2-home-contact-count]").forEach((el) => {
      el.textContent = String(n);
    });
    const homeContact = $(".ccv2-home-action.is-contact");
    if (homeContact) homeContact.classList.toggle("has-unread", n > 0);

    const base = state.originalTitle.replace(/^\(\d+\)\s*/, "");
    document.title = n > 0 ? `(${n}) ${base}` : base;
  };

  const fetchUnread = async () => {
    const cfg = window.DPRO_CONTROL_CENTER_CONFIG || {};
    const base = String(cfg.contactApiBaseUrl || "").replace(/\/$/, "");
    const token = readAccessToken();
    if (!base || !token) {
      updateUnread(0);
      return;
    }
    try {
      const response = await fetch(`${base}/api/contact/threads`, {
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      });
      if (!response.ok) return;
      const data = await response.json().catch(() => ({}));
      const threads = Array.isArray(data?.threads) ? data.threads : [];
      const count = threads.filter((thread) => {
        const unread = Number(thread?.unreadCount ?? thread?.unread_count ?? 0);
        const direction = String(thread?.lastMessageDirection ?? thread?.last_message_direction ?? "").toLowerCase();
        return unread > 0 && direction !== "outbound";
      }).length;
      updateUnread(count);
    } catch (_) {
      // Badge is helpful but must never block CONTROL CENTER.
    }
  };

  const installUnreadSync = () => {
    fetchUnread();
    clearInterval(state.timer);
    state.timer = setInterval(() => {
      if (!document.hidden) fetchUnread();
    }, REFRESH_MS);

    const refreshUnreadNow = () => {
      if (!document.hidden) fetchUnread();
    };

    window.addEventListener("focus", refreshUnreadNow);
    window.addEventListener("online", refreshUnreadNow);
    window.addEventListener("pageshow", refreshUnreadNow);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) refreshUnreadNow();
    });

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", (event) => {
        const data = event.data || {};
        if (data.type === "DPRO_CONTACT_STATE_SYNC" && data.badgeCount != null) {
          updateUnread(data.badgeCount);
        }
      });
    }
  };

  const cleanLegacySidebarExtras = () => {
    $$(".sidebar-note, .cc9-sidebar-note, .version, .cc9-version").forEach((el) => {
      el.dataset.ccv2LegacyExtra = "true";
    });
    const sideBottom = $(".side-bottom");
    if (sideBottom) {
      const firstLink = sideBottom.querySelector("a");
      if (firstLink?.getAttribute("href") === "system-check.html") firstLink.dataset.ccv2DuplicateCheck = "true";
      sideBottom.querySelector("small")?.setAttribute("data-ccv2-version", "true");
    }
  };

  const boot = () => {
    document.documentElement.dataset.ccUiV2 = "phase1b";
    installNav();
    cleanLegacySidebarExtras();
    installHeaderContact();
    installFallbackMenuButton();
    ensureDeepLink();
    installUnreadSync();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
