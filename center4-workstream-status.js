/* DPRO CONTROL CENTER / CONTROL-CENTER-4 R2
 * Product Ready formal lock + Tutorial reference status
 * 2026-08-27
 */
(() => {
  "use strict";
  const BUILD = "CONTROL-CENTER-4-R2-WORKSTREAM-STATUS-20260827";
  const CONFIG = window.DPRO_CONTROL_CENTER_CONFIG || {};
  const $ = (id) => document.getElementById(id);
  let sb = null;

  const esc = (value) => String(value ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#039;");

  function installStyle() {
    if ($("cc4-r2-workstream-style")) return;
    const style = document.createElement("style");
    style.id = "cc4-r2-workstream-style";
    style.textContent = `
      #productWorkstreamPanel{margin:16px 0;padding:16px;border:1px solid #d7e2dc;border-radius:16px;background:#fff}
      #productWorkstreamPanel .cc4r2-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:12px}
      #productWorkstreamPanel .cc4r2-head h2{margin:0;font-size:18px}#productWorkstreamPanel .cc4r2-head p{margin:4px 0 0;color:#63736d;font-size:12px;line-height:1.6}
      #productWorkstreamPanel .cc4r2-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:12px 0}
      #productWorkstreamPanel .cc4r2-metric{padding:10px;border-radius:12px;background:#f5f8f7}#productWorkstreamPanel .cc4r2-metric b{display:block;font-size:20px}#productWorkstreamPanel .cc4r2-metric span{font-size:11px;color:#61716b}
      #productWorkstreamPanel .cc4r2-table{overflow:auto;max-height:420px;border:1px solid #e2e9e5;border-radius:12px}
      #productWorkstreamPanel table{width:100%;border-collapse:collapse;min-width:780px}#productWorkstreamPanel th,#productWorkstreamPanel td{padding:9px 10px;border-bottom:1px solid #edf1ef;text-align:left;font-size:11px;vertical-align:top}
      #productWorkstreamPanel th{position:sticky;top:0;background:#f7faf8;z-index:1}#productWorkstreamPanel .cc4r2-pill{display:inline-flex;padding:3px 7px;border-radius:999px;background:#e6f6ee;color:#086b4d;font-weight:800;font-size:10px}
      #productWorkstreamPanel .cc4r2-pill.warn{background:#fff3d9;color:#8a5a00}#productWorkstreamPanel .cc4r2-muted{color:#718079}
      @media(max-width:760px){#productWorkstreamPanel .cc4r2-head{display:block}#productWorkstreamPanel .cc4r2-metrics{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function fixLegacyCopy() {
    const view = $("view-products");
    if (!view) return;
    view.querySelectorAll("p").forEach((p) => {
      if (p.textContent.includes("49製品を一斉改修せず")) {
        p.textContent = p.textContent.replace("49製品を一斉改修せず", "51製品を一斉改修せず");
      }
    });
  }

  function ensurePanel() {
    let panel = $("productWorkstreamPanel");
    if (panel) return panel;
    const metric = $("productMetricGrid");
    if (!metric) return null;
    panel = document.createElement("section");
    panel.id = "productWorkstreamPanel";
    panel.innerHTML = `<div class="cc4r2-head"><div><h2>51製品 正式基準・TUTORIAL参照状態</h2><p>Product Readyは正式FINAL LOCKを優先し、過去監査証拠は履歴として保持します。TUTORIAL制作は別トラックで、ここでは参照状態だけを持ちます。</p></div><span class="cc4r2-pill">${BUILD}</span></div><div id="productWorkstreamBody" class="cc4r2-muted">状態を読み込んでいます…</div>`;
    metric.insertAdjacentElement("afterend", panel);
    return panel;
  }

  async function getClient() {
    if (sb) return sb;
    const base = String(CONFIG.apiBaseUrl || "").replace(/\/$/, "");
    if (!base || !window.supabase?.createClient) return null;
    const res = await fetch(`${base}/api/public-config`, { cache: "no-store" });
    const pub = await res.json().catch(() => ({}));
    if (!res.ok || !pub.supabaseUrl) return null;
    sb = window.supabase.createClient(pub.supabaseUrl, pub.supabasePublishableKey || pub.supabaseAnonKey, {
      auth: { persistSession:true, autoRefreshToken:true, detectSessionInUrl:false, storageKey:pub.sessionStorageKey || "dpro-control-center-auth-v1" }
    });
    return sb;
  }

  function tutorialLabel(status) {
    return ({NOT_SYNCED:"未同期（別トラック）",NOT_STARTED:"未着手",IN_PROGRESS:"進行中",HOLD:"HOLD",COMPLETE:"COMPLETE"})[status] || status || "—";
  }

  function render(rows) {
    const body = $("productWorkstreamBody");
    if (!body) return;
    const locked = rows.filter((x) => x.product_ready_locked && x.product_ready_status === "FINAL_COMPLETE").length;
    const synced = rows.filter((x) => x.tutorial_status && x.tutorial_status !== "NOT_SYNCED").length;
    const drift = rows.filter((x) => x.product_ready_audit_drift).length;
    body.innerHTML = `
      <div class="cc4r2-metrics">
        <div class="cc4r2-metric"><b>${locked}/51</b><span>Product Ready FINAL LOCK</span></div>
        <div class="cc4r2-metric"><b>${synced}/51</b><span>TUTORIAL進捗同期済み</span></div>
        <div class="cc4r2-metric"><b>${drift}</b><span>旧監査証拠との差分（履歴保持）</span></div>
      </div>
      <div class="cc4r2-table"><table><thead><tr><th>No.</th><th>製品</th><th>Product Ready正式状態</th><th>最新監査証拠</th><th>TUTORIAL参照</th><th>基準</th></tr></thead><tbody>
        ${rows.map((x) => `<tr><td>${esc(x.product_number)}</td><td><strong>${esc(x.product_name)}</strong><br><span class="cc4r2-muted">${esc(x.system_code)}</span></td><td><span class="cc4r2-pill">${esc(x.product_ready_status)}</span>${x.product_ready_locked?"<br><span class=\"cc4r2-muted\">LOCKED</span>":""}</td><td><span class="cc4r2-pill ${x.product_ready_audit_drift?"warn":""}">${esc(x.latest_audit_ready_status || "NO AUDIT")}</span>${x.product_ready_audit_drift?"<br><span class=\"cc4r2-muted\">正式LOCKを優先</span>":""}</td><td>${esc(tutorialLabel(x.tutorial_status))}${x.tutorial_stage?`<br><span class="cc4r2-muted">${esc(x.tutorial_stage)}</span>`:""}</td><td class="cc4r2-muted">${esc(x.product_ready_source)}<br>${esc(x.tutorial_source)}</td></tr>`).join("")}
      </tbody></table></div>`;
  }

  async function load() {
    installStyle(); fixLegacyCopy(); ensurePanel();
    const client = await getClient();
    if (!client) return;
    const { data: sessionData } = await client.auth.getSession();
    if (!sessionData?.session?.user) return;
    const { data, error } = await client.from("cc_v_product_master_status").select("*").order("product_number");
    const body = $("productWorkstreamBody");
    if (error) { if (body) body.textContent = `参照状態を取得できませんでした：${error.message}`; return; }
    render(data || []);
  }

  document.addEventListener("DOMContentLoaded", () => setTimeout(load, 100));
  if (document.readyState !== "loading") setTimeout(load, 100);
  $("refreshProducts")?.addEventListener("click", () => setTimeout(load, 500));
})();
