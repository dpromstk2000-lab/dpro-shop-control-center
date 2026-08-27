(() => {
  "use strict";

  const CONFIG = window.DPRO_CONTROL_CENTER_CONFIG || {};
  const $ = id => document.getElementById(id);
  const state = {
    supabase:null, session:null, staff:null,
    summary:null, qa:[], master:[], instances:[], workers:[], checks:[]
  };

  const esc = v => String(v ?? "")
    .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
    .replaceAll('"',"&quot;").replaceAll("'","&#039;");
  const show = (id,yes=true) => $(id)?.classList.toggle("hidden",!yes);
  const dateTime = v => v ? new Intl.DateTimeFormat("ja-JP",{
    year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"
  }).format(new Date(v)) : "—";

  const stateLabel = {
    ok:"正常", operational:"実導入・正常", attention:"要確認", not_deployed:"未導入",
    warning:"要確認", critical:"異常", info:"情報", paused:"監視停止",
    overdue:"監視遅延", never_checked:"未確認", error:"異常",
    aligned:"一致", mismatch:"不一致", worker_mismatch:"Worker不一致",
    database_mismatch:"DB不一致", not_locked:"基準未固定",
    one_cmd_ready:"ONE-CMD READY", package_buildable:"PACKAGE BUILDABLE",
    manual_assisted:"手動支援", evidence_required:"証拠不足"
  };

  const stateClass = s => {
    if(["ok","operational","aligned","PASS"].includes(s)) return "state-ok";
    if(["critical","error","FAIL","mismatch","worker_mismatch","database_mismatch"].includes(s)) return "state-critical";
    if(["warning","attention","overdue","never_checked"].includes(s)) return "state-warning";
    if(["info","paused"].includes(s)) return "state-info";
    return "state-neutral";
  };
  const badge = s => `<span class="state ${stateClass(s)}">${esc(stateLabel[s] || s || "—")}</span>`;

  async function publicConfig(){
    const base=String(CONFIG.apiBaseUrl||"").replace(/\/$/,"");
    const r=await fetch(`${base}/api/public-config`,{cache:"no-store"});
    const d=await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(d.message||d.error||`HTTP ${r.status}`);
    return d;
  }

  function auth(text){
    show("loadingPanel",false);
    show("authPanel",true);
    $("authText").textContent=text;
  }

  async function init(){
    const pub=await publicConfig();
    if(!window.supabase?.createClient) throw new Error("Supabaseライブラリを読み込めませんでした。");
    state.supabase=window.supabase.createClient(
      pub.supabaseUrl,
      pub.supabasePublishableKey||pub.supabaseAnonKey,
      {auth:{
        persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,
        storageKey:pub.sessionStorageKey||"dpro-control-center-auth-v1"
      }}
    );

    const {data:sess,error:se}=await state.supabase.auth.getSession();
    if(se) throw se;
    state.session=sess.session;
    if(!state.session?.user) return auth("CONTROL CENTERへログインしてください。");

    const {data:aal,error:ae}=await state.supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if(ae) throw ae;
    if(aal?.currentLevel!=="aal2") return auth("二段階認証が必要です。CONTROL CENTERへ戻って認証を完了してください。");

    const {data:staff,error:ste}=await state.supabase
      .from("cc_staff")
      .select("id,display_name,role_key,status")
      .eq("auth_user_id",state.session.user.id)
      .maybeSingle();
    if(ste) throw ste;
    if(!staff||staff.status!=="active") return auth("有効なDPROスタッフ権限がありません。");
    state.staff=staff;
    $("staffName").textContent=staff.display_name||"DPROスタッフ";

    await load();
    show("loadingPanel",false);
    show("appPanel",true);
  }

  async function load(){
    $("reloadButton") && ($("reloadButton").disabled=true);
    try{
      const [summary,qa,master,instances,workers,checks] = await Promise.all([
        state.supabase.from("cc_v_monitoring_summary_r0").select("*").single(),
        state.supabase.rpc("cc_monitoring_center_r0_check"),
        state.supabase.from("cc_v_monitoring_product_master_r0").select("*").order("product_number",{ascending:true}),
        state.supabase.from("cc_v_monitoring_live_instances_r0").select("*"),
        state.supabase.from("cc_v_monitoring_workers_r0").select("*").order("worker_name",{ascending:true}),
        state.supabase.from("cc_v_monitoring_latest_checks_r0").select("*").order("checked_at",{ascending:false})
      ]);
      for(const r of [summary,qa,master,instances,workers,checks]) if(r.error) throw r.error;

      state.summary=summary.data||{};
      state.qa=qa.data||[];
      state.master=master.data||[];
      state.instances=(instances.data||[]).sort((a,b)=>attentionRank(a.attention_state)-attentionRank(b.attention_state));
      state.workers=(workers.data||[]).sort((a,b)=>monitorRank(a.monitor_state)-monitorRank(b.monitor_state));
      state.checks=checks.data||[];

      renderSummary();
      renderQa();
      filterMaster();
      renderInstances();
      renderWorkers();
      renderChecks();
    } finally {
      $("reloadButton") && ($("reloadButton").disabled=false);
    }
  }

  const attentionRank=s=>({critical:0,warning:1,info:2,ok:3}[s]??9);
  const monitorRank=s=>({error:0,overdue:1,never_checked:2,paused:3,ok:4}[s]??9);

  function summaryCard(label,value,note){
    return `<article class="summary-card"><small>${esc(label)}</small><strong>${esc(value)}</strong><span>${esc(note)}</span></article>`;
  }

  function renderSummary(){
    const s=state.summary;
    $("summaryGrid").innerHTML=[
      summaryCard("MASTER製品",`${s.master_products??0}`,"製品台帳。稼働環境数ではありません"),
      summaryCard("Product Ready LOCK",`${s.product_ready_locked??0}/51`,"FINAL_COMPLETE固定"),
      summaryCard("実導入インスタンス",`${s.live_instances??0}`,"cc_system_instances登録済み"),
      summaryCard("導入先 要確認",`${s.instance_attention??0}`,"異常または監視時刻の遅延"),
      summaryCard("登録Worker",`${s.registered_workers??0}`,"CONTROL CENTER登録済み"),
      summaryCard("Worker 要確認",`${s.worker_attention??0}`,"異常・監視遅延・未確認"),
      summaryCard("Health履歴",`${s.health_history_total??0}`,"既存監視履歴"),
      summaryCard("最新監視対象",`${s.latest_check_targets??0}`,"対象ごとの最新レコード")
    ].join("");
    $("latestCheckNote").textContent=`監視履歴の最終更新：${dateTime(s.latest_check_at)}`;
  }

  function renderQa(){
    $("qaGrid").innerHTML=state.qa.map(q=>`
      <article class="qa-item ${q.status==="PASS"?"qa-pass":q.status==="FAIL"?"qa-fail":"qa-info"}">
        <small>${esc(q.check_name)}</small>
        <strong>${esc(q.status)}</strong>
        <span>${esc(q.detail)}</span>
      </article>`).join("");

    const s=state.summary;
    const notes=[];
    if((s.live_instances??0)<51) notes.push(`MASTERは51製品ですが、実導入登録は${s.live_instances??0}件です。これは正常な分離です。`);
    if((s.instance_attention??0)>0) notes.push(`実導入${s.instance_attention}件で監視要確認があります。現状は最終Health確認時刻の古さを含みます。`);
    if((s.worker_attention??0)>0) notes.push(`Worker ${s.worker_attention}件で監視要確認があります。R0では自動修復しません。`);
    notes.push("R0は既存データの可視化のみで、Deploy・Rollback・顧客データ作成は行いません。");
    $("monitorFinding").innerHTML=notes.map(x=>`<div>・${esc(x)}</div>`).join("");
  }

  function filterMaster(){
    const q=String($("masterSearch").value||"").trim().toLowerCase();
    const st=$("masterStateFilter").value;
    const rows=state.master.filter(x=>{
      const match=!q||[x.product_name,x.product_code,x.system_code,x.category].some(v=>String(v||"").toLowerCase().includes(q));
      return match && (!st||x.operational_state===st);
    });
    $("masterCount").textContent=`${rows.length}/51`;
    renderMaster(rows);
  }

  function renderMaster(rows){
    const body=rows.map(x=>`<tr>
      <td>${esc(x.product_number)}</td>
      <td class="wrap"><strong>${esc(x.product_name)}</strong><br><small>${esc(x.system_code)} / ${esc(x.category)}</small></td>
      <td>${badge(x.product_ready_locked&&x.product_ready_status==="FINAL_COMPLETE"?"ok":"warning")}<br><small>${esc(x.product_ready_status)}</small></td>
      <td>${badge(x.automation_class)}<br><small>${esc(x.execution_mode||"—")}</small></td>
      <td><strong>${esc(x.instance_count)}</strong><br><small>本番 ${esc(x.production_instance_count)} / Demo ${esc(x.demo_instance_count)}</small></td>
      <td>${esc(x.monitored_instance_count)} / ${esc(x.instance_count)}</td>
      <td>${badge(x.operational_state)}</td>
      <td>${dateTime(x.last_health_checked_at)}</td>
    </tr>`).join("");
    $("masterTable").innerHTML=`<table>
      <thead><tr><th>#</th><th>製品</th><th>Product Ready</th><th>Deploy分類</th><th>実導入</th><th>監視ON</th><th>運用状態</th><th>最終Health</th></tr></thead>
      <tbody>${body||'<tr><td colspan="8">該当製品はありません。</td></tr>'}</tbody>
    </table>`;
  }

  function renderInstances(){
    $("instanceCount").textContent=String(state.instances.length);
    const body=state.instances.map(x=>`<tr>
      <td class="wrap"><strong>${esc(x.client_name||"—")}</strong><br><small>${esc(x.site_name||"—")}</small></td>
      <td class="wrap"><strong>${esc(x.system_name)}</strong><br><small>${esc(x.system_code)} / ${esc(x.facility_code)}</small></td>
      <td>${x.environment==="demo"?badge("info"):badge("ok")}<br><small>${esc(x.environment)}</small></td>
      <td>${badge(x.monitor_state)}<br><small>${x.monitoring_enabled?`${esc(x.monitor_interval_minutes)}分`:"OFF"}</small></td>
      <td>${badge(x.version_alignment)}</td>
      <td>${esc(x.last_health_status||"—")}<br><small>${dateTime(x.last_health_checked_at)}</small></td>
      <td class="long">${esc(x.last_error_summary||"—")}</td>
      <td class="long">${linkCell(x.health_url,"Health")}${linkCell(x.system_check_url,"System Check")}</td>
    </tr>`).join("");
    $("instanceTable").innerHTML=`<table>
      <thead><tr><th>顧客・店舗</th><th>システム</th><th>環境</th><th>監視</th><th>Version</th><th>最終Health</th><th>直近エラー</th><th>確認URL</th></tr></thead>
      <tbody>${body||'<tr><td colspan="8">実導入インスタンスはまだありません。</td></tr>'}</tbody>
    </table>`;
  }

  function linkCell(url,label){
    if(!url) return "";
    const safe=String(url);
    if(!/^https:\/\//i.test(safe)) return `<div>${esc(label)}：${esc(safe)}</div>`;
    return `<div><a href="${esc(safe)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a></div>`;
  }

  function renderWorkers(){
    $("workerCount").textContent=String(state.workers.length);
    const body=state.workers.map(x=>`<tr>
      <td class="long"><strong>${esc(x.worker_name)}</strong><br><small>${esc(x.environment)}</small></td>
      <td>${badge(x.monitor_state)}<br><small>${x.monitoring_enabled?"ON":"OFF"}</small></td>
      <td>${badge(x.version_alignment)}</td>
      <td class="long"><small>Current</small><br>${esc(x.current_version||"—")}<br><small>Expected</small><br>${esc(x.expected_version||"—")}</td>
      <td>${esc(x.last_http_status??"—")}<br><small>${x.last_response_ms==null?"—":`${esc(x.last_response_ms)} ms`}</small></td>
      <td>${dateTime(x.last_checked_at)}</td>
      <td>${esc(x.consecutive_failures??0)}</td>
      <td class="long">${linkCell(x.health_url||x.worker_url,"Worker / Health")}</td>
    </tr>`).join("");
    $("workerTable").innerHTML=`<table>
      <thead><tr><th>Worker</th><th>監視</th><th>Version</th><th>Version詳細</th><th>HTTP</th><th>最終確認</th><th>連続失敗</th><th>URL</th></tr></thead>
      <tbody>${body||'<tr><td colspan="8">登録Workerはありません。</td></tr>'}</tbody>
    </table>`;
  }

  function renderChecks(){
    $("checkCount").textContent=String(state.checks.length);
    const body=state.checks.map(x=>{
      const publicUrl=x.summary?.public?.finalUrl||"";
      return `<tr>
        <td>${esc(x.target_type)}</td>
        <td class="wrap"><strong>${esc(x.target_name)}</strong><br><small>${esc(x.target_key)}</small></td>
        <td>${badge(x.status==="ok"?"ok":x.status==="error"?"critical":"warning")}</td>
        <td>${esc(x.http_status??"—")}<br><small>${x.response_ms==null?"—":`${esc(x.response_ms)} ms`}</small></td>
        <td>${dateTime(x.checked_at)}</td>
        <td>${esc(x.source)}</td>
        <td class="long">${publicUrl?linkCell(publicUrl,"公開URL"):"—"}</td>
      </tr>`;
    }).join("");
    $("checkTable").innerHTML=`<table>
      <thead><tr><th>種別</th><th>対象</th><th>状態</th><th>HTTP</th><th>確認日時</th><th>Source</th><th>URL</th></tr></thead>
      <tbody>${body||'<tr><td colspan="7">監視履歴はありません。</td></tr>'}</tbody>
    </table>`;
  }

  $("masterSearch")?.addEventListener("input",filterMaster);
  $("masterStateFilter")?.addEventListener("change",filterMaster);
  $("reloadButton")?.addEventListener("click",()=>load().catch(e=>alert(`再読込に失敗しました：${e.message||e}`)));

  window.addEventListener("load",()=>init().catch(e=>{
    $("loadingText").textContent=`接続に失敗しました：${e.message||e}`;
  }));
})();
