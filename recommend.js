(() => {
"use strict";
const CONFIG = window.DPRO_CONTROL_CENTER_CONFIG || {};
const $ = (id) => document.getElementById(id);
const $$ = (sel,scope=document) => Array.from(scope.querySelectorAll(sel));
const state = { supabase:null, session:null, staff:null, products:[], templates:[], mappings:[], profiles:[], features:[], currentCode:null };

const roleLabels={owner_admin:"管理責任者",technical_admin:"技術管理者",support:"DPROサポート",read_only:"閲覧専用"};
function esc(v){return String(v??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;")}
function show(id){["loading","auth","error","app"].forEach(x=>$(x)?.classList.toggle("hidden",x!==id))}
function toast(msg){$("toast").textContent=msg;$("toast").classList.remove("hidden");clearTimeout(toast.t);toast.t=setTimeout(()=>$("toast").classList.add("hidden"),3200)}
function canWrite(){return ["owner_admin","technical_admin","support"].includes(state.staff?.role_key)}
async function publicConfig(){const base=String(CONFIG.apiBaseUrl||"").replace(/\/$/,"");const r=await fetch(`${base}/api/public-config`,{cache:"no-store"});const d=await r.json();if(!r.ok)throw new Error(d.message||d.error||`HTTP ${r.status}`);return d}
async function products(){const base=String(CONFIG.apiBaseUrl||"").replace(/\/$/,"");const r=await fetch(`${base}/api/products/overview`,{cache:"no-store",headers:{authorization:`Bearer ${state.session?.access_token||""}`}});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.message||d.error||"製品台帳を取得できません");return Array.isArray(d.products)?d.products:[]}
function templateByCode(code){return state.templates.find(x=>x.template_code===code)||null}
function mappingByCode(code){return state.mappings.find(x=>x.system_code===code)||null}
function profileByCode(code){return state.profiles.find(x=>x.system_code===code)||null}
function guess(p){
 const m=mappingByCode(p.system_code); if(m) return m.template_code;
 const h=`${p.system_code||""} ${p.product_name||""}`.toUpperCase();
 if(/TAX|GYOSEI|CONSULT|SHAROUSHI|LEGAL|LAWYER|ACCOUNT|税理|会計|行政書士|社労|司法|弁護士/.test(h))return"PROFESSIONAL_DOC";
 if(/DAYCARE|CARETAXI|HAISHOKU|NURSING|HOMECARE|WELFARE|介護|福祉|配食|訪問看護/.test(h))return"WELFARE_FAMILY";
 if(/REPAIR|CLEANING|DISPOSAL|HOUSEKEEP|REFORM|ESTATE|CAR|GREEN|FUNERAL|修理|クリーニング|不用品|家事|リフォーム|不動産|中古車|葬儀|レンタル/.test(h))return"CASE_PROGRESS";
 if(/BAKERY|CAKE|COSMETIC|TAKEOUT|ベーカリー|ケーキ|洋菓子|化粧品|テイクアウト/.test(h))return"PRODUCT_SALES";
 if(/PET_SALON|VET|EYE_SALON|NAIL|YOGA|GYM|SALON|HAIR|ESTHE|SEITAI|DENTAL|STAY|PHOTO|SCHOOL|IZAKAYA|YAKINIKU|美容|サロン|整体|整骨|歯科|宿泊|写真館|スクール|居酒屋|焼肉|予約/.test(h))return"RESERVATION_RECEPTION";
 return null;
}
async function boot(){
 try{
  const cfg=await publicConfig();
  state.supabase=window.supabase.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey||cfg.supabaseAnonKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:false,storageKey:cfg.sessionStorageKey||"dpro-control-center-auth-v1"}});
  const s=await state.supabase.auth.getSession(); if(s.error)throw s.error; state.session=s.data.session;
  if(!state.session?.user){show("auth");return}
  const sr=await state.supabase.from("cc_staff").select("id,display_name,role_key,status").eq("auth_user_id",state.session.user.id).maybeSingle();if(sr.error)throw sr.error;
  if(!sr.data||sr.data.status!=="active"){show("auth");return} state.staff=sr.data;
  $("staffName").textContent=state.staff.display_name||"DPROスタッフ";$("staffRole").textContent=roleLabels[state.staff.role_key]||state.staff.role_key;$("staffInitial").textContent=(state.staff.display_name||"D").charAt(0);
  await load();show("app");
 }catch(e){$("errorText").textContent=e.message||"CENTER-6の接続を確認してください";show("error")}
}
async function load(){
 const pp=products();
 const [t,m,p,f]=await Promise.all([
  state.supabase.from("cc_v_feature_template_profiles").select("*").order("sort_order"),
  state.supabase.from("cc_v_product_template_recommendations").select("*").order("system_code"),
  state.supabase.from("cc_v_system_feature_profile_summary").select("*").order("system_code"),
  state.supabase.from("cc_feature_catalog").select("feature_code,feature_name,description,sort_order").eq("is_active",true).order("sort_order")
 ]);
 for(const x of [t,m,p,f])if(x.error)throw x.error;
 state.templates=t.data||[];state.mappings=m.data||[];state.profiles=p.data||[];state.features=(f.data||[]).filter(x=>!["line","website"].includes(x.feature_code));state.products=await pp;
 render();
}
function render(){
 const configured=state.products.filter(p=>profileByCode(p.system_code)).length;
 const guessed=state.products.filter(p=>guess(p)).length;
 const unclassified=state.products.length-guessed;
 $("metrics").innerHTML=[
  [state.products.length,"DPRO製品","製品台帳"],
  [configured,"製品標準 確定済み","正式標準が最優先"],
  [guessed,"推奨タイプ判定済み","初回契約の土台"],
  [unclassified,"推奨未判定","共通基本のみ"]
 ].map(x=>`<article><b>${x[0]}</b><span>${x[1]}</span><small>${x[2]}</small></article>`).join("");
 $("templateGrid").innerHTML=state.templates.map(t=>`<article class="template-card"><b>${esc(t.template_name)}</b><p>${esc(t.description||"")}</p><footer>推奨ON ${t.enabled_count}/${t.feature_count}</footer></article>`).join("");
 $("templateFilter").innerHTML='<option value="all">すべての業務タイプ</option>'+state.templates.map(t=>`<option value="${esc(t.template_code)}">${esc(t.template_name)}</option>`).join("");
 renderProducts();
}
function filtered(){
 const q=$("search").value.trim().toLowerCase(), tf=$("templateFilter").value, sf=$("standardFilter").value;
 return [...state.products].sort((a,b)=>Number(a.product_number||999)-Number(b.product_number||999)).filter(p=>{
  const profile=profileByCode(p.system_code), code=guess(p);
  if(tf!=="all"&&code!==tf)return false;
  if(sf==="configured"&&!profile)return false;if(sf==="unconfigured"&&profile)return false;
  const hay=`${p.product_number||""} ${p.product_name||""} ${p.system_code||""} ${p.category||""}`.toLowerCase();
  return !q||hay.includes(q);
 });
}
function renderProducts(){
 const rows=filtered();$("resultCount").textContent=`${rows.length}件`;
 $("productGrid").innerHTML=rows.map(p=>{
  const profile=profileByCode(p.system_code), code=guess(p), t=templateByCode(code), map=mappingByCode(p.system_code);
  return `<article class="product-card ${profile?"configured":""}">
   <div class="product-head"><div><span class="code">${esc(String(p.product_number||"").padStart(2,"0"))}｜${esc(p.system_code)}</span><h3>${esc(p.product_name)}</h3><span class="category">${esc(p.category||"カテゴリ未設定")}</span></div>${profile?'<span class="badge green">製品標準あり</span>':'<span class="badge">初回確認</span>'}</div>
   <div class="recommend"><strong>${t?esc(t.template_name):"推奨未判定"}</strong><span>${t?`推奨ON ${t.enabled_count}/${t.feature_count}${map?.recommendation_source==="manual"?"・手動設定":""}`:"共通基本だけで開始し、初回契約時に確認"}</span></div>
   <button class="btn ${code?"secondary":"primary"} full" data-open="${esc(p.system_code)}">${code?"推奨内容を確認":"推奨タイプを設定"}</button>
  </article>`;
 }).join("");
 $$("[data-open]").forEach(b=>b.onclick=()=>openModal(b.dataset.open));
}
function openModal(code){
 const p=state.products.find(x=>x.system_code===code);if(!p)return;state.currentCode=code;
 const profile=profileByCode(code), current=guess(p);
 $("modalTitle").textContent=`${String(p.product_number||"").padStart(2,"0")}｜${p.product_name}`;$("modalSub").textContent=`${p.system_code}・${p.category||"カテゴリ未設定"}`;
 $("modalStandard").innerHTML=profile?'<span class="badge green">製品標準 確定済み</span>':'<span class="badge">製品標準 未設定・初回確認対象</span>';
 $("modalTemplate").innerHTML='<option value="">推奨タイプを選択</option>'+state.templates.map(t=>`<option value="${esc(t.template_code)}">${esc(t.template_name)}</option>`).join("");
 $("modalTemplate").value=current||"";$("modalNote").value=mappingByCode(code)?.note||"";$("modalMessage").textContent="";
 preview();
 $("modal").classList.remove("hidden");$("modal").setAttribute("aria-hidden","false");
}
function preview(){
 const t=templateByCode($("modalTemplate").value), settings=t?.settings_json||{};
 $("modalFeatures").innerHTML=state.features.map(f=>`<article class="feature"><label><input type="checkbox" disabled ${settings[f.feature_code]?"checked":""}><span>${esc(f.feature_name||f.feature_code)}</span></label><small>${esc(f.description||"")}</small></article>`).join("");
}
function closeModal(){$("modal").classList.add("hidden");$("modal").setAttribute("aria-hidden","true");state.currentCode=null}
async function save(){
 if(!canWrite())return toast("編集権限がありません");
 const code=state.currentCode,t=$("modalTemplate").value;if(!code||!t){$("modalMessage").textContent="推奨タイプを選択してください。";return}
 const b=$("saveRecommendation");b.disabled=true;b.textContent="保存中…";
 try{
  const r=await state.supabase.rpc("cc_center6_set_product_template_recommendation",{p_system_code:code,p_template_code:t,p_note:$("modalNote").value.trim()||null});if(r.error)throw r.error;
  await load();closeModal();toast("初回契約用の推奨タイプを保存しました。製品標準はまだ確定していません。");
 }catch(e){$("modalMessage").textContent=e.message||"保存できませんでした"}finally{b.disabled=false;b.textContent="この推奨タイプを保存"}
}
$("search").addEventListener("input",renderProducts);$("templateFilter").addEventListener("change",renderProducts);$("standardFilter").addEventListener("change",renderProducts);$("modalTemplate").addEventListener("change",preview);$("closeModal").addEventListener("click",closeModal);$("modal").addEventListener("click",e=>{if(e.target===$("modal"))closeModal()});document.addEventListener("keydown",e=>{if(e.key==="Escape")closeModal()});$("saveRecommendation").addEventListener("click",save);$("refresh").addEventListener("click",async()=>{await load();toast("最新情報に更新しました。")});$("retry").addEventListener("click",boot);
boot();
})();
