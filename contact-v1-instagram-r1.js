(() => {
  "use strict";

  const VERSION = "DPRO-CONTACT-INSTAGRAM-R1-UI-SAFE-V1.2-20260829";
  const CONFIG = window.DPRO_CONTACT_CONFIG || {};
  const state = {
    threads: [],
    ready: false,
    syncTimer: null,
    refreshTimer: null,
  };

  const text = (value, fallback = "") => {
    const result = String(value ?? "").trim();
    return result || fallback;
  };

  const apiBase = () => text(CONFIG.apiBaseUrl).replace(/\/$/, "");

  const channelType = (thread) => {
    const raw = text(thread?.channelType || thread?.channel_type, "line").toLowerCase();
    if (raw === "instagram" || raw === "ig" || raw.includes("instagram")) return "instagram";
    if (raw === "web") return "web";
    return "line";
  };

  const accessToken = () => {
    const key = text(CONFIG.auth?.sessionStorageKey, "dpro-control-center-auth-v1");
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return "";
      const data = JSON.parse(raw);
      return text(
        data?.access_token ||
        data?.accessToken ||
        data?.session?.access_token ||
        data?.currentSession?.access_token ||
        data?.data?.session?.access_token
      );
    } catch (_) {
      return "";
    }
  };

  const fetchThreads = async () => {
    const token = accessToken();
    const base = apiBase();
    if (!token || !base) return false;

    try {
      const response = await fetch(`${base}/api/contact/threads`, {
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      });
      if (!response.ok) return false;
      const data = await response.json().catch(() => ({}));
      state.threads = Array.isArray(data?.threads) ? data.threads : [];
      state.ready = true;
      return true;
    } catch (_) {
      return false;
    }
  };

  const findThreadForRow = (row) => {
    const name = text(row?.querySelector(".dc-thread-name strong")?.textContent);
    if (!name) return null;

    const preview = text(row?.querySelector(".dc-thread-preview")?.textContent).replace(/^返信:\s*/, "").trim();
    const matches = state.threads.filter((thread) => text(thread?.displayName) === name);
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) {
      return matches.find((thread) => text(thread?.lastMessage) === preview) || matches[0];
    }
    return null;
  };

  const syncRows = () => {
    if (!state.ready) return;
    document.querySelectorAll("#threadList .dc-thread-item").forEach((row) => {
      const thread = findThreadForRow(row);
      if (channelType(thread) !== "instagram") return;

      const badge = row.querySelector(".dc-channel-badge");
      if (badge && badge.textContent !== "INSTAGRAM") {
        badge.textContent = "INSTAGRAM";
        badge.classList.remove("dc-channel-line");
        badge.classList.add("dc-channel-web");
      }
    });
  };

  const selectedThread = () => {
    const id = text(window.DPRO_CONTACT_UI?.getSelectedThreadId?.());
    if (!id) return null;
    return state.threads.find((thread) => text(thread?.id) === id) || null;
  };

  const restoreNonInstagramComposer = () => {
    const controls = document.getElementById("attachmentControls");
    const input = document.getElementById("attachmentInput");
    if (controls?.dataset.dproInstagramHelper === "1") {
      controls.classList.remove("dc-hidden");
      delete controls.dataset.dproInstagramHelper;
    }
    if (input?.dataset.dproInstagramHelper === "1") {
      input.disabled = false;
      delete input.dataset.dproInstagramHelper;
    }
  };

  const syncSelected = () => {
    if (!state.ready) return;
    const thread = selectedThread();
    if (!thread) return;

    const type = channelType(thread);
    if (type !== "instagram") {
      restoreNonInstagramComposer();
      return;
    }

    const meta = document.getElementById("conversationMeta");
    if (meta && /^LINE\b/.test(text(meta.textContent))) {
      meta.textContent = String(meta.textContent).replace(/^LINE\b/, "INSTAGRAM");
    }

    const button = document.getElementById("sendButton");
    if (button && button.textContent !== "送信中…" && button.textContent !== "Instagramへ返信") {
      button.textContent = "Instagramへ返信";
    }

    const hint = document.getElementById("composerHint");
    if (hint && hint.textContent !== "本文をInstagram DMへ送信します") {
      hint.textContent = "本文をInstagram DMへ送信します";
    }

    // Instagram R1で実証済みなのはテキストDM。添付はLINEへ誤送信させないため隠す。
    const controls = document.getElementById("attachmentControls");
    if (controls) {
      controls.classList.add("dc-hidden");
      controls.dataset.dproInstagramHelper = "1";
    }
    const input = document.getElementById("attachmentInput");
    if (input) {
      input.disabled = true;
      input.dataset.dproInstagramHelper = "1";
    }
  };

  const sync = () => {
    syncRows();
    syncSelected();
  };

  const refreshAndSync = async () => {
    await fetchThreads();
    sync();
  };

  const installEvents = () => {
    // Bubble phase only. Core button click runs first; this helper never prevents or stops events.
    document.addEventListener("click", (event) => {
      if (event.target.closest?.("#threadList .dc-thread-item")) {
        setTimeout(syncSelected, 0);
      }
      if (event.target.closest?.("#refreshButton")) {
        setTimeout(refreshAndSync, 500);
      }
    });

    ["threadSearch", "unreadOnly", "statusFilter"].forEach((id) => {
      document.getElementById(id)?.addEventListener("change", () => setTimeout(syncRows, 0));
    });
    document.getElementById("threadSearch")?.addEventListener("input", () => setTimeout(syncRows, 0));

    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) setTimeout(refreshAndSync, 250);
    });
  };

  const boot = async () => {
    let attempts = 0;
    while (!window.DPRO_CONTACT_UI && attempts < 40) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      attempts += 1;
    }
    if (!window.DPRO_CONTACT_UI) return;

    installEvents();
    await refreshAndSync();

    // DOM polling only; no MutationObserver and no fetch replacement.
    state.syncTimer = setInterval(sync, 5000);
    state.refreshTimer = setInterval(refreshAndSync, 60000);
  };

  window.addEventListener("beforeunload", () => {
    if (state.syncTimer) clearInterval(state.syncTimer);
    if (state.refreshTimer) clearInterval(state.refreshTimer);
  });

  window.DPRO_CONTACT_INSTAGRAM_R1_UI = Object.freeze({ version: VERSION });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
