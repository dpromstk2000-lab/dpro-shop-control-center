window.DPRO_CONTROL_CENTER_CONFIG = Object.freeze({
  version: "CONTROL-CENTER-9-FRONTEND-20260805",
  apiBaseUrl: "https://dpro-shop-control-center-api.dpromstk2000.workers.dev",
  monitorApiBaseUrl: "https://dpro-shop-site-monitor-api.dpromstk2000.workers.dev",
  productName: "DPRO SHOP CONTROL CENTER",
  displayName: "DPRO SHOP 統合管理",
  supportName: "DPRO SHOP",
});

(() => {
  "use strict";

  const installMonitorLink = () => {
    if (document.body?.dataset.cc9MonitorPage === "true") return true;
    const nav = document.querySelector(".side-nav");
    if (!nav) return false;
    if (nav.querySelector("[data-cc9-monitor-link]")) return true;

    const link = document.createElement("a");
    link.href = "monitor.html";
    link.className = "nav-button cc9-monitor-link";
    link.dataset.cc9MonitorLink = "true";
    link.innerHTML = "<span>監</span>自社サイト監視";
    link.setAttribute("aria-label", "DPRO自社サイト監視を開く");

    const websiteButton = nav.querySelector('[data-view="websites"]');
    if (websiteButton) websiteButton.insertAdjacentElement("afterend", link);
    else nav.appendChild(link);

    const style = document.createElement("style");
    style.id = "cc9-monitor-link-style";
    style.textContent = `
      .cc9-monitor-link{text-decoration:none!important}
      .cc9-monitor-link span{background:rgba(53,180,137,.22)!important;color:#d9fff0!important}
      .cc9-monitor-link::after{
        content:"NEW";margin-left:auto;padding:3px 7px;border-radius:999px;
        background:#dff7ec;color:#096245;font-size:9px;font-weight:900;letter-spacing:.08em
      }
    `;
    document.head.appendChild(style);
    return true;
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", installMonitorLink, { once: true });
  } else {
    installMonitorLink();
  }

  const observer = new MutationObserver(() => {
    if (installMonitorLink()) observer.disconnect();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  setTimeout(() => observer.disconnect(), 12000);
})();
