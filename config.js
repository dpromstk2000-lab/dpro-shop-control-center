window.DPRO_CONTROL_CENTER_CONFIG = Object.freeze({
  version: "CONTROL-CENTER-43-CENTER10-R7-R10-R1-FINAL-AUDIT-20260810",
  apiBaseUrl: "https://dpro-shop-control-center-api.dpromstk2000.workers.dev",
  monitorApiBaseUrl: "https://dpro-shop-site-monitor-api.dpromstk2000.workers.dev",
  contactApiBaseUrl: "https://dpro-shop-contact-api.dpromstk2000.workers.dev",
  productName: "DPRO SHOP CONTROL CENTER",
  displayName: "DPRO SHOP 統合管理",
  supportName: "DPRO SHOP",
});

(() => {
  "use strict";

  const installFavicon = () => {
    if (document.querySelector('link[data-dpro-favicon="control-center"]')) return;

    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
        <rect width="64" height="64" rx="14" fill="#0b5f49"/>
        <path fill="#ffffff" d="M15 13h18c11 0 19 8 19 19s-8 19-19 19H15V13zm10 9v20h8c6 0 10-4 10-10s-4-10-10-10h-8z"/>
        <path fill="#9fe3bd" d="M46 8c5 0 9 4 9 9-5 0-9-4-9-9z"/>
      </svg>
    `.trim();

    const existing = document.querySelector('link[rel~="icon"]');
    const link = existing || document.createElement("link");
    link.rel = "icon";
    link.type = "image/svg+xml";
    link.href = `data:image/svg+xml,${encodeURIComponent(svg)}`;
    link.dataset.dproFavicon = "control-center";
    if (!existing) document.head.appendChild(link);
  };

  const ensureStyle = () => {
    if (document.getElementById("cc-addon-link-style")) return;
    const style = document.createElement("style");
    style.id = "cc-addon-link-style";
    style.textContent = `
      .cc-addon-link{text-decoration:none!important}
      .cc-addon-link::after{
        content:"NEW";margin-left:auto;padding:3px 7px;border-radius:999px;
        background:#dff7ec;color:#096245;font-size:9px;font-weight:900;letter-spacing:.08em
      }
      .cc-start-link span{background:rgba(159,227,189,.25)!important;color:#e4fff5!important}
      .cc-setup-link span{background:rgba(159,227,189,.20)!important;color:#d9fff0!important}
      .cc-contact-link span{background:rgba(53,180,137,.22)!important;color:#d9fff0!important}
      .cc-delivery-link span{background:rgba(255,198,79,.18)!important;color:#ffe8ad!important}
    `;
    document.head.appendChild(style);
  };

  const installMonitorLink = (nav) => {
    if (document.body?.dataset.cc9MonitorPage === "true") return true;
    if (nav.querySelector("[data-cc9-monitor-link]")) return true;
    const link = document.createElement("a");
    link.href = "monitor.html";
    link.className = "nav-button cc-addon-link";
    link.dataset.cc9MonitorLink = "true";
    link.innerHTML = "<span>監</span>自社サイト監視";
    link.setAttribute("aria-label", "DPRO自社サイト監視を開く");
    const websiteButton = nav.querySelector('[data-view="websites"]');
    if (websiteButton) websiteButton.insertAdjacentElement("afterend", link);
    else nav.appendChild(link);
    return true;
  };

  const installContactLink = (nav) => {
    if (document.body?.dataset.cc10ContactPage === "true") return true;
    if (nav.querySelector("[data-cc10-contact-link]")) return true;
    const link = document.createElement("a");
    link.href = "contact.html";
    link.className = "nav-button cc-addon-link cc-contact-link";
    link.dataset.cc10ContactLink = "true";
    link.innerHTML = "<span>話</span>顧客対応";
    link.setAttribute("aria-label", "DPRO顧客対応を開く");
    const lineButton = nav.querySelector('[data-view="line"]');
    if (lineButton) lineButton.insertAdjacentElement("afterend", link);
    else nav.appendChild(link);
    return true;
  };

  const installDeliveryLink = (nav) => {
    if (document.body?.dataset.cc11DeliveryPage === "true") return true;
    if (nav.querySelector("[data-cc11-delivery-link]")) return true;
    const link = document.createElement("a");
    link.href = "delivery.html";
    link.className = "nav-button cc-addon-link cc-delivery-link";
    link.dataset.cc11DeliveryLink = "true";
    link.innerHTML = "<span>納</span>制作・納品";
    link.setAttribute("aria-label", "DPRO制作・納品管理を開く");
    const contractButton = nav.querySelector('[data-view="contracts"]');
    if (contractButton) contractButton.insertAdjacentElement("afterend", link);
    else nav.appendChild(link);
    return true;
  };

  const installStartLink = (nav) => {
    if (document.body?.dataset.cc18StartPage === "true") return true;
    if (nav.querySelector("[data-cc18-start-link]")) return true;
    const link = document.createElement("a");
    link.href = "start.html";
    link.className = "nav-button cc-addon-link cc-start-link";
    link.dataset.cc18StartLink = "true";
    link.innerHTML = "<span>始</span>契約開始ナビ";
    link.setAttribute("aria-label", "DPRO契約開始ナビを開く");
    const contractButton = nav.querySelector('[data-view="contracts"]');
    if (contractButton) contractButton.insertAdjacentElement("afterend", link);
    else nav.appendChild(link);
    return true;
  };

  const installSetupLink = (nav) => {
    if (document.body?.dataset.cc15SetupPage === "true") return true;
    if (nav.querySelector("[data-cc15-setup-link]")) return true;
    const link = document.createElement("a");
    link.href = "setup.html";
    link.className = "nav-button cc-addon-link cc-setup-link";
    link.dataset.cc15SetupLink = "true";
    link.innerHTML = "<span>設</span>契約セットアップ";
    link.setAttribute("aria-label", "DPRO契約セットアップを開く");
    const contractButton = nav.querySelector('[data-view="contracts"]');
    if (contractButton) contractButton.insertAdjacentElement("afterend", link);
    else nav.appendChild(link);
    return true;
  };

  const installCenter7DeliveryQuality = () => {
    if (document.body?.dataset.cc11DeliveryPage !== "true") return;
    if (document.querySelector('script[data-center7-delivery-quality]')) return;
    const script = document.createElement("script");
    script.src = "./center7-delivery-quality.js?v=CONTROL-CENTER-19-CENTER7";
    script.defer = true;
    script.dataset.center7DeliveryQuality = "true";
    document.head.appendChild(script);
  };

  const installCenter8GoLive = () => {
    if (document.body?.dataset.cc11DeliveryPage !== "true") return;
    if (document.querySelector('script[data-center8-go-live]')) return;
    const script = document.createElement("script");
    script.src = "./center8-go-live.js?v=CONTROL-CENTER-20-CENTER8";
    script.defer = true;
    script.dataset.center8GoLive = "true";
    document.head.appendChild(script);
  };

  const installCenter9Maintenance = () => {
    if (document.body?.dataset.cc11DeliveryPage !== "true") return;
    if (document.querySelector('script[data-center9-maintenance]')) return;
    const script = document.createElement("script");
    script.src = "./center9-maintenance.js?v=CONTROL-CENTER-21-CENTER9";
    script.defer = true;
    script.dataset.center9Maintenance = "true";
    document.head.appendChild(script);
  };

  const installDeliveryCompatibility = () => {
    if (document.body?.dataset.cc11DeliveryPage !== "true") return;
    if (document.querySelector('script[data-center3-compat]')) return;
    const script = document.createElement("script");
    script.src = "./center3-integration.js?v=CONTROL-CENTER-15-CENTER3";
    script.defer = true;
    script.dataset.center3Compat = "true";
    document.head.appendChild(script);
  };

  const installCenter4ProductFeatures = () => {
    if (!document.getElementById("view-products")) return false;
    if (document.querySelector('script[data-center4-product-features]')) return true;
    const script = document.createElement("script");
    script.src = "./center4-product-features.js?v=CONTROL-CENTER-16-CENTER4";
    script.dataset.center4ProductFeatures = "true";
    document.head.appendChild(script);
    return true;
  };

  const installCenter5IndustryTemplates = () => {
    if (!document.getElementById("view-products")) return false;
    if (document.querySelector('script[data-center5-industry-templates]')) return true;
    const script = document.createElement("script");
    script.src = "./center5-industry-templates.js?v=CONTROL-CENTER-17-CENTER5";
    script.dataset.center5IndustryTemplates = "true";
    document.head.appendChild(script);
    return true;
  };

  const installProductMasterDeepLink = () => {
    const params = new URLSearchParams(location.search);
    const system = (params.get("system") || "").trim();
    const tab = (params.get("product_tab") || "").trim();

    // CENTER-4/5スクリプトが起動する前に対象製品を保存する。
    if (system) {
      localStorage.setItem("dpro_center4_feature_system", system);
      localStorage.setItem("dpro_center5_template_system", system);
    }

    if (!tab || !document.getElementById("view-products")) return;

    const tabSelector =
      tab === "features" ? "[data-center4-tab]" :
      tab === "recommendations" ? "[data-center5-tab]" :
      null;

    const panelSelector =
      tab === "features" ? "#product-panel-features" :
      tab === "recommendations" ? "#product-panel-recommendations" :
      null;

    if (!tabSelector || !panelSelector) return;

    let tries = 0;
    let stableTicks = 0;

    const timer = setInterval(() => {
      tries += 1;

      const appShell = document.getElementById("appShell");
      const productsNav = document.querySelector('.nav-button[data-view="products"]');
      const productsView = document.getElementById("view-products");
      const tabButton = document.querySelector(tabSelector);
      const targetPanel = document.querySelector(panelSelector);

      const appReady = Boolean(
        appShell &&
        !appShell.classList.contains("hidden") &&
        productsNav
      );

      if (!appReady) {
        stableTicks = 0;
        if (tries >= 240) clearInterval(timer);
        return;
      }

      // app.jsの初期化最後でdashboardへ戻されることがあるため、
      // 製品画面が外れていれば何度でも通常navクリックで戻す。
      const productsVisible = productsView && !productsView.classList.contains("hidden");
      if (!productsVisible) {
        productsNav.click();
        stableTicks = 0;
        return;
      }

      // CENTER-4/5タブ生成後、対象タブを開く。
      if (!tabButton || !targetPanel) {
        stableTicks = 0;
        return;
      }

      const panelVisible = !targetPanel.classList.contains("hidden");
      if (!panelVisible) {
        tabButton.click();
        stableTicks = 0;
        return;
      }

      // 本体の遅延処理に上書きされないことを約1秒確認してから完了。
      stableTicks += 1;
      if (stableTicks >= 8) {
        clearInterval(timer);

        const clean = new URL(location.href);
        clean.searchParams.delete("system");
        clean.searchParams.delete("product_tab");
        history.replaceState(null, "", clean.pathname + clean.search + clean.hash);
        return;
      }

      if (tries >= 240) clearInterval(timer);
    }, 125);
  };

  const installLinks = () => {
    const nav = document.querySelector(".side-nav");
    if (!nav) return false;
    ensureStyle();

    // 「契約・サービス → 契約セットアップ → 制作・納品」の順になるよう
    // deliveryを先に挿入し、その後setupを同じ位置へ挿入する。
    const delivery = installDeliveryLink(nav);
    const setup = installSetupLink(nav);
    const start = installStartLink(nav);
    const contact = installContactLink(nav);
    const monitor = installMonitorLink(nav);
    return delivery && setup && start && contact && monitor;
  };

  installFavicon();
  installDeliveryCompatibility();
  installCenter7DeliveryQuality();
  installCenter8GoLive();
  installCenter9Maintenance();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      installLinks();
      installDeliveryCompatibility();
      installCenter7DeliveryQuality();
      installCenter8GoLive();
      installCenter9Maintenance();
      installProductMasterDeepLink();
      installCenter4ProductFeatures();
      installCenter5IndustryTemplates();
    }, { once: true });
  } else {
    installLinks();
    installDeliveryCompatibility();
    installCenter7DeliveryQuality();
    installCenter8GoLive();
    installCenter9Maintenance();
    installProductMasterDeepLink();
    installCenter4ProductFeatures();
    installCenter5IndustryTemplates();
  }

  const observer = new MutationObserver(() => {
    if (installLinks()) observer.disconnect();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  setTimeout(() => observer.disconnect(), 12000);
})();


/* CENTER-10-R7-R4: Main dashboard/client DEMO scope guard */
(() => {
  "use strict";

  const BUILD = "CONTROL-CENTER-32-CENTER10-R7-R4-R1-CLIENT-VISIBILITY-20260810";

  function install() {
    if (!document.getElementById("view-dashboard") || !document.getElementById("view-clients")) {
      return false;
    }
    if (document.querySelector('script[data-center10-main-scope-r4="true"]')) {
      return true;
    }

    const script = document.createElement("script");
    script.src = `./center10-main-scope-r4.js?v=${encodeURIComponent(BUILD)}`;
    script.defer = true;
    script.dataset.center10MainScopeR4 = "true";
    document.head.appendChild(script);
    return true;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }

  let tries = 0;
  const timer = setInterval(() => {
    tries += 1;
    if (install() || tries >= 80) clearInterval(timer);
  }, 125);
})();


/* CENTER-10-R7-R5: Contract / service production scope */
(() => {
  "use strict";

  const BUILD = "CONTROL-CENTER-35-CENTER10-R7-R5-R2-COMPACT-EMPTY-20260810";

  function install() {
    if (!document.getElementById("view-contracts")) return false;
    if (document.querySelector('script[data-center10-contract-scope-r5="true"]')) return true;

    const script = document.createElement("script");
    script.src = `./center10-contract-scope-r5.js?v=${encodeURIComponent(BUILD)}`;
    script.defer = true;
    script.dataset.center10ContractScopeR5 = "true";
    document.head.appendChild(script);
    return true;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }

  let tries = 0;
  const timer = setInterval(() => {
    tries += 1;
    if (install() || tries >= 80) clearInterval(timer);
  }, 125);
})();


/* CENTER-10-R7-R6: Production chain final gate UI */
(() => {
  "use strict";

  const BUILD = "CONTROL-CENTER-39-CENTER10-R7-R7-R1-R6-COMPAT-20260810";

  function install() {
    if (document.body?.dataset.cc11DeliveryPage !== "true") return false;
    if (document.querySelector('script[data-center10-production-chain-r6="true"]')) return true;

    const script = document.createElement("script");
    script.src = `./center10-production-chain-r6.js?v=${encodeURIComponent(BUILD)}`;
    script.defer = true;
    script.dataset.center10ProductionChainR6 = "true";
    document.head.appendChild(script);
    return true;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once:true });
  } else {
    install();
  }

  let tries = 0;
  const timer = setInterval(() => {
    tries += 1;
    if (install() || tries >= 120) clearInterval(timer);
  },125);
})();
