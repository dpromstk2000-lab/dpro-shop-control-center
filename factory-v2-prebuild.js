(() => {
  "use strict";

  const BUILD = "DPRO-FACTORY-V2-PREBUILD-SPEC-R2-20260919";
  const CONFIG = window.DPRO_CONTROL_CENTER_CONFIG || {};
  const $ = (id) => document.getElementById(id);
  const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

  const state = {
    supabase: null,
    session: null,
    staff: null,
    projectId: "",
    packet: null,
    products: [],
  };

  const roleLabels = { owner_admin:"管理責任者", technical_admin:"技術管理者", support:"DPROサポート", read_only:"閲覧専用" };
  const statusLabels = { pending:"未確認", pass:"PASS", na:"N/A", action_required:"要対応" };
  const statusTones = { pending:"", pass:"green", na:"blue", action_required:"amber" };

  const defs = [
    {
      code:"industry_applicability", number:2, title:"業種適用性・既存製品との差分",
      purpose:"参考製品をそのままコピーせず、再利用する範囲・新しく作る差分・対象外を確定します。ここが完成すると『何を作る製品か』が固定されます。",
      fields:[
        {key:"applicability_mode",label:"適用方式 *",type:"select",options:[["","選択してください"],["reuse_standard","既存標準をほぼそのまま再利用"],["adapt_reference","参考製品を基準に業種差分を追加"],["specialized_new","共通部品だけ再利用し専用仕様を新設"]]},
        {key:"required_features",label:"標準で必須にする機能 *",type:"textarea",full:true,help:"この製品を販売するとき必ず含める機能。"},
        {key:"optional_features",label:"任意・契約で追加する機能",type:"textarea",full:true},
        {key:"excluded_features",label:"明確に対象外にする機能 *",type:"textarea",full:true},
        {key:"difference_summary",label:"参考製品から変える点 *",type:"textarea",full:true,help:"画面・データ・権限・業務フローの差分を具体化。"},
        {key:"acceptance_scope",label:"このPREBUILDで固定する完成範囲 *",type:"textarea",full:true}
      ]
    },
    {
      code:"owner_settings_surface", number:3, title:"Owner設定・変更できる範囲",
      purpose:"Ownerが自分で変更できるものと、DPRO側で固定するものを分離します。設定事故と『何でも変更できる』状態を防ぎます。",
      fields:[
        {key:"owner_settings_mode",label:"設定方式 *",type:"select",options:[["","選択してください"],["owner_ui","Owner設定画面を用意する"],["central_only","管理センター/DPRO側だけで変更"],["none","製品上のOwner設定は設けない"]]},
        {key:"owner_editable",label:"Ownerが変更できる項目（Owner画面の場合）",type:"textarea",full:true},
        {key:"owner_locked",label:"Ownerが変更できない固定項目 *",type:"textarea",full:true},
        {key:"safe_defaults",label:"初期値・安全なデフォルト *",type:"textarea",full:true},
        {key:"validation_rules",label:"入力制約・変更時チェック（Owner画面の場合）",type:"textarea",full:true},
        {key:"decision_reason",label:"Owner画面を作らない場合の理由",type:"textarea",full:true}
      ]
    },
    {
      code:"setup_readiness_surface", number:4, title:"初期設定・利用開始条件",
      purpose:"何が揃ったら『使い始めてよい』のか、誰がどこで確認するのかを固定します。導入時の設定漏れを防ぎます。",
      fields:[
        {key:"readiness_surface",label:"利用開始判定を行う場所 *",type:"select",options:[["","選択してください"],["owner_settings","Owner設定画面"],["ready_center","READY / System Check"],["central_onboarding","管理センター Onboarding"],["combined","複数画面で役割分担"]]},
        {key:"blocking_requirements",label:"揃うまで本番開始を止める条件 *",type:"textarea",full:true},
        {key:"responsible_role",label:"確認責任者 *",type:"input"},
        {key:"completion_signal",label:"完了と判断する状態 / シグナル *",type:"textarea",full:true},
        {key:"demo_prepare_policy",label:"営業前System Check・demo_prepare方針 *",type:"textarea",full:true}
      ]
    },
    {
      code:"booking_schedule_boundary", number:5, title:"予約と予定・時間ルール",
      purpose:"『予約』と『運行予定』を混同しないよう、受付単位・時間・変更取消・往復・診療予約連携を仕様化します。",
      fields:[
        {key:"schedule_mode",label:"受付・予定方式 *",type:"select",options:[["","選択してください"],["fixed_slots","固定時間枠の予約"],["request_window","希望時間帯を受付し後で確定"],["schedule_only","予約ではなく予定管理のみ"],["hybrid","固定枠＋希望時間帯の併用"]]},
        {key:"slot_minutes",label:"固定枠の分数（該当時）",type:"input",placeholder:"例：30"},
        {key:"window_definition",label:"希望時間帯の定義（該当時）",type:"input",placeholder:"例：30分幅 / 午前・午後 / 任意時刻"},
        {key:"appointment_linkage",label:"診療予約との連携 *",type:"select",options:[["","選択してください"],["none","連携しない"],["optional","任意に関連付ける"],["required","必須で関連付ける"]]},
        {key:"direction_model",label:"送迎方向 *",type:"select",options:[["","選択してください"],["one_way","片道のみ"],["round_trip","往復のみ"],["both","片道・往復・帰りのみを扱う"]]},
        {key:"change_cancel_rule",label:"変更・取消・締切ルール *",type:"textarea",full:true},
        {key:"past_datetime_guard",label:"過去日時・当日操作のガード *",type:"textarea",full:true},
        {key:"collision_policy",label:"車両 / ドライバー / 時間重複の扱い *",type:"textarea",full:true}
      ]
    },
    {
      code:"lifecycle_resource", number:6, title:"スタッフ・車両・Resource運用",
      purpose:"スタッフや車両などの運用資源をどう登録・停止・割当・履歴保持するかを確定します。",
      fields:[
        {key:"resource_model",label:"Resourceモデル *",type:"select",options:[["","選択してください"],["none","Resource管理なし"],["staff_only","スタッフのみ"],["staff_vehicle","スタッフ＋車両"],["multi_resource","複数Resource（車両・スタッフ・設備等）"]]},
        {key:"resource_types",label:"管理するResource種類（該当時）",type:"textarea",full:true},
        {key:"status_model",label:"稼働 / 停止 / 休止などの状態 *（Resourceありの場合）",type:"textarea",full:true},
        {key:"assignment_conflict",label:"同時間帯の重複割当ガード *（Resourceありの場合）",type:"textarea",full:true},
        {key:"disable_guard",label:"使用中Resourceを停止する際のガード *（Resourceありの場合）",type:"textarea",full:true},
        {key:"history_policy",label:"履歴保持・削除方針 *（Resourceありの場合）",type:"textarea",full:true},
        {key:"decision_reason",label:"Resource管理なしの場合の理由",type:"textarea",full:true}
      ]
    },
    {
      code:"subject_crm", number:7, title:"顧客・対象者・CRM・データ境界",
      purpose:"誰をCustomer/Subjectとして持ち、どの個人情報だけを保存し、誰が見られるかを固定します。医療系では特に重要です。",
      fields:[
        {key:"subject_model",label:"データモデル *",type:"select",options:[["","選択してください"],["customer_only","Customerだけ"],["customer_subject","Customer＋対象者(Subject)"],["member_target","会員/家族＋対象者(Target)"]]},
        {key:"primary_subject_label",label:"主対象者の呼称 *",type:"input",placeholder:"例：患者"},
        {key:"minimum_fields",label:"保存する最小項目 *",type:"textarea",full:true},
        {key:"sensitive_fields_excluded",label:"保存しない / 通常画面に出さない情報 *",type:"textarea",full:true},
        {key:"access_roles",label:"閲覧・編集できる役割 *",type:"textarea",full:true},
        {key:"duplicate_policy",label:"重複判定・本人特定ルール *",type:"textarea",full:true},
        {key:"history_retention",label:"履歴・保持・削除方針 *",type:"textarea",full:true},
        {key:"medical_data_boundary",label:"医療・健康情報との境界（医療系は必須）",type:"textarea",full:true}
      ]
    },
    {
      code:"csv_migration", number:8, title:"CSV・既存台帳移行",
      purpose:"標準製品として移行機能が必要かを決め、必要な場合も既存データを壊さない照合・重複・Rollback規則を先に固定します。",
      fields:[
        {key:"migration_needed",label:"CSV / 既存台帳移行 *",type:"select",options:[["","選択してください"],["yes","標準で移行機能を用意する"],["no","標準製品では不要"]]},
        {key:"decision_reason",label:"不要の場合の理由",type:"textarea",full:true},
        {key:"source_format",label:"想定する入力形式（必要時）",type:"input",placeholder:"例：CSV UTF-8 / ExcelからCSV"},
        {key:"match_keys",label:"既存データとの照合キー（必要時）",type:"textarea",full:true},
        {key:"duplicate_policy",label:"曖昧・重複時の扱い（必要時）",type:"textarea",full:true},
        {key:"overwrite_policy",label:"既存データ上書き方針（必要時）",type:"textarea",full:true},
        {key:"rollback_plan",label:"取込前バックアップ / Rollback（必要時）",type:"textarea",full:true},
        {key:"line_user_id_policy",label:"LINE User IDの扱い *",type:"textarea",full:true,placeholder:"例：CSV値を権威情報として自動紐付けしない"}
      ]
    },
    {
      code:"line_modules", number:9, title:"LINE連携・通知・本人紐付け",
      purpose:"LINEを必須/任意/未使用のどれにするか、本人紐付け・再紐付け・通知内容・LINEなし時の代替を固定します。",
      fields:[
        {key:"line_mode",label:"LINEの位置づけ *",type:"select",options:[["","選択してください"],["required","標準で必須"],["optional","任意連携"],["not_used","LINEを使わない"]]},
        {key:"linking_method",label:"本人 / 顧客との紐付け方法（LINE使用時）",type:"textarea",full:true},
        {key:"relink_policy",label:"再紐付け手順（LINE使用時）",type:"textarea",full:true},
        {key:"takeover_policy",label:"他顧客takeover防止（LINE使用時）",type:"textarea",full:true},
        {key:"notification_scope",label:"LINEで送る通知範囲（LINE使用時）",type:"textarea",full:true},
        {key:"sensitive_content_policy",label:"通知へ載せない機微情報（LINE使用時）",type:"textarea",full:true},
        {key:"fallback_without_line",label:"LINEが無い / 使えない場合の代替 *",type:"textarea",full:true},
        {key:"no_line_reason",label:"LINE未使用の場合の理由",type:"textarea",full:true}
      ]
    },
    {
      code:"existing_site", number:10, title:"HP・公開入口・White-label",
      purpose:"フルDPROサイト、既存HP連携、埋込、API等の公開形態を決めます。外部HPの都合で製品本体が未完成にならない境界も固定します。",
      fields:[
        {key:"delivery_pattern",label:"標準の公開構成 *",type:"select",options:[["","選択してください"],["full_dpro","DPRO標準サイト＋システム"],["existing_site_link","既存HPからDPROへリンク"],["api_embed","既存HPへ埋込 / API連携"],["headless","システム/API中心"],["dual","DPROサイトと既存HP連携の両対応"]]},
        {key:"public_entry",label:"患者 / 顧客が入る入口 *",type:"textarea",full:true},
        {key:"white_label_policy",label:"DPRO表記 / White-label方針 *",type:"textarea",full:true},
        {key:"external_dependency_policy",label:"外部HP・ドメイン・第三者サービスへの依存方針 *",type:"textarea",full:true},
        {key:"core_independence",label:"外部連携なしでも製品本体が成立する条件 *",type:"textarea",full:true},
        {key:"demo_product_page",label:"DEMO / 製品ページの標準方針 *",type:"textarea",full:true}
      ]
    }
  ];

  function showOnly(id){ ["loadingScreen","authScreen","errorScreen","app"].forEach(x=>$(x)?.classList.toggle("hidden",x!==id)); }
  function toast(message,error=false){ const el=$("toast"); el.textContent=message; el.className=`toast${error?" error":""}`; el.classList.remove("hidden"); clearTimeout(toast.timer); toast.timer=setTimeout(()=>el.classList.add("hidden"),4200); }
  function pill(text,tone=""){ return `<span class="pill ${tone}">${esc(text)}</span>`; }
  function itemMap(){ return new Map((state.packet?.items||[]).map(x=>[x.item_code,x])); }
  function specMap(){ return new Map((state.packet?.specs||[]).map(x=>[x.item_code,x])); }
  function productDev(){ return state.packet?.product_development || {}; }
  function productNameByCode(code){ return state.products.find(p=>String(p.system_code||"").toUpperCase()===String(code||"").toUpperCase())?.product_name || code || "—"; }

  async function loadProducts(){
    try{
      const base=String(CONFIG.apiBaseUrl||"").replace(/\/$/,"");
      const res=await fetch(`${base}/api/products/overview`,{cache:"no-store",headers:{authorization:`Bearer ${state.session?.access_token||""}`}});
      if(!res.ok) return [];
      const data=await res.json().catch(()=>({}));
      return Array.isArray(data.products)?data.products:[];
    }catch{return [];}
  }

  async function boot(){
    try{
      state.projectId=new URLSearchParams(location.search).get("project")||"";
      if(!state.projectId) throw new Error("制作Projectが指定されていません。新規製品開発画面から開いてください。");
      $("loadingText").textContent=`${BUILD} / 接続確認中…`;
      const base=String(CONFIG.apiBaseUrl||"").replace(/\/$/,"");
      if(!base) throw new Error("CONTROL CENTER API設定がありません。");
      const res=await fetch(`${base}/api/public-config`,{cache:"no-store"});
      const pub=await res.json().catch(()=>({}));
      if(!res.ok) throw new Error(pub?.error||"公開設定を取得できませんでした。");
      if(!window.supabase?.createClient) throw new Error("Supabase接続ライブラリを読み込めませんでした。");
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
      await loadPacket();
      state.products=await loadProducts();
      render();
      showOnly("app");
    }catch(error){console.error(BUILD,error);$("errorText").textContent=error?.message||"PREBUILD設計を読み込めませんでした。";showOnly("errorScreen");}
  }

  function bind(){
    $("retryButton")?.addEventListener("click",()=>location.reload());
    $("reloadButton")?.addEventListener("click",async()=>{await loadPacket();render();toast("最新情報へ更新しました。");});
    $("copySpecButton")?.addEventListener("click",copyFullSpec);
    $("menuButton")?.addEventListener("click",()=>$("sidebar").classList.toggle("open"));
  }

  async function loadPacket(){
    const {data,error}=await state.supabase.rpc("cc_factory_v2_prebuild_get",{p_project_id:state.projectId});
    if(error) throw error;
    state.packet=data;
    const q=encodeURIComponent(state.projectId);
    $("selfNav").href=`factory-v2-prebuild.html?project=${q}`;
    $("factoryNav").href=`factory-v2.html?project=${q}`;
    $("auditLink").href=`factory-v2.html?project=${q}`;
  }

  function render(){
    renderIdentity();
    renderProject();
    renderMetrics();
    renderBaseline();
    renderSpecs();
  }

  function renderIdentity(){
    const a=state.packet?.audit||{};
    const ok=Boolean(a.identity_match);
    $("identityBanner").className=`identity-banner ${ok?"pass":"fail"}`;
    $("identityBanner").innerHTML=`
      ${pill(ok?"IDENTITY PASS":"IDENTITY MISMATCH",ok?"green":"red")}
      <div><strong>${ok?"FACTORY V2.0 FINAL LOCK基準を自動確認済み":"固定IDENTITYが一致していません"}</strong>
      <code>Version ${esc(a.factory_version||"—")} / Package ${esc(a.factory_package_sha256||"—")} / Lock ${esc(a.factory_lock_record_sha256||"—")}</code></div>`;
  }

  function renderProject(){
    const p=state.packet?.project||{}; const d=productDev();
    $("projectSummary").innerHTML=`
      <div><p class="eyebrow">${esc(d.dev_code||p.project_code||"")}</p><h2>${esc(d.product_name||p.project_name||"DPRO製品")}</h2><p>${esc(d.category||"")} / SYSTEM CODE ${esc(d.target_system_code||"—")}</p></div>
      <div class="summary-meta">
        <span><strong>参考製品：</strong>${esc(productNameByCode(d.reference_product_system_code))}（${esc(d.reference_product_system_code||"—")}）</span>
        <span><strong>制作Project：</strong>${esc(p.project_code||"—")}</span>
        <span><strong>主な利用者：</strong>${esc(d.target_users||"—")}</span>
        <span><strong>医療安全：</strong>${d.medical_data?"必須":"通常基準"}</span>
      </div>`;
  }

  function renderMetrics(){
    const g=state.packet?.gate||{}; const specs=state.packet?.specs||[];
    const complete=specs.filter(x=>x.is_complete).length;
    $("metricGrid").innerHTML=[
      [`${Number(g.prebuild_done||0)}/${Number(g.prebuild_total||10)}`,"PREBUILD","完成仕様＋自動確認"],
      [`${complete}/9`,"構造化仕様","設計項目の完成"],
      [Number(g.action_required||0),"ACTION REQUIRED","解決が必要"],
      [g.prebuild_ready?"READY":"BLOCK", "制作開始", g.prebuild_ready?"Gate通過":"まだ開始不可"]
    ].map(([v,l,n])=>`<article><b>${esc(v)}</b><span>${esc(l)}</span><small>${esc(n)}</small></article>`).join("");
  }

  function renderBaseline(){
    const item=itemMap().get("factory_baseline")||{};
    $("baselineCard").innerHTML=`
      <div class="spec-card-head"><div class="spec-title-wrap"><span class="step-number">1</span><div><h2>FACTORY V2.0固定基準</h2><p class="detail">これは人が文章を入力してPASSにする項目ではありません。DBがVersion / Package SHA / FINAL LOCK SHAを照合します。</p></div></div>
      <div class="status-stack">${pill(statusLabels[item.status]||item.status,statusTones[item.status]||"")}<span class="auto-label">AUTO</span></div></div>
      <div class="reference-box"><strong>自動Evidence</strong><p>${esc(item.evidence||"IDENTITY照合待ち")}</p></div>`;
  }

  function defaultsFor(code){
    const d=productDev();
    const base={decision_state:"ready",action_required_reason:""};
    if(code==="industry_applicability") return {...base,applicability_mode:"adapt_reference",required_features:d.must_have_features||"",optional_features:"",excluded_features:d.out_of_scope||"",difference_summary:"",acceptance_scope:`${d.product_name||"新製品"}として、参考製品の共通部品を再利用しながら業種固有差分を確定する。`};
    if(code==="subject_crm") return {...base,subject_model:"",primary_subject_label:d.medical_data?"患者":"",minimum_fields:"",sensitive_fields_excluded:d.out_of_scope||"",access_roles:d.target_users||"",duplicate_policy:"",history_retention:"",medical_data_boundary:d.medical_data?d.data_handling_notes||"":""};
    if(code==="line_modules") return {...base,line_mode:"",linking_method:"",relink_policy:"",takeover_policy:"表示名だけで自動紐付けしない。他顧客へのtakeoverは禁止し、本人確認を伴う明示的な再紐付けだけ許可する。",notification_scope:d.must_have_features||"",sensitive_content_policy:d.medical_data?"診療内容・病名・検査結果・処方内容などの医療情報を通知本文へ含めない。":"",fallback_without_line:"",no_line_reason:""};
    if(code==="csv_migration") return {...base,migration_needed:"",decision_reason:"",source_format:"",match_keys:"",duplicate_policy:"曖昧一致・重複は自動確定せず要確認へ回す。",overwrite_policy:"既存顧客を自動上書きしない。",rollback_plan:"",line_user_id_policy:"LINE User IDはCSV値を権威情報として自動紐付けしない。"};
    return base;
  }

  function renderSpecs(){
    const items=itemMap(); const specs=specMap();
    $("specBoard").innerHTML=defs.map(def=>{
      const item=items.get(def.code)||{}; const stored=specs.get(def.code); const values={...defaultsFor(def.code),...(stored?.spec_json||{})};
      const missing=Array.isArray(stored?.validation_missing)?stored.validation_missing:[];
      const fields=def.fields.map(f=>fieldHtml(def.code,f,values[f.key]??"")).join("");
      const status=item.status||"pending";
      const validation=stored ? (stored.decision_state==="action_required" ? `<div class="validation-box warning">要対応として保存済み：${esc(stored.summary||values.action_required_reason||"")}</div>` : stored.is_complete ? `<div class="validation-box success">DB検証PASS：${esc(stored.summary||"")}</div>` : `<div class="validation-box warning">下書き保存済み。未入力：${esc(missing.join(" / ")||"必須項目を確認してください")}</div>`) : `<div class="validation-box">まだ仕様は保存されていません。項目を決めて保存すると、DBがPASS条件を判定します。</div>`;
      return `<section class="spec-card" data-spec-card="${esc(def.code)}">
        <div class="spec-card-head"><div class="spec-title-wrap"><span class="step-number">${def.number}</span><div><h2>${esc(def.title)}</h2><p class="detail">${esc(def.purpose)}</p></div></div><div class="status-stack">${pill(statusLabels[status]||status,statusTones[status]||"")}${stored?.is_complete?'<span class="auto-label">SPEC VALIDATED</span>':''}</div></div>
        ${contextHtml(def.code)}
        <div class="form-grid">${fields}</div>
        <div class="decision-row">
          <label class="field"><span>判断状態 *</span><select data-key="decision_state"><option value="ready" ${values.decision_state!=="action_required"?"selected":""}>仕様を確定する</option><option value="action_required" ${values.decision_state==="action_required"?"selected":""}>要対応として止める</option></select></label>
          <label class="field action-reason ${values.decision_state==="action_required"?"":"hidden-row"}"><span>要対応の内容 *</span><textarea data-key="action_required_reason" placeholder="不足情報・確認待ち・解決が必要な内容">${esc(values.action_required_reason||"")}</textarea></label>
        </div>
        ${validation}
        <div class="spec-actions"><button class="btn secondary" type="button" data-copy-item="${esc(def.code)}">ChatGPT確認用をコピー</button><button class="btn primary" type="button" data-save-item="${esc(def.code)}">仕様を保存してGate判定</button></div>
      </section>`;
    }).join("");

    $$('[data-key="decision_state"]',$("specBoard")).forEach(sel=>sel.addEventListener("change",()=>{
      const card=sel.closest("[data-spec-card]"); const row=card.querySelector(".action-reason"); row.classList.toggle("hidden-row",sel.value!=="action_required");
    }));
    $$('[data-save-item]').forEach(b=>b.addEventListener("click",()=>saveItem(b.dataset.saveItem,b)));
    $$('[data-copy-item]').forEach(b=>b.addEventListener("click",()=>copyItem(b.dataset.copyItem)));
  }

  function contextHtml(code){
    const d=productDev();
    if(code==="industry_applicability") return `<div class="spec-context"><strong>参照する既存製品：</strong>${esc(productNameByCode(d.reference_product_system_code))}（${esc(d.reference_product_system_code||"—")}）<br><strong>新製品定義の必須機能：</strong>${esc(d.must_have_features||"—")}</div>`;
    if(code==="booking_schedule_boundary") return `<div class="spec-context"><strong>製品定義の中心フロー：</strong>${esc(d.core_workflow||"—")}</div>`;
    if(code==="subject_crm") return `<div class="spec-context"><strong>登録済み安全方針：</strong>${esc(d.data_handling_notes||"—")}${d.medical_data?" / 医療安全基準必須":""}</div>`;
    if(code==="line_modules") return `<div class="spec-context"><strong>製品定義：</strong>${esc(d.must_have_features||"—")}</div>`;
    return "";
  }

  function fieldHtml(code,f,value){
    const full=f.full?" full":""; const help=f.help?`<small>${esc(f.help)}</small>`:""; const ph=f.placeholder?` placeholder="${esc(f.placeholder)}"`:"";
    if(f.type==="select") return `<label class="field${full}"><span>${esc(f.label)}</span><select data-key="${esc(f.key)}">${f.options.map(([v,l])=>`<option value="${esc(v)}" ${String(value)===String(v)?"selected":""}>${esc(l)}</option>`).join("")}</select>${help}</label>`;
    if(f.type==="textarea") return `<label class="field${full}"><span>${esc(f.label)}</span><textarea data-key="${esc(f.key)}"${ph}>${esc(value)}</textarea>${help}</label>`;
    return `<label class="field${full}"><span>${esc(f.label)}</span><input data-key="${esc(f.key)}" value="${esc(value)}"${ph}>${help}</label>`;
  }

  function collectSpec(code){
    const card=document.querySelector(`[data-spec-card="${CSS.escape(code)}"]`); const spec={};
    $$('[data-key]',card).forEach(el=>{spec[el.dataset.key]=String(el.value??"").trim();});
    return spec;
  }

  async function saveItem(code,button){
    const old=button.textContent; button.disabled=true; button.textContent="DB検証中…";
    try{
      const spec=collectSpec(code);
      const {data,error}=await state.supabase.rpc("cc_factory_v2_prebuild_save",{p_project_id:state.projectId,p_item_code:code,p_spec:spec});
      if(error) throw error;
      state.packet=data; render();
      const row=(state.packet?.specs||[]).find(x=>x.item_code===code);
      if(row?.is_complete) toast(`${code}：仕様が完成しGateへ反映されました。`);
      else if(row?.decision_state==="action_required") toast(`${code}：要対応としてGateを停止しました。`);
      else toast(`${code}：下書きを保存しました。未入力項目を確認してください。`);
    }catch(error){console.error(BUILD,error);toast(error?.message||"仕様を保存できませんでした。",true);}finally{button.disabled=false;button.textContent=old;}
  }

  async function writeClipboard(text){
    try{await navigator.clipboard.writeText(text);}catch{const ta=document.createElement("textarea");ta.value=text;document.body.appendChild(ta);ta.select();document.execCommand("copy");ta.remove();}
  }

  async function copyItem(code){
    const def=defs.find(x=>x.code===code); const d=productDev(); const spec=collectSpec(code);
    const text=[
      "DPRO FACTORY V2 PREBUILD設計確認",
      `製品: ${d.product_name||""} (${d.target_system_code||""})`,
      `参考製品: ${productNameByCode(d.reference_product_system_code)} (${d.reference_product_system_code||""})`,
      `確認項目: ${def?.number||""}. ${def?.title||code}`,
      `目的: ${def?.purpose||""}`,
      "",
      "【製品定義】",`利用者: ${d.target_users||""}`,`業務フロー: ${d.core_workflow||""}`,`必須機能: ${d.must_have_features||""}`,`対象外: ${d.out_of_scope||""}`,`安全設計: ${d.data_handling_notes||""}`,
      "",
      "【現在の入力】",
      ...Object.entries(spec).map(([k,v])=>`${k}: ${v}`),
      "",
      "この項目をPASSにできる仕様か確認し、不足があれば具体的に指摘してください。単なるPASS判定ではなく、実装に使える仕様として確定してください。"
    ].join("\n");
    await writeClipboard(text); toast("このPREBUILD項目のChatGPT確認用テキストをコピーしました。");
  }

  async function copyFullSpec(){
    const d=productDev(); const items=itemMap(); const specs=specMap();
    const lines=[
      "DPRO FACTORY V2.0 / PREBUILD STRUCTURED SPEC R2",
      `製品: ${d.product_name||""}`,
      `SYSTEM CODE: ${d.target_system_code||""}`,
      `開発コード: ${d.dev_code||""}`,
      `参考製品: ${productNameByCode(d.reference_product_system_code)} (${d.reference_product_system_code||""})`,
      `制作Project: ${state.packet?.project?.project_code||""}`,
      `医療安全: ${d.medical_data?"必須":"通常"}`,
      "",
      "1. FACTORY V2.0固定基準",
      `status: ${items.get("factory_baseline")?.status||"pending"}`,
      `evidence: ${items.get("factory_baseline")?.evidence||""}`,
    ];
    for(const def of defs){
      const s=specs.get(def.code); lines.push("",`${def.number}. ${def.title}`,`Gate: ${items.get(def.code)?.status||"pending"}`);
      if(!s){lines.push("spec: 未作成");continue;}
      lines.push(`summary: ${s.summary||""}`,...Object.entries(s.spec_json||{}).map(([k,v])=>`${k}: ${v}`));
    }
    lines.push("","【製品定義】",`利用者: ${d.target_users||""}`,`中心フロー: ${d.core_workflow||""}`,`必須機能: ${d.must_have_features||""}`,`対象外: ${d.out_of_scope||""}`,`データ安全: ${d.data_handling_notes||""}`);
    await writeClipboard(lines.join("\n")); toast("PREBUILD仕様一式をコピーしました。");
  }

  window.addEventListener("DOMContentLoaded",boot,{once:true});
})();
