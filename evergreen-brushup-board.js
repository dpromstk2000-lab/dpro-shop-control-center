(() => {
  "use strict";
  const BUILD="DPRO-EVERGREEN-BRUSHUP-BOARD-EVG06-R1-20260922";
  const API_BASE="https://dpro-shop-control-center-api.dpromstk2000.workers.dev";
  const $=id=>document.getElementById(id);
  const state={supabase:null,session:null,staff:null,summary:null,today:[],board:[]};
  const roleLabels={owner_admin:"管理責任者",technical_admin:"技術管理者",support:"DPROサポート",read_only:"閲覧専用"};
  const classText={A:"確認済み",B:"Evidence更新",C:"個別対応",D:"人判断"};
  const priorityText={
    HUMAN_DECISION:"人確認",
    TARGETED_REAUDIT:"再監査",
    CATALOG_SYNC:"Catalog同期",
    HIGH_EVIDENCE_REFRESH:"優先Evidence",
    BASELINE_SHA_REQUIRED:"基準SHA固定",
    EVIDENCE_REFRESH:"Evidence更新",
    V21_EVIDENCE_ONLY:"V2.1確認"
  };

  function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
  function showOnly(id){["loadingScreen","authScreen","errorScreen","app"].forEach(x=>$(x)?.classList.toggle("hidden",x!==id));}
  function toast(message,error=false){const el=$("toast");el.textContent=message;el.className=`toast${error?" error":""}`;el.classList.remove("hidden");clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.add("hidden"),3500);}
  async function waitForSupabase(){return new Promise((resolve,reject)=>{let n=0;const t=setInterval(()=>{n++;if(window.supabase?.createClient){clearInterval(t);resolve();}else if(n>100){clearInterval(t);reject(new Error("Supabaseライブラリを読み込めませんでした。"));}},60);});}
  async function publicConfig(){const r=await fetch(`${API_BASE}/api/public-config`,{cache:"no-store"});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d?.error||"公開接続設定を取得できませんでした。");return d;}

  async function boot(){
    try{
      const pub=await publicConfig();
      await waitForSupabase();
      state.supabase=window.supabase.createClient(pub.supabaseUrl,pub.supabasePublishableKey||pub.supabaseAnonKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storageKey:pub.sessionStorageKey||"dpro-control-center-auth-v1"}});
      const {data:{session},error}=await state.supabase.auth.getSession(); if(error) throw error;
      state.session=session; if(!session){showOnly("authScreen");return;}
      const s=await state.supabase.from("cc_staff").select("id,display_name,role_key,status").eq("auth_user_id",session.user.id).maybeSingle();
      if(s.error) throw s.error; if(!s.data||s.data.status!=="active"){showOnly("authScreen");return;}
      state.staff=s.data;
      $("staffName").textContent=s.data.display_name||"DPROスタッフ";
      $("staffRole").textContent=roleLabels[s.data.role_key]||s.data.role_key||"DPROスタッフ";
      $("staffInitial").textContent=(s.data.display_name||"D").trim().slice(0,1).toUpperCase();
      bind();
      await load();
      showOnly("app");
    }catch(e){console.error(BUILD,e);$("errorText").textContent=e?.message||"BRUSHUP BOARDを読み込めませんでした。";showOnly("errorScreen");}
  }

  function bind(){
    $("retryButton")?.addEventListener("click",()=>location.reload());
    $("refreshButton")?.addEventListener("click",async()=>{try{await load();toast("最新レビューへ更新しました。");}catch(e){toast(e?.message||"更新できませんでした。",true);}});
    $("menuButton")?.addEventListener("click",()=>$("sidebar")?.classList.toggle("open"));
    $("searchInput")?.addEventListener("input",renderBoard);
    $("classFilter")?.addEventListener("change",renderBoard);
  }

  async function load(){
    const [s,t,b]=await Promise.all([
      state.supabase.from("cc_v_dpro_evergreen_brushup_summary").select("*").maybeSingle(),
      state.supabase.from("cc_v_dpro_evergreen_today_candidates").select("*"),
      state.supabase.from("cc_v_dpro_evergreen_brushup_board").select("*").order("priority_rank",{ascending:false}).order("commits_ahead",{ascending:false,nullsFirst:false}).order("product_number",{ascending:true,nullsFirst:false})
    ]);
    for(const r of [s,t,b]) if(r.error) throw r.error;
    state.summary=s.data||{};
    state.today=t.data||[];
    state.board=b.data||[];
    render();
  }

  function render(){
    const s=state.summary||{};
    const reviewed=s.reviewed_at?new Date(s.reviewed_at).toLocaleString("ja-JP"):"—";
    $("reviewLead").textContent=`最新レビュー: ${s.review_version||"—"} / ${reviewed} / ${Number(s.system_count||0)} SYSTEM`;

    const cards=[
      ["a",Number(s.class_a||0),"A 確認済み","現行基準で確認済み"],
      ["b",Number(s.class_b||0),"B Evidence更新","不具合確定ではない"],
      ["c",Number(s.class_c||0),"C 個別対応","今日の候補"],
      ["d",Number(s.class_d||0),"D 人判断","自動変更しない"],
      ["b",Number(s.high_evidence_count||0),"優先Evidence","差分が大きいB"]
    ];
    $("summaryGrid").innerHTML=cards.map(([c,n,l,x])=>`<article class="summary-card ${c}"><b>${esc(n)}</b><strong>${esc(l)}</strong><small>${esc(x)}</small></article>`).join("");

    $("todayGrid").innerHTML=state.today.length?state.today.map((r,i)=>`
      <article class="today-card">
        <span class="rank">TODAY ${i+1}</span>
        <div style="display:flex;justify-content:space-between;gap:10px;align-items:start">
          <div><h3>${esc(r.product_name)}</h3><span class="code">${esc(r.system_code)}</span></div>
          <span class="class-badge class-${esc(r.classification)}">${esc(r.classification)}</span>
        </div>
        <div class="meta">
          <span class="mini">${esc(priorityText[r.priority_key]||r.priority_key)}</span>
          ${r.commits_ahead!==null?`<span class="mini">+${Number(r.commits_ahead)} commits</span>`:""}
          <span class="mini">Blocker UNKNOWN ${Number(r.blocking_unknown_count||0)}</span>
        </div>
        <p class="why">${esc(r.review_reason)}</p>
        <a class="btn primary" href="evergreen-package.html?system=${encodeURIComponent(r.system_code)}">このSYSTEMを確認する</a>
      </article>`).join(""):'<div class="empty-board">今日の候補はありません。</div>';

    const humans=state.board.filter(r=>r.classification==="D");
    $("humanPanel").classList.toggle("hidden",humans.length===0);
    $("humanCount").textContent=`${humans.length}件`;
    $("humanList").innerHTML=humans.map(r=>`
      <div class="human-row">
        <span class="class-badge class-D">D</span>
        <div><h3>${esc(r.product_name)} <small>${esc(r.system_code)}</small></h3><p>${esc(r.review_reason)}</p></div>
        <div class="action"><a class="btn secondary" href="evergreen-package.html?system=${encodeURIComponent(r.system_code)}">内容を見る</a></div>
      </div>`).join("");

    renderBoard();
  }

  function renderBoard(){
    const q=($("searchInput")?.value||"").trim().toLowerCase();
    const c=$("classFilter")?.value||"";
    const rows=state.board.filter(r=>{
      if(c&&r.classification!==c)return false;
      if(!q)return true;
      return `${r.system_code} ${r.product_name} ${r.category||""}`.toLowerCase().includes(q);
    });
    $("boardList").innerHTML=rows.length?rows.map(r=>`
      <article class="board-row">
        <span class="num">${r.product_number??"—"}</span>
        <span class="class-badge class-${esc(r.classification)}">${esc(r.classification)}</span>
        <div class="name"><strong>${esc(r.product_name)}</strong><span>${esc(r.system_code)} / ${esc(priorityText[r.priority_key]||r.priority_key)}</span></div>
        <div class="reason">${esc(r.review_reason)}</div>
        <div class="metric"><strong>${Number(r.blocking_unknown_count||0)}</strong><span>Blocker UNKNOWN</span></div>
        <div class="metric changed"><strong>${r.commits_ahead===null?"—":`+${Number(r.commits_ahead)}`}</strong><span>commits</span></div>
        <div class="action"><a class="btn ${r.classification==="C"?"primary":"secondary"}" href="evergreen-package.html?system=${encodeURIComponent(r.system_code)}">${r.classification==="D"?"確認":"START ZIP"}</a></div>
      </article>`).join(""):'<div class="empty-board">条件に一致するSYSTEMはありません。</div>';
  }

  window.addEventListener("DOMContentLoaded",boot,{once:true});
})();
