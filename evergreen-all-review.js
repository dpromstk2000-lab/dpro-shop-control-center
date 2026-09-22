(() => {
  "use strict";

  const BUILD="DPRO-EVERGREEN-ALL-SYSTEM-REVIEW-EVG05-R1-20260922";
  const PACKAGE_VERSION="DPRO-EVERGREEN-ALL-SYSTEM-REVIEW-R1";
  const API_BASE="https://dpro-shop-control-center-api.dpromstk2000.workers.dev";
  const $=(id)=>document.getElementById(id);

  const state={
    supabase:null,session:null,staff:null,status:null,
    registry:[],summaries:[],auditItems:[],standardItems:[],
    featureImpl:[],featureDefaults:[],historicalReady:[],
    finalLock:null,aiProvider:null
  };

  const roleLabels={owner_admin:"管理責任者",technical_admin:"技術管理者",support:"DPROサポート",read_only:"閲覧専用"};

  const FILE_DEFS=[
    ["00_START_HERE.txt","ChatGPTが最初に読む全SYSTEM確認開始指示。"],
    ["PACKAGE_INFO.json","生成時点のSYSTEM数・MASTER・Snapshot Fingerprint。"],
    ["CURRENT_STANDARD_FACT.json","現在のDPRO MASTERと現行標準数。"],
    ["PLATFORM_FINAL_LOCK.json","PRODUCT EVERGREEN + AI COREの基盤FINAL LOCK。"],
    ["AI_CORE_STATE.json","現在のAI運用モード。API Secret等は含まない。"],
    ["DPRO_MASTER_CURRENT.json","現在のDPRO MASTER項目一式。"],
    ["SYSTEM_REGISTRY_ALL.json","現在登録されている全SYSTEM。"],
    ["EVERGREEN_SYSTEM_SUMMARIES.json","全SYSTEMの監査件数・Blocker・状態。"],
    ["EVERGREEN_AUDIT_ITEMS_ALL.json","全SYSTEMの最新監査項目とEvidence参照。"],
    ["SYSTEM_FEATURE_PROFILE_ALL.json","全SYSTEMのFeature実装/既定状態。"],
    ["HISTORICAL_READY_LATEST_ALL.json","製品ごとの最新PRODUCT READY履歴。"],
    ["ALL_SYSTEM_REVIEW_INDEX.json","ChatGPTが優先確認するための全SYSTEM索引。"],
    ["HANDOFF.txt","全SYSTEM確認の安全ルールと工程。"],
    ["NEXT_ACTION.txt","ZIPアップロード後の具体的な指示。"],
    ["MANIFEST_SHA256.txt","ZIP内ファイルのSHA256一覧。"]
  ];

  function esc(value){return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
  function showOnly(id){["loadingScreen","authScreen","errorScreen","app"].forEach(x=>$(x)?.classList.toggle("hidden",x!==id));}
  function toast(message,error=false){const el=$("toast");el.textContent=message;el.className=`toast${error?" error":""}`;el.classList.remove("hidden");clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.add("hidden"),4500);}
  function localDateStamp(){const d=new Date();return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}`;}
  function pretty(value){return JSON.stringify(value??null,null,2)+"\n";}
  function canWrite(){return ["owner_admin","technical_admin","support"].includes(state.staff?.role_key);}

  async function sha256Bytes(input){
    const bytes=input instanceof ArrayBuffer?input:new TextEncoder().encode(String(input));
    const digest=await crypto.subtle.digest("SHA-256",bytes);
    return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,"0")).join("");
  }
  async function sha256Blob(blob){return sha256Bytes(await blob.arrayBuffer());}

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

  async function fetchPaged(table,select,configure){
    const pageSize=1000;
    let from=0;
    const all=[];
    while(true){
      let q=state.supabase.from(table).select(select).range(from,from+pageSize-1);
      if(configure) q=configure(q);
      const {data,error}=await q;
      if(error) throw error;
      const rows=data||[];
      all.push(...rows);
      if(rows.length<pageSize) break;
      from+=pageSize;
    }
    return all;
  }

  async function boot(){
    try{
      $("loadingText").textContent=`${BUILD} / 全SYSTEMスナップショット確認中…`;
      const pub=await publicConfig();
      await waitForSupabase();
      if(!window.JSZip) throw new Error("ZIP生成ライブラリを読み込めませんでした。");

      state.supabase=window.supabase.createClient(
        pub.supabaseUrl,
        pub.supabasePublishableKey||pub.supabaseAnonKey,
        {auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storageKey:pub.sessionStorageKey||"dpro-control-center-auth-v1"}}
      );

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
      await loadSnapshot();
      showOnly("app");
    }catch(error){
      console.error(BUILD,error);
      $("errorText").textContent=error?.message||"全SYSTEM確認ZIPを読み込めませんでした。";
      showOnly("errorScreen");
    }
  }

  function bind(){
    $("retryButton")?.addEventListener("click",()=>location.reload());
    $("refreshButton")?.addEventListener("click",async()=>{try{await loadSnapshot();toast("最新の全SYSTEMスナップショットへ更新しました。");}catch(e){toast(e?.message||"更新できませんでした。",true);}});
    $("generateButton")?.addEventListener("click",generatePackage);
    $("menuButton")?.addEventListener("click",()=>$("sidebar")?.classList.toggle("open"));
  }

  function safeRegistry(row){
    const keys=["system_code","product_id","product_number","product_code","slug","product_name","category","lifecycle_status","default_repository","release_id","release_status","final_lock_verified","product_release_lock","catalog_present","release_present","registry_status","repository","system_final_lock_head","system_pages_root","system_worker_url","frontend_version","worker_version","database_version","release_master_version","package_version","initial_public_qa_pass","release_locked_at","registry_updated_at","product_page_url","demo_url"];
    return Object.fromEntries(keys.filter(k=>row[k]!==undefined).map(k=>[k,row[k]]));
  }

  function safeSummary(row){
    const keys=["system_code","product_id","product_number","product_code","product_name","category","registry_status","repository","release_id","release_status","final_lock_verified","product_release_lock","system_final_lock_head","system_pages_root","system_worker_url","frontend_version","worker_version","database_version","registry_updated_at","current_standard_version_id","current_standard_code","current_standard_version","current_standard_title","current_standard_effective_date","current_standard_item_count","all_current_standard_item_count","audit_id","run_id","audit_created_at","evergreen_status","audit_item_count","applicable_count","not_applicable_count","applicability_unknown_count","pass_count","review_count","fail_count","audit_hold_count","na_count","unknown_count","blocking_fail_count","blocking_review_count","blocking_unknown_count","stale_evidence_count","final_lock_reopen_required","reopen_reason"];
    return Object.fromEntries(keys.filter(k=>row[k]!==undefined).map(k=>[k,row[k]]));
  }

  async function loadSnapshot(){
    const statusResult=await state.supabase.from("cc_v_dpro_evergreen_bulk_handoff_status").select("*").maybeSingle();
    if(statusResult.error) throw statusResult.error;
    state.status=statusResult.data||{};

    const [
      registry,summaries,auditItems,standardItems,featureImpl,featureDefaults,historical,
      finalLockResult,aiProviderResult
    ]=await Promise.all([
      fetchPaged("cc_v_dpro_system_registry","*",q=>q.order("product_number",{ascending:true,nullsFirst:false}).order("system_code",{ascending:true})),
      fetchPaged("cc_v_dpro_evergreen_current","*",q=>q.order("product_number",{ascending:true,nullsFirst:false}).order("system_code",{ascending:true})),
      fetchPaged("cc_evergreen_system_audit_items","audit_id,item_code,applicability,applicability_source,result,is_blocking,evidence_type,evidence_ref,observed_version,evidence_valid_until,checked_at,updated_at",q=>q.order("audit_id",{ascending:true}).order("item_code",{ascending:true})),
      fetchPaged("cc_standard_items","id,item_code,category,item_name,description,requirement_type,condition_feature_code,is_blocking_delivery,sort_order,standard_version_id",q=>q.eq("standard_version_id",state.status.standard_version_id).eq("is_active",true).order("sort_order",{ascending:true})),
      fetchPaged("cc_system_feature_implementations","system_code,feature_code,implementation_status,source_version,last_verified_at,updated_at",q=>q.order("system_code",{ascending:true}).order("feature_code",{ascending:true})),
      fetchPaged("cc_system_feature_defaults","system_code,feature_code,enabled,profile_source,updated_at",q=>q.order("system_code",{ascending:true}).order("feature_code",{ascending:true})),
      fetchPaged("cc_product_ready_audits","id,product_id,standard_version_id,audit_sequence,audit_mode,overall_status,source_system_code,source_version,worker_version,database_version,frontend_version,blocking_fail_count,blocking_review_count,blocking_unknown_count,hold_count,stale_evidence_count,started_at,completed_at,created_at,updated_at",q=>q.order("created_at",{ascending:false})),
      state.supabase.from("cc_v_evergreen_platform_release_current").select("*").maybeSingle(),
      state.supabase.from("cc_v_ai_core_provider_state").select("*").maybeSingle()
    ]);

    if(finalLockResult.error) throw finalLockResult.error;
    if(aiProviderResult.error) throw aiProviderResult.error;

    state.registry=registry.map(safeRegistry);
    state.summaries=summaries.map(safeSummary);

    const currentAuditIds=new Set(state.summaries.map(x=>x.audit_id).filter(Boolean));
    state.auditItems=auditItems.filter(x=>currentAuditIds.has(x.audit_id));
    state.standardItems=standardItems;
    state.featureImpl=featureImpl;
    state.featureDefaults=featureDefaults;

    const latestByProduct=new Map();
    for(const row of historical){
      if(!row.product_id||latestByProduct.has(row.product_id)) continue;
      latestByProduct.set(row.product_id,row);
    }
    state.historicalReady=Array.from(latestByProduct.values());

    state.finalLock=finalLockResult.data||null;
    state.aiProvider=aiProviderResult.data||null;
    render();
  }

  function render(){
    const s=state.status||{};
    const current=Boolean(s.handoff_current);
    const exists=Boolean(s.handoff_exists);

    $("snapshotPanel").innerHTML=`
      <div class="bulk-snapshot">
        <div>
          <p class="eyebrow">CURRENT SNAPSHOT</p>
          <h2>${Number(s.system_count||0)} SYSTEMS / ${esc(s.title||"DPRO MASTER")}</h2>
          <p>現在のRegistry・Evergreen監査・Evidence更新日時からスナップショット指紋を自動生成しています。</p>
        </div>
        <div class="bulk-status-card">
          <strong>前回の全SYSTEM確認ZIP</strong>
          <span>${current?"CURRENT":(exists?"STALE / 再生成必要":"未生成")}</span>
          <small>${esc(s.snapshot_fingerprint||"—")}</small>
        </div>
      </div>`;

    const metrics=[
      [Number(s.system_count||0),"SYSTEMS","動的取得"],
      [esc(s.version_code||"—"),"DPRO MASTER",`${Number(s.standard_item_count||0)}項目`],
      [Number(s.audit_system_count||0),"監査SYSTEM","現在の監査対象"],
      [Number(s.audit_item_count||0),"監査項目","全SYSTEM合計"],
      [current?"CURRENT":(exists?"STALE":"WAIT"),"ALL SYSTEM ZIP",current?"現在スナップショットと一致":(exists?"再生成してください":"まだ未生成")]
    ];
    $("metrics").innerHTML=metrics.map(([v,l,n])=>`<article><b>${esc(v)}</b><span>${esc(l)}</span><small>${esc(n)}</small></article>`).join("");

    $("fileList").innerHTML=FILE_DEFS.map(([name,desc])=>`<div class="bulk-file-row"><strong>${esc(name)}</strong><span>${esc(desc)}</span></div>`).join("");
    $("fileCountBadge").textContent=`${FILE_DEFS.length} files / ZIP直下`;

    const enabled=canWrite() && Number(s.system_count||0)>0 && Number(s.audit_system_count||0)>0;
    $("generateButton").disabled=!enabled;
    $("actionNote").textContent=!canWrite()
      ?"閲覧専用権限では全SYSTEM確認ZIPを記録できません。"
      :`現在 ${Number(s.system_count||0)} SYSTEMSを収録します。新SYSTEM追加時は自動で件数が増えます。`;
  }

  function reviewIndex(){
    return state.summaries.map(row=>{
      const blockingGap=Number(row.blocking_fail_count||0)+Number(row.blocking_review_count||0)+Number(row.blocking_unknown_count||0);
      let priority=10;
      if(row.final_lock_reopen_required) priority=100;
      else if(Number(row.blocking_fail_count||0)>0) priority=90;
      else if(Number(row.blocking_review_count||0)>0) priority=80;
      else if(Number(row.blocking_unknown_count||0)>0) priority=60;
      else if(row.registry_status==="CATALOG_SYNC_REQUIRED") priority=50;
      else if(row.evergreen_status==="CURRENT") priority=0;
      return {
        system_code:row.system_code,
        product_number:row.product_number,
        product_name:row.product_name,
        category:row.category,
        evergreen_status:row.evergreen_status,
        registry_status:row.registry_status,
        priority,
        blocking_gap_count:blockingGap,
        blocking_fail_count:Number(row.blocking_fail_count||0),
        blocking_review_count:Number(row.blocking_review_count||0),
        blocking_unknown_count:Number(row.blocking_unknown_count||0),
        unknown_count:Number(row.unknown_count||0),
        pass_count:Number(row.pass_count||0),
        final_lock_reopen_required:Boolean(row.final_lock_reopen_required),
        repository:row.repository||null,
        system_pages_root:row.system_pages_root||null,
        system_worker_url:row.system_worker_url||null
      };
    }).sort((a,b)=>b.priority-a.priority||b.blocking_gap_count-a.blocking_gap_count||Number(a.product_number||999999)-Number(b.product_number||999999));
  }

  function featureProfile(){
    const bySystem={};
    for(const s of state.registry) bySystem[s.system_code]={implementations:[],defaults:[]};
    for(const row of state.featureImpl){
      if(!bySystem[row.system_code]) bySystem[row.system_code]={implementations:[],defaults:[]};
      bySystem[row.system_code].implementations.push(row);
    }
    for(const row of state.featureDefaults){
      if(!bySystem[row.system_code]) bySystem[row.system_code]={implementations:[],defaults:[]};
      bySystem[row.system_code].defaults.push(row);
    }
    return bySystem;
  }

  function buildFiles(){
    const s=state.status||{};
    const generatedAt=new Date().toISOString();
    const info={
      package_version:PACKAGE_VERSION,
      generated_at:generatedAt,
      purpose:"All DPRO SYSTEM monthly/on-demand review package for manual ChatGPT analysis",
      system_count:Number(s.system_count||0),
      system_count_hardcoded:false,
      dynamic_system_registry:true,
      current_standard_version_id:s.standard_version_id,
      current_standard_code:s.standard_code,
      current_standard_version:s.version_code,
      current_standard_title:s.title,
      current_standard_item_count:Number(s.standard_item_count||0),
      all_current_standard_item_count:Number(s.all_current_standard_item_count||0),
      evergreen_run_id:s.run_id,
      evergreen_run_status:s.run_status,
      audit_system_count:Number(s.audit_system_count||0),
      audit_item_count:Number(s.audit_item_count||0),
      snapshot_fingerprint:s.snapshot_fingerprint,
      previous_bulk_handoff:{
        exists:Boolean(s.handoff_exists),
        current:Boolean(s.handoff_current),
        id:s.handoff_id||null,
        created_at:s.handoff_created_at||null,
        package_sha256:s.package_sha256||null
      },
      safety:{
        unknown_is_not_fail:true,
        system_final_lock_auto_reopen:false,
        historical_ready_preserved:true,
        customer_records_included:false,
        patient_records_included:false,
        secrets_included:false,
        provider_mode:state.aiProvider?.provider_mode||null,
        api_enabled:Boolean(state.aiProvider?.api_enabled)
      }
    };

    const currentStandard={
      standard_version_id:s.standard_version_id,
      standard_code:s.standard_code,
      version_code:s.version_code,
      title:s.title,
      effective_date:s.effective_date,
      standard_item_count:Number(s.standard_item_count||0),
      all_current_standard_item_count:Number(s.all_current_standard_item_count||0)
    };

    const startHere=[
      "DPRO PRODUCT EVERGREEN / ALL SYSTEM REVIEW PACKAGE R1",
      "",
      `Generated: ${generatedAt}`,
      `SYSTEMS: ${Number(s.system_count||0)} (dynamic; never treat this as a hardcoded maximum)`,
      `Current MASTER: ${s.title||""} / ${Number(s.standard_item_count||0)} items`,
      `Evergreen audit: ${Number(s.audit_system_count||0)} systems / ${Number(s.audit_item_count||0)} items`,
      `Snapshot fingerprint: ${s.snapshot_fingerprint||""}`,
      "",
      "【目的】",
      "このZIP 1個を基準に、現在登録されている全DPRO SYSTEMを最新DPRO基準で確認する。",
      "",
      "【最重要ルール】",
      "1. UNKNOWNは不具合ではない。Evidence未確認として扱い、推測でFAILにしない。",
      "2. SYSTEM FINAL LOCKは自動解除しない。重大欠陥が証明された場合のみ人判断へ回す。",
      "3. ACCEPT/READY済み領域は、証明された不具合がない限り再実装しない。",
      "4. SYSTEM数は固定しない。SYSTEM_REGISTRY_ALL.jsonにある全SYSTEMを対象にする。",
      "5. 顧客・患者個人情報やSecretを要求しない。",
      "6. まず全SYSTEMを一巡し、問題/要確認があるSYSTEMだけを深掘りする。",
      "",
      "次にHANDOFF.txtを読み、ALL-00 DRIFT_AND_FACT_LOCKから開始してください。",
      ""
    ].join("\n");

    const handoff=[
      "DPRO ALL SYSTEM REVIEW / CHATGPT HANDOFF R1",
      "",
      "このZIPを唯一の一括確認開始基準として扱う。",
      "",
      "ALL-00 DRIFT_AND_FACT_LOCK",
      "- PACKAGE_INFO / PLATFORM_FINAL_LOCK / CURRENT_STANDARD_FACTを確認する。",
      "- SYSTEM_REGISTRY_ALLの全SYSTEM数を母集団として固定する。数字をコードへ固定しない。",
      "- 可能な範囲でGitHub HEAD / public Pages / Workerの現在値を確認し、Packageとの差をdriftとして分離する。",
      "",
      "ALL-01 FULL SYSTEM SWEEP",
      "- ALL_SYSTEM_REVIEW_INDEXの全SYSTEMを必ず一巡する。",
      "- EVERGREEN_SYSTEM_SUMMARIESとEVERGREEN_AUDIT_ITEMS_ALLを照合する。",
      "- UNKNOWNは未確認。FAIL 0でも未確認Blockerが多いSYSTEMはEvidence確認候補。",
      "- FINAL LOCK再開が必要と断定しない。証拠がある場合のみ人判断へ。",
      "",
      "ALL-02 PRIORITY CLASSIFICATION",
      "- A: 問題なし/追加作業なし",
      "- B: Evidence再確認が必要",
      "- C: 証明された差分がありBRUSHUP候補",
      "- D: FINAL LOCK/権限/破壊的変更に関わり人判断必須",
      "- 各SYSTEMをA/B/C/Dのいずれかに整理する。",
      "",
      "ALL-03 DEEP CHECK",
      "- B/C/Dだけを優先してRepository/Public URL/Worker等を追加確認する。",
      "- 単なるUNKNOWNを修正対象にしない。",
      "- 共通改善が見つかった場合はSYSTEM個別修正とDPRO MASTER学習候補を分離する。",
      "",
      "ALL-04 REPORT",
      "- 最初に全SYSTEMの集計を出す。",
      "- 次にB/C/Dだけを詳しく説明する。",
      "- Cについてのみ個別BRUSHUP START ZIP生成を推奨する。",
      "- AのSYSTEMを無駄に再開発しない。",
      ""
    ].join("\n");

    const nextAction=[
      "NEXT ACTION",
      "",
      "1. このZIPをChatGPTへ1個アップロードする。",
      "2. 次の一文を送る:",
      "   このZIPを唯一の基準として、全SYSTEMを最新DPRO基準で確認してください。まず全SYSTEMを一巡し、問題があるもの・Evidence再確認が必要なものだけ詳しく教えてください。UNKNOWNはFAIL扱いせず、SYSTEM FINAL LOCKは自動解除しないでください。",
      "3. ChatGPTの全SYSTEM確認結果を確認する。",
      "4. 実際に差分が証明されたSYSTEMだけPRODUCT EVERGREENから個別BRUSHUP START ZIPを生成する。",
      ""
    ].join("\n");

    return {
      "00_START_HERE.txt":startHere,
      "PACKAGE_INFO.json":pretty(info),
      "CURRENT_STANDARD_FACT.json":pretty(currentStandard),
      "PLATFORM_FINAL_LOCK.json":pretty(state.finalLock),
      "AI_CORE_STATE.json":pretty(state.aiProvider),
      "DPRO_MASTER_CURRENT.json":pretty(state.standardItems),
      "SYSTEM_REGISTRY_ALL.json":pretty(state.registry),
      "EVERGREEN_SYSTEM_SUMMARIES.json":pretty(state.summaries),
      "EVERGREEN_AUDIT_ITEMS_ALL.json":pretty(state.auditItems),
      "SYSTEM_FEATURE_PROFILE_ALL.json":pretty(featureProfile()),
      "HISTORICAL_READY_LATEST_ALL.json":pretty(state.historicalReady),
      "ALL_SYSTEM_REVIEW_INDEX.json":pretty(reviewIndex()),
      "HANDOFF.txt":handoff,
      "NEXT_ACTION.txt":nextAction
    };
  }

  async function generatePackage(){
    const button=$("generateButton");
    const old=button.textContent;
    button.disabled=true;
    try{
      button.textContent="最新の全SYSTEMを再取得中…";
      await loadSnapshot();
      const s=state.status||{};
      if(Number(s.system_count||0)===0) throw new Error("SYSTEM Registryが空です。");
      if(Number(s.audit_system_count||0)===0) throw new Error("Evergreen監査SYSTEMがありません。");

      const files=buildFiles();
      const manifest=[];
      for(const [name,content] of Object.entries(files)){
        manifest.push(`${await sha256Bytes(content)}  ${name}`);
      }
      files["MANIFEST_SHA256.txt"]=[
        "DPRO PRODUCT EVERGREEN / ALL SYSTEM REVIEW MANIFEST",
        `Package Version: ${PACKAGE_VERSION}`,
        `Systems: ${Number(s.system_count||0)}`,
        `Current Master: ${s.version_code||""}`,
        `Snapshot Fingerprint: ${s.snapshot_fingerprint||""}`,
        `Generated: ${new Date().toISOString()}`,
        "",
        ...manifest,
        ""
      ].join("\n");

      const zip=new JSZip();
      for(const [name,content] of Object.entries(files)) zip.file(name,content,{binary:false});
      button.textContent="ZIPを生成中…";
      const blob=await zip.generateAsync({type:"blob",compression:"DEFLATE",compressionOptions:{level:6}});
      const zipSha=await sha256Blob(blob);

      button.textContent="Evergreen台帳へ記録中…";
      const {data:registration,error:regError}=await state.supabase.rpc("cc_evergreen_register_bulk_handoff",{
        p_package_version:PACKAGE_VERSION,
        p_package_sha256:zipSha,
        p_file_count:Object.keys(files).length
      });
      if(regError) throw regError;

      const filename=`DPRO_ALL_SYSTEMS_EVERGREEN_REVIEW_START_R1_${localDateStamp()}.zip`;
      const url=URL.createObjectURL(blob);
      const a=document.createElement("a");
      a.href=url;a.download=filename;
      document.body.appendChild(a);a.click();a.remove();
      setTimeout(()=>URL.revokeObjectURL(url),1800);

      $("resultFilename").textContent=filename;
      $("resultSystems").textContent=`${Number(registration?.system_count||s.system_count||0)} SYSTEMS`;
      $("resultAuditItems").textContent=`${Number(registration?.audit_item_count||s.audit_item_count||0)} items`;
      $("resultSha").textContent=zipSha;
      $("resultPanel").classList.remove("hidden");

      await loadSnapshot();
      toast("全SYSTEM確認ZIPを生成し、Snapshot FingerprintとSHA256をEvergreenへ記録しました。");
    }catch(error){
      console.error(BUILD,error);
      toast(error?.message||"全SYSTEM確認ZIPを生成できませんでした。",true);
    }finally{
      button.textContent=old;
      render();
    }
  }

  window.addEventListener("DOMContentLoaded",boot,{once:true});
})();
