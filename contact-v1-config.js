/**
 * DPRO CONTACT V1.0 - DPRO SHOP LINE + WEB CONFIG
 * STEP DPRO CONTACT WEB / 2026-08-15
 * Public configuration only. No secrets.
 */
window.DPRO_CONTACT_CONFIG = Object.freeze({
  version: "DPRO-CONTACT-1-FRONTEND-LINE-WEB-EMAIL-ATTACHMENTS-20260815-R5-PROD",

  enabled: true,

  features: {
    line: true,
    lineReply: true,
    web: true,
    search: true,
    statusManagement: true,
    autoRefresh: true,

    attachments: true,
    templates: false,
    assignment: false,
    aiSuggestions: false,
    email: true
  },

  apiBaseUrl: "https://dpro-shop-contact-v1-api.dpromstk2000.workers.dev",

  attachments: {
    maxFiles: 3,
    maxFileBytes: 8388608
  },

  layout: "standalone",
  density: "normal",

  branding: {
    brandName: "DPRO SHOP",
    systemName: "CONTROL CENTER / CONTACT V1",
    brandMark: "D",
    pageTitle: "LINE・WEBの問い合わせを\\n一つの顧客対応へ",
    pageLead: "LINE公式とWEB問い合わせフォームに届いた相談を、同じ顧客対応画面で確認します。",
    topbarDescription: "LINE・WEB問い合わせを一元確認",
    channelName: "LINE + WEB Inbox",
    homeUrl: "index.html",
    homeLabel: "CONTROL CENTER",
    loginUrl: "index.html",
    primaryColor: "#0b5f49",
    primaryColor2: "#118465",
    deepColor: "#073b31",
    softColor: "#e7f5ef"
  },

  auth: {
    mode: "supabase",

    publicConfigUrl: "https://dpro-shop-control-center-api.dpromstk2000.workers.dev/api/public-config",

    supabaseUrl: "",
    supabasePublishableKey: "",
    sessionStorageKey: "dpro-control-center-auth-v1",

    supabaseJsUrl: "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"
  },

  operator: {
    defaultName: "DPRO管理者",
    defaultRole: "CONTROL CENTER",
    readOnlyRoles: ["read_only"],
    roleLabels: {
      owner_admin: "管理責任者",
      support: "DPROサポート",
      technical_admin: "技術管理者",
      read_only: "閲覧専用",
      authenticated: "CONTROL CENTER"
    }
  },

  ui: {
    autoRefreshSeconds: 30,
    closeSidebarAfterNavigate: true,
    showSecurityNote: true
  }
});

/* CONTROL CENTER favicon lock — keep DPRO CONTACT tabs identical to CONTROL CENTER */
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

  installFavicon();
})();
