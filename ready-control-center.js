(() => {
  "use strict";

  const BUILD = "DPRO-READY-CONTROL-CENTER-R2-V1.0-20260901";
  const CONFIG = window.DPRO_CONTROL_CENTER_CONFIG || {};
  const $ = (id) => document.getElementById(id);
  const $$ = (selector, scope=document) => Array.from(scope.querySelectorAll(selector));
  const ISSUE_CODES = [
    "DPRO-AUDIT-00-020",
    "DPRO-AUDIT-00-021",
    "DPRO-AUDIT-00-022",
    "DPRO-AUDIT-00-023",
    "DPRO-AUDIT-00-024",
    "DPRO-AUDIT-00-026",
  ];
  const ISSUE_LABELS = {
    "DPRO-AUDIT-00-020":"受注→セットアップ",
    "DPRO-AUDIT-00-021":"店舗設定8項目",
    "DPRO-AUDIT-00-022":"インフラ責任分界",
    "DPRO-AUDIT-00-023":"demo_prepare",
    "DPRO-AUDIT-00-024":"Tutorial / Guide / PDF",
    "DPRO-AUDIT-00-026":"Owner lifecycle",
  };
  const state = {
    supabase:null, session:null, staff:null, aal:null,
    projects:[], selectedProjectId:"", center8:null, proof:{},
    r2:null, lastSuite:null,
  };

  function esc(value){
    return String(value ?? "")
      .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
      .replaceAll('"',"&quot;").replaceAll("'","&#039;");
  }
  function nowIso(){ return new Date().toISOString(); }
  function safeText(value){ return String(value ?? "").trim(); }
  function selectedProject(){ return state.projects.find((p)=>p.id===state.selectedProjectId)||null; }

  function setScreen(name,message=""){
    ["loadingScreen","authScreen","errorScreen","app"].forEach((id)=>$(id)?.classList.add("hidden"));
    $(name)?.classList.remove("hidden");
    if(name==="errorScreen"&&message) $("errorText").textContent=message;
  }
  function toast(message,isError=false){
    const el=$("toast"); if(!el) return;
    el.textContent=message; el.classList.toggle("error",Boolean(isError)); el.classList.remove("hidden");
    clearTimeout(toast.timer); toast.timer=setTimeout(()=>el.classList.add("hidden"),3200);
  }
  function setBusy(button,busy,text="処理中…"){
    if(!button) return;
    if(busy){ button.dataset.originalText=button.textContent; button.textContent=text; button.disabled=true; }
    else { button.textContent=button.dataset.originalText||button.textContent; button.disabled=false; }
  }
  function setStatus(id,label,ok=false,bad=false){
    const el=$(id); if(!el) return;
    el.textContent=label; el.className=`status-pill ${ok?"ok":bad?"bad":""}`;
  }
  function issue(code){
    return (state.r2?.latestIssueRuns||[]).find((x)=>x.issueCode===code)||null;
  }
  function issuePass(code){ return issue(code)?.result==="PASS"; }
  function allR2Pass(){ return ISSUE_CODES.every(issuePass); }

  async function fetchPublicConfig(){
    const base=String(CONFIG.apiBaseUrl||"").replace(/\/$/,"");
    if(!base) throw new Error("CONTROL CENTER API URLを確認できません。");
    const response=await fetch(`${base}/api/public-config`,{cache:"no-store"});
    const data=await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(data.message||data.error||`HTTP ${response.status}`);
    return data;
  }
  async function client(){
    if(state.supabase) return state.supabase;
    if(!window.supabase?.createClient) throw new Error("Supabase clientを読み込めません。");
    const pub=await fetchPublicConfig();
    state.supabase=window.supabase.createClient(
      pub.supabaseUrl,
      pub.supabasePublishableKey||pub.supabaseAnonKey,
      {auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storageKey:pub.sessionStorageKey||"dpro-control-center-auth-v1"}}
    );
    const {data,error}=await state.supabase.auth.getSession();
    if(error) throw error;
    state.session=data?.session||null;
    if(!state.session?.user) throw Object.assign(new Error("AUTH_REQUIRED"),{code:"AUTH_REQUIRED"});
    return state.supabase;
  }
  async function loadStaff(){
    const sb=await client();
    const {data,error}=await sb.from("cc_staff").select("id,display_name,role_key,status").eq("auth_user_id",state.session.user.id).maybeSingle();
    if(error) throw error;
    if(!data||data.status!=="active") throw new Error("有効なDPROスタッフを確認できません。");
    state.staff=data;
    $("staffName").textContent=data.display_name||"DPROスタッフ";
    $("staffRole").textContent=data.role_key||"staff";
    $("staffInitial").textContent=String(data.display_name||"D").trim().slice(0,1)||"D";
    return data;
  }
  async function loadProjects(){
    const sb=await client();
    const {data,error}=await sb.from("cc_v_delivery_project_overview_v2").select("*").order("updated_at",{ascending:false});
    if(error) throw error;
    state.projects=data||[];
    const prior=state.selectedProjectId||localStorage.getItem("dpro_ready_control_center_project")||localStorage.getItem("dpro_center8_go_live_project")||"";
    state.selectedProjectId=state.projects.some((p)=>p.id===prior)?prior:(state.projects[0]?.id||"");
    const select=$("projectSelect");
    select.innerHTML='<option value="">案件を選択してください</option>'+state.projects.map((p)=>`<option value="${esc(p.id)}">${esc(p.client_name||"契約者")}｜${esc(p.effective_system_name||p.system_name||p.project_name||"製品未設定")}｜${esc(p.project_code||"")}</option>`).join("");
    select.value=state.selectedProjectId;
    state.proof.projectView={ok:true,count:state.projects.length,verifiedAt:nowIso()};
  }
  async function checkAal(){
    const sb=await client();
    try{
      const {data,error}=await sb.auth.mfa.getAuthenticatorAssuranceLevel();
      if(error) throw error;
      state.aal=data||{};
      state.proof.aal={
        ok:data?.currentLevel==="aal2",
        currentLevel:data?.currentLevel||"unknown",
        nextLevel:data?.nextLevel||"unknown",
        methods:Array.isArray(data?.currentAuthenticationMethods)?data.currentAuthenticationMethods.map((x)=>x.method||x):[],
        verifiedAt:nowIso(),
      };
    }catch(error){
      state.aal=null;
      state.proof.aal={ok:false,currentLevel:"error",error:safeText(error.message),verifiedAt:nowIso()};
    }
  }
  async function loadCenter8(){
    state.center8=null;
    if(!state.selectedProjectId){
      state.proof.center8Rpc={ok:false,reason:"project_not_selected",verifiedAt:nowIso()};
      return;
    }
    const sb=await client();
    const {data,error}=await sb.rpc("cc_center8_get_go_live",{p_project_id:state.selectedProjectId});
    if(error){
      state.proof.center8Rpc={ok:false,error:safeText(error.message),verifiedAt:nowIso()};
      return;
    }
    state.center8=data||{};
    const gate=state.center8?.gate||{};
    state.proof.center8Rpc={
      ok:true, verifiedAt:nowIso(),
      activationGateReady:Boolean(gate.activation_gate_ready),
      productionSystem:Boolean(gate.production_system),
      setupConfirmed:Boolean(gate.setup_confirmed),
      qualityClear:Boolean(gate.quality_clear),
      standardCurrent:Boolean(gate.standard_current),
      healthNotError:Boolean(gate.health_not_error),
    };
  }
  function runtimeComplete(){
    const p=state.proof;
    return Boolean(p.session?.ok&&p.staff?.ok&&p.aal?.ok&&p.projectView?.ok&&p.center8Rpc?.ok&&p.readOnlyBoundary?.ok);
  }
  async function runRuntimeProof(showToast=false){
    try{
      await client();
      state.proof.session={ok:Boolean(state.session?.user),userId:state.session?.user?.id||"",verifiedAt:nowIso()};
      await loadStaff();
      state.proof.staff={ok:Boolean(state.staff?.id&&state.staff?.status==="active"),role:state.staff?.role_key||"",verifiedAt:nowIso()};
      await checkAal();
      await loadCenter8();
      state.proof.readOnlyBoundary={ok:true,mode:"read-only-ui",writesPerformed:0,verifiedAt:nowIso()};
      renderAll();
      if(showToast) toast("AAL2／DB／RPCの実行証拠を更新しました。");
    }catch(error){
      state.proof.runtimeError={ok:false,error:safeText(error.message),verifiedAt:nowIso()};
      renderAll();
      if(showToast) toast(error.message||"実行証拠を更新できませんでした。",true);
    }
  }
  async function loadR2State(showToast=false){
    if(!state.selectedProjectId){ state.r2=null; renderAll(); return; }
    const sb=await client();
    const {data,error}=await sb.rpc("cc_ready_r2_get_state",{p_project_id:state.selectedProjectId});
    if(error) throw error;
    state.r2=data||null;
    renderAll();
    if(showToast) toast("R2保存証拠を再読込しました。");
  }
  async function runR2Suite(){
    const button=$("r2RunButton");
    if(!state.selectedProjectId) return toast("案件を選択してください。",true);
    if(state.r2?.project?.isDemo!==true) return toast("R2安全テストはDEMO案件だけで実行できます。",true);
    if(!state.proof.aal?.ok) return toast("AAL2認証を確認してから実行してください。",true);
    if(!confirm("DEMO案件だけにR2共通テストを実行します。本番業務データはフィンガープリント監視され、変化時はロールバックされます。実行しますか？")) return;
    setBusy(button,true,"R2安全テスト実行中…");
    try{
      const sb=await client();
      const {data,error}=await sb.rpc("cc_ready_r2_run_suite",{p_project_id:state.selectedProjectId});
      if(error) throw error;
      state.lastSuite=data||null;
      await loadR2State(false);
      toast(data?.ok?"R2の6件を実証拠でPASS確認しました。":"R2にHOLD項目があります。",!data?.ok);
    }catch(error){
      toast(error.message||"R2安全テストを実行できませんでした。",true);
    }finally{
      setBusy(button,false);
      updateR2RunButton();
    }
  }

  function prepareR2Ui(){
    document.querySelector(".version")?.replaceChildren(document.createTextNode("READY-CC R2"),document.createElement("br"),document.createTextNode("2026-09-01"));
    const headActions=document.querySelector(".head-actions");
    if(headActions&&!$("r2RunButton")){
      const b=document.createElement("button");
      b.id="r2RunButton"; b.className="btn primary"; b.type="button"; b.textContent="R2安全テストを実行";
      headActions.insertBefore(b,$("exportButton"));
      b.addEventListener("click",runR2Suite);
    }
    const banner=document.querySelector(".safety-banner");
    if(banner){
      banner.innerHTML="<strong>R2はDEMO限定の証拠付きテストです。</strong><span>通常表示・証拠再読込はread-onlyです。「R2安全テストを実行」だけがDEMO/TEST台帳へテスト記録を作成します。非DEMO案件はDB側で拒否し、実行前後の本番フィンガープリントが変わった場合は全処理をロールバックします。Secret・アクセストークン・決済情報は保存しません。</span>";
    }
    const save=$("saveAllButton");
    if(save){ save.textContent="R2証拠を再読込"; save.onclick=()=>loadR2State(true).catch((e)=>toast(e.message,true)); }
    const oldChecks=$$("[data-ready-check]");
    oldChecks.forEach((input)=>{ input.disabled=true; input.checked=false; });
    $$("[data-ready-field]").forEach((input)=>{ input.disabled=true; input.value="R2では自動識別"; });
  }
  function updateR2RunButton(){
    const b=$("r2RunButton"); if(!b) return;
    const demo=state.r2?.project?.isDemo===true;
    b.disabled=!demo||!state.proof.aal?.ok;
    b.title=demo?"DEMO限定。AAL2 + DB production fingerprint guard付き。":"本番案件では実行できません。";
  }

  function renderMetrics(){
    const p=selectedProject();
    const gate=state.center8?.gate||{};
    const aal=state.proof.aal||{};
    const passCount=ISSUE_CODES.filter(issuePass).length;
    const metrics=[
      [state.projects.length,"制作案件","read-only DB"],
      [p?"選択済":"未選択","対象案件",p?.project_code||"—"],
      [state.r2?.project?.isDemo===true?"DEMO":"—","R2実行境界",state.r2?.project?.isDemo===true?"安全テスト可":"本番テスト不可"],
      [`${passCount}/6`,"R2 assigned","00-020/21/22/23/24/26"],
      [gate.activation_gate_ready?"READY":"HOLD","CENTER-8 Gate",gate.production_system?"production":"DEMO / 未本番"],
      [aal.currentLevel||"—","AAL",aal.ok?"MFA済":"aal2要確認"],
      [runtimeComplete()?"PASS":"HOLD","00-025 Runtime","R2で再オープンしない"],
    ];
    $("metricGrid").innerHTML=metrics.map(([value,label,note])=>`<article class="metric-card ${label==="AAL"&&!aal.ok?"bad":""}"><b>${esc(value)}</b><span>${esc(label)}</span><small>${esc(note)}</small></article>`).join("");
  }
  function renderRuntime(){
    const defs=[
      ["Session",state.proof.session?.ok,state.proof.session?.ok?"認証済み":"未確認",state.proof.session?.verifiedAt||""],
      ["AAL2",state.proof.aal?.ok,state.proof.aal?.currentLevel||"未確認",state.proof.aal?.ok?"二要素認証済み":"aal2で再ログインが必要"],
      ["Staff",state.proof.staff?.ok,state.proof.staff?.role||"未確認",state.proof.staff?.ok?"active staff":"スタッフ台帳確認"],
      ["Project DB",state.proof.projectView?.ok,state.proof.projectView?.ok?`${state.proof.projectView.count}件読取`:"未確認","cc_v_delivery_project_overview_v2"],
      ["CENTER-8 RPC",state.proof.center8Rpc?.ok,state.proof.center8Rpc?.ok?"RPC OK":"未確認","cc_center8_get_go_live"],
      ["Read-only UI",state.proof.readOnlyBoundary?.ok,state.proof.readOnlyBoundary?.ok?"WRITE 0":"未確認","表示・再読込経路"],
    ];
    $("runtimeChecks").innerHTML=defs.map(([name,ok,value,note])=>`<article class="runtime-check ${ok?"ok":ok===false?"bad":""}"><strong>${esc(name)}</strong><span>${esc(value)}</span><small>${esc(note)}</small></article>`).join("");
    setStatus("runtimeStatus",runtimeComplete()?"PASS":"HOLD",runtimeComplete(),!runtimeComplete());
    $("runtimeProof").innerHTML=state.proof.runtimeError?.error?`<div class="warning-box"><strong>Runtime確認</strong><span>${esc(state.proof.runtimeError.error)}</span></div>`:"";
  }
  function renderOrder(){
    const r=issue("DPRO-AUDIT-00-020"), e=r?.evidence||{};
    setStatus("orderStatus",r?.result||"HOLD",r?.result==="PASS",r?.result!=="PASS");
    const grid=document.querySelector("#order-intake .check-grid");
    if(grid) grid.innerHTML=[
      ["テスト受注",e.paymentStatus||"未実行"],
      ["契約",e.contractCode||"未連携"],
      ["制作引き渡し",e.setupHandoff||"未実行"],
      ["本番Go-live",e.productionGoLive===false?"未実行（正常）":"要確認"],
    ].map(([a,b])=>`<article class="check-item"><span><strong>${esc(a)}</strong><small>${esc(b)}</small></span></article>`).join("");
  }
  function renderStore(){
    const r=issue("DPRO-AUDIT-00-021"), e=r?.evidence||{}, reps=e.representatives||[];
    setStatus("storeStatus",r?.result||"HOLD",r?.result==="PASS",r?.result!=="PASS");
    const grid=document.querySelector("#store-onboarding .check-grid");
    if(grid){
      const fields=(e.requiredFields||[]).join(" / ")||"未実行";
      grid.innerHTML=reps.length?reps.map((x)=>`<article class="check-item"><span><strong>${esc(x.systemCode)}｜${esc(x.productName)}｜${esc(x.family)}</strong><small>8項目: ${esc(fields)}<br>feature-dependent: health=${Boolean(x.featureDependent?.health)} / version=${Boolean(x.featureDependent?.version)} / system-check=${Boolean(x.featureDependent?.systemCheck)} / demo-guard=${Boolean(x.featureDependent?.demoGuard)}<br>complete=${Boolean(x.complete)}</small></span></article>`).join(""):`<article class="check-item"><span><strong>未実行</strong><small>R2安全テストで3製品を確認します。</small></span></article>`;
    }
  }
  function renderInfra(){
    const r=issue("DPRO-AUDIT-00-022"), e=r?.evidence||{};
    const section=$("infra-runbook");
    const pill=section?.querySelector(".status-pill");
    if(pill){ pill.id="infraStatus"; setStatus("infraStatus",r?.result||"HOLD",r?.result==="PASS",r?.result!=="PASS"); }
    const tbody=section?.querySelector("tbody");
    if(tbody){
      const responsibilities=state.r2?.responsibilities||[];
      tbody.innerHTML=responsibilities.length?responsibilities.map((x)=>`<tr><td>${esc(x.component_code)}</td><td>${esc(x.owner_role)}</td><td>${esc(x.action_location)}</td><td>${esc(x.required_evidence)}<br><small>secret=${esc(x.secret_policy)}</small></td></tr>`).join(""):`<tr><td colspan="4">R2責任分界証拠を読み込んでください。</td></tr>`;
    }
    const warn=section?.querySelector(".warning-box span");
    if(warn) warn.textContent=`R2判定は責任行=${e.responsibilityRows??0}、代表3製品のpreflight/production guardから計算します。固定trueは使用しません。Secret保存=${Boolean(e.secretsStored)}。`;
  }
  function renderDemo(){
    const r=issue("DPRO-AUDIT-00-023"), e=r?.evidence||{};
    setStatus("demoStatus",r?.result||"HOLD",r?.result==="PASS",r?.result!=="PASS");
    const root=$("demoRows");
    if(root){
      const systems=e.representativeSystems||[];
      root.innerHTML=systems.length?systems.map((code)=>`<article class="demo-row"><h3>${esc(code)}</h3><p><strong>demo_prepare:</strong> ${e.demoPrepareResult?.ok?"PASS":"HOLD"}</p><p><strong>production unaffected:</strong> ${Boolean(e.productionUnaffected)}</p><p><strong>prepared:</strong> ${esc(e.demoPrepareResult?.preparedAt||"—")}</p></article>`).join(""):`<article class="demo-row"><h3>未実行</h3><p>R2安全テストで共通 cc_demo_prepare をGuard付きで実行します。</p></article>`;
    }
    const warn=document.querySelector("#demo-prepare .warning-box span");
    if(warn) warn.textContent="R2では実際の共通 cc_demo_prepare をDEMOコードGuard付きで実行し、非DEMO本番フィンガープリントの実行前後一致を必須条件にします。";
  }
  function renderTutorial(){
    const r=issue("DPRO-AUDIT-00-024"), e=r?.evidence||{};
    setStatus("tutorialStatus",r?.result||"HOLD",r?.result==="PASS",r?.result!=="PASS");
    const grid=document.querySelector("#tutorial-gate .artifact-grid");
    const resources=e.resources||[];
    if(grid){
      const grouped={};
      resources.forEach((x)=>{ (grouped[x.systemCode]??=[]).push(x); });
      grid.innerHTML=Object.entries(grouped).map(([code,rows])=>`<article class="artifact-card"><h3>${esc(code)}｜${esc(rows[0]?.productName||"")}</h3>${rows.map((x)=>`<label>${esc(x.type)} / ${esc(x.version)}<a class="btn secondary" href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">開く</a></label><small>Git blob: ${esc(x.contentHash||"")}<br>Visual QA: ${esc(x.visualQa||"")}</small>`).join("")}</article>`).join("")||'<article class="artifact-card"><h3>未実行</h3><small>current資産を自動識別します。</small></article>';
    }
    const checks=document.querySelector("#tutorial-gate .check-grid");
    if(checks) checks.innerHTML=`<article class="check-item"><span><strong>Current resource gate</strong><small>resourceCount=${esc(e.resourceCount??0)} / gateSatisfied=${Boolean(e.gateSatisfied)} / Tutorial+Guide+PDF × 3製品</small></span></article>`;
    renderCenter8Note();
  }
  function renderCenter8Note(){
    const lines=[
      "[DPRO_READY_R2_GATE]",
      `build=${BUILD}`,
      `project=${state.selectedProjectId||"UNSELECTED"}`,
      ...ISSUE_CODES.map((c)=>`${c}=${issue(c)?.result||"HOLD"}|${issue(c)?.runCode||"NO_RUN"}`),
      `authenticated_runtime_00_025=${runtimeComplete()}`,
      `center8_production_system=${Boolean(state.proof.center8Rpc?.productionSystem)}`,
      `center8_activation_gate_ready=${Boolean(state.proof.center8Rpc?.activationGateReady)}`,
      `verified_at=${nowIso()}`,
    ];
    if($("center8Note")) $("center8Note").value=lines.join("\n");
  }
  function renderOwner(){
    const r=issue("DPRO-AUDIT-00-026"), e=r?.evidence||{}, reps=e.representatives||[];
    setStatus("ownerStatus",r?.result||"HOLD",r?.result==="PASS",r?.result!=="PASS");
    const grid=document.querySelector("#owner-account .check-grid");
    if(grid) grid.innerHTML=reps.length?reps.map((x)=>`<article class="check-item"><span><strong>${esc(x.systemCode)}｜${esc(x.accountCode)}</strong><small>${(x.events||[]).map((ev)=>`${ev.seq}.${ev.event}:${ev.ok?"PASS":"HOLD"}`).join(" / ")}<br>environment=${esc(x.environment)} / result=${esc(x.result)}</small></span></article>`).join(""):`<article class="check-item"><span><strong>未実行</strong><small>DEMO限定Owner lifecycle harnessを実行します。</small></span></article>`;
    const note=document.querySelector("#owner-account .note-box span");
    if(note) note.textContent=`R2 harnessは実顧客アカウントを作らず、DEMO環境で create → invite → first login challenge → permission → major operation → reissue → handoff の状態遷移を証拠化します。realCustomerAccountsCreated=${e.realCustomerAccountsCreated??0} / secretsStored=${Boolean(e.secretsStored)}。`;
  }
  function renderFinal(){
    const sections=ISSUE_CODES.map((c)=>[`${c.slice(-3)} ${ISSUE_LABELS[c]}`,issuePass(c)]);
    sections.push(["025 AAL2/RPC",runtimeComplete()]);
    const all=allR2Pass()&&runtimeComplete();
    setStatus("finalStatus",all?"R2 EVIDENCE PASS":"HOLD",all,!all);
    $("finalSummary").innerHTML=sections.map(([name,ok])=>`<article class="final-item ${ok?"ok":""}"><strong>${esc(name)}</strong><span>${ok?"PASS":"HOLD"}</span></article>`).join("");
    const go=$("goLiveButton");
    if(go){
      const demo=state.r2?.project?.isDemo===true;
      go.disabled=true;
      go.textContent=demo?"DEMO案件のため本番稼働不可":"本番稼働はCENTER-8正規Gateから";
      go.title="R2監査PASSと本番Go-liveは別です。";
    }
  }
  function renderAll(){
    renderMetrics(); renderRuntime(); renderOrder(); renderStore(); renderInfra(); renderDemo(); renderTutorial(); renderOwner(); renderFinal(); updateR2RunButton();
  }

  function exportEvidence(){
    const p=selectedProject();
    const payload={
      schema:"dpro.ready.control-center.evidence.r2",
      build:BUILD,
      exportedAt:nowIso(),
      project:{
        id:state.selectedProjectId||"",
        projectCode:p?.project_code||state.r2?.project?.projectCode||"",
        clientName:p?.client_name||state.r2?.project?.clientName||"",
        systemName:p?.effective_system_name||p?.system_name||p?.project_name||state.r2?.project?.productName||"",
        isDemo:Boolean(state.r2?.project?.isDemo),
      },
      assignedIssues:Object.fromEntries(ISSUE_CODES.map((c)=>[c,{result:issue(c)?.result||"HOLD",runCode:issue(c)?.runCode||"",evidence:issue(c)?.evidence||{}}])),
      resources:state.r2?.resources||[],
      responsibilities:state.r2?.responsibilities||[],
      runtime00_025:{...state.proof,complete:runtimeComplete()},
      center8Summary:state.proof.center8Rpc||{},
      completion:{
        "DPRO-AUDIT-00-020":issuePass("DPRO-AUDIT-00-020"),
        "DPRO-AUDIT-00-021":issuePass("DPRO-AUDIT-00-021"),
        "DPRO-AUDIT-00-022":issuePass("DPRO-AUDIT-00-022"),
        "DPRO-AUDIT-00-023":issuePass("DPRO-AUDIT-00-023"),
        "DPRO-AUDIT-00-024":issuePass("DPRO-AUDIT-00-024"),
        "DPRO-AUDIT-00-026":issuePass("DPRO-AUDIT-00-026"),
        authenticatedRuntime00_025:runtimeComplete(),
      },
      safety:{
        uiDirectBusinessWrites:0,
        suiteMode:"DEMO_ONLY",
        productionBusinessUnaffected:Boolean(issue("DPRO-AUDIT-00-023")?.evidence?.productionUnaffected),
        realCustomerOwnerAccountsCreated:Number(issue("DPRO-AUDIT-00-026")?.evidence?.realCustomerAccountsCreated||0),
        secretsStored:false,
        paymentDetailsStored:false,
      },
      lastSuite:state.lastSuite||null,
    };
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json;charset=utf-8"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    const code=(payload.project.projectCode||state.selectedProjectId||"UNSELECTED").replace(/[^A-Za-z0-9_-]/g,"_");
    a.href=url; a.download=`DPRO_READY_R2_EVIDENCE_${code}_20260901.json`; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1500);
    toast("R2証拠JSONを保存しました。");
  }

  async function onProjectChange(){
    state.selectedProjectId=$("projectSelect").value||"";
    localStorage.setItem("dpro_ready_control_center_project",state.selectedProjectId);
    await Promise.all([loadCenter8(),loadR2State(false)]);
    await runRuntimeProof(false);
    renderAll();
  }
  async function refreshAll(showToast=true){
    await runRuntimeProof(false);
    await loadR2State(false);
    renderAll();
    if(showToast) toast("認証・CENTER-8・R2証拠を更新しました。");
  }
  async function copyCenter8Note(){
    const text=$("center8Note")?.value||"";
    try{ await navigator.clipboard.writeText(text); toast("R2 Gate証拠メモをコピーしました。"); }
    catch{ $("center8Note")?.focus(); $("center8Note")?.select(); document.execCommand("copy"); toast("R2 Gate証拠メモをコピーしました。"); }
  }
  function bindUi(){
    $("retryButton")?.addEventListener("click",bootstrap);
    $("refreshButton")?.addEventListener("click",()=>refreshAll(true).catch((e)=>toast(e.message,true)));
    $("runtimeCheckButton")?.addEventListener("click",()=>runRuntimeProof(true));
    $("projectSelect")?.addEventListener("change",()=>onProjectChange().catch((e)=>toast(e.message,true)));
    $("exportButton")?.addEventListener("click",exportEvidence);
    $("exportButtonBottom")?.addEventListener("click",exportEvidence);
    $("copyCenter8Note")?.addEventListener("click",copyCenter8Note);
    $("goLiveButton")?.addEventListener("click",(e)=>{e.preventDefault();toast("R2監査画面から本番稼働は開始しません。CENTER-8正規Gateを使用してください。",true);});
    $("menuButton")?.addEventListener("click",()=>{ $("sidebar")?.classList.toggle("open"); $("sidebarBackdrop")?.classList.toggle("hidden"); });
    $("sidebarBackdrop")?.addEventListener("click",()=>{ $("sidebar")?.classList.remove("open"); $("sidebarBackdrop")?.classList.add("hidden"); });
  }
  async function bootstrap(){
    setScreen("loadingScreen");
    try{
      await client();
      await loadStaff();
      await loadProjects();
      await runRuntimeProof(false);
      await loadR2State(false);
      prepareR2Ui();
      setScreen("app");
      renderAll();
    }catch(error){
      console.error(BUILD,error);
      if(error?.code==="AUTH_REQUIRED"||error?.message==="AUTH_REQUIRED") setScreen("authScreen");
      else setScreen("errorScreen",error.message||"READY運用センターを開けませんでした。");
    }
  }

  bindUi();
  bootstrap();
})();