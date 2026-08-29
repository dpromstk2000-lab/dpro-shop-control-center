(() => {
  "use strict";

  const VERSION = "DPRO-CONTACT-REPLY-ALERT-PWA-R1.2-20260830-BADGE-SYNC";
  const CONFIG = window.DPRO_CONTACT_CONFIG || {};
  const state = {
    threads: [],
    ready: false,
    lastPendingCount: null,
    syncTimer: null,
    refreshTimer: null,
    observer: null,
    notificationPermissionAsked: false,
    lastBadgeCount: 0,
    originalTitle: document.title,
  };

  const text = (value, fallback = "") => {
    const result = String(value ?? "").trim();
    return result || fallback;
  };

  const num = (value, fallback = 0) => {
    const result = Number(value);
    return Number.isFinite(result) ? result : fallback;
  };

  const apiBase = () => text(CONFIG.apiBaseUrl).replace(/\/$/, "");

  const channelType = (thread) => {
    const raw = text(thread?.channelType || thread?.channel_type, "line").toLowerCase();
    if (raw === "instagram" || raw === "ig" || raw.includes("instagram")) return "instagram";
    if (raw === "web") return "web";
    return "line";
  };

  const channelLabel = (thread) => {
    const type = channelType(thread);
    if (type === "instagram") return "Instagram";
    if (type === "web") return "WEB";
    return "LINE";
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

  const isPendingReply = (thread) => {
    const unread = num(thread?.unreadCount ?? thread?.unread_count, 0);
    const direction = text(thread?.lastMessageDirection || thread?.last_message_direction).toLowerCase();
    return unread > 0 && direction !== "outbound";
  };

  const pendingThreads = () => state.threads.filter(isPendingReply);

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

  const normalizedPreview = (value) =>
    text(value).replace(/^返信:\s*/, "").trim();

  const findThreadForRow = (row) => {
    const name = text(row?.querySelector(".dc-thread-name strong")?.textContent);
    if (!name) return null;

    const preview = normalizedPreview(row?.querySelector(".dc-thread-preview")?.textContent);
    const candidates = state.threads.filter((thread) => text(thread?.displayName) === name);
    if (candidates.length === 1) return candidates[0];
    if (candidates.length > 1) {
      return candidates.find((thread) => normalizedPreview(thread?.lastMessage) === preview) || candidates[0];
    }
    return null;
  };

  const ensureSummary = () => {
    let summary = document.getElementById("dproReplySummary");
    if (summary) return summary;

    const metrics = document.querySelector(".dc-metrics");
    if (!metrics) return null;

    summary = document.createElement("div");
    summary.id = "dproReplySummary";
    summary.className = "dpro-reply-summary";
    summary.setAttribute("aria-live", "polite");
    metrics.insertAdjacentElement("afterend", summary);
    return summary;
  };

  const ensureReplyFilter = () => {
    if (document.getElementById("dproReplyOnly")) return;

    const tools = document.querySelector(".dc-thread-tools");
    if (!tools) return;

    const label = document.createElement("label");
    label.className = "dpro-reply-filter";
    label.innerHTML = '<input id="dproReplyOnly" type="checkbox"> 先方返信のみ';
    tools.appendChild(label);

    label.querySelector("input")?.addEventListener("change", syncRows);
  };

  const setMetric = (count) => {
    const metric = document.getElementById("metricUnread");
    if (!metric) return;
    metric.textContent = String(count);
    const label = metric.parentElement?.querySelector("span");
    if (label) label.textContent = "先方から返信";
  };

  const setPageBadge = async (count) => {
    const n = Math.max(0, Math.floor(num(count, 0)));
    state.lastBadgeCount = n;

    // Route 1: window Navigator Badging API.
    try {
      if (n > 0 && "setAppBadge" in navigator) {
        await navigator.setAppBadge(n);
      } else if (n <= 0 && "clearAppBadge" in navigator) {
        await navigator.clearAppBadge();
      }
    } catch (_) {
      // Keep going: some installed web apps expose the API more reliably
      // inside the Service Worker than on the page Navigator.
    }

    // Route 2: explicitly ask the active Service Worker to set the same badge.
    // The R1 Service Worker already had this receiver, but R1 never sent to it.
    if (!("serviceWorker" in navigator)) return;

    try {
      const registration =
        (await navigator.serviceWorker.getRegistration("./")) ||
        (await navigator.serviceWorker.ready);

      if (registration?.update) {
        try { await registration.update(); } catch (_) {}
      }

      const worker =
        navigator.serviceWorker.controller ||
        registration?.active ||
        registration?.waiting ||
        registration?.installing;

      worker?.postMessage({
        type: "DPRO_CONTACT_BADGE",
        count: n,
        version: VERSION,
      });
    } catch (_) {
      // Badge is an enhancement; never block CONTACT.
    }
  };

  const updateTitle = (count) => {
    const base = state.originalTitle.replace(/^\(\d+\)\s*/, "");
    document.title = count > 0 ? `(${count}) ${base}` : base;
  };

  const showToast = (message, error = false) => {
    const toast = document.getElementById("toast");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.toggle("error", error);
    toast.classList.remove("dc-hidden");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.add("dc-hidden"), 3200);
  };

  const maybeNotifyForeground = async (pending) => {
    const count = pending.length;
    if (state.lastPendingCount === null) {
      state.lastPendingCount = count;
      return;
    }

    if (count <= state.lastPendingCount) {
      state.lastPendingCount = count;
      return;
    }

    const latest = pending[0];
    state.lastPendingCount = count;

    if (!("Notification" in window) || Notification.permission !== "granted") return;

    try {
      const reg = await navigator.serviceWorker?.ready;
      const name = text(latest?.displayName, "お客様");
      const body = `${channelLabel(latest)}：${text(latest?.lastMessage, "新しい返信があります")}`;
      if (reg?.showNotification) {
        await reg.showNotification("先方から返信があります", {
          body,
          icon: "./dpro-contact-icon-192.png",
          badge: "./dpro-contact-icon-192.png",
          tag: `dpro-contact-${text(latest?.id, "reply")}`,
          renotify: true,
          data: { url: "./contact-v1.html" },
        });
      }
    } catch (_) {
      // Do not interrupt inbox refresh.
    }
  };

  const syncSummary = async () => {
    if (!state.ready) return;
    const pending = pendingThreads();
    const count = pending.length;
    const byChannel = { line: 0, web: 0, instagram: 0 };
    pending.forEach((thread) => { byChannel[channelType(thread)] += 1; });

    setMetric(count);
    updateTitle(count);
    await setPageBadge(count);

    const summary = ensureSummary();
    if (summary) {
      summary.innerHTML = `
        <strong><span class="dpro-live-dot" aria-hidden="true"></span>先方から返信 ${count}件</strong>
        <span>LINE ${byChannel.line}</span>
        <span>WEB ${byChannel.web}</span>
        <span>Instagram ${byChannel.instagram}</span>
      `;
      summary.classList.toggle("is-zero", count === 0);
    }

    await maybeNotifyForeground(pending);
  };

  function syncRows() {
    if (!state.ready) return;

    const list = document.getElementById("threadList");
    if (!list) return;

    const replyOnly = document.getElementById("dproReplyOnly")?.checked === true;
    const pendingRows = [];
    const otherRows = [];

    list.querySelectorAll(".dc-thread-item").forEach((row) => {
      const thread = findThreadForRow(row);
      const pending = Boolean(thread && isPendingReply(thread));

      row.classList.toggle("dpro-reply-waiting", pending);
      row.dataset.dproReplyWaiting = pending ? "1" : "0";

      let label = row.querySelector(".dpro-reply-state");
      if (pending) {
        if (!label) {
          label = document.createElement("span");
          label.className = "dpro-reply-state";
          label.textContent = "先方から返信";
          row.querySelector(".dc-thread-name")?.appendChild(label);
        }
      } else {
        label?.remove();
      }

      row.hidden = replyOnly && !pending;
      (pending ? pendingRows : otherRows).push(row);
    });

    // Pending customer replies float to the top, but only mutate the DOM when
    // the order actually needs to change. Re-appending every row on every sync
    // can race with the core click handler and also self-trigger MutationObserver.
    const desiredRows = [...pendingRows, ...otherRows];
    const currentRows = Array.from(list.querySelectorAll(".dc-thread-item"));
    const orderChanged =
      desiredRows.length === currentRows.length &&
      desiredRows.some((row, index) => row !== currentRows[index]);

    if (orderChanged) {
      state.observer?.disconnect();
      desiredRows.forEach((row) => list.appendChild(row));
      if (state.observer) {
        state.observer.observe(list, { childList: true, subtree: true });
      }
    }
  }

  const syncAll = async () => {
    if (!state.ready) return;
    ensureReplyFilter();
    syncRows();
    await syncSummary();
  };

  const refreshAndSync = async () => {
    await fetchThreads();
    await syncAll();
  };

  const ensureNotificationButton = () => {
    if (document.getElementById("dproNotificationButton")) return;

    const refresh = document.getElementById("refreshButton");
    if (!refresh) return;

    const button = document.createElement("button");
    button.id = "dproNotificationButton";
    button.className = "dc-btn dc-secondary dpro-notification-button";
    button.type = "button";
    button.textContent = "スマホ通知をON";
    refresh.insertAdjacentElement("beforebegin", button);

    const syncButtonState = () => {
      if (!("Notification" in window) || !("serviceWorker" in navigator)) {
        button.textContent = "通知非対応";
        button.disabled = true;
        return;
      }
      if (Notification.permission === "granted") {
        button.textContent = "通知ON";
        button.classList.add("is-on");
      } else if (Notification.permission === "denied") {
        button.textContent = "通知がOFF";
        button.classList.remove("is-on");
      } else {
        button.textContent = "スマホ通知をON";
        button.classList.remove("is-on");
      }
    };

    button.addEventListener("click", async () => {
      if (!("Notification" in window) || !("serviceWorker" in navigator)) {
        showToast("このブラウザは通知に対応していません。", true);
        return;
      }

      try {
        await navigator.serviceWorker.register("./contact-v1-sw.js?v=DPRO-CONTACT-PWA-SW-R1.2-20260830", { scope: "./", updateViaCache: "none" });
        const permission = await Notification.requestPermission();
        syncButtonState();

        if (permission === "granted") {
          showToast("DPRO CONTACTのスマホ通知をONにしました。");
          await syncSummary();
        } else if (permission === "denied") {
          showToast("通知がOFFです。ブラウザまたは端末設定から許可してください。", true);
        }
      } catch (error) {
        showToast(`通知設定に失敗しました：${text(error?.message, "不明なエラー")}`, true);
      }
    });

    syncButtonState();
  };

  const registerServiceWorker = async () => {
    if (!("serviceWorker" in navigator)) return;
    try {
      await navigator.serviceWorker.register("./contact-v1-sw.js?v=DPRO-CONTACT-PWA-SW-R1.2-20260830", { scope: "./", updateViaCache: "none" });
    } catch (_) {
      // PWA/notification is an enhancement only.
    }
  };

  const installObserver = () => {
    const list = document.getElementById("threadList");
    if (!list || state.observer) return;

    let timer = null;
    state.observer = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => syncAll(), 50);
    });
    state.observer.observe(list, { childList: true, subtree: true });
  };

  const installEvents = () => {
    document.addEventListener("click", (event) => {
      if (event.target.closest?.("#refreshButton")) {
        setTimeout(refreshAndSync, 500);
      }
      if (event.target.closest?.("#threadList .dc-thread-item")) {
        setTimeout(refreshAndSync, 700);
      }
    });

    ["threadSearch", "unreadOnly", "statusFilter"].forEach((id) => {
      document.getElementById(id)?.addEventListener("change", () => setTimeout(syncAll, 0));
    });
    document.getElementById("threadSearch")?.addEventListener("input", () => setTimeout(syncAll, 0));

    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) setTimeout(refreshAndSync, 250);
    });
  };

  const boot = async () => {
    let attempts = 0;
    while (!window.DPRO_CONTACT_UI && attempts < 60) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      attempts += 1;
    }

    ensureNotificationButton();
    ensureReplyFilter();
    installObserver();
    installEvents();
    await registerServiceWorker();
    await refreshAndSync();

    state.syncTimer = setInterval(syncAll, 5000);
    state.refreshTimer = setInterval(refreshAndSync, 30000);
  };

  window.addEventListener("pagehide", () => {
    // Re-assert the last known count immediately before the installed app
    // moves to the background/home screen.
    setPageBadge(state.lastBadgeCount).catch(() => {});
  });

  window.addEventListener("beforeunload", () => {
    setPageBadge(state.lastBadgeCount).catch(() => {});
    if (state.syncTimer) clearInterval(state.syncTimer);
    if (state.refreshTimer) clearInterval(state.refreshTimer);
    state.observer?.disconnect();
  });

  window.DPRO_CONTACT_REPLY_ALERT_R1 = Object.freeze({
    version: VERSION,
    refresh: refreshAndSync,
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
