(() => {
  "use strict";

  if (window.__DPRO_CENTER10_FINAL_AUDIT_R10__) return;
  window.__DPRO_CENTER10_FINAL_AUDIT_R10__ = true;

  const BUILD = "CONTROL-CENTER-43-CENTER10-R7-R10-R1-FINAL-AUDIT-20260810";
  const CONFIG = window.DPRO_CONTROL_CENTER_CONFIG || {};
  const $ = (id) => document.getElementById(id);
  const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));

  const state = {
    supabase: null,
    session: null,
    data: null,
    loaded: false,
    versionObserver: null,
    runtimeTimer: null,
  };

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function syncVersion() {
    const version = document.querySelector(".sidebar .version");
    if (!version) return false;
    const wanted = 'CONTROL-CENTER-43<br><span>CENTER-10-R7-R10-R1</span>';
    if (version.innerHTML !== wanted) version.innerHTML = wanted;

    if (!state.versionObserver) {
      state.versionObserver = new MutationObserver(() => syncVersion());
      state.versionObserver.observe(version, { childList: true, subtree: true, characterData: true });
    }
    return true;
  }

  async function fetchPublicConfig() {
    const base = String(CONFIG.apiBaseUrl || "").replace(/\/$/, "");
    const response = await fetch(`${base}/api/public-config`, { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || data.error || `HTTP ${response.status}`);
    return data;
  }

  async function getSupabase() {
    if (state.supabase) return state.supabase;
    if (!window.supabase?.createClient) throw new Error("Supabase clientを確認できません。");

    const pub = await fetchPublicConfig();
    state.supabase = window.supabase.createClient(
      pub.supabaseUrl,
      pub.supabasePublishableKey || pub.supabaseAnonKey,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: false,
          detectSessionInUrl: false,
          storageKey: pub.sessionStorageKey || "dpro-control-center-auth-v1",
        },
      }
    );

    const { data, error } = await state.supabase.auth.getSession();
    if (error) throw error;
    state.session = data?.session || null;
    if (!state.session?.user) throw new Error("CONTROL CENTERへログインしてください。");
    return state.supabase;
  }

  function installStyle() {
    if ($("c10R10Style")) return;
    const style = document.createElement("style");
    style.id = "c10R10Style";
    style.textContent = `
      .c10-r10-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-end;margin-bottom:14px}
      .c10-r10-head h2{margin:0;font-size:24px}.c10-r10-head p{margin:6px 0 0;color:#68766f;font-size:11px;line-height:1.7}
      .c10-r10-pill{display:inline-flex;padding:6px 9px;border-radius:999px;background:#e1f5eb;color:#08664b;font-size:9px;font-weight:900}
      .c10-r10-guide{padding:14px 15px;border:1px solid #b9dccd;border-radius:13px;background:#eef9f4;color:#466057;font-size:11px;line-height:1.75}
      .c10-r10-safety{margin-top:8px;padding:12px 14px;border:1px solid #d7e3eb;border-radius:12px;background:#f5f9fc;color:#516b79;font-size:10px;line-height:1.7}
      .c10-r10-metrics{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:9px;margin:13px 0}
      .c10-r10-metric{padding:15px;border:1px solid #d9e5e0;border-radius:13px;background:#fff;min-width:0}
      .c10-r10-metric b,.c10-r10-metric span,.c10-r10-metric small{display:block}.c10-r10-metric b{font-size:22px;color:#0b5f49}.c10-r10-metric span{font-size:10px;font-weight:900;margin-top:5px}.c10-r10-metric small{font-size:8px;color:#74817c;margin-top:3px}
      .c10-r10-result{display:grid;gap:11px}
      .c10-r10-runtime{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 13px;border:1px solid #d9e5e0;border-radius:12px;background:#fff;color:#53675f;font-size:10px}
      .c10-r10-runtime strong{color:#0b5f49}.c10-r10-runtime.bad{border-color:#e6b8c0;background:#fff9fa;color:#8f3b4a}.c10-r10-runtime.bad strong{color:#aa3047}
      .c10-r10-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:9px}
      .c10-r10-card{padding:13px;border:1px solid #dce6e2;border-radius:12px;background:#fff;min-height:98px}.c10-r10-card.pass{border-color:#a9d6c1;background:#f8fcfa}.c10-r10-card.fail{border-color:#e4b1bb;background:#fff9fa}
      .c10-r10-card strong,.c10-r10-card span,.c10-r10-card small{display:block}.c10-r10-card strong{font-size:11px;color:#183d33}.c10-r10-card span{margin-top:7px;font-size:11px;font-weight:900}.c10-r10-card.pass span{color:#087253}.c10-r10-card.fail span{color:#b63247}.c10-r10-card small{margin-top:5px;color:#718079;font-size:9px;line-height:1.55}
      .c10-r10-final{padding:18px;border-radius:16px;border:1px solid #a2d1bb;background:#eef9f4}.c10-r10-final.fail{border-color:#e3b0ba;background:#fff5f7}
      .c10-r10-final h3{margin:0;font-size:21px;color:#0b5f49}.c10-r10-final.fail h3{color:#a83247}.c10-r10-final p{margin:7px 0 0;color:#52685f;font-size:11px;line-height:1.75}
      .c10-r10-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:11px;flex-wrap:wrap}.c10-r10-empty{padding:24px;border:1px dashed #c6d5ce;border-radius:13px;background:#fff;text-align:center;color:#687872;font-size:12px;line-height:1.8}
      @media(max-width:1250px){.c10-r10-metrics{grid-template-columns:repeat(3,1fr)}.c10-r10-grid{grid-template-columns:repeat(3,1fr)}}
      @media(max-width:900px){.c10-r10-grid{grid-template-columns:repeat(2,1fr)}}
      @media(max-width:720px){.c10-r10-head{display:block}.c10-r10-metrics,.c10-r10-grid{grid-template-columns:1fr}.c10-r10-runtime{display:block}}
    `;
    document.head.appendChild(style);
  }

  function installPanel() {
    const r9Tab = document.querySelector('.tabs .tab[data-center10-contract-delivery-r9="true"]');
    const r9Panel = $("panel-contract-delivery");
    if (!r9Tab || !r9Panel) return false;
    if ($("panel-final-audit")) return true;

    const button = document.createElement("button");
    button.className = "tab";
    button.type = "button";
    button.dataset.tab = "final-audit";
    button.dataset.center10FinalAuditR10 = "true";
    button.textContent = "最終監査";
    r9Tab.insertAdjacentElement("afterend", button);

    const panel = document.createElement("section");
    panel.id = "panel-final-audit";
    panel.className = "tab-panel hidden";
    panel.innerHTML = `
      <div class="c10-r10-head">
        <div>
          <h2>CENTER-10-R7 最終総合検査</h2>
          <p>ここでは新機能を追加せず、契約から本番稼働までの安全経路だけを最終確認します。</p>
        </div>
        <span class="c10-r10-pill">CENTER-10 R7-R10-R1</span>
      </div>

      <div class="c10-r10-guide">
        R8 契約開始 → R9 契約→制作 → 制作・納品 → R7 本番準備 → R6 本番安全ロック → CENTER-8 品質確認 → 本番稼働の順で一括確認します。
        <strong>7項目すべてPASSなら CENTER-10-R7 完成です。</strong>
      </div>

      <div class="c10-r10-safety">
        最終検査専用です。契約変更、制作案件作成、契約紐付け、PRODUCTION作成、本番稼働確定は行いません。
      </div>

      <div id="c10R10Metrics" class="c10-r10-metrics"></div>
      <div id="c10R10Result"><div class="c10-r10-empty">最終総合検査を開始しています…</div></div>
    `;
    r9Panel.insertAdjacentElement("afterend", panel);

    button.addEventListener("click", async () => {
      $$(".tab").forEach((b) => b.classList.toggle("active", b === button));
      $$(".tab-panel").forEach((p) => p.classList.add("hidden"));
      panel.classList.remove("hidden");
      if (!state.loaded) await loadData();
      else render();
      refreshRuntimeUntilStable();
    });

    return true;
  }

  function runtimeChecks() {
    return [
      {
        name: "R8画面",
        pass: Boolean(document.querySelector('.tabs .tab[data-center10-contract-start-r8="true"]') && $("panel-contract-start")),
      },
      {
        name: "R9画面",
        pass: Boolean(document.querySelector('.tabs .tab[data-center10-contract-delivery-r9="true"]') && $("panel-contract-delivery")),
      },
      {
        name: "制作・納品画面",
        pass: Boolean($("panel-projects") && $("newProjectButton")),
      },
      {
        name: "R7本番準備画面",
        pass: Boolean(document.querySelector('.tabs .tab[data-center10-readiness-r7="true"]') && $("panel-production-readiness")),
      },
      {
        name: "R6本番ロック",
        pass: Boolean(window.__DPRO_CENTER10_PRODUCTION_CHAIN_R6_R1__ && document.querySelector('script[data-center10-production-chain-r6="true"]')),
      },
      {
        name: "CENTER-8画面",
        pass: Boolean(document.querySelector('.tabs .tab[data-center8-go-live="true"]') && $("panel-go-live")),
      },
      {
        name: "DEMO検査導線",
        pass: Boolean($("c10R8Scope")?.querySelector('option[value="demo"]') && $("c10R9Scope")?.querySelector('option[value="demo"]')),
      },
    ];
  }

  function metricsHtml(data, totalPass) {
    const s = data?.summary || {};
    const runtime = runtimeChecks();
    const runtimePass = runtime.filter((x) => x.pass).length;
    return `
      <div class="c10-r10-metric"><b>${totalPass ? "PASS" : "確認"}</b><span>総合判定</span><small>DB＋画面接続</small></div>
      <div class="c10-r10-metric"><b>${Number(s.pass || 0)}/7</b><span>DB検査</span><small>R8〜CENTER-8</small></div>
      <div class="c10-r10-metric"><b>${runtimePass}/7</b><span>画面接続</span><small>実装読み込み</small></div>
      <div class="c10-r10-metric"><b>${Number(s.production_contracts || 0)}</b><span>実契約</span><small>現在の正式対象</small></div>
      <div class="c10-r10-metric"><b>${Number(s.demo_test_contracts || 0)}</b><span>DEMO / TEST契約</span><small>本番対象外</small></div>
      <div class="c10-r10-metric"><b>${Number(s.scope_leaks || 0)}</b><span>本番混入</span><small>0件が正常</small></div>
    `;
  }

  function render() {
    syncVersion();
    const metrics = $("c10R10Metrics");
    const host = $("c10R10Result");
    if (!metrics || !host || !state.data) return;

    const components = Array.isArray(state.data.components) ? state.data.components : [];
    const runtime = runtimeChecks();
    const runtimePass = runtime.filter((x) => x.pass).length;
    const dbPass = state.data.all_pass === true;
    const runtimeOk = runtimePass === runtime.length;
    const totalPass = dbPass && runtimeOk;
    const s = state.data.summary || {};

    metrics.innerHTML = metricsHtml(state.data, totalPass);

    host.innerHTML = `
      <div class="c10-r10-result">
        <div class="c10-r10-runtime ${runtimeOk ? "" : "bad"}">
          <div><strong>画面側の接続確認：${runtimePass}/${runtime.length}</strong>　${runtimeOk ? "R8〜CENTER-8まで読み込み済みです。" : "まだ読み込み待ちの項目があります。"}</div>
          <div>${runtime.map((x) => `${x.pass ? "✓" : "!"} ${esc(x.name)}`).join("　")}</div>
        </div>

        <div class="c10-r10-grid">
          ${components.map((item) => `
            <article class="c10-r10-card ${item.pass === true ? "pass" : "fail"}">
              <strong>${esc(item.name || item.code || "検査")}</strong>
              <span>${item.pass === true ? "✓ PASS" : "! FAIL"}</span>
              <small>${esc(item.detail || "")}</small>
            </article>
          `).join("")}
        </div>

        <div class="c10-r10-final ${totalPass ? "" : "fail"}">
          <h3>${totalPass ? "✅ CENTER-10-R7 完了判定 PASS" : "⚠ CENTER-10-R7 最終確認が必要です"}</h3>
          <p>${totalPass
            ? `契約開始から本番稼働までの安全経路が接続されています。現在の実契約は ${Number(s.production_contracts || 0)}件、DEMO / TEST契約は ${Number(s.demo_test_contracts || 0)}件で、本番混入は ${Number(s.scope_leaks || 0)}件です。実契約の条件が揃うまでR6/CENTER-8の本番経路はロックされたままです。`
            : `DB検査 ${Number(s.pass || 0)}/7、画面接続 ${runtimePass}/${runtime.length} です。FAILまたは読み込み待ちの項目だけ確認してください。`}
          </p>
          <div class="c10-r10-actions">
            <button id="c10R10Reload" class="btn secondary" type="button">もう一度最終検査</button>
          </div>
        </div>
      </div>
    `;

    $("c10R10Reload")?.addEventListener("click", () => loadData(true));
  }

  function refreshRuntimeUntilStable() {
    if (state.runtimeTimer) clearInterval(state.runtimeTimer);
    let tries = 0;
    state.runtimeTimer = setInterval(() => {
      tries += 1;
      syncVersion();
      if (state.data) render();
      const checks = runtimeChecks();
      if (checks.every((x) => x.pass) || tries >= 40) {
        clearInterval(state.runtimeTimer);
        state.runtimeTimer = null;
      }
    }, 125);
  }

  async function loadData(force = false) {
    const host = $("c10R10Result");
    if (host) host.innerHTML = '<div class="c10-r10-empty">R8〜CENTER-8を一括検査しています…</div>';
    try {
      const sb = await getSupabase();
      const { data, error } = await sb.rpc("cc_center10_r10_get_final_audit");
      if (error) throw error;
      state.data = data || {};
      state.loaded = true;
      render();
      refreshRuntimeUntilStable();
    } catch (error) {
      console.error(BUILD, error);
      if (host) {
        const missing = /cc_center10_r10_get_final_audit|PGRST|function/i.test(String(error?.message || ""));
        host.innerHTML = `
          <div class="c10-r10-empty">
            <strong>${missing ? "R10のDB SQLを先に実行してください。" : "最終総合検査を読み込めません。"}</strong><br>
            ${esc(error?.message || "DB接続を確認してください。")}
          </div>`;
      }
    }
  }

  function bootstrap() {
    installStyle();
    syncVersion();

    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      syncVersion();
      if (installPanel()) {
        clearInterval(timer);
      } else if (tries >= 240) {
        clearInterval(timer);
      }
    }, 125);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap, { once: true });
  } else {
    bootstrap();
  }
})();
