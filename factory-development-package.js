(() => {
  "use strict";

  const BUILD = "DPRO-FACTORY-DEV-PACKAGE-R1-20260920";
  const PACKAGE_VERSION = "FACTORY-DEV-PACKAGE-R1";
  const CONFIG = window.DPRO_CONTROL_CENTER_CONFIG || {};
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const roleLabels = { owner_admin:"管理責任者", technical_admin:"技術管理者", support:"DPROサポート", read_only:"閲覧専用" };
  const state = { supabase:null, session:null, staff:null, productDevId:"", packet:null, gate:null };

  const FILE_DEFS = [
    ["00_START_HERE.txt","新しいChatGPTチャットで最初に読む開始指示。"],
    ["PACKAGE_INFO.json","開発コード・SYSTEM CODE・作成日時・FACTORY固定IDENTITY。"],
    ["PRODUCT_DEFINITION.json","管理センターで登録した新製品定義。"],
    ["DPRO_FACTORY_STANDARD.json","現行DPRO標準項目・Feature Catalog・依存関係・固定ルール。"],
    ["REFERENCE_PRODUCT.json","参考製品の製品台帳・Repository・READY・実装Feature・業種テンプレート。"],
    ["FACTORY_CHECKLIST.json","FACTORY V2チェックリストと、入力済み詳細設計がある場合の参考情報。"],
    ["HANDOFF.txt","ChatGPTへ渡す開発指示と再利用ルール。"],
    ["NEXT_ACTION.txt","ZIPを受け取ったChatGPTとユーザーの次の作業。"],
    ["MANIFEST_SHA256.txt","ZIP内各ファイルのSHA256一覧。"]
  ];

  function showOnly(id){ ["loadingScreen","authScreen","errorScreen","app"].forEach(x=>$(x)?.classList.toggle("hidden",x!==id)); }
  function toast(message,error=false){ const el=$("toast"); el.textContent=message; el.className=`toast${error?" error":""}`; el.classList.remove("hidden"); clearTimeout(toast.timer); toast.timer=setTimeout(()=>el.classList.add("hidden"),4200); }
  function pretty(value){ return JSON.stringify(value ?? null,null,2)+"\n"; }
  function localDateStamp(){ const d=new Date(); return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}`; }
  function cleanCode(v){ return String(v||"DPRO_PRODUCT").toUpperCase().replace(/[^A-Z0-9_]+/g,"_").replace(/^_+|_+$/g,"") || "DPRO_PRODUCT"; }
  async function sha256Bytes(input){ const bytes=input instanceof ArrayBuffer?input:new TextEncoder().encode(String(input)); const digest=await crypto.subtle.digest("SHA-256",bytes); return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,"0")).join(""); }
  async function sha256Blob(blob){ return sha256Bytes(await blob.arrayBuffer()); }

  async function boot(){
    try{
      state.productDevId=new URLSearchParams(location.search).get("productDev")||"";
      if(!state.productDevId) throw new Error("新規製品開発IDが指定されていません。新規製品開発画面から開いてください。");
      $("loadingText").textContent=`${BUILD} / 管理センター標準を確認中…`;
      const base=String(CONFIG.apiBaseUrl||"").replace(/\/$/,"");
      if(!base) throw new Error("CONTROL CENTER API設定がありません。");
      const res=await fetch(`${base}/api/public-config`,{cache:"no-store"});
      const pub=await res.json().catch(()=>({}));
      if(!res.ok) throw new Error(pub?.error||"公開設定を取得できませんでした。");
      if(!window.supabase?.createClient) throw new Error("Supabase接続ライブラリを読み込めませんでした。");
      if(!window.JSZip) throw new Error("ZIP生成ライブラリを読み込めませんでした。");
      state.supabase=window.supabase.createClient(pub.supabaseUrl,pub.supabasePublishableKey||pub.supabaseAnonKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storageKey:pub.sessionStorageKey||"dpro-control-center-auth-v1"}});
      const {data:{session},error:sessionError}=await state.supabase.auth.getSession();
      if(sessionError) throw sessionError;
      state.session=session;
      if(!session){showOnly("authScreen");return;}
      const {data:staff,error:staffError}=await state.supabase.from("cc_staff").select("id,display_name,role_key,status").eq("auth_user_id",session.user.id).maybeSingle();
      if(staffError) throw staffError;
      if(!staff||staff.status!=="active"||!["owner_admin","technical_admin","support"].includes(staff.role_key)){showOnly("authScreen");return;}
      state.staff=staff;
      $("staffName").textContent=staff.display_name||"DPROスタッフ";
      $("staffRole").textContent=roleLabels[staff.role_key]||staff.role_key;
      $("staffInitial").textContent=(staff.display_name||"D").trim().slice(0,1).toUpperCase();
      bind();
      await loadLatest();
      showOnly("app");
    }catch(error){ console.error(BUILD,error); $("errorText").textContent=error?.message||"FACTORY開発ZIPを読み込めませんでした。"; showOnly("errorScreen"); }
  }

  function bind(){
    $("retryButton")?.addEventListener("click",()=>location.reload());
    $("reloadButton")?.addEventListener("click",async()=>{await loadLatest();toast("最新情報へ更新しました。");});
    $("generateButton")?.addEventListener("click",generatePackage);
    $("menuButton")?.addEventListener("click",()=>$("sidebar").classList.toggle("open"));
  }

  async function loadLatest(){
    const [packetResult,gateResult]=await Promise.all([
      state.supabase.rpc("cc_product_dev_export_packet",{p_product_dev_id:state.productDevId}),
      state.supabase.rpc("cc_product_dev_start_gate",{p_product_dev_id:state.productDevId})
    ]);
    if(packetResult.error) throw packetResult.error;
    if(gateResult.error) throw gateResult.error;
    state.packet=packetResult.data;
    state.gate=gateResult.data||{};
    render();
  }

  function render(){
    const p=state.packet?.product_development||{};
    const ref=state.packet?.reference_product||{};
    const identity=state.packet?.factory_identity||{};
    const standards=Array.isArray(state.packet?.dpro_standard_items)?state.packet.dpro_standard_items:[];
    const features=Array.isArray(state.packet?.dpro_feature_catalog)?state.packet.dpro_feature_catalog:[];
    const refFeatures=Array.isArray(state.packet?.reference_feature_implementations)?state.packet.reference_feature_implementations:[];
    const current=Boolean(state.gate?.handoff_current);
    const exists=Boolean(state.gate?.handoff_exists);
    $("selfNav").href=`factory-development-package.html?productDev=${encodeURIComponent(state.productDevId)}`;
    $("factoryNav").href=`factory-v2.html?project=${encodeURIComponent(state.packet?.delivery_project?.id||"")}`;
    $("projectPanel").innerHTML=`<div class="package-summary"><div class="package-summary-main"><p class="eyebrow">${esc(p.dev_code||"")} / ${esc(p.target_system_code||"")}</p><h2>${esc(p.product_name||"DPRO新製品")}</h2><p>${esc(p.category||"")} / 参考製品 ${esc(ref.product_name||p.reference_product_system_code||"—")}</p></div><div class="package-summary-side"><strong>参考Repository</strong><span class="repo-code">${esc(ref.default_repository||"未登録")}</span><strong style="margin-top:10px">現在ステージ</strong><span>${esc(p.status||"—")}</span></div></div>`;
    $("metrics").innerHTML=[
      [identity.identity_match?"PASS":"NG","FACTORY V2 IDENTITY",identity.identity_match?"V2.0 FINAL LOCK一致":"固定IDENTITY要確認"],
      [standards.length,"DPRO標準項目","CONTROL CENTER current"],
      [features.length,"Feature Catalog",`${refFeatures.length}件を参考製品で確認`],
      [current?"READY":(exists?"STALE":"WAIT"),"開発ZIP",current?"現在の製品定義と一致":(exists?"定義更新後の再生成が必要":"まだ未生成")]
    ].map(([v,l,n])=>`<article><b>${esc(v)}</b><span>${esc(l)}</span><small>${esc(n)}</small></article>`).join("");
    $("fileList").innerHTML=FILE_DEFS.map(([name,desc])=>`<div class="file-row"><strong>${esc(name)}</strong><span>${esc(desc)}</span></div>`).join("");
    $("fileCountBadge").textContent=`${FILE_DEFS.length} files / ZIP直下`;
    const statusOk=p.status==="prebuild";
    const identityOk=Boolean(identity.identity_match);
    const canGenerate=statusOk&&identityOk;
    $("generateButton").disabled=!canGenerate;
    $("actionNote").textContent=!statusOk?`現在ステージは「${p.status||"不明"}」です。新規製品開発画面でPREBUILDへ進んでから生成してください。`:(!identityOk?"FACTORY V2固定IDENTITYが一致しないため生成を停止しています。":"生成時に最新データを再取得し、各ファイルSHA256とZIP全体SHA256を計算して管理センターへ記録します。");
  }

  function buildTextFiles(packet){
    const p=packet.product_development||{};
    const ref=packet.reference_product||{};
    const generatedAt=new Date().toISOString();
    const packageInfo={
      package_version:PACKAGE_VERSION,
      schema_version:packet.schema_version,
      generated_at:generatedAt,
      source_generated_at:packet.generated_at,
      dev_code:p.dev_code,
      product_name:p.product_name,
      target_system_code:p.target_system_code,
      category:p.category,
      reference_product_system_code:p.reference_product_system_code,
      factory_version:p.factory_version,
      factory_package_sha256:p.factory_package_sha256,
      factory_lock_sha256:p.factory_lock_sha256,
      source_product_updated_at:p.updated_at,
      privacy:"No customer/patient personal data should be included in this standard-product package."
    };
    const definition={
      dev_code:p.dev_code,product_name:p.product_name,target_system_code:p.target_system_code,category:p.category,
      source_type:p.source_type,source_summary:p.source_summary,reference_product_system_code:p.reference_product_system_code,
      target_users:p.target_users,core_workflow:p.core_workflow,must_have_features:p.must_have_features,out_of_scope:p.out_of_scope,
      data_handling_notes:p.data_handling_notes,medical_data:p.medical_data,status:p.status
    };
    const standard={
      factory_identity:packet.factory_identity,
      factory_rules:packet.factory_rules,
      current_standard_items:packet.dpro_standard_items||[],
      feature_catalog:packet.dpro_feature_catalog||[],
      feature_dependencies:packet.dpro_feature_dependencies||[]
    };
    const reference={
      product:packet.reference_product,
      ready:packet.reference_ready,
      feature_implementations:packet.reference_feature_implementations||[],
      industry_template:packet.reference_industry_template,
      industry_template_features:packet.reference_industry_template_features||[]
    };
    const checklist={
      factory_checklist:packet.factory_checklist||[],
      optional_structured_prebuild_specs:packet.optional_structured_prebuild_specs||[],
      note:"Structured PREBUILD specs are optional context for the new-product route. ChatGPT should derive missing design details from DPRO standards and the reference product, and ask the user only for unresolved business decisions."
    };
    const startHere=[
      "DPRO FACTORY DEVELOPMENT START ZIP",
      "",
      `製品: ${p.product_name||""}`,
      `SYSTEM CODE: ${p.target_system_code||""}`,
      `開発コード: ${p.dev_code||""}`,
      `参考製品: ${ref.product_name||p.reference_product_system_code||""} (${p.reference_product_system_code||""})`,
      `参考Repository: ${ref.default_repository||"未登録"}`,
      `FACTORY: ${p.factory_version||""} FINAL LOCK`,
      "",
      "【このZIPの使い方】",
      "1. このZIPを新しいChatGPTチャットへ1個アップロードする。",
      "2. 過去チャットの説明やリンクの再共有は不要。このZIPを唯一の開発開始基準として扱う。",
      "3. ChatGPTはPRODUCT_DEFINITION.json、DPRO_FACTORY_STANDARD.json、REFERENCE_PRODUCT.jsonを最初に読む。",
      "4. 参考Repositoryがある場合は、その完成済み実装を確認して再利用し、証明された不具合がない機能を無条件に再実装しない。",
      "5. 不足仕様はDPRO標準と参考製品からChatGPT側で整理する。ユーザーへは、標準から安全に決められない業務判断だけを質問する。",
      "6. 標準製品開発中は実顧客tenant・実患者データ・Secret・本番bindingを作らない。",
      "7. 完成後はFACTORY FINAL Gate・QA・Return ZIPまで進める。",
      "",
      "最初にHANDOFF.txtを読み、その指示で作業を開始してください。",
      ""
    ].join("\n");
    const handoff=[
      "DPRO 新規標準製品開発 / FACTORY DEVELOPMENT HANDOFF",
      "",
      `新製品名: ${p.product_name||""}`,
      `SYSTEM CODE: ${p.target_system_code||""}`,
      `カテゴリ: ${p.category||""}`,
      `参考製品: ${ref.product_name||p.reference_product_system_code||""} (${p.reference_product_system_code||""})`,
      `参考Repository: ${ref.default_repository||""}`,
      `医療安全基準: ${p.medical_data?"必須":"通常"}`,
      "",
      "【開発指示】",
      "- このZIPを唯一の開発開始基準として扱う。",
      "- CONTROL CENTERから出力されたDPRO標準を優先する。",
      "- 参考製品のRepository・Feature実装・READY情報を確認し、使える完成済み部品を再利用する。",
      "- 参考製品との差分はPRODUCT_DEFINITION.jsonの目的・利用者・業務フロー・必須機能・対象外から設計する。",
      "- FACTORY_CHECKLIST.jsonは漏れ防止チェックとして使用するが、ユーザーに全項目の手入力を要求しない。",
      "- 設計上の不足はまずDPRO標準・参考製品・既存DPROパターンから解決し、それでも決まらない業務判断だけ質問する。",
      "- medical_data=trueの場合、送迎に不要な病名・検査結果・処方内容等を保持・表示しない。",
      "- 実顧客tenant、実Owner、実患者、Secret、本番LINE bindingは標準製品完成前に作らない。",
      "- MutationObserver等の補助UIは冪等実装にする。",
      "- 本制作後は横断QA → FINAL 4/4 → 製品台帳登録 → FINAL LOCK/Return ZIPの順で進める。",
      "",
      "【ユーザーへ確認する時】",
      "技術仕様ではなく、標準から決められない運用上の選択だけを、1つずつ分かりやすく確認する。",
      ""
    ].join("\n");
    const nextAction=[
      "NEXT ACTION",
      "",
      "1. このZIPをChatGPTの新しいチャットへアップロードする。",
      "2. 次の一文を送る:",
      "   このZIPを唯一の開発開始基準として、現在のDPRO標準と参考製品を読み、新システム制作を続けてください。",
      "3. ChatGPTがZIPと参考Repositoryを確認し、必要な差分設計・実装計画を作る。",
      "4. 不明な業務判断がある場合だけ、ChatGPTから質問を受ける。",
      "5. 制作開始後はCONTROL CENTERで制作中へ進め、完成時にFINAL Gateを実施する。",
      ""
    ].join("\n");
    return {
      "00_START_HERE.txt":startHere,
      "PACKAGE_INFO.json":pretty(packageInfo),
      "PRODUCT_DEFINITION.json":pretty(definition),
      "DPRO_FACTORY_STANDARD.json":pretty(standard),
      "REFERENCE_PRODUCT.json":pretty(reference),
      "FACTORY_CHECKLIST.json":pretty(checklist),
      "HANDOFF.txt":handoff,
      "NEXT_ACTION.txt":nextAction
    };
  }

  async function generatePackage(){
    const button=$("generateButton"); const old=button.textContent; button.disabled=true; button.textContent="最新基準を取得中…";
    try{
      const {data:packet,error:packetError}=await state.supabase.rpc("cc_product_dev_export_packet",{p_product_dev_id:state.productDevId});
      if(packetError) throw packetError;
      if(!packet?.factory_identity?.identity_match) throw new Error("FACTORY V2固定IDENTITYが一致しません。");
      const p=packet.product_development||{};
      if(p.status!=="prebuild") throw new Error("FACTORY開発ZIPはPREBUILD状態で生成してください。");
      const files=buildTextFiles(packet);
      const manifest=[];
      for(const [name,content] of Object.entries(files)) manifest.push(`${await sha256Bytes(content)}  ${name}`);
      files["MANIFEST_SHA256.txt"]=["DPRO FACTORY DEVELOPMENT PACKAGE MANIFEST",`Package Version: ${PACKAGE_VERSION}`,`Generated: ${new Date().toISOString()}`,"",...manifest,""].join("\n");
      const zip=new JSZip();
      for(const [name,content] of Object.entries(files)) zip.file(name,content,{binary:false});
      button.textContent="ZIPを生成中…";
      const blob=await zip.generateAsync({type:"blob",compression:"DEFLATE",compressionOptions:{level:6}});
      const zipSha=await sha256Blob(blob);
      button.textContent="管理センターへ記録中…";
      const {data:registration,error:regError}=await state.supabase.rpc("cc_product_dev_register_handoff",{
        p_product_dev_id:state.productDevId,
        p_package_sha256:zipSha,
        p_file_count:Object.keys(files).length,
        p_source_updated_at:p.updated_at,
        p_package_version:PACKAGE_VERSION
      });
      if(regError) throw regError;
      const filename=`DPRO_${cleanCode(p.target_system_code)}_FACTORY_DEV_START_R1_${localDateStamp()}.zip`;
      const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download=filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),1500);
      state.packet=packet; state.gate=registration?.gate||{};
      $("resultFilename").textContent=filename;
      $("resultSha").textContent=zipSha;
      $("resultFiles").textContent=`${Object.keys(files).length} files / ZIP直下`;
      $("resultGate").textContent=state.gate?.ready?"START READY / 登録済み":"登録済み（Gate確認要）";
      $("resultPanel").classList.remove("hidden");
      render();
      toast("FACTORY開発ZIPを生成し、管理センターへSHA256を記録しました。");
    }catch(error){ console.error(BUILD,error); toast(error?.message||"FACTORY開発ZIPを生成できませんでした。",true); }
    finally{ button.disabled=false; button.textContent=old; render(); }
  }

  window.addEventListener("DOMContentLoaded",boot,{once:true});
})();
