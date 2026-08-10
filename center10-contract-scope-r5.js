(() => {
  "use strict";

  if (window.__DPRO_CENTER10_CONTRACT_SCOPE_R5__) return;
  window.__DPRO_CENTER10_CONTRACT_SCOPE_R5__ = true;
  window.__DPRO_CENTER10_CONTRACT_SCOPE_R5_R1__ = true;
  window.__DPRO_CENTER10_CONTRACT_SCOPE_R5_R2__ = true;

  const BUILD = "CONTROL-CENTER-35-CENTER10-R7-R5-R2-COMPACT-EMPTY-20260810";
  const CONFIG = window.DPRO_CONTROL_CENTER_CONFIG || {};
  const $ = (id) => document.getElementById(id);
  const $$ = (selector, scope=document) => Array.from(scope.querySelectorAll(selector));

  const state = {
    supabase:null,
    session:null,
    clients:[],
    contracts:[],
    loaded:false,
    search:"",
    scope:"production",
    status:"all",
  };

  const STATUS_LABELS = {
    draft:"下書き",
    proposed:"提案中",
    pending:"確認中",
    preparing:"準備中",
    onboarding:"準備中",
    active:"運用中",
    paused:"一時停止",
    ended:"終了",
    cancelled:"解約",
    canceled:"解約",
  };

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }

  function formatDate(value) {
    if (!value) return "—";
    const date = new Date(`${String(value).slice(0,10)}T00:00:00`);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat("ja-JP", {
      year:"numeric",month:"2-digit",day:"2-digit"
    }).format(date);
  }

  function scopeText(record) {
    return String(
      record?.record_scope ??
      record?.data_scope ??
      record?.environment ??
      record?.mode ??
      ""
    ).trim().toLowerCase();
  }

  function clientById(id) {
    return state.clients.find((client) => String(client.id) === String(id)) || null;
  }

  function isDemoClient(client) {
    if (!client) return false;
    if (client.is_demo === true || client.is_test === true) return true;

    const scope = scopeText(client);
    if (["demo","test","testing","staging","sample","fixture"].includes(scope)) return true;

    const code = String(client.client_code || "").trim().toUpperCase();
    return (
      code.startsWith("CL-DEMO-") ||
      code.startsWith("DEMO-") ||
      code.startsWith("TEST-")
    );
  }

  function isDemoContract(contract) {
    if (!contract) return false;
    if (contract.is_demo === true || contract.is_test === true) return true;

    const scope = scopeText(contract);
    if (["demo","test","testing","staging","sample","fixture"].includes(scope)) return true;

    const code = String(contract.contract_code || "").trim().toUpperCase();
    if (
      code.startsWith("CTR-DEMO-") ||
      code.startsWith("DEMO-") ||
      code.startsWith("TEST-")
    ) return true;

    return isDemoClient(clientById(contract.client_id));
  }

  function contractStatus(contract) {
    return String(contract?.contract_status || contract?.status || "").trim().toLowerCase();
  }

  function contractClientName(contract) {
    return String(
      contract?.client_name ||
      clientById(contract?.client_id)?.display_name ||
      "顧客名未設定"
    );
  }

  function contractClientCode(contract) {
    return String(
      contract?.client_code ||
      clientById(contract?.client_id)?.client_code ||
      ""
    );
  }

  function realContracts() {
    return state.contracts.filter((contract) => !isDemoContract(contract));
  }

  function demoContracts() {
    return state.contracts.filter(isDemoContract);
  }

  function toneForContract(contract) {
    if (isDemoContract(contract)) return "demo";
    const status = contractStatus(contract);
    if (status === "active") return "green";
    if (["preparing","onboarding","pending","proposed"].includes(status)) return "blue";
    if (status === "paused") return "amber";
    if (["ended","cancelled","canceled"].includes(status)) return "gray";
    return "gray";
  }

  function formalStatusLabel(contract) {
    if (isDemoContract(contract)) return "DEMO / テスト";
    const status = contractStatus(contract);
    return STATUS_LABELS[status] || status || "状態未設定";
  }

  async function fetchPublicConfig() {
    const base = String(CONFIG.apiBaseUrl || "").replace(/\/$/,"");
    const response = await fetch(`${base}/api/public-config`, {cache:"no-store"});
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || data.error || `HTTP ${response.status}`);
    return data;
  }

  async function initSupabase() {
    if (state.supabase) return true;
    if (!window.supabase?.createClient) return false;

    const publicConfig = await fetchPublicConfig();
    state.supabase = window.supabase.createClient(
      publicConfig.supabaseUrl,
      publicConfig.supabasePublishableKey || publicConfig.supabaseAnonKey,
      {
        auth:{
          persistSession:true,
          autoRefreshToken:false,
          detectSessionInUrl:false,
          storageKey:publicConfig.sessionStorageKey || "dpro-control-center-auth-v1",
        },
      }
    );

    const {data,error} = await state.supabase.auth.getSession();
    if (error) throw error;
    state.session = data?.session || null;
    return Boolean(state.session?.user);
  }

  async function loadData() {
    if (!(await initSupabase())) return false;

    const [clientsResult,overviewResult] = await Promise.all([
      state.supabase
        .from("cc_v_client_overview")
        .select("*")
        .order("display_name",{ascending:true}),
      state.supabase.rpc("cc_center10_get_overview"),
    ]);

    if (clientsResult.error) throw clientsResult.error;
    if (overviewResult.error) throw overviewResult.error;

    state.clients = clientsResult.data || [];
    state.contracts = overviewResult.data?.contracts || [];
    state.loaded = true;
    render();
    return true;
  }

  function injectStyles() {
    if ($("c10R5ContractStyles")) return;

    const style = document.createElement("style");
    style.id = "c10R5ContractStyles";
    style.textContent = `
      #view-contracts .c10-r5-wrap{display:grid;gap:14px;align-content:start}
      #view-contracts .c10-r5-note{
        padding:13px 15px;border:1px solid #d7e3eb;border-radius:12px;
        background:#f4f8fb;color:#506977;font-size:13px;line-height:1.75
      }
      #view-contracts .c10-r5-note strong{color:#174b3c}
      #view-contracts .c10-r5-metrics{
        display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px
      }
      #view-contracts .c10-r5-metric{
        position:relative;overflow:hidden;padding:18px;border:1px solid #d8e2dd;
        border-radius:14px;background:#fff;min-height:92px
      }
      #view-contracts .c10-r5-metric::after{
        content:"";position:absolute;width:54px;height:54px;border-radius:50%;
        right:-10px;top:-12px;background:#e9f5ef
      }
      #view-contracts .c10-r5-metric.demo::after{background:#edf2f6}
      #view-contracts .c10-r5-metric b{
        display:block;color:#075b43;font-size:28px;line-height:1;margin-bottom:9px
      }
      #view-contracts .c10-r5-metric span{display:block;font-weight:900;font-size:13px}
      #view-contracts .c10-r5-metric small{display:block;margin-top:5px;color:#77847e;font-size:11px}
      #view-contracts .c10-r5-toolbar{
        display:grid;grid-template-columns:minmax(260px,1fr) 180px 180px;gap:10px
      }
      #view-contracts .c10-r5-toolbar input,
      #view-contracts .c10-r5-toolbar select{
        width:100%;min-height:48px;padding:0 14px;border:1px solid #d6e1dc;
        border-radius:12px;background:#fff;color:#17342c;font:inherit
      }
      #view-contracts .c10-r5-result{
        text-align:right;color:#687972;font-size:12px;font-weight:800
      }
      #view-contracts .c10-r5-list{
        display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;
        min-height:0;align-content:start;align-items:start
      }
      #view-contracts .c10-r5-card{
        border:1px solid #d8e2dd;border-radius:16px;background:#fff;padding:18px;
        display:grid;gap:13px
      }
      #view-contracts .c10-r5-card.demo{background:#f8fafc;border-color:#d6e1e8}
      #view-contracts .c10-r5-card-head{
        display:flex;align-items:flex-start;justify-content:space-between;gap:14px
      }
      #view-contracts .c10-r5-code{
        color:#2e6a59;font-size:11px;font-weight:900;letter-spacing:.08em
      }
      #view-contracts .c10-r5-card h3{
        margin:5px 0 3px;font-size:19px;line-height:1.35;color:#102d25
      }
      #view-contracts .c10-r5-client{color:#60746c;font-size:13px}
      #view-contracts .c10-r5-pill{
        flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;
        min-height:32px;padding:0 11px;border-radius:999px;font-size:11px;font-weight:900
      }
      #view-contracts .c10-r5-pill.green{background:#e6f6ed;color:#08704e}
      #view-contracts .c10-r5-pill.blue{background:#eaf3ff;color:#246393}
      #view-contracts .c10-r5-pill.amber{background:#fff3d7;color:#916000}
      #view-contracts .c10-r5-pill.gray{background:#eef2f0;color:#65736d}
      #view-contracts .c10-r5-pill.demo{background:#edf2f6;color:#596f7c}
      #view-contracts .c10-r5-details{
        display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px
      }
      #view-contracts .c10-r5-detail{
        padding:11px;border-radius:11px;background:#f6f9f7
      }
      #view-contracts .c10-r5-detail small{display:block;color:#82908a;font-size:10px;margin-bottom:4px}
      #view-contracts .c10-r5-detail strong{display:block;font-size:13px;color:#25483e}
      #view-contracts .c10-r5-demo-warning{
        padding:11px 12px;border-radius:10px;background:#f0f4f7;color:#526a78;
        font-size:12px;line-height:1.65
      }
      #view-contracts .c10-r5-actions{display:flex;gap:8px;justify-content:flex-end}
      #view-contracts .c10-r5-btn{
        min-height:40px;padding:0 14px;border:1px solid #c9ddd4;border-radius:10px;
        background:#fff;color:#086147;font-weight:900;cursor:pointer
      }
      #view-contracts .c10-r5-empty{
        min-height:0;height:auto;max-height:none;align-self:start;
        display:flex;align-items:center;justify-content:center;
        padding:20px 22px;border:1px dashed #cad8d2;border-radius:14px;background:#fff;
        text-align:center;color:#697a73;font-size:14px;line-height:1.8
      }
      #view-contracts .c10-r5-empty.hidden{display:none !important}
      #view-contracts > .empty-state,
      #view-contracts #contractsScopeNoteR4,
      #view-contracts .c10-r4-contract-note{
        display:none !important
      }
      @media(max-width:900px){
        #view-contracts .c10-r5-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}
        #view-contracts .c10-r5-toolbar{grid-template-columns:1fr}
        #view-contracts .c10-r5-list{grid-template-columns:1fr}
      }
    `;
    document.head.appendChild(style);
  }

  function cleanupLegacyContractArtifacts() {
    const view = $("view-contracts");
    if (!view) return;

    $$(":scope > .empty-state", view).forEach((node) => node.remove());
    $$("#contractsScopeNoteR4, .c10-r4-contract-note", view).forEach((node) => node.remove());
  }

  function renderShell() {
    const view = $("view-contracts");
    if (!view) return;
    cleanupLegacyContractArtifacts();
    if (view.dataset.c10R5Ready === "true") return;

    view.dataset.c10R5Ready = "true";
    view.innerHTML = `
      <div class="page-head">
        <div>
          <p class="eyebrow">CONTRACTS</p>
          <h1>契約・サービス</h1>
          <p>正式な実契約とDEMO / テスト契約を分離して確認します。</p>
        </div>
      </div>

      <div class="c10-r5-wrap">
        <div id="c10R5ContractMetrics" class="c10-r5-metrics"></div>

        <div id="c10R5ContractNote" class="c10-r5-note"></div>

        <div class="c10-r5-toolbar">
          <input id="c10R5ContractSearch" type="search" placeholder="顧客名・契約名・契約コードで検索">
          <select id="c10R5ContractScope">
            <option value="production">実契約のみ</option>
            <option value="demo">DEMO / テストのみ</option>
            <option value="all">すべて表示</option>
          </select>
          <select id="c10R5ContractStatus">
            <option value="all">すべての状態</option>
            <option value="active">運用中</option>
            <option value="preparing">準備中・確認中</option>
            <option value="paused">一時停止</option>
            <option value="ended">終了・解約</option>
          </select>
        </div>

        <div id="c10R5ContractResult" class="c10-r5-result"></div>
        <div id="c10R5ContractList" class="c10-r5-list"></div>
        <div id="c10R5ContractEmpty" class="c10-r5-empty hidden"></div>
      </div>
    `;

    $("c10R5ContractSearch")?.addEventListener("input",(event) => {
      state.search = String(event.target.value || "").trim().toLowerCase();
      renderList();
    });
    $("c10R5ContractScope")?.addEventListener("change",(event) => {
      state.scope = event.target.value || "production";
      renderList();
    });
    $("c10R5ContractStatus")?.addEventListener("change",(event) => {
      state.status = event.target.value || "all";
      renderList();
    });

    cleanupLegacyContractArtifacts();
  }

  function renderMetrics() {
    const host = $("c10R5ContractMetrics");
    if (!host) return;

    const real = realContracts();
    const demos = demoContracts();

    const active = real.filter((c) => contractStatus(c) === "active").length;
    const preparing = real.filter((c) =>
      ["draft","proposed","pending","preparing","onboarding"].includes(contractStatus(c))
    ).length;
    const ended = real.filter((c) =>
      ["ended","cancelled","canceled"].includes(contractStatus(c))
    ).length;

    host.innerHTML = `
      <article class="c10-r5-metric">
        <b>${real.length}</b><span>実契約</span><small>本番契約対象</small>
      </article>
      <article class="c10-r5-metric">
        <b>${active}</b><span>運用中</span><small>正式active</small>
      </article>
      <article class="c10-r5-metric">
        <b>${preparing + ended}</b><span>その他の実契約</span><small>準備・停止・終了</small>
      </article>
      <article class="c10-r5-metric demo">
        <b>${demos.length}</b><span>DEMO / テスト</span><small>本番契約には数えない</small>
      </article>
    `;

    const note = $("c10R5ContractNote");
    if (!note) return;

    note.innerHTML = demos.length
      ? `<strong>本番判定：実契約 ${real.length}件</strong>　
         DEMO / テスト契約 ${demos.length}件は、DB上の状態が active でも正式契約として扱いません。
         PRODUCTION本番登録・正式納品・本番集計の対象外です。`
      : `<strong>本番判定：実契約 ${real.length}件</strong>　DEMO / テスト契約はありません。`;
  }

  function statusMatches(contract) {
    if (state.status === "all") return true;
    const status = contractStatus(contract);

    if (state.status === "preparing") {
      return ["draft","proposed","pending","preparing","onboarding"].includes(status);
    }
    if (state.status === "ended") {
      return ["ended","cancelled","canceled"].includes(status);
    }
    return status === state.status;
  }

  function scopeMatches(contract) {
    const demo = isDemoContract(contract);
    if (state.scope === "all") return true;
    if (state.scope === "demo") return demo;
    return !demo;
  }

  function searchMatches(contract) {
    if (!state.search) return true;
    const hay = [
      contractClientName(contract),
      contractClientCode(contract),
      contract.contract_name,
      contract.contract_code,
    ].filter(Boolean).join(" ").toLowerCase();

    return hay.includes(state.search);
  }

  function filteredContracts() {
    return state.contracts.filter((contract) =>
      scopeMatches(contract) &&
      statusMatches(contract) &&
      searchMatches(contract)
    );
  }

  function openClientDetail(clientId) {
    if (!clientId) return;

    document.querySelector('.nav-button[data-view="clients"]')?.click();

    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      const target = document.querySelector(
        `#clientGrid [data-open-client="${CSS.escape(String(clientId))}"]`
      );
      if (target) {
        clearInterval(timer);
        target.click();
      } else if (tries >= 35) {
        clearInterval(timer);
      }
    },100);
  }

  function renderList() {
    const list = $("c10R5ContractList");
    const result = $("c10R5ContractResult");
    const empty = $("c10R5ContractEmpty");
    if (!list || !result || !empty || !state.loaded) return;

    const rows = filteredContracts();
    result.textContent = `${rows.length}件`;

    if (!rows.length) {
      const demoCount = demoContracts().length;

      list.innerHTML = "";
      list.style.display = "none";

      empty.classList.remove("hidden");
      empty.innerHTML =
        state.scope === "production"
          ? `現在、表示条件に一致する正式な実契約はありません。<br>DEMO / テスト契約 ${demoCount}件は「DEMO / テストのみ」で確認できます。`
          : state.scope === "demo"
            ? "現在、表示条件に一致するDEMO / テスト契約はありません。"
            : "表示条件に一致する契約はありません。";

      return;
    }

    empty.classList.add("hidden");
    empty.innerHTML = "";
    list.style.display = "grid";

    list.innerHTML = rows.map((contract) => {
      const demo = isDemoContract(contract);
      const rawStatus = contractStatus(contract);
      const startsOn = contract.starts_on || contract.start_date || contract.contract_start_date;
      const endsOn = contract.ends_on || contract.end_date || contract.contract_end_date;
      const projectLinked = Boolean(contract.project_id);
      const systemLinked = Boolean(contract.system_instance_id);

      return `
        <article class="c10-r5-card ${demo ? "demo" : ""}">
          <div class="c10-r5-card-head">
            <div>
              <div class="c10-r5-code">${esc(contract.contract_code || "契約コード未設定")}</div>
              <h3>${esc(contract.contract_name || "契約名未設定")}</h3>
              <div class="c10-r5-client">
                ${esc(contractClientName(contract))}
                ${contractClientCode(contract) ? `｜${esc(contractClientCode(contract))}` : ""}
              </div>
            </div>
            <span class="c10-r5-pill ${toneForContract(contract)}">
              ${esc(formalStatusLabel(contract))}
            </span>
          </div>

          <div class="c10-r5-details">
            <div class="c10-r5-detail">
              <small>契約開始日</small>
              <strong>${esc(formatDate(startsOn))}</strong>
            </div>
            <div class="c10-r5-detail">
              <small>制作案件</small>
              <strong>${projectLinked ? "接続済み" : "未接続"}</strong>
            </div>
            <div class="c10-r5-detail">
              <small>本番システム</small>
              <strong>${systemLinked && !demo ? "接続済み" : demo ? "対象外" : "未接続"}</strong>
            </div>
          </div>

          ${
            demo
              ? `<div class="c10-r5-demo-warning">
                   <strong>検査用データです。</strong>
                   DB上の状態：${esc(rawStatus || "未設定")}。
                   この状態値は正式契約判定には使用せず、PRODUCTION本番・正式納品へは進みません。
                 </div>`
              : endsOn
                ? `<div class="c10-r5-demo-warning">契約終了予定・終了日：${esc(formatDate(endsOn))}</div>`
                : ""
          }

          <div class="c10-r5-actions">
            <button class="c10-r5-btn" type="button"
              data-c10-r5-client="${esc(contract.client_id || "")}">
              顧客詳細を開く
            </button>
          </div>
        </article>
      `;
    }).join("");

    $$("[data-c10-r5-client]",list).forEach((button) => {
      button.addEventListener("click",() => {
        openClientDetail(button.dataset.c10R5Client);
      });
    });
  }

  function render() {
    renderShell();
    renderMetrics();
    renderList();
  }

  async function bootstrap() {
    const contractView = $("view-contracts");
    if (!contractView) return;

    injectStyles();
    renderShell();
    cleanupLegacyContractArtifacts();

    const cleanupObserver = new MutationObserver(() => {
      cleanupLegacyContractArtifacts();
    });
    cleanupObserver.observe(contractView,{childList:true,subtree:false});
    setTimeout(() => cleanupObserver.disconnect(),15000);

    for (let attempt=0; attempt<24; attempt+=1) {
      try {
        const shell = $("appShell");
        const appReady = Boolean(shell && !shell.classList.contains("hidden"));
        if (appReady && await loadData()) return;
      } catch (error) {
        console.warn(BUILD,error);
      }
      await new Promise((resolve) => setTimeout(resolve,400));
    }

    const list = $("c10R5ContractList");
    const empty = $("c10R5ContractEmpty");
    if (list) {
      list.innerHTML = "";
      list.style.display = "none";
    }
    if (empty) {
      empty.classList.remove("hidden");
      empty.textContent = "契約情報を読み込めませんでした。接続確認後に再読み込みしてください。";
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded",bootstrap,{once:true});
  } else {
    bootstrap();
  }
})();
