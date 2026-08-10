(() => {
  "use strict";

  if (window.__DPRO_CENTER10_DELIVERY_SCOPE_R3__) return;
  window.__DPRO_CENTER10_DELIVERY_SCOPE_R3__ = true;

  const BUILD = "CONTROL-CENTER-30-CENTER10-R7-R3-R1-SCOPE-FILTER-20260810";
  const CONFIG = window.DPRO_CONTROL_CENTER_CONFIG || {};
  const $ = (id) => document.getElementById(id);
  const $$ = (selector, scope=document) => Array.from(scope.querySelectorAll(selector));

  const state = {
    supabase:null,
    clients:[],
    projects:[],
    initialized:false,
    reloadTimer:null,
  };

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;")
      .replaceAll("'","&#039;");
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

  function isDemoProject(project) {
    if (!project) return false;
    if (project.is_demo === true || project.is_test === true) return true;

    const scope = scopeText(project);
    if (["demo","test","testing","staging","sample","fixture"].includes(scope)) return true;

    const clientCode = String(project.client_code || "").trim().toUpperCase();
    if (
      clientCode.startsWith("CL-DEMO-") ||
      clientCode.startsWith("DEMO-") ||
      clientCode.startsWith("TEST-")
    ) return true;

    return isDemoClient(clientById(project.client_id));
  }

  function projectByCode(code) {
    return state.projects.find((project) => String(project.project_code || "") === String(code || "")) || null;
  }

  function realProjects() {
    return state.projects.filter((project) => !isDemoProject(project));
  }

  function demoProjects() {
    return state.projects.filter(isDemoProject);
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
      },
    );

    const {data,error} = await state.supabase.auth.getSession();
    if (error) throw error;
    return Boolean(data?.session?.user);
  }

  async function loadScopeData() {
    if (!(await initSupabase())) return false;

    const [clientsResult,projectsResult] = await Promise.all([
      state.supabase.from("cc_clients").select("*").order("display_name"),
      state.supabase.from("cc_v_delivery_project_overview_v2").select("*").order("updated_at",{ascending:false}),
    ]);

    if (clientsResult.error) throw clientsResult.error;
    if (projectsResult.error) throw projectsResult.error;

    state.clients = clientsResult.data || [];
    state.projects = projectsResult.data || [];
    state.initialized = true;

    renderProductionMetrics();
    ensureScopeFilter();
    applyProjectScope();
    groupProjectFormClients();
    updateProjectFormScopeWarning();
    markProjectDetailScope();
    return true;
  }

  function scheduleReload(delay=350) {
    clearTimeout(state.reloadTimer);
    state.reloadTimer = setTimeout(() => {
      loadScopeData().catch((error) => console.warn(BUILD, error));
    }, delay);
  }

  function injectStyles() {
    if ($("c10R3ScopeStyles")) return;
    const style = document.createElement("style");
    style.id = "c10R3ScopeStyles";
    style.textContent = `
      .c10-r3-scope-note{
        margin:12px 0 14px;padding:12px 14px;border:1px solid #d5e3dc;border-radius:12px;
        background:#f4faf7;color:#365c50;font-size:12px;line-height:1.65
      }
      .c10-r3-scope-note.demo{border-color:#d7e1ea;background:#f4f7fa;color:#526977}
      .c10-r3-demo-badge{
        display:inline-flex;align-items:center;margin-left:8px;padding:3px 8px;border-radius:999px;
        background:#eef3f7;color:#596e7b;font-size:10px;font-weight:900;vertical-align:middle
      }
      .c10-r3-scope-empty{
        margin-top:12px;padding:22px;border:1px dashed #cfdcd6;border-radius:14px;
        background:#fff;text-align:center;color:#66766f;font-size:13px;line-height:1.7
      }
      .c10-r3-form-warning{
        grid-column:1/-1;padding:12px 14px;border:1px solid #d5e0e8;border-radius:10px;
        background:#f3f7fa;color:#526a78;font-size:12px;line-height:1.7
      }
      .c10-r3-detail-banner{
        margin:12px 0;padding:12px 14px;border:1px solid #d5e0e8;border-radius:10px;
        background:#f3f7fa;color:#526a78;font-size:12px;font-weight:800;line-height:1.65
      }
      #projectScopeFilter{min-width:150px}
    `;
    document.head.appendChild(style);
  }

  function renderProductionMetrics() {
    const grid = $("metricGrid");
    if (!grid || !state.initialized) return;

    const real = realProjects();
    const demo = demoProjects();

    const total = real.length;
    const live = real.filter((p) => p.status === "live").length;
    const active = real.filter((p) => ["preparing","in_progress","waiting_client","ready_for_review"].includes(p.status)).length;
    const blocked = real.filter((p) => Number(p.blocking_steps_open || 0) + Number(p.blocking_checks_open || 0) > 0).length;
    const ready = real.filter((p) => p.ready_for_delivery).length;
    const waiting = real.filter((p) => p.status === "waiting_client").length;

    const metrics = [
      [total, "制作登録", "実契約・本番制作", ""],
      [active, "制作中", "実契約のみ", active ? "warning" : ""],
      [ready, "納品可能", "実契約のみ", ""],
      [blocked, "未完了あり", "実契約のみ", blocked ? "warning" : ""],
      [waiting, "回答待ち", "実契約のみ", waiting ? "warning" : ""],
      [live, "本番稼働", "実契約のみ", ""],
    ];

    const nextHtml = metrics.map(([value,label,note,tone]) =>
      `<article class="metric ${tone}"><b>${Number(value || 0)}</b><span>${esc(label)}</span><small>${esc(note)}</small></article>`
    ).join("");

    if (grid.innerHTML !== nextHtml) grid.innerHTML = nextHtml;

    let note = $("projectProductionScopeNote");
    if (!note) {
      note = document.createElement("div");
      note.id = "projectProductionScopeNote";
      grid.insertAdjacentElement("afterend", note);
    }
    note.className = `c10-r3-scope-note ${demo.length ? "demo" : ""}`;

    if (demo.length) {
      note.innerHTML = total
        ? `<strong>本番制作 ${total}件を集計中。</strong> DEMO / テスト制作 ${demo.length}件は本番件数・納品可能・本番稼働から除外しています。`
        : `<strong>現在の本番制作案件は0件です。</strong> DEMO / テスト制作 ${demo.length}件は検査用として分離しています。`;
    } else {
      note.innerHTML = `<strong>本番制作 ${total}件を集計中。</strong> DEMO / テスト制作はありません。`;
    }
  }

  function ensureScopeFilter() {
    const status = $("projectStatusFilter");
    if (!status) return;

    let select = $("projectScopeFilter");
    if (!select) {
      select = document.createElement("select");
      select.id = "projectScopeFilter";
      select.innerHTML = `
        <option value="production">実契約のみ</option>
        <option value="demo">DEMO / テストのみ</option>
        <option value="all">すべて表示</option>
      `;
      status.insertAdjacentElement("beforebegin", select);
      select.addEventListener("change", applyProjectScope);
    }
  }

  function addDemoBadge(card) {
    if (card.querySelector(".c10-r3-demo-badge")) return;
    const code = card.querySelector(".project-code");
    if (!code) return;
    const badge = document.createElement("span");
    badge.className = "c10-r3-demo-badge";
    badge.textContent = "DEMO / テスト";
    code.insertAdjacentElement("afterend", badge);
  }

  function removeDemoBadge(card) {
    card.querySelector(".c10-r3-demo-badge")?.remove();
  }

  function applyProjectScope() {
    const grid = $("projectGrid");
    if (!grid || !state.initialized) return;

    const scope = $("projectScopeFilter")?.value || "production";
    const cards = $$(".project-card", grid);
    let visible = 0;
    let unknown = false;

    cards.forEach((card) => {
      const code = card.querySelector(".project-code")?.textContent?.trim() || "";
      const project = projectByCode(code);

      if (!project) {
        card.hidden = true;
        card.dataset.r3Scope = "unknown";
        unknown = true;
        return;
      }

      const demo = isDemoProject(project);
      card.dataset.r3Scope = demo ? "demo" : "production";

      const show =
        scope === "all" ||
        (scope === "demo" && demo) ||
        (scope === "production" && !demo);

      card.hidden = !show;
      if (show) visible += 1;

      if (demo) addDemoBadge(card);
      else removeDemoBadge(card);
    });

    const baseEmpty = grid.querySelector(".empty");
    if (baseEmpty) {
      baseEmpty.hidden = false;
    }

    let empty = $("projectScopeEmpty");
    if (!empty) {
      empty = document.createElement("div");
      empty.id = "projectScopeEmpty";
      empty.className = "c10-r3-scope-empty";
      grid.insertAdjacentElement("afterend", empty);
    }

    if (cards.length && visible === 0) {
      empty.hidden = false;
      if (scope === "production") {
        empty.innerHTML = `現在、実契約の制作案件はありません。<br>DEMO / テスト制作 ${demoProjects().length}件は「DEMO / テストのみ」で確認できます。`;
      } else if (scope === "demo") {
        empty.textContent = "現在、DEMO / テスト制作案件はありません。";
      } else {
        empty.textContent = "表示できる制作案件はありません。";
      }
    } else {
      empty.hidden = true;
    }

    const resultCount = $("projectResultCount");
    if (resultCount && cards.length) resultCount.textContent = `${visible}件`;

    if (unknown) scheduleReload(500);
  }

  function groupProjectFormClients() {
    const select = $("formClient");
    if (!select || !state.clients.length) return;
    if (select.querySelector('optgroup[data-r3-group="true"]')) return;

    const current = select.value;
    const options = Array.from(select.options);
    if (!options.length) return;

    const placeholder = options.find((option) => !option.value)?.cloneNode(true);
    const realGroup = document.createElement("optgroup");
    realGroup.label = "実契約・本番制作";
    realGroup.dataset.r3Group = "true";

    const demoGroup = document.createElement("optgroup");
    demoGroup.label = "DEMO / テスト（検査用）";
    demoGroup.dataset.r3Group = "true";

    options.filter((option) => option.value).forEach((option) => {
      const clone = option.cloneNode(true);
      const client = clientById(option.value);
      if (isDemoClient(client)) {
        clone.textContent = `［DEMO］${clone.textContent}`;
        demoGroup.appendChild(clone);
      } else {
        realGroup.appendChild(clone);
      }
    });

    select.replaceChildren();
    if (placeholder) select.appendChild(placeholder);
    if (realGroup.children.length) select.appendChild(realGroup);
    if (demoGroup.children.length) select.appendChild(demoGroup);

    if ([...select.options].some((option) => option.value === current)) select.value = current;
  }

  function updateProjectFormScopeWarning() {
    const form = $("projectForm");
    const clientSelect = $("formClient");
    const message = $("projectFormMessage");
    if (!form || !clientSelect || !message) return;

    let warning = $("c10R3ProjectFormScopeWarning");
    if (!warning) {
      warning = document.createElement("div");
      warning.id = "c10R3ProjectFormScopeWarning";
      warning.className = "c10-r3-form-warning";
      message.insertAdjacentElement("beforebegin", warning);
    }

    const client = clientById(clientSelect.value);
    if (client && isDemoClient(client)) {
      warning.hidden = false;
      warning.innerHTML = `<strong>DEMO / テスト制作です。</strong> 本番集計・PRODUCTION本番登録・正式納品の対象には入りません。動作確認用として利用できます。`;
    } else {
      warning.hidden = true;
      warning.textContent = "";
    }
  }

  function markProjectDetailScope() {
    const detail = $("detailContent");
    if (!detail || !state.initialized) return;

    detail.querySelector(".c10-r3-detail-banner")?.remove();

    const code = detail.querySelector(".project-code")?.textContent?.trim() || "";
    if (!code) return;

    const project = projectByCode(code);
    if (!project || !isDemoProject(project)) return;

    const header = detail.querySelector(".detail-title");
    if (!header) return;

    const banner = document.createElement("div");
    banner.className = "c10-r3-detail-banner";
    banner.innerHTML = `DEMO / テスト制作案件です。本番の制作件数・納品可能・本番稼働には集計されません。検査用データとして操作できます。`;
    header.insertAdjacentElement("afterend", banner);
  }

  function installObservers() {
    const metricGrid = $("metricGrid");
    if (metricGrid) {
      new MutationObserver(() => renderProductionMetrics())
        .observe(metricGrid, {childList:true,subtree:true});
    }

    const projectGrid = $("projectGrid");
    if (projectGrid) {
      new MutationObserver(() => applyProjectScope())
        .observe(projectGrid, {childList:true,subtree:true});
    }

    const clientSelect = $("formClient");
    if (clientSelect) {
      new MutationObserver(() => {
        groupProjectFormClients();
        updateProjectFormScopeWarning();
      }).observe(clientSelect, {childList:true,subtree:true});

      clientSelect.addEventListener("change", () => {
        setTimeout(updateProjectFormScopeWarning, 0);
      });
    }

    const detail = $("detailContent");
    if (detail) {
      new MutationObserver(() => markProjectDetailScope())
        .observe(detail, {childList:true,subtree:true});
    }

    $("projectStatusFilter")?.addEventListener("change", () => setTimeout(applyProjectScope, 0));
    $("projectSearch")?.addEventListener("input", () => setTimeout(applyProjectScope, 0));

    $("refreshButton")?.addEventListener("click", () => scheduleReload(900));
    $("newProjectButton")?.addEventListener("click", () => {
      setTimeout(() => {
        groupProjectFormClients();
        updateProjectFormScopeWarning();
      }, 80);
    });

    $("projectForm")?.addEventListener("submit", () => scheduleReload(1300));
  }

  async function bootstrap() {
    injectStyles();
    ensureScopeFilter();
    installObservers();

    for (let attempt=0; attempt<20; attempt+=1) {
      try {
        const ok = await loadScopeData();
        if (ok) return;
      } catch (error) {
        console.warn(BUILD, error);
      }
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap, {once:true});
  } else {
    bootstrap();
  }
})();
