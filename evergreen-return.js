(() => {
  "use strict";
  const BUILD="DPRO-EVERGREEN-RETURN-EVG07-HOTFIX1-DROP-20260922";
  const API_BASE="https://dpro-shop-control-center-api.dpromstk2000.workers.dev";
  const $=id=>document.getElementById(id);
  const state={supabase:null,session:null,staff:null,aal2:false,file:null,zipSha:null,fileCount:0,payload:null,validated:false};
  const roleLabels={owner_admin:"管理責任者",technical_admin:"技術管理者",support:"DPROサポート",read_only:"閲覧専用"};

  function esc(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
  function showOnly(id){["loadingScreen","authScreen","errorScreen","app"].forEach(x=>$(x)?.classList.toggle("hidden",x!==id));}
  function toast(message,error=false){const el=$("toast");el.textContent=message;el.className=`toast${error?" error":""}`;el.classList.remove("hidden");clearTimeout(toast.timer);toast.timer=setTimeout(()=>el.classList.add("hidden"),4200);}
  async function sha256Bytes(bytes){const d=await crypto.subtle.digest("SHA-256",bytes);return [...new Uint8Array(d)].map(b=>b.toString(16).padStart(2,"0")).join("");}
  async function waitForSupabase(){return new Promise((resolve,reject)=>{let n=0;const t=setInterval(()=>{n++;if(window.supabase?.createClient&&window.JSZip){clearInterval(t);resolve();}else if(n>120){clearInterval(t);reject(new Error("必要なライブラリを読み込めませんでした。"));}},60);});}
  async function publicConfig(){const r=await fetch(`${API_BASE}/api/public-config`,{cache:"no-store"});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d?.error||"公開接続設定を取得できませんでした。");return d;}

  async function boot(){
    try{
      const pub=await publicConfig();
      await waitForSupabase();
      state.supabase=window.supabase.createClient(pub.supabaseUrl,pub.supabasePublishableKey||pub.supabaseAnonKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storageKey:pub.sessionStorageKey||"dpro-control-center-auth-v1"}});
      const {data:{session},error}=await state.supabase.auth.getSession();if(error)throw error;
      state.session=session;if(!session){showOnly("authScreen");return;}
      const s=await state.supabase.from("cc_staff").select("id,display_name,role_key,status").eq("auth_user_id",session.user.id).maybeSingle();
      if(s.error)throw s.error;if(!s.data||s.data.status!=="active"){showOnly("authScreen");return;}
      state.staff=s.data;
      $("staffName").textContent=s.data.display_name||"DPROスタッフ";
      $("staffRole").textContent=roleLabels[s.data.role_key]||s.data.role_key||"DPROスタッフ";
      $("staffInitial").textContent=(s.data.display_name||"D").trim().slice(0,1).toUpperCase();
      const aal=await state.supabase.auth.mfa.getAuthenticatorAssuranceLevel().catch(()=>({data:null}));
      state.aal2=aal?.data?.currentLevel==="aal2";
      $("aalBadge").textContent=state.aal2?"AAL2 / 反映可":"AAL2確認必要";
      $("aalBadge").className=`pill ${state.aal2?"progress":"danger"}`;
      bind();
      await loadHistory();
      showOnly("app");
    }catch(e){console.error(BUILD,e);$("errorText").textContent=e?.message||"RETURN ZIP取込を読み込めませんでした。";showOnly("errorScreen");}
  }

  function firstDroppedFile(dt){
    if (!dt) return null;
    if (dt.files && dt.files.length) return dt.files[0];
    if (dt.items && dt.items.length) {
      for (const item of dt.items) {
        if (item.kind === "file") {
          const file = item.getAsFile?.();
          if (file) return file;
        }
      }
    }
    return null;
  }

  function hasFileDrag(dt){
    if (!dt) return false;
    if (dt.files && dt.files.length) return true;
    return Array.from(dt.types || []).includes("Files");
  }

  function bind(){
    $("retryButton")?.addEventListener("click",()=>location.reload());
    $("menuButton")?.addEventListener("click",()=>$("sidebar")?.classList.toggle("open"));
    $("returnFile")?.addEventListener("change",e=>{
      const f=e.target.files?.[0];
      if(f) readReturn(f);
    });

    const dz=$("dropZone");

    const preventWindowFileOpen=(e)=>{
      if(!hasFileDrag(e.dataTransfer)) return;
      e.preventDefault();
      if(e.dataTransfer) e.dataTransfer.dropEffect="copy";
    };
    window.addEventListener("dragover",preventWindowFileOpen,false);
    window.addEventListener("drop",preventWindowFileOpen,false);

    const activate=(e)=>{
      if(!hasFileDrag(e.dataTransfer)) return;
      e.preventDefault();
      e.stopPropagation();
      if(e.dataTransfer) e.dataTransfer.dropEffect="copy";
      dz?.classList.add("drag");
    };
    const deactivate=(e)=>{
      if(!hasFileDrag(e.dataTransfer)) return;
      e.preventDefault();
      e.stopPropagation();
      dz?.classList.remove("drag");
    };
    const dropped=(e)=>{
      e.preventDefault();
      e.stopPropagation();
      dz?.classList.remove("drag");
      const f=firstDroppedFile(e.dataTransfer);
      if(!f){
        setValidation("ファイルを取得できませんでした。Windowsのダウンロードフォルダ/エクスプローラーからZIPをドロップするか、枠をクリックして選択してください。",true);
        return;
      }
      readReturn(f);
    };

    ["dragenter","dragover"].forEach(ev=>dz?.addEventListener(ev,activate,true));
    dz?.addEventListener("dragleave",deactivate,true);
    dz?.addEventListener("drop",dropped,true);

    $("applyButton")?.addEventListener("click",applyReturn);
  }

  function setValidation(message,error=false){
    const el=$("validationState");
    el.textContent=message;
    el.className=`validation-state${error?" error":""}`;
    el.classList.remove("hidden");
  }

  async function readReturn(file){
    state.validated=false;state.payload=null;state.file=file;
    $("previewPanel").classList.add("hidden");$("resultPanel").classList.add("hidden");
    try{
      if(!/\.zip$/i.test(file.name))throw new Error("ZIPファイルを選択してください。");
      if(file.size>10*1024*1024)throw new Error("RETURN ZIPは10MB以下にしてください。");
      setValidation("ZIP内のMANIFEST・SHA256・RETURN JSONを確認しています…");
      const bytes=await file.arrayBuffer();
      state.zipSha=await sha256Bytes(bytes);
      const zip=await JSZip.loadAsync(bytes);
      const names=Object.keys(zip.files).filter(n=>!zip.files[n].dir);
      if(!names.length||names.length>100)throw new Error("ZIP内ファイル数を確認してください。");
      if(names.some(n=>n.includes("/")||n.includes("\\")))throw new Error("RETURN ZIPはZIP直下ファイルのみ対応です。");
      if(!names.includes("EVERGREEN_RETURN.json"))throw new Error("EVERGREEN_RETURN.json がありません。");
      if(!names.includes("MANIFEST_SHA256.txt"))throw new Error("MANIFEST_SHA256.txt がありません。");

      const manifestText=await zip.file("MANIFEST_SHA256.txt").async("text");
      const expected=new Map();
      for(const line of manifestText.split(/\r?\n/)){
        const m=line.trim().match(/^([0-9a-fA-F]{64})\s{2}(.+)$/);
        if(m)expected.set(m[2],m[1].toLowerCase());
      }
      const contentNames=names.filter(n=>n!=="MANIFEST_SHA256.txt");
      if(expected.size!==contentNames.length)throw new Error("MANIFESTのファイル数が一致しません。");
      for(const name of contentNames){
        if(!expected.has(name))throw new Error(`MANIFESTに ${name} がありません。`);
        const b=await zip.file(name).async("arraybuffer");
        const actual=await sha256Bytes(b);
        if(actual!==expected.get(name))throw new Error(`${name} のSHA256が一致しません。`);
      }

      const raw=await zip.file("EVERGREEN_RETURN.json").async("text");
      const payload=JSON.parse(raw);
      if(payload?.schema_version!=="DPRO-EVERGREEN-RETURN-R1")throw new Error("RETURN schema_versionが対応外です。");
      if(!payload?.source?.system_code||!payload?.source?.audit_id||!payload?.source?.current_standard_version)throw new Error("RETURN source情報が不足しています。");
      if(!Array.isArray(payload.feature_updates)||!Array.isArray(payload.audit_item_updates))throw new Error("RETURN更新配列を確認してください。");

      state.payload=payload;state.fileCount=names.length;state.validated=true;
      setValidation(`検証PASS｜${file.name}｜${names.length} files｜ZIP SHA256 ${state.zipSha.slice(0,16)}…`);
      renderPreview();
    }catch(e){
      console.error(e);setValidation(e?.message||"RETURN ZIPを検証できませんでした。",true);
    }
  }

  function renderPreview(){
    const p=state.payload,s=p.source||{},f=p.feature_updates||[],a=p.audit_item_updates||[],l=p.learning_candidates||[];
    $("previewTitle").textContent=`${s.product_name||s.system_code} / ${s.system_code}`;
    $("previewLead").textContent=`${p.package_version||"RETURN"} / ${s.current_standard_version} / audit ${String(s.audit_id).slice(0,8)}…`;
    const pass=a.filter(x=>String(x.result).toUpperCase()==="PASS").length;
    const review=a.filter(x=>String(x.result).toUpperCase()==="REVIEW").length;
    const fail=a.filter(x=>String(x.result).toUpperCase()==="FAIL").length;
    const metrics=[
      [s.system_code,"SYSTEM","返却対象"],
      [f.length,"Feature更新","適用判定"],
      [a.length,"監査更新",`PASS ${pass} / REVIEW ${review} / FAIL ${fail}`],
      [l.length,"学習候補","自動MASTER反映なし"],
      [p.final_lock_reopen_decision?.required?"要判断":"不要","FINAL LOCK","自動解除しない"]
    ];
    $("previewMetrics").innerHTML=metrics.map(([v,lbl,n])=>`<article><b>${esc(v)}</b><span>${esc(lbl)}</span><small>${esc(n)}</small></article>`).join("");
    $("featureList").innerHTML=f.length?`<p class="eyebrow">FEATURE UPDATES</p>`+f.map(x=>`<div class="return-list-row"><strong>${esc(x.feature_code)}</strong><span>${esc(x.implementation_status)}</span><span>${esc(x.evidence_note)}</span></div>`).join(""):"";
    $("auditList").innerHTML=a.length?`<p class="eyebrow">AUDIT ITEM UPDATES</p>`+a.map(x=>`<div class="return-list-row"><strong>${esc(x.item_code)}</strong><span>${esc(x.result)}</span><span>${esc(x.note||x.evidence_ref||"")}</span></div>`).join(""):"";
    const reopen=p.final_lock_reopen_decision?.required===true;
    $("finalLockNotice").className=`safe-notice${reopen?" warn":""}`;
    $("finalLockNotice").innerHTML=reopen
      ?`<strong>FINAL LOCKの人判断が必要</strong><span>${esc(p.final_lock_reopen_decision?.reason||"理由未記載")}。RETURN取込では解除せず、要求だけ記録します。</span>`
      :`<strong>FINAL LOCK保護</strong><span>今回のRETURNはFINAL LOCK再開不要です。管理センターは自動解除しません。</span>`;
    $("applyButton").disabled=!state.aal2;
    $("applyButton").textContent=state.aal2?"このRETURN ZIPを反映":"AAL2でログインしてください";
    $("previewPanel").classList.remove("hidden");
  }

  async function applyReturn(){
    if(!state.validated||!state.payload)return;
    if(!state.aal2){toast("RETURN反映にはAAL2が必要です。",true);return;}
    const btn=$("applyButton"),old=btn.textContent;btn.disabled=true;btn.textContent="DB側で再検証・反映中…";
    try{
      const {data,error}=await state.supabase.rpc("cc_evergreen_apply_return",{
        p_payload:state.payload,
        p_package_sha256:state.zipSha,
        p_file_count:state.fileCount
      });
      if(error)throw error;
      const d=data||{};
      $("resultTitle").textContent=d.already_applied?"このRETURN ZIPは反映済みです":"管理センターへ反映しました";
      const s=d.summary||{};
      const metrics=[
        [d.system_code||state.payload.source.system_code,"SYSTEM","反映対象"],
        [d.feature_updates_applied??"—","Feature","反映件数"],
        [d.audit_updates_applied??"—","Evidence","反映件数"],
        [s.pass_count??"—","PASS","現在"],
        [s.blocking_unknown_count??"—","Blocker UNKNOWN","残り"]
      ];
      $("resultMetrics").innerHTML=metrics.map(([v,l,n])=>`<article><b>${esc(v)}</b><span>${esc(l)}</span><small>${esc(n)}</small></article>`).join("");
      $("resultPanel").classList.remove("hidden");
      await loadHistory();
      toast(d.already_applied?"同じRETURN ZIPは重複反映していません。":"RETURN ZIPをEvergreenへ反映しました。");
    }catch(e){
      console.error(e);toast(e?.message||"RETURN ZIPを反映できませんでした。",true);
    }finally{btn.textContent=old;btn.disabled=!state.aal2;}
  }

  async function loadHistory(){
    const {data,error}=await state.supabase.from("cc_v_dpro_evergreen_return_history").select("*").order("applied_at",{ascending:false}).limit(8);
    if(error){$("historyList").innerHTML='<div class="empty-board">履歴を読み込めませんでした。</div>';return;}
    const rows=data||[];
    $("historyList").innerHTML=rows.length?rows.map(r=>`
      <div class="history-row">
        <strong>${esc(r.system_code)}</strong>
        <div><span>${esc(r.product_name||r.package_version)}</span><small>${esc(r.package_version)}</small></div>
        <div><span>PASS ${Number(r.pass_count||0)}</span><small>UNKNOWN ${Number(r.unknown_count||0)}</small></div>
        <div><span>${new Date(r.applied_at).toLocaleString("ja-JP")}</span><small>${esc(String(r.package_sha256||"").slice(0,12))}…</small></div>
      </div>`).join(""):'<div class="empty-board">RETURN履歴はまだありません。</div>';
  }

  window.addEventListener("DOMContentLoaded",boot,{once:true});
})();
