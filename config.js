window.DPRO_CONTROL_CENTER_CONFIG = Object.freeze({
  version: "CONTROL-CENTER-11-FRONTEND-20260809-CENTER2",
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

  const installLinks = () => {
    const nav = document.querySelector(".side-nav");
    if (!nav) return false;
    ensureStyle();
    const delivery = installDeliveryLink(nav);
    const contact = installContactLink(nav);
    const monitor = installMonitorLink(nav);
    return delivery && contact && monitor;
  };

  installFavicon();

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
