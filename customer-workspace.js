(() => {
  "use strict";

  const BUILD = "DPRO-CUSTOMER-WORKSPACE-CO04B-VERIFICATION-UI-R1-20260921";
  const CONFIG = window.DPRO_CONTROL_CENTER_CONFIG || {};
  const $ = (id) => document.getElementById(id);

  const state = {
    supabase: null,
    session: null,
    staff: null,
    workspaces: [],
    nextActions: [],
    projects: [],
    contracts: [],
    clients: [],
    contacts: [],
    releases: [],
    selectedCaseId: null,
    currentTab: "cases",
    namePlan: null,
    setupStep: "owner",
    verification: null,
  };

  const roleLabels = {
    owner_admin: "管理責任者",
    technical_admin: "技術管理者",
    support: "DPROサポート",
    read_only: "閲覧専用",
  };

  const stageLabels = {
    onboarding_start: "導入開始",
    account_setup: "アカウント準備",
    infra_reserved: "本番環境準備",
    tenant_provisioned: "Tenant準備",
    owner_provisioned: "Owner準備",
    service_configured: "本番設定",
    pre_go_live: "公開前QA",
    owner_acceptance: "Owner確認",
    go_live: "GO LIVE",
    stabilization: "初期安定",
    operation: "運用中",
    change_request: "変更受付",
    impact_review: "影響確認",
    change_apply: "変更適用",
    regression_qa: "回帰QA",
  };

  const esc = (value) => String(value ?? "")
    .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
    .replaceAll('"',"&quot;").replaceAll("'","&#039;");

  function showOnly(id) {
    ["loadingScreen","authScreen","errorScreen","app"].forEach((x) => $(x)?.classList.toggle("hidden", x !== id));
  }

  function setLoading(message) {
    $("loadingText").textContent = message || "確認しています…";
    showOnly("loadingScreen");
  }

  function toast(message, error = false) {
    const el = $("toast");
    if (!el) return;
    el.textContent = message;
    el.classList.toggle("error", error);
    el.classList.remove("hidden");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.add("hidden"), 3600);
  }

  function canWrite() {
    return ["owner_admin","technical_admin","support"].includes(state.staff?.role_key);
  }

  async function fetchPublicConfig() {
    const base = String(CONFIG.apiBaseUrl || "").replace(/\/$/, "");
    const response = await fetch(`${base}/api/public-config`, { cache:"no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || data.error || `HTTP ${response.status}`);
    return data;
  }

  async function initializeSupabase() {
    const cfg = await fetchPublicConfig();
    if (!window.supabase?.createClient) throw new Error("Supabaseライブラリを読み込めませんでした。");
    state.supabase = window.supabase.createClient(
      cfg.supabaseUrl,
      cfg.supabasePublishableKey || cfg.supabaseAnonKey,
      {
        auth:{
          persistSession:true,
          autoRefreshToken:true,
          detectSessionInUrl:false,
          storageKey:cfg.sessionStorageKey || "dpro-control-center-auth-v1",
        },
      },
    );

    const {data,error} = await state.supabase.auth.getSession();
    if (error) throw error;
    state.session = data.session;
    if (!state.session?.user) {
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
    $("staffInitial").textContent = (staff.display_name || "D").trim().charAt(0) || "D";
    return true;
  }

  function must(result, label) {
    if (result.error) throw new Error(`${label}: ${result.error.message || result.error}`);
    return result.data || [];
  }

  async function loadAll(silent = false) {
    if (!silent) setLoading("顧客Workspace・本番環境・次の作業を確認しています…");

    const [
      workspaceResult,
      actionResult,
      projectResult,
      contractResult,
      clientResult,
      contactResult,
      releaseResult,
    ] = await Promise.all([
      state.supabase.from("cc_v_customer_workspace").select("*").order("onboarding_updated_at",{ascending:false}),
      state.supabase.from("cc_v_customer_next_action").select("*").order("priority_rank",{ascending:true}),
      state.supabase.from("cc_v_delivery_project_overview_v2").select("*").order("updated_at",{ascending:false}),
      state.supabase.from("cc_contracts").select("id,contract_code,client_id,contract_name,status,starts_on,owner_confirmed_at"),
      state.supabase.from("cc_clients").select("id,client_code,display_name,status,is_demo,archived_at"),
      state.supabase.from("cc_contacts").select("id,client_id,contact_type,display_name,email,status,is_primary"),
      state.supabase.rpc("cc_product_release_list"),
    ]);

    state.workspaces = must(workspaceResult,"Customer Workspace");
    state.nextActions = must(actionResult,"Next Action");
    state.projects = must(projectResult,"制作案件");
    state.contracts = must(contractResult,"契約");
    state.clients = must(clientResult,"顧客");
    state.contacts = must(contactResult,"Owner");
    state.releases = must(releaseResult,"PRODUCT RELEASE");

    renderAll();
    showOnly("app");
  }

  function actionFor(caseId) {
    return state.nextActions.find((x) => x.onboarding_case_id === caseId) || null;
  }

  function workspaceFor(caseId) {
    return state.workspaces.find((x) => x.onboarding_case_id === caseId) || null;
  }

  function contractFor(id) {
    return state.contracts.find((x) => x.id === id) || null;
  }

  function clientFor(id) {
    return state.clients.find((x) => x.id === id) || null;
  }

  function releaseForSystem(code) {
    const key = String(code || "").toUpperCase();
    return state.releases.find((r) =>
      String(r?.system_code || "").toUpperCase() === key
      && r?.release_status === "complete"
      && r?.product_release_lock === true
    ) || null;
  }

  function pill(text,tone="") {
    return `<span class="badge ${tone}">${esc(text)}</span>`;
  }

  function yesNo(pass) {
    return pass ? ["PASS","pass"] : ["WAIT","wait"];
  }

  function requirement(w,key,def=false) {
    const r = w?.requirements;
    if (!r || typeof r !== "object" || !(key in r)) return def;
    return r[key] === true;
  }

  function renderMetrics() {
    const active = state.workspaces.filter((w) => !["cancelled","closed"].includes(w.onboarding_status));
    const holds = active.filter((w) => w.onboarding_status === "hold").length;
    const live = active.filter((w) => ["go_live","stabilization","operation"].includes(w.onboarding_stage)).length;
    const pending = active.filter((w) => !["go_live","stabilization","operation"].includes(w.onboarding_stage)).length;
    const urgent = state.nextActions.filter((a) => Number(a.priority_rank) < 50).length;
    $("metricGrid").innerHTML = [
      [pending,"導入中","本番開始までの案件"],
      [holds,"HOLD","止まっている理由を優先"],
      [urgent,"優先対応","契約・Owner・重要Blocker"],
      [live,"本番・運用","GO LIVE以降"],
    ].map(([v,l,n]) => `<article class="customer-metric"><strong>${v}</strong><span>${l}</span><small>${n}</small></article>`).join("");
  }

  function renderCases() {
    const q = String($("caseSearch")?.value || "").trim().toLowerCase();
    const filter = $("caseFilter")?.value || "all";

    const rows = state.workspaces.filter((w) => {
      const hay = [w.client_name,w.client_code,w.contract_code,w.product_system_code,w.system_code,w.delivery_project_code].join(" ").toLowerCase();
      if (q && !hay.includes(q)) return false;
      if (filter === "hold") return w.onboarding_status === "hold";
      if (filter === "live") return ["go_live","stabilization","operation"].includes(w.onboarding_stage);
      if (filter === "active") return !["hold","cancelled","closed"].includes(w.onboarding_status) && !["go_live","stabilization","operation"].includes(w.onboarding_stage);
      return true;
    });

    $("caseCount").textContent = `${rows.length}件`;

    if (!rows.length) {
      $("caseGrid").innerHTML = `<div class="empty-state"><strong>現在の導入案件はありません</strong><span>「導入を開始」から、正式契約済みの案件をCustomer Workspaceへ登録します。</span></div>`;
      return;
    }

    $("caseGrid").innerHTML = rows.map((w) => {
      const a = actionFor(w.onboarding_case_id);
      const tone = w.onboarding_status === "hold" ? "amber" : ["go_live","stabilization","operation"].includes(w.onboarding_stage) ? "green" : "blue";
      return `<article class="customer-card ${w.onboarding_status==="hold"?"is-hold":""} ${tone==="green"?"is-live":""}">
        <div class="customer-card-head">
          <div>
            <div class="code">${esc(w.client_code)} / ${esc(w.effective_system_code || w.product_system_code || "SYSTEM")}</div>
            <h3>${esc(w.client_name)}</h3>
            <p>${esc(w.effective_system_name || w.product_name_snapshot || w.delivery_project_name || "DPRO SYSTEM")}</p>
          </div>
          ${pill(w.onboarding_status==="hold"?"HOLD":stageLabels[w.onboarding_stage]||w.onboarding_stage,tone)}
        </div>
        <div class="customer-card-next">
          <small>次にすること</small>
          <strong>${esc(a?.action_label || "状態を確認")}</strong>
          <span>${esc(a?.action_owner || "DPRO")} / ${esc(a?.action_location || "CONTROL CENTER")}</span>
        </div>
        <div class="customer-card-meta">
          ${pill(`契約 ${w.contract_status || "—"}`,w.contract_status==="active"?"green":"amber")}
          ${pill(`Owner ${w.owner_account_status || "未登録"}`,w.owner_account_status==="active"?"green":"")}
          ${pill(`Supabase ${w.supabase_project_ref?"登録済":"未登録"}`,w.supabase_project_ref?"green":"")}
          ${pill(`GitHub ${w.repository_full_name?"登録済":"未登録"}`,w.repository_full_name?"green":"")}
          ${pill(`Worker ${w.worker_name?"登録済":"未登録"}`,w.worker_name?"green":"")}
        </div>
        <div class="customer-card-actions">
          <button class="btn primary" type="button" data-open-case="${esc(w.onboarding_case_id)}">このお客様を開く</button>
        </div>
      </article>`;
    }).join("");

    document.querySelectorAll("[data-open-case]").forEach((button) => {
      button.addEventListener("click",() => openCase(button.dataset.openCase));
    });
  }

  function candidateReasons(p) {
    const reasons = [];
    const client = clientFor(p.client_id);
    const contract = contractFor(p.contract_id);
    const code = p.effective_system_code || p.product_system_code || p.system_code;
    const release = releaseForSystem(code);

    if (!p.contract_id) reasons.push("正式契約との紐付けがありません");
    if (!client || client.is_demo) reasons.push("実顧客案件ではありません");
    if (client?.archived_at) reasons.push("顧客がアーカイブ済みです");
    if (!contract) reasons.push("契約情報がありません");
    if (contract && contract.status !== "active") reasons.push(`契約状態が ${contract.status}`);
    if (contract && !contract.starts_on) reasons.push("契約開始日が未確定です");
    if (contract && !contract.owner_confirmed_at) reasons.push("オーナー確認が未完了です");
    if (!code) reasons.push("SYSTEM CODEがありません");
    if (code && !release) reasons.push("PRODUCT RELEASE COMPLETEではありません");
    if (state.workspaces.some((w) => w.delivery_project_id === p.id && !["cancelled","closed"].includes(w.onboarding_status))) reasons.push("Customer Workspace登録済みです");

    return reasons;
  }

  function renderCandidates() {
    const rows = state.projects.filter((p) => {
      const client = clientFor(p.client_id);
      return Boolean(
        p.contract_id
        && p.status !== "cancelled"
        && client
        && client.is_demo !== true
        && !client.archived_at
      );
    });
    if (!rows.length) {
      $("candidateGrid").innerHTML = `<div class="empty-state"><strong>現在、実契約の導入候補はありません</strong><span>正式契約済みの実顧客案件だけ、ここに表示します。デモ・開発案件は表示しません。</span></div>`;
      return;
    }

    $("candidateGrid").innerHTML = rows.map((p) => {
      const client = clientFor(p.client_id);
      const contract = contractFor(p.contract_id);
      const code = p.effective_system_code || p.product_system_code || p.system_code || "";
      const reasons = candidateReasons(p);
      const ready = reasons.length === 0 && canWrite();
      return `<article class="candidate-card">
        <div class="candidate-head">
          <div>
            <div class="code">${esc(p.project_code)} / ${esc(code || "SYSTEM未確定")}</div>
            <h3>${esc(client?.display_name || p.client_name || "顧客")}</h3>
            <p>${esc(p.effective_system_name || p.product_name_snapshot || p.project_name)}</p>
          </div>
          ${pill(reasons.length?"開始条件待ち":"開始可能",reasons.length?"amber":"green")}
        </div>
        <div class="customer-card-meta">
          ${pill(`契約 ${contract?.status || "—"}`,contract?.status==="active"?"green":"amber")}
          ${pill(contract?.starts_on?`開始 ${contract.starts_on}`:"開始日未確定",contract?.starts_on?"green":"amber")}
          ${pill(contract?.owner_confirmed_at?"Owner確認済":"Owner確認待ち",contract?.owner_confirmed_at?"green":"amber")}
          ${pill(releaseForSystem(code)?"商品化LOCK":"商品化未完了",releaseForSystem(code)?"green":"amber")}
        </div>
        ${reasons.length?`<ul class="blocker-list">${reasons.map((r)=>`<li>${esc(r)}</li>`).join("")}</ul>`:""}
        <div class="customer-card-actions" style="margin-top:12px">
          <button class="btn primary" type="button" data-start-project="${esc(p.id)}" ${ready?"":"disabled"}>Customer Workspaceを開始</button>
        </div>
      </article>`;
    }).join("");

    document.querySelectorAll("[data-start-project]").forEach((button) => {
      button.addEventListener("click",() => startOnboarding(button.dataset.startProject));
    });
  }

  function statusCard(label, pass, note, na=false) {
    const [value,tone] = na ? ["N/A","na"] : yesNo(pass);
    return `<article class="status-card ${tone}"><b>${value}</b><span>${esc(label)}</span><small>${esc(note || "")}</small></article>`;
  }

  function infraCard(label,value,status,url="") {
    const safeValue = value || "未登録";
    const tone = value ? "green" : "";
    return `<article class="infra-card">
      <div class="infra-card-head"><strong>${esc(label)}</strong>${pill(status || (value?"登録済":"未登録"),tone)}</div>
      <div class="infra-value">${esc(safeValue)}</div>
      <div class="infra-actions">
        ${value?`<button class="mini-btn" type="button" data-copy-value="${esc(value)}">コピー</button>`:""}
        ${url?`<a class="mini-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">開く ↗</a>`:""}
      </div>
    </article>`;
  }

  async function openCase(caseId) {
    state.selectedCaseId = caseId;
    state.namePlan = null;
    state.setupStep = "owner";
    state.verification = null;
    renderDetail();
    $("detailPanel").classList.remove("hidden");
    $("detailPanel").scrollIntoView({behavior:"smooth",block:"start"});
    try {
      await Promise.all([
        loadSetupNamePlan(caseId),
        loadEnvironmentVerification(caseId),
      ]);
      const w=workspaceFor(caseId);
      state.setupStep=chooseSetupStep(w);
      renderSetupWizard();
      renderEnvironmentVerification();
    } catch (error) {
      console.error(BUILD,error);
      toast(error?.message || "名前候補を生成できませんでした。",true);
    }
  }

  function renderDetail() {
    const w = workspaceFor(state.selectedCaseId);
    if (!w) {
      $("detailPanel").classList.add("hidden");
      return;
    }
    const a = actionFor(w.onboarding_case_id);

    $("detailTitle").textContent = w.client_name || "お客様";
    $("detailMeta").textContent = `${w.client_code || "—"} / ${w.contract_code || "—"} / ${w.effective_system_code || w.product_system_code || "SYSTEM"}`;

    const next = $("nextActionCard");
    next.className = `next-action-card ${w.onboarding_status==="hold"?"is-hold":""}`;
    next.innerHTML = `
      <span class="next-kicker">次にすること</span>
      <h3>${esc(a?.action_label || "状態を確認")}</h3>
      ${a?.action_detail?`<p>${esc(a.action_detail)}</p>`:""}
      <div class="next-action-meta">
        <span>担当：${esc(a?.action_owner || "DPRO")}</span>
        <span>場所：${esc(a?.action_location || "CONTROL CENTER")}</span>
        <span>工程：${esc(stageLabels[w.onboarding_stage] || w.onboarding_stage)}</span>
      </div>`;

    const ownerRequired = requirement(w,"owner_account_required",true);
    const supabaseRequired = requirement(w,"supabase_required",true);
    const githubRequired = requirement(w,"github_required",true);
    const workerRequired = requirement(w,"worker_required",true);
    const lineRequired = requirement(w,"line_required",false);
    const webRequired = requirement(w,"website_required",false);
    const domainRequired = requirement(w,"custom_domain_required",false);

    $("statusGrid").innerHTML = [
      statusCard("契約",w.contract_status==="active" && Boolean(w.contract_starts_on) && Boolean(w.contract_owner_confirmed_at),w.contract_status==="active"?"正式契約":"契約確認"),
      statusCard("Owner",!ownerRequired || (w.owner_account_status==="active" && Boolean(w.owner_first_login_verified_at)),ownerRequired?(w.owner_account_status || "未登録"):"対象外",!ownerRequired),
      statusCard("Supabase",!supabaseRequired || (Boolean(w.supabase_project_ref) && w.supabase_invitation_status==="accepted"),supabaseRequired?(w.supabase_project_ref || "未登録"):"対象外",!supabaseRequired),
      statusCard("GitHub",!githubRequired || (Boolean(w.repository_full_name) && w.github_access_status==="granted"),githubRequired?(w.repository_full_name || "未登録"):"対象外",!githubRequired),
      statusCard("Cloudflare",!workerRequired || (Boolean(w.worker_name) && w.worker_status==="active"),workerRequired?(w.worker_name || "未登録"):"対象外",!workerRequired),
      statusCard("LINE",!lineRequired || (Boolean(w.line_account_id) && w.line_permission_status==="granted" && w.line_webhook_status==="ok"),lineRequired?(w.line_account_name || "未登録"):"対象外",!lineRequired),
      statusCard("Website",!webRequired || (Boolean(w.website_id) && w.website_publication_status==="public"),webRequired?(w.website_public_url || "未登録"):"対象外",!webRequired),
      statusCard("Domain",!domainRequired || (Boolean(w.custom_domain) && w.ssl_status==="ok"),domainRequired?(w.custom_domain || "未登録"):"対象外",!domainRequired),
      statusCard("SYSTEM CHECK",Boolean(w.last_system_check_at) && w.system_health_status==="ok",w.last_system_check_at || "未確認",false),
      statusCard("GO LIVE",w.go_live_status==="live" && Boolean(w.go_live_at),w.go_live_at || "未実施",false),
    ].join("");

    $("infraGrid").innerHTML = [
      infraCard("Supabase Project Ref",w.supabase_project_ref,w.supabase_connection_status,w.supabase_dashboard_url),
      infraCard("GitHub Repository",w.repository_full_name,w.github_access_status,w.repository_url),
      infraCard("GitHub Pages",w.pages_url,w.github_pages_status,w.pages_url),
      infraCard("Cloudflare Worker",w.worker_name,w.worker_status,w.worker_url),
      infraCard("Worker URL",w.worker_url,w.worker_status,w.worker_url),
      infraCard("公開URL",w.public_url || w.website_public_url,w.website_publication_status,w.public_url || w.website_public_url),
      infraCard("独自ドメイン",w.custom_domain,w.ssl_status,w.website_public_url),
      infraCard("LINE Basic ID",w.line_basic_id,w.line_permission_status,w.line_manager_url),
    ].join("");

    document.querySelectorAll("[data-copy-value]").forEach((button) => {
      button.addEventListener("click",async() => {
        try {
          await navigator.clipboard.writeText(button.dataset.copyValue || "");
          toast("コピーしました。");
        } catch {
          toast("コピーできませんでした。",true);
        }
      });
    });

    $("ownerSummary").innerHTML = [
      ["Owner",w.owner_name || "未登録"],
      ["Ownerメール",w.owner_email || "未登録"],
      ["Auth User ID",w.owner_auth_user_id || "未登録"],
      ["Account",w.owner_account_status || "未登録"],
      ["初回ログイン",w.owner_first_login_verified_at || "未確認"],
      ["Owner承認",w.owner_acceptance_status || "pending"],
      ["承認日時",w.owner_accepted_at || "—"],
    ].map(([l,v]) => `<div class="owner-row"><span>${esc(l)}</span><strong>${esc(v)}</strong></div>`).join("");

    const req = w.requirements && typeof w.requirements === "object" ? w.requirements : {};
    document.querySelectorAll("[data-requirement]").forEach((input) => {
      const key = input.dataset.requirement;
      input.checked = key === "system_required" ? true : (req[key] === true);
      input.disabled = key === "system_required" || !canWrite() || ["go_live","stabilization","operation"].includes(w.onboarding_stage);
    });
    $("confirmRequirementsButton").disabled = !canWrite() || ["go_live","stabilization","operation"].includes(w.onboarding_stage);
    $("requirementsState").textContent = w.requirements_status==="confirmed" ? "確定済み" : "未確認";
    $("requirementsState").className = `pill ${w.requirements_status==="confirmed"?"green":"amber"}`;

    $("clearHoldButton").classList.toggle("hidden",w.onboarding_status!=="hold");
    $("setHoldButton").classList.toggle("hidden",w.onboarding_status==="hold");
    $("holdCode").disabled = !canWrite() || w.onboarding_status==="hold";
    $("holdReason").disabled = !canWrite() || w.onboarding_status==="hold";
    $("setHoldButton").disabled = !canWrite();
    $("clearHoldButton").disabled = !canWrite();

    if (w.onboarding_status==="hold") {
      $("holdCode").value = w.hold_code || "";
      $("holdReason").value = w.hold_reason || "";
    } else {
      $("holdCode").value = "";
      $("holdReason").value = "";
    }

    renderSetupWizard();
    renderEnvironmentVerification();
  }


  const verificationLabels={
    pass:"PASS",wait:"WAIT",stale:"STALE",fail:"FAIL",missing:"MISSING",na:"N/A",
  };

  function verificationLabel(value){
    return verificationLabels[value] || String(value || "WAIT").toUpperCase();
  }

  function verificationTime(value){
    if (!value) return "未確認";
    const d=new Date(value);
    if (Number.isNaN(d.getTime())) return "未確認";
    return new Intl.DateTimeFormat("ja-JP",{
      year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"
    }).format(d);
  }

  async function loadEnvironmentVerification(caseId,{silent=false}={}){
    if (!caseId) return;
    if (!silent) {
      $("verificationSummary").innerHTML='<span>確認結果を読み込んでいます…</span>';
      $("verificationGrid").innerHTML="";
    }
    const {data,error}=await state.supabase.rpc("cc_customer_onboarding_environment_verification",{
      p_case_id:caseId,
    });
    if (error) throw error;
    state.verification=data || null;
  }

  function verificationCard(title,check,rows=[]){
    const stateValue=check?.state || "wait";
    return `<article class="verification-card is-${esc(stateValue)}">
      <div class="verification-card-head">
        <strong>${esc(title)}</strong>
        <span class="verification-state">${esc(verificationLabel(stateValue))}</span>
      </div>
      <dl>${rows.map(([k,v])=>`<div><dt>${esc(k)}</dt><dd>${esc(v ?? "—")}</dd></div>`).join("")}</dl>
    </article>`;
  }

  function renderEnvironmentVerification(){
    const box=$("verificationBlock");
    if (!box) return;
    const v=state.verification;
    const w=workspaceFor(state.selectedCaseId);

    if (!v){
      $("verificationSummary").className="verification-summary is-wait";
      $("verificationSummary").innerHTML='<div class="verification-overall">WAIT</div><div class="verification-summary-main"><strong>確認結果を読み込んでください</strong><span>実測結果がないものはPASSにしません。</span></div>';
      $("verificationGrid").innerHTML="";
      $("verificationActions").innerHTML="";
      return;
    }

    const overall=v.overall_state || "wait";
    $("verificationSummary").className=`verification-summary is-${overall}`;
    $("verificationSummary").innerHTML=`
      <div class="verification-overall">${esc(verificationLabel(overall))}</div>
      <div class="verification-summary-main">
        <strong>${esc(v.blocker_reason || (overall==="pass"?"本番環境の記録済み確認結果はPASSです":"確認が必要です"))}</strong>
        <span>次：${esc(v.next_verification_action || "—")} / 最終確認 ${esc(verificationTime(v.latest_verified_at))}</span>
      </div>
      <div class="verification-score">${esc(v.passed_check_count ?? 0)} / ${esc(v.required_check_count ?? 0)} PASS</div>`;

    const c=v.checks || {};
    $("verificationGrid").innerHTML=[
      verificationCard("SYSTEM",c.system,[
        ["Health",c.system?.health_status || "unknown"],
        ["Health確認",verificationTime(c.system?.health_checked_at)],
        ["System Check",verificationTime(c.system?.system_check_at)],
      ]),
      verificationCard("Supabase",c.supabase,[
        ["Project Ref",c.supabase?.project_ref || "未登録"],
        ["招待",c.supabase?.required===false?"対象外":(c.supabase?.invitation_status || "未確認")],
        ["接続確認",verificationTime(c.supabase?.checked_at)],
      ]),
      verificationCard("GitHub / Pages",c.github,[
        ["Repository",c.github?.repository || "未登録"],
        ["Access",c.github?.required===false?"対象外":(c.github?.access_status || "未確認")],
        ["Pages確認",verificationTime(c.github?.checked_at)],
      ]),
      verificationCard("Cloudflare Worker",c.worker,[
        ["Worker",c.worker?.worker_name || "未登録"],
        ["HTTP",c.worker?.http_status ?? "未確認"],
        ["確認日時",verificationTime(c.worker?.checked_at)],
      ]),
      verificationCard("公開URL",c.website,[
        ["URL",c.website?.public_url || (c.website?.required===false?"対象外":"未登録")],
        ["SSL",c.website?.required===false?"対象外":(c.website?.ssl_status || "未確認")],
        ["確認日時",verificationTime(c.website?.checked_at)],
      ]),
    ].join("");

    const actions=[];
    if (w?.system_check_url) actions.push(`<a class="btn secondary" href="${esc(w.system_check_url)}" target="_blank" rel="noopener noreferrer">SYSTEM CHECKを開く ↗</a>`);
    if (w?.supabase_dashboard_url) actions.push(`<a class="btn secondary" href="${esc(w.supabase_dashboard_url)}" target="_blank" rel="noopener noreferrer">Supabaseを開く ↗</a>`);
    if (w?.repository_url) actions.push(`<a class="btn secondary" href="${esc(w.repository_url)}" target="_blank" rel="noopener noreferrer">GitHubを開く ↗</a>`);
    if (w?.worker_health_url || w?.worker_url) actions.push(`<a class="btn secondary" href="${esc(w.worker_health_url || w.worker_url)}" target="_blank" rel="noopener noreferrer">Worker / Healthを開く ↗</a>`);
    if (w?.website_public_url || w?.public_url) actions.push(`<a class="btn secondary" href="${esc(w.website_public_url || w.public_url)}" target="_blank" rel="noopener noreferrer">公開URLを開く ↗</a>`);
    $("verificationActions").innerHTML=actions.join("");
  }

  function canTechnicalWrite() {
    return ["owner_admin","technical_admin"].includes(state.staff?.role_key);
  }

  function setInput(id,value) {
    const el=$(id);
    if (el) el.value=value ?? "";
  }

  function inputValue(id) {
    return String($(id)?.value ?? "").trim();
  }

  async function loadSetupNamePlan(caseId,{silent=false}={}) {
    if (!caseId) return;
    if (!silent) $("setupPlanSummary").innerHTML='<div class="empty-state"><strong>名前候補を生成しています…</strong></div>';
    const {data,error}=await state.supabase.rpc("cc_customer_onboarding_name_plan",{
      p_case_id:caseId,
      p_github_owner:"dpromstk2000-lab",
      p_workers_domain:"dpromstk2000.workers.dev",
    });
    if (error) throw error;
    state.namePlan=data || null;
  }

  function setupPlanCard(label,value) {
    return `<article class="setup-plan-card"><span>${esc(label)}</span><strong>${esc(value||"—")}</strong>${value?`<button class="mini-btn" type="button" data-copy-value="${esc(value)}">コピー</button>`:""}</article>`;
  }

  function setupStepApplicable(w,step) {
    if (["owner","system"].includes(step)) return true;
    if (step==="supabase") return requirement(w,"supabase_required",true);
    if (step==="github") return requirement(w,"github_required",true);
    if (step==="worker") return requirement(w,"worker_required",true);
    if (step==="website") return requirement(w,"website_required",false);
    if (step==="line") return requirement(w,"line_required",false);
    return true;
  }

  function setupStepStatus(w,step) {
    if (step==="owner") return Boolean(w.owner_email);
    if (step==="system") return Boolean(w.system_instance_id);
    if (step==="supabase") return !setupStepApplicable(w,step) || Boolean(w.supabase_project_ref);
    if (step==="github") return !setupStepApplicable(w,step) || Boolean(w.repository_full_name);
    if (step==="worker") return !setupStepApplicable(w,step) || Boolean(w.worker_name);
    if (step==="website") return !setupStepApplicable(w,step) || Boolean(w.website_id);
    if (step==="line") return !setupStepApplicable(w,step) || Boolean(w.line_account_id);
    return false;
  }

  function chooseSetupStep(w) {
    return ["owner","system","supabase","github","worker","website","line"]
      .find((step)=>setupStepApplicable(w,step) && !setupStepStatus(w,step)) || "owner";
  }

  function switchSetupStep(step) {
    state.setupStep=step;
    document.querySelectorAll("[data-setup-step]").forEach((b)=>b.classList.toggle("is-active",b.dataset.setupStep===step));
    document.querySelectorAll("[data-setup-panel]").forEach((p)=>p.classList.toggle("hidden",p.dataset.setupPanel!==step));
  }

  function disableSetupForms(disabled) {
    document.querySelectorAll("#setupWizardBlock input,#setupWizardBlock select,#setupWizardBlock button.setup-save")
      .forEach((el)=>{ el.disabled=disabled; });
  }

  function bindSetupCopyButtons() {
    document.querySelectorAll("#setupPlanSummary [data-copy-value]").forEach((button)=>{
      button.addEventListener("click",async()=>{
        try{ await navigator.clipboard.writeText(button.dataset.copyValue||""); toast("コピーしました。"); }
        catch{ toast("コピーできませんでした。",true); }
      });
    });
  }

  function renderSetupWizard() {
    const w=workspaceFor(state.selectedCaseId);
    if (!w || !$("setupWizardBlock")) return;
    const confirmed=w.requirements_status==="confirmed";
    const technical=canTechnicalWrite();
    const s=state.namePlan?.suggestions || {};

    $("setupWriteMode").textContent=technical?"登録可能":"閲覧のみ";
    $("setupWriteMode").className=`badge ${technical?"green":"amber"}`;

    const gate=$("setupGateMessage");
    if (!confirmed) {
      gate.textContent="先に「今回導入する構成」を確定してください。不要なLINE・Website・Domain作業を発生させないための固定Gateです。";
      gate.classList.remove("hidden");
    } else if (!technical) {
      gate.textContent="環境登録は管理責任者 / 技術管理者のみ実行できます。";
      gate.classList.remove("hidden");
    } else {
      gate.classList.add("hidden");
    }

    $("setupPlanSummary").innerHTML=[
      setupPlanCard("facility_code",s.facility_code),
      setupPlanCard("GitHub Repository",s.repository_full_name),
      setupPlanCard("Cloudflare Worker",s.worker_name),
      setupPlanCard("Supabase Project",s.supabase_project_name),
      setupPlanCard("schema",s.schema_name),
      setupPlanCard("tenant_code",s.tenant_code),
    ].join("");
    bindSetupCopyButtons();

    document.querySelectorAll("[data-setup-step]").forEach((button)=>{
      const step=button.dataset.setupStep;
      button.classList.toggle("is-complete",setupStepStatus(w,step));
      button.classList.toggle("is-na",!setupStepApplicable(w,step));
    });

    if (!state.setupStep || !setupStepApplicable(w,state.setupStep)) state.setupStep=chooseSetupStep(w);
    switchSetupStep(state.setupStep);

    setInput("setupOwnerName",w.owner_name||"");
    setInput("setupOwnerEmail",w.owner_email||"");
    setInput("setupOwnerPhone",w.owner_phone_normalized||"");
    setInput("setupOwnerAuthId",w.owner_auth_user_id||"");

    setInput("setupSystemName",w.system_name||state.namePlan?.system_name||w.effective_system_name||w.product_name_snapshot||"");
    setInput("setupFacilityCode",w.facility_code||s.facility_code||"");
    setInput("setupPublicUrl",w.public_url||"");
    setInput("setupOwnerUrl",w.owner_url||"");
    setInput("setupStaffUrl",w.staff_url||"");
    setInput("setupMemberUrl",w.member_url||"");
    setInput("setupIpadUrl",w.ipad_url||"");
    setInput("setupSystemCheckUrl",w.system_check_url||"");
    setInput("setupHealthUrl",w.system_health_url||"");

    setInput("setupSupabaseName",w.supabase_project_name||s.supabase_project_name||"");
    setInput("setupSupabaseRef",w.supabase_project_ref||"");
    setInput("setupSupabaseDashboard",w.supabase_dashboard_url||"");
    setInput("setupSupabaseOwnerLabel",w.supabase_owner_label||`${w.client_name||""} Owner`);
    setInput("setupSupabaseRegion",w.supabase_region||"");
    setInput("setupSupabaseInvite",w.supabase_invitation_status||"not_requested");
    setInput("setupSupabaseRole",w.supabase_dpro_role||"");
    setInput("setupSupabaseSchema",s.schema_name||"");
    setInput("setupTenantCode",s.tenant_code||"");

    setInput("setupRepoFullName",w.repository_full_name||s.repository_full_name||"");
    setInput("setupRepoUrl",w.repository_url||s.repository_url||"");
    setInput("setupPagesUrl",w.pages_url||s.pages_url||"");
    setInput("setupRepoVisibility","private");
    setInput("setupGithubAccess",w.github_access_status||"not_checked");

    setInput("setupWorkerName",w.worker_name||s.worker_name||"");
    setInput("setupWorkerUrl",w.worker_url||s.worker_url||"");
    setInput("setupWorkerHealth",w.worker_health_url||"");
    setInput("setupWorkerAccount",w.worker_account_label||"");

    setInput("setupWebsiteName",w.website_name||`${w.client_name||""} 公式サイト`);
    setInput("setupWebsiteUrl",w.website_public_url||"");
    setInput("setupCustomDomain",w.custom_domain||"");
    setInput("setupWebsitePlatform",w.website_platform||"github_pages");

    setInput("setupLineName",w.line_account_name||"");
    setInput("setupLineBasicId",w.line_basic_id||"");
    setInput("setupLineChannelId",w.line_channel_id||"");
    setInput("setupLineManager",w.line_manager_url||"");
    setInput("setupLinePermission",w.line_permission_status||"not_requested");
    setInput("setupLineMessaging",w.line_messaging_api_status||"not_used");
    setInput("setupLineWebhook",w.line_webhook_status||"not_used");
    setInput("setupLineLiff",w.line_liff_status||"not_used");

    const webRequired=requirement(w,"website_required",false);
    const lineRequired=requirement(w,"line_required",false);
    $("setupWebsiteRequired").textContent=webRequired?"対象":"N/A";
    $("setupWebsiteRequired").className=`badge ${webRequired?"green":""}`;
    $("setupLineRequired").textContent=lineRequired?"対象":"N/A";
    $("setupLineRequired").className=`badge ${lineRequired?"green":""}`;

    disableSetupForms(!confirmed || !technical);
    if (!webRequired) $("setupWebsiteForm").querySelectorAll("input,select,button.setup-save").forEach((el)=>el.disabled=true);
    if (!lineRequired) $("setupLineForm").querySelectorAll("input,select,button.setup-save").forEach((el)=>el.disabled=true);
    $("refreshNamePlanButton").disabled=!confirmed;
  }

  function ownerPayloadFromSetup() {
    const name=inputValue("setupOwnerName");
    const email=inputValue("setupOwnerEmail");
    if (!name || !email) return null;
    const payload={display_name:name,email,preferred_contact:"email"};
    const phone=inputValue("setupOwnerPhone");
    const auth=inputValue("setupOwnerAuthId");
    if (phone) payload.phone=phone;
    if (auth) payload.external_auth_user_id=auth;
    return payload;
  }

  async function saveSetupPayload(payload,message) {
    const {error}=await state.supabase.rpc("cc_customer_onboarding_save_setup",{
      p_case_id:state.selectedCaseId,
      p_payload:payload,
    });
    if (error) throw error;
    await loadAll(true);
    await Promise.all([
      loadSetupNamePlan(state.selectedCaseId,{silent:true}),
      loadEnvironmentVerification(state.selectedCaseId,{silent:true}),
    ]);
    renderDetail();
    toast(message);
  }

  async function saveOwnerSetup(event) {
    event.preventDefault();
    const owner=ownerPayloadFromSetup();
    if (!owner) return toast("Owner氏名とメールを入力してください。",true);
    try{ await saveSetupPayload({owner},"Owner情報を保存しました。"); state.setupStep="system"; renderSetupWizard(); }
    catch(error){ console.error(BUILD,error); toast(error?.message||"Owner情報を保存できませんでした。",true); }
  }

  async function saveSystemSetup(event) {
    event.preventDefault();
    const system={system_name:inputValue("setupSystemName"),facility_code:inputValue("setupFacilityCode")};
    for (const [key,id] of [["public_url","setupPublicUrl"],["owner_url","setupOwnerUrl"],["staff_url","setupStaffUrl"],["member_url","setupMemberUrl"],["ipad_url","setupIpadUrl"],["system_check_url","setupSystemCheckUrl"],["health_url","setupHealthUrl"]]) {
      const v=inputValue(id); if (v) system[key]=v;
    }
    const payload={system}; const owner=ownerPayloadFromSetup(); if (owner) payload.owner=owner;
    try{ await saveSetupPayload(payload,"本番SYSTEM情報を保存しました。"); state.setupStep="supabase"; renderSetupWizard(); }
    catch(error){ console.error(BUILD,error); toast(error?.message||"SYSTEM情報を保存できませんでした。",true); }
  }

  async function saveSupabaseSetup(event) {
    event.preventDefault();
    if (!inputValue("setupSupabaseRef")) return toast("Supabase Project Refを入力してください。",true);
    const supabase={
      project_name:inputValue("setupSupabaseName"),project_ref:inputValue("setupSupabaseRef"),
      dashboard_url:inputValue("setupSupabaseDashboard"),owner_label:inputValue("setupSupabaseOwnerLabel"),
      region:inputValue("setupSupabaseRegion"),invitation_status:inputValue("setupSupabaseInvite"),
      dpro_role:inputValue("setupSupabaseRole"),schema_name:inputValue("setupSupabaseSchema"),
      tenant_code:inputValue("setupTenantCode"),
    };
    try{ await saveSetupPayload({supabase},"Supabase情報を保存しました。"); state.setupStep="github"; renderSetupWizard(); }
    catch(error){ console.error(BUILD,error); toast(error?.message||"Supabase情報を保存できませんでした。",true); }
  }

  async function saveGithubSetup(event) {
    event.preventDefault();
    if (!inputValue("setupRepoFullName")) return toast("Repository full nameを入力してください。",true);
    const github={
      repository_full_name:inputValue("setupRepoFullName"),repository_url:inputValue("setupRepoUrl"),
      pages_url:inputValue("setupPagesUrl"),visibility:inputValue("setupRepoVisibility"),
      access_status:inputValue("setupGithubAccess"),
    };
    try{ await saveSetupPayload({github},"GitHub情報を保存しました。"); state.setupStep="worker"; renderSetupWizard(); }
    catch(error){ console.error(BUILD,error); toast(error?.message||"GitHub情報を保存できませんでした。",true); }
  }

  async function saveWorkerSetup(event) {
    event.preventDefault();
    if (!inputValue("setupWorkerName") || !inputValue("setupWorkerUrl")) return toast("Worker名とWorker URLを入力してください。",true);
    const worker={worker_name:inputValue("setupWorkerName"),worker_url:inputValue("setupWorkerUrl"),health_url:inputValue("setupWorkerHealth"),account_label:inputValue("setupWorkerAccount")};
    try{ await saveSetupPayload({worker},"Cloudflare Worker情報を保存しました。"); const w=workspaceFor(state.selectedCaseId); state.setupStep=requirement(w,"website_required",false)?"website":requirement(w,"line_required",false)?"line":"owner"; renderSetupWizard(); }
    catch(error){ console.error(BUILD,error); toast(error?.message||"Cloudflare情報を保存できませんでした。",true); }
  }

  async function saveWebsiteSetup(event) {
    event.preventDefault();
    if (!inputValue("setupWebsiteUrl")) return toast("Website公開URLを入力してください。",true);
    const website={website_name:inputValue("setupWebsiteName"),public_url:inputValue("setupWebsiteUrl"),custom_domain:inputValue("setupCustomDomain"),platform:inputValue("setupWebsitePlatform")};
    try{ await saveSetupPayload({website},"Website / Domain情報を保存しました。"); state.setupStep="line"; renderSetupWizard(); }
    catch(error){ console.error(BUILD,error); toast(error?.message||"Website情報を保存できませんでした。",true); }
  }

  async function saveLineSetup(event) {
    event.preventDefault();
    if (!inputValue("setupLineName")) return toast("LINE公式アカウント名を入力してください。",true);
    const line={account_name:inputValue("setupLineName"),basic_id:inputValue("setupLineBasicId"),channel_id:inputValue("setupLineChannelId"),manager_url:inputValue("setupLineManager"),permission_status:inputValue("setupLinePermission"),messaging_api_status:inputValue("setupLineMessaging"),webhook_status:inputValue("setupLineWebhook"),liff_status:inputValue("setupLineLiff")};
    try{ await saveSetupPayload({line},"LINE公式情報を保存しました。"); }
    catch(error){ console.error(BUILD,error); toast(error?.message||"LINE情報を保存できませんでした。",true); }
  }

  async function startOnboarding(projectId) {
    if (!canWrite()) return;
    const button = document.querySelector(`[data-start-project="${CSS.escape(projectId)}"]`);
    const old = button?.textContent || "";
    if (button) { button.disabled=true; button.textContent="開始しています…"; }
    try {
      const {data,error} = await state.supabase.rpc("cc_customer_onboarding_start",{
        p_delivery_project_id:projectId,
        p_requirements:null,
      });
      if (error) throw error;
      await loadAll(true);
      const caseId = data?.case?.id;
      if (caseId) openCase(caseId);
      toast(data?.already_exists ? "既存のCustomer Workspaceを開きました。" : "Customer Workspaceを開始しました。");
    } catch (error) {
      console.error(BUILD,error);
      toast(error?.message || "導入を開始できませんでした。",true);
    } finally {
      if (button) { button.textContent=old; }
    }
  }

  async function confirmRequirements(event) {
    event.preventDefault();
    if (!canWrite() || !state.selectedCaseId) return;
    const requirements = {system_required:true};
    document.querySelectorAll("[data-requirement]").forEach((input) => {
      requirements[input.dataset.requirement] = input.dataset.requirement==="system_required" ? true : Boolean(input.checked);
    });
    const button = $("confirmRequirementsButton");
    const old = button.textContent;
    button.disabled=true; button.textContent="確定しています…";
    try {
      const {error} = await state.supabase.rpc("cc_customer_onboarding_confirm_requirements",{
        p_case_id:state.selectedCaseId,
        p_requirements:requirements,
      });
      if (error) throw error;
      await loadAll(true);
      renderDetail();
      toast("今回導入する構成を確定しました。");
    } catch (error) {
      console.error(BUILD,error);
      toast(error?.message || "導入構成を確定できませんでした。",true);
    } finally {
      button.textContent=old;
      renderDetail();
    }
  }

  async function setHold() {
    if (!canWrite() || !state.selectedCaseId) return;
    const code = $("holdCode").value.trim();
    const reason = $("holdReason").value.trim();
    if (!code || !reason) {
      toast("HOLDコードと理由を入力してください。",true);
      return;
    }
    try {
      const {error} = await state.supabase.rpc("cc_customer_onboarding_set_hold",{
        p_case_id:state.selectedCaseId,
        p_hold_code:code,
        p_hold_reason:reason,
      });
      if (error) throw error;
      await loadAll(true);
      renderDetail();
      toast("HOLDを記録しました。");
    } catch (error) {
      console.error(BUILD,error);
      toast(error?.message || "HOLDを記録できませんでした。",true);
    }
  }

  async function clearHold() {
    if (!canWrite() || !state.selectedCaseId) return;
    try {
      const {error} = await state.supabase.rpc("cc_customer_onboarding_set_hold",{
        p_case_id:state.selectedCaseId,
        p_hold_code:null,
        p_hold_reason:null,
      });
      if (error) throw error;
      await loadAll(true);
      renderDetail();
      toast("HOLDを解除しました。");
    } catch (error) {
      console.error(BUILD,error);
      toast(error?.message || "HOLDを解除できませんでした。",true);
    }
  }

  function switchTab(tab) {
    state.currentTab = tab;
    document.querySelectorAll("[data-workspace-tab]").forEach((b) => b.classList.toggle("is-active",b.dataset.workspaceTab===tab));
    $("casesPanel").classList.toggle("hidden",tab!=="cases");
    $("candidatesPanel").classList.toggle("hidden",tab!=="candidates");
  }

  function renderAll() {
    renderMetrics();
    renderCases();
    renderCandidates();
    if (state.selectedCaseId) renderDetail();
  }

  function bind() {
    $("retryButton")?.addEventListener("click",boot);
    $("reloadButton")?.addEventListener("click",async() => {
      try {
        await loadAll(true);
        if (state.selectedCaseId) {
          await loadEnvironmentVerification(state.selectedCaseId,{silent:true});
          renderDetail();
        }
        toast("最新情報へ更新しました。");
      }
      catch (e) { toast(e?.message || "更新できませんでした。",true); }
    });
    $("caseSearch")?.addEventListener("input",renderCases);
    $("caseFilter")?.addEventListener("change",renderCases);
    document.querySelectorAll("[data-workspace-tab]").forEach((b) => b.addEventListener("click",() => switchTab(b.dataset.workspaceTab)));
    $("closeDetailButton")?.addEventListener("click",() => {
      state.selectedCaseId=null;
      $("detailPanel").classList.add("hidden");
    });
    $("requirementsForm")?.addEventListener("submit",confirmRequirements);
    $("setHoldButton")?.addEventListener("click",setHold);
    $("clearHoldButton")?.addEventListener("click",clearHold);
    $("refreshVerificationButton")?.addEventListener("click",async()=>{
      if (!state.selectedCaseId) return;
      const button=$("refreshVerificationButton");
      const oldText=button.textContent;
      button.disabled=true; button.textContent="更新中…";
      try{
        await loadEnvironmentVerification(state.selectedCaseId,{silent:true});
        renderEnvironmentVerification();
        toast("確認結果を更新しました。");
      }catch(error){
        console.error(BUILD,error);
        toast(error?.message||"確認結果を更新できませんでした。",true);
      }finally{
        button.disabled=false; button.textContent=oldText;
      }
    });
    document.querySelectorAll("[data-setup-step]").forEach((button)=>button.addEventListener("click",()=>{ const w=workspaceFor(state.selectedCaseId); if (!w) return; if (!setupStepApplicable(w,button.dataset.setupStep)) return toast("今回の契約では対象外です。"); switchSetupStep(button.dataset.setupStep); }));
    $("refreshNamePlanButton")?.addEventListener("click",async()=>{ try{ await loadSetupNamePlan(state.selectedCaseId); renderSetupWizard(); toast("名前候補を再生成しました。"); }catch(error){ console.error(BUILD,error); toast(error?.message||"名前候補を生成できませんでした。",true); } });
    $("setupOwnerForm")?.addEventListener("submit",saveOwnerSetup);
    $("setupSystemForm")?.addEventListener("submit",saveSystemSetup);
    $("setupSupabaseForm")?.addEventListener("submit",saveSupabaseSetup);
    $("setupGithubForm")?.addEventListener("submit",saveGithubSetup);
    $("setupWorkerForm")?.addEventListener("submit",saveWorkerSetup);
    $("setupWebsiteForm")?.addEventListener("submit",saveWebsiteSetup);
    $("setupLineForm")?.addEventListener("submit",saveLineSetup);
  }

  async function boot() {
    try {
      setLoading("ログインとCustomer Workspace DBを確認しています…");
      const ok = await initializeSupabase();
      if (!ok) return;
      await loadAll(true);
      bind();
      showOnly("app");
    } catch (error) {
      console.error(BUILD,error);
      $("errorText").textContent = error?.message || "Customer Workspaceを読み込めませんでした。";
      showOnly("errorScreen");
    }
  }

  window.addEventListener("DOMContentLoaded",boot,{once:true});
})();
