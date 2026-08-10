(() => {
  "use strict";

  if (window.__DPRO_CENTER10_PRODUCTION_CHAIN_R6_R1__) return;
  window.__DPRO_CENTER10_PRODUCTION_CHAIN_R6_R1__ = true;
  window.__DPRO_CENTER10_PRODUCTION_CHAIN_R6__ = true;

  const BUILD = "CONTROL-CENTER-37-CENTER10-R7-R6-R1-SELECTION-SYNC-20260810";
  const CONFIG = window.DPRO_CONTROL_CENTER_CONFIG || {};
  const $ = (id) => document.getElementById(id);

  const state = {
    supabase: null,
    session: null,
    projectId: "",
    chain: null,
    loadSeq: 0,
    selectorObserver: null,
    boardObserver: null,
  };

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function bool(value) {
    return value === true;
  }

  function syncVisibleVersion() {
    const version = document.querySelector(".sidebar .version");
    if (!version) return;
    version.innerHTML = 'CONTROL-CENTER-37<br><span>CENTER-10-R7-R6-R1</span>';
  }

  async function fetchPublicConfig() {
    const base = String(CONFIG.apiBaseUrl || "").replace(/\/$/, "");
    const response = await fetch(`${base}/api/public-config`, { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.message || data.error || `HTTP ${response.status}`);
    }
    return data;
  }

  async function getSupabase() {
    if (state.supabase) return state.supabase;
    if (!window.supabase?.createClient) {
      throw new Error("Supabase clientを確認できません。");
    }

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
    if (!state.session?.user) {
      throw new Error("CONTROL CENTERへログインしてください。");
    }
    return state.supabase;
  }

  function installStyle() {
    if ($("c10R6Style")) return;

    const style = document.createElement("style");
    style.id = "c10R6Style";
    style.textContent = `
      .c10-r6-chain{
        margin-top:10px;padding:14px;border:1px solid #c9ddd4;border-radius:14px;
        background:#f7fbf9
      }
      .c10-r6-head{
        display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:10px
      }
      .c10-r6-head strong{display:block;font-size:15px;color:#123d32}
      .c10-r6-head p{margin:4px 0 0;color:#61746c;font-size:12px;line-height:1.65}
      .c10-r6-badge{
        flex:0 0 auto;padding:5px 9px;border-radius:999px;background:#e5f5ed;
        color:#076549;font-size:10px;font-weight:900
      }
      .c10-r6-grid{
        display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px
      }
      .c10-r6-step{
        padding:11px;border:1px solid #dbe6e1;border-radius:11px;background:#fff;min-height:86px
      }
      .c10-r6-step.ok{border-color:#abd7c3;background:#f8fcfa}
      .c10-r6-step.bad{border-color:#e6b8c0;background:#fff9fa}
      .c10-r6-step strong,.c10-r6-step span,.c10-r6-step small{display:block}
      .c10-r6-step strong{font-size:12px}
      .c10-r6-step span{margin-top:7px;font-size:12px;font-weight:900}
      .c10-r6-step.ok span{color:#087153}
      .c10-r6-step.bad span{color:#b03449}
      .c10-r6-step small{margin-top:4px;color:#718079;font-size:10px;line-height:1.5}
      .c10-r6-blockers{
        margin-top:9px;padding:10px 12px;border-radius:10px;background:#fff1f3;
        color:#983347;font-size:12px;line-height:1.65
      }
      .c10-r6-ready{
        margin-top:9px;padding:10px 12px;border-radius:10px;background:#eaf8f1;
        color:#08664b;font-size:12px;font-weight:900
      }
      .c10-r6-db-warn{
        margin-top:10px;padding:11px 13px;border:1px solid #ead08a;border-radius:10px;
        background:#fff9e8;color:#805d00;font-size:12px;line-height:1.65
      }
      #c8Activate[data-c10-r6-locked="true"]{
        opacity:.55;pointer-events:none
      }
      @media(max-width:1100px){
        .c10-r6-grid{grid-template-columns:repeat(3,minmax(0,1fr))}
      }
      @media(max-width:720px){
        .c10-r6-grid{grid-template-columns:1fr}
      }
    `;
    document.head.appendChild(style);
  }

  function ensurePanel() {
    const goLive = $("panel-go-live");
    if (!goLive) return null;

    let host = $("c10R6ProductionChain");
    if (host) {
      const badge = host.querySelector(".c10-r6-badge");
      if (badge) badge.textContent = "CENTER-10 R7-R6-R1";
      return host;
    }

    host = document.createElement("section");
    host.id = "c10R6ProductionChain";
    host.className = "c10-r6-chain";
    host.innerHTML = `
      <div class="c10-r6-head">
        <div>
          <strong>契約 → 制作 → 本番システム 最終連動</strong>
          <p>本番稼働直前に、正式実契約とPRODUCTION本番の接続をDB側でも再確認します。</p>
        </div>
        <span class="c10-r6-badge">CENTER-10 R7-R6-R1</span>
      </div>
      <div id="c10R6Body">
        <div class="c10-r6-db-warn">契約案件を確認しています…</div>
      </div>
    `;

    const safety = goLive.querySelector(".c8-safety");
    if (safety) safety.insertAdjacentElement("afterend", host);
    else goLive.prepend(host);

    return host;
  }

  function step(name, ok, good, bad, note) {
    return `
      <article class="c10-r6-step ${ok ? "ok" : "bad"}">
        <strong>${esc(name)}</strong>
        <span>${ok ? "✓ " + esc(good) : "! " + esc(bad)}</span>
        <small>${esc(note)}</small>
      </article>
    `;
  }

  function applyActivationGuard() {
    const button = $("c8Activate");
    if (!button) return;

    const locked = !state.chain || state.chain.ready_for_go_live !== true;
    if (locked) {
      button.dataset.c10R6Locked = "true";
      button.title = "CENTER-10-R7-R6-R1 最終連動が未完了です。";
    } else {
      delete button.dataset.c10R6Locked;
      if (button.title === "CENTER-10-R7-R6-R1 最終連動が未完了です。") {
        button.title = "";
      }
    }
  }

  function render() {
    ensurePanel();
    syncVisibleVersion();

    const body = $("c10R6Body");
    if (!body) return;

    if (!state.projectId) {
      body.innerHTML = '<div class="c10-r6-db-warn">契約案件を確認しています…</div>';
      applyActivationGuard();
      return;
    }

    if (!state.chain) {
      body.innerHTML = '<div class="c10-r6-db-warn">最終連動を確認しています…</div>';
      applyActivationGuard();
      return;
    }

    const links = state.chain.links || {};
    const c8 = state.chain.center8_gate || {};
    const blockers = Array.isArray(links.blockers) ? links.blockers : [];

    const clientOk = bool(links.client_found) && bool(links.client_real);
    const contractOk =
      bool(links.contract_found) &&
      bool(links.contract_active) &&
      bool(links.contract_started) &&
      bool(links.contract_client_match);

    const projectOk =
      bool(links.contract_client_match) &&
      bool(links.system_client_match);

    const systemOk =
      bool(links.system_found) &&
      bool(links.system_production) &&
      bool(links.system_client_match);

    const center8Ok = bool(c8.activation_gate_ready);
    const ready = bool(state.chain.ready_for_go_live);

    body.innerHTML = `
      <div class="c10-r6-grid">
        ${step(
          "実顧客",
          clientOk,
          "本番対象",
          "DEMO / TEST",
          "検査用顧客は本番経路へ入りません。"
        )}
        ${step(
          "正式契約",
          contractOk,
          "active・開始済み",
          "契約条件未達",
          "契約・制作案件の顧客一致まで確認します。"
        )}
        ${step(
          "制作案件",
          projectOk,
          "接続一致",
          "接続不一致",
          "契約・制作・システムの顧客IDを照合します。"
        )}
        ${step(
          "本番システム",
          systemOk,
          "PRODUCTION",
          "本番未接続",
          "DEMO / STAGING / TESTでは本番確定できません。"
        )}
        ${step(
          "CENTER-8",
          center8Ok,
          "品質ゲートOK",
          "未完了あり",
          "CENTER-7・STANDARD・セットアップ・Healthを再確認します。"
        )}
      </div>
      ${
        ready
          ? '<div class="c10-r6-ready">✅ 最終連動OK：DB側の本番経路条件を満たしています。CENTER-8の最終入力完了後に本番稼働できます。</div>'
          : `<div class="c10-r6-blockers"><strong>本番経路はロックされています。</strong>${
              blockers.length
                ? `<br>${blockers.map((x) => `・${esc(x)}`).join("<br>")}`
                : "<br>・CENTER-8の品質・STANDARD・セットアップ等に未完了があります。"
            }</div>`
      }
    `;

    applyActivationGuard();
  }

  async function loadChain(projectId) {
    const normalized = String(projectId || "").trim();
    const seq = ++state.loadSeq;

    state.projectId = normalized;
    state.chain = null;
    render();

    if (!normalized) return;

    try {
      const sb = await getSupabase();
      const { data, error } = await sb.rpc("cc_center10_r6_get_production_chain", {
        p_project_id: normalized,
      });

      if (seq !== state.loadSeq) return;
      if (error) throw error;

      state.chain = data || {};
      render();
    } catch (error) {
      if (seq !== state.loadSeq) return;

      console.error(BUILD, error);
      ensurePanel();

      const body = $("c10R6Body");
      if (body) {
        const missing =
          /cc_center10_r6_get_production_chain|PGRST|function/i.test(
            String(error?.message || "")
          );

        body.innerHTML = `
          <div class="c10-r6-db-warn">
            <strong>${missing ? "R6のDB SQLを確認してください。" : "最終連動を確認できません。"}</strong><br>
            ${esc(error?.message || "DB接続を確認してください。")}
          </div>
        `;
      }
      applyActivationGuard();
    }
  }

  function syncProjectSelection() {
    const select = $("c8ProjectSelect");
    if (!select) return false;

    const value = String(select.value || "").trim();

    if (value !== String(state.projectId || "")) {
      loadChain(value);
      return true;
    }

    if (value && !state.chain) {
      loadChain(value);
      return true;
    }

    return true;
  }

  function bindSelector() {
    const select = $("c8ProjectSelect");
    if (!select) return false;

    if (select.dataset.c10R6R1Bound !== "true") {
      select.dataset.c10R6R1Bound = "true";

      select.addEventListener("change", () => {
        setTimeout(syncProjectSelection, 20);
      });

      state.selectorObserver = new MutationObserver(() => {
        setTimeout(syncProjectSelection, 20);
      });
      state.selectorObserver.observe(select, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["value"],
      });
    }

    syncProjectSelection();
    return true;
  }

  function observeCenter8Board() {
    const board = $("c8Board");
    if (!board || state.boardObserver) return;

    state.boardObserver = new MutationObserver(() => {
      setTimeout(() => {
        syncProjectSelection();
        applyActivationGuard();
        syncVisibleVersion();
      }, 20);
    });

    state.boardObserver.observe(board, {
      childList: true,
      subtree: true,
    });
  }

  function installClickGuard() {
    if (document.documentElement.dataset.c10R6R1ClickGuard === "true") return;
    document.documentElement.dataset.c10R6R1ClickGuard = "true";

    document.addEventListener(
      "click",
      (event) => {
        const button = event.target?.closest?.("#c8Activate");
        if (!button) return;

        if (!state.chain || state.chain.ready_for_go_live !== true) {
          event.preventDefault();
          event.stopImmediatePropagation();
          applyActivationGuard();
        }
      },
      true
    );
  }

  function bootstrap() {
    installStyle();
    installClickGuard();
    syncVisibleVersion();

    let tries = 0;
    let stableProjectTicks = 0;
    let lastProjectValue = "";

    const timer = setInterval(() => {
      tries += 1;

      ensurePanel();
      bindSelector();
      observeCenter8Board();
      syncVisibleVersion();
      applyActivationGuard();

      const select = $("c8ProjectSelect");
      const currentValue = String(select?.value || "").trim();

      if (currentValue && currentValue === lastProjectValue) {
        stableProjectTicks += 1;
      } else {
        stableProjectTicks = 0;
        lastProjectValue = currentValue;
      }

      if (currentValue && currentValue !== state.projectId) {
        syncProjectSelection();
      }

      // CENTER-8が非同期でoption/valueを入れるため、十分な時間追従する。
      // 値が安定してR6読込済みになった後もしばらく維持。
      if (
        tries >= 240 ||
        (
          stableProjectTicks >= 24 &&
          currentValue &&
          state.projectId === currentValue &&
          state.chain
        )
      ) {
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
