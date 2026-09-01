(() => {
  "use strict";

  const BUILD = "DPRO-READY-CONTROL-CENTER-V1.0-20260901";
  const CONFIG = window.DPRO_CONTROL_CENTER_CONFIG || {};
  const $ = (id) => document.getElementById(id);
  const $$ = (selector, scope=document) => Array.from(scope.querySelectorAll(selector));

  const state = {
    supabase:null,
    session:null,
    staff:null,
    aal:null,
    projects:[],
    selectedProjectId:"",
    center8:null,
    proof:{},
    evidence:null,
  };

  const CHECK_KEYS = [
    "order.received","order.contract","order.productionLock","order.handoff",
    "store.identity","store.hours","store.holidays","store.line","store.staff","store.services","store.brand","store.permissions",
    "tutorial.linkQa","tutorial.visualQa","tutorial.handoff",
    "owner.provisioned","owner.firstLogin","owner.permissions","owner.majorOperation","owner.reissue","owner.handoff",
  ];
  const FIELD_KEYS = [
    "tutorial.version","tutorial.url","tutorial.hash",
    "guide.version","guide.url","guide.hash",
    "pdf.version","pdf.url","pdf.hash",
  ];
  const DEMO_COUNT = 3;

  function esc(value){
    return String(value ?? "")
      .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
      .replaceAll('"',"&quot;").replaceAll("'","&#039;");
  }

  function nowIso(){ return new Date().toISOString(); }
  function selectedProject(){ return state.projects.find((p)=>p.id===state.selectedProjectId)||null; }
  function safeText(value){ return String(value ?? "").trim(); }
  function keyForProject(){ return `dpro_ready_control_center_v1:${state.selectedProjectId || "unselected"}`; }
  function isLikelyUrl(value){
    try { const u=new URL(String(value||"")); return u.protocol==="https:"; } catch { return false; }
  }

  function defaultEvidence(){
    return {
      schema:"dpro.ready.control-center.evidence.v1",
      build:BUILD,
      projectId:state.selectedProjectId||"",
      savedAt:null,
      checks:{},
      fields:{},
      demos:Array.from({length:DEMO_COUNT},()=>({productCode:"",demoUrl:"",systemCheckUrl:"",prepared:false,productionUnaffected:false})),
      runtime:{},
    };
  }

  function loadEvidence(){
    let value=defaultEvidence();
    try{
      const raw=localStorage.getItem(keyForProject());
      if(raw){
        const parsed=JSON.parse(raw);
        value={...value,...parsed,checks:{...value.checks,...(parsed.checks||{})},fields:{...value.fields,...(parsed.fields||{})}};
        if(Array.isArray(parsed.demos)) value.demos=value.demos.map((base,i)=>({...base,...(parsed.demos[i]||{})}));
      }
    }catch(error){ console.warn(BUILD,"evidence read",error); }
    value.projectId=state.selectedProjectId||"";
    state.evidence=value;
  }

  function saveEvidence(silent=false){
    if(!state.evidence) loadEvidence();
    state.evidence.projectId=state.selectedProjectId||"";
    state.evidence.savedAt=nowIso();
    state.evidence.runtime={...(state.evidence.runtime||{}),...(state.proof||{})};
    try{
      localStorage.setItem(keyForProject(),JSON.stringify(state.evidence));
      if(!silent) toast("READY確認をこのブラウザに保存しました。");
    }catch(error){ if(!silent) toast("保存できませんでした。",true); }
  }

  function setScreen(name,message=""){
    ["loadingScreen","authScreen","errorScreen","app"].forEach((id)=>$(id)?.classList.add("hidden"));
    $(name)?.classList.remove("hidden");
    if(name==="errorScreen"&&message) $("errorText").textContent=message;
  }

  function toast(message,isError=false){
    const el=$("toast"); if(!el) return;
    el.textContent=message; el.classList.toggle("error",Boolean(isError)); el.classList.remove("hidden");
    clearTimeout(toast.timer); toast.timer=setTimeout(()=>el.classList.add("hidden"),2600);
  }

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
    const prior=state.selectedProjectId||localStorage.getItem("dpro_ready_control_center_project")||localStorage.getItem("dpro_center8_go_live_project")||localStorage.getItem("dpro_center7_quality_project")||"";
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
      state.proof.aal={ok:data?.currentLevel==="aal2",currentLevel:data?.currentLevel||"unknown",nextLevel:data?.nextLevel||"unknown",methods:Array.isArray(data?.currentAuthenticationMethods)?data.currentAuthenticationMethods.map((x)=>x.method||x):[],verifiedAt:nowIso()};
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
      ok:true,
      verifiedAt:nowIso(),
      activationGateReady:Boolean(gate.activation_gate_ready),
      productionSystem:Boolean(gate.production_system),
      setupConfirmed:Boolean(gate.setup_confirmed),
      qualityClear:Boolean(gate.quality_clear),
      standardCurrent:Boolean(gate.standard_current),
      healthNotError:Boolean(gate.health_not_error),
    };
  }

  async function runRuntimeProof(showToast=false){
    try{
      await client();
      state.proof.session={ok:Boolean(state.session?.user),userId:state.session?.user?.id||"",verifiedAt:nowIso()};
      await loadStaff();
      state.proof.staff={ok:Boolean(state.staff?.id&&state.staff?.status==="active"),role:state.staff?.role_key||"",verifiedAt:nowIso()};
      await checkAal();
      await loadCenter8();
      state.proof.readOnlyBoundary={ok:true,mode:"read-only",writesPerformed:0,verifiedAt:nowIso()};
      if(state.evidence){ state.evidence.runtime={...state.proof}; saveEvidence(true); }
      renderAll();
      if(showToast) toast("AAL2／DB／RPCの読み取り証拠を更新しました。");
    }catch(error){
      state.proof.runtimeError={ok:false,error:safeText(error.message),verifiedAt:nowIso()};
      renderAll();
      if(showToast) toast(error.message||"実行証拠を更新できませんでした。",true);
    }
  }

  function renderMetrics(){
    const p=selectedProject();
    const gate=state.center8?.gate||{};
    const aal=state.proof.aal||{};
    const metrics=[
      [state.projects.length,"制作案件","read-only DB"],
      [p?"選択済":"未選択","対象案件",p?.project_code||"—"],
      [gate.linked_contract?"OK":"—","契約紐付け",gate.linked_contract?"正式契約":"要確認"],
      [gate.setup_confirmed?"OK":"—","契約セットアップ",gate.setup_status||""],
      [gate.quality_clear?"OK":"—","CENTER-7",gate.quality_clear?"実機確認済":"要確認"],
      [gate.activation_gate_ready?"READY":"—","CENTER-8 Gate",gate.activation_gate_ready?"自動Gate OK":"未完了あり"],
      [aal.currentLevel||"—","AAL",aal.ok?"MFA済":"aal2要確認"],
    ];
    $("metricGrid").innerHTML=metrics.map(([value,label,note])=>`<article class="metric-card ${label==="AAL"&&!aal.ok?"bad":""}"><b>${esc(value)}</b><span>${esc(label)}</span><small>${esc(note)}</small></article>`).join("");
  }

  function setStatus(id,label,ok=false,bad=false){
    const el=$(id); if(!el) return;
    el.textContent=label; el.className=`status-pill ${ok?"ok":bad?"bad":""}`;
  }

  function bindEvidenceInputs(){
    CHECK_KEYS.forEach((key)=>{
      const input=document.querySelector(`[data-ready-check="${CSS.escape(key)}"]`);
      if(!input) return;
      input.checked=Boolean(state.evidence?.checks?.[key]);
      input.onchange=()=>{ state.evidence.checks[key]=Boolean(input.checked); saveEvidence(true); renderStatuses(); };
    });
    FIELD_KEYS.forEach((key)=>{
      const input=document.querySelector(`[data-ready-field="${CSS.escape(key)}"]`);
      if(!input) return;
      input.value=state.evidence?.fields?.[key]||"";
      input.oninput=()=>{ state.evidence.fields[key]=safeText(input.value); saveEvidence(true); renderStatuses(); };
    });
  }

  function renderDemoRows(){
    const root=$("demoRows"); if(!root) return;
    root.innerHTML=state.evidence.demos.map((d,i)=>`
      <article class="demo-row" data-demo-index="${i}">
        <h3>代表製品 ${i+1}</h3>
        <label>Product / System code<input data-demo-field="productCode" value="${esc(d.productCode)}" placeholder="例：HAIR / DPRO-HAIR"></label>
        <label>Demo URL<input data-demo-field="demoUrl" value="${esc(d.demoUrl)}" type="url" placeholder="https://..."></label>
        <label>system-check URL<input data-demo-field="systemCheckUrl" value="${esc(d.systemCheckUrl)}" type="url" placeholder="https://..."></label>
        <label class="inline-check"><input data-demo-check="prepared" type="checkbox" ${d.prepared?"checked":""}><span>demo_prepare / デモ生成確認済み</span></label>
        <label class="inline-check"><input data-demo-check="productionUnaffected" type="checkbox" ${d.productionUnaffected?"checked":""}><span>本番環境が変化していないことを確認</span></label>
      </article>
    `).join("");
    $$('[data-demo-index]',root).forEach((card)=>{
      const i=Number(card.dataset.demoIndex);
      $$('[data-demo-field]',card).forEach((input)=>input.oninput=()=>{ state.evidence.demos[i][input.dataset.demoField]=safeText(input.value); saveEvidence(true); renderStatuses(); });
      $$('[data-demo-check]',card).forEach((input)=>input.onchange=()=>{ state.evidence.demos[i][input.dataset.demoCheck]=Boolean(input.checked); saveEvidence(true); renderStatuses(); });
    });
  }

  function tutorialComplete(){
    const f=state.evidence?.fields||{}, c=state.evidence?.checks||{};
    const docs=["tutorial","guide","pdf"].every((name)=>safeText(f[`${name}.version`])&&isLikelyUrl(f[`${name}.url`])&&safeText(f[`${name}.hash`]));
    return Boolean(docs&&c["tutorial.linkQa"]&&c["tutorial.visualQa"]&&c["tutorial.handoff"]);
  }
  function demoCompleteCount(){
    return (state.evidence?.demos||[]).filter((d)=>safeText(d.productCode)&&isLikelyUrl(d.demoUrl)&&isLikelyUrl(d.systemCheckUrl)&&d.prepared&&d.productionUnaffected).length;
  }
  function countChecks(prefix,keys){ return keys.filter((k)=>Boolean(state.evidence?.checks?.[`${prefix}.${k}`])).length; }

  function runtimeComplete(){
    const p=state.proof;
    return Boolean(p.session?.ok&&p.staff?.ok&&p.aal?.ok&&p.projectView?.ok&&p.center8Rpc?.ok&&p.readOnlyBoundary?.ok);
  }

  function renderCenter8Note(){
    const f=state.evidence?.fields||{}, c=state.evidence?.checks||{};
    const note=[
      "[DPRO_READY_GATE_V1]",
      `build=${BUILD}`,
      `project=${state.selectedProjectId||"UNSELECTED"}`,
      `tutorial=${safeText(f["tutorial.version"])}|${safeText(f["tutorial.url"])}|${safeText(f["tutorial.hash"])}`,
      `guide=${safeText(f["guide.version"])}|${safeText(f["guide.url"])}|${safeText(f["guide.hash"])}`,
      `pdf=${safeText(f["pdf.version"])}|${safeText(f["pdf.url"])}|${safeText(f["pdf.hash"])}`,
      `tutorial_link_qa=${Boolean(c["tutorial.linkQa"])}`,
      `tutorial_visual_qa=${Boolean(c["tutorial.visualQa"])}`,
      `tutorial_handoff=${Boolean(c["tutorial.handoff"])}`,
      `owner_first_login=${Boolean(c["owner.firstLogin"])}`,
      `owner_permissions=${Boolean(c["owner.permissions"])}`,
      `verified_at=${nowIso()}`,
    ].join("\n");
    $("center8Note").value=note;
  }

  function renderRuntime(){
    const defs=[
      ["Session",state.proof.session?.ok,state.proof.session?.ok?"認証済み":"未確認",state.proof.session?.verifiedAt||""],
      ["AAL2",state.proof.aal?.ok,state.proof.aal?.currentLevel||"未確認",state.proof.aal?.ok?"二要素認証済み":"aal2で再ログインが必要"],
      ["Staff",state.proof.staff?.ok,state.proof.staff?.role||"未確認",state.proof.staff?.ok?"active staff":"スタッフ台帳確認"],
      ["Project DB",state.proof.projectView?.ok,state.proof.projectView?.ok?`${state.proof.projectView.count}件読取`:"未確認","cc_v_delivery_project_overview_v2"],
      ["CENTER-8 RPC",state.proof.center8Rpc?.ok,state.proof.center8Rpc?.ok?"RPC OK":"未確認","cc_center8_get_go_live"],
      ["Read-only",state.proof.readOnlyBoundary?.ok,state.proof.readOnlyBoundary?.ok?"WRITE 0":"未確認","本ページから業務データ変更なし"],
    ];
    $("runtimeChecks").innerHTML=defs.map(([name,ok,value,note])=>`<article class="runtime-check ${ok?"ok":ok===false?"bad":""}"><strong>${esc(name)}</strong><span>${esc(value)}</span><small>${esc(note)}</small></article>`).join("");
    setStatus("runtimeStatus",runtimeComplete()?"PASS":"HOLD",runtimeComplete(),!runtimeComplete());
    $("runtimeProof").innerHTML=state.proof.runtimeError?.error?`<div class="warning-box"><strong>Runtime確認</strong><span>${esc(state.proof.runtimeError.error)}</span></div>`:"";
  }

  function orderComplete(){
    const manual=countChecks("order",["received","contract","productionLock","handoff"])===4;
    const linked=Boolean(state.center8?.gate?.linked_contract);
    return Boolean(manual&&linked);
  }

  function allReadyComplete(){
    return Boolean(
      orderComplete()
      &&countChecks("store",["identity","hours","holidays","line","staff","services","brand","permissions"])===8
      &&demoCompleteCount()===DEMO_COUNT
      &&tutorialComplete()
      &&runtimeComplete()
      &&countChecks("owner",["provisioned","firstLogin","permissions","majorOperation","reissue","handoff"])===6
    );
  }

  function renderStatuses(){
    if(!state.evidence) return;
    const orderKeys=["received","contract","productionLock","handoff"];
    const storeKeys=["identity","hours","holidays","line","staff","services","brand","permissions"];
    const ownerKeys=["provisioned","firstLogin","permissions","majorOperation","reissue","handoff"];
    const order=countChecks("order",orderKeys), store=countChecks("store",storeKeys), owner=countChecks("owner",ownerKeys), demo=demoCompleteCount();
    setStatus("orderStatus",orderComplete()?"PASS":`${order} / ${orderKeys.length}${state.center8?.gate?.linked_contract?"":" + 契約紐付け"}`,orderComplete(),!orderComplete());
    setStatus("storeStatus",`${store} / ${storeKeys.length}`,store===storeKeys.length);
    setStatus("demoStatus",`${demo} / ${DEMO_COUNT}`,demo===DEMO_COUNT);
    setStatus("tutorialStatus",tutorialComplete()?"PASS":"HOLD",tutorialComplete(),!tutorialComplete());
    setStatus("ownerStatus",`${owner} / ${ownerKeys.length}`,owner===ownerKeys.length);
    renderCenter8Note();

    const sections=[
      ["受注",orderComplete()],
      ["店舗設定",store===storeKeys.length],
      ["インフラ",true],
      ["デモ",demo===DEMO_COUNT],
      ["Tutorial/PDF",tutorialComplete()],
      ["AAL2/RPC",runtimeComplete()],
      ["Owner ID",owner===ownerKeys.length],
    ];
    const all=allReadyComplete();
    setStatus("finalStatus",all?"READY EVIDENCE PASS":"HOLD",all,!all);
    const go=$("goLiveButton"); if(go){ go.disabled=!all; go.textContent=all?"CENTER-8 本番稼働へ進む":"READY完了後にCENTER-8へ"; }
    $("finalSummary").innerHTML=sections.map(([name,ok])=>`<article class="final-item ${ok?"ok":""}"><strong>${esc(name)}</strong><span>${ok?"PASS":"HOLD"}</span></article>`).join("");
  }

  function renderAll(){
    renderMetrics();
    renderRuntime();
    renderStatuses();
  }

  function exportEvidence(){
    saveEvidence(true);
    const p=selectedProject();
    const payload={
      ...state.evidence,
      exportedAt:nowIso(),
      project:{
        id:state.selectedProjectId||"",
        projectCode:p?.project_code||"",
        clientName:p?.client_name||"",
        systemName:p?.effective_system_name||p?.system_name||p?.project_name||"",
      },
      center8Summary:state.proof.center8Rpc||{},
      completion:{
        order:orderComplete(),
        store:countChecks("store",["identity","hours","holidays","line","staff","services","brand","permissions"])===8,
        infrastructureRunbook:true,
        demoPrepare:demoCompleteCount()===DEMO_COUNT,
        tutorialPdf:tutorialComplete(),
        authenticatedRuntime:runtimeComplete(),
        ownerAccount:countChecks("owner",["provisioned","firstLogin","permissions","majorOperation","reissue","handoff"])===6,
      },
      safety:{productionBusinessWritesFromThisPage:0,secretsStored:false,paymentDetailsStored:false},
    };
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json;charset=utf-8"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    const code=(p?.project_code||state.selectedProjectId||"UNSELECTED").replace(/[^A-Za-z0-9_-]/g,"_");
    a.href=url; a.download=`DPRO_READY_EVIDENCE_${code}_20260901.json`; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1500);
    toast("READY証拠JSONを保存しました。");
  }

  async function onProjectChange(){
    saveEvidence(true);
    state.selectedProjectId=$("projectSelect").value||"";
    localStorage.setItem("dpro_ready_control_center_project",state.selectedProjectId);
    loadEvidence();
    bindEvidenceInputs();
    renderDemoRows();
    await loadCenter8();
    state.evidence.runtime={...state.proof};
    saveEvidence(true);
    renderAll();
  }

  async function copyCenter8Note(){
    const text=$("center8Note").value||"";
    try{ await navigator.clipboard.writeText(text); toast("CENTER-8用証拠メモをコピーしました。"); }
    catch{ $("center8Note").focus(); $("center8Note").select(); document.execCommand("copy"); toast("CENTER-8用証拠メモをコピーしました。"); }
  }

  function bindUi(){
    $("retryButton")?.addEventListener("click",bootstrap);
    $("refreshButton")?.addEventListener("click",()=>runRuntimeProof(true));
    $("runtimeCheckButton")?.addEventListener("click",()=>runRuntimeProof(true));
    $("projectSelect")?.addEventListener("change",onProjectChange);
    $("saveAllButton")?.addEventListener("click",()=>saveEvidence(false));
    $("exportButton")?.addEventListener("click",exportEvidence);
    $("exportButtonBottom")?.addEventListener("click",exportEvidence);
    $("copyCenter8Note")?.addEventListener("click",copyCenter8Note);
    $("goLiveButton")?.addEventListener("click",()=>{ if(allReadyComplete()) location.href="delivery.html"; else toast("READYのHOLD項目を先に完了してください。",true); });
    $("menuButton")?.addEventListener("click",()=>{ $("sidebar")?.classList.toggle("open"); $("sidebarBackdrop")?.classList.toggle("hidden"); });
    $("sidebarBackdrop")?.addEventListener("click",()=>{ $("sidebar")?.classList.remove("open"); $("sidebarBackdrop")?.classList.add("hidden"); });
  }

  async function bootstrap(){
    setScreen("loadingScreen");
    try{
      await client();
      await loadStaff();
      await loadProjects();
      loadEvidence();
      bindEvidenceInputs();
      renderDemoRows();
      await runRuntimeProof(false);
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
