(() => {
  "use strict";

  if (window.__DPRO_CENTER10_PRODUCTION_CHAIN_R6__) return;
  window.__DPRO_CENTER10_PRODUCTION_CHAIN_R6__ = true;

  const BUILD = "CONTROL-CENTER-36-CENTER10-R7-R6-PRODUCTION-CHAIN-20260810";
  const CONFIG = window.DPRO_CONTROL_CENTER_CONFIG || {};
  const $ = (id) => document.getElementById(id);

  const state = {
    supabase:null,
    session:null,
    projectId:"",
    chain:null,
    loading:false,
    loadSeq:0,
  };

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }

  async function fetchPublicConfig() {
    const base=String(CONFIG.apiBaseUrl||"").replace(/\/$/,"");
    const response=await fetch(`${base}/api/public-config`,{cache:"no-store"});
    const data=await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(data.message||data.error||`HTTP ${response.status}`);
    return data;
  }

  async function client() {
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
    if($("c10R6Style")) return;
    const style=document.createElement("style");
    style.id="c10R6Style";
    style.textContent=`
      .c10-r6-chain{
        margin-top:10px;padding:14px;border:1px solid #c9ddd4;border-radius:14px;
        background:#f7fbf9
      }
      .c10-r6-head{
        display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:10px
      }
      .c10-r6-head strong{display:block;font-size:15px;color:#123d32}
      .c10-r6-head p{margin:4px 0 0;color:#61746c;font-size:12px;line-height:1.65}
      .c10-r6-badge{
        flex:0 0 auto;padding:5px 9px;border-radius:999px;background:#e5f5ed;
        color:#076549;font-size:10px;font-weight:900
      }
      .c10-r6-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}
      .c10-r6-step{
        padding:11px;border:1px solid #dbe6e1;border-radius:11px;background:#fff;min-height:86px
      }
      .c10-r6-step.ok{border-color:#abd7c3;background:#f8fcfa}
      .c10-r6-step.bad{border-color:#e6b8c0;background:#fff9fa}
      .c10-r6-step strong,.c10-r6-step span,.c10-r6-step small{display:block}
      .c10-r6-step strong{font-size:12px}
      .c10-r6-step span{margin-top:7px;font-size:12px;font-weight:900}
      .c10-r6-step.ok span{color:#087153}
      .c10-r6-step.bad span{color:#b03449}
      .c10-r6-step small{margin-top:4px;color:#718079;font-size:10px;line-height:1.5}
      .c10-r6-blockers{
        margin-top:9px;padding:10px 12px;border-radius:10px;background:#fff1f3;
        color:#983347;font-size:12px;line-height:1.65
      }
      .c10-r6-ready{
        margin-top:9px;padding:10px 12px;border-radius:10px;background:#eaf8f1;
        color:#08664b;font-size:12px;font-weight:900
      }
      .c10-r6-db-warn{
        margin-top:10px;padding:11px 13px;border:1px solid #ead08a;border-radius:10px;
        background:#fff9e8;color:#805d00;font-size:12px;line-height:1.65
      }
      @media(max-width:1100px){.c10-r6-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
      @media(max-width:720px){.c10-r6-grid{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function ensurePanel() {
    const goLive=$("panel-go-live");
    if(!goLive) return null;

    let host=$("c10R6ProductionChain");
    if(host) return host;

    host=document.createElement("section");
    host.id="c10R6ProductionChain";
    host.className="c10-r6-chain";
    host.innerHTML=`
      <div class="c10-r6-head">
        <div>
          <strong>契約 → 制作 → 本番システム 最終連動</strong>
          <p>本番稼働直前に、正式実契約とPRODUCTION本番の接続をDB側でも再確認します。</p>
        </div>
        <span class="c10-r6-badge">CENTER-10 R7-R6</span>
      </div>
      <div id="c10R6Body"><div class="c10-r6-db-warn">契約案件を選択すると最終連動を確認します。</div></div>
    `;

    const safety=goLive.querySelector(".c8-safety");
    if(safety) safety.insertAdjacentElement("afterend",host);
    else goLive.prepend(host);

    return host;
  }

  function bool(value){ return value===true; }

  function step(name,ok,good,bad,note) {
    return `
      <article class="c10-r6-step ${ok?"ok":"bad"}">
        <strong>${esc(name)}</strong>
        <span>${ok?"✓ "+esc(good):"! "+esc(bad)}</span>
        <small>${esc(note)}</small>
      </article>
    `;
  }

  function render() {
    ensurePanel();
    const body=$("c10R6Body");
    if(!body) return;

    if(!state.projectId){
      body.innerHTML='<div class="c10-r6-db-warn">契約案件を選択してください。</div>';
      forceActivationGuard();
      return;
    }

    if(!state.chain){
      body.innerHTML='<div class="c10-r6-db-warn">最終連動を確認しています…</div>';
      forceActivationGuard();
      return;
    }

    const links=state.chain.links||{};
    const c8=state.chain.center8_gate||{};
    const ready=bool(state.chain.ready_for_go_live);
    const blockers=Array.isArray(links.blockers)?links.blockers:[];

    const contractOk=
      bool(links.contract_found)&&
      bool(links.contract_active)&&
      bool(links.contract_started)&&
      bool(links.contract_client_match);

    const systemOk=
      bool(links.system_found)&&
      bool(links.system_production)&&
      bool(links.system_client_match);

    body.innerHTML=`
      <div class="c10-r6-grid">
        ${step(
          "実顧客",
          bool(links.client_found)&&bool(links.client_real),
          "本番対象",
          "DEMO / TEST",
          "検査用顧客は本番経路へ入りません。"
        )}
        ${step(
          "正式契約",
          contractOk,
          "active・開始済み",
          "契約条件未達",
          "契約・制作案件の顧客一致まで確認します。"
        )}
        ${step(
          "制作案件",
          bool(links.contract_client_match)&&bool(links.system_client_match),
          "接続一致",
          "接続不一致",
          "契約・制作・システムの顧客IDを照合します。"
        )}
        ${step(
          "本番システム",
          systemOk,
          "PRODUCTION",
          "本番未接続",
          "DEMO / STAGING / TESTでは本番確定できません。"
        )}
        ${step(
          "CENTER-8",
          bool(c8.activation_gate_ready),
          "品質ゲートOK",
          "未完了あり",
          "CENTER-7・STANDARD・セットアップ・Healthを再確認します。"
        )}
      </div>
      ${
        ready
          ? '<div class="c10-r6-ready">✅ 最終連動OK：DB側の本番経路条件を満たしています。CENTER-8の最終入力完了後に本番稼働できます。</div>'
          : `<div class="c10-r6-blockers"><strong>本番経路はロックされています。</strong>${
              blockers.length?`<br>${blockers.map((x)=>`・${esc(x)}`).join("<br>")}`:
              "<br>・CENTER-8の品質・STANDARD・セットアップ等に未完了があります。"
            }</div>`
      }
    `;

    forceActivationGuard();
  }

  function forceActivationGuard() {
    const button=$("c8Activate");
    if(!button) return;

    // R6は「禁止方向」だけ上書きする。readyでもCENTER-8自身の入力未完了なら有効化しない。
    if(!state.chain || !state.chain.ready_for_go_live){
      button.disabled=true;
      button.dataset.c10R6Locked="true";
      button.title="CENTER-10-R7-R6 最終連動が未完了です。";
    } else {
      button.dataset.c10R6Locked="false";
      button.title="";
    }
  }

  async function loadChain(projectId) {
    const seq=++state.loadSeq;
    state.projectId=projectId||"";
    state.chain=null;
    render();

    if(!state.projectId) return;

    try{
      state.loading=true;
      const sb=await client();
      const {data,error}=await sb.rpc("cc_center10_r6_get_production_chain",{
        p_project_id:state.projectId
      });
      if(seq!==state.loadSeq) return;
      if(error) throw error;
      state.chain=data||{};
      render();
    }catch(error){
      if(seq!==state.loadSeq) return;
      console.error(BUILD,error);
      ensurePanel();
      const body=$("c10R6Body");
      if(body){
        const missing=/cc_center10_r6_get_production_chain|PGRST|function/i.test(String(error.message||""));
        body.innerHTML=`
          <div class="c10-r6-db-warn">
            <strong>${missing?"R6のDB SQLを先に実行してください。":"最終連動を確認できません。"}</strong><br>
            ${esc(error.message||"DB接続を確認してください。")}
          </div>
        `;
      }
      forceActivationGuard();
    }finally{
      state.loading=false;
    }
  }

  function bindSelector() {
    const select=$("c8ProjectSelect");
    if(!select || select.dataset.c10R6Bound==="true") return false;

    select.dataset.c10R6Bound="true";
    select.addEventListener("change",()=>{
      setTimeout(()=>loadChain(select.value||""),50);
    });

    loadChain(select.value||"");
    return true;
  }

  function installObservers() {
    const board=$("c8Board");
    if(board && board.dataset.c10R6Observed!=="true"){
      board.dataset.c10R6Observed="true";
      new MutationObserver(()=>{
        setTimeout(forceActivationGuard,0);
      }).observe(board,{childList:true,subtree:true});
    }
  }

  async function bootstrap() {
    installStyle();

    let tries=0;
    const timer=setInterval(()=>{
      tries+=1;
      ensurePanel();
      const bound=bindSelector();
      installObservers();
      forceActivationGuard();

      if(bound && $("panel-go-live")){
        clearInterval(timer);
      } else if(tries>=160){
        clearInterval(timer);
      }
    },125);
  }

  if(document.readyState==="loading"){
    document.addEventListener("DOMContentLoaded",bootstrap,{once:true});
  } else {
    bootstrap();
  }
})();
