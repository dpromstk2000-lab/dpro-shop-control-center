(() => {
  "use strict";

  const CONFIG = window.DPRO_CONTROL_CENTER_CONFIG || {};
  const CENTER3_BUILD = "CONTROL-CENTER-11-CENTER3-R1-20260809";
  const $ = (id) => document.getElementById(id);
  const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));

  const state = {
    supabase: null,
    session: null,
    staff: null,
    clients: [],
    contracts: [],
    systems: [],
    projects: [],
    standardItems: [],
    standardVersion: null,
    features: [],
    rollout: [],
    rolloutSummary: [],
    currentTab: "projects",
    currentProject: null,
  };

  const projectStatusLabels = {
    preparing: "準備中",
    in_progress: "制作中",
    waiting_client: "オーナー確認待ち",
    ready_for_review: "最終確認待ち",
    approved: "納品承認済み",
    live: "本番稼働",
    paused: "一時停止",
    cancelled: "中止",
  };

  const stepStatusLabels = {
    not_started: "未着手",
    in_progress: "作業中",
    waiting_client: "オーナー確認待ち",
    waiting_internal: "社内確認待ち",
    done: "完了",
    warning: "要確認",
    error: "エラー",
    not_applicable: "対象外",
  };

  const checkStatusLabels = {
    not_started: "未確認",
    in_progress: "確認中",
    done: "完了",
    warning: "要確認",
    error: "エラー",
    not_applicable: "対象外",
  };

  const rolloutLabels = {
    waiting_contract: "契約待ち",
    planned: "計画",
    in_progress: "対応中",
    ready: "適用準備済み",
    completed: "完了",
    on_hold: "保留",
    not_applicable: "対象外",
  };

  const roleLabels = {
    owner_admin: "管理責任者",
    technical_admin: "技術管理者",
    support: "DPROサポート",
    read_only: "閲覧専用",
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
    ["loadingScreen", "authScreen", "errorScreen", "app"].forEach((screenId) => {
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
    toast.timer = setTimeout(() => el.classList.add("hidden"), 3500);
  }

  function formatDate(value, time = false) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat("ja-JP", time
      ? { year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit" }
      : { year:"numeric", month:"2-digit", day:"2-digit" }
    ).format(date);
  }

  function formatDateInput(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function statusTone(status) {
    if (["done","completed","approved","live","ready"].includes(status)) return "green";
    if (["in_progress","ready_for_review","planned"].includes(status)) return "blue";
    if (["warning","waiting_client","waiting_internal","preparing","waiting_contract","on_hold"].includes(status)) return "amber";
    if (["error","cancelled"].includes(status)) return "red";
    return "";
  }

  function pill(text, tone = "") {
    return `<span class="pill ${tone}">${escapeHtml(text)}</span>`;
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

    const { data, error } = await state.supabase.auth.getSession();
    if (error) throw error;
    state.session = data.session;
    if (!state.session?.user) {
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
    $("newProjectButton").classList.toggle("hidden", !canWrite());
    return true;
  }

  async function loadBaseData() {
    const [
      clientsResult,
      contractsResult,
      systemsResult,
      projectResult,
      standardResult,
      versionResult,
      featureResult,
      rolloutResult,
      rolloutSummaryResult,
    ] = await Promise.all([
      state.supabase.from("cc_clients").select("id,client_code,display_name,status").order("display_name"),
      state.supabase.from("cc_contracts").select("id,client_id,contract_code,contract_name,status").order("created_at",{ascending:false}),
      state.supabase.from("cc_system_instances").select("id,client_id,system_code,system_name,status,facility_code").order("created_at",{ascending:false}),
      state.supabase.from("cc_v_delivery_project_overview").select("*").order("updated_at",{ascending:false}),
      state.supabase.from("cc_v_standard_current_items").select("*").order("sort_order"),
      state.supabase.from("cc_standard_versions").select("id,standard_code,version_code,title,status,effective_date").eq("status","current").order("effective_date",{ascending:false}).limit(1).maybeSingle(),
      state.supabase.from("cc_feature_catalog").select("*").eq("is_active",true).order("sort_order"),
      state.supabase.from("cc_standard_rollout_targets").select("*").order("rollout_name").order("system_code"),
      state.supabase.from("cc_v_standard_rollout_summary").select("*").order("rollout_name"),
    ]);

    for (const result of [clientsResult, contractsResult, systemsResult, projectResult, standardResult, versionResult, featureResult, rolloutResult, rolloutSummaryResult]) {
      if (result.error) throw result.error;
    }

    state.clients = clientsResult.data || [];
    state.contracts = contractsResult.data || [];
    state.systems = systemsResult.data || [];
    state.projects = projectResult.data || [];
    state.standardItems = standardResult.data || [];
    state.standardVersion = versionResult.data || null;
    state.features = featureResult.data || [];
    state.rollout = rolloutResult.data || [];
    state.rolloutSummary = rolloutSummaryResult.data || [];

    $("sideStandard").textContent = state.standardVersion?.version_code || "未設定";
    $("standardVersionPill").textContent = state.standardVersion?.version_code || "未設定";

    renderAll();
    prepareProjectForm();
  }

  function renderAll() {
    renderMetrics();
    renderProjects();
    renderStandard();
    renderRollout();
    switchTab(state.currentTab);
  }

  function renderMetrics() {
    const total = state.projects.length;
    const live = state.projects.filter((p) => p.status === "live").length;
    const active = state.projects.filter((p) => ["preparing","in_progress","waiting_client","ready_for_review"].includes(p.status)).length;
    const blocked = state.projects.filter((p) => Number(p.blocking_steps_open || 0) + Number(p.blocking_checks_open || 0) > 0).length;
    const ready = state.projects.filter((p) => p.ready_for_delivery).length;
    const waiting = state.projects.filter((p) => p.status === "waiting_client").length;

    const metrics = [
      [total, "制作登録", "契約者・本番制作", ""],
      [active, "制作中", "準備・作業・確認中", active ? "warning" : ""],
      [ready, "納品可能", "必須チェック完了", ""],
      [blocked, "未完了あり", "必須STEP・標準", blocked ? "warning" : ""],
      [waiting, "回答待ち", "オーナー確認", waiting ? "warning" : ""],
      [live, "本番稼働", "納品済み", ""],
    ];

    $("metricGrid").innerHTML = metrics.map(([value,label,note,tone]) =>
      `<article class="metric ${tone}"><b>${Number(value || 0)}</b><span>${escapeHtml(label)}</span><small>${escapeHtml(note)}</small></article>`
    ).join("");
  }

  function filteredProjects() {
    const q = String($("projectSearch")?.value || "").trim().toLowerCase();
    const status = $("projectStatusFilter")?.value || "all";
    return state.projects.filter((p) => {
      if (status !== "all" && p.status !== status) return false;
      const hay = `${p.project_code} ${p.project_name} ${p.client_name} ${p.client_code} ${p.system_name || ""} ${p.system_code || ""}`.toLowerCase();
      return !q || hay.includes(q);
    });
  }

  function projectProgress(p) {
    const total = Number(p.total_steps || 0) + Number(p.total_checks || 0);
    const done = Number(p.done_steps || 0) + Number(p.done_checks || 0);
    return total ? Math.round((done / total) * 100) : 0;
  }

  function renderProjects() {
    const rows = filteredProjects();
    $("projectResultCount").textContent = `${rows.length}件`;

    $("projectGrid").innerHTML = rows.length ? rows.map((p) => {
      const progress = projectProgress(p);
      const open = Number(p.blocking_steps_open || 0) + Number(p.blocking_checks_open || 0);
      const cardClass = p.ready_for_delivery ? "ready" : open ? "attention" : "";
      return `
        <article class="project-card ${cardClass}">
          <div class="project-head">
            <div>
              <span class="project-code">${escapeHtml(p.project_code)}</span>
              <h2>${escapeHtml(p.client_name)}</h2>
              <p>${escapeHtml(p.project_name)}${p.system_name ? `・${escapeHtml(p.system_name)}` : ""}</p>
            </div>
            ${pill(projectStatusLabels[p.status] || p.status, statusTone(p.status))}
          </div>
          <div class="progress-block">
            <div class="progress-row"><span>DPRO標準＋制作STEP</span><strong>${progress}%</strong></div>
            <div class="progress-track"><span style="width:${Math.min(100,Math.max(0,progress))}%"></span></div>
          </div>
          <div class="project-stats">
            <div><b>${p.done_steps || 0}/${p.total_steps || 0}</b><span>制作STEP</span></div>
            <div><b>${p.done_checks || 0}/${p.total_checks || 0}</b><span>標準チェック</span></div>
            <div><b>${open}</b><span>必須未完了</span></div>
          </div>
          <div class="project-actions">
            <button class="btn secondary" type="button" data-open-project="${p.id}">制作内容を開く</button>
            <span class="pill ${p.ready_for_delivery ? "green" : "amber"}">${p.ready_for_delivery ? "納品判定 OK" : "確認中"}</span>
          </div>
        </article>
      `;
    }).join("") : '<div class="empty">まだ制作プロジェクトがありません。<br>契約が決まったら「新しい制作を登録」から始めます。</div>';

    $$("[data-open-project]").forEach((button) => {
      button.onclick = () => openProject(button.dataset.openProject);
    });
  }

  function renderStandard() {
    const groups = new Map();
    state.standardItems.forEach((item) => {
      if (!groups.has(item.category)) groups.set(item.category, []);
      groups.get(item.category).push(item);
    });

    $("standardBoard").innerHTML = groups.size ? [...groups.entries()].map(([category, items]) => `
      <section class="standard-category">
        <h3>${escapeHtml(category)} <span class="pill">${items.length}項目</span></h3>
        <div class="standard-list">
          ${items.map((item) => `
            <article class="standard-item">
              <strong>${escapeHtml(item.item_name)}</strong>
              <p>${escapeHtml(item.description || "")}</p>
              <footer>
                ${pill(item.requirement_type === "required" ? "必須" : item.requirement_type === "conditional" ? "条件付き" : "推奨", item.requirement_type === "required" ? "green" : "")}
                ${item.condition_feature_code ? pill(`条件: ${item.condition_feature_code}`) : ""}
                ${item.is_blocking_delivery ? pill("納品判定対象","amber") : ""}
              </footer>
            </article>
          `).join("")}
        </div>
      </section>
    `).join("") : '<div class="empty">DPRO STANDARDを取得できませんでした。</div>';
  }

  function renderRollout() {
    const completed = state.rollout.filter((x) => x.status === "completed").length;
    const progress = state.rollout.filter((x) => x.status === "in_progress").length;
    const waiting = state.rollout.filter((x) => ["waiting_contract","planned","ready"].includes(x.status)).length;

    $("rolloutSummary").innerHTML = [
      [state.rollout.length,"対象"],
      [completed,"完了"],
      [progress,"対応中"],
      [waiting,"未完了"],
    ].map(([v,l]) => `<article><b>${v}</b><span>${l}</span></article>`).join("");

    $("rolloutBoard").innerHTML = state.rollout.length ? `
      <table>
        <thead><tr><th>横展開</th><th>標準項目</th><th>対象システム</th><th>状態</th><th>完了日</th><th>備考</th></tr></thead>
        <tbody>
          ${state.rollout.map((x) => `
            <tr>
              <td><strong>${escapeHtml(x.rollout_name)}</strong><br>${escapeHtml(x.rollout_code)}</td>
              <td>${escapeHtml(x.standard_item_code)}</td>
              <td><strong>${escapeHtml(x.system_code)}</strong></td>
              <td>${pill(rolloutLabels[x.status] || x.status, statusTone(x.status))}</td>
              <td>${formatDate(x.completed_at)}</td>
              <td>${escapeHtml(x.note || "—")}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    ` : '<div class="empty">横展開対象はまだ登録されていません。既存の「製品・連動標準」を基準に、CENTER-3以降で標準項目ごとの横展開を登録できます。</div>';
  }

  function switchTab(tab) {
    state.currentTab = tab;
    $$(".tab").forEach((button) => button.classList.toggle("active", button.dataset.tab === tab));
    $$(".tab-panel").forEach((panel) => panel.classList.add("hidden"));
    $(`panel-${tab}`)?.classList.remove("hidden");
  }

  function prepareProjectForm() {
    const selectableClients = state.clients.filter((x) => x.status !== "ended");
    $("formClient").innerHTML = '<option value="">契約者を選択</option>' +
      selectableClients.map((x) => `<option value="${x.id}">${escapeHtml(x.display_name)}（${escapeHtml(x.client_code)}）</option>`).join("");
    updateContractAndSystemOptions();
  }

  function updateContractAndSystemOptions() {
    const clientId = $("formClient").value;
    const contracts = state.contracts.filter((x) => x.client_id === clientId);
    const systems = state.systems.filter((x) => x.client_id === clientId);

    $("formContract").innerHTML = '<option value="">未指定</option>' +
      contracts.map((x) => `<option value="${x.id}">${escapeHtml(x.contract_name)}（${escapeHtml(x.contract_code)}）</option>`).join("");

    $("formSystem").innerHTML = '<option value="">未指定</option>' +
      systems.map((x) => `<option value="${x.id}">${escapeHtml(x.system_name)}（${escapeHtml(x.system_code)}）</option>`).join("");
  }

  function openNewProjectModal() {
    $("projectForm").reset();
    $("projectFormMessage").textContent = "";
    prepareProjectForm();
    $("projectModal").classList.remove("hidden");
  }

  function closeModals() {
    $("projectModal").classList.add("hidden");
    $("detailModal").classList.add("hidden");
  }

  async function createProject(event) {
    event.preventDefault();
    if (!canWrite()) return toast("編集権限がありません。", true);

    const clientId = $("formClient").value;
    const contractId = $("formContract").value || null;
    const systemId = $("formSystem").value || null;
    const projectName = $("formProjectName").value.trim();
    const deliveryDate = $("formDeliveryDate").value || null;

    if (!clientId || !projectName) {
      $("projectFormMessage").textContent = "契約者と制作名を入力してください。";
      return;
    }

    const submit = $("projectForm").querySelector('button[type="submit"]');
    submit.disabled = true;
    submit.textContent = "作成中…";
    $("projectFormMessage").textContent = "";

    try {
      const { data: projectId, error } = await state.supabase.rpc("cc_center1_create_delivery_project", {
        p_client_id: clientId,
        p_contract_id: contractId,
        p_system_instance_id: systemId,
        p_project_name: projectName,
        p_project_code: null,
        p_standard_version_code: state.standardVersion?.version_code || "V1.1",
      });
      if (error) throw error;

      if (deliveryDate && projectId) {
        const { error: updateError } = await state.supabase
          .from("cc_delivery_projects")
          .update({ target_delivery_date: deliveryDate, updated_by: state.staff.id })
          .eq("id", projectId);
        if (updateError) throw updateError;
      }

      closeModals();
      await loadBaseData();
      toast("制作プロジェクトを作成しました。");
      if (projectId) await openProject(projectId);
    } catch (error) {
      $("projectFormMessage").textContent = error.message || "制作プロジェクトを作成できませんでした。";
    } finally {
      submit.disabled = false;
      submit.textContent = "制作プロジェクトを作成";
    }
  }

  async function openProject(projectId) {
    setLoading("制作内容とDPRO標準を読み込んでいます…");
    try {
      const overview = state.projects.find((p) => p.id === projectId);
      if (!overview) throw new Error("制作プロジェクトが見つかりません。");

      const [projectResult, featureResult, stepResult, checkResult] = await Promise.all([
        state.supabase.from("cc_delivery_projects").select("*").eq("id", projectId).single(),
        state.supabase.from("cc_delivery_project_features").select("*").eq("project_id", projectId),
        state.supabase.from("cc_delivery_steps").select("*").eq("project_id", projectId).order("sort_order"),
        state.supabase.from("cc_delivery_checks").select("*").eq("project_id", projectId),
      ]);
      for (const r of [projectResult, featureResult, stepResult, checkResult]) if (r.error) throw r.error;

      state.currentProject = {
        overview,
        project: projectResult.data,
        projectFeatures: featureResult.data || [],
        steps: stepResult.data || [],
        checks: checkResult.data || [],
      };

      renderProjectDetail();
      showOnly("app");
      $("detailModal").classList.remove("hidden");
    } catch (error) {
      showOnly("app");
      toast(error.message || "制作内容を取得できませんでした。", true);
    }
  }

  function featureDefinitionMap() {
    return new Map(state.features.map((f) => [f.feature_code, f]));
  }

  function standardItemMap() {
    return new Map(state.standardItems.map((i) => [i.standard_item_id, i]));
  }

  function renderProjectDetail() {
    const d = state.currentProject;
    const p = d.overview;
    const featureMap = featureDefinitionMap();
    const itemMap = standardItemMap();
    const open = Number(p.blocking_steps_open || 0) + Number(p.blocking_checks_open || 0);
    const progress = projectProgress(p);

    const featureHtml = d.projectFeatures
      .sort((a,b) => (featureMap.get(a.feature_code)?.sort_order || 999) - (featureMap.get(b.feature_code)?.sort_order || 999))
      .map((f) => {
        const def = featureMap.get(f.feature_code) || {};
        return `
          <article class="feature">
            <label>
              <input type="checkbox" data-feature="${escapeHtml(f.feature_code)}" ${f.enabled ? "checked" : ""} ${canWrite() ? "" : "disabled"}>
              ${escapeHtml(def.feature_name || f.feature_code)}
            </label>
            <small>${escapeHtml(def.description || "")}</small>
          </article>
        `;
      }).join("");

    const stepOptions = Object.entries(stepStatusLabels).map(([value,label]) => `<option value="${value}">${label}</option>`).join("");
    const stepHtml = d.steps.map((s) => `
      <article class="step-row">
        <div><strong>${escapeHtml(s.step_name)}</strong><small>${escapeHtml(s.step_code)}</small></div>
        <select data-step-status="${s.id}" ${canWrite() ? "" : "disabled"}>${stepOptions.replace(`value="${s.status}"`, `value="${s.status}" selected`)}</select>
        <button class="save-mini" type="button" data-save-step="${s.id}" ${canWrite() ? "" : "disabled"}>保存</button>
      </article>
    `).join("");

    const checkOptions = Object.entries(checkStatusLabels).map(([value,label]) => `<option value="${value}">${label}</option>`).join("");
    const checks = d.checks
      .map((c) => ({...c, item: itemMap.get(c.standard_item_id)}))
      .sort((a,b) => (a.item?.sort_order || 9999) - (b.item?.sort_order || 9999));

    const checkHtml = checks.map((c) => `
      <article class="check-row">
        <div>
          <strong>${escapeHtml(c.item?.item_name || "標準項目")}</strong>
          <small>${escapeHtml(c.item?.category || "")}・${escapeHtml(c.item?.item_code || "")}${c.item?.condition_feature_code ? `・条件 ${escapeHtml(c.item.condition_feature_code)}` : ""}</small>
        </div>
        <select data-check-status="${c.id}" ${canWrite() ? "" : "disabled"}>${checkOptions.replace(`value="${c.status}"`, `value="${c.status}" selected`)}</select>
        <button class="save-mini" type="button" data-save-check="${c.id}" ${canWrite() ? "" : "disabled"}>保存</button>
      </article>
    `).join("");

    $("detailContent").innerHTML = `
      <header class="detail-title">
        <span class="project-code">${escapeHtml(p.project_code)}</span>
        <h2 id="detailTitle">${escapeHtml(p.client_name)}｜${escapeHtml(p.project_name)}</h2>
        <p>${escapeHtml(p.system_name || "システム未指定")}・DPRO STANDARD ${escapeHtml(p.standard_version || "")}・更新 ${formatDate(p.updated_at,true)}</p>
      </header>

      <div class="detail-metrics">
        <article class="detail-metric"><b>${progress}%</b><span>総合進捗</span></article>
        <article class="detail-metric"><b>${p.done_steps || 0}/${p.total_steps || 0}</b><span>制作STEP</span></article>
        <article class="detail-metric"><b>${p.done_checks || 0}/${p.total_checks || 0}</b><span>DPRO標準</span></article>
        <article class="detail-metric"><b>${open}</b><span>必須未完了</span></article>
      </div>

      <div class="delivery-judge ${p.ready_for_delivery ? "ready" : ""}">
        <strong>${p.ready_for_delivery ? "✅ 納品判定：必須項目は完了しています" : `⚠ 納品判定：必須未完了 ${open}件`}</strong>
        <p>${p.ready_for_delivery ? "最終実機確認・オーナー確認など、実際の納品条件を確認して本番稼働へ進めます。" : "未完了の制作STEPまたはDPRO STANDARDを上から確認してください。"}</p>
      </div>

      <section class="detail-section">
        <div class="detail-section-head">
          <div><h3>制作案件の状態</h3><p class="lead">準備中から本番稼働まで、ここで進行状態を管理します。</p></div>
        </div>
        <div class="form-grid" style="margin-top:11px">
          <label>
            <span>現在の状態</span>
            <select id="projectStatusInput" ${canWrite() ? "" : "disabled"}>
              ${Object.entries(projectStatusLabels).map(([value,label]) => `<option value="${value}" ${d.project.status === value ? "selected" : ""}>${label}</option>`).join("")}
            </select>
          </label>
          <label>
            <span>納品予定日</span>
            <input id="projectDeliveryDateInput" type="date" value="${escapeHtml(formatDateInput(d.project.target_delivery_date))}" ${canWrite() ? "" : "disabled"}>
          </label>
          ${canWrite() ? '<button id="saveProjectMeta" class="btn primary full" type="button">制作状況を保存</button>' : ""}
        </div>
      </section>

      <section class="detail-section">
        <div class="detail-section-head">
          <div><h3>使用機能 / Feature Flag</h3><p class="lead">契約内容に合わせてON/OFFすると、条件付きチェックが自動調整されます。</p></div>
          ${canWrite() ? '<button id="refreshProjectRules" class="btn secondary" type="button">標準チェックを再生成</button>' : ""}
        </div>
        <div class="feature-grid">${featureHtml || '<div class="empty">Feature Flagがありません。</div>'}</div>
      </section>

      <section class="detail-section">
        <div class="detail-section-head"><div><h3>制作STEP</h3><p class="lead">契約から本番稼働までの進行状況。</p></div></div>
        <div class="step-list">${stepHtml || '<div class="empty">制作STEPがありません。</div>'}</div>
      </section>

      <section class="detail-section">
        <div class="detail-section-head"><div><h3>DPRO STANDARD</h3><p class="lead">この契約者へ良い商品を渡すための品質チェック。</p></div></div>
        <div class="check-list">${checkHtml || '<div class="empty">標準チェックがありません。</div>'}</div>
      </section>
    `;

    bindDetailActions();
  }

  function bindDetailActions() {
    $("saveProjectMeta")?.addEventListener("click", async () => {
      if (!canWrite()) return toast("編集権限がありません。", true);

      const projectId = state.currentProject.project.id;
      const currentOverview = state.currentProject.overview;
      const status = $("projectStatusInput").value;
      const targetDeliveryDate = $("projectDeliveryDateInput").value || null;

      if (["approved","live"].includes(status) && !currentOverview.ready_for_delivery) {
        toast("必須STEP・DPRO標準が完了するまで、納品承認・本番稼働には変更できません。", true);
        return;
      }

      const button = $("saveProjectMeta");
      button.disabled = true;
      button.textContent = "保存中…";

      try {
        const payload = {
          status,
          target_delivery_date: targetDeliveryDate,
          updated_by: state.staff.id,
        };

        if (status === "approved" && !state.currentProject.project.approved_at) {
          payload.approved_at = new Date().toISOString();
        }
        if (status === "live" && !state.currentProject.project.delivered_at) {
          payload.delivered_at = new Date().toISOString();
        }

        const { error } = await state.supabase
          .from("cc_delivery_projects")
          .update(payload)
          .eq("id", projectId);
        if (error) throw error;

        await loadBaseData();
        await openProject(projectId);
        toast("制作案件の状態を更新しました。");
      } catch (error) {
        toast(error.message || "制作案件を更新できませんでした。", true);
      } finally {
        button.disabled = false;
        button.textContent = "制作状況を保存";
      }
    });

    $$("[data-feature]", $("detailContent")).forEach((input) => {
      input.addEventListener("change", async () => {
        const projectId = state.currentProject.project.id;
        const featureCode = input.dataset.feature;
        input.disabled = true;
        try {
          const { error } = await state.supabase
            .from("cc_delivery_project_features")
            .update({
              enabled: input.checked,
              source: "dpro_setting",
              updated_by: state.staff.id,
            })
            .eq("project_id", projectId)
            .eq("feature_code", featureCode);
          if (error) throw error;

          const { error: rpcError } = await state.supabase.rpc("cc_center1_refresh_project", { p_project_id: projectId });
          if (rpcError) throw rpcError;

          await loadBaseData();
          await openProject(projectId);
          toast("Feature Flagと標準チェックを更新しました。");
        } catch (error) {
          input.checked = !input.checked;
          toast(error.message || "Feature Flagを更新できませんでした。", true);
          input.disabled = false;
        }
      });
    });

    $$("[data-save-step]", $("detailContent")).forEach((button) => {
      button.onclick = async () => {
        const id = button.dataset.saveStep;
        const select = document.querySelector(`[data-step-status="${id}"]`);
        const status = select.value;
        button.disabled = true;
        button.textContent = "保存中…";
        try {
          const payload = {
            status,
            updated_by: state.staff.id,
            completed_at: status === "done" ? new Date().toISOString() : null,
            started_at: status === "in_progress" ? new Date().toISOString() : undefined,
          };
          Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);
          const { error } = await state.supabase.from("cc_delivery_steps").update(payload).eq("id", id);
          if (error) throw error;
          const projectId = state.currentProject.project.id;
          await loadBaseData();
          await openProject(projectId);
          toast("制作STEPを更新しました。");
        } catch (error) {
          toast(error.message || "制作STEPを保存できませんでした。", true);
        } finally {
          button.disabled = false;
          button.textContent = "保存";
        }
      };
    });

    $$("[data-save-check]", $("detailContent")).forEach((button) => {
      button.onclick = async () => {
        const id = button.dataset.saveCheck;
        const select = document.querySelector(`[data-check-status="${id}"]`);
        const status = select.value;
        button.disabled = true;
        button.textContent = "保存中…";
        try {
          const { error } = await state.supabase
            .from("cc_delivery_checks")
            .update({
              status,
              checked_by: state.staff.id,
              checked_at: status === "not_started" ? null : new Date().toISOString(),
            })
            .eq("id", id);
          if (error) throw error;
          const projectId = state.currentProject.project.id;
          await loadBaseData();
          await openProject(projectId);
          toast("DPRO標準チェックを更新しました。");
        } catch (error) {
          toast(error.message || "標準チェックを保存できませんでした。", true);
        } finally {
          button.disabled = false;
          button.textContent = "保存";
        }
      };
    });

    $("refreshProjectRules")?.addEventListener("click", async () => {
      const projectId = state.currentProject.project.id;
      const button = $("refreshProjectRules");
      button.disabled = true;
      button.textContent = "更新中…";
      try {
        const { error } = await state.supabase.rpc("cc_center1_refresh_project", { p_project_id: projectId });
        if (error) throw error;
        await loadBaseData();
        await openProject(projectId);
        toast("DPRO STANDARDを最新状態に合わせました。");
      } catch (error) {
        toast(error.message || "標準チェックを再生成できませんでした。", true);
      } finally {
        button.disabled = false;
        button.textContent = "標準チェックを再生成";
      }
    });
  }

  async function refreshAll() {
    const button = $("refreshButton");
    button.disabled = true;
    button.textContent = "更新中…";
    try {
      await loadBaseData();
      toast("制作・納品情報を更新しました。");
    } catch (error) {
      toast(error.message || "更新できませんでした。", true);
    } finally {
      button.disabled = false;
      button.textContent = "最新情報に更新";
    }
  }

  function bindStaticEvents() {
    $$(".tab").forEach((button) => button.addEventListener("click", () => switchTab(button.dataset.tab)));
    $("projectSearch").addEventListener("input", renderProjects);
    $("projectStatusFilter").addEventListener("change", renderProjects);
    $("refreshButton").addEventListener("click", refreshAll);
    $("newProjectButton").addEventListener("click", openNewProjectModal);
    $("formClient").addEventListener("change", updateContractAndSystemOptions);
    $("projectForm").addEventListener("submit", createProject);
    $("retryButton").addEventListener("click", boot);
    $$("[data-close-modal]").forEach((button) => button.addEventListener("click", closeModals));
    ["projectModal","detailModal"].forEach((id) => {
      $(id).addEventListener("click", (event) => {
        if (event.target === $(id)) closeModals();
      });
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeModals();
    });
    $("menuButton").addEventListener("click", () => $("sidebar").classList.toggle("open"));
  }

  async function boot() {
    setLoading("ログイン状態とCENTER-1データを確認しています…");
    try {
      const ok = await initializeSupabase();
      if (!ok) return;
      await loadBaseData();
      showOnly("app");
    } catch (error) {
      $("errorText").textContent = error.message || "CENTER-1のDB設定と接続を確認してください。";
      showOnly("errorScreen");
    }
  }

  bindStaticEvents();
  boot();
})();
