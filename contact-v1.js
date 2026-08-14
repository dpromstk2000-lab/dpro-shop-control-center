(() => {
  "use strict";

  const VERSION = "DPRO-CONTACT-1-FRONTEND-LINE-WEB-20260814-R1";
  const CONFIG = window.DPRO_CONTACT_CONFIG || {};
  const $ = (id) => document.getElementById(id);

  const state = {
    token: "",
    operator: null,
    supabase: null,
    session: null,
    threads: [],
    selectedThread: null,
    messages: [],
    refreshTimer: null,
    loading: false,
  };

  function text(value, fallback = "") {
    const v = String(value ?? "").trim();
    return v || fallback;
  }

  function num(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function branding() {
    return CONFIG.branding || {};
  }

  function authConfig() {
    return CONFIG.auth || {};
  }

  function operatorConfig() {
    return CONFIG.operator || {};
  }

  function uiConfig() {
    return CONFIG.ui || {};
  }

  function features() {
    return {
      line: CONFIG.features?.line !== false,
      lineReply: CONFIG.features?.lineReply !== false,
      web: CONFIG.features?.web === true,
      search: CONFIG.features?.search !== false,
      statusManagement: CONFIG.features?.statusManagement !== false,
      autoRefresh: CONFIG.features?.autoRefresh !== false,
      attachments: CONFIG.features?.attachments === true,
      templates: CONFIG.features?.templates === true,
      assignment: CONFIG.features?.assignment === true,
      aiSuggestions: CONFIG.features?.aiSuggestions === true,
      email: CONFIG.features?.email === true,
    };
  }

  function applyFeatureFlags() {
    const f = features();

    if ($("threadSearch")) {
      $("threadSearch").classList.toggle("dc-hidden", !f.search);
      if (!f.search) $("threadSearch").value = "";
    }

    if ($("statusFilter")) {
      $("statusFilter").classList.toggle("dc-hidden", !f.statusManagement);
      if (!f.statusManagement) $("statusFilter").value = "all";
    }

    if ($("statusButton")) {
      $("statusButton").classList.toggle("dc-hidden", !f.statusManagement);
    }

    const noReplySurface = (!f.line || !f.lineReply) && !f.web;
    if ($("replyForm")) $("replyForm").classList.toggle("dc-hidden", noReplySurface);

    if (!f.line && !f.web) {
      setText("pageLead", "顧客対応チャネルは現在無効になっています。");
      setText("topbarDescription", "顧客対応は無効");
    }
  }

  function apiBase() {
    return text(CONFIG.apiBaseUrl).replace(/\/$/, "");
  }

  function show(id) {
    ["loading", "disabledScreen", "authRequired", "errorScreen", "app"]
      .forEach((key) => $(key)?.classList.toggle("dc-hidden", key !== id));
  }

  function toast(message, error = false) {
    const el = $("toast");
    if (!el) return;
    el.textContent = message;
    el.classList.toggle("error", error);
    el.classList.remove("dc-hidden");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.add("dc-hidden"), 3200);
  }

  function applyConfig() {
    document.body.dataset.contactLayout = text(CONFIG.layout, "standalone");
    document.body.dataset.contactDensity = text(CONFIG.density, "normal");

    const brand = branding();
    const root = document.documentElement;
    const colors = [
      ["--dc-primary", brand.primaryColor],
      ["--dc-primary-2", brand.primaryColor2],
      ["--dc-deep", brand.deepColor],
      ["--dc-soft", brand.softColor],
    ];
    for (const [name, value] of colors) {
      if (text(value)) root.style.setProperty(name, text(value));
    }

    const title = text(brand.pageTitle, "問い合わせを管理画面で完結");
    document.title = `顧客対応 | ${text(brand.brandName, "DPRO")}`;

    setText("loadingTitle", `${text(brand.brandName, "DPRO")} CONTACT`);
    setText("brandName", text(brand.brandName, "DPRO"));
    setText("systemName", text(brand.systemName, "OWNER SYSTEM"));
    setText("brandMark", text(brand.brandMark, "D").slice(0, 2));
    setText("pageTitle", title);
    setText("pageLead", text(brand.pageLead, "LINE公式に届いた問い合わせを確認し、そのまま返信できます。"));
    setText("topbarDescription", text(brand.topbarDescription, "LINE公式の問い合わせを確認・返信"));
    setText("channelName", text(brand.channelName, "LINE Inbox"));
    setText("homeLabel", text(brand.homeLabel, "管理画面"));

    const homeUrl = safeLocalUrl(brand.homeUrl, "owner.html");
    const loginUrl = safeLocalUrl(brand.loginUrl || brand.homeUrl, homeUrl);
    ["brandLink", "homeLink", "disabledReturn", "errorReturn"].forEach((id) => {
      if ($(id)) $(id).href = homeUrl;
    });
    if ($("loginReturn")) $("loginReturn").href = loginUrl;

    if ($("securityNote")) {
      $("securityNote").classList.toggle("dc-hidden", uiConfig().showSecurityNote === false);
    }

    applyFeatureFlags();
  }

  function setText(id, value) {
    if ($(id)) $(id).textContent = value;
  }

  function safeLocalUrl(value, fallback) {
    const raw = text(value, fallback);
    try {
      const url = new URL(raw, location.href);
      if (!["http:", "https:"].includes(url.protocol)) return fallback;
      return url.href;
    } catch {
      return fallback;
    }
  }

  async function ensureSupabaseLibrary() {
    if (window.supabase?.createClient) return;
    const src = text(authConfig().supabaseJsUrl, "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2");

    await new Promise((resolve, reject) => {
      const existing = document.querySelector("script[data-dpro-contact-supabase]");
      if (existing) {
        existing.addEventListener("load", resolve, { once: true });
        existing.addEventListener("error", () => reject(new Error("Supabaseライブラリを読み込めませんでした。")), { once: true });
        return;
      }

      const script = document.createElement("script");
      script.src = src;
      script.defer = true;
      script.dataset.dproContactSupabase = "true";
      script.addEventListener("load", resolve, { once: true });
      script.addEventListener("error", () => reject(new Error("Supabaseライブラリを読み込めませんでした。")), { once: true });
      document.head.appendChild(script);
    });

    if (!window.supabase?.createClient) {
      throw new Error("Supabaseライブラリを読み込めませんでした。");
    }
  }

  async function resolvePublicAuthConfig() {
    const auth = authConfig();
    let resolved = {
      supabaseUrl: text(auth.supabaseUrl),
      supabasePublishableKey: text(auth.supabasePublishableKey),
      sessionStorageKey: text(auth.sessionStorageKey),
    };

    const publicConfigUrl = text(auth.publicConfigUrl);
    if (publicConfigUrl) {
      const response = await fetch(publicConfigUrl, {
        headers: { "content-type": "application/json" },
        cache: "no-store",
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || `公開設定を取得できません（HTTP ${response.status}）`);
      }
      resolved = {
        supabaseUrl: text(data.supabaseUrl, resolved.supabaseUrl),
        supabasePublishableKey: text(data.supabasePublishableKey || data.supabaseAnonKey, resolved.supabasePublishableKey),
        sessionStorageKey: text(data.sessionStorageKey, resolved.sessionStorageKey),
      };
    }

    if (!resolved.supabaseUrl || !resolved.supabasePublishableKey) {
      throw new Error("Supabase公開設定が不足しています。");
    }
    return resolved;
  }

  async function initializeAuth() {
    const mode = text(authConfig().mode, "supabase").toLowerCase();

    if (mode === "adapter") {
      const adapter = window.DPRO_CONTACT_AUTH;
      if (!adapter || typeof adapter.getAccessToken !== "function") {
        throw new Error("DPRO_CONTACT_AUTH.getAccessToken() がありません。");
      }
      state.token = text(await adapter.getAccessToken());
      if (!state.token) return false;

      if (typeof adapter.getOperator === "function") {
        state.operator = normalizeOperator(await adapter.getOperator());
      } else {
        state.operator = normalizeOperator({});
      }
      applyOperator();
      return true;
    }

    if (mode !== "supabase") {
      throw new Error("対応していない認証モードです。");
    }

    await ensureSupabaseLibrary();
    const publicAuth = await resolvePublicAuthConfig();

    state.supabase = window.supabase.createClient(
      publicAuth.supabaseUrl,
      publicAuth.supabasePublishableKey,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
          ...(publicAuth.sessionStorageKey ? { storageKey: publicAuth.sessionStorageKey } : {}),
        },
      }
    );

    const { data, error } = await state.supabase.auth.getSession();
    if (error) throw error;

    state.session = data?.session || null;
    state.token = text(state.session?.access_token);
    if (!state.token) return false;

    const user = state.session.user || {};
    const adapter = window.DPRO_CONTACT_AUTH;
    if (adapter && typeof adapter.getOperator === "function") {
      state.operator = normalizeOperator(await adapter.getOperator({ user, session: state.session }));
    } else {
      state.operator = normalizeOperator({
        id: user.id,
        displayName: user.user_metadata?.display_name || user.email || user.phone || operatorConfig().defaultName,
        role: user.user_metadata?.role || "authenticated",
      });
    }

    applyOperator();
    return true;
  }

  function normalizeOperator(input) {
    const op = input || {};
    const role = text(op.role || op.roleKey, "authenticated");
    const readOnlyRoles = Array.isArray(operatorConfig().readOnlyRoles)
      ? operatorConfig().readOnlyRoles.map(String)
      : ["read_only"];

    return {
      id: text(op.id || op.staffId || op.staffKey),
      displayName: text(op.displayName || op.name, operatorConfig().defaultName || "ログイン中"),
      role,
      roleLabel: text(
        op.roleLabel,
        operatorConfig().roleLabels?.[role] || operatorConfig().defaultRole || role
      ),
      readOnly: typeof op.readOnly === "boolean" ? op.readOnly : readOnlyRoles.includes(role),
    };
  }

  function applyOperator() {
    const op = state.operator || normalizeOperator({});
    setText("operatorName", op.displayName);
    setText("operatorRole", op.roleLabel);
    setText("operatorInitial", (op.displayName || "D").slice(0, 1));

    if ($("statusButton")) {
      $("statusButton").disabled = Boolean(op.readOnly);
    }
    applyComposerMode();
  }

  function threadChannelType(thread = state.selectedThread) {
    return text(thread?.channelType, "line").toLowerCase() === "web" ? "web" : "line";
  }

  function threadChannelLabel(thread = state.selectedThread) {
    return threadChannelType(thread) === "web" ? "WEB" : "LINE";
  }

  function threadFallbackName(thread) {
    const key = text(thread?.userKey);
    return threadChannelType(thread) === "web"
      ? `WEB問い合わせ ${key}`
      : `LINEユーザー ${key}`;
  }

  function applyComposerMode(thread = state.selectedThread) {
    const textarea = $("replyText");
    const button = $("sendButton");
    const hint = $("composerHint");
    if (!textarea || !button) return;

    const op = state.operator || normalizeOperator({});
    const channelType = threadChannelType(thread);

    if (channelType === "web") {
      textarea.disabled = true;
      textarea.value = "";
      textarea.placeholder = "WEB問い合わせへのメール返信は今後の拡張で対応します";
      button.disabled = true;
      button.textContent = "WEB返信は未対応";
      if (hint) hint.textContent = "現在は問い合わせ内容の確認・対応状態の管理まで。メール返信機能は今後追加します。";
      return;
    }

    const canReply = !op.readOnly && features().line && features().lineReply;
    textarea.disabled = !canReply;
    textarea.placeholder = op.readOnly
      ? "閲覧専用アカウントでは返信できません"
      : features().lineReply
        ? "返信を入力してください"
        : "LINE返信機能は無効になっています";
    button.disabled = !canReply;
    button.textContent = "LINEへ返信";
    if (hint) hint.textContent = canReply
      ? "送信ボタンでLINEへ送信します"
      : "このアカウントではLINEへ返信できません";
  }

  async function contactApi(path, options = {}) {
    if (!state.token) throw new Error("ログインセッションがありません。");
    if (!apiBase()) throw new Error("DPRO CONTACT API URLが未設定です。");

    const response = await fetch(`${apiBase()}${path}`, {
      ...options,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${state.token}`,
        ...(options.headers || {}),
      },
      cache: "no-store",
    });

    const data = await response.json().catch(() => ({}));

    if (response.status === 401) {
      stopAutoRefresh();
      state.token = "";
      show("authRequired");
      throw Object.assign(new Error("ログインの有効期限が切れました。"), { handled: true });
    }

    if (!response.ok) {
      throw new Error(data.message || data.error || `HTTP ${response.status}`);
    }
    return data;
  }

  async function loadAll({ keepSelection = true, silent = false } = {}) {
    if (state.loading) return;
    state.loading = true;

    try {
      const selectedId = keepSelection ? state.selectedThread?.id : null;
      const [summary, threadData] = await Promise.all([
        contactApi("/api/contact/summary"),
        contactApi(buildThreadPath()),
      ]);

      setText("metricUnread", summary.unread ?? 0);
      setText("metricOpen", summary.openThreads ?? 0);
      setText("metricToday", summary.todayThreads ?? 0);
      setText("metricClosed", summary.closedThreads ?? 0);

      state.threads = Array.isArray(threadData.threads) ? threadData.threads : [];
      renderThreads();

      if (selectedId) {
        const same = state.threads.find((t) => t.id === selectedId);
        if (same) {
          state.selectedThread = same;
          await loadSelectedMessages({ markRead: false });
        } else {
          clearConversation();
        }
      }

      if (!silent) setText("topbarDescription", text(branding().topbarDescription, "LINE・WEB問い合わせを一元確認"));
    } finally {
      state.loading = false;
    }
  }

  function buildThreadPath() {
    const params = new URLSearchParams();
    const status = features().statusManagement ? ($("statusFilter")?.value || "all") : "all";
    if (status !== "all") params.set("status", status);
    if ($("unreadOnly")?.checked) params.set("unread", "1");
    const qs = params.toString();
    return `/api/contact/threads${qs ? `?${qs}` : ""}`;
  }

  function filteredThreads() {
    const q = features().search ? text($("threadSearch")?.value).toLowerCase() : "";
    if (!q) return state.threads;
    return state.threads.filter((t) =>
      `${t.displayName || ""} ${t.lastMessage || ""} ${t.userKey || ""} ${t.channelType || ""} ${t.channelName || ""}`
        .toLowerCase()
        .includes(q)
    );
  }

  function renderThreads() {
    const list = $("threadList");
    if (!list) return;
    const rows = filteredThreads();

    if (!rows.length) {
      list.innerHTML = `<div class="dc-thread-empty">現在表示できる問い合わせはありません。</div>`;
      return;
    }

    list.innerHTML = "";

    for (const thread of rows) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `dc-thread-item${state.selectedThread?.id === thread.id ? " active" : ""}`;

      const name = text(thread.displayName, threadFallbackName(thread));
      const channel = threadChannelLabel(thread);
      const channelClass = threadChannelType(thread) === "web" ? "dc-channel-web" : "dc-channel-line";
      const initial = channel === "WEB" ? "W" : (name.slice(0, 1) || "L");

      button.innerHTML = `
        <span class="dc-avatar ${channel === "WEB" ? "dc-avatar--web" : ""}">${esc(initial)}</span>
        <span class="dc-thread-body">
          <span class="dc-thread-name">
            <span class="dc-channel-badge ${channelClass}">${channel}</span>
            <strong>${esc(name)}</strong>
            ${num(thread.unreadCount) > 0 ? `<span class="dc-badge">${num(thread.unreadCount)}</span>` : ""}
          </span>
          <span class="dc-thread-preview">${thread.lastMessageDirection === "outbound" ? "返信: " : ""}${esc(thread.lastMessage || "メッセージなし")}</span>
        </span>
        <time>${shortTime(thread.lastMessageAt)}</time>
      `;

      button.addEventListener("click", () => selectThread(thread));
      list.appendChild(button);
    }
  }

  async function selectThread(thread) {
    state.selectedThread = thread;
    renderThreads();

    if (window.innerWidth <= 760) {
      document.body.classList.add("dc-mobile-conversation");
    }

    await loadSelectedMessages({ markRead: true });
  }

  async function loadSelectedMessages({ markRead = true } = {}) {
    const thread = state.selectedThread;
    if (!thread) return;

    $("emptyConversation")?.classList.add("dc-hidden");
    $("conversation")?.classList.remove("dc-hidden");

    const name = text(thread.displayName, threadFallbackName(thread));
    const channel = threadChannelLabel(thread);
    setText("conversationName", name);
    setText(
      "conversationMeta",
      `${channel} / ${thread.status === "closed" ? "対応完了" : "対応中"} / 最終更新 ${formatDate(thread.lastMessageAt)}`
    );
    setText("statusButton", thread.status === "closed" ? "対応を再開" : "対応完了にする");
    applyComposerMode(thread);

    const data = await contactApi(`/api/contact/threads/${encodeURIComponent(thread.id)}/messages`);
    state.messages = Array.isArray(data.messages) ? data.messages : [];
    renderMessages();

    if (markRead && num(thread.unreadCount) > 0) {
      await contactApi(`/api/contact/threads/${encodeURIComponent(thread.id)}/read`, {
        method: "POST",
        body: "{}",
      });
      thread.unreadCount = 0;
      renderThreads();
      const summary = await contactApi("/api/contact/summary");
      setText("metricUnread", summary.unread ?? 0);
    }
  }

  function clearConversation() {
    state.selectedThread = null;
    state.messages = [];
    $("conversation")?.classList.add("dc-hidden");
    $("emptyConversation")?.classList.remove("dc-hidden");
    document.body.classList.remove("dc-mobile-conversation");
    renderThreads();
  }

  function renderMessages() {
    const list = $("messageList");
    if (!list) return;
    list.innerHTML = "";

    for (const msg of state.messages) {
      const div = document.createElement("div");
      div.className = `dc-message ${msg.direction === "outbound" ? "outbound" : "inbound"}`;
      div.innerHTML = `
        <p>${esc(msg.body || "")}</p>
        <small>${formatDate(msg.occurredAt, true)}${msg.direction === "outbound" ? " ・ 返信" : ""}</small>
      `;
      list.appendChild(div);
    }

    requestAnimationFrame(() => {
      list.scrollTop = list.scrollHeight;
    });
  }

  async function submitReply(event) {
    event.preventDefault();
    const thread = state.selectedThread;
    if (
      !thread ||
      threadChannelType(thread) !== "line" ||
      state.operator?.readOnly ||
      !features().line ||
      !features().lineReply
    ) return;

    const textValue = text($("replyText")?.value);
    if (!textValue) return;

    const button = $("sendButton");
    const original = button?.textContent || "LINEへ返信";
    if (button) {
      button.disabled = true;
      button.textContent = "送信中…";
    }

    try {
      await contactApi(`/api/contact/threads/${encodeURIComponent(thread.id)}/reply`, {
        method: "POST",
        body: JSON.stringify({ text: textValue }),
      });
      if ($("replyText")) $("replyText").value = "";
      toast("LINEへ返信しました。");
      await loadAll({ keepSelection: true, silent: true });
    } catch (error) {
      if (!error?.handled) toast(`送信できませんでした：${error.message}`, true);
    } finally {
      if (button) button.textContent = original;
      applyComposerMode(thread);
    }
  }

  async function toggleStatus() {
    const thread = state.selectedThread;
    if (!thread || state.operator?.readOnly || !features().statusManagement) return;

    const status = thread.status === "closed" ? "open" : "closed";
    try {
      await contactApi(`/api/contact/threads/${encodeURIComponent(thread.id)}/status`, {
        method: "POST",
        body: JSON.stringify({ status }),
      });
      thread.status = status;
      toast(status === "closed" ? "対応完了にしました。" : "対応を再開しました。");
      await loadAll({ keepSelection: true, silent: true });
    } catch (error) {
      if (!error?.handled) toast(`状態を変更できませんでした：${error.message}`, true);
    }
  }

  function startAutoRefresh() {
    stopAutoRefresh();
    if (!features().autoRefresh) return;
    const seconds = Math.max(0, Math.floor(num(uiConfig().autoRefreshSeconds, 30)));
    if (seconds < 10) return;

    state.refreshTimer = setInterval(() => {
      if (document.hidden || !state.token || state.loading) return;
      loadAll({ keepSelection: true, silent: true }).catch(() => {});
    }, seconds * 1000);
  }

  function stopAutoRefresh() {
    if (state.refreshTimer) clearInterval(state.refreshTimer);
    state.refreshTimer = null;
  }

  async function boot() {
    stopAutoRefresh();
    applyConfig();

    if (CONFIG.enabled === false) {
      show("disabledScreen");
      return;
    }

    if (!apiBase()) {
      setText("errorText", "DPRO CONTACT API URLが未設定です。contact-config.js を確認してください。");
      show("errorScreen");
      return;
    }

    show("loading");

    try {
      const loggedIn = await initializeAuth();
      if (!loggedIn) {
        show("authRequired");
        return;
      }

      await contactApi("/api/contact/summary");
      show("app");
      await loadAll({ keepSelection: false });
      startAutoRefresh();
    } catch (error) {
      if (error?.handled) return;
      setText("errorText", `${error.message}。CONTACT Worker・公開設定・ログイン状態を確認してください。`);
      show("errorScreen");
    }
  }

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formatDate(value, compact = false) {
    if (!value) return "—";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    return new Intl.DateTimeFormat("ja-JP", compact
      ? { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }
      : { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }
    ).format(d);
  }

  function shortTime(value) {
    if (!value) return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    const now = new Date();
    const sameDay =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();

    return new Intl.DateTimeFormat("ja-JP", sameDay
      ? { hour: "2-digit", minute: "2-digit" }
      : { month: "numeric", day: "numeric" }
    ).format(d);
  }

  $("replyForm")?.addEventListener("submit", submitReply);
  $("statusButton")?.addEventListener("click", toggleStatus);
  $("refreshButton")?.addEventListener("click", () => loadAll().catch((e) => !e?.handled && toast(e.message, true)));
  $("retryButton")?.addEventListener("click", boot);
  $("threadSearch")?.addEventListener("input", renderThreads);
  $("unreadOnly")?.addEventListener("change", () => loadAll({ keepSelection: false }).catch((e) => !e?.handled && toast(e.message, true)));
  $("statusFilter")?.addEventListener("change", () => loadAll({ keepSelection: false }).catch((e) => !e?.handled && toast(e.message, true)));
  $("menuButton")?.addEventListener("click", () => $("sidebar")?.classList.toggle("open"));
  $("mobileBackButton")?.addEventListener("click", clearConversation);

  document.addEventListener("click", (event) => {
    if (window.innerWidth > 760) return;
    if (!$("sidebar")?.classList.contains("open")) return;
    if ($("sidebar").contains(event.target) || event.target === $("menuButton")) return;
    $("sidebar").classList.remove("open");
  });

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && state.token) {
      loadAll({ keepSelection: true, silent: true }).catch(() => {});
    }
  });

  window.addEventListener("beforeunload", stopAutoRefresh);
  window.DPRO_CONTACT_UI = Object.freeze({
    version: VERSION,
    refresh: () => loadAll({ keepSelection: true }),
    getSelectedThreadId: () => state.selectedThread?.id || null,
  });

  boot();
})();
