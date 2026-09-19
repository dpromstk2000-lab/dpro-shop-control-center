(() => {
  "use strict";

  const BUILD = "DPRO-PRODUCT-DEVELOPMENT-R2-PREBUILD-SPEC-20260919";
  const FACTORY_VERSION = "V2.0";
  const PACKAGE_SHA = "2e8b7cb07e33fe861b0c4829af197962560e2e62226bc6340d43436f254d2137";
  const LOCK_SHA = "ccf25b5f0bc7250e4080d8f561314a53338dcfaec44fb14c138da65b4b06ec59";
  const CONFIG = window.DPRO_CONTROL_CENTER_CONFIG || {};
  const $ = (id) => document.getElementById(id);
  const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));

  const state = {
    supabase: null,
    session: null,
    staff: null,
    products: [],
    projects: [],
    factory: [],
    selectedId: "",
    editingId: "",
  };

  const statusMeta = {
    draft: ["定義中", "amber"],
    prebuild: ["PREBUILD", "blue"],
    building: ["制作中", "blue"],
    final_qa: ["FINAL QA", "amber"],
    catalog_ready: ["製品台帳登録待ち", "amber"],
    cataloged: ["製品化完了", "green"],
    hold: ["保留", "amber"],
    cancelled: ["中止", "red"],
  };

  const roleLabels = {
    owner_admin: "管理責任者",
    technical_admin: "技術管理者",
    support: "DPROサポート",
    read_only: "閲覧専用",
  };

  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const showOnly = (id) => ["loadingScreen","authScreen","errorScreen","app"].forEach((x) => $(x)?.classList.toggle("hidden", x !== id));
  const canWrite = () => ["owner_admin","technical_admin","support"].includes(state.staff?.role_key);
  const productByCode = (code) => state.products.find((p) => String(p.system_code || "").toUpperCase() === String(code || "").toUpperCase()) || null;
  const factoryByProject = (id) => state.factory.find((x) => x.project_id === id) || null;
  const selectedProject = () => state.projects.find((x) => x.id === state.selectedId) || null;

  function toast(message, error = false) {
    const el = $("toast");
    el.textContent = message;
    el.className = `toast${error ? " error" : ""}`;
    el.classList.remove("hidden");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.add("hidden"), 3800);
  }

  function pill(text, tone = "") { return `<span class="pill ${tone}">${esc(text)}</span>`; }

  function normalizeSystemCode(value) {
    return String(value || "")
      .toUpperCase()
      .replace(/[^A-Z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 32);
  }

  async function loadProducts() {
    const base = String(CONFIG.apiBaseUrl || "").replace(/\/$/, "");
    const response = await fetch(`${base}/api/products/overview`, {
      cache: "no-store",
      headers: { authorization: `Bearer ${state.session?.access_token || ""}` },
    });
    if (!response.ok) throw new Error("DPRO製品台帳を取得できませんでした。");
    const data = await response.json().catch(() => ({}));
    return Array.isArray(data.products) ? data.products : [];
  }

  async function boot() {
    try {
      $("loadingText").textContent = `${BUILD} / 接続確認中…`;
      const base = String(CONFIG.apiBaseUrl || "").replace(/\/$/, "");
      if (!base) throw new Error("CONTROL CENTER API設定がありません。");
      const response = await fetch(`${base}/api/public-config`, { cache:"no-store" });
      const pub = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(pub?.error || "公開設定を取得できませんでした。");
      if (!window.supabase?.createClient) throw new Error("Supabase接続ライブラリを読み込めませんでした。");

      state.supabase = window.supabase.createClient(
        pub.supabaseUrl,
        pub.supabasePublishableKey || pub.supabaseAnonKey,
        { auth:{ persistSession:true, autoRefreshToken:true, detectSessionInUrl:false, storageKey:pub.sessionStorageKey || "dpro-control-center-auth-v1" } }
      );

      const { data:{session}, error:sessionError } = await state.supabase.auth.getSession();
      if (sessionError) throw sessionError;
      state.session = session;
      if (!session) { showOnly("authScreen"); return; }

      const { data:staff, error:staffError } = await state.supabase
        .from("cc_staff")
        .select("id,display_name,role_key,status")
        .eq("auth_user_id", session.user.id)
        .maybeSingle();
      if (staffError) throw staffError;
      if (!staff || staff.status !== "active") { showOnly("authScreen"); return; }
      state.staff = staff;

      $("staffName").textContent = staff.display_name || "DPROスタッフ";
      $("staffRole").textContent = roleLabels[staff.role_key] || staff.role_key || "DPROスタッフ";
      $("staffInitial").textContent = (staff.display_name || "D").trim().slice(0,1).toUpperCase();

      bind();
      await loadAll();
      showOnly("app");
    } catch (error) {
      console.error(BUILD, error);
      $("errorText").textContent = error?.message || "新規製品開発を読み込めませんでした。";
      showOnly("errorScreen");
    }
  }

  function bind() {
    $("retryButton")?.addEventListener("click", () => location.reload());
    $("refreshButton")?.addEventListener("click", async () => { await loadAll(true); toast("最新情報へ更新しました。"); });
    $("newProductButton")?.addEventListener("click", () => openEditor());
    $("editorForm")?.addEventListener("submit", saveEditor);
    $("formProductName")?.addEventListener("input", () => {
      if ($("formSystemCode").dataset.userEdited === "true") return;
      const source = $("formProductName").value.replace(/^DPRO\s*/i, "").trim();
      const rough = source.replace(/[\s・／/]+/g, "_");
      const ascii = rough.normalize("NFKD").replace(/[^\x00-\x7F]/g, "");
      if (ascii) $("formSystemCode").value = normalizeSystemCode(ascii);
    });
    $("formSystemCode")?.addEventListener("input", (event) => {
      event.target.dataset.userEdited = "true";
      const pos = event.target.selectionStart;
      event.target.value = normalizeSystemCode(event.target.value);
      try { event.target.setSelectionRange(pos, pos); } catch {}
    });
    $("searchInput")?.addEventListener("input", renderGrid);
    $("statusFilter")?.addEventListener("change", renderGrid);
    $("menuButton")?.addEventListener("click", () => $("sidebar").classList.toggle("open"));
    $$('[data-close-editor]').forEach((b) => b.addEventListener("click", closeEditor));
    $$('[data-close-detail]').forEach((b) => b.addEventListener("click", closeDetail));
  }

  async function loadAll(keepSelection = false) {
    const selected = keepSelection ? state.selectedId : "";
    const [products, projectsResult, factoryResult] = await Promise.all([
      loadProducts(),
      state.supabase.from("cc_v_product_development_overview").select("*").order("updated_at", {ascending:false}),
      state.supabase.rpc("cc_factory_v2_list_overview"),
    ]);
    if (projectsResult.error) throw projectsResult.error;
    if (factoryResult.error) throw factoryResult.error;
    state.products = products;
    state.projects = projectsResult.data || [];
    state.factory = Array.isArray(factoryResult.data) ? factoryResult.data : [];
    prepareReferenceOptions();
    renderGrid();
    if (selected && state.projects.some((x) => x.id === selected)) {
      state.selectedId = selected;
      renderDetail();
    }
  }

  function prepareReferenceOptions() {
    const current = $("formReferenceProduct")?.value || "";
    const sorted = [...state.products].sort((a,b) => Number(a.product_number || 999) - Number(b.product_number || 999));
    $("formReferenceProduct").innerHTML = '<option value="">最も近いDPRO製品を選択</option>' + sorted.map((p) =>
      `<option value="${esc(p.system_code)}">${esc(String(p.product_number || "").padStart(2,"0"))}｜${esc(p.product_name)}（${esc(p.system_code)}）</option>`
    ).join("");
    if (sorted.some((p) => p.system_code === current)) $("formReferenceProduct").value = current;
  }

  function filteredProjects() {
    const q = $("searchInput").value.trim().toLowerCase();
    const status = $("statusFilter").value;
    return state.projects.filter((p) => {
      if (status !== "all" && p.status !== status) return false;
      if (!q) return true;
      return `${p.dev_code || ""} ${p.product_name || ""} ${p.target_system_code || ""} ${p.category || ""}`.toLowerCase().includes(q);
    });
  }

  function renderGrid() {
    const rows = filteredProjects();
    $("resultCount").textContent = `${rows.length}件`;
    $("projectGrid").innerHTML = rows.length ? rows.map(renderCard).join("") : '<div class="empty">新規DPRO製品開発はまだありません。右上の「＋ 新しいDPRO製品を開発」から開始してください。</div>';
    $$('[data-open-project]').forEach((b) => b.addEventListener("click", () => openDetail(b.dataset.openProject)));
  }

  function renderCard(p) {
    const f = factoryByProject(p.delivery_project_id) || {};
    const sm = statusMeta[p.status] || [p.status || "—", ""];
    const ref = productByCode(p.reference_product_system_code);
    return `<article class="project-card">
      <div class="project-head">
        <div><span class="project-code">${esc(p.dev_code)} / ${esc(p.target_system_code)}</span><h2>${esc(p.product_name)}</h2><p>${esc(p.category || "カテゴリ未設定")}</p></div>
        ${pill(sm[0], sm[1])}
      </div>
      <div class="factory-grid">
        <div><b>${Number(f.prebuild_done || 0)}/${Number(f.prebuild_total || 10)}</b><span>PREBUILD</span></div>
        <div><b>${Number(f.final_done || 0)}/${Number(f.final_total || 4)}</b><span>FINAL</span></div>
        <div><b>${Number(f.action_required || 0)}</b><span>要対応</span></div>
      </div>
      <div class="project-meta">参考製品：${esc(ref?.product_name || p.reference_product_system_code || "—")}<br>制作シェル：${esc(p.delivery_project_code || "—")}</div>
      <div class="project-actions"><button class="btn primary" type="button" data-open-project="${esc(p.id)}">開発内容を開く</button></div>
    </article>`;
  }

  function resetEditor() {
    $("editorForm").reset();
    $("formSystemCode").dataset.userEdited = "false";
    $("formReferenceProduct").value = "";
    $("editorMessage").textContent = "";
    $("editorMessage").className = "form-message full";
  }

  function openEditor(project = null) {
    resetEditor();
    state.editingId = project?.id || "";
    $("editorTitle").textContent = project ? "新規製品の定義を編集" : "新しいDPRO製品を開発";
    $("editorSubmit").textContent = project ? "製品定義を保存" : "新規製品開発を開始";
    $("formSystemCode").disabled = Boolean(project);
    if (project) {
      $("formProductName").value = project.product_name || "";
      $("formSystemCode").value = project.target_system_code || "";
      $("formSystemCode").dataset.userEdited = "true";
      $("formCategory").value = project.category || "";
      $("formSourceType").value = project.source_type || "inquiry";
      $("formReferenceProduct").value = project.reference_product_system_code || "";
      $("formSourceSummary").value = project.source_summary || "";
      $("formTargetUsers").value = project.target_users || "";
      $("formCoreWorkflow").value = project.core_workflow || "";
      $("formMustHave").value = project.must_have_features || "";
      $("formOutOfScope").value = project.out_of_scope || "";
      $("formDataHandling").value = project.data_handling_notes || "";
      $("formMedicalData").checked = Boolean(project.medical_data);
    }
    $("editorModal").classList.remove("hidden");
  }

  function closeEditor() { $("editorModal").classList.add("hidden"); state.editingId = ""; }

  async function saveEditor(event) {
    event.preventDefault();
    if (!canWrite()) return toast("編集権限がありません。", true);
    const isEdit = Boolean(state.editingId);
    const payload = {
      p_product_name: $("formProductName").value.trim(),
      p_category: $("formCategory").value.trim(),
      p_source_type: $("formSourceType").value,
      p_source_summary: $("formSourceSummary").value.trim(),
      p_reference_product_system_code: $("formReferenceProduct").value,
      p_target_users: $("formTargetUsers").value.trim(),
      p_core_workflow: $("formCoreWorkflow").value.trim(),
      p_must_have_features: $("formMustHave").value.trim(),
      p_out_of_scope: $("formOutOfScope").value.trim(),
      p_data_handling_notes: $("formDataHandling").value.trim(),
      p_medical_data: $("formMedicalData").checked,
    };
    if (!state.editingId) payload.p_target_system_code = normalizeSystemCode($("formSystemCode").value);
    if (Object.entries(payload).some(([k,v]) => k !== "p_medical_data" && !String(v || "").trim())) {
      $("editorMessage").textContent = "* の項目をすべて入力してください。";
      return;
    }
    const submit = $("editorSubmit");
    submit.disabled = true;
    submit.textContent = state.editingId ? "保存中…" : "FACTORY V2制作シェルを作成中…";
    try {
      let result;
      if (state.editingId) {
        result = await state.supabase.rpc("cc_product_dev_update", { p_product_dev_id:state.editingId, ...payload });
      } else {
        result = await state.supabase.rpc("cc_product_dev_create", payload);
      }
      if (result.error) throw result.error;
      const id = state.editingId || result.data?.product_dev_id || result.data?.id || "";
      closeEditor();
      await loadAll();
      if (id) openDetail(id);
      toast(isEdit ? "製品定義を保存しました。" : "新規DPRO製品開発を開始しました。FACTORY V2監査も自動生成されています。");
    } catch (error) {
      console.error(BUILD, error);
      $("editorMessage").textContent = error?.message || "保存できませんでした。";
    } finally {
      submit.disabled = false;
      submit.textContent = isEdit ? "製品定義を保存" : "新規製品開発を開始";
    }
  }

  function openDetail(id) {
    state.selectedId = id;
    renderDetail();
    $("detailModal").classList.remove("hidden");
  }

  function closeDetail() { $("detailModal").classList.add("hidden"); state.selectedId = ""; }

  function nextInstruction(p, f) {
    if (p.status === "draft") return "製品定義を確認したらPREBUILDへ進みます。PREBUILDでは自由入力PASSではなく、構造化された設計仕様を完成させます。";
    if (p.status === "prebuild" && !f?.prebuild_ready) return `PREBUILD設計を完成してください。現在 ${Number(f?.prebuild_done || 0)}/${Number(f?.prebuild_total || 10)}。FACTORY基準は自動確認、残りは仕様がDB検証されるまでPASSになりません。`;
    if (p.status === "prebuild" && f?.prebuild_ready) return "PREBUILD 10/10です。「制作開始」へ進めます。";
    if (p.status === "building") return "標準製品本体を制作します。完成したらFINAL QAへ進みます。";
    if (p.status === "final_qa" && !f?.final_ready) return `FACTORY V2 FINALを完了してください。現在 ${Number(f?.final_done || 0)}/${Number(f?.final_total || 4)}。`;
    if (p.status === "final_qa" && f?.final_ready) return "FINAL 4/4です。製品台帳登録待ちへ進めます。";
    if (p.status === "catalog_ready") return productByCode(p.target_system_code) ? "製品台帳にSYSTEM CODEが確認できました。製品化完了へ進めます。" : "完成品をDPRO製品台帳へ正式登録してください。登録後に製品化完了へ進めます。";
    if (p.status === "cataloged") return "新しいDPRO標準製品として完成しています。契約案件ではこの製品を選択して導入できます。";
    return "状態を確認してください。";
  }

  function stageAction(p, f) {
    if (!canWrite() || ["cataloged","cancelled"].includes(p.status)) return "";
    if (p.status === "draft") return '<button class="btn primary" type="button" data-stage="prebuild">PREBUILDへ進む</button>';
    if (p.status === "prebuild") return `<button class="btn primary" type="button" data-stage="building" ${f?.prebuild_ready ? "" : "disabled"}>制作開始</button>`;
    if (p.status === "building") return '<button class="btn primary" type="button" data-stage="final_qa">FINAL QAへ進む</button>';
    if (p.status === "final_qa") return `<button class="btn primary" type="button" data-stage="catalog_ready" ${f?.final_ready ? "" : "disabled"}>製品台帳登録待ちへ</button>`;
    if (p.status === "catalog_ready") return `<button class="btn primary" type="button" data-stage="cataloged" ${productByCode(p.target_system_code) ? "" : "disabled"}>製品化完了</button>`;
    if (p.status === "hold") return '<button class="btn secondary" type="button" data-stage="prebuild">PREBUILDへ戻す</button>';
    return "";
  }

  function renderDetail() {
    const p = selectedProject();
    if (!p) return;
    const f = factoryByProject(p.delivery_project_id) || {};
    const sm = statusMeta[p.status] || [p.status || "—", ""];
    const ref = productByCode(p.reference_product_system_code);
    const identityOk = String(p.factory_version || "") === FACTORY_VERSION && String(p.factory_package_sha256 || "") === PACKAGE_SHA && String(p.factory_lock_sha256 || "") === LOCK_SHA;
    $("detailContent").innerHTML = `
      <div class="detail-title"><span class="project-code">${esc(p.dev_code)} / ${esc(p.target_system_code)}</span><h2 id="detailTitle">${esc(p.product_name)}</h2><p>${esc(p.category || "")}</p></div>
      <div class="detail-badges">${pill(sm[0], sm[1])}${pill(identityOk ? "FACTORY V2 IDENTITY PASS" : "IDENTITY要確認", identityOk ? "green" : "red")}${p.medical_data ? pill("医療安全基準", "blue") : ""}</div>
      <dl class="definition-grid">
        <div class="definition"><dt>開発のきっかけ</dt><dd>${esc(p.source_summary)}</dd></div>
        <div class="definition"><dt>参考製品</dt><dd>${esc(ref?.product_name || p.reference_product_system_code || "—")}（${esc(p.reference_product_system_code || "—")}）</dd></div>
        <div class="definition"><dt>主な利用者</dt><dd>${esc(p.target_users)}</dd></div>
        <div class="definition"><dt>中心業務フロー</dt><dd>${esc(p.core_workflow)}</dd></div>
        <div class="definition"><dt>必須機能</dt><dd>${esc(p.must_have_features)}</dd></div>
        <div class="definition"><dt>対象外</dt><dd>${esc(p.out_of_scope)}</dd></div>
        <div class="definition"><dt>データ・安全設計</dt><dd>${esc(p.data_handling_notes)}</dd></div>
        <div class="definition"><dt>FACTORY制作シェル</dt><dd>${esc(p.delivery_project_code || "—")} / ${esc(p.delivery_project_status || "—")}</dd></div>
      </dl>
      <section class="gate-panel"><h3>FACTORY V2.0 Gate</h3><div class="gate-grid">
        <div class="gate-card"><b>${Number(f.prebuild_done || 0)}/${Number(f.prebuild_total || 10)}</b><span>PREBUILD ${f.prebuild_ready ? "PASS" : "確認中"}</span></div>
        <div class="gate-card"><b>${Number(f.final_done || 0)}/${Number(f.final_total || 4)}</b><span>FINAL ${f.final_ready ? "PASS" : "確認中"}</span></div>
        <div class="gate-card"><b>${Number(f.action_required || 0)}</b><span>ACTION REQUIRED</span></div>
      </div></section>
      <div class="next-panel"><strong>次にすること</strong><span>${esc(nextInstruction(p,f))}</span></div>
      <div class="detail-actions">
        ${["draft","prebuild"].includes(p.status) ? `<a class="btn primary" href="factory-v2-prebuild.html?project=${encodeURIComponent(p.delivery_project_id)}">PREBUILD設計を開く</a>` : ""}
        <a class="btn secondary" href="factory-v2.html?project=${encodeURIComponent(p.delivery_project_id)}">FACTORY V2監査を開く</a>
        <button class="btn secondary" type="button" id="copyHandoff">ChatGPT開発指示をコピー</button>
        ${canWrite() && !["cataloged","cancelled"].includes(p.status) ? '<button class="btn secondary" type="button" id="editDefinition">製品定義を編集</button>' : ""}
        ${stageAction(p,f)}
      </div>
      <div class="privacy-note">この台帳は標準製品開発用です。問い合わせ元の個人名、患者名、メール、電話番号、診療内容などの個人情報は保存しません。</div>`;

    $("copyHandoff")?.addEventListener("click", () => copyHandoff(p,f));
    $("editDefinition")?.addEventListener("click", () => { closeDetail(); openEditor(p); });
    $$('[data-stage]', $("detailContent")).forEach((b) => b.addEventListener("click", () => setStage(b.dataset.stage, b)));
  }

  async function setStage(stage, button) {
    const p = selectedProject();
    if (!p || !canWrite()) return;
    const old = button.textContent;
    button.disabled = true; button.textContent = "確認中…";
    try {
      const { error } = await state.supabase.rpc("cc_product_dev_set_stage", { p_product_dev_id:p.id, p_stage:stage, p_note:null });
      if (error) throw error;
      await loadAll(true);
      renderDetail();
      toast("開発ステージを更新しました。");
    } catch (error) {
      toast(error?.message || "ステージを更新できませんでした。", true);
    } finally {
      button.disabled = false; button.textContent = old;
    }
  }

  async function copyHandoff(p,f) {
    const ref = productByCode(p.reference_product_system_code);
    const text = [
      "DPRO 新規標準製品開発 / FACTORY V2.0",
      `開発コード: ${p.dev_code}`,
      `新製品名: ${p.product_name}`,
      `新SYSTEM CODE: ${p.target_system_code}`,
      `カテゴリ: ${p.category}`,
      `参考DPRO製品: ${ref?.product_name || p.reference_product_system_code} (${p.reference_product_system_code})`,
      `FACTORY制作Project: ${p.delivery_project_code} / ${p.delivery_project_id}`,
      `FACTORY Version: ${p.factory_version}`,
      `Package SHA256: ${p.factory_package_sha256}`,
      `FINAL LOCK SHA256: ${p.factory_lock_sha256}`,
      `現在ステージ: ${p.status}`,
      `PREBUILD: ${Number(f.prebuild_done || 0)}/${Number(f.prebuild_total || 10)} ready=${Boolean(f.prebuild_ready)}`,
      `FINAL: ${Number(f.final_done || 0)}/${Number(f.final_total || 4)} ready=${Boolean(f.final_ready)}`,
      "",
      "【開発のきっかけ】", p.source_summary,
      "【主な利用者】", p.target_users,
      "【中心業務フロー】", p.core_workflow,
      "【必須機能】", p.must_have_features,
      "【対象外】", p.out_of_scope,
      "【データ・安全設計】", p.data_handling_notes,
      "",
      "【固定ルール】",
      "- FACTORY V2.0の固定IDENTITYは変更しない。",
      "- 参考製品を再利用し、証明された不具合がない完成済み機能を無条件に再開発しない。",
      "- PREBUILD Gate完了前に本制作へ進まない。",
      "- PREBUILDの設計項目はfactory-v2-prebuild.htmlで構造化仕様を完成させ、自由入力だけのPASS/N/Aは禁止する。",
      "- FINAL Gate完了前に製品台帳登録・販売可能判定へ進まない。",
      "- 個別顧客の本番テナント、患者情報、Secretは標準製品開発へ持ち込まない。",
      "- MutationObserver等の補助UIは冪等実装を必須とする。",
      "",
      "この内容を唯一の開発開始基準として、現在ステージから作業を継続してください。",
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast("ChatGPT開発指示をコピーしました。");
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove();
      toast("ChatGPT開発指示をコピーしました。");
    }
  }

  window.addEventListener("DOMContentLoaded", boot, {once:true});
})();
