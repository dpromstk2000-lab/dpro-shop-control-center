(() => {
  "use strict";

  if (window.__DPRO_CENTER10_CONTRACT_START_R8__) return;
  window.__DPRO_CENTER10_CONTRACT_START_R8__ = true;

  const BUILD = "CONTROL-CENTER-40-CENTER10-R7-R8-CONTRACT-START-20260810";
  const CONFIG = window.DPRO_CONTROL_CENTER_CONFIG || {};
  const $ = (id) => document.getElementById(id);
  const $$ = (selector, scope=document) => Array.from(scope.querySelectorAll(selector));

  const state = {
    supabase:null,
    session:null,
    data:null,
    scope:"production",
    phase:"all",
    search:"",
    loaded:false,
  };

  const PHASE_LABELS = {
    excluded_demo:"DEMO / TEST",
    contract:"契約確定待ち",
    start_date:"開始日確認",
    owner_confirmation:"オーナー確認待ち",
    contact:"担当者確認",
    service:"サービス確認",
    site:"対象拠点確認",
    project:"制作開始待ち",
    ready_to_start:"開始可能",
  };

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }

  function formatDate(value) {
    if(!value) return "—";
    const raw=String(value).slice(0,10);
    const d=new Date(`${raw}T00:00:00`);
    if(Number.isNaN(d.getTime())) return raw;
    return new Intl.DateTimeFormat("ja-JP",{year:"numeric",month:"2-digit",day:"2-digit"}).format(d);
  }

  function syncVersion() {
    const version=document.querySelector(".sidebar .version");
    if(version){
      version.innerHTML='CONTROL-CENTER-40<br><span>CENTER-10-R7-R8</span>';
    }
  }

  async function fetchPublicConfig() {
    const base=String(CONFIG.apiBaseUrl||"").replace(/\/$/,"");
    const response=await fetch(`${base}/api/public-config`,{cache:"no-store"});
    const data=await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(data.message||data.error||`HTTP ${response.status}`);
    return data;
  }

  async function supabaseClient() {
    if(state.supabase) return state.supabase;
    if(!window.supabase?.createClient) throw new Error("Supabase clientを確認できません。");

    const pub=await fetchPublicConfig();
    state.supabase=window.supabase.createClient(
      pub.supabaseUrl,
      pub.supabasePublishableKey||pub.supabaseAnonKey,
      {
        auth:{
          persistSession:true,
          autoRefreshToken:false,
          detectSessionInUrl:false,
          storageKey:pub.sessionStorageKey||"dpro-control-center-auth-v1",
        }
      }
    );

    const {data,error}=await state.supabase.auth.getSession();
    if(error) throw error;
    state.session=data?.session||null;
    if(!state.session?.user) throw new Error("CONTROL CENTERへログインしてください。");
    return state.supabase;
  }

  function installStyle() {
    if($("c10R8Style")) return;
    const style=document.createElement("style");
    style.id="c10R8Style";
    style.textContent=`
      .c10-r8-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-end;margin-bottom:14px}
      .c10-r8-head h2{margin:0;font-size:24px}.c10-r8-head p{margin:6px 0 0;color:#68766f;font-size:11px;line-height:1.7}
      .c10-r8-pill{display:inline-flex;padding:6px 9px;border-radius:999px;background:#e1f5eb;color:#08664b;font-size:9px;font-weight:900}
      .c10-r8-guide{padding:14px 15px;border:1px solid #b9dccd;border-radius:13px;background:#eef9f4;color:#466057;font-size:11px;line-height:1.75}
      .c10-r8-safety{margin-top:8px;padding:12px 14px;border:1px solid #d7e3eb;border-radius:12px;background:#f5f9fc;color:#516b79;font-size:10px;line-height:1.7}
      .c10-r8-metrics{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:9px;margin:13px 0}
      .c10-r8-metric{padding:15px;border:1px solid #d9e5e0;border-radius:13px;background:#fff;min-width:0}
      .c10-r8-metric b,.c10-r8-metric span,.c10-r8-metric small{display:block}.c10-r8-metric b{font-size:22px;color:#0b5f49}.c10-r8-metric span{font-size:10px;font-weight:900;margin-top:5px}.c10-r8-metric small{font-size:8px;color:#74817c;margin-top:3px}
      .c10-r8-toolbar{display:grid;grid-template-columns:minmax(260px,1fr) 190px 190px auto;gap:9px;margin:12px 0}
      .c10-r8-toolbar input,.c10-r8-toolbar select{min-height:45px;border:1px solid #d5e3dd;border-radius:11px;background:#fff;padding:0 12px;font:inherit}
      .c10-r8-list{display:grid;gap:11px}.c10-r8-card{padding:15px;border:1px solid #d9e5e0;border-radius:15px;background:#fff}.c10-r8-card.demo{background:#f8fafc;border-color:#d6e1e8}
      .c10-r8-card-head{display:flex;justify-content:space-between;gap:13px;align-items:flex-start}.c10-r8-code{font-size:9px;font-weight:900;color:#2d6757;letter-spacing:.07em}.c10-r8-card h3{margin:4px 0 3px;font-size:17px;color:#102d25}.c10-r8-sub{font-size:10px;color:#6a7973;line-height:1.6}
      .c10-r8-phase{padding:6px 9px;border-radius:999px;background:#edf2f0;color:#61706a;font-size:9px;font-weight:900;white-space:nowrap}.c10-r8-phase.ready{background:#def5ea;color:#087253}.c10-r8-phase.demo{background:#edf2f6;color:#596f7c}
      .c10-r8-progress{display:flex;align-items:center;gap:10px;margin:12px 0 9px}.c10-r8-progress-bar{height:8px;flex:1;border-radius:999px;background:#edf2ef;overflow:hidden}.c10-r8-progress-bar i{display:block;height:100%;background:#15936a;border-radius:999px}.c10-r8-progress strong{font-size:11px;color:#0b5f49}
      .c10-r8-stages{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:7px}.c10-r8-stage{padding:10px;border:1px solid #e0e8e4;border-radius:10px;background:#fff;min-height:78px}.c10-r8-stage.ok{background:#f8fcfa;border-color:#a8d7c1}.c10-r8-stage.wait{background:#fffdf7;border-color:#e7ce86}.c10-r8-stage.off{background:#f6f8f9;border-color:#dce4e8}
      .c10-r8-stage strong,.c10-r8-stage span,.c10-r8-stage small{display:block}.c10-r8-stage strong{font-size:9px}.c10-r8-stage span{font-size:9px;font-weight:900;margin-top:5px}.c10-r8-stage.ok span{color:#087253}.c10-r8-stage.wait span{color:#916200}.c10-r8-stage.off span{color:#687b86}.c10-r8-stage small{font-size:8px;color:#77847f;margin-top:3px;line-height:1.45}
      .c10-r8-services{display:flex;gap:6px;flex-wrap:wrap;margin-top:9px}.c10-r8-service{display:inline-flex;padding:5px 8px;border-radius:999px;background:#f0f5f2;color:#48675d;font-size:8px;font-weight:800}
      .c10-r8-next{margin-top:9px;padding:11px 12px;border-radius:10px;background:#f2f7f5;color:#38594e;font-size:10px;line-height:1.65}.c10-r8-next strong{color:#0b5f49}
      .c10-r8-actions{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:9px}.c10-r8-empty{padding:22px;border:1px dashed #c6d5ce;border-radius:13px;background:#fff;text-align:center;color:#687872;font-size:12px;line-height:1.8}.c10-r8-empty button{margin-top:10px}
      @media(max-width:1250px){.c10-r8-metrics{grid-template-columns:repeat(3,1fr)}.c10-r8-stages{grid-template-columns:repeat(4,1fr)}}
      @media(max-width:900px){.c10-r8-stages{grid-template-columns:repeat(2,1fr)}.c10-r8-toolbar{grid-template-columns:1fr 1fr}}
      @media(max-width:720px){.c10-r8-head{display:block}.c10-r8-metrics,.c10-r8-stages,.c10-r8-toolbar{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function installPanel() {
    const tabs=document.querySelector(".tabs");
    const projectTab=document.querySelector('.tabs .tab[data-tab="projects"]');
    const projectPanel=$("panel-projects");
    if(!tabs || !projectTab || !projectPanel) return false;
    if($("panel-contract-start")) return true;

    const button=document.createElement("button");
    button.className="tab";
    button.type="button";
    button.dataset.tab="contract-start";
    button.dataset.center10ContractStartR8="true";
    button.textContent="契約開始ナビ";
    projectTab.insertAdjacentElement("afterend",button);

    const panel=document.createElement("section");
    panel.id="panel-contract-start";
    panel.className="tab-panel hidden";
    panel.innerHTML=`
      <div class="c10-r8-head">
        <div>
          <h2>契約開始ナビ</h2>
          <p>正式契約が入った直後に、最初に何を確認・登録すべきかを順番に案内します。</p>
        </div>
        <span class="c10-r8-pill">CENTER-10 R7-R8</span>
      </div>

      <div class="c10-r8-guide">
        正式契約 → 開始日 → オーナー確認 → 担当者 → 契約サービス → 対象拠点 → 制作開始の順で確認します。
        <strong>制作案件がまだ無い正式契約も、契約データから自動で拾います。</strong>
      </div>

      <div class="c10-r8-safety">
        この画面は診断専用です。契約状態の変更、制作案件の自動作成、本番環境の作成、本番稼働への切替は行いません。
      </div>

      <div id="c10R8Metrics" class="c10-r8-metrics"></div>

      <div class="c10-r8-toolbar">
        <input id="c10R8Search" type="search" placeholder="顧客名・契約名・契約コードで検索">
        <select id="c10R8Scope">
          <option value="production">実契約のみ</option>
          <option value="demo">DEMO / TEST検査</option>
          <option value="all">すべて表示</option>
        </select>
        <select id="c10R8Phase">
          <option value="all">すべての段階</option>
          <option value="contract">契約確定待ち</option>
          <option value="start_date">開始日確認</option>
          <option value="owner_confirmation">オーナー確認待ち</option>
          <option value="contact">担当者確認</option>
          <option value="service">サービス確認</option>
          <option value="site">対象拠点確認</option>
          <option value="project">制作開始待ち</option>
          <option value="ready_to_start">開始可能</option>
          <option value="excluded_demo">DEMO / TEST</option>
        </select>
        <button id="c10R8Reload" class="btn secondary" type="button">再診断</button>
      </div>

      <div id="c10R8Result"></div>
    `;
    projectPanel.insertAdjacentElement("afterend",panel);

    button.addEventListener("click",async()=>{
      $$(".tab").forEach((b)=>b.classList.toggle("active",b===button));
      $$(".tab-panel").forEach((p)=>p.classList.add("hidden"));
      panel.classList.remove("hidden");
      if(!state.loaded) await loadData();
      else render();
    });

    $("c10R8Search").addEventListener("input",(event)=>{
      state.search=String(event.target.value||"").trim().toLowerCase();
      renderList();
    });
    $("c10R8Scope").addEventListener("change",(event)=>{
      state.scope=event.target.value||"production";
      renderList();
    });
    $("c10R8Phase").addEventListener("change",(event)=>{
      state.phase=event.target.value||"all";
      renderList();
    });
    $("c10R8Reload").addEventListener("click",()=>loadData(true));
    return true;
  }

  function stage(name,ok,off,note) {
    const tone=off?"off":ok?"ok":"wait";
    const label=off?"対象外":ok?"完了":"これから";
    return `
      <div class="c10-r8-stage ${tone}">
        <strong>${esc(name)}</strong>
        <span>${esc(label)}</span>
        <small>${esc(note)}</small>
      </div>`;
  }

  function allItems() {
    if(!state.data) return [];
    return [
      ...(state.data.production_contracts||[]),
      ...(state.data.demo_test_contracts||[]),
    ];
  }

  function filteredItems() {
    return allItems().filter((item)=>{
      const demo=item.scope==="demo_test";
      if(state.scope==="production" && demo) return false;
      if(state.scope==="demo" && !demo) return false;
      if(state.phase!=="all" && item.phase!==state.phase) return false;
      if(state.search){
        const hay=[item.client_name,item.client_code,item.contract_name,item.contract_code]
          .filter(Boolean).join(" ").toLowerCase();
        if(!hay.includes(state.search)) return false;
      }
      return true;
    });
  }

  function renderMetrics() {
    const host=$("c10R8Metrics");
    if(!host || !state.data) return;
    const s=state.data.summary||{};
    host.innerHTML=`
      <div class="c10-r8-metric"><b>${Number(s.production_contracts||0)}</b><span>実契約</span><small>開始診断の対象</small></div>
      <div class="c10-r8-metric"><b>${Number(s.need_contract||0)+Number(s.need_owner_confirmation||0)}</b><span>契約確認</span><small>確定・開始日・オーナー</small></div>
      <div class="c10-r8-metric"><b>${Number(s.need_contact||0)}</b><span>担当者待ち</span><small>制作中の連絡先</small></div>
      <div class="c10-r8-metric"><b>${Number(s.need_service||0)+Number(s.need_site||0)}</b><span>サービス・拠点</span><small>契約範囲の確定</small></div>
      <div class="c10-r8-metric"><b>${Number(s.need_project||0)}</b><span>制作開始待ち</span><small>DPROシステム契約</small></div>
      <div class="c10-r8-metric"><b>${Number(s.ready_to_start||0)}</b><span>開始可能</span><small>初期対応へ進める</small></div>
    `;
  }

  function serviceHtml(item) {
    const services=Array.isArray(item.services)?item.services:[];
    if(!services.length) return "";
    return `<div class="c10-r8-services">${services.map((s)=>
      `<span class="c10-r8-service">${esc(s.service_name||s.service_code||"サービス")}</span>`
    ).join("")}</div>`;
  }

  function renderList() {
    const host=$("c10R8Result");
    if(!host || !state.data) return;
    const rows=filteredItems();

    if(!rows.length){
      const demoCount=Number(state.data.summary?.demo_test_contracts||0);
      host.innerHTML=`
        <div class="c10-r8-empty">
          ${state.scope==="production"
            ? `現在、表示できる正式な実契約はありません。<br>DEMO / TEST ${demoCount}件は検査表示で確認できます。`
            : "表示条件に一致する契約はありません。"}
          ${state.scope==="production" && demoCount
            ? '<br><button id="c10R8ShowDemo" class="btn secondary" type="button">DEMO / TEST検査を表示</button>'
            : ""}
        </div>`;
      $("c10R8ShowDemo")?.addEventListener("click",()=>{
        state.scope="demo";
        $("c10R8Scope").value="demo";
        renderList();
      });
      return;
    }

    host.innerHTML=`<div class="c10-r8-list">${rows.map((item)=>{
      const demo=item.scope==="demo_test";
      const st=item.stages||{};
      const max=Math.max(1,Number(item.max_score||7));
      const pct=Math.max(0,Math.min(100,Math.round((Number(item.score||0)/max)*100)));
      const projectOff=demo || item.project_required!==true;
      return `
        <article class="c10-r8-card ${demo?"demo":""}">
          <div class="c10-r8-card-head">
            <div>
              <div class="c10-r8-code">${esc(item.contract_code||"契約コード未設定")}</div>
              <h3>${esc(item.client_name||"顧客名未設定")}｜${esc(item.contract_name||"契約")}</h3>
              <div class="c10-r8-sub">契約状態：${esc(item.contract_status||"未設定")}　開始日：${esc(formatDate(item.starts_on))}</div>
            </div>
            <span class="c10-r8-phase ${item.phase==="ready_to_start"?"ready":demo?"demo":""}">${esc(PHASE_LABELS[item.phase]||item.phase||"確認中")}</span>
          </div>

          <div class="c10-r8-progress">
            <div class="c10-r8-progress-bar"><i style="width:${pct}%"></i></div>
            <strong>${Number(item.score||0)}/${max}</strong>
          </div>

          <div class="c10-r8-stages">
            ${stage("正式契約",st.formal_contract,demo,"activeを確認")}
            ${stage("開始日",st.start_date,demo,"開始日が到来")}
            ${stage("オーナー確認",st.owner_confirmation,demo,"契約内容を確認済み")}
            ${stage("担当者",st.contact,demo,"連絡先を確定")}
            ${stage("サービス",st.service_scope,demo,"契約内容を明確化")}
            ${stage("対象拠点",st.site_scope,demo,"店舗・施設を紐付け")}
            ${stage("制作開始",st.delivery_project,projectOff,item.project_required?"正式制作案件":"システム制作対象外")}
          </div>

          ${serviceHtml(item)}

          <div class="c10-r8-next"><strong>最初にすること：</strong>${esc(item.next_action||"確認中")}</div>

          ${demo?"":`<div class="c10-r8-actions">
            <button class="btn secondary" type="button" data-r8-contract="${esc(item.contract_id||"")}">契約・サービスを確認</button>
            ${item.project_required===true && item.project_exists!==true && st.formal_contract && st.start_date && st.owner_confirmation && st.contact && st.service_scope && st.site_scope
              ? `<button class="btn primary" type="button" data-r8-create-project="${esc(item.contract_id||"")}" data-r8-client="${esc(item.client_id||"")}">制作登録を開く</button>`
              : ""}
            ${item.project_exists===true
              ? `<button class="btn primary" type="button" data-r8-readiness="true">本番準備ナビへ</button>`
              : ""}
          </div>`}
        </article>`;
    }).join("")}</div>`;

    $$("[data-r8-contract]",host).forEach((button)=>{
      button.addEventListener("click",()=>{
        window.location.href="index.html#view-contracts";
      });
    });

    $$("[data-r8-create-project]",host).forEach((button)=>{
      button.addEventListener("click",()=>openProjectForm(button.dataset.r8Client||"",button.dataset.r8CreateProject||""));
    });

    $$("[data-r8-readiness]",host).forEach((button)=>{
      button.addEventListener("click",()=>document.querySelector('[data-center10-readiness-r7="true"]')?.click());
    });
  }

  function openProjectForm(clientId,contractId) {
    const opener=$("newProjectButton");
    if(!opener) return;
    opener.click();

    let tries=0;
    const timer=setInterval(()=>{
      tries+=1;
      const client=$("formClient");
      const contract=$("formContract");
      if(client && [...client.options].some((o)=>o.value===clientId)){
        if(client.value!==clientId){
          client.value=clientId;
          client.dispatchEvent(new Event("change",{bubbles:true}));
        }
      }
      if(contract && [...contract.options].some((o)=>o.value===contractId)){
        contract.value=contractId;
        contract.dispatchEvent(new Event("change",{bubbles:true}));
        clearInterval(timer);
      }else if(tries>=40){
        clearInterval(timer);
      }
    },100);
  }

  function render() {
    syncVersion();
    renderMetrics();
    renderList();
  }

  async function loadData(force=false) {
    const host=$("c10R8Result");
    if(host) host.innerHTML='<div class="c10-r8-empty">契約開始条件を診断しています…</div>';
    try{
      const sb=await supabaseClient();
      const {data,error}=await sb.rpc("cc_center10_r8_get_contract_start");
      if(error) throw error;
      state.data=data||{};
      state.loaded=true;
      render();
    }catch(error){
      console.error(BUILD,error);
      if(host){
        const missing=/cc_center10_r8_get_contract_start|PGRST|function/i.test(String(error.message||""));
        host.innerHTML=`<div class="c10-r8-empty"><strong>${missing?"R8のDB SQLを先に実行してください。":"契約開始診断を読み込めません。"}</strong><br>${esc(error.message||"接続を確認してください。")}</div>`;
      }
    }
  }

  function bootstrap() {
    installStyle();
    syncVersion();

    let tries=0;
    const timer=setInterval(()=>{
      tries+=1;
      syncVersion();
      if(installPanel()){
        clearInterval(timer);
      }else if(tries>=240){
        clearInterval(timer);
      }
    },125);
  }

  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded",bootstrap,{once:true});
  }else{
    bootstrap();
  }
})();
