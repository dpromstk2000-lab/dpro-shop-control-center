(() => {
  "use strict";
  const CONFIG = window.DPRO_CONTROL_CENTER_CONFIG || {};
  const $ = (id) => document.getElementById(id);
  const state = { supabase:null, staff:null, services:[], preset:null };
  const yen = (n) => `${Number(n || 0).toLocaleString("ja-JP")}円`;
  const esc = (v) => String(v ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
  const roleLabels = { owner_admin:"管理責任者", technical_admin:"技術管理者", support:"DPROサポート", read_only:"閲覧専用" };

  const GREEN_KASUYA = {
    displayName:"グリーン・ポケット福岡粕屋店",
    siteName:"グリーン・ポケット福岡粕屋店",
    tradeName:"グリーン・ポケット福岡粕屋店",
    legalName:"",
    managerName:"西津 佳宏",
    mainPhone:"092-719-0336",
    postalCode:"811-2307",
    address:"福岡県糟屋郡粕屋町原町4-3-5 八昭ビル1階",
    mainEmail:"",
    contractName:"ホームページ・LINE公式・DPRO GREEN 統合導入プラン",
    quoteNumber:"DPRO-GP-20260910-001",
    contractStatus:"pending",
    ownerConfirmed:true,
    productSystemCode:"GREEN",
    productName:"グリーンレンタル",
    projectName:"グリーン・ポケット福岡粕屋店 グリーンレンタル 本番導入",
    standardVersion:"V1.2",
    services:{
      LINE_OFFICIAL_SETUP:{on:true,setup:77000,monthly:0},
      LINE_OFFICIAL_OPERATION:{on:true,setup:0,monthly:3300},
      DPRO_SYSTEM:{on:true,setup:33000,monthly:1100},
      WEBSITE:{on:true,setup:275000,monthly:0,config:{custom_domain_required:true}},
      WEBSITE_MAINTENANCE:{on:true,setup:0,monthly:1100,config:{custom_domain_required:true}},
      DPRO_WEB_SYNC:{on:true,setup:0,monthly:0,config:{custom_domain_required:true}}
    }
  };

  function showOnly(id){["loadingScreen","authScreen","app"].forEach(x=>$(x)?.classList.toggle("hidden",x!==id));}
  function toast(message,error=false){const el=$("toast");el.textContent=message;el.classList.toggle("error",error);el.classList.remove("hidden");clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.add("hidden"),4200);}
  async function fetchPublicConfig(){
    const base=String(CONFIG.apiBaseUrl||"").replace(/\/$/,"");
    const res=await fetch(`${base}/api/public-config`,{cache:"no-store"});
    const data=await res.json().catch(()=>({}));
    if(!res.ok) throw new Error(data.message||data.error||`HTTP ${res.status}`);
    return data;
  }

  async function boot(){
    try{
      const pub=await fetchPublicConfig();
      if(!window.supabase?.createClient) throw new Error("Supabaseライブラリを読み込めませんでした。");
      state.supabase=window.supabase.createClient(pub.supabaseUrl,pub.supabasePublishableKey||pub.supabaseAnonKey,{
        auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storageKey:pub.sessionStorageKey||"dpro-control-center-auth-v1"}
      });
      const {data:sess}=await state.supabase.auth.getSession();
      if(!sess?.session?.user){showOnly("authScreen");return;}
      const {data:aal}=await state.supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if(aal?.currentLevel!=="aal2"){showOnly("authScreen");return;}
      const {data:staff,error:staffError}=await state.supabase.from("cc_staff").select("id,display_name,role_key,status").eq("auth_user_id",sess.session.user.id).maybeSingle();
      if(staffError) throw staffError;
      if(!staff||staff.status!=="active"||staff.role_key!=="owner_admin"){showOnly("authScreen");return;}
      state.staff=staff;
      $("staffName").textContent=staff.display_name||"DPRO管理者";
      $("staffRole").textContent=roleLabels[staff.role_key]||staff.role_key;
      $("staffInitial").textContent=(staff.display_name||"D").trim().charAt(0)||"D";
      const {data:services,error}=await state.supabase.from("cc_service_catalog").select("service_code,service_name,category,is_active,sort_order").eq("is_active",true).order("sort_order");
      if(error) throw error;
      state.services=services||[];
      const preset=new URLSearchParams(location.search).get("preset");
      state.preset=preset==="green-kasuya"?GREEN_KASUYA:null;
      applyPreset();
      renderServices();
      bind();
      showOnly("app");
    }catch(error){
      console.error(error);
      showOnly("authScreen");
      toast(error.message||"実契約登録を開けませんでした。",true);
    }
  }

  function applyPreset(){
    if(!state.preset) return;
    for(const key of ["displayName","siteName","tradeName","legalName","managerName","mainPhone","postalCode","address","mainEmail","contractName","quoteNumber","contractStatus"]){
      if($(key)) $(key).value=state.preset[key]||"";
    }
    $("ownerConfirmed").checked=Boolean(state.preset.ownerConfirmed);
    $("createProject").checked=true;
  }

  function renderServices(){
    const presetMap=state.preset?.services||{};
    const priority=["LINE_OFFICIAL_SETUP","LINE_OFFICIAL_OPERATION","DPRO_SYSTEM","WEBSITE","WEBSITE_MAINTENANCE","DPRO_WEB_SYNC"];
    let rows=state.services;
    if(state.preset){
      rows=[...state.services].sort((a,b)=>{
        const ai=priority.indexOf(a.service_code), bi=priority.indexOf(b.service_code);
        if(ai>=0&&bi>=0) return ai-bi;
        if(ai>=0) return -1;
        if(bi>=0) return 1;
        return (a.sort_order||999)-(b.sort_order||999);
      });
    }
    $("serviceTable").innerHTML=rows.map(s=>{
      const p=presetMap[s.service_code]||{};
      return `<article class="service-row" data-service="${esc(s.service_code)}">
        <div class="service-name"><input class="svc-on" type="checkbox" ${p.on?"checked":""}><div>${esc(s.service_name)}<small>${esc(s.service_code)} / ${esc(s.category)}</small></div></div>
        <label>初期費用（税込）<input class="svc-setup" type="number" min="0" step="1" value="${Number(p.setup||0)}"></label>
        <label>月額（税込）<input class="svc-monthly" type="number" min="0" step="1" value="${Number(p.monthly||0)}"></label>
      </article>`;
    }).join("");
    document.querySelectorAll(".svc-on,.svc-setup,.svc-monthly").forEach(el=>el.addEventListener("input",updateTotals));
    updateTotals();
  }

  function selectedServices(){
    const presetMap=state.preset?.services||{};
    return [...document.querySelectorAll("[data-service]")].filter(row=>row.querySelector(".svc-on").checked).map(row=>{
      const code=row.dataset.service;
      return {
        serviceCode:code,
        setupFeeYen:Number(row.querySelector(".svc-setup").value||0),
        monthlyFeeYen:Number(row.querySelector(".svc-monthly").value||0),
        config:presetMap[code]?.config||{}
      };
    });
  }

  function updateTotals(){
    const rows=selectedServices();
    $("setupTotal").textContent=yen(rows.reduce((s,x)=>s+x.setupFeeYen,0));
    $("monthlyTotal").textContent=yen(rows.reduce((s,x)=>s+x.monthlyFeeYen,0));
  }

  function bind(){
    $("contractForm").addEventListener("submit",submit);
    $("menuButton").addEventListener("click",()=>{$("sidebar").classList.toggle("open");$("sidebarBackdrop").classList.toggle("hidden",!$("sidebar").classList.contains("open"));});
    $("sidebarBackdrop").addEventListener("click",()=>{$("sidebar").classList.remove("open");$("sidebarBackdrop").classList.add("hidden");});
  }

  async function submit(event){
    event.preventDefault();
    const button=$("submitButton");
    const services=selectedServices();
    if(!services.length){toast("契約サービスを1つ以上選択してください。",true);return;}
    const status=$("contractStatus").value;
    const startsOn=$("startsOn").value||null;
    if(status==="active"&&!startsOn){toast("「契約開始済み」の場合は契約開始日が必要です。",true);return;}
    if(!confirm("実顧客・店舗・契約・サービスを管理センターへ登録します。よろしいですか？")) return;
    button.disabled=true; button.textContent="登録中…";
    $("result").classList.add("hidden");
    try{
      const payload={
        displayName:$("displayName").value.trim(),
        siteName:$("siteName").value.trim(),
        tradeName:$("tradeName").value.trim()||null,
        legalName:$("legalName").value.trim()||null,
        managerName:$("managerName").value.trim()||null,
        mainPhone:$("mainPhone").value.trim()||null,
        postalCode:$("postalCode").value.trim()||null,
        address:$("address").value.trim()||null,
        mainEmail:$("mainEmail").value.trim()||null,
        contractName:$("contractName").value.trim(),
        quoteNumber:$("quoteNumber").value.trim()||null,
        contractStatus:status,
        startsOn,
        taxMode:"included",
        ownerConfirmed:$("ownerConfirmed").checked,
        services
      };
      const {data,error}=await state.supabase.rpc("cc_provision_paid_client_v1",{p_payload:payload});
      if(error) throw error;
      let projectId=null;
      if($("createProject").checked&&state.preset?.productSystemCode){
        const {data:pid,error:projectError}=await state.supabase.rpc("cc_center4_create_delivery_project",{
          p_client_id:data.clientId,
          p_contract_id:data.contractId,
          p_system_instance_id:null,
          p_product_system_code:state.preset.productSystemCode,
          p_product_name:state.preset.productName,
          p_project_name:state.preset.projectName,
          p_target_delivery_date:null,
          p_project_code:null,
          p_standard_version_code:state.preset.standardVersion||"V1.2"
        });
        if(projectError) throw projectError;
        projectId=pid;
      }
      const next=projectId?`start.html?project=${encodeURIComponent(projectId)}`:"delivery.html";
      $("result").className="result-card";
      $("result").innerHTML=`<h3>実契約を登録しました</h3>
        <p><strong>${esc(data.displayName)}</strong><br>
        顧客コード：${esc(data.clientCode)}<br>
        契約コード：${esc(data.contractCode)}<br>
        初期：${yen(data.setupFeeYen)} / 月額：${yen(data.monthlyFeeYen)}<br>
        ${projectId?`制作案件：作成済み`:"制作案件：未作成"}</p>
        <div class="result-actions"><a class="btn primary" href="${next}">${projectId?"契約開始ナビを開く":"制作・納品を開く"}</a><a class="btn secondary" href="customer-workspace.html">お客様導入・運用</a></div>`;
      $("result").classList.remove("hidden");
      toast("実契約を登録しました。");
      button.textContent="登録済み";
    }catch(error){
      console.error(error);
      const map={
        possible_duplicate_client:"同名・同メール・同電話番号の顧客が既にあります。デモ顧客とは別に実顧客を作るため、既存データを確認してください。",
        permission_denied:"管理責任者＋二段階認証の権限が必要です。",
        starts_on_required_for_active_contract:"契約開始日を入力してください。"
      };
      const key=Object.keys(map).find(k=>String(error.message||"").includes(k));
      $("result").className="result-card error";
      $("result").innerHTML=`<h3>登録できませんでした</h3><p>${esc(key?map[key]:(error.message||"入力内容を確認してください。"))}</p>`;
      $("result").classList.remove("hidden");
      button.disabled=false; button.textContent="実契約を登録";
      toast(key?map[key]:(error.message||"登録できませんでした。"),true);
    }
  }

  boot();
})();