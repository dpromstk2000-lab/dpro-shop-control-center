(() => {
  "use strict";
  const BUILD="DPRO-MASTER-STANDARD-R5-20260920";
  const CONFIG=window.DPRO_CONTROL_CENTER_CONFIG||{};
  const $=(id)=>document.getElementById(id);
  const $$=(s,root=document)=>Array.from(root.querySelectorAll(s));
  const esc=(v)=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const roleLabels={owner_admin:"管理責任者",technical_admin:"技術管理者",support:"DPROサポート",read_only:"閲覧専用"};
  const state={supabase:null,session:null,staff:null,snapshot:null,registry:[],candidates:[],statusFilter:"all"};

  function showOnly(id){["loadingScreen","authScreen","errorScreen","app"].forEach(x=>$(x)?.classList.toggle("hidden",x!==id));}
  function toast(message,error=false){const el=$("toast");el.textContent=message;el.className=`toast${error?" error":""}`;el.classList.remove("hidden");clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.add("hidden"),4200);}
  function canWrite(){return ["owner_admin","technical_admin","support"].includes(state.staff?.role_key);}
  function downloadJson(name,value){const blob=new Blob([JSON.stringify(value,null,2)+"\n"],{type:"application/json"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1200);}

  async function boot(){
    try{
      const base=String(CONFIG.apiBaseUrl||"").replace(/\/$/,"");
      if(!base) throw new Error("CONTROL CENTER API設定がありません。");
      const res=await fetch(`${base}/api/public-config`,{cache:"no-store"});
      const pub=await res.json().catch(()=>({})); if(!res.ok) throw new Error(pub?.error||"公開設定を取得できませんでした。");
      state.supabase=window.supabase.createClient(pub.supabaseUrl,pub.supabasePublishableKey||pub.supabaseAnonKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storageKey:pub.sessionStorageKey||"dpro-control-center-auth-v1"}});
      const {data:{session},error}=await state.supabase.auth.getSession();if(error)throw error;state.session=session;if(!session){showOnly("authScreen");return;}
      const staffRes=await state.supabase.from("cc_staff").select("id,display_name,role_key,status").eq("auth_user_id",session.user.id).maybeSingle();if(staffRes.error)throw staffRes.error;
      if(!staffRes.data||staffRes.data.status!=="active"){showOnly("authScreen");return;}state.staff=staffRes.data;
      $("staffName").textContent=state.staff.display_name||"DPROスタッフ";$("staffRole").textContent=roleLabels[state.staff.role_key]||state.staff.role_key;$("staffInitial").textContent=(state.staff.display_name||"D").trim().slice(0,1).toUpperCase();
      bind();await loadAll();showOnly("app");
    }catch(e){console.error(BUILD,e);$("errorText").textContent=e?.message||"MASTER STANDARDを読み込めませんでした。";showOnly("errorScreen");}
  }

  function bind(){
    $("retryButton")?.addEventListener("click",()=>location.reload());
    $("menuButton")?.addEventListener("click",()=>$("sidebar").classList.toggle("open"));
    $("refreshButton")?.addEventListener("click",async()=>{await loadAll();toast("最新MASTERへ更新しました。");});
    $("downloadMasterButton")?.addEventListener("click",()=>{if(state.snapshot)downloadJson(`DPRO_MASTER_STANDARD_${new Date().toISOString().slice(0,10).replaceAll('-','')}.json`,state.snapshot);});
    $("standardSearch")?.addEventListener("input",renderStandards);$("layerFilter")?.addEventListener("change",renderStandards);
    $("importLearningButton")?.addEventListener("click",importLearning);
    $$("#candidateFilters button").forEach(b=>b.addEventListener("click",()=>{$$("#candidateFilters button").forEach(x=>x.classList.toggle("active",x===b));state.statusFilter=b.dataset.status;renderCandidates();}));
  }

  async function loadAll(){
    const [snapshotRes,registryRes,candidatesRes]=await Promise.all([
      state.supabase.rpc("cc_master_standard_snapshot"),
      state.supabase.from("cc_v_master_standard_registry").select("*").order("standard_code").order("sort_order"),
      state.supabase.rpc("cc_standard_learning_list")
    ]);
    if(snapshotRes.error)throw snapshotRes.error;if(registryRes.error)throw registryRes.error;if(candidatesRes.error)throw candidatesRes.error;
    state.snapshot=snapshotRes.data||{};state.registry=registryRes.data||[];state.candidates=Array.isArray(candidatesRes.data)?candidatesRes.data:[];render();
  }

  function render(){
    const snap=state.snapshot||{};const masterCount=state.registry.filter(x=>x.standard_code==="DPRO_MASTER_STANDARD").length;const masterVersion=(Array.isArray(snap.current_versions)?snap.current_versions.find(x=>x.standard_code==="DPRO_MASTER_STANDARD")?.version_code:"")||"—";const promoted=state.candidates.filter(x=>x.status==="promoted").length;const pending=state.candidates.filter(x=>["candidate","review","approved"].includes(x.status)).length;
    $("metrics").innerHTML=[
      [state.registry.length,"現行標準項目","legacy＋MASTER"],
      [masterCount,`MASTER ${masterVersion}`,"横断標準"],
      [promoted,"昇格済み学習","次のFACTORY ZIPへ収録"],
      [pending,"レビュー待ち","承認前はMASTERへ入らない"],
      [(snap.master_standard_sha256||"—").slice(0,12),"MASTER SHA",snap.master_standard_sha256||"未取得"]
    ].map(([v,l,n],i)=>`<article><b class="${i===4?"master-sha":""}">${esc(v)}</b><span>${esc(l)}</span><small class="${i===4?"master-sha":""}">${esc(n)}</small></article>`).join("");
    renderStandards();renderCandidates();
  }

  function renderStandards(){
    const q=($("standardSearch")?.value||"").trim().toLowerCase();const layer=$("layerFilter")?.value||"all";
    const rows=state.registry.filter(x=>{if(layer!=="all"&&x.layer!==layer)return false;if(!q)return true;return `${x.item_code} ${x.item_name} ${x.description} ${x.category} ${x.standard_code}`.toLowerCase().includes(q);});
    $("standardList").innerHTML=rows.length?rows.map(x=>{
      const prov=Array.isArray(x.provenance)?x.provenance:[];const p=prov[0];
      return `<article class="standard-row"><div><span class="standard-layer">${esc(x.layer)}</span></div><div><span class="standard-code">${esc(x.item_code)}</span><div class="standard-name">${esc(x.item_name)}</div></div><div class="standard-desc">${esc(x.description||"")}${p?`<div class="provenance">由来: ${esc(p.source_system_code||"—")} / ${esc(p.source_reference||p.source_kind||"—")}</div>`:""}</div><div class="standard-meta">${esc(x.standard_code)} ${esc(x.version_code)}<br>${esc(x.requirement_type)}${x.condition_feature_code?` / ${esc(x.condition_feature_code)}`:""}<br>${x.is_blocking_delivery?"納品Gate対象":"推奨/非blocking"}</div></article>`;
    }).join(""):'<div class="empty-master">条件に一致する標準はありません。</div>';
  }

  function renderCandidates(){
    const rows=state.candidates.filter(x=>state.statusFilter==="all"||x.status===state.statusFilter);
    $("candidateList").innerHTML=rows.length?rows.map(c=>{
      const items=Array.isArray(c.promoted_item_codes)?c.promoted_item_codes:[];const proposed=Array.isArray(c.proposed_items)?c.proposed_items:[];
      const actions=canWrite()&&c.status!=="promoted"?`<div class="candidate-actions">${c.status!=="approved"?`<button class="approve" data-action="approved" data-id="${esc(c.id)}">承認</button>`:`<button class="promote" data-promote="${esc(c.id)}" ${proposed.length?"":"disabled"}>MASTERへ昇格</button>`}<button class="reject" data-action="rejected" data-id="${esc(c.id)}">見送り</button></div>`:"";
      return `<article class="candidate-card"><div class="candidate-card-head"><div><span class="candidate-code">${esc(c.candidate_code)}</span><h3>${esc(c.title)}</h3></div><span class="candidate-status ${esc(c.status)}">${esc(c.status)}</span></div><p>${esc(c.summary||"")}</p><div class="candidate-grid"><div><strong>由来</strong><span>${esc(c.source_system_code||"—")} / ${esc(c.source_reference||c.source_kind||"—")}</span></div><div><strong>適用</strong><span>${esc(c.applicability_rule||"未記載")}</span></div><div><strong>標準項目</strong><span>${c.status==="promoted"?`${items.length}件 昇格済み`:`${proposed.length}件 提案`}</span></div></div>${c.rationale?`<p><strong>標準化理由:</strong> ${esc(c.rationale)}</p>`:""}${actions}</article>`;
    }).join(""):'<div class="empty-master">この状態の学習候補はありません。</div>';
    $$('[data-action]').forEach(b=>b.addEventListener("click",()=>setCandidateStatus(b.dataset.id,b.dataset.action,b)));
    $$('[data-promote]').forEach(b=>b.addEventListener("click",()=>promoteCandidate(b.dataset.promote,b)));
  }

  async function importLearning(){
    if(!canWrite())return toast("編集権限がありません。",true);const file=$("learningFile")?.files?.[0];if(!file)return toast("STANDARD_LEARNING_RETURN.jsonを選択してください。",true);
    try{const payload=JSON.parse(await file.text());const {data,error}=await state.supabase.rpc("cc_standard_learning_import",{p_payload:payload});if(error)throw error;await loadAll();toast(`${data?.imported??0}件の学習候補を取り込みました。`);}catch(e){toast(e?.message||"学習JSONを取り込めませんでした。",true);}
  }

  async function setCandidateStatus(id,status,button){
    const old=button.textContent;button.disabled=true;button.textContent="更新中…";try{const {error}=await state.supabase.rpc("cc_standard_learning_set_status",{p_candidate_id:id,p_status:status});if(error)throw error;await loadAll();toast(status==="approved"?"学習候補を承認しました。":"学習候補を見送りにしました。");}catch(e){toast(e?.message||"状態を更新できませんでした。",true);}finally{button.disabled=false;button.textContent=old;}
  }

  async function promoteCandidate(id,button){
    if(!confirm("承認済み候補をMASTER STANDARDへ昇格します。MASTER SHAが変わり、既存FACTORY開発ZIPはSTALEになります。続けますか？"))return;
    const old=button.textContent;button.disabled=true;button.textContent="昇格中…";try{const {data,error}=await state.supabase.rpc("cc_standard_learning_promote",{p_candidate_id:id});if(error)throw error;await loadAll();toast(`MASTERへ昇格しました。新SHA: ${(data?.master_standard_sha256||"").slice(0,12)}…`);}catch(e){toast(e?.message||"MASTERへ昇格できませんでした。",true);}finally{button.disabled=false;button.textContent=old;}
  }

  window.addEventListener("DOMContentLoaded",boot,{once:true});
})();
