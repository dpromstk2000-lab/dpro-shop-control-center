(() => {
  "use strict";

  const BUILD = "DPRO-CONTACT-ONBOARDING-R1-STEP6-20260815";
  const PACKAGE_VERSION = "DPRO-CONTACT-ONBOARDING-R1-PACKAGE-20260815";
  const WORKER_VERSION = "DPRO-CONTACT-1-WORKER-20260815-ATTACHMENTS-R6-PROD";
  const DB_VERSION = "DPRO-CONTACT-1-DB-20260814-WEB-R1";
  const ATTACHMENT_DB_VERSION = "DPRO-CONTACT-ATTACHMENTS-DB-20260815-R1";
  const DESIGN_VERSION = "DPRO-CONTACT-1.0-DESIGN-20260808";
  const WORKER_ASSET = "./contact-onboarding-r1-worker.js?v=DPRO-CONTACT-R6-PROD-20260815";
  const WORKER_SHA256 = "8b1dc3db6073befbb5f12e735bd754c4a21871108501e827658e8baeb2320438";
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
    currentProject: null,
    currentSystem: null,
    currentInventory: null,
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
      .contact-r1-package{margin-top:12px;padding:12px;border:1px solid #cfe1da;border-radius:12px;background:#fff;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center}.contact-r1-package strong{display:block;font-size:10px}.contact-r1-package p{margin:4px 0 0;color:var(--muted);font-size:8px;line-height:1.6}.contact-r1-package .package-meta{margin-top:5px;display:flex;gap:6px;flex-wrap:wrap}.contact-r1-package .package-meta span{display:inline-flex;padding:4px 7px;border-radius:999px;background:#eef2f0;color:#63736c;font-size:8px;font-weight:900}.contact-r1-package .package-meta span.green{background:#def5ea;color:#087253}.contact-r1-package .package-meta span.amber{background:#fff7e5;color:#8b5a00}
      .contact-r1-actions{margin-top:13px;display:flex;gap:9px;align-items:center;justify-content:flex-end;flex-wrap:wrap}.contact-r1-actions small{margin-right:auto;color:var(--muted);font-size:8px;line-height:1.55}.contact-r1-actions .btn{min-width:170px}
      .contact-r1-loading{margin-top:18px;padding:16px;border:1px dashed #b9d9ca;border-radius:13px;background:#f7fcf9;color:#557067;font-size:10px;font-weight:800}
      @media(max-width:760px){.contact-r1-channels{grid-template-columns:repeat(2,1fr)}.contact-r1-values{grid-template-columns:1fr}.contact-r1-runtime{grid-template-columns:repeat(2,1fr)}.contact-r1-head{display:block}.contact-r1-status{margin-top:8px}.contact-r1-package{grid-template-columns:1fr}.contact-r1-package .btn{width:100%}}
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

  function originOf(value) {
    try {
      return value ? new URL(value).origin : "";
    } catch (_) {
      return "";
    }
  }

  function packageReadiness(overview, row) {
    const values = derivedValues(overview, row);
    const project = state.currentProject || {};
    const inventory = state.currentInventory || {};
    const system = state.currentSystem || {};
    const missing = [];

    if (!project.system_instance_id) missing.push("DPRO製品 / system_instance 紐付け");
    if (!inventory.supabase_project_ref) missing.push("Supabase Project Ref");
    if (!values.systemCode || values.systemCode === "DPRO") missing.push("正式 SYSTEM_CODE");

    const origins = [system.public_url, system.owner_url, system.member_url, system.staff_url, system.ipad_url]
      .map(originOf)
      .filter(Boolean);
    const uniqueOrigins = [...new Set(origins)];
    if (!uniqueOrigins.length) missing.push("ALLOWED_ORIGINS候補");

    return {
      readyForR2: missing.length === 0,
      missing,
      supabaseProjectRef: inventory.supabase_project_ref || "",
      supabaseUrl: inventory.supabase_project_ref ? `https://${inventory.supabase_project_ref}.supabase.co` : "",
      allowedOrigins: uniqueOrigins,
      values,
    };
  }

  function packageName(overview, row) {
    const values = derivedValues(overview, row);
    const tenant = values.tenantCode.replace(/[^A-Z0-9_-]+/g, "_").slice(0, 32);
    const system = values.systemCode.replace(/[^A-Z0-9_-]+/g, "_").slice(0, 24);
    return `DPRO_CONTACT_SETUP_${tenant}_${system}_R1_20260815.zip`;
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

        ${(() => {
          const readiness = packageReadiness(overview, row);
          const generated = Boolean(row?.setup_package_generated_at);
          const generatedLabel = generated ? `生成済み ${new Date(row.setup_package_generated_at).toLocaleString("ja-JP")}` : "未生成";
          const readinessLabel = readiness.readyForR2 ? "R2接続準備OK" : "PREPARE ONLY";
          const note = readiness.readyForR2
            ? "契約先の非機密接続情報を確認できました。R1 ZIPを生成できます。Cloudflare Deployはまだ実行しません。"
            : `R1 ZIPは生成できますが、Deploy不可の準備パッケージになります。不足: ${readiness.missing.join(" / ")}`;
          return `<div class="contact-r1-package">
            <div>
              <strong>新規契約先用セットアップZIP</strong>
              <p>${escapeHtml(note)}</p>
              <div class="package-meta"><span class="${readiness.readyForR2 ? "green" : "amber"}">${escapeHtml(readinessLabel)}</span><span>${escapeHtml(generatedLabel)}</span>${row?.setup_package_name ? `<span>${escapeHtml(row.setup_package_name)}</span>` : ""}</div>
            </div>
            ${canWrite() && row?.contact_enabled ? `<button id="contactR1Package" class="btn secondary" type="button">セットアップZIP生成</button>` : ""}
          </div>`;
        })()}

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
    $("contactR1Package")?.addEventListener("click", generateSetupPackage);
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

      const [overviewResult, rowResult, projectResult] = await Promise.all([
        state.supabase.from("cc_v_contract_setup_overview").select("*").eq("project_id", projectId).maybeSingle(),
        state.supabase.from("cc_contact_onboarding").select("*").eq("project_id", projectId).maybeSingle(),
        state.supabase.from("cc_delivery_projects").select("id,project_code,client_id,system_instance_id,project_name,status").eq("id", projectId).maybeSingle(),
      ]);
      if (overviewResult.error) throw overviewResult.error;
      if (rowResult.error) throw rowResult.error;
      if (projectResult.error) throw projectResult.error;
      if (token !== state.injectToken || state.currentProjectId !== projectId) return;

      state.currentOverview = overviewResult.data || { project_id: projectId };
      state.currentRow = rowResult.data || null;
      state.currentProject = projectResult.data || null;
      state.currentSystem = null;
      state.currentInventory = null;

      if (state.currentProject?.system_instance_id) {
        const systemId = state.currentProject.system_instance_id;
        const [systemResult, inventoryResult] = await Promise.all([
          state.supabase.from("cc_system_instances")
            .select("id,client_id,site_id,system_code,system_name,facility_code,environment,status,public_url,owner_url,member_url,staff_url,ipad_url,system_check_url,health_url")
            .eq("id", systemId).maybeSingle(),
          state.supabase.from("cc_v_system_inventory").select("*").eq("id", systemId).maybeSingle(),
        ]);
        if (!systemResult.error) state.currentSystem = systemResult.data || null;
        if (!inventoryResult.error) state.currentInventory = inventoryResult.data || null;
        if (systemResult.error) console.warn(BUILD, "system inventory", systemResult.error);
        if (inventoryResult.error) console.warn(BUILD, "cc_v_system_inventory", inventoryResult.error);
      }

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

  function crc32(bytes) {
    if (!crc32.table) {
      crc32.table = Array.from({ length: 256 }, (_, n) => {
        let c = n;
        for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
        return c >>> 0;
      });
    }
    let crc = 0xffffffff;
    for (const b of bytes) crc = crc32.table[(crc ^ b) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
  }

  function concatBytes(parts) {
    const size = parts.reduce((sum, part) => sum + part.length, 0);
    const out = new Uint8Array(size);
    let offset = 0;
    for (const part of parts) { out.set(part, offset); offset += part.length; }
    return out;
  }

  function little16(value) {
    return new Uint8Array([value & 0xff, (value >>> 8) & 0xff]);
  }

  function little32(value) {
    return new Uint8Array([value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff]);
  }

  function dosStamp(date = new Date()) {
    const year = Math.max(1980, date.getFullYear());
    const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
    const day = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
    return { time, day };
  }

  function zipStored(files) {
    const encoder = new TextEncoder();
    const locals = [];
    const centrals = [];
    let offset = 0;
    const stamp = dosStamp();

    for (const file of files) {
      const name = encoder.encode(file.name);
      const data = file.data instanceof Uint8Array ? file.data : encoder.encode(String(file.data ?? ""));
      const crc = crc32(data);
      const flags = 0x0800;
      const local = concatBytes([
        little32(0x04034b50), little16(20), little16(flags), little16(0), little16(stamp.time), little16(stamp.day),
        little32(crc), little32(data.length), little32(data.length), little16(name.length), little16(0), name, data,
      ]);
      locals.push(local);

      const central = concatBytes([
        little32(0x02014b50), little16(20), little16(20), little16(flags), little16(0), little16(stamp.time), little16(stamp.day),
        little32(crc), little32(data.length), little32(data.length), little16(name.length), little16(0), little16(0),
        little16(0), little16(0), little32(0), little32(offset), name,
      ]);
      centrals.push(central);
      offset += local.length;
    }

    const centralBlock = concatBytes(centrals);
    const end = concatBytes([
      little32(0x06054b50), little16(0), little16(0), little16(files.length), little16(files.length),
      little32(centralBlock.length), little32(offset), little16(0),
    ]);
    return new Blob([...locals, centralBlock, end], { type: "application/zip" });
  }

  async function sha256Hex(bytes) {
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  function r1Profile(overview, row) {
    const readiness = packageReadiness(overview, row);
    const values = readiness.values;
    const lineChannelCode = `${values.systemCode}_LINE`.slice(0, 64);
    const lineChannelDisplayName = `${overview?.client_name || values.displayName} LINE公式`;
    const webChannelCode = `${values.systemCode}_WEB`.slice(0, 64);
    const webChannelDisplayName = `${overview?.client_name || values.displayName} WEB問い合わせ`;
    const webOrigins = readiness.allowedOrigins.join(",");

    return {
      package_version: PACKAGE_VERSION,
      generated_at: new Date().toISOString(),
      source_worker_version: WORKER_VERSION,
      source_worker_sha256: WORKER_SHA256,
      database_expected: DB_VERSION,
      attachment_db_extension: ATTACHMENT_DB_VERSION,
      design_version: DESIGN_VERSION,
      project: {
        id: state.currentProjectId,
        project_code: overview?.project_code || state.currentProject?.project_code || "",
        project_name: overview?.project_name || state.currentProject?.project_name || "",
        client_code: overview?.client_code || "",
        client_name: overview?.client_name || "",
        system_instance_id: state.currentProject?.system_instance_id || null,
      },
      contact: {
        tenant_code: values.tenantCode,
        system_code: values.systemCode,
        worker_name: values.workerName,
        worker_url_candidate: values.workerUrl,
        display_name: values.displayName,
        features: {
          line: Boolean(row?.line_enabled),
          web: Boolean(row?.web_enabled),
          email_reply: Boolean(row?.email_reply_enabled),
          attachments: Boolean(row?.attachments_enabled),
        },
      },
      connection: {
        supabase_project_ref: readiness.supabaseProjectRef || null,
        supabase_url: readiness.supabaseUrl || null,
        allowed_origins_candidates: readiness.allowedOrigins,
        supabase_publishable_key: null,
        contact_auth_mode: null,
        line_channel_code: lineChannelCode,
        line_channel_display_name: lineChannelDisplayName,
        web_channel_code: webChannelCode,
        web_channel_display_name: webChannelDisplayName,
        web_form_allowed_origins: webOrigins || null,
      },
      security: {
        secret_values_included: false,
        secrets_must_never_be_saved_to_control_center_or_github: true,
        r2_initial_secret_prompts: [
          "SUPABASE_SECRET_KEY",
          "LINE_CHANNEL_SECRET",
          "LINE_CHANNEL_ACCESS_TOKEN",
          ...(row?.web_enabled ? ["WEB_TURNSTILE_SECRET_KEY"] : []),
          ...(row?.email_reply_enabled ? ["RESEND_API_KEY"] : []),
        ],
        auto_generate_in_r2: ["CONTACT_ENCRYPTION_KEY"],
      },
      r1: {
        cloudflare_deploy_enabled: false,
        ready_for_r2_connection: readiness.readyForR2,
        missing_non_secret_config: readiness.missing,
      },
    };
  }

  function wranglerTemplate(profile) {
    const f = profile.contact.features;
    const c = profile.connection;
    const vars = {
      SUPABASE_URL: c.supabase_url || "__DPRO_REQUIRED_SUPABASE_URL__",
      SUPABASE_PUBLISHABLE_KEY: "__DPRO_REQUIRED_SUPABASE_PUBLISHABLE_KEY__",
      ALLOWED_ORIGINS: c.allowed_origins_candidates.length ? c.allowed_origins_candidates.join(",") : "__DPRO_REQUIRED_ALLOWED_ORIGINS__",
      TENANT_CODE: profile.contact.tenant_code,
      SYSTEM_CODE: profile.contact.system_code,
      LINE_CHANNEL_CODE: c.line_channel_code,
      LINE_CHANNEL_DISPLAY_NAME: c.line_channel_display_name,
      CONTACT_AUTH_MODE: "__DPRO_REQUIRED_CONTACT_AUTH_MODE__",
      CONTACT_ENABLED: "true",
      CONTACT_LINE_ENABLED: String(f.line),
      CONTACT_LINE_REPLY_ENABLED: String(f.line),
      CONTACT_SEARCH_ENABLED: "true",
      CONTACT_STATUS_ENABLED: "true",
      CONTACT_ATTACHMENTS_ENABLED: String(f.attachments),
      CONTACT_TEMPLATES_ENABLED: "false",
      CONTACT_ASSIGNMENT_ENABLED: "false",
      CONTACT_AI_SUGGESTIONS_ENABLED: "false",
      CONTACT_EMAIL_ENABLED: String(f.email_reply),
      CONTACT_WEB_ENABLED: String(f.web),
      CONTACT_SYSTEM_CHECK_ENABLED: "true",
      CONTACT_ATTACHMENT_LINK_TTL_SECONDS: "2592000",
    };

    if (f.web) {
      vars.WEB_CHANNEL_CODE = c.web_channel_code;
      vars.WEB_CHANNEL_DISPLAY_NAME = c.web_channel_display_name;
      vars.WEB_FORM_ALLOWED_ORIGINS = c.web_form_allowed_origins || "__DPRO_REQUIRED_WEB_FORM_ALLOWED_ORIGINS__";
      vars.WEB_TURNSTILE_SITE_KEY = "__DPRO_REQUIRED_WEB_TURNSTILE_SITE_KEY__";
      vars.WEB_TURNSTILE_HOSTNAMES = "__DPRO_REQUIRED_WEB_TURNSTILE_HOSTNAMES__";
    }
    if (f.email_reply) {
      vars.WEB_EMAIL_REPLY_ENABLED = "true";
      vars.WEB_EMAIL_FROM_ADDRESS = "__DPRO_REQUIRED_WEB_EMAIL_FROM_ADDRESS__";
      vars.WEB_EMAIL_FROM_NAME = profile.project.client_name || profile.contact.display_name;
    }

    return JSON.stringify({
      $schema: "https://raw.githubusercontent.com/cloudflare/workers-sdk/main/packages/wrangler/config-schema.json",
      name: profile.contact.worker_name,
      main: "worker.js",
      compatibility_date: "2026-08-15",
      workers_dev: true,
      keep_vars: true,
      observability: { enabled: true },
      vars,
    }, null, 2) + "\n";
  }

  function setupInfo(profile) {
    const missing = profile.r1.missing_non_secret_config.length
      ? profile.r1.missing_non_secret_config.map((x) => `- ${x}`).join("\r\n")
      : "- なし（R2接続に必要な基本台帳情報は確認済み）";
    return [
      "DPRO CONTACT / 新規契約先セットアップパッケージ R1",
      `PACKAGE: ${PACKAGE_VERSION}`,
      `WORKER: ${WORKER_VERSION}`,
      `WORKER_SHA256: ${WORKER_SHA256}`,
      `DB: ${DB_VERSION}`,
      `ATTACHMENT_DB: ${ATTACHMENT_DB_VERSION}`,
      "",
      `契約先: ${profile.project.client_name || "未設定"}`,
      `TENANT_CODE: ${profile.contact.tenant_code}`,
      `SYSTEM_CODE: ${profile.contact.system_code}`,
      `Worker: ${profile.contact.worker_name}`,
      `Worker URL候補: ${profile.contact.worker_url_candidate}`,
      `Supabase Project Ref: ${profile.connection.supabase_project_ref || "未設定"}`,
      "",
      "【重要】",
      "このZIPはR1のセットアップ準備パッケージです。",
      "CONTROL CENTERからCloudflare Deployは実行しません。",
      "DPRO CONTACT R6-PRODの既存Worker / Webhook / Secret / Tokenは変更しません。",
      "Secret値はこのZIPに含まれていません。",
      "",
      "【R2接続前に不足している非機密情報】",
      missing,
      "",
      "【ZIP内容】",
      "worker.js                       DPRO CONTACT R6-PROD共通Worker（固定SHA256検証済み）",
      "wrangler.jsonc                 契約先用の非機密設定テンプレート",
      "DPRO_CONTACT_SETUP_PROFILE.json 契約先導入プロファイル（Secretなし）",
      "DPRO_CONTACT_DB_CHECK.sql      CONTACT DBの読取専用チェック",
      "DPRO_CONTACT_SETUP.cmd         R1安全ガード。DeployはR2で有効化",
      "",
      "【R2で入力するSecret】",
      ...profile.security.r2_initial_secret_prompts.map((x) => `- ${x}`),
      "- CONTACT_ENCRYPTION_KEY はR2で自動生成（再Deploy時は維持）",
      "",
    ].join("\r\n");
  }

  function dbCheckSql(profile) {
    return `-- DPRO CONTACT R1 / READ-ONLY DB CHECK\n-- Target tenant: ${profile.contact.tenant_code}\n-- Expected base: ${DB_VERSION}\n-- This file does not create/update/delete anything.\n\nselect\n  to_regclass('public.dpro_contact_module_meta') is not null as module_meta_exists,\n  to_regclass('public.dpro_contact_channels') is not null as channels_exists,\n  to_regclass('public.dpro_contact_threads') is not null as threads_exists,\n  to_regclass('public.dpro_contact_messages') is not null as messages_exists,\n  to_regclass('public.dpro_contact_delivery_logs') is not null as delivery_logs_exists,\n  to_regclass('public.dpro_contact_web_rate_limits') is not null as web_rate_limits_exists,\n  to_regclass('public.dpro_contact_attachments') is not null as attachments_exists;\n\nselect module_code, module_version, design_version\nfrom public.dpro_contact_module_meta\nwhere module_code = 'DPRO_CONTACT';\n`;
  }

  function setupGuardCmd(profile) {
    return `@echo off\r\nchcp 65001 >nul\r\ntitle DPRO CONTACT R1 SETUP PACKAGE\r\necho.\r\necho ============================================================\r\necho DPRO CONTACT 新規契約先セットアップ R1\r\necho ============================================================\r\necho Tenant : ${profile.contact.tenant_code}\r\necho System : ${profile.contact.system_code}\r\necho Worker : ${profile.contact.worker_name}\r\necho.\r\necho このR1パッケージは準備・確認用です。\r\necho Cloudflare Deployはまだ実行しません。\r\necho R2で DPRO CONTACT V1.8 ONE-STORE SETUP STANDARD に接続します。\r\necho.\r\necho SecretはこのZIPに保存されていません。\r\necho 詳細は DPRO_CONTACT_SETUP_INFO.txt を確認してください。\r\necho.\r\npause\r\nexit /b 0\r\n`;
  }

  function hasUnsavedPackageSettings(row) {
    if (!row) return true;
    return Boolean($(
      "contactR1Enabled"
    )?.checked) !== Boolean(row.contact_enabled)
      || Boolean($("contactR1Line")?.checked) !== Boolean(row.line_enabled)
      || Boolean($("contactR1Web")?.checked) !== Boolean(row.web_enabled)
      || Boolean($("contactR1Email")?.checked) !== Boolean(row.email_reply_enabled)
      || Boolean($("contactR1Attachments")?.checked) !== Boolean(row.attachments_enabled);
  }

  async function generateSetupPackage() {
    if (!canWrite() || !state.currentRow?.contact_enabled) return;
    if (hasUnsavedPackageSettings(state.currentRow)) {
      notify("先にCONTACT設定を保存してからセットアップZIPを生成してください。", true);
      return;
    }

    const button = $("contactR1Package");
    if (button) { button.disabled = true; button.textContent = "ZIP生成中…"; }
    try {
      const response = await fetch(WORKER_ASSET, { cache: "no-store" });
      if (!response.ok) throw new Error(`共通Workerを取得できませんでした。HTTP ${response.status}`);
      const workerBytes = new Uint8Array(await response.arrayBuffer());
      const workerHash = await sha256Hex(workerBytes);
      if (workerHash !== WORKER_SHA256) throw new Error("共通WorkerのSHA256が正式R6-PRODと一致しません。生成を停止しました。");

      const profile = r1Profile(state.currentOverview, state.currentRow);
      const filename = packageName(state.currentOverview, state.currentRow);
      const files = [
        { name: "worker.js", data: workerBytes },
        { name: "wrangler.jsonc", data: wranglerTemplate(profile) },
        { name: "DPRO_CONTACT_SETUP_PROFILE.json", data: JSON.stringify(profile, null, 2) + "\n" },
        { name: "DPRO_CONTACT_SETUP_INFO.txt", data: setupInfo(profile) },
        { name: "DPRO_CONTACT_DB_CHECK.sql", data: dbCheckSql(profile) },
        { name: "DPRO_CONTACT_SETUP.cmd", data: setupGuardCmd(profile) },
      ];
      const blob = zipStored(files);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);

      const now = new Date().toISOString();
      const { data, error } = await state.supabase
        .from("cc_contact_onboarding")
        .update({
          setup_package_version: PACKAGE_VERSION,
          setup_package_name: filename,
          setup_package_generated_at: now,
          updated_by: state.staff.id,
        })
        .eq("project_id", state.currentProjectId)
        .select("*")
        .single();
      if (error) throw error;
      state.currentRow = data;
      await loadAndRenderForce(state.currentProjectId);
      notify(profile.r1.ready_for_r2_connection
        ? "DPRO CONTACTセットアップZIPを生成しました。R1ではDeployしません。"
        : "セットアップZIPを生成しました（PREPARE ONLY：未紐付け項目があります）。");
    } catch (error) {
      console.error(BUILD, error);
      notify(error.message || "セットアップZIPを生成できませんでした。", true);
      if (button) { button.disabled = false; button.textContent = "セットアップZIP生成"; }
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
      state.currentProject = null;
      state.currentSystem = null;
      state.currentInventory = null;
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
