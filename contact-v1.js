(() => {
  "use strict";

  const VERSION = "DPRO-CONTACT-1-FRONTEND-LINE-WEB-EMAIL-ATTACHMENTS-20260815-R4-STAGED";
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
    pendingWebReply: null,
    pendingAttachmentReply: null,
    selectedFiles: [],
    attachmentObjectUrls: new Map(),
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

    if ($("attachmentControls")) {
      $("attachmentControls").classList.toggle("dc-hidden", !f.attachments);
    }
    if (!f.attachments) clearSelectedFiles();

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

  async function contactApiForm(path, formData) {
    if (!state.token) throw new Error("ログインセッションがありません。");
    if (!apiBase()) throw new Error("DPRO CONTACT API URLが未設定です。");

    const response = await fetch(`${apiBase()}${path}`, {
      method: "POST",
      headers: { authorization: `Bearer ${state.token}` },
      body: formData,
      cache: "no-store",
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) {
      stopAutoRefresh();
      state.token = "";
      show("authRequired");
      throw Object.assign(new Error("ログインの有効期限が切れました。"), { handled: true });
    }
    if (!response.ok) throw new Error(data.message || data.error || `HTTP ${response.status}`);
    return data;
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
    const attachmentButton = $("attachmentButton");
    if (!textarea || !button) return;

    const op = state.operator || normalizeOperator({});
    const channelType = threadChannelType(thread);

    if (channelType === "web") {
      const canEmailReply = !op.readOnly && features().web && features().email;
      textarea.disabled = !canEmailReply;
      textarea.placeholder = op.readOnly
        ? "閲覧専用アカウントでは返信できません"
        : canEmailReply
          ? "メール返信を入力してください"
          : "WEBメール返信機能は無効になっています";
      button.disabled = !canEmailReply;
      button.textContent = "メールで返信";
      if (attachmentButton) attachmentButton.disabled = !canEmailReply || !features().attachments;
      if (hint) hint.textContent = canEmailReply
        ? (features().attachments ? "本文または添付資料をメールで送信できます" : "WEB問い合わせのお客様へDPRO SHOP名義でメール送信します")
        : "WEBメール返信機能は現在無効です";
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
    if (attachmentButton) attachmentButton.disabled = !canReply || !features().attachments;
    if (hint) hint.textContent = canReply
      ? (features().attachments ? "本文・画像・資料リンクをLINEへ送信できます" : "送信ボタンでLINEへ送信します")
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
    state.pendingWebReply = null;
    state.pendingAttachmentReply = null;
    clearSelectedFiles();
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
    state.pendingWebReply = null;
    state.pendingAttachmentReply = null;
    clearSelectedFiles();
    $("conversation")?.classList.add("dc-hidden");
    $("emptyConversation")?.classList.remove("dc-hidden");
    document.body.classList.remove("dc-mobile-conversation");
    renderThreads();
  }

  function formatBytes(value) {
    const bytes = num(value, 0);
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function attachmentKind(attachment) {
    const contentType = text(attachment?.contentType).toLowerCase();
    if (attachment?.image || contentType.startsWith("image/")) return "image";
    if (contentType === "application/pdf") return "pdf";
    if (contentType.includes("spreadsheet") || contentType.includes("excel") || contentType === "text/csv") return "spreadsheet";
    if (contentType.startsWith("audio/")) return "audio";
    if (contentType.startsWith("video/")) return "video";
    return "file";
  }

  function attachmentIcon(attachment) {
    const kind = attachmentKind(attachment);
    return kind === "image" ? "画" : kind === "pdf" ? "PDF" : kind === "spreadsheet" ? "表" : kind === "audio" ? "音" : kind === "video" ? "動" : "添";
  }

  function attachmentAvailable(attachment) {
    return Boolean(
      attachment?.id &&
      attachment?.downloadable !== false &&
      ["stored", "sent"].includes(text(attachment?.status, "stored"))
    );
  }

  function renderAttachmentHtml(attachment) {
    const id = esc(attachment?.id || "");
    const name = esc(attachment?.name || "添付ファイル");
    const size = esc(formatBytes(attachment?.sizeBytes));
    const contentType = esc(attachment?.contentType || "");
    const available = attachmentAvailable(attachment);
    const kind = attachmentKind(attachment);

    if (!available) {
      return `<div class="dc-attachment-card is-unavailable"><span class="dc-attachment-icon">${attachmentIcon(attachment)}</span><div><strong>${name}</strong><small>${size}${size ? " ・ " : ""}現在開けません</small></div></div>`;
    }

    const image = kind === "image"
      ? `<button class="dc-attachment-image dc-attachment-image--loading" type="button" data-attachment-open="${id}" aria-label="${name}を開く"><span>画像を読み込み中…</span><img alt="${name}" loading="lazy"></button>`
      : "";

    return `${image}<div class="dc-attachment-card"><span class="dc-attachment-icon">${attachmentIcon(attachment)}</span><div><strong>${name}</strong><small>${size || contentType}</small></div><div class="dc-attachment-actions"><button type="button" data-attachment-open="${id}">開く</button><button type="button" data-attachment-download="${id}" data-attachment-name="${name}">保存</button></div></div>`;
  }

  function revokeAttachmentObjectUrls() {
    for (const url of state.attachmentObjectUrls.values()) {
      try { URL.revokeObjectURL(url); } catch (_) {}
    }
    state.attachmentObjectUrls.clear();
  }

  async function fetchAttachmentBlob(attachmentId, download = false) {
    if (!state.token) throw new Error("ログインセッションがありません。");
    const id = text(attachmentId);
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("添付ファイルIDが不正です。");

    const response = await fetch(
      `${apiBase()}/api/contact/attachments/${encodeURIComponent(id)}${download ? "?download=1" : ""}`,
      {
        headers: { authorization: `Bearer ${state.token}` },
        cache: "no-store",
      }
    );

    if (response.status === 401) {
      stopAutoRefresh();
      state.token = "";
      show("authRequired");
      throw Object.assign(new Error("ログインの有効期限が切れました。"), { handled: true });
    }
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.message || data.error || `HTTP ${response.status}`);
    }
    return response.blob();
  }

  async function hydrateAttachmentPreviews() {
    const previewButtons = Array.from(document.querySelectorAll(".dc-attachment-image[data-attachment-open]"));
    for (const button of previewButtons) {
      const id = text(button.dataset.attachmentOpen);
      const img = button.querySelector("img");
      const label = button.querySelector("span");
      if (!id || !img || state.attachmentObjectUrls.has(id)) continue;
      try {
        const blob = await fetchAttachmentBlob(id, false);
        if (!blob.type.startsWith("image/")) continue;
        const url = URL.createObjectURL(blob);
        state.attachmentObjectUrls.set(id, url);
        img.src = url;
        button.classList.remove("dc-attachment-image--loading");
        if (label) label.remove();
      } catch (error) {
        button.classList.remove("dc-attachment-image--loading");
        button.classList.add("dc-attachment-image--error");
        if (label) label.textContent = error?.handled ? "画像を表示できません" : "画像を読み込めません";
      }
    }
  }

  async function openAttachment(attachmentId) {
    const id = text(attachmentId);
    const existing = state.attachmentObjectUrls.get(id);
    if (existing) {
      window.open(existing, "_blank", "noopener");
      return;
    }
    try {
      const blob = await fetchAttachmentBlob(id, false);
      const url = URL.createObjectURL(blob);
      state.attachmentObjectUrls.set(id, url);
      window.open(url, "_blank", "noopener");
    } catch (error) {
      if (!error?.handled) toast(`添付ファイルを開けませんでした：${error.message}`, true);
    }
  }

  async function downloadAttachment(attachmentId, fileName) {
    try {
      const blob = await fetchAttachmentBlob(attachmentId, true);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = text(fileName, "attachment");
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      if (!error?.handled) toast(`添付ファイルを保存できませんでした：${error.message}`, true);
    }
  }

  function renderMessages() {
    revokeAttachmentObjectUrls();
    const list = $("messageList");
    if (!list) return;
    list.innerHTML = "";

    for (const msg of state.messages) {
      const div = document.createElement("div");
      div.className = `dc-message ${msg.direction === "outbound" ? "outbound" : "inbound"}`;
      const deliveryNote = msg.direction === "outbound" && msg.deliveryStatus === "failed"
        ? " ・ 送信失敗"
        : "";
      const attachments = Array.isArray(msg.attachments) ? msg.attachments : [];
      div.innerHTML = `
        <p>${esc(msg.body || "")}</p>
        ${attachments.length ? `<div class="dc-message-attachments">${attachments.map(renderAttachmentHtml).join("")}</div>` : ""}
        <small>${formatDate(msg.occurredAt, true)}${msg.direction === "outbound" ? (threadChannelType() === "web" ? " ・ メール返信" : " ・ 返信") : ""}${deliveryNote}</small>
      `;
      list.appendChild(div);
    }

    requestAnimationFrame(() => {
      list.scrollTop = list.scrollHeight;
      hydrateAttachmentPreviews();
    });
  }

  async function submitReply(event) {
    event.preventDefault();
    const thread = state.selectedThread;

    if (thread && features().attachments && state.selectedFiles.length) {
      await submitAttachmentReply(thread);
      return;
    }

    if (thread && threadChannelType(thread) === "web") {
      await submitWebEmailReply(thread);
      return;
    }

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

  function fileSignature(files = state.selectedFiles) {
    return files.map((file) => `${file.name}:${file.size}:${file.lastModified}`).join("|");
  }

  function clearSelectedFiles() {
    state.selectedFiles = [];
    state.pendingAttachmentReply = null;
    if ($("attachmentInput")) $("attachmentInput").value = "";
    renderSelectedFiles();
  }

  function renderSelectedFiles() {
    const box = $("attachmentSelection");
    if (!box) return;
    const files = state.selectedFiles || [];
    box.classList.toggle("dc-hidden", !files.length);
    box.innerHTML = files.map((file, index) => `
      <span class="dc-selected-file"><b>📎 ${esc(file.name)}</b><small>${esc(formatBytes(file.size))}</small><button type="button" data-remove-attachment="${index}" aria-label="${esc(file.name)}を削除">×</button></span>
    `).join("");
  }

  function selectAttachments(event) {
    const input = event?.target;
    const picked = Array.from(input?.files || []);
    if (!picked.length) return;
    const maxFiles = num(CONFIG.attachments?.maxFiles, 3) || 3;
    const maxBytes = num(CONFIG.attachments?.maxFileBytes, 6 * 1024 * 1024) || 6 * 1024 * 1024;
    const next = [...state.selectedFiles];
    for (const file of picked) {
      if (next.length >= maxFiles) {
        toast(`添付は一度に${maxFiles}ファイルまでです。`, true);
        break;
      }
      if (!file.size || file.size > maxBytes) {
        toast(`${file.name} は${Math.round(maxBytes / 1024 / 1024)}MBを超えているため添付できません。`, true);
        continue;
      }
      next.push(file);
    }
    state.selectedFiles = next;
    if (input) input.value = "";
    renderSelectedFiles();
  }

  async function submitAttachmentReply(thread) {
    if (!thread || state.operator?.readOnly || !features().attachments || !state.selectedFiles.length) return;
    const channel = threadChannelType(thread);
    if (channel === "line" && (!features().line || !features().lineReply)) return;
    if (channel === "web" && (!features().web || !features().email)) return;

    const textValue = text($("replyText")?.value);
    const signature = `${thread.id}|${textValue}|${fileSignature()}`;
    if (!state.pendingAttachmentReply || state.pendingAttachmentReply.signature !== signature) {
      state.pendingAttachmentReply = { signature, clientRequestId: newClientRequestId() };
    }

    const form = new FormData();
    form.append("text", textValue);
    form.append("clientRequestId", state.pendingAttachmentReply.clientRequestId);
    for (const file of state.selectedFiles) form.append("files", file, file.name);

    const button = $("sendButton");
    const original = button?.textContent || (channel === "web" ? "メールで返信" : "LINEへ返信");
    if (button) { button.disabled = true; button.textContent = "添付送信中…"; }
    if ($("attachmentButton")) $("attachmentButton").disabled = true;

    try {
      await contactApiForm(`/api/contact/threads/${encodeURIComponent(thread.id)}/attachments`, form);
      if ($("replyText")) $("replyText").value = "";
      clearSelectedFiles();
      toast(channel === "web" ? "添付資料をメールで送信しました。" : "添付資料をLINEへ送信しました。");
      await loadAll({ keepSelection: true, silent: true });
    } catch (error) {
      if (!error?.handled) toast(`添付資料を送信できませんでした：${error.message}`, true);
    } finally {
      if (button) button.textContent = original;
      applyComposerMode(thread);
    }
  }

  function newClientRequestId() {
    if (crypto?.randomUUID) return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  async function submitWebEmailReply(thread) {
    if (
      !thread ||
      threadChannelType(thread) !== "web" ||
      state.operator?.readOnly ||
      !features().web ||
      !features().email
    ) return;

    const textValue = text($("replyText")?.value);
    if (!textValue) return;

    if (!state.pendingWebReply || state.pendingWebReply.text !== textValue) {
      state.pendingWebReply = {
        text: textValue,
        clientRequestId: newClientRequestId(),
      };
    }

    const button = $("sendButton");
    const original = button?.textContent || "メールで返信";
    if (button) {
      button.disabled = true;
      button.textContent = "送信中…";
    }

    try {
      await contactApi(`/api/contact/threads/${encodeURIComponent(thread.id)}/email-reply`, {
        method: "POST",
        body: JSON.stringify({
          text: textValue,
          clientRequestId: state.pendingWebReply.clientRequestId,
        }),
      });
      state.pendingWebReply = null;
      if ($("replyText")) $("replyText").value = "";
      toast("メールで返信しました。");
      await loadAll({ keepSelection: true, silent: true });
    } catch (error) {
      if (!error?.handled) toast(`メール送信できませんでした：${error.message}`, true);
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
  $("messageList")?.addEventListener("click", (event) => {
    const openButton = event.target.closest?.("[data-attachment-open]");
    if (openButton) {
      event.preventDefault();
      openAttachment(openButton.dataset.attachmentOpen);
      return;
    }
    const downloadButton = event.target.closest?.("[data-attachment-download]");
    if (downloadButton) {
      event.preventDefault();
      downloadAttachment(downloadButton.dataset.attachmentDownload, downloadButton.dataset.attachmentName || "attachment");
    }
  });

  $("attachmentButton")?.addEventListener("click", () => $("attachmentInput")?.click());
  $("attachmentInput")?.addEventListener("change", selectAttachments);
  $("attachmentSelection")?.addEventListener("click", (event) => {
    const button = event.target.closest?.("[data-remove-attachment]");
    if (!button) return;
    const index = Number(button.dataset.removeAttachment);
    if (!Number.isInteger(index) || index < 0) return;
    state.selectedFiles.splice(index, 1);
    state.pendingAttachmentReply = null;
    renderSelectedFiles();
  });
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
