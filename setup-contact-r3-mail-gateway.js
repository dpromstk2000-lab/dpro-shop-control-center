(() => {
  "use strict";

  const BUILD = "DPRO-CONTACT-MAIL-GATEWAY-R3-A-UI-20260824";
  const CONFIG = window.DPRO_CONTACT_MAIL_GATEWAY_R3_CONFIG || {};
  const $ = (id) => document.getElementById(id);

  const esc = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  function installStyle() {
    if ($("dpro-contact-r3-mail-gateway-style")) return;
    const style = document.createElement("style");
    style.id = "dpro-contact-r3-mail-gateway-style";
    style.textContent = `
      .contact-r3-mail{margin-top:14px;padding:18px;border:1px solid #c5b7e8;border-radius:16px;background:linear-gradient(145deg,#fdfcff,#f6f2ff)}
      .contact-r3-mail-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px}.contact-r3-mail-head h3{margin:0;font-size:18px}.contact-r3-mail-head p{margin:5px 0 0;color:var(--muted);font-size:9px;line-height:1.65}
      .contact-r3-mail-badge{display:inline-flex;align-items:center;min-height:28px;padding:5px 10px;border-radius:999px;background:#eee9f8;color:#66558b;font-size:9px;font-weight:900;white-space:nowrap}.contact-r3-mail-badge.green{background:#def5ea;color:#087253}.contact-r3-mail-badge.amber{background:#fff4d8;color:#815808}
      .contact-r3-mail-lock{margin-top:12px;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.contact-r3-mail-kpi{padding:10px;border:1px solid #ddd3ef;border-radius:10px;background:#fff}.contact-r3-mail-kpi span{display:block;color:var(--muted);font-size:8px;font-weight:800}.contact-r3-mail-kpi strong{display:block;margin-top:4px;font-size:10px;overflow-wrap:anywhere}
      .contact-r3-mail-grid{margin-top:12px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.contact-r3-mail-box{padding:12px;border:1px solid #e1d9ef;border-radius:12px;background:#fff;min-width:0}.contact-r3-mail-box.full{grid-column:1/-1}.contact-r3-mail-box h4{margin:0 0 9px;font-size:10px}.contact-r3-mail-kv{display:grid;grid-template-columns:150px minmax(0,1fr);gap:5px 10px;font-size:9px;line-height:1.55}.contact-r3-mail-kv span{color:var(--muted);font-weight:800}.contact-r3-mail-kv strong{overflow-wrap:anywhere}
      .contact-r3-mail-flow{margin:0;padding-left:18px;color:#4f5660;font-size:9px;line-height:1.8}.contact-r3-mail-note{margin-top:10px;padding:10px 12px;border-radius:10px;background:#fff7e5;color:#805b10;font-size:9px;font-weight:850;line-height:1.65}.contact-r3-mail-safe{margin-top:10px;padding:10px 12px;border-radius:10px;background:#eaf8f2;color:#087253;font-size:9px;font-weight:850;line-height:1.65}
      @media(max-width:760px){.contact-r3-mail-lock{grid-template-columns:repeat(2,1fr)}.contact-r3-mail-grid{grid-template-columns:1fr}.contact-r3-mail-box.full{grid-column:auto}.contact-r3-mail-head{display:block}.contact-r3-mail-badge{margin-top:8px}.contact-r3-mail-kv{grid-template-columns:1fr}}
      @media(max-width:460px){.contact-r3-mail-lock{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function stateInfo() {
    const runtimeReady = [
      CONFIG.workerUrl,
      CONFIG.mailDomain,
      CONFIG.routesKvNamespaceId,
      CONFIG.signingPublicJwk,
    ].every(Boolean) && ["RUNTIME_READY", "PRODUCTION_READY"].includes(String(CONFIG.status || ""));
    const productionReady = runtimeReady &&
      CONFIG.status === "PRODUCTION_READY" &&
      CONFIG.mailDnsVerified === true &&
      CONFIG.resendDomainVerified === true &&
      CONFIG.cloudflareEmailRoutingVerified === true;
    return { runtimeReady, productionReady };
  }

  function render(projectId) {
    const s = stateInfo();
    const badge = s.productionReady
      ? ["R3 CENTRAL READY", "green"]
      : s.runtimeReady
        ? ["RUNTIME READY / MAIL確認待ち", "amber"]
        : ["R3-A STAGED", "amber"];

    return `
      <section id="contactMailGatewayR3" class="contact-r3-mail" data-project-id="${esc(projectId)}">
        <div class="contact-r3-mail-head">
          <div>
            <h3>DPRO CONTACT R3｜共通MAIL GATEWAY</h3>
            <p>契約店舗ごとにResendやEmail Routingを増やさず、DPRO共通のメール送受信基盤を1個だけ持つための中央ゲートウェイです。</p>
          </div>
          <span class="contact-r3-mail-badge ${badge[1]}">${esc(badge[0])}</span>
        </div>

        <div class="contact-r3-mail-lock">
          <div class="contact-r3-mail-kpi"><span>MAIL GATEWAY</span><strong>共通 1個</strong></div>
          <div class="contact-r3-mail-kpi"><span>共有Mail Domain</span><strong>共通 1個</strong></div>
          <div class="contact-r3-mail-kpi"><span>Resend API Secret</span><strong>Gatewayのみ 1個</strong></div>
          <div class="contact-r3-mail-kpi"><span>店舗Conversation DB</span><strong>各店舗のまま</strong></div>
        </div>

        <div class="contact-r3-mail-grid">
          <div class="contact-r3-mail-box"><h4>CENTRAL Gateway</h4><div class="contact-r3-mail-kv">
            <span>Version</span><strong>${esc(CONFIG.version || "—")}</strong>
            <span>Worker</span><strong>${esc(CONFIG.workerName || "dpro-contact-mail-gateway")}</strong>
            <span>Worker URL</span><strong>${esc(CONFIG.workerUrl || CONFIG.workerUrlCandidate || "未設定")}</strong>
            <span>Mail Domain</span><strong>${esc(CONFIG.mailDomain || "未設定")}</strong>
            <span>KV Routes</span><strong>${esc(CONFIG.routesKvNamespaceId ? "設定済み" : "未設定")}</strong>
            <span>署名公開鍵</span><strong>${esc(CONFIG.signingPublicJwk ? "設定済み" : "未設定")}</strong>
          </div></div>

          <div class="contact-r3-mail-box"><h4>店舗追加時に増えるもの</h4><div class="contact-r3-mail-kv">
            <span>新規Mail Domain</span><strong>0個</strong>
            <span>新規Resend API Key</span><strong>0個</strong>
            <span>新規Email Routing</span><strong>0個</strong>
            <span>Gateway Route</span><strong>店舗ごと 1レコード</strong>
            <span>店舗Worker Secret</span><strong>Client Secret 1個</strong>
            <span>CONTACT Worker</span><strong>R2どおり店舗ごと1個</strong>
          </div></div>

          <div class="contact-r3-mail-box full"><h4>送受信フロー</h4><ol class="contact-r3-mail-flow">
            <li>店舗CONTACT Worker → 認証付きで共通MAIL GATEWAYへ送信</li>
            <li>Gateway → 共通Resend → お客様へメール送信</li>
            <li>Reply-To：r+店舗RouteToken.ThreadID@共有MailDomain</li>
            <li>お客様返信 → Cloudflare Email Routing → 共通MAIL GATEWAY</li>
            <li>GatewayがRouteTokenを解決し、署名付きで該当店舗CONTACT Workerへ返送</li>
            <li>会話本文・添付は従来どおり各店舗CONTACT DB / Storageへ保存</li>
          </ol></div>
        </div>

        <div class="contact-r3-mail-safe">GatewayのKVには店舗ルーティング情報だけを保持し、会話本文の中央集約は行いません。店舗→Gatewayは店舗固有Client Secret、Gateway→店舗はECDSA P-256署名で検証します。</div>
        <div class="contact-r3-mail-note">${s.productionReady
          ? "R3 CENTRALは本番準備完了です。次はR3-Bの店舗Route自動発行・R7.2 Worker切替へ進めます。"
          : s.runtimeReady
            ? "Gateway Runtimeは準備済みです。共有Mail DomainのResend検証とCloudflare Email Routing実送受信がPASSするまでR3-BはHOLDします。"
            : "現在はR3-A STAGEDです。まず共通Gatewayを1回だけDeployし、共有Mail Domain・KV・署名鍵を確定します。店舗Workerの切替はまだ行いません。"}</div>
      </section>`;
  }

  function schedule() {
    const r2 = $("contactMultiStoreR2");
    if (!r2?.dataset?.projectId) return;
    const projectId = r2.dataset.projectId;
    const existing = $("contactMailGatewayR3");
    if (existing?.dataset?.projectId === projectId) return;
    existing?.remove();
    r2.insertAdjacentHTML("afterend", render(projectId));
  }

  function captureProject() {
    document.addEventListener("click", (event) => {
      if (!event.target.closest?.("[data-open-project]")) return;
      $("contactMailGatewayR3")?.remove();
    }, true);
  }

  function boot() {
    installStyle();
    captureProject();
    const detail = $("detailContent");
    if (detail) {
      const observer = new MutationObserver(() => schedule());
      observer.observe(detail, { childList: true, subtree: true });
    }
    schedule();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
