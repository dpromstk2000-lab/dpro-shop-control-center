(() => {
  "use strict";

  const BUILD = "CONTROL-CENTER-20-CENTER8-20260809";
  const CONFIG = window.DPRO_CONTROL_CENTER_CONFIG || {};
  const $ = (id) => document.getElementById(id);
  const $$ = (selector, scope=document) => Array.from(scope.querySelectorAll(selector));

  const state = {
    supabase:null,
    session:null,
    staff:null,
    projects:[],
    selectedProjectId:"",
    detail:null,
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

  function canActivate() {
    return ["owner_admin","technical_admin"].includes(state.staff?.role_key);
  }

  function localDateTime(value) {
    if (!value) return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    const pad=(n)=>String(n).padStart(2,"0");
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function todayPlus(days) {
    const d = new Date();
    d.setDate(d.getDate()+days);
    const pad=(n)=>String(n).padStart(2,"0");
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  }

  function pill(text,tone="") {
    return `<span class="c8-pill ${esc(tone)}">${esc(text)}</span>`;
  }

  function installStyle() {
    if ($("center8Style")) return;
    const style=document.createElement("style");
    style.id="center8Style";
    style.textContent=`
      .c8-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-end;margin-bottom:14px}
      .c8-head h2{margin:0;font-size:23px}.c8-head p{margin:6px 0 0;color:#68766f;font-size:10px;line-height:1.7}
      .c8-guide{padding:13px 15px;border:1px solid #b9dccd;border-radius:13px;background:#eef9f4;color:#486159;font-size:10px;line-height:1.7}
      .c8-safety{margin-top:8px;padding:12px 14px;border:1px solid #ead18b;border-radius:12px;background:#fff9e9;color:#805c00;font-size:9px;line-height:1.65}
      .c8-selector{display:grid;grid-template-columns:minmax(300px,1fr) auto;gap:9px;margin:13px 0}
      .c8-selector select{min-height:46px;border:1px solid #d5e3dd;border-radius:11px;background:#fff;padding:0 12px;font-weight:800}
      .c8-hero{padding:17px;border-radius:16px;background:linear-gradient(135deg,#0b5f49,#073d31);color:#fff;display:flex;justify-content:space-between;gap:14px;align-items:flex-start}
      .c8-hero small,.c8-hero strong,.c8-hero span{display:block}.c8-hero small{color:#bde4d6;font-size:8px;font-weight:900;letter-spacing:.08em}.c8-hero strong{margin-top:4px;font-size:20px}.c8-hero span{margin-top:4px;color:#cde8de;font-size:9px}
      .c8-status{padding:8px 11px;border-radius:999px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.2);font-size:9px;font-weight:900;white-space:nowrap}
      .c8-summary{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;margin:11px 0}
      .c8-metric{padding:12px;border:1px solid #d9e5e0;border-radius:13px;background:#fff}.c8-metric b,.c8-metric span{display:block}.c8-metric b{font-size:18px;color:#0b5f49}.c8-metric span{font-size:8px;color:#6b7974;margin-top:3px}
      .c8-gates{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:7px;margin-top:11px}
      .c8-gate{padding:10px;border:1px solid #e1e8e5;border-radius:11px;background:#fff;min-height:88px}.c8-gate.ok{border-color:#a6d6c0;background:#f8fcfa}.c8-gate.warn{border-color:#e8cd82;background:#fffdf7}.c8-gate.bad{border-color:#e5b0ba;background:#fff9fa}
      .c8-gate strong,.c8-gate span,.c8-gate small{display:block}.c8-gate strong{font-size:9px}.c8-gate span{margin-top:6px;font-size:9px;font-weight:900}.c8-gate.ok span{color:#087253}.c8-gate.warn span{color:#936300}.c8-gate.bad span{color:#b63247}.c8-gate small{margin-top:3px;color:#73817b;font-size:8px;line-height:1.5}
      .c8-form{margin-top:12px;display:grid;gap:12px}.c8-section{padding:16px;border:1px solid #d9e5e0;border-radius:16px;background:#fff}
      .c8-section h3{margin:0;font-size:15px}.c8-section>p{margin:5px 0 12px;color:#68766f;font-size:9px}
      .c8-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.c8-grid.three{grid-template-columns:repeat(3,minmax(0,1fr))}
      .c8-field{display:grid;gap:5px}.c8-field.full{grid-column:1/-1}.c8-field label{font-size:8px;font-weight:900;color:#61706a}
      .c8-field input,.c8-field textarea{min-height:42px;border:1px solid #d8e4df;border-radius:9px;background:#fff;padding:0 10px;font-size:9px;color:#15251f}.c8-field textarea{min-height:78px;padding:9px 10px;resize:vertical}
      .c8-checkline{display:flex;align-items:flex-start;gap:9px;padding:12px;border:1px solid #dce7e2;border-radius:11px;background:#f9fbfa}.c8-checkline input{width:18px;height:18px;accent-color:#0b5f49}.c8-checkline strong{display:block;font-size:9px}.c8-checkline small{display:block;margin-top:3px;color:#74817c;font-size:8px}
      .c8-final{margin-top:12px;padding:17px;border-radius:16px;border:1px solid #e6ce87;background:#fffaf0;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:14px;align-items:center}.c8-final.ready{border-color:#9ccfb7;background:#f2fbf7}.c8-final.live{border-color:#78bba0;background:#eaf8f1}
      .c8-final h3{margin:0;font-size:19px}.c8-final p{margin:5px 0 0;color:#68766f;font-size:9px;line-height:1.6}.c8-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
      .c8-pill{display:inline-flex;padding:5px 8px;border-radius:999px;background:#eef2f0;color:#61706a;font-size:8px;font-weight:900}.c8-pill.green{background:#def5ea;color:#087253}.c8-pill.amber{background:#fff2cf;color:#936300}.c8-pill.red{background:#fee8ed;color:#b63247}.c8-pill.blue{background:#edf6ff;color:#246ba9}
      .c8-empty{padding:28px;text-align:center;border:1px dashed #c4d3cc;border-radius:13px;color:#6f7d77;background:#fff}
      .c8-readonly{opacity:.82}.c8-readonly input,.c8-readonly textarea{background:#f4f7f5}
      @media(max-width:1050px){.c8-summary{grid-template-columns:repeat(3,1fr)}.c8-gates{grid-template-columns:repeat(3,1fr)}.c8-grid.three{grid-template-columns:1fr 1fr}}
      @media(max-width:720px){.c8-head,.c8-hero{display:block}.c8-selector,.c8-final{grid-template-columns:1fr}.c8-summary,.c8-gates,.c8-grid,.c8-grid.three{grid-template-columns:1fr}.c8-actions{justify-content:flex-start}}
    `;
    document.head.appendChild(style);
  }

  function installPanel() {
    const tabs=document.querySelector(".tabs");
    const qualityTab=document.querySelector("[data-center7-quality]");
    const qualityPanel=$("panel-quality");

    // CENTER-7 の直後に置くため、CENTER-7生成完了を待つ
    if(!tabs || !qualityTab || !qualityPanel || $("panel-go-live")) return false;

    const button=document.createElement("button");
    button.className="tab";
    button.type="button";
    button.dataset.tab="go-live";
    button.dataset.center8GoLive="true";
    button.textContent="本番稼働";
    qualityTab.insertAdjacentElement("afterend",button);

    const panel=document.createElement("section");
    panel.id="panel-go-live";
    panel.className="tab-panel hidden";
    panel.innerHTML=`
      <div class="c8-head">
        <div>
          <h2>本番稼働・納品記録</h2>
          <p>CENTER-7を通過した案件だけ、正式な納品記録を残して本番システムを「稼働中」へ切り替えます。</p>
        </div>
        <span class="c8-pill green">CENTER-8</span>
      </div>
      <div class="c8-guide">
        納品時点のVersion・URL・引き渡し日・本番稼働日を記録します。確定後は履歴としてロックし、日常の本番台帳は「DPROシステム」で管理します。
      </div>
      <div class="c8-safety">
        DEMO / STAGING環境では「本番稼働確定」はできません。実契約の production システムが紐付いた案件だけ有効になります。
      </div>
      <div class="c8-selector">
        <select id="c8ProjectSelect"><option value="">契約案件を選択</option></select>
        <button id="c8Reload" class="btn secondary" type="button">再確認</button>
      </div>
      <div id="c8Board"><div class="c8-empty">契約案件を選択してください。</div></div>
    `;
    qualityPanel.insertAdjacentElement("afterend",panel);

    button.addEventListener("click",async()=>{
      $$(".tab").forEach((b)=>b.classList.toggle("active",b===button));
      $$(".tab-panel").forEach((p)=>p.classList.add("hidden"));
      panel.classList.remove("hidden");
      if(!state.supabase) await loadProjects();
    });

    $("c8ProjectSelect").addEventListener("change",async()=>{
      state.selectedProjectId=$("c8ProjectSelect").value;
      if(state.selectedProjectId){
        localStorage.setItem("dpro_center8_go_live_project",state.selectedProjectId);
        await loadDetail();
      } else {
        $("c8Board").innerHTML='<div class="c8-empty">契約案件を選択してください。</div>';
      }
    });
    $("c8Reload").addEventListener("click",async()=>loadProjects(true));
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

  async function loadProjects(force=false){
    try{
      const sb=await client();
      const {data,error}=await sb
        .from("cc_v_delivery_project_overview_v2")
        .select("*")
        .order("updated_at",{ascending:false});
      if(error) throw error;
      state.projects=data||[];

      const select=$("c8ProjectSelect");
      const prior=state.selectedProjectId
        ||localStorage.getItem("dpro_center8_go_live_project")
        ||localStorage.getItem("dpro_center7_quality_project")
        ||"";

      select.innerHTML='<option value="">契約案件を選択</option>'+
        state.projects.map((p)=>`
          <option value="${esc(p.id)}">
            ${esc(p.client_name||"契約者")}｜${esc(p.effective_system_name||p.system_name||p.project_name||"製品未設定")}｜${esc(p.project_code||"")}
          </option>
        `).join("");

      if(prior&&state.projects.some((p)=>p.id===prior)) state.selectedProjectId=prior;
      else state.selectedProjectId=state.projects[0]?.id||"";

      select.value=state.selectedProjectId;
      if(state.selectedProjectId) await loadDetail();
      else $("c8Board").innerHTML='<div class="c8-empty">契約案件がありません。</div>';
    }catch(error){
      console.error(BUILD,error);
      $("c8Board").innerHTML=`<div class="c8-empty">${esc(error.message||"CENTER-8を読み込めませんでした。")}</div>`;
    }
  }

  async function loadDetail(){
    const sb=await client();
    $("c8Board").innerHTML='<div class="c8-empty">本番稼働条件を確認しています…</div>';

    const {data,error}=await sb.rpc("cc_center8_get_go_live",{
      p_project_id:state.selectedProjectId
    });

    if(error){
      $("c8Board").innerHTML=`<div class="c8-empty">${esc(error.message||"CENTER-8 DBを確認してください。")}</div>`;
      return;
    }

    state.detail=data||{};
    renderDetail();
  }

  function gateItems(gate){
    return [
      ["契約紐付け",gate.linked_contract,gate.linked_contract?"本契約あり":"契約未紐付け"],
      ["本番システム",gate.linked_system&&gate.production_system,
        !gate.linked_system?"未紐付け":
        gate.production_system?"production":"DEMO / STAGING"],
      ["契約セットアップ",gate.setup_confirmed,
        gate.setup_confirmed?"確定済み":gate.setup_status||"未設定"],
      ["Feature依存",gate.dependencies_clear,
        gate.dependencies_clear?"0件":`${Number(gate.dependency_issues||0)}件`],
      ["制作タスク",gate.feature_tasks_clear,
        gate.feature_tasks_clear?"0件":`${Number(gate.feature_tasks_open||0)}件`],
      ["制作STEP",gate.delivery_steps_clear,
        gate.delivery_steps_clear?"完了":`${Number(gate.blocking_steps_open||0)}件残り`],
      ["STANDARDチェック",gate.standard_checks_clear,
        gate.standard_checks_clear?"完了":`${Number(gate.blocking_checks_open||0)}件残り`],
      ["CENTER-7",gate.quality_clear,
        gate.quality_clear?"実機確認完了":`${Number(gate.quality_open||0)}件未確認`],
      ["DPRO STANDARD",gate.standard_current,
        gate.standard_current?gate.current_standard||"現行":"現行版へ更新"],
      ["System Health",gate.health_not_error,
        gate.health_not_error?"エラーなし":"ERROR"],
    ];
  }

  function recordFieldsComplete(r){
    const access=Boolean(r.production_owner_url||r.production_public_url);
    return {
      release:Boolean(String(r.final_release_version||"").trim()),
      delivered:Boolean(r.delivered_at),
      live:Boolean(r.go_live_at),
      handoff:Boolean(r.owner_handoff_completed),
      maintenance:Boolean(r.next_maintenance_date),
      access,
      all:Boolean(
        String(r.final_release_version||"").trim()
        &&r.delivered_at
        &&r.go_live_at
        &&r.owner_handoff_completed
        &&r.next_maintenance_date
        &&access
      )
    };
  }

  function renderDetail(){
    const d=state.detail||{};
    const p=d.project||{};
    const s=d.system||null;
    const g=d.gate||{};
    const r=d.record||{};
    const isLive=r.record_status==="live";
    const complete=recordFieldsComplete(r);
    const gates=gateItems(g);
    const gateOk=gates.filter((x)=>x[1]).length;
    const activateReady=Boolean(g.activation_gate_ready&&complete.all&&!isLive);

    const systemLabel=s
      ? `${s.system_name||s.system_code} / ${s.facility_code}`
      : "本番システム未紐付け";

    $("c8Board").innerHTML=`
      <div class="c8-hero">
        <div>
          <small>${esc(p.project_code||"")}</small>
          <strong>${esc(systemLabel)}</strong>
          <span>${esc(p.project_name||"")}・${s?esc(s.environment):"environment未設定"}</span>
        </div>
        <div class="c8-status">${isLive?"本番稼働中":g.activation_gate_ready?"稼働準備OK":"準備中"}</div>
      </div>

      <div class="c8-summary">
        ${[
          [gateOk,"自動ゲートOK"],
          [gates.length-gateOk,"自動ゲート未完了"],
          [`${Number(g.quality_done||0)}/${Number(g.quality_required||0)}`,"CENTER-7"],
          [s?.environment||"—","環境"],
          [isLive?"LIVE":activateReady?"READY":"—","本番稼働"],
        ].map(([v,l])=>`<article class="c8-metric"><b>${esc(v)}</b><span>${esc(l)}</span></article>`).join("")}
      </div>

      <div class="c8-gates">
        ${gates.map(([name,ok,value])=>`
          <article class="c8-gate ${ok?"ok":name==="本番システム"&&!g.production_system?"bad":"warn"}">
            <strong>${esc(name)}</strong>
            <span>${ok?"✓ "+esc(value):"! "+esc(value)}</span>
            <small>${ok?"本番稼働条件を満たしています。":"先にこの項目を完了してください。"}</small>
          </article>
        `).join("")}
      </div>

      <div class="c8-form ${isLive?"c8-readonly":""}">
        <section class="c8-section">
          <h3>1. 最終Version・本番URL</h3>
          <p>DPROシステム台帳の現在値を初期表示します。納品時点の最終値として確認・保存します。</p>

          <div class="c8-grid three">
            ${field("最終Release Version","c8Release",r.final_release_version||"","例：HAIR-PROD-1 / 20260809",isLive)}
            ${field("Worker Version","c8WorkerVersion",r.final_worker_version||s?.worker_version||"","",isLive)}
            ${field("Database Version","c8DbVersion",r.final_database_version||s?.database_version||"","",isLive)}
            ${field("Frontend Version","c8FrontVersion",r.final_frontend_version||s?.frontend_version||"","",isLive)}
            ${field("Worker URL","c8WorkerUrl",r.production_worker_url||"","https://...",isLive)}
            ${field("公開URL","c8PublicUrl",r.production_public_url||s?.public_url||"","https://...",isLive)}
            ${field("オーナーURL","c8OwnerUrl",r.production_owner_url||s?.owner_url||"","https://...",isLive)}
            ${field("お客様URL","c8MemberUrl",r.production_member_url||s?.member_url||"","https://...",isLive)}
            ${field("スタッフURL","c8StaffUrl",r.production_staff_url||s?.staff_url||"","https://...",isLive)}
            ${field("iPad URL","c8IpadUrl",r.production_ipad_url||s?.ipad_url||"","https://...",isLive)}
            ${field("system-check URL","c8SystemCheckUrl",r.production_system_check_url||s?.system_check_url||"","https://...",isLive)}
            ${field("health URL","c8HealthUrl",r.production_health_url||s?.health_url||"","https://...",isLive)}
          </div>
        </section>

        <section class="c8-section">
          <h3>2. 納品・本番稼働・引き渡し</h3>
          <p>実際にお客様へ渡した日時と、本番運用開始日時を記録します。</p>

          <div class="c8-grid">
            ${field("納品日時","c8DeliveredAt",localDateTime(r.delivered_at),"","", "datetime-local",isLive)}
            ${field("本番稼働日時","c8GoLiveAt",localDateTime(r.go_live_at),"","", "datetime-local",isLive)}
          </div>

          <div class="c8-checkline" style="margin-top:9px">
            <input id="c8Handoff" type="checkbox" ${r.owner_handoff_completed?"checked":""} ${isLive?"disabled":""}>
            <div>
              <strong>オーナーへの引き渡し完了</strong>
              <small>ログイン方法・主要操作・本番URL・問い合わせ方法まで案内済みとして記録します。</small>
            </div>
          </div>

          <div class="c8-grid" style="margin-top:9px">
            ${textarea("引き渡しメモ","c8HandoffNote",r.owner_handoff_note||"","案内した内容・注意点",isLive)}
            ${textarea("リリースメモ","c8ReleaseNote",r.release_note||"","今回納品した内容",isLive)}
          </div>
        </section>

        <section class="c8-section">
          <h3>3. 次回保守確認</h3>
          <p>納品して終わりにせず、次に確認する日を必ず残します。</p>
          <div class="c8-grid">
            ${field("次回保守確認日","c8MaintenanceDate",r.next_maintenance_date||(!isLive?todayPlus(30):""),"","", "date",isLive)}
            ${textarea("保守確認メモ","c8MaintenanceNote",r.maintenance_note||"","例：初月運用・予約状況・LINE導線・エラー確認",isLive)}
          </div>
        </section>
      </div>

      <div class="c8-final ${isLive?"live":activateReady?"ready":""}">
        <div>
          <h3>${
            isLive
              ?"✅ 本番稼働記録が確定しています"
              :activateReady
                ?"✅ 本番稼働を確定できます"
                :"⚠ 本番稼働前に確認が必要です"
          }</h3>
          <p>${
            isLive
              ?`稼働日時：${esc(new Date(r.go_live_at).toLocaleString("ja-JP"))}。この納品記録は履歴としてロックされています。`
              :!g.production_system
                ?"実契約の production システムを紐付けるまで本番稼働ボタンは有効になりません。DEMOで誤確定することはありません。"
                :!g.activation_gate_ready
                  ?"CENTER-7・制作STEP・STANDARD・契約セットアップの未完了を先に解消してください。"
                  :"最終Version・納品日時・稼働日時・引き渡し・次回保守日・本番URLを入力してください。"
          }</p>
        </div>
        <div class="c8-actions">
          <button id="c8Quality" class="btn secondary" type="button">納品前チェックへ</button>
          ${
            !isLive&&canWrite()
              ?'<button id="c8Save" class="btn secondary" type="button">下書きを保存</button>'
              :""
          }
          ${
            !isLive&&canActivate()
              ?`<button id="c8Activate" class="btn primary" type="button" ${activateReady?"":"disabled"}>本番稼働を確定</button>`
              :""
          }
        </div>
      </div>
    `;

    $("c8Quality")?.addEventListener("click",()=>{
      document.querySelector("[data-center7-quality]")?.click();
    });
    $("c8Save")?.addEventListener("click",saveDraft);
    $("c8Activate")?.addEventListener("click",activate);
  }

  function field(label,id,value="",placeholder="",extra="",type="text",disabled=false){
    return `
      <div class="c8-field">
        <label for="${id}">${esc(label)}</label>
        <input id="${id}" type="${type}" value="${esc(value)}" placeholder="${esc(placeholder)}" ${disabled?"disabled":""}>
      </div>
    `;
  }

  function textarea(label,id,value="",placeholder="",disabled=false){
    return `
      <div class="c8-field">
        <label for="${id}">${esc(label)}</label>
        <textarea id="${id}" placeholder="${esc(placeholder)}" ${disabled?"disabled":""}>${esc(value)}</textarea>
      </div>
    `;
  }

  function payload(){
    return {
      final_release_version:$("c8Release")?.value?.trim()||"",
      final_worker_version:$("c8WorkerVersion")?.value?.trim()||"",
      final_database_version:$("c8DbVersion")?.value?.trim()||"",
      final_frontend_version:$("c8FrontVersion")?.value?.trim()||"",

      production_worker_url:$("c8WorkerUrl")?.value?.trim()||"",
      production_public_url:$("c8PublicUrl")?.value?.trim()||"",
      production_owner_url:$("c8OwnerUrl")?.value?.trim()||"",
      production_member_url:$("c8MemberUrl")?.value?.trim()||"",
      production_staff_url:$("c8StaffUrl")?.value?.trim()||"",
      production_ipad_url:$("c8IpadUrl")?.value?.trim()||"",
      production_system_check_url:$("c8SystemCheckUrl")?.value?.trim()||"",
      production_health_url:$("c8HealthUrl")?.value?.trim()||"",

      delivered_at:$("c8DeliveredAt")?.value||"",
      go_live_at:$("c8GoLiveAt")?.value||"",

      owner_handoff_completed:Boolean($("c8Handoff")?.checked),
      owner_handoff_note:$("c8HandoffNote")?.value?.trim()||"",

      next_maintenance_date:$("c8MaintenanceDate")?.value||"",
      maintenance_note:$("c8MaintenanceNote")?.value?.trim()||"",
      release_note:$("c8ReleaseNote")?.value?.trim()||"",
    };
  }

  async function saveDraft(){
    const button=$("c8Save");
    button.disabled=true;
    button.textContent="保存中…";
    try{
      const sb=await client();
      const {error}=await sb.rpc("cc_center8_save_go_live_draft",{
        p_project_id:state.selectedProjectId,
        p_payload:payload()
      });
      if(error) throw error;
      await loadDetail();
    }catch(error){
      alert(error.message||"本番稼働下書きを保存できませんでした。");
    }finally{
      if($("c8Save")){
        $("c8Save").disabled=false;
        $("c8Save").textContent="下書きを保存";
      }
    }
  }

  async function activate(){
    if(!$("c8Activate")||$("c8Activate").disabled) return;

    const phrase=prompt(
      "本番環境を正式に「稼働中」へ切り替えます。\n誤操作防止のため「本番稼働」と入力してください。"
    );
    if(phrase!=="本番稼働") return;

    const button=$("c8Activate");
    button.disabled=true;
    button.textContent="最終確認中…";

    try{
      const sb=await client();

      // 画面上の最新入力を必ず先に保存
      const save=await sb.rpc("cc_center8_save_go_live_draft",{
        p_project_id:state.selectedProjectId,
        p_payload:payload()
      });
      if(save.error) throw save.error;

      const {data,error}=await sb.rpc("cc_center8_activate_go_live",{
        p_project_id:state.selectedProjectId
      });
      if(error) throw error;

      await loadProjects(true);
      alert("本番稼働を確定しました。DPROシステム台帳も稼働中へ更新されました。");
    }catch(error){
      alert(error.message||"本番稼働を確定できませんでした。");
      await loadDetail();
    }finally{
      if($("c8Activate")){
        $("c8Activate").disabled=false;
        $("c8Activate").textContent="本番稼働を確定";
      }
    }
  }

  function boot(){
    installStyle();
    if(installPanel()) return;
    const observer=new MutationObserver(()=>{
      if(installPanel()) observer.disconnect();
    });
    observer.observe(document.documentElement,{childList:true,subtree:true});
    setTimeout(()=>observer.disconnect(),15000);
  }

  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",boot,{once:true});
  else boot();
})();
