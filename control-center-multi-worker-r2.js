(() => {
  "use strict";

  const VERSION = "CONTROL-CENTER-MULTI-WORKER-R2.1-20261006";
  if (window.__DPRO_CC_MULTI_WORKER_R2__ === VERSION) return;
  window.__DPRO_CC_MULTI_WORKER_R2__ = VERSION;

  const CONFIG = window.DPRO_CONTROL_CENTER_CONFIG || {};
  const ROLE_LABELS = Object.freeze({
    core:"Core", shop:"SHOP", line:"LINE", contact:"CONTACT",
    monitor:"Monitor", integration:"連携", other:"その他"
  });
  const state = {
    supabase:null, session:null, staff:null,
    workers:[], systems:[], clients:[], supabaseProjects:[], github:[], editing:null,
    rendering:false
  };

  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
  const safeUrl = (v) => { try { const u=new URL(String(v||"").trim()); return ["https:","http:"].includes(u.protocol); } catch { return false; } };
  const normalizeWorkerUrl = (v) => { try { const u=new URL(String(v||"").trim()); if(!["https:","http:"].includes(u.protocol))return ""; u.pathname=u.pathname.replace(/\/api\/health\/?$/i,"").replace(/\/$/,""); u.search="";u.hash="";return u.href.replace(/\/$/,""); } catch { return ""; } };
  const healthFromWorker = (v) => { const b=normalizeWorkerUrl(v); return b?`${b}/api/health`:""; };
  const roleLabel = (r) => ROLE_LABELS[r] || r || "その他";
  const canWrite = () => ["owner_admin","technical_admin"].includes(String(state.staff?.role_key||state.staff?.role||""));

  function ensureStyle(){
    if($("ccmw-r2-style")) return;
    const s=document.createElement("style"); s.id="ccmw-r2-style"; s.textContent=`
      .ccmw-r2-toolbar{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin:0 0 14px}
      .ccmw-r2-note{font-size:13px;line-height:1.7;color:#52615c}
      .ccmw-r2-btn{appearance:none;border:1px solid #b9cbc3;background:#fff;color:#153b30;border-radius:10px;padding:9px 13px;font-weight:800;cursor:pointer}
      .ccmw-r2-btn.primary{background:#0b6b50;color:#fff;border-color:#0b6b50}.ccmw-r2-btn:disabled{opacity:.45;cursor:not-allowed}
      .ccmw-r2-pill{display:inline-flex;align-items:center;border-radius:999px;padding:3px 8px;font-size:11px;font-weight:800;background:#eef2f0;color:#53615d;margin:2px 3px 2px 0}
      .ccmw-r2-pill.ok{background:#ddf6e9;color:#086044}.ccmw-r2-pill.warn{background:#fff2cf;color:#7c5600}.ccmw-r2-pill.bad{background:#ffe2e2;color:#982929}
      .ccmw-r2-role{font-weight:900}.ccmw-r2-primary{color:#9c6b00}.ccmw-r2-small{display:block;color:#687872;font-size:12px;line-height:1.45;margin-top:3px;word-break:break-all}
      .ccmw-r2-backdrop{position:fixed;inset:0;background:rgba(15,28,24,.48);z-index:10020}.ccmw-r2-modal{position:fixed;inset:5vh max(12px,calc((100vw - 900px)/2));max-height:90vh;overflow:auto;background:#fff;border-radius:20px;z-index:10021;box-shadow:0 24px 70px rgba(0,0,0,.28)}
      .ccmw-r2-head{position:sticky;top:0;background:#fff;display:flex;align-items:center;justify-content:space-between;padding:20px 22px;border-bottom:1px solid #dce6e1;z-index:2}.ccmw-r2-head h2{margin:0;font-size:22px}.ccmw-r2-close{font-size:28px;background:#f0f4f2;border:0;border-radius:50%;width:44px;height:44px;cursor:pointer}
      .ccmw-r2-form{padding:20px 22px 26px;display:grid;grid-template-columns:1fr 1fr;gap:14px}.ccmw-r2-field{display:flex;flex-direction:column;gap:6px}.ccmw-r2-field.full{grid-column:1/-1}.ccmw-r2-field span{font-weight:800;color:#223b33}.ccmw-r2-field input,.ccmw-r2-field select,.ccmw-r2-field textarea{font:inherit;padding:11px 12px;border:1px solid #cbd8d2;border-radius:10px;background:#fff;min-width:0}
      .ccmw-r2-check{display:flex;align-items:center;gap:9px;padding:10px 0}.ccmw-r2-actions{grid-column:1/-1;display:flex;justify-content:flex-end;gap:10px;padding-top:8px}.ccmw-r2-message{grid-column:1/-1;min-height:20px;color:#a22;font-weight:700}.ccmw-r2-system-summary{line-height:1.55}
      @media(max-width:720px){.ccmw-r2-form{grid-template-columns:1fr}.ccmw-r2-field.full,.ccmw-r2-actions,.ccmw-r2-message{grid-column:1}.ccmw-r2-modal{inset:2vh 8px;max-height:96vh}}
    `; document.head.appendChild(s);
  }

  async function publicConfig(){
    const base=String(CONFIG.apiBaseUrl||"").replace(/\/$/,"");
    if(!base) throw new Error("CONTROL CENTER API URLを確認できません。");
    const r=await fetch(`${base}/api/public-config`,{cache:"no-store"});
    const data=await r.json().catch(()=>({}));
    if(!r.ok) throw new Error(data.message||data.error||`HTTP ${r.status}`);
    return data;
  }

  async function initSupabase(){
    if(state.supabase) return;
    const pub=await publicConfig();
    const supabaseUrl=pub.supabaseUrl||pub.supabase_url;
    const anonKey=pub.supabaseAnonKey||pub.supabase_anon_key;
    if(!supabaseUrl||!anonKey) throw new Error("Supabase公開設定を確認できません。");
    if(!window.supabase?.createClient) throw new Error("Supabase clientが読み込まれていません。");
    state.supabase=window.supabase.createClient(supabaseUrl,anonKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storageKey:pub.sessionStorageKey||"dpro-control-center-auth-v1"}});
    const {data:{session}}=await state.supabase.auth.getSession();
    state.session=session||null;
    if(!state.session) throw new Error("管理センターへログインしてください。");
    const {data:staff}=await state.supabase.from("cc_staff").select("*").eq("auth_user_id",state.session.user.id).maybeSingle();
    state.staff=staff||null;
  }

  async function loadData(){
    await initSupabase();
    const [w,s,c,p,g]=await Promise.all([
      state.supabase.from("cc_v_worker_inventory_v4").select("*").order("client_name").order("system_name").order("is_primary",{ascending:false}).order("worker_role"),
      state.supabase.from("cc_v_system_operations").select("*").order("client_name").order("system_name"),
      state.supabase.from("cc_clients").select("id,client_code,display_name,status").order("display_name"),
      state.supabase.from("cc_v_supabase_inventory_v4").select("id,project_name,project_ref,system_instance_id,client_id").order("project_name"),
      state.supabase.from("cc_v_github_inventory_v4").select("id,repository_full_name,system_instance_id,client_id").order("repository_full_name")
    ]);
    for(const r of [w,s,c,p,g]) if(r.error) throw r.error;
    state.workers=w.data||[]; state.systems=s.data||[]; state.clients=c.data||[]; state.supabaseProjects=p.data||[]; state.github=g.data||[];
  }

  function workersForSystem(id){ return state.workers.filter(x=>x.system_instance_id===id); }
  function primaryWorkerForSystem(id){ const all=workersForSystem(id); return all.find(x=>x.is_primary===true)||all.find(x=>x.worker_role==="core")||all[0]||null; }
  function systemLabel(id){ const x=state.systems.find(s=>s.id===id); return x?`${x.client_name||""} / ${x.system_name||x.system_code||""} / ${x.facility_code||""}`:id||"未接続"; }
  function statusPill(status){ const tone=status==="active"?"ok":(["degraded","error"].includes(status)?"bad":(["preparing","paused"].includes(status)?"warn":"")); return `<span class="ccmw-r2-pill ${tone}">${esc(status||"—")}</span>`; }

  function renderWorkers(){
    const root=$("workerOverview"); if(!root||state.rendering) return;
    state.rendering=true;
    try{
      root.innerHTML=`<div class="ccmw-r2-toolbar"><div class="ccmw-r2-note"><strong>Multi-Worker</strong>：1システムに Core / SHOP / LINE 等を複数登録できます。システム基本情報とWorker編集は分離されています。</div>${canWrite()?'<button type="button" class="ccmw-r2-btn primary" id="ccmw-r2-new-worker">＋ Worker登録</button>':""}</div>
      <table><thead><tr><th>顧客・システム</th><th>役割 / Worker</th><th>状態</th><th>バージョン</th><th>最終確認</th><th>接続</th><th>操作</th></tr></thead><tbody>${state.workers.map(w=>`<tr>
        <td>${esc(w.client_name||"DPRO内部")}<span class="ccmw-r2-small">${esc(w.system_name||"")} / ${esc(w.facility_code||"")}</span></td>
        <td><span class="ccmw-r2-role">${esc(roleLabel(w.worker_role))}</span>${w.is_primary?'<span class="ccmw-r2-pill warn ccmw-r2-primary">Primary</span>':""}<strong class="ccmw-r2-small">${esc(w.worker_name||"—")}</strong><span class="ccmw-r2-small">${esc(w.worker_url||"")}</span></td>
        <td>${statusPill(w.status)}${w.secrets_configured?'<span class="ccmw-r2-pill ok">Secret設定済</span>':'<span class="ccmw-r2-pill">Secret要確認</span>'}${w.uses_webhook?'<span class="ccmw-r2-pill ok">Webhook</span>':""}<span class="ccmw-r2-small">連続失敗 ${Number(w.consecutive_failures||0)}</span></td>
        <td><strong>${esc(w.current_version||"未確認")}</strong><span class="ccmw-r2-small">期待 ${esc(w.expected_version||"未設定")}</span></td>
        <td>${esc(w.last_checked_at?new Date(w.last_checked_at).toLocaleString("ja-JP"):"未確認")}<span class="ccmw-r2-small">${w.last_response_ms!=null?`${esc(w.last_response_ms)}ms`:""}</span></td>
        <td>${safeUrl(w.worker_url)?`<a class="small-link" target="_blank" rel="noopener" href="${esc(w.worker_url)}">Worker</a>`:""} ${safeUrl(w.health_url)?`<a class="small-link" target="_blank" rel="noopener" href="${esc(w.health_url)}">Health</a>`:""}${w.uses_webhook&&safeUrl(w.webhook_url)?` <a class="small-link" target="_blank" rel="noopener" href="${esc(w.webhook_url)}">Webhook</a>`:""}</td>
        <td>${canWrite()?`<button type="button" class="ccmw-r2-btn" data-ccmw-r2-edit-worker="${esc(w.id)}">編集</button>`:""}</td>
      </tr>`).join("")||'<tr><td colspan="7">Workerは未登録です。</td></tr>'}</tbody></table>`;
      $("ccmw-r2-new-worker")?.addEventListener("click",()=>openWorker(null));
      root.querySelectorAll("[data-ccmw-r2-edit-worker]").forEach(b=>b.addEventListener("click",()=>openWorker(b.dataset.ccmwR2EditWorker)));
    } finally { state.rendering=false; }
  }

  function enhanceSystems(){
    const root=$("systemOverview"); if(!root) return;
    const rows=[...root.querySelectorAll("tbody tr")];
    for(const row of rows){
      const edit=row.querySelector('[data-infra-edit="system"]'); if(!edit) continue;
      const systemId=edit.dataset.infraId; const workers=workersForSystem(systemId); const primary=primaryWorkerForSystem(systemId);
      const cells=row.querySelectorAll("td"); if(cells.length<6) continue;
      cells[5].innerHTML=`<div class="ccmw-r2-system-summary"><strong>${workers.length} Worker</strong><br>${workers.map(w=>`<span class="ccmw-r2-pill ${w.is_primary?"warn":""}">${esc(roleLabel(w.worker_role))}${w.is_primary?" ★":""}</span>`).join("")}<span class="ccmw-r2-small">代表 ${esc(primary?.worker_name||"未登録")}</span></div>`;
    }
  }

  function option(value,label,selected){ return `<option value="${esc(value)}"${String(value)===String(selected||"")?" selected":""}>${esc(label)}</option>`; }
  function clientOptions(selected){ return '<option value="">顧客を選択</option>'+state.clients.map(c=>option(c.id,`${c.display_name} (${c.client_code})`,selected)).join(""); }
  function systemOptions(selected){ return '<option value="">接続システムを選択</option>'+state.systems.map(s=>option(s.id,`${s.client_name} / ${s.system_name} / ${s.facility_code}`,selected)).join(""); }
  function supabaseOptions(selected){ return '<option value="">未指定</option>'+state.supabaseProjects.map(p=>option(p.id,`${p.project_name} (${p.project_ref})`,selected)).join(""); }
  function githubOptions(selected){ return '<option value="">未指定</option>'+state.github.map(g=>option(g.id,g.repository_full_name,selected)).join(""); }
  function field(name,label,value="",type="text",options="",full=false){
    const cls=`ccmw-r2-field${full?" full":""}`;
    if(type==="select") return `<label class="${cls}"><span>${esc(label)}</span><select name="${esc(name)}" required>${options}</select></label>`;
    if(type==="textarea") return `<label class="${cls}"><span>${esc(label)}</span><textarea name="${esc(name)}" rows="4">${esc(value||"")}</textarea></label>`;
    return `<label class="${cls}"><span>${esc(label)}</span><input name="${esc(name)}" type="${esc(type)}" value="${esc(value||"")}"${["client_id","system_code","system_name","facility_code","worker_name","worker_url"].includes(name)?" required":""}></label>`;
  }

  function ensureModal(){
    if($("ccmw-r2-modal")) return;
    const back=document.createElement("div"); back.id="ccmw-r2-backdrop"; back.className="ccmw-r2-backdrop"; back.hidden=true;
    const modal=document.createElement("section"); modal.id="ccmw-r2-modal"; modal.className="ccmw-r2-modal"; modal.hidden=true; modal.setAttribute("role","dialog"); modal.setAttribute("aria-modal","true");
    modal.innerHTML=`<header class="ccmw-r2-head"><h2 id="ccmw-r2-title">編集</h2><button class="ccmw-r2-close" type="button" aria-label="閉じる">×</button></header><form id="ccmw-r2-form" class="ccmw-r2-form"></form>`;
    document.body.append(back,modal);
    back.addEventListener("click",closeModal); modal.querySelector(".ccmw-r2-close").addEventListener("click",closeModal);
    $("ccmw-r2-form").addEventListener("submit",saveEditor);
  }
  function closeModal(){ $("ccmw-r2-backdrop").hidden=true; $("ccmw-r2-modal").hidden=true; state.editing=null; }
  function showModal(title,html){ ensureModal(); $("ccmw-r2-title").textContent=title; $("ccmw-r2-form").innerHTML=html; $("ccmw-r2-backdrop").hidden=false; $("ccmw-r2-modal").hidden=false; }

  function openWorker(id){
    if(!canWrite()) return;
    const item=state.workers.find(w=>w.id===id)||{}; state.editing={type:"worker",id:item.id||null,item};
    showModal(`${item.id?"編集":"登録"}｜Worker`,
      field("client_id","顧客",item.client_id,"select",clientOptions(item.client_id))+
      field("system_instance_id","接続システム",item.system_instance_id,"select",systemOptions(item.system_instance_id))+
      field("worker_role","役割",item.worker_role||"other","select",["core","shop","line","contact","monitor","integration","other"].map(r=>option(r,roleLabel(r),item.worker_role||"other")).join(""))+
      field("worker_name","Worker名",item.worker_name)+field("worker_url","Worker URL",item.worker_url)+field("health_url","Health URL",item.health_url)+
      field("environment","環境",item.environment||"production","select",["demo","staging","production"].map(v=>option(v,v,item.environment||"production")).join(""))+
      field("status","状態",item.status||"preparing","select",["preparing","active","degraded","paused","ended"].map(v=>option(v,v,item.status||"preparing")).join(""))+
      field("current_version","現在バージョン",item.current_version)+field("expected_version","期待バージョン",item.expected_version)+
      field("supabase_project_id","Supabase",item.supabase_project_id,"select",supabaseOptions(item.supabase_project_id))+
      field("github_repository_id","GitHub",item.github_repository_id,"select",githubOptions(item.github_repository_id))+
      field("webhook_url","Webhook URL",item.webhook_url,"text","",true)+
      `<label class="ccmw-r2-check"><input type="checkbox" name="is_primary"${item.is_primary?" checked":""}><span>このシステムのPrimary Worker</span></label>`+
      `<label class="ccmw-r2-check"><input type="checkbox" name="uses_webhook"${item.uses_webhook?" checked":""}><span>Webhookを使用</span></label>`+
      `<label class="ccmw-r2-check"><input type="checkbox" name="secrets_configured"${item.secrets_configured?" checked":""}><span>Secret設定済み</span></label>`+
      field("internal_note","内部メモ",item.internal_note,"textarea","",true)+
      '<div id="ccmw-r2-message" class="ccmw-r2-message"></div><div class="ccmw-r2-actions"><button type="button" class="ccmw-r2-btn" id="ccmw-r2-cancel">キャンセル</button><button type="submit" class="ccmw-r2-btn primary">保存</button></div>'
    );
    $("ccmw-r2-cancel").addEventListener("click",closeModal);
    const wi=$("ccmw-r2-form").elements.worker_url, hi=$("ccmw-r2-form").elements.health_url;
    wi?.addEventListener("input",()=>{ if(!hi.dataset.manual||!hi.value.trim()) hi.value=healthFromWorker(wi.value); }); hi?.addEventListener("input",()=>hi.dataset.manual="1");
  }

  function openSystem(id){
    if(!canWrite()) return;
    const item=state.systems.find(s=>s.id===id)||{}; state.editing={type:"system",id:item.id||null,item};
    showModal(`${item.id?"編集":"登録"}｜DPROシステム基本情報`,
      '<div class="ccmw-r2-field full"><span>Worker編集はこの画面では行いません</span><div class="ccmw-r2-note">Core / SHOP / LINE 等は「Worker」一覧から個別に登録・編集します。</div></div>'+
      field("client_id","顧客",item.client_id,"select",clientOptions(item.client_id))+
      field("system_code","システムコード",item.system_code)+field("system_name","システム名",item.system_name)+field("facility_code","事業所コード",item.facility_code)+
      field("environment","環境",item.environment||"production","select",["demo","staging","production"].map(v=>option(v,v,item.environment||"production")).join(""))+
      field("status","状態",item.status||"preparing","select",["planned","preparing","active","degraded","paused","ended"].map(v=>option(v,v,item.status||"preparing")).join(""))+
      field("health_url","代表Health URL（システム監視）",item.health_url,"text","",true)+field("system_check_url","system-check URL",item.system_check_url,"text","",true)+
      field("expected_worker_version","代表Worker期待版（システム要約）",item.expected_worker_version)+field("expected_database_version","期待DB版",item.expected_database_version)+
      '<div id="ccmw-r2-message" class="ccmw-r2-message"></div><div class="ccmw-r2-actions"><button type="button" class="ccmw-r2-btn" id="ccmw-r2-cancel">キャンセル</button><button type="submit" class="ccmw-r2-btn primary">保存</button></div>'
    );
    $("ccmw-r2-cancel").addEventListener("click",closeModal);
  }

  async function saveEditor(event){
    event.preventDefault(); if(!state.editing||!canWrite()) return;
    const msg=$("ccmw-r2-message"); msg.textContent="";
    const fd=new FormData(event.currentTarget); const payload=Object.fromEntries(fd.entries());
    for(const k of Object.keys(payload)) if(payload[k]==="") payload[k]=null;
    try{
      if(state.editing.type==="worker"){
        const f=event.currentTarget;
        payload.is_primary=!!f.elements.is_primary?.checked; payload.uses_webhook=!!f.elements.uses_webhook?.checked; payload.secrets_configured=!!f.elements.secrets_configured?.checked;
        payload.worker_url=normalizeWorkerUrl(payload.worker_url); if(!payload.worker_url) throw new Error("Worker URLを確認してください。");
        if(!payload.health_url) payload.health_url=healthFromWorker(payload.worker_url); if(payload.health_url&&!safeUrl(payload.health_url)) throw new Error("Health URLを確認してください。");
        if(payload.webhook_url&&!safeUrl(payload.webhook_url)) throw new Error("Webhook URLを確認してください。");
        if(payload.is_primary){ const clear=await state.supabase.from("cc_workers").update({is_primary:false,updated_at:new Date().toISOString()}).eq("system_instance_id",payload.system_instance_id).neq("id",state.editing.id||"00000000-0000-0000-0000-000000000000"); if(clear.error) throw clear.error; }
        payload.updated_at=new Date().toISOString();
        const q=state.editing.id?state.supabase.from("cc_workers").update(payload).eq("id",state.editing.id):state.supabase.from("cc_workers").insert(payload);
        const r=await q; if(r.error) throw r.error;
      } else {
        if(payload.system_code) payload.system_code=String(payload.system_code).toUpperCase();
        if(payload.health_url&&!safeUrl(payload.health_url)) throw new Error("代表Health URLを確認してください。");
        if(payload.system_check_url&&!safeUrl(payload.system_check_url)) throw new Error("system-check URLを確認してください。");
        payload.updated_at=new Date().toISOString();
        const q=state.editing.id?state.supabase.from("cc_system_instances").update(payload).eq("id",state.editing.id):state.supabase.from("cc_system_instances").insert(payload);
        const r=await q; if(r.error) throw r.error;
      }
      closeModal(); await refresh();
    }catch(e){ msg.textContent=e?.message||String(e); }
  }

  function interceptLegacy(event){
    const b=event.target?.closest?.('[data-infra-edit="worker"],[data-infra-new="worker"],[data-infra-edit="system"],[data-infra-new="system"]');
    if(!b) return;
    event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
    const type=b.dataset.infraEdit||b.dataset.infraNew; const id=b.dataset.infraId||null;
    if(type==="worker") openWorker(id); else openSystem(id);
  }

  async function refresh(){
    try{ await loadData(); renderWorkers(); enhanceSystems(); document.documentElement.dataset.ccMultiWorkerR2=VERSION; }
    catch(e){ console.error("CONTROL CENTER Multi-Worker R2",e); const root=$("workerOverview"); if(root){ root.innerHTML='<div class="empty-state"><strong>Worker台帳を読み込めません</strong><br><span>'+esc(e?.message||String(e))+'</span></div>'; } }
  }

  async function boot(){
    ensureStyle(); ensureModal(); document.addEventListener("click",interceptLegacy,true);
    await refresh();
    const workerRoot=$("workerOverview"), systemRoot=$("systemOverview");
    const observer=new MutationObserver(()=>{ if(!state.rendering){ renderWorkers(); enhanceSystems(); } });
    if(workerRoot) observer.observe(workerRoot,{childList:true,subtree:true}); if(systemRoot) observer.observe(systemRoot,{childList:true,subtree:true});
    window.addEventListener("focus",()=>{ refresh(); },{passive:true});
  }

  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",boot,{once:true}); else boot();
})();
