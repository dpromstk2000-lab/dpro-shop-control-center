(() => {
  "use strict";

  const CONFIG = window.DPRO_CONTROL_CENTER_CONFIG || {};
  const BUILD = "CONTROL-CENTER-18-CENTER6-20260809";
  const $ = (id) => document.getElementById(id);
  const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));

  const state = {
    supabase:null,
    session:null,
    staff:null,
    currentStandard:null,
    projects:[],
    templates:[],
    templateFeatures:[],
    implementations:[],
    selectedProjectId:"",
  };

  const roleLabels = {
    owner_admin:"管理責任者",
    technical_admin:"技術管理者",
    support:"DPROサポート",
    read_only:"閲覧専用",
  };

  const setupLabels = {
    draft:"未設定",
    recommended:"おすすめ適用済み",
    confirmed:"契約内容確定",
    locked:"確定・ロック",
  };

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }

  function showOnly(id) {
    ["loadingScreen","authScreen","errorScreen","app"].forEach((screenId) => {
      $(screenId)?.classList.toggle("hidden",screenId !== id);
    });
  }

  function setLoading(message) {
    $("loadingText").textContent = message || "確認しています…";
    showOnly("loadingScreen");
  }

  function toast(message,error=false) {
    const el = $("toast");
    el.textContent = message;
    el.classList.toggle("error",error);
    el.classList.remove("hidden");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.add("hidden"),3500);
  }

  async function fetchPublicConfig() {
    const base = String(CONFIG.apiBaseUrl || "").replace(/\/$/,"");
    const response = await fetch(`${base}/api/public-config`,{cache:"no-store"});
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || data.error || `HTTP ${response.status}`);
    return data;
  }

  async function initializeSupabase() {
    const pub = await fetchPublicConfig();
    if (!window.supabase?.createClient) throw new Error("Supabaseライブラリを読み込めませんでした。");

    state.supabase = window.supabase.createClient(
      pub.supabaseUrl,
      pub.supabasePublishableKey || pub.supabaseAnonKey,
      {
        auth:{
          persistSession:true,
          autoRefreshToken:true,
          detectSessionInUrl:false,
          storageKey:pub.sessionStorageKey || "dpro-control-center-auth-v1",
        }
      }
    );

    const {data:sessionData,error:sessionError} = await state.supabase.auth.getSession();
    if (sessionError) throw sessionError;
    state.session = sessionData.session;
    if (!state.session?.user) {
      showOnly("authScreen");
      return false;
    }

    const {data:aalData} = await state.supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aalData?.currentLevel !== "aal2") {
      showOnly("authScreen");
      return false;
    }

    const {data:staff,error:staffError} = await state.supabase
      .from("cc_staff")
      .select("id,display_name,email,role_key,status")
      .eq("auth_user_id",state.session.user.id)
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

  async function loadData() {
    const [
      setupProjectsResult,
      deliveryProjectsResult,
      templatesResult,
      templateFeaturesResult,
      implementationsResult,
      standardResult,
    ] = await Promise.all([
      state.supabase.from("cc_v_contract_setup_overview").select("*").order("project_code"),
      state.supabase.from("cc_v_delivery_project_overview_v2").select("*").order("updated_at",{ascending:false}),
      state.supabase.from("cc_industry_templates").select("*").eq("status","current").order("updated_at",{ascending:false}),
      state.supabase.from("cc_industry_template_features").select("*").order("sort_order"),
      state.supabase.from("cc_system_feature_implementations").select("*").order("system_code").order("feature_code"),
      state.supabase.from("cc_standard_versions").select("version_code,title,effective_date").eq("standard_code","DPRO_STANDARD").eq("status","current").order("effective_date",{ascending:false}).limit(1).maybeSingle(),
    ]);

    for (const result of [
      setupProjectsResult,deliveryProjectsResult,templatesResult,
      templateFeaturesResult,implementationsResult,standardResult
    ]) {
      if (result.error) throw result.error;
    }

    const setupById = new Map((setupProjectsResult.data || []).map((x) => [x.project_id,x]));
    state.projects = (deliveryProjectsResult.data || []).map((delivery) => {
      const setup = setupById.get(delivery.id) || {};
      return {
        ...delivery,
        ...setup,
        project_id:delivery.id,
        project_code:setup.project_code || delivery.project_code,
        client_name:setup.client_name || delivery.client_name,
        project_name:setup.project_name || delivery.project_name,
        standard_version:setup.standard_version || delivery.standard_version,
        system_code:
          setup.system_code ||
          delivery.effective_system_code ||
          delivery.system_code ||
          delivery.product_system_code ||
          "",
        system_name:
          setup.system_name ||
          delivery.effective_system_name ||
          delivery.system_name ||
          delivery.product_name ||
          delivery.effective_system_code ||
          delivery.product_system_code ||
          "",
      };
    });

    state.templates = templatesResult.data || [];
    state.templateFeatures = templateFeaturesResult.data || [];
    state.implementations = implementationsResult.data || [];
    state.currentStandard = standardResult.data || null;

    const requested = new URLSearchParams(location.search).get("project");
    if (requested && state.projects.some((p) => p.project_id === requested)) {
      state.selectedProjectId = requested;
    } else if (!state.selectedProjectId || !state.projects.some((p) => p.project_id === state.selectedProjectId)) {
      state.selectedProjectId = state.projects[0]?.project_id || "";
    }

    renderAll();
  }

  function productTemplate(project) {
    const code = String(project?.system_code || "").toUpperCase();
    if (!code) return null;
    return state.templates.find((t) =>
      String(t.system_code || "").toUpperCase() === code
    ) || null;
  }

  function templateRows(templateCode) {
    return state.templateFeatures.filter((x) => x.template_code === templateCode);
  }

  function implementation(project,featureCode) {
    const code = String(project?.system_code || "").toUpperCase();
    return state.implementations.find((x) =>
      String(x.system_code || "").toUpperCase() === code &&
      x.feature_code === featureCode
    ) || null;
  }

  function analyze(project) {
    const template = productTemplate(project);
    const rows = template ? templateRows(template.template_code) : [];
    const initialRows = rows.filter((x) => Boolean(x.default_enabled));
    const initialCodes = initialRows.map((x) => x.feature_code);

    const unknown = initialCodes.filter((code) => !implementation(project,code));
    const contractBuild = initialCodes.filter((code) =>
      ["contract_build","planned"].includes(implementation(project,code)?.implementation_status)
    );
    const standardReady = initialCodes.filter((code) =>
      implementation(project,code)?.implementation_status === "standard_ready"
    );
    const implemented = initialCodes.filter((code) =>
      implementation(project,code)?.implementation_status === "implemented"
    );
    const notApplicable = initialCodes.filter((code) =>
      implementation(project,code)?.implementation_status === "not_applicable"
    );

    const ownerAuthRow = rows.find((x) => x.feature_code === "owner_auth");
    const ownerAuthImpl = implementation(project,"owner_auth");
    const ownerAuthRecommended = Boolean(ownerAuthRow?.default_enabled);
    const ownerAuthStatus = ownerAuthImpl?.implementation_status || "unknown";

    const productReady = Boolean(project.system_code);
    const templateReady = Boolean(template);
    const featureReady = templateReady && unknown.length === 0 && notApplicable.length === 0;
    const standardReadyNow = Boolean(
      state.currentStandard?.version_code &&
      project.standard_version === state.currentStandard.version_code
    );

    const setupStatus = project.setup_status || "draft";
    const setupConfirmed = ["confirmed","locked"].includes(setupStatus);
    const openTasks = Number(project.feature_tasks_open || 0);
    const dependencyIssues = Number(project.dependency_issues || 0);

    let next = {
      key:"setup",
      title:"契約セットアップへ進む",
      detail:"製品準備は整っています。店舗ごとのFeature ON/OFFを確定します。",
      href:`setup.html?project=${encodeURIComponent(project.project_id)}`,
      label:"契約セットアップを開始",
      ready:true,
    };

    if (!productReady) {
      next = {
        key:"product",
        title:"先にDPRO製品を選択",
        detail:"この制作案件にDPRO製品コードがありません。制作・納品で製品を紐付けてください。",
        href:"delivery.html",
        label:"制作・納品で製品を選ぶ",
        ready:false,
      };
    } else if (!templateReady) {
      next = {
        key:"template",
        title:"先に業種おすすめを作成",
        detail:`${project.system_name || project.system_code} の契約時おすすめテンプレートが未作成です。`,
        href:productMasterUrl(project.system_code,"recommendations"),
        label:"業種おすすめを作成",
        ready:false,
      };
    } else if (unknown.length > 0 || notApplicable.length > 0) {
      next = {
        key:"features",
        title:"先に製品原本を確認",
        detail:`契約時ON候補のうち ${unknown.length + notApplicable.length}機能が未確認です。最新原本で実装状況を確定してください。`,
        href:productMasterUrl(project.system_code,"features"),
        label:"Feature実装状況を確認",
        ready:false,
      };
    } else if (!standardReadyNow) {
      next = {
        key:"standard",
        title:`DPRO STANDARD ${state.currentStandard?.version_code || "現行版"}へ更新`,
        detail:`この案件は ${project.standard_version || "未設定"} です。契約セットアップ画面で現行標準へ更新してください。`,
        href:`setup.html?project=${encodeURIComponent(project.project_id)}`,
        label:"現行STANDARDへ更新",
        ready:false,
      };
    } else if (setupConfirmed && dependencyIssues > 0) {
      next = {
        key:"dependency",
        title:"契約セットアップの依存関係を確認",
        detail:`必須依存が ${dependencyIssues}件 残っています。セットアップ画面で解消してください。`,
        href:`setup.html?project=${encodeURIComponent(project.project_id)}`,
        label:"依存関係を確認",
        ready:false,
      };
    } else if (setupConfirmed) {
      next = {
        key:"delivery",
        title:openTasks > 0 ? "制作タスクへ進む" : "制作・納品へ進む",
        detail:openTasks > 0
          ? `契約内容は確定済みです。必要制作タスク ${openTasks}件 を進めます。`
          : "契約内容は確定済みです。制作・検査・納品工程へ進めます。",
        href:"delivery.html",
        label:"制作・納品を開く",
        ready:true,
      };
    }

    return {
      template,initialRows,unknown,contractBuild,standardReady,implemented,notApplicable,
      ownerAuthRecommended,ownerAuthStatus,ownerAuthImpl,
      productReady,templateReady,featureReady,standardReadyNow,
      setupStatus,setupConfirmed,openTasks,dependencyIssues,next,
      preflightReady:productReady && templateReady && featureReady && standardReadyNow,
    };
  }

  function productMasterUrl(systemCode,tab) {
    return `index.html?system=${encodeURIComponent(systemCode || "")}&product_tab=${encodeURIComponent(tab)}#view-products`;
  }

  function tone(ok,warn=false) {
    if (ok) return "ok";
    return warn ? "warn" : "bad";
  }

  function readinessCard(icon,title,status,detail,cls) {
    return `
      <article class="start-ready-card ${cls}">
        <span class="icon">${esc(icon)}</span>
        <strong>${esc(title)}</strong>
        <span>${esc(status)}</span>
        <small>${esc(detail)}</small>
      </article>
    `;
  }

  function renderMetrics() {
    const analyses = state.projects.map((p) => [p,analyze(p)]);
    const total = analyses.length;
    const preflight = analyses.filter(([,a]) => a.preflightReady).length;
    const featureReview = analyses.filter(([,a]) => a.templateReady && !a.featureReady).length;
    const templateMissing = analyses.filter(([,a]) => a.productReady && !a.templateReady).length;
    const oldStandard = analyses.filter(([,a]) => !a.standardReadyNow).length;
    const setupDone = analyses.filter(([,a]) => a.setupConfirmed).length;

    const rows = [
      [total,"契約案件","制作登録済み",""],
      [preflight,"開始準備OK","セットアップへ進める",""],
      [featureReview,"製品原本確認","CENTER-4確認あり",featureReview?"warning":""],
      [templateMissing,"おすすめ未作成","CENTER-5作成あり",templateMissing?"warning":""],
      [oldStandard,"STANDARD更新","現行版と不一致",oldStandard?"warning":""],
      [setupDone,"契約内容確定","制作工程へ", ""],
    ];

    $("metricGrid").innerHTML = rows.map(([value,label,note,cls]) =>
      `<article class="metric ${cls}"><b>${Number(value)}</b><span>${esc(label)}</span><small>${esc(note)}</small></article>`
    ).join("");

    $("sideReady").textContent = `${preflight}/${total} 準備OK`;
  }

  function renderProjectSelect() {
    const select = $("projectSelect");
    select.innerHTML = '<option value="">契約案件を選択してください</option>' +
      state.projects.map((p) =>
        `<option value="${esc(p.project_id)}">${esc(p.client_name || "契約者")}｜${esc(p.system_name || p.system_code || "製品未設定")}｜${esc(p.project_code || "")}</option>`
      ).join("");
    select.value = state.selectedProjectId;
  }

  function renderSelected() {
    const project = state.projects.find((p) => p.project_id === state.selectedProjectId);
    $("selectedArea").classList.toggle("hidden",!project);
    if (!project) return;

    const a = analyze(project);
    const setupLabel = setupLabels[a.setupStatus] || a.setupStatus;

    $("projectHero").innerHTML = `
      <div>
        <span class="code">${esc(project.project_code || "")}</span>
        <h2>${esc(project.client_name || "契約者")}</h2>
        <p>${esc(project.project_name || "")}<br>${esc(project.system_name || project.system_code || "DPRO製品未設定")}・DPRO STANDARD ${esc(project.standard_version || "未設定")}</p>
      </div>
      <span class="status">${esc(setupLabel)}</span>
    `;

    const ownerAuthOk = a.ownerAuthRecommended &&
      ["implemented","standard_ready"].includes(a.ownerAuthStatus);
    const ownerAuthKnownBuild = a.ownerAuthRecommended &&
      ["contract_build","planned"].includes(a.ownerAuthStatus);

    $("readinessGrid").innerHTML = [
      readinessCard(
        "1","DPRO製品",
        a.productReady ? "製品選択済み" : "未選択",
        a.productReady ? (project.system_name || project.system_code) : "制作・納品で製品を選択",
        tone(a.productReady)
      ),
      readinessCard(
        "2","Feature原本",
        !a.templateReady ? "テンプレート待ち" :
          a.featureReady ? "契約推奨分確認済み" : `${a.unknown.length + a.notApplicable.length}件 未確認`,
        !a.templateReady ? "先に業種おすすめを作成" :
          `初期ON ${a.initialRows.length}件 / 実装済等 ${a.implemented.length + a.standardReady.length + a.contractBuild.length}件`,
        tone(a.featureReady,!a.featureReady)
      ),
      readinessCard(
        "3","業種おすすめ",
        a.templateReady ? "登録済み" : "未作成",
        a.templateReady ? `${a.template.template_name} / ${a.template.version_code}` : "CENTER-5で一度作成",
        tone(a.templateReady,!a.templateReady)
      ),
      readinessCard(
        "4","DPRO STANDARD",
        a.standardReadyNow ? "現行版" : "更新あり",
        a.standardReadyNow
          ? `${state.currentStandard?.version_code || project.standard_version}`
          : `${project.standard_version || "未設定"} → ${state.currentStandard?.version_code || "現行版"}`,
        tone(a.standardReadyNow,!a.standardReadyNow)
      ),
      readinessCard(
        "5","共通オーナー認証",
        !a.ownerAuthRecommended ? "おすすめ設定外" :
          ownerAuthOk ? (a.ownerAuthStatus === "implemented" ? "実装済み" : "標準部品あり") :
          ownerAuthKnownBuild ? "契約時対応" : "要確認",
        !a.ownerAuthRecommended ? "テンプレートを確認" :
          a.ownerAuthImpl?.source_version || "CENTER-4で実装状況を確認",
        tone(ownerAuthOk,ownerAuthKnownBuild || !ownerAuthOk)
      ),
    ].join("");

    const next = a.next;
    $("nextAction").className = `start-next-action ${next.ready ? "ready" : "attention"}`;
    $("nextAction").innerHTML = `
      <div>
        <p class="eyebrow">NEXT ACTION</p>
        <h3>${esc(next.title)}</h3>
        <p>${esc(next.detail)}</p>
      </div>
      <div class="action-buttons">
        ${a.productReady ? `<a class="btn secondary" href="${esc(productMasterUrl(project.system_code,"features"))}">製品原本</a>` : ""}
        ${a.productReady ? `<a class="btn secondary" href="${esc(productMasterUrl(project.system_code,"recommendations"))}">業種おすすめ</a>` : ""}
        <a class="btn primary" href="${esc(next.href)}">${esc(next.label)}</a>
      </div>
    `;

    const checks = [
      [
        a.productReady,
        "製品紐付け",
        a.productReady ? `${project.system_name || project.system_code} を選択済み` : "DPRO製品が未選択です。",
        a.productReady ? project.system_code : "要対応"
      ],
      [
        a.templateReady,
        "業種おすすめテンプレート",
        a.templateReady ? `${a.template.template_name} を利用できます。` : "この製品専用のおすすめがまだありません。",
        a.templateReady ? a.template.version_code : "CENTER-5"
      ],
      [
        a.featureReady,
        "契約時ON候補の実装確認",
        a.templateReady
          ? `初期ON ${a.initialRows.length}件 / 未確認 ${a.unknown.length}件 / 契約時実装等 ${a.contractBuild.length}件`
          : "おすすめテンプレート作成後に判定します。",
        a.featureReady ? "確認済み" : `${a.unknown.length + a.notApplicable.length}件確認`
      ],
      [
        a.standardReadyNow,
        "DPRO STANDARD",
        a.standardReadyNow ? "この案件は現行標準です。" : "契約セットアップで現行版へ更新します。",
        a.standardReadyNow ? (state.currentStandard?.version_code || "") : `${project.standard_version || "未設定"} → ${state.currentStandard?.version_code || ""}`
      ],
      [
        a.dependencyIssues === 0,
        "Feature依存関係",
        a.dependencyIssues === 0 ? "必須依存の不足はありません。" : `依存問題 ${a.dependencyIssues}件`,
        a.dependencyIssues === 0 ? "0件" : `${a.dependencyIssues}件`
      ],
      [
        a.setupConfirmed,
        "店舗別契約セットアップ",
        a.setupConfirmed
          ? `契約内容確定済み。制作タスク ${a.openTasks}件。`
          : "店舗ごとのON/OFFはまだ確定していません。",
        setupLabel
      ],
    ];

    $("diagnosticList").innerHTML = checks.map(([ok,title,detail,value]) => `
      <article class="start-diagnostic ${ok ? "ok" : "warn"}">
        <span class="mark">${ok ? "✓" : "!"}</span>
        <div><strong>${esc(title)}</strong><small>${esc(detail)}</small></div>
        <span class="value">${esc(value)}</span>
      </article>
    `).join("");
  }

  function renderProjectGrid() {
    const q = String($("projectSearch").value || "").trim().toLowerCase();
    const rows = state.projects.filter((p) => {
      if (!q) return true;
      return `${p.client_name || ""} ${p.project_name || ""} ${p.project_code || ""} ${p.system_name || ""} ${p.system_code || ""}`.toLowerCase().includes(q);
    });

    $("projectGrid").innerHTML = rows.length ? rows.map((p) => {
      const a = analyze(p);
      const issues =
        (!a.productReady ? 1 : 0) +
        (!a.templateReady ? 1 : 0) +
        (a.templateReady && !a.featureReady ? 1 : 0) +
        (!a.standardReadyNow ? 1 : 0);
      return `
        <article class="project-card start-project-card ${issues ? "attention" : "ready"}">
          <div class="project-head">
            <div>
              <span class="project-code">${esc(p.project_code || "")}</span>
              <h2>${esc(p.client_name || "契約者")}</h2>
              <p>${esc(p.project_name || "")}<br>${esc(p.system_name || p.system_code || "DPRO製品未設定")}</p>
            </div>
            <span class="pill ${issues ? "amber" : "green"}">${issues ? `準備 ${issues}件` : "開始準備OK"}</span>
          </div>
          <div class="start-card-readiness">
            <span class="start-mini-pill ${a.productReady ? "ok" : "bad"}">製品 ${a.productReady ? "OK" : "未設定"}</span>
            <span class="start-mini-pill ${a.templateReady ? "ok" : "warn"}">おすすめ ${a.templateReady ? "OK" : "未作成"}</span>
            <span class="start-mini-pill ${a.featureReady ? "ok" : "warn"}">原本 ${a.featureReady ? "OK" : "確認あり"}</span>
            <span class="start-mini-pill ${a.standardReadyNow ? "ok" : "warn"}">標準 ${a.standardReadyNow ? "現行" : "更新"}</span>
          </div>
          <div class="project-actions">
            <button class="btn secondary" type="button" data-select-project="${esc(p.project_id)}">ナビを開く</button>
            <a class="btn primary" href="${esc(a.next.href)}">${esc(a.next.label)}</a>
          </div>
        </article>
      `;
    }).join("") : '<div class="empty">条件に一致する契約案件はありません。</div>';

    $$("[data-select-project]").forEach((button) => {
      button.addEventListener("click",() => {
        state.selectedProjectId = button.dataset.selectProject;
        $("projectSelect").value = state.selectedProjectId;
        renderSelected();
        $("selectedArea").scrollIntoView({behavior:"smooth",block:"start"});
      });
    });
  }

  function renderAll() {
    renderMetrics();
    renderProjectSelect();
    renderSelected();
    renderProjectGrid();
  }

  async function refreshAll() {
    const button = $("refreshButton");
    button.disabled = true;
    button.textContent = "更新中…";
    try {
      await loadData();
      toast("契約開始ナビを更新しました。");
    } catch (error) {
      toast(error.message || "更新できませんでした。",true);
    } finally {
      button.disabled = false;
      button.textContent = "最新情報に更新";
    }
  }

  function bindEvents() {
    $("projectSelect").addEventListener("change",() => {
      state.selectedProjectId = $("projectSelect").value;
      renderSelected();
      if (state.selectedProjectId) {
        const url = new URL(location.href);
        url.searchParams.set("project",state.selectedProjectId);
        history.replaceState(null,"",url);
      }
    });
    $("projectSearch").addEventListener("input",renderProjectGrid);
    $("refreshButton").addEventListener("click",refreshAll);
    $("retryButton").addEventListener("click",boot);
    $("menuButton").addEventListener("click",() => {
      $("sidebar").classList.toggle("open");
      $("sidebarBackdrop").classList.toggle("show");
      $("sidebarBackdrop").classList.toggle("hidden",!$("sidebar").classList.contains("open"));
    });
    $("sidebarBackdrop").addEventListener("click",() => {
      $("sidebar").classList.remove("open");
      $("sidebarBackdrop").classList.remove("show");
      $("sidebarBackdrop").classList.add("hidden");
    });
  }

  async function boot() {
    setLoading("契約案件と製品準備状況を確認しています…");
    try {
      const ok = await initializeSupabase();
      if (!ok) return;
      await loadData();
      showOnly("app");
    } catch (error) {
      console.error(BUILD,error);
      $("errorText").textContent = error.message || "CONTROL CENTERの接続状態を確認してください。";
      showOnly("errorScreen");
    }
  }

  bindEvents();
  boot();
})();
