(() => {
  "use strict";

  const BUILD = "DPRO-CONTACT-MULTI-STORE-R1-20260824";
  const ARCH_VERSION = "DPRO-CONTACT-MULTI-STORE-ARCHITECTURE-V1.0";
  const PACKAGE_VERSION = "DPRO-CONTACT-ONBOARDING-R1-MULTI-STORE-20260824";
  const WORKER_VERSION = "DPRO-CONTACT-1-WORKER-20260824-GMAIL-SENT-COPY-R7-STAGED";
  const WORKER_ASSET = "./contact-onboarding-r1-worker-r7.js?v=DPRO-CONTACT-R7-20260824";
  const WORKER_SHA256 = "5cb3e545c952194aefab6b49ddc5bfd081755cc71f6ba8aad2378fb0f6d3ba34";
  const DB_VERSION = "DPRO-CONTACT-1-DB-20260814-WEB-R1";
  const ATTACHMENT_DB_VERSION = "DPRO-CONTACT-ATTACHMENTS-DB-20260815-R1";
  const DESIGN_VERSION = "DPRO-CONTACT-1.0-DESIGN-20260808";
  const CONFIG = window.DPRO_CONTROL_CENTER_CONFIG || {};
  const WRITE_ROLES = new Set(["owner_admin", "technical_admin", "support"]);

  const state = {
    supabase: null,
    staff: null,
    projectId: "",
    row: null,
    overview: null,
    project: null,
    system: null,
    inventory: null,
    loading: false,
    token: 0,
  };

  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  function installStyle() {
    if ($("dpro-contact-arch-r1-style")) return;
    const style = document.createElement("style");
    style.id = "dpro-contact-arch-r1-style";
    style.textContent = `
      .contact-arch-r1{margin-top:12px;padding:14px;border:1px solid #9ec7b5;border-radius:13px;background:#f8fdfb}
      .contact-arch-r1-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}
      .contact-arch-r1-head h4{margin:0;font-size:11px}.contact-arch-r1-head p{margin:4px 0 0;color:var(--muted);font-size:8px;line-height:1.6}
      .contact-arch-r1-badge{display:inline-flex;padding:5px 8px;border-radius:999px;background:#def5ea;color:#087253;font-size:8px;font-weight:900;white-space:nowrap}
      .contact-arch-r1-grid{margin-top:10px;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px}
      .contact-arch-r1-kpi{padding:9px;border:1px solid #d6e6df;border-radius:10px;background:#fff}.contact-arch-r1-kpi span{display:block;color:var(--muted);font-size:7px;font-weight:800}.contact-arch-r1-kpi strong{display:block;margin-top:3px;font-size:9px}
      .contact-arch-r1-mail{margin-top:10px;padding:11px;border:1px solid #d6e6df;border-radius:11px;background:#fff}
      .contact-arch-r1-mail label.master{display:flex;align-items:center;gap:8px;font-size:9px;font-weight:900}.contact-arch-r1-mail input[type=checkbox]{width:18px;height:18px;accent-color:var(--green)}
      .contact-arch-r1-field{margin-top:8px;display:grid;gap:5px}.contact-arch-r1-field label{font-size:8px;font-weight:900;color:#52645c}.contact-arch-r1-field input{width:100%;box-sizing:border-box;border:1px solid #cbdcd4;border-radius:9px;padding:9px 10px;font:inherit;font-size:9px;background:#fff}
      .contact-arch-r1-help{margin-top:5px;color:var(--muted);font-size:8px;line-height:1.55}
      .contact-arch-r1-actions{margin-top:10px;display:flex;gap:8px;align-items:center;justify-content:flex-end;flex-wrap:wrap}.contact-arch-r1-actions small{margin-right:auto;color:var(--muted);font-size:8px;line-height:1.55;max-width:560px}
      .contact-arch-r1-package{margin-top:10px;padding:11px;border:1px solid #bed8cc;border-radius:11px;background:#fff;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center}.contact-arch-r1-package strong{font-size:10px}.contact-arch-r1-package p{margin:4px 0 0;color:var(--muted);font-size:8px;line-height:1.55}
      .contact-arch-r1-warn{margin-top:9px;padding:9px 10px;border-radius:9px;background:#fff7e5;color:#825b08;font-size:8px;font-weight:800;line-height:1.55}
      @media(max-width:760px){.contact-arch-r1-grid{grid-template-columns:repeat(2,1fr)}.contact-arch-r1-package{grid-template-columns:1fr}.contact-arch-r1-package .btn{width:100%}}
      @media(max-width:460px){.contact-arch-r1-grid{grid-template-columns:1fr}.contact-arch-r1-actions .btn{width:100%}}
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
    notify.timer = setTimeout(() => toast.classList.add("hidden"), 4200);
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
    const pc = await fetchPublicConfig();
    state.supabase = window.supabase.createClient(
      pc.supabaseUrl,
      pc.supabasePublishableKey || pc.supabaseAnonKey,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
          storageKey: pc.sessionStorageKey || "dpro-control-center-auth-v1",
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

  function currentProjectId() {
    return $("contactOnboardingR1")?.dataset?.projectId
      || new URLSearchParams(location.search).get("project")
      || state.projectId
      || "";
  }

  function validEmail(value) {
    const s = String(value || "").trim().toLowerCase();
    return !s || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
  }

  function originOf(value) {
    try { return value ? new URL(value).origin : ""; } catch (_) { return ""; }
  }

  function featureSettings(row) {
    const f = row?.feature_flags && typeof row.feature_flags === "object" ? row.feature_flags : {};
    return {
      gmailSentCopy: Boolean(f.gmail_sent_copy),
      archiveEmail: String(f.archive_email || "").trim().toLowerCase(),
    };
  }

  async function loadData(projectId) {
    if (!projectId || state.loading) return;
    state.loading = true;
    const token = ++state.token;
    try {
      const ok = await initSupabase();
      if (!ok || token !== state.token) return;
      state.projectId = projectId;
      const [rowResult, overviewResult, projectResult] = await Promise.all([
        state.supabase.from("cc_contact_onboarding").select("*").eq("project_id", projectId).maybeSingle(),
        state.supabase.from("cc_v_contract_setup_overview").select("*").eq("project_id", projectId).maybeSingle(),
        state.supabase.from("cc_delivery_projects").select("id,project_code,client_id,system_instance_id,project_name,status").eq("id", projectId).maybeSingle(),
      ]);
      if (rowResult.error) throw rowResult.error;
      if (overviewResult.error) throw overviewResult.error;
      if (projectResult.error) throw projectResult.error;
      if (token !== state.token) return;
      state.row = rowResult.data || null;
      state.overview = overviewResult.data || { project_id: projectId };
      state.project = projectResult.data || null;
      state.system = null;
      state.inventory = null;
      if (state.project?.system_instance_id) {
        const systemId = state.project.system_instance_id;
        const [systemResult, inventoryResult] = await Promise.all([
          state.supabase.from("cc_system_instances")
            .select("id,client_id,site_id,system_code,system_name,facility_code,environment,status,public_url,owner_url,member_url,staff_url,ipad_url,system_check_url,health_url")
            .eq("id", systemId).maybeSingle(),
          state.supabase.from("cc_v_system_inventory").select("*").eq("id", systemId).maybeSingle(),
        ]);
        if (!systemResult.error) state.system = systemResult.data || null;
        if (!inventoryResult.error) state.inventory = inventoryResult.data || null;
      }
      renderExtension();
    } finally {
      state.loading = false;
    }
  }

  function renderExtension() {
    const card = $("contactOnboardingR1");
    if (!card || !state.row || card.dataset.projectId !== state.projectId) return;

    const oldPackage = card.querySelector(".contact-r1-package");
    if (oldPackage) oldPackage.hidden = true;

    $("contactArchitectureR1")?.remove();
    const settings = featureSettings(state.row);
    const emailEnabled = Boolean(state.row.email_reply_enabled);
    const disabled = canWrite() ? "" : "disabled";
    const mailDisabled = (!canWrite() || !emailEnabled) ? "disabled" : "";
    const target = card.querySelector(".contact-r1-progress") || card.querySelector(".contact-r1-actions");
    if (!target) return;

    const html = `
      <div id="contactArchitectureR1" class="contact-arch-r1">
        <div class="contact-arch-r1-head">
          <div>
            <h4>契約店舗展開 V1.0</h4>
            <p>CONTACTは共通MASTER。店舗ごとのCONTACT専用GitHub Repoは作らず、既存Repoを再利用します。</p>
          </div>
          <span class="contact-arch-r1-badge">ARCHITECTURE LOCK</span>
        </div>
        <div class="contact-arch-r1-grid">
          <div class="contact-arch-r1-kpi"><span>CONTACT MASTER</span><strong>共通 1個</strong></div>
          <div class="contact-arch-r1-kpi"><span>新規GitHub Repo</span><strong>0個</strong></div>
          <div class="contact-arch-r1-kpi"><span>CONTACT Worker</span><strong>店舗ごと +1</strong></div>
          <div class="contact-arch-r1-kpi"><span>Supabase</span><strong>既存Project再利用</strong></div>
        </div>
        <div class="contact-arch-r1-mail">
          <label class="master">
            <input id="contactArchGmailCopy" type="checkbox" ${settings.gmailSentCopy ? "checked" : ""} ${mailDisabled}>
            Gmailへ送信控えを残す
          </label>
          <div class="contact-arch-r1-field">
            <label for="contactArchArchiveEmail">送信控え先メール</label>
            <input id="contactArchArchiveEmail" type="email" value="${esc(settings.archiveEmail)}" placeholder="例: owner@example.jp" ${mailDisabled}>
          </div>
          <div class="contact-arch-r1-help">${emailEnabled
            ? "BCC方式で控えを残します。Gmailの「送信済み」ではなく受信箱へ届く方式です。"
            : "「メール返信」をONにした契約先で利用できます。"}</div>
        </div>
        <div class="contact-arch-r1-actions">
          <small>Secretは保存しません。Gmail控え先は非機密Feature設定としてcc_contact_onboarding.feature_flagsへ保存します。</small>
          ${canWrite() ? `<button id="contactArchSave" class="btn secondary" type="button">拡張設定を保存</button>` : ""}
        </div>
        <div class="contact-arch-r1-package">
          <div>
            <strong>V1.0 CONTACT導入ZIP</strong>
            <p>R7 Worker・店舗別wrangler設定・Profile・DB確認・R1安全CMDを生成。Cloudflare DeployはR1では実行しません。</p>
          </div>
          ${canWrite() && state.row.contact_enabled ? `<button id="contactArchPackage" class="btn secondary" type="button">V1.0 ZIP生成</button>` : ""}
        </div>
        <div class="contact-arch-r1-warn">R2 / R3の旧20260815自動導入フローは、このV1.0 R1のQA完了まで実行しないでください。R2は次フェーズでR7基準へ更新します。</div>
      </div>`;
    target.insertAdjacentHTML("beforebegin", html);
    $("contactArchGmailCopy")?.addEventListener("change", () => {
      const email = $("contactArchArchiveEmail");
      if (email) email.disabled = !$("contactArchGmailCopy")?.checked || !emailEnabled || !canWrite();
    });
    const mail = $("contactArchArchiveEmail");
    if (mail && !$("contactArchGmailCopy")?.checked) mail.disabled = true;
    $("contactArchSave")?.addEventListener("click", saveExtension);
    $("contactArchPackage")?.addEventListener("click", generatePackage);
  }

  async function saveExtension() {
    if (!canWrite() || !state.row) return;
    const gmailSentCopy = Boolean($("contactArchGmailCopy")?.checked);
    const archiveEmail = String($("contactArchArchiveEmail")?.value || "").trim().toLowerCase();
    if (gmailSentCopy && !state.row.email_reply_enabled) {
      notify("Gmail送信控えを使う場合は、先にR1の「メール返信」をONにしてCONTACT設定を保存してください。", true);
      return;
    }
    if (gmailSentCopy && (!archiveEmail || !validEmail(archiveEmail))) {
      notify("送信控え先メールアドレスを正しく入力してください。", true);
      return;
    }
    const old = state.row.feature_flags && typeof state.row.feature_flags === "object" ? state.row.feature_flags : {};
    const merged = {
      ...old,
      gmail_sent_copy: gmailSentCopy,
      archive_email: gmailSentCopy ? archiveEmail : "",
      architecture_lock: ARCH_VERSION,
    };
    const btn = $("contactArchSave");
    if (btn) { btn.disabled = true; btn.textContent = "保存中…"; }
    try {
      const { data, error } = await state.supabase
        .from("cc_contact_onboarding")
        .update({ feature_flags: merged, updated_by: state.staff.id })
        .eq("project_id", state.projectId)
        .select("*")
        .single();
      if (error) throw error;
      state.row = data;
      renderExtension();
      notify("CONTACT V1.0拡張設定を保存しました。");
    } catch (error) {
      console.error(BUILD, error);
      notify(error.message || "拡張設定を保存できませんでした。", true);
      if (btn) { btn.disabled = false; btn.textContent = "拡張設定を保存"; }
    }
  }

  function coreSettingsUnsaved() {
    if (!state.row) return true;
    return Boolean($("contactR1Enabled")?.checked) !== Boolean(state.row.contact_enabled)
      || Boolean($("contactR1Line")?.checked) !== Boolean(state.row.line_enabled)
      || Boolean($("contactR1Web")?.checked) !== Boolean(state.row.web_enabled)
      || Boolean($("contactR1Email")?.checked) !== Boolean(state.row.email_reply_enabled)
      || Boolean($("contactR1Attachments")?.checked) !== Boolean(state.row.attachments_enabled);
  }

  function allowedOrigins() {
    const s = state.system || {};
    return [...new Set([s.public_url, s.owner_url, s.member_url, s.staff_url, s.ipad_url].map(originOf).filter(Boolean))];
  }

  function profile() {
    const settings = featureSettings(state.row);
    const origins = allowedOrigins();
    const supabaseRef = String(state.inventory?.supabase_project_ref || "");
    const tenant = String(state.row.tenant_code || "");
    const system = String(state.row.system_code || "");
    const clientName = String(state.overview?.client_name || state.overview?.project_name || state.row.display_name || "");
    const emailHold = Boolean(state.row.email_reply_enabled);
    const missing = [];
    if (!state.project?.system_instance_id) missing.push("DPRO製品 / system_instance 紐付け");
    if (!supabaseRef) missing.push("Supabase Project Ref");
    if (!origins.length) missing.push("ALLOWED_ORIGINS候補");
    if (emailHold) missing.push("メール配送方式（R3共通MAIL GATEWAY または店舗独自メール設定）");

    return {
      package_version: PACKAGE_VERSION,
      architecture_version: ARCH_VERSION,
      generated_at: new Date().toISOString(),
      source_worker_version: WORKER_VERSION,
      source_worker_sha256: WORKER_SHA256,
      database_expected: DB_VERSION,
      attachment_db_extension: ATTACHMENT_DB_VERSION,
      design_version: DESIGN_VERSION,
      project: {
        id: state.projectId,
        project_code: state.overview?.project_code || state.project?.project_code || "",
        project_name: state.overview?.project_name || state.project?.project_name || "",
        client_name: clientName,
        system_instance_id: state.project?.system_instance_id || null,
        github_policy: "REUSE_EXISTING_STORE_REPOSITORY",
        new_contact_repository_required: false,
      },
      contact: {
        tenant_code: tenant,
        system_code: system,
        worker_name: state.row.worker_name || "",
        worker_url_candidate: state.row.worker_url_candidate || "",
        display_name: state.row.display_name || `${clientName} DPRO CONTACT`,
        worker_policy: "ONE_CONTACT_WORKER_PER_STORE",
        features: {
          line: Boolean(state.row.line_enabled),
          web: Boolean(state.row.web_enabled),
          email_reply: Boolean(state.row.email_reply_enabled),
          attachments: Boolean(state.row.attachments_enabled),
          gmail_sent_copy: settings.gmailSentCopy,
        },
        archive_email: settings.gmailSentCopy ? settings.archiveEmail : null,
      },
      connection: {
        reuse_existing_supabase_project: true,
        supabase_project_ref: supabaseRef || null,
        supabase_url: supabaseRef ? `https://${supabaseRef}.supabase.co` : null,
        allowed_origins_candidates: origins,
      },
      security: {
        secret_values_included: false,
        secrets_in_zip_or_github: false,
        initial_secret_prompts: [
          "SUPABASE_SECRET_KEY",
          ...(state.row.line_enabled ? ["LINE_CHANNEL_SECRET", "LINE_CHANNEL_ACCESS_TOKEN"] : []),
          ...(state.row.web_enabled ? ["WEB_TURNSTILE_SECRET_KEY"] : []),
          ...(state.row.email_reply_enabled ? ["RESEND_API_KEY（R3 MAIL GATEWAY完成前の店舗独自方式のみ）"] : []),
        ],
        auto_generate_next_phase: ["CONTACT_ENCRYPTION_KEY"],
      },
      r1: {
        cloudflare_deploy_enabled: false,
        ready_for_r2: missing.length === 0,
        r2_hold: true,
        r2_hold_reason: "R2/R3をR7 + Multi Store V1.0基準へ更新するまでHOLD",
        missing_non_secret_config: missing,
      },
    };
  }

  function wrangler(p) {
    const f = p.contact.features;
    const origins = p.connection.allowed_origins_candidates;
    const clientName = p.project.client_name || p.contact.display_name;
    const vars = {
      SUPABASE_URL: p.connection.supabase_url || "__DPRO_REQUIRED_SUPABASE_URL__",
      SUPABASE_PUBLISHABLE_KEY: "__DPRO_REQUIRED_SUPABASE_PUBLISHABLE_KEY__",
      ALLOWED_ORIGINS: origins.length ? origins.join(",") : "__DPRO_REQUIRED_ALLOWED_ORIGINS__",
      TENANT_CODE: p.contact.tenant_code,
      SYSTEM_CODE: p.contact.system_code,
      LINE_CHANNEL_CODE: `${p.contact.system_code}_LINE`.slice(0, 64),
      LINE_CHANNEL_DISPLAY_NAME: `${clientName} LINE公式`.slice(0, 120),
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
      WEB_EMAIL_SENT_COPY_ENABLED: String(f.gmail_sent_copy && f.email_reply),
      WEB_EMAIL_SENT_COPY_TO: f.gmail_sent_copy ? (p.contact.archive_email || "__DPRO_REQUIRED_ARCHIVE_EMAIL__") : "",
    };
    if (f.web) {
      vars.WEB_CHANNEL_CODE = `${p.contact.system_code}_WEB`.slice(0, 64);
      vars.WEB_CHANNEL_DISPLAY_NAME = `${clientName} WEB問い合わせ`.slice(0, 120);
      vars.WEB_FORM_ALLOWED_ORIGINS = origins.length ? origins.join(",") : "__DPRO_REQUIRED_WEB_FORM_ALLOWED_ORIGINS__";
      vars.WEB_TURNSTILE_SITE_KEY = "__DPRO_REQUIRED_WEB_TURNSTILE_SITE_KEY__";
      vars.WEB_TURNSTILE_HOSTNAMES = "__DPRO_REQUIRED_WEB_TURNSTILE_HOSTNAMES__";
    }
    if (f.email_reply) {
      vars.WEB_EMAIL_REPLY_ENABLED = "true";
      vars.WEB_EMAIL_FROM_ADDRESS = "__DPRO_R3_MAIL_GATEWAY_OR_CUSTOM_DOMAIN_REQUIRED__";
      vars.WEB_EMAIL_FROM_NAME = clientName;
      vars.WEB_EMAIL_INBOUND_ENABLED = "true";
      vars.WEB_EMAIL_FORWARD_TO = p.contact.archive_email || "__DPRO_REQUIRED_INBOUND_FORWARD_EMAIL__";
    }
    return JSON.stringify({
      $schema: "https://raw.githubusercontent.com/cloudflare/workers-sdk/main/packages/wrangler/config-schema.json",
      name: p.contact.worker_name,
      main: "worker.js",
      compatibility_date: "2026-08-24",
      workers_dev: true,
      keep_vars: true,
      observability: { enabled: true },
      vars,
    }, null, 2) + "\n";
  }

  function dbCheckSql(p) {
    return `-- DPRO CONTACT V1.0 / READ-ONLY DB CHECK
-- Tenant: ${p.contact.tenant_code}
-- Expected DB: ${DB_VERSION}
-- ADDITIVE SETUP PRECHECK ONLY. No write operation.

select
  to_regclass('public.dpro_contact_module_meta') is not null as module_meta_exists,
  to_regclass('public.dpro_contact_channels') is not null as channels_exists,
  to_regclass('public.dpro_contact_threads') is not null as threads_exists,
  to_regclass('public.dpro_contact_messages') is not null as messages_exists,
  to_regclass('public.dpro_contact_delivery_logs') is not null as delivery_logs_exists,
  to_regclass('public.dpro_contact_web_rate_limits') is not null as web_rate_limits_exists,
  to_regclass('public.dpro_contact_attachments') is not null as attachments_exists;

select module_code, module_version, design_version
from public.dpro_contact_module_meta
where module_code = 'DPRO_CONTACT';
`;
  }

  function startHere(p) {
    return [
      "DPRO CONTACT / 契約店舗導入パッケージ R1 V1.0",
      `PACKAGE: ${PACKAGE_VERSION}`,
      `ARCHITECTURE: ${ARCH_VERSION}`,
      `WORKER: ${WORKER_VERSION}`,
      `WORKER_SHA256: ${WORKER_SHA256}`,
      "",
      `契約先: ${p.project.client_name || "未設定"}`,
      `TENANT_CODE: ${p.contact.tenant_code}`,
      `SYSTEM_CODE: ${p.contact.system_code}`,
      `CONTACT Worker: ${p.contact.worker_name}`,
      "",
      "【固定方針】",
      "- CONTACT専用GitHub Repoは新設しない。店舗既存Repoを再利用。",
      "- CONTACT Workerは1店舗1個。",
      "- Supabaseは店舗既存Project再利用を標準。",
      "- 会話本文を中央CONTROL CENTERへ集約しない。",
      "- Secret値はZIP/GitHubへ保存しない。",
      "",
      "【R1】",
      "Cloudflare Deployは実行しません。",
      "R2/R3はR7 + Multi Store V1.0基準へ更新するまでHOLDです。",
      "",
    ].join("\r\n");
  }

  function setupInfo(p) {
    const missing = p.r1.missing_non_secret_config.length
      ? p.r1.missing_non_secret_config.map((x) => `- ${x}`).join("\r\n")
      : "- なし";
    return [
      "DPRO CONTACT / R1 V1.0 SETUP INFO",
      "",
      `GitHub: 新規CONTACT Repo不要 / 既存店舗Repo再利用`,
      `Cloudflare: CONTACT Workerを店舗ごとに1個`,
      `Supabase: 既存店舗Project再利用`,
      `Gmail送信控え: ${p.contact.features.gmail_sent_copy ? "ON" : "OFF"}`,
      `控え先: ${p.contact.archive_email || "—"}`,
      "",
      "R2接続前の確認 / HOLD項目:",
      missing,
      "",
      "Secret値は含まれていません。",
      "DPRO_CONTACT_SETUP.cmdはR1ガードのみで、Deployしません。",
      "",
    ].join("\r\n");
  }

  function statusTxt(p) {
    return [
      "STATUS: R1 PACKAGE GENERATED / R2 HOLD",
      `PACKAGE_VERSION: ${PACKAGE_VERSION}`,
      `WORKER_VERSION: ${WORKER_VERSION}`,
      `ARCHITECTURE: ${ARCH_VERSION}`,
      `READY_FOR_R2_CONFIG: ${p.r1.ready_for_r2 ? "YES" : "NO"}`,
      "R2_EXECUTION: HOLD UNTIL R7 MULTI-STORE UPDATE",
      "CLOUDFLARE_DEPLOY: DISABLED IN R1",
      "",
    ].join("\r\n");
  }

  function nextActionTxt() {
    return [
      "次のアクション",
      "",
      "1. このR1 ZIPは保管・レビュー用。CloudflareへDeployしない。",
      "2. R1 UI / generated profile / Gmail送信控え設定を確認する。",
      "3. R1 CENTRAL QA PASS後、R2をR7 Multi Store基準へ更新する。",
      "4. R2更新完了前は旧R2/R3 ZIPを実契約に使用しない。",
      "",
    ].join("\r\n");
  }

  function setupGuardCmd(p) {
    return `@echo off\r
chcp 65001 >nul\r
title DPRO CONTACT R1 MULTI STORE PACKAGE\r
echo.\r
echo ============================================================\r
echo DPRO CONTACT R1 V1.0 / PREPARE ONLY\r
echo ============================================================\r
echo Tenant : ${p.contact.tenant_code}\r
echo System : ${p.contact.system_code}\r
echo Worker : ${p.contact.worker_name}\r
echo.\r
echo このR1パッケージではCloudflare Deployを実行しません。\r
echo R2/R3はR7 Multi Store V1.0へ更新するまでHOLDです。\r
echo SecretはこのZIPに保存されていません。\r
echo.\r
pause\r
exit /b 0\r
`;
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
  const little16 = (v) => new Uint8Array([v & 0xff, (v >>> 8) & 0xff]);
  const little32 = (v) => new Uint8Array([v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff]);

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

  function packageName(p) {
    const tenant = String(p.contact.tenant_code || "TENANT").replace(/[^A-Z0-9_-]+/gi, "_").slice(0, 32);
    const system = String(p.contact.system_code || "DPRO").replace(/[^A-Z0-9_-]+/gi, "_").slice(0, 24);
    return `DPRO_CONTACT_SETUP_${tenant}_${system}_R1_V1.0_20260824.zip`;
  }

  async function generatePackage() {
    if (!canWrite() || !state.row?.contact_enabled) return;
    if (coreSettingsUnsaved()) {
      notify("先に既存R1の「CONTACT設定を保存」でLINE/WEB/メール/添付設定を保存してください。", true);
      return;
    }
    const settings = featureSettings(state.row);
    if (settings.gmailSentCopy && (!settings.archiveEmail || !validEmail(settings.archiveEmail))) {
      notify("Gmail送信控え設定を先に保存してください。", true);
      return;
    }
    const btn = $("contactArchPackage");
    if (btn) { btn.disabled = true; btn.textContent = "ZIP生成中…"; }
    try {
      const response = await fetch(WORKER_ASSET, { cache: "no-store" });
      if (!response.ok) throw new Error(`R7共通Workerを取得できません。HTTP ${response.status}`);
      const workerBytes = new Uint8Array(await response.arrayBuffer());
      const hash = await sha256Hex(workerBytes);
      if (hash !== WORKER_SHA256) throw new Error("R7共通Worker SHA256不一致。ZIP生成を停止しました。");
      const p = profile();
      const sql = dbCheckSql(p);
      const files = [
        { name: "00_START_HERE.txt", data: startHere(p) },
        { name: "worker.js", data: workerBytes },
        { name: "worker-TEXT.txt", data: workerBytes },
        { name: "wrangler.jsonc", data: wrangler(p) },
        { name: "DPRO_CONTACT_SETUP_PROFILE.json", data: JSON.stringify(p, null, 2) + "\n" },
        { name: "DPRO_CONTACT_SETUP_INFO.txt", data: setupInfo(p) },
        { name: "DPRO_CONTACT_DB_CHECK.sql", data: sql },
        { name: "DPRO_CONTACT_DB_CHECK_SQL_TEXT.txt", data: sql },
        { name: "DPRO_CONTACT_SETUP.cmd", data: setupGuardCmd(p) },
        { name: "STATUS.txt", data: statusTxt(p) },
        { name: "NEXT_ACTION.txt", data: nextActionTxt() },
      ];
      const blob = zipStored(files);
      const filename = packageName(p);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename; a.style.display = "none";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);

      const oldFlags = state.row.feature_flags && typeof state.row.feature_flags === "object" ? state.row.feature_flags : {};
      const { data, error } = await state.supabase
        .from("cc_contact_onboarding")
        .update({
          feature_flags: { ...oldFlags, architecture_lock: ARCH_VERSION },
          setup_package_version: PACKAGE_VERSION,
          setup_package_name: filename,
          setup_package_generated_at: new Date().toISOString(),
          updated_by: state.staff.id,
        })
        .eq("project_id", state.projectId)
        .select("*")
        .single();
      if (error) throw error;
      state.row = data;
      renderExtension();
      notify("DPRO CONTACT R1 V1.0セットアップZIPを生成しました。R2には進みません。");
    } catch (error) {
      console.error(BUILD, error);
      notify(error.message || "R1 V1.0 ZIPを生成できませんでした。", true);
      if (btn) { btn.disabled = false; btn.textContent = "V1.0 ZIP生成"; }
    }
  }

  function schedule() {
    const card = $("contactOnboardingR1");
    if (!card) return;
    const projectId = card.dataset.projectId || "";
    if (!projectId) return;
    if (projectId !== state.projectId || !state.row || !$("contactArchitectureR1")) {
      setTimeout(() => loadData(projectId).catch((e) => console.error(BUILD, e)), 0);
    }
  }

  function observe() {
    const detail = $("detailContent");
    if (!detail) return;
    const observer = new MutationObserver(schedule);
    observer.observe(detail, { childList: true, subtree: true });
    document.addEventListener("click", (event) => {
      const open = event.target.closest?.("[data-open-project]");
      if (!open?.dataset?.openProject) return;
      state.projectId = "";
      state.row = null;
      state.overview = null;
      state.project = null;
      state.system = null;
      state.inventory = null;
      state.token += 1;
    }, true);
    schedule();
  }

  async function boot() {
    installStyle();
    try { await initSupabase(); } catch (e) { console.error(BUILD, e); }
    observe();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();