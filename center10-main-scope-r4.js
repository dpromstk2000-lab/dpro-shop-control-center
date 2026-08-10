(() => {
  "use strict";

  if (window.__DPRO_CENTER10_MAIN_SCOPE_R4__) return;
  window.__DPRO_CENTER10_MAIN_SCOPE_R4__ = true;
  window.__DPRO_CENTER10_MAIN_SCOPE_R4_R1__ = true;

  const BUILD = "CONTROL-CENTER-32-CENTER10-R7-R4-R1-CLIENT-VISIBILITY-20260810";
  const CONFIG = window.DPRO_CONTROL_CENTER_CONFIG || {};
  const $ = (id) => document.getElementById(id);
  const $$ = (selector, scope=document) => Array.from(scope.querySelectorAll(selector));

  const state = {
    supabase:null,
    session:null,
    clients:[],
    pending:[],
    tables:{
      line:null,
      systems:null,
      websites:null,
      tasks:null,
      support:null,
    },
    security:null,
    loaded:false,
    applyingClients:false,
    metricObserver:null,
    clientObserver:null,
    dashboardClientObserver:null,
    refreshTimer:null,
  };

  const CLOSED_TASK = new Set(["done","cancelled"]);
  const CLOSED_SUPPORT = new Set(["resolved","closed","completed","cancelled","ended"]);
  const CLOSED_RESET = new Set(["completed","expired","revoked","cancelled","failed","used"]);

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
  }

  function formatDate(value, includeTime=false) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return new Intl.DateTimeFormat("ja-JP", includeTime
      ? {year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"}
      : {year:"numeric",month:"2-digit",day:"2-digit"}
    ).format(date);
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

  function clientById(id) {
    return state.clients.find((client) => String(client.id) === String(id)) || null;
  }

  function demoClientIds() {
    return new Set(state.clients.filter(isDemoClient).map((client) => String(client.id)));
  }

  function realClients() {
    return state.clients.filter((client) => !isDemoClient(client));
  }

  function demoClients() {
    return state.clients.filter(isDemoClient);
  }

  function rowIsDemo(row) {
    if (!row) return false;
    if (row.is_demo === true || row.is_test === true) return true;

    const ids = demoClientIds();
    if (row.client_id != null && ids.has(String(row.client_id))) return true;

    const code = String(row.client_code || "").trim().toUpperCase();
    if (
      code.startsWith("CL-DEMO-") ||
      code.startsWith("DEMO-") ||
      code.startsWith("TEST-")
    ) return true;

    const name = String(row.client_name || row.display_name || "").trim();
    if (name) {
      const demoNames = new Set(
        demoClients().flatMap((client) =>
          [client.display_name, client.legal_name, client.trade_name]
            .filter(Boolean)
            .map(String)
        )
      );
      if (demoNames.has(name)) return true;
    }

    return false;
  }

  function realRows(rows) {
    return Array.isArray(rows) ? rows.filter((row) => !rowIsDemo(row)) : [];
  }

  function toneForStatus(status) {
    if (["done","received","active","ok","public","resolved","closed"].includes(status)) return "green";
    if (["waiting_client","waiting_internal","warning","overdue","degraded"].includes(status)) return "amber";
    if (["error","urgent","critical"].includes(status)) return "red";
    if (["preparing","onboarding","in_progress","scheduled"].includes(status)) return "blue";
    return "";
  }

  function pill(text, tone="") {
    return `<span class="pill ${tone}">${esc(text)}</span>`;
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

  async function safeRows(table) {
    try {
      const {data,error} = await state.supabase.from(table).select("*");
      if (error) throw error;
      return data || [];
    } catch (error) {
      console.warn(`${BUILD}: optional table ${table}`, error);
      return null;
    }
  }

  async function loadSecurityOptional() {
    try {
      const base = String(CONFIG.apiBaseUrl || "").replace(/\/$/,"");
      const token = state.session?.access_token || "";
      if (!token) return null;

      const response = await fetch(`${base}/api/security/overview`, {
        cache:"no-store",
        headers:{authorization:`Bearer ${token}`},
      });
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }

  async function loadData() {
    if (!(await initSupabase())) return false;

    const [clientsResult,pendingResult,line,systems,websites,tasks,support,security] = await Promise.all([
      state.supabase.from("cc_v_client_overview").select("*").order("display_name",{ascending:true}),
      state.supabase.from("cc_v_pending_work").select("*").order("due_at",{ascending:true,nullsFirst:false}),
      safeRows("cc_line_accounts"),
      safeRows("cc_system_instances"),
      safeRows("cc_websites"),
      safeRows("cc_tasks"),
      safeRows("cc_support_cases"),
      loadSecurityOptional(),
    ]);

    if (clientsResult.error) throw clientsResult.error;
    if (pendingResult.error) throw pendingResult.error;

    state.clients = clientsResult.data || [];
    state.pending = pendingResult.data || [];
    state.tables = {line,systems,websites,tasks,support};
    state.security = security;
    state.loaded = true;

    applyAll();
    return true;
  }

  function injectStyles() {
    if ($("c10R4MainScopeStyles")) return;

    const style = document.createElement("style");
    style.id = "c10R4MainScopeStyles";
    style.textContent = `
      .c10-r4-scope-note{
        margin:12px 0 18px;padding:12px 14px;border:1px solid #d7e3eb;border-radius:12px;
        background:#f4f8fb;color:#506977;font-size:12px;line-height:1.7
      }
      .c10-r4-scope-note strong{color:#244c42}
      .c10-r4-demo-badge{
        display:inline-flex;align-items:center;margin-left:8px;padding:3px 8px;border-radius:999px;
        background:#edf2f6;color:#596f7c;font-size:10px;font-weight:900
      }
      .client-card[data-c10-r4-scope="demo"]{
        border-color:#d7e0e8;background:#f9fbfc
      }
      .client-card[hidden]{
        display:none !important
      }
      .c10-r4-scope-empty{
        padding:28px;border:1px dashed #cddbd5;border-radius:14px;background:#fff;
        text-align:center;color:#687a72;font-size:13px;line-height:1.8
      }
      .c10-r4-contract-note{
        margin-top:14px;padding:14px;border:1px solid #d7e3eb;border-radius:12px;
        background:#f4f8fb;color:#506977;font-size:13px;line-height:1.75
      }
      #clientScopeFilter{min-width:150px}
    `;
    document.head.appendChild(style);
  }

  function existingMetricMap() {
    const map = new Map();
    $$("#metricGrid .metric-card").forEach((card) => {
      const label = card.querySelector("span")?.textContent?.trim();
      const value = Number(String(card.querySelector("b")?.textContent || "0").replace(/,/g,""));
      if (label) map.set(label, Number.isFinite(value) ? value : 0);
    });
    return map;
  }

  function countWebsiteSyncErrors(rows) {
    return realRows(rows).filter((item) => {
      const candidates = [
        item.sync_health,
        item.last_sync_status,
        item.latest_run_status,
        item.sync_status,
      ].map((v) => String(v || "").toLowerCase());
      return candidates.includes("error");
    }).length;
  }

  function activeResetCount(existing) {
    const result = state.security;
    const rows = result?.resets || result?.requests || result?.resetRequests;
    if (!Array.isArray(rows)) return existing;

    return realRows(rows).filter((row) =>
      !CLOSED_RESET.has(String(row.status || "").toLowerCase())
    ).length;
  }

  function renderDashboardMetrics() {
    const grid = $("metricGrid");
    if (!grid || !state.loaded) return;

    const existing = existingMetricMap();
    const clients = realClients();
    const line = state.tables.line;
    const systems = state.tables.systems;
    const websites = state.tables.websites;
    const tasks = state.tables.tasks;
    const support = state.tables.support;

    const activeClients = clients.filter((c) => c.status === "active").length;

    const activeLine = Array.isArray(line)
      ? realRows(line).filter((x) => String(x.status || "") === "active").length
      : (existing.get("LINE公式運用") || 0);

    const activeSystems = Array.isArray(systems)
      ? realRows(systems).filter((x) => ["active","degraded"].includes(String(x.status || ""))).length
      : (existing.get("DPROシステム") || 0);

    const publicWebsites = Array.isArray(websites)
      ? realRows(websites).filter((x) => String(x.publication_status || "") === "public").length
      : (existing.get("公開ホームページ") || 0);

    const realTaskRows = Array.isArray(tasks) ? realRows(tasks) : null;
    const openTasks = realTaskRows
      ? realTaskRows.filter((x) => !CLOSED_TASK.has(String(x.status || ""))).length
      : (existing.get("未完了タスク") || 0);
    const waitingTasks = realTaskRows
      ? realTaskRows.filter((x) => String(x.status || "") === "waiting_client").length
      : 0;

    const openSupport = Array.isArray(support)
      ? realRows(support).filter((x) => !CLOSED_SUPPORT.has(String(x.status || "").toLowerCase())).length
      : (existing.get("サポート案件") || 0);

    const unhealthy = Array.isArray(systems)
      ? realRows(systems).filter((x) => {
          const statuses = [
            x.status, x.health_status, x.last_health_status, x.connection_status
          ].map((v) => String(v || "").toLowerCase());
          return statuses.some((v) => ["degraded","warning","error"].includes(v));
        }).length
      : (existing.get("システム異常") || 0);

    const syncErrors = Array.isArray(websites)
      ? countWebsiteSyncErrors(websites)
      : (existing.get("連動エラー") || 0);

    const resetCount = activeResetCount(existing.get("コード復旧中") || 0);

    const metrics = [
      [activeClients,"運用中の顧客","実顧客のみ",""],
      [activeLine,"LINE公式運用","実顧客のみ",""],
      [activeSystems,"DPROシステム","実顧客のみ",unhealthy?"warning":""],
      [publicWebsites,"公開ホームページ","実顧客のみ",""],
      [openTasks,"未完了タスク",`回答待ち ${waitingTasks}件`,waitingTasks?"warning":""],
      [openSupport,"サポート案件","実顧客のみ",openSupport?"warning":""],
      [unhealthy,"システム異常","実顧客のみ",unhealthy?"danger":""],
      [syncErrors,"連動エラー","実顧客のみ",syncErrors?"danger":""],
      [resetCount,"コード復旧中","実顧客・内部申請",resetCount?"warning":""],
    ];

    const html = metrics.map(([value,label,note,tone]) => `
      <article class="metric-card ${tone}">
        <b>${Number(value || 0).toLocaleString("ja-JP")}</b>
        <span>${esc(label)}</span>
        <small>${esc(note)}</small>
      </article>
    `).join("");

    if (grid.innerHTML !== html) {
      if (state.metricObserver) state.metricObserver.disconnect();
      grid.innerHTML = html;
      observeMetricGrid();
    }

    let note = $("dashboardScopeNoteR4");
    if (!note) {
      note = document.createElement("div");
      note.id = "dashboardScopeNoteR4";
      grid.insertAdjacentElement("afterend", note);
    }
    note.className = "c10-r4-scope-note";
    note.innerHTML = `
      <strong>本番管理：実顧客 ${realClients().length}件</strong>　
      DEMO / テスト顧客 ${demoClients().length}件は、ダッシュボードの本番件数・優先対応から除外しています。
      DEMOは「全顧客 → DEMO / テストのみ」で確認できます。
    `;
  }

  function renderDashboardTasks() {
    const board = $("dashboardTasks");
    if (!board || !state.loaded) return;

    const rows = realRows(state.pending).slice(0,6);
    board.innerHTML = rows.length ? rows.map((task) => `
      <article class="list-item">
        <div class="list-item-main">
          <strong>${esc(task.title)}</strong>
          <p>${esc(task.client_name || "DPRO内部")}・${esc(task.task_code || "")}</p>
        </div>
        <div class="list-item-meta">
          ${pill(String(task.status || ""), toneForStatus(String(task.status || "")))}
          <p>${task.due_at ? formatDate(task.due_at,true) : "期限なし"}</p>
        </div>
      </article>
    `).join("") : '<div class="empty-state">現在、実顧客の未完了タスクはありません。</div>';
  }

  function dashboardClientScore(client) {
    return Number(client.open_task_count || 0) +
      (client.owner_response_status === "waiting" ? 5 : 0) +
      (client.owner_response_status === "overdue" ? 8 : 0);
  }

  function bindDashboardClientButtons() {
    $$("[data-c10-r4-open-client]", $("dashboardClients")).forEach((button) => {
      button.onclick = () => {
        const id = button.dataset.c10R4OpenClient;
        document.querySelector('.nav-button[data-view="clients"]')?.click();

        let tries = 0;
        const timer = setInterval(() => {
          tries += 1;
          const target = document.querySelector(`#clientGrid [data-open-client="${CSS.escape(id)}"]`);
          if (target) {
            clearInterval(timer);
            target.click();
          } else if (tries >= 30) {
            clearInterval(timer);
          }
        },100);
      };
    });
  }

  function renderDashboardClients() {
    const board = $("dashboardClients");
    if (!board || !state.loaded) return;

    const rows = [...realClients()]
      .sort((a,b) => dashboardClientScore(b) - dashboardClientScore(a))
      .slice(0,6);

    board.innerHTML = rows.length ? rows.map((client) => `
      <button class="list-item" type="button" data-c10-r4-open-client="${esc(client.id)}">
        <div class="list-item-main">
          <strong>${esc(client.display_name)}</strong>
          <p>${esc(client.client_code)}・未完了 ${Number(client.open_task_count || 0)}件</p>
        </div>
        <div class="list-item-meta">
          ${pill(
            client.owner_response_status === "waiting" ? "回答待ち" :
            client.owner_response_status === "overdue" ? "回答期限超過" :
            client.owner_response_status === "received" ? "回答済み" : "確認なし",
            toneForStatus(client.owner_response_status)
          )}
        </div>
      </button>
    `).join("") : '<div class="empty-state">現在、確認対象の実顧客はありません。</div>';

    bindDashboardClientButtons();
  }

  function ensureClientScopeFilter() {
    const status = $("clientStatusFilter");
    if (!status) return;

    let select = $("clientScopeFilter");
    if (!select) {
      select = document.createElement("select");
      select.id = "clientScopeFilter";
      select.innerHTML = `
        <option value="production">実顧客のみ</option>
        <option value="demo">DEMO / テストのみ</option>
        <option value="all">すべて表示</option>
      `;
      status.insertAdjacentElement("beforebegin",select);
      select.addEventListener("change",applyClientScope);
    }
  }

  function markDemoCard(card) {
    if (card.querySelector(".c10-r4-demo-badge")) return;
    const title = card.querySelector(".client-card-head h2");
    if (!title) return;

    const badge = document.createElement("span");
    badge.className = "c10-r4-demo-badge";
    badge.textContent = "DEMO / テスト";
    title.insertAdjacentElement("afterend",badge);
  }

  function removeDemoCardBadge(card) {
    card.querySelector(".c10-r4-demo-badge")?.remove();
  }

  function applyClientScope() {
    if (!state.loaded || state.applyingClients) return;
    const grid = $("clientGrid");
    if (!grid) return;

    state.applyingClients = true;
    try {
      const scope = $("clientScopeFilter")?.value || "production";
      const cards = $$(".client-card",grid);
      let visible = 0;

      cards.forEach((card) => {
        const button = card.querySelector("[data-open-client]");
        const id = button?.dataset.openClient || "";
        const client = clientById(id);
        const demo = isDemoClient(client);

        card.dataset.c10R4Scope = demo ? "demo" : "production";

        const show =
          scope === "all" ||
          (scope === "demo" && demo) ||
          (scope === "production" && !demo);

        card.hidden = !show;
        card.style.display = show ? "" : "none";
        card.setAttribute("aria-hidden", show ? "false" : "true");
        if (show) visible += 1;

        if (demo) markDemoCard(card);
        else removeDemoCardBadge(card);
      });

      let empty = $("clientScopeEmptyR4");
      if (!empty) {
        empty = document.createElement("div");
        empty.id = "clientScopeEmptyR4";
        empty.className = "c10-r4-scope-empty";
        grid.insertAdjacentElement("afterend",empty);
      }

      const originalEmpty = grid.querySelector(".empty-state");
      if (cards.length && visible === 0) {
        empty.hidden = false;
        if (scope === "production") {
          empty.innerHTML = `現在、表示条件に一致する実顧客はいません。<br>DEMO / テスト顧客 ${demoClients().length}件は別表示です。`;
        } else if (scope === "demo") {
          empty.textContent = "現在、表示条件に一致するDEMO / テスト顧客はいません。";
        } else {
          empty.textContent = "条件に一致する顧客はありません。";
        }
        if (originalEmpty) originalEmpty.hidden = true;
      } else {
        empty.hidden = true;
        if (originalEmpty) originalEmpty.hidden = false;
      }

      const count = $("clientResultCount");
      if (count) count.textContent = `${visible}件`;
    } finally {
      state.applyingClients = false;
    }
  }

  function markClientDetail() {
    if (!state.loaded) return;
    const detail = $("clientDetail");
    if (!detail) return;

    detail.querySelector(".c10-r4-scope-note[data-detail]")?.remove();

    const code = detail.querySelector(".client-code")?.textContent?.trim() || "";
    const client = state.clients.find((c) => String(c.client_code || "") === code);
    if (!client || !isDemoClient(client)) return;

    const hero = detail.querySelector(".detail-hero");
    if (!hero) return;

    const note = document.createElement("div");
    note.className = "c10-r4-scope-note";
    note.dataset.detail = "true";
    note.innerHTML = `
      <strong>DEMO / テスト顧客です。</strong>
      ダッシュボード本番件数・実契約制作・PRODUCTION本番登録の対象外です。
      検査用データとしてのみ利用します。
    `;
    hero.insertAdjacentElement("afterend",note);
  }

  function enhanceContractsView() {
    const view = $("view-contracts");
    if (!view || $("contractsScopeNoteR4")) return;

    const note = document.createElement("div");
    note.id = "contractsScopeNoteR4";
    note.className = "c10-r4-contract-note";
    note.innerHTML = `
      <strong>契約の本番判定について</strong><br>
      通常運用では実顧客のみを本番対象として扱います。
      DEMO / テスト顧客は顧客詳細で確認できますが、PRODUCTION本番登録・正式納品には進みません。
    `;
    view.appendChild(note);
  }

  function applyAll() {
    if (!state.loaded) return;
    injectStyles();
    ensureClientScopeFilter();
    renderDashboardMetrics();
    renderDashboardTasks();
    renderDashboardClients();
    applyClientScope();
    markClientDetail();
    enhanceContractsView();
  }

  function observeMetricGrid() {
    const grid = $("metricGrid");
    if (!grid) return;

    state.metricObserver?.disconnect();
    state.metricObserver = new MutationObserver(() => {
      clearTimeout(state.refreshTimer);
      state.refreshTimer = setTimeout(() => {
        if (state.loaded) renderDashboardMetrics();
      },80);
    });
    state.metricObserver.observe(grid,{childList:true,subtree:true});
  }

  function installObservers() {
    observeMetricGrid();

    const clientGrid = $("clientGrid");
    if (clientGrid) {
      state.clientObserver = new MutationObserver(() => {
        setTimeout(applyClientScope,0);
      });
      state.clientObserver.observe(clientGrid,{childList:true,subtree:true});
    }

    const dashboardClients = $("dashboardClients");
    if (dashboardClients) {
      state.dashboardClientObserver = new MutationObserver(() => {
        if (!state.loaded) return;
        clearTimeout(state.refreshTimer);
        state.refreshTimer = setTimeout(() => {
          renderDashboardTasks();
          renderDashboardClients();
        },80);
      });
      state.dashboardClientObserver.observe(dashboardClients,{childList:true,subtree:true});
    }

    const detail = $("clientDetail");
    if (detail) {
      new MutationObserver(() => {
        if (state.loaded) setTimeout(markClientDetail,0);
      }).observe(detail,{childList:true,subtree:true});
    }

    ["clientSearch","clientStatusFilter","clientServiceFilter"].forEach((id) => {
      const el = $(id);
      if (!el) return;
      el.addEventListener(id === "clientSearch" ? "input" : "change",() => {
        setTimeout(applyClientScope,0);
      });
    });

    $("refreshDashboard")?.addEventListener("click",() => {
      setTimeout(() => {
        loadData().catch((error) => console.warn(BUILD,error));
      },700);
    });
  }

  async function bootstrap() {
    if (!$("view-dashboard") || !$("view-clients")) return;

    injectStyles();
    ensureClientScopeFilter();
    installObservers();
    enhanceContractsView();

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
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded",bootstrap,{once:true});
  } else {
    bootstrap();
  }
})();
