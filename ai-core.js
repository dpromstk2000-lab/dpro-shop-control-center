(() => {
  "use strict";

  const BUILD="DPRO-AI-CORE-UI-AI01-R1-20260922";
  const API_BASE="https://dpro-shop-control-center-api.dpromstk2000.workers.dev";
  const $=(id)=>document.getElementById(id);
  const $$=(selector,scope=document)=>Array.from(scope.querySelectorAll(selector));

  const state={supabase:null,session:null,staff:null,policy:null,summary:null,systems:[],queue:[],selectedProposal:null};
  const roleLabels={owner_admin:"管理責任者",technical_admin:"技術管理者",support:"DPROサポート",read_only:"閲覧専用"};

  function esc(value){return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
  function showOnly(id){["loadingScreen","authScreen","errorScreen","app"].forEach(x=>$(x)?.classList.toggle("hidden",x!==id));}
  function toast(message,error=false){const el=$("toast");el.textContent=message;el.className=`toast${error?" error":""}`;el.classList.remove("hidden");clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.add("hidden"),4200);}
  function canWrite(){return ["owner_admin","technical_admin","support"].includes(state.staff?.role_key);}
  function formatDate(value){if(!value)return"—";const d=new Date(value);if(Number.isNaN(d.getTime()))return String(value);return new Intl.DateTimeFormat("ja-JP",{month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"}).format(d);}
  function pill(text,tone=""){return `<span class="pill ${tone}">${esc(text||"—")}</span>`;}
  function riskTone(risk){return risk==="R4_PROTECTED"?"reopen":risk==="R3_PRODUCTION"?"brushup":risk==="R2_REVERSIBLE"?"progress":risk==="R1_DRAFT"?"current":"";}

  async function waitForSupabase(){
    return new Promise((resolve,reject)=>{
      let tries=0;
      const timer=setInterval(()=>{
        tries+=1;
        if(window.supabase?.createClient){clearInterval(timer);resolve();}
        else if(tries>100){clearInterval(timer);reject(new Error("Supabase接続ライブラリを読み込めませんでした。"));}
      },60);
    });
  }

  async function publicConfig(){
    const response=await fetch(`${API_BASE}/api/public-config`,{cache:"no-store"});
    const data=await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(data?.error||"公開接続設定を取得できませんでした。");
    return data;
  }

  async function boot(){
    try{
      $("loadingText").textContent=`${BUILD} / Safe Core確認中…`;
      const pub=await publicConfig();
      await waitForSupabase();
      state.supabase=window.supabase.createClient(pub.supabaseUrl,pub.supabasePublishableKey||pub.supabaseAnonKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storageKey:pub.sessionStorageKey||"dpro-control-center-auth-v1"}});
      const {data:{session},error:sessionError}=await state.supabase.auth.getSession();
      if(sessionError) throw sessionError;
      state.session=session;
      if(!session){showOnly("authScreen");return;}

      const {data:staff,error:staffError}=await state.supabase.from("cc_staff").select("id,display_name,role_key,status").eq("auth_user_id",session.user.id).maybeSingle();
      if(staffError) throw staffError;
      if(!staff||staff.status!=="active"){showOnly("authScreen");return;}
      state.staff=staff;
      $("staffName").textContent=staff.display_name||"DPROスタッフ";
      $("staffRole").textContent=roleLabels[staff.role_key]||staff.role_key||"DPROスタッフ";
      $("staffInitial").textContent=(staff.display_name||"D").trim().slice(0,1).toUpperCase();

      bind();
      await loadAll();
      applyDeepLink();
      showOnly("app");
    }catch(error){
      console.error(BUILD,error);
      $("errorText").textContent=error?.message||"DPRO AI COREを読み込めませんでした。";
      showOnly("errorScreen");
    }
  }

  function bind(){
    $("retryButton")?.addEventListener("click",()=>location.reload());
    $("refreshButton")?.addEventListener("click",async()=>{try{await loadAll();toast("AI COREを最新状態へ更新しました。");}catch(e){toast(e?.message||"更新できませんでした。",true);}});
    $("newRequestButton")?.addEventListener("click",()=>openRequest());
    $("requestForm")?.addEventListener("submit",submitRequest);
    $("searchInput")?.addEventListener("input",renderQueue);
    $("queueStatusFilter")?.addEventListener("change",renderQueue);
    $("menuButton")?.addEventListener("click",()=>$("sidebar")?.classList.toggle("open"));
    $$("[data-close-request]").forEach(b=>b.addEventListener("click",closeRequest));
    $$("[data-close-proposal]").forEach(b=>b.addEventListener("click",closeProposal));
    $("requestModal")?.addEventListener("click",e=>{if(e.target===$("requestModal"))closeRequest();});
    $("proposalModal")?.addEventListener("click",e=>{if(e.target===$("proposalModal"))closeProposal();});
  }

  async function loadAll(){
    const [policyResult,summaryResult,systemsResult,queueResult]=await Promise.all([
      state.supabase.rpc("cc_ai_core_current_policy"),
      state.supabase.from("cc_v_ai_core_summary").select("*").maybeSingle(),
      state.supabase.from("cc_v_dpro_system_registry").select("system_code,product_number,product_name,category,registry_status").order("product_number",{ascending:true,nullsFirst:false}),
      state.supabase.from("cc_v_ai_core_queue").select("*").order("request_created_at",{ascending:false}).limit(100)
    ]);
    for(const result of [policyResult,summaryResult,systemsResult,queueResult]) if(result.error) throw result.error;
    state.policy=policyResult.data||{};
    state.summary=summaryResult.data||{};
    state.systems=systemsResult.data||[];
    state.queue=queueResult.data||[];
    renderPolicy();
    renderMetrics();
    renderRisk();
    renderSystemOptions();
    renderQueue();
  }

  function renderPolicy(){
    const p=state.policy?.policy||{};
    $("policyBanner").innerHTML=`
      <div class="policy-main">
        <strong>${esc(state.policy?.policy_name||"DPRO AI CORE Safety Boundary")}</strong>
        <span>${esc(state.policy?.policy_version||"—")} / Context-bound approval / Safe-by-default</span>
      </div>
      <div class="policy-tags">
        <span class="policy-tag">AUTO ≤ ${esc(p.max_auto_risk||"R1_DRAFT")}</span>
        <span class="policy-tag">承認TTL ${Number(p.approval_ttl_minutes||0)}分</span>
        <span class="policy-tag block">個人情報 ${p.raw_personal_data_allowed?"許可":"禁止"}</span>
        <span class="policy-tag block">Secret ${p.secrets_allowed?"許可":"禁止"}</span>
        <span class="policy-tag block">FINAL LOCK自動解除 ${p.system_final_lock_auto_reopen?"ON":"OFF"}</span>
      </div>`;
  }

  function renderMetrics(){
    const s=state.summary||{};
    const defs=[
      ["active_requests","ACTIVE REQUEST","処理中のAI依頼",""],
      ["awaiting_approval","承認待ち","AAL2人承認が必要","progress"],
      ["manual_only","MANUAL ONLY","R4保護境界","reopen"],
      ["blocked","BLOCKED","禁止Action","reopen"],
      ["approved","APPROVED","承認済み","current"],
      ["successful_executions","EXECUTED","成功実行記録",""]
    ];
    $("metricGrid").innerHTML=defs.map(([k,l,n,t])=>`<article class="metric-card ${t}"><b>${Number(s[k]||0)}</b><span>${esc(l)}</span><small>${esc(n)}</small></article>`).join("");
  }

  function renderRisk(){
    const rows=[
      ["R0","READ ONLY","読む・分析・要約のみ","承認不要 / 外部副作用なし","r0"],
      ["R1","DRAFT","ZIP・下書き・Patch準備","承認不要 / 内部Draftだけ","r1"],
      ["R2","REVERSIBLE","Evidence・管理メタデータ更新","AAL2人承認必須","r2"],
      ["R3","PRODUCTION","GitHub Commit・Deploy・外部送信","AAL2人承認＋Context一致","r3"],
      ["R4","PROTECTED","削除・FINAL LOCK・権限変更","承認後もAI自動実行不可","r4"]
    ];
    $("riskGrid").innerHTML=rows.map(([r,t,d,g,c])=>`<article class="risk-card ${c}"><b>${r}</b><strong>${esc(t)}</strong><span>${esc(d)}<br>${esc(g)}</span></article>`).join("");
  }

  function renderSystemOptions(){
    const current=$("requestSystem")?.value||"";
    $("requestSystem").innerHTML='<option value="">DPRO全体</option>'+state.systems.map(s=>`<option value="${esc(s.system_code)}">${s.product_number?`#${String(s.product_number).padStart(2,"0")}｜`:""}${esc(s.product_name||s.system_code)}（${esc(s.system_code)}）</option>`).join("");
    if(state.systems.some(s=>s.system_code===current)) $("requestSystem").value=current;
  }

  function filteredQueue(){
    const q=$("searchInput").value.trim().toLowerCase();
    const status=$("queueStatusFilter").value;
    return state.queue.filter(row=>{
      const effective=row.proposal_status||row.request_status||"";
      if(status!=="all" && effective!==status && row.request_status!==status) return false;
      if(!q)return true;
      return `${row.system_code||""} ${row.purpose||""} ${row.proposal_title||""} ${row.proposal_summary||""}`.toLowerCase().includes(q);
    });
  }

  function renderQueue(){
    const rows=filteredQueue();
    $("queueCount").textContent=`${rows.length}件`;
    $("queueList").innerHTML=rows.length?rows.map(row=>{
      const effective=row.proposal_status||row.request_status||"OPEN";
      const risk=row.risk_class||"—";
      const canDecide=canWrite() && row.proposal_id && row.proposal_status==="AWAITING_APPROVAL";
      return `<article class="queue-row">
        <div class="queue-main"><strong>${esc(row.system_code||"DPRO全体")} / ${esc(row.request_type)}</strong><span>${esc(row.purpose)}</span></div>
        <div class="queue-cell"><small>STATUS</small><b>${pill(effective,effective==="BLOCKED"||effective==="MANUAL_ONLY"?"reopen":effective==="APPROVED"?"current":effective==="AWAITING_APPROVAL"?"progress":"")}</b></div>
        <div class="queue-cell hide-mid"><small>RISK</small><b>${pill(risk,riskTone(risk))}</b></div>
        <div class="queue-cell"><small>PROPOSAL</small><b>${esc(row.proposal_title||"Provider接続待ち")}</b><small>${esc(row.proposal_summary||formatDate(row.request_created_at))}</small></div>
        <div class="queue-actions">
          <button class="mini-button" type="button" data-open-proposal="${esc(row.request_id)}">詳細</button>
          ${canDecide?`<button class="mini-button approve" type="button" data-approve="${esc(row.proposal_id)}">承認</button><button class="mini-button reject" type="button" data-reject="${esc(row.proposal_id)}">却下</button>`:""}
        </div>
      </article>`;
    }).join(""):'<div class="empty-ai">AI Requestはまだありません。右上の「＋ AI分析を準備」から安全なRequestを作成できます。</div>';

    $$("[data-open-proposal]").forEach(b=>b.addEventListener("click",()=>openProposalByRequest(b.dataset.openProposal)));
    $$("[data-approve]").forEach(b=>b.addEventListener("click",()=>decide(b.dataset.approve,"APPROVE")));
    $$("[data-reject]").forEach(b=>b.addEventListener("click",()=>decide(b.dataset.reject,"REJECT")));
  }

  function openRequest(systemCode=""){
    $("requestForm").reset();
    $("requestMessage").textContent="";
    $("requestSystem").value=state.systems.some(s=>s.system_code===systemCode)?systemCode:"";
    $("requestModal").classList.remove("hidden");
  }
  function closeRequest(){$("requestModal").classList.add("hidden");}

  async function submitRequest(event){
    event.preventDefault();
    if(!canWrite()) return toast("この権限ではAI Requestを作成できません。",true);
    const purpose=$("requestPurpose").value.trim();
    if(purpose.length<3)return;
    const btn=$("requestSubmit");const old=btn.textContent;btn.disabled=true;btn.textContent="安全境界を固定中…";
    try{
      const {data,error}=await state.supabase.rpc("cc_ai_core_open_request",{
        p_system_code:$("requestSystem").value||null,
        p_request_type:$("requestType").value,
        p_purpose:purpose,
        p_data_classification:$("requestClassification").value
      });
      if(error) throw error;
      closeRequest();
      await loadAll();
      toast(`AI Requestを作成しました。${data?.system_code||"DPRO全体"} / ${data?.status||"OPEN"}`);
    }catch(error){
      console.error(BUILD,error);
      $("requestMessage").textContent=error?.message||"AI Requestを作成できませんでした。";
      $("requestMessage").className="form-message full error";
    }finally{btn.disabled=false;btn.textContent=old;}
  }

  function openProposalByRequest(requestId){
    const row=state.queue.find(x=>x.request_id===requestId);
    if(!row)return;
    state.selectedProposal=row;
    const action=`${row.proposal_title||"AI Provider接続待ち"}`;
    $("proposalContent").innerHTML=`
      <div class="detail-head"><p class="eyebrow">AI CORE DETAIL</p><h2 id="proposalTitle">${esc(row.system_code||"DPRO全体")}</h2><p>${esc(row.purpose)}</p></div>
      <div class="proposal-meta">${pill(row.request_status)} ${pill(row.risk_class||"NO PROPOSAL",riskTone(row.risk_class))} ${row.proposal_status?pill(row.proposal_status):""}</div>
      <div class="detail-section"><h3>AI提案</h3><div class="next-action"><strong>${esc(action)}</strong><span>${esc(row.proposal_summary||"AI-02でProviderを接続すると、ここにEvidenceベースの提案が入ります。")}</span></div></div>
      <div class="detail-section"><h3>安全情報</h3><div class="gap-list">
        <div class="gap-item"><div><strong>Context Fingerprint</strong><small>${esc(row.context_fingerprint)}</small></div><span class="pill current">BOUND</span></div>
        <div class="gap-item"><div><strong>人承認</strong><small>R2/R3はAAL2必須。R4は承認後も自動実行不可。</small></div><span class="pill ${row.requires_human_approval?"progress":"current"}">${row.requires_human_approval?"REQUIRED":"NOT REQUIRED"}</span></div>
      </div></div>`;
    $("proposalModal").classList.remove("hidden");
  }
  function closeProposal(){$("proposalModal").classList.add("hidden");state.selectedProposal=null;}

  async function decide(proposalId,decision){
    if(!canWrite())return toast("承認権限がありません。",true);
    const label=decision==="APPROVE"?"承認":"却下";
    if(!confirm(`このAI提案を${label}しますか？\nContextが変わっている場合はDB側で拒否されます。`))return;
    try{
      const {data,error}=await state.supabase.rpc("cc_ai_core_decide_proposal",{p_proposal_id:proposalId,p_decision:decision,p_note:`CONTROL CENTER AI-01 ${label}`});
      if(error)throw error;
      await loadAll();
      toast(`AI提案を${label}しました。${data?.proposal_status||""}`);
    }catch(error){console.error(BUILD,error);toast(error?.message||`${label}できませんでした。`,true);}
  }

  function applyDeepLink(){
    const system=(new URLSearchParams(location.search).get("system")||"").trim().toUpperCase();
    if(system && state.systems.some(s=>s.system_code===system)) setTimeout(()=>openRequest(system),100);
  }

  window.addEventListener("DOMContentLoaded",boot,{once:true});
})();
