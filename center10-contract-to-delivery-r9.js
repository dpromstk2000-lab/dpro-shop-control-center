(() => {
  "use strict";

  if (window.__DPRO_CENTER10_CONTRACT_TO_DELIVERY_R9__) return;
  window.__DPRO_CENTER10_CONTRACT_TO_DELIVERY_R9__ = true;

  const BUILD = "CONTROL-CENTER-41-CENTER10-R7-R9-CONTRACT-TO-DELIVERY-20260810";
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

  const STATE_LABELS = {
    excluded_demo:"DEMO / TEST",
    not_required:"制作対象外",
    waiting_prerequisites:"契約開始条件待ち",
    missing_project:"制作未登録",
    linkage_review:"紐付け確認",
    linked:"制作連動済み",
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
      version.innerHTML='CONTROL-CENTER-41<br><span>CENTER-10-R7-R9</span>';
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
    if($("c10R9Style")) return;
    const style=document.createElement("style");
    style.id="c10R9Style";
    style.textContent=`
      .c10-r9-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-end;margin-bottom:14px}
      .c10-r9-head h2{margin:0;font-size:24px}.c10-r9-head p{margin:6px 0 0;color:#68766f;font-size:11px;line-height:1.7}
      .c10-r9-pill{display:inline-flex;padding:6px 9px;border-radius:999px;background:#e1f5eb;color:#08664b;font-size:9px;font-weight:900}
      .c10-r9-guide{padding:14px 15px;border:1px solid #b9dccd;border-radius:13px;background:#eef9f4;color:#466057;font-size:11px;line-height:1.75}
      .c10-r9-safety{margin-top:8px;padding:12px 14px;border:1px solid #d7e3eb;border-radius:12px;background:#f5f9fc;color:#516b79;font-size:10px;line-height:1.7}
      .c10-r9-metrics{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:9px;margin:13px 0}
      .c10-r9-metric{padding:15px;border:1px solid #d9e5e0;border-radius:13px;background:#fff;min-width:0}
      .c10-r9-metric b,.c10-r9-metric span,.c10-r9-metric small{display:block}.c10-r9-metric b{font-size:22px;color:#0b5f49}.c10-r9-metric span{font-size:10px;font-weight:900;margin-top:5px}.c10-r9-metric small{font-size:8px;color:#74817c;margin-top:3px}
      .c10-r9-toolbar{display:grid;grid-template-columns:minmax(260px,1fr) 190px 190px auto;gap:9px;margin:12px 0}
      .c10-r9-toolbar input,.c10-r9-toolbar select{min-height:45px;border:1px solid #d5e3dd;border-radius:11px;background:#fff;padding:0 12px;font:inherit}
      .c10-r9-list{display:grid;gap:11px}.c10-r9-card{padding:15px;border:1px solid #d9e5e0;border-radius:15px;background:#fff}.c10-r9-card.demo{background:#f8fafc;border-color:#d6e1e8}
      .c10-r9-card-head{display:flex;justify-content:space-between;gap:13px;align-items:flex-start}.c10-r9-code{font-size:9px;font-weight:900;color:#2d6757;letter-spacing:.07em}.c10-r9-card h3{margin:4px 0 3px;font-size:17px;color:#102d25}.c10-r9-sub{font-size:10px;color:#6a7973;line-height:1.6}
      .c10-r9-phase{padding:6px 9px;border-radius:999px;background:#edf2f0;color:#61706a;font-size:9px;font-weight:900;white-space:nowrap}.c10-r9-phase.linked{background:#def5ea;color:#087253}.c10-r9-phase.warn{background:#fff2cf;color:#936300}.c10-r9-phase.demo{background:#edf2f6;color:#596f7c}
      .c10-r9-progress{display:flex;align-items:center;gap:10px;margin:12px 0 9px}.c10-r9-progress-bar{height:8px;flex:1;border-radius:999px;background:#edf2ef;overflow:hidden}.c10-r9-progress-bar i{display:block;height:100%;background:#15936a;border-radius:999px}.c10-r9-progress strong{font-size:11px;color:#0b5f49}
      .c10-r9-stages{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px}.c10-r9-stage{padding:10px;border:1px solid #e0e8e4;border-radius:10px;background:#fff;min-height:78px}.c10-r9-stage.ok{background:#f8fcfa;border-color:#a8d7c1}.c10-r9-stage.wait{background:#fffdf7;border-color:#e7ce86}.c10-r9-stage.off{background:#f6f8f9;border-color:#dce4e8}
      .c10-r9-stage strong,.c10-r9-stage span,.c10-r9-stage small{display:block}.c10-r9-stage strong{font-size:9px}.c10-r9-stage span{font-size:9px;font-weight:900;margin-top:5px}.c10-r9-stage.ok span{color:#087253}.c10-r9-stage.wait span{color:#916200}.c10-r9-stage.off span{color:#687b86}.c10-r9-stage small{font-size:8px;color:#77847f;margin-top:3px;line-height:1.45}
      .c10-r9-projects{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;margin-top:9px}.c10-r9-project{padding:9px 10px;border-radius:9px;background:#f4f8f6;color:#466057;font-size:9px;line-height:1.55}.c10-r9-project.candidate{background:#fff9e9;color:#765a16}
      .c10-r9-next{margin-top:9px;padding:11px 12px;border-radius:10px;background:#f2f7f5;color:#38594e;font-size:10px;line-height:1.65}.c10-r9-next strong{color:#0b5f49}
      .c10-r9-actions{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:9px}.c10-r9-empty{padding:22px;border:1px dashed #c6d5ce;border-radius:13px;background:#fff;text-align:center;color:#687872;font-size:12px;line-height:1.8}.c10-r9-empty button{margin-top:10px}
      @media(max-width:1250px){.c10-r9-metrics{grid-template-columns:repeat(3,1fr)}}
      @media(max-width:900px){.c10-r9-stages,.c10-r9-projects{grid-template-columns:repeat(2,1fr)}.c10-r9-toolbar{grid-template-columns:1fr 1fr}}
      @media(max-width:720px){.c10-r9-head{display:block}.c10-r9-metrics,.c10-r9-stages,.c10-r9-projects,.c10-r9-toolbar{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function installPanel() {
    const r8Tab=document.querySelector('.tabs .tab[data-tab="contract-start"]');
    const r8Panel=$("panel-contract-start");
    if(!r8Tab || !r8Panel) return false;
    if($("panel-contract-delivery")) return true;

    const button=document.createElement("button");
    button.className="tab";
    button.type="button";
    button.dataset.tab="contract-delivery";
    button.dataset.center10ContractDeliveryR9="true";
    button.textContent="契約→制作";
    r8Tab.insertAdjacentElement("afterend",button);

    const panel=document.createElement("section");
    panel.id="panel-contract-delivery";
    panel.className="tab-panel hidden";
    panel.innerHTML=`
      <div class="c10-r9-head">
        <div>
          <h2>契約 → 制作 引き継ぎナビ</h2>
          <p>契約開始条件が揃ったDPROシステム契約が、正式制作案件へ漏れなく引き継がれているか確認します。</p>
        </div>
        <span class="c10-r9-pill">CENTER-10 R7-R9</span>
      </div>

      <div class="c10-r9-guide">
        契約開始条件 → DPROシステム契約 → 制作案件 → 契約紐付けの順で確認します。
        <strong>「契約したのに制作登録を忘れた」「制作案件はあるが契約と繋がっていない」を見つけるためのナビです。</strong>
      </div>

      <div class="c10-r9-safety">
        この画面は診断専用です。契約の変更、制作案件の自動作成・自動紐付け、本番環境の作成、本番稼働への切替は行いません。
      </div>

      <div id="c10R9Metrics" class="c10-r9-metrics"></div>

      <div class="c10-r9-toolbar">
        <input id="c10R9Search" type="search" placeholder="顧客名・契約名・契約コード・制作コードで検索">
        <select id="c10R9Scope">
          <option value="production">実契約のみ</option>
          <option value="demo">DEMO / TEST検査</option>
          <option value="all">すべて表示</option>
        </select>
        <select id="c10R9Phase">
          <option value="all">すべての状態</option>
          <option value="waiting_prerequisites">契約開始条件待ち</option>
          <option value="missing_project">制作未登録</option>
          <option value="linkage_review">紐付け確認</option>
          <option value="linked">制作連動済み</option>
          <option value="not_required">制作対象外</option>
          <option value="excluded_demo">DEMO / TEST</option>
        </select>
        <button id="c10R9Reload" class="btn secondary" type="button">再診断</button>
      </div>

      <div id="c10R9Result"></div>
    `;
    r8Panel.insertAdjacentElement("afterend",panel);

    button.addEventListener("click",async()=>{
      $$(".tab").forEach((b)=>b.classList.toggle("active",b===button));
      $$(".tab-panel").forEach((p)=>p.classList.add("hidden"));
      panel.classList.remove("hidden");
      syncVersion();
      if(!state.loaded) await loadData();
      else render();
    });

    $("c10R9Search").addEventListener("input",(event)=>{
      state.search=String(event.target.value||"").trim().toLowerCase();
      renderList();
    });
    $("c10R9Scope").addEventListener("change",(event)=>{
      state.scope=event.target.value||"production";
      renderList();
    });
    $("c10R9Phase").addEventListener("change",(event)=>{
      state.phase=event.target.value||"all";
      renderList();
    });
    $("c10R9Reload").addEventListener("click",()=>loadData(true));
    return true;
  }

  function stage(name,ok,off,note) {
    const tone=off?"off":ok?"ok":"wait";
    const label=off?"対象外":ok?"完了":"要確認";
    return `
      <div class="c10-r9-stage ${tone}">
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

  function projectText(project) {
    if(!project || typeof project!=="object") return "";
    return [project.project_code,project.project_name,project.status].filter(Boolean).join(" ");
  }

  function filteredItems() {
    return allItems().filter((item)=>{
      const demo=item.scope==="demo_test";
      if(state.scope==="production" && demo) return false;
      if(state.scope==="demo" && !demo) return false;
      if(state.phase!=="all" && item.handoff_state!==state.phase) return false;
      if(state.search){
        const projects=[...(item.linked_projects||[]),...(item.candidate_unlinked_projects||[])];
        const hay=[item.client_name,item.client_code,item.contract_name,item.contract_code,...projects.map(projectText)]
          .filter(Boolean).join(" ").toLowerCase();
        if(!hay.includes(state.search)) return false;
      }
      return true;
    });
  }

  function renderMetrics() {
    const host=$("c10R9Metrics");
    if(!host || !state.data) return;
    const s=state.data.summary||{};
    host.innerHTML=`
      <div class="c10-r9-metric"><b>${Number(s.production_contracts||0)}</b><span>実契約</span><small>R9診断対象</small></div>
      <div class="c10-r9-metric"><b>${Number(s.handoff_targets||0)}</b><span>引継ぎ対象</span><small>DPROシステム契約</small></div>
      <div class="c10-r9-metric"><b>${Number(s.waiting_prerequisites||0)}</b><span>前提待ち</span><small>R8条件が未完了</small></div>
      <div class="c10-r9-metric"><b>${Number(s.missing_project||0)}</b><span>制作未登録</span><small>登録漏れを確認</small></div>
      <div class="c10-r9-metric"><b>${Number(s.linkage_review||0)}</b><span>紐付け確認</span><small>既存案件候補あり</small></div>
      <div class="c10-r9-metric"><b>${Number(s.linked||0)}</b><span>制作連動済み</span><small>契約→制作OK</small></div>
    `;
  }

  function projectCards(projects,candidate=false) {
    if(!Array.isArray(projects) || !projects.length) return "";
    return `<div class="c10-r9-projects">${projects.map((p)=>`
      <div class="c10-r9-project ${candidate?"candidate":""}">
        <strong>${esc(p.project_code||"制作コード未設定")}</strong><br>
        ${esc(p.project_name||"制作案件")}・${esc(p.status||"状態未設定")}
        ${candidate?"<br>契約ID未紐付け候補":""}
      </div>`).join("")}</div>`;
  }

  function renderList() {
    const host=$("c10R9Result");
    if(!host || !state.data) return;
    const rows=filteredItems();

    if(!rows.length){
      const demoCount=Number(state.data.summary?.demo_test_contracts||0);
      host.innerHTML=`
        <div class="c10-r9-empty">
          ${state.scope==="production"
            ? `現在、表示できる正式な実契約はありません。<br>DEMO / TEST ${demoCount}件は検査表示で確認できます。`
            : "表示条件に一致する契約はありません。"}
          ${state.scope==="production" && demoCount
            ? '<br><button id="c10R9ShowDemo" class="btn secondary" type="button">DEMO / TEST検査を表示</button>'
            : ""}
        </div>`;
      $("c10R9ShowDemo")?.addEventListener("click",()=>{
        state.scope="demo";
        $("c10R9Scope").value="demo";
        renderList();
      });
      return;
    }

    host.innerHTML=`<div class="c10-r9-list">${rows.map((item)=>{
      const demo=item.scope==="demo_test";
      const st=item.handoff_stages||{};
      const off=demo || item.project_required!==true;
      const max=Math.max(1,Number(item.handoff_max_score||4));
      const pct=Math.max(0,Math.min(100,Math.round((Number(item.handoff_score||0)/max)*100)));
      const phaseClass=item.handoff_state==="linked"?"linked":(["missing_project","linkage_review","waiting_prerequisites"].includes(item.handoff_state)?"warn":demo?"demo":"");
      const linked=item.linked_projects||[];
      const candidates=item.candidate_unlinked_projects||[];
      const latest=linked[0]||null;
      return `
        <article class="c10-r9-card ${demo?"demo":""}">
          <div class="c10-r9-card-head">
            <div>
              <div class="c10-r9-code">${esc(item.contract_code||"契約コード未設定")}</div>
              <h3>${esc(item.client_name||"顧客名未設定")}｜${esc(item.contract_name||"契約")}</h3>
              <div class="c10-r9-sub">契約状態：${esc(item.contract_status||"未設定")}　開始日：${esc(formatDate(item.starts_on))}</div>
            </div>
            <span class="c10-r9-phase ${phaseClass}">${esc(STATE_LABELS[item.handoff_state]||item.handoff_state||"確認中")}</span>
          </div>

          <div class="c10-r9-progress">
            <div class="c10-r9-progress-bar"><i style="width:${pct}%"></i></div>
            <strong>${Number(item.handoff_score||0)}/${max}</strong>
          </div>

          <div class="c10-r9-stages">
            ${stage("契約開始条件",st.contract_start_ready,demo,"R8の6前提条件")}
            ${stage("DPROシステム",st.system_contract,demo || item.project_required!==true,"制作対象契約")}
            ${stage("制作案件",st.project_record,off,"正式案件または候補")}
            ${stage("契約紐付け",st.contract_linked,off,"contract_idで連動")}
          </div>

          ${projectCards(linked,false)}
          ${item.handoff_state==="linkage_review"?projectCards(candidates,true):""}

          <div class="c10-r9-next"><strong>次にすること：</strong>${esc(item.handoff_next_action||"確認中")}</div>

          ${demo?"":`<div class="c10-r9-actions">
            <button class="btn secondary" type="button" data-r9-r8="true">契約開始ナビへ</button>
            ${item.handoff_state==="missing_project" && item.contract_start_ready===true
              ? `<button class="btn primary" type="button" data-r9-create-project="${esc(item.contract_id||"")}" data-r9-client="${esc(item.client_id||"")}">制作登録を開く</button>`
              : ""}
            ${item.handoff_state==="linkage_review"
              ? `<button class="btn secondary" type="button" data-r9-show-project="${esc(candidates[0]?.project_code||"")}">制作候補を確認</button>`
              : ""}
            ${item.handoff_state==="linked" && latest
              ? `<button class="btn primary" type="button" data-r9-show-project="${esc(latest.project_code||"")}">制作案件を表示</button><button class="btn secondary" type="button" data-r9-readiness="true">本番準備ナビへ</button>`
              : ""}
          </div>`}
        </article>`;
    }).join("")}</div>`;

    $$("[data-r9-r8]",host).forEach((button)=>button.addEventListener("click",()=>{
      document.querySelector('[data-center10-contract-start-r8="true"]')?.click();
    }));

    $$("[data-r9-create-project]",host).forEach((button)=>button.addEventListener("click",()=>{
      openProjectForm(button.dataset.r9Client||"",button.dataset.r9CreateProject||"");
    }));

    $$("[data-r9-show-project]",host).forEach((button)=>button.addEventListener("click",()=>{
      showProject(button.dataset.r9ShowProject||"");
    }));

    $$("[data-r9-readiness]",host).forEach((button)=>button.addEventListener("click",()=>{
      document.querySelector('[data-center10-readiness-r7="true"]')?.click();
    }));
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

  function showProject(projectCode) {
    const tab=document.querySelector('.tabs .tab[data-tab="projects"]');
    tab?.click();
    setTimeout(()=>{
      const search=$("projectSearch");
      if(search){
        search.value=projectCode||"";
        search.dispatchEvent(new Event("input",{bubbles:true}));
      }
      const scope=$("projectScopeFilter");
      if(scope){
        scope.value="all";
        scope.dispatchEvent(new Event("change",{bubbles:true}));
      }
    },120);
  }

  function render() {
    syncVersion();
    renderMetrics();
    renderList();
  }

  async function loadData(force=false) {
    const host=$("c10R9Result");
    if(host) host.innerHTML='<div class="c10-r9-empty">契約から制作への引き継ぎを診断しています…</div>';
    try{
      const sb=await supabaseClient();
      const {data,error}=await sb.rpc("cc_center10_r9_get_contract_delivery_handoff");
      if(error) throw error;
      state.data=data||{};
      state.loaded=true;
      render();
    }catch(error){
      console.error(BUILD,error);
      if(host){
        const missing=/cc_center10_r9_get_contract_delivery_handoff|PGRST|function/i.test(String(error.message||""));
        host.innerHTML=`<div class="c10-r9-empty"><strong>${missing?"R9のDB SQLを先に実行してください。":"引き継ぎ診断を読み込めません。"}</strong><br>${esc(error.message||"接続を確認してください。")}</div>`;
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
