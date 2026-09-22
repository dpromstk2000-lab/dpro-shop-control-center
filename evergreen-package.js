(() => {
  "use strict";

  const BUILD = "DPRO-EVERGREEN-START-PACKAGE-EVG04-R1-20260922";
  const PACKAGE_VERSION = "DPRO-EVERGREEN-BRUSHUP-START-R1";
  const API_BASE = "https://dpro-shop-control-center-api.dpromstk2000.workers.dev";
  const $ = (id) => document.getElementById(id);
  const state = {
    supabase:null, session:null, staff:null, systemCode:"",
    row:null, auditItems:[], standardItems:[], features:[], featureDefaults:[],
    history:null, release:null, gate:null
  };
  const roleLabels={owner_admin:"管理責任者",technical_admin:"技術管理者",support:"DPROサポート",read_only:"閲覧専用"};

  const FILE_DEFS = [
    ["00_START_HERE.txt","新チャットで最初に読む開始指示。DRIFT_AND_FACT_LOCKから開始。"],
    ["PACKAGE_INFO.json","SYSTEM・MASTER・監査RUN・ZIP基準情報。"],
    ["SYSTEM_REGISTRY_SNAPSHOT.json","Repository / Pages / Worker / FINAL LOCK等の安全なSYSTEMスナップショット。"],
    ["CURRENT_STANDARD_FACT.json","現在のDPRO MASTERと現行標準数。"],
    ["DPRO_MASTER_CURRENT.json","対象となる現行DPRO MASTER項目一式。"],
    ["EVERGREEN_AUDIT_SUMMARY.json","対象SYSTEMのEvergreen状態・件数・LOCK境界。"],
    ["EVERGREEN_AUDIT_ITEMS.json","各MASTER項目のapplicability / result / Evidence。"],
    ["SYSTEM_FEATURE_PROFILE.json","Feature既定値・実装状態。"],
    ["HISTORICAL_READY_SNAPSHOT.json","過去PRODUCT READYの最新履歴。過去READYを消さないための参照。"],
    ["EVERGREEN_RETURN_TEMPLATE.json","ブラッシュアップ結果をEvergreenへ返すテンプレート。"],
    ["HANDOFF.txt","ChatGPTへ渡す安全な差分ブラッシュアップ指示。"],
    ["NEXT_ACTION.txt","ZIP受領後の具体的な再開手順。"],
    ["MANIFEST_SHA256.txt","ZIP内各ファイルのSHA256一覧。"]
  ];

  function esc(value){return String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
  function pretty(value){return JSON.stringify(value??null,null,2)+"\n";}
  function showOnly(id){["loadingScreen","authScreen","errorScreen","app"].forEach(x=>$(x)?.classList.toggle("hidden",x!==id));}
  function toast(message,error=false){const el=$("toast");el.textContent=message;el.className=`toast${error?" error":""}`;el.classList.remove("hidden");clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.add("hidden"),4200);}
  function cleanCode(v){return String(v||"DPRO_SYSTEM").toUpperCase().replace(/[^A-Z0-9_]+/g,"_").replace(/^_+|_+$/g,"")||"DPRO_SYSTEM";}
  function localDateStamp(){const d=new Date();return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}`;}
  async function sha256Bytes(input){const bytes=input instanceof ArrayBuffer?input:new TextEncoder().encode(String(input));const digest=await crypto.subtle.digest("SHA-256",bytes);return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,"0")).join("");}
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

  async function boot(){
    try{
      state.systemCode=cleanCode(new URLSearchParams(location.search).get("system")||"");
      if(!state.systemCode) throw new Error("SYSTEM CODEが指定されていません。PRODUCT EVERGREENから開いてください。");
      $("loadingText").textContent=`${BUILD} / ${state.systemCode} を確認中…`;
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
      await loadLatest();
      showOnly("app");
    }catch(error){
      console.error(BUILD,error);
      $("errorText").textContent=error?.message||"EVERGREEN START ZIPを読み込めませんでした。";
      showOnly("errorScreen");
    }
  }

  function bind(){
    $("retryButton")?.addEventListener("click",()=>location.reload());
    $("reloadButton")?.addEventListener("click",async()=>{try{await loadLatest();toast("最新状態へ更新しました。");}catch(e){toast(e?.message||"更新できませんでした。",true);}});
    $("generateButton")?.addEventListener("click",generatePackage);
    $("menuButton")?.addEventListener("click",()=>$("sidebar")?.classList.toggle("open"));
  }

  async function loadLatest(){
    const rowResult=await state.supabase.from("cc_v_dpro_evergreen_current").select("*").eq("system_code",state.systemCode).maybeSingle();
    if(rowResult.error) throw rowResult.error;
    if(!rowResult.data) throw new Error(`Evergreen registryに ${state.systemCode} がありません。`);
    state.row=rowResult.data;

    const auditPromise=state.row.audit_id
      ? state.supabase.from("cc_evergreen_system_audit_items").select("*").eq("audit_id",state.row.audit_id).order("item_code",{ascending:true})
      : Promise.resolve({data:[],error:null});

    const historyPromise=state.row.product_id
      ? state.supabase.from("cc_product_ready_audits").select("id,product_id,standard_version_id,audit_sequence,audit_mode,overall_status,source_system_code,source_version,worker_version,database_version,frontend_version,blocking_fail_count,blocking_review_count,blocking_unknown_count,hold_count,stale_evidence_count,started_at,completed_at,note,metadata,created_at,updated_at").eq("product_id",state.row.product_id).order("created_at",{ascending:false}).limit(5)
      : Promise.resolve({data:[],error:null});

    const releasePromise=state.row.release_id
      ? state.supabase.from("cc_product_releases").select("id,system_code,product_name,category,release_status,system_repository,system_final_lock_head,system_pages_root,system_worker_url,frontend_version,worker_version,database_version,release_master_version,final_lock_verified,product_release_lock,release_locked_at,public_urls,final_lock_baseline,updated_at").eq("id",state.row.release_id).maybeSingle()
      : Promise.resolve({data:null,error:null});

    const [auditResult, standardResult, featuresResult, defaultsResult, historyResult, releaseResult, gateResult]=await Promise.all([
      auditPromise,
      state.supabase.from("cc_standard_items").select("*").eq("standard_version_id",state.row.current_standard_version_id).order("sort_order",{ascending:true}),
      state.supabase.from("cc_system_feature_implementations").select("system_code,feature_code,implementation_status,source_version,evidence_note,last_verified_at,updated_at").eq("system_code",state.systemCode).order("feature_code",{ascending:true}),
      state.supabase.from("cc_system_feature_defaults").select("system_code,feature_code,enabled,setting_json,profile_source,updated_at").eq("system_code",state.systemCode).order("feature_code",{ascending:true}),
      historyPromise,
      releasePromise,
      state.supabase.rpc("cc_evergreen_handoff_gate",{p_system_code:state.systemCode}),
    ]);
    for(const result of [auditResult,standardResult,featuresResult,defaultsResult,historyResult,releaseResult,gateResult]){
      if(result.error) throw result.error;
    }

    state.auditItems=auditResult.data||[];
    state.standardItems=standardResult.data||[];
    state.features=featuresResult.data||[];
    state.featureDefaults=defaultsResult.data||[];
    state.history={audits:historyResult.data||[]};
    state.release=releaseResult.data||null;
    state.gate=gateResult.data||{};
    render();
  }

  function render(){
    const r=state.row||{};
    const current=Boolean(state.gate?.handoff_current);
    const exists=Boolean(state.gate?.handoff_exists);
    $("systemPanel").innerHTML=`
      <div class="package-summary">
        <div>
          <p class="eyebrow">${esc(r.system_code||"")}</p>
          <h2>${esc(r.product_name||r.system_code||"DPRO SYSTEM")}</h2>
          <p>${esc(r.category||"カテゴリ未設定")} / ${esc(r.current_standard_title||"現行DPRO MASTER")}</p>
        </div>
        <div class="package-summary-side">
          <strong>Repository</strong><span class="repo-code">${esc(r.repository||"未登録")}</span>
          <strong>EVERGREEN STATUS</strong><span>${esc(r.evergreen_status||"—")}</span>
          <strong>START ZIP</strong><span>${current?"CURRENT":(exists?"STALE / 再生成必要":"未生成")}</span>
        </div>
      </div>`;

    $("metrics").innerHTML=[
      [r.current_standard_version||"—","MASTER",`${Number(r.current_standard_item_count||0)}項目`],
      [Number(r.audit_item_count||0),"監査項目",`${Number(r.applicable_count||0)}適用 / ${Number(r.not_applicable_count||0)} N/A`],
      [Number(r.blocking_unknown_count||0),"未確認Blocker",`FAIL ${Number(r.blocking_fail_count||0)} / REVIEW ${Number(r.blocking_review_count||0)}`],
      [Number(r.pass_count||0),"PASS Evidence",`UNKNOWN ${Number(r.unknown_count||0)}`],
      [current?"READY":(exists?"STALE":"WAIT"),"START ZIP",current?"現在のMASTER/監査と一致":(exists?"再生成が必要":"まだ未生成")]
    ].map(([v,l,n])=>`<article><b>${esc(v)}</b><span>${esc(l)}</span><small>${esc(n)}</small></article>`).join("");

    $("fileList").innerHTML=FILE_DEFS.map(([name,desc])=>`<div class="file-row"><strong>${esc(name)}</strong><span>${esc(desc)}</span></div>`).join("");
    $("fileCountBadge").textContent=`${FILE_DEFS.length} files / ZIP直下`;

    const canWrite=["owner_admin","technical_admin","support"].includes(state.staff?.role_key);
    const canGenerate=canWrite && Boolean(r.current_standard_version_id) && Boolean(r.audit_id);
    $("generateButton").disabled=!canGenerate;
    $("actionNote").textContent=!canWrite
      ?"閲覧専用権限ではZIPを登録できません。"
      :(!r.audit_id
        ?"現行Evergreen監査がまだ発行されていません。"
        :"生成直前に最新状態を再取得し、各ファイルSHA256とZIP SHA256をEvergreen台帳へ記録します。");
  }

  function enrichedAuditItems(){
    const map=new Map(state.standardItems.map(x=>[x.id,x]));
    const codeMap=new Map(state.standardItems.map(x=>[x.item_code,x]));
    return state.auditItems.map(item=>{
      const std=map.get(item.standard_item_id)||codeMap.get(item.item_code)||{};
      return {
        item_code:item.item_code,
        category:std.category||null,
        item_name:std.item_name||null,
        description:std.description||null,
        requirement_type:std.requirement_type||null,
        condition_feature_code:std.condition_feature_code||null,
        applicability:item.applicability,
        applicability_source:item.applicability_source,
        result:item.result,
        is_blocking:item.is_blocking,
        evidence_type:item.evidence_type,
        evidence_ref:item.evidence_ref,
        observed_version:item.observed_version,
        evidence_valid_until:item.evidence_valid_until,
        checked_at:item.checked_at,
        note:item.note,
        metadata:item.metadata||{}
      };
    });
  }

  function buildFiles(){
    const r=state.row||{};
    const items=enrichedAuditItems();
    const generatedAt=new Date().toISOString();
    const blockingGaps=items.filter(x=>x.is_blocking && x.applicability!=="not_applicable" && ["UNKNOWN","REVIEW","FAIL","HOLD"].includes(x.result));
    const nonBlockingGaps=items.filter(x=>!x.is_blocking && x.applicability!=="not_applicable" && ["UNKNOWN","REVIEW","FAIL","HOLD"].includes(x.result));

    const packageInfo={
      package_version:PACKAGE_VERSION,
      generated_at:generatedAt,
      system_code:r.system_code,
      product_name:r.product_name,
      category:r.category,
      current_standard_version_id:r.current_standard_version_id,
      current_standard_code:r.current_standard_code,
      current_standard_version:r.current_standard_version,
      current_standard_effective_date:r.current_standard_effective_date,
      current_standard_item_count:r.current_standard_item_count,
      all_current_standard_item_count:r.all_current_standard_item_count,
      audit_id:r.audit_id,
      run_id:r.run_id,
      evergreen_status:r.evergreen_status,
      source_registry_updated_at:r.registry_updated_at,
      source_audit_created_at:r.audit_created_at,
      safety:{
        system_final_lock_auto_reopen:false,
        unknown_is_not_fail:true,
        historical_ready_is_preserved:true,
        secrets_in_package:false,
        personal_data_in_package:false
      }
    };

    const registry={
      system_code:r.system_code,product_id:r.product_id,product_number:r.product_number,product_code:r.product_code,slug:r.slug,
      product_name:r.product_name,category:r.category,registry_status:r.registry_status,catalog_present:r.catalog_present,release_present:r.release_present,
      repository:r.repository,release_id:r.release_id,release_status:r.release_status,final_lock_verified:r.final_lock_verified,
      product_release_lock:r.product_release_lock,system_final_lock_head:r.system_final_lock_head,system_pages_root:r.system_pages_root,
      system_worker_url:r.system_worker_url,frontend_version:r.frontend_version,worker_version:r.worker_version,database_version:r.database_version,
      release_master_version:r.release_master_version,package_version:r.package_version,initial_public_qa_pass:r.initial_public_qa_pass,
      release_locked_at:r.release_locked_at,registry_updated_at:r.registry_updated_at,
      product_page_url:r.product_page_url,demo_url:r.demo_url,
      release_safe_snapshot:state.release
    };

    const standardFact={
      standard_version_id:r.current_standard_version_id,
      standard_code:r.current_standard_code,
      version_code:r.current_standard_version,
      title:r.current_standard_title,
      effective_date:r.current_standard_effective_date,
      dpro_master_item_count:r.current_standard_item_count,
      all_current_standard_item_count:r.all_current_standard_item_count
    };

    const auditSummary={
      audit_id:r.audit_id,run_id:r.run_id,audit_created_at:r.audit_created_at,
      evergreen_status:r.evergreen_status,audit_item_count:r.audit_item_count,applicable_count:r.applicable_count,
      not_applicable_count:r.not_applicable_count,applicability_unknown_count:r.applicability_unknown_count,
      pass_count:r.pass_count,review_count:r.review_count,fail_count:r.fail_count,hold_count:r.audit_hold_count,
      na_count:r.na_count,unknown_count:r.unknown_count,blocking_fail_count:r.blocking_fail_count,
      blocking_review_count:r.blocking_review_count,blocking_unknown_count:r.blocking_unknown_count,
      stale_evidence_count:r.stale_evidence_count,final_lock_reopen_required:r.final_lock_reopen_required,reopen_reason:r.reopen_reason,
      blocking_gap_item_codes:blockingGaps.map(x=>x.item_code),
      non_blocking_gap_item_codes:nonBlockingGaps.map(x=>x.item_code)
    };

    const featureProfile={
      implementations:state.features,
      defaults:state.featureDefaults
    };

    const returnTemplate={
      schema_version:"DPRO-EVERGREEN-RETURN-R1",
      source:{
        system_code:r.system_code,
        current_standard_version:r.current_standard_version,
        audit_id:r.audit_id,
        run_id:r.run_id
      },
      rules:[
        "Do not mark UNKNOWN as FAIL without evidence.",
        "Do not reopen SYSTEM FINAL LOCK automatically.",
        "Record evidence_ref and observed_version for every changed audit result.",
        "Only reusable cross-product improvements belong in MASTER learning candidates.",
        "Never include secrets, credentials, patient/customer personal data."
      ],
      audit_item_updates:[],
      final_lock_reopen_decision:{
        required:false,
        reason:null,
        human_approved:false
      },
      learning_candidates:[]
    };

    const startHere=[
      "DPRO PRODUCT EVERGREEN / BRUSHUP START R1",
      "",
      `SYSTEM: ${r.product_name||""} (${r.system_code||""})`,
      `CURRENT MASTER: ${r.current_standard_title||""}`,
      `EVERGREEN STATUS: ${r.evergreen_status||""}`,
      `AUDIT ID: ${r.audit_id||""}`,
      `REPOSITORY: ${r.repository||"未登録"}`,
      `SYSTEM FINAL LOCK HEAD: ${r.system_final_lock_head||"未登録"}`,
      "",
      "【最初に必ず行うこと】",
      "1. このZIPを唯一のブラッシュアップ開始基準として扱う。",
      "2. HANDOFF.txtを読み、EVG-00相当のDRIFT_AND_FACT_LOCKを最初に実施する。",
      "3. Repositoryの現在HEADとSYSTEM_REGISTRY_SNAPSHOT.jsonの基準HEADを比較し、driftを先に固定する。",
      "4. EVERGREEN_AUDIT_ITEMS.jsonのUNKNOWNは未確認でありFAILではない。証拠を確認してから判定する。",
      "5. 過去READY・FINAL LOCK済み領域は、証明された不具合がない限り再実装しない。",
      "6. SYSTEM FINAL LOCKは自動解除しない。重大欠陥が証明された場合のみ、理由を明示して人判断へ回す。",
      "7. CURRENT DPRO MASTERの適用対象だけを差分修正する。",
      "8. Secret・認証情報・実顧客/患者個人情報をZIP、ログ、コード、Evidenceへ追加しない。",
      "",
      "次にHANDOFF.txtを読んで作業を開始してください。",
      ""
    ].join("\n");

    const handoff=[
      "DPRO PRODUCT EVERGREEN / SAFE BRUSHUP HANDOFF R1",
      "",
      `対象: ${r.product_name||""} (${r.system_code||""})`,
      `Repository: ${r.repository||"未登録"}`,
      `Current MASTER: ${r.current_standard_title||""}`,
      `Evergreen status: ${r.evergreen_status||""}`,
      `Blocking UNKNOWN: ${Number(r.blocking_unknown_count||0)}`,
      `Blocking REVIEW: ${Number(r.blocking_review_count||0)}`,
      `Blocking FAIL: ${Number(r.blocking_fail_count||0)}`,
      "",
      "【工程】",
      "EVG-BR-00 DRIFT_AND_FACT_LOCK",
      "- Repository HEAD / deployed public pages / Worker / DB versionを現在値で確認する。",
      "- SYSTEM_REGISTRY_SNAPSHOTとの差分があれば、修正前にdriftとして記録する。",
      "",
      "EVG-BR-01 EVIDENCE_RECHECK",
      "- EVERGREEN_AUDIT_ITEMSのUNKNOWN/REVIEW/FAILを優先して証拠確認する。",
      "- UNKNOWNは確認前の状態。推測でFAIL/PASSにしない。",
      "",
      "EVG-BR-02 MINIMUM_BRUSHUP",
      "- 実際に不足が証明された項目だけを修正する。",
      "- ACCEPT済み・動作中の機能をゼロから再実装しない。",
      "- DPRO MASTERのrequired/conditional条件を守る。",
      "",
      "EVG-BR-03 CROSS_QA",
      "- Owner / Staff / Customer / iPad / API / DB / public URLs / responsive / operation safetyを対象範囲に応じ再確認する。",
      "- 修正していないLOCK済み領域は回帰確認に留める。",
      "",
      "EVG-BR-04 RETURN",
      "- EVERGREEN_RETURN_TEMPLATE.json形式で監査更新・Evidence・再開判断・学習候補を返す。",
      "- SYSTEM FINAL LOCK再開が必要なら、自動実行せず人判断を要求する。",
      "",
      "【禁止】",
      "- SYSTEM数やMASTER versionをコードへ固定しない。",
      "- Secret/service role keyをブラウザ・GitHub・ZIPへ入れない。",
      "- 実顧客/患者データを標準製品ブラッシュアップへ持ち込まない。",
      "- EvidenceなしにPASS/FAILを作らない。",
      ""
    ].join("\n");

    const nextAction=[
      "NEXT ACTION",
      "",
      "1. このZIPを新しいChatGPTチャットへ1個アップロードする。",
      "2. 次の一文を送る:",
      "   このZIPを唯一の基準として、DRIFT_AND_FACT_LOCKからDPRO PRODUCT EVERGREENブラッシュアップを開始してください。SYSTEM FINAL LOCKは自動解除せず、証明された差分だけ修正してください。",
      "3. ChatGPTがRepository/公開環境/DBの現在値を確認してFACT LOCKする。",
      "4. EVERGREEN_AUDIT_ITEMSのEvidenceを再確認し、本当に必要な差分だけ実装する。",
      "5. 完了時はEVERGREEN_RETURN_TEMPLATE形式の返却情報とCENTRAL/EVERGREEN返却ZIPを作る。",
      ""
    ].join("\n");

    return {
      "00_START_HERE.txt":startHere,
      "PACKAGE_INFO.json":pretty(packageInfo),
      "SYSTEM_REGISTRY_SNAPSHOT.json":pretty(registry),
      "CURRENT_STANDARD_FACT.json":pretty(standardFact),
      "DPRO_MASTER_CURRENT.json":pretty(state.standardItems),
      "EVERGREEN_AUDIT_SUMMARY.json":pretty(auditSummary),
      "EVERGREEN_AUDIT_ITEMS.json":pretty(items),
      "SYSTEM_FEATURE_PROFILE.json":pretty(featureProfile),
      "HISTORICAL_READY_SNAPSHOT.json":pretty(state.history),
      "EVERGREEN_RETURN_TEMPLATE.json":pretty(returnTemplate),
      "HANDOFF.txt":handoff,
      "NEXT_ACTION.txt":nextAction
    };
  }

  async function generatePackage(){
    const button=$("generateButton");
    const old=button.textContent;
    button.disabled=true;
    try{
      button.textContent="最新状態を再取得中…";
      await loadLatest();
      const r=state.row||{};
      if(!r.audit_id) throw new Error("現行Evergreen監査がありません。");
      const files=buildFiles();
      const manifest=[];
      for(const [name,content] of Object.entries(files)){
        manifest.push(`${await sha256Bytes(content)}  ${name}`);
      }
      files["MANIFEST_SHA256.txt"]=[
        "DPRO PRODUCT EVERGREEN START PACKAGE MANIFEST",
        `Package Version: ${PACKAGE_VERSION}`,
        `System Code: ${r.system_code}`,
        `Current Master: ${r.current_standard_version}`,
        `Audit ID: ${r.audit_id}`,
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
      const {data:registration,error:regError}=await state.supabase.rpc("cc_evergreen_register_handoff",{
        p_system_code:r.system_code,
        p_package_version:PACKAGE_VERSION,
        p_package_sha256:zipSha,
        p_file_count:Object.keys(files).length
      });
      if(regError) throw regError;

      const filename=`DPRO_${cleanCode(r.system_code)}_EVERGREEN_BRUSHUP_START_R1_${localDateStamp()}.zip`;
      const url=URL.createObjectURL(blob);
      const a=document.createElement("a");
      a.href=url;a.download=filename;
      document.body.appendChild(a);a.click();a.remove();
      setTimeout(()=>URL.revokeObjectURL(url),1600);

      $("resultFilename").textContent=filename;
      $("resultSha").textContent=zipSha;
      $("resultFiles").textContent=`${Object.keys(files).length} files / ZIP直下`;
      $("resultGate").textContent=registration?.ready?"START READY / CURRENT":"登録済み";
      $("resultPanel").classList.remove("hidden");
      await loadLatest();
      toast("Evergreen BRUSHUP START ZIPを生成し、SHA256を台帳へ記録しました。");
    }catch(error){
      console.error(BUILD,error);
      toast(error?.message||"START ZIPを生成できませんでした。",true);
    }finally{
      button.textContent=old;
      render();
    }
  }

  window.addEventListener("DOMContentLoaded",boot,{once:true});
})();
