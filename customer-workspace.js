(() => {
  "use strict";

  const BUILD = "DPRO-CUSTOMER-WORKSPACE-CO02-R1-20260921";
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
    const rows = state.projects.filter((p) => p.contract_id && p.status !== "cancelled");
    if (!rows.length) {
      $("candidateGrid").innerHTML = `<div class="empty-state"><strong>導入候補の契約案件はありません</strong><span>契約→制作プロジェクト作成後にここへ表示されます。</span></div>`;
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

  function openCase(caseId) {
    state.selectedCaseId = caseId;
    renderDetail();
    $("detailPanel").classList.remove("hidden");
    $("detailPanel").scrollIntoView({behavior:"smooth",block:"start"});
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
      try { await loadAll(true); toast("最新情報へ更新しました。"); }
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
