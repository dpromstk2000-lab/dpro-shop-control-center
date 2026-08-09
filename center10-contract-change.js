(() => {
  "use strict";

  if (window.__DPRO_CENTER10_RUNTIME__ || window.__DPRO_CENTER10_RUNTIME_R1__) return;
  window.__DPRO_CENTER10_RUNTIME__ = true;
  window.__DPRO_CENTER10_RUNTIME_R1__ = true;

  const BUILD = "CONTROL-CENTER-22-CENTER10-R3-LINK-CHECK-20260809";
  const CONFIG = window.DPRO_CONTROL_CENTER_CONFIG || {};
  const $ = (id) => document.getElementById(id);
  const $$ = (selector, scope=document) => Array.from(scope.querySelectorAll(selector));

  const state = {
    supabase:null,
    session:null,
    staff:null,
    overview:null,
    detail:null,
    selectedId:"",
    search:"",
    filter:"open",
  };

  const TYPE_LABELS = {
    feature_change:"機能追加・変更",
    service_change:"契約サービス変更",
    fee_change:"料金変更",
    pause:"一時休止",
    resume:"再開",
    cancellation:"解約",
    handoff:"引き継ぎ",
    other:"その他",
  };

  const STATUS_LABELS = {
    draft:"下書き",
    review:"社内確認",
    owner_approval:"オーナー確認待ち",
    approved:"承認済み",
    implementing:"実装・対応中",
    verification:"最終確認",
    completed:"完了",
    rejected:"見送り",
    cancelled:"取消",
  };

  const HANDOFF_LABELS = {
    final_billing_confirmed:"最終請求日を確認",
    end_date_confirmed:"契約終了日を確認",
    handoff_scope_confirmed:"契約上の引き継ぎ範囲を確認",
    domain_ownership_confirmed:"ドメイン所有者・移管要否を確認",
    line_account_ownership_confirmed:"LINE公式アカウントの所有・権限を確認",
    data_export_scope_confirmed:"データ出力・返却範囲を確認",
    backup_completed:"必要な最終バックアップを確認",
    owner_handoff_completed:"オーナーへの引き継ぎ完了",
    dpro_access_revoke_ready:"DPRO側アクセス解除準備を確認",
    external_service_stop_ready:"外部サービス停止対象・停止日を確認",
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

  function isOwnerAdmin() {
    return state.staff?.role_key === "owner_admin";
  }

  function fmtDate(value) {
    if(!value) return "—";
    const d=new Date(`${String(value).slice(0,10)}T00:00:00`);
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

  function yen(value) {
    if(value === null || value === undefined || value === "") return "—";
    const n=Number(value);
    return Number.isFinite(n)?`¥${n.toLocaleString("ja-JP")}`:"—";
  }

  function todayIso() {
    const d=new Date();
    const pad=(n)=>String(n).padStart(2,"0");
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  }

  function pill(text,tone="") {
    return `<span class="c10-pill ${esc(tone)}">${esc(text)}</span>`;
  }

  function statusTone(status) {
    if(status==="completed") return "green";
    if(status==="rejected"||status==="cancelled") return "gray";
    if(status==="owner_approval") return "amber";
    if(status==="verification") return "blue";
    if(status==="implementing") return "blue";
    return "";
  }


  function contractById(contractId) {
    return (state.overview?.contracts||[]).find(
      (c)=>String(c.contract_id||"")===String(contractId||"")
    )||null;
  }

  function contractReadiness(contract) {
    const c=contract||{};
    const contractStatus=String(c.contract_status||"");
    const contractUsable=!!c.contract_id && !["ended","cancelled"].includes(contractStatus);
    const projectLinked=!!c.project_id;
    const systemLinked=!!c.system_instance_id;
    const featureChangeAllowed=contractUsable && projectLinked;
    return {
      contractUsable,
      projectLinked,
      systemLinked,
      featureChangeAllowed,
      fullLinked:contractUsable&&projectLinked&&systemLinked,
    };
  }

  function readinessTone(ok,warning=false) {
    if(ok) return "green";
    return warning?"amber":"red";
  }

  function readinessPill(ok,yes,no,warning=false) {
    return pill(ok?yes:no,readinessTone(ok,warning));
  }

  function installStyle() {
    if($("center10Style")) return;
    const style=document.createElement("style");
    style.id="center10Style";
    style.textContent=`
      .c10-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-end;margin-bottom:14px}
      .c10-head h2{margin:0;font-size:30px}.c10-head p{margin:8px 0 0;color:#68766f;font-size:14px;line-height:1.75}
      .c10-guide{padding:16px 18px;border:1px solid #b9dccd;border-radius:13px;background:#eef9f4;color:#486159;font-size:14px;line-height:1.75}
      .c10-safety{margin-top:10px;padding:15px 17px;border:1px solid #ead18b;border-radius:12px;background:#fff9e9;color:#805c00;font-size:13px;line-height:1.7}
      .c10-summary{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px;margin:12px 0}.c10-metric{padding:12px;border:1px solid #d9e5e0;border-radius:13px;background:#fff}.c10-metric b,.c10-metric span{display:block}.c10-metric b{font-size:27px;color:#0b5f49}.c10-metric span{font-size:12px;color:#6b7974;margin-top:5px}.c10-metric.warn b{color:#956200}.c10-metric.bad b{color:#b63247}
      .c10-tools{display:grid;grid-template-columns:minmax(260px,1fr) 220px auto;gap:8px;margin:10px 0}.c10-tools input,.c10-tools select{min-height:50px;border:1px solid #d8e4df;border-radius:10px;background:#fff;padding:0 13px;font-size:14px}
      .c10-list{display:grid;gap:8px}.c10-card{display:grid;grid-template-columns:minmax(260px,1.3fr) 130px 150px 120px auto;gap:9px;align-items:center;padding:13px;border:1px solid #dce7e2;border-radius:14px;background:#fff}.c10-card.urgent{border-color:#e5c66d;background:#fffdf7}
      .c10-main small,.c10-main strong,.c10-main span{display:block}.c10-main small{font-size:11px;color:#6d7b75;font-weight:900}.c10-main strong{margin-top:5px;font-size:18px}.c10-main span{margin-top:5px;font-size:12px;color:#6d7b75}.c10-cell b,.c10-cell span{display:block}.c10-cell b{font-size:13px}.c10-cell span{margin-top:4px;font-size:11px;color:#6f7e78}
      .c10-pill{display:inline-flex;padding:7px 10px;border-radius:999px;background:#eef2f0;color:#61706a;font-size:11px;font-weight:900}.c10-pill.green{background:#def5ea;color:#087253}.c10-pill.amber{background:#fff2cf;color:#936300}.c10-pill.red{background:#fee8ed;color:#b63247}.c10-pill.blue{background:#edf6ff;color:#246ba9}.c10-pill.gray{background:#edf0ef;color:#69756f}
      .c10-empty{padding:30px;text-align:center;border:1px dashed #c5d4cd;border-radius:14px;background:#fff;color:#6d7b75}.c10-empty strong{display:block;font-size:19px;color:#20312b}.c10-empty span{display:block;margin-top:9px;font-size:13px;line-height:1.75}
      .c10-detail{margin-top:13px}.c10-hero{padding:17px;border-radius:16px;background:linear-gradient(135deg,#0b5f49,#073d31);color:#fff;display:flex;justify-content:space-between;gap:14px}.c10-hero small,.c10-hero strong,.c10-hero span{display:block}.c10-hero small{color:#bde4d6;font-size:11px;font-weight:900}.c10-hero strong{margin-top:5px;font-size:27px}.c10-hero span{margin-top:5px;color:#cde8de;font-size:13px}.c10-hero-status{height:max-content}
      .c10-section{margin-top:10px;padding:15px;border:1px solid #d9e5e0;border-radius:15px;background:#fff}.c10-section h3{margin:0;font-size:20px}.c10-section>p{margin:7px 0 14px;color:#6c7a74;font-size:13px;line-height:1.7}
      .c10-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.c10-field{display:grid;gap:5px}.c10-field.full{grid-column:1/-1}.c10-field label{font-size:12px;font-weight:900;color:#61706a}.c10-field input,.c10-field select,.c10-field textarea{min-height:48px;border:1px solid #d8e4df;border-radius:9px;background:#fff;padding:0 11px;font-size:14px}.c10-field textarea{min-height:105px;padding:11px;resize:vertical;line-height:1.65}
      .c10-features{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}.c10-feature{padding:10px;border:1px solid #e0e8e4;border-radius:11px;background:#fbfcfb}.c10-feature.changed{border-color:#9fceb9;background:#f7fcf9}.c10-feature-head{display:flex;gap:7px;align-items:flex-start}.c10-feature-head input{width:18px;height:18px;accent-color:#0b5f49}.c10-feature strong{display:block;font-size:13px}.c10-feature small{display:block;margin-top:4px;color:#74817c;font-size:11px}.c10-feature textarea{width:100%;margin-top:8px;min-height:70px;border:1px solid #dce5e1;border-radius:8px;padding:9px;font-size:12px;resize:vertical;line-height:1.55}
      .c10-service-row{display:grid;grid-template-columns:minmax(170px,1fr) 120px 110px 130px 130px auto;gap:7px;margin-top:7px;align-items:center}.c10-service-row select,.c10-service-row input{min-height:46px;border:1px solid #d8e4df;border-radius:8px;background:#fff;padding:0 10px;font-size:12px}
      .c10-checklist{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.c10-check{display:flex;gap:8px;align-items:flex-start;padding:10px;border:1px solid #e0e8e4;border-radius:10px}.c10-check input{width:17px;height:17px;accent-color:#0b5f49}.c10-check strong{font-size:13px}.c10-check small{display:block;margin-top:4px;color:#74817c;font-size:11px}
      .c10-flow{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:6px;margin-top:10px}.c10-step{padding:12px;border:1px solid #e0e8e4;border-radius:10px;background:#f8faf9;text-align:center;font-size:12px;font-weight:900}.c10-step.current{border-color:#8bc7ae;background:#eaf7f1;color:#087253}.c10-step.done{background:#def5ea;color:#087253}
      .c10-actions{display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;margin-top:11px}.c10-history-task{display:grid;grid-template-columns:130px 150px minmax(0,1fr) 130px;gap:8px;align-items:center;padding:11px;border:1px solid #e3eae7;border-radius:9px;margin-top:7px;font-size:12px}
      .c10-modal{position:fixed;inset:0;z-index:3000;background:rgba(3,31,24,.55);display:grid;place-items:center;padding:20px}.c10-modal.hidden{display:none}.c10-modal-card{width:min(760px,96vw);max-height:90vh;overflow:auto;background:#fff;border-radius:18px;padding:20px;box-shadow:0 24px 80px rgba(0,0,0,.25)}.c10-modal-head{display:flex;justify-content:space-between;gap:12px}.c10-modal-head h2{margin:0;font-size:28px}.c10-close{border:0;background:#eef3f0;border-radius:9px;width:36px;height:36px;cursor:pointer}

      .c10-link-health{margin:12px 0;padding:16px;border:1px solid #cfe0d9;border-radius:14px;background:#fff}
      .c10-link-health-head{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:10px}
      .c10-link-health-head strong{font-size:16px}.c10-link-health-head span{font-size:12px;color:#6b7974}
      .c10-link-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
      .c10-link-cell{padding:12px;border:1px solid #e0e8e4;border-radius:11px;background:#f9fbfa}
      .c10-link-cell b{display:block;font-size:21px;color:#0b5f49}.c10-link-cell span{display:block;margin-top:4px;font-size:11px;color:#6b7974;line-height:1.5}
      .c10-link-warn{margin-top:10px;padding:11px 12px;border-radius:10px;background:#fff7df;color:#7d5a00;font-size:12px;line-height:1.65}
      .c10-readiness{padding:14px;border:1px solid #cfdfd8;border-radius:12px;background:#f8fbfa}
      .c10-readiness-title{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:10px}
      .c10-readiness-title strong{font-size:15px}.c10-readiness-title span{font-size:11px;color:#6b7974}
      .c10-readiness-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
      .c10-readiness-item{padding:10px;border:1px solid #e0e8e4;border-radius:10px;background:#fff}
      .c10-readiness-item small{display:block;font-size:11px;color:#6b7974;margin-bottom:6px}
      .c10-readiness-item b{display:block;font-size:13px;line-height:1.5}
      .c10-readiness-note{margin-top:10px;font-size:12px;line-height:1.65;color:#53635d}
      .c10-readiness-note.warn{padding:10px 11px;border-radius:9px;background:#fff5d9;color:#805c00}
      .c10-readiness-note.ok{padding:10px 11px;border-radius:9px;background:#eaf8f2;color:#076a4d}
      #c10Create:disabled{opacity:.58;cursor:not-allowed;box-shadow:none}

      #panel-contract-change .btn,
      #c10NewModal .btn{font-size:14px;min-height:48px;padding:0 18px;font-weight:900}
      #panel-contract-change .eyebrow,
      #c10NewModal .eyebrow{font-size:12px;letter-spacing:.12em}
      #c10NewModal .c10-modal-card{width:min(940px,96vw);padding:28px}
      #c10NewModal .c10-close{width:44px;height:44px;font-size:18px}
      .tab[data-tab="contract-change"]{font-size:14px;font-weight:900;padding-left:18px;padding-right:18px}
      @media(max-width:1100px){.c10-summary{grid-template-columns:repeat(4,1fr)}.c10-link-grid,.c10-readiness-grid{grid-template-columns:repeat(2,1fr)}.c10-card{grid-template-columns:1fr 1fr 1fr}.c10-main{grid-column:1/-1}.c10-features{grid-template-columns:repeat(2,1fr)}.c10-flow{grid-template-columns:repeat(3,1fr)}}
      @media(max-width:720px){.c10-head{display:block}.c10-summary,.c10-grid,.c10-features,.c10-checklist,.c10-flow,.c10-link-grid,.c10-readiness-grid{grid-template-columns:1fr}.c10-tools,.c10-card,.c10-service-row,.c10-history-task{grid-template-columns:1fr}.c10-hero{display:block}}
    `;
    document.head.appendChild(style);
  }

  function findMaintenanceTab() {
    return document.querySelector('.tab[data-tab="maintenance"]')
      || document.querySelector('[data-center9-tab]')
      || Array.from(document.querySelectorAll('.tabs .tab, .tabs button'))
        .find((el)=>(el.textContent||"").trim()==="保守・更新")
      || null;
  }

  function panelHtml() {
    return `
      <div class="c10-head">
        <div>
          <h2>契約変更・追加実装・解約</h2>
          <p>契約後の変更を、依頼 → 承認 → 実装 → 確認 → 完了まで履歴として残します。</p>
        </div>
        <span class="c10-pill green">CENTER-10</span>
      </div>

      <div class="c10-guide">
        Feature追加・サービス変更・料金変更・休止・再開・解約・引き継ぎを一元管理します。変更を「完了」するまで既存契約には反映しません。
      </div>

      <div class="c10-safety">
        解約でもGitHub・Cloudflare・Supabase・LINE・ドメイン等の外部資産は自動削除しません。契約上の引き継ぎ範囲と所有者を確認してから、必要な外部操作を別途行います。
      </div>

      <div id="c10LinkHealth" class="c10-link-health">契約連動状態を確認しています…</div>

      <div id="c10Summary" class="c10-summary"></div>

      <div class="c10-tools">
        <input id="c10Search" type="search" placeholder="顧客名・契約名・変更コードで検索">
        <select id="c10Filter">
          <option value="open">進行中のみ</option>
          <option value="all">すべて</option>
          <option value="owner">オーナー確認待ち</option>
          <option value="implementing">実装・対応中</option>
          <option value="verification">最終確認</option>
          <option value="cancellation">解約・引き継ぎ</option>
          <option value="completed">完了</option>
        </select>
        <button id="c10New" class="btn primary" type="button">＋ 契約変更を登録</button>
      </div>

      <div id="c10List" class="c10-list"><div class="c10-empty">契約変更を確認しています…</div></div>
      <div id="c10Detail"></div>
    `;
  }

  function bindPanel(button,panel) {
    if(button.dataset.center10Bound==="true") return;
    button.dataset.center10Bound="true";

    button.addEventListener("click",async()=>{
      $$(".tab").forEach((b)=>b.classList.toggle("active",b===button));
      $$(".tab-panel").forEach((p)=>p.classList.add("hidden"));
      panel.classList.remove("hidden");
      await loadOverview();
    });

    $("c10Search")?.addEventListener("input",()=>{
      state.search=$("c10Search").value.trim().toLowerCase();
      renderList();
    });
    $("c10Filter")?.addEventListener("change",()=>{
      state.filter=$("c10Filter").value;
      renderList();
    });
    const newButton=$("c10New");
    if(newButton && newButton.dataset.center10NewBound!=="true"){
      newButton.dataset.center10NewBound="true";
      newButton.addEventListener("click",openNewModal);
    }
  }

  function installPanel() {
    const tabs=document.querySelector(".tabs");
    const maintenanceTab=findMaintenanceTab();
    const maintenancePanel=$("panel-maintenance");
    if(!tabs||!maintenanceTab||!maintenancePanel) return false;

    let button=document.querySelector('.tab[data-tab="contract-change"]');
    if(!button){
      button=document.createElement("button");
      button.className="tab";
      button.type="button";
      button.dataset.tab="contract-change";
      button.dataset.center10Tab="true";
      button.textContent="契約変更・解約";
      maintenanceTab.insertAdjacentElement("afterend",button);
    }

    let panel=$("panel-contract-change");
    if(!panel){
      panel=document.createElement("section");
      panel.id="panel-contract-change";
      panel.className="tab-panel hidden";
      panel.innerHTML=panelHtml();
      maintenancePanel.insertAdjacentElement("afterend",panel);
    }

    bindPanel(button,panel);
    return true;
  }

  async function client() {
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

  async function loadOverview() {
    try {
      const sb=await client();
      $("c10List").innerHTML='<div class="c10-empty">契約変更状況を再計算しています…</div>';
      $("c10Detail").innerHTML="";

      const {data,error}=await sb.rpc("cc_center10_get_overview");
      if(error) throw error;

      state.overview=data||{summary:{},requests:[],contracts:[]};
      renderSummary();
      renderLinkHealth();
      renderList();
    } catch(error) {
      console.error(BUILD,error);
      $("c10List").innerHTML=`<div class="c10-empty"><strong>CENTER-10を読み込めません</strong><span>${esc(error.message||"DBを確認してください。")}</span></div>`;
    }
  }

  function renderSummary() {
    const s=state.overview?.summary||{};
    const rows=[
      [s.open_count||0,"進行中",""],
      [s.owner_wait_count||0,"オーナー確認待ち",(s.owner_wait_count||0)?"warn":""],
      [s.implementing_count||0,"実装・対応中",""],
      [s.verification_count||0,"最終確認",""],
      [s.cancellation_count||0,"解約・引き継ぎ",(s.cancellation_count||0)?"warn":""],
      [s.effective_due_count||0,"7日以内に適用",(s.effective_due_count||0)?"warn":""],
      [s.completed_count||0,"完了",""],
    ];
    $("c10Summary").innerHTML=rows.map(([v,l,t])=>
      `<article class="c10-metric ${t}"><b>${esc(v)}</b><span>${esc(l)}</span></article>`
    ).join("");
  }

  function renderLinkHealth() {
    const host=$("c10LinkHealth");
    if(!host) return;
    const contracts=state.overview?.contracts||[];
    const usable=contracts.filter((c)=>contractReadiness(c).contractUsable);
    const projectLinked=usable.filter((c)=>contractReadiness(c).projectLinked).length;
    const systemLinked=usable.filter((c)=>contractReadiness(c).systemLinked).length;
    const featureReady=usable.filter((c)=>contractReadiness(c).featureChangeAllowed).length;
    const issues=usable.filter((c)=>!contractReadiness(c).fullLinked);

    host.innerHTML=`
      <div class="c10-link-health-head">
        <strong>契約連動セルフチェック</strong>
        <span>契約 → 制作案件 → システム台帳 → Feature変更可否を自動判定</span>
      </div>
      <div class="c10-link-grid">
        <div class="c10-link-cell"><b>${usable.length}</b><span>変更対象にできる契約</span></div>
        <div class="c10-link-cell"><b>${projectLinked}</b><span>制作案件まで紐付け済み</span></div>
        <div class="c10-link-cell"><b>${systemLinked}</b><span>システム台帳まで紐付け済み</span></div>
        <div class="c10-link-cell"><b>${featureReady}</b><span>Feature変更の下書き作成可</span></div>
      </div>
      ${issues.length?`
        <div class="c10-link-warn">
          連動確認が必要な契約 ${issues.length}件。契約変更登録画面で、どこまで紐付いているか契約ごとに表示します。
        </div>
      `:`<div class="c10-readiness-note ok">現在の対象契約は、制作案件・システム台帳まで連動しています。</div>`}
    `;
  }

  function matchesFilter(x) {
    if(state.search){
      const hay=`${x.client_name||""} ${x.contract_code||""} ${x.contract_name||""} ${x.change_code||""} ${x.title||""}`.toLowerCase();
      if(!hay.includes(state.search)) return false;
    }

    if(state.filter==="open") return !["completed","rejected","cancelled"].includes(x.status);
    if(state.filter==="owner") return x.status==="owner_approval" || (x.owner_approval_required&&!x.owner_approved_at);
    if(state.filter==="implementing") return x.status==="implementing";
    if(state.filter==="verification") return x.status==="verification";
    if(state.filter==="cancellation") return ["cancellation","handoff"].includes(x.change_type);
    if(state.filter==="completed") return x.status==="completed";
    return true;
  }

  function renderList() {
    const items=(state.overview?.requests||[]).filter(matchesFilter);
    if(!items.length){
      $("c10List").innerHTML=`
        <div class="c10-empty">
          <strong>現在、この条件の契約変更案件はありません。</strong>
          <span>契約後に機能追加・サービス追加・料金変更・解約などが発生したら「契約変更を登録」から開始します。</span>
        </div>
      `;
      return;
    }

    $("c10List").innerHTML=items.map((x)=>{
      const due=x.desired_effective_on&&String(x.desired_effective_on)<=todayIso()&& !["completed","rejected","cancelled"].includes(x.status);
      return `
        <article class="c10-card ${due?"urgent":""}">
          <div class="c10-main">
            <small>${esc(x.change_code)} / ${esc(x.contract_code||"")}</small>
            <strong>${esc(x.client_name)}｜${esc(x.title)}</strong>
            <span>${esc(TYPE_LABELS[x.change_type]||x.change_type)} / ${esc(x.system_name||x.contract_name||"")}</span>
          </div>
          <div class="c10-cell">
            ${pill(STATUS_LABELS[x.status]||x.status,statusTone(x.status))}
            <span>進行状態</span>
          </div>
          <div class="c10-cell">
            <b>${esc(fmtDate(x.desired_effective_on))}</b>
            <span>適用予定</span>
          </div>
          <div class="c10-cell">
            <b>${Number(x.feature_change_count||0)}機能 / ${Number(x.service_change_count||0)}サービス</b>
            <span>変更内容</span>
          </div>
          <div class="c10-cell">
            <b>${Number(x.open_task_count||0)}件</b>
            <span>未完了タスク</span>
          </div>
          <button class="btn primary" type="button" data-c10-open="${esc(x.id)}">変更内容を開く</button>
        </article>
      `;
    }).join("");

    $$("[data-c10-open]",$("c10List")).forEach((b)=>{
      b.addEventListener("click",()=>openDetail(b.dataset.c10Open));
    });
  }

  function openNewModal() {
    const contracts=state.overview?.contracts||[];
    if(!contracts.length){
      alert("変更対象にできる契約がありません。先に「契約・サービス」で契約を登録してください。");
      return;
    }

    document.querySelectorAll('#c10NewModal,[data-c10-new-modal="true"]').forEach((el)=>el.remove());

    const modal=document.createElement("div");
    modal.id="c10NewModal";
    modal.className="c10-modal";
    modal.dataset.c10NewModal="true";
    modal.innerHTML=`
      <div class="c10-modal-card" role="dialog" aria-modal="true" aria-labelledby="c10NewModalTitle">
        <div class="c10-modal-head">
          <div>
            <p class="eyebrow">CONTRACT CHANGE</p>
            <h2 id="c10NewModalTitle">契約変更を登録</h2>
          </div>
          <button class="c10-close" type="button" data-c10-modal-close aria-label="閉じる">×</button>
        </div>

        <div data-c10-new-form>
          <div class="c10-grid" style="margin-top:14px">
            <div class="c10-field full">
              <label>変更対象の契約</label>
              <select id="c10NewContract">
                ${contracts.map((c)=>{
                  const r=contractReadiness(c);
                  const link=r.projectLinked?"制作案件あり":"制作案件未紐付";
                  return `<option value="${esc(c.contract_id)}">${esc(c.client_name)}｜${esc(c.contract_name)}｜${esc(c.contract_code)}［${esc(link)}］</option>`;
                }).join("")}
              </select>
            </div>

            <div id="c10ContractReadiness" class="c10-readiness full"></div>

            <div class="c10-field">
              <label>変更種別</label>
              <select id="c10NewType">
                ${Object.entries(TYPE_LABELS).map(([v,l])=>`<option value="${v}">${esc(l)}</option>`).join("")}
              </select>
            </div>

            <div class="c10-field">
              <label>適用希望日</label>
              <input id="c10NewEffective" type="date" value="${todayIso()}">
            </div>

            <div class="c10-field">
              <label>オーナー承認</label>
              <select id="c10NewApproval">
                <option value="true">必要</option>
                <option value="false">不要</option>
              </select>
            </div>

            <div class="c10-field full">
              <label>件名</label>
              <input id="c10NewTitle" maxlength="120" placeholder="例：写真共有機能を追加">
            </div>

            <div class="c10-field full">
              <label>依頼内容</label>
              <textarea id="c10NewSummary" placeholder="オーナーからの依頼内容・変更理由"></textarea>
            </div>

            <div class="c10-actions full">
              <button id="c10Create" class="btn primary" type="button">下書きを作成</button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const close=()=>modal.remove();
    modal.querySelector("[data-c10-modal-close]")?.addEventListener("click",close);
    modal.addEventListener("click",(event)=>{
      if(event.target===modal) close();
    });

    const contractEl=modal.querySelector("#c10NewContract");
    const typeEl=modal.querySelector("#c10NewType");
    const effectiveEl=modal.querySelector("#c10NewEffective");

    const refreshForm=()=>{
      const t=typeEl.value;
      const required=["feature_change","service_change","fee_change","pause","resume","cancellation"].includes(t);
      effectiveEl.disabled=!required;
      if(!required) effectiveEl.value="";
      else if(!effectiveEl.value) effectiveEl.value=todayIso();
      renderNewContractReadiness(modal);
    };

    contractEl?.addEventListener("change",refreshForm);
    typeEl?.addEventListener("change",refreshForm);
    modal.querySelector("#c10Create")?.addEventListener("click",createChange);
    refreshForm();
  }

  function renderNewContractReadiness(modal=document) {
    const contractEl=modal.querySelector?.("#c10NewContract")||$("c10NewContract");
    const typeEl=modal.querySelector?.("#c10NewType")||$("c10NewType");
    const host=modal.querySelector?.("#c10ContractReadiness")||$("c10ContractReadiness");
    const button=modal.querySelector?.("#c10Create")||$("c10Create");
    if(!contractEl||!typeEl||!host||!button) return;

    const c=contractById(contractEl.value);
    const r=contractReadiness(c);
    const type=typeEl.value;
    const featureBlocked=type==="feature_change"&&!r.featureChangeAllowed;
    const contractBlocked=!r.contractUsable;
    const blocked=featureBlocked||contractBlocked;

    let note="";
    if(contractBlocked){
      note="この契約は終了済みのため、新しい変更案件を登録できません。";
    } else if(type==="feature_change"&&!r.projectLinked){
      note="Feature変更には制作案件の紐付けが必要です。先に「制作中・契約者」でこの契約の制作案件を登録・紐付けしてください。";
    } else if(type==="feature_change"&&r.projectLinked&&!r.systemLinked){
      note="Feature変更の下書きは作成できます。ただしシステム台帳が未紐付けなので、本番反映前に紐付け確認が必要です。";
    } else if(type==="feature_change"){
      note="Feature変更の下書きを作成できます。完了確定までは既存Featureへ反映しません。";
    } else {
      note="この変更種別は登録できます。契約内容への反映は変更案件を完了するまで行いません。";
    }

    host.innerHTML=`
      <div class="c10-readiness-title">
        <strong>この契約の連動状態</strong>
        <span>${esc(c?.contract_code||"—")}</span>
      </div>
      <div class="c10-readiness-grid">
        <div class="c10-readiness-item"><small>契約台帳</small><b>${readinessPill(r.contractUsable,"登録済","要確認")}</b></div>
        <div class="c10-readiness-item"><small>制作案件</small><b>${readinessPill(r.projectLinked,"紐付済","未紐付",true)}</b></div>
        <div class="c10-readiness-item"><small>システム台帳</small><b>${readinessPill(r.systemLinked,"紐付済","未紐付",true)}</b></div>
        <div class="c10-readiness-item"><small>Feature変更</small><b>${readinessPill(r.featureChangeAllowed,"下書き可","利用不可",true)}</b></div>
      </div>
      <div class="c10-readiness-note ${blocked?"warn":"ok"}">${esc(note)}</div>
    `;

    button.disabled=blocked;
    button.textContent=featureBlocked?"制作案件の紐付けが必要":contractBlocked?"この契約は変更不可":"下書きを作成";
  }

  async function createChange() {
    const contractSelect=$("c10NewContract");
    const contractId=contractSelect?.value||"";
    const contract=contractById(contractId);
    const readiness=contractReadiness(contract);
    const projectId=contract?.project_id||null;
    const changeType=$("c10NewType")?.value||"";
    const title=$("c10NewTitle")?.value.trim()||"";

    if(!contractId||!contract){
      alert("変更対象の契約を確認してください。");
      return;
    }

    if(!title){
      alert("件名を入力してください。");
      return;
    }

    if(!readiness.contractUsable){
      alert("この契約は終了済みのため、新しい変更案件を登録できません。");
      return;
    }

    if(changeType==="feature_change"&&!readiness.featureChangeAllowed){
      renderNewContractReadiness($("c10NewModal")||document);
      return;
    }

    const button=$("c10Create");
    button.disabled=true;
    button.textContent="作成中…";

    try {
      const sb=await client();
      const payload={
        change_type:changeType,
        title,
        request_summary:$("c10NewSummary").value.trim(),
        desired_effective_on:$("c10NewEffective").value||"",
        owner_approval_required:$("c10NewApproval").value==="true",
      };

      const {data,error}=await sb.rpc("cc_center10_create_change",{
        p_contract_id:contractId,
        p_project_id:projectId||null,
        p_payload:payload
      });
      if(error) throw error;

      $("c10NewModal")?.remove();
      await loadOverview();
      await openDetail(data.change_request_id);
    } catch(error) {
      alert(error.message||"契約変更を登録できませんでした。");
    } finally {
      const modal=$("c10NewModal");
      if(modal) renderNewContractReadiness(modal);
    }
  }

  async function openDetail(id) {
    state.selectedId=id;
    const sb=await client();
    $("c10Detail").innerHTML='<div class="c10-empty" style="margin-top:12px">変更内容を読み込んでいます…</div>';

    const {data,error}=await sb.rpc("cc_center10_get_detail",{
      p_change_request_id:id
    });

    if(error){
      $("c10Detail").innerHTML=`<div class="c10-empty" style="margin-top:12px"><strong>変更内容を開けません</strong><span>${esc(error.message)}</span></div>`;
      return;
    }

    state.detail=data||{};
    renderDetail();
    $("c10Detail").scrollIntoView({behavior:"smooth",block:"start"});
  }

  function editableStatus(r) {
    return ["draft","review","owner_approval"].includes(r.status)&&canWrite();
  }

  function workflow(r) {
    const order=["draft","owner_approval","approved","implementing","verification","completed"];
    let current=order.indexOf(r.status);
    if(r.status==="review") current=1;
    return order.map((s,i)=>`
      <div class="c10-step ${i<current?"done":i===current?"current":""}">
        ${esc(STATUS_LABELS[s]||s)}
      </div>
    `).join("");
  }

  function renderDetail() {
    const d=state.detail||{};
    const r=d.request||{};
    const edit=editableStatus(r);
    const featureMode=r.change_type==="feature_change";
    const serviceMode=r.change_type==="service_change";
    const feeMode=r.change_type==="fee_change";
    const handoffMode=["cancellation","handoff"].includes(r.change_type);
    const tasks=d.tasks||[];

    const selectedFeatureMap=new Map((d.feature_changes||[]).map((x)=>[x.feature_code,x]));

    $("c10Detail").innerHTML=`
      <div class="c10-detail">
        <div class="c10-hero">
          <div>
            <small>${esc(r.change_code)} / ${esc(r.contract_code||"")}</small>
            <strong>${esc(r.client_name)}｜${esc(r.title)}</strong>
            <span>${esc(TYPE_LABELS[r.change_type]||r.change_type)} / ${esc(r.contract_name||"")}${r.system_name?` / ${esc(r.system_name)}`:""}</span>
          </div>
          <div class="c10-hero-status">${pill(STATUS_LABELS[r.status]||r.status,statusTone(r.status))}</div>
        </div>

        <div class="c10-flow">${workflow(r)}</div>

        <section class="c10-section">
          <h3>1. 変更内容</h3>
          <p>「完了」するまでは既存契約へ反映されません。承認後の内容変更は一度取消して新しい変更案件として登録します。</p>

          <div class="c10-grid">
            <div class="c10-field">
              <label>件名</label>
              <input id="c10Title" value="${esc(r.title||"")}" ${edit?"":"disabled"}>
            </div>
            <div class="c10-field">
              <label>変更種別</label>
              <input value="${esc(TYPE_LABELS[r.change_type]||r.change_type)}" disabled>
            </div>
            <div class="c10-field">
              <label>適用希望日</label>
              <input id="c10Effective" type="date" value="${esc(r.desired_effective_on||"")}" ${edit?"":"disabled"}>
            </div>

            <div class="c10-field full">
              <label>依頼内容</label>
              <textarea id="c10SummaryText" ${edit?"":"disabled"}>${esc(r.request_summary||"")}</textarea>
            </div>

            <div class="c10-field full">
              <label>変更理由・背景</label>
              <textarea id="c10Reason" ${edit?"":"disabled"}>${esc(r.reason||"")}</textarea>
            </div>
          </div>
        </section>

        ${feeMode?`
          <section class="c10-section">
            <h3>2. 料金変更</h3>
            <p>現行料金を確認し、変更後の金額を記録します。適用完了時に契約台帳へ反映します。</p>
            <div class="c10-grid">
              <div class="c10-field"><label>現在の初期費用</label><input value="${esc(yen(r.current_setup_fee_yen))}" disabled></div>
              <div class="c10-field"><label>変更後の初期費用</label><input id="c10SetupFee" type="number" min="0" value="${esc(r.proposed_setup_fee_yen??"")}" ${edit?"":"disabled"}></div>
              <div class="c10-field"><label>現在の月額</label><input value="${esc(yen(r.current_monthly_fee_yen))}" disabled></div>
              <div class="c10-field"><label>変更後の月額</label><input id="c10MonthlyFee" type="number" min="0" value="${esc(r.proposed_monthly_fee_yen??"")}" ${edit?"":"disabled"}></div>
            </div>
          </section>
        `:""}

        ${featureMode?`
          <section class="c10-section">
            <h3>2. Feature追加・削除</h3>
            <p>現在のON/OFFと変更後を比較します。チェックを変えたFeatureだけ変更明細として保存します。</p>
            <div class="c10-features">
              ${(d.current_features||[]).map((f)=>{
                const ch=selectedFeatureMap.get(f.feature_code);
                const proposed=ch?Boolean(ch.proposed_enabled):Boolean(f.enabled);
                const changed=proposed!==Boolean(f.enabled);
                return `
                  <article class="c10-feature ${changed?"changed":""}" data-c10-feature-row="${esc(f.feature_code)}" data-original="${f.enabled?"true":"false"}">
                    <label class="c10-feature-head">
                      <input type="checkbox" data-c10-feature="${esc(f.feature_code)}" ${proposed?"checked":""} ${edit?"":"disabled"}>
                      <span>
                        <strong>${esc(f.feature_name)}</strong>
                        <small>現在：${f.enabled?"ON":"OFF"} / ${esc(f.category||"")}</small>
                      </span>
                    </label>
                    <textarea data-c10-feature-note="${esc(f.feature_code)}" placeholder="実装・設定メモ" ${edit?"":"disabled"}>${esc(ch?.implementation_note||"")}</textarea>
                  </article>
                `;
              }).join("")}
            </div>
          </section>
        `:""}

        ${serviceMode?`
          <section class="c10-section">
            <h3>2. 契約サービス変更</h3>
            <p>追加・料金更新・終了を変更明細として保存します。既存サービス終了時は対象明細を選びます。</p>
            <div id="c10ServiceRows">
              ${renderServiceRows(d,edit)}
            </div>
            ${edit?'<div class="c10-actions"><button id="c10AddServiceRow" class="btn secondary" type="button">＋ サービス変更を追加</button></div>':""}
          </section>
        `:""}

        ${handoffMode?`
          <section class="c10-section">
            <h3>2. 解約・引き継ぎ確認</h3>
            <p>「所有者を確認した」ことを残すチェックです。外部資産を自動削除・自動移管するものではありません。</p>

            <div class="c10-grid">
              ${r.change_type==="cancellation"?`
                <div class="c10-field full">
                  <label>解約理由</label>
                  <textarea id="c10CancellationReason" ${edit?"":"disabled"}>${esc(r.cancellation_reason||"")}</textarea>
                </div>
              `:""}

              <div class="c10-field full">
                <label>契約上の引き継ぎ範囲</label>
                <textarea id="c10HandoffScope" placeholder="例：オーナー所有ドメインは継続、DPRO管理資産は契約条件に従う 等" ${edit?"":"disabled"}>${esc(r.handoff_scope||"")}</textarea>
              </div>
            </div>

            <div class="c10-checklist">
              ${Object.entries(HANDOFF_LABELS).map(([key,label])=>`
                <label class="c10-check">
                  <input type="checkbox" data-c10-handoff="${esc(key)}" ${r.handoff_checklist?.[key]?"checked":""} ${edit?"":"disabled"}>
                  <span><strong>${esc(label)}</strong><small>${key.includes("ownership")?"所有者・権限を契約内容と照合します。":"実施内容または対象外理由を確認します。"}</small></span>
                </label>
              `).join("")}
            </div>
          </section>
        `:""}

        <section class="c10-section">
          <h3>3. 承認・実装</h3>
          <p>オーナー承認が必要な案件は承認記録を残してから社内承認します。承認時に既存タスク管理へ実装・契約タスクを自動作成します。</p>

          <div class="c10-grid">
            <div class="c10-field">
              <label>オーナー承認</label>
              <input value="${r.owner_approval_required?(r.owner_approved_at?`確認済み ${fmtDateTime(r.owner_approved_at)}`:"必要・未確認"):"不要"}" disabled>
            </div>
            <div class="c10-field">
              <label>オーナー承認記録</label>
              <input id="c10OwnerApprovalRef" value="${esc(r.owner_approval_reference||"")}" placeholder="例：LINE 2026/08/20、メール件名" ${["draft","review","owner_approval"].includes(r.status)&&canWrite()?"":"disabled"}>
            </div>
            <div class="c10-field">
              <label>社内承認</label>
              <input value="${r.internal_approved_at?`承認済み ${fmtDateTime(r.internal_approved_at)}`:"未承認"}" disabled>
            </div>
          </div>

          <div>
            ${tasks.length?tasks.map((t)=>`
              <div class="c10-history-task">
                <strong>${esc(t.task_code)}</strong>
                ${pill(t.status,t.status==="done"?"green":t.status==="cancelled"?"gray":"amber")}
                <span>${esc(t.title)}</span>
                <small>${esc(fmtDateTime(t.due_at))}</small>
              </div>
            `).join(""):'<div class="c10-empty" style="margin-top:8px"><strong>まだ実装タスクはありません。</strong><span>社内承認すると既存のタスク管理へ自動作成します。</span></div>'}
          </div>
        </section>

        <section class="c10-section">
          <h3>4. 操作</h3>
          <p>${actionHint(r)}</p>
          <div class="c10-actions">
            ${edit?'<button id="c10Save" class="btn secondary" type="button">変更内容を保存</button>':""}
            ${["draft"].includes(r.status)?'<button id="c10Submit" class="btn primary" type="button">確認へ進む</button>':""}
            ${["draft","review","owner_approval"].includes(r.status)&&canWrite()?'<button id="c10OwnerApprove" class="btn secondary" type="button">オーナー承認を記録</button>':""}
            ${["review","owner_approval"].includes(r.status)&&isOwnerAdmin()?'<button id="c10Approve" class="btn primary" type="button">社内承認</button>':""}
            ${r.status==="approved"&&canWrite()?'<button id="c10Start" class="btn primary" type="button">実装・対応開始</button>':""}
            ${["approved","implementing","verification"].includes(r.status)&&isOwnerAdmin()?'<button id="c10Apply" class="btn primary" type="button">適用・完了判定</button>':""}
            ${!["completed","rejected","cancelled"].includes(r.status)&&isOwnerAdmin()?'<button id="c10Reject" class="btn secondary" type="button">見送り</button>':""}
          </div>
        </section>
      </div>
    `;

    bindDetailActions();
  }

  function actionHint(r) {
    if(r.status==="draft") return "変更内容を保存し、問題なければ確認へ進めます。";
    if(r.status==="owner_approval") return "オーナーの承認記録を残してください。";
    if(r.status==="review") return "内容とオーナー承認を確認し、管理責任者が社内承認します。";
    if(r.status==="approved") return "承認済みです。実装・契約変更作業を開始してください。";
    if(r.status==="implementing") return "自動作成されたタスクを完了後、「適用・完了判定」を実行します。";
    if(r.status==="verification") return "変更は反映済みです。制作・納品で追加STEP/標準チェックを完了後、もう一度完了判定します。";
    if(r.status==="completed") return "この変更は完了し、履歴として保存されています。";
    return "この変更案件は終了しています。";
  }

  function renderServiceRows(d,edit) {
    const existing=d.service_changes||[];
    if(!existing.length) return edit?serviceRowHtml(d,null,0):'<div class="c10-empty">サービス変更明細はありません。</div>';
    return existing.map((x,i)=>serviceRowHtml(d,x,i)).join("");
  }

  function serviceRowHtml(d,row,index) {
    const catalog=d.service_catalog||[];
    const items=d.contract_items||[];
    return `
      <div class="c10-service-row" data-c10-service-row>
        <select data-c10-service-id>
          ${catalog.map((s)=>`<option value="${esc(s.id)}" ${row?.service_id===s.id?"selected":""}>${esc(s.service_name)}</option>`).join("")}
        </select>
        <select data-c10-service-action>
          <option value="add" ${row?.change_action==="add"?"selected":""}>追加</option>
          <option value="update" ${row?.change_action==="update"?"selected":""}>料金・数量更新</option>
          <option value="end" ${row?.change_action==="end"?"selected":""}>終了</option>
        </select>
        <input data-c10-service-qty type="number" min="1" value="${esc(row?.proposed_quantity??1)}" placeholder="数量">
        <input data-c10-service-setup type="number" min="0" value="${esc(row?.proposed_setup_fee_yen??"")}" placeholder="初期費用">
        <input data-c10-service-monthly type="number" min="0" value="${esc(row?.proposed_monthly_fee_yen??"")}" placeholder="月額">
        <select data-c10-contract-item>
          <option value="">既存明細なし</option>
          ${items.map((ci)=>`<option value="${esc(ci.id)}" ${row?.contract_item_id===ci.id?"selected":""}>${esc(ci.service_name)} / ${esc(ci.status)}</option>`).join("")}
        </select>
      </div>
    `;
  }

  function collectPayload() {
    const r=state.detail?.request||{};
    const checklist={...(r.handoff_checklist||{})};
    $$("[data-c10-handoff]",$("c10Detail")).forEach((x)=>{
      checklist[x.dataset.c10Handoff]=Boolean(x.checked);
    });

    return {
      title:$("c10Title")?.value?.trim()||r.title||"",
      request_summary:$("c10SummaryText")?.value?.trim()||"",
      reason:$("c10Reason")?.value?.trim()||"",
      desired_effective_on:$("c10Effective")?.value||"",
      owner_approval_required:Boolean(r.owner_approval_required),
      proposed_setup_fee_yen:$("c10SetupFee")?.value||"",
      proposed_monthly_fee_yen:$("c10MonthlyFee")?.value||"",
      cancellation_reason:$("c10CancellationReason")?.value?.trim()||"",
      handoff_scope:$("c10HandoffScope")?.value?.trim()||"",
      handoff_checklist:checklist,
      internal_note:r.internal_note||"",
    };
  }

  function collectFeatureChanges() {
    const items=[];
    $$("[data-c10-feature-row]",$("c10Detail")).forEach((row)=>{
      const code=row.dataset.c10FeatureRow;
      const original=row.dataset.original==="true";
      const input=row.querySelector("[data-c10-feature]");
      const proposed=Boolean(input?.checked);
      if(original!==proposed){
        items.push({
          feature_code:code,
          proposed_enabled:proposed,
          implementation_note:row.querySelector("[data-c10-feature-note]")?.value?.trim()||"",
        });
      }
    });
    return items;
  }

  function collectServiceChanges() {
    return $$("[data-c10-service-row]",$("c10Detail")).map((row)=>({
      service_id:row.querySelector("[data-c10-service-id]")?.value||"",
      change_action:row.querySelector("[data-c10-service-action]")?.value||"add",
      proposed_quantity:row.querySelector("[data-c10-service-qty]")?.value||"",
      proposed_setup_fee_yen:row.querySelector("[data-c10-service-setup]")?.value||"",
      proposed_monthly_fee_yen:row.querySelector("[data-c10-service-monthly]")?.value||"",
      contract_item_id:row.querySelector("[data-c10-contract-item]")?.value||"",
    }));
  }

  function bindDetailActions() {
    $("c10AddServiceRow")?.addEventListener("click",()=>{
      const wrap=$("c10ServiceRows");
      wrap.insertAdjacentHTML("beforeend",serviceRowHtml(state.detail,null,Date.now()));
    });

    $("c10Save")?.addEventListener("click",saveDetail);
    $("c10Submit")?.addEventListener("click",async()=>{
      if($("c10Save")) await saveDetail(false);
      await action("submit");
    });
    $("c10OwnerApprove")?.addEventListener("click",recordOwnerApproval);
    $("c10Approve")?.addEventListener("click",()=>action("approve"));
    $("c10Start")?.addEventListener("click",()=>action("start"));
    $("c10Reject")?.addEventListener("click",()=>{
      if(confirm("この変更案件を見送りにしますか？")) action("reject");
    });
    $("c10Apply")?.addEventListener("click",applyOrComplete);

    $$("[data-c10-feature]",$("c10Detail")).forEach((input)=>{
      input.addEventListener("change",()=>{
        const row=input.closest("[data-c10-feature-row]");
        row?.classList.toggle("changed",(row.dataset.original==="true")!==input.checked);
      });
    });
  }

  async function saveDetail(showAlert=true) {
    const r=state.detail?.request||{};
    const button=$("c10Save");
    if(button){
      button.disabled=true;
      button.textContent="保存中…";
    }

    try{
      const sb=await client();

      const features=r.change_type==="feature_change"?collectFeatureChanges():[];
      const services=r.change_type==="service_change"?collectServiceChanges():[];

      const {error}=await sb.rpc("cc_center10_save_change",{
        p_change_request_id:r.id,
        p_payload:collectPayload(),
        p_feature_changes:features,
        p_service_changes:services,
      });
      if(error) throw error;

      await loadOverview();
      await openDetail(r.id);
      if(showAlert) alert("変更内容を保存しました。");
    }catch(error){
      alert(error.message||"変更内容を保存できませんでした。");
      throw error;
    }finally{
      if($("c10Save")){
        $("c10Save").disabled=false;
        $("c10Save").textContent="変更内容を保存";
      }
    }
  }

  async function recordOwnerApproval() {
    const r=state.detail?.request||{};
    const ref=$("c10OwnerApprovalRef")?.value?.trim()||"";
    if(!ref){
      alert("オーナー承認の確認元を入力してください。例：LINE 2026/08/20、メール件名など");
      return;
    }

    try{
      const sb=await client();
      const {error}=await sb.rpc("cc_center10_record_owner_approval",{
        p_change_request_id:r.id,
        p_reference:ref,
      });
      if(error) throw error;
      await loadOverview();
      await openDetail(r.id);
    }catch(error){
      alert(error.message||"オーナー承認を記録できませんでした。");
    }
  }

  async function action(name) {
    const r=state.detail?.request||{};
    try{
      const sb=await client();
      const {error}=await sb.rpc("cc_center10_change_action",{
        p_change_request_id:r.id,
        p_action:name,
      });
      if(error) throw error;
      await loadOverview();
      await openDetail(r.id);
    }catch(error){
      alert(error.message||"状態を更新できませんでした。");
    }
  }

  async function applyOrComplete() {
    const r=state.detail?.request||{};
    const text=r.change_type==="cancellation"
      ?"解約確定"
      :"変更適用";

    const input=prompt(
      `既存契約へ実際に反映します。\n誤操作防止のため「${text}」と入力してください。`
    );
    if(input!==text) return;

    try{
      const sb=await client();
      const {data,error}=await sb.rpc("cc_center10_apply_or_complete",{
        p_change_request_id:r.id
      });
      if(error) throw error;

      await loadOverview();
      await openDetail(r.id);

      if(data?.verification_required){
        alert(
          `変更を反映しました。\n制作・納品で追加確認が必要です。\n必須STEP ${data.blocking_steps_open}件 / 標準チェック ${data.blocking_checks_open}件`
        );
      }else{
        alert("契約変更を完了しました。履歴として保存されています。");
      }
    }catch(error){
      alert(error.message||"変更を適用できませんでした。");
    }
  }

  function boot() {
    installStyle();

    let observer=null;
    let timer=null;
    let stopped=false;

    const cleanup=()=>{
      if(stopped) return;
      stopped=true;
      if(observer) observer.disconnect();
      if(timer) clearInterval(timer);
    };

    const attempt=()=>{
      if(installPanel()){
        cleanup();
        return true;
      }
      return false;
    };

    if(attempt()) return;

    observer=new MutationObserver(attempt);
    observer.observe(document.documentElement,{childList:true,subtree:true});

    timer=setInterval(attempt,250);
    setTimeout(cleanup,60000);
  }

  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",boot,{once:true});
  else boot();
})();
