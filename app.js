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

    // CONTROL-CENTER-2ではDB側もAAL2を必須にするため、
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
    await Promise.all([loadDashboard(), loadClients()]);
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

  async function loadLineOverview() {
    const { data, error } = await state.supabase.from("cc_line_accounts").select("*,cc_clients(display_name,client_code),cc_sites(site_name)").order("next_delivery_at", { ascending: true, nullsFirst: false });
    if (error) throw error;
    $("lineOverview").innerHTML = (data || []).length ? data.map((item) => `<article class="summary-card"><h2>${escapeHtml(item.cc_clients?.display_name || item.account_name)}</h2><p>${escapeHtml(item.account_name)}・${escapeHtml(item.basic_id || "Basic ID未登録")}</p><p>権限 ${escapeHtml(item.permission_status)}／リッチメニュー ${escapeHtml(item.rich_menu_status)}／クーポン ${escapeHtml(item.coupon_status)}</p><p>次回配信 ${formatDate(item.next_delivery_at, true)}</p></article>`).join("") : '<div class="empty-state">LINE公式アカウントは未登録です。</div>';
  }

  async function loadSystemOverview() {
    const { data, error } = await state.supabase.from("cc_v_system_inventory").select("*").order("client_name");
    if (error) throw error;
    $("systemOverview").innerHTML = `<table><thead><tr><th>顧客</th><th>システム</th><th>環境</th><th>状態</th><th>Health</th><th>Worker</th><th>DB</th><th>Supabase</th></tr></thead><tbody>${(data || []).map((item) => `<tr><td>${escapeHtml(item.client_name)}<br><span class="client-code">${escapeHtml(item.client_code)}</span></td><td>${escapeHtml(item.system_name)}<br>${escapeHtml(item.facility_code)}</td><td>${escapeHtml(item.environment)}</td><td>${pill(systemStatusLabels[item.status] || item.status, statusTone(item.status))}</td><td>${pill(item.last_health_status, statusTone(item.last_health_status))}<br>${formatDate(item.last_health_checked_at, true)}</td><td>${escapeHtml(item.worker_version || "未確認")}</td><td>${escapeHtml(item.database_version || "未確認")}</td><td>${escapeHtml(item.supabase_project_name || "未登録")}</td></tr>`).join("") || '<tr><td colspan="8">登録済みシステムはありません。</td></tr>'}</tbody></table>`;
  }

  async function loadWebsiteOverview() {
    const { data, error } = await state.supabase.from("cc_websites").select("*,cc_clients(display_name,client_code)").order("created_at");
    if (error) throw error;
    $("websiteOverview").innerHTML = (data || []).length ? data.map((item) => `<article class="summary-card"><h2>${escapeHtml(item.cc_clients?.display_name || item.website_name)}</h2><p>${escapeHtml(item.website_name)}・${escapeHtml(item.platform)}</p><p>公開 ${escapeHtml(item.publication_status)}／休日連動 ${item.holiday_sync_enabled ? "ON" : "OFF"}／お知らせ連動 ${item.announcement_sync_enabled ? "ON" : "OFF"}</p><p>最終同期 ${formatDate(item.last_sync_at, true)}・${escapeHtml(item.last_sync_status)}</p>${safeUrl(item.public_url) ? `<a class="small-link" href="${escapeHtml(safeUrl(item.public_url))}" target="_blank" rel="noopener noreferrer">ホームページを開く</a>` : ""}</article>`).join("") : '<div class="empty-state">ホームページは未登録です。</div>';
  }

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
    line: ["LINE公式運用", "LINE公式の運用状況"],
    systems: ["DPROシステム", "接続・バージョン・稼働状態"],
    websites: ["ホームページ", "公開・自動連動状態"],
    tasks: ["タスク・確認待ち", "対応期限と回答待ち"],
    support: ["サポート案件", "問い合わせと技術対応"],
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
      if (view === "systems") await loadSystemOverview();
      if (view === "websites") await loadWebsiteOverview();
      if (view === "tasks") await loadTaskOverview();
      if (view === "support") await loadSupportOverview();
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

  function bindEvents() {
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

    $$(".nav-button").forEach((button) => button.addEventListener("click", () => activateView(button.dataset.view)));
    $$('[data-go-view]').forEach((button) => button.addEventListener("click", () => activateView(button.dataset.goView)));
    $("clientSearch").addEventListener("input", renderClientGrid);
    $("clientStatusFilter").addEventListener("change", renderClientGrid);
    $("clientServiceFilter").addEventListener("change", renderClientGrid);
    $("backToClients").addEventListener("click", () => activateView("clients"));
    $("refreshDashboard").addEventListener("click", async () => {
      const button = $("refreshDashboard");
      setBusy(button, true, "更新中…");
      try { await Promise.all([loadDashboard(), loadClients()]); toast("最新情報へ更新しました。"); }
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
