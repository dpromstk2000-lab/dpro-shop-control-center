(() => {
  "use strict";

  const BUILD = "DPRO-CONTACT-AUTO-ONBOARDING-R2-2-20260815";
  const CONFIG = window.DPRO_CONTROL_CENTER_CONFIG || {};
  const WRITE_ROLES = new Set(["owner_admin", "technical_admin", "support"]);

  const state = {
    supabase: null,
    staff: null,
    currentProjectId: new URLSearchParams(location.search).get("project") || "",
    loadingProjectId: "",
    readiness: null,
    deployProfile: null,
    authProfile: null,
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
    if ($("dpro-contact-r2-style")) return;
    const style = document.createElement("style");
    style.id = "dpro-contact-r2-style";
    style.textContent = `
      .contact-r2-card{margin-top:12px;padding:18px;border:1px solid #b8cfe9;border-radius:16px;background:linear-gradient(145deg,#fbfdff,#f2f7fc)}
      .contact-r2-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px}
      .contact-r2-head h3{margin:0;font-size:17px}.contact-r2-head p{margin:5px 0 0;color:var(--muted);font-size:9px;line-height:1.65}
      .contact-r2-badge{display:inline-flex;align-items:center;min-height:28px;padding:5px 10px;border-radius:999px;background:#edf1f5;color:#5f6f7f;font-size:9px;font-weight:900;white-space:nowrap}
      .contact-r2-badge.green{background:#def5ea;color:#087253}.contact-r2-badge.amber{background:#fff7e5;color:#8b5a00}.contact-r2-badge.red{background:#fff0f3;color:#b63247}
      .contact-r2-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin-top:13px}
      .contact-r2-box{padding:12px;border:1px solid #d7e2ed;border-radius:12px;background:#fff;min-width:0}
      .contact-r2-box.full{grid-column:1/-1}.contact-r2-box h4{margin:0 0 8px;font-size:10px}
      .contact-r2-kv{display:grid;grid-template-columns:150px minmax(0,1fr);gap:5px 10px;font-size:9px;line-height:1.55}
      .contact-r2-kv span{color:var(--muted);font-weight:800}.contact-r2-kv strong{overflow-wrap:anywhere}
      .contact-r2-missing{margin-top:10px;padding:10px 12px;border-radius:10px;background:#fff8e9;color:#805b10;font-size:9px;font-weight:800;line-height:1.65}
      .contact-r2-ready{margin-top:10px;padding:10px 12px;border-radius:10px;background:#eaf8f2;color:#087253;font-size:9px;font-weight:900}
      .contact-r2-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
      .contact-r2-field{display:grid;gap:5px;min-width:0}.contact-r2-field.full{grid-column:1/-1}
      .contact-r2-field label{font-size:8px;font-weight:900;color:#526171}
      .contact-r2-field input,.contact-r2-field select,.contact-r2-field textarea{width:100%;box-sizing:border-box;border:1px solid #cbd7e3;border-radius:9px;padding:9px 10px;background:#fff;color:inherit;font:inherit;font-size:10px}
      .contact-r2-field textarea{min-height:66px;resize:vertical}
      .contact-r2-help{font-size:8px;color:var(--muted);line-height:1.55}
      .contact-r2-section-title{margin:0 0 9px;font-size:10px;display:flex;align-items:center;gap:7px}
      .contact-r2-actions{margin-top:13px;display:flex;gap:8px;justify-content:flex-end;align-items:center;flex-wrap:wrap}
      .contact-r2-actions small{margin-right:auto;color:var(--muted);font-size:8px;line-height:1.55;max-width:620px}
      .contact-r2-actions .btn{min-width:170px}
      .contact-r2-warning{margin-top:10px;padding:10px 12px;border-radius:10px;background:#fff0f3;color:#9b3346;font-size:8px;font-weight:800;line-height:1.6}
      .contact-r2-loading{margin-top:12px;padding:14px;border:1px dashed #bed0e1;border-radius:12px;background:#f8fbfe;color:#617284;font-size:9px;font-weight:800}
      @media(max-width:760px){.contact-r2-grid,.contact-r2-form{grid-template-columns:1fr}.contact-r2-box.full,.contact-r2-field.full{grid-column:auto}.contact-r2-head{display:block}.contact-r2-badge{margin-top:8px}.contact-r2-kv{grid-template-columns:1fr}.contact-r2-actions .btn{width:100%}}
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
    notify.timer = setTimeout(() => toast.classList.add("hidden"), 3800);
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

  function csv(value) {
    return String(value || "")
      .split(/[\n,]/)
      .map((v) => v.trim())
      .filter(Boolean);
  }

  function unique(values) {
    return [...new Set((values || []).filter(Boolean))];
  }

  function currentProjectId() {
    const r1 = $("contactOnboardingR1");
    const fromCard = r1?.dataset?.projectId || "";
    return fromCard || state.currentProjectId;
  }

  function urlHostnames(origins) {
    return unique((origins || []).map((origin) => {
      try { return new URL(origin).hostname; } catch (_) { return ""; }
    }).filter(Boolean));
  }

  function badgeData(readiness) {
    if (!readiness) return ["未確認", ""];
    if (readiness.ready_for_r2_package) return ["R2 READY", "green"];
    const count = Array.isArray(readiness.missing_non_secret_config)
      ? readiness.missing_non_secret_config.length : 0;
    return [`不足 ${count}件`, count ? "amber" : ""];
  }

  function inputValue(value) {
    return esc(value ?? "");
  }

  function renderAuthFields(auth) {
    const mode = auth?.auth_mode || "unreviewed";
    if (mode !== "supabase_staff") return "";
    return `
      <div class="contact-r2-field"><label>STAFF TABLE</label><input id="contactR2StaffTable" value="${inputValue(auth?.staff_table)}" placeholder="例: salon_staff"></div>
      <div class="contact-r2-field"><label>ID COLUMN</label><input id="contactR2StaffIdColumn" value="${inputValue(auth?.staff_id_column)}" placeholder="id"></div>
      <div class="contact-r2-field"><label>AUTH USER COLUMN</label><input id="contactR2StaffUserColumn" value="${inputValue(auth?.staff_user_column)}" placeholder="auth_user_id"></div>
      <div class="contact-r2-field"><label>DISPLAY COLUMN</label><input id="contactR2StaffDisplayColumn" value="${inputValue(auth?.staff_display_column)}" placeholder="display_name"></div>
      <div class="contact-r2-field"><label>ROLE COLUMN</label><input id="contactR2StaffRoleColumn" value="${inputValue(auth?.staff_role_column)}" placeholder="role_key"></div>
      <div class="contact-r2-field"><label>STATUS COLUMN</label><input id="contactR2StaffStatusColumn" value="${inputValue(auth?.staff_status_column)}" placeholder="status"></div>
      <div class="contact-r2-field"><label>ACTIVE VALUE</label><input id="contactR2StaffActiveValue" value="${inputValue(auth?.staff_active_value)}" placeholder="active"></div>
      <div class="contact-r2-field"><label>TENANT COLUMN（任意）</label><input id="contactR2StaffTenantColumn" value="${inputValue(auth?.staff_tenant_column)}"></div>
      <div class="contact-r2-field full"><label>ALLOWED ROLES</label><input id="contactR2AllowedRoles" value="${inputValue((auth?.allowed_roles || []).join(","))}" placeholder="owner,support,staff"></div>
      <div class="contact-r2-field full"><label>READ ONLY ROLES（任意）</label><input id="contactR2ReadOnlyRoles" value="${inputValue((auth?.read_only_roles || ["read_only"]).join(","))}" placeholder="read_only"></div>
    `;
  }

  function renderCard() {
    const r = state.readiness || {};
    const dp = state.deployProfile || {};
    const ap = state.authProfile || {};
    const [badge, tone] = badgeData(r);
    const missing = Array.isArray(r.missing_non_secret_config) ? r.missing_non_secret_config : [];
    const autoOrigins = unique(r.allowed_origins_candidates || []);
    const overrideOrigins = Array.isArray(dp.allowed_origins_override) ? dp.allowed_origins_override : [];
    const effectiveOrigins = overrideOrigins.length ? overrideOrigins : autoOrigins;
    const autoHosts = urlHostnames(effectiveOrigins);
    const webEnabled = Boolean(r.web_enabled);
    const emailEnabled = Boolean(r.email_reply_enabled);
    const systemCode = r.system_code || "";
    const writeDisabled = canWrite() ? "" : "disabled";

    return `
      <section id="contactOnboardingR2" class="contact-r2-card" data-project-id="${esc(r.project_id || currentProjectId())}">
        <div class="contact-r2-head">
          <div>
            <h3>DPRO CONTACT 自動導入 R2</h3>
            <p>R2-2：契約情報から非機密設定を自動取得し、不足している設定だけを補います。Secret・Token・暗号鍵は保存しません。</p>
          </div>
          <span class="contact-r2-badge ${tone}">${esc(badge)}</span>
        </div>

        <div class="contact-r2-grid">
          <div class="contact-r2-box">
            <h4>自動取得済み</h4>
            <div class="contact-r2-kv">
              <span>契約先</span><strong>${esc(r.client_name || "—")}</strong>
              <span>SYSTEM_CODE</span><strong>${esc(systemCode || "—")}</strong>
              <span>TENANT_CODE</span><strong>${esc(r.tenant_code || "—")}</strong>
              <span>Worker</span><strong>${esc(r.worker_name || "—")}</strong>
              <span>Supabase Project Ref</span><strong>${esc(r.supabase_project_ref || "—")}</strong>
            </div>
          </div>
          <div class="contact-r2-box">
            <h4>自動取得した許可Origin</h4>
            <div class="contact-r2-kv">
              <span>候補数</span><strong>${autoOrigins.length}件</strong>
              <span>使用予定</span><strong>${esc(effectiveOrigins.join(", ") || "—")}</strong>
              ${webEnabled ? `<span>WEB Hostname候補</span><strong>${esc(autoHosts.join(", ") || "—")}</strong>` : ""}
            </div>
          </div>

          <div class="contact-r2-box full">
            <h4 class="contact-r2-section-title">契約先ごとの非機密Deploy設定</h4>
            <div class="contact-r2-form">
              <div class="contact-r2-field full">
                <label>SUPABASE_PUBLISHABLE_KEY</label>
                <input id="contactR2PublishableKey" value="${inputValue(dp.supabase_publishable_key)}" placeholder="sb_publishable_... または公開可能なanon互換キー" ${writeDisabled}>
                <div class="contact-r2-help">公開用キーです。SUPABASE_SECRET_KEY / service_role は絶対に入力しません。</div>
              </div>
              <div class="contact-r2-field full">
                <label>ALLOWED_ORIGINS 上書き（通常は空欄でOK）</label>
                <textarea id="contactR2AllowedOrigins" placeholder="${esc(autoOrigins.join(", "))}" ${writeDisabled}>${esc(overrideOrigins.join("\n"))}</textarea>
                <div class="contact-r2-help">空欄なら上の自動取得候補を使用します。必要な場合だけ1行1Originで上書きします。</div>
              </div>

              ${webEnabled ? `
                <div class="contact-r2-field">
                  <label>WEB_TURNSTILE_SITE_KEY</label>
                  <input id="contactR2TurnstileSiteKey" value="${inputValue(dp.web_turnstile_site_key)}" ${writeDisabled}>
                  <div class="contact-r2-help">Site Keyは公開値です。Secret Keyは保存しません。</div>
                </div>
                <div class="contact-r2-field">
                  <label>WEB_TURNSTILE_HOSTNAMES</label>
                  <input id="contactR2TurnstileHostnames" value="${inputValue((dp.web_turnstile_hostnames || []).join(","))}" placeholder="${esc(autoHosts.join(","))}" ${writeDisabled}>
                  <div class="contact-r2-help">空欄なら現在のOrigin候補からHostnameを補完して保存します。</div>
                </div>
              ` : ""}

              ${emailEnabled ? `
                <div class="contact-r2-field">
                  <label>WEB_EMAIL_FROM_ADDRESS</label>
                  <input id="contactR2EmailFromAddress" value="${inputValue(dp.web_email_from_address || "reply@dpro-shop.com")}" ${writeDisabled}>
                </div>
                <div class="contact-r2-field">
                  <label>WEB_EMAIL_FROM_NAME</label>
                  <input id="contactR2EmailFromName" value="${inputValue(dp.web_email_from_name || r.client_name || "")}" ${writeDisabled}>
                </div>
              ` : ""}
            </div>
          </div>

          <div class="contact-r2-box full">
            <h4 class="contact-r2-section-title">SYSTEM共通 CONTACT認証設定 <span class="contact-r2-badge ${ap.profile_status === "ready" ? "green" : "amber"}">${esc(ap.profile_status === "ready" ? "確認済み" : "要確認")}</span></h4>
            <div class="contact-r2-form">
              <div class="contact-r2-field full">
                <label>CONTACT_AUTH_MODE</label>
                <select id="contactR2AuthMode" ${!systemCode || !canWrite() ? "disabled" : ""}>
                  <option value="unreviewed" ${(ap.auth_mode || "unreviewed") === "unreviewed" ? "selected" : ""}>未確認（Deploy不可）</option>
                  <option value="supabase_user" ${ap.auth_mode === "supabase_user" ? "selected" : ""}>supabase_user（Supabase Authユーザーで認証）</option>
                  <option value="supabase_staff" ${ap.auth_mode === "supabase_staff" ? "selected" : ""}>supabase_staff（スタッフテーブルを照合）</option>
                </select>
                <div class="contact-r2-help">${esc(systemCode || "SYSTEM未紐付け")} の共通設定です。一度正式確認すると、同じDPROシステムの次回契約から再利用します。</div>
              </div>
              <div id="contactR2AuthFields" class="contact-r2-form" style="grid-column:1/-1">${renderAuthFields(ap)}</div>
            </div>
          </div>
        </div>

        ${missing.length
          ? `<div class="contact-r2-missing">R2-3へ進む前の不足：${missing.map(esc).join(" / ")}</div>`
          : `<div class="contact-r2-ready">非機密設定はすべて揃っています。R2-3の自動Deployパッケージへ接続できます。</div>`
        }

        <div class="contact-r2-warning">
          保存対象は公開可能な設定値だけです。SUPABASE_SECRET_KEY、LINE Channel Secret、LINE Access Token、CONTACT_ENCRYPTION_KEY、Turnstile Secret、RESEND API Keyはこの画面へ入力しません。
        </div>

        <div class="contact-r2-actions">
          <small>R2-2ではCloudflare Deployを実行しません。既存DPRO CONTACT R6-PRODにも変更を加えません。</small>
          <button id="contactR2Reload" class="btn secondary" type="button">再読込</button>
          ${canWrite() ? `<button id="contactR2Save" class="btn primary" type="button">非機密設定を保存</button>` : ""}
        </div>
      </section>
    `;
  }

  function renderLoading(message = "R2設定を確認しています…") {
    return `<section id="contactOnboardingR2" class="contact-r2-loading">${esc(message)}</section>`;
  }

  function authProfileFromForm() {
    const mode = $("contactR2AuthMode")?.value || "unreviewed";
    const base = {
      system_code: state.readiness?.system_code || "",
      auth_mode: mode,
      staff_table: null,
      staff_id_column: null,
      staff_user_column: null,
      staff_display_column: null,
      staff_role_column: null,
      staff_status_column: null,
      staff_active_value: null,
      staff_tenant_column: null,
      allowed_roles: [],
      read_only_roles: ["read_only"],
      profile_status: "needs_review",
      updated_by: state.staff?.id || null,
    };

    if (mode === "supabase_user") {
      base.profile_status = "ready";
      return base;
    }

    if (mode !== "supabase_staff") return base;

    base.staff_table = $("contactR2StaffTable")?.value.trim() || null;
    base.staff_id_column = $("contactR2StaffIdColumn")?.value.trim() || null;
    base.staff_user_column = $("contactR2StaffUserColumn")?.value.trim() || null;
    base.staff_display_column = $("contactR2StaffDisplayColumn")?.value.trim() || null;
    base.staff_role_column = $("contactR2StaffRoleColumn")?.value.trim() || null;
    base.staff_status_column = $("contactR2StaffStatusColumn")?.value.trim() || null;
    base.staff_active_value = $("contactR2StaffActiveValue")?.value.trim() || null;
    base.staff_tenant_column = $("contactR2StaffTenantColumn")?.value.trim() || null;
    base.allowed_roles = csv($("contactR2AllowedRoles")?.value);
    base.read_only_roles = csv($("contactR2ReadOnlyRoles")?.value);
    if (!base.read_only_roles.length) base.read_only_roles = ["read_only"];

    const complete = [
      base.staff_table,
      base.staff_id_column,
      base.staff_user_column,
      base.staff_display_column,
      base.staff_role_column,
      base.staff_status_column,
      base.staff_active_value,
    ].every(Boolean) && base.allowed_roles.length > 0;

    base.profile_status = complete ? "ready" : "needs_review";
    return base;
  }

  function deployProfileFromForm() {
    const r = state.readiness || {};
    const dp = state.deployProfile || {};
    const autoOrigins = unique(r.allowed_origins_candidates || []);
    const overrideOrigins = unique(csv($("contactR2AllowedOrigins")?.value));
    const effectiveOrigins = overrideOrigins.length ? overrideOrigins : autoOrigins;
    const hostInput = unique(csv($("contactR2TurnstileHostnames")?.value));
    const autoHosts = urlHostnames(effectiveOrigins);

    const publishableKey = $("contactR2PublishableKey")?.value.trim() || null;
    if (publishableKey?.startsWith("sb_secret_")) {
      throw new Error("SUPABASE_SECRET_KEYを入力しないでください。Publishable Keyのみです。");
    }

    return {
      project_id: r.project_id || currentProjectId(),
      system_instance_id: r.system_instance_id || null,
      supabase_project_ref: r.supabase_project_ref || dp.supabase_project_ref || null,
      supabase_publishable_key: publishableKey,
      allowed_origins_override: overrideOrigins,
      web_turnstile_site_key: r.web_enabled ? ($("contactR2TurnstileSiteKey")?.value.trim() || null) : null,
      web_turnstile_hostnames: r.web_enabled ? (hostInput.length ? hostInput : autoHosts) : [],
      web_email_from_address: r.email_reply_enabled ? ($("contactR2EmailFromAddress")?.value.trim() || "reply@dpro-shop.com") : (dp.web_email_from_address || "reply@dpro-shop.com"),
      web_email_from_name: r.email_reply_enabled ? ($("contactR2EmailFromName")?.value.trim() || r.client_name || null) : dp.web_email_from_name || null,
      web_email_inbound_enabled: false,
      web_email_forward_to: null,
      deploy_status: "needs_config",
      updated_by: state.staff?.id || null,
    };
  }

  async function saveCurrent() {
    if (!canWrite() || !state.supabase) return;
    const button = $("contactR2Save");
    if (button) { button.disabled = true; button.textContent = "保存中…"; }

    try {
      const deployPayload = deployProfileFromForm();
      const authPayload = authProfileFromForm();

      if (!deployPayload.project_id) throw new Error("契約プロジェクトIDを確認できません。");
      if (!authPayload.system_code) throw new Error("SYSTEM_CODEが未紐付けです。先にDPRO製品を紐付けてください。");

      const [deployResult, authResult] = await Promise.all([
        state.supabase
          .from("cc_contact_deploy_profiles")
          .upsert(deployPayload, { onConflict: "project_id" })
          .select("*")
          .single(),
        state.supabase
          .from("cc_contact_system_auth_profiles")
          .upsert(authPayload, { onConflict: "system_code" })
          .select("*")
          .single(),
      ]);

      if (deployResult.error) throw deployResult.error;
      if (authResult.error) throw authResult.error;

      const projectId = deployPayload.project_id;
      const { data: readiness, error: readinessError } = await state.supabase
        .from("cc_v_contact_r2_readiness")
        .select("*")
        .eq("project_id", projectId)
        .maybeSingle();
      if (readinessError) throw readinessError;

      if (readiness?.ready_for_r2_package) {
        const { error: readyError } = await state.supabase
          .from("cc_contact_deploy_profiles")
          .update({ deploy_status: "ready", updated_by: state.staff.id })
          .eq("project_id", projectId);
        if (readyError) throw readyError;
      }

      await loadAndRender(projectId, true);
      notify(readiness?.ready_for_r2_package
        ? "R2非機密設定を保存しました。R2-3へ進めます。"
        : "R2非機密設定を保存しました。不足項目だけ引き続き設定してください。");
    } catch (error) {
      console.error(BUILD, error);
      notify(error.message || "R2非機密設定を保存できませんでした。", true);
      if (button) { button.disabled = false; button.textContent = "非機密設定を保存"; }
    }
  }

  function bindCardEvents() {
    $("contactR2Reload")?.addEventListener("click", () => {
      const id = currentProjectId();
      if (id) loadAndRender(id, true);
    });

    $("contactR2Save")?.addEventListener("click", saveCurrent);

    $("contactR2AuthMode")?.addEventListener("change", () => {
      const mode = $("contactR2AuthMode")?.value || "unreviewed";
      const snapshot = { ...(state.authProfile || {}), auth_mode: mode };
      const target = $("contactR2AuthFields");
      if (target) target.innerHTML = renderAuthFields(snapshot);
    });
  }

  function insertAfterR1(html) {
    const r1 = $("contactOnboardingR1");
    if (!r1) return false;
    $("contactOnboardingR2")?.remove();
    r1.insertAdjacentHTML("afterend", html);
    return true;
  }

  async function loadAndRender(projectId, force = false) {
    if (!projectId) return;
    if (!force && state.loadingProjectId === projectId) return;

    state.loadingProjectId = projectId;
    const token = ++state.token;
    state.currentProjectId = projectId;

    try {
      const ok = await initSupabase();
      if (!ok || token !== state.token) return;

      insertAfterR1(renderLoading());

      const { data: readiness, error: readinessError } = await state.supabase
        .from("cc_v_contact_r2_readiness")
        .select("*")
        .eq("project_id", projectId)
        .maybeSingle();
      if (readinessError) throw readinessError;
      if (token !== state.token) return;

      if (!readiness) {
        insertAfterR1(renderLoading("R2対象プロジェクトを確認できませんでした。"));
        return;
      }

      const [deployResult, authResult] = await Promise.all([
        state.supabase
          .from("cc_contact_deploy_profiles")
          .select("*")
          .eq("project_id", projectId)
          .maybeSingle(),
        readiness.system_code
          ? state.supabase
              .from("cc_contact_system_auth_profiles")
              .select("*")
              .eq("system_code", readiness.system_code)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);

      if (deployResult.error) throw deployResult.error;
      if (authResult.error) throw authResult.error;
      if (token !== state.token) return;

      state.readiness = readiness;
      state.deployProfile = deployResult.data || {
        project_id: projectId,
        system_instance_id: readiness.system_instance_id || null,
        supabase_project_ref: readiness.supabase_project_ref || null,
        allowed_origins_override: [],
        web_turnstile_hostnames: [],
        web_email_from_address: "reply@dpro-shop.com",
      };
      state.authProfile = authResult.data || {
        system_code: readiness.system_code || "",
        auth_mode: "unreviewed",
        profile_status: "needs_review",
        allowed_roles: [],
        read_only_roles: ["read_only"],
      };

      insertAfterR1(renderCard());
      bindCardEvents();
    } catch (error) {
      console.error(BUILD, error);
      insertAfterR1(renderLoading(`R2設定を読み込めませんでした。${error.message || "DB接続を確認してください。"}`));
    } finally {
      if (state.loadingProjectId === projectId) state.loadingProjectId = "";
    }
  }

  function schedule() {
    const r1 = $("contactOnboardingR1");
    if (!r1?.dataset?.projectId) return;
    const projectId = r1.dataset.projectId;
    const existing = $("contactOnboardingR2");
    if (existing?.dataset?.projectId === projectId) return;
    setTimeout(() => loadAndRender(projectId), 0);
  }

  function bindProjectCapture() {
    document.addEventListener("click", (event) => {
      const button = event.target.closest?.("[data-open-project]");
      if (!button?.dataset.openProject) return;
      state.currentProjectId = button.dataset.openProject;
      state.readiness = null;
      state.deployProfile = null;
      state.authProfile = null;
      state.token += 1;
      $("contactOnboardingR2")?.remove();
    }, true);
  }

  function observeDetail() {
    const detail = $("detailContent");
    if (!detail) return;
    const observer = new MutationObserver(schedule);
    observer.observe(detail, { childList: true, subtree: true });
    schedule();
  }

  async function boot() {
    try {
      installStyle();
      bindProjectCapture();
      observeDetail();
      await initSupabase();
      schedule();
    } catch (error) {
      console.error(BUILD, error);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
