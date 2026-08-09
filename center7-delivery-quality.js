(() => {
  "use strict";

  const BUILD = "CONTROL-CENTER-19-CENTER7-R1-20260809";
  const CONFIG = window.DPRO_CONTROL_CENTER_CONFIG || {};
  const $ = (id) => document.getElementById(id);
  const $$ = (selector, scope=document) => Array.from(scope.querySelectorAll(selector));

  const state = {
    supabase:null,
    session:null,
    staff:null,
    projects:[],
    setupById:new Map(),
    deliveryById:new Map(),
    projectMetaById:new Map(),
    currentStandard:null,
    selectedProjectId:"",
    quality:null,
    search:"",
  };

  const setupLabels = {
    draft:"未設定",
    recommended:"おすすめ適用済み",
    confirmed:"契約内容確定",
    locked:"確定・ロック",
  };

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }

  function installStyle() {
    if ($("center7QualityStyle")) return;
    const style = document.createElement("style");
    style.id = "center7QualityStyle";
    style.textContent = `
      .c7q-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-end;margin-bottom:14px}
      .c7q-head h2{margin:0;font-size:23px}.c7q-head p{margin:6px 0 0;color:#68766f;font-size:10px;line-height:1.7}
      .c7q-guide{padding:13px 15px;border:1px solid #b9dccd;border-radius:13px;background:#eef9f4;color:#486159;font-size:10px;line-height:1.7}
      .c7q-selector{display:grid;grid-template-columns:minmax(300px,1fr) auto;gap:9px;margin:13px 0}
      .c7q-selector select{min-height:46px;border:1px solid #d5e3dd;border-radius:11px;background:#fff;padding:0 12px;font-weight:800}
      .c7q-hero{padding:17px;border-radius:16px;background:linear-gradient(135deg,#0b5f49,#073d31);color:#fff;display:flex;justify-content:space-between;gap:14px;align-items:flex-start}
      .c7q-hero small,.c7q-hero strong,.c7q-hero span{display:block}.c7q-hero small{color:#bde4d6;font-size:8px;font-weight:900;letter-spacing:.08em}.c7q-hero strong{margin-top:4px;font-size:20px}.c7q-hero span{margin-top:4px;color:#cde8de;font-size:9px}
      .c7q-gate{padding:8px 11px;border-radius:999px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.2);font-size:9px;font-weight:900;white-space:nowrap}
      .c7q-summary{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px;margin:11px 0}
      .c7q-metric{padding:12px;border:1px solid #d9e5e0;border-radius:13px;background:#fff}.c7q-metric b,.c7q-metric span{display:block}.c7q-metric b{font-size:20px;color:#0b5f49}.c7q-metric span{font-size:8px;color:#6b7974;margin-top:3px}
      .c7q-gate-panel{margin:12px 0;padding:17px;border-radius:16px;border:1px solid #e6ce87;background:#fffaf0;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:16px;align-items:center}.c7q-gate-panel.ready{border-color:#9ccfb7;background:#f3fbf7}
      .c7q-gate-panel h3{margin:0;font-size:19px}.c7q-gate-panel p{margin:5px 0 0;color:#69766f;font-size:9px;line-height:1.65}.c7q-gate-panel .btns{display:flex;gap:7px;flex-wrap:wrap}
      .c7q-section{margin-top:13px;padding:16px;border:1px solid #d9e5e0;border-radius:16px;background:#fff}.c7q-section h3{margin:0;font-size:15px}.c7q-section>p{margin:5px 0 11px;color:#68766f;font-size:9px}
      .c7q-auto-list,.c7q-manual-list{display:grid;gap:7px}.c7q-auto{display:grid;grid-template-columns:32px minmax(0,1fr) auto;gap:9px;align-items:center;padding:10px 11px;border:1px solid #e5ebe8;border-radius:11px}.c7q-mark{width:29px;height:29px;border-radius:8px;display:grid;place-items:center;background:#fff2cf;color:#936300;font-weight:900}.c7q-auto.ok .c7q-mark{background:#def5ea;color:#087253}.c7q-auto strong{display:block;font-size:9px}.c7q-auto small{display:block;margin-top:2px;color:#78857f;font-size:8px}.c7q-auto .value{font-size:8px;font-weight:900}
      .c7q-category{margin-top:12px}.c7q-category:first-child{margin-top:0}.c7q-category-title{display:flex;align-items:center;gap:7px;margin:0 0 7px;font-size:11px}.c7q-category-title span{font-size:8px;padding:4px 7px;border-radius:999px;background:#eef3f0;color:#62716b}
      .c7q-check{display:grid;grid-template-columns:minmax(220px,1.1fr) 145px minmax(220px,1fr);gap:8px;align-items:center;padding:10px;border:1px solid #e4ebe8;border-radius:11px;margin-top:6px}.c7q-check.done{border-color:#a8d7c1;background:#f9fcfa}
      .c7q-check strong{display:block;font-size:9px}.c7q-check small{display:block;margin-top:3px;color:#75827d;font-size:8px;line-height:1.5}.c7q-check select,.c7q-check input{min-height:38px;border:1px solid #d7e3de;border-radius:9px;background:#fff;padding:0 9px;font-size:9px}.c7q-check input{width:100%}
      .c7q-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:11px}.c7q-empty{padding:28px;text-align:center;border:1px dashed #c4d3cc;border-radius:13px;color:#6f7d77;background:#fff}
      .c7q-pill{display:inline-flex;padding:5px 8px;border-radius:999px;background:#eef2f0;color:#61706a;font-size:8px;font-weight:900}.c7q-pill.green{background:#def5ea;color:#087253}.c7q-pill.amber{background:#fff2cf;color:#936300}.c7q-pill.red{background:#fee8ed;color:#b63247}
      @media(max-width:1050px){.c7q-summary{grid-template-columns:repeat(3,1fr)}.c7q-check{grid-template-columns:1fr 140px}.c7q-check input{grid-column:1/-1}}
      @media(max-width:720px){.c7q-head,.c7q-hero{display:block}.c7q-selector,.c7q-gate-panel{grid-template-columns:1fr}.c7q-summary{grid-template-columns:repeat(2,1fr)}.c7q-check{grid-template-columns:1fr}.c7q-check input{grid-column:auto}}
    `;
    document.head.appendChild(style);
  }

  function installPanel() {
    const tabs = document.querySelector(".tabs");
    if (!tabs || $("panel-quality")) return false;

    const button = document.createElement("button");
    button.className = "tab";
    button.type = "button";
    button.dataset.tab = "quality";
    button.dataset.center7Quality = "true";
    button.textContent = "納品前チェック";
    tabs.appendChild(button);

    const panel = document.createElement("section");
    panel.id = "panel-quality";
    panel.className = "tab-panel hidden";
    panel.innerHTML = `
      <div class="c7q-head">
        <div>
          <h2>納品前完成チェック</h2>
          <p>自動判定できるものはCONTROL CENTERが確認し、実機・見た目・オーナー確認だけ人がチェックします。</p>
        </div>
        <span class="c7q-pill green">CENTER-7</span>
      </div>
      <div class="c7q-guide">
        「制作が終わった」と「お客様へ渡してよい」は分けて管理します。営業時間・休日・写真・予約・LINEなどは、契約Featureに応じて必要な確認だけ表示します。
      </div>
      <div class="c7q-selector">
        <select id="c7qProjectSelect"><option value="">契約案件を選択</option></select>
        <button id="c7qReload" class="btn secondary" type="button">再確認</button>
      </div>
      <div id="c7qBoard"><div class="c7q-empty">契約案件を選択してください。</div></div>
    `;

    const projectsPanel = $("panel-projects");
    if (projectsPanel) projectsPanel.insertAdjacentElement("beforebegin", panel);
    else tabs.insertAdjacentElement("afterend", panel);

    button.addEventListener("click", async () => {
      $$(".tab").forEach((b) => b.classList.toggle("active", b === button));
      $$(".tab-panel").forEach((p) => p.classList.add("hidden"));
      panel.classList.remove("hidden");
      if (!state.supabase) await loadAll();
    });

    $("c7qProjectSelect").addEventListener("change", async () => {
      state.selectedProjectId = $("c7qProjectSelect").value;
      if (state.selectedProjectId) {
        localStorage.setItem("dpro_center7_quality_project", state.selectedProjectId);
        await loadQuality();
      } else {
        $("c7qBoard").innerHTML = '<div class="c7q-empty">契約案件を選択してください。</div>';
      }
    });
    $("c7qReload").addEventListener("click", async () => {
      await loadAll(true);
    });

    return true;
  }

  async function client() {
    if (state.supabase) return state.supabase;
    const base = String(CONFIG.apiBaseUrl || "").replace(/\/$/,"");
    const response = await fetch(`${base}/api/public-config`,{cache:"no-store"});
    const pub = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(pub.message || pub.error || `HTTP ${response.status}`);

    state.supabase = window.supabase.createClient(
      pub.supabaseUrl,
      pub.supabasePublishableKey || pub.supabaseAnonKey,
      {
        auth:{
          persistSession:true,
          autoRefreshToken:true,
          detectSessionInUrl:false,
          storageKey:pub.sessionStorageKey || "dpro-control-center-auth-v1",
        }
      }
    );
    const {data,error} = await state.supabase.auth.getSession();
    if (error) throw error;
    state.session = data.session;
    if (!state.session?.user) throw new Error("CONTROL CENTERへログインしてください。");

    const {data:staff,error:staffError} = await state.supabase
      .from("cc_staff").select("id,role_key,status")
      .eq("auth_user_id",state.session.user.id).maybeSingle();
    if (staffError) throw staffError;
    if (!staff || staff.status !== "active") throw new Error("有効なDPROスタッフではありません。");
    state.staff = staff;
    return state.supabase;
  }

  async function loadAll(forceQuality=false) {
    try {
      const sb = await client();
      const [setupRes,deliveryRes,metaRes,standardRes] = await Promise.all([
        sb.from("cc_v_contract_setup_overview").select("*").order("project_code"),
        sb.from("cc_v_delivery_project_overview_v2").select("*").order("updated_at",{ascending:false}),
        sb.from("cc_delivery_projects").select("id,project_code,project_name,contract_id,system_instance_id,product_system_code,product_name_snapshot,status,standard_version_id"),
        sb.from("cc_standard_versions").select("version_code,effective_date").eq("standard_code","DPRO_STANDARD").eq("status","current").order("effective_date",{ascending:false}).limit(1).maybeSingle(),
      ]);
      for (const r of [setupRes,deliveryRes,metaRes,standardRes]) if (r.error) throw r.error;

      state.setupById = new Map((setupRes.data||[]).map((x)=>[x.project_id,x]));
      state.deliveryById = new Map((deliveryRes.data||[]).map((x)=>[x.id,x]));
      state.projectMetaById = new Map((metaRes.data||[]).map((x)=>[x.id,x]));
      state.currentStandard = standardRes.data || null;

      state.projects = (deliveryRes.data||[]).map((d)=>{
        const s = state.setupById.get(d.id)||{};
        const m = state.projectMetaById.get(d.id)||{};
        return {
          ...d,...m,...s,
          id:d.id,
          project_id:d.id,
          project_code:s.project_code||d.project_code||m.project_code,
          project_name:s.project_name||d.project_name||m.project_name,
          client_name:s.client_name||d.client_name||"契約者",
          system_name:s.system_name||d.effective_system_name||d.system_name||m.product_name_snapshot||m.product_system_code||"",
          system_code:s.system_code||d.effective_system_code||d.system_code||m.product_system_code||"",
          standard_version:s.standard_version||d.standard_version||"",
        };
      });

      const select = $("c7qProjectSelect");
      const prior = state.selectedProjectId || localStorage.getItem("dpro_center7_quality_project") || "";
      select.innerHTML = '<option value="">契約案件を選択</option>' + state.projects.map((p)=>
        `<option value="${esc(p.id)}">${esc(p.client_name)}｜${esc(p.system_name||"製品未設定")}｜${esc(p.project_code||"")}</option>`
      ).join("");

      if (prior && state.projects.some((p)=>p.id===prior)) state.selectedProjectId=prior;
      else state.selectedProjectId=state.projects[0]?.id||"";
      select.value=state.selectedProjectId;

      if (state.selectedProjectId || forceQuality) await loadQuality();
    } catch(error) {
      console.error(BUILD,error);
      $("c7qBoard").innerHTML=`<div class="c7q-empty">${esc(error.message||"納品前チェックを読み込めませんでした。")}</div>`;
    }
  }

  async function loadQuality() {
    if (!state.selectedProjectId) return;
    const sb = await client();
    $("c7qBoard").innerHTML='<div class="c7q-empty">納品条件を確認しています…</div>';

    const {data,error}=await sb.rpc("cc_center7_get_quality_checks",{
      p_project_id:state.selectedProjectId
    });
    if (error) {
      $("c7qBoard").innerHTML=`<div class="c7q-empty">${esc(error.message||"CENTER-7 DBを確認してください。")}</div>`;
      return;
    }
    state.quality=data||{};
    renderQuality();
  }

  function analyze(project) {
    const setup=state.setupById.get(project.id)||{};
    const delivery=state.deliveryById.get(project.id)||{};
    const meta=state.projectMetaById.get(project.id)||{};

    const setupConfirmed=["confirmed","locked"].includes(setup.setup_status||"draft");
    const dependencies=Number(setup.dependency_issues||0);
    const featureTasks=Number(setup.feature_tasks_open||0);
    const blockingSteps=Number(delivery.blocking_steps_open||0);
    const blockingChecks=Number(delivery.blocking_checks_open||0);
    const linkedContract=Boolean(meta.contract_id);
    const linkedSystem=Boolean(meta.system_instance_id);
    const standardCurrent=Boolean(
      state.currentStandard?.version_code &&
      project.standard_version===state.currentStandard.version_code
    );

    const auto = [
      {ok:linkedContract,title:"契約紐付け",detail:linkedContract?"契約情報が制作案件へ紐付いています。":"契約・サービスで本契約を紐付けます。",value:linkedContract?"OK":"未設定"},
      {ok:linkedSystem,title:"本番システム紐付け",detail:linkedSystem?"本番システム/施設コードへ紐付いています。":"制作完了前に本番システムを紐付けます。",value:linkedSystem?"OK":"未設定"},
      {ok:setupConfirmed,title:"契約セットアップ",detail:setupConfirmed?"店舗別Featureが確定済みです。":"契約セットアップを確定してください。",value:setupLabels[setup.setup_status||"draft"]||"未設定"},
      {ok:dependencies===0,title:"Feature依存関係",detail:dependencies===0?"必須依存の不足はありません。":`依存問題 ${dependencies}件`,value:`${dependencies}件`},
      {ok:featureTasks===0,title:"制作タスク",detail:featureTasks===0?"CENTER-3制作タスクは完了しています。":`制作タスク ${featureTasks}件が残っています。`,value:`${featureTasks}件`},
      {ok:blockingSteps===0,title:"制作STEP",detail:blockingSteps===0?"納品ブロックSTEPはありません。":`必須STEP ${blockingSteps}件が未完了です。`,value:`${blockingSteps}件`},
      {ok:blockingChecks===0,title:"DPRO STANDARDチェック",detail:blockingChecks===0?"納品ブロック標準チェックは完了しています。":`必須標準 ${blockingChecks}件が未完了です。`,value:`${blockingChecks}件`},
      {ok:standardCurrent,title:"DPRO STANDARD Version",detail:standardCurrent?"この案件は現行版です。":`${project.standard_version||"未設定"} → ${state.currentStandard?.version_code||"現行版"}`,value:standardCurrent?(state.currentStandard?.version_code||"現行"):"更新"},
    ];

    const autoOpen=auto.filter((x)=>!x.ok).length;
    const manualOpen=Number(state.quality?.open||0);
    const finalReady=autoOpen===0 && manualOpen===0;

    return {auto,autoOpen,manualOpen,finalReady};
  }

  function renderQuality() {
    const project=state.projects.find((p)=>p.id===state.selectedProjectId);
    if (!project) return;
    const a=analyze(project);
    const checks=Array.isArray(state.quality?.checks)?state.quality.checks:[];
    const required=Number(state.quality?.required||0);
    const done=Number(state.quality?.done||0);

    const categories=new Map();
    checks.forEach((x)=>{
      if(!categories.has(x.category)) categories.set(x.category,[]);
      categories.get(x.category).push(x);
    });

    $("c7qBoard").innerHTML=`
      <div class="c7q-hero">
        <div>
          <small>${esc(project.project_code||"")}</small>
          <strong>${esc(project.client_name)}｜${esc(project.system_name||project.system_code||"製品未設定")}</strong>
          <span>${esc(project.project_name||"")}・DPRO STANDARD ${esc(project.standard_version||"未設定")}</span>
        </div>
        <div class="c7q-gate">${a.finalReady?"納品前条件 OK":`確認 ${a.autoOpen+a.manualOpen}件`}</div>
      </div>

      <div class="c7q-summary">
        ${[
          [a.auto.length-a.autoOpen,"自動判定OK"],
          [a.autoOpen,"自動判定未完了"],
          [required,"実機チェック"],
          [done,"実機確認済み"],
          [a.manualOpen,"実機未確認"],
          [a.finalReady?"OK":"—","納品前判定"],
        ].map(([v,l])=>`<article class="c7q-metric"><b>${esc(v)}</b><span>${esc(l)}</span></article>`).join("")}
      </div>

      <div class="c7q-gate-panel ${a.finalReady?"ready":""}">
        <div>
          <h3>${a.finalReady?"✅ お客様へ納品できる確認状態です":"⚠ まだ納品前確認が残っています"}</h3>
          <p>${a.finalReady
            ?"自動条件と実機チェックがすべて揃っています。既存の「制作・納品」で最終状態を確認して本番稼働へ進めます。"
            :`自動判定 ${a.autoOpen}件 / 実機確認 ${a.manualOpen}件 を上から確認してください。`}</p>
        </div>
        <div class="btns">
          <a class="btn secondary" href="setup.html?project=${encodeURIComponent(project.id)}">契約セットアップ</a>
          <button id="c7qOpenProjects" class="btn primary" type="button">制作中・契約者へ戻る</button>
        </div>
      </div>

      <section class="c7q-section">
        <h3>1. CONTROL CENTER 自動判定</h3>
        <p>DBと進捗から判断できる項目。ここは手動でOKにできません。</p>
        <div class="c7q-auto-list">
          ${a.auto.map((x)=>`
            <article class="c7q-auto ${x.ok?"ok":""}">
              <span class="c7q-mark">${x.ok?"✓":"!"}</span>
              <div><strong>${esc(x.title)}</strong><small>${esc(x.detail)}</small></div>
              <span class="value">${esc(x.value)}</span>
            </article>
          `).join("")}
        </div>
      </section>

      <section class="c7q-section">
        <h3>2. 納品前の実機・目視確認</h3>
        <p>システムでは断定できない項目だけ、人が実際の画面・端末・オーナー確認でチェックします。</p>
        <div class="c7q-manual-list">
          ${[...categories.entries()].map(([category,items])=>`
            <div class="c7q-category">
              <h4 class="c7q-category-title">${esc(category)} <span>${items.length}件</span></h4>
              ${items.map((x)=>`
                <article class="c7q-check ${x.status==="done"?"done":""}" data-c7q-code="${esc(x.check_code)}">
                  <div>
                    <strong>${esc(x.check_name)}</strong>
                    <small>${esc(x.description||"")}${x.feature_code?` / Feature: ${esc(x.feature_code)}`:""}</small>
                  </div>
                  <select data-c7q-status ${canWrite()?"":"disabled"}>
                    <option value="not_started" ${x.status==="not_started"?"selected":""}>未確認</option>
                    <option value="done" ${x.status==="done"?"selected":""}>完了</option>
                    <option value="not_applicable" ${x.status==="not_applicable"?"selected":""}>対象外</option>
                  </select>
                  <input data-c7q-note value="${esc(x.note||"")}" placeholder="確認メモ / 対象外理由" ${canWrite()?"":"disabled"}>
                </article>
              `).join("")}
            </div>
          `).join("")||'<div class="c7q-empty">実機チェックはありません。</div>'}
        </div>
        ${canWrite()?'<div class="c7q-actions"><button id="c7qSave" class="btn primary" type="button">納品前チェックを保存・再判定</button></div>':""}
      </section>
    `;

    $("c7qOpenProjects")?.addEventListener("click",()=>{
      const b=document.querySelector('.tab[data-tab="projects"]');
      b?.click();
    });
    $("c7qSave")?.addEventListener("click",saveQuality);
  }

  function canWrite() {
    return ["owner_admin","technical_admin","support"].includes(state.staff?.role_key);
  }

  async function saveQuality() {
    const button=$("c7qSave");
    const items=$$("[data-c7q-code]",$("c7qBoard")).map((row)=>({
      check_code:row.dataset.c7qCode,
      status:row.querySelector("[data-c7q-status]")?.value||"not_started",
      note:row.querySelector("[data-c7q-note]")?.value?.trim()||"",
    }));

    button.disabled=true;
    button.textContent="保存・再判定中…";
    try {
      const sb=await client();
      const {error}=await sb.rpc("cc_center7_save_quality_checks",{
        p_project_id:state.selectedProjectId,
        p_items:items
      });
      if(error) throw error;
      await loadQuality();
    } catch(error) {
      alert(error.message||"納品前チェックを保存できませんでした。");
    } finally {
      if($("c7qSave")){
        $("c7qSave").disabled=false;
        $("c7qSave").textContent="納品前チェックを保存・再判定";
      }
    }
  }

  function boot() {
    installStyle();
    if (installPanel()) return;
    const observer=new MutationObserver(()=>{
      if(installPanel()) observer.disconnect();
    });
    observer.observe(document.documentElement,{childList:true,subtree:true});
    setTimeout(()=>observer.disconnect(),12000);
  }

  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",boot,{once:true});
  else boot();
})();
