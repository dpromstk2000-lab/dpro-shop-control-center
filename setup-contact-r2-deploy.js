(() => {
  "use strict";

  const BUILD = "DPRO-CONTACT-AUTO-ONBOARDING-R2-3-20260815";
  const PACKAGE_VERSION = "DPRO-CONTACT-AUTO-DEPLOY-R2-3-20260815";
  const WORKER_VERSION = "DPRO-CONTACT-1-WORKER-20260815-ATTACHMENTS-R6-PROD";
  const DB_VERSION = "DPRO-CONTACT-1-DB-20260814-WEB-R1";
  const ATTACHMENT_DB_VERSION = "DPRO-CONTACT-ATTACHMENTS-DB-20260815-R1";
  const DESIGN_VERSION = "DPRO-CONTACT-1.0-DESIGN-20260808";
  const WORKER_ASSET = "./contact-onboarding-r1-worker.js?v=DPRO-CONTACT-R6-PROD-20260815";
  const WORKER_SHA256 = "8b1dc3db6073befbb5f12e735bd754c4a21871108501e827658e8baeb2320438";
  const CONFIG = window.DPRO_CONTROL_CENTER_CONFIG || {};
  const WRITE_ROLES = new Set(["owner_admin", "technical_admin", "support"]);

  const state = {
    supabase: null,
    staff: null,
    projectId: "",
    readiness: null,
    deploy: null,
    auth: null,
    loading: false,
    token: 0,
  };

  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#039;");

  function installStyle() {
    if ($("dpro-contact-r2-deploy-style")) return;
    const style = document.createElement("style");
    style.id = "dpro-contact-r2-deploy-style";
    style.textContent = `
      .contact-r23-package{margin-top:12px;padding:13px;border:1px solid #b9cce1;border-radius:12px;background:#fff;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center}
      .contact-r23-package strong{display:block;font-size:10px}.contact-r23-package p{margin:4px 0 0;color:var(--muted);font-size:8px;line-height:1.65}
      .contact-r23-meta{display:flex;gap:6px;flex-wrap:wrap;margin-top:7px}.contact-r23-meta span{display:inline-flex;padding:4px 7px;border-radius:999px;background:#eef2f6;color:#617080;font-size:8px;font-weight:900}
      .contact-r23-meta span.green{background:#def5ea;color:#087253}.contact-r23-meta span.amber{background:#fff7e5;color:#8b5a00}
      .contact-r23-package .btn{min-width:190px}
      @media(max-width:760px){.contact-r23-package{grid-template-columns:1fr}.contact-r23-package .btn{width:100%}}
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
    notify.timer = setTimeout(() => toast.classList.add("hidden"), 4000);
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

    const { data: staff, error } = await state.supabase
      .from("cc_staff")
      .select("id,display_name,role_key,status")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    if (error) throw error;
    if (!staff || staff.status !== "active") return false;
    state.staff = staff;
    return true;
  }

  function canWrite() {
    return WRITE_ROLES.has(state.staff?.role_key);
  }

  function concatBytes(parts) {
    const size = parts.reduce((sum, part) => sum + part.length, 0);
    const out = new Uint8Array(size);
    let offset = 0;
    for (const part of parts) {
      out.set(part, offset);
      offset += part.length;
    }
    return out;
  }

  function little16(value) {
    return new Uint8Array([value & 0xff, (value >>> 8) & 0xff]);
  }

  function little32(value) {
    return new Uint8Array([
      value & 0xff,
      (value >>> 8) & 0xff,
      (value >>> 16) & 0xff,
      (value >>> 24) & 0xff,
    ]);
  }

  function crc32(bytes) {
    if (!crc32.table) {
      crc32.table = Array.from({ length: 256 }, (_, n) => {
        let c = n;
        for (let k = 0; k < 8; k += 1) {
          c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
        }
        return c >>> 0;
      });
    }
    let crc = 0xffffffff;
    for (const b of bytes) {
      crc = crc32.table[(crc ^ b) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function dosStamp(date = new Date()) {
    const year = Math.max(1980, date.getFullYear());
    return {
      time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
      day: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
    };
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
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  function secretNames(r) {
    return [
      "SUPABASE_SECRET_KEY",
      ...(r.line_enabled ? ["LINE_CHANNEL_SECRET", "LINE_CHANNEL_ACCESS_TOKEN"] : []),
      ...(r.web_enabled ? ["WEB_TURNSTILE_SECRET_KEY"] : []),
      ...(r.email_reply_enabled ? ["RESEND_API_KEY"] : []),
      "CONTACT_ENCRYPTION_KEY",
    ];
  }

  function effectiveOrigins(r, dp) {
    const override = Array.isArray(dp.allowed_origins_override)
      ? dp.allowed_origins_override.filter(Boolean)
      : [];
    return override.length
      ? override
      : (Array.isArray(r.allowed_origins_candidates)
        ? r.allowed_origins_candidates.filter(Boolean)
        : []);
  }

  function buildProfile() {
    const r = state.readiness;
    const dp = state.deploy;
    const ap = state.auth;
    const origins = effectiveOrigins(r, dp);
    const hostnames = Array.isArray(dp.web_turnstile_hostnames)
      ? dp.web_turnstile_hostnames.filter(Boolean)
      : [];

    return {
      package_version: PACKAGE_VERSION,
      generated_at: new Date().toISOString(),
      source_worker_version: WORKER_VERSION,
      source_worker_sha256: WORKER_SHA256,
      database_expected: DB_VERSION,
      attachment_db_extension: ATTACHMENT_DB_VERSION,
      design_version: DESIGN_VERSION,
      project: {
        id: r.project_id,
        project_code: r.project_code,
        project_name: r.project_name,
        client_code: r.client_code,
        client_name: r.client_name,
        system_instance_id: r.system_instance_id,
      },
      contact: {
        tenant_code: r.tenant_code,
        system_code: r.system_code,
        worker_name: r.worker_name,
        worker_url: r.worker_url_candidate,
        features: {
          line: Boolean(r.line_enabled),
          web: Boolean(r.web_enabled),
          email_reply: Boolean(r.email_reply_enabled),
          attachments: Boolean(r.attachments_enabled),
        },
      },
      connection: {
        supabase_project_ref: r.supabase_project_ref,
        supabase_url: `https://${r.supabase_project_ref}.supabase.co`,
        supabase_publishable_key: dp.supabase_publishable_key,
        allowed_origins: origins,
        contact_auth_mode: ap.auth_mode,
        staff: ap.auth_mode === "supabase_staff" ? {
          table: ap.staff_table,
          id_column: ap.staff_id_column,
          user_column: ap.staff_user_column,
          display_column: ap.staff_display_column,
          role_column: ap.staff_role_column,
          status_column: ap.staff_status_column,
          active_value: ap.staff_active_value,
          tenant_column: ap.staff_tenant_column,
          allowed_roles: ap.allowed_roles || [],
          read_only_roles: ap.read_only_roles || [],
        } : null,
        web_turnstile_site_key: dp.web_turnstile_site_key,
        web_turnstile_hostnames: hostnames,
        web_email_from_address: dp.web_email_from_address,
        web_email_from_name: dp.web_email_from_name || r.client_name,
        web_email_inbound_enabled: Boolean(dp.web_email_inbound_enabled),
        web_email_forward_to: dp.web_email_forward_to,
      },
      security: {
        secret_values_included: false,
        required_secret_names: secretNames(r),
        existing_secret_names_are_preserved: true,
        contact_encryption_key_generated_only_when_missing: true,
      },
      guard: {
        ready_for_r2_package: Boolean(r.ready_for_r2_package),
        missing_non_secret_config: r.missing_non_secret_config || [],
        existing_r6_prod_worker_is_not_modified: true,
      },
    };
  }

  function wranglerJson(p) {
    const f = p.contact.features;
    const c = p.connection;
    const vars = {
      SUPABASE_URL: c.supabase_url,
      SUPABASE_PUBLISHABLE_KEY: c.supabase_publishable_key,
      ALLOWED_ORIGINS: c.allowed_origins.join(","),
      TENANT_CODE: p.contact.tenant_code,
      SYSTEM_CODE: p.contact.system_code,
      LINE_CHANNEL_CODE: `${p.contact.system_code}_LINE`.slice(0, 64),
      LINE_CHANNEL_DISPLAY_NAME: `${p.project.client_name} LINE公式`,
      CONTACT_AUTH_MODE: c.contact_auth_mode,
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

    if (c.contact_auth_mode === "supabase_staff" && c.staff) {
      vars.CONTACT_STAFF_TABLE = c.staff.table;
      vars.CONTACT_STAFF_ID_COLUMN = c.staff.id_column;
      vars.CONTACT_STAFF_USER_COLUMN = c.staff.user_column;
      vars.CONTACT_STAFF_DISPLAY_COLUMN = c.staff.display_column;
      vars.CONTACT_STAFF_ROLE_COLUMN = c.staff.role_column;
      vars.CONTACT_STAFF_STATUS_COLUMN = c.staff.status_column;
      vars.CONTACT_STAFF_ACTIVE_VALUE = c.staff.active_value;
      if (c.staff.tenant_column) vars.CONTACT_STAFF_TENANT_COLUMN = c.staff.tenant_column;
      vars.CONTACT_ALLOWED_ROLES = (c.staff.allowed_roles || []).join(",");
      vars.CONTACT_READ_ONLY_ROLES = (c.staff.read_only_roles || []).join(",");
    }

    if (f.web) {
      vars.WEB_CHANNEL_CODE = `${p.contact.system_code}_WEB`.slice(0, 64);
      vars.WEB_CHANNEL_DISPLAY_NAME = `${p.project.client_name} WEB問い合わせ`;
      vars.WEB_FORM_ALLOWED_ORIGINS = c.allowed_origins.join(",");
      vars.WEB_TURNSTILE_SITE_KEY = c.web_turnstile_site_key;
      vars.WEB_TURNSTILE_HOSTNAMES = (c.web_turnstile_hostnames || []).join(",");
    }

    if (f.email_reply) {
      vars.WEB_EMAIL_REPLY_ENABLED = "true";
      vars.WEB_EMAIL_FROM_ADDRESS = c.web_email_from_address;
      vars.WEB_EMAIL_FROM_NAME = c.web_email_from_name || p.project.client_name;
      vars.WEB_EMAIL_INBOUND_ENABLED = String(Boolean(c.web_email_inbound_enabled));
      if (c.web_email_forward_to) vars.WEB_EMAIL_FORWARD_TO = c.web_email_forward_to;
    }

    return JSON.stringify({
      $schema: "https://raw.githubusercontent.com/cloudflare/workers-sdk/main/packages/wrangler/config-schema.json",
      name: p.contact.worker_name,
      main: "worker.js",
      compatibility_date: "2026-08-15",
      workers_dev: true,
      keep_vars: true,
      observability: { enabled: true },
      vars,
    }, null, 2) + "\n";
  }

  function dbCheckSql(p) {
    return `-- DPRO CONTACT R2 / READ-ONLY DB CHECK
-- Tenant: ${p.contact.tenant_code}
-- Expected base: ${DB_VERSION}
-- Expected attachment extension: ${ATTACHMENT_DB_VERSION}
-- READ ONLY: no create/update/delete.

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

  function setupInfo(p) {
    return [
      "DPRO CONTACT / 新規契約先 自動導入 R2-3",
      `PACKAGE: ${PACKAGE_VERSION}`,
      `WORKER: ${WORKER_VERSION}`,
      `WORKER_SHA256: ${WORKER_SHA256}`,
      `DB_EXPECTED: ${DB_VERSION}`,
      `ATTACHMENT_DB: ${ATTACHMENT_DB_VERSION}`,
      "",
      `契約先: ${p.project.client_name}`,
      `TENANT_CODE: ${p.contact.tenant_code}`,
      `SYSTEM_CODE: ${p.contact.system_code}`,
      `Worker: ${p.contact.worker_name}`,
      `Worker URL: ${p.contact.worker_url}`,
      `Supabase Project Ref: ${p.connection.supabase_project_ref}`,
      `CONTACT_AUTH_MODE: ${p.connection.contact_auth_mode}`,
      "",
      "【使い方】",
      "1. ZIPを展開",
      "2. DPRO_CONTACT_SETUP.cmd をダブルクリック",
      "3. 初回のみCloudflareログインが必要な場合はブラウザで許可",
      "4. 画面に求められたSecretだけ入力",
      "5. Worker Deploy → Secret登録 → /api/health 確認まで自動実行",
      "",
      "【安全】",
      "- CONTROL CENTER / GitHub / このZIPにSecret値は保存されません。",
      "- 既存Secret名がWorkerにある場合、そのSecretは再入力・上書きしません。",
      "- CONTACT_ENCRYPTION_KEYは未登録時だけローカルで自動生成します。",
      "- 既存DPRO CONTACT R6-PROD本番Workerを更新する用途ではありません。",
      "- R2 READYでない契約案件では、このR2 ZIP自体を生成できません。",
      "",
      "【DB】",
      "- このCMDはSupabaseのスキーマ変更を自動実行しません。",
      "- DPRO_CONTACT_DB_CHECK.sql は読取専用の確認SQLです。",
      "- Worker /api/health がDB状態を含めて最終確認します。",
      "",
      "【必要Secret名】",
      ...p.security.required_secret_names.map((x) => `- ${x}`),
      "",
    ].join("\r\n");
  }

  function setupCmd(p) {
    const required = p.security.required_secret_names.filter(
      (x) => x !== "CONTACT_ENCRYPTION_KEY",
    );
    const worker = p.contact.worker_name;
    const health = `${p.contact.worker_url.replace(/\/$/, "")}/api/health`;

    const promptBlocks = required.map((name) => `
call :ensure_secret ${name}
if errorlevel 1 goto :fail
`).join("");

    return `@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
cd /d "%~dp0"
title DPRO CONTACT R2 AUTO SETUP - ${worker}

set "WRANGLER=npx --yes wrangler@4"
set "WORKER_NAME=${worker}"
set "HEALTH_URL=${health}"
set "SECRET_LIST_FILE=%TEMP%\\dpro_contact_%RANDOM%_%RANDOM%_secrets.json"

echo.
echo ============================================================
echo DPRO CONTACT 自動導入 R2-3
echo ============================================================
echo Tenant : ${p.contact.tenant_code}
echo System : ${p.contact.system_code}
echo Worker : %WORKER_NAME%
echo.
echo Secret値はCONTROL CENTER・GitHub・このフォルダへ保存しません。
echo 既存Secretは維持し、不足Secretだけ登録します。
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo [STOP] Node.js が見つかりません。
  echo Node.js LTSをインストールしてから再実行してください。
  goto :fail
)

where npx >nul 2>nul
if errorlevel 1 (
  echo [STOP] npx が見つかりません。
  goto :fail
)

findstr /c:"__DPRO_REQUIRED_" wrangler.jsonc >nul 2>nul
if not errorlevel 1 (
  echo [STOP] wrangler.jsonc に未設定プレースホルダーがあります。
  echo CONTROL CENTERでR2非機密設定を完了してからZIPを再生成してください。
  goto :fail
)

echo [1/5] Cloudflareログイン確認...
%WRANGLER% whoami --json >nul 2>nul
if errorlevel 1 (
  echo Cloudflareログインを開始します。
  %WRANGLER% login
  if errorlevel 1 goto :fail
  %WRANGLER% whoami --json >nul 2>nul
  if errorlevel 1 goto :fail
)
echo PASS

echo.
echo [2/5] WorkerコードとVariablesをDeploy...
%WRANGLER% deploy --config wrangler.jsonc
if errorlevel 1 goto :fail
echo PASS

echo.
echo [3/5] 既存Secret名を確認...
%WRANGLER% secret list --name "%WORKER_NAME%" --format json > "%SECRET_LIST_FILE%" 2>nul
if errorlevel 1 (
  echo []> "%SECRET_LIST_FILE%"
)
echo PASS
${promptBlocks}
call :ensure_encryption_key
if errorlevel 1 goto :fail

echo.
echo [4/5] Health確認...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $r=Invoke-RestMethod -Uri '%HEALTH_URL%' -Method Get -TimeoutSec 30; $r | ConvertTo-Json -Depth 10 | Set-Content -Encoding UTF8 'DPRO_CONTACT_HEALTH_RESULT.json'; if($r.ok -eq $false){exit 2}"
if errorlevel 1 (
  echo [ERROR] /api/health の確認に失敗しました。
  echo WorkerはDeploy済みです。DPRO_CONTACT_HEALTH_RESULT.json と画面表示を確認してください。
  goto :fail_keep
)
echo PASS

echo.
echo [5/5] 完了記録...
(
  echo DPRO CONTACT R2-3 AUTO SETUP PASS
  echo Worker=%WORKER_NAME%
  echo Health=%HEALTH_URL%
  echo Completed=%DATE% %TIME%
) > DPRO_CONTACT_DEPLOY_RESULT.txt

del /q "%SECRET_LIST_FILE%" >nul 2>nul

echo.
echo ============================================================
echo DPRO CONTACT 自動導入 PASS
echo ============================================================
echo Worker URL:
echo ${p.contact.worker_url}
echo.
echo Health結果:
echo DPRO_CONTACT_HEALTH_RESULT.json
echo.
echo 次はCONTROL CENTERでsystem-check / 本番送受信を確認してください。
echo.
pause
exit /b 0

:ensure_secret
set "SECRET_NAME=%~1"
findstr /i /c:"\\"name\\": \\"%SECRET_NAME%\\"" "%SECRET_LIST_FILE%" >nul 2>nul
if not errorlevel 1 (
  echo [Secret] %SECRET_NAME% : 既存値を維持
  exit /b 0
)
echo.
echo [Secret] %SECRET_NAME% が未登録です。
echo Wranglerの安全な入力プロンプトへ値を入力してください。
%WRANGLER% secret put %SECRET_NAME% --name "%WORKER_NAME%"
if errorlevel 1 exit /b 1
%WRANGLER% secret list --name "%WORKER_NAME%" --format json > "%SECRET_LIST_FILE%" 2>nul
exit /b 0

:ensure_encryption_key
set "SECRET_NAME=CONTACT_ENCRYPTION_KEY"
findstr /i /c:"\\"name\\": \\"%SECRET_NAME%\\"" "%SECRET_LIST_FILE%" >nul 2>nul
if not errorlevel 1 (
  echo [Secret] CONTACT_ENCRYPTION_KEY : 既存値を維持
  exit /b 0
)
echo [Secret] CONTACT_ENCRYPTION_KEY : 未登録のため自動生成
powershell -NoProfile -ExecutionPolicy Bypass -Command "$b=New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Fill($b); [Convert]::ToBase64String($b)" | %WRANGLER% secret put CONTACT_ENCRYPTION_KEY --name "%WORKER_NAME%"
if errorlevel 1 exit /b 1
%WRANGLER% secret list --name "%WORKER_NAME%" --format json > "%SECRET_LIST_FILE%" 2>nul
exit /b 0

:fail
del /q "%SECRET_LIST_FILE%" >nul 2>nul
echo.
echo [STOP] セットアップを停止しました。既存DPRO CONTACT R6-PRODは変更していません。
pause
exit /b 1

:fail_keep
del /q "%SECRET_LIST_FILE%" >nul 2>nul
echo.
echo [STOP] Health確認で停止しました。Workerの削除や既存Secretの削除は行っていません。
pause
exit /b 2
`;
  }

  function packageName(p) {
    const clean = (v, max) => String(v || "")
      .replace(/[^A-Z0-9_-]/gi, "_")
      .slice(0, max);
    return `DPRO_CONTACT_SETUP_${clean(p.contact.tenant_code, 32)}_${clean(p.contact.system_code, 24)}_R2_20260815.zip`;
  }

  function renderPackageBlock() {
    const r = state.readiness;
    if (!r) return "";
    const ready = Boolean(r.ready_for_r2_package);
    const missing = Array.isArray(r.missing_non_secret_config)
      ? r.missing_non_secret_config
      : [];

    const button = ready && canWrite()
      ? `<button id="contactR23Generate" class="btn primary" type="button">R2自動Deploy ZIP生成</button>`
      : `<button class="btn secondary" type="button" disabled>R2 READY案件のみ生成</button>`;

    return `
      <div id="contactR23Package" class="contact-r23-package">
        <div>
          <strong>R2-3｜CMD一本 自動Deployパッケージ</strong>
          <p>${ready
            ? "非機密設定が揃っています。ZIPを生成すると、DPRO_CONTACT_SETUP.cmd からCloudflareログイン確認 → Worker Deploy → 不足Secret登録 → Health確認まで進められます。"
            : `この案件では生成しません。実契約がR2 READYになった時だけ有効になります。${missing.length ? ` 不足: ${missing.join(" / ")}` : ""}`
          }</p>
          <div class="contact-r23-meta">
            <span class="${ready ? "green" : "amber"}">${ready ? "R2 READY" : "GUARD STOP"}</span>
            <span>Secret値はZIPに含めない</span>
            <span>既存Secretを維持</span>
          </div>
        </div>
        ${button}
      </div>
    `;
  }

  async function generate() {
    if (!canWrite() || !state.readiness?.ready_for_r2_package) return;
    const button = $("contactR23Generate");
    if (button) {
      button.disabled = true;
      button.textContent = "R2 ZIP生成中…";
    }

    try {
      const response = await fetch(WORKER_ASSET, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`共通Workerを取得できませんでした。HTTP ${response.status}`);
      }
      const workerBytes = new Uint8Array(await response.arrayBuffer());
      const hash = await sha256Hex(workerBytes);
      if (hash !== WORKER_SHA256) {
        throw new Error("共通WorkerのSHA256が正式R6-PRODと一致しないため停止しました。");
      }

      const p = buildProfile();
      if (!p.guard.ready_for_r2_package) throw new Error("R2 READYではありません。");
      if (!p.connection.supabase_publishable_key) {
        throw new Error("SUPABASE_PUBLISHABLE_KEYが未設定です。");
      }
      if (!["supabase_staff", "supabase_user"].includes(p.connection.contact_auth_mode)) {
        throw new Error("CONTACT認証プロファイルが未確認です。");
      }
      if (!p.connection.allowed_origins.length) {
        throw new Error("ALLOWED_ORIGINSが空です。");
      }

      const files = [
        { name: "worker.js", data: workerBytes },
        { name: "wrangler.jsonc", data: wranglerJson(p) },
        { name: "DPRO_CONTACT_SETUP_PROFILE_R2.json", data: JSON.stringify(p, null, 2) + "\n" },
        { name: "DPRO_CONTACT_SETUP_INFO.txt", data: setupInfo(p) },
        { name: "DPRO_CONTACT_DB_CHECK.sql", data: dbCheckSql(p) },
        { name: "DPRO_CONTACT_SETUP.cmd", data: setupCmd(p) },
      ];

      const blob = zipStored(files);
      const filename = packageName(p);
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
      const { error } = await state.supabase
        .from("cc_contact_deploy_profiles")
        .update({
          deploy_status: "package_generated",
          updated_by: state.staff.id,
        })
        .eq("project_id", p.project.id);
      if (error) throw error;

      const { error: onboardingError } = await state.supabase
        .from("cc_contact_onboarding")
        .update({
          setup_package_version: PACKAGE_VERSION,
          setup_package_name: filename,
          setup_package_generated_at: now,
          updated_by: state.staff.id,
        })
        .eq("project_id", p.project.id);
      if (onboardingError) throw onboardingError;

      notify("R2自動Deploy ZIPを生成しました。実契約先でDPRO_CONTACT_SETUP.cmdを実行できます。");
      await load(p.project.id, true);
    } catch (error) {
      console.error(BUILD, error);
      notify(error.message || "R2自動Deploy ZIPを生成できませんでした。", true);
      if (button) {
        button.disabled = false;
        button.textContent = "R2自動Deploy ZIP生成";
      }
    }
  }

  function inject() {
    const card = $("contactOnboardingR2");
    if (!card || !state.readiness) return;
    $("contactR23Package")?.remove();
    const actions = card.querySelector(".contact-r2-actions");
    if (actions) {
      actions.insertAdjacentHTML("beforebegin", renderPackageBlock());
    } else {
      card.insertAdjacentHTML("beforeend", renderPackageBlock());
    }
    $("contactR23Generate")?.addEventListener("click", generate);
  }

  async function load(projectId, force = false) {
    if (!projectId) return;
    if (state.loading && !force) return;
    state.loading = true;
    const token = ++state.token;

    try {
      const ok = await initSupabase();
      if (!ok || token !== state.token) return;

      const { data: readiness, error } = await state.supabase
        .from("cc_v_contact_r2_readiness")
        .select("*")
        .eq("project_id", projectId)
        .maybeSingle();
      if (error) throw error;
      if (!readiness || token !== state.token) return;

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

      state.projectId = projectId;
      state.readiness = readiness;
      state.deploy = deployResult.data || {};
      state.auth = authResult.data || {};
      inject();
    } catch (error) {
      console.error(BUILD, error);
    } finally {
      state.loading = false;
    }
  }

  function schedule() {
    const r2 = $("contactOnboardingR2");
    const r1 = $("contactOnboardingR1");
    const projectId = r2?.dataset?.projectId || r1?.dataset?.projectId || "";
    if (!projectId) return;
    if ($("contactR23Package") && state.projectId === projectId) return;
    setTimeout(() => load(projectId), 0);
  }

  function observe() {
    const detail = $("detailContent");
    if (!detail) return;
    const observer = new MutationObserver(schedule);
    observer.observe(detail, { childList: true, subtree: true });
    schedule();
  }

  function captureProject() {
    document.addEventListener("click", (event) => {
      const button = event.target.closest?.("[data-open-project]");
      if (!button?.dataset.openProject) return;
      state.projectId = "";
      state.readiness = null;
      state.deploy = null;
      state.auth = null;
      state.token += 1;
      $("contactR23Package")?.remove();
    }, true);
  }

  async function boot() {
    try {
      installStyle();
      captureProject();
      observe();
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
