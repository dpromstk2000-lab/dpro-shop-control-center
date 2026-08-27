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
      state.supabase.from("cc_v_deployment_adapter_readiness_r2").select("*").order("automation_sort").order("product_number",{ascending:true,nullsFirst:false}),
      state.supabase.from("cc_v_deployment_job_overview").select("*").order("created_at",{ascending:false}).limit(50)
    ]);
    for(const r of [p,a,j])if(r.error)throw r.error;
    state.projects=(p.data||[]).filter(x=>x.effective_system_code||x.product_system_code||x.system_code);
    state.adapters=a.data||[]; state.jobs=j.data||[];
    const products=state.adapters.filter(x=>x.product_code);
    const ready=products.filter(x=>x.automation_class==="one_cmd_ready").length;
    const buildable=products.filter(x=>x.automation_class==="package_buildable").length;
    $("adapterCount").textContent=`READY ${ready}/51 / 構築可 ${buildable}`;
    renderReadiness();
    filterProjects(); renderJobs();
  }

  const classLabels={
    one_cmd_ready:"ONE-CMD READY",
    package_buildable:"PACKAGE BUILDABLE",
    manual_assisted:"手動支援",
    evidence_required:"証拠不足"
  };
  const classCss={
    one_cmd_ready:"class-ready",
    package_buildable:"class-buildable",
    manual_assisted:"class-manual",
    evidence_required:"class-evidence"
  };
  function renderReadiness(){
    const products=state.adapters.filter(x=>x.product_code);
    const count=k=>products.filter(x=>x.automation_class===k).length;
    const cards=[
      ["ONE-CMD READY",count("one_cmd_ready"),"実行経路まで証明済み"],
      ["PACKAGE BUILDABLE",count("package_buildable"),"安全パッケージ構築可能"],
      ["手動支援",count("manual_assisted"),"追加の対象・設定確認が必要"],
      ["証拠不足",count("evidence_required"),"Deploy Jobを禁止"]
    ];
    $("automationSummary").innerHTML=cards.map(([label,value,note])=>`<article class="automation-card"><small>${esc(label)}</small><strong>${esc(value)}</strong><span>${esc(note)}</span></article>`).join("");
    const contact=state.adapters.find(x=>x.system_code==="CONTACT");
    const rows=products.map(a=>`<tr>
      <td>${esc(a.product_number??"—")}</td>
      <td><strong>${esc(a.product_name)}</strong><br><small>${esc(a.system_code)}</small></td>
      <td class="${esc(classCss[a.automation_class]||"")}">${esc(classLabels[a.automation_class]||a.automation_class)}</td>
      <td>${a.supports_deploy?"Job作成可":"停止"}</td>
      <td>${esc(a.execution_mode)}</td>
      <td>${esc(a.default_worker_name||"—")}</td>
      <td>${esc(a.source_repository||"—")}</td>
      <td>${esc(a.assessment_detail||"—")}</td>
    </tr>`).join("");
    const contactNote=contact?`<p class="readiness-note">別系統の既存実装：CONTACT は <strong>${esc(classLabels[contact.automation_class]||contact.automation_class)}</strong>（${esc(contact.adapter_key)}）。既存R6-PROD本体は変更していません。</p>`:"";
    $("adapterReadinessTable").innerHTML=contactNote+`<table><thead><tr><th>#</th><th>製品</th><th>判定</th><th>Deploy Job</th><th>方式</th><th>Worker</th><th>Repository</th><th>判定根拠</th></tr></thead><tbody>${rows}</tbody></table>`;
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
      ["Adapter",a?.adapter_key||"未登録"],["自動化判定",classLabels[a?.automation_class]||a?.automation_class||"未判定"],
      ["Deploy Job",a?.supports_deploy?"作成可":"停止"],["方式",a?.execution_mode||"—"],["Repository",a?.source_repository||"—"],
      ["判定根拠",a?.assessment_detail||"—"]
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
        msg(data?.ok?"DRY RUN PASS。Deploy Jobを作成できます。":(data?.reason==="deploy_not_supported_by_assessment"?"この製品は現在の証拠判定ではDeploy Job作成を停止しています。":"Preflightで要確認項目があります。"),!data?.ok);
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
    const rows=[["結果",d.ok?"PASS":"要確認"],["system_code",d.systemCode],["Adapter",d.adapterKey],["自動化判定",classLabels[d.automationClass]||d.automationClass||"未判定"],["Adapter状態",d.adapterStatus],["実行方式",d.executionMode],["Repository",d.repository],["Worker",d.workerName||"未確定"],["次工程",d.next],["停止理由",d.reason||"なし"],["判定根拠",d.assessmentDetail||"—"]];
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