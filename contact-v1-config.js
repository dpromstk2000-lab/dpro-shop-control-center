/**
 * DPRO CONTACT V1.0 - DPRO SHOP LINE + WEB + INSTAGRAM CONFIG
 * Instagram UI compatibility patch / 2026-08-29
 * Public configuration only. No secrets.
 */
window.DPRO_CONTACT_CONFIG = Object.freeze({
  version: "DPRO-CONTACT-1-FRONTEND-LINE-WEB-INSTAGRAM-20260829-R1-UI-PROD",

  enabled: true,

  features: {
    line: true,
    lineReply: true,
    web: true,
    instagram: true,
    instagramReply: true,
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
    pageTitle: "LINE・WEB・Instagramの問い合わせを\n一つの顧客対応へ",
    pageLead: "LINE公式・WEB問い合わせフォーム・Instagram DMに届いた相談を、同じ顧客対応画面で確認します。",
    topbarDescription: "LINE・WEB・Instagram問い合わせを一元確認",
    channelName: "LINE + WEB + Instagram Inbox",
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

/* DPRO CONTACT -> CONTROL CENTER 保管資料 navigation / add-only */
(() => {
  "use strict";

  const installArchiveLink = () => {
    const nav = document.querySelector(".dc-nav");
    if (!nav) return false;
    if (nav.querySelector('a[href="artifacts.html"]')) return true;

    const link = document.createElement("a");
    link.href = "artifacts.html";
    link.setAttribute("aria-label", "DPRO保管資料を開く");
    link.innerHTML = "<i>保</i><span>保管資料</span>";

    const contact = nav.querySelector('a[href="contact-v1.html"]');
    if (contact) contact.insertAdjacentElement("afterend", link);
    else nav.appendChild(link);
    return true;
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", installArchiveLink, { once: true });
  } else {
    installArchiveLink();
  }
})();

/*
 * Instagram R1 UI compatibility patch.
 * The production Worker already routes /reply by channel. The legacy frontend
 * treated every non-WEB thread as LINE, so this patch corrects presentation
 * without changing the established LINE / WEB transport behavior.
 */
(() => {
  "use strict";

  const state = { threads: [], syncQueued: false };
  const nativeFetch = window.fetch.bind(window);

  const channelType = (thread) => {
    const raw = String(thread?.channelType || thread?.channel_type || "line").trim().toLowerCase();
    if (raw === "instagram" || raw === "ig" || raw.includes("instagram")) return "instagram";
    if (raw === "web") return "web";
    return "line";
  };

  const threadName = (thread) => String(thread?.displayName || thread?.display_name || "").trim();

  const scheduleSync = () => {
    if (state.syncQueued) return;
    state.syncQueued = true;
    queueMicrotask(() => {
      state.syncQueued = false;
      syncInstagramUi();
    });
  };

  window.fetch = async (...args) => {
    const response = await nativeFetch(...args);
    try {
      const requestUrl = String(typeof args[0] === "string" ? args[0] : args[0]?.url || "");
      if (/\/api\/contact\/threads(?:\?|$)/.test(requestUrl) && response.ok) {
        response.clone().json().then((data) => {
          const rows = Array.isArray(data?.threads) ? data.threads : (Array.isArray(data) ? data : []);
          state.threads = rows;
          scheduleSync();
        }).catch(() => {});
      }
    } catch (_) {}
    return response;
  };

  const findThreadForButton = (button) => {
    if (!button) return null;
    const name = String(button.querySelector(".dc-thread-name strong")?.textContent || "").trim();
    if (!name) return null;
    const matches = state.threads.filter((thread) => threadName(thread) === name);
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) {
      const preview = String(button.querySelector(".dc-thread-preview")?.textContent || "").replace(/^返信:\s*/, "").trim();
      return matches.find((thread) => String(thread?.lastMessage || "").trim() === preview) || matches[0];
    }
    return null;
  };

  const selectedThread = () => {
    const active = document.querySelector("#threadList .dc-thread-item.active");
    const direct = findThreadForButton(active);
    if (direct) return direct;
    const name = String(document.getElementById("conversationName")?.textContent || "").trim();
    return state.threads.find((thread) => threadName(thread) === name) || null;
  };

  const syncThreadRows = () => {
    document.querySelectorAll("#threadList .dc-thread-item").forEach((button) => {
      const thread = findThreadForButton(button);
      if (channelType(thread) !== "instagram") return;

      button.dataset.dproChannel = "instagram";
      const badge = button.querySelector(".dc-channel-badge");
      if (badge) {
        if (badge.textContent !== "INSTAGRAM") badge.textContent = "INSTAGRAM";
        badge.classList.remove("dc-channel-line", "dc-channel-web");
        badge.classList.add("dc-channel-instagram");
      }
      const avatar = button.querySelector(".dc-avatar");
      if (avatar) avatar.classList.add("dc-avatar--instagram");
    });
  };

  const syncConversation = () => {
    const thread = selectedThread();
    const isInstagram = channelType(thread) === "instagram";
    const sendButton = document.getElementById("sendButton");
    const composerHint = document.getElementById("composerHint");
    const attachmentControls = document.getElementById("attachmentControls");
    const attachmentInput = document.getElementById("attachmentInput");
    const conversationMeta = document.getElementById("conversationMeta");

    if (!isInstagram) {
      if (sendButton) delete sendButton.dataset.dproInstagramUi;
      if (attachmentControls?.dataset.dproInstagramUi === "1") {
        attachmentControls.style.display = "";
        delete attachmentControls.dataset.dproInstagramUi;
      }
      if (attachmentInput?.dataset.dproInstagramUi === "1") {
        attachmentInput.disabled = false;
        delete attachmentInput.dataset.dproInstagramUi;
      }
      return;
    }

    if (conversationMeta && /^LINE\b/.test(conversationMeta.textContent || "")) {
      conversationMeta.textContent = String(conversationMeta.textContent).replace(/^LINE\b/, "INSTAGRAM");
    }

    if (sendButton) {
      sendButton.textContent = "Instagramへ返信";
      sendButton.dataset.dproInstagramUi = "1";
    }
    if (composerHint) composerHint.textContent = "本文をInstagram DMへ送信します";

    // Instagram R1 is text-DM verified. Keep attachment sending hidden until its
    // dedicated transport is independently verified, preventing LINE fallback.
    if (attachmentControls) {
      attachmentControls.style.display = "none";
      attachmentControls.dataset.dproInstagramUi = "1";
    }
    if (attachmentInput) {
      attachmentInput.disabled = true;
      attachmentInput.dataset.dproInstagramUi = "1";
    }
  };

  const syncStaticLabels = () => {
    const eyebrow = document.querySelector(".dc-eyebrow");
    if (eyebrow && eyebrow.textContent !== "DPRO CONTACT / LINE + WEB + INSTAGRAM") {
      eyebrow.textContent = "DPRO CONTACT / LINE + WEB + INSTAGRAM";
    }
    const emptyChannels = document.querySelector("#emptyConversation > span");
    if (emptyChannels && !/IG/.test(emptyChannels.textContent || "")) {
      emptyChannels.innerHTML = "LINE<br>WEB<br>IG";
    }
    const securityNote = document.getElementById("securityNote");
    if (securityNote && !/Instagram/.test(securityNote.textContent || "")) {
      securityNote.textContent = "LINE・InstagramユーザーID、WEB問い合わせのメールアドレス・表示名・会話本文はWorker側で暗号化して保存します。Secretはブラウザへ配置しません。";
    }
  };

  function syncInstagramUi() {
    syncStaticLabels();
    syncThreadRows();
    syncConversation();
  }

  const installStyle = () => {
    if (document.getElementById("dpro-instagram-r1-ui-style")) return;
    const style = document.createElement("style");
    style.id = "dpro-instagram-r1-ui-style";
    style.textContent = `
      .dc-channel-instagram{border-color:#d7c9ec!important;background:#f6f0ff!important;color:#6b3fa0!important}
      .dc-avatar--instagram{box-shadow:inset 0 0 0 2px rgba(107,63,160,.18)}
    `;
    document.head.appendChild(style);
  };

  const boot = () => {
    installStyle();
    syncInstagramUi();
    const root = document.getElementById("app") || document.body;
    new MutationObserver(scheduleSync).observe(root, { childList: true, subtree: true, characterData: true });
    document.addEventListener("click", (event) => {
      if (event.target.closest?.("#threadList .dc-thread-item")) setTimeout(scheduleSync, 0);
    }, true);
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
