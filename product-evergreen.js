(() => {
  "use strict";

  const BUILD = "DPRO-PRODUCT-EVERGREEN-EVG03-R1-20260922";
  const API_BASE = "https://dpro-shop-control-center-api.dpromstk2000.workers.dev";
  const $ = (id) => document.getElementById(id);
  const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));

  const state = {
    supabase: null,
    session: null,
    staff: null,
    summary: null,
    systems: [],
    currentRun: null,
    standardItems: new Map(),
    selected: null,
  };

  const roleLabels = {
    owner_admin: "管理責任者",
    technical_admin: "技術管理者",
    support: "DPROサポート",
    read_only: "閲覧専用",
  };

  const statusMeta = {
    SYSTEM_REOPEN_REQUIRED: ["SYSTEM再開審査", "reopen", 100],
    HOLD: ["HOLD", "hold", 90],
    BRUSHUP_REQUIRED: ["ブラッシュアップ必要", "brushup", 80],
    AUDIT_REQUIRED: ["監査必要", "audit", 70],
    IN_PROGRESS: ["監査中", "progress", 60],
    REFRESH_RECOMMENDED: ["更新推奨", "refresh", 40],
    CURRENT: ["CURRENT", "current", 10],
  };

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (c) => ({
      "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
    }[c]));
  }

  function safeUrl(value) {
    try {
      const url = new URL(String(value || ""));
      return ["https:", "http:"].includes(url.protocol) ? url.href : "";
    } catch { return ""; }
  }

  function showOnly(id) {
    ["loadingScreen","authScreen","errorScreen","app"].forEach((x) => $(x)?.classList.toggle("hidden", x !== id));
  }

  function toast(message, error = false) {
    const el = $("toast");
    el.textContent = message;
    el.className = `toast${error ? " error" : ""}`;
    el.classList.remove("hidden");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.add("hidden"), 4200);
  }

  function formatDate(value, includeTime = false) {
    if (!value) return "—";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return new Intl.DateTimeFormat("ja-JP", includeTime
      ? {year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"}
      : {year:"numeric",month:"2-digit",day:"2-digit"}
    ).format(d);
  }

  function pill(status) {
    const meta = statusMeta[status] || [status || "—", ""];
    return `<span class="pill ${meta[1]}">${esc(meta[0])}</span>`;
  }

  function registryPill(status) {
    if (status === "CATALOG_SYNC_REQUIRED") return '<span class="pill sync">製品台帳同期必要</span>';
    if (status === "CATALOG_AND_RELEASE") return '<span class="pill current">Catalog + Release</span>';
    if (status === "CATALOG_ONLY") return '<span class="pill">Catalog</span>';
    return `<span class="pill">${esc(status || "—")}</span>`;
  }

  function nextAction(row) {
    if (row.final_lock_reopen_required || row.evergreen_status === "SYSTEM_REOPEN_REQUIRED") {
      return ["人判断が必要", "SYSTEM FINAL LOCK再開審査。自動解除しない。"];
    }
    if (row.evergreen_status === "HOLD") return ["HOLDを確認", "重大Blockerの人判断を先に行う。"];
    if (row.evergreen_status === "BRUSHUP_REQUIRED") return ["BRUSHUP START ZIP", "差分だけを修正する。EVG-04でZIP生成。"];
    if (row.evergreen_status === "AUDIT_REQUIRED") return ["現行基準監査を開始", "現在のDPRO MASTERで監査を発行する。"];
    if (row.evergreen_status === "IN_PROGRESS") return ["証拠確認を続ける", `未確認 ${Number(row.unknown_count || 0)}件 / Blocker ${Number(row.blocking_unknown_count || 0)}件`];
    if (row.evergreen_status === "REFRESH_RECOMMENDED") return ["Evidence更新", "非Blockerの証拠・公開物を更新する。"];
    return ["次作業なし", "現行DPRO MASTERに対してCURRENT。"];
  }

  function priority(row) {
    const base = statusMeta[row.evergreen_status]?.[2] || 50;
    return base * 10000
      + Number(row.blocking_fail_count || 0) * 500
      + Number(row.blocking_review_count || 0) * 300
      + Number(row.blocking_unknown_count || 0) * 10
      + (row.registry_status === "CATALOG_SYNC_REQUIRED" ? 5 : 0);
  }

  async function waitForSupabase() {
    return new Promise((resolve, reject) => {
      let tries = 0;
      const timer = setInterval(() => {
        tries += 1;
        if (window.supabase?.createClient) {
          clearInterval(timer);
          resolve();
        } else if (tries > 100) {
          clearInterval(timer);
          reject(new Error("Supabase接続ライブラリを読み込めませんでした。"));
        }
      }, 60);
    });
  }

  async function publicConfig() {
    const response = await fetch(`${API_BASE}/api/public-config`, {cache:"no-store"});
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error || "公開接続設定を取得できませんでした。");
    return data;
  }

  async function boot() {
    try {
      $("loadingText").textContent = `${BUILD} / 接続確認中…`;
      const pub = await publicConfig();
      await waitForSupabase();

      state.supabase = window.supabase.createClient(
        pub.supabaseUrl,
        pub.supabasePublishableKey || pub.supabaseAnonKey,
        {
          auth:{
            persistSession:true,
            autoRefreshToken:true,
            detectSessionInUrl:false,
            storageKey:pub.sessionStorageKey || "dpro-control-center-auth-v1"
          }
        }
      );

      const {data:{session}, error:sessionError} = await state.supabase.auth.getSession();
      if (sessionError) throw sessionError;
      state.session = session;
      if (!session) {
        showOnly("authScreen");
        return;
      }

      const {data:staff, error:staffError} = await state.supabase
        .from("cc_staff")
        .select("id,display_name,role_key,status")
        .eq("auth_user_id", session.user.id)
        .maybeSingle();
      if (staffError) throw staffError;
      if (!staff || staff.status !== "active") {
        showOnly("authScreen");
        return;
      }
      state.staff = staff;

      $("staffName").textContent = staff.display_name || "DPROスタッフ";
      $("staffRole").textContent = roleLabels[staff.role_key] || staff.role_key || "DPROスタッフ";
      $("staffInitial").textContent = (staff.display_name || "D").trim().slice(0,1).toUpperCase();

      bind();
      await loadAll();
      showOnly("app");
    } catch (error) {
      console.error(BUILD, error);
      $("errorText").textContent = error?.message || "PRODUCT EVERGREENを読み込めませんでした。";
      showOnly("errorScreen");
    }
  }

  function bind() {
    $("retryButton")?.addEventListener("click", () => location.reload());
    $("refreshButton")?.addEventListener("click", async () => {
      try {
        await loadAll();
        toast("最新のEvergreen状態へ更新しました。");
      } catch (e) { toast(e?.message || "更新できませんでした。", true); }
    });
    $("searchInput")?.addEventListener("input", renderList);
    $("statusFilter")?.addEventListener("change", renderList);
    $("registryFilter")?.addEventListener("change", renderList);
    $("sortSelect")?.addEventListener("change", renderList);
    $("menuButton")?.addEventListener("click", () => $("sidebar")?.classList.toggle("open"));
    $$("[data-close-detail]").forEach((b) => b.addEventListener("click", closeDetail));
    $("detailModal")?.addEventListener("click", (e) => {
      if (e.target === $("detailModal")) closeDetail();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeDetail();
    });
  }

  async function loadAll() {
    const [summaryResult, systemsResult, runResult, standardsResult] = await Promise.all([
      state.supabase.from("cc_v_dpro_evergreen_summary").select("*").maybeSingle(),
      state.supabase.from("cc_v_dpro_evergreen_current").select("*"),
      state.supabase.from("cc_evergreen_audit_runs").select("*").order("created_at",{ascending:false}).limit(1).maybeSingle(),
      state.supabase.from("cc_standard_items")
        .select("item_code,category,item_name,requirement_type,is_blocking_delivery,sort_order,standard_version_id")
        .order("sort_order",{ascending:true}),
    ]);

    for (const result of [summaryResult, systemsResult, runResult, standardsResult]) {
      if (result.error) throw result.error;
    }

    state.summary = summaryResult.data || null;
    state.systems = Array.isArray(systemsResult.data) ? systemsResult.data : [];
    state.currentRun = runResult.data || null;

    const currentStandardId = state.summary?.current_standard_version_id
      || state.systems[0]?.current_standard_version_id
      || "";
    const standards = (standardsResult.data || []).filter((x) => !currentStandardId || x.standard_version_id === currentStandardId);
    state.standardItems = new Map(standards.map((x) => [x.item_code, x]));

    renderSummary();
    renderList();
  }

  function renderSummary() {
    const s = state.summary || {};
    $("standardLead").textContent =
      `${s.current_standard_title || "現行DPRO MASTER"} / MASTER ${Number(s.current_standard_item_count || 0)}項目 / 現行標準全体 ${Number(s.all_current_standard_item_count || 0)}項目`;

    const run = state.currentRun;
    $("runTitle").textContent = run
      ? `${run.standard_code || "DPRO_MASTER_STANDARD"} ${run.version_code || ""} / ${run.run_status || "—"}`
      : "現行監査RUNなし";
    $("runMeta").textContent = run
      ? `開始 ${formatDate(run.created_at, true)} / 対象SYSTEM ${Number(run.registry_system_count || 0)} / ${run.trigger_source || "manual"}`
      : "新しい基準監査が必要です。";

    const metrics = [
      ["system_total","SYSTEMS","動的総数",""],
      ["current_count","CURRENT","最新基準OK","current"],
      ["in_progress_count","監査中","Evidence確認中","progress"],
      ["brushup_required_count","BRUSHUP","差分修正必要","brushup"],
      ["refresh_recommended_count","REFRESH","軽微更新推奨",""],
      ["hold_count","HOLD","人判断必要","hold"],
      ["catalog_sync_required_count","CATALOG SYNC","台帳同期必要",""],
    ];
    $("metricGrid").innerHTML = metrics.map(([key,label,sub,tone]) =>
      `<article class="metric-card ${tone}">
        <b>${Number(s[key] || 0)}</b>
        <span>${esc(label)}</span>
        <small>${esc(sub)}</small>
      </article>`
    ).join("");
  }

  function filteredSystems() {
    const q = $("searchInput").value.trim().toLowerCase();
    const status = $("statusFilter").value;
    const registry = $("registryFilter").value;
    const sort = $("sortSelect").value;

    const rows = state.systems.filter((row) => {
      if (status !== "all" && row.evergreen_status !== status) return false;
      if (registry !== "all" && row.registry_status !== registry) return false;
      if (!q) return true;
      return `${row.product_name || ""} ${row.system_code || ""} ${row.category || ""} ${row.product_code || ""}`
        .toLowerCase().includes(q);
    });

    rows.sort((a,b) => {
      if (sort === "name") return String(a.product_name || "").localeCompare(String(b.product_name || ""), "ja");
      if (sort === "number") return Number(a.product_number || 999999) - Number(b.product_number || 999999);
      if (sort === "unknown") return Number(b.blocking_unknown_count || 0) - Number(a.blocking_unknown_count || 0);
      return priority(b) - priority(a)
        || Number(b.blocking_unknown_count || 0) - Number(a.blocking_unknown_count || 0)
        || Number(a.product_number || 999999) - Number(b.product_number || 999999);
    });
    return rows;
  }

  function renderList() {
    const rows = filteredSystems();
    $("resultCount").textContent = `${rows.length} / ${state.systems.length} SYSTEMS`;
    $("systemList").innerHTML = rows.length ? rows.map(renderRow).join("") : '<div class="empty">条件に一致するSYSTEMはありません。</div>';

    $$("[data-detail-system]").forEach((b) => b.addEventListener("click", () => openDetail(b.dataset.detailSystem)));
    $$("[data-start-zip]").forEach((b) => b.addEventListener("click", () => {
      const row = state.systems.find((x) => x.system_code === b.dataset.startZip);
      if (!row) return;
      toast(`「${row.product_name}」のBRUSHUP START ZIPはEVG-04で有効化します。現在は監査状態の確認までです。`);
    }));
  }

  function renderRow(row) {
    const action = nextAction(row);
    const productNo = row.product_number ? `#${String(row.product_number).padStart(2,"0")}` : "NEW";
    const standard = row.current_standard_version || "—";
    const last = row.audit_created_at ? formatDate(row.audit_created_at) : "未監査";
    const evidence = `PASS ${Number(row.pass_count || 0)} / UNKNOWN ${Number(row.unknown_count || 0)}`;
    const blocking = Number(row.blocking_unknown_count || 0)
      + Number(row.blocking_review_count || 0)
      + Number(row.blocking_fail_count || 0);

    return `<article class="system-row">
      <div class="system-main">
        <span class="system-code">${esc(productNo)} / ${esc(row.system_code || "—")}</span>
        <strong>${esc(row.product_name || row.system_code || "名称未設定")}</strong>
        <small>${esc(row.category || "カテゴリ未設定")}　${registryPill(row.registry_status)}</small>
      </div>
      <div>
        <span class="cell-label">EVERGREEN</span>
        <span class="cell-value">${pill(row.evergreen_status)}</span>
        <span class="cell-sub">${esc(standard)}</span>
      </div>
      <div>
        <span class="cell-label">BLOCKING差分</span>
        <span class="cell-value">${blocking}</span>
        <span class="cell-sub">未確認 ${Number(row.blocking_unknown_count || 0)}</span>
      </div>
      <div class="hide-mid">
        <span class="cell-label">EVIDENCE</span>
        <span class="cell-value">${esc(evidence)}</span>
        <span class="cell-sub">最終監査 ${esc(last)}</span>
      </div>
      <div class="next-action">
        <strong>${esc(action[0])}</strong>
        <span>${esc(action[1])}</span>
      </div>
      <div class="row-actions">
        <button class="row-btn" type="button" data-detail-system="${esc(row.system_code)}">詳細</button>
        <button class="row-btn primary" type="button" data-start-zip="${esc(row.system_code)}">BRUSHUP START ZIP</button>
      </div>
    </article>`;
  }

  async function openDetail(systemCode) {
    const row = state.systems.find((x) => x.system_code === systemCode);
    if (!row) return;
    state.selected = row;

    $("detailContent").innerHTML = `
      <div class="detail-head">
        <p class="eyebrow">EVERGREEN DETAIL</p>
        <h2 id="detailTitle">${esc(row.product_name || row.system_code)}</h2>
        <p>${esc(row.system_code)} / ${esc(row.category || "カテゴリ未設定")}</p>
        <div class="detail-badges">${pill(row.evergreen_status)} ${registryPill(row.registry_status)}</div>
      </div>
      <div class="detail-grid">
        <div class="detail-stat"><b>${Number(row.audit_item_count || 0)}</b><span>監査項目</span></div>
        <div class="detail-stat"><b>${Number(row.blocking_unknown_count || 0)}</b><span>未確認Blocker</span></div>
        <div class="detail-stat"><b>${Number(row.pass_count || 0)}</b><span>PASS Evidence</span></div>
        <div class="detail-stat"><b>${Number(row.stale_evidence_count || 0)}</b><span>STALE Evidence</span></div>
      </div>
      <div class="detail-section"><h3>監査項目を読み込み中…</h3></div>
    `;
    $("detailModal").classList.remove("hidden");

    try {
      if (!row.audit_id) {
        renderDetailBody(row, []);
        return;
      }
      const {data, error} = await state.supabase
        .from("cc_evergreen_system_audit_items")
        .select("item_code,applicability,result,is_blocking,evidence_type,evidence_ref,observed_version,evidence_valid_until,checked_at,note")
        .eq("audit_id", row.audit_id)
        .order("is_blocking",{ascending:false})
        .order("item_code",{ascending:true});
      if (error) throw error;
      renderDetailBody(row, data || []);
    } catch (error) {
      console.error(BUILD, error);
      $("detailContent").insertAdjacentHTML("beforeend",
        `<div class="detail-section"><h3>監査項目を取得できませんでした</h3><p>${esc(error?.message || "不明なエラー")}</p></div>`);
    }
  }

  function renderDetailBody(row, items) {
    const unknownBlocking = items.filter((x) => x.is_blocking && x.result === "UNKNOWN" && x.applicability !== "not_applicable");
    const reviewBlocking = items.filter((x) => x.is_blocking && x.result === "REVIEW");
    const failBlocking = items.filter((x) => x.is_blocking && x.result === "FAIL");
    const gaps = [...failBlocking, ...reviewBlocking, ...unknownBlocking].slice(0, 24);
    const action = nextAction(row);

    const links = [
      ["製品ページ", row.product_page_url],
      ["公開デモ", row.demo_url],
      ["SYSTEM Pages", row.system_pages_root],
      ["Worker", row.system_worker_url],
      ["GitHub", row.repository ? `https://github.com/${row.repository}` : ""],
    ].filter(([,url]) => safeUrl(url));

    $("detailContent").innerHTML = `
      <div class="detail-head">
        <p class="eyebrow">EVERGREEN DETAIL</p>
        <h2 id="detailTitle">${esc(row.product_name || row.system_code)}</h2>
        <p>${esc(row.system_code)} / ${esc(row.category || "カテゴリ未設定")} / ${esc(row.current_standard_title || "")}</p>
        <div class="detail-badges">${pill(row.evergreen_status)} ${registryPill(row.registry_status)}</div>
      </div>

      <div class="detail-grid">
        <div class="detail-stat"><b>${Number(row.audit_item_count || 0)}</b><span>監査項目</span></div>
        <div class="detail-stat"><b>${Number(row.applicable_count || 0)}</b><span>適用</span></div>
        <div class="detail-stat"><b>${Number(row.not_applicable_count || 0)}</b><span>N/A</span></div>
        <div class="detail-stat"><b>${Number(row.applicability_unknown_count || 0)}</b><span>適用判定待ち</span></div>
        <div class="detail-stat"><b>${Number(row.pass_count || 0)}</b><span>PASS</span></div>
        <div class="detail-stat"><b>${Number(row.unknown_count || 0)}</b><span>UNKNOWN</span></div>
        <div class="detail-stat"><b>${Number(row.blocking_unknown_count || 0)}</b><span>未確認Blocker</span></div>
        <div class="detail-stat"><b>${Number(row.stale_evidence_count || 0)}</b><span>STALE</span></div>
      </div>

      <div class="detail-section">
        <h3>次のアクション</h3>
        <div class="next-action"><strong>${esc(action[0])}</strong><span>${esc(action[1])}</span></div>
      </div>

      <div class="detail-section">
        <h3>LOCK安全境界</h3>
        <div class="gap-list">
          <div class="gap-item"><div><strong>SYSTEM FINAL LOCK</strong><small>自動再開は禁止。重大欠陥が証明された場合のみ人判断。</small></div>${row.final_lock_reopen_required ? '<span class="pill reopen">再開審査</span>' : '<span class="pill current">保護中</span>'}</div>
          <div class="gap-item"><div><strong>PRODUCT RELEASE LOCK</strong><small>Evergreen監査は過去READY / Product Release Lockを上書きしません。</small></div>${row.product_release_lock ? '<span class="pill current">LOCK</span>' : '<span class="pill">—</span>'}</div>
        </div>
      </div>

      <div class="detail-section">
        <h3>未確認・差分候補（最大24件）</h3>
        <div class="gap-list">
          ${gaps.length ? gaps.map((item) => {
            const meta = state.standardItems.get(item.item_code) || {};
            return `<div class="gap-item">
              <div><strong>${esc(meta.item_name || item.item_code)}</strong><small>${esc(item.item_code)} / ${esc(meta.category || "DPRO MASTER")}</small></div>
              <span class="pill ${item.result === "FAIL" ? "reopen" : item.result === "REVIEW" ? "brushup" : "progress"}">${esc(item.result)}</span>
            </div>`;
          }).join("") : '<div class="empty">表示対象の差分候補はありません。</div>'}
        </div>
      </div>

      ${links.length ? `<div class="detail-section"><h3>確認リンク</h3><div class="link-row">
        ${links.map(([label,url]) => `<a href="${esc(safeUrl(url))}" target="_blank" rel="noopener">${esc(label)} ↗</a>`).join("")}
      </div></div>` : ""}

      <div class="detail-section">
        <button class="btn primary" type="button" data-detail-start-zip>BRUSHUP START ZIP（EVG-04）</button>
      </div>
    `;

    $("[data-detail-start-zip]")?.addEventListener("click", () => {
      toast(`「${row.product_name}」のSTART ZIP生成は次工程EVG-04で有効化します。`);
    });
  }

  function closeDetail() {
    $("detailModal")?.classList.add("hidden");
    state.selected = null;
  }

  boot();
})();
