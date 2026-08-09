(() => {
  "use strict";

  const CONFIG = window.DPRO_CONTROL_CENTER_CONFIG || {};
  const BUILD = "CONTROL-CENTER-15-CENTER3-20260809";
  const $ = (id) => document.getElementById(id);
  const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));

  const state = {
    supabase: null,
    session: null,
    staff: null,
    standardVersion: null,
    projects: [],
    templates: [],
    templateFeatures: [],
    features: [],
    implementations: [],
    current: null,
  };

  const roleLabels = {
    owner_admin: "管理責任者",
    technical_admin: "技術管理者",
    support: "DPROサポート",
    read_only: "閲覧専用",
  };

  const setupLabels = {
    draft: "未設定",
    recommended: "おすすめ適用済み",
    confirmed: "契約内容確定",
    locked: "確定・ロック",
  };

  const implementationLabels = {
    implemented: "実装済",
    standard_ready: "標準部品あり",
    contract_build: "契約時実装",
    planned: "実装予定",
    not_applicable: "対象外",
    unknown: "要確認",
  };

  const taskStatusLabels = {
    not_started: "未着手",
    in_progress: "作業中",
    waiting_client: "オーナー確認待ち",
    waiting_internal: "社内確認待ち",
    done: "完了",
    warning: "要確認",
    error: "エラー",
    not_applicable: "対象外",
  };

  const categoryLabels = {
    security: "認証・セキュリティ",
    customer: "お客様機能",
    operation: "店舗運用",
    integration: "外部連携",
    system: "業種専用",
    general: "共通",
  };

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function showOnly(id) {
    ["loadingScreen","authScreen","errorScreen","app"].forEach((screenId) => {
      $(screenId)?.classList.toggle("hidden", screenId !== id);
    });
  }

  function setLoading(message) {
    $("loadingText").textContent = message || "処理しています…";
    showOnly("loadingScreen");
  }

  function toast(message, error = false) {
    const el = $("toast");
    el.textContent = message;
    el.classList.toggle("error", error);
    el.classList.remove("hidden");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.add("hidden"), 3600);
  }

  function pill(text, tone = "") {
    return `<span class="pill ${tone}">${escapeHtml(text)}</span>`;
  }

  function toneForImplementation(status) {
    if (status === "implemented") return "green";
    if (status === "standard_ready") return "blue";
    if (["contract_build","planned"].includes(status)) return "amber";
    if (status === "not_applicable") return "red";
    return "";
  }

  function canWrite() {
    return ["owner_admin","technical_admin","support"].includes(state.staff?.role_key);
  }

  async function fetchPublicConfig() {
    const base = String(CONFIG.apiBaseUrl || "").replace(/\/$/, "");
    const response = await fetch(`${base}/api/public-config`, { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || data.error || `HTTP ${response.status}`);
    return data;
  }

  async function initializeSupabase() {
    const publicConfig = await fetchPublicConfig();
    if (!window.supabase?.createClient) throw new Error("Supabaseライブラリを読み込めませんでした。");

    state.supabase = window.supabase.createClient(
      publicConfig.supabaseUrl,
      publicConfig.supabasePublishableKey || publicConfig.supabaseAnonKey,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
          storageKey: publicConfig.sessionStorageKey || "dpro-control-center-auth-v1",
        },
      },
    );

    const { data: sessionData, error: sessionError } = await state.supabase.auth.getSession();
    if (sessionError) throw sessionError;
    state.session = sessionData.session;
    if (!state.session?.user) {
      showOnly("authScreen");
      return false;
    }

    const { data: aalData } = await state.supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aalData?.currentLevel !== "aal2") {
      showOnly("authScreen");
      return false;
    }

    const { data: staff, error: staffError } = await state.supabase
      .from("cc_staff")
      .select("id,display_name,email,role_key,status")
      .eq("auth_user_id", state.session.user.id)
      .maybeSingle();

    if (staffError) throw staffError;
    if (!staff || staff.status !== "active") {
      showOnly("authScreen");
      return false;
    }

    state.staff = staff;
    $("staffName").textContent = staff.display_name || "DPROスタッフ";
    $("staffRole").textContent = roleLabels[staff.role_key] || staff.role_key || "DPROスタッフ";
    $("staffInitial").textContent = (staff.display_name || "D").trim().charAt(0).toUpperCase() || "D";
    return true;
  }

  async function loadBaseData() {
    const [
      projectsResult,
      templatesResult,
      templateFeaturesResult,
      featuresResult,
      implementationsResult,
      standardResult,
    ] = await Promise.all([
      state.supabase.from("cc_v_contract_setup_overview").select("*").order("project_code"),
      state.supabase.from("cc_industry_templates").select("*").eq("status","current").order("template_name"),
      state.supabase.from("cc_v_industry_template_features").select("*").order("sort_order"),
      state.supabase.from("cc_feature_catalog").select("*").eq("is_active",true).order("sort_order"),
      state.supabase.from("cc_system_feature_implementations").select("*").order("system_code").order("feature_code"),
      state.supabase.from("cc_standard_versions").select("version_code,title,effective_date").eq("standard_code","DPRO_STANDARD").eq("status","current").order("effective_date",{ascending:false}).limit(1).maybeSingle(),
    ]);

    for (const result of [projectsResult, templatesResult, templateFeaturesResult, featuresResult, implementationsResult, standardResult]) {
      if (result.error) throw result.error;
    }

    state.projects = projectsResult.data || [];
    state.templates = templatesResult.data || [];
    state.templateFeatures = templateFeaturesResult.data || [];
    state.features = featuresResult.data || [];
    state.implementations = implementationsResult.data || [];
    state.standardVersion = standardResult.data || null;

    $("sideStandard").textContent = state.standardVersion?.version_code || "未設定";
    renderAll();
  }

  function renderAll() {
    renderMetrics();
    renderProjects();
  }

  function renderMetrics() {
    const total = state.projects.length;
    const confirmed = state.projects.filter((x) => ["confirmed","locked"].includes(x.setup_status)).length;
    const ready = state.projects.filter((x) => x.setup_ready).length;
    const openTasks = state.projects.reduce((sum,x) => sum + Number(x.feature_tasks_open || 0), 0);
    const dependencyIssues = state.projects.reduce((sum,x) => sum + Number(x.dependency_issues || 0), 0);
    const notSetup = state.projects.filter((x) => !x.setup_status || x.setup_status === "draft").length;

    const rows = [
      [total, "制作案件", "契約セットアップ対象", ""],
      [confirmed, "契約内容確定", "Feature確定済み", ""],
      [ready, "セットアップ完了", "制作タスク・依存問題なし", ""],
      [openTasks, "制作タスク", "標準部品・追加実装", openTasks ? "warning" : ""],
      [dependencyIssues, "依存関係", "不足Feature", dependencyIssues ? "danger" : ""],
      [notSetup, "未セットアップ", "契約時に確認", notSetup ? "warning" : ""],
    ];

    $("metricGrid").innerHTML = rows.map(([value,label,note,tone]) =>
      `<article class="metric ${tone}"><b>${Number(value || 0)}</b><span>${escapeHtml(label)}</span><small>${escapeHtml(note)}</small></article>`
    ).join("");
  }

  function filteredProjects() {
    const q = String($("projectSearch").value || "").trim().toLowerCase();
    const status = $("setupStatusFilter").value;
    const ready = $("readyFilter").value;

    return state.projects.filter((p) => {
      if (status !== "all" && (p.setup_status || "draft") !== status) return false;
      if (ready === "ready" && !p.setup_ready) return false;
      if (ready === "work" && p.setup_ready) return false;
      const hay = `${p.project_code || ""} ${p.project_name || ""} ${p.client_name || ""} ${p.client_code || ""} ${p.system_name || ""} ${p.system_code || ""} ${p.template_name || ""}`.toLowerCase();
      return !q || hay.includes(q);
    });
  }

  function renderProjects() {
    const rows = filteredProjects();
    $("resultCount").textContent = `${rows.length}件`;

    $("projectGrid").innerHTML = rows.length ? rows.map((p) => {
      const openTasks = Number(p.feature_tasks_open || 0);
      const issues = Number(p.dependency_issues || 0);
      const cls = p.setup_ready ? "ready" : (openTasks || issues) ? "attention" : "";
      return `
        <article class="project-card ${cls}">
          <div class="project-head">
            <div>
              <span class="project-code">${escapeHtml(p.project_code || "")}</span>
              <h2>${escapeHtml(p.client_name || "契約者")}</h2>
              <p>${escapeHtml(p.project_name || "")}<br>${escapeHtml(p.system_name || p.system_code || "DPRO製品未紐付け")}</p>
            </div>
            ${pill(setupLabels[p.setup_status || "draft"] || p.setup_status || "未設定", p.setup_ready ? "green" : "")}
          </div>
          <div class="project-stats">
            <div><b>${Number(p.enabled_features || 0)}</b><span>ON機能</span></div>
            <div><b>${openTasks}</b><span>制作タスク</span></div>
            <div><b>${issues}</b><span>依存問題</span></div>
          </div>
          <div class="project-actions">
            <button class="btn secondary" type="button" data-open-project="${escapeHtml(p.project_id)}">セットアップを開く</button>
            <a class="btn primary" href="delivery.html">制作・納品へ</a>
          </div>
        </article>
      `;
    }).join("") : `<div class="empty">契約セットアップ対象の制作案件はありません。<br>「新しい制作を登録」から契約者とDPRO製品を登録してください。</div>`;

    $$("[data-open-project]").forEach((button) => {
      button.addEventListener("click", () => openProject(button.dataset.openProject));
    });
  }

  function implementationFor(systemCode, featureCode) {
    return state.implementations.find((x) =>
      String(x.system_code || "").toUpperCase() === String(systemCode || "").toUpperCase() &&
      x.feature_code === featureCode
    ) || null;
  }

  function templatesFor(systemCode) {
    const code = String(systemCode || "").toUpperCase();
    return state.templates.filter((t) => !t.system_code || String(t.system_code).toUpperCase() === code);
  }

  function settingJson(row) {
    return row && typeof row.setting_json === "object" && row.setting_json ? { ...row.setting_json } : {};
  }

  function featureSettingHtml(featureCode, settings, enabled) {
    if (!enabled) return "";
    if (featureCode === "reservation") {
      const current = Number(settings.public_months || 3);
      return `<div class="feature-setting"><label>予約を見せる期間
        <select data-setting="public_months" data-feature-setting="${featureCode}">
          ${[2,3,4,5,6].map((m) => `<option value="${m}" ${m===current?"selected":""}>${m}か月先まで</option>`).join("")}
        </select>
      </label></div>`;
    }
    if (featureCode === "business_calendar") {
      const current = Number(settings.owner_edit_months || 12);
      return `<div class="feature-setting"><label>オーナーが編集できる期間
        <select data-setting="owner_edit_months" data-feature-setting="${featureCode}">
          ${[6,12,18].map((m) => `<option value="${m}" ${m===current?"selected":""}>${m}か月先まで</option>`).join("")}
        </select>
      </label></div>`;
    }
    if (featureCode === "customer_photo_share") {
      const checked = settings.share_requires_owner_approval !== false;
      return `<div class="feature-setting"><label class="check-setting">
        <input type="checkbox" data-setting="share_requires_owner_approval" data-feature-setting="${featureCode}" ${checked?"checked":""}>
        店舗が「共有可」にした写真だけ公開
      </label></div>`;
    }
    return "";
  }

  async function openProject(projectId) {
    setLoading("契約内容・Feature・実装状況を確認しています…");
    try {
      const overview = state.projects.find((x) => x.project_id === projectId);
      if (!overview) throw new Error("制作案件が見つかりません。");

      const [projectResult, setupResult, featuresResult, tasksResult, issuesResult] = await Promise.all([
        state.supabase.from("cc_delivery_projects").select("*").eq("id",projectId).single(),
        state.supabase.from("cc_delivery_project_setup").select("*").eq("project_id",projectId).maybeSingle(),
        state.supabase.from("cc_delivery_project_features").select("*").eq("project_id",projectId),
        state.supabase.from("cc_delivery_feature_tasks").select("*").eq("project_id",projectId).order("created_at"),
        state.supabase.from("cc_v_project_dependency_issues").select("*").eq("project_id",projectId),
      ]);

      for (const result of [projectResult, setupResult, featuresResult, tasksResult, issuesResult]) {
        if (result.error) throw result.error;
      }

      state.current = {
        overview,
        project: projectResult.data,
        setup: setupResult.data || null,
        projectFeatures: featuresResult.data || [],
        tasks: tasksResult.data || [],
        issues: issuesResult.data || [],
      };

      renderDetail();
      showOnly("app");
      $("detailModal").classList.remove("hidden");
      $("detailModal").setAttribute("aria-hidden","false");
    } catch (error) {
      showOnly("app");
      toast(error.message || "契約セットアップを取得できませんでした。", true);
    }
  }

  function renderDetail() {
    const d = state.current;
    const o = d.overview;
    const featureRows = new Map(d.projectFeatures.map((x) => [x.feature_code,x]));
    const availableTemplates = templatesFor(o.system_code);
    const selectedTemplate = d.setup?.template_code || o.template_code || "";
    const selectedTemplateInfo = state.templates.find((x) => x.template_code === selectedTemplate);
    const currentTemplateFeatureMap = new Map(
      state.templateFeatures.filter((x) => x.template_code === selectedTemplate).map((x) => [x.feature_code,x])
    );

    const featureHtml = [...state.features]
      .sort((a,b) => Number(a.sort_order || 999) - Number(b.sort_order || 999))
      .map((def) => {
        const row = featureRows.get(def.feature_code);
        const enabled = Boolean(row?.enabled);
        const settings = settingJson(row);
        const impl = implementationFor(o.system_code, def.feature_code);
        const implStatus = impl?.implementation_status || "unknown";
        const templateDef = currentTemplateFeatureMap.get(def.feature_code);
        const recommendation = templateDef?.recommendation_level || "";
        return `
          <article class="feature-card ${enabled ? "enabled" : ""}" data-feature-card="${escapeHtml(def.feature_code)}">
            <div class="feature-top">
              <input type="checkbox" data-feature-toggle="${escapeHtml(def.feature_code)}" ${enabled?"checked":""} ${canWrite()?"":"disabled"}>
              <div class="feature-title">
                <strong>${escapeHtml(def.feature_name)}</strong>
                <small>${escapeHtml(def.description || "")}</small>
              </div>
            </div>
            <div class="feature-badges">
              ${pill(categoryLabels[def.category] || def.category)}
              ${pill(implementationLabels[implStatus] || implStatus, toneForImplementation(implStatus))}
              ${recommendation ? pill(
                recommendation === "required" ? "推奨：必須" :
                recommendation === "recommended" ? "推奨：ON" :
                recommendation === "optional" ? "推奨：任意" : "推奨：OFF",
                recommendation === "required" ? "green" : recommendation === "recommended" ? "blue" : ""
              ) : ""}
            </div>
            ${featureSettingHtml(def.feature_code, settings, enabled)}
          </article>
        `;
      }).join("");

    const issueHtml = d.issues.length ? d.issues.map((x) => `
      <article class="issue-row">
        <div><strong>${escapeHtml(x.feature_name)} に必要な機能があります</strong><small>${escapeHtml(x.requires_feature_name)} をONにしてください。保存時に必須依存は自動ONになります。</small></div>
        ${pill("要確認","amber")}
      </article>
    `).join("") : `<div class="ready-banner">依存関係エラーはありません。</div>`;

    const taskOptions = Object.entries(taskStatusLabels).map(([value,label]) => `<option value="${value}">${label}</option>`).join("");
    const taskHtml = d.tasks.length ? d.tasks.map((t) => `
      <article class="task-row">
        <div>
          <strong>${escapeHtml(t.task_name)}</strong>
          <small>${escapeHtml(implementationLabels[t.implementation_status] || t.implementation_status)}・${escapeHtml(t.note || "")}</small>
        </div>
        <select data-task-status="${escapeHtml(t.id)}" ${canWrite()?"":"disabled"}>
          ${taskOptions.replace(`value="${t.status}"`,`value="${t.status}" selected`)}
        </select>
      </article>
    `).join("") : `<div class="ready-banner">追加制作タスクはありません。</div>`;

    const ready = Boolean(o.setup_ready);
    const openTasks = Number(o.feature_tasks_open || 0);
    const issues = Number(o.dependency_issues || 0);

    $("detailContent").innerHTML = `
      <header class="detail-title">
        <span class="project-code">${escapeHtml(o.project_code)}</span>
        <h2>${escapeHtml(o.client_name)}｜契約セットアップ</h2>
        <p>${escapeHtml(o.project_name || "")}・${escapeHtml(o.system_name || o.system_code || "DPRO製品未紐付け")}・DPRO STANDARD ${escapeHtml(o.standard_version || state.standardVersion?.version_code || "")}</p>
      </header>

      <div class="detail-metrics">
        <div class="detail-metric"><b>${Number(o.enabled_features || 0)}</b><span>ON機能</span></div>
        <div class="detail-metric"><b>${openTasks}</b><span>制作タスク</span></div>
        <div class="detail-metric"><b>${issues}</b><span>依存問題</span></div>
        <div class="detail-metric"><b>${ready ? "OK" : "—"}</b><span>セットアップ</span></div>
      </div>

      <section class="detail-section">
        <div class="section-head"><div><h3>1. 業種・製品おすすめ</h3><p>おすすめを基準にして、店舗ごとに不要機能をOFF、必要機能をONにします。</p></div>${pill(setupLabels[d.setup?.setup_status || o.setup_status || "draft"] || "未設定")}</div>
        <div class="template-bar">
          <select id="templateSelect" ${canWrite()?"":"disabled"}>
            <option value="">おすすめテンプレートを選択</option>
            ${availableTemplates.map((t) => `<option value="${escapeHtml(t.template_code)}" ${t.template_code===selectedTemplate?"selected":""}>${escapeHtml(t.template_name)}（${escapeHtml(t.version_code)}）</option>`).join("")}
          </select>
          <button id="applyTemplateButton" class="btn secondary" type="button" ${canWrite()?"":"disabled"}>おすすめを適用</button>
        </div>
        <div class="template-info">${escapeHtml(selectedTemplateInfo?.description || "DPRO共通基本、または対象システムのおすすめテンプレートを選択してください。")}</div>
      </section>

      <section class="detail-section">
        <div class="section-head"><div><h3>2. 利用機能を確定</h3><p>FeatureをON/OFFすると、必須依存機能と制作タスクをCENTER-2が自動同期します。</p></div></div>
        <div class="feature-grid">${featureHtml}</div>
        <div class="feature-actions"><button id="saveFeaturesButton" class="btn primary" type="button" ${canWrite()?"":"disabled"}>設定を保存・制作タスク更新</button></div>
      </section>

      <section class="detail-section">
        <div class="section-head"><div><h3>3. 依存関係</h3><p>必要な土台機能が不足していないか確認します。</p></div></div>
        <div class="issue-list">${issueHtml}</div>
      </section>

      <section class="detail-section">
        <div class="section-head"><div><h3>4. 制作タスク</h3><p>実装済みなら対象外、標準部品・契約時実装が必要なものだけ制作対象になります。</p></div></div>
        <div class="task-list">${taskHtml}</div>
        ${d.tasks.length && canWrite() ? `<div class="feature-actions"><button id="saveTasksButton" class="btn secondary" type="button">制作タスク状態を保存</button></div>` : ""}
      </section>

      <div class="ready-banner ${ready ? "" : "warning"}">
        ${ready
          ? "契約セットアップ完了。制作・納品工程へ進めます。"
          : `現在はセットアップ未完了です。制作タスク ${openTasks}件 / 依存問題 ${issues}件`}
      </div>

      <div class="detail-actions">
        <button id="refreshRulesButton" class="btn secondary" type="button">依存・制作タスクを再計算</button>
        <a class="btn secondary" href="delivery.html">制作・納品を開く</a>
        <button id="confirmSetupButton" class="btn primary" type="button" ${canWrite()?"":"disabled"}>契約セットアップを確定</button>
      </div>
    `;

    bindDetailEvents();
  }

  function collectFeaturePayload() {
    const existing = new Map(state.current.projectFeatures.map((x) => [x.feature_code,x]));
    return state.features.map((def) => {
      const toggle = document.querySelector(`[data-feature-toggle="${CSS.escape(def.feature_code)}"]`);
      const enabled = Boolean(toggle?.checked);
      const old = existing.get(def.feature_code);
      const settings = settingJson(old);

      const controls = $$(`[data-feature-setting="${CSS.escape(def.feature_code)}"]`);
      controls.forEach((control) => {
        const key = control.dataset.setting;
        if (!key) return;
        if (control.type === "checkbox") settings[key] = control.checked;
        else if (control.tagName === "SELECT" && /^-?\d+(\.\d+)?$/.test(control.value)) settings[key] = Number(control.value);
        else settings[key] = control.value;
      });

      return {
        project_id: state.current.project.id,
        feature_code: def.feature_code,
        enabled,
        setting_json: settings,
        source: "contract",
        updated_by: state.staff.id,
      };
    });
  }

  async function saveFeatures() {
    if (!canWrite()) return toast("編集権限がありません。", true);
    const button = $("saveFeaturesButton");
    button.disabled = true;
    button.textContent = "保存・同期中…";
    try {
      const payload = collectFeaturePayload();
      const { error } = await state.supabase
        .from("cc_delivery_project_features")
        .upsert(payload, { onConflict: "project_id,feature_code" });
      if (error) throw error;

      const { error: refreshError } = await state.supabase.rpc("cc_center2_refresh_project", {
        p_project_id: state.current.project.id,
      });
      if (refreshError) throw refreshError;

      await loadBaseData();
      await openProject(state.current.project.id);
      toast("利用機能・依存関係・制作タスクを更新しました。");
    } catch (error) {
      toast(error.message || "契約セットアップを保存できませんでした。", true);
      button.disabled = false;
      button.textContent = "設定を保存・制作タスク更新";
    }
  }

  async function applyTemplate() {
    if (!canWrite()) return toast("編集権限がありません。", true);
    const templateCode = $("templateSelect").value;
    if (!templateCode) return toast("おすすめテンプレートを選択してください。", true);
    const button = $("applyTemplateButton");
    button.disabled = true;
    button.textContent = "適用中…";
    try {
      const { error } = await state.supabase.rpc("cc_center2_apply_industry_template", {
        p_project_id: state.current.project.id,
        p_template_code: templateCode,
        p_overwrite: false,
      });
      if (error) throw error;

      await loadBaseData();
      await openProject(state.current.project.id);
      toast("業種・製品おすすめを適用しました。既存の契約者設定は保護しています。");
    } catch (error) {
      toast(error.message || "おすすめテンプレートを適用できませんでした。", true);
      button.disabled = false;
      button.textContent = "おすすめを適用";
    }
  }

  async function saveTasks() {
    if (!canWrite()) return;
    const updates = $$("[data-task-status]").map((select) => ({
      id: select.dataset.taskStatus,
      status: select.value,
    }));

    try {
      for (const item of updates) {
        const { error } = await state.supabase
          .from("cc_delivery_feature_tasks")
          .update({ status:item.status, updated_by:state.staff.id })
          .eq("id",item.id);
        if (error) throw error;
      }
      await loadBaseData();
      await openProject(state.current.project.id);
      toast("制作タスクの状態を保存しました。");
    } catch (error) {
      toast(error.message || "制作タスクを保存できませんでした。", true);
    }
  }

  async function refreshRules() {
    try {
      const { error } = await state.supabase.rpc("cc_center2_refresh_project", {
        p_project_id: state.current.project.id,
      });
      if (error) throw error;
      await loadBaseData();
      await openProject(state.current.project.id);
      toast("依存関係と制作タスクを再計算しました。");
    } catch (error) {
      toast(error.message || "再計算できませんでした。", true);
    }
  }

  async function confirmSetup() {
    if (!canWrite()) return;
    const button = $("confirmSetupButton");
    button.disabled = true;
    button.textContent = "確定中…";
    try {
      const { error } = await state.supabase.rpc("cc_center2_confirm_setup", {
        p_project_id: state.current.project.id,
      });
      if (error) throw error;
      await loadBaseData();
      await openProject(state.current.project.id);
      toast("契約セットアップを確定しました。");
    } catch (error) {
      toast(error.message || "契約セットアップを確定できませんでした。", true);
      button.disabled = false;
      button.textContent = "契約セットアップを確定";
    }
  }

  function bindDetailEvents() {
    $("applyTemplateButton")?.addEventListener("click", applyTemplate);
    $("saveFeaturesButton")?.addEventListener("click", saveFeatures);
    $("saveTasksButton")?.addEventListener("click", saveTasks);
    $("refreshRulesButton")?.addEventListener("click", refreshRules);
    $("confirmSetupButton")?.addEventListener("click", confirmSetup);

    $$("[data-feature-toggle]").forEach((input) => {
      input.addEventListener("change", () => {
        const card = input.closest(".feature-card");
        card?.classList.toggle("enabled", input.checked);
        const setting = card?.querySelector(".feature-setting");
        if (!input.checked && setting) setting.remove();
        if (input.checked && !setting) {
          const featureCode = input.dataset.featureToggle;
          const row = state.current.projectFeatures.find((x) => x.feature_code === featureCode);
          const html = featureSettingHtml(featureCode, settingJson(row), true);
          if (html) card.insertAdjacentHTML("beforeend", html);
        }
      });
    });
  }

  function closeDetail() {
    $("detailModal").classList.add("hidden");
    $("detailModal").setAttribute("aria-hidden","true");
    state.current = null;
  }

  async function refreshAll() {
    const button = $("refreshButton");
    button.disabled = true;
    button.textContent = "更新中…";
    try {
      await loadBaseData();
      toast("契約セットアップ情報を更新しました。");
    } catch (error) {
      toast(error.message || "更新できませんでした。", true);
    } finally {
      button.disabled = false;
      button.textContent = "最新情報に更新";
    }
  }

  function bindStaticEvents() {
    $("projectSearch").addEventListener("input", renderProjects);
    $("setupStatusFilter").addEventListener("change", renderProjects);
    $("readyFilter").addEventListener("change", renderProjects);
    $("refreshButton").addEventListener("click", refreshAll);
    $("retryButton").addEventListener("click", boot);
    $("menuButton").addEventListener("click", () => {
      $("sidebar").classList.toggle("open");
      $("sidebarBackdrop").classList.toggle("show");
      $("sidebarBackdrop").classList.toggle("hidden", !$("sidebar").classList.contains("open"));
    });
    $("sidebarBackdrop").addEventListener("click", () => {
      $("sidebar").classList.remove("open");
      $("sidebarBackdrop").classList.remove("show");
      $("sidebarBackdrop").classList.add("hidden");
    });
    $$("[data-close-modal]").forEach((button) => button.addEventListener("click", closeDetail));
    $("detailModal").addEventListener("click", (event) => {
      if (event.target === $("detailModal")) closeDetail();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeDetail();
    });
  }

  async function boot() {
    setLoading("ログイン状態とDPRO STANDARD V1.2を確認しています…");
    try {
      const ok = await initializeSupabase();
      if (!ok) return;
      await loadBaseData();
      showOnly("app");
    } catch (error) {
      console.error(BUILD, error);
      $("errorText").textContent = error.message || "CENTER-2のDB設定と接続を確認してください。";
      showOnly("errorScreen");
    }
  }

  bindStaticEvents();
  boot();
})();
