(() => {
  "use strict";

  const BUILD = "DPRO-CONTACT-MAIL-GATEWAY-R3-A1-OWNER-DOMAIN-FIRST-UI-20260824";
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
      .contact-r3-mail-flow{margin:0;padding-left:18px;color:#4f5660;font-size:9px;line-height:1.8}.contact-r3-mail-note{margin-top:10px;padding:10px 12px;border-radius:10px;background:#fff7e5;color:#805b10;font-size:9px;font-weight:850;line-height:1.65}.contact-r3-mail-safe{margin-top:10px;padding:10px 12px;border-radius:10px;background:#eaf8f2;color:#087253;font-size:9px;font-weight:850;line-height:1.65}.contact-r3-mail-owner{margin-top:10px;padding:10px 12px;border-radius:10px;background:#edf7ff;color:#285d88;font-size:9px;font-weight:850;line-height:1.65}
      @media(max-width:760px){.contact-r3-mail-lock{grid-template-columns:repeat(2,1fr)}.contact-r3-mail-grid{grid-template-columns:1fr}.contact-r3-mail-box.full{grid-column:auto}.contact-r3-mail-head{display:block}.contact-r3-mail-badge{margin-top:8px}.contact-r3-mail-kv{grid-template-columns:1fr}}
      @media(max-width:460px){.contact-r3-mail-lock{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function stateInfo() {
    const centralReady = [
      CONFIG.workerUrl,
      CONFIG.routesKvNamespaceId,
      CONFIG.signingPublicJwk,
    ].every(Boolean) && ["RUNTIME_READY", "PRODUCTION_READY"].includes(String(CONFIG.status || ""));

    const fallbackReady = Boolean(
      CONFIG.fallbackEnabled &&
      CONFIG.fallbackMailDomain &&
      CONFIG.fallbackMailDnsVerified === true &&
      CONFIG.fallbackResendDomainVerified === true &&
      CONFIG.fallbackCloudflareEmailRoutingVerified === true
    );
    return { centralReady, fallbackReady };
  }

  function render(projectId) {
    const s = stateInfo();
    const badge = s.centralReady
      ? ["R3 CENTRAL READY", "green"]
      : ["R3-A1 STAGED", "amber"];

    const prefix = String(CONFIG.ownerDomainSubdomainPrefix || "contact").trim() || "contact";
    const fallback = CONFIG.fallbackMailDomain || "未設定（必要な店舗だけ後で設定）";

    return `
      <section id="contactMailGatewayR3" class="contact-r3-mail" data-project-id="${esc(projectId)}">
        <div class="contact-r3-mail-head">
          <div>
            <h3>DPRO CONTACT R3｜共通MAIL GATEWAY</h3>
            <p>GatewayはDPRO共通1個のまま、メールドメインは「オーナー独自ドメイン優先」に変更しました。標準は ${esc(prefix)}.&lt;オーナードメイン&gt; です。</p>
          </div>
          <span class="contact-r3-mail-badge ${badge[1]}">${esc(badge[0])}</span>
        </div>

        <div class="contact-r3-mail-lock">
          <div class="contact-r3-mail-kpi"><span>MAIL GATEWAY</span><strong>共通 1個</strong></div>
          <div class="contact-r3-mail-kpi"><span>標準Mail Domain</span><strong>店舗独自【推奨】</strong></div>
          <div class="contact-r3-mail-kpi"><span>推奨サブドメイン</span><strong>${esc(prefix)}.&lt;店舗Domain&gt;</strong></div>
          <div class="contact-r3-mail-kpi"><span>DPRO共有Domain</span><strong>フォールバックのみ</strong></div>
        </div>

        <div class="contact-r3-mail-grid">
          <div class="contact-r3-mail-box"><h4>CENTRAL Gateway</h4><div class="contact-r3-mail-kv">
            <span>Version</span><strong>${esc(CONFIG.version || "—")}</strong>
            <span>Worker</span><strong>${esc(CONFIG.workerName || "dpro-contact-mail-gateway")}</strong>
            <span>Worker URL</span><strong>${esc(CONFIG.workerUrl || CONFIG.workerUrlCandidate || "未設定")}</strong>
            <span>Domain Policy</span><strong>OWNER DOMAIN FIRST</strong>
            <span>KV Routes</span><strong>${esc(CONFIG.routesKvNamespaceId ? "設定済み" : "未設定")}</strong>
            <span>署名公開鍵</span><strong>${esc(CONFIG.signingPublicJwk ? "設定済み" : "未設定")}</strong>
          </div></div>

          <div class="contact-r3-mail-box"><h4>メールドメイン標準</h4><div class="contact-r3-mail-kv">
            <span>第1選択</span><strong>${esc(prefix)}.&lt;オーナードメイン&gt;</strong>
            <span>例</span><strong>${esc(prefix)}.flow-hair.jp</strong>
            <span>送信名</span><strong>店舗名</strong>
            <span>Resend API Key</span><strong>Gateway共通 1個</strong>
            <span>共有Fallback</span><strong>${esc(fallback)}</strong>
            <span>既存ルートMX</span><strong>触らない</strong>
          </div></div>

          <div class="contact-r3-mail-box"><h4>店舗追加時に増えるもの</h4><div class="contact-r3-mail-kv">
            <span>CONTACT用サブドメイン</span><strong>店舗ごと 1個</strong>
            <span>Resend Domain検証</span><strong>店舗ごと 1回</strong>
            <span>Email Routing設定</span><strong>店舗ごと 1回 → 同じGateway</strong>
            <span>新規Resend API Key</span><strong>0個</strong>
            <span>Gateway Route</span><strong>店舗ごと 1レコード</strong>
            <span>CONTACT Worker</span><strong>R2どおり店舗ごと1個</strong>
          </div></div>

          <div class="contact-r3-mail-box"><h4>フォールバック</h4><div class="contact-r3-mail-kv">
            <span>対象</span><strong>独自Domainなし / DNS条件を満たせない店舗</strong>
            <span>方式</span><strong>DPRO共有Mail Domain</strong>
            <span>Gateway</span><strong>同じ共通Gateway</strong>
            <span>RouteToken</span><strong>店舗ごと分離</strong>
            <span>通常利用</span><strong>しない</strong>
            <span>優先順位</span><strong>OWNER → DPRO共有</strong>
          </div></div>

          <div class="contact-r3-mail-box full"><h4>送受信フロー（店舗独自Domain）</h4><ol class="contact-r3-mail-flow">
            <li>契約時にオーナードメインからCONTACT専用サブドメインを作成：${esc(prefix)}.&lt;owner-domain&gt;</li>
            <li>そのサブドメインをResendで送信Domainとして検証</li>
            <li>同じサブドメインをCloudflare Email Routingへ追加し、受信先を共通MAIL GATEWAYへ設定</li>
            <li>店舗CONTACT Worker → 認証付きで共通MAIL GATEWAYへ送信</li>
            <li>Gateway → Resend → お客様。Fromは店舗名 &lt;contact@店舗サブドメイン&gt;</li>
            <li>Reply-To：r+店舗RouteToken.ThreadID@店舗サブドメイン</li>
            <li>お客様返信 → 共通MAIL GATEWAY → 署名付きで該当店舗CONTACT Workerへ返送</li>
            <li>会話本文・添付は各店舗CONTACT DB / Storageへ保存</li>
          </ol></div>
        </div>

        <div class="contact-r3-mail-owner">オーナーのルートDomainのMXは変更しません。CONTACT専用サブドメインを分離して使うため、既存のGoogle Workspace / 独自メール等への影響を避ける設計です。Cloudflare DNSで管理できない契約先はDPRO共有Domainへフォールバックできます。</div>
        <div class="contact-r3-mail-safe">Gateway KVにはルーティング情報とDomain検証状態だけを保持し、会話本文は中央保存しません。Routeには店舗ごとのmail_domainを持たせ、受信時も「宛先Domain＝そのRouteのDomain」を照合します。</div>
        <div class="contact-r3-mail-note">${s.centralReady
          ? "共通Gateway Runtimeは準備済みです。R3-Bでは契約店舗ごとにオーナーDomain → contactサブドメイン → Resend/Email Routing検証 → Route発行の順で進めます。"
          : "現在はR3-A1 STAGEDです。まず共通GatewayだけをDeployします。共有Mail Domainは必須にせず、店舗Workerの切替もまだ行いません。"}</div>
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
