(() => {
  "use strict";

  const BUILD = "CONTROL-CENTER-PRODUCT-READY-V1.0-FRONTEND-20260820";
  const CONFIG = window.DPRO_CONTROL_CENTER_CONFIG || {};
  const $ = (id) => document.getElementById(id);
  const $$ = (selector, scope=document) => Array.from(scope.querySelectorAll(selector));

  const state = {
    supabase:null,
    session:null,
    staff:null,
    products:[],
    summary:null,
    selectedProductId:"",
    filter:"ALL",
    search:"",
    currentAudit:null,
    currentItems:[],
    loaded:false
  };

  const statusMeta = {
    READY:["READY","green"],
    REVIEW:["REVIEW","amber"],
    UPDATE:["UPDATE","orange"],
    HOLD:["HOLD","red"],
    UNASSESSED:["未監査","gray"]
  };

  const itemResults = ["PASS","REVIEW","FAIL","HOLD","N/A","UNKNOWN"];
  const evidenceTypes = [
    "","SOURCE_FILE","GITHUB_COMMIT","SYSTEM_CHECK","API_HEALTH","BROWSER_QA",
    "PUBLIC_URL","SCREENSHOT","DB_QUERY","WORKER_VERSION","QA_REPORT",
    "MANUAL_DEVICE","CENTRAL_LOCK"
  ];

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
      .replaceAll('"',"&quot;").replaceAll("'","&#039;");
  }

  function fmtDate(value) {
    if (!value) return "—";
    try { return new Intl.DateTimeFormat("ja-JP",{dateStyle:"medium",timeStyle:"short"}).format(new Date(value)); }
    catch { return String(value); }
  }

  function canWrite() {
    return ["owner_admin","technical_admin","support"].includes(state.staff?.role_key);
  }

  function toast(message,error=false) {
    let el=$("readyAuditToast");
    if (!el) {
      el=document.createElement("div");
      el.id="readyAuditToast";
      el.className="ready-toast";
      document.body.appendChild(el);
    }
    el.textContent=message;
    el.classList.toggle("error",error);
    el.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer=setTimeout(()=>el.classList.remove("show"),3600);
  }

  function installStyle() {
    if ($("productReadyStyle")) return;
    const style=document.createElement("style");
    style.id="productReadyStyle";
    style.textContent=`
      .ready-head{display:flex;justify-content:space-between;align-items:flex-end;gap:16px;margin:0 0 14px}
      .ready-head h2{margin:0;font-size:24px}.ready-head p{margin:6px 0 0;color:#68766f;font-size:11px;line-height:1.75}
      .ready-badge{display:inline-flex;padding:6px 10px;border-radius:999px;background:#e9f7f1;color:#096245;font-size:9px;font-weight:900}
      .ready-guide{padding:14px 16px;border:1px solid #b9dccd;border-radius:14px;background:#f0faf6;font-size:10px;line-height:1.8;color:#455f56}
      .ready-metrics{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:9px;margin:14px 0}
      .ready-metric{padding:14px;border:1px solid #dce7e2;border-radius:14px;background:#fff}
      .ready-metric strong,.ready-metric span{display:block}.ready-metric strong{font-size:23px;color:#0b5f49}.ready-metric span{font-size:9px;color:#697870;margin-top:3px}
      .ready-toolbar{display:grid;grid-template-columns:minmax(220px,1fr) 170px auto;gap:9px;margin:14px 0}
      .ready-toolbar input,.ready-toolbar select,.ready-detail select,.ready-detail input,.ready-detail textarea{
        width:100%;min-height:42px;border:1px solid #d8e4df;border-radius:10px;background:#fff;padding:9px 11px;color:#172820
      }
      .ready-table-wrap{overflow:auto;border:1px solid #dce7e2;border-radius:16px;background:#fff}
      .ready-table{width:100%;min-width:1020px;border-collapse:collapse}
      .ready-table th,.ready-table td{padding:10px 11px;border-bottom:1px solid #edf2ef;text-align:left;vertical-align:top;font-size:10px}
      .ready-table th{background:#f5f8f6;color:#52645c;font-size:9px;white-space:nowrap}
      .ready-product strong{display:block;font-size:11px}.ready-product small{display:block;color:#74817c;margin-top:3px;font-size:8px}
      .ready-pill{display:inline-flex;padding:5px 8px;border-radius:999px;font-size:8px;font-weight:900;background:#eef2f0;color:#66746e}
      .ready-pill.green{background:#def5ea;color:#087253}.ready-pill.amber{background:#fff6df;color:#906000}
      .ready-pill.orange{background:#fff0df;color:#a44f00}.ready-pill.red{background:#ffe8ec;color:#a92e42}
      .ready-pill.gray{background:#eef2f0;color:#66746e}.ready-pill.blue{background:#eaf4ff;color:#2b66a0}
      .ready-actions{display:flex;gap:7px;flex-wrap:wrap}.ready-actions button{white-space:nowrap}
      .ready-empty{padding:34px;text-align:center;color:#66756f;border:1px dashed #bfd0c8;border-radius:15px;background:#fff}
      .ready-detail{margin-top:16px;border:1px solid #dce7e2;border-radius:17px;background:#fff;overflow:hidden}
      .ready-detail-head{padding:16px 17px;background:#f6faf8;border-bottom:1px solid #dce7e2;display:flex;justify-content:space-between;gap:14px;align-items:center}
      .ready-detail-head h3{margin:0;font-size:17px}.ready-detail-head p{margin:5px 0 0;color:#6b7973;font-size:9px}
      .ready-item-table{width:100%;min-width:1120px;border-collapse:collapse}
      .ready-item-table th,.ready-item-table td{padding:9px;border-bottom:1px solid #edf2ef;vertical-align:top;font-size:9px}
      .ready-item-table th{position:sticky;top:0;background:#f5f8f6;z-index:1}
      .ready-item-name{min-width:200px}.ready-item-name strong{display:block}.ready-item-name small{display:block;color:#718079;margin-top:3px}
      .ready-item-table select{min-width:110px}.ready-item-table input{min-width:160px}.ready-item-table textarea{min-width:220px;min-height:68px;resize:vertical}
      .ready-detail-foot{display:flex;justify-content:flex-end;gap:9px;padding:14px 16px;background:#fafcfb}
      .ready-toast{position:fixed;right:18px;bottom:18px;z-index:300;padding:13px 16px;border-radius:11px;background:#0b5f49;color:#fff;font-size:11px;font-weight:800;box-shadow:0 16px 46px rgba(0,0,0,.2);opacity:0;transform:translateY(8px);transition:.18s;pointer-events:none}
      .ready-toast.show{opacity:1;transform:none}.ready-toast.error{background:#a92e42}
      @media(max-width:1100px){.ready-metrics{grid-template-columns:repeat(3,1fr)}}
      @media(max-width:700px){
        .ready-head{display:block}.ready-metrics{grid-template-columns:repeat(2,1fr)}.ready-toolbar{grid-template-columns:1fr}
        .ready-table-wrap{overflow:visible;border:0;background:transparent}.ready-table{min-width:0;display:block}
        .ready-table thead{display:none}.ready-table tbody{display:grid;gap:10px}.ready-table tr{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:13px;border:1px solid #dce7e2;border-radius:14px;background:#fff}
        .ready-table td{display:block;border:0;padding:3px}.ready-table td:first-child{grid-column:1/-1}.ready-table td:last-child{grid-column:1/-1}
      }
    `;
    document.head.appendChild(style);
  }


  function normalizeProductViewCopy() {
    const view=document.getElementById("view-products");
    if (!view) return;
    const desc=view.querySelector(".product-page-head p:not(.eyebrow)");
    if (desc) desc.textContent="51管理対象を契約前にREADY監査し、契約後は顧客固有設定と本番準備へ進めます。";
    const note=view.querySelector(".product-policy-note span");
    if (note) note.textContent="製品そのものは契約前READY監査で最新基準へ統一し、契約成立後は顧客固有の接続・設定・実機確認を行います。既存の本番準備ナビは維持します。";
    const catalog=view.querySelector('[data-product-tab="catalog"]');
    if (catalog) catalog.textContent="51製品台帳";
    const rollout=view.querySelector('[data-product-tab="rollout"]');
    if (rollout) rollout.textContent="契約後セットアップ";
  }

  async function getClient() {
    if (state.supabase) return state.supabase;
    const base=String(CONFIG.apiBaseUrl||"").replace(/\/$/,"");
    const response=await fetch(`${base}/api/public-config`,{cache:"no-store"});
    const pub=await response.json().catch(()=>({}));
    if (!response.ok) throw new Error(pub.message||pub.error||`HTTP ${response.status}`);
    if (!window.supabase?.createClient) throw new Error("Supabaseライブラリを読み込めません。");
    state.supabase=window.supabase.createClient(
      pub.supabaseUrl,
      pub.supabasePublishableKey||pub.supabaseAnonKey,
      {auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storageKey:pub.sessionStorageKey||"dpro-control-center-auth-v1"}}
    );
    const {data:sessionData,error:sessionError}=await state.supabase.auth.getSession();
    if (sessionError) throw sessionError;
    state.session=sessionData.session;
    if (!state.session?.user) throw new Error("CONTROL CENTERへログインしてください。");
    const {data:aal}=await state.supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.currentLevel!=="aal2") throw new Error("二段階認証を完了してください。");
    const {data:staff,error:staffError}=await state.supabase.from("cc_staff").select("id,role_key,status").eq("auth_user_id",state.session.user.id).maybeSingle();
    if (staffError) throw staffError;
    if (!staff||staff.status!=="active") throw new Error("有効なDPROスタッフではありません。");
    state.staff=staff;
    return state.supabase;
  }

  function installPanel() {
    const tabs=document.querySelector("#view-products .product-tabs");
    if (!tabs) return false;
    if ($("product-panel-ready")) return true;

    const tab=document.createElement("button");
    tab.className="product-tab";
    tab.type="button";
    tab.dataset.productTab="ready";
    tab.dataset.productReadyTab="true";
    tab.textContent="製品READY監査";
    tabs.appendChild(tab);

    const panel=document.createElement("section");
    panel.id="product-panel-ready";
    panel.className="product-panel hidden";
    panel.innerHTML=`
      <div class="ready-head">
        <div>
          <h2>製品READY監査</h2>
          <p>契約前に「製品そのもの」がDPRO最新基準へ適合しているか確認します。顧客固有の本番設定は既存の本番準備ナビで行います。</p>
        </div>
        <span class="ready-badge">PRE-CONTRACT / V1.0</span>
      </div>
      <div class="ready-guide">
        <strong>READY</strong> は「この製品から契約が入っても、顧客設定へ進める」状態です。
        旧 <code>complete</code> や <code>production_ready</code> を自動でREADY扱いせず、全製品を新基準で再監査します。
      </div>
      <div id="readyMetrics" class="ready-metrics"></div>
      <div class="ready-toolbar">
        <input id="readySearch" type="search" placeholder="製品名・SYSTEM CODEで検索">
        <select id="readyFilter">
          <option value="ALL">すべて</option>
          <option value="READY">READY</option>
          <option value="REVIEW">REVIEW</option>
          <option value="UPDATE">UPDATE</option>
          <option value="HOLD">HOLD</option>
          <option value="UNASSESSED">未監査</option>
        </select>
        <button id="readyReload" class="btn btn-secondary" type="button">再読込</button>
      </div>
      <div id="readyBoard"></div>
      <div id="readyDetail"></div>
    `;

    const lastPanel=$$("#view-products .product-panel").at(-1);
    if (lastPanel) lastPanel.insertAdjacentElement("afterend",panel);
    else tabs.insertAdjacentElement("afterend",panel);

    tab.addEventListener("click",async()=>{
      $$("#view-products .product-tab").forEach(b=>b.classList.toggle("active",b===tab));
      $$("#view-products .product-panel").forEach(p=>p.classList.add("hidden"));
      panel.classList.remove("hidden");
      if (!state.loaded) await loadOverview();
    });
    $("readySearch").addEventListener("input",()=>{state.search=$("readySearch").value.trim().toLowerCase();renderBoard();});
    $("readyFilter").addEventListener("change",()=>{state.filter=$("readyFilter").value;renderBoard();});
    $("readyReload").addEventListener("click",loadOverview);
    return true;
  }

  async function loadOverview() {
    try {
      const sb=await getClient();
      const [productsResult,summaryResult]=await Promise.all([
        sb.from("cc_v_product_ready_current").select("*").order("product_number"),
        sb.from("cc_v_product_ready_summary").select("*").maybeSingle()
      ]);
      if (productsResult.error) throw productsResult.error;
      if (summaryResult.error) throw summaryResult.error;
      state.products=productsResult.data||[];
      state.summary=summaryResult.data||{total:0,ready:0,review:0,update_required:0,hold:0,unassessed:0};
      state.loaded=true;
      renderMetrics();
      renderBoard();
      toast("製品READY状況を読み込みました。");
    } catch(error) {
      console.error(BUILD,error);
      $("readyBoard").innerHTML=`<div class="ready-empty">${esc(error.message||"READY監査を読み込めませんでした。")}</div>`;
      toast(error.message||"読み込みに失敗しました。",true);
    }
  }

  function renderMetrics() {
    const s=state.summary||{};
    const vals=[
      [s.total||0,"管理対象"],
      [s.ready||0,"READY"],
      [s.review||0,"REVIEW"],
      [s.update_required||0,"UPDATE"],
      [s.hold||0,"HOLD"],
      [s.unassessed||0,"未監査"]
    ];
    $("readyMetrics").innerHTML=vals.map(([v,l])=>`<article class="ready-metric"><strong>${Number(v)||0}</strong><span>${esc(l)}</span></article>`).join("");
  }

  function filteredProducts() {
    return state.products.filter(p=>{
      if (state.filter!=="ALL"&&p.ready_status!==state.filter) return false;
      if (!state.search) return true;
      return `${p.product_name||""} ${p.system_code||""} ${p.category||""}`.toLowerCase().includes(state.search);
    });
  }

  function renderBoard() {
    const rows=filteredProducts();
    const board=$("readyBoard");
    if (!rows.length) {board.innerHTML='<div class="ready-empty">条件に一致する製品はありません。</div>';return;}
    board.innerHTML=`
      <div class="ready-table-wrap"><table class="ready-table">
        <thead><tr><th>No</th><th>製品</th><th>READY</th><th>Blocking</th><th>最終監査</th><th>公開</th><th>操作</th></tr></thead>
        <tbody>${rows.map(p=>{
          const meta=statusMeta[p.ready_status]||statusMeta.UNASSESSED;
          const block=Number(p.blocking_fail_count||0)+Number(p.blocking_review_count||0)+Number(p.blocking_unknown_count||0)+Number(p.hold_count||0);
          return `<tr>
            <td>${String(p.product_number||"").padStart(2,"0")}</td>
            <td class="ready-product"><strong>${esc(p.product_name)}</strong><small>${esc(p.system_code)}・${esc(p.category||"")}</small></td>
            <td><span class="ready-pill ${meta[1]}">${meta[0]}</span></td>
            <td>${block}</td>
            <td>${esc(fmtDate(p.last_audited_at))}</td>
            <td>${p.product_page_url?'<span class="ready-pill blue">PRODUCT</span>':'—'} ${p.demo_url?'<span class="ready-pill blue">DEMO</span>':''}</td>
            <td><div class="ready-actions">
              <button class="btn btn-secondary" type="button" data-ready-open="${esc(p.product_id)}">詳細</button>
              ${canWrite()?`<button class="btn btn-primary" type="button" data-ready-start="${esc(p.product_id)}">${p.audit_id?"再監査":"初回監査"}</button>`:""}
            </div></td>
          </tr>`;
        }).join("")}</tbody>
      </table></div>
    `;
    $$("[data-ready-open]",board).forEach(b=>b.addEventListener("click",()=>openDetail(b.dataset.readyOpen)));
    $$("[data-ready-start]",board).forEach(b=>b.addEventListener("click",()=>startAudit(b.dataset.readyStart)));
  }

  async function startAudit(productId) {
    if (!canWrite()) return toast("編集権限がありません。",true);
    try {
      const sb=await getClient();
      const product=state.products.find(p=>p.product_id===productId);
      const mode=product?.audit_id?"recheck":"initial";
      const {data,error}=await sb.rpc("cc_product_ready_start_audit",{p_product_id:productId,p_audit_mode:mode});
      if (error) throw error;
      toast("監査を開始しました。自動判定できる項目だけ先に反映しました。");
      await loadOverview();
      await openAudit(data,productId);
    } catch(error) {toast(error.message||"監査を開始できませんでした。",true);}
  }

  async function openDetail(productId) {
    const product=state.products.find(p=>p.product_id===productId);
    if (!product) return;
    if (!product.audit_id) {
      state.currentAudit=null;state.currentItems=[];
      $("readyDetail").innerHTML=`<section class="ready-detail">
        <div class="ready-detail-head"><div><h3>${esc(product.product_name)}</h3><p>${esc(product.system_code)} / まだ完了済みREADY監査はありません。</p></div><span class="ready-pill gray">未監査</span></div>
        <div class="ready-empty">「初回監査」を押すと42項目の監査票を作成します。自動で確認できない項目を勝手にPASSにはしません。</div>
      </section>`;
      return;
    }
    await openAudit(product.audit_id,productId,true);
  }

  async function openAudit(auditId,productId,completedAudit=false) {
    try {
      const sb=await getClient();
      const [auditResult,itemsResult]=await Promise.all([
        sb.from("cc_product_ready_audits").select("*").eq("id",auditId).single(),
        sb.from("cc_product_ready_audit_items").select("*,standard_item:cc_standard_items(item_name,category,description,requirement_type,condition_feature_code)").eq("audit_id",auditId).order("item_code")
      ]);
      if (auditResult.error) throw auditResult.error;
      if (itemsResult.error) throw itemsResult.error;
      state.currentAudit=auditResult.data;
      state.currentItems=itemsResult.data||[];
      state.selectedProductId=productId;
      renderDetail();
    } catch(error) {toast(error.message||"監査詳細を取得できませんでした。",true);}
  }

  function renderDetail() {
    const audit=state.currentAudit;
    const product=state.products.find(p=>p.product_id===state.selectedProductId)||{};
    if (!audit) return;
    const locked=Boolean(audit.completed_at)||!canWrite();
    const meta=statusMeta[audit.overall_status]||statusMeta.UNASSESSED;
    $("readyDetail").innerHTML=`<section class="ready-detail">
      <div class="ready-detail-head">
        <div><h3>${esc(product.product_name||audit.source_system_code)}</h3><p>監査 #${audit.audit_sequence} / ${esc(audit.audit_mode)} / 開始 ${esc(fmtDate(audit.started_at))}${audit.completed_at?` / 確定 ${esc(fmtDate(audit.completed_at))}`:""}</p></div>
        <span class="ready-pill ${meta[1]}">${meta[0]}</span>
      </div>
      <div class="ready-table-wrap"><table class="ready-item-table">
        <thead><tr><th>項目</th><th>結果</th><th>Evidence</th><th>Evidence Ref</th><th>Version</th><th>メモ</th><th>保存</th></tr></thead>
        <tbody>${state.currentItems.map(item=>{
          const s=item.standard_item||{};
          return `<tr data-ready-item="${esc(item.item_code)}">
            <td class="ready-item-name"><strong>${esc(item.item_code)}｜${esc(s.item_name||"")}</strong><small>${esc(s.category||"")} / ${item.is_blocking?"BLOCKING":"NON-BLOCK"}${s.condition_feature_code?` / ${esc(s.condition_feature_code)}`:""}</small></td>
            <td><select data-ready-result ${locked?"disabled":""}>${itemResults.map(v=>`<option value="${v}" ${v===item.result?"selected":""}>${v}</option>`).join("")}</select></td>
            <td><select data-ready-evidence ${locked?"disabled":""}>${evidenceTypes.map(v=>`<option value="${esc(v)}" ${v===(item.evidence_type||"")?"selected":""}>${esc(v||"—")}</option>`).join("")}</select></td>
            <td><input data-ready-ref value="${esc(item.evidence_ref||"")}" ${locked?"disabled":""}></td>
            <td><input data-ready-version value="${esc(item.observed_version||"")}" ${locked?"disabled":""}></td>
            <td><textarea data-ready-note ${locked?"disabled":""}>${esc(item.note||"")}</textarea></td>
            <td>${locked?"—":'<button class="btn btn-secondary" type="button" data-ready-save>保存</button>'}</td>
          </tr>`;
        }).join("")}</tbody>
      </table></div>
      <div class="ready-detail-foot">
        <button class="btn btn-secondary" type="button" id="readyCloseDetail">閉じる</button>
        ${!locked?'<button class="btn btn-primary" type="button" id="readyCompleteAudit">監査を確定</button>':""}
      </div>
    </section>`;
    $("readyCloseDetail").addEventListener("click",()=>{$("readyDetail").innerHTML="";});
    $$("[data-ready-save]",$("readyDetail")).forEach(btn=>btn.addEventListener("click",()=>saveItem(btn.closest("[data-ready-item]"))));
    if ($("readyCompleteAudit")) $("readyCompleteAudit").addEventListener("click",completeAudit);
  }

  async function saveItem(tr) {
    try {
      const sb=await getClient();
      const {error}=await sb.rpc("cc_product_ready_set_item",{
        p_audit_id:state.currentAudit.id,
        p_item_code:tr.dataset.readyItem,
        p_result:tr.querySelector("[data-ready-result]").value,
        p_evidence_type:tr.querySelector("[data-ready-evidence]").value||null,
        p_evidence_ref:tr.querySelector("[data-ready-ref]").value.trim()||null,
        p_observed_version:tr.querySelector("[data-ready-version]").value.trim()||null,
        p_note:tr.querySelector("[data-ready-note]").value.trim()||null
      });
      if (error) throw error;
      toast(`${tr.dataset.readyItem} を保存しました。`);
    } catch(error) {toast(error.message||"監査項目を保存できませんでした。",true);}
  }

  async function completeAudit() {
    if (!confirm("現在の監査結果を確定します。確定後はこの監査票を編集できません。よろしいですか？")) return;
    try {
      const sb=await getClient();
      const {data,error}=await sb.rpc("cc_product_ready_complete_audit",{p_audit_id:state.currentAudit.id});
      if (error) throw error;
      toast(`監査を確定しました：${data}`);
      await loadOverview();
      await openDetail(state.selectedProductId);
    } catch(error) {toast(error.message||"監査を確定できませんでした。",true);}
  }

  function boot() {
    installStyle();
    normalizeProductViewCopy();
    if (installPanel()) return;
    const observer=new MutationObserver(()=>{if(installPanel()) observer.disconnect();});
    observer.observe(document.documentElement,{childList:true,subtree:true});
    setTimeout(()=>observer.disconnect(),12000);
  }

  if (document.readyState==="loading") document.addEventListener("DOMContentLoaded",boot,{once:true});
  else boot();
})();