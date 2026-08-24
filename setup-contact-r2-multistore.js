(() => {
  "use strict";

  const BUILD = "DPRO-CONTACT-MULTI-STORE-R2.1-SCROLLFIX-20260824";
  const PACKAGE_VERSION = "DPRO-CONTACT-AUTO-DEPLOY-R2-MULTI-STORE-20260824";
  const ARCH_VERSION = "DPRO-CONTACT-MULTI-STORE-ARCHITECTURE-V1.0";
  const WORKER_VERSION = "DPRO-CONTACT-1-WORKER-20260824-MULTI-STORE-R7.1-STAGED";
  const WORKER_ASSET = "./contact-onboarding-r1-worker-r7-multistore.js?v=DPRO-CONTACT-R7.1-MULTI-STORE-20260824";
  const WORKER_SHA256 = "2a3cb6ebd68e7f19ddd6f0043e5853921bf6d9a5f0345c1754834da5629fbe19";
  const DB_VERSION = "DPRO-CONTACT-1-DB-20260814-WEB-R1";
  const ATTACHMENT_DB_VERSION = "DPRO-CONTACT-ATTACHMENTS-DB-20260815-R1";
  const DESIGN_VERSION = "DPRO-CONTACT-1.0-DESIGN-20260808";
  const CONFIG = window.DPRO_CONTROL_CENTER_CONFIG || {};
  const WRITE_ROLES = new Set(["owner_admin", "technical_admin", "support"]);

  const state = {
    supabase: null,
    staff: null,
    projectId: "",
    readiness: null,
    deploy: null,
    auth: null,
    onboarding: null,
    loading: false,
    token: 0,
  };

  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#039;");

  function installStyle() {
    if ($("dpro-contact-r2-multistore-style")) return;
    const style = document.createElement("style");
    style.id = "dpro-contact-r2-multistore-style";
    style.textContent = `
      #contactOnboardingR2{display:none!important}
      .contact-ms-r2{margin-top:14px;padding:18px;border:1px solid #9dbfda;border-radius:16px;background:linear-gradient(145deg,#fbfdff,#eef6fb)}
      .contact-ms-r2-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px}.contact-ms-r2-head h3{margin:0;font-size:18px}.contact-ms-r2-head p{margin:5px 0 0;color:var(--muted);font-size:9px;line-height:1.65}
      .contact-ms-r2-badge{display:inline-flex;align-items:center;min-height:28px;padding:5px 10px;border-radius:999px;background:#edf2f6;color:#5f7180;font-size:9px;font-weight:900;white-space:nowrap}.contact-ms-r2-badge.green{background:#def5ea;color:#087253}.contact-ms-r2-badge.amber{background:#fff4d8;color:#815808}.contact-ms-r2-badge.red{background:#fff0f3;color:#a63247}
      .contact-ms-r2-lock{margin-top:12px;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.contact-ms-r2-kpi{padding:10px;border:1px solid #cfdfeb;border-radius:10px;background:#fff}.contact-ms-r2-kpi span{display:block;color:var(--muted);font-size:8px;font-weight:800}.contact-ms-r2-kpi strong{display:block;margin-top:4px;font-size:10px;overflow-wrap:anywhere}
      .contact-ms-r2-grid{margin-top:12px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.contact-ms-r2-box{padding:12px;border:1px solid #d4e1eb;border-radius:12px;background:#fff;min-width:0}.contact-ms-r2-box.full{grid-column:1/-1}.contact-ms-r2-box h4{margin:0 0 9px;font-size:10px}
      .contact-ms-r2-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.contact-ms-r2-field{display:grid;gap:5px;min-width:0}.contact-ms-r2-field.full{grid-column:1/-1}.contact-ms-r2-field label{font-size:8px;font-weight:900;color:#526573}.contact-ms-r2-field input,.contact-ms-r2-field select,.contact-ms-r2-field textarea{width:100%;box-sizing:border-box;border:1px solid #c7d7e2;border-radius:9px;padding:9px 10px;background:#fff;color:inherit;font:inherit;font-size:10px}.contact-ms-r2-field textarea{min-height:66px;resize:vertical}.contact-ms-r2-help{font-size:8px;color:var(--muted);line-height:1.55}
      .contact-ms-r2-summary{display:grid;grid-template-columns:150px minmax(0,1fr);gap:5px 10px;font-size:9px;line-height:1.55}.contact-ms-r2-summary span{color:var(--muted);font-weight:800}.contact-ms-r2-summary strong{overflow-wrap:anywhere}
      .contact-ms-r2-ready,.contact-ms-r2-warn,.contact-ms-r2-stop{margin-top:10px;padding:10px 12px;border-radius:10px;font-size:9px;font-weight:850;line-height:1.65}.contact-ms-r2-ready{background:#e8f8f1;color:#087253}.contact-ms-r2-warn{background:#fff7e5;color:#805b10}.contact-ms-r2-stop{background:#fff0f3;color:#9a3346}
      .contact-ms-r2-actions{margin-top:12px;display:flex;gap:8px;align-items:center;justify-content:flex-end;flex-wrap:wrap}.contact-ms-r2-actions small{margin-right:auto;max-width:680px;color:var(--muted);font-size:8px;line-height:1.55}.contact-ms-r2-actions .btn{min-width:170px}
      .contact-ms-r2-package{margin-top:12px;padding:13px;border:1px solid #b7cde0;border-radius:12px;background:#fff;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center}.contact-ms-r2-package strong{display:block;font-size:10px}.contact-ms-r2-package p{margin:4px 0 0;color:var(--muted);font-size:8px;line-height:1.65}.contact-ms-r2-meta{display:flex;gap:6px;flex-wrap:wrap;margin-top:7px}.contact-ms-r2-meta span{display:inline-flex;padding:4px 7px;border-radius:999px;background:#edf2f6;color:#607283;font-size:8px;font-weight:900}.contact-ms-r2-meta .green{background:#def5ea;color:#087253}.contact-ms-r2-meta .amber{background:#fff4d8;color:#815808}
      .contact-ms-r2-legacy{margin-top:10px;padding:9px 11px;border-radius:10px;background:#f1f3f5;color:#64707a;font-size:8px;font-weight:800;line-height:1.6}
      @media(max-width:760px){.contact-ms-r2-lock{grid-template-columns:repeat(2,1fr)}.contact-ms-r2-grid,.contact-ms-r2-form{grid-template-columns:1fr}.contact-ms-r2-box.full,.contact-ms-r2-field.full{grid-column:auto}.contact-ms-r2-head{display:block}.contact-ms-r2-badge{margin-top:8px}.contact-ms-r2-summary{grid-template-columns:1fr}.contact-ms-r2-package{grid-template-columns:1fr}.contact-ms-r2-package .btn,.contact-ms-r2-actions .btn{width:100%}}
      @media(max-width:460px){.contact-ms-r2-lock{grid-template-columns:1fr}}
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
    const publicConfig = await fetchPublicConfig();
    state.supabase = window.supabase.createClient(
      publicConfig.supabaseUrl,
      publicConfig.supabasePublishableKey || publicConfig.supabaseAnonKey,
      { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: publicConfig.sessionStorageKey || "dpro-control-center-auth-v1" } },
    );
    const { data: sessionData, error: sessionError } = await state.supabase.auth.getSession();
    if (sessionError) throw sessionError;
    const user = sessionData.session?.user;
    if (!user) return false;
    const { data: staff, error } = await state.supabase.from("cc_staff").select("id,display_name,role_key,status").eq("auth_user_id", user.id).maybeSingle();
    if (error) throw error;
    if (!staff || staff.status !== "active") return false;
    state.staff = staff;
    return true;
  }

  function canWrite() { return WRITE_ROLES.has(state.staff?.role_key); }
  function csv(value) { return String(value || "").split(/[\n,]/).map((v) => v.trim()).filter(Boolean); }
  function unique(values) { return [...new Set((values || []).filter(Boolean))]; }
  function emailOk(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim()); }
  function currentProjectId() { return $("contactOnboardingR1")?.dataset?.projectId || state.projectId || ""; }
  function urlHostnames(origins) { return unique((origins || []).map((origin) => { try { return new URL(origin).hostname; } catch (_) { return ""; } }).filter(Boolean)); }

  function flags() {
    const value = state.onboarding?.feature_flags;
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }

  function featureSettings() {
    const f = flags();
    return {
      gmailSentCopy: Boolean(f.gmail_sent_copy),
      archiveEmail: String(f.archive_email || "").trim().toLowerCase(),
      mailDeliveryMethod: String(f.mail_delivery_method || (state.readiness?.email_reply_enabled ? "UNRESOLVED" : "NONE")),
    };
  }

  function effectiveOrigins() {
    const override = Array.isArray(state.deploy?.allowed_origins_override) ? state.deploy.allowed_origins_override.filter(Boolean) : [];
    const auto = Array.isArray(state.readiness?.allowed_origins_candidates) ? state.readiness.allowed_origins_candidates.filter(Boolean) : [];
    return unique(override.length ? override : auto);
  }

  function readinessDetail() {
    const r = state.readiness || {};
    const dp = state.deploy || {};
    const ap = state.auth || {};
    const fs = featureSettings();
    const origins = effectiveOrigins();
    const missing = [];

    if (!r.ready_for_r2_package) {
      for (const item of (r.missing_non_secret_config || [])) if (!missing.includes(item)) missing.push(item);
    }
    if (!r.worker_name || !r.worker_url_candidate) missing.push("CONTACT Worker名 / URL");
    if (!dp.supabase_publishable_key) missing.push("SUPABASE_PUBLISHABLE_KEY");
    if (!origins.length) missing.push("ALLOWED_ORIGINS");
    if (!["supabase_user", "supabase_staff"].includes(ap.auth_mode) || ap.profile_status !== "ready") missing.push("CONTACT_AUTH_MODE確認");
    if (r.web_enabled) {
      if (!dp.web_turnstile_site_key) missing.push("WEB_TURNSTILE_SITE_KEY");
      const hosts = Array.isArray(dp.web_turnstile_hostnames) ? dp.web_turnstile_hostnames.filter(Boolean) : [];
      if (!hosts.length && !urlHostnames(origins).length) missing.push("WEB_TURNSTILE_HOSTNAMES");
    }
    if (r.email_reply_enabled) {
      if (fs.mailDeliveryMethod === "UNRESOLVED") missing.push("メール配送方式");
      if (fs.mailDeliveryMethod === "R3_MAIL_GATEWAY") missing.push("R3 共通MAIL GATEWAY完成待ち");
      if (fs.mailDeliveryMethod === "CUSTOM_DOMAIN") {
        if (!emailOk(dp.web_email_from_address)) missing.push("WEB_EMAIL_FROM_ADDRESS");
        if (!dp.web_email_inbound_enabled) missing.push("WEB_EMAIL_INBOUND_ENABLED");
        const sender = String(dp.web_email_from_address || "").toLowerCase();
        if (r.tenant_code !== "DPRO_SHOP" && sender.endsWith("@dpro-shop.com")) missing.push("契約店舗固有の送信ドメイン");
      }
      if (fs.gmailSentCopy && !emailOk(fs.archiveEmail)) missing.push("Gmail送信控え先メール");
    }
    return { ready: missing.length === 0, missing: unique(missing), origins, settings: fs };
  }

  function renderAuthFields() {
    const ap = state.auth || {};
    if ((ap.auth_mode || "unreviewed") !== "supabase_staff") return "";
    return `
      <div class="contact-ms-r2-field"><label>STAFF TABLE</label><input id="msR2StaffTable" value="${esc(ap.staff_table || "")}" placeholder="例: salon_staff"></div>
      <div class="contact-ms-r2-field"><label>ID COLUMN</label><input id="msR2StaffId" value="${esc(ap.staff_id_column || "")}" placeholder="id"></div>
      <div class="contact-ms-r2-field"><label>AUTH USER COLUMN</label><input id="msR2StaffUser" value="${esc(ap.staff_user_column || "")}" placeholder="auth_user_id"></div>
      <div class="contact-ms-r2-field"><label>DISPLAY COLUMN</label><input id="msR2StaffDisplay" value="${esc(ap.staff_display_column || "")}" placeholder="display_name"></div>
      <div class="contact-ms-r2-field"><label>ROLE COLUMN</label><input id="msR2StaffRole" value="${esc(ap.staff_role_column || "")}" placeholder="role_key"></div>
      <div class="contact-ms-r2-field"><label>STATUS COLUMN</label><input id="msR2StaffStatus" value="${esc(ap.staff_status_column || "")}" placeholder="status"></div>
      <div class="contact-ms-r2-field"><label>ACTIVE VALUE</label><input id="msR2StaffActive" value="${esc(ap.staff_active_value || "")}" placeholder="active"></div>
      <div class="contact-ms-r2-field"><label>TENANT COLUMN（任意）</label><input id="msR2StaffTenant" value="${esc(ap.staff_tenant_column || "")}"></div>
      <div class="contact-ms-r2-field full"><label>ALLOWED ROLES</label><input id="msR2AllowedRoles" value="${esc((ap.allowed_roles || []).join(","))}" placeholder="owner,support,staff"></div>
      <div class="contact-ms-r2-field full"><label>READ ONLY ROLES</label><input id="msR2ReadOnlyRoles" value="${esc((ap.read_only_roles || ["read_only"]).join(","))}" placeholder="read_only"></div>`;
  }

  function renderCard() {
    const r = state.readiness || {};
    const dp = state.deploy || {};
    const fs = featureSettings();
    const detail = readinessDetail();
    const disabled = canWrite() ? "" : "disabled";
    const emailEnabled = Boolean(r.email_reply_enabled);
    const webEnabled = Boolean(r.web_enabled);
    const autoOrigins = unique(r.allowed_origins_candidates || []);
    const overrideOrigins = Array.isArray(dp.allowed_origins_override) ? dp.allowed_origins_override : [];
    const origins = detail.origins;
    const autoHosts = urlHostnames(origins);
    const badge = detail.ready ? ["R2 READY", "green"] : [`HOLD ${detail.missing.length}件`, "amber"];
    const mailDisabled = !emailEnabled || !canWrite();

    return `
      <section id="contactMultiStoreR2" class="contact-ms-r2" data-project-id="${esc(r.project_id || currentProjectId())}">
        <div class="contact-ms-r2-head"><div><h3>DPRO CONTACT 自動導入 R2｜R7.1 Multi Store</h3><p>新規CONTACT Repoは作らず、店舗既存Repoを再利用。店舗ごとにCONTACT Workerを1個だけ作成するR2標準です。</p></div><span class="contact-ms-r2-badge ${badge[1]}">${esc(badge[0])}</span></div>

        <div class="contact-ms-r2-lock">
          <div class="contact-ms-r2-kpi"><span>MASTER</span><strong>共通 1個</strong></div>
          <div class="contact-ms-r2-kpi"><span>新規CONTACT Repo</span><strong>0個</strong></div>
          <div class="contact-ms-r2-kpi"><span>CONTACT Worker</span><strong>店舗ごと 1個</strong></div>
          <div class="contact-ms-r2-kpi"><span>Worker基準</span><strong>R7.1 Multi Store</strong></div>
        </div>

        <div class="contact-ms-r2-grid">
          <div class="contact-ms-r2-box"><h4>契約先 / 自動取得</h4><div class="contact-ms-r2-summary">
            <span>契約先</span><strong>${esc(r.client_name || "—")}</strong>
            <span>TENANT_CODE</span><strong>${esc(r.tenant_code || "—")}</strong>
            <span>SYSTEM_CODE</span><strong>${esc(r.system_code || "—")}</strong>
            <span>Worker</span><strong>${esc(r.worker_name || "—")}</strong>
            <span>Supabase</span><strong>${esc(r.supabase_project_ref || "—")}</strong>
          </div></div>
          <div class="contact-ms-r2-box"><h4>Architecture / Feature</h4><div class="contact-ms-r2-summary">
            <span>GitHub</span><strong>既存店舗Repo再利用</strong>
            <span>Supabase</span><strong>既存店舗Project再利用</strong>
            <span>Gmail送信控え</span><strong>${fs.gmailSentCopy ? `ON / ${esc(fs.archiveEmail || "未設定")}` : "OFF"}</strong>
            <span>メール方式</span><strong>${esc(fs.mailDeliveryMethod)}</strong>
            <span>Worker SHA</span><strong>${WORKER_SHA256.slice(0, 14)}…</strong>
          </div></div>

          <div class="contact-ms-r2-box full"><h4>非機密Deploy設定</h4><div class="contact-ms-r2-form">
            <div class="contact-ms-r2-field full"><label>SUPABASE_PUBLISHABLE_KEY</label><input id="msR2PublishableKey" value="${esc(dp.supabase_publishable_key || "")}" placeholder="sb_publishable_... / anon互換公開キー" ${disabled}><div class="contact-ms-r2-help">Secret Key / service_role は入力しません。</div></div>
            <div class="contact-ms-r2-field full"><label>ALLOWED_ORIGINS 上書き（通常は空欄）</label><textarea id="msR2Origins" placeholder="${esc(autoOrigins.join(", "))}" ${disabled}>${esc(overrideOrigins.join("\n"))}</textarea><div class="contact-ms-r2-help">空欄なら店舗の既存URLから自動取得したOriginを使用します。</div></div>
            ${webEnabled ? `<div class="contact-ms-r2-field"><label>WEB_TURNSTILE_SITE_KEY</label><input id="msR2TurnstileSite" value="${esc(dp.web_turnstile_site_key || "")}" ${disabled}></div><div class="contact-ms-r2-field"><label>WEB_TURNSTILE_HOSTNAMES</label><input id="msR2TurnstileHosts" value="${esc((dp.web_turnstile_hostnames || []).join(","))}" placeholder="${esc(autoHosts.join(","))}" ${disabled}></div>` : ""}
          </div></div>

          <div class="contact-ms-r2-box full"><h4>メール配送設定</h4><div class="contact-ms-r2-form">
            <div class="contact-ms-r2-field"><label>メール配送方式</label><select id="msR2MailMode" ${mailDisabled ? "disabled" : ""}>
              <option value="UNRESOLVED" ${fs.mailDeliveryMethod === "UNRESOLVED" ? "selected" : ""}>未決定（Deploy不可）</option>
              <option value="CUSTOM_DOMAIN" ${fs.mailDeliveryMethod === "CUSTOM_DOMAIN" ? "selected" : ""}>店舗独自ドメイン（R2対応）</option>
              <option value="R3_MAIL_GATEWAY" ${fs.mailDeliveryMethod === "R3_MAIL_GATEWAY" ? "selected" : ""}>DPRO共通MAIL GATEWAY（R3待ち）</option>
              ${!emailEnabled ? `<option value="NONE" selected>メール返信なし</option>` : ""}
            </select><div class="contact-ms-r2-help">R3共通MAIL GATEWAYはまだDeploy対象にしません。今R2で進める場合は店舗独自ドメイン方式です。</div></div>
            <div class="contact-ms-r2-field"><label>WEB_EMAIL_FROM_ADDRESS</label><input id="msR2EmailFrom" value="${esc(dp.web_email_from_address || "")}" placeholder="reply@example.jp" ${mailDisabled ? "disabled" : ""}></div>
            <div class="contact-ms-r2-field"><label>WEB_EMAIL_FROM_NAME</label><input id="msR2EmailName" value="${esc(dp.web_email_from_name || r.client_name || "")}" ${mailDisabled ? "disabled" : ""}></div>
            <div class="contact-ms-r2-field"><label>受信メールをGmail等へ転送</label><select id="msR2Inbound" ${mailDisabled ? "disabled" : ""}><option value="false" ${dp.web_email_inbound_enabled ? "" : "selected"}>OFF</option><option value="true" ${dp.web_email_inbound_enabled ? "selected" : ""}>ON</option></select></div>
            <div class="contact-ms-r2-field"><label>WEB_EMAIL_FORWARD_TO</label><input id="msR2ForwardTo" value="${esc(dp.web_email_forward_to || "")}" placeholder="owner@example.jp" ${mailDisabled ? "disabled" : ""}></div>
            <div class="contact-ms-r2-field full"><div class="contact-ms-r2-help">Gmail送信控えはR1 V1.1設定をそのまま使用します：${fs.gmailSentCopy ? `ON / ${esc(fs.archiveEmail || "未設定")}` : "OFF"}</div></div>
          </div></div>

          <div class="contact-ms-r2-box full"><h4>CONTACT認証設定</h4><div class="contact-ms-r2-form">
            <div class="contact-ms-r2-field full"><label>CONTACT_AUTH_MODE</label><select id="msR2AuthMode" ${!r.system_code || !canWrite() ? "disabled" : ""}><option value="unreviewed" ${(state.auth?.auth_mode || "unreviewed") === "unreviewed" ? "selected" : ""}>未確認（Deploy不可）</option><option value="supabase_user" ${state.auth?.auth_mode === "supabase_user" ? "selected" : ""}>supabase_user</option><option value="supabase_staff" ${state.auth?.auth_mode === "supabase_staff" ? "selected" : ""}>supabase_staff</option></select></div>
            <div id="msR2AuthFields" class="contact-ms-r2-form" style="grid-column:1/-1">${renderAuthFields()}</div>
          </div></div>
        </div>

        ${detail.ready ? `<div class="contact-ms-r2-ready">R2 Deployパッケージ生成条件が揃っています。</div>` : `<div class="contact-ms-r2-warn">R2 HOLD：${detail.missing.map(esc).join(" / ")}</div>`}
        <div class="contact-ms-r2-stop">Secret値はCONTROL CENTERへ保存しません。DPRO SHOP本番Workerは変更しません。R3 MAIL GATEWAYはこのR2ではDeployしません。</div>

        <div class="contact-ms-r2-actions"><small>保存すると既存cc_contact_deploy_profiles / cc_contact_system_auth_profilesと、R1 feature_flagsのメール方式だけを更新します。DBスキーマ追加はありません。</small><button id="msR2Reload" class="btn secondary" type="button">再読込</button>${canWrite() ? `<button id="msR2Save" class="btn primary" type="button">R2設定を保存</button>` : ""}</div>

        <div class="contact-ms-r2-package"><div><strong>R2｜R7.1 Multi Store 自動Deploy ZIP</strong><p>${detail.ready ? "Worker SHA検証 → Cloudflareログイン → 店舗用CONTACT Worker Deploy → 不足Secret登録 → Health確認までDPRO_CONTACT_SETUP.cmdで進めます。" : "条件が揃った実契約だけ生成できます。このデモ案件はHOLDのままで正常です。"}</p><div class="contact-ms-r2-meta"><span class="${detail.ready ? "green" : "amber"}">${detail.ready ? "R2 READY" : "GUARD HOLD"}</span><span>新規GitHub Repo 0</span><span>1店舗1 Worker</span><span>Secret値なし</span></div></div><button id="msR2Generate" class="btn ${detail.ready ? "primary" : "secondary"}" type="button" ${detail.ready && canWrite() ? "" : "disabled"}>R2 V1.0 ZIP生成</button></div>
        <div class="contact-ms-r2-legacy">旧20260815 R2/R3のDeployボタンはこの画面では無効化します。今後はR7.1 Multi Store R2パッケージのみ使用します。</div>
      </section>`;
  }

  function authFromForm() {
    const mode = $("msR2AuthMode")?.value || "unreviewed";
    const out = { system_code: state.readiness?.system_code || "", auth_mode: mode, staff_table: null, staff_id_column: null, staff_user_column: null, staff_display_column: null, staff_role_column: null, staff_status_column: null, staff_active_value: null, staff_tenant_column: null, allowed_roles: [], read_only_roles: ["read_only"], profile_status: "needs_review", updated_by: state.staff?.id || null };
    if (mode === "supabase_user") { out.profile_status = "ready"; return out; }
    if (mode !== "supabase_staff") return out;
    out.staff_table = $("msR2StaffTable")?.value.trim() || null;
    out.staff_id_column = $("msR2StaffId")?.value.trim() || null;
    out.staff_user_column = $("msR2StaffUser")?.value.trim() || null;
    out.staff_display_column = $("msR2StaffDisplay")?.value.trim() || null;
    out.staff_role_column = $("msR2StaffRole")?.value.trim() || null;
    out.staff_status_column = $("msR2StaffStatus")?.value.trim() || null;
    out.staff_active_value = $("msR2StaffActive")?.value.trim() || null;
    out.staff_tenant_column = $("msR2StaffTenant")?.value.trim() || null;
    out.allowed_roles = csv($("msR2AllowedRoles")?.value);
    out.read_only_roles = csv($("msR2ReadOnlyRoles")?.value);
    if (!out.read_only_roles.length) out.read_only_roles = ["read_only"];
    const complete = [out.staff_table,out.staff_id_column,out.staff_user_column,out.staff_display_column,out.staff_role_column,out.staff_status_column,out.staff_active_value].every(Boolean) && out.allowed_roles.length > 0;
    out.profile_status = complete ? "ready" : "needs_review";
    return out;
  }

  function deployFromForm() {
    const r = state.readiness || {};
    const current = state.deploy || {};
    const autoOrigins = unique(r.allowed_origins_candidates || []);
    const overrideOrigins = unique(csv($("msR2Origins")?.value));
    const origins = overrideOrigins.length ? overrideOrigins : autoOrigins;
    const manualHosts = unique(csv($("msR2TurnstileHosts")?.value));
    const publishableKey = $("msR2PublishableKey")?.value.trim() || null;
    if (publishableKey?.startsWith("sb_secret_") || publishableKey?.startsWith("service_role")) throw new Error("SUPABASE_SECRET_KEY / service_roleを入力しないでください。");
    return {
      project_id: r.project_id || currentProjectId(),
      system_instance_id: r.system_instance_id || null,
      supabase_project_ref: r.supabase_project_ref || current.supabase_project_ref || null,
      supabase_publishable_key: publishableKey,
      allowed_origins_override: overrideOrigins,
      web_turnstile_site_key: r.web_enabled ? ($("msR2TurnstileSite")?.value.trim() || null) : null,
      web_turnstile_hostnames: r.web_enabled ? (manualHosts.length ? manualHosts : urlHostnames(origins)) : [],
      web_email_from_address: r.email_reply_enabled ? ($("msR2EmailFrom")?.value.trim().toLowerCase() || null) : null,
      web_email_from_name: r.email_reply_enabled ? ($("msR2EmailName")?.value.trim() || r.client_name || null) : null,
      web_email_inbound_enabled: r.email_reply_enabled ? ($("msR2Inbound")?.value === "true") : false,
      web_email_forward_to: r.email_reply_enabled ? ($("msR2ForwardTo")?.value.trim().toLowerCase() || null) : null,
      deploy_status: "needs_config",
      updated_by: state.staff?.id || null,
    };
  }

  async function save() {
    if (!canWrite() || !state.supabase) return;
    const btn = $("msR2Save");
    if (btn) { btn.disabled = true; btn.textContent = "保存中…"; }
    try {
      const deployPayload = deployFromForm();
      const authPayload = authFromForm();
      const r = state.readiness || {};
      const mode = r.email_reply_enabled ? ($("msR2MailMode")?.value || "UNRESOLVED") : "NONE";
      if (!deployPayload.project_id) throw new Error("契約プロジェクトIDを確認できません。");
      if (!authPayload.system_code) throw new Error("SYSTEM_CODEが未紐付けです。先にDPRO製品を紐付けてください。");

      const oldFlags = flags();
      const nextFlags = { ...oldFlags, mail_delivery_method: mode, r2_architecture_version: ARCH_VERSION, r2_worker_version: WORKER_VERSION, r2_package_version: PACKAGE_VERSION };

      const [deployResult, authResult, onboardingResult] = await Promise.all([
        state.supabase.from("cc_contact_deploy_profiles").upsert(deployPayload, { onConflict: "project_id" }).select("*").single(),
        state.supabase.from("cc_contact_system_auth_profiles").upsert(authPayload, { onConflict: "system_code" }).select("*").single(),
        state.supabase.from("cc_contact_onboarding").update({ feature_flags: nextFlags, updated_by: state.staff.id }).eq("project_id", deployPayload.project_id).select("*").single(),
      ]);
      if (deployResult.error) throw deployResult.error;
      if (authResult.error) throw authResult.error;
      if (onboardingResult.error) throw onboardingResult.error;
      await load(deployPayload.project_id, true);
      const detail = readinessDetail();
      if (detail.ready) await state.supabase.from("cc_contact_deploy_profiles").update({ deploy_status: "ready", updated_by: state.staff.id }).eq("project_id", deployPayload.project_id);
      notify(detail.ready ? "R2 Multi Store設定を保存しました。R2 READYです。" : "R2設定を保存しました。HOLD項目を確認してください。");
    } catch (error) {
      console.error(BUILD, error);
      notify(error.message || "R2設定を保存できませんでした。", true);
      if (btn) { btn.disabled = false; btn.textContent = "R2設定を保存"; }
    }
  }

  function concatBytes(parts) { const size = parts.reduce((s,p)=>s+p.length,0); const out = new Uint8Array(size); let offset=0; for (const part of parts){ out.set(part,offset); offset += part.length; } return out; }
  function little16(v){ return new Uint8Array([v&255,(v>>>8)&255]); }
  function little32(v){ return new Uint8Array([v&255,(v>>>8)&255,(v>>>16)&255,(v>>>24)&255]); }
  function crc32(bytes){ if(!crc32.table){ crc32.table=Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k+=1)c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);return c>>>0;}); } let crc=0xffffffff; for(const b of bytes) crc=crc32.table[(crc^b)&255]^(crc>>>8); return (crc^0xffffffff)>>>0; }
  function dosStamp(date=new Date()){ const year=Math.max(1980,date.getFullYear()); return {time:(date.getHours()<<11)|(date.getMinutes()<<5)|Math.floor(date.getSeconds()/2),day:((year-1980)<<9)|((date.getMonth()+1)<<5)|date.getDate()}; }
  function zipStored(files){ const e=new TextEncoder(),locals=[],centrals=[];let offset=0;const stamp=dosStamp();for(const file of files){const name=e.encode(file.name),data=file.data instanceof Uint8Array?file.data:e.encode(String(file.data??"")),crc=crc32(data),flags=0x0800;const local=concatBytes([little32(0x04034b50),little16(20),little16(flags),little16(0),little16(stamp.time),little16(stamp.day),little32(crc),little32(data.length),little32(data.length),little16(name.length),little16(0),name,data]);locals.push(local);const central=concatBytes([little32(0x02014b50),little16(20),little16(20),little16(flags),little16(0),little16(stamp.time),little16(stamp.day),little32(crc),little32(data.length),little32(data.length),little16(name.length),little16(0),little16(0),little16(0),little16(0),little32(0),little32(offset),name]);centrals.push(central);offset+=local.length;}const cb=concatBytes(centrals),end=concatBytes([little32(0x06054b50),little16(0),little16(0),little16(files.length),little16(files.length),little32(cb.length),little32(offset),little16(0)]);return new Blob([...locals,cb,end],{type:"application/zip"}); }
  async function sha256Hex(bytes){ const digest=await crypto.subtle.digest("SHA-256",bytes); return Array.from(new Uint8Array(digest)).map((b)=>b.toString(16).padStart(2,"0")).join(""); }

  function buildProfile() {
    const r = state.readiness || {}, dp = state.deploy || {}, ap = state.auth || {}, d = readinessDetail(), fs = d.settings;
    const hosts = Array.isArray(dp.web_turnstile_hostnames) && dp.web_turnstile_hostnames.length ? dp.web_turnstile_hostnames.filter(Boolean) : urlHostnames(d.origins);
    return {
      package_version: PACKAGE_VERSION,
      architecture_version: ARCH_VERSION,
      generated_at: new Date().toISOString(),
      source_worker_version: WORKER_VERSION,
      source_worker_sha256: WORKER_SHA256,
      source_worker_policy: "MULTI_STORE_GENERIC_NO_DPRO_SHOP_RUNTIME_DEFAULTS",
      database_expected: DB_VERSION,
      attachment_db_extension: ATTACHMENT_DB_VERSION,
      design_version: DESIGN_VERSION,
      project: { id:r.project_id, project_code:r.project_code, project_name:r.project_name, client_code:r.client_code, client_name:r.client_name, system_instance_id:r.system_instance_id, github_policy:"REUSE_EXISTING_STORE_REPOSITORY", new_contact_repository_required:false },
      contact: { tenant_code:r.tenant_code, system_code:r.system_code, worker_name:r.worker_name, worker_url:r.worker_url_candidate, worker_policy:"ONE_CONTACT_WORKER_PER_STORE", features:{ line:Boolean(r.line_enabled), web:Boolean(r.web_enabled), email_reply:Boolean(r.email_reply_enabled), attachments:Boolean(r.attachments_enabled), gmail_sent_copy:fs.gmailSentCopy }, archive_email:fs.gmailSentCopy?fs.archiveEmail:null },
      connection: { reuse_existing_supabase_project:true, supabase_project_ref:r.supabase_project_ref, supabase_url:r.supabase_project_ref?`https://${r.supabase_project_ref}.supabase.co`:null, supabase_publishable_key:dp.supabase_publishable_key, allowed_origins:d.origins, contact_auth_mode:ap.auth_mode, staff:ap.auth_mode==="supabase_staff"?{table:ap.staff_table,id_column:ap.staff_id_column,user_column:ap.staff_user_column,display_column:ap.staff_display_column,role_column:ap.staff_role_column,status_column:ap.staff_status_column,active_value:ap.staff_active_value,tenant_column:ap.staff_tenant_column,allowed_roles:ap.allowed_roles||[],read_only_roles:ap.read_only_roles||[]}:null, web_turnstile_site_key:dp.web_turnstile_site_key, web_turnstile_hostnames:hosts, mail_delivery_method:fs.mailDeliveryMethod, web_email_from_address:dp.web_email_from_address, web_email_from_name:dp.web_email_from_name||r.client_name, web_email_inbound_enabled:Boolean(dp.web_email_inbound_enabled), web_email_forward_to:dp.web_email_forward_to },
      security: { secret_values_included:false, secrets_in_zip_or_github:false, required_secret_names:["SUPABASE_SECRET_KEY",...(r.line_enabled?["LINE_CHANNEL_SECRET","LINE_CHANNEL_ACCESS_TOKEN"]:[]),...(r.web_enabled?["WEB_TURNSTILE_SECRET_KEY"]:[]),...(r.email_reply_enabled&&fs.mailDeliveryMethod==="CUSTOM_DOMAIN"?["RESEND_API_KEY"]:[]),"CONTACT_ENCRYPTION_KEY"], existing_secret_names_are_preserved:true, contact_encryption_key_generated_only_when_missing:true },
      guard: { ready_for_r2_package:d.ready, missing_non_secret_config:d.missing, dpro_shop_production_worker_not_modified:true, r3_mail_gateway_deploy_enabled:false },
    };
  }

  function wranglerJson(p) {
    const f=p.contact.features,c=p.connection,vars={SUPABASE_URL:c.supabase_url,SUPABASE_PUBLISHABLE_KEY:c.supabase_publishable_key,ALLOWED_ORIGINS:c.allowed_origins.join(","),TENANT_CODE:p.contact.tenant_code,SYSTEM_CODE:p.contact.system_code,LINE_CHANNEL_CODE:`${p.contact.system_code}_LINE`.slice(0,64),LINE_CHANNEL_DISPLAY_NAME:`${p.project.client_name} LINE公式`.slice(0,120),CONTACT_AUTH_MODE:c.contact_auth_mode,CONTACT_ENABLED:"true",CONTACT_LINE_ENABLED:String(f.line),CONTACT_LINE_REPLY_ENABLED:String(f.line),CONTACT_SEARCH_ENABLED:"true",CONTACT_STATUS_ENABLED:"true",CONTACT_ATTACHMENTS_ENABLED:String(f.attachments),CONTACT_TEMPLATES_ENABLED:"false",CONTACT_ASSIGNMENT_ENABLED:"false",CONTACT_AI_SUGGESTIONS_ENABLED:"false",CONTACT_EMAIL_ENABLED:String(f.email_reply),CONTACT_WEB_ENABLED:String(f.web),CONTACT_SYSTEM_CHECK_ENABLED:"true",CONTACT_ATTACHMENT_LINK_TTL_SECONDS:"2592000",WEB_EMAIL_SENT_COPY_ENABLED:String(Boolean(f.gmail_sent_copy)),WEB_EMAIL_SENT_COPY_TO:f.gmail_sent_copy?(p.contact.archive_email||""):""};
    if(c.contact_auth_mode==="supabase_staff"&&c.staff){vars.CONTACT_STAFF_TABLE=c.staff.table;vars.CONTACT_STAFF_ID_COLUMN=c.staff.id_column;vars.CONTACT_STAFF_USER_COLUMN=c.staff.user_column;vars.CONTACT_STAFF_DISPLAY_COLUMN=c.staff.display_column;vars.CONTACT_STAFF_ROLE_COLUMN=c.staff.role_column;vars.CONTACT_STAFF_STATUS_COLUMN=c.staff.status_column;vars.CONTACT_STAFF_ACTIVE_VALUE=c.staff.active_value;if(c.staff.tenant_column)vars.CONTACT_STAFF_TENANT_COLUMN=c.staff.tenant_column;vars.CONTACT_ALLOWED_ROLES=(c.staff.allowed_roles||[]).join(",");vars.CONTACT_READ_ONLY_ROLES=(c.staff.read_only_roles||[]).join(",");}
    if(f.web){vars.WEB_CHANNEL_CODE=`${p.contact.system_code}_WEB`.slice(0,64);vars.WEB_CHANNEL_DISPLAY_NAME=`${p.project.client_name} WEB問い合わせ`.slice(0,120);vars.WEB_FORM_ALLOWED_ORIGINS=c.allowed_origins.join(",");vars.WEB_TURNSTILE_SITE_KEY=c.web_turnstile_site_key;vars.WEB_TURNSTILE_HOSTNAMES=(c.web_turnstile_hostnames||[]).join(",");}
    if(f.email_reply){vars.WEB_EMAIL_REPLY_ENABLED="true";vars.WEB_EMAIL_FROM_ADDRESS=c.web_email_from_address;vars.WEB_EMAIL_FROM_NAME=c.web_email_from_name||p.project.client_name;vars.WEB_EMAIL_INBOUND_ENABLED=String(Boolean(c.web_email_inbound_enabled));if(c.web_email_forward_to)vars.WEB_EMAIL_FORWARD_TO=c.web_email_forward_to;}
    return JSON.stringify({$schema:"https://raw.githubusercontent.com/cloudflare/workers-sdk/main/packages/wrangler/config-schema.json",name:p.contact.worker_name,main:"worker.js",compatibility_date:"2026-08-24",workers_dev:true,keep_vars:true,observability:{enabled:true},vars},null,2)+"\n";
  }

  function dbCheckSql(p){ return `-- DPRO CONTACT R2 MULTI STORE / READ ONLY DB CHECK\n-- Tenant: ${p.contact.tenant_code}\n-- Expected: ${DB_VERSION}\n\nselect\n  to_regclass('public.dpro_contact_module_meta') is not null as module_meta_exists,\n  to_regclass('public.dpro_contact_channels') is not null as channels_exists,\n  to_regclass('public.dpro_contact_threads') is not null as threads_exists,\n  to_regclass('public.dpro_contact_messages') is not null as messages_exists,\n  to_regclass('public.dpro_contact_delivery_logs') is not null as delivery_logs_exists,\n  to_regclass('public.dpro_contact_web_rate_limits') is not null as web_rate_limits_exists,\n  to_regclass('public.dpro_contact_attachments') is not null as attachments_exists;\n\nselect module_code,module_version,design_version from public.dpro_contact_module_meta where module_code='DPRO_CONTACT';\n`; }

  function setupInfo(p){ return ["DPRO CONTACT / R2 R7.1 MULTI STORE AUTO DEPLOY",`PACKAGE: ${PACKAGE_VERSION}`,`WORKER: ${WORKER_VERSION}`,`WORKER_SHA256: ${WORKER_SHA256}`,`DB: ${DB_VERSION}`,"",`契約先: ${p.project.client_name}`,`TENANT_CODE: ${p.contact.tenant_code}`,`SYSTEM_CODE: ${p.contact.system_code}`,`Worker: ${p.contact.worker_name}`,`GitHub: 既存店舗Repo再利用 / CONTACT専用Repo新規作成なし`,`Supabase: 既存店舗Project再利用`,`Gmail送信控え: ${p.contact.features.gmail_sent_copy?`ON / ${p.contact.archive_email}`:"OFF"}`,`メール配送: ${p.connection.mail_delivery_method}`,"","【安全】","- Secret値はZIP / GitHub / CONTROL CENTERへ保存しません。","- DPRO SHOP本番CONTACT Workerは変更しません。","- R3 MAIL GATEWAYはこのR2ではDeployしません。","- DPRO_CONTACT_SETUP.cmdはWorker SHAを再確認してからDeployします。","- Healthでversion / tenant / system / Gmail送信控えFeatureを確認します。","","【必要Secret名】",...p.security.required_secret_names.map((x)=>`- ${x}`),""].join("\r\n"); }

  function setupCmd(p) {
    const required=p.security.required_secret_names.filter((x)=>x!=="CONTACT_ENCRYPTION_KEY"),worker=p.contact.worker_name,health=`${String(p.contact.worker_url||"").replace(/\/$/,"")}/api/health`,gmail=String(Boolean(p.contact.features.gmail_sent_copy));
    const prompts=required.map((name)=>`call :ensure_secret ${name}\r\nif errorlevel 1 goto :fail\r\n`).join("");
    return `@echo off\r\nsetlocal EnableExtensions EnableDelayedExpansion\r\nchcp 65001 >nul\r\ncd /d "%~dp0"\r\ntitle DPRO CONTACT R2 MULTI STORE - ${worker}\r\nset "WRANGLER=npx --yes wrangler@4"\r\nset "WORKER_NAME=${worker}"\r\nset "HEALTH_URL=${health}"\r\nset "EXPECTED_VERSION=${WORKER_VERSION}"\r\nset "EXPECTED_TENANT=${p.contact.tenant_code}"\r\nset "EXPECTED_SYSTEM=${p.contact.system_code}"\r\nset "EXPECTED_GMAIL=${gmail}"\r\nset "EXPECTED_SHA=${WORKER_SHA256}"\r\nset "SECRET_LIST_FILE=%TEMP%\\dpro_contact_%RANDOM%_%RANDOM%_secrets.json"\r\necho.\r\necho ============================================================\r\necho DPRO CONTACT R2 R7.1 Multi Store\r\necho ============================================================\r\necho Worker: %WORKER_NAME%\r\necho GitHub: existing store repository reuse / new CONTACT repo = 0\r\necho.\r\nfor /f "usebackq delims=" %%H in (\`powershell -NoProfile -Command "(Get-FileHash -Algorithm SHA256 'worker.js').Hash.ToLower()"\`) do set "ACTUAL_SHA=%%H"\r\nif /I not "%ACTUAL_SHA%"=="%EXPECTED_SHA%" (\r\n  echo [STOP] worker.js SHA256 mismatch.\r\n  goto :fail\r\n)\r\nfindstr /c:"__DPRO_REQUIRED_" wrangler.jsonc >nul 2>nul\r\nif not errorlevel 1 (echo [STOP] unresolved placeholder & goto :fail)\r\nwhere node >nul 2>nul\r\nif errorlevel 1 (echo [STOP] Node.js not found & goto :fail)\r\nwhere npx >nul 2>nul\r\nif errorlevel 1 (echo [STOP] npx not found & goto :fail)\r\necho [1/5] Cloudflare login check...\r\n%WRANGLER% whoami --json >nul 2>nul\r\nif errorlevel 1 (%WRANGLER% login & if errorlevel 1 goto :fail)\r\necho [2/5] Deploy one-store CONTACT Worker...\r\n%WRANGLER% deploy --config wrangler.jsonc\r\nif errorlevel 1 goto :fail\r\necho [3/5] Preserve existing secrets / add missing only...\r\n%WRANGLER% secret list --name "%WORKER_NAME%" --format json > "%SECRET_LIST_FILE%" 2>nul\r\nif errorlevel 1 echo []>"%SECRET_LIST_FILE%"\r\n${prompts}call :ensure_encryption_key\r\nif errorlevel 1 goto :fail\r\necho [4/5] Health check...\r\npowershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop';$r=Invoke-RestMethod -Uri '%HEALTH_URL%' -TimeoutSec 30;if(-not $r.ok){throw 'health ok=false'};if($r.version -ne '%EXPECTED_VERSION%'){throw ('version mismatch: '+$r.version)};if($r.tenantCode -ne '%EXPECTED_TENANT%'){throw ('tenant mismatch: '+$r.tenantCode)};if($r.systemCode -ne '%EXPECTED_SYSTEM%'){throw ('system mismatch: '+$r.systemCode)};$g=[string]$r.features.webEmailSentCopyEnabled;if($g.ToLower() -ne '%EXPECTED_GMAIL%'){throw ('gmail sent copy mismatch: '+$g)};$r|ConvertTo-Json -Depth 10|Set-Content -Encoding UTF8 'DPRO_CONTACT_HEALTH_RESULT.json'"\r\nif errorlevel 1 goto :fail_keep\r\necho [5/5] Complete...\r\n(echo DPRO CONTACT R2 MULTI STORE PASS&echo Worker=%WORKER_NAME%&echo Health=%HEALTH_URL%&echo Completed=%DATE% %TIME%)>DPRO_CONTACT_DEPLOY_RESULT.txt\r\ndel /q "%SECRET_LIST_FILE%" >nul 2>nul\r\necho PASS - next: system-check and real send/receive test\r\npause\r\nexit /b 0\r\n:ensure_secret\r\nset "SECRET_NAME=%~1"\r\nfindstr /i /c:"\\"name\\": \\"%SECRET_NAME%\\"" "%SECRET_LIST_FILE%" >nul 2>nul\r\nif not errorlevel 1 (echo [Secret] %SECRET_NAME% : preserve existing&exit /b 0)\r\necho [Secret] %SECRET_NAME% : missing - input securely in Wrangler prompt\r\n%WRANGLER% secret put %SECRET_NAME% --name "%WORKER_NAME%"\r\nif errorlevel 1 exit /b 1\r\n%WRANGLER% secret list --name "%WORKER_NAME%" --format json > "%SECRET_LIST_FILE%" 2>nul\r\nexit /b 0\r\n:ensure_encryption_key\r\nset "SECRET_NAME=CONTACT_ENCRYPTION_KEY"\r\nfindstr /i /c:"\\"name\\": \\"%SECRET_NAME%\\"" "%SECRET_LIST_FILE%" >nul 2>nul\r\nif not errorlevel 1 (echo [Secret] CONTACT_ENCRYPTION_KEY : preserve existing&exit /b 0)\r\npowershell -NoProfile -ExecutionPolicy Bypass -Command "$b=New-Object byte[] 32;[Security.Cryptography.RandomNumberGenerator]::Fill($b);[Convert]::ToBase64String($b)"|%WRANGLER% secret put CONTACT_ENCRYPTION_KEY --name "%WORKER_NAME%"\r\nif errorlevel 1 exit /b 1\r\nexit /b 0\r\n:fail\r\ndel /q "%SECRET_LIST_FILE%" >nul 2>nul\r\necho [STOP] No DPRO SHOP production Worker change was requested.\r\npause\r\nexit /b 1\r\n:fail_keep\r\ndel /q "%SECRET_LIST_FILE%" >nul 2>nul\r\necho [STOP] Worker may be deployed, but Health validation failed. Do not mark production ready.\r\npause\r\nexit /b 2\r\n`;
  }

  function startHere(p){return ["DPRO CONTACT R2 / R7.1 MULTI STORE","",`契約先: ${p.project.client_name}`,`Worker: ${p.contact.worker_name}`,"","このZIPはR2 READY実契約専用です。","CONTACT専用GitHub Repoは作りません。店舗既存Repoを再利用します。","Cloudflareには店舗用CONTACT Workerを1個作成/更新します。","","最初に DPRO_CONTACT_SETUP_INFO.txt を確認し、その後 DPRO_CONTACT_SETUP.cmd を実行してください。",""].join("\r\n");}
  function statusText(p){return ["STATUS: R2 READY PACKAGE",`WORKER: ${WORKER_VERSION}`,`TENANT: ${p.contact.tenant_code}`,`SYSTEM: ${p.contact.system_code}`,`GMAIL_SENT_COPY: ${p.contact.features.gmail_sent_copy}`,`MAIL_MODE: ${p.connection.mail_delivery_method}`,"R3_MAIL_GATEWAY: NOT DEPLOYED BY R2",""].join("\r\n");}
  function nextActionText(p){return ["次のアクション","","1. DPRO_CONTACT_SETUP.cmdを実行。","2. Cloudflareログイン確認。","3. 不足Secretだけ安全入力。","4. Health PASSを確認。","5. CONTROL CENTER system-checkを確認。","6. LINE / WEB / メール / 添付 / Gmail控えのうち契約ON機能を本番送受信テスト。","7. 全PASS後だけPRODUCTION LOCK。",""].join("\r\n");}
  function packageName(p){const clean=(v,max)=>String(v||"").replace(/[^A-Z0-9_-]/gi,"_").slice(0,max);return `DPRO_CONTACT_SETUP_${clean(p.contact.tenant_code,32)}_${clean(p.contact.system_code,24)}_R2_V1.0_20260824.zip`;}

  async function generate() {
    if (!canWrite()) return;
    const detail = readinessDetail();
    if (!detail.ready) { notify(`R2 HOLD: ${detail.missing.join(" / ")}`, true); return; }
    const btn=$("msR2Generate"); if(btn){btn.disabled=true;btn.textContent="R2 ZIP生成中…";}
    try {
      const response=await fetch(WORKER_ASSET,{cache:"no-store"}); if(!response.ok)throw new Error(`R7.1共通Workerを取得できません。HTTP ${response.status}`);
      const workerBytes=new Uint8Array(await response.arrayBuffer()),hash=await sha256Hex(workerBytes); if(hash!==WORKER_SHA256)throw new Error("R7.1 Multi Store Worker SHA256不一致のため停止しました。");
      const p=buildProfile(); if(!p.guard.ready_for_r2_package)throw new Error("R2 READYではありません。");
      const files=[
        {name:"00_START_HERE.txt",data:startHere(p)},
        {name:"worker.js",data:workerBytes},{name:"worker-TEXT.txt",data:workerBytes},
        {name:"wrangler.jsonc",data:wranglerJson(p)},
        {name:"DPRO_CONTACT_SETUP_PROFILE_R2.json",data:JSON.stringify(p,null,2)+"\n"},
        {name:"DPRO_CONTACT_SETUP_INFO.txt",data:setupInfo(p)},
        {name:"DPRO_CONTACT_DB_CHECK.sql",data:dbCheckSql(p)},
        {name:"DPRO_CONTACT_DB_CHECK_SQL_TEXT.txt",data:dbCheckSql(p)},
        {name:"DPRO_CONTACT_SETUP.cmd",data:setupCmd(p)},
        {name:"STATUS.txt",data:statusText(p)},
        {name:"NEXT_ACTION.txt",data:nextActionText(p)},
      ];
      const blob=zipStored(files),filename=packageName(p),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=filename;a.style.display="none";document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),4000);
      const now=new Date().toISOString();
      const record=await state.supabase.from("cc_contact_onboarding").update({setup_package_version:PACKAGE_VERSION,setup_package_name:filename,setup_package_generated_at:now,updated_by:state.staff.id}).eq("project_id",p.project.id);
      if(record.error)console.warn(BUILD,"package metadata",record.error);
      notify("R2 R7.1 Multi Store 自動Deploy ZIPを生成しました。");
    } catch(error){console.error(BUILD,error);notify(error.message||"R2 ZIP生成に失敗しました。",true);if(btn){btn.disabled=false;btn.textContent="R2 V1.0 ZIP生成";}}
  }

  function bindEvents() {
    $("msR2Reload")?.addEventListener("click",()=>load(currentProjectId(),true));
    $("msR2Save")?.addEventListener("click",save);
    $("msR2Generate")?.addEventListener("click",generate);
    $("msR2AuthMode")?.addEventListener("change",()=>{const target=$("msR2AuthFields");if(!target)return;state.auth={...(state.auth||{}),auth_mode:$("msR2AuthMode").value};target.innerHTML=renderAuthFields();});
  }

  function disableLegacy() {
    const archWarn=document.querySelector("#contactArchitectureR1 .contact-arch-r1-warn");
    const archMessage="R2はR7.1 Multi Store基準へ更新済みです。旧20260815 R2/R3は使用せず、R3共通MAIL GATEWAYは次フェーズまでHOLDします。";
    if(archWarn && archWarn.textContent!==archMessage) archWarn.textContent=archMessage;
    const old=$("contactOnboardingR2"); if(old)old.hidden=true;
    const oldGenerate=$("contactR23Generate"); if(oldGenerate){oldGenerate.disabled=true;oldGenerate.title="R7.1 Multi Store R2を使用してください";}
    document.querySelectorAll("#detailContent button").forEach((button)=>{
      if(button.closest("#contactMultiStoreR2"))return;
      const text=String(button.textContent||"").trim();
      if(/R3/i.test(text)&&/ZIP|Deploy|生成/i.test(text)){button.disabled=true;button.title="R3はR7.1 Multi Store更新までHOLD";}
    });
  }

  function inject() {
    const r1=$("contactOnboardingR1"); if(!r1||!state.readiness)return;
    $("contactMultiStoreR2")?.remove();
    r1.insertAdjacentHTML("afterend",renderCard());
    bindEvents();
    disableLegacy();
  }

  async function load(projectId, force=false) {
    if(!projectId)return;if(state.loading&&!force)return;state.loading=true;const token=++state.token;state.projectId=projectId;
    try{
      const ok=await initSupabase();if(!ok||token!==state.token)return;
      const [readinessResult,deployResult,onboardingResult]=await Promise.all([
        state.supabase.from("cc_v_contact_r2_readiness").select("*").eq("project_id",projectId).maybeSingle(),
        state.supabase.from("cc_contact_deploy_profiles").select("*").eq("project_id",projectId).maybeSingle(),
        state.supabase.from("cc_contact_onboarding").select("*").eq("project_id",projectId).maybeSingle(),
      ]);
      if(readinessResult.error)throw readinessResult.error;if(deployResult.error)throw deployResult.error;if(onboardingResult.error)throw onboardingResult.error;
      const readiness=readinessResult.data;if(!readiness||token!==state.token)return;
      const authResult=readiness.system_code?await state.supabase.from("cc_contact_system_auth_profiles").select("*").eq("system_code",readiness.system_code).maybeSingle():{data:null,error:null};if(authResult.error)throw authResult.error;
      state.readiness=readiness;state.deploy=deployResult.data||{project_id:projectId,system_instance_id:readiness.system_instance_id||null,supabase_project_ref:readiness.supabase_project_ref||null,allowed_origins_override:[],web_turnstile_hostnames:[],web_email_from_address:null,web_email_from_name:readiness.client_name||null,web_email_inbound_enabled:false,web_email_forward_to:null};state.auth=authResult.data||{system_code:readiness.system_code||"",auth_mode:"unreviewed",profile_status:"needs_review",allowed_roles:[],read_only_roles:["read_only"]};state.onboarding=onboardingResult.data||{};
      inject();
    }catch(error){console.error(BUILD,error);notify(`R2 Multi Store読込エラー: ${error.message||"DB接続を確認してください。"}`,true);}finally{state.loading=false;}
  }

  function schedule(){disableLegacy();const projectId=$("contactOnboardingR1")?.dataset?.projectId||"";if(!projectId)return;const existing=$("contactMultiStoreR2");if(existing?.dataset?.projectId===projectId)return;setTimeout(()=>load(projectId),0);}
  function observe(){const detail=$("detailContent");if(!detail)return;const observer=new MutationObserver(schedule);observer.observe(detail,{childList:true,subtree:true});schedule();}
  function captureProject(){document.addEventListener("click",(event)=>{const button=event.target.closest?.("[data-open-project]");if(!button?.dataset.openProject)return;state.projectId=button.dataset.openProject;state.readiness=null;state.deploy=null;state.auth=null;state.onboarding=null;state.token+=1;$("contactMultiStoreR2")?.remove();},true);}
  async function boot(){try{installStyle();captureProject();observe();await initSupabase();schedule();}catch(error){console.error(BUILD,error);}}
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});else boot();
})();
