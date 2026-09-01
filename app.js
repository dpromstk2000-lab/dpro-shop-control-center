(() => {
  "use strict";

  const CONFIG = window.DPRO_CONTROL_CENTER_CONFIG || {};
  const $ = (id) => document.getElementById(id);
  const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));

  const state = {
    apiConfig: null,
    supabase: null,
    session: null,
    user: null,
    staff: null,
    mfaFactorId: null,
    mfaEnrollFactorId: null,
    clients: [],
    dashboard: null,
    pendingTasks: [],
    currentView: "dashboard",
    lineTab: "accounts",
    lineOps: { summary: null, accounts: [], campaigns: [], assets: [], richMenus: [], coupons: [], shopCards: [], events: [], sites: [] },
    infraTab: "systems",
    infrastructure: { summary:null, systems:[], supabase:[], workers:[], github:[], releases:[], health:[], clients:[], sites:[] },
    infraEditor: null,
    securityTab: "resets",
    security: { summary: null, resets: [], access: [], audit: [], systems: [] },
    securityEditor: null,
    websiteTab: "sites",
    website: { summary: null, items: [], history: [] },
    websiteEditor: null,
    websiteAutoSyncDone: false,
    productTab: "catalog",
    product: { summary:null, products:[], standard:null, policy:null },
    productEditor: null,
  };

  const roleLabels = {
    owner_admin: "管理責任者",
    support: "DPROサポート",
    technical_admin: "技術管理者",
    read_only: "閲覧専用",
  };
  const clientStatusLabels = { prospect: "見込み", onboarding: "準備中", active: "運用中", paused: "一時停止", ended: "終了" };
  const ownerResponseLabels = { none: "確認なし", waiting: "回答待ち", received: "回答済み", overdue: "回答期限超過" };
  const taskStatusLabels = { todo: "未着手", in_progress: "対応中", waiting_client: "オーナー回答待ち", waiting_internal: "社内確認待ち", scheduled: "予定済み", done: "完了", cancelled: "中止" };
  const priorityLabels = { low: "低", normal: "通常", high: "高", urgent: "緊急", critical: "最重要" };
  const systemStatusLabels = { planned: "計画", preparing: "準備中", active: "稼働中", degraded: "要確認", paused: "停止中", ended: "終了" };
  const resetStatusLabels = { requested:"申請中",approved:"承認済み",issued:"発行済み",used:"使用済み",completed:"変更完了",expired:"期限切れ",revoked:"解除",cancelled:"取消",failed:"失敗" };
  const accessStatusLabels = { requested:"申請中",approved:"承認済み",active:"有効",expired:"期限切れ",revoked:"解除",denied:"却下" };
  const accessScopeLabels = { metadata_only:"安全な集計情報",system_check:"system-check要約" };
  const deliveryLabels = { phone:"電話",line:"LINE",email:"メール",in_person:"対面",other:"その他" };
  const websitePublicationLabels = { preparing:"準備中",public:"公開中",private:"非公開",paused:"一時停止",ended:"終了" };
  const websiteSyncLabels = { not_configured:"未設定",disabled:"停止",pending:"確認待ち",ok:"正常",warning:"要確認",error:"異常" };
  const websitePlatformLabels = { github_pages:"GitHub Pages",cloudflare_pages:"Cloudflare Pages",google_sites:"Google Sites",other:"その他" };
  const lineCampaignStatusLabels = { idea:"アイデア",draft:"下書き",copy_work:"原稿作成",image_work:"画像作成",internal_review:"社内確認",client_review:"オーナー確認",approved:"承認済み",scheduled:"配信予定",delivered:"配信済み",cancelled:"中止",overdue:"期限超過",waiting_client:"承認待ち" };
  const lineApprovalLabels = { not_required:"承認不要",not_requested:"未依頼",waiting:"オーナー承認待ち",approved:"承認済み",changes_requested:"修正依頼" };
  const lineAssetStatusLabels = { draft:"下書き",in_progress:"制作中",internal_review:"社内確認",client_review:"オーナー確認",approved:"承認済み",in_use:"使用中",archived:"保管" };
  const lineItemStatusLabels = { draft:"下書き",designing:"制作中",internal_review:"社内確認",client_review:"オーナー確認",approved:"承認済み",scheduled:"開始予定",active:"運用中",inactive:"停止中",expired:"期限終了",stopped:"停止",archived:"保管" };
  const lineEventLabels = { call:"電話",line:"LINE",email:"メール",meeting:"打合せ",note:"メモ",status_change:"状態変更",delivery:"配信",approval:"承認",design:"制作",settings:"設定",other:"その他" };

  const productIntegrationLabels = {
    not_assessed:"未評価",cataloged:"台帳登録",adapter_planned:"適用計画",adapter_ready:"アダプター準備済み",
    demo_connected:"デモ連動済み",production_ready:"本番連動済み",deferred_until_contract:"契約時対応",needs_review:"要確認"
  };
  const rolloutStatusLabels = { waiting_contract:"契約待ち",planned:"計画",in_progress:"対応中",ready:"適用準備済み",completed:"完了",on_hold:"保留" };

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function safeUrl(value) {
    try {
      const url = new URL(String(value || ""));
      return ["https:", "http:"].includes(url.protocol) ? url.href : "";
    } catch { return ""; }
  }

  function showOnly(id) {
    ["loadingScreen", "bootstrapScreen", "loginScreen", "mfaEnrollScreen", "mfaChallengeScreen", "appShell"]
      .forEach((screenId) => $(screenId)?.classList.toggle("hidden", screenId !== id));
  }

  function setLoading(text) {
    $("loadingText").textContent = text || "処理しています…";
    showOnly("loadingScreen");
  }

  function setMessage(id, message, success = false) {
    const element = $(id);
    if (!element) return;
    element.textContent = message || "";
    element.classList.toggle("success", success);
  }

  function setBusy(button, busy, busyText) {
    if (!button) return;
    if (busy) {
      button.dataset.originalText = button.textContent;
      button.textContent = busyText || "処理中…";
      button.disabled = true;
    } else {
      button.textContent = button.dataset.originalText || button.textContent;
      button.disabled = false;
    }
  }

  function toast(message, error = false) {
    const element = $("toast");
    element.textContent = message;
    element.classList.toggle("error", error);
    element.classList.remove("hidden");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => element.classList.add("hidden"), 3600);
  }

  function formatDate(value, includeTime = false) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat("ja-JP", includeTime
      ? { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }
      : { year: "numeric", month: "2-digit", day: "2-digit" }
    ).format(date);
  }

  function currency(value) {
    if (value === null || value === undefined || value === "") return "—";
    return `${Number(value).toLocaleString("ja-JP")}円`;
  }

  function pill(text, tone = "") {
    return `<span class="pill ${tone}">${escapeHtml(text)}</span>`;
  }

  function statusTone(status) {
    if (["active", "ok", "public", "configured", "granted", "done", "resolved", "closed", "received"].includes(status)) return "green";
    if (["preparing", "onboarding", "pending", "scheduled", "in_progress", "requested"].includes(status)) return "blue";
    if (["waiting", "waiting_client", "waiting_internal", "warning", "needs_update", "overdue", "degraded"].includes(status)) return "amber";
    if (["error", "urgent", "critical", "revoked", "ended"].includes(status)) return "red";
    return "";
  }

  async function api(path, options = {}) {
    const base = String(CONFIG.apiBaseUrl || "").replace(/\/$/, "");
    const response = await fetch(`${base}${path}`, {
      ...options,
      headers: { "content-type": "application/json", ...(options.headers || {}) },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.message || data.error || `HTTP ${response.status}`);
      error.data = data;
      error.status = response.status;
      throw error;
    }
    return data;
  }

  function waitForSupabase() {
    return new Promise((resolve, reject) => {
      let attempts = 0;
      const timer = setInterval(() => {
        attempts += 1;
        if (window.supabase?.createClient) {
          clearInterval(timer);
          resolve();
        } else if (attempts > 100) {
          clearInterval(timer);
          reject(new Error("Supabase接続ライブラリを読み込めませんでした。"));
        }
      }, 60);
    });
  }

  async function initializeClient() {
    state.apiConfig = await api("/api/public-config");
    await waitForSupabase();
    state.supabase = window.supabase.createClient(
      state.apiConfig.supabaseUrl,
      state.apiConfig.supabasePublishableKey || state.apiConfig.supabaseAnonKey,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
          storageKey: state.apiConfig.sessionStorageKey || "dpro-control-center-auth-v1",
        },
      },
    );
    $("sideVersion").textContent = `${CONFIG.version || ""} / ${state.apiConfig.databaseVersion || "DB未確認"}`;
  }

  async function bootstrapStatus() {
    return api("/api/bootstrap/status");
  }

  async function currentStaff(userId) {
    const { data, error } = await state.supabase
      .from("cc_staff")
      .select("id,auth_user_id,staff_code,display_name,email,role_key,status,mfa_required,last_login_at")
      .eq("auth_user_id", userId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async function updateLastLogin() {
    if (!state.staff?.id) return;
    await state.supabase
      .from("cc_staff")
      .update({ last_login_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", state.staff.id);
  }

  async function evaluateAuthentication() {
    const { data: sessionData } = await state.supabase.auth.getSession();
    state.session = sessionData?.session || null;
    state.user = state.session?.user || null;
    if (!state.session || !state.user) {
      const bootstrap = await bootstrapStatus();
      showOnly(bootstrap.bootstrapAvailable ? "bootstrapScreen" : "loginScreen");
      return;
    }

    const { data: aalData, error: aalError } = await state.supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aalError) throw aalError;

    // CONTROL-CENTER-4ではDB側もAAL2を必須にするため、
    // スタッフ情報を読む前に二段階認証を完了させます。
    if (aalData.currentLevel !== "aal2") {
      if (aalData.nextLevel === "aal2") {
        await prepareMfaChallenge();
      } else {
        await prepareMfaEnrollment();
      }
      return;
    }

    state.staff = await currentStaff(state.user.id);
    if (!state.staff || state.staff.status !== "active") {
      await state.supabase.auth.signOut();
      throw new Error("このアカウントには有効なDPROスタッフ権限がありません。");
    }
    await enterApplication();
  }

  async function prepareMfaEnrollment() {
    setLoading("二段階認証の初回設定を準備しています…");
    const { data: factorsData } = await state.supabase.auth.mfa.listFactors();
    const allFactors = factorsData?.all || [];
    for (const factor of allFactors.filter((item) => item.status === "unverified")) {
      await state.supabase.auth.mfa.unenroll({ factorId: factor.id }).catch(() => null);
    }

    const { data, error } = await state.supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "DPRO SHOP CONTROL CENTER",
    });
    if (error) throw error;
    state.mfaEnrollFactorId = data.id;
    $("mfaQr").src = data.totp.qr_code;
    $("mfaSecret").value = data.totp.secret || "";
    $("mfaEnrollCode").value = "";
    setMessage("mfaEnrollMessage", "");
    showOnly("mfaEnrollScreen");
  }

  async function prepareMfaChallenge() {
    const { data, error } = await state.supabase.auth.mfa.listFactors();
    if (error) throw error;
    const factors = (data?.totp || []).filter((factor) => factor.status === "verified");
    if (!factors.length) {
      await prepareMfaEnrollment();
      return;
    }
    state.mfaFactorId = factors[0].id;
    $("mfaChallengeCode").value = "";
    setMessage("mfaChallengeMessage", "");
    showOnly("mfaChallengeScreen");
    setTimeout(() => $("mfaChallengeCode")?.focus(), 80);
  }

  async function enterApplication() {
    setLoading("顧客台帳を読み込んでいます…");
    await updateLastLogin();
    $("staffName").textContent = state.staff.display_name;
    $("staffRole").textContent = roleLabels[state.staff.role_key] || state.staff.role_key;
    $("staffInitial").textContent = (state.staff.display_name || "D").slice(0, 1);
    showOnly("appShell");
    await loadClients();
    await loadDashboard();
    activateView("dashboard");
  }

  async function signOut() {
    setLoading("安全にログアウトしています…");
    await state.supabase?.auth.signOut();
    state.session = null;
    state.user = null;
    state.staff = null;
    showOnly("loginScreen");
  }

  async function loadDashboard() {
    const [summaryResult, taskResult] = await Promise.all([
      state.supabase.from("cc_v_dashboard_summary").select("*").single(),
      state.supabase.from("cc_v_pending_work").select("*").order("due_at", { ascending: true, nullsFirst: false }).limit(8),
    ]);
    if (summaryResult.error) throw summaryResult.error;
    if (taskResult.error) throw taskResult.error;
    state.dashboard = summaryResult.data;
    state.pendingTasks = taskResult.data || [];
    renderMetrics();
    renderDashboardTasks();
    renderDashboardClients();
  }

  function renderMetrics() {
    const d = state.dashboard || {};
    const metrics = [
      [d.active_clients, "運用中の顧客", "全契約サービス", ""],
      [d.active_line_accounts, "LINE公式運用", "アカウント数", ""],
      [d.active_systems, "DPROシステム", "稼働・要確認", d.unhealthy_systems ? "warning" : ""],
      [d.public_websites, "公開ホームページ", "公開中", ""],
      [d.open_tasks, "未完了タスク", `回答待ち ${d.waiting_client_tasks || 0}件`, d.waiting_client_tasks ? "warning" : ""],
      [d.open_support_cases, "サポート案件", "未解決", d.open_support_cases ? "warning" : ""],
      [d.unhealthy_systems, "システム異常", "警告・エラー", d.unhealthy_systems ? "danger" : ""],
      [d.sync_errors, "連動エラー", "ホームページ等", d.sync_errors ? "danger" : ""],
      [d.active_reset_requests, "コード復旧中", "申請・発行中", d.active_reset_requests ? "warning" : ""],
    ];
    $("metricGrid").innerHTML = metrics.map(([value, label, note, tone]) => `
      <article class="metric-card ${tone}"><b>${Number(value || 0).toLocaleString("ja-JP")}</b><span>${escapeHtml(label)}</span><small>${escapeHtml(note)}</small></article>
    `).join("");
  }

  function renderDashboardTasks() {
    const rows = state.pendingTasks.slice(0, 6);
    $("dashboardTasks").innerHTML = rows.length ? rows.map((task) => `
      <article class="list-item">
        <div class="list-item-main"><strong>${escapeHtml(task.title)}</strong><p>${escapeHtml(task.client_name || "DPRO内部")}・${escapeHtml(task.task_code)}</p></div>
        <div class="list-item-meta">${pill(taskStatusLabels[task.status] || task.status, statusTone(task.status))}<p>${task.due_at ? formatDate(task.due_at, true) : "期限なし"}</p></div>
      </article>
    `).join("") : '<div class="empty-state">現在、未完了タスクはありません。</div>';
  }

  function renderDashboardClients() {
    const clients = [...state.clients]
      .sort((a, b) => ((b.open_task_count || 0) + (b.owner_response_status === "waiting" ? 5 : 0)) - ((a.open_task_count || 0) + (a.owner_response_status === "waiting" ? 5 : 0)))
      .slice(0, 6);
    $("dashboardClients").innerHTML = clients.length ? clients.map((client) => `
      <button class="list-item" type="button" data-open-client="${client.id}">
        <div class="list-item-main"><strong>${escapeHtml(client.display_name)}</strong><p>${escapeHtml(client.client_code)}・未完了 ${client.open_task_count || 0}件</p></div>
        <div class="list-item-meta">${pill(ownerResponseLabels[client.owner_response_status] || client.owner_response_status, statusTone(client.owner_response_status))}</div>
      </button>
    `).join("") : '<div class="empty-state">顧客が登録されていません。</div>';
    bindClientOpenButtons($("dashboardClients"));
  }

  async function loadClients() {
    const { data, error } = await state.supabase
      .from("cc_v_client_overview")
      .select("*")
      .order("display_name", { ascending: true });
    if (error) throw error;
    state.clients = data || [];
    renderClientGrid();
  }

  function filteredClients() {
    const query = $("clientSearch").value.trim().toLowerCase();
    const status = $("clientStatusFilter").value;
    const service = $("clientServiceFilter").value;
    return state.clients.filter((client) => {
      if (query && !`${client.display_name} ${client.client_code} ${client.legal_name || ""} ${client.trade_name || ""}`.toLowerCase().includes(query)) return false;
      if (status !== "all" && client.status !== status) return false;
      if (service === "line_only" && !(client.line_account_count > 0 && client.system_count === 0 && client.website_count === 0)) return false;
      if (service === "line" && !(client.line_account_count > 0)) return false;
      if (service === "system" && !(client.system_count > 0)) return false;
      if (service === "website" && !(client.website_count > 0)) return false;
      if (service === "waiting" && !["waiting", "overdue"].includes(client.owner_response_status)) return false;
      return true;
    });
  }

  function renderClientGrid() {
    const clients = filteredClients();
    $("clientResultCount").textContent = `${clients.length}件`;
    $("clientGrid").innerHTML = clients.length ? clients.map((client) => `
      <article class="client-card">
        <div class="client-card-head"><div><span class="client-code">${escapeHtml(client.client_code)}</span><h2>${escapeHtml(client.display_name)}</h2></div>${pill(clientStatusLabels[client.status] || client.status, statusTone(client.status))}</div>
        <div class="service-badges">
          <span class="service-badge ${client.line_account_count ? "on" : ""}">LINE ${client.line_account_count || 0}</span>
          <span class="service-badge ${client.system_count ? "on" : ""}">SYSTEM ${client.system_count || 0}</span>
          <span class="service-badge ${client.website_count ? "on" : ""}">WEB ${client.website_count || 0}</span>
          ${client.is_demo ? '<span class="service-badge">DEMO</span>' : ""}
        </div>
        <div class="client-stats">
          <div class="mini-stat"><b>${client.active_site_count || 0}</b><span>拠点</span></div>
          <div class="mini-stat"><b>${client.open_task_count || 0}</b><span>タスク</span></div>
          <div class="mini-stat"><b>${client.open_support_case_count || 0}</b><span>サポート</span></div>
          <div class="mini-stat"><b>${client.owner_response_status === "waiting" ? "待" : client.owner_response_status === "overdue" ? "超" : "—"}</b><span>回答</span></div>
        </div>
        <button class="client-card-button" type="button" data-open-client="${client.id}">顧客詳細を開く</button>
      </article>
    `).join("") : '<div class="empty-state">条件に一致する顧客はありません。</div>';
    bindClientOpenButtons($("clientGrid"));
  }

  function bindClientOpenButtons(scope) {
    $$('[data-open-client]', scope).forEach((button) => {
      button.addEventListener("click", () => openClientDetail(button.dataset.openClient));
    });
  }

  async function openClientDetail(clientId) {
    setLoading("顧客情報を安全に読み込んでいます…");
    try {
      const tableQueries = [
        ["client", state.supabase.from("cc_clients").select("*").eq("id", clientId).single()],
        ["sites", state.supabase.from("cc_sites").select("*").eq("client_id", clientId).order("site_number")],
        ["contacts", state.supabase.from("cc_contacts").select("*").eq("client_id", clientId).order("is_primary", { ascending: false })],
        ["contracts", state.supabase.from("cc_contracts").select("*").eq("client_id", clientId).order("created_at", { ascending: false })],
        ["line", state.supabase.from("cc_line_accounts").select("*").eq("client_id", clientId).order("created_at")],
        ["systems", state.supabase.from("cc_system_instances").select("*").eq("client_id", clientId).order("created_at")],
        ["websites", state.supabase.from("cc_websites").select("*").eq("client_id", clientId).order("created_at")],
        ["tasks", state.supabase.from("cc_tasks").select("*").eq("client_id", clientId).order("created_at", { ascending: false }).limit(20)],
        ["support", state.supabase.from("cc_support_cases").select("*").eq("client_id", clientId).order("created_at", { ascending: false }).limit(20)],
        ["supabaseProjects", state.supabase.from("cc_supabase_projects").select("*").eq("client_id", clientId).order("created_at")],
        ["workers", state.supabase.from("cc_workers").select("*").eq("client_id", clientId).order("created_at")],
        ["repositories", state.supabase.from("cc_github_repositories").select("*").eq("client_id", clientId).order("created_at")],
      ];
      const results = await Promise.all(tableQueries.map(([, promise]) => promise));
      const detail = {};
      results.forEach((result, index) => {
        if (result.error) throw result.error;
        detail[tableQueries[index][0]] = result.data;
      });

      const contractIds = (detail.contracts || []).map((item) => item.id);
      let contractItems = [];
      if (contractIds.length) {
        const { data, error } = await state.supabase.from("cc_contract_items").select("*").in("contract_id", contractIds);
        if (error) throw error;
        contractItems = data || [];
      }
      const { data: services, error: serviceError } = await state.supabase.from("cc_service_catalog").select("*").order("sort_order");
      if (serviceError) throw serviceError;
      detail.contractItems = contractItems;
      detail.services = services || [];
      renderClientDetail(detail);
      showOnly("appShell");
      activateView("client-detail");
    } catch (error) {
      showOnly("appShell");
      toast(error.message || "顧客情報を取得できませんでした。", true);
    }
  }

  function detailRecord(title, subtitle, status, links = []) {
    return `<article class="record"><div class="record-head"><strong>${escapeHtml(title)}</strong>${status ? pill(status.text, status.tone) : ""}</div>${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ""}${links.length ? `<div class="record-actions">${links.map((link) => `<a class="small-link" href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(link.label)}</a>`).join("")}</div>` : ""}</article>`;
  }

  function renderClientDetail(detail) {
    const c = detail.client;
    const serviceMap = new Map((detail.services || []).map((service) => [service.id, service]));
    const contractItemsByContract = new Map();
    (detail.contractItems || []).forEach((item) => {
      const list = contractItemsByContract.get(item.contract_id) || [];
      list.push(item);
      contractItemsByContract.set(item.contract_id, list);
    });

    const siteHtml = (detail.sites || []).map((site) => detailRecord(
      site.site_name,
      `${site.site_code}・${site.address || "住所未登録"}・担当 ${site.manager_name || "未登録"}`,
      { text: site.status === "active" ? "運用中" : site.status, tone: statusTone(site.status) },
    )).join("") || '<p class="empty-state">拠点は未登録です。</p>';

    const contactHtml = (detail.contacts || []).map((contact) => detailRecord(
      contact.display_name,
      `${contact.title || contact.contact_type}・${contact.email || "メール未登録"}・${contact.phone || "電話未登録"}`,
      contact.is_primary ? { text: "主担当", tone: "green" } : null,
    )).join("") || '<p class="empty-state">連絡先は未登録です。</p>';

    const contractHtml = (detail.contracts || []).map((contract) => {
      const items = contractItemsByContract.get(contract.id) || [];
      const names = items.map((item) => serviceMap.get(item.service_id)?.service_name || "サービス").join("、") || "サービス未登録";
      return detailRecord(
        contract.contract_name,
        `${contract.contract_code}・${names}・月額 ${currency(contract.monthly_fee_yen)}`,
        { text: contract.status === "active" ? "契約中" : contract.status, tone: statusTone(contract.status) },
      );
    }).join("") || '<p class="empty-state">契約は未登録です。</p>';

    const lineHtml = (detail.line || []).map((account) => detailRecord(
      account.account_name,
      `Basic ID ${account.basic_id || "未登録"}・権限 ${account.permission_status}・次回配信 ${formatDate(account.next_delivery_at, true)}`,
      { text: account.status === "active" ? "運用中" : account.status, tone: statusTone(account.status) },
      safeUrl(account.manager_url) ? [{ label: "LINE管理画面", url: safeUrl(account.manager_url) }] : [],
    )).join("") || '<p class="empty-state">LINE公式アカウントは未登録です。</p>';

    const systemHtml = (detail.systems || []).map((system) => detailRecord(
      system.system_name,
      `${system.system_code}・${system.facility_code}・Worker ${system.worker_version || "未確認"}・DB ${system.database_version || "未確認"}`,
      { text: systemStatusLabels[system.status] || system.status, tone: statusTone(system.status) },
      [
        ["管理画面", system.owner_url], ["お客様画面", system.member_url], ["Health", system.health_url], ["system-check", system.system_check_url],
      ].filter(([, url]) => safeUrl(url)).map(([label, url]) => ({ label, url: safeUrl(url) })),
    )).join("") || '<p class="empty-state">DPROシステムは未登録です。</p>';

    const websiteHtml = (detail.websites || []).map((website) => detailRecord(
      website.website_name,
      `${website.platform}・休日連動 ${website.holiday_sync_enabled ? "ON" : "OFF"}・お知らせ連動 ${website.announcement_sync_enabled ? "ON" : "OFF"}・最終同期 ${formatDate(website.last_sync_at, true)}`,
      { text: website.publication_status === "public" ? "公開中" : website.publication_status, tone: statusTone(website.publication_status) },
      safeUrl(website.public_url) ? [{ label: "ホームページ", url: safeUrl(website.public_url) }] : [],
    )).join("") || '<p class="empty-state">ホームページは未登録です。</p>';

    const taskHtml = (detail.tasks || []).map((task) => detailRecord(
      task.title,
      `${task.task_code}・期限 ${formatDate(task.due_at, true)}・${priorityLabels[task.priority] || task.priority}`,
      { text: taskStatusLabels[task.status] || task.status, tone: statusTone(task.status) },
    )).join("") || '<p class="empty-state">タスクはありません。</p>';

    const supportHtml = (detail.support || []).map((item) => detailRecord(
      item.subject,
      `${item.case_code}・${item.category}・期限 ${formatDate(item.due_at, true)}`,
      { text: item.status, tone: statusTone(item.status) },
    )).join("") || '<p class="empty-state">サポート案件はありません。</p>';

    const technical = [
      ...(detail.supabaseProjects || []).map((item) => detailRecord(`Supabase｜${item.project_name}`, `${item.project_ref}・所有 ${item.owner_type}・招待 ${item.invitation_status}`, { text: item.status, tone: statusTone(item.status) }, safeUrl(item.dashboard_url) ? [{ label: "Dashboard", url: safeUrl(item.dashboard_url) }] : [])),
      ...(detail.workers || []).map((item) => detailRecord(`Worker｜${item.worker_name}`, `${item.current_version || "バージョン未確認"}・最終確認 ${formatDate(item.last_checked_at, true)}`, { text: item.status, tone: statusTone(item.status) }, safeUrl(item.worker_url) ? [{ label: "Worker", url: safeUrl(item.worker_url) }] : [])),
      ...(detail.repositories || []).map((item) => detailRecord(`GitHub｜${item.repository_full_name}`, `${item.purpose}・${item.visibility}・最終Commit ${item.last_commit_sha || "未確認"}`, { text: item.status, tone: statusTone(item.status) }, safeUrl(item.repository_url) ? [{ label: "Repository", url: safeUrl(item.repository_url) }] : [])),
    ].join("") || '<p class="empty-state">技術接続情報は未登録です。</p>';

    $("clientDetail").innerHTML = `
      <section class="detail-hero"><div><span class="client-code">${escapeHtml(c.client_code)}</span><h1>${escapeHtml(c.display_name)}</h1><p>${escapeHtml(c.legal_name || c.trade_name || "法人・屋号未登録")}・次回確認 ${formatDate(c.next_review_on)}</p></div><div class="detail-tags">${pill(clientStatusLabels[c.status] || c.status)}${pill(ownerResponseLabels[c.owner_response_status] || c.owner_response_status)}${c.is_demo ? pill("DEMO") : ""}</div></section>
      <div class="detail-grid">
        <section class="detail-section"><h2>基本情報</h2><dl class="definition-grid">
          <div class="definition"><dt>契約名義</dt><dd>${escapeHtml(c.contract_name || "未登録")}</dd></div>
          <div class="definition"><dt>優先度</dt><dd>${escapeHtml(priorityLabels[c.priority] || c.priority)}</dd></div>
          <div class="definition"><dt>メール</dt><dd>${escapeHtml(c.main_email || "未登録")}</dd></div>
          <div class="definition"><dt>電話番号</dt><dd>${escapeHtml(c.main_phone || "未登録")}</dd></div>
          <div class="definition"><dt>契約開始</dt><dd>${formatDate(c.contract_started_on)}</dd></div>
          <div class="definition"><dt>契約終了</dt><dd>${formatDate(c.contract_ended_on)}</dd></div>
          <div class="definition"><dt>重要事項</dt><dd>${escapeHtml(c.important_note || "なし")}</dd></div>
          <div class="definition"><dt>内部メモ</dt><dd>${escapeHtml(c.internal_note || "なし")}</dd></div>
        </dl></section>
        <section class="detail-section"><h2>拠点</h2><div class="record-list">${siteHtml}</div></section>
        <section class="detail-section"><h2>担当者・連絡先</h2><div class="record-list">${contactHtml}</div></section>
        <section class="detail-section"><h2>契約・サービス</h2><div class="record-list">${contractHtml}</div></section>
        <section class="detail-section"><h2>LINE公式運用</h2><div class="record-list">${lineHtml}</div></section>
        <section class="detail-section"><h2>DPROシステム</h2><div class="record-list">${systemHtml}</div></section>
        <section class="detail-section"><h2>ホームページ</h2><div class="record-list">${websiteHtml}</div></section>
        <section class="detail-section"><h2>タスク・確認待ち</h2><div class="record-list">${taskHtml}</div></section>
        <section class="detail-section"><h2>サポート案件</h2><div class="record-list">${supportHtml}</div></section>
        <section class="detail-section full"><h2>技術接続情報</h2><div class="record-list">${technical}</div></section>
      </div>`;
  }

  function canEditLineOperations() {
    return ["owner_admin", "support", "technical_admin"].includes(state.staff?.role_key);
  }

  function lineAccountOptionHtml(selected = "", includeBlank = false) {
    const items = state.lineOps.accounts || [];
    return `${includeBlank ? '<option value="">選択してください</option>' : ''}${items.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === selected ? "selected" : ""}>${escapeHtml(item.client_name)}｜${escapeHtml(item.account_name)}</option>`).join("")}`;
  }

  function lineClientOptionHtml(selected = "") {
    return state.clients.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === selected ? "selected" : ""}>${escapeHtml(item.client_code)}｜${escapeHtml(item.display_name)}</option>`).join("");
  }

  function lineSiteOptionHtml(selected = "", clientId = "") {
    const sites = (state.lineOps.sites || []).filter((item) => !clientId || item.client_id === clientId);
    return `<option value="">拠点を指定しない</option>${sites.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === selected ? "selected" : ""}>${escapeHtml(item.site_code)}｜${escapeHtml(item.site_name)}</option>`).join("")}`;
  }

  function lineCampaignOptionHtml(selected = "", accountId = "") {
    const rows = (state.lineOps.campaigns || []).filter((item) => !accountId || item.line_account_id === accountId);
    return `<option value="">配信予定と紐付けない</option>${rows.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === selected ? "selected" : ""}>${escapeHtml(item.campaign_code)}｜${escapeHtml(item.title)}</option>`).join("")}`;
  }

  function dateTimeLocalValue(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
  }

  function isoOrNull(value) {
    const raw = String(value || "").trim();
    if (!raw) return null;
    const date = new Date(raw);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }

  function renderLineMetrics() {
    const d = state.lineOps.summary || {};
    const metrics = [
      [d.active_accounts, "運用中アカウント", "LINE公式", ""],
      [d.open_campaigns, "進行中の配信", `30日以内 ${d.scheduled_next_30d || 0}件`, ""],
      [d.waiting_client_approval, "オーナー承認待ち", "確認漏れ防止", d.waiting_client_approval ? "warning" : ""],
      [d.copy_in_progress, "原稿作成", "制作中", ""],
      [d.image_in_progress, "画像作成", "制作・確認中", ""],
      [d.active_coupons, "クーポン", "予定・運用中", ""],
      [d.active_shop_cards, "ショップカード", "予定・運用中", ""],
      [d.rich_menu_attention, "リッチメニュー要対応", "制作・承認", d.rich_menu_attention ? "warning" : ""],
      [d.followups_due, "期限到来の対応", d.next_delivery_at ? `次回配信 ${formatDate(d.next_delivery_at, true)}` : "次回配信なし", d.followups_due ? "danger" : ""],
    ];
    $("lineMetricGrid").innerHTML = metrics.map(([value, label, note, tone]) => `<article class="metric-card ${tone}"><b>${Number(value || 0).toLocaleString("ja-JP")}</b><span>${escapeHtml(label)}</span><small>${escapeHtml(note)}</small></article>`).join("");
  }

  function filteredLineRows(rows, { statusField = "status", approvalField = "owner_approval_status" } = {}) {
    const query = $("lineSearch").value.trim().toLowerCase();
    const accountId = $("lineAccountFilter").value;
    const status = $("lineCampaignStatusFilter").value;
    const approval = $("lineApprovalFilter").value;
    return (rows || []).filter((item) => {
      if (accountId !== "all" && item.line_account_id !== accountId && item.id !== accountId) return false;
      const haystack = `${item.client_name || ""} ${item.client_code || ""} ${item.account_name || ""} ${item.title || item.menu_name || item.coupon_name || item.card_name || item.subject || ""} ${item.campaign_code || item.asset_code || item.rich_menu_code || item.coupon_code || item.shop_card_code || item.event_code || ""}`.toLowerCase();
      if (query && !haystack.includes(query)) return false;
      if (status !== "all" && statusField && item[statusField] !== status) return false;
      if (approval !== "all" && approvalField && item[approvalField] !== approval) return false;
      return true;
    });
  }

  function renderLineAccounts() {
    const query = $("lineSearch").value.trim().toLowerCase();
    const filter = $("lineAccountFilter").value;
    const rows = (state.lineOps.accounts || []).filter((item) => {
      if (filter !== "all" && item.id !== filter) return false;
      return !query || `${item.client_name} ${item.client_code} ${item.account_name} ${item.basic_id || ""}`.toLowerCase().includes(query);
    });
    $("lineAccountBoard").innerHTML = rows.length ? rows.map((item) => `
      <article class="line-account-card">
        <div class="line-account-head"><div><span class="client-code">${escapeHtml(item.client_code)}</span><h2>${escapeHtml(item.client_name)}</h2><p>${escapeHtml(item.account_name)}・${escapeHtml(item.basic_id || "Basic ID未登録")}</p></div>${pill(item.status === "active" ? "運用中" : item.status, statusTone(item.status))}</div>
        <div class="line-status-grid">
          <div class="line-status-cell"><strong>権限</strong><span>${escapeHtml(item.permission_status)}</span></div>
          <div class="line-status-cell"><strong>あいさつ</strong><span>${escapeHtml(item.greeting_status)}</span></div>
          <div class="line-status-cell"><strong>リッチメニュー</strong><span>${escapeHtml(item.rich_menu_status)}</span></div>
          <div class="line-status-cell"><strong>クーポン</strong><span>${escapeHtml(item.coupon_status)}</span></div>
          <div class="line-status-cell"><strong>配信進行</strong><span>${item.open_campaign_count || 0}件</span></div>
          <div class="line-status-cell"><strong>承認待ち</strong><span>${item.waiting_approval_count || 0}件</span></div>
          <div class="line-status-cell"><strong>次回配信</strong><span>${formatDate(item.next_delivery_at, true)}</span></div>
          <div class="line-status-cell"><strong>要フォロー</strong><span>${item.due_followup_count || 0}件</span></div>
        </div>
        <div class="line-account-foot"><p>最終接続確認 ${formatDate(item.last_connection_check_at, true)}</p><div class="inline-actions">${safeUrl(item.manager_url) ? `<a class="mini-button" href="${escapeHtml(safeUrl(item.manager_url))}" target="_blank" rel="noopener noreferrer">LINE管理画面</a>` : ""}<button class="mini-button primary" type="button" data-line-edit="account" data-id="${item.id}" ${canEditLineOperations() ? "" : "disabled"}>設定を編集</button></div></div>
      </article>`).join("") : '<div class="empty-state">条件に一致するLINE公式アカウントはありません。</div>';
    bindLineEditButtons($("lineAccountBoard"));
  }

  function renderLineCampaigns() {
    const rows = filteredLineRows(state.lineOps.campaigns);
    $("lineCampaignBoard").innerHTML = `<table><thead><tr><th>配信</th><th>顧客・アカウント</th><th>進行</th><th>画像</th><th>オーナー承認</th><th>配信日時</th><th>原稿</th><th></th></tr></thead><tbody>${rows.map((item) => `<tr><td><span class="line-table-title">${escapeHtml(item.title)}</span><span class="line-table-sub">${escapeHtml(item.campaign_code)}・${escapeHtml(item.campaign_type)}</span></td><td>${escapeHtml(item.client_name)}<br><span class="line-table-sub">${escapeHtml(item.account_name)}</span></td><td>${pill(lineCampaignStatusLabels[item.operational_state || item.status] || item.status, statusTone(item.operational_state || item.status))}</td><td>${escapeHtml(item.image_status)}</td><td>${pill(lineApprovalLabels[item.owner_approval_status] || item.owner_approval_status, statusTone(item.owner_approval_status))}</td><td>${formatDate(item.scheduled_at, true)}</td><td class="message-preview">${escapeHtml((item.message_draft || "原稿未登録").slice(0, 120))}</td><td><button class="mini-button primary" type="button" data-line-edit="campaign" data-id="${item.id}" ${canEditLineOperations() ? "" : "disabled"}>編集</button></td></tr>`).join("") || '<tr><td colspan="8">配信予定はありません。</td></tr>'}</tbody></table>`;
    bindLineEditButtons($("lineCampaignBoard"));
  }

  function renderLineAssets() {
    const rows = filteredLineRows(state.lineOps.assets, { statusField: null });
    $("lineAssetBoard").innerHTML = `<table><thead><tr><th>制作物</th><th>顧客</th><th>種類</th><th>状態</th><th>承認</th><th>関連配信</th><th>外部URL</th><th></th></tr></thead><tbody>${rows.map((item) => `<tr><td><span class="line-table-title">${escapeHtml(item.title)}</span><span class="line-table-sub">${escapeHtml(item.asset_code)}・${escapeHtml(item.version_label || "版未設定")}</span></td><td>${escapeHtml(item.client_name)}</td><td>${escapeHtml(item.asset_type)}</td><td>${pill(lineAssetStatusLabels[item.status] || item.status, statusTone(item.status))}</td><td>${pill(lineApprovalLabels[item.owner_approval_status] || item.owner_approval_status, statusTone(item.owner_approval_status))}</td><td>${escapeHtml(item.campaign_code || "—")}<br><span class="line-table-sub">${escapeHtml(item.campaign_title || "")}</span></td><td>${safeUrl(item.external_url) ? `<a class="small-link" href="${escapeHtml(safeUrl(item.external_url))}" target="_blank" rel="noopener noreferrer">開く</a>` : "—"}</td><td><button class="mini-button primary" type="button" data-line-edit="asset" data-id="${item.id}" ${canEditLineOperations() ? "" : "disabled"}>編集</button></td></tr>`).join("") || '<tr><td colspan="8">制作物はありません。</td></tr>'}</tbody></table>`;
    bindLineEditButtons($("lineAssetBoard"));
  }

  function renderLineItemCards(targetId, rows, kind, nameKey, codeKey, periodStart, periodEnd) {
    const filtered = filteredLineRows(rows, { statusField: null });
    $(targetId).innerHTML = filtered.length ? filtered.map((item) => `<article class="summary-card"><div class="record-head"><h2>${escapeHtml(item[nameKey])}</h2>${pill(lineItemStatusLabels[item.status] || item.status, statusTone(item.status))}</div><p>${escapeHtml(item.client_name)}・${escapeHtml(item.account_name)}</p><p>${escapeHtml(item[codeKey])}・承認 ${escapeHtml(lineApprovalLabels[item.owner_approval_status] || item.owner_approval_status)}</p><p>期間 ${formatDate(item[periodStart], true)} ～ ${formatDate(item[periodEnd], true)}</p>${item.benefit_summary ? `<p>${escapeHtml(item.benefit_summary)}</p>` : item.layout_summary ? `<p>${escapeHtml(item.layout_summary)}</p>` : ""}<div class="record-actions">${safeUrl(item.external_url) ? `<a class="small-link" href="${escapeHtml(safeUrl(item.external_url))}" target="_blank" rel="noopener noreferrer">外部管理を開く</a>` : ""}<button class="mini-button primary" type="button" data-line-edit="${kind}" data-id="${item.id}" ${canEditLineOperations() ? "" : "disabled"}>編集</button></div></article>`).join("") : '<div class="empty-state">登録はありません。</div>';
    bindLineEditButtons($(targetId));
  }

  function renderLineHistory() {
    const rows = filteredLineRows(state.lineOps.events, { statusField: null, approvalField: null });
    $("lineHistoryBoard").innerHTML = rows.length ? rows.map((item) => `<article class="timeline-item"><div class="timeline-time">${formatDate(item.occurred_at, true)}<br>${escapeHtml(item.event_code)}</div><div class="timeline-body"><strong>${escapeHtml(lineEventLabels[item.event_type] || item.event_type)}｜${escapeHtml(item.subject)}</strong><p>${escapeHtml(item.client_name)}・${escapeHtml(item.account_name)}</p>${item.detail ? `<p>${escapeHtml(item.detail)}</p>` : ""}<small>${escapeHtml(item.actor_name || "自動記録")}</small></div>${item.follow_up_due_at ? `<div class="timeline-next">次回 ${formatDate(item.follow_up_due_at, true)}<br>${escapeHtml(item.next_action || "確認")}</div>` : ""}</article>`).join("") : '<div class="empty-state">対応履歴はありません。</div>';
  }

  function renderActiveLineTab() {
    if (state.lineTab === "accounts") renderLineAccounts();
    if (state.lineTab === "campaigns") renderLineCampaigns();
    if (state.lineTab === "assets") renderLineAssets();
    if (state.lineTab === "rich-menus") renderLineItemCards("lineRichMenuBoard", state.lineOps.richMenus, "rich-menu", "menu_name", "rich_menu_code", "active_from", "active_until");
    if (state.lineTab === "coupons") renderLineItemCards("lineCouponBoard", state.lineOps.coupons, "coupon", "coupon_name", "coupon_code", "valid_from", "valid_until");
    if (state.lineTab === "shop-cards") renderLineItemCards("lineShopCardBoard", state.lineOps.shopCards, "shop-card", "card_name", "shop_card_code", "valid_from", "valid_until");
    if (state.lineTab === "history") renderLineHistory();
  }

  function activateLineTab(tab) {
    state.lineTab = tab;
    $$(".line-tab").forEach((button) => button.classList.toggle("active", button.dataset.lineTab === tab));
    $$(".line-panel").forEach((panel) => panel.classList.add("hidden"));
    $(`line-panel-${tab}`)?.classList.remove("hidden");
    renderActiveLineTab();
  }

  function bindLineEditButtons(scope) {
    $$('[data-line-edit]', scope).forEach((button) => button.addEventListener("click", () => openLineEditor(button.dataset.lineEdit, button.dataset.id)));
  }

  async function loadLineOverview() {
    const queries = [
      state.supabase.from("cc_v_line_operations_summary").select("*").single(),
      state.supabase.from("cc_v_line_accounts_management").select("*").order("client_name"),
      state.supabase.from("cc_v_line_campaign_schedule").select("*").order("scheduled_at", { ascending: true, nullsFirst: false }),
      state.supabase.from("cc_v_line_assets_board").select("*").order("updated_at", { ascending: false }),
      state.supabase.from("cc_v_line_rich_menu_board").select("*").order("updated_at", { ascending: false }),
      state.supabase.from("cc_v_line_coupon_board").select("*").order("updated_at", { ascending: false }),
      state.supabase.from("cc_v_line_shop_card_board").select("*").order("updated_at", { ascending: false }),
      state.supabase.from("cc_v_line_operation_history").select("*").order("occurred_at", { ascending: false }).limit(200),
      state.supabase.from("cc_sites").select("id,client_id,site_code,site_name,status").order("site_code"),
    ];
    const results = await Promise.all(queries);
    const names = ["summary","accounts","campaigns","assets","richMenus","coupons","shopCards","events","sites"];
    results.forEach((result, index) => { if (result.error) throw result.error; state.lineOps[names[index]] = result.data || (index === 0 ? {} : []); });
    const currentAccount = $("lineAccountFilter").value;
    $("lineAccountFilter").innerHTML = `<option value="all">すべてのLINEアカウント</option>${state.lineOps.accounts.map((item) => `<option value="${item.id}">${escapeHtml(item.client_name)}｜${escapeHtml(item.account_name)}</option>`).join("")}`;
    if ([...$("lineAccountFilter").options].some((option) => option.value === currentAccount)) $("lineAccountFilter").value = currentAccount;
    renderLineMetrics();
    renderActiveLineTab();
  }

  function recordByKind(kind, id) {
    const source = { account:"accounts", campaign:"campaigns", asset:"assets", "rich-menu":"richMenus", coupon:"coupons", "shop-card":"shopCards", event:"events" }[kind];
    return (state.lineOps[source] || []).find((item) => item.id === id) || null;
  }

  function optionList(options, selected = "") {
    return options.map(([value, label]) => `<option value="${value}" ${value === selected ? "selected" : ""}>${escapeHtml(label)}</option>`).join("");
  }

  function fieldHtml(id, label, control, note = "") {
    return `<div class="field ${control.includes("textarea") ? "full" : ""}"><label for="${id}">${escapeHtml(label)}</label>${control}${note ? `<small>${escapeHtml(note)}</small>` : ""}</div>`;
  }

  function openLineEditor(kind, id = "") {
    if (!canEditLineOperations()) return toast("閲覧専用権限では変更できません。", true);
    const item = recordByKind(kind, id) || {};
    const editing = Boolean(id);
    $("lineEditorModal").dataset.kind = kind;
    $("lineEditorModal").dataset.recordId = id;
    const titles = { account:"LINE公式アカウント",campaign:"配信予定",asset:"制作物","rich-menu":"リッチメニュー",coupon:"クーポン","shop-card":"ショップカード",event:"対応履歴" };
    $("lineEditorTitle").textContent = `${titles[kind]}を${editing ? "編集" : "登録"}`;
    $("lineEditorEyebrow").textContent = editing ? "UPDATE" : "NEW RECORD";
    let fields = "";
    if (kind === "account") {
      fields += fieldHtml("leClient", "顧客", `<select id="leClient" ${editing ? "disabled" : ""}>${lineClientOptionHtml(item.client_id || state.clients[0]?.id || "")}</select>`);
      fields += fieldHtml("leSite", "拠点", `<select id="leSite">${lineSiteOptionHtml(item.site_id || "", item.client_id || state.clients[0]?.id || "")}</select>`);
      fields += fieldHtml("leAccountName", "LINE公式アカウント名", `<input id="leAccountName" maxlength="160" required value="${escapeHtml(item.account_name || "")}">`);
      fields += fieldHtml("leBasicId", "Basic ID", `<input id="leBasicId" maxlength="120" value="${escapeHtml(item.basic_id || "")}">`);
      fields += fieldHtml("leManagerUrl", "LINE管理画面URL", `<input id="leManagerUrl" type="url" value="${escapeHtml(item.manager_url || "")}">`, "Secretやパスワードは入力しません。");
      fields += fieldHtml("lePermission", "権限付与", `<select id="lePermission">${optionList([["not_requested","未依頼"],["requested","依頼済み"],["granted","付与済み"],["revoked","解除"],["error","要確認"]], item.permission_status || "not_requested")}</select>`);
      fields += fieldHtml("leGreeting", "あいさつメッセージ", `<select id="leGreeting">${optionList([["not_checked","未確認"],["draft","下書き"],["configured","設定済み"],["needs_update","要更新"]], item.greeting_status || "not_checked")}</select>`);
      fields += fieldHtml("leRichStatus", "リッチメニュー", `<select id="leRichStatus">${optionList([["not_checked","未確認"],["draft","下書き"],["configured","設定済み"],["needs_update","要更新"]], item.rich_menu_status || "not_checked")}</select>`);
      fields += fieldHtml("leCouponStatus", "クーポン", `<select id="leCouponStatus">${optionList([["not_used","未使用"],["active","運用中"],["expired","期限終了"],["needs_update","要更新"]], item.coupon_status || "not_used")}</select>`);
      fields += fieldHtml("leShopCardStatus", "ショップカード", `<select id="leShopCardStatus">${optionList([["not_used","未使用"],["active","運用中"],["needs_update","要更新"]], item.shop_card_status || "not_used")}</select>`);
      fields += fieldHtml("leAccountStatus", "運用状態", `<select id="leAccountStatus">${optionList([["preparing","準備中"],["active","運用中"],["paused","一時停止"],["ended","終了"]], item.status || "active")}</select>`);
      fields += fieldHtml("leInternalNote", "内部メモ", `<textarea id="leInternalNote" maxlength="2000">${escapeHtml(item.internal_note || "")}</textarea>`);
    }
    if (kind === "campaign") {
      const accountId = item.line_account_id || state.lineOps.accounts[0]?.id || "";
      fields += fieldHtml("leLineAccount", "LINE公式アカウント", `<select id="leLineAccount" required>${lineAccountOptionHtml(accountId, true)}</select>`);
      fields += fieldHtml("leCampaignTitle", "配信タイトル", `<input id="leCampaignTitle" maxlength="180" required value="${escapeHtml(item.title || "")}">`);
      fields += fieldHtml("leCampaignType", "配信区分", `<select id="leCampaignType">${optionList([["broadcast","一斉配信"],["segment","絞り込み配信"],["step","ステップ配信"],["coupon_notice","クーポン案内"],["shop_card_notice","ショップカード案内"],["rich_menu_notice","リッチメニュー案内"],["greeting_notice","あいさつ案内"],["other","その他"]], item.campaign_type || "broadcast")}</select>`);
      fields += fieldHtml("leCampaignStatus", "進行状態", `<select id="leCampaignStatus">${optionList(Object.entries(lineCampaignStatusLabels).filter(([v]) => !["overdue","waiting_client"].includes(v)), item.status || "idea")}</select>`);
      fields += fieldHtml("leCampaignSchedule", "配信予定日時", `<input id="leCampaignSchedule" type="datetime-local" value="${dateTimeLocalValue(item.scheduled_at)}">`);
      fields += fieldHtml("leImageStatus", "画像進行", `<select id="leImageStatus">${optionList([["not_required","画像不要"],["not_started","未着手"],["in_progress","制作中"],["internal_review","社内確認"],["client_review","オーナー確認"],["approved","承認済み"]], item.image_status || "not_required")}</select>`);
      fields += fieldHtml("leOwnerApproval", "オーナー承認", `<select id="leOwnerApproval">${optionList(Object.entries(lineApprovalLabels), item.owner_approval_status || "not_requested")}</select>`);
      fields += fieldHtml("leApprovalReference", "承認記録", `<input id="leApprovalReference" maxlength="300" value="${escapeHtml(item.owner_approval_reference || "")}" placeholder="例：2026/08/04 LINEで承認">`);
      fields += '<div class="form-section-title">配信内容</div>';
      fields += fieldHtml("leObjective", "目的", `<textarea id="leObjective" maxlength="2000">${escapeHtml(item.objective || "")}</textarea>`);
      fields += fieldHtml("leAudience", "対象の説明", `<textarea id="leAudience" maxlength="1000">${escapeHtml(item.audience_summary || "")}</textarea>`, "個別LINEユーザー名やLINE User IDは入力しません。");
      fields += fieldHtml("leMessageDraft", "配信原稿", `<textarea id="leMessageDraft" maxlength="5000">${escapeHtml(item.message_draft || "")}</textarea>`);
      fields += fieldHtml("leImageBrief", "画像制作指示", `<textarea id="leImageBrief" maxlength="2000">${escapeHtml(item.image_brief || "")}</textarea>`);
      fields += fieldHtml("leCampaignNote", "内部メモ", `<textarea id="leCampaignNote" maxlength="2000">${escapeHtml(item.internal_note || "")}</textarea>`);
      fields += fieldHtml("leReach", "配信到達数（集計）", `<input id="leReach" type="number" min="0" value="${item.aggregate_reach_count ?? ""}">`, "個別ユーザー情報ではなく集計値のみ。");
      fields += fieldHtml("leClicks", "クリック数（集計）", `<input id="leClicks" type="number" min="0" value="${item.aggregate_click_count ?? ""}">`);
    }
    if (kind === "asset") {
      const accountId = item.line_account_id || state.lineOps.accounts[0]?.id || "";
      fields += fieldHtml("leLineAccount", "LINE公式アカウント", `<select id="leLineAccount" required>${lineAccountOptionHtml(accountId, true)}</select>`);
      fields += fieldHtml("leCampaign", "関連する配信", `<select id="leCampaign">${lineCampaignOptionHtml(item.campaign_id || "", accountId)}</select>`);
      fields += fieldHtml("leAssetTitle", "制作物名", `<input id="leAssetTitle" maxlength="180" required value="${escapeHtml(item.title || "")}">`);
      fields += fieldHtml("leAssetType", "種類", `<select id="leAssetType">${optionList([["copy","配信原稿"],["image","配信画像"],["rich_menu","リッチメニュー"],["coupon","クーポン"],["shop_card","ショップカード"],["greeting","あいさつ"],["pop","店頭POP"],["other","その他"]], item.asset_type || "image")}</select>`);
      fields += fieldHtml("leAssetStatus", "制作状態", `<select id="leAssetStatus">${optionList(Object.entries(lineAssetStatusLabels), item.status || "draft")}</select>`);
      fields += fieldHtml("leOwnerApproval", "オーナー承認", `<select id="leOwnerApproval">${optionList(Object.entries(lineApprovalLabels), item.owner_approval_status || "not_requested")}</select>`);
      fields += fieldHtml("leVersion", "版", `<input id="leVersion" maxlength="60" value="${escapeHtml(item.version_label || "")}" placeholder="例：V1.2">`);
      fields += fieldHtml("leExternalUrl", "外部ファイルURL", `<input id="leExternalUrl" type="url" value="${escapeHtml(item.external_url || "")}">`, "画像本体はCONTROL CENTERに保存しません。HTTPSのURLだけ登録します。");
      fields += fieldHtml("leDescription", "制作内容", `<textarea id="leDescription" maxlength="3000">${escapeHtml(item.description || "")}</textarea>`);
      fields += fieldHtml("leApprovalReference", "承認記録", `<input id="leApprovalReference" maxlength="300" value="${escapeHtml(item.owner_approval_reference || "")}">`);
      fields += fieldHtml("leInternalNote", "内部メモ", `<textarea id="leInternalNote" maxlength="2000">${escapeHtml(item.internal_note || "")}</textarea>`);
    }
    if (["rich-menu","coupon","shop-card"].includes(kind)) {
      const accountId = item.line_account_id || state.lineOps.accounts[0]?.id || "";
      fields += fieldHtml("leLineAccount", "LINE公式アカウント", `<select id="leLineAccount" required>${lineAccountOptionHtml(accountId, true)}</select>`);
      if (kind === "rich-menu") {
        fields += fieldHtml("leItemName", "リッチメニュー名", `<input id="leItemName" maxlength="180" required value="${escapeHtml(item.menu_name || "")}">`);
        fields += fieldHtml("leItemSummary", "レイアウト・導線", `<textarea id="leItemSummary" maxlength="2000">${escapeHtml(item.layout_summary || "")}</textarea>`);
        fields += fieldHtml("leItemStatus", "状態", `<select id="leItemStatus">${optionList([["draft","下書き"],["designing","制作中"],["internal_review","社内確認"],["client_review","オーナー確認"],["approved","承認済み"],["scheduled","開始予定"],["active","運用中"],["inactive","停止中"],["archived","保管"]], item.status || "draft")}</select>`);
      } else if (kind === "coupon") {
        fields += fieldHtml("leItemName", "クーポン名", `<input id="leItemName" maxlength="180" required value="${escapeHtml(item.coupon_name || "")}">`);
        fields += fieldHtml("leItemSummary", "特典内容", `<textarea id="leItemSummary" maxlength="2000">${escapeHtml(item.benefit_summary || "")}</textarea>`);
        fields += fieldHtml("leItemStatus", "状態", `<select id="leItemStatus">${optionList([["draft","下書き"],["client_review","オーナー確認"],["approved","承認済み"],["scheduled","開始予定"],["active","運用中"],["expired","期限終了"],["stopped","停止"],["archived","保管"]], item.status || "draft")}</select>`);
      } else {
        fields += fieldHtml("leItemName", "ショップカード名", `<input id="leItemName" maxlength="180" required value="${escapeHtml(item.card_name || "")}">`);
        fields += fieldHtml("leItemSummary", "特典内容", `<textarea id="leItemSummary" maxlength="2000">${escapeHtml(item.benefit_summary || "")}</textarea>`);
        fields += fieldHtml("lePoints", "特典までのポイント数", `<input id="lePoints" type="number" min="1" value="${item.points_required ?? ""}">`);
        fields += fieldHtml("leItemStatus", "状態", `<select id="leItemStatus">${optionList([["draft","下書き"],["client_review","オーナー確認"],["approved","承認済み"],["scheduled","開始予定"],["active","運用中"],["inactive","停止中"],["archived","保管"]], item.status || "draft")}</select>`);
      }
      fields += fieldHtml("leOwnerApproval", "オーナー承認", `<select id="leOwnerApproval">${optionList(Object.entries(lineApprovalLabels), item.owner_approval_status || "not_requested")}</select>`);
      fields += fieldHtml("leStartAt", "開始日時", `<input id="leStartAt" type="datetime-local" value="${dateTimeLocalValue(item.active_from || item.valid_from)}">`);
      fields += fieldHtml("leEndAt", "終了日時", `<input id="leEndAt" type="datetime-local" value="${dateTimeLocalValue(item.active_until || item.valid_until)}">`);
      fields += fieldHtml("leExternalUrl", "外部管理URL", `<input id="leExternalUrl" type="url" value="${escapeHtml(item.external_url || "")}">`);
      fields += fieldHtml("leApprovalReference", "承認記録", `<input id="leApprovalReference" maxlength="300" value="${escapeHtml(item.owner_approval_reference || "")}">`);
      fields += fieldHtml("leInternalNote", "内部メモ", `<textarea id="leInternalNote" maxlength="2000">${escapeHtml(item.internal_note || "")}</textarea>`);
    }
    if (kind === "event") {
      const accountId = item.line_account_id || state.lineOps.accounts[0]?.id || "";
      fields += fieldHtml("leLineAccount", "LINE公式アカウント", `<select id="leLineAccount" required>${lineAccountOptionHtml(accountId, true)}</select>`);
      fields += fieldHtml("leEventType", "対応区分", `<select id="leEventType">${optionList(Object.entries(lineEventLabels), item.event_type || "note")}</select>`);
      fields += fieldHtml("leEventSubject", "件名", `<input id="leEventSubject" maxlength="180" required value="${escapeHtml(item.subject || "")}">`);
      fields += fieldHtml("leOccurredAt", "対応日時", `<input id="leOccurredAt" type="datetime-local" value="${dateTimeLocalValue(item.occurred_at || new Date())}">`);
      fields += fieldHtml("leEventDetail", "対応内容", `<textarea id="leEventDetail" maxlength="4000">${escapeHtml(item.detail || "")}</textarea>`, "個別のLINE会話全文や顧客の個人情報は貼り付けません。");
      fields += fieldHtml("leNextAction", "次の対応", `<input id="leNextAction" maxlength="500" value="${escapeHtml(item.next_action || "")}">`);
      fields += fieldHtml("leFollowUp", "次回確認期限", `<input id="leFollowUp" type="datetime-local" value="${dateTimeLocalValue(item.follow_up_due_at)}">`);
    }
    $("lineEditorFields").innerHTML = fields || '<div class="readonly-note">編集項目を準備できませんでした。</div>';
    setMessage("lineEditorMessage", "");
    $("lineEditorBackdrop").classList.remove("hidden");
    $("lineEditorModal").classList.remove("hidden");
    document.body.classList.add("dialog-open");
    if (kind === "account" && !editing) {
      $("leClient").addEventListener("change", () => { $("leSite").innerHTML = lineSiteOptionHtml("", $("leClient").value); });
    }
    if (kind === "asset") {
      $("leLineAccount").addEventListener("change", () => { $("leCampaign").innerHTML = lineCampaignOptionHtml("", $("leLineAccount").value); });
    }
  }

  function closeLineEditor() {
    $("lineEditorBackdrop").classList.add("hidden");
    $("lineEditorModal").classList.add("hidden");
    document.body.classList.remove("dialog-open");
  }

  function accountContext(accountId) {
    const account = state.lineOps.accounts.find((item) => item.id === accountId);
    if (!account) throw new Error("LINE公式アカウントを選択してください。");
    return account;
  }

  async function saveLineEditor(event) {
    event.preventDefault();
    if (!canEditLineOperations()) return;
    const kind = $("lineEditorModal").dataset.kind;
    const id = $("lineEditorModal").dataset.recordId;
    const editing = Boolean(id);
    const now = new Date().toISOString();
    let table = "";
    let payload = {};
    if (kind === "account") {
      table = "cc_line_accounts";
      const clientId = editing ? recordByKind(kind, id).client_id : $("leClient").value;
      payload = { client_id: clientId, site_id: $("leSite").value || null, account_name: $("leAccountName").value.trim(), basic_id: $("leBasicId").value.trim() || null, manager_url: $("leManagerUrl").value.trim() || null, permission_status: $("lePermission").value, greeting_status: $("leGreeting").value, rich_menu_status: $("leRichStatus").value, coupon_status: $("leCouponStatus").value, shop_card_status: $("leShopCardStatus").value, status: $("leAccountStatus").value, internal_note: $("leInternalNote").value.trim() || null, updated_by: state.staff.id };
      if (!editing) payload.created_by = state.staff.id;
    }
    if (kind === "campaign") {
      table = "cc_line_campaigns"; const account = accountContext($("leLineAccount").value); const approval = $("leOwnerApproval").value;
      payload = { client_id: account.client_id, site_id: account.site_id || null, line_account_id: account.id, campaign_type: $("leCampaignType").value, title: $("leCampaignTitle").value.trim(), objective: $("leObjective").value.trim() || null, audience_summary: $("leAudience").value.trim() || null, message_draft: $("leMessageDraft").value.trim() || null, image_brief: $("leImageBrief").value.trim() || null, image_status: $("leImageStatus").value, status: $("leCampaignStatus").value, owner_approval_status: approval, owner_approval_requested_at: approval === "waiting" ? (recordByKind(kind,id)?.owner_approval_requested_at || now) : null, owner_approved_at: approval === "approved" ? (recordByKind(kind,id)?.owner_approved_at || now) : null, owner_approval_reference: $("leApprovalReference").value.trim() || null, scheduled_at: isoOrNull($("leCampaignSchedule").value), delivered_at: $("leCampaignStatus").value === "delivered" ? (recordByKind(kind,id)?.delivered_at || now) : null, aggregate_reach_count: $("leReach").value === "" ? null : Number($("leReach").value), aggregate_click_count: $("leClicks").value === "" ? null : Number($("leClicks").value), internal_note: $("leCampaignNote").value.trim() || null, updated_by: state.staff.id };
      if (!editing) payload.created_by = state.staff.id;
    }
    if (kind === "asset") {
      table = "cc_line_assets"; const account = accountContext($("leLineAccount").value); const approval = $("leOwnerApproval").value;
      payload = { client_id: account.client_id, site_id: account.site_id || null, line_account_id: account.id, campaign_id: $("leCampaign").value || null, asset_type: $("leAssetType").value, title: $("leAssetTitle").value.trim(), description: $("leDescription").value.trim() || null, status: $("leAssetStatus").value, version_label: $("leVersion").value.trim() || null, external_url: $("leExternalUrl").value.trim() || null, owner_approval_status: approval, owner_approval_reference: $("leApprovalReference").value.trim() || null, approved_at: approval === "approved" ? (recordByKind(kind,id)?.approved_at || now) : null, internal_note: $("leInternalNote").value.trim() || null, updated_by: state.staff.id };
      if (!editing) payload.created_by = state.staff.id;
    }
    if (["rich-menu","coupon","shop-card"].includes(kind)) {
      const account = accountContext($("leLineAccount").value); const approval = $("leOwnerApproval").value;
      table = kind === "rich-menu" ? "cc_line_rich_menus" : kind === "coupon" ? "cc_line_coupons" : "cc_line_shop_cards";
      payload = { client_id: account.client_id, site_id: account.site_id || null, line_account_id: account.id, status: $("leItemStatus").value, owner_approval_status: approval, owner_approval_reference: $("leApprovalReference").value.trim() || null, external_url: $("leExternalUrl").value.trim() || null, internal_note: $("leInternalNote").value.trim() || null, updated_by: state.staff.id };
      if (kind === "rich-menu") Object.assign(payload, { menu_name: $("leItemName").value.trim(), layout_summary: $("leItemSummary").value.trim() || null, active_from: isoOrNull($("leStartAt").value), active_until: isoOrNull($("leEndAt").value) });
      if (kind === "coupon") Object.assign(payload, { coupon_name: $("leItemName").value.trim(), benefit_summary: $("leItemSummary").value.trim() || null, valid_from: isoOrNull($("leStartAt").value), valid_until: isoOrNull($("leEndAt").value) });
      if (kind === "shop-card") Object.assign(payload, { card_name: $("leItemName").value.trim(), benefit_summary: $("leItemSummary").value.trim() || null, points_required: $("lePoints").value === "" ? null : Number($("lePoints").value), valid_from: isoOrNull($("leStartAt").value), valid_until: isoOrNull($("leEndAt").value) });
      if (!editing) payload.created_by = state.staff.id;
    }
    if (kind === "event") {
      table = "cc_line_operation_events"; const account = accountContext($("leLineAccount").value);
      payload = { client_id: account.client_id, site_id: account.site_id || null, line_account_id: account.id, event_type: $("leEventType").value, subject: $("leEventSubject").value.trim(), detail: $("leEventDetail").value.trim() || null, next_action: $("leNextAction").value.trim() || null, follow_up_due_at: isoOrNull($("leFollowUp").value), occurred_at: isoOrNull($("leOccurredAt").value) || now, actor_staff_id: state.staff.id };
    }
    if (!table) return setMessage("lineEditorMessage", "保存対象を確認できませんでした。");
    if (Object.values(payload).some((value) => typeof value === "string" && /(?:sb_secret_|service_role|channel_secret|access[_-]?token)/i.test(value))) return setMessage("lineEditorMessage", "Secret・アクセストークン・パスワードはCONTROL CENTERへ保存できません。");
    const button = $("lineEditorSave"); setBusy(button, true, "保存しています…"); setMessage("lineEditorMessage", "");
    try {
      let query = editing ? state.supabase.from(table).update(payload).eq("id", id) : state.supabase.from(table).insert(payload);
      const { error } = await query;
      if (error) throw error;
      closeLineEditor();
      await Promise.all([loadLineOverview(), loadDashboard()]);
      toast("LINE運用情報を保存しました。");
    } catch (error) { setMessage("lineEditorMessage", error.message || "保存できませんでした。"); }
    finally { setBusy(button, false); }
  }

  const infraStatusLabels = {
    not_checked:"未確認",ok:"正常",warning:"要確認",error:"異常",unknown:"未確認",latest:"最新版",
    update_recommended:"更新推奨",update_required:"要更新",ahead:"先行版",accepted:"招待済み",requested:"依頼中",
    invited:"招待送信済み",revoked:"解除",granted:"権限あり"
  };
  const infraTypeTables = { system:"cc_system_instances",supabase:"cc_supabase_projects",worker:"cc_workers",github:"cc_github_repositories",release:"cc_release_catalog" };
  function canTechnicalWrite(){ return ["owner_admin","technical_admin"].includes(state.staff?.role_key); }
  function clientOptions(selected=""){ return `<option value="">DPRO内部・未指定</option>`+state.infrastructure.clients.map(c=>`<option value="${c.id}" ${c.id===selected?"selected":""}>${escapeHtml(c.display_name)}（${escapeHtml(c.client_code)}）</option>`).join(""); }
  function systemOptions(selected=""){ return `<option value="">未接続</option>`+state.infrastructure.systems.map(s=>`<option value="${s.id}" ${s.id===selected?"selected":""}>${escapeHtml(s.client_name)}｜${escapeHtml(s.system_name)}</option>`).join(""); }
  function infraInput(name,label,value="",type="text",options=""){ if(type==="select")return `<label class="field"><span>${label}</span><select name="${name}">${options}</select></label>`; return `<label class="field"><span>${label}</span><input name="${name}" type="${type}" value="${escapeHtml(value??"")}"></label>`; }

  async function loadInfrastructureOverview(){
    const results = await Promise.all([
      state.supabase.from("cc_v_infrastructure_summary").select("*").single(),
      state.supabase.from("cc_v_system_operations").select("*").order("client_name"),
      state.supabase.from("cc_v_supabase_inventory_v4").select("*").order("project_name"),
      state.supabase.from("cc_v_worker_inventory_v4").select("*").order("worker_name"),
      state.supabase.from("cc_v_github_inventory_v4").select("*").order("repository_full_name"),
      state.supabase.from("cc_v_release_status_v4").select("*").order("system_code"),
      state.supabase.from("cc_health_checks").select("*,cc_clients(display_name,client_code),cc_system_instances(system_name,system_code)").order("checked_at",{ascending:false}).limit(100),
      state.supabase.from("cc_clients").select("id,client_code,display_name,status").order("display_name"),
      state.supabase.from("cc_sites").select("id,client_id,site_code,site_name").order("site_code"),
    ]);
    results.forEach(r=>{if(r.error)throw r.error});
    const [summary,systems,supabase,workers,github,releases,health,clients,sites]=results.map(r=>r.data);
    state.infrastructure={summary,systems:systems||[],supabase:supabase||[],workers:workers||[],github:github||[],releases:releases||[],health:health||[],clients:clients||[],sites:sites||[]};
    renderInfrastructure();
  }

  function renderInfrastructure(){
    const d=state.infrastructure.summary||{};
    const metrics=[
      [d.managed_systems,"管理システム","稼働・準備中",d.unhealthy_systems?"warning":""],
      [d.unhealthy_systems,"要確認システム","警告・異常",d.unhealthy_systems?"danger":""],
      [d.systems_needing_update,"更新対象","推奨・必須",d.systems_needing_update?"warning":""],
      [d.supabase_projects,"Supabase","登録プロジェクト",d.supabase_permission_attention?"warning":""],
      [d.workers,"Worker","登録Worker",d.worker_errors?"danger":""],
      [d.repositories,"GitHub","登録リポジトリ",d.repository_attention?"warning":""],
      [d.checks_last_24h,"24時間の確認","Health履歴",""],
    ];
    $("infrastructureMetricGrid").innerHTML=metrics.map(([v,l,n,t])=>`<article class="metric-card ${t}"><b>${Number(v||0)}</b><span>${l}</span><small>${n}</small></article>`).join("");
    renderSystemsTable();renderSupabaseTable();renderWorkersTable();renderGithubTable();renderReleaseTable();renderHealthTable();switchInfrastructureTab(state.infraTab);
  }
  function actionButtons(type,id,systemId=""){ const edit=canTechnicalWrite()?`<button class="infra-action" data-infra-edit="${type}" data-infra-id="${id}">編集</button>`:""; const check=systemId&&canTechnicalWrite()?`<button class="infra-action primary" data-health-check="${systemId}">稼働確認</button>`:""; return `<div class="infra-actions">${check}${edit}</div>`; }
  function renderSystemsTable(){ $("systemOverview").innerHTML=`<table><thead><tr><th>顧客・システム</th><th>状態</th><th>Health</th><th>バージョン</th><th>Supabase</th><th>Worker・GitHub</th><th>操作</th></tr></thead><tbody>${state.infrastructure.systems.map(x=>`<tr><td><strong>${escapeHtml(x.client_name)}</strong><br><span class="client-code">${escapeHtml(x.client_code)}／${escapeHtml(x.system_code)}／${escapeHtml(x.facility_code)}</span></td><td>${pill(systemStatusLabels[x.status]||x.status,statusTone(x.status))}<br>${pill(infraStatusLabels[x.version_status]||x.version_status,statusTone(x.version_status))}</td><td>${pill(infraStatusLabels[x.last_health_status]||x.last_health_status,statusTone(x.last_health_status))}<br>${formatDate(x.last_health_checked_at,true)}${x.last_error_summary?`<span class="status-detail">${escapeHtml(x.last_error_summary)}</span>`:""}</td><td><div class="version-stack"><span>W ${escapeHtml(x.worker_version||"未確認")}</span><span>DB ${escapeHtml(x.database_version||"未確認")}</span><span>FE ${escapeHtml(x.frontend_version||"未確認")}</span></div></td><td>${escapeHtml(x.supabase_project_name||"未登録")}<br>${pill(infraStatusLabels[x.supabase_invitation_status]||x.supabase_invitation_status,statusTone(x.supabase_invitation_status))}</td><td>${escapeHtml(x.worker_name||"未登録")}<br>${escapeHtml(x.repository_full_name||"未登録")}</td><td>${actionButtons("system",x.id,x.id)}</td></tr>`).join("")||'<tr><td colspan="7">登録済みシステムはありません。</td></tr>'}</tbody></table>`; bindInfrastructureButtons(); }
  function renderSupabaseTable(){ $("supabaseOverview").innerHTML=`<table><thead><tr><th>顧客</th><th>プロジェクト</th><th>所有・環境</th><th>招待状態</th><th>接続確認</th><th>操作</th></tr></thead><tbody>${state.infrastructure.supabase.map(x=>`<tr><td>${escapeHtml(x.client_name||"DPRO内部")}<br><span class="client-code">${escapeHtml(x.client_code||"")}</span></td><td><strong>${escapeHtml(x.project_name)}</strong><br><span class="client-code">${escapeHtml(x.project_ref)}</span></td><td>${escapeHtml(x.owner_type)}／${escapeHtml(x.environment)}<br>${escapeHtml(x.data_class)}</td><td>${pill(infraStatusLabels[x.invitation_status]||x.invitation_status,statusTone(x.invitation_status))}<br>${escapeHtml(x.dpro_role||"役割未登録")}</td><td>${pill(infraStatusLabels[x.last_connection_status]||x.last_connection_status,statusTone(x.last_connection_status))}<br>${formatDate(x.last_connection_check_at,true)}</td><td>${actionButtons("supabase",x.id)}</td></tr>`).join("")||'<tr><td colspan="6">Supabaseは未登録です。</td></tr>'}</tbody></table>`; bindInfrastructureButtons(); }
  function renderWorkersTable(){ $("workerOverview").innerHTML=`<table><thead><tr><th>顧客</th><th>Worker</th><th>状態</th><th>バージョン</th><th>最終確認</th><th>操作</th></tr></thead><tbody>${state.infrastructure.workers.map(x=>`<tr><td>${escapeHtml(x.client_name||"DPRO内部")}<br><span class="client-code">${escapeHtml(x.system_name||"")}</span></td><td><strong>${escapeHtml(x.worker_name)}</strong><br>${safeUrl(x.worker_url)?`<a class="small-link" target="_blank" rel="noopener" href="${escapeHtml(x.worker_url)}">Worker</a>`:""} ${safeUrl(x.health_url)?`<a class="small-link" target="_blank" rel="noopener" href="${escapeHtml(x.health_url)}">Health</a>`:""}</td><td>${pill(x.status,statusTone(x.status))}<br>連続失敗 ${x.consecutive_failures||0}</td><td><div class="version-stack"><span>現在 ${escapeHtml(x.current_version||"未確認")}</span><span>期待 ${escapeHtml(x.expected_version||"未設定")}</span></div></td><td>${formatDate(x.last_checked_at,true)}<br>${x.last_response_ms!=null?`${x.last_response_ms}ms`:"—"}</td><td>${actionButtons("worker",x.id,x.system_instance_id)}</td></tr>`).join("")||'<tr><td colspan="6">Workerは未登録です。</td></tr>'}</tbody></table>`; bindInfrastructureButtons(); }
  function renderGithubTable(){ $("githubOverview").innerHTML=`<table><thead><tr><th>顧客</th><th>リポジトリ</th><th>用途・公開範囲</th><th>権限</th><th>Pages</th><th>操作</th></tr></thead><tbody>${state.infrastructure.github.map(x=>`<tr><td>${escapeHtml(x.client_name||"DPRO内部")}<br><span class="client-code">${escapeHtml(x.system_name||"")}</span></td><td><strong>${escapeHtml(x.repository_full_name)}</strong><br><a class="small-link" target="_blank" rel="noopener" href="${escapeHtml(x.repository_url)}">GitHub</a>${safeUrl(x.pages_url)?` <a class="small-link" target="_blank" rel="noopener" href="${escapeHtml(x.pages_url)}">Pages</a>`:""}</td><td>${escapeHtml(x.purpose)}／${escapeHtml(x.visibility)}<br>branch ${escapeHtml(x.default_branch)}</td><td>${pill(infraStatusLabels[x.access_status]||x.access_status,statusTone(x.access_status))}</td><td>${pill(infraStatusLabels[x.pages_status]||x.pages_status,statusTone(x.pages_status))}<br>${formatDate(x.last_pages_check_at,true)}</td><td>${actionButtons("github",x.id)}</td></tr>`).join("")||'<tr><td colspan="6">GitHubは未登録です。</td></tr>'}</tbody></table>`; bindInfrastructureButtons(); }
  function renderReleaseTable(){ $("releaseOverview").innerHTML=`<table><thead><tr><th>顧客・システム</th><th>部品</th><th>現在</th><th>推奨</th><th>判定</th><th>公開日</th><th>操作</th></tr></thead><tbody>${state.infrastructure.releases.map(x=>`<tr><td>${escapeHtml(x.client_name)}<br><span class="client-code">${escapeHtml(x.system_code)}</span></td><td>${escapeHtml(x.component)}</td><td>${escapeHtml(x.current_version||"未確認")}</td><td><strong>${escapeHtml(x.recommended_version||"未登録")}</strong><br><span class="client-code">最低 ${escapeHtml(x.minimum_supported_version||"未設定")}</span></td><td>${pill(infraStatusLabels[x.comparison_status]||x.comparison_status,statusTone(x.comparison_status))}</td><td>${formatDate(x.released_at,true)}</td><td>${canTechnicalWrite()?`<button class="infra-action" data-infra-edit="release" data-release-system="${escapeHtml(x.system_code)}" data-release-component="${escapeHtml(x.component||"")}">編集</button>`:""}</td></tr>`).join("")||'<tr><td colspan="7">推奨バージョンは未登録です。</td></tr>'}</tbody></table>`; bindInfrastructureButtons(); }
  function renderHealthTable(){ $("healthOverview").innerHTML=`<table><thead><tr><th>確認日時</th><th>顧客・システム</th><th>種類</th><th>結果</th><th>応答</th><th>バージョン</th><th>実行元</th></tr></thead><tbody>${state.infrastructure.health.map(x=>`<tr><td>${formatDate(x.checked_at,true)}</td><td>${escapeHtml(x.cc_clients?.display_name||"DPRO内部")}<br>${escapeHtml(x.cc_system_instances?.system_name||"—")}</td><td>${escapeHtml(x.check_type)}</td><td>${pill(infraStatusLabels[x.status]||x.status,statusTone(x.status))}</td><td>${x.http_status||"—"}／${x.response_ms!=null?`${x.response_ms}ms`:"—"}</td><td><div class="version-stack"><span>${escapeHtml(x.worker_version||"—")}</span><span>${escapeHtml(x.database_version||"—")}</span></div></td><td>${escapeHtml(x.source)}</td></tr>`).join("")||'<tr><td colspan="7">確認履歴はありません。</td></tr>'}</tbody></table>`; }
  function switchInfrastructureTab(tab){ state.infraTab=tab; $$(".infrastructure-tab").forEach(b=>b.classList.toggle("active",b.dataset.infraTab===tab)); $$(".infra-panel").forEach(p=>p.classList.add("hidden")); $(`infra-panel-${tab}`)?.classList.remove("hidden"); }

  async function runHealthCheck(systemInstanceId,button){ if(!canTechnicalWrite())return toast("技術管理権限が必要です。",true); const old=button?.textContent; if(button){button.disabled=true;button.textContent="確認中…"} try{ const token=state.session?.access_token; const result=await api("/api/infrastructure/check",{method:"POST",headers:{authorization:`Bearer ${token}`},body:JSON.stringify({systemInstanceId})}); toast(result.status==="ok"?"Health確認は正常です。":"Health確認で要確認項目がありました。",result.status==="error"); await loadInfrastructureOverview(); await loadClients(); await loadDashboard(); }catch(e){toast(e.message||"稼働確認に失敗しました。",true)}finally{if(button){button.disabled=false;button.textContent=old}} }
  async function checkAllSystems(){ const btn=$("checkAllSystems"); const targets=state.infrastructure.systems.filter(x=>x.monitoring_enabled!==false); if(!targets.length)return toast("確認対象がありません。",true); btn.disabled=true; for(let i=0;i<targets.length;i++){btn.textContent=`確認中 ${i+1}/${targets.length}`; await runHealthCheck(targets[i].id,null);} btn.disabled=false;btn.textContent="すべて稼働確認"; }

  function findInfraItem(type,id,button){ if(type==="system")return state.infrastructure.systems.find(x=>x.id===id); if(type==="supabase")return state.infrastructure.supabase.find(x=>x.id===id); if(type==="worker")return state.infrastructure.workers.find(x=>x.id===id); if(type==="github")return state.infrastructure.github.find(x=>x.id===id); if(type==="release"){return state.infrastructure.releases.find(x=>x.system_code===button?.dataset.releaseSystem&&x.component===button?.dataset.releaseComponent)||{};} return {}; }
  function linkedWorkerForSystem(systemId){ return state.infrastructure.workers.find(x=>x.system_instance_id===systemId)||null; }
  function normalizeWorkerUrl(value){ const raw=String(value||"").trim(); if(!raw)return ""; try{ const url=new URL(raw); if(!["https:","http:"].includes(url.protocol))return ""; url.pathname=url.pathname.replace(/\/api\/health\/?$/i,"").replace(/\/$/,""); url.search=""; url.hash=""; return url.href.replace(/\/$/,""); }catch{return "";} }
  function healthUrlFromWorker(value){ const base=normalizeWorkerUrl(value); return base?`${base}/api/health`:""; }
  function workerNameFromUrl(value){ try{return new URL(normalizeWorkerUrl(value)).hostname.split(".")[0]||"DPRO Worker";}catch{return "DPRO Worker";} }
  function workerStatusFromSystem(status){ if(status==="paused")return "paused"; if(status==="ended")return "ended"; if(status==="degraded")return "degraded"; if(status==="active")return "active"; return "preparing"; }
  function openInfraEditor(type,id=null,button=null){ if(!canTechnicalWrite())return toast("管理責任者または技術管理者のみ編集できます。",true); const item=findInfraItem(type,id,button)||{}; const linkedWorker=type==="system"?linkedWorkerForSystem(item.id):null; state.infraEditor={type,id,item,linkedWorker}; const title={system:"DPROシステム",supabase:"Supabase",worker:"Worker",github:"GitHub",release:"推奨バージョン"}[type]||"接続情報"; $("infraEditorTitle").textContent=`${id?"編集":"登録"}｜${title}`; let fields="";
    if(type==="system"){ const workerUrl=linkedWorker?.worker_url||normalizeWorkerUrl(item.health_url); const healthUrl=item.health_url||linkedWorker?.health_url||healthUrlFromWorker(workerUrl); fields=infraInput("client_id","顧客",item.client_id,"select",clientOptions(item.client_id))+infraInput("system_code","システムコード",item.system_code)+infraInput("system_name","システム名",item.system_name)+infraInput("facility_code","事業所コード",item.facility_code)+infraInput("environment","環境",item.environment||"production","select",`<option value="demo">demo</option><option value="staging">staging</option><option value="production">production</option>`)+infraInput("status","状態",item.status||"preparing","select",`<option value="planned">計画</option><option value="preparing">準備中</option><option value="active">稼働中</option><option value="degraded">要確認</option><option value="paused">停止中</option><option value="ended">終了</option>`)+infraInput("worker_url","Worker URL",workerUrl)+infraInput("health_url","Health URL",healthUrl)+infraInput("system_check_url","system-check URL",item.system_check_url)+infraInput("expected_worker_version","期待Worker版",item.expected_worker_version)+infraInput("expected_database_version","期待DB版",item.expected_database_version); }
    if(type==="supabase") fields=infraInput("client_id","顧客",item.client_id,"select",clientOptions(item.client_id))+infraInput("system_instance_id","接続システム",item.system_instance_id,"select",systemOptions(item.system_instance_id))+infraInput("project_name","プロジェクト名",item.project_name)+infraInput("project_ref","Project Ref",item.project_ref)+infraInput("owner_type","所有者",item.owner_type||"client","select",`<option value="dpro">DPRO</option><option value="client">オーナー</option><option value="shared_demo">共有デモ</option><option value="shared_development">共有開発</option>`)+infraInput("environment","環境",item.environment||"production","select",`<option value="development">development</option><option value="demo">demo</option><option value="staging">staging</option><option value="production">production</option>`)+infraInput("data_class","データ区分",item.data_class||"general","select",`<option value="internal">internal</option><option value="general">general</option><option value="medical">medical</option><option value="welfare">welfare</option><option value="sensitive">sensitive</option>`)+infraInput("invitation_status","DPRO招待状態",item.invitation_status||"not_requested","select",`<option value="not_requested">未依頼</option><option value="requested">依頼中</option><option value="invited">招待済み</option><option value="accepted">承認済み</option><option value="revoked">解除</option><option value="error">エラー</option>`);
    if(type==="worker") fields=infraInput("client_id","顧客",item.client_id,"select",clientOptions(item.client_id))+infraInput("system_instance_id","接続システム",item.system_instance_id,"select",systemOptions(item.system_instance_id))+infraInput("worker_name","Worker名",item.worker_name)+infraInput("worker_url","Worker URL",item.worker_url)+infraInput("health_url","Health URL",item.health_url)+infraInput("environment","環境",item.environment||"production","select",`<option value="demo">demo</option><option value="staging">staging</option><option value="production">production</option>`)+infraInput("status","状態",item.status||"preparing","select",`<option value="preparing">準備中</option><option value="active">稼働中</option><option value="degraded">要確認</option><option value="paused">停止中</option><option value="ended">終了</option>`)+infraInput("expected_version","期待バージョン",item.expected_version);
    if(type==="github") fields=infraInput("client_id","顧客",item.client_id,"select",clientOptions(item.client_id))+infraInput("system_instance_id","接続システム",item.system_instance_id,"select",systemOptions(item.system_instance_id))+infraInput("repository_full_name","owner/repository",item.repository_full_name)+infraInput("repository_url","GitHub URL",item.repository_url)+infraInput("pages_url","Pages URL",item.pages_url)+infraInput("purpose","用途",item.purpose||"system","select",`<option value="control_center">CONTROL CENTER</option><option value="system">DPROシステム</option><option value="website">ホームページ</option><option value="proposal">提案書</option><option value="other">その他</option>`)+infraInput("visibility","公開範囲",item.visibility||"private","select",`<option value="private">private</option><option value="public">public</option><option value="internal">internal</option>`)+infraInput("access_status","権限状態",item.access_status||"not_checked","select",`<option value="not_checked">未確認</option><option value="granted">権限あり</option><option value="revoked">解除</option><option value="error">エラー</option>`);
    if(type==="release") fields=infraInput("system_code","システムコード",item.system_code)+infraInput("component","部品",item.component||"worker","select",`<option value="worker">worker</option><option value="database">database</option><option value="frontend">frontend</option><option value="website">website</option><option value="config">config</option>`)+infraInput("release_channel","チャンネル",item.release_channel||"stable","select",`<option value="stable">stable</option><option value="preview">preview</option><option value="legacy">legacy</option>`)+infraInput("recommended_version","推奨バージョン",item.recommended_version)+infraInput("minimum_supported_version","最低対応バージョン",item.minimum_supported_version)+infraInput("release_status","公開状態",item.release_status||"released","select",`<option value="planned">計画</option><option value="testing">テスト中</option><option value="released">公開済み</option><option value="deprecated">非推奨</option>`)+infraInput("released_at","公開日時",item.released_at?new Date(item.released_at).toISOString().slice(0,16):"","datetime-local")+infraInput("notes","変更内容",item.notes);
    $("infraEditorFields").innerHTML=fields; $("infraEditorMessage").textContent=""; $("infraEditorBackdrop").classList.remove("hidden"); $("infraEditorModal").classList.remove("hidden"); if(type==="system"){ const workerInput=$("infraEditorForm")?.querySelector('[name="worker_url"]'); const healthInput=$("infraEditorForm")?.querySelector('[name="health_url"]'); if(workerInput&&healthInput){ workerInput.addEventListener("input",()=>{ const generated=healthUrlFromWorker(workerInput.value); if(!healthInput.dataset.manuallyEdited||!healthInput.value.trim())healthInput.value=generated; }); healthInput.addEventListener("input",()=>{healthInput.dataset.manuallyEdited="true";}); } } }
  function closeInfraEditor(){ $("infraEditorBackdrop").classList.add("hidden"); $("infraEditorModal").classList.add("hidden"); state.infraEditor=null; }
  async function saveInfraEditor(event){ event.preventDefault(); const current=state.infraEditor;if(!current)return; const fd=new FormData(event.currentTarget); const payload=Object.fromEntries(fd.entries()); Object.keys(payload).forEach(k=>{if(payload[k]==="")payload[k]=null}); if(payload.system_code)payload.system_code=String(payload.system_code).toUpperCase(); if(payload.released_at)payload.released_at=new Date(payload.released_at).toISOString(); let workerUrl=""; if(current.type==="system"){ workerUrl=normalizeWorkerUrl(payload.worker_url); delete payload.worker_url; if(!workerUrl){$("infraEditorMessage").textContent="Worker URLを入力してください。";return;} if(!payload.health_url)payload.health_url=healthUrlFromWorker(workerUrl); if(!safeUrl(payload.health_url)){$("infraEditorMessage").textContent="Health URLを確認してください。";return;} } const table=infraTypeTables[current.type]; let savedSystemId=current.id; let query; if(current.type==="release"&&current.id==null&&current.item?.system_code){query=state.supabase.from(table).update(payload).eq("system_code",current.item.system_code).eq("component",current.item.component).eq("release_channel",current.item.release_channel||"stable");}else if(current.id){query=state.supabase.from(table).update(payload).eq("id",current.id);}else if(current.type==="system"){query=state.supabase.from(table).insert(payload).select("id").single();}else{query=state.supabase.from(table).insert(payload);} const {data,error}=await query;if(error){$("infraEditorMessage").textContent=error.message;return;} if(current.type==="system"){ savedSystemId=savedSystemId||data?.id; const linked=current.linkedWorker||linkedWorkerForSystem(savedSystemId); const workerPayload={client_id:payload.client_id,system_instance_id:savedSystemId,worker_name:linked?.worker_name||workerNameFromUrl(workerUrl),worker_url:workerUrl,health_url:payload.health_url,environment:payload.environment||"production",status:workerStatusFromSystem(payload.status),expected_version:payload.expected_worker_version||null,updated_at:new Date().toISOString()}; const workerQuery=linked?.id?state.supabase.from("cc_workers").update(workerPayload).eq("id",linked.id):state.supabase.from("cc_workers").insert(workerPayload); const {error:workerError}=await workerQuery; if(workerError){$("infraEditorMessage").textContent=`システムは保存されましたが、Worker URLを保存できませんでした：${workerError.message}`;await loadInfrastructureOverview();return;} } closeInfraEditor();toast(current.type==="system"?"システム情報とWorker URLを保存しました。":"接続情報を保存しました。");await loadInfrastructureOverview(); }
  function bindInfrastructureButtons(){ $$('[data-health-check]').forEach(b=>b.onclick=()=>runHealthCheck(b.dataset.healthCheck,b)); $$('[data-infra-edit]').forEach(b=>b.onclick=()=>openInfraEditor(b.dataset.infraEdit,b.dataset.infraId||null,b)); }


  function securityHeaders(){ return { authorization:`Bearer ${state.session?.access_token || ""}` }; }
  function securityInput(name,label,value="",type="text",options=""){
    const fieldClass=type==="textarea"||name==="reason"||name==="clientApprovalReference"?"field full":"field";
    if(type==="select")return `<label class="${fieldClass}"><span>${escapeHtml(label)}</span><select name="${escapeHtml(name)}" required>${options}</select></label>`;
    if(type==="textarea")return `<label class="${fieldClass}"><span>${escapeHtml(label)}</span><textarea name="${escapeHtml(name)}" rows="4" required>${escapeHtml(value)}</textarea></label>`;
    if(type==="checkbox")return `<label class="field full security-check"><input type="checkbox" name="${escapeHtml(name)}"${value?" checked":""}><span>${escapeHtml(label)}</span></label>`;
    return `<label class="${fieldClass}"><span>${escapeHtml(label)}</span><input name="${escapeHtml(name)}" type="${escapeHtml(type)}" value="${escapeHtml(value)}" required></label>`;
  }
  function securitySystemOptions(selected=""){return `<option value="">対象システムを選択</option>${state.security.systems.map(s=>`<option value="${s.id}"${s.id===selected?" selected":""}>${escapeHtml(s.cc_clients?.display_name||s.system_name)}／${escapeHtml(s.system_name)}（${escapeHtml(s.environment)}）</option>`).join("")}`;}
  async function loadSecurityOverview(){
    const result=await api("/api/security/overview",{headers:securityHeaders()});
    state.security={summary:result.summary||{},resets:result.resets||[],access:result.access||[],audit:result.audit||[],systems:result.systems||[]};
    renderSecurity();
  }
  function renderSecurity(){
    const d=state.security.summary||{};
    const metrics=[
      [d.active_resets,"復旧対応中","申請・発行・使用中",d.active_resets?"warning":""],
      [d.resets_expiring_soon,"まもなく期限","60分以内",d.resets_expiring_soon?"danger":""],
      [d.active_access,"一時アクセス中","期限付き",d.active_access?"warning":""],
      [d.access_expiring_soon,"アクセス期限間近","30分以内",d.access_expiring_soon?"danger":""],
      [d.security_actions_24h,"24時間の重要操作","監査記録済み",""],
      [d.failed_security_actions_24h,"失敗操作","24時間",d.failed_security_actions_24h?"danger":""],
    ];
    $("securityMetricGrid").innerHTML=metrics.map(([v,l,n,t])=>`<article class="metric-card ${t}"><b>${Number(v||0)}</b><span>${l}</span><small>${n}</small></article>`).join("");
    renderSecurityResets();renderSecurityAccess();renderSecurityAudit();switchSecurityTab(state.securityTab);
  }
  function securityActionsReset(item){
    const actions=[];
    if(["requested","approved","failed"].includes(item.status)&&item.identity_verified&&canTechnicalWrite())actions.push(`<button class="infra-action primary" data-reset-action="issue" data-id="${item.id}">一時コード発行</button>`);
    if(["issued","used"].includes(item.status))actions.push(`<button class="infra-action" data-reset-action="sync" data-id="${item.id}">状態確認</button>`);
    if(!["completed","expired","cancelled","revoked"].includes(item.status)&&canTechnicalWrite())actions.push(`<button class="infra-action" data-reset-action="cancel" data-id="${item.id}">取消</button>`);
    return `<div class="infra-actions">${actions.join("")}</div>`;
  }
  function renderSecurityResets(){
    $("securityResetBoard").innerHTML=`<table><thead><tr><th>申請・顧客</th><th>本人確認</th><th>状態</th><th>一時コード</th><th>期限</th><th>担当</th><th>操作</th></tr></thead><tbody>${state.security.resets.map(i=>`<tr><td><strong>${escapeHtml(i.client_name)}</strong><br><span class="client-code">${escapeHtml(i.reset_code)}／${escapeHtml(i.system_name)}</span><span class="status-detail">${escapeHtml(i.reason)}</span></td><td>${i.identity_verified?pill("確認済み","green"):pill("未確認","amber")}<br>${escapeHtml(i.identity_verification_method||"未記録")}</td><td>${pill(resetStatusLabels[i.status]||i.status,statusTone(i.status))}<br>${escapeHtml(i.remote_status||"")}</td><td>${i.temporary_code_last4?`末尾 ****${escapeHtml(i.temporary_code_last4)}`:"未発行"}<br>${escapeHtml(deliveryLabels[i.delivery_method]||i.delivery_method)}</td><td>${formatDate(i.expires_at,true)}</td><td>${escapeHtml(i.requested_by_name||"—")}<br>${escapeHtml(i.executed_by_name||"")}</td><td>${securityActionsReset(i)}</td></tr>`).join("")||'<tr><td colspan="7">復旧申請はありません。</td></tr>'}</tbody></table>`;
    bindSecurityActionButtons();
  }
  function securityActionsAccess(item){
    const actions=[];
    if(["requested","approved"].includes(item.status)&&canTechnicalWrite())actions.push(`<button class="infra-action primary" data-access-action="activate" data-id="${item.id}">有効化</button>`);
    if(item.status==="active")actions.push(`<button class="infra-action primary" data-access-action="summary" data-id="${item.id}">安全情報を見る</button>`);
    if(item.status==="active"&&canTechnicalWrite())actions.push(`<button class="infra-action" data-access-action="revoke" data-id="${item.id}">解除</button>`);
    return `<div class="infra-actions">${actions.join("")}</div>`;
  }
  function renderSecurityAccess(){
    $("securityAccessBoard").innerHTML=`<table><thead><tr><th>申請・顧客</th><th>範囲</th><th>了承記録</th><th>状態</th><th>有効期限</th><th>最終利用</th><th>操作</th></tr></thead><tbody>${state.security.access.map(i=>`<tr><td><strong>${escapeHtml(i.client_name)}</strong><br><span class="client-code">${escapeHtml(i.access_code)}／${escapeHtml(i.system_name)}</span><span class="status-detail">${escapeHtml(i.reason)}</span></td><td>${pill(accessScopeLabels[i.access_scope]||i.access_scope,"green")}</td><td>${escapeHtml(i.client_approval_reference||"未記録")}</td><td>${pill(accessStatusLabels[i.status]||i.status,statusTone(i.status))}<br>${escapeHtml(i.remote_status||"")}</td><td>${formatDate(i.expires_at,true)}<br>${Number(i.duration_minutes||30)}分</td><td>${formatDate(i.last_used_at,true)}</td><td>${securityActionsAccess(i)}</td></tr>`).join("")||'<tr><td colspan="7">一時アクセス申請はありません。</td></tr>'}</tbody></table>`;
    bindSecurityActionButtons();
  }
  function renderSecurityAudit(){
    $("securityAuditBoard").innerHTML=`<table><thead><tr><th>日時</th><th>操作</th><th>顧客</th><th>担当者</th><th>結果</th><th>理由</th><th>安全な詳細</th></tr></thead><tbody>${state.security.audit.map(i=>`<tr><td>${formatDate(i.created_at,true)}</td><td><strong>${escapeHtml(i.action)}</strong><br><span class="client-code">${escapeHtml(i.entity_table)}</span></td><td>${escapeHtml(i.client_name||"DPRO内部")}</td><td>${escapeHtml(i.actor_name||"システム")}<br>${escapeHtml(i.actor_role||"")}</td><td>${pill(i.success?"成功":"失敗",i.success?"green":"red")}</td><td>${escapeHtml(i.reason||"—")}</td><td><code class="safe-json">${escapeHtml(JSON.stringify(i.safe_detail||{}))}</code></td></tr>`).join("")||'<tr><td colspan="7">監査ログはありません。</td></tr>'}</tbody></table>`;
  }
  function switchSecurityTab(tab){state.securityTab=tab;$$('.security-tab').forEach(b=>b.classList.toggle('active',b.dataset.securityTab===tab));$$('.security-panel').forEach(p=>p.classList.add('hidden'));$(`security-panel-${tab}`)?.classList.remove('hidden');}
  function openSecurityEditor(type){
    state.securityEditor={type};$("securityEditorTitle").textContent=type==="reset"?"管理コード復旧申請":"一時サポートアクセス申請";
    let fields=securityInput("systemInstanceId","対象システム","","select",securitySystemOptions());
    if(type==="reset"){
      fields+=securityInput("reason","復旧理由","","textarea")+securityInput("identityVerificationMethod","本人確認方法（例：登録電話へ折返し）")+securityInput("identityVerified","本人確認を完了しました",false,"checkbox")+securityInput("deliveryMethod","一時コードの伝達方法","phone","select",`<option value="phone">電話</option><option value="line">LINE</option><option value="email">メール</option><option value="in_person">対面</option><option value="other">その他</option>`)+securityInput("deliveryReference","伝達先・記録（個人情報は最小限）");
    }else{
      fields+=securityInput("accessScope","アクセス範囲","metadata_only","select",`<option value="metadata_only">安全な集計情報のみ</option><option value="system_check">system-check要約</option>`)+securityInput("durationMinutes","有効時間（分）","30","number")+securityInput("reason","サポート理由","","textarea")+securityInput("clientApprovalReference","オーナー了承記録","","textarea");
    }
    $("securityEditorFields").innerHTML=fields;$("securityEditorMessage").textContent="";$("securityEditorBackdrop").classList.remove("hidden");$("securityEditorModal").classList.remove("hidden");
  }
  function closeSecurityEditor(){$("securityEditorBackdrop").classList.add("hidden");$("securityEditorModal").classList.add("hidden");state.securityEditor=null;}
  async function saveSecurityEditor(event){event.preventDefault();const fd=new FormData(event.currentTarget);const payload=Object.fromEntries(fd.entries());if(state.securityEditor?.type==="reset")payload.identityVerified=event.currentTarget.elements.identityVerified.checked;const path=state.securityEditor?.type==="reset"?"/api/security/resets":"/api/security/access";const button=$("securityEditorSave");setBusy(button,true,"申請中…");try{await api(path,{method:"POST",headers:securityHeaders(),body:JSON.stringify(payload)});closeSecurityEditor();toast("安全サポート申請を作成しました。");await loadSecurityOverview();}catch(e){$("securityEditorMessage").textContent=e.data?.message||e.message;}finally{setBusy(button,false);}}
  function showOneTimeCode(result){$("oneTimeCodeValue").textContent=result.temporaryCode;$("oneTimeResetCode").textContent=result.resetCode;$("oneTimeCodeExpiry").textContent=formatDate(result.expiresAt,true);$("oneTimeCodeBackdrop").classList.remove("hidden");$("oneTimeCodeModal").classList.remove("hidden");}
  function closeOneTimeCode(){$("oneTimeCodeBackdrop").classList.add("hidden");$("oneTimeCodeModal").classList.add("hidden");$("oneTimeCodeValue").textContent="--------";}
  function renderSupportSummary(summary){
    const content=$("supportSummaryContent");
    if(summary.scope==="metadata_only")content.innerHTML=`<div class="support-safe-grid">${Object.entries(summary.counts||{}).map(([k,v])=>`<article><small>${escapeHtml(k)}</small><strong>${Number(v||0)}</strong></article>`).join("")}</div><div class="security-notice"><strong>${escapeHtml(summary.facility?.facilityName||"")}</strong><span>${escapeHtml(summary.facility?.facilityCode||"")}／${escapeHtml(summary.facility?.environment||"")}</span></div>`;
    else content.innerHTML=`<div class="security-check-summary"><strong>PASS ${Number(summary.passed||0)}／WARN ${Number(summary.warnings||0)}／FAIL ${Number(summary.failed||0)}</strong>${(summary.checks||[]).map(c=>`<div class="security-check-row"><span>${escapeHtml(c.label)}</span>${pill(String(c.status||"").toUpperCase(),c.status==="pass"?"green":c.status==="warn"?"amber":"red")}</div>`).join("")}</div>`;
    $("supportSummaryBackdrop").classList.remove("hidden");$("supportSummaryModal").classList.remove("hidden");
  }
  function closeSupportSummary(){$("supportSummaryBackdrop").classList.add("hidden");$("supportSummaryModal").classList.add("hidden");$("supportSummaryContent").innerHTML="";}
  function bindSecurityActionButtons(){
    $$('[data-reset-action]').forEach(b=>b.onclick=async()=>{const action=b.dataset.resetAction,id=b.dataset.id;if(action==="cancel"&&!confirm("この復旧申請を取り消しますか？"))return;setBusy(b,true,"処理中…");try{const result=await api(`/api/security/resets/${id}/${action}`,{method:"POST",headers:securityHeaders(),body:"{}"});if(action==="issue")showOneTimeCode(result);else toast("復旧申請を更新しました。");await loadSecurityOverview();}catch(e){toast(e.data?.message||e.message,true);}finally{setBusy(b,false);}});
    $$('[data-access-action]').forEach(b=>b.onclick=async()=>{const action=b.dataset.accessAction,id=b.dataset.id;if(action==="revoke"&&!confirm("一時サポートアクセスを解除しますか？"))return;setBusy(b,true,"処理中…");try{const result=await api(`/api/security/access/${id}/${action}`,{method:"POST",headers:securityHeaders(),body:JSON.stringify(action==="revoke"?{reason:"CONTROL CENTER画面から解除"}:{})});if(action==="summary")renderSupportSummary(result.summary||{});else toast("一時サポートアクセスを更新しました。");await loadSecurityOverview();}catch(e){toast(e.data?.message||e.message,true);}finally{setBusy(b,false);}});
  }
  function websiteHeaders(){ return { authorization:`Bearer ${state.session?.access_token || ""}` }; }

  async function loadWebsiteOverview(options = {}) {
    if (!state.infrastructure.clients.length || !state.infrastructure.systems.length) {
      await loadInfrastructureOverview();
    }
    const result = await api("/api/websites/overview", { headers: websiteHeaders() });
    state.website = {
      summary: result.summary || {},
      items: result.websites || [],
      history: result.history || [],
    };
    renderWebsiteOverview();
    if (!options.skipAutoSync
      && !state.websiteAutoSyncDone
      && canTechnicalWrite()
      && state.website.items.some((item) => item.dpro_sync_enabled && ["pending","not_configured"].includes(item.last_sync_status))) {
      state.websiteAutoSyncDone = true;
      runAllWebsiteSync(true).catch(() => null);
    }
  }

  function renderWebsiteOverview(){
    const d=state.website.summary||{};
    const metrics=[
      [d.registered_websites,"登録ホームページ","全台帳",""],
      [d.public_websites,"公開中","公開状態",""],
      [d.live_sync_websites,"自動連動","公開API",""],
      [d.sync_ok,"同期正常","直近結果",Number(d.sync_attention||0)?"warning":""],
      [d.sync_attention,"要確認","警告・異常",Number(d.sync_attention||0)?"danger":""],
      [d.sync_stale,"24時間超","再確認対象",Number(d.sync_stale||0)?"warning":""],
      [d.fallback_enabled,"フォールバック","config.js", ""],
    ];
    $("websiteMetricGrid").innerHTML=metrics.map(([value,label,note,tone])=>`<article class="metric-card ${tone}"><b>${Number(value||0)}</b><span>${label}</span><small>${note}</small></article>`).join("");
    renderWebsiteCards();
    renderWebsiteSyncBoard();
    renderWebsitePreview();
    renderWebsiteHistory();
    switchWebsiteTab(state.websiteTab);
  }

  function websiteSyncBadges(item){
    return [
      ["営業時間",item.business_hours_sync_enabled],
      ["休日",item.holiday_sync_enabled],
      ["お知らせ",item.announcement_sync_enabled],
      ["障害時表示",item.fallback_enabled],
    ].map(([label,on])=>`<span class="website-feature ${on?"on":"off"}">${label} ${on?"ON":"OFF"}</span>`).join("");
  }

  function renderWebsiteCards(){
    const items=state.website.items||[];
    $("websiteOverview").innerHTML=items.length?items.map((item)=>`
      <article class="website-card">
        <div class="website-card-head">
          <div><p class="eyebrow">${escapeHtml(item.client_code||"WEBSITE")}</p><h2>${escapeHtml(item.client_name||item.website_name)}</h2><p>${escapeHtml(item.website_name)}／${escapeHtml(websitePlatformLabels[item.platform]||item.platform)}</p></div>
          <div class="website-status-stack">${pill(websitePublicationLabels[item.publication_status]||item.publication_status,statusTone(item.publication_status))}${pill(websiteSyncLabels[item.sync_health]||item.sync_health,statusTone(item.sync_health))}</div>
        </div>
        <div class="website-feature-row">${websiteSyncBadges(item)}</div>
        <dl class="website-definition">
          <div><dt>公開URL</dt><dd>${safeUrl(item.public_url)?`<a href="${escapeHtml(safeUrl(item.public_url))}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.public_url)}</a>`:"未設定"}</dd></div>
          <div><dt>接続システム</dt><dd>${escapeHtml(item.system_name||"未接続")} ${item.system_environment?`（${escapeHtml(item.system_environment)}）`:""}</dd></div>
          <div><dt>最終同期</dt><dd>${formatDate(item.last_sync_at,true)}／${escapeHtml(websiteSyncLabels[item.last_sync_status]||item.last_sync_status)}</dd></div>
          <div><dt>取得方法</dt><dd>${escapeHtml(item.latest_transport||item.last_sync_source||"未確認")} ${item.last_public_response_ms!=null?`／${Number(item.last_public_response_ms)}ms`:""}</dd></div>
          <div><dt>連動アダプター</dt><dd>${escapeHtml(item.adapter_version||"未登録")}</dd></div>
          <div><dt>次回確認</dt><dd>${formatDate(item.next_sync_review_at,true)}</dd></div>
        </dl>
        ${item.sync_error_summary?`<p class="website-error">${escapeHtml(item.sync_error_summary)}</p>`:""}
        <div class="website-actions">
          ${safeUrl(item.public_url)?`<a class="btn btn-secondary" href="${escapeHtml(safeUrl(item.public_url))}" target="_blank" rel="noopener noreferrer">ホームページを開く</a>`:""}
          ${canTechnicalWrite()?`<button class="btn btn-secondary" type="button" data-website-sync="${item.id}">同期確認</button><button class="btn btn-primary" type="button" data-website-edit="${item.id}">編集</button>`:""}
        </div>
      </article>`).join(""):'<div class="empty-state">ホームページは未登録です。</div>';
    bindWebsiteDynamicEvents();
  }

  function renderWebsiteSyncBoard(){
    const rows=[];
    for(const item of state.website.items||[]){
      const result=item.latest_scope_results||{};
      const scopes=[
        ["site_profile","店舗基本情報",true],
        ["business_hours","営業時間",item.business_hours_sync_enabled],
        ["holidays","休日・臨時休業",item.holiday_sync_enabled],
        ["announcements","公開お知らせ",item.announcement_sync_enabled],
      ];
      for(const [key,label,enabled] of scopes){
        const status=enabled?(result[key]||item.last_sync_status||"pending"):"disabled";
        rows.push(`<tr><td><strong>${escapeHtml(item.client_name)}</strong><br><span class="client-code">${escapeHtml(item.website_name)}</span></td><td>${escapeHtml(label)}</td><td>${pill(websiteSyncLabels[status]||status,statusTone(status))}</td><td>${escapeHtml(item.profile_endpoint_url||"未設定")}</td><td>${formatDate(item.last_sync_at,true)}</td></tr>`);
      }
    }
    $("websiteSyncBoard").innerHTML=`<table><thead><tr><th>顧客・ホームページ</th><th>連動項目</th><th>状態</th><th>公開API</th><th>最終確認</th></tr></thead><tbody>${rows.join("")||'<tr><td colspan="5">同期対象はありません。</td></tr>'}</tbody></table>`;
  }

  function previewHours(snapshot){
    const rows=snapshot?.businessHours||[];
    const names=["日","月","火","水","木","金","土"];
    return rows.length?rows.sort((a,b)=>Number(a.weekday)-Number(b.weekday)).map((row)=>`<li><strong>${names[Number(row.weekday)]||row.weekday}</strong><span>${row.isOpen?`${escapeHtml(row.openTime||"—")}〜${escapeHtml(row.closeTime||"—")}`:"休業"}${row.note?`　${escapeHtml(row.note)}`:""}</span></li>`).join(""):'<li><span>営業時間データはまだ取得されていません。</span></li>';
  }

  function renderWebsitePreview(){
    const items=(state.website.items||[]).filter((item)=>item.latest_public_snapshot&&Object.keys(item.latest_public_snapshot).length);
    $("websitePreviewBoard").innerHTML=items.length?items.map((item)=>{
      const snap=item.latest_public_snapshot||{};
      return `<article class="website-preview">
        <header><div><p class="eyebrow">PUBLIC SAFE PREVIEW</p><h2>${escapeHtml(snap.facilityName||item.website_name)}</h2><p>${escapeHtml(snap.address||"")} ${snap.phone?`／${escapeHtml(snap.phone)}`:""}</p></div>${pill(websiteSyncLabels[item.latest_run_status]||item.latest_run_status,statusTone(item.latest_run_status))}</header>
        <div class="website-preview-grid">
          <section><h3>営業時間・定休日</h3><p class="website-summary">${escapeHtml(snap.businessHoursSummary||"未設定")}</p><p class="website-summary">${escapeHtml(snap.closedDaysSummary||"未設定")}</p><ul class="website-hours">${previewHours(snap)}</ul></section>
          <section><h3>今後の休日・特別営業</h3><div class="website-notice-list">${(snap.upcomingHolidays||[]).map((h)=>`<article><strong>${escapeHtml(h.date)}　${escapeHtml(h.title)}</strong><p>${h.isClosed?"休業":`${escapeHtml(h.openTime||"—")}〜${escapeHtml(h.closeTime||"—")}`}${h.note?`／${escapeHtml(h.note)}`:""}</p></article>`).join("")||'<p class="empty-inline">公開予定の休日情報はありません。</p>'}</div></section>
          <section class="full"><h3>公開お知らせ</h3><div class="website-notice-list">${(snap.announcements||[]).map((a)=>`<article class="${a.isImportant?"important":""}"><strong>${escapeHtml(a.title)}</strong><p>${escapeHtml(a.body).replaceAll("\n","<br>")}</p>${a.period?`<small>${escapeHtml(a.period)}</small>`:""}</article>`).join("")||'<p class="empty-inline">公開中のお知らせはありません。</p>'}</div></section>
        </div>
        <footer>取得 ${formatDate(item.latest_run_at,true)}／公開情報のみ保存／Hash ${escapeHtml(item.last_public_payload_hash||"—")}</footer>
      </article>`;
    }).join(""):'<div class="empty-state">まだ公開プレビューがありません。同期確認後に表示されます。</div>';
  }

  function renderWebsiteHistory(){
    $("websiteHistoryBoard").innerHTML=`<table><thead><tr><th>日時</th><th>顧客・ホームページ</th><th>結果</th><th>取得方法</th><th>応答</th><th>公開内容</th><th>担当</th></tr></thead><tbody>${(state.website.history||[]).map((run)=>`<tr><td>${formatDate(run.created_at,true)}</td><td><strong>${escapeHtml(run.client_name)}</strong><br><span class="client-code">${escapeHtml(run.website_name)}</span></td><td>${pill(websiteSyncLabels[run.status]||run.status,statusTone(run.status))}${run.error_summary?`<span class="status-detail">${escapeHtml(run.error_summary)}</span>`:""}</td><td>${escapeHtml(run.transport)}<br><span class="client-code">${escapeHtml(run.run_type)}</span></td><td>${run.http_status||"—"}／${run.response_ms!=null?`${Number(run.response_ms)}ms`:"—"}</td><td>休日 ${Number(run.public_snapshot?.upcomingHolidays?.length||0)}件<br>お知らせ ${Number(run.public_snapshot?.announcements?.length||0)}件</td><td>${escapeHtml(run.requested_by_name||"システム")}</td></tr>`).join("")||'<tr><td colspan="7">同期履歴はありません。</td></tr>'}</tbody></table>`;
  }

  function switchWebsiteTab(tab){
    state.websiteTab=tab;
    $$(".website-tab").forEach((button)=>button.classList.toggle("active",button.dataset.websiteTab===tab));
    $$(".website-panel").forEach((panel)=>panel.classList.add("hidden"));
    $(`website-panel-${tab}`)?.classList.remove("hidden");
  }

  function websiteInput(name,label,value="",type="text",options=""){
    if(type==="select")return `<label class="field"><span>${escapeHtml(label)}</span><select name="${escapeHtml(name)}" required>${options}</select></label>`;
    if(type==="checkbox")return `<label class="field website-check"><input type="checkbox" name="${escapeHtml(name)}"${value?" checked":""}><span>${escapeHtml(label)}</span></label>`;
    return `<label class="field"><span>${escapeHtml(label)}</span><input name="${escapeHtml(name)}" type="${escapeHtml(type)}" value="${escapeHtml(value??"")}" required></label>`;
  }

  function openWebsiteEditor(websiteId=null){
    if(!canTechnicalWrite())return toast("管理責任者または技術管理者のみ編集できます。",true);
    const item=(state.website.items||[]).find((row)=>row.id===websiteId)||{};
    state.websiteEditor={websiteId,item};
    $("websiteEditorTitle").textContent=websiteId?"編集｜ホームページ連動":"登録｜ホームページ連動";
    const selectedClient=item.client_id||"";
    const selectedSystem=item.system_instance_id||"";
    const platformOptions=["github_pages","cloudflare_pages","google_sites","other"].map((value)=>`<option value="${value}"${(item.platform||"github_pages")===value?" selected":""}>${websitePlatformLabels[value]}</option>`).join("");
    const publicationOptions=["preparing","public","private","paused","ended"].map((value)=>`<option value="${value}"${(item.publication_status||"preparing")===value?" selected":""}>${websitePublicationLabels[value]}</option>`).join("");
    const maintenanceOptions=["none","preparing","active","paused","ended"].map((value)=>`<option value="${value}"${(item.maintenance_contract_status||"none")===value?" selected":""}>${value==="none"?"保守なし":value==="active"?"保守中":value==="preparing"?"準備中":value==="paused"?"一時停止":"終了"}</option>`).join("");
    const syncOptions=["live_api","manual","disabled"].map((value)=>`<option value="${value}"${(item.sync_mode||"live_api")===value?" selected":""}>${value==="live_api"?"公開API自動連動":value==="manual"?"手動確認":"連動停止"}</option>`).join("");
    $("websiteEditorFields").innerHTML=
      websiteInput("clientId","顧客",selectedClient,"select",clientOptions(selectedClient))+
      websiteInput("systemInstanceId","接続DPROシステム",selectedSystem,"select",systemOptions(selectedSystem))+
      websiteInput("websiteName","ホームページ名",item.website_name||"")+
      websiteInput("publicUrl","公開URL",item.public_url||"","url")+
      websiteInput("platform","公開基盤",item.platform||"github_pages","select",platformOptions)+
      websiteInput("publicationStatus","公開状態",item.publication_status||"preparing","select",publicationOptions)+
      websiteInput("maintenanceContractStatus","ホームページ保守",item.maintenance_contract_status||"none","select",maintenanceOptions)+
      websiteInput("syncMode","連動方式",item.sync_mode||"live_api","select",syncOptions)+
      websiteInput("profileEndpointUrl","公開情報API",item.profile_endpoint_url||"","url")+
      websiteInput("adapterVersion","ホームページ連動アダプター",item.adapter_version||"")+
      `<p class="form-section-title">公開する連動項目</p>`+
      websiteInput("dproSyncEnabled","DPROシステムとの連動を有効化",item.dpro_sync_enabled!==false,"checkbox")+
      websiteInput("businessHoursSyncEnabled","営業時間を連動",item.business_hours_sync_enabled!==false,"checkbox")+
      websiteInput("holidaySyncEnabled","休日・臨時休業を連動",item.holiday_sync_enabled!==false,"checkbox")+
      websiteInput("announcementSyncEnabled","公開お知らせを連動",item.announcement_sync_enabled!==false,"checkbox")+
      websiteInput("fallbackEnabled","API停止時はconfig.js表示へ戻す",item.fallback_enabled!==false,"checkbox");
    $("websiteEditorMessage").textContent="";
    $("websiteEditorBackdrop").classList.remove("hidden");
    $("websiteEditorModal").classList.remove("hidden");
  }

  function closeWebsiteEditor(){
    $("websiteEditorBackdrop").classList.add("hidden");
    $("websiteEditorModal").classList.add("hidden");
    state.websiteEditor=null;
  }

  async function saveWebsiteEditor(event){
    event.preventDefault();
    const form=event.currentTarget;
    const fd=new FormData(form);
    const item=state.websiteEditor?.item||{};
    const payload={
      websiteId:state.websiteEditor?.websiteId||null,
      clientId:fd.get("clientId"),
      siteId:item.site_id||null,
      systemInstanceId:fd.get("systemInstanceId"),
      websiteName:fd.get("websiteName"),
      publicUrl:fd.get("publicUrl"),
      platform:fd.get("platform"),
      publicationStatus:fd.get("publicationStatus"),
      maintenanceContractStatus:fd.get("maintenanceContractStatus"),
      syncMode:fd.get("syncMode"),
      profileEndpointUrl:fd.get("profileEndpointUrl"),
      adapterVersion:fd.get("adapterVersion"),
      dproSyncEnabled:form.elements.dproSyncEnabled.checked,
      businessHoursSyncEnabled:form.elements.businessHoursSyncEnabled.checked,
      holidaySyncEnabled:form.elements.holidaySyncEnabled.checked,
      announcementSyncEnabled:form.elements.announcementSyncEnabled.checked,
      fallbackEnabled:form.elements.fallbackEnabled.checked,
    };
    const button=$("websiteEditorSave");
    setBusy(button,true,"保存中…");
    try{
      const result=await api("/api/websites/configure",{method:"POST",headers:websiteHeaders(),body:JSON.stringify(payload)});
      closeWebsiteEditor();
      toast("ホームページ連動設定を保存しました。");
      await loadWebsiteOverview({skipAutoSync:true});
      if(result.website?.id&&payload.dproSyncEnabled&&payload.syncMode==="live_api"){
        const target=$(`[data-website-sync="${result.website.id}"]`);
        await runWebsiteSync(result.website.id,target,true);
      }
    }catch(error){
      $("websiteEditorMessage").textContent=error.data?.message||error.message||"保存できませんでした。";
    }finally{setBusy(button,false);}
  }

  async function runWebsiteSync(websiteId,button=null,silent=false){
    if(!canTechnicalWrite())return toast("技術管理権限が必要です。",true);
    setBusy(button,true,"同期中…");
    try{
      const result=await api("/api/websites/sync",{method:"POST",headers:websiteHeaders(),body:JSON.stringify({websiteId,runType:"manual"})});
      if(!silent)toast(result.status==="ok"?"ホームページ連動は正常です。":"ホームページ連動に要確認があります。",result.status==="error");
      await loadWebsiteOverview({skipAutoSync:true});
      return result;
    }catch(error){
      if(!silent)toast(error.data?.message||error.message||"同期確認に失敗しました。",true);
      throw error;
    }finally{setBusy(button,false);}
  }

  async function runAllWebsiteSync(silent=false){
    if(!canTechnicalWrite())return;
    const button=$("syncAllWebsites");
    setBusy(button,true,"同期中…");
    try{
      const result=await api("/api/websites/sync-all",{method:"POST",headers:websiteHeaders(),body:"{}"});
      if(!silent)toast(result.errors?`同期確認：${result.errors}件を確認してください。`:"すべてのホームページ連動は正常です。",Boolean(result.errors));
      await loadWebsiteOverview({skipAutoSync:true});
    }catch(error){
      if(!silent)toast(error.data?.message||error.message||"一括同期できませんでした。",true);
    }finally{setBusy(button,false);}
  }

  function bindWebsiteDynamicEvents(){
    $$("[data-website-sync]").forEach((button)=>button.onclick=()=>runWebsiteSync(button.dataset.websiteSync,button));
    $$("[data-website-edit]").forEach((button)=>button.onclick=()=>openWebsiteEditor(button.dataset.websiteEdit));
  }


  function productHeaders(){ return { authorization:`Bearer ${state.session?.access_token || ""}` }; }
  function productStatusTone(status){
    if(status==="production_ready")return "green";
    if(["adapter_ready","demo_connected"].includes(status))return "blue";
    if(status==="deferred_until_contract")return "";
    if(status==="needs_review")return "red";
    return "amber";
  }
  function switchProductTab(tab){
    state.productTab=tab;
    $$(".product-tab").forEach(b=>b.classList.toggle("active",b.dataset.productTab===tab));
    $$(".product-panel").forEach(p=>p.classList.toggle("hidden",p.id!==`product-panel-${tab}`));
  }
  async function loadProductOverview(){
    const result=await api("/api/products/overview",{headers:productHeaders()});
    state.product={summary:result.summary||{},products:result.products||[],standard:result.standard||{},policy:result.policy||{}};
    renderProductOverview();
  }
  function renderProductOverview(){
    const s=state.product.summary||{};
    const metrics=[
      [s.catalog_products||0,"製品台帳","現行DPRO製品"],
      [s.completed_products||0,"完成製品","営業・契約対象"],
      [s.production_ready||0,"本番連動済み","GREEN基準実装"],
      [s.adapter_prepared||0,"事前準備済み","デモ・アダプター"],
      [s.on_contract||0,"契約時対応","一斉改修しない"],
      [s.needs_review||0,"要確認","仕様整理"],
      [s.priority_demos||0,"優先デモ","営業で使用"],
    ];
    $("productMetricGrid").innerHTML=metrics.map(([v,l,n])=>`<article class="metric-card ${l==="要確認"&&Number(v)>0?"danger":""}"><b>${v}</b><span>${l}</span><small>${n}</small></article>`).join("");
    const categories=[...new Set(state.product.products.map(x=>x.category).filter(Boolean))];
    const select=$("productCategoryFilter"), current=select.value;
    select.innerHTML='<option value="all">すべてのカテゴリ</option>'+categories.map(x=>`<option value="${escapeHtml(x)}">${escapeHtml(x)}</option>`).join("");
    if(categories.includes(current))select.value=current;
    renderProductCatalog();renderProductStandard();renderProductRollout();switchProductTab(state.productTab);
  }
  function filteredProducts(){
    const q=String($("productSearch")?.value||"").trim().toLowerCase();
    const category=$("productCategoryFilter")?.value||"all";
    const status=$("productStatusFilter")?.value||"all";
    return state.product.products.filter(x=>(!q||`${x.product_name} ${x.system_code} ${x.product_code}`.toLowerCase().includes(q))&&(category==="all"||x.category===category)&&(status==="all"||x.integration_status===status));
  }
  function capabilityDots(x){
    const defs=[["H",x.health_contract_ready,"Health"],["V",x.version_contract_ready,"Version"],["R",x.support_recovery_ready,"Recovery"],["W",x.website_sync_ready,"Website"],["B",x.service_binding_ready,"Binding"],["C",x.system_check_ready,"Check"],["G",x.demo_guard_ready,"Guard"]];
    return `<div class="capability-dots">${defs.map(([k,v,t])=>`<span class="${v?"ready":""}" title="${t}">${k}</span>`).join("")}</div>`;
  }
  function renderProductCatalog(){
    const rows=filteredProducts();$("productResultCount").textContent=`${rows.length}件を表示`;
    $("productCatalogBoard").innerHTML=`<table><thead><tr><th>No.</th><th>製品</th><th>カテゴリ</th><th>連動方針</th><th>対応項目</th><th>次の作業</th><th>操作</th></tr></thead><tbody>${rows.map(x=>`<tr><td><strong>${x.product_number}</strong><br><span class="client-code">${escapeHtml(x.product_code)}</span></td><td><strong>${escapeHtml(x.product_name)}</strong><br><span class="client-code">${escapeHtml(x.system_code)}</span>${safeUrl(x.product_page_url)?`<br><a class="small-link" href="${escapeHtml(x.product_page_url)}" target="_blank" rel="noopener">製品ページ</a>`:""}${safeUrl(x.demo_url)?` <a class="small-link" href="${escapeHtml(x.demo_url)}" target="_blank" rel="noopener">デモ</a>`:""}</td><td>${escapeHtml(x.category)}</td><td>${pill(productIntegrationLabels[x.integration_status]||x.integration_status,productStatusTone(x.integration_status))}<br><span class="client-code">${x.integration_status==="deferred_until_contract"?"契約後に適用":"標準を維持"}</span></td><td>${capabilityDots(x)}</td><td>${escapeHtml(x.next_action||"—")}</td><td><button class="infra-action" data-product-manifest="${escapeHtml(x.system_code)}">標準書</button>${["owner_admin","technical_admin"].includes(state.staff?.role_key)?` <button class="infra-action" data-product-edit="${escapeHtml(x.system_code)}">編集</button>`:""}</td></tr>`).join("")||'<tr><td colspan="7">該当する製品はありません。</td></tr>'}</tbody></table>`;
    bindProductRowActions();
  }
  function renderProductStandard(){
    const s=state.product.standard||{};const required=Array.isArray(s.required_capabilities)?s.required_capabilities:[];const optional=Array.isArray(s.optional_capabilities)?s.optional_capabilities:[];
    $("productStandardBoard").innerHTML=`<div class="standard-grid"><article class="panel"><div class="panel-head"><div><h2>${escapeHtml(s.standard_name||"DPRO CONTROL ADAPTER 標準")}</h2><p>${escapeHtml(s.standard_code||"")} / ${escapeHtml(s.standard_version||"")}</p></div>${pill("有効","green")}</div><div class="standard-list"><h3>必須</h3>${required.map(x=>`<span>✓ ${escapeHtml(x)}</span>`).join("")}<h3>契約内容に応じて追加</h3>${optional.map(x=>`<span>＋ ${escapeHtml(x)}</span>`).join("")}</div></article><article class="panel"><div class="panel-head"><div><h2>適用ルール</h2><p>全製品を今すぐ変更しない安全な運用</p></div></div><ol class="rollout-steps"><li>契約成立</li><li>顧客専用環境を確定</li><li>対象製品を最新化</li><li>共通アダプターを適用</li><li>Service Binding・復旧・HP連動を必要分だけ設定</li><li>自動検査後に本番開始</li></ol></article></div>`;
  }
  function renderProductRollout(){
    const rows=filteredProducts();
    $("productRolloutBoard").innerHTML=`<table><thead><tr><th>製品</th><th>開始条件</th><th>進行</th><th>想定</th><th>チェック項目</th><th>次の作業</th></tr></thead><tbody>${rows.map(x=>`<tr><td><strong>${escapeHtml(x.product_name)}</strong><br>${escapeHtml(x.system_code)}</td><td>${x.trigger_policy==="on_contract"?"契約成立時":x.trigger_policy==="completed"?"完了済み":escapeHtml(x.trigger_policy||"—")}</td><td>${pill(rolloutStatusLabels[x.rollout_status]||x.rollout_status,statusTone(x.rollout_status))}</td><td>${escapeHtml(x.effort_level||"standard")}</td><td>${Array.isArray(x.checklist)?`${x.checklist.length}項目`:'—'}</td><td>${escapeHtml(x.next_action||"—")}</td></tr>`).join("")}</tbody></table>`;
  }
  function bindProductRowActions(){
    $$('[data-product-manifest]').forEach(b=>b.onclick=()=>openProductManifest(b.dataset.productManifest));
    $$('[data-product-edit]').forEach(b=>b.onclick=()=>openProductEditor(b.dataset.productEdit));
  }
  function openProductEditor(systemCode){
    const x=state.product.products.find(p=>p.system_code===systemCode);if(!x)return;state.productEditor=x;
    const form=$("productEditorForm");form.elements.systemCode.value=x.system_code;form.elements.systemCodeDisplay.value=x.system_code;form.elements.productName.value=x.product_name;form.elements.integrationStatus.value=x.integration_status;
    ["healthContractReady","versionContractReady","supportRecoveryReady","websiteSyncReady","serviceBindingReady","systemCheckReady","demoGuardReady"].forEach(k=>{form.elements[k].checked=Boolean(x[k.replace(/[A-Z]/g,m=>`_${m.toLowerCase()}`)]);});
    form.elements.currentAdapterVersion.value=x.current_adapter_version||"";form.elements.notes.value=x.integration_notes||"";$("productEditorMessage").textContent="";$("productEditorModal").classList.remove("hidden");$("productEditorModal").setAttribute("aria-hidden","false");
  }
  function closeProductEditor(){$("productEditorModal").classList.add("hidden");$("productEditorModal").setAttribute("aria-hidden","true");state.productEditor=null;}
  async function saveProductEditor(event){event.preventDefault();const form=event.currentTarget,code=form.elements.systemCode.value,button=$("productEditorSave");setBusy(button,true,"保存中…");try{const payload={integrationStatus:form.elements.integrationStatus.value,currentAdapterVersion:form.elements.currentAdapterVersion.value.trim(),notes:form.elements.notes.value.trim()};["healthContractReady","versionContractReady","supportRecoveryReady","websiteSyncReady","serviceBindingReady","systemCheckReady","demoGuardReady"].forEach(k=>payload[k]=form.elements[k].checked);await api(`/api/products/${encodeURIComponent(code)}/assess`,{method:"POST",headers:productHeaders(),body:JSON.stringify(payload)});closeProductEditor();await loadProductOverview();toast("製品連動状態を更新しました。");}catch(e){$("productEditorMessage").textContent=e.data?.message||e.message;}finally{setBusy(button,false);}}
  async function openProductManifest(systemCode){try{const result=await api(`/api/products/${encodeURIComponent(systemCode)}/manifest`,{headers:productHeaders()});$("productManifestTitle").textContent=`${result.manifest?.product?.productName||systemCode}｜共通アダプター適用情報`;$("productManifestValue").textContent=JSON.stringify(result.manifest,null,2);$("productManifestModal").classList.remove("hidden");$("productManifestModal").setAttribute("aria-hidden","false");}catch(e){toast(e.message||"標準書を取得できませんでした。",true);}}
  function closeProductManifest(){$("productManifestModal").classList.add("hidden");$("productManifestModal").setAttribute("aria-hidden","true");}

  async function loadTaskOverview() {
    const { data, error } = await state.supabase.from("cc_v_pending_work").select("*").order("due_at", { ascending: true, nullsFirst: false });
    if (error) throw error;
    $("taskOverview").innerHTML = `<table><thead><tr><th>タスク</th><th>顧客</th><th>区分</th><th>状態</th><th>優先度</th><th>期限</th><th>担当</th></tr></thead><tbody>${(data || []).map((item) => `<tr><td>${escapeHtml(item.title)}<br><span class="client-code">${escapeHtml(item.task_code)}</span></td><td>${escapeHtml(item.client_name || "DPRO内部")}</td><td>${escapeHtml(item.task_type)}</td><td>${pill(taskStatusLabels[item.status] || item.status, statusTone(item.status))}</td><td>${escapeHtml(priorityLabels[item.priority] || item.priority)}</td><td>${formatDate(item.due_at, true)}</td><td>${escapeHtml(item.assigned_name || "未割当")}</td></tr>`).join("") || '<tr><td colspan="7">未完了タスクはありません。</td></tr>'}</tbody></table>`;
  }

  async function loadSupportOverview() {
    const { data, error } = await state.supabase.from("cc_support_cases").select("*,cc_clients(display_name,client_code)").order("created_at", { ascending: false });
    if (error) throw error;
    $("supportOverview").innerHTML = `<table><thead><tr><th>案件</th><th>顧客</th><th>区分</th><th>状態</th><th>優先度</th><th>期限</th><th>データアクセス</th></tr></thead><tbody>${(data || []).map((item) => `<tr><td>${escapeHtml(item.subject)}<br><span class="client-code">${escapeHtml(item.case_code)}</span></td><td>${escapeHtml(item.cc_clients?.display_name || "—")}</td><td>${escapeHtml(item.category)}</td><td>${pill(item.status, statusTone(item.status))}</td><td>${escapeHtml(priorityLabels[item.priority] || item.priority)}</td><td>${formatDate(item.due_at, true)}</td><td>${item.data_access_required ? pill("要承認", "amber") : "不要"}</td></tr>`).join("") || '<tr><td colspan="7">サポート案件はありません。</td></tr>'}</tbody></table>`;
  }

  const viewMeta = {
    dashboard: ["ダッシュボード", "全顧客と運用状況を確認します"],
    clients: ["全顧客", "LINE公式運用のみを含む全契約先"],
    "client-detail": ["顧客詳細", "契約・接続・対応状況を確認します"],
    contracts: ["契約・サービス", "契約内容の確認"],
    line: ["LINE公式運用", "配信・制作・承認・販促設定・対応履歴"],
    systems: ["DPROシステム", "接続・バージョン・稼働状態"],
    products: ["製品・連動標準", "51製品台帳・共通アダプター・契約時適用"],
    websites: ["ホームページ", "営業時間・休日・お知らせの公開連動"],
    tasks: ["タスク・確認待ち", "対応期限と回答待ち"],
    support: ["サポート案件", "問い合わせと技術対応"],
    security: ["コード復旧・一時サポート", "本人確認・期限・監査付きの安全な運用"],
  };

  async function activateView(view) {
    state.currentView = view;
    $$(".view").forEach((element) => element.classList.add("hidden"));
    $(`view-${view}`)?.classList.remove("hidden");
    $$(".nav-button").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
    const [title, subtitle] = viewMeta[view] || ["DPRO SHOP 統合管理", ""];
    $("pageTitle").textContent = title;
    $("pageSubtitle").textContent = subtitle;
    closeSidebar();
    try {
      if (view === "line") await loadLineOverview();
      if (view === "systems") await loadInfrastructureOverview();
      if (view === "products") await loadProductOverview();
      if (view === "websites") await loadWebsiteOverview();
      if (view === "tasks") await loadTaskOverview();
      if (view === "support") await loadSupportOverview();
      if (view === "security") await loadSecurityOverview();
    } catch (error) {
      toast(error.message || "情報を取得できませんでした。", true);
    }
  }

  function openSidebar() {
    $("sidebar").classList.add("open");
    $("sidebarBackdrop").classList.remove("hidden");
    $("menuButton").setAttribute("aria-expanded", "true");
  }
  function closeSidebar() {
    $("sidebar").classList.remove("open");
    $("sidebarBackdrop").classList.add("hidden");
    $("menuButton").setAttribute("aria-expanded", "false");
  }

  function bindInfrastructureStaticEvents(){
    $$(".infrastructure-tab").forEach(button=>button.addEventListener("click",()=>switchInfrastructureTab(button.dataset.infraTab)));
    $$('[data-infra-new]').forEach(button=>button.addEventListener("click",()=>openInfraEditor(button.dataset.infraNew)));
    $$('[data-infra-close]').forEach(button=>button.addEventListener("click",closeInfraEditor));
    $("infraEditorForm")?.addEventListener("submit",saveInfraEditor);
    $("checkAllSystems")?.addEventListener("click",checkAllSystems);
  }

  function bindEvents() {
    bindInfrastructureStaticEvents();
    $$('[data-toggle-password]').forEach((button) => button.addEventListener("click", () => {
      const input = $(button.dataset.togglePassword);
      const visible = input.type === "text";
      input.type = visible ? "password" : "text";
      button.textContent = visible ? "表示" : "非表示";
    }));
    $$('[data-clear-input]').forEach((button) => button.addEventListener("click", () => {
      const input = $(button.dataset.clearInput);
      input.value = "";
      input.focus();
    }));
    $$('[data-sign-out]').forEach((button) => button.addEventListener("click", signOut));

    $("bootstrapForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      setMessage("bootstrapMessage", "");
      const password = $("bootstrapPassword").value;
      if (password !== $("bootstrapPasswordConfirm").value) {
        setMessage("bootstrapMessage", "確認用パスワードが一致しません。");
        return;
      }
      const button = $("bootstrapSubmit");
      setBusy(button, true, "登録しています…");
      try {
        await api("/api/bootstrap", {
          method: "POST",
          body: JSON.stringify({
            displayName: $("bootstrapName").value.trim(),
            email: $("bootstrapEmail").value.trim(),
            bootstrapCode: $("bootstrapCode").value,
            password,
          }),
        });
        setMessage("bootstrapMessage", "管理者を登録しました。ログインして二段階認証を設定します。", true);
        $("loginEmail").value = $("bootstrapEmail").value.trim();
        $("loginPassword").value = password;
        showOnly("loginScreen");
        toast("最初の管理者を登録しました。ログインしてください。");
      } catch (error) {
        setMessage("bootstrapMessage", error.data?.message || error.message || "登録できませんでした。");
      } finally { setBusy(button, false); }
    });

    $("loginForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      setMessage("loginMessage", "");
      const button = $("loginSubmit");
      setBusy(button, true, "確認しています…");
      try {
        const { data, error } = await state.supabase.auth.signInWithPassword({
          email: $("loginEmail").value.trim(),
          password: $("loginPassword").value,
        });
        if (error) throw error;
        state.session = data.session;
        state.user = data.user;
        await evaluateAuthentication();
      } catch (error) {
        setMessage("loginMessage", /Invalid login credentials/i.test(error.message) ? "メールアドレスまたはパスワードが正しくありません。" : error.message);
      } finally { setBusy(button, false); }
    });

    $("mfaEnrollForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const code = $("mfaEnrollCode").value.trim();
      if (!code) return setMessage("mfaEnrollMessage", "認証コードを入力してください。");
      const button = $("mfaEnrollSubmit");
      setBusy(button, true, "確認しています…");
      setMessage("mfaEnrollMessage", "");
      try {
        const { error } = await state.supabase.auth.mfa.challengeAndVerify({ factorId: state.mfaEnrollFactorId, code });
        if (error) throw error;
        toast("二段階認証を有効化しました。");
        await evaluateAuthentication();
      } catch (error) {
        setMessage("mfaEnrollMessage", "コードを確認できませんでした。認証アプリの最新コードを入力してください。");
      } finally { setBusy(button, false); }
    });

    $("mfaChallengeForm").addEventListener("submit", async (event) => {
      event.preventDefault();
      const code = $("mfaChallengeCode").value.trim();
      if (!code) return setMessage("mfaChallengeMessage", "認証コードを入力してください。");
      const button = $("mfaChallengeSubmit");
      setBusy(button, true, "確認しています…");
      try {
        const { error } = await state.supabase.auth.mfa.challengeAndVerify({ factorId: state.mfaFactorId, code });
        if (error) throw error;
        await evaluateAuthentication();
      } catch {
        setMessage("mfaChallengeMessage", "認証コードを確認できませんでした。最新コードを入力してください。");
      } finally { setBusy(button, false); }
    });

    $("copyMfaSecret").addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText($("mfaSecret").value);
        toast("手動入力用キーをコピーしました。");
      } catch { toast("コピーできませんでした。", true); }
    });

    $$("[data-line-new]").forEach((button) => button.addEventListener("click", () => openLineEditor(button.dataset.lineNew)));
    $$("[data-line-close]").forEach((button) => button.addEventListener("click", closeLineEditor));
    $("lineEditorForm").addEventListener("submit", saveLineEditor);
    $$(".line-tab").forEach((button) => button.addEventListener("click", () => activateLineTab(button.dataset.lineTab)));
    ["lineSearch","lineAccountFilter","lineCampaignStatusFilter","lineApprovalFilter"].forEach((id) => {
      const element = $(id); if (!element) return;
      element.addEventListener(id === "lineSearch" ? "input" : "change", renderActiveLineTab);
    });
    $("refreshLineOps").addEventListener("click", async () => { const button = $("refreshLineOps"); setBusy(button,true,"更新中…"); try { await loadLineOverview(); toast("LINE運用情報を更新しました。"); } catch(error){ toast(error.message||"更新できませんでした。",true); } finally { setBusy(button,false); } });
    $$(".product-tab").forEach((button)=>button.addEventListener("click",()=>switchProductTab(button.dataset.productTab)));
    ["productSearch","productCategoryFilter","productStatusFilter"].forEach(id=>{const el=$(id);if(el)el.addEventListener(id==="productSearch"?"input":"change",()=>{renderProductCatalog();renderProductRollout();});});
    $("refreshProducts")?.addEventListener("click",async()=>{const button=$("refreshProducts");setBusy(button,true,"更新中…");try{await loadProductOverview();toast("製品台帳を更新しました。");}catch(e){toast(e.message,true);}finally{setBusy(button,false);}});
    $$('[data-product-close]').forEach(b=>b.addEventListener("click",closeProductEditor));
    $("productEditorForm")?.addEventListener("submit",saveProductEditor);
    $$('[data-manifest-close]').forEach(b=>b.addEventListener("click",closeProductManifest));
    $("copyProductManifest")?.addEventListener("click",async()=>{try{await navigator.clipboard.writeText($("productManifestValue").textContent);toast("共通アダプター適用情報をコピーしました。");}catch{toast("コピーできませんでした。",true);}});
    $$(".website-tab").forEach((button)=>button.addEventListener("click",()=>switchWebsiteTab(button.dataset.websiteTab)));
    $("refreshWebsites")?.addEventListener("click",async()=>{const button=$("refreshWebsites");setBusy(button,true,"更新中…");try{await loadWebsiteOverview({skipAutoSync:true});toast("ホームページ情報を更新しました。");}catch(error){toast(error.message||"更新できませんでした。",true);}finally{setBusy(button,false);}});
    $("syncAllWebsites")?.addEventListener("click",()=>runAllWebsiteSync(false));
    $("newWebsite")?.addEventListener("click",()=>openWebsiteEditor(null));
    $$("[data-website-close]").forEach((button)=>button.addEventListener("click",closeWebsiteEditor));
    $("websiteEditorForm")?.addEventListener("submit",saveWebsiteEditor);
    $$("[data-security-new]").forEach((button) => button.addEventListener("click", () => openSecurityEditor(button.dataset.securityNew)));
    $$("[data-security-close]").forEach((button) => button.addEventListener("click", closeSecurityEditor));
    $("securityEditorForm")?.addEventListener("submit", saveSecurityEditor);
    $$(".security-tab").forEach((button) => button.addEventListener("click", () => switchSecurityTab(button.dataset.securityTab)));
    $("refreshSecurity")?.addEventListener("click", async () => { const button=$("refreshSecurity");setBusy(button,true,"更新中…");try{await loadSecurityOverview();toast("安全サポート情報を更新しました。");}catch(e){toast(e.message,true);}finally{setBusy(button,false);}});
    $$("[data-code-close]").forEach((button) => button.addEventListener("click", closeOneTimeCode));
    $("copyOneTimeCode")?.addEventListener("click", async () => { try{await navigator.clipboard.writeText($("oneTimeCodeValue").textContent);toast("一時コードをコピーしました。");}catch{toast("コピーできませんでした。",true);} });
    $$("[data-summary-close]").forEach((button) => button.addEventListener("click", closeSupportSummary));
    $$(".nav-button").forEach((button) => button.addEventListener("click", () => activateView(button.dataset.view)));
    $$('[data-go-view]').forEach((button) => button.addEventListener("click", () => activateView(button.dataset.goView)));
    $("clientSearch").addEventListener("input", renderClientGrid);
    $("clientStatusFilter").addEventListener("change", renderClientGrid);
    $("clientServiceFilter").addEventListener("change", renderClientGrid);
    $("backToClients").addEventListener("click", () => activateView("clients"));
    $("refreshDashboard").addEventListener("click", async () => {
      const button = $("refreshDashboard");
      setBusy(button, true, "更新中…");
      try { await loadClients(); await loadDashboard(); toast("最新情報へ更新しました。"); }
      catch (error) { toast(error.message || "更新できませんでした。", true); }
      finally { setBusy(button, false); }
    });
    $("menuButton").addEventListener("click", () => $("sidebar").classList.contains("open") ? closeSidebar() : openSidebar());
    $("sidebarBackdrop").addEventListener("click", closeSidebar);
  }

  async function init() {
    bindEvents();
    setLoading("CONTROL CENTERへ接続しています…");
    try {
      await initializeClient();
      await evaluateAuthentication();
    } catch (error) {
      console.error(error);
      showOnly("loginScreen");
      setMessage("loginMessage", `${error.message || "初期化に失敗しました。"} 接続確認を開いて設定を確認してください。`);
    }
  }

  window.addEventListener("DOMContentLoaded", init);
})();
