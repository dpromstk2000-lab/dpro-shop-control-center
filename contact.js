(() => {
  "use strict";

  const CONFIG = window.DPRO_CONTROL_CENTER_CONFIG || {};
  const MAIN_API = String(CONFIG.apiBaseUrl || "").replace(/\/$/, "");
  const CONTACT_API = String(CONFIG.contactApiBaseUrl || "https://dpro-shop-contact-api.dpromstk2000.workers.dev").replace(/\/$/, "");
  const $ = (id) => document.getElementById(id);

  const state = {
    supabase: null,
    session: null,
    staff: null,
    threads: [],
    selectedThread: null,
    messages: [],
  };

  const roleLabels = {
    owner_admin: "管理責任者",
    support: "DPROサポート",
    technical_admin: "技術管理者",
    read_only: "閲覧専用",
  };

  function show(id) {
    ["loading", "authRequired", "errorScreen", "app"].forEach((key) => $(key)?.classList.toggle("hidden", key !== id));
  }

  function toast(message, error = false) {
    const el = $("toast");
    el.textContent = message;
    el.classList.toggle("error", error);
    el.classList.remove("hidden");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.add("hidden"), 3200);
  }

  function waitSupabase() {
    return new Promise((resolve, reject) => {
      let n = 0;
      const timer = setInterval(() => {
        n += 1;
        if (window.supabase?.createClient) {
          clearInterval(timer);
          resolve();
        } else if (n > 100) {
          clearInterval(timer);
          reject(new Error("Supabaseライブラリを読み込めませんでした。"));
        }
      }, 60);
    });
  }

  async function mainApi(path) {
    const response = await fetch(`${MAIN_API}${path}`, { headers: { "content-type": "application/json" } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || data.error || `HTTP ${response.status}`);
    return data;
  }

  async function contactApi(path, options = {}) {
    if (!state.session?.access_token) throw new Error("ログインセッションがありません。");
    const response = await fetch(`${CONTACT_API}${path}`, {
      ...options,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${state.session.access_token}`,
        ...(options.headers || {}),
      },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || data.error || `HTTP ${response.status}`);
    return data;
  }

  async function initializeAuth() {
    const apiConfig = await mainApi("/api/public-config");
    await waitSupabase();
    state.supabase = window.supabase.createClient(
      apiConfig.supabaseUrl,
      apiConfig.supabasePublishableKey || apiConfig.supabaseAnonKey,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
          storageKey: apiConfig.sessionStorageKey || "dpro-control-center-auth-v1",
        },
      }
    );

    const { data } = await state.supabase.auth.getSession();
    state.session = data?.session || null;
    if (!state.session) return false;

    const { data: staff, error } = await state.supabase
      .from("cc_staff")
      .select("id,display_name,role_key,status")
      .eq("auth_user_id", state.session.user.id)
      .maybeSingle();

    if (error || !staff || staff.status !== "active") return false;
    state.staff = staff;
    $("staffName").textContent = staff.display_name || "DPRO管理者";
    $("staffRole").textContent = roleLabels[staff.role_key] || staff.role_key || "";
    $("staffInitial").textContent = (staff.display_name || "D").slice(0, 1);
    if (staff.role_key === "read_only") {
      $("replyText").disabled = true;
      $("sendButton").disabled = true;
      $("replyText").placeholder = "閲覧専用アカウントでは返信できません";
    }
    return true;
  }

  async function loadAll({ keepSelection = true } = {}) {
    const selectedId = keepSelection ? state.selectedThread?.id : null;
    const [summary, threadData] = await Promise.all([
      contactApi("/api/contact/summary"),
      contactApi(buildThreadPath()),
    ]);

    $("metricUnread").textContent = summary.unread ?? 0;
    $("metricOpen").textContent = summary.openThreads ?? 0;
    $("metricToday").textContent = summary.todayThreads ?? 0;
    $("metricClosed").textContent = summary.closedThreads ?? 0;

    state.threads = threadData.threads || [];
    renderThreads();

    if (selectedId) {
      const same = state.threads.find((t) => t.id === selectedId);
      if (same) await selectThread(same, { markRead: false });
    }
  }

  function buildThreadPath() {
    const params = new URLSearchParams();
    const status = $("statusFilter").value;
    if (status !== "all") params.set("status", status);
    if ($("unreadOnly").checked) params.set("unread", "1");
    const qs = params.toString();
    return `/api/contact/threads${qs ? `?${qs}` : ""}`;
  }

  function filteredThreads() {
    const q = $("threadSearch").value.trim().toLowerCase();
    if (!q) return state.threads;
    return state.threads.filter((t) =>
      `${t.displayName || ""} ${t.lastMessage || ""} ${t.userKey || ""}`.toLowerCase().includes(q)
    );
  }

  function renderThreads() {
    const list = $("threadList");
    const rows = filteredThreads();
    if (!rows.length) {
      list.innerHTML = `<div class="thread-empty">現在表示できるLINE問い合わせはありません。</div>`;
      return;
    }
    list.innerHTML = "";
    for (const thread of rows) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `thread-item${state.selectedThread?.id === thread.id ? " active" : ""}`;
      const name = thread.displayName || `LINEユーザー ${thread.userKey || ""}`;
      const initial = name.slice(0, 1) || "L";
      button.innerHTML = `
        <span class="avatar">${esc(initial)}</span>
        <span class="thread-body">
          <span class="thread-name"><strong>${esc(name)}</strong>${thread.unreadCount ? `<span class="badge">${thread.unreadCount}</span>` : ""}</span>
          <span class="thread-preview">${thread.lastMessageDirection === "outbound" ? "返信: " : ""}${esc(thread.lastMessage || "メッセージなし")}</span>
        </span>
        <time>${shortTime(thread.lastMessageAt)}</time>
      `;
      button.addEventListener("click", () => selectThread(thread));
      list.appendChild(button);
    }
  }

  async function selectThread(thread, { markRead = true } = {}) {
    state.selectedThread = thread;
    renderThreads();
    $("emptyConversation").classList.add("hidden");
    $("conversation").classList.remove("hidden");

    const name = thread.displayName || `LINEユーザー ${thread.userKey || ""}`;
    $("conversationName").textContent = name;
    $("conversationMeta").textContent = `${thread.status === "closed" ? "対応完了" : "対応中"} / 最終更新 ${formatDate(thread.lastMessageAt)}`;
    $("statusButton").textContent = thread.status === "closed" ? "対応を再開" : "対応完了にする";

    const data = await contactApi(`/api/contact/threads/${encodeURIComponent(thread.id)}/messages`);
    state.messages = data.messages || [];
    renderMessages();

    if (markRead && thread.unreadCount > 0) {
      await contactApi(`/api/contact/threads/${encodeURIComponent(thread.id)}/read`, { method: "POST", body: "{}" });
      thread.unreadCount = 0;
      renderThreads();
      const summary = await contactApi("/api/contact/summary");
      $("metricUnread").textContent = summary.unread ?? 0;
    }
  }

  function renderMessages() {
    const list = $("messageList");
    list.innerHTML = "";
    for (const msg of state.messages) {
      const div = document.createElement("div");
      div.className = `message ${msg.direction === "outbound" ? "outbound" : "inbound"}`;
      div.innerHTML = `<p>${esc(msg.body || "")}</p><small>${formatDate(msg.occurredAt, true)}${msg.direction === "outbound" ? " ・ DPRO返信" : ""}</small>`;
      list.appendChild(div);
    }
    requestAnimationFrame(() => { list.scrollTop = list.scrollHeight; });
  }

  async function submitReply(event) {
    event.preventDefault();
    const thread = state.selectedThread;
    if (!thread) return;
    const text = $("replyText").value.trim();
    if (!text) return;
    const button = $("sendButton");
    button.disabled = true;
    const original = button.textContent;
    button.textContent = "送信中…";
    try {
      await contactApi(`/api/contact/threads/${encodeURIComponent(thread.id)}/reply`, {
        method: "POST",
        body: JSON.stringify({ text }),
      });
      $("replyText").value = "";
      toast("LINEへ返信しました。");
      await loadAll();
    } catch (e) {
      toast(`送信できませんでした：${e.message}`, true);
    } finally {
      button.textContent = original;
      button.disabled = state.staff?.role_key === "read_only";
    }
  }

  async function toggleStatus() {
    const thread = state.selectedThread;
    if (!thread) return;
    const status = thread.status === "closed" ? "open" : "closed";
    try {
      await contactApi(`/api/contact/threads/${encodeURIComponent(thread.id)}/status`, {
        method: "POST",
        body: JSON.stringify({ status }),
      });
      thread.status = status;
      toast(status === "closed" ? "対応完了にしました。" : "対応を再開しました。");
      await loadAll();
    } catch (e) {
      toast(`状態を変更できませんでした：${e.message}`, true);
    }
  }

  async function boot() {
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
    } catch (e) {
      $("errorText").textContent = `${e.message}。SQL・Contact Worker・Secrets・Webhook設定を確認してください。`;
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

  function formatDate(value, timeOnly = false) {
    if (!value) return "—";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    return new Intl.DateTimeFormat("ja-JP", timeOnly
      ? { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }
      : { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }
    ).format(d);
  }

  function shortTime(value) {
    if (!value) return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    return new Intl.DateTimeFormat("ja-JP", sameDay
      ? { hour: "2-digit", minute: "2-digit" }
      : { month: "numeric", day: "numeric" }
    ).format(d);
  }

  $("replyForm")?.addEventListener("submit", submitReply);
  $("statusButton")?.addEventListener("click", toggleStatus);
  $("refreshButton")?.addEventListener("click", () => loadAll().catch((e) => toast(e.message, true)));
  $("retryButton")?.addEventListener("click", boot);
  $("threadSearch")?.addEventListener("input", renderThreads);
  $("unreadOnly")?.addEventListener("change", () => loadAll({ keepSelection: false }).catch((e) => toast(e.message, true)));
  $("statusFilter")?.addEventListener("change", () => loadAll({ keepSelection: false }).catch((e) => toast(e.message, true)));
  $("menuButton")?.addEventListener("click", () => $("sidebar")?.classList.toggle("open"));
  document.addEventListener("click", (event) => {
    if (window.innerWidth > 760) return;
    if (!$("sidebar")?.classList.contains("open")) return;
    if ($("sidebar").contains(event.target) || event.target === $("menuButton")) return;
    $("sidebar").classList.remove("open");
  });

  boot();
})();
