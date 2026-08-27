(() => {
  "use strict";
  const CONFIG = window.DPRO_CONTROL_CENTER_CONFIG || {};
  const $ = (id) => document.getElementById(id);
  const state = { supabase:null, session:null, staff:null, services:[], previewSignature:"" };

  const esc = (value) => String(value ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
  const show = (id, yes=true) => $(id)?.classList.toggle("hidden", !yes);
  const message = (text="", error=false) => {
    const el=$("formMessage"); el.textContent=text; el.classList.toggle("error",error); el.classList.toggle("success",Boolean(text)&&!error);
  };
  const todayLocal = () => {
    const d=new Date(), y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,"0"), day=String(d.getDate()).padStart(2,"0");
    return `${y}-${m}-${day}`;
  };
  const safeText = (v) => String(v || "").trim();
  const forbidden = (v) => /(?:sb_secret_|service_role|channel_secret|access[_-]?token|admin[_-]?code|password)/i.test(String(v||""));

  async function fetchPublicConfig(){
    const base=String(CONFIG.apiBaseUrl||"").replace(/\/$/,"");
    const res=await fetch(`${base}/api/public-config`,{cache:"no-store"});
    const data=await res.json().catch(()=>({}));
    if(!res.ok) throw new Error(data.message||data.error||`HTTP ${res.status}`);
    return data;
  }

  async function initialize(){
    $("startsOn").value=todayLocal();
    const pub=await fetchPublicConfig();
    if(!window.supabase?.createClient) throw new Error("Supabaseライブラリを読み込めませんでした。");
    state.supabase=window.supabase.createClient(pub.supabaseUrl,pub.supabasePublishableKey||pub.supabaseAnonKey,{
      auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storageKey:pub.sessionStorageKey||"dpro-control-center-auth-v1"}
    });
    const {data:sess,error:sessError}=await state.supabase.auth.getSession();
    if(sessError) throw sessError;
    state.session=sess.session;
    if(!state.session?.user){ show("loadingPanel",false); show("authNotice",true); return; }

    const {data:aal,error:aalError}=await state.supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if(aalError) throw aalError;
    if(aal?.currentLevel!=="aal2"){ show("loadingPanel",false); show("authNotice",true); $("authNotice").querySelector("p").textContent="二段階認証が未完了です。CONTROL CENTERへ戻って認証コードを入力してください。"; return; }

    const {data:staff,error:staffError}=await state.supabase.from("cc_staff").select("id,display_name,role_key,status").eq("auth_user_id",state.session.user.id).maybeSingle();
    if(staffError) throw staffError;
    if(!staff || staff.status!=="active" || !["owner_admin","technical_admin","support"].includes(staff.role_key)){
      show("loadingPanel",false); show("authNotice",true); $("authNotice").querySelector("p").textContent="この操作に必要なDPROスタッフ権限がありません。"; return;
    }
    state.staff=staff; $("staffName").textContent=staff.display_name||"DPROスタッフ";

    const {data:services,error:servicesError}=await state.supabase.from("cc_service_catalog").select("service_code,category,service_name,description,sort_order").eq("is_active",true).order("sort_order").order("service_code");
    if(servicesError) throw servicesError;
    state.services=services||[];
    renderServices();
    show("loadingPanel",false); show("appPanel",true);
  }

  function renderServices(){
    $("serviceGrid").innerHTML=state.services.map(s=>`<label class="service-option"><input type="checkbox" name="service" value="${esc(s.service_code)}" ${s.service_code==="DPRO_SYSTEM"?"checked":""}><span><strong>${esc(s.service_name)}</strong><small>${esc(s.service_code)} / ${esc(s.category)}</small></span></label>`).join("");
    document.querySelectorAll('input[name="service"]').forEach(x=>x.addEventListener("change",invalidatePreview));
  }

  function values(){
    const serviceCodes=[...document.querySelectorAll('input[name="service"]:checked')].map(x=>x.value);
    return {
      p_display_name:safeText($("displayName").value),
      p_site_name:safeText($("siteName").value)||null,
      p_service_codes:serviceCodes,
      p_legal_name:safeText($("legalName").value)||null,
      p_trade_name:safeText($("tradeName").value)||null,
      p_main_email:safeText($("mainEmail").value)||null,
      p_main_phone:safeText($("mainPhone").value)||null,
      p_contract_name:safeText($("contractName").value)||null,
      p_starts_on:$("startsOn").value,
    };
  }

  function signature(v){ return JSON.stringify(v); }
  function invalidatePreview(){
    state.previewSignature="";
    $("createButton").disabled=true;
    show("previewPanel",false);
    message("");
  }

  function validate(v){
    if(!v.p_display_name) return "顧客表示名を入力してください。";
    if(!v.p_starts_on) return "開始日を入力してください。";
    if(!v.p_service_codes.length) return "サービスを1つ以上選択してください。";
    for(const value of Object.values(v)){
      if(typeof value==="string" && forbidden(value)) return "Secret・管理コード・トークン・パスワードに見える値は登録できません。";
    }
    return "";
  }

  async function callProvision(v,dryRun){
    const {data,error}=await state.supabase.rpc("cc_provision_zero_yen_client",{...v,p_dry_run:dryRun});
    if(error) throw error;
    return data;
  }

  function friendlyError(error){
    const t=String(error?.message||error||"");
    if(t.includes("possible_duplicate_client")) return "同名・同一メール・同一電話番号の既存顧客候補があります。新規作成せず、全顧客画面を確認してください。";
    if(t.includes("invalid_or_inactive_service")) return "選択したサービスの一部が現在利用できません。最新情報に更新してください。";
    if(t.includes("permission_denied")) return "二段階認証または操作権限を確認してください。";
    return t || "処理できませんでした。";
  }

  function renderResult(target,data){
    const codes=Array.isArray(data.serviceCodes)?data.serviceCodes.join("、"):"—";
    target.innerHTML=[
      ["顧客",data.displayName],
      ["店舗",data.siteName||"自動設定"],
      ["契約",data.contractName],
      ["開始日",data.startsOn],
      ["サービス",codes],
      ["料金","初期 0円 / 月額 0円"],
      ...(data.clientCode?[["顧客コード",data.clientCode],["店舗コード",data.siteCode],["契約コード",data.contractCode]]:[])
    ].map(([k,v])=>`<div class="preview-item"><small>${esc(k)}</small><strong>${esc(v)}</strong></div>`).join("");
  }

  async function preview(){
    const v=values(), err=validate(v); if(err) return message(err,true);
    const b=$("previewButton"); b.disabled=true; b.textContent="確認中…"; message("");
    try{
      const data=await callProvision(v,true);
      renderResult($("previewContent"),data);
      state.previewSignature=signature(v);
      show("previewPanel",true);
      $("createButton").disabled=false;
      message("事前確認PASS。内容を確認して登録してください。");
    }catch(e){ invalidatePreview(); message(friendlyError(e),true); }
    finally{ b.disabled=false; b.textContent="事前確認"; }
  }

  async function create(event){
    event.preventDefault();
    const v=values(), err=validate(v); if(err) return message(err,true);
    if(state.previewSignature!==signature(v)) return message("入力内容が変わっています。もう一度「事前確認」を実行してください。",true);
    if(!confirm(`${v.p_display_name} を「初期0円・月額0円」で登録します。よろしいですか？`)) return;
    const b=$("createButton"); b.disabled=true; b.textContent="登録中…"; message("");
    try{
      const data=await callProvision(v,false);
      renderResult($("successContent"),data);
      show("successPanel",true);
      $("provisionForm").classList.add("hidden");
      show("previewPanel",false);
      window.scrollTo({top:document.body.scrollHeight,behavior:"smooth"});
    }catch(e){ message(friendlyError(e),true); b.disabled=false; }
    finally{ b.textContent="0円契約で登録"; }
  }

  function reset(){
    $("provisionForm").reset(); $("startsOn").value=todayLocal();
    renderServices(); state.previewSignature=""; $("createButton").disabled=true;
    $("provisionForm").classList.remove("hidden"); show("successPanel",false); show("previewPanel",false); message("");
    window.scrollTo({top:0,behavior:"smooth"});
  }

  ["displayName","siteName","legalName","tradeName","mainEmail","mainPhone","contractName","startsOn"].forEach(id=>$(id)?.addEventListener("input",invalidatePreview));
  $("previewButton")?.addEventListener("click",preview);
  $("provisionForm")?.addEventListener("submit",create);
  $("resetButton")?.addEventListener("click",reset);

  window.addEventListener("load",()=>initialize().catch(e=>{
    $("loadingText").textContent=`接続確認に失敗しました：${friendlyError(e)}`;
  }));
})();