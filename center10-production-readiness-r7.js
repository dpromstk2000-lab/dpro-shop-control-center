(() => {
  "use strict";

  if (window.__DPRO_CENTER10_READINESS_R7__) return;
  window.__DPRO_CENTER10_READINESS_R7__ = true;

  const BUILD = "CONTROL-CENTER-38-CENTER10-R7-R7-PRODUCTION-READINESS-20260810";
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
    contract:"正式契約待ち",
    project:"制作案件待ち",
    production_system:"本番環境待ち",
    quality:"品質確認中",
    ready_for_go_live:"本番可能",
  };

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }

  function syncVersion() {
    const version=document.querySelector(".sidebar .version");
    if(version){
      version.innerHTML='CONTROL-CENTER-38<br><span>CENTER-10-R7-R7</span>';
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
    if($("c10R7Style")) return;

    const style=document.createElement("style");
    style.id="c10R7Style";
    style.textContent=`
      .c10-r7-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-end;margin-bottom:14px}
      .c10-r7-head h2{margin:0;font-size:24px}
      .c10-r7-head p{margin:6px 0 0;color:#68766f;font-size:11px;line-height:1.7}
      .c10-r7-pill{display:inline-flex;padding:6px 9px;border-radius:999px;background:#e1f5eb;color:#08664b;font-size:9px;font-weight:900}
      .c10-r7-guide{padding:14px 15px;border:1px solid #b9dccd;border-radius:13px;background:#eef9f4;color:#466057;font-size:11px;line-height:1.75}
      .c10-r7-safety{margin-top:8px;padding:12px 14px;border:1px solid #d7e3eb;border-radius:12px;background:#f5f9fc;color:#516b79;font-size:10px;line-height:1.7}
      .c10-r7-metrics{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:9px;margin:13px 0}
      .c10-r7-metric{padding:15px;border:1px solid #d9e5e0;border-radius:13px;background:#fff}
      .c10-r7-metric b,.c10-r7-metric span,.c10-r7-metric small{display:block}
      .c10-r7-metric b{font-size:22px;color:#0b5f49}
      .c10-r7-metric span{font-size:10px;font-weight:900;margin-top:5px}
      .c10-r7-metric small{font-size:8px;color:#74817c;margin-top:3px}
      .c10-r7-toolbar{display:grid;grid-template-columns:minmax(260px,1fr) 190px 190px auto;gap:9px;margin:12px 0}
      .c10-r7-toolbar input,.c10-r7-toolbar select{min-height:45px;border:1px solid #d5e3dd;border-radius:11px;background:#fff;padding:0 12px;font:inherit}
      .c10-r7-list{display:grid;gap:11px}
      .c10-r7-card{padding:15px;border:1px solid #d9e5e0;border-radius:15px;background:#fff}
      .c10-r7-card.demo{background:#f8fafc;border-color:#d6e1e8}
      .c10-r7-card-head{display:flex;justify-content:space-between;gap:13px;align-items:flex-start}
      .c10-r7-code{font-size:9px;font-weight:900;color:#2d6757;letter-spacing:.07em}
      .c10-r7-card h3{margin:4px 0 3px;font-size:17px;color:#102d25}
      .c10-r7-sub{font-size:10px;color:#6a7973}
      .c10-r7-phase{padding:6px 9px;border-radius:999px;background:#edf2f0;color:#61706a;font-size:9px;font-weight:900;white-space:nowrap}
      .c10-r7-phase.ready{background:#def5ea;color:#087253}
      .c10-r7-phase.demo{background:#edf2f6;color:#596f7c}
      .c10-r7-progress{display:flex;align-items:center;gap:10px;margin:12px 0 9px}
      .c10-r7-progress-bar{height:8px;flex:1;border-radius:999px;background:#edf2ef;overflow:hidden}
      .c10-r7-progress-bar i{display:block;height:100%;background:#15936a;border-radius:999px}
      .c10-r7-progress strong{font-size:11px;color:#0b5f49}
      .c10-r7-stages{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:7px}
      .c10-r7-stage{padding:10px;border:1px solid #e0e8e4;border-radius:10px;background:#fff;min-height:78px}
      .c10-r7-stage.ok{background:#f8fcfa;border-color:#a8d7c1}
      .c10-r7-stage.wait{background:#fffdf7;border-color:#e7ce86}
      .c10-r7-stage.off{background:#f6f8f9;border-color:#dce4e8}
      .c10-r7-stage strong,.c10-r7-stage span,.c10-r7-stage small{display:block}
      .c10-r7-stage strong{font-size:9px}
      .c10-r7-stage span{font-size:9px;font-weight:900;margin-top:5px}
      .c10-r7-stage.ok span{color:#087253}
      .c10-r7-stage.wait span{color:#916200}
      .c10-r7-stage.off span{color:#687b86}
      .c10-r7-stage small{font-size:8px;color:#77847f;margin-top:3px;line-height:1.45}
      .c10-r7-next{margin-top:9px;padding:11px 12px;border-radius:10px;background:#f2f7f5;color:#38594e;font-size:10px;line-height:1.65}
      .c10-r7-next strong{color:#0b5f49}
      .c10-r7-actions{display:flex;justify-content:flex-end;margin-top:9px}
      .c10-r7-empty{padding:22px;border:1px dashed #c6d5ce;border-radius:13px;background:#fff;text-align:center;color:#687872;font-size:12px;line-height:1.8}
      .c10-r7-empty button{margin-top:10px}
      @media(max-width:1050px){
        .c10-r7-metrics{grid-template-columns:repeat(3,1fr)}
        .c10-r7-stages{grid-template-columns:repeat(3,1fr)}
        .c10-r7-toolbar{grid-template-columns:1fr 1fr}
      }
      @media(max-width:720px){
        .c10-r7-head{display:block}
        .c10-r7-metrics,.c10-r7-stages,.c10-r7-toolbar{grid-template-columns:1fr}
      }
    `;
    document.head.appendChild(style);
  }

  function installPanel() {
    const tabs=document.querySelector(".tabs");
    const goLiveTab=document.querySelector("[data-center8-go-live]");
    const goLivePanel=$("panel-go-live");

    if(!tabs || !goLiveTab || !goLivePanel) return false;
    if($("panel-production-readiness")) return true;

    const button=document.createElement("button");
    button.className="tab";
    button.type="button";
    button.dataset.tab="production-readiness";
    button.dataset.center10ReadinessR7="true";
    button.textContent="本番準備ナビ";
    goLiveTab.insertAdjacentElement("beforebegin",button);

    const panel=document.createElement("section");
    panel.id="panel-production-readiness";
    panel.className="tab-panel hidden";
    panel.innerHTML=`
      <div class="c10-r7-head">
        <div>
          <h2>本番準備ナビ</h2>
          <p>正式契約が入ったとき、本番まで何が足りないかを事前診断します。</p>
        </div>
        <span class="c10-r7-pill">CENTER-10 R7-R7</span>
      </div>

      <div class="c10-r7-guide">
        実顧客 → 正式契約 → 制作案件 → PRODUCTION本番準備 → CENTER-8品質確認の順に確認します。
        <strong>この画面から本番環境を作成したり、本番稼働へ切り替えたりすることはありません。</strong>
      </div>

      <div class="c10-r7-safety">
        契約前でも確認できます。DEMO / TEST案件は本番件数から除外したまま「検査表示」として確認できます。
      </div>

      <div id="c10R7Metrics" class="c10-r7-metrics"></div>

      <div class="c10-r7-toolbar">
        <input id="c10R7Search" type="search" placeholder="制作名・制作コードで検索">
        <select id="c10R7Scope">
          <option value="production">実契約のみ</option>
          <option value="demo">DEMO / TEST検査</option>
          <option value="all">すべて表示</option>
        </select>
        <select id="c10R7Phase">
          <option value="all">すべての段階</option>
          <option value="contract">正式契約待ち</option>
          <option value="project">制作案件待ち</option>
          <option value="production_system">本番環境待ち</option>
          <option value="quality">品質確認中</option>
          <option value="ready_for_go_live">本番可能</option>
          <option value="excluded_demo">DEMO / TEST</option>
        </select>
        <button id="c10R7Reload" class="btn secondary" type="button">再診断</button>
      </div>

      <div id="c10R7Result"></div>
    `;

    goLivePanel.insertAdjacentElement("beforebegin",panel);

    button.addEventListener("click",async()=>{
      $$(".tab").forEach((b)=>b.classList.toggle("active",b===button));
      $$(".tab-panel").forEach((p)=>p.classList.add("hidden"));
      panel.classList.remove("hidden");
      if(!state.loaded) await loadData();
      else render();
    });

    $("c10R7Search").addEventListener("input",(event)=>{
      state.search=String(event.target.value||"").trim().toLowerCase();
      renderList();
    });
    $("c10R7Scope").addEventListener("change",(event)=>{
      state.scope=event.target.value||"production";
      renderList();
    });
    $("c10R7Phase").addEventListener("change",(event)=>{
      state.phase=event.target.value||"all";
      renderList();
    });
    $("c10R7Reload").addEventListener("click",()=>loadData(true));

    return true;
  }

  function stage(name,ok,off,note) {
    const tone=off?"off":ok?"ok":"wait";
    const label=off?"対象外":ok?"完了":"これから";
    return `
      <div class="c10-r7-stage ${tone}">
        <strong>${esc(name)}</strong>
        <span>${esc(label)}</span>
        <small>${esc(note)}</small>
      </div>
    `;
  }

  function allItems() {
    if(!state.data) return [];
    return [
      ...(state.data.production_projects||[]),
      ...(state.data.demo_test_projects||[])
    ];
  }

  function filteredItems() {
    return allItems().filter((item)=>{
      const demo=item.scope==="demo_test";
      if(state.scope==="production" && demo) return false;
      if(state.scope==="demo" && !demo) return false;
      if(state.phase!=="all" && item.phase!==state.phase) return false;

      if(state.search){
        const hay=[item.project_name,item.project_code,item.project_status]
          .filter(Boolean).join(" ").toLowerCase();
        if(!hay.includes(state.search)) return false;
      }
      return true;
    });
  }

  function renderMetrics() {
    const host=$("c10R7Metrics");
    if(!host || !state.data) return;

    const s=state.data.summary||{};
    host.innerHTML=`
      <div class="c10-r7-metric">
        <b>${Number(s.production_targets||0)}</b>
        <span>実契約対象</span><small>本番準備の対象</small>
      </div>
      <div class="c10-r7-metric">
        <b>${Number(s.need_contract||0)+Number(s.need_project||0)}</b>
        <span>契約・制作準備</span><small>正式契約〜制作案件</small>
      </div>
      <div class="c10-r7-metric">
        <b>${Number(s.need_production_system||0)}</b>
        <span>本番環境待ち</span><small>まだ作成不要でもOK</small>
      </div>
      <div class="c10-r7-metric">
        <b>${Number(s.ready_for_go_live||0)}</b>
        <span>本番可能</span><small>最終入力へ進める</small>
      </div>
      <div class="c10-r7-metric">
        <b>${Number(s.demo_test_projects||0)}</b>
        <span>DEMO / TEST</span><small>本番件数から除外</small>
      </div>
    `;
  }

  function renderList() {
    const host=$("c10R7Result");
    if(!host || !state.data) return;

    const rows=filteredItems();

    if(!rows.length){
      const demoCount=Number(state.data.summary?.demo_test_projects||0);
      host.innerHTML=`
        <div class="c10-r7-empty">
          ${
            state.scope==="production"
              ? `現在、正式な実契約の本番準備対象はありません。<br>DEMO / TEST ${demoCount}件は検査表示で確認できます。`
              : "表示条件に一致する本番準備案件はありません。"
          }
          ${
            state.scope==="production" && demoCount
              ? '<br><button id="c10R7ShowDemo" class="btn secondary" type="button">DEMO / TEST検査を表示</button>'
              : ""
          }
        </div>
      `;
      $("c10R7ShowDemo")?.addEventListener("click",()=>{
        state.scope="demo";
        $("c10R7Scope").value="demo";
        renderList();
      });
      return;
    }

    host.innerHTML=`<div class="c10-r7-list">${
      rows.map((item)=>{
        const demo=item.scope==="demo_test";
        const stages=item.stages||{};
        const pct=Math.max(0,Math.min(100,Math.round((Number(item.score||0)/5)*100)));

        return `
          <article class="c10-r7-card ${demo?"demo":""}">
            <div class="c10-r7-card-head">
              <div>
                <div class="c10-r7-code">${esc(item.project_code||"制作コード未設定")}</div>
                <h3>${esc(item.project_name||"制作案件")}</h3>
                <div class="c10-r7-sub">状態：${esc(item.project_status||"未設定")}</div>
              </div>
              <span class="c10-r7-phase ${item.phase==="ready_for_go_live"?"ready":demo?"demo":""}">
                ${esc(PHASE_LABELS[item.phase]||item.phase||"確認中")}
              </span>
            </div>

            <div class="c10-r7-progress">
              <div class="c10-r7-progress-bar"><i style="width:${pct}%"></i></div>
              <strong>${Number(item.score||0)}/5</strong>
            </div>

            <div class="c10-r7-stages">
              ${stage("実顧客",stages.real_client,demo,"DEMO / TESTは本番対象外")}
              ${stage("正式契約",stages.formal_contract,demo,"active・開始日・顧客一致")}
              ${stage("制作案件",stages.delivery_project,demo,"正式契約から制作")}
              ${stage("本番システム",stages.production_system,demo,"PRODUCTION登録")}
              ${stage("品質ゲート",stages.quality_gate,demo,"CENTER-7 / 8品質")}
            </div>

            <div class="c10-r7-next">
              <strong>次に必要：</strong>${esc(item.next_action||"確認中")}
            </div>

            ${
              !demo
                ? `<div class="c10-r7-actions">
                     <button class="btn secondary" type="button" data-r7-go-live="${esc(item.project_id||"")}">
                       本番稼働画面で確認
                     </button>
                   </div>`
                : ""
            }
          </article>
        `;
      }).join("")
    }</div>`;

    $$("[data-r7-go-live]",host).forEach((button)=>{
      button.addEventListener("click",()=>{
        const id=button.dataset.r7GoLive||"";
        if(id) localStorage.setItem("dpro_center8_go_live_project",id);
        document.querySelector("[data-center8-go-live]")?.click();
      });
    });
  }

  function render() {
    syncVersion();
    renderMetrics();
    renderList();
  }

  async function loadData(force=false) {
    const host=$("c10R7Result");
    if(host) host.innerHTML='<div class="c10-r7-empty">本番準備状況を診断しています…</div>';

    try{
      const sb=await supabaseClient();
      const {data,error}=await sb.rpc("cc_center10_r7_get_readiness");
      if(error) throw error;

      state.data=data||{};
      state.loaded=true;
      render();
    }catch(error){
      console.error(BUILD,error);
      if(host){
        const missing=/cc_center10_r7_get_readiness|PGRST|function/i.test(String(error.message||""));
        host.innerHTML=`
          <div class="c10-r7-empty">
            <strong>${missing?"R7のDB SQLを先に実行してください。":"本番準備診断を読み込めません。"}</strong><br>
            ${esc(error.message||"接続を確認してください。")}
          </div>
        `;
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
