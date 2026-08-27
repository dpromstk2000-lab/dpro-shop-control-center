(() => {
  "use strict";
  const CONFIG=window.DPRO_CONTROL_CENTER_CONFIG||{};
  const $=id=>document.getElementById(id);
  const state={supabase:null,session:null,staff:null,projects:[],filtered:[],adapters:[],jobs:[],preview:null};

  const esc=v=>String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
  const show=(id,yes=true)=>$(id)?.classList.toggle("hidden",!yes);
  const msg=(text="",error=false)=>{const e=$("message");e.textContent=text;e.classList.toggle("error",error);e.classList.toggle("success",!!text&&!error);};
  const dateTime=v=>v?new Intl.DateTimeFormat("ja-JP",{year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"}).format(new Date(v)):"—";

  async function publicConfig(){
    const base=String(CONFIG.apiBaseUrl||"").replace(/\/$/,"");
    const r=await fetch(`${base}/api/public-config`,{cache:"no-store"});
    const d=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(d.message||d.error||`HTTP ${r.status}`);
    return d;
  }

  async function init(){
    const pub=await publicConfig();
    if(!window.supabase?.createClient)throw new Error("Supabaseライブラリを読み込めませんでした。");
    state.supabase=window.supabase.createClient(pub.supabaseUrl,pub.supabasePublishableKey||pub.supabaseAnonKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storageKey:pub.sessionStorageKey||"dpro-control-center-auth-v1"}});
    const {data:sess,error:se}=await state.supabase.auth.getSession(); if(se)throw se;
    state.session=sess.session;
    if(!state.session?.user)return auth("CONTROL CENTERへログインしてください。");
    const {data:aal,error:ae}=await state.supabase.auth.mfa.getAuthenticatorAssuranceLevel(); if(ae)throw ae;
    if(aal?.currentLevel!=="aal2")return auth("二段階認証が必要です。CONTROL CENTERへ戻って認証を完了してください。");
    const {data:staff,error:ste}=await state.supabase.from("cc_staff").select("id,display_name,role_key,status").eq("auth_user_id",state.session.user.id).maybeSingle(); if(ste)throw ste;
    if(!staff||staff.status!=="active")return auth("有効なDPROスタッフ権限がありません。");
    state.staff=staff; $("staffName").textContent=staff.display_name||"DPROスタッフ";
    await load();
    show("loadingPanel",false); show("appPanel",true);
  }

  function auth(text){show("loadingPanel",false);show("authPanel",true);$("authText").textContent=text;}

  async function load(){
    const [p,a,j]=await Promise.all([
      state.supabase.from("cc_v_delivery_project_overview_v2").select("*").order("updated_at",{ascending:false}),
      state.supabase.from("cc_deployment_adapters").select("system_code,product_code,product_name,adapter_key,execution_mode,readiness_status,source_repository,default_worker_name").order("product_name"),
      state.supabase.from("cc_v_deployment_job_overview").select("*").order("created_at",{ascending:false}).limit(50)
    ]);
    for(const r of [p,a,j])if(r.error)throw r.error;
    state.projects=(p.data||[]).filter(x=>x.effective_system_code||x.product_system_code||x.system_code);
    state.adapters=a.data||[]; state.jobs=j.data||[];
    $("adapterCount").textContent=`${state.adapters.filter(x=>x.product_code).length}/51 + CONTACT`;
    filterProjects(); renderJobs();
  }

  function systemCode(p){return String(p?.effective_system_code||p?.product_system_code||p?.system_code||"").toUpperCase();}
  function filterProjects(){
    const q=String($("projectSearch").value||"").trim().toLowerCase();
    state.filtered=state.projects.filter(p=>!q||[p.project_code,p.project_name,p.client_name,systemCode(p)].some(v=>String(v||"").toLowerCase().includes(q)));
    const old=$("projectSelect").value;
    $("projectSelect").innerHTML=state.filtered.map(p=>`<option value="${esc(p.id)}">${esc(p.client_name)}｜${esc(systemCode(p))}｜${esc(p.project_code)}</option>`).join("");
    if(state.filtered.some(p=>p.id===old))$("projectSelect").value=old;
    state.preview=null;$("queueButton").disabled=true;renderProject();$("preflightResult").innerHTML="";msg("");
  }

  function selected(){return state.filtered.find(p=>p.id===$("projectSelect").value)||null;}
  function item(k,v){return `<div class="detail-item"><small>${esc(k)}</small><strong>${esc(v??"—")}</strong></div>`;}
  function renderProject(){
    const p=selected(); if(!p){$("projectDetail").innerHTML="<p>対象案件がありません。</p>";return;}
    const a=state.adapters.find(x=>x.system_code===systemCode(p));
    $("projectDetail").innerHTML=[
      ["顧客",p.client_name],["案件",p.project_name],["案件コード",p.project_code],
      ["system_code",systemCode(p)],["案件状態",p.status],["STANDARD",p.standard_version||"—"],
      ["Adapter",a?.adapter_key||"未登録"],["方式",a?.execution_mode||"—"],["Repository",a?.source_repository||"—"]
    ].map(x=>item(...x)).join("");
  }

  async function prepare(dryRun){
    const p=selected(); if(!p)return msg("対象案件を選択してください。",true);
    if(!["owner_admin","technical_admin"].includes(state.staff.role_key))return msg("Deploy Job作成には管理責任者または技術管理者権限が必要です。",true);
    const button=dryRun?$("preflightButton"):$("queueButton"), old=button.textContent;
    button.disabled=true;button.textContent=dryRun?"確認中…":"作成中…";msg("");
    try{
      const {data,error}=await state.supabase.rpc("cc_prepare_deployment_job",{p_project_id:p.id,p_system_code:null,p_action:"deploy",p_dry_run:dryRun});
      if(error)throw error;
      renderResult(data);
      if(dryRun){
        state.preview=data;
        $("queueButton").disabled=!data?.ok;
        msg(data?.ok?"DRY RUN PASS。Deploy Jobを作成できます。":"Preflightで要確認項目があります。",!data?.ok);
      }else{
        state.preview=null;$("queueButton").disabled=true;
        msg(`Deploy Job ${data.jobCode} を作成しました。本番Deployはまだ実行されていません。`);
        await load();
      }
    }catch(e){msg(e.message||"処理に失敗しました。",true);}
    finally{button.textContent=old;if(dryRun)button.disabled=false;}
  }

  function renderResult(d){
    if(!d){$("preflightResult").innerHTML="";return;}
    const rows=[["結果",d.ok?"PASS":"要確認"],["system_code",d.systemCode],["Adapter",d.adapterKey],["Adapter状態",d.adapterStatus],["実行方式",d.executionMode],["Repository",d.repository],["Worker",d.workerName||"未確定"],["次工程",d.next],["理由",d.reason||"なし"]];
    $("preflightResult").innerHTML=rows.map(([k,v])=>`<div class="result-item"><small>${esc(k)}</small><strong>${esc(v??"—")}</strong></div>`).join("");
  }

  function renderJobs(){
    const rows=state.jobs.map(j=>`<tr><td>${esc(j.job_code)}</td><td>${dateTime(j.created_at)}</td><td>${esc(j.client_name)}<br><small>${esc(j.project_code)}</small></td><td>${esc(j.system_code)}</td><td>${esc(j.action)}</td><td>${esc(j.status)}</td><td>${esc(j.execution_mode)}</td></tr>`).join("");
    $("jobsTable").innerHTML=`<table><thead><tr><th>Job</th><th>作成</th><th>顧客・案件</th><th>System</th><th>Action</th><th>Status</th><th>Mode</th></tr></thead><tbody>${rows||'<tr><td colspan="7">Deploy Jobはまだありません。</td></tr>'}</tbody></table>`;
  }

  $("projectSearch")?.addEventListener("input",filterProjects);
  $("projectSelect")?.addEventListener("change",()=>{state.preview=null;$("queueButton").disabled=true;renderProject();$("preflightResult").innerHTML="";msg("");});
  $("preflightButton")?.addEventListener("click",()=>prepare(true));
  $("queueButton")?.addEventListener("click",()=>prepare(false));
  $("reloadButton")?.addEventListener("click",()=>load().catch(e=>msg(e.message,true)));
  window.addEventListener("load",()=>init().catch(e=>{$("loadingText").textContent=`接続に失敗しました：${e.message||e}`;}));
})();