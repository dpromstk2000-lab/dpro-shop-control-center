window.DPRO_CONTROL_CENTER_CONFIG = Object.freeze({
  version: "CONTROL-CENTER-10-FRONTEND-20260808",
  apiBaseUrl: "https://dpro-shop-control-center-api.dpromstk2000.workers.dev",
  monitorApiBaseUrl: "https://dpro-shop-site-monitor-api.dpromstk2000.workers.dev",
  contactApiBaseUrl: "https://dpro-shop-contact-api.dpromstk2000.workers.dev",
  productName: "DPRO SHOP CONTROL CENTER",
  displayName: "DPRO SHOP 統合管理",
  supportName: "DPRO SHOP",
});

(() => {
  "use strict";

  const ensureStyle = () => {
    if (document.getElementById("cc10-addon-link-style")) return;
    const style = document.createElement("style");
    style.id = "cc10-addon-link-style";
    style.textContent = `
      .cc-addon-link{text-decoration:none!important}
      .cc-addon-link::after{
        content:"NEW";margin-left:auto;padding:3px 7px;border-radius:999px;
        background:#dff7ec;color:#096245;font-size:9px;font-weight:900;letter-spacing:.08em
      }
      .cc-contact-link span{background:rgba(53,180,137,.22)!important;color:#d9fff0!important}
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

  const installLinks = () => {
    const nav = document.querySelector(".side-nav");
    if (!nav) return false;
    ensureStyle();
    const contact = installContactLink(nav);
    const monitor = installMonitorLink(nav);
    return contact && monitor;
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", installLinks, { once: true });
  } else {
    installLinks();
  }

  const observer = new MutationObserver(() => {
    if (installLinks()) observer.disconnect();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  setTimeout(() => observer.disconnect(), 12000);
})();
