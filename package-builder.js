(() => {
  "use strict";
  const CONFIG=window.DPRO_CONTROL_CENTER_CONFIG||{};
  const $=id=>document.getElementById(id);
  const state={supabase:null,session:null,staff:null,projects:[],spec:null,preview:null};
  const esc=v=>String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
  const show=(id,yes=true)=>$(id)?.classList.toggle("hidden",!yes);
  const message=(text="",error=false)=>{const e=$("message");e.textContent=text;e.classList.toggle("error",error);e.classList.toggle("success",!!text&&!error);};
  const item=(k,v)=>`<div class="detail-item"><small>${esc(k)}</small><strong>${esc(v??"—")}</strong></div>`;
  const hex=buf=>Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,"0")).join("");

  async function publicConfig(){
    const base=String(CONFIG.apiBaseUrl||"").replace(/\/$/,"");
    const r=await fetch(`${base}/api/public-config`,{cache:"no-store"});
    const d=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(d.message||d.error||`HTTP ${r.status}`);
    return d;
  }

  async function init(){
    const pub=await publicConfig();
    if(!window.supabase?.createClient)throw new Error("Supabaseライブラリを読み込めませんでした。");
    if(!window.JSZip)throw new Error("ZIPライブラリを読み込めませんでした。");
    state.supabase=window.supabase.createClient(pub.supabaseUrl,pub.supabasePublishableKey||pub.supabaseAnonKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storageKey:pub.sessionStorageKey||"dpro-control-center-auth-v1"}});
    const {data:sess,error:se}=await state.supabase.auth.getSession(); if(se)throw se;
    state.session=sess.session;
    if(!state.session?.user)return auth("CONTROL CENTERへログインしてください。");
    const {data:aal,error:ae}=await state.supabase.auth.mfa.getAuthenticatorAssuranceLevel(); if(ae)throw ae;
    if(aal?.currentLevel!=="aal2")return auth("二段階認証が必要です。CONTROL CENTERへ戻って認証を完了してください。");
    const {data:staff,error:ste}=await state.supabase.from("cc_staff").select("id,display_name,role_key,status").eq("auth_user_id",state.session.user.id).maybeSingle(); if(ste)throw ste;
    if(!staff||staff.status!=="active"||!["owner_admin","technical_admin"].includes(staff.role_key))return auth("Package Builderには管理責任者または技術管理者権限が必要です。");
    state.staff=staff;
    await load();
    show("loadingPanel",false);show("appPanel",true);
  }

  function auth(text){show("loadingPanel",false);show("authPanel",true);$("authText").textContent=text;}

  async function load(){
    const [p,s]=await Promise.all([
      state.supabase.from("cc_v_delivery_project_overview_v2").select("*").eq("product_system_code","GYM").order("updated_at",{ascending:false}),
      state.supabase.from("cc_v_deployment_package_specs").select("*").eq("system_code","GYM").eq("status","candidate_ready").maybeSingle()
    ]);
    if(p.error)throw p.error;if(s.error)throw s.error;
    state.projects=p.data||[];state.spec=s.data;
    if(!state.spec)throw new Error("GYM Package Specがありません。");
    $("shortHash").textContent=`${state.spec.source_sha256.slice(0,12)}…${state.spec.source_sha256.slice(-8)}`;
    const sourceOnly=`<option value="__SOURCE_ONLY__">Adapter QA（顧客案件なし / source-only）</option>`;
    const projects=state.projects.map(x=>`<option value="${esc(x.id)}">${esc(x.client_name)}｜${esc(x.project_code)}</option>`).join("");
    $("projectSelect").innerHTML=state.projects.length?projects+sourceOnly:sourceOnly;
    renderProject();renderSpec();
  }

  function isSourceOnly(){return $("projectSelect").value==="__SOURCE_ONLY__";}
  function selected(){return state.projects.find(x=>x.id===$("projectSelect").value)||null;}
  function rpcArgs(dryRun){
    return isSourceOnly()
      ? {p_system_code:"GYM",p_dry_run:dryRun}
      : {p_project_id:selected()?.id,p_dry_run:dryRun};
  }
  function renderProject(){
    const p=selected();
    state.preview=null;$("buildButton").disabled=true;$("result").innerHTML="";message("");
    if(isSourceOnly()){
      $("projectDetail").innerHTML=[
        ["対象","Adapter QA"],["顧客","なし"],["案件コード","ADAPTER-QA-SOURCE-ONLY"],["build scope","source_only"],
        ["system_code","GYM"],["本番Deploy","禁止"],["用途","原本・Cloudflare設定の事前検証"],["顧客データ作成","なし"]
      ].map(x=>item(...x)).join("");
      return;
    }
    $("projectDetail").innerHTML=p?[
      ["顧客",p.client_name],["案件",p.project_name],["案件コード",p.project_code],["状態",p.status],
      ["system_code",p.product_system_code],["STANDARD",p.standard_version||"—"],["更新",p.updated_at],["Project ID",p.id]
    ].map(x=>item(...x)).join(""):"<p>対象を選択してください。</p>";
  }
  function renderSpec(){
    const s=state.spec;
    $("specDetail").innerHTML=[
      ["Package",s.package_version],["Worker",s.target_worker_name],["Repository",s.source_repository],["Source commit",s.source_commit_sha],
      ["Source path",s.source_path],["Git blob",s.source_blob_sha],["SHA256",s.source_sha256],["Policy",`${s.execution_policy} / production=${s.allows_production_deploy}`],
      ["必須Secret名",(s.required_secret_names||[]).join(", ")],["任意変数名",(s.optional_var_names||[]).join(", ")],["Compatibility",s.compatibility_policy]
    ].map(x=>item(...x)).join("");
  }

  async function preview(){
    const p=selected();if(!isSourceOnly()&&!p)return message("GYM案件またはAdapter QAを選択してください。",true);
    $("previewButton").disabled=true;message("DRY RUN確認中…");
    try{
      const {data,error}=await state.supabase.rpc("cc_prepare_package_build",rpcArgs(true));if(error)throw error;
      state.preview=data;
      $("result").innerHTML=[
        ["結果",data.ok?"PASS":"FAIL"],["Build scope",data.buildScope||"project"],["Package",data.packageName],["Fingerprint",data.packageFingerprint],
        ["Source SHA256",data.sourceSha256],["Worker",data.workerName],["実行ポリシー",data.executionPolicy],
        ["本番Deploy",data.productionDeployAllowed?"許可":"禁止"],["次工程",data.next]
      ].map(x=>item(...x)).join("");
      $("buildButton").disabled=!data.ok;
      message(data.ok?"DRY RUN PASS。原本を再検証して安全候補ZIPを生成できます。":"DRY RUN FAIL。",!data.ok);
    }catch(e){state.preview=null;$("buildButton").disabled=true;message(e.message||String(e),true);}
    finally{$("previewButton").disabled=false;}
  }

  async function sha256Text(text){return hex(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(text)));}

  function preflightCmd(d){
    const required=(d.requiredSecretNames||[]).join(",");
    return `@echo off
setlocal EnableExtensions
chcp 65001 >nul
title DPRO GYM Cloudflare PRECHECK ONLY

set "WORKER=${d.workerName}"
set "EXPECTED_SHA=${d.sourceSha256}"
set "REQUIRED_SECRETS=${required}"
set "HEALTH_URL=https://dpro-gym-line-api.dpromstk2000.workers.dev/api/health"

echo ============================================================
echo DPRO GYM PACKAGE CANDIDATE - CLOUDFLARE PREFLIGHT ONLY
echo This script DOES NOT deploy or upload a Worker version.
echo ============================================================

where node >nul 2>nul || (echo [FAIL] Node.js not found.& exit /b 10)
where npm >nul 2>nul || (echo [FAIL] npm not found.& exit /b 11)

powershell -NoProfile -ExecutionPolicy Bypass -Command "$h=(Get-FileHash -Algorithm SHA256 'worker.js').Hash.ToLower(); if($h -ne '${d.sourceSha256}'){Write-Host '[FAIL] worker.js SHA256 mismatch'; exit 12}else{Write-Host '[PASS] worker.js SHA256'}"
if errorlevel 1 exit /b %errorlevel%

echo [CHECK] Wrangler authentication
call npx --yes wrangler@latest whoami
if errorlevel 1 (echo [FAIL] Wrangler authentication.& exit /b 20)

echo [CHECK] Required secret names
call npx --yes wrangler@latest secret list --name "%WORKER%" --format json > CLOUDFLARE_SECRET_NAMES.json
if errorlevel 1 (echo [FAIL] Could not list secret names.& exit /b 21)

powershell -NoProfile -ExecutionPolicy Bypass -Command "$r='${required}'.Split(','); $j=Get-Content 'CLOUDFLARE_SECRET_NAMES.json' -Raw|ConvertFrom-Json; $names=@($j|ForEach-Object { if($_.name){$_.name}elseif($_.key){$_.key}else{$_} }); $m=@($r|Where-Object {$_ -and ($_ -notin $names)}); if($m.Count){Write-Host ('[FAIL] Missing secret names: '+($m -join ', ')); exit 22}else{Write-Host '[PASS] Required secret names are present'}"
if errorlevel 1 exit /b %errorlevel%

echo [CHECK] Current production deployment
call npx --yes wrangler@latest deployments status --name "%WORKER%" --json > CLOUDFLARE_DEPLOYMENT_STATUS.json
if errorlevel 1 (echo [FAIL] Could not read deployment status.& exit /b 23)

echo [CHECK] Recent Worker versions
call npx --yes wrangler@latest versions list --name "%WORKER%" --json > CLOUDFLARE_VERSIONS.json
if errorlevel 1 (echo [FAIL] Could not read versions.& exit /b 24)

echo [CHECK] Public health
powershell -NoProfile -ExecutionPolicy Bypass -Command "try{$r=Invoke-RestMethod -Uri '%HEALTH_URL%' -TimeoutSec 15; $r|ConvertTo-Json -Depth 8|Set-Content -Encoding utf8 'PUBLIC_HEALTH.json'; if($r.ok){Write-Host '[PASS] Public health ok'}else{Write-Host '[WARN] Public health returned ok=false'}}catch{Write-Host ('[WARN] Public health check failed: '+$_.Exception.Message)}"

echo.
echo [PASS] PREFLIGHT COLLECTION COMPLETE
echo No deploy or version upload was executed.
echo Keep these output files for the next CONTROL CENTER verification:
echo   CLOUDFLARE_SECRET_NAMES.json
echo   CLOUDFLARE_DEPLOYMENT_STATUS.json
echo   CLOUDFLARE_VERSIONS.json
echo   PUBLIC_HEALTH.json
echo.
pause
exit /b 0
`;
  }

  function wranglerTemplate(d){
    return JSON.stringify({
      name:d.workerName,
      main:"worker.js",
      compatibility_date:"__COPY_FROM_CURRENT_DEPLOYED_VERSION__",
      keep_vars:true,
      secrets:{required:d.requiredSecretNames||[]}
    },null,2)+"\n";
  }

  async function build(){
    const p=selected();if((!isSourceOnly()&&!p)||!state.preview?.ok)return message("先にDRY RUNをPASSさせてください。",true);
    $("buildButton").disabled=true;message("GitHub原本取得・SHA256照合中…");
    try{
      const d=state.preview;
      const r=await fetch(d.sourceRawUrl,{cache:"no-store"});
      if(!r.ok)throw new Error(`GitHub原本取得失敗 HTTP ${r.status}`);
      const worker=await r.text();
      const actual=await sha256Text(worker);
      if(actual!==d.sourceSha256)throw new Error(`SHA256不一致。生成を停止しました。 expected=${d.sourceSha256} actual=${actual}`);

      const {data:logged,error}=await state.supabase.rpc("cc_prepare_package_build",rpcArgs(false));if(error)throw error;
      const manifest={
        packageType:"DPRO_GUARDED_WORKER_CANDIDATE",
        packageVersion:logged.packageVersion,
        buildCode:logged.buildCode,
        buildScope:logged.buildScope||"project",
        projectCode:logged.projectCode,
        systemCode:logged.systemCode,
        workerName:logged.workerName,
        source:{repository:logged.repository,branch:logged.sourceBranch,commit:logged.sourceCommitSha,path:logged.sourcePath,blobSha:logged.sourceBlobSha,sha256:logged.sourceSha256},
        requiredSecretNames:logged.requiredSecretNames,
        optionalVarNames:logged.optionalVarNames,
        compatibilityPolicy:logged.compatibilityPolicy,
        executionPolicy:logged.executionPolicy,
        productionDeployAllowed:false,
        safety:["No secret values in package","No wrangler deploy command","No wrangler versions upload command","Current runtime compatibility settings must be captured before any upload"]
      };
      const start=`DPRO GYM PACKAGE BUILDER R1
Build: ${logged.buildCode}
Build scope: ${logged.buildScope||"project"}
Project: ${logged.projectCode}
Worker: ${logged.workerName}

This package is BUILD/PREFLIGHT ONLY.
If Build scope is source_only, no customer/delivery project was created or modified.
It does NOT contain Cloudflare secret values.
It does NOT deploy or upload a Worker version.

1. Keep all files together.
2. Run 01_CLOUDFLARE_PREFLIGHT_ONLY.cmd on a Windows PC already authorized for the DPRO Cloudflare account.
3. The CMD only collects safe current-state evidence and checks required secret NAMES.
4. Do not use wrangler.jsonc.template for deployment yet.
`;
      const zip=new JSZip();
      zip.file("00_START_HERE.txt",start);
      zip.file("worker.js",worker);
      zip.file("PACKAGE_MANIFEST.json",JSON.stringify(manifest,null,2)+"\n");
      zip.file("SHA256SUMS.txt",`${logged.sourceSha256}  worker.js\n`);
      zip.file("01_CLOUDFLARE_PREFLIGHT_ONLY.cmd",preflightCmd(logged));
      zip.file("wrangler.jsonc.template",wranglerTemplate(logged));
      const blob=await zip.generateAsync({type:"blob",compression:"DEFLATE"});
      const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=logged.packageName;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1500);
      message(`生成PASS：${logged.packageName} / ${logged.buildCode}。本番Deployは行っていません。`);
      state.preview=null;
    }catch(e){message(e.message||String(e),true);}
    finally{$("buildButton").disabled=!state.preview?.ok;}
  }

  $("projectSelect").addEventListener("change",renderProject);
  $("previewButton").addEventListener("click",preview);
  $("buildButton").addEventListener("click",build);
  window.addEventListener("load",()=>init().catch(e=>{$("loadingText").textContent=`接続に失敗しました：${e.message||e}`;}));
})();