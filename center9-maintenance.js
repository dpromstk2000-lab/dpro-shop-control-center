(() => {
  "use strict";

  const BUILD = "CONTROL-CENTER-21-CENTER9-R3-20260809";
  const CONFIG = window.DPRO_CONTROL_CENTER_CONFIG || {};
  const $ = (id) => document.getElementById(id);
  const $$ = (selector, scope=document) => Array.from(scope.querySelectorAll(selector));

  const state = {
    supabase:null,
    session:null,
    staff:null,
    overview:null,
    selectedProjectId:"",
    detail:null,
    search:"",
    filter:"all",
  };

  const resultLabels = {
    ok:"問題なし",
    follow_up:"要フォロー",
    issue:"問題あり",
  };

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }

  function canWrite() {
    return ["owner_admin","technical_admin","support"].includes(state.staff?.role_key);
  }

  function fmtDate(value) {
    if(!value) return "—";
    const d=new Date(value);
    if(Number.isNaN(d.getTime())) return String(value);
    return new Intl.DateTimeFormat("ja-JP",{year:"numeric",month:"2-digit",day:"2-digit"}).format(d);
  }

  function fmtDateTime(value) {
    if(!value) return "—";
    const d=new Date(value);
    if(Number.isNaN(d.getTime())) return String(value);
    return new Intl.DateTimeFormat("ja-JP",{
      year:"numeric",month:"2-digit",day:"2-digit",
      hour:"2-digit",minute:"2-digit"
    }).format(d);
  }

  function nextMonthDate() {
    const d=new Date();
    d.setMonth(d.getMonth()+1);
    const pad=(n)=>String(n).padStart(2,"0");
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  }

  function installStyle() {
    if($("center9Style")) return;
    const style=document.createElement("style");
    style.id="center9Style";
    style.textContent=`
      .c9-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-end;margin-bottom:14px}
      .c9-head h2{margin:0;font-size:23px}.c9-head p{margin:6px 0 0;color:#68766f;font-size:10px;line-height:1.7}
      .c9-guide{padding:13px 15px;border:1px solid #b9dccd;border-radius:13px;background:#eef9f4;color:#486159;font-size:10px;line-height:1.7}
      .c9-summary{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px;margin:12px 0}
      .c9-metric{padding:12px;border:1px solid #d9e5e0;border-radius:13px;background:#fff}.c9-metric b,.c9-metric span{display:block}.c9-metric b{font-size:20px;color:#0b5f49}.c9-metric span{font-size:8px;color:#6b7974;margin-top:3px}.c9-metric.warn b{color:#9c6600}.c9-metric.bad b{color:#b63247}
      .c9-tools{display:grid;grid-template-columns:minmax(250px,1fr) 220px auto;gap:8px;margin:10px 0}.c9-tools input,.c9-tools select{min-height:42px;border:1px solid #d8e4df;border-radius:10px;background:#fff;padding:0 11px}
      .c9-list{display:grid;gap:9px}.c9-card{padding:14px;border:1px solid #dbe6e1;border-radius:15px;background:#fff;display:grid;grid-template-columns:minmax(260px,1.2fr) repeat(4,minmax(105px,.55fr)) auto;gap:9px;align-items:center}.c9-card.overdue{border-color:#e4aeba;background:#fffafa}.c9-card.attention{border-color:#e6cf8a;background:#fffdf8}
      .c9-main small,.c9-main strong,.c9-main span{display:block}.c9-main small{font-size:8px;color:#6c7b75;font-weight:900}.c9-main strong{margin-top:3px;font-size:13px}.c9-main span{margin-top:3px;font-size:8px;color:#6b7974}
      .c9-cell b,.c9-cell span{display:block}.c9-cell b{font-size:10px}.c9-cell span{margin-top:3px;font-size:8px;color:#718079}
      .c9-pill{display:inline-flex;padding:5px 8px;border-radius:999px;background:#eef2f0;color:#61706a;font-size:8px;font-weight:900}.c9-pill.green{background:#def5ea;color:#087253}.c9-pill.amber{background:#fff2cf;color:#936300}.c9-pill.red{background:#fee8ed;color:#b63247}.c9-pill.blue{background:#edf6ff;color:#246ba9}
      .c9-empty{padding:30px;text-align:center;border:1px dashed #c5d4cd;border-radius:14px;background:#fff;color:#6d7b75}.c9-empty strong{display:block;font-size:14px;color:#20312b}.c9-empty span{display:block;margin-top:7px;font-size:9px;line-height:1.7}
      .c9-detail{margin-top:13px}.c9-hero{padding:17px;border-radius:16px;background:linear-gradient(135deg,#0b5f49,#073d31);color:#fff;display:flex;justify-content:space-between;gap:14px}.c9-hero small,.c9-hero strong,.c9-hero span{display:block}.c9-hero small{color:#bde4d6;font-size:8px;font-weight:900}.c9-hero strong{margin-top:4px;font-size:20px}.c9-hero span{margin-top:4px;color:#cde8de;font-size:9px}.c9-hero-status{padding:8px 11px;border-radius:999px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.2);height:max-content;font-size:9px;font-weight:900}
      .c9-auto{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:9px}.c9-auto-card{padding:12px;border:1px solid #dce7e2;border-radius:12px;background:#fff}.c9-auto-card strong,.c9-auto-card span,.c9-auto-card small{display:block}.c9-auto-card strong{font-size:9px}.c9-auto-card span{margin-top:5px;font-size:10px;font-weight:900}.c9-auto-card small{margin-top:3px;color:#718079;font-size:8px;line-height:1.5}.c9-auto-card.ok span{color:#087253}.c9-auto-card.warn span{color:#936300}.c9-auto-card.bad span{color:#b63247}
      .c9-section{margin-top:10px;padding:15px;border:1px solid #d9e5e0;border-radius:15px;background:#fff}.c9-section h3{margin:0;font-size:14px}.c9-section>p{margin:5px 0 11px;color:#6c7a74;font-size:9px}
      .c9-checks{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.c9-check{display:flex;gap:9px;align-items:flex-start;padding:11px;border:1px solid #e0e9e5;border-radius:11px;background:#fbfcfb}.c9-check input{width:18px;height:18px;accent-color:#0b5f49}.c9-check strong{display:block;font-size:9px}.c9-check small{display:block;margin-top:3px;color:#74817c;font-size:8px;line-height:1.5}
      .c9-form-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.c9-field{display:grid;gap:5px}.c9-field.full{grid-column:1/-1}.c9-field label{font-size:8px;font-weight:900;color:#61706a}.c9-field select,.c9-field input,.c9-field textarea{min-height:40px;border:1px solid #d8e4df;border-radius:9px;background:#fff;padding:0 9px;font-size:9px}.c9-field textarea{min-height:80px;padding:9px;resize:vertical}
      .c9-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:11px}.c9-history{display:grid;gap:7px}.c9-history-row{display:grid;grid-template-columns:120px 110px minmax(0,1fr) 130px;gap:8px;padding:10px;border:1px solid #e3eae7;border-radius:10px;align-items:center}.c9-history-row strong{font-size:9px}.c9-history-row span,.c9-history-row small{font-size:8px;color:#708079}
      @media(max-width:1100px){.c9-summary{grid-template-columns:repeat(4,1fr)}.c9-card{grid-template-columns:1fr 1fr 1fr}.c9-main{grid-column:1/-1}.c9-auto{grid-template-columns:repeat(2,1fr)}}
      @media(max-width:720px){.c9-head{display:block}.c9-summary,.c9-auto,.c9-checks,.c9-form-grid{grid-template-columns:1fr}.c9-tools{grid-template-columns:1fr}.c9-card{grid-template-columns:1fr}.c9-history-row{grid-template-columns:1fr}.c9-hero{display:block}.c9-hero-status{display:inline-block;margin-top:10px}}
    `;
    document.head.appendChild(style);
  }

  function findGoLiveTab() {
    return document.querySelector('.tab[data-tab="go-live"]')
      || document.querySelector('[data-center8-go-live]')
      || Array.from(document.querySelectorAll('.tabs .tab, .tabs button'))
        .find((el) => (el.textContent || '').trim() === '本番稼働')
      || null;
  }

  function maintenancePanelHtml() {
    return `
      <div class="c9-head">
        <div>
          <h2>保守・更新管理</h2>
          <p>本番稼働後のお客様だけを対象に、保守期限・Health・Version差分を一つの画面で追います。</p>
        </div>
        <span class="c9-pill green">CENTER-9</span>
      </div>

      <div class="c9-guide">
        毎回すべてを作り直すのではなく、「期限が来た」「Healthに注意」「期待Versionと違う」「前回確認後にVersionが変わった」案件を先に確認します。
      </div>

      <div id="c9Summary" class="c9-summary"></div>

      <div class="c9-tools">
        <input id="c9Search" type="search" placeholder="顧客名・システム名・施設コードで検索">
        <select id="c9Filter">
          <option value="all">すべての本番稼働</option>
          <option value="attention">要確認のみ</option>
          <option value="overdue">保守期限超過</option>
          <option value="due_soon">7日以内</option>
          <option value="health">Health要確認</option>
          <option value="version">Version要確認</option>
        </select>
        <button id="c9Reload" class="btn secondary" type="button">最新情報に更新</button>
      </div>

      <div id="c9List" class="c9-list"><div class="c9-empty">保守対象を確認しています…</div></div>
      <div id="c9Detail"></div>
    `;
  }

  function bindMaintenancePanel(button, panel) {
    if (button.dataset.center9Bound === "true") return;

    button.dataset.center9Bound = "true";
    button.addEventListener("click", async () => {
      $$(".tab").forEach((b) => b.classList.toggle("active", b === button));
      $$(".tab-panel").forEach((p) => p.classList.add("hidden"));
      panel.classList.remove("hidden");
      await loadOverview();
    });

    $("c9Search")?.addEventListener("input", () => {
      state.search = $("c9Search").value.trim().toLowerCase();
      renderList();
    });

    $("c9Filter")?.addEventListener("change", () => {
      state.filter = $("c9Filter").value;
      renderList();
    });

    $("c9Reload")?.addEventListener("click", loadOverview);
  }

  function installPanel() {
    const tabs = document.querySelector(".tabs");
    const goLiveTab = findGoLiveTab();
    const goLivePanel = $("panel-go-live");

    if (!tabs || !goLiveTab || !goLivePanel) return false;

    let button = document.querySelector('.tab[data-tab="maintenance"]');
    if (!button) {
      button = document.createElement("button");
      button.className = "tab";
      button.type = "button";
      button.dataset.tab = "maintenance";
      button.dataset.center9Tab = "true";
      button.textContent = "保守・更新";
      goLiveTab.insertAdjacentElement("afterend", button);
    } else if (button.previousElementSibling !== goLiveTab) {
      goLiveTab.insertAdjacentElement("afterend", button);
    }

    let panel = $("panel-maintenance");
    if (!panel) {
      panel = document.createElement("section");
      panel.id = "panel-maintenance";
      panel.className = "tab-panel hidden";
      panel.innerHTML = maintenancePanelHtml();
      goLivePanel.insertAdjacentElement("afterend", panel);
    } else if (!$("c9List")) {
      panel.innerHTML = maintenancePanelHtml();
    }

    bindMaintenancePanel(button, panel);
    return true;
  }

  async function client(){
    if(state.supabase) return state.supabase;

    const base=String(CONFIG.apiBaseUrl||"").replace(/\/$/,"");
    const response=await fetch(`${base}/api/public-config`,{cache:"no-store"});
    const pub=await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(pub.message||pub.error||`HTTP ${response.status}`);

    state.supabase=window.supabase.createClient(
      pub.supabaseUrl,
      pub.supabasePublishableKey||pub.supabaseAnonKey,
      {
        auth:{
          persistSession:true,
          autoRefreshToken:true,
          detectSessionInUrl:false,
          storageKey:pub.sessionStorageKey||"dpro-control-center-auth-v1",
        }
      }
    );

    const {data,error}=await state.supabase.auth.getSession();
    if(error) throw error;
    state.session=data.session;
    if(!state.session?.user) throw new Error("CONTROL CENTERへログインしてください。");

    const {data:staff,error:staffError}=await state.supabase
      .from("cc_staff")
      .select("id,role_key,status")
      .eq("auth_user_id",state.session.user.id)
      .maybeSingle();

    if(staffError) throw staffError;
    if(!staff||staff.status!=="active") throw new Error("有効なDPROスタッフではありません。");
    state.staff=staff;
    return state.supabase;
  }

  async function loadOverview(){
    try{
      const sb=await client();
      $("c9List").innerHTML='<div class="c9-empty">保守期限・Health・Versionを再判定しています…</div>';
      $("c9Detail").innerHTML="";

      const {data,error}=await sb.rpc("cc_center9_get_maintenance_overview");
      if(error) throw error;
      state.overview=data||{summary:{},items:[]};

      renderSummary();
      renderList();
    }catch(error){
      console.error(BUILD,error);
      $("c9List").innerHTML=`<div class="c9-empty"><strong>CENTER-9を読み込めません</strong><span>${esc(error.message||"DBを確認してください。")}</span></div>`;
    }
  }

  function renderSummary(){
    const s=state.overview?.summary||{};
    const rows=[
      [s.live_count||0,"本番稼働",""],
      [s.overdue_count||0,"期限超過",(s.overdue_count||0)?"bad":""],
      [s.due_soon_count||0,"7日以内",(s.due_soon_count||0)?"warn":""],
      [s.health_attention_count||0,"Health要確認",(s.health_attention_count||0)?"warn":""],
      [s.version_update_count||0,"期待Version不一致",(s.version_update_count||0)?"warn":""],
      [s.version_changed_count||0,"前回からVersion変更",(s.version_changed_count||0)?"warn":""],
      [s.pre_live_count||0,"本番稼働前",""],
    ];
    $("c9Summary").innerHTML=rows.map(([v,l,tone])=>
      `<article class="c9-metric ${tone}"><b>${esc(v)}</b><span>${esc(l)}</span></article>`
    ).join("");
  }

  function itemAttention(x){
    return x.due_status==="overdue"
      ||x.due_status==="due_soon"
      ||Boolean(x.health_attention)
      ||Boolean(x.expected_version_mismatch)
      ||Boolean(x.version_changed_since_last_check);
  }

  function filterItem(x){
    if(state.search){
      const text=`${x.client_name||""} ${x.system_name||""} ${x.system_code||""} ${x.facility_code||""} ${x.project_code||""}`.toLowerCase();
      if(!text.includes(state.search)) return false;
    }

    switch(state.filter){
      case "attention": return itemAttention(x);
      case "overdue": return x.due_status==="overdue";
      case "due_soon": return x.due_status==="due_soon";
      case "health": return Boolean(x.health_attention);
      case "version": return Boolean(x.expected_version_mismatch)||Boolean(x.version_changed_since_last_check);
      default: return true;
    }
  }

  function dueLabel(x){
    if(x.due_status==="overdue") return `期限超過 ${Math.abs(Number(x.days_until_due||0))}日`;
    if(x.due_status==="due_soon") return `あと${Number(x.days_until_due||0)}日`;
    if(x.due_status==="unscheduled") return "未設定";
    return fmtDate(x.next_maintenance_date);
  }

  function renderList(){
    const items=Array.isArray(state.overview?.items)?state.overview.items:[];
    const rows=items.filter(filterItem);

    if(!items.length){
      const pre=Number(state.overview?.summary?.pre_live_count||0);
      $("c9List").innerHTML=`
        <div class="c9-empty">
          <strong>現在、本番稼働中の保守対象はありません。</strong>
          <span>CENTER-8で本番稼働を確定した実契約だけがここへ入ります。現在の本番稼働前案件は ${pre}件 です。</span>
        </div>
      `;
      return;
    }

    if(!rows.length){
      $("c9List").innerHTML='<div class="c9-empty"><strong>条件に一致する保守対象はありません。</strong></div>';
      return;
    }

    $("c9List").innerHTML=rows.map((x)=>{
      const overdue=x.due_status==="overdue";
      const attention=itemAttention(x);
      const cls=overdue?"overdue":attention?"attention":"";
      const healthTone=x.last_health_status==="error"?"red":
        x.health_attention?"amber":"green";
      const versionTone=x.expected_version_mismatch||x.version_changed_since_last_check?"amber":"green";

      return `
        <article class="c9-card ${cls}">
          <div class="c9-main">
            <small>${esc(x.project_code||"")} / ${esc(x.facility_code||"")}</small>
            <strong>${esc(x.client_name||"")}｜${esc(x.system_name||x.system_code||"")}</strong>
            <span>前回保守：${esc(fmtDate(x.last_maintenance_at))} / 本番稼働：${esc(fmtDate(x.go_live_at))}</span>
          </div>
          <div class="c9-cell">
            <b>${dueLabel(x)}</b>
            <span>次回保守</span>
          </div>
          <div class="c9-cell">
            ${pill(x.last_health_status||"unknown",healthTone)}
            <span>${esc(fmtDate(x.last_health_checked_at))}</span>
          </div>
          <div class="c9-cell">
            ${pill(x.expected_version_mismatch?"期待値と不一致":"期待値OK",versionTone)}
            <span>Worker / DB</span>
          </div>
          <div class="c9-cell">
            ${pill(x.version_changed_since_last_check?"変更あり":"差分なし",versionTone)}
            <span>前回確認から</span>
          </div>
          <button class="btn primary" type="button" data-c9-open="${esc(x.project_id)}">保守確認を開く</button>
        </article>
      `;
    }).join("");

    $$("[data-c9-open]",$("c9List")).forEach((b)=>{
      b.addEventListener("click",()=>openDetail(b.dataset.c9Open));
    });
  }

  function pill(text,tone=""){
    return `<span class="c9-pill ${esc(tone)}">${esc(text)}</span>`;
  }

  async function openDetail(projectId){
    state.selectedProjectId=projectId;
    localStorage.setItem("dpro_center9_project",projectId);

    const sb=await client();
    $("c9Detail").innerHTML='<div class="c9-empty" style="margin-top:12px">保守確認項目を読み込んでいます…</div>';

    const {data,error}=await sb.rpc("cc_center9_get_maintenance_detail",{
      p_project_id:projectId
    });

    if(error){
      $("c9Detail").innerHTML=`<div class="c9-empty" style="margin-top:12px"><strong>保守詳細を開けません</strong><span>${esc(error.message)}</span></div>`;
      return;
    }

    state.detail=data||{};
    renderDetail();
  }

  function enabled(code){
    return (state.detail?.enabled_features||[]).some((x)=>x.feature_code===code&&x.enabled);
  }

  function photoEnabled(){
    return ["photo","customer_photo_share","before_after_photo"].some(enabled);
  }

  function renderDetail(){
    const x=state.detail?.item||{};
    const history=Array.isArray(state.detail?.history)?state.detail.history:[];

    const auto=[
      {
        title:"保守期限",
        ok:x.due_status!=="overdue"&&x.due_status!=="unscheduled",
        warn:x.due_status==="due_soon",
        value:dueLabel(x),
        detail:`次回予定 ${fmtDate(x.next_maintenance_date)}`
      },
      {
        title:"System Health",
        ok:!x.health_attention,
        warn:x.last_health_status!=="error",
        value:x.last_health_status||"unknown",
        detail:`最終確認 ${fmtDateTime(x.last_health_checked_at)}`
      },
      {
        title:"期待Version",
        ok:!x.expected_version_mismatch,
        warn:true,
        value:x.expected_version_mismatch?"不一致":"一致",
        detail:`Worker ${x.worker_version||"—"} / DB ${x.database_version||"—"}`
      },
      {
        title:"前回からVersion差分",
        ok:!x.version_changed_since_last_check,
        warn:true,
        value:x.version_changed_since_last_check?"変更あり":"差分なし",
        detail:`Frontend ${x.frontend_version||"—"}`
      },
    ];

    const checks=[
      ["owner_access","オーナー管理画面","ログイン・主要画面・保存操作を確認。",true],
      ["public_flow","お客様公開導線","公開画面・お客様導線が正常に開く。",true],
      ["recent_error_review","直近エラー確認","Health / system-check / 問い合わせ等に未対応異常がないか確認。",true],
      ["reservation_flow","予約","予約受付・公開期間・休業日連動を確認。",enabled("reservation")],
      ["business_calendar","営業カレンダー","通常定休日・臨時休業・特別営業の反映を確認。",enabled("business_calendar")],
      ["line_flow","LINE導線","LINE公式から契約対象画面への導線を確認。",enabled("line")],
      ["website_flow","ホームページ連動","HPから予約・営業情報等の連動を確認。",enabled("website")],
      ["photo_flow","写真機能","登録・表示・共有範囲を確認。",photoEnabled()],
    ].filter((x)=>x[3]);

    $("c9Detail").innerHTML=`
      <div class="c9-detail">
        <div class="c9-hero">
          <div>
            <small>${esc(x.project_code||"")} / ${esc(x.facility_code||"")}</small>
            <strong>${esc(x.client_name||"")}｜${esc(x.system_name||x.system_code||"")}</strong>
            <span>${esc(x.environment||"")} / 次回保守 ${esc(fmtDate(x.next_maintenance_date))}</span>
          </div>
          <span class="c9-hero-status">${itemAttention(x)?"要確認":"通常"}</span>
        </div>

        <div class="c9-auto">
          ${auto.map((a)=>`
            <article class="c9-auto-card ${a.ok?"ok":a.warn?"warn":"bad"}">
              <strong>${esc(a.title)}</strong>
              <span>${a.ok?"✓ ":"! "}${esc(a.value)}</span>
              <small>${esc(a.detail)}</small>
            </article>
          `).join("")}
        </div>

        <section class="c9-section">
          <h3>1. 今回の保守確認</h3>
          <p>納品検査を丸ごと繰り返さず、運用中に壊れやすい入口・公開導線・契約Featureだけ確認します。</p>
          <div class="c9-checks">
            ${checks.map(([code,name,desc])=>`
              <label class="c9-check">
                <input type="checkbox" data-c9-check="${esc(code)}" ${canWrite()?"":"disabled"}>
                <span><strong>${esc(name)}</strong><small>${esc(desc)}</small></span>
              </label>
            `).join("")}
          </div>
        </section>

        <section class="c9-section">
          <h3>2. 結果・次回確認</h3>
          <p>問題が残る場合は「要フォロー」「問題あり」で記録できます。問題なしの場合は必要チェックが全て必須です。</p>
          <div class="c9-form-grid">
            <div class="c9-field">
              <label>保守種別</label>
              <select id="c9Type" ${canWrite()?"":"disabled"}>
                <option value="regular">定期保守</option>
                <option value="version_update">Version更新</option>
                <option value="incident">障害対応</option>
                <option value="follow_up">フォロー確認</option>
              </select>
            </div>
            <div class="c9-field">
              <label>確認結果</label>
              <select id="c9Result" ${canWrite()?"":"disabled"}>
                <option value="ok">問題なし</option>
                <option value="follow_up">要フォロー</option>
                <option value="issue">問題あり</option>
              </select>
            </div>
            <div class="c9-field">
              <label>次回保守確認日</label>
              <input id="c9NextDate" type="date" value="${esc(nextMonthDate())}" ${canWrite()?"":"disabled"}>
            </div>
            <div class="c9-field full">
              <label>保守メモ</label>
              <textarea id="c9Note" placeholder="Version更新内容・オーナーからの要望・次回確認事項など" ${canWrite()?"":"disabled"}></textarea>
            </div>
          </div>
          ${canWrite()?'<div class="c9-actions"><button id="c9Complete" class="btn primary" type="button">保守確認を完了・次回日を更新</button></div>':""}
        </section>

        <section class="c9-section">
          <h3>3. 保守履歴</h3>
          <p>確認時点のHealth・Versionを保存するので、前回から何が変わったか追えます。</p>
          <div class="c9-history">
            ${history.length?history.map((h)=>`
              <article class="c9-history-row">
                <strong>${esc(fmtDateTime(h.completed_at))}</strong>
                ${pill(resultLabels[h.result_status]||h.result_status,h.result_status==="ok"?"green":h.result_status==="issue"?"red":"amber")}
                <span>${esc(h.note||"メモなし")}<br>Worker ${esc(h.worker_version_snapshot||"—")} / DB ${esc(h.database_version_snapshot||"—")}</span>
                <small>次回 ${esc(fmtDate(h.next_maintenance_date))}</small>
              </article>
            `).join(""):'<div class="c9-empty"><strong>まだ保守履歴はありません。</strong><span>最初の本番保守を完了するとここへ記録されます。</span></div>'}
          </div>
        </section>
      </div>
    `;

    $("c9Complete")?.addEventListener("click",completeMaintenance);
    $("c9Detail").scrollIntoView({behavior:"smooth",block:"start"});
  }

  async function completeMaintenance(){
    const button=$("c9Complete");
    const checks={};
    $$("[data-c9-check]",$("c9Detail")).forEach((input)=>{
      checks[input.dataset.c9Check]=Boolean(input.checked);
    });

    const payload={
      maintenance_type:$("c9Type")?.value||"regular",
      result_status:$("c9Result")?.value||"ok",
      next_maintenance_date:$("c9NextDate")?.value||"",
      note:$("c9Note")?.value?.trim()||"",
      check_results:checks,
    };

    if(payload.result_status==="ok"){
      const missing=Object.entries(checks).filter(([,v])=>!v);
      if(missing.length){
        alert("「問題なし」で完了するには、表示されている確認項目をすべてチェックしてください。");
        return;
      }
    }

    if(payload.result_status!=="ok"&&!payload.note){
      alert("要フォロー / 問題ありの場合は、対応内容をメモしてください。");
      return;
    }

    button.disabled=true;
    button.textContent="保存・再判定中…";

    try{
      const sb=await client();
      const {error}=await sb.rpc("cc_center9_complete_maintenance",{
        p_project_id:state.selectedProjectId,
        p_payload:payload
      });
      if(error) throw error;

      await loadOverview();
      await openDetail(state.selectedProjectId);
      alert("保守確認を記録し、次回保守日を更新しました。");
    }catch(error){
      alert(error.message||"保守確認を保存できませんでした。");
    }finally{
      if($("c9Complete")){
        $("c9Complete").disabled=false;
        $("c9Complete").textContent="保守確認を完了・次回日を更新";
      }
    }
  }

  function boot(){
    installStyle();

    let observer = null;
    let timer = null;
    let stopped = false;

    const cleanup = () => {
      if (stopped) return;
      stopped = true;
      if (observer) observer.disconnect();
      if (timer) clearInterval(timer);
    };

    const attempt = () => {
      if (installPanel()) {
        cleanup();
        return true;
      }
      return false;
    };

    if (attempt()) return;

    observer = new MutationObserver(() => {
      attempt();
    });
    observer.observe(document.documentElement, {childList:true, subtree:true});

    // Dynamic script / Pages / slow device の順番に依存しないよう定期再確認。
    timer = setInterval(attempt, 250);

    // 1分以内にCENTER-8が生成されれば必ず追従。
    setTimeout(cleanup, 60000);
  }

  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",boot,{once:true});
  else boot();
})();
