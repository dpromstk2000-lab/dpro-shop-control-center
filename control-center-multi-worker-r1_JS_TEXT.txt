(() => {
  "use strict";

  const VERSION = "CONTROL-CENTER-MULTI-WORKER-R1-20261004";
  const CONFIG = window.DPRO_CONTROL_CENTER_CONFIG || {};
  const ROLE_LABELS = Object.freeze({
    core: "Core",
    shop: "SHOP",
    line: "LINE",
    contact: "CONTACT",
    monitor: "Monitor",
    integration: "連携",
    other: "その他"
  });

  const state = {
    supabase: null,
    session: null,
    staff: null,
    workers: [],
    systems: [],
    clients: [],
    supabaseProjects: [],
    github: [],
    editing: null,
    rendering: false
  };

  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#039;");

  function safeUrl(value) {
    try {
      const url = new URL(String(value || "").trim());
      return ["https:", "http:"].includes(url.protocol);
    } catch {
      return false;
    }
  }

  function normalizeWorkerUrl(value) {
    try {
      const url = new URL(String(value || "").trim());
      if (!["https:", "http:"].includes(url.protocol)) return "";
      url.pathname = url.pathname.replace(/\/api\/health\/?$/i, "").replace(/\/$/, "");
      url.search = "";
      url.hash = "";
      return url.href.replace(/\/$/, "");
    } catch {
      return "";
    }
  }

  function healthFromWorker(value) {
    const base = normalizeWorkerUrl(value);
    return base ? `${base}/api/health` : "";
  }

  function boolText(value, yes="設定済み", no="要確認") {
    return value
      ? `<span class="ccmw-pill ok">${esc(yes)}</span>`
      : `<span class="ccmw-pill">${esc(no)}</span>`;
  }

  function roleLabel(role) {
    return ROLE_LABELS[role] || role || "その他";
  }

  function statusTone(status) {
    if (status === "active") return "ok";
    if (["degraded", "error"].includes(status)) return "bad";
    if (["preparing", "paused"].includes(status)) return "warn";
    return "";
  }

  function ensureStyle() {
    if ($("ccmw-style")) return;
    const style=document.createElement("style");
    style.id="ccmw-style";
    style.textContent=`
      .ccmw-toolbar{display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin:0 0 14px}
      .ccmw-note{font-size:13px;line-height:1.7;color:#50615b}
      .ccmw-btn{appearance:none;border:1px solid #b9cbc3;background:#fff;color:#153b30;border-radius:10px;padding:9px 13px;font-weight:800;cursor:pointer}
      .ccmw-btn.primary{background:#0b6b50;color:#fff;border-color:#0b6b50}
      .ccmw-btn:disabled{opacity:.45;cursor:not-allowed}
      .ccmw-pill{display:inline-flex;align-items:center;border-radius:999px;padding:3px 8px;font-size:11px;font-weight:800;background:#eef2f0;color:#53615d;margin:2px 3px 2px 0}
      .ccmw-pill.ok{background:#ddf6e9;color:#086044}
      .ccmw-pill.warn{background:#fff2cf;color:#7c5600}
      .ccmw-pill.bad{background:#ffe2e2;color:#982929}
      .ccmw-role{font-weight:900}
      .ccmw-primary{color:#9c6b00}
      .ccmw-small{display:block;color:#687872;font-size:12px;line-height:1.45;margin-top:3px;word-break:break-all}
      .ccmw-modal-backdrop{position:fixed;inset:0;background:rgba(15,28,24,.48);z-index:9998}
      .ccmw-modal{position:fixed;inset:5vh max(12px,calc((100vw - 900px)/2));max-height:90vh;overflow:auto;background:#fff;border-radius:20px;z-index:9999;box-shadow:0 24px 70px rgba(0,0,0,.28)}
      .ccmw-modal-head{position:sticky;top:0;background:#fff;display:flex;align-items:center;justify-content:space-between;padding:20px 22px;border-bottom:1px solid #dce6e1;z-index:1}
      .ccmw-modal-head h2{margin:0;font-size:22px}
      .ccmw-close{font-size:28px;background:#f0f4f2;border:0;border-radius:50%;width:44px;height:44px;cursor:pointer}
      .ccmw-form{padding:20px 22px 26px;display:grid;grid-template-columns:1fr 1fr;gap:14px}
      .ccmw-field{display:flex;flex-direction:column;gap:6px}
      .ccmw-field.full{grid-column:1/-1}
      .ccmw-field span{font-weight:800;color:#223b33}
      .ccmw-field input,.ccmw-field select,.ccmw-field textarea{font:inherit;padding:11px 12px;border:1px solid #cbd8d2;border-radius:10px;background:#fff;min-width:0}
      .ccmw-actions{grid-column:1/-1;display:flex;justify-content:flex-end;gap:10px;padding-top:8px}
      .ccmw-message{grid-column:1/-1;min-height:20px;color:#a22;font-weight:700}
      .ccmw-system-summary{line-height:1.55}
      @media(max-width:720px){.ccmw-form{grid-template-columns:1fr}.ccmw-field.full,.ccmw-actions,.ccmw-message{grid-column:1}.ccmw-modal{inset:2vh 8px;max-height:96vh}}
    `;
    document.head.appendChild(style);
  }

  async function publicConfig() {
    const base=String(CONFIG.apiBaseUrl||"").replace(/\/$/,"");
    if (!base) throw new Error("CONTROL CENTER API URLを確認できません。");
    const response=await fetch(`${base}/api/public-config`,{cache:"no-store"});
    const data=await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(data.message||data.error||`HTTP ${response.status}`);
    return data;
  }

  async function client() {
    if (state.supabase) return state.supabase;
    if (!window.supabase?.createClient) throw new Error("Supabase clientを読み込めません。");
    const pub=await publicConfig();
    state.supabase=window.supabase.createClient(
      pub.supabaseUrl,
      pub.supabasePublishableKey||pub.supabaseAnonKey,
      {auth:{
        persistSession:true,
        autoRefreshToken:true,
        detectSessionInUrl:false,
        storageKey:pub.sessionStorageKey||"dpro-control-center-auth-v1"
      }}
    );
    const {data,error}=await state.supabase.auth.getSession();
    if(error) throw error;
    state.session=data?.session||null;
    if(!state.session?.user) throw new Error("CONTROL CENTERへログインしてください。");
    return state.supabase;
  }

  async function loadData() {
    const sb=await client();
    const {data:staff,error:staffError}=await sb.from("cc_staff")
      .select("id,display_name,role_key,status")
      .eq("auth_user_id",state.session.user.id).maybeSingle();
    if(staffError) throw staffError;
    if(!staff||staff.status!=="active") throw new Error("有効なDPROスタッフ権限がありません。");
    state.staff=staff;

    const results=await Promise.all([
      sb.from("cc_v_worker_inventory_v4").select("*").order("client_name").order("system_name").order("worker_role").order("worker_name"),
      sb.from("cc_v_system_operations").select("*").order("client_name"),
      sb.from("cc_clients").select("id,client_code,display_name,status").order("display_name"),
      sb.from("cc_v_supabase_inventory_v4").select("*").order("project_name"),
      sb.from("cc_v_github_inventory_v4").select("*").order("repository_full_name")
    ]);
    for(const result of results) if(result.error) throw result.error;
    [state.workers,state.systems,state.clients,state.supabaseProjects,state.github]=results.map(r=>r.data||[]);
  }

  function canWrite() {
    return ["owner_admin","technical_admin"].includes(state.staff?.role_key);
  }

  function clientOptions(selected="") {
    return `<option value="">DPRO内部・未指定</option>`+
      state.clients.map(x=>`<option value="${esc(x.id)}"${x.id===selected?" selected":""}>${esc(x.display_name)}（${esc(x.client_code)}）</option>`).join("");
  }
  function systemOptions(selected="") {
    return `<option value="">未接続</option>`+
      state.systems.map(x=>`<option value="${esc(x.id)}"${x.id===selected?" selected":""}>${esc(x.client_name)}｜${esc(x.system_name)}（${esc(x.facility_code)}）</option>`).join("");
  }
  function supabaseOptions(selected="") {
    return `<option value="">未接続</option>`+
      state.supabaseProjects.map(x=>`<option value="${esc(x.id)}"${x.id===selected?" selected":""}>${esc(x.client_name||"DPRO内部")}｜${esc(x.project_name||x.project_ref)}</option>`).join("");
  }
  function githubOptions(selected="") {
    return `<option value="">未接続</option>`+
      state.github.map(x=>`<option value="${esc(x.id)}"${x.id===selected?" selected":""}>${esc(x.client_name||"DPRO内部")}｜${esc(x.repository_full_name)}</option>`).join("");
  }

  function renderWorkers() {
    const host=$("workerOverview");
    if(!host||state.rendering) return;
    state.rendering=true;
    try{
      const rows=state.workers.map(w=>`
        <tr>
          <td><strong>${esc(w.client_name||"DPRO内部")}</strong><span class="ccmw-small">${esc(w.system_name||"未接続")}</span></td>
          <td><span class="ccmw-role ${w.is_primary?"ccmw-primary":""}">${w.is_primary?"★ ":""}${esc(roleLabel(w.worker_role))}</span><span class="ccmw-small">${w.is_primary?"代表Worker":"追加Worker"}</span></td>
          <td><strong>${esc(w.worker_name)}</strong><span class="ccmw-small">${esc(w.worker_url)}</span>
            ${safeUrl(w.worker_url)?`<a class="small-link" target="_blank" rel="noopener" href="${esc(w.worker_url)}">Worker</a>`:""}
            ${safeUrl(w.health_url)?` <a class="small-link" target="_blank" rel="noopener" href="${esc(w.health_url)}">Health</a>`:""}
          </td>
          <td>${w.uses_webhook?'<span class="ccmw-pill ok">Webhook</span>':'<span class="ccmw-pill">通常API</span>'}${boolText(w.secrets_configured)}
            <span class="ccmw-small">${esc(w.supabase_project_ref||"Supabase未接続")}</span>
            <span class="ccmw-small">${esc(w.repository_full_name||"GitHub未接続")}</span>
          </td>
          <td><span class="ccmw-pill ${statusTone(w.status)}">${esc(w.status||"unknown")}</span><span class="ccmw-small">連続失敗 ${Number(w.consecutive_failures||0)}</span></td>
          <td><span class="ccmw-small">現在 ${esc(w.current_version||"未確認")}</span><span class="ccmw-small">期待 ${esc(w.expected_version||"未設定")}</span></td>
          <td><span class="ccmw-small">${w.last_checked_at?new Date(w.last_checked_at).toLocaleString("ja-JP"):"未確認"}</span>${w.last_response_ms!=null?`<span class="ccmw-small">${Number(w.last_response_ms)}ms</span>`:""}</td>
          <td>${canWrite()?`<button class="ccmw-btn" type="button" data-ccmw-edit="${esc(w.id)}">編集</button>`:""}</td>
        </tr>
      `).join("");
      host.innerHTML=`
        <div class="ccmw-root" data-version="${esc(VERSION)}">
          <div class="ccmw-toolbar">
            <div class="ccmw-note"><strong>複数Worker標準</strong><br>1システムにCore・SHOP・LINEなどを何件でも登録できます。Secret値そのものは保存しません。</div>
            ${canWrite()?'<button class="ccmw-btn primary" type="button" data-ccmw-new>＋ Worker追加</button>':""}
          </div>
          <table>
            <thead><tr><th>顧客・システム</th><th>役割</th><th>Worker</th><th>接続</th><th>状態</th><th>バージョン</th><th>最終確認</th><th>操作</th></tr></thead>
            <tbody>${rows||'<tr><td colspan="8">Workerは未登録です。</td></tr>'}</tbody>
          </table>
        </div>`;
      host.querySelector("[data-ccmw-new]")?.addEventListener("click",()=>openEditor(null));
      host.querySelectorAll("[data-ccmw-edit]").forEach(b=>b.addEventListener("click",()=>openEditor(b.dataset.ccmwEdit)));
    } finally {
      state.rendering=false;
    }
  }

  function enhanceSystemSummary() {
    const host=$("systemOverview");
    const table=host?.querySelector("table");
    if(!table) return;
    const rows=[...table.querySelectorAll("tbody tr")];
    for(const system of state.systems){
      const row=rows.find(r=>r.textContent.includes(system.facility_code||"__none__"));
      if(!row) continue;
      const cells=row.querySelectorAll("td");
      if(cells.length<6) continue;
      const workers=state.workers.filter(w=>w.system_instance_id===system.id);
      const roles=workers.map(w=>`${w.is_primary?"★":""}${roleLabel(w.worker_role)}`).join(" / ");
      const repo=state.github.find(g=>g.system_instance_id===system.id)?.repository_full_name||"GitHub未登録";
      cells[5].innerHTML=`<div class="ccmw-system-summary"><strong>${workers.length} Worker</strong><br><span class="ccmw-small">${esc(roles||"未登録")}</span><span class="ccmw-small">${esc(repo)}</span></div>`;
    }
  }

  function ensureModal() {
    if($("ccmw-modal")) return;
    const backdrop=document.createElement("div");
    backdrop.id="ccmw-backdrop";
    backdrop.className="ccmw-modal-backdrop";
    backdrop.hidden=true;
    const modal=document.createElement("section");
    modal.id="ccmw-modal";
    modal.className="ccmw-modal";
    modal.hidden=true;
    modal.innerHTML=`
      <div class="ccmw-modal-head"><h2 id="ccmw-title">Worker登録</h2><button class="ccmw-close" type="button" data-ccmw-close>×</button></div>
      <form id="ccmw-form" class="ccmw-form">
        <label class="ccmw-field"><span>顧客</span><select name="client_id"></select></label>
        <label class="ccmw-field"><span>接続システム</span><select name="system_instance_id"></select></label>
        <label class="ccmw-field"><span>Worker役割</span><select name="worker_role">
          <option value="core">Core</option><option value="shop">SHOP</option><option value="line">LINE</option>
          <option value="contact">CONTACT</option><option value="monitor">Monitor</option><option value="integration">連携</option><option value="other">その他</option>
        </select></label>
        <label class="ccmw-field"><span>代表Worker</span><select name="is_primary"><option value="false">いいえ</option><option value="true">はい</option></select></label>
        <label class="ccmw-field full"><span>Worker名</span><input name="worker_name" required></label>
        <label class="ccmw-field full"><span>Worker URL</span><input name="worker_url" type="url" required></label>
        <label class="ccmw-field full"><span>Health URL</span><input name="health_url" type="url"></label>
        <label class="ccmw-field"><span>Webhook利用</span><select name="uses_webhook"><option value="false">なし</option><option value="true">あり</option></select></label>
        <label class="ccmw-field"><span>Secret設定</span><select name="secrets_configured"><option value="false">要確認</option><option value="true">設定済み</option></select></label>
        <label class="ccmw-field full"><span>Webhook URL</span><input name="webhook_url" type="url"></label>
        <label class="ccmw-field"><span>接続Supabase</span><select name="supabase_project_id"></select></label>
        <label class="ccmw-field"><span>接続GitHub</span><select name="github_repository_id"></select></label>
        <label class="ccmw-field"><span>環境</span><select name="environment"><option value="demo">demo</option><option value="staging">staging</option><option value="production">production</option></select></label>
        <label class="ccmw-field"><span>状態</span><select name="status"><option value="preparing">準備中</option><option value="active">稼働中</option><option value="degraded">要確認</option><option value="paused">停止中</option><option value="ended">終了</option></select></label>
        <label class="ccmw-field full"><span>期待バージョン</span><input name="expected_version"></label>
        <label class="ccmw-field"><span>Health監視</span><select name="monitoring_enabled"><option value="true">有効</option><option value="false">停止</option></select></label>
        <div id="ccmw-message" class="ccmw-message"></div>
        <div class="ccmw-actions"><button class="ccmw-btn" type="button" data-ccmw-close>取消</button><button class="ccmw-btn primary" type="submit">保存</button></div>
      </form>`;
    document.body.append(backdrop,modal);
    document.querySelectorAll("[data-ccmw-close]").forEach(b=>b.addEventListener("click",closeEditor));
    backdrop.addEventListener("click",closeEditor);
    $("ccmw-form").addEventListener("submit",saveEditor);
    $("ccmw-form").elements.worker_url.addEventListener("input",e=>{
      const health=$("ccmw-form").elements.health_url;
      if(!health.dataset.manual||!health.value.trim()) health.value=healthFromWorker(e.target.value);
    });
    $("ccmw-form").elements.health_url.addEventListener("input",e=>{e.target.dataset.manual="1";});
  }

  function setSelect(select,html,value) {
    select.innerHTML=html;
    select.value=value??"";
  }

  function openEditor(id) {
    if(!canWrite()) return;
    ensureModal();
    const item=id?state.workers.find(x=>x.id===id):null;
    state.editing=item||null;
    $("ccmw-title").textContent=item?"編集｜Worker":"登録｜Worker";
    const f=$("ccmw-form");
    setSelect(f.elements.client_id,clientOptions(item?.client_id),item?.client_id);
    setSelect(f.elements.system_instance_id,systemOptions(item?.system_instance_id),item?.system_instance_id);
    setSelect(f.elements.supabase_project_id,supabaseOptions(item?.supabase_project_id),item?.supabase_project_id);
    setSelect(f.elements.github_repository_id,githubOptions(item?.github_repository_id),item?.github_repository_id);
    f.elements.worker_role.value=item?.worker_role||"other";
    f.elements.is_primary.value=String(Boolean(item?.is_primary));
    f.elements.worker_name.value=item?.worker_name||"";
    f.elements.worker_url.value=item?.worker_url||"";
    f.elements.health_url.value=item?.health_url||"";
    delete f.elements.health_url.dataset.manual;
    f.elements.uses_webhook.value=String(Boolean(item?.uses_webhook));
    f.elements.secrets_configured.value=String(Boolean(item?.secrets_configured));
    f.elements.webhook_url.value=item?.webhook_url||"";
    f.elements.environment.value=item?.environment||"production";
    f.elements.status.value=item?.status||"preparing";
    f.elements.expected_version.value=item?.expected_version||"";
    f.elements.monitoring_enabled.value=String(item?.monitoring_enabled!==false);
    $("ccmw-message").textContent="";
    $("ccmw-backdrop").hidden=false;
    $("ccmw-modal").hidden=false;
  }

  function closeEditor() {
    if($("ccmw-backdrop")) $("ccmw-backdrop").hidden=true;
    if($("ccmw-modal")) $("ccmw-modal").hidden=true;
    state.editing=null;
  }

  async function saveEditor(event) {
    event.preventDefault();
    if(!canWrite()) return;
    const f=event.currentTarget;
    const fd=new FormData(f);
    const payload=Object.fromEntries(fd.entries());
    for(const key of Object.keys(payload)) if(payload[key]==="") payload[key]=null;
    for(const key of ["is_primary","uses_webhook","secrets_configured","monitoring_enabled"]) payload[key]=String(payload[key])==="true";
    payload.worker_url=normalizeWorkerUrl(payload.worker_url);
    if(!payload.worker_url) return $("ccmw-message").textContent="Worker URLを確認してください。";
    if(!payload.health_url) payload.health_url=healthFromWorker(payload.worker_url);
    if(!safeUrl(payload.health_url)) return $("ccmw-message").textContent="Health URLを確認してください。";
    if(payload.webhook_url&&!safeUrl(payload.webhook_url)) return $("ccmw-message").textContent="Webhook URLを確認してください。";

    const sb=await client();
    const id=state.editing?.id||null;
    try{
      if(payload.is_primary&&payload.system_instance_id){
        let clear=sb.from("cc_workers").update({is_primary:false,updated_at:new Date().toISOString()})
          .eq("system_instance_id",payload.system_instance_id).eq("is_primary",true);
        if(id) clear=clear.neq("id",id);
        const {error}=await clear;
        if(error) throw error;
      }
      const write={...payload,updated_at:new Date().toISOString()};
      const result=id
        ? await sb.from("cc_workers").update(write).eq("id",id)
        : await sb.from("cc_workers").insert(write);
      if(result.error) throw result.error;
      closeEditor();
      await loadData();
      renderWorkers();
      enhanceSystemSummary();
    }catch(error){
      $("ccmw-message").textContent=error.message||"保存できませんでした。";
    }
  }

  function interceptLegacyWorkerButtons(event) {
    const button=event.target.closest?.('[data-infra-new="worker"]');
    if(!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openEditor(null);
  }

  function observe() {
    const workerHost=$("workerOverview");
    const systemHost=$("systemOverview");
    if(workerHost){
      const mo=new MutationObserver(()=>{
        if(!workerHost.querySelector(".ccmw-root")) renderWorkers();
      });
      mo.observe(workerHost,{childList:true,subtree:false});
    }
    if(systemHost){
      const mo=new MutationObserver(()=>setTimeout(enhanceSystemSummary,0));
      mo.observe(systemHost,{childList:true,subtree:true});
    }
  }

  async function boot() {
    if(document.documentElement.dataset.ccMultiWorker===VERSION) return;
    document.documentElement.dataset.ccMultiWorker=VERSION;
    ensureStyle();
    ensureModal();
    document.addEventListener("click",interceptLegacyWorkerButtons,true);

    let tries=0;
    while((!$("workerOverview")||!window.supabase?.createClient)&&tries<160){
      tries+=1;
      await new Promise(r=>setTimeout(r,125));
    }
    if(!$("workerOverview")) return;

    try{
      await loadData();
      renderWorkers();
      enhanceSystemSummary();
      observe();
    }catch(error){
      console.warn("[DPRO CONTROL CENTER MULTI WORKER]",error);
    }
  }

  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",()=>void boot(),{once:true});
  else void boot();
})();
