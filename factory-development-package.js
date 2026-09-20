(() => {
  "use strict";

  const BUILD = "DPRO-FACTORY-DEV-PACKAGE-R2-20260920";
  const PACKAGE_VERSION = "FACTORY-DEV-PACKAGE-R2";
  const CONFIG = window.DPRO_CONTROL_CENTER_CONFIG || {};
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const roleLabels = { owner_admin:"管理責任者", technical_admin:"技術管理者", support:"DPROサポート", read_only:"閲覧専用" };
  const state = { supabase:null, session:null, staff:null, productDevId:"", packet:null, gate:null };

  const FILE_DEFS = [
    ["00_START_HERE.txt","新しいChatGPTチャットで最初に読む開始指示。"],
    ["PACKAGE_INFO.json","開発コード・SYSTEM CODE・MASTER SHA・FACTORY固定IDENTITY。"],
    ["PRODUCT_DEFINITION.json","管理センターで登録した新製品定義。"],
    ["MASTER_STANDARD_SNAPSHOT.json","CORE / UX / INTEGRATION / LEARNING、由来、学習済みパターンを含む最新MASTER。"],
    ["DPRO_FACTORY_STANDARD.json","現行標準項目・Feature Catalog・依存関係・FACTORY固定ルール。"],
    ["REFERENCE_PRODUCT.json","参考製品の製品台帳・Repository・READY・実装Feature・業種テンプレート。"],
    ["FACTORY_CHECKLIST.json","FACTORY V2チェックリストと任意の詳細設計。"],
    ["STANDARD_LEARNING_RETURN_TEMPLATE.json","制作・ブラッシュアップで見つけた再利用可能な改善をCONTROL CENTERへ返すテンプレート。"],
    ["HANDOFF.txt","ChatGPTへ渡す開発指示・再利用・学習返却ルール。"],
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
      $("loadingText").textContent=`${BUILD} / MASTER STANDARDを確認中…`;
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
    $("reloadButton")?.addEventListener("click",async()=>{await loadLatest();toast("最新MASTERへ更新しました。");});
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
    const master=state.packet?.master_standard||{};
    const standards=Array.isArray(master?.standard_items)?master.standard_items:(Array.isArray(state.packet?.dpro_standard_items)?state.packet.dpro_standard_items:[]);
    const features=Array.isArray(master?.feature_catalog)?master.feature_catalog:(Array.isArray(state.packet?.dpro_feature_catalog)?state.packet.dpro_feature_catalog:[]);
    const patterns=Array.isArray(master?.promoted_learning_patterns)?master.promoted_learning_patterns:[];
    const refFeatures=Array.isArray(state.packet?.reference_feature_implementations)?state.packet.reference_feature_implementations:[];
    const current=Boolean(state.gate?.handoff_current);
    const exists=Boolean(state.gate?.handoff_exists);
    $("selfNav").href=`factory-development-package.html?productDev=${encodeURIComponent(state.productDevId)}`;
    $("factoryNav").href=`factory-v2.html?project=${encodeURIComponent(state.packet?.delivery_project?.id||"")}`;
    $("projectPanel").innerHTML=`<div class="package-summary"><div class="package-summary-main"><p class="eyebrow">${esc(p.dev_code||"")} / ${esc(p.target_system_code||"")}</p><h2>${esc(p.product_name||"DPRO新製品")}</h2><p>${esc(p.category||"")} / 参考製品 ${esc(ref.product_name||p.reference_product_system_code||"—")}</p></div><div class="package-summary-side"><strong>参考Repository</strong><span class="repo-code">${esc(ref.default_repository||"未登録")}</span><strong style="margin-top:10px">MASTER SHA</strong><span class="repo-code">${esc((master.master_standard_sha256||"未取得").slice(0,16))}…</span><strong style="margin-top:10px">現在ステージ</strong><span>${esc(p.status||"—")}</span></div></div>`;
    $("metrics").innerHTML=[
      [identity.identity_match?"PASS":"NG","FACTORY V2 IDENTITY",identity.identity_match?"V2.0 FINAL LOCK一致":"固定IDENTITY要確認"],
      [standards.length,"現行DPRO標準",`${patterns.length}学習パターン昇格済み`],
      [features.length,"Feature Catalog",`${refFeatures.length}件を参考製品で確認`],
      [current?"READY":(exists?"STALE":"WAIT"),"開発ZIP",current?"製品定義＋MASTER一致":(exists?"MASTER/定義更新後の再生成が必要":"まだ未生成")]
    ].map(([v,l,n])=>`<article><b>${esc(v)}</b><span>${esc(l)}</span><small>${esc(n)}</small></article>`).join("");
    $("fileList").innerHTML=FILE_DEFS.map(([name,desc])=>`<div class="file-row"><strong>${esc(name)}</strong><span>${esc(desc)}</span></div>`).join("");
    $("fileCountBadge").textContent=`${FILE_DEFS.length} files / ZIP直下`;
    const statusOk=p.status==="prebuild";
    const identityOk=Boolean(identity.identity_match);
    const masterOk=/^[0-9a-f]{64}$/i.test(String(master.master_standard_sha256||""));
    const canGenerate=statusOk&&identityOk&&masterOk;
    $("generateButton").disabled=!canGenerate;
    $("actionNote").textContent=!statusOk?`現在ステージは「${p.status||"不明"}」です。新規製品開発画面でPREBUILDへ進んでから生成してください。`:(!identityOk?"FACTORY V2固定IDENTITYが一致しないため生成を停止しています。":(!masterOk?"MASTER STANDARD SHAを取得できないため生成を停止しています。":"生成時に最新MASTERを再取得し、各ファイルSHA256とZIP全体SHA256を計算して管理センターへ記録します。"));
  }

  function buildTextFiles(packet){
    const p=packet.product_development||{};
    const ref=packet.reference_product||{};
    const master=packet.master_standard||{};
    const generatedAt=new Date().toISOString();
    const packageInfo={
      package_version:PACKAGE_VERSION,
      schema_version:packet.schema_version,
      generated_at:generatedAt,
      source_generated_at:packet.generated_at,
      master_standard_sha256:master.master_standard_sha256,
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
      master_standard_sha256:master.master_standard_sha256,
      factory_identity:packet.factory_identity,
      factory_rules:packet.factory_rules,
      current_standard_items:master.standard_items||packet.dpro_standard_items||[],
      feature_catalog:master.feature_catalog||packet.dpro_feature_catalog||[],
      feature_dependencies:master.feature_dependencies||packet.dpro_feature_dependencies||[],
      standard_provenance:master.provenance||[],
      promoted_learning_patterns:master.promoted_learning_patterns||[]
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
      note:"Detailed PREBUILD entry is optional on the new-product route. Resolve design from MASTER STANDARD + reference product first, and ask the user only for unresolved business decisions."
    };
    const learningTemplate={
      schema_version:"DPRO-STANDARD-LEARNING-RETURN-V1",
      source_product:{dev_code:p.dev_code,product_name:p.product_name,target_system_code:p.target_system_code,master_standard_sha256:master.master_standard_sha256},
      instructions:[
        "At brushup/final, add only improvements that are reusable across multiple DPRO products.",
        "Do not include customer/patient personal data, credentials, secrets, or one-off tenant settings.",
        "Each candidate should explain origin, reason, applicability and proposed standard items.",
        "CONTROL CENTER will import candidates for review; approval/promotion changes the MASTER SHA and future FACTORY ZIPs."
      ],
      candidate_schema:{
        candidate_code:"UPPER_SNAKE_OR_DASH_CODE",
        title:"Reusable pattern title",
        layer:"core | ux | integration | feature | industry | safety | qa | learning",
        source_system_code:p.target_system_code,
        source_kind:"brushup | reference | external_reference | qa | internal | customer_need",
        source_version:"optional version/lock",
        source_reference:"file/step/evidence reference",
        summary:"What should become reusable DPRO knowledge",
        rationale:"Why it should be standardized",
        applicability_rule:"Which products/features should receive it",
        proposed_items:[{
          item_code:"NEW_MASTER_ITEM_CODE",
          category:"UX / Example",
          item_name:"Standard name",
          description:"Concrete standard requirement",
          requirement_type:"required | conditional | recommended",
          condition_feature_code:"optional feature code",
          is_blocking_delivery:false,
          sort_order:900
        }]
      },
      candidates:[]
    };
    const startHere=[
      "DPRO FACTORY DEVELOPMENT START ZIP / R2",
      "",
      `製品: ${p.product_name||""}`,
      `SYSTEM CODE: ${p.target_system_code||""}`,
      `開発コード: ${p.dev_code||""}`,
      `MASTER STANDARD SHA256: ${master.master_standard_sha256||""}`,
      `参考製品: ${ref.product_name||p.reference_product_system_code||""} (${p.reference_product_system_code||""})`,
      `参考Repository: ${ref.default_repository||"未登録"}`,
      `FACTORY: ${p.factory_version||""} FINAL LOCK`,
      "",
      "【このZIPの使い方】",
      "1. このZIPを新しいChatGPTチャットへ1個アップロードする。",
      "2. 過去チャットの説明やリンクの再共有は不要。このZIPを唯一の開発開始基準として扱う。",
      "3. ChatGPTはMASTER_STANDARD_SNAPSHOT.json、PRODUCT_DEFINITION.json、REFERENCE_PRODUCT.jsonを最初に読む。",
      "4. MASTER STANDARDのCORE / UX / INTEGRATION / LEARNINGを製品へ適用し、Feature条件付き項目は製品Featureに応じて採用する。",
      "5. 参考Repositoryがある場合は完成済み実装を確認・再利用し、証明された不具合がない機能を無条件に再実装しない。",
      "6. 技術仕様はMASTERと参考製品から解決し、ユーザーへは標準から決められない業務判断だけを質問する。",
      "7. 標準製品開発中は実顧客tenant・実患者データ・Secret・本番bindingを作らない。",
      "8. 再利用可能な新しい改善を得た場合はSTANDARD_LEARNING_RETURN_TEMPLATE.jsonを基に学習候補を返す。",
      "9. 完成後は横断QA → FACTORY FINAL → 製品台帳 → Return ZIPまで進める。",
      "",
      "最初にHANDOFF.txtを読み、その指示で作業を開始してください。",
      ""
    ].join("\n");
    const handoff=[
      "DPRO 新規標準製品開発 / FACTORY DEVELOPMENT HANDOFF R2",
      "",
      `新製品名: ${p.product_name||""}`,
      `SYSTEM CODE: ${p.target_system_code||""}`,
      `カテゴリ: ${p.category||""}`,
      `MASTER STANDARD SHA256: ${master.master_standard_sha256||""}`,
      `参考製品: ${ref.product_name||p.reference_product_system_code||""} (${p.reference_product_system_code||""})`,
      `参考Repository: ${ref.default_repository||""}`,
      `医療安全基準: ${p.medical_data?"必須":"通常"}`,
      "",
      "【開発指示】",
      "- このZIPを唯一の開発開始基準として扱う。",
      "- CONTROL CENTER MASTER STANDARDを最優先する。",
      "- 基本構造はWebsite + Official LINE + DPRO。Website + DPRO / LINE + DPROでもDPRO中核が成立するよう疎結合にする。",
      "- CONTACTは標準能力。WEB/LINE/Instagram等、有効なチャネルは同じCONTACTドメインへ収束させる。",
      "- Owner設定対象では左インデックス＋右パネル、ON/OFFはスイッチ式、Feature依存を明示する。",
      "- reservation対象ではMASTERのReservation UX V2を参照する。",
      "- 参考製品のRepository・Feature実装・READY情報を確認し、使える完成済み部品を再利用する。",
      "- FACTORY_CHECKLISTは漏れ防止に使うが、ユーザーへ全項目の手入力を要求しない。",
      "- medical_data=trueの場合、業務に不要な病名・検査結果・処方内容等を保持・表示しない。",
      "- 実顧客tenant、実Owner、実患者、Secret、本番チャネルbindingは標準製品完成前に作らない。",
      "- 本制作後は横断QA → FINAL 4/4 → 製品台帳登録 → FINAL LOCK/Return ZIPの順で進める。",
      "",
      "【MASTERへの学習返却】",
      "- 今回の制作/QA/ブラッシュアップで他DPROにも有効な改善を発見した場合、STANDARD_LEARNING_RETURN_TEMPLATE.jsonへ候補を記入する。",
      "- 特定顧客だけの要望はMASTERへ昇格させない。",
      "- CONTROL CENTERでレビュー・承認・昇格後、MASTER SHAが更新され、以後のFACTORY ZIPへ自動収録される。",
      ""
    ].join("\n");
    const nextAction=[
      "NEXT ACTION",
      "",
      "1. このZIPをChatGPTの新しいチャットへアップロードする。",
      "2. 次の一文を送る:",
      "   このZIPを唯一の開発開始基準として、MASTER STANDARDと参考製品を読み、新システム制作を続けてください。",
      "3. ChatGPTがMASTER、製品定義、参考Repositoryを確認し、差分設計・実装計画を作る。",
      "4. 標準から決められない業務判断だけ、ユーザーへ1つずつ確認する。",
      "5. ブラッシュアップで再利用可能な改善が出たらSTANDARD_LEARNING_RETURN.jsonとしてCONTROL CENTERへ返す。",
      "6. 制作開始後はCONTROL CENTERで制作中へ進め、完成時にFINAL Gateを実施する。",
      ""
    ].join("\n");
    return {
      "00_START_HERE.txt":startHere,
      "PACKAGE_INFO.json":pretty(packageInfo),
      "PRODUCT_DEFINITION.json":pretty(definition),
      "MASTER_STANDARD_SNAPSHOT.json":pretty(master),
      "DPRO_FACTORY_STANDARD.json":pretty(standard),
      "REFERENCE_PRODUCT.json":pretty(reference),
      "FACTORY_CHECKLIST.json":pretty(checklist),
      "STANDARD_LEARNING_RETURN_TEMPLATE.json":pretty(learningTemplate),
      "HANDOFF.txt":handoff,
      "NEXT_ACTION.txt":nextAction
    };
  }

  async function generatePackage(){
    const button=$("generateButton"); const old=button.textContent; button.disabled=true; button.textContent="最新MASTERを取得中…";
    try{
      const {data:packet,error:packetError}=await state.supabase.rpc("cc_product_dev_export_packet",{p_product_dev_id:state.productDevId});
      if(packetError) throw packetError;
      if(packet?.schema_version!=="DPRO-FACTORY-DEV-EXPORT-R2") throw new Error("DB側のFACTORY開発ZIP R2が未反映です。R4 SQLを確認してください。");
      if(!packet?.factory_identity?.identity_match) throw new Error("FACTORY V2固定IDENTITYが一致しません。");
      const p=packet.product_development||{};
      const masterSha=String(packet?.master_standard?.master_standard_sha256||"");
      if(!/^[0-9a-f]{64}$/i.test(masterSha)) throw new Error("MASTER STANDARD SHAを取得できません。");
      if(p.status!=="prebuild") throw new Error("FACTORY開発ZIPはPREBUILD状態で生成してください。");
      const files=buildTextFiles(packet);
      const manifest=[];
      for(const [name,content] of Object.entries(files)) manifest.push(`${await sha256Bytes(content)}  ${name}`);
      files["MANIFEST_SHA256.txt"]=["DPRO FACTORY DEVELOPMENT PACKAGE MANIFEST",`Package Version: ${PACKAGE_VERSION}`,`Master Standard SHA256: ${masterSha}`,`Generated: ${new Date().toISOString()}`,"",...manifest,""].join("\n");
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
      const filename=`DPRO_${cleanCode(p.target_system_code)}_FACTORY_DEV_START_R2_${localDateStamp()}.zip`;
      const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download=filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),1500);
      state.packet=packet; state.gate=registration?.gate||{};
      $("resultFilename").textContent=filename;
      $("resultSha").textContent=zipSha;
      $("resultFiles").textContent=`${Object.keys(files).length} files / ZIP直下`;
      $("resultGate").textContent=state.gate?.ready?"START READY / MASTER一致":"登録済み（Gate確認要）";
      $("resultPanel").classList.remove("hidden");
      render();
      toast("最新MASTERを含むFACTORY開発ZIP R2を生成し、SHA256を記録しました。");
    }catch(error){ console.error(BUILD,error); toast(error?.message||"FACTORY開発ZIPを生成できませんでした。",true); }
    finally{ button.disabled=false; button.textContent=old; render(); }
  }

  window.addEventListener("DOMContentLoaded",boot,{once:true});
})();
