(() => {
  "use strict";

  const BUILD = "DPRO-CONTACT-ONBOARDING-R1-20260815";
  const CONFIG = window.DPRO_CONTROL_CENTER_CONFIG || {};
  const WRITE_ROLES = new Set(["owner_admin", "technical_admin", "support"]);
  const STEP_LABELS = {
    step_basic: "① 基本設定",
    step_line: "② LINE設定",
    step_worker: "③ Worker作成",
    step_db: "④ DB確認",
    step_admin: "⑤ 管理画面組込",
    step_system_check: "⑥ system-check",
    step_production_test: "⑦ 本番送受信",
  };
  const STEP_STATUS = {
    not_started: ["未実行", "muted"],
    pending: ["未設定", "amber"],
    complete: ["完了", "green"],
    not_required: ["対象外", "muted"],
    error: ["エラー", "red"],
  };
  const CONNECTION_LABELS = {
    not_configured: "未設定",
    unknown: "未確認",
    checking: "確認中",
    connected: "接続済み",
    error: "エラー",
  };

  const state = {
    supabase: null,
    staff: null,
    currentProjectId: new URLSearchParams(location.search).get("project") || "",
    currentRow: null,
    currentOverview: null,
    loadingProjectId: "",
    injectToken: 0,
  };

  const $ = (id) => document.getElementById(id);
  const escapeHtml = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  function installStyle() {
    if ($("dpro-contact-onboarding-r1-style")) return;
    const style = document.createElement("style");
    style.id = "dpro-contact-onboarding-r1-style";
    style.textContent = `
      .contact-r1-card{margin-top:18px;padding:18px;border:1px solid #a9d5c2;border-radius:16px;background:linear-gradient(145deg,#fbfffd,#f0faf6)}
      .contact-r1-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px}
      .contact-r1-head h3{margin:0;font-size:18px}.contact-r1-head p{margin:5px 0 0;color:var(--muted);font-size:10px;line-height:1.65}
      .contact-r1-status{display:inline-flex;align-items:center;min-height:28px;padding:5px 10px;border-radius:999px;background:#eef2f0;color:#63736c;font-size:9px;font-weight:900;white-space:nowrap}
      .contact-r1-status.green{background:#def5ea;color:#087253}.contact-r1-status.red{background:#fff0f3;color:#b63247}.contact-r1-status.amber{background:#fff7e5;color:#8b5a00}
      .contact-r1-master{margin-top:13px;padding:13px;border:1px solid #cfe1da;border-radius:13px;background:#fff}
      .contact-r1-toggle{display:flex;align-items:center;gap:10px;font-size:12px;font-weight:900}.contact-r1-toggle input{width:22px;height:22px;accent-color:var(--green)}
      .contact-r1-note{margin:7px 0 0;color:var(--muted);font-size:9px;line-height:1.55}
      .contact-r1-channels{margin-top:12px;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
      .contact-r1-channel{display:flex;align-items:center;gap:8px;padding:10px;border:1px solid var(--line);border-radius:11px;background:#fff;font-size:9px;font-weight:900}
      .contact-r1-channel input{width:18px;height:18px;accent-color:var(--green)}.contact-r1-channel:has(input:checked){border-color:#9bd0b9;background:#f4fbf8}
      .contact-r1-values{margin-top:12px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
      .contact-r1-value{padding:10px 12px;border:1px solid var(--line);border-radius:11px;background:#fff;min-width:0}.contact-r1-value span{display:block;color:var(--muted);font-size:8px;font-weight:800}.contact-r1-value strong{display:block;margin-top:4px;font-size:10px;overflow-wrap:anywhere}
      .contact-r1-runtime{margin-top:8px;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.contact-r1-runtime .contact-r1-value{background:#f8fbf9}
      .contact-r1-progress{margin-top:13px;padding-top:13px;border-top:1px solid #d7e8e0;display:grid;gap:7px}.contact-r1-step{display:grid;grid-template-columns:minmax(160px,1fr) auto;gap:10px;align-items:center;padding:8px 10px;border-radius:10px;background:#fff}.contact-r1-step strong{font-size:9px}.contact-r1-step-status{display:inline-flex;align-items:center;justify-content:center;min-width:62px;min-height:24px;padding:4px 8px;border-radius:999px;background:#eef2f0;color:#63736c;font-size:8px;font-weight:900}.contact-r1-step-status.green{background:#def5ea;color:#087253}.contact-r1-step-status.amber{background:#fff7e5;color:#8b5a00}.contact-r1-step-status.red{background:#fff0f3;color:#b63247}
      .contact-r1-error{margin-top:10px;padding:10px 12px;border-radius:10px;background:#fff0f3;color:#a92e42;font-size:9px;font-weight:800;line-height:1.6}
      .contact-r1-actions{margin-top:13px;display:flex;gap:9px;align-items:center;justify-content:flex-end;flex-wrap:wrap}.contact-r1-actions small{margin-right:auto;color:var(--muted);font-size:8px;line-height:1.55}.contact-r1-actions .btn{min-width:170px}
      .contact-r1-loading{margin-top:18px;padding:16px;border:1px dashed #b9d9ca;border-radius:13px;background:#f7fcf9;color:#557067;font-size:10px;font-weight:800}
      @media(max-width:760px){.contact-r1-channels{grid-template-columns:repeat(2,1fr)}.contact-r1-values{grid-template-columns:1fr}.contact-r1-runtime{grid-template-columns:repeat(2,1fr)}.contact-r1-head{display:block}.contact-r1-status{margin-top:8px}}
      @media(max-width:460px){.contact-r1-channels{grid-template-columns:1fr}.contact-r1-runtime{grid-template-columns:1fr}.contact-r1-actions .btn{width:100%}.contact-r1-step{grid-template-columns:1fr auto}}
    `;
    document.head.appendChild(style);
  }

  function notify(message, isError = false) {
    const toast = $("toast");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.toggle("error", isError);
    toast.classList.remove("hidden");
    clearTimeout(notify.timer);
    notify.timer = setTimeout(() => toast.classList.add("hidden"), 3600);
  }

  async function fetchPublicConfig() {
    const base = String(CONFIG.apiBaseUrl || "").replace(/\/$/, "");
    if (!base) throw new Error("CONTROL CENTER API URLが見つかりません。");
    const response = await fetch(`${base}/api/public-config`, { cache: "no-store" });
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
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
          storageKey: publicConfig.sessionStorageKey || "dpro-control-center-auth-v1",
        },
      },
    );

    const { data: sessionData, error: sessionError } = await state.supabase.auth.getSession();
    if (sessionError) throw sessionError;
    const user = sessionData.session?.user;
    if (!user) return false;

    const { data: staff, error: staffError } = await state.supabase
      .from("cc_staff")
      .select("id,display_name,role_key,status")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    if (staffError) throw staffError;
    if (!staff || staff.status !== "active") return false;
    state.staff = staff;
    return true;
  }

  function canWrite() {
    return WRITE_ROLES.has(state.staff?.role_key);
  }

  function cleanUpperCode(value, fallback, max = 32) {
    const normalized = String(value || "")
      .normalize("NFKC")
      .toUpperCase()
      .replace(/[^A-Z0-9_-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .replace(/_+/g, "_")
      .slice(0, max);
    return normalized || fallback;
  }

  function cleanWorkerPart(value, fallback, max = 28) {
    const normalized = String(value || "")
      .normalize("NFKC")
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/-+/g, "-")
      .slice(0, max)
      .replace(/-+$/g, "");
    return normalized || fallback;
  }

  function derivedValues(overview, row) {
    const idSeed = String(overview?.project_id || state.currentProjectId || "project").replaceAll("-", "").slice(0, 8);
    const tenantSource = row?.tenant_code || overview?.client_code || overview?.project_code || `TENANT_${idSeed}`;
    const tenantCode = cleanUpperCode(tenantSource, `TENANT_${idSeed}`, 32);
    const systemCode = cleanUpperCode(row?.system_code || overview?.system_code, "DPRO", 24);
    const workerTenant = cleanWorkerPart(tenantCode, idSeed || "tenant", 26);
    const workerSystem = cleanWorkerPart(systemCode, "dpro", 20);
    const generatedWorker = `dpro-contact-${workerSystem}-${workerTenant}`.slice(0, 63).replace(/-+$/g, "");
    const workerName = row?.worker_name || generatedWorker;
    const clientName = overview?.client_name || overview?.project_name || tenantCode;
    const displayName = row?.display_name || `${clientName} DPRO CONTACT`;
    const workerUrl = row?.worker_url_candidate || `https://${workerName}.dpromstk2000.workers.dev`;
    return { tenantCode, systemCode, workerName, displayName, workerUrl };
  }

  function statusBadge(row) {
    if (!row || !row.contact_enabled) return ["未設定", ""];
    if (row.onboarding_status === "live") return ["稼働中", "green"];
    if (row.onboarding_status === "error" || row.connection_status === "error") return ["要確認", "red"];
    if (row.onboarding_status === "ready_for_test") return ["本番確認待ち", "amber"];
    return ["導入中", "amber"];
  }

  function defaultStep(key, row, channels) {
    if (row?.[key]) return row[key];
    if (key === "step_line" && !channels.line) return "not_required";
    return "not_started";
  }

  function renderProgress(row, channels) {
    return Object.entries(STEP_LABELS).map(([key, label]) => {
      const status = defaultStep(key, row, channels);
      const [text, tone] = STEP_STATUS[status] || [status || "未実行", "muted"];
      return `<div class="contact-r1-step"><strong>${escapeHtml(label)}</strong><span class="contact-r1-step-status ${tone}">${escapeHtml(text)}</span></div>`;
    }).join("");
  }

  function renderCard(overview, row) {
    const values = derivedValues(overview, row);
    const isNew = !row;
    const contactEnabled = Boolean(row?.contact_enabled);
    const channels = {
      line: isNew ? true : Boolean(row?.line_enabled),
      web: Boolean(row?.web_enabled),
      email: Boolean(row?.email_reply_enabled),
      attachments: isNew ? true : Boolean(row?.attachments_enabled),
    };
    const [statusText, statusTone] = statusBadge(row);
    const disabled = canWrite() ? "" : "disabled";
    const channelDisabled = contactEnabled && canWrite() ? "" : "disabled";
    const connectionText = CONNECTION_LABELS[row?.connection_status || "not_configured"] || row?.connection_status || "未設定";

    return `
      <section id="contactOnboardingR1" class="contact-r1-card" data-project-id="${escapeHtml(state.currentProjectId)}">
        <div class="contact-r1-head">
          <div>
            <h3>DPRO CONTACT</h3>
            <p>新規契約先の顧客対応をセットアップします。中央CONTROL CENTERには会話本文やSecretを保存しません。</p>
          </div>
          <span class="contact-r1-status ${statusTone}">${escapeHtml(statusText)} / ${escapeHtml(connectionText)}</span>
        </div>

        <div class="contact-r1-master">
          <label class="contact-r1-toggle">
            <input id="contactR1Enabled" type="checkbox" ${contactEnabled ? "checked" : ""} ${disabled}>
            CONTACTを利用する
          </label>
          <p class="contact-r1-note">R1ではCloudflareをCONTROL CENTERから直接操作しません。ここでは導入設定・進捗・非機密の接続状態だけを管理します。</p>
        </div>

        <div class="contact-r1-channels">
          <label class="contact-r1-channel"><input id="contactR1Line" type="checkbox" ${channels.line ? "checked" : ""} ${channelDisabled}>LINE公式</label>
          <label class="contact-r1-channel"><input id="contactR1Web" type="checkbox" ${channels.web ? "checked" : ""} ${channelDisabled}>WEB問い合わせ</label>
          <label class="contact-r1-channel"><input id="contactR1Email" type="checkbox" ${channels.email ? "checked" : ""} ${channelDisabled}>メール返信</label>
          <label class="contact-r1-channel"><input id="contactR1Attachments" type="checkbox" ${channels.attachments ? "checked" : ""} ${channelDisabled}>画像・PDF添付</label>
        </div>

        <div class="contact-r1-values">
          <div class="contact-r1-value"><span>TENANT_CODE</span><strong>${escapeHtml(values.tenantCode)}</strong></div>
          <div class="contact-r1-value"><span>SYSTEM_CODE</span><strong>${escapeHtml(values.systemCode)}</strong></div>
          <div class="contact-r1-value"><span>Worker</span><strong>${escapeHtml(values.workerName)}</strong></div>
          <div class="contact-r1-value"><span>表示名</span><strong>${escapeHtml(values.displayName)}</strong></div>
          <div class="contact-r1-value" style="grid-column:1/-1"><span>Worker URL候補</span><strong>${escapeHtml(values.workerUrl)}</strong></div>
        </div>

        <div class="contact-r1-runtime">
          <div class="contact-r1-value"><span>Worker Version</span><strong>${escapeHtml(row?.worker_version || "—")}</strong></div>
          <div class="contact-r1-value"><span>DB Version</span><strong>${escapeHtml(row?.db_version || "—")}</strong></div>
          <div class="contact-r1-value"><span>最終Webhook</span><strong>${escapeHtml(row?.last_webhook_at ? new Date(row.last_webhook_at).toLocaleString("ja-JP") : "—")}</strong></div>
          <div class="contact-r1-value"><span>未設定項目</span><strong>${escapeHtml(Array.isArray(row?.missing_items) ? `${row.missing_items.length}件` : "—")}</strong></div>
        </div>

        <div class="contact-r1-progress">${renderProgress(row, channels)}</div>
        ${row?.last_error ? `<div class="contact-r1-error">最新エラー: ${escapeHtml(row.last_error)}</div>` : ""}

        <div class="contact-r1-actions">
          <small>既存のDPRO CONTACT R6-PROD Worker・Webhook・Secret・Tokenは変更しません。</small>
          ${canWrite() ? `<button id="contactR1Save" class="btn primary" type="button">${row && row.contact_enabled ? "CONTACT設定を保存" : "CONTACT導入を開始"}</button>` : `<span class="contact-r1-status">閲覧専用</span>`}
        </div>
      </section>
    `;
  }

  function insertPoint() {
    const detail = $("detailContent");
    if (!detail) return null;
    const sections = Array.from(detail.querySelectorAll(":scope > .detail-section"));
    return sections[1] || sections[0] || detail.querySelector(".detail-actions") || null;
  }

  function setChannelDisabled() {
    const enabled = Boolean($("contactR1Enabled")?.checked);
    ["contactR1Line", "contactR1Web", "contactR1Email", "contactR1Attachments"].forEach((id) => {
      const el = $(id);
      if (el) el.disabled = !enabled || !canWrite();
    });
  }

  function bindCardEvents() {
    $("contactR1Enabled")?.addEventListener("change", setChannelDisabled);
    $("contactR1Email")?.addEventListener("change", () => {
      if ($("contactR1Email")?.checked && $("contactR1Web")) $("contactR1Web").checked = true;
    });
    $("contactR1Web")?.addEventListener("change", () => {
      if (!$("contactR1Web")?.checked && $("contactR1Email")) $("contactR1Email").checked = false;
    });
    $("contactR1Save")?.addEventListener("click", saveCurrent);
  }

  async function loadAndRender(projectId) {
    const detail = $("detailContent");
    if (!detail || !projectId) return;
    if (state.loadingProjectId === projectId) return;
    state.loadingProjectId = projectId;
    const token = ++state.injectToken;

    try {
      const ok = await initSupabase();
      if (!ok || token !== state.injectToken) return;

      const [overviewResult, rowResult] = await Promise.all([
        state.supabase.from("cc_v_contract_setup_overview").select("*").eq("project_id", projectId).maybeSingle(),
        state.supabase.from("cc_contact_onboarding").select("*").eq("project_id", projectId).maybeSingle(),
      ]);
      if (overviewResult.error) throw overviewResult.error;
      if (rowResult.error) throw rowResult.error;
      if (token !== state.injectToken || state.currentProjectId !== projectId) return;

      state.currentOverview = overviewResult.data || { project_id: projectId };
      state.currentRow = rowResult.data || null;

      $("contactOnboardingR1")?.remove();
      const anchor = insertPoint();
      if (!anchor) return;
      anchor.insertAdjacentHTML("afterend", renderCard(state.currentOverview, state.currentRow));
      setChannelDisabled();
      bindCardEvents();
    } catch (error) {
      console.error(BUILD, error);
      $("contactOnboardingR1")?.remove();
      const anchor = insertPoint();
      if (anchor) {
        anchor.insertAdjacentHTML("afterend", `<div id="contactOnboardingR1" class="contact-r1-loading">DPRO CONTACT導入情報を読み込めませんでした。${escapeHtml(error.message || "DB接続を確認してください。")}</div>`);
      }
    } finally {
      if (state.loadingProjectId === projectId) state.loadingProjectId = "";
    }
  }

  function missingItems(payload) {
    if (!payload.contact_enabled) return [];
    const items = [];
    if (payload.line_enabled && payload.step_line !== "complete") items.push("LINE設定");
    if (payload.step_worker !== "complete") items.push("Worker作成");
    if (payload.step_db !== "complete") items.push("DB確認");
    if (payload.step_admin !== "complete") items.push("管理画面組込");
    if (payload.step_system_check !== "complete") items.push("system-check");
    if (payload.step_production_test !== "complete") items.push("本番送受信");
    return items;
  }

  function nextStep(oldValue, fallback = "not_started") {
    return oldValue && ["not_started", "pending", "complete", "not_required", "error"].includes(oldValue) ? oldValue : fallback;
  }

  async function saveCurrent() {
    if (!canWrite() || !state.supabase || !state.currentProjectId) return;
    const button = $("contactR1Save");
    if (button) {
      button.disabled = true;
      button.textContent = "保存中…";
    }

    try {
      const contactEnabled = Boolean($("contactR1Enabled")?.checked);
      const lineEnabled = contactEnabled && Boolean($("contactR1Line")?.checked);
      const webEnabled = contactEnabled && Boolean($("contactR1Web")?.checked);
      const emailEnabled = contactEnabled && Boolean($("contactR1Email")?.checked);
      const attachmentsEnabled = contactEnabled && Boolean($("contactR1Attachments")?.checked);
      const values = derivedValues(state.currentOverview, state.currentRow);
      const old = state.currentRow || {};

      const payload = {
        project_id: state.currentProjectId,
        contact_enabled: contactEnabled,
        line_enabled: lineEnabled,
        web_enabled: webEnabled,
        email_reply_enabled: emailEnabled,
        attachments_enabled: attachmentsEnabled,
        tenant_code: values.tenantCode,
        system_code: values.systemCode,
        worker_name: values.workerName,
        display_name: values.displayName,
        worker_url_candidate: values.workerUrl,
        feature_flags: {
          line: lineEnabled,
          web: webEnabled,
          email_reply: emailEnabled,
          attachments: attachmentsEnabled,
        },
        onboarding_status: contactEnabled ? (old.onboarding_status === "live" ? "live" : "in_progress") : "disabled",
        connection_status: contactEnabled ? (old.connection_status || "not_configured") : "not_configured",
        step_basic: contactEnabled ? "complete" : "not_started",
        step_line: contactEnabled ? (lineEnabled ? (old.step_line && old.step_line !== "not_required" ? nextStep(old.step_line, "pending") : "pending") : "not_required") : "not_started",
        step_worker: contactEnabled ? nextStep(old.step_worker) : "not_started",
        step_db: contactEnabled ? nextStep(old.step_db) : "not_started",
        step_admin: contactEnabled ? nextStep(old.step_admin) : "not_started",
        step_system_check: contactEnabled ? nextStep(old.step_system_check) : "not_started",
        step_production_test: contactEnabled ? nextStep(old.step_production_test) : "not_started",
        worker_version: old.worker_version || null,
        db_version: old.db_version || null,
        last_webhook_at: old.last_webhook_at || null,
        last_error: old.last_error || null,
        setup_package_version: old.setup_package_version || null,
        setup_package_name: old.setup_package_name || null,
        setup_package_generated_at: old.setup_package_generated_at || null,
        created_by: old.created_by || state.staff.id,
        updated_by: state.staff.id,
      };
      payload.missing_items = missingItems(payload);

      const { data, error } = await state.supabase
        .from("cc_contact_onboarding")
        .upsert(payload, { onConflict: "project_id" })
        .select("*")
        .single();
      if (error) throw error;

      state.currentRow = data;
      await loadAndRenderForce(state.currentProjectId);
      notify(contactEnabled ? "DPRO CONTACT導入設定を保存しました。" : "DPRO CONTACTを利用しない設定で保存しました。");
    } catch (error) {
      console.error(BUILD, error);
      notify(error.message || "DPRO CONTACT導入設定を保存できませんでした。", true);
      if (button) {
        button.disabled = false;
        button.textContent = state.currentRow?.contact_enabled ? "CONTACT設定を保存" : "CONTACT導入を開始";
      }
    }
  }

  async function loadAndRenderForce(projectId) {
    state.loadingProjectId = "";
    await loadAndRender(projectId);
  }

  function scheduleInjection() {
    const detail = $("detailContent");
    if (!detail || !state.currentProjectId) return;
    if (!detail.querySelector(".detail-title")) return;
    const existing = $("contactOnboardingR1");
    if (existing?.dataset.projectId === state.currentProjectId) return;
    setTimeout(() => loadAndRender(state.currentProjectId), 0);
  }

  function bindProjectCapture() {
    document.addEventListener("click", (event) => {
      const button = event.target.closest?.("[data-open-project]");
      if (!button?.dataset.openProject) return;
      state.currentProjectId = button.dataset.openProject;
      state.currentRow = null;
      state.currentOverview = null;
      state.injectToken += 1;
    }, true);
  }

  function observeDetail() {
    const detail = $("detailContent");
    if (!detail) return;
    const observer = new MutationObserver(scheduleInjection);
    observer.observe(detail, { childList: true, subtree: true });
    scheduleInjection();
  }

  async function boot() {
    try {
      installStyle();
      bindProjectCapture();
      observeDetail();
      await initSupabase();
      scheduleInjection();
    } catch (error) {
      console.error(BUILD, error);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
