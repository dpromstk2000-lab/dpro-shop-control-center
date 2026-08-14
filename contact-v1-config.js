/**
 * DPRO CONTACT V1.0 - DPRO SHOP LINE + WEB CONFIG
 * STEP DPRO CONTACT WEB / 2026-08-14
 * Public configuration only. No secrets.
 */
window.DPRO_CONTACT_CONFIG = Object.freeze({
  version: "DPRO-CONTACT-1-FRONTEND-LINE-WEB-20260814-R1",

  enabled: true,

  features: {
    line: true,
    lineReply: true,
    web: true,
    search: true,
    statusManagement: true,
    autoRefresh: true,

    attachments: false,
    templates: false,
    assignment: false,
    aiSuggestions: false,
    email: false
  },

  apiBaseUrl: "https://dpro-shop-contact-v1-api.dpromstk2000.workers.dev",

  layout: "standalone",
  density: "normal",

  branding: {
    brandName: "DPRO SHOP",
    systemName: "CONTROL CENTER / CONTACT V1",
    brandMark: "D",
    pageTitle: "LINE・WEBの問い合わせを\n一つの顧客対応へ",
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
