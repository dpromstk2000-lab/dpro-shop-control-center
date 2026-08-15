(() => {
  "use strict";

  const BUILD = "DPRO-CONTACT-NEW-CONTRACT-SAFETY-R3-SCALE-R1-20260815";
  const PACKAGE_VERSION = "DPRO-CONTACT-NEW-CONTRACT-SAFETY-R3-SCALE-R1-20260815";
  const WORKER_VERSION = "DPRO-CONTACT-1-WORKER-20260815-ATTACHMENTS-R6-PROD";
  const DB_VERSION = "DPRO-CONTACT-1-DB-20260814-WEB-R1";
  const ATTACHMENT_DB_VERSION = "DPRO-CONTACT-ATTACHMENTS-DB-20260815-R1";
  const RETENTION_EXTENSION_VERSION = "DPRO-CONTACT-RETENTION-R1-20260815";
  const RETENTION_TARGET = 200;
  const RETENTION_SQL = "-- ============================================================\n-- DPRO CONTACT 顧客対応 大量件数対応 R1\n-- RETENTION / LIGHTWEIGHT INBOX\n-- 2026-08-15\n-- ============================================================\n-- PURPOSE\n--   DPRO CONTACTを長期運用しても重くなりにくいように、\n--   会話保持数を「自動整理基準 200件」に揃える。\n--\n-- POLICY\n--   * 新着 / 対応中 / 未読は絶対に自動削除しない。\n--   * 添付ファイルを含む会話は自動削除しない。\n--   * 200件を超えた時だけ、\n--       対応完了(closed) + 既読(unread_count=0) + 添付なし\n--     の古い会話から必要数だけ削除する。\n--   * 200件は「絶対上限」ではなく自動整理基準。\n--     保護対象が多い場合は200件を超えて保持する。\n--   * 既存DPRO CONTACT R6-PROD Worker / Secret / Token / Webhookは変更しない。\n--   * 添付Storage本体を孤児化させないため、\n--     添付ありThreadはR1自動削除対象外。\n--\n-- CURRENT WORKER ALIGNMENT\n--   現行R6-PRODの一覧取得上限 MAX_THREAD_LIMIT = 200。\n--   DB保持基準も200件へ合わせることで、通常運用では\n--   現行検索欄が保持会話全体を対象にできるようにする。\n-- ============================================================\n\nbegin;\n\n-- ------------------------------------------------------------\n-- 0. HARD GUARD\n-- ------------------------------------------------------------\ndo $$\ndeclare\n  v_version text;\n  v_design text;\nbegin\n  if to_regclass('public.dpro_contact_module_meta') is null\n     or to_regclass('public.dpro_contact_channels') is null\n     or to_regclass('public.dpro_contact_threads') is null\n     or to_regclass('public.dpro_contact_messages') is null\n     or to_regclass('public.dpro_contact_delivery_logs') is null then\n    raise exception\n      'STOP: DPRO CONTACT base tables are missing. Wrong Supabase project or CONTACT DB not installed.';\n  end if;\n\n  select module_version, design_version\n    into v_version, v_design\n    from public.dpro_contact_module_meta\n   where module_code = 'DPRO_CONTACT'\n   limit 1;\n\n  if v_version is distinct from 'DPRO-CONTACT-1-DB-20260814-WEB-R1' then\n    raise exception\n      'STOP: unexpected DPRO CONTACT DB version: %. Expected DPRO-CONTACT-1-DB-20260814-WEB-R1',\n      coalesce(v_version, '(null)');\n  end if;\n\n  if v_design is distinct from 'DPRO-CONTACT-1.0-DESIGN-20260808' then\n    raise exception\n      'STOP: unexpected DPRO CONTACT design version: %',\n      coalesce(v_design, '(null)');\n  end if;\nend\n$$;\n\n-- ------------------------------------------------------------\n-- 1. RETENTION SETTINGS\n-- default = all tenants in this Supabase project.\n-- tenant-specific row can override max_threads later.\n-- max_threads is capped at 200 to align with current Worker.\n-- ------------------------------------------------------------\ncreate table if not exists public.dpro_contact_retention_settings (\n  scope_key text primary key,\n  enabled boolean not null default true,\n  max_threads integer not null default 200\n    check (max_threads between 50 and 200),\n  extension_version text not null\n    default 'DPRO-CONTACT-RETENTION-R1-20260815',\n  note text,\n  created_at timestamptz not null default now(),\n  updated_at timestamptz not null default now()\n);\n\ninsert into public.dpro_contact_retention_settings (\n  scope_key,\n  enabled,\n  max_threads,\n  extension_version,\n  note\n)\nvalues (\n  'default',\n  true,\n  200,\n  'DPRO-CONTACT-RETENTION-R1-20260815',\n  '自動整理基準200件。対応中・未読・添付ありは保護。古い対応完了・既読・添付なしから整理。'\n)\non conflict (scope_key) do update\nset\n  enabled = true,\n  max_threads = least(public.dpro_contact_retention_settings.max_threads, 200),\n  extension_version = excluded.extension_version,\n  note = excluded.note,\n  updated_at = now();\n\nalter table public.dpro_contact_retention_settings enable row level security;\nrevoke all on table public.dpro_contact_retention_settings from public;\nrevoke all on table public.dpro_contact_retention_settings from anon;\nrevoke all on table public.dpro_contact_retention_settings from authenticated;\ngrant select, insert, update, delete\n  on table public.dpro_contact_retention_settings\n  to service_role;\n\ncomment on table public.dpro_contact_retention_settings is\n'DPRO CONTACT retention policy. R1 target 200 threads. Open/unread/attachment threads are protected. No customer message body is stored here.';\n\n-- ------------------------------------------------------------\n-- 2. INDEX\n-- ------------------------------------------------------------\ncreate index if not exists idx_dpro_contact_threads_retention_r1\n  on public.dpro_contact_threads (\n    channel_id,\n    status,\n    unread_count,\n    last_message_at\n  );\n\n-- ------------------------------------------------------------\n-- 3. SETTINGS HELPER\n-- ------------------------------------------------------------\ncreate or replace function public.dpro_contact_retention_config(\n  p_tenant_code text\n)\nreturns table (\n  enabled boolean,\n  max_threads integer,\n  extension_version text\n)\nlanguage sql\nsecurity definer\nset search_path = public, pg_temp\nstable\nas $$\n  select\n    s.enabled,\n    s.max_threads,\n    s.extension_version\n  from public.dpro_contact_retention_settings s\n  where s.scope_key in (\n    coalesce(nullif(btrim(p_tenant_code), ''), '__none__'),\n    'default'\n  )\n  order by case\n    when s.scope_key = coalesce(nullif(btrim(p_tenant_code), ''), '__none__') then 0\n    else 1\n  end\n  limit 1\n$$;\n\n-- ------------------------------------------------------------\n-- 4. RETENTION STATUS / PREVIEW (NO DELETE)\n-- ------------------------------------------------------------\ncreate or replace function public.dpro_contact_retention_status(\n  p_tenant_code text\n)\nreturns jsonb\nlanguage plpgsql\nsecurity definer\nset search_path = public, pg_temp\nstable\nas $$\ndeclare\n  v_enabled boolean := true;\n  v_max integer := 200;\n  v_total integer := 0;\n  v_open integer := 0;\n  v_unread integer := 0;\n  v_closed integer := 0;\n  v_spam integer := 0;\n  v_deletable integer := 0;\n  v_attachment_protected integer := 0;\nbegin\n  select c.enabled, c.max_threads\n    into v_enabled, v_max\n    from public.dpro_contact_retention_config(p_tenant_code) c;\n\n  select\n    count(*)::integer,\n    count(*) filter (where t.status = 'open')::integer,\n    count(*) filter (where coalesce(t.unread_count, 0) > 0)::integer,\n    count(*) filter (where t.status = 'closed')::integer,\n    count(*) filter (where t.status = 'spam')::integer\n  into v_total, v_open, v_unread, v_closed, v_spam\n  from public.dpro_contact_threads t\n  join public.dpro_contact_channels ch on ch.id = t.channel_id\n  where ch.tenant_code = p_tenant_code;\n\n  if to_regclass('public.dpro_contact_attachments') is not null then\n    execute $q$\n      select\n        count(*) filter (\n          where t.status in ('closed','spam')\n            and coalesce(t.unread_count, 0) = 0\n            and not exists (\n              select 1\n              from public.dpro_contact_attachments a\n              where a.thread_id = t.id\n            )\n        )::integer,\n        count(*) filter (\n          where exists (\n            select 1\n            from public.dpro_contact_attachments a\n            where a.thread_id = t.id\n          )\n        )::integer\n      from public.dpro_contact_threads t\n      join public.dpro_contact_channels ch on ch.id = t.channel_id\n      where ch.tenant_code = $1\n    $q$\n    into v_deletable, v_attachment_protected\n    using p_tenant_code;\n  else\n    select count(*)::integer\n      into v_deletable\n      from public.dpro_contact_threads t\n      join public.dpro_contact_channels ch on ch.id = t.channel_id\n     where ch.tenant_code = p_tenant_code\n       and t.status in ('closed','spam')\n       and coalesce(t.unread_count, 0) = 0;\n    v_attachment_protected := 0;\n  end if;\n\n  return jsonb_build_object(\n    'ok', true,\n    'extensionVersion', 'DPRO-CONTACT-RETENTION-R1-20260815',\n    'tenantCode', p_tenant_code,\n    'enabled', coalesce(v_enabled, true),\n    'retentionTarget', coalesce(v_max, 200),\n    'totalThreads', coalesce(v_total, 0),\n    'openThreads', coalesce(v_open, 0),\n    'unreadThreads', coalesce(v_unread, 0),\n    'closedThreads', coalesce(v_closed, 0),\n    'spamThreads', coalesce(v_spam, 0),\n    'deletableClosedOrSpamReadNoAttachment', coalesce(v_deletable, 0),\n    'attachmentProtectedThreads', coalesce(v_attachment_protected, 0),\n    'overTargetBy', greatest(coalesce(v_total, 0) - coalesce(v_max, 200), 0)\n  );\nend;\n$$;\n\n-- ------------------------------------------------------------\n-- 5. PRUNE\n-- Candidate:\n--   closed/spam + read + NO attachment, oldest first.\n-- Attachments are protected because SQL-only row deletion must not\n-- orphan the actual private Supabase Storage object.\n-- ------------------------------------------------------------\ncreate or replace function public.dpro_contact_retention_prune(\n  p_tenant_code text,\n  p_reason text default 'auto'\n)\nreturns jsonb\nlanguage plpgsql\nsecurity definer\nset search_path = public, pg_temp\nas $$\ndeclare\n  v_enabled boolean := true;\n  v_max integer := 200;\n  v_total_before integer := 0;\n  v_total_after integer := 0;\n  v_need integer := 0;\n  v_ids uuid[] := '{}'::uuid[];\n  v_deleted integer := 0;\nbegin\n  if nullif(btrim(coalesce(p_tenant_code, '')), '') is null then\n    return jsonb_build_object('ok', false, 'code', 'TENANT_CODE_REQUIRED');\n  end if;\n\n  select c.enabled, c.max_threads\n    into v_enabled, v_max\n    from public.dpro_contact_retention_config(p_tenant_code) c;\n\n  if coalesce(v_enabled, true) = false then\n    return jsonb_build_object(\n      'ok', true,\n      'code', 'RETENTION_DISABLED',\n      'tenantCode', p_tenant_code,\n      'deletedThreads', 0\n    );\n  end if;\n\n  select count(*)::integer\n    into v_total_before\n    from public.dpro_contact_threads t\n    join public.dpro_contact_channels ch on ch.id = t.channel_id\n   where ch.tenant_code = p_tenant_code;\n\n  v_need := greatest(v_total_before - coalesce(v_max, 200), 0);\n\n  if v_need <= 0 then\n    return jsonb_build_object(\n      'ok', true,\n      'code', 'WITHIN_TARGET',\n      'tenantCode', p_tenant_code,\n      'retentionTarget', coalesce(v_max, 200),\n      'totalBefore', v_total_before,\n      'deletedThreads', 0,\n      'totalAfter', v_total_before\n    );\n  end if;\n\n  if to_regclass('public.dpro_contact_attachments') is not null then\n    execute $q$\n      select coalesce(array_agg(x.id), '{}'::uuid[])\n      from (\n        select t.id\n        from public.dpro_contact_threads t\n        join public.dpro_contact_channels ch on ch.id = t.channel_id\n        where ch.tenant_code = $1\n          and t.status in ('closed','spam')\n          and coalesce(t.unread_count, 0) = 0\n          and not exists (\n            select 1\n            from public.dpro_contact_attachments a\n            where a.thread_id = t.id\n          )\n        order by\n          coalesce(t.last_message_at, t.updated_at, t.created_at) asc nulls first,\n          t.created_at asc,\n          t.id asc\n        limit $2\n      ) x\n    $q$\n    into v_ids\n    using p_tenant_code, v_need;\n  else\n    select coalesce(array_agg(x.id), '{}'::uuid[])\n      into v_ids\n      from (\n        select t.id\n        from public.dpro_contact_threads t\n        join public.dpro_contact_channels ch on ch.id = t.channel_id\n        where ch.tenant_code = p_tenant_code\n          and t.status in ('closed','spam')\n          and coalesce(t.unread_count, 0) = 0\n        order by\n          coalesce(t.last_message_at, t.updated_at, t.created_at) asc nulls first,\n          t.created_at asc,\n          t.id asc\n        limit v_need\n      ) x;\n  end if;\n\n  if coalesce(cardinality(v_ids), 0) > 0 then\n    -- Logs may reference both Thread and Message, so clear logs first.\n    delete from public.dpro_contact_delivery_logs dl\n     where dl.thread_id = any(v_ids)\n        or dl.message_id in (\n          select m.id\n          from public.dpro_contact_messages m\n          where m.thread_id = any(v_ids)\n        );\n\n    delete from public.dpro_contact_messages m\n     where m.thread_id = any(v_ids);\n\n    delete from public.dpro_contact_threads t\n     where t.id = any(v_ids);\n\n    get diagnostics v_deleted = row_count;\n  end if;\n\n  select count(*)::integer\n    into v_total_after\n    from public.dpro_contact_threads t\n    join public.dpro_contact_channels ch on ch.id = t.channel_id\n   where ch.tenant_code = p_tenant_code;\n\n  return jsonb_build_object(\n    'ok', true,\n    'code', case\n      when v_deleted > 0 then 'PRUNED'\n      else 'PROTECTED_THREADS_PREVENT_PRUNE'\n    end,\n    'extensionVersion', 'DPRO-CONTACT-RETENTION-R1-20260815',\n    'tenantCode', p_tenant_code,\n    'reason', left(coalesce(p_reason, 'auto'), 80),\n    'retentionTarget', coalesce(v_max, 200),\n    'totalBefore', v_total_before,\n    'requestedDelete', v_need,\n    'deletedThreads', v_deleted,\n    'totalAfter', v_total_after,\n    'remainingOverTarget', greatest(v_total_after - coalesce(v_max, 200), 0)\n  );\nend;\n$$;\n\n-- ------------------------------------------------------------\n-- 6. AUTO PRUNE TRIGGER\n-- Only on new Thread or status change.\n-- A cleanup failure must NEVER break a customer message.\n-- ------------------------------------------------------------\ncreate or replace function public.dpro_contact_retention_trigger_r1()\nreturns trigger\nlanguage plpgsql\nsecurity definer\nset search_path = public, pg_temp\nas $$\ndeclare\n  v_tenant_code text;\nbegin\n  if tg_op = 'UPDATE' and old.status is not distinct from new.status then\n    return new;\n  end if;\n\n  select ch.tenant_code\n    into v_tenant_code\n    from public.dpro_contact_channels ch\n   where ch.id = new.channel_id\n   limit 1;\n\n  if nullif(btrim(coalesce(v_tenant_code, '')), '') is null then\n    return new;\n  end if;\n\n  begin\n    perform public.dpro_contact_retention_prune(\n      v_tenant_code,\n      case when tg_op = 'INSERT' then 'new_thread' else 'status_change' end\n    );\n  exception\n    when others then\n      raise warning\n        'DPRO CONTACT retention R1 skipped for tenant %: %',\n        v_tenant_code,\n        sqlerrm;\n  end;\n\n  return new;\nend;\n$$;\n\ndrop trigger if exists trg_dpro_contact_retention_r1\n  on public.dpro_contact_threads;\n\ncreate trigger trg_dpro_contact_retention_r1\nafter insert or update of status\non public.dpro_contact_threads\nfor each row\nexecute function public.dpro_contact_retention_trigger_r1();\n\n-- ------------------------------------------------------------\n-- 7. FUNCTION SECURITY\n-- Browser direct execution is not allowed.\n-- ------------------------------------------------------------\nrevoke all on function public.dpro_contact_retention_config(text) from public;\nrevoke all on function public.dpro_contact_retention_status(text) from public;\nrevoke all on function public.dpro_contact_retention_prune(text,text) from public;\nrevoke all on function public.dpro_contact_retention_trigger_r1() from public;\n\ngrant execute on function public.dpro_contact_retention_config(text) to service_role;\ngrant execute on function public.dpro_contact_retention_status(text) to service_role;\ngrant execute on function public.dpro_contact_retention_prune(text,text) to service_role;\n\ncommit;\n\n-- ============================================================\n-- FINAL CHECK\n-- INSTALL時点では既存履歴を即削除しない。\n-- 次回「新規会話作成」または「状態変更」で必要なら自動整理。\n-- ============================================================\nselect\n  true as ok,\n  exists (\n    select 1\n    from public.dpro_contact_retention_settings\n    where scope_key = 'default'\n      and enabled = true\n      and max_threads = 200\n      and extension_version = 'DPRO-CONTACT-RETENTION-R1-20260815'\n  ) as retention_default_ok,\n  to_regprocedure('public.dpro_contact_retention_status(text)') is not null\n    as status_function_exists,\n  to_regprocedure('public.dpro_contact_retention_prune(text,text)') is not null\n    as prune_function_exists,\n  exists (\n    select 1\n    from pg_trigger\n    where tgname = 'trg_dpro_contact_retention_r1'\n      and not tgisinternal\n  ) as auto_trigger_exists,\n  (\n    select count(*)\n    from public.dpro_contact_threads\n  ) as current_all_threads,\n  200 as auto_retention_target,\n  '対応中・未読・添付ありは保護。保護対象が多い場合は200件超を許容'::text\n    as retention_rule;\n";
  const DESIGN_VERSION = "DPRO-CONTACT-1.0-DESIGN-20260808";
  const WORKER_ASSET = "./contact-onboarding-r1-worker.js?v=DPRO-CONTACT-R6-PROD-20260815";
  const WORKER_SHA256 = "8b1dc3db6073befbb5f12e735bd754c4a21871108501e827658e8baeb2320438";
  const PACKAGE_TTL_HOURS = 12;
  const CONFIG = window.DPRO_CONTROL_CENTER_CONFIG || {};
  const WRITE_ROLES = new Set(["owner_admin", "technical_admin", "support"]);

  const state = {
    supabase: null,
    staff: null,
    centralConfig: null,
    projectId: "",
    readiness: null,
    deploy: null,
    auth: null,
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

  function notify(message, isError = false) {
    const toast = $("toast");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.toggle("error", isError);
    toast.classList.remove("hidden");
    clearTimeout(notify.timer);
    notify.timer = setTimeout(() => toast.classList.add("hidden"), 4500);
  }

  function installStyle() {
    if ($("dpro-contact-r3-style")) return;
    const style = document.createElement("style");
    style.id = "dpro-contact-r3-style";
    style.textContent = `
      .contact-r3-card{margin-top:12px;padding:15px;border:2px solid #0b7a5a;border-radius:14px;background:linear-gradient(145deg,#fbfffd,#edf9f4);display:grid;grid-template-columns:minmax(0,1fr) auto;gap:14px;align-items:center}
      .contact-r3-card strong{display:block;font-size:11px}.contact-r3-card p{margin:5px 0 0;color:var(--muted);font-size:8px;line-height:1.7}
      .contact-r3-meta{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}.contact-r3-meta span{display:inline-flex;padding:4px 7px;border-radius:999px;background:#eef2f0;color:#62706a;font-size:8px;font-weight:900}
      .contact-r3-meta .green{background:#def5ea;color:#087253}.contact-r3-meta .amber{background:#fff7e5;color:#8b5a00}.contact-r3-meta .red{background:#fff0f3;color:#b63247}
      .contact-r3-missing{margin-top:8px;padding:8px 10px;border-radius:9px;background:#fff8e9;color:#805b10;font-size:8px;font-weight:800;line-height:1.65}
      .contact-r3-warning{margin-top:8px;padding:8px 10px;border-radius:9px;background:#fff0f3;color:#9b3346;font-size:8px;font-weight:800;line-height:1.65}
      .contact-r3-card .btn{min-width:210px}
      [data-r3-suppressed="true"]{display:none!important}
      @media(max-width:760px){.contact-r3-card{grid-template-columns:1fr}.contact-r3-card .btn{width:100%}}
    `;
    document.head.appendChild(style);
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
    state.centralConfig = publicConfig;
    const centralKey = publicConfig.supabasePublishableKey || publicConfig.supabaseAnonKey;
    if (!publicConfig.supabaseUrl || !centralKey) {
      throw new Error("CONTROL CENTER Supabase公開設定を確認できません。");
    }

    state.supabase = window.supabase.createClient(
      publicConfig.supabaseUrl,
      centralKey,
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
        for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
        return c >>> 0;
      });
    }
    let crc = 0xffffffff;
    for (const b of bytes) crc = crc32.table[(crc ^ b) & 0xff] ^ (crc >>> 8);
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
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  function canonicalize(value) {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (value && typeof value === "object") {
      return Object.keys(value).sort().reduce((out, key) => {
        out[key] = canonicalize(value[key]);
        return out;
      }, {});
    }
    return value;
  }

  function canonicalJson(value) {
    return JSON.stringify(canonicalize(value));
  }

  function unique(values) {
    return [...new Set((values || []).filter(Boolean))];
  }

  function effectiveOrigins(r, dp) {
    const override = Array.isArray(dp.allowed_origins_override) ? dp.allowed_origins_override.filter(Boolean) : [];
    return override.length ? unique(override) : unique(r.allowed_origins_candidates || []);
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

  function decodeJwtPayload(value) {
    try {
      const parts = String(value || "").split(".");
      if (parts.length !== 3) return null;
      const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
      return JSON.parse(atob(padded));
    } catch (_) {
      return null;
    }
  }

  function assertPublishableKey(value) {
    const key = String(value || "").trim();
    if (!key) throw new Error("SUPABASE_PUBLISHABLE_KEYが未設定です。");
    if (/^sb_secret_/i.test(key)) throw new Error("SUPABASE_SECRET_KEYを公開設定へ保存しないでください。");
    const jwt = decodeJwtPayload(key);
    if (jwt && ["service_role", "supabase_admin"].includes(String(jwt.role || ""))) {
      throw new Error("service_role系キーをSUPABASE_PUBLISHABLE_KEYへ保存しないでください。");
    }
    return key;
  }

  function fingerprintPayload(r, dp, ap) {
    const origins = effectiveOrigins(r, dp);
    return {
      schema: "DPRO-CONTACT-R3-FINGERPRINT-V1",
      retention: { extension_version: RETENTION_EXTENSION_VERSION, target_threads: RETENTION_TARGET },
      project_id: r.project_id,
      config_revision: Number(r.config_revision || 1),
      project_code: r.project_code || null,
      client_code: r.client_code || null,
      client_name: r.client_name || null,
      facility_code: r.facility_code || null,
      system_instance_id: r.system_instance_id,
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
      target: {
        supabase_project_ref: r.supabase_project_ref,
        supabase_publishable_key: dp.supabase_publishable_key,
        allowed_origins: origins,
        web_turnstile_site_key: dp.web_turnstile_site_key || null,
        web_turnstile_hostnames: dp.web_turnstile_hostnames || [],
        web_email_from_address: dp.web_email_from_address || null,
        web_email_from_name: dp.web_email_from_name || null,
      },
      auth: {
        mode: ap.auth_mode || "unreviewed",
        staff_table: ap.staff_table || null,
        staff_id_column: ap.staff_id_column || null,
        staff_user_column: ap.staff_user_column || null,
        staff_display_column: ap.staff_display_column || null,
        staff_role_column: ap.staff_role_column || null,
        staff_status_column: ap.staff_status_column || null,
        staff_active_value: ap.staff_active_value || null,
        staff_tenant_column: ap.staff_tenant_column || null,
        allowed_roles: ap.allowed_roles || [],
        read_only_roles: ap.read_only_roles || [],
      },
    };
  }

  function buildProfile(r, dp, ap, fingerprint, generatedAt, expiresAt) {
    const central = state.centralConfig || {};
    const centralKey = central.supabasePublishableKey || central.supabaseAnonKey || "";
    const origins = effectiveOrigins(r, dp);
    return {
      package_version: PACKAGE_VERSION,
      generated_at: generatedAt,
      expires_at: expiresAt,
      config_revision: Number(r.config_revision || 1),
      package_fingerprint: fingerprint,
      source_worker_version: WORKER_VERSION,
      source_worker_sha256: WORKER_SHA256,
      database_expected: DB_VERSION,
      attachment_db_extension: ATTACHMENT_DB_VERSION,
      retention_extension: RETENTION_EXTENSION_VERSION,
      retention_target_threads: RETENTION_TARGET,
      design_version: DESIGN_VERSION,
      project: {
        id: r.project_id,
        project_code: r.project_code,
        project_name: r.project_name,
        client_code: r.client_code,
        client_name: r.client_name,
        facility_code: r.facility_code,
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
        web_turnstile_hostnames: dp.web_turnstile_hostnames || [],
        web_email_from_address: dp.web_email_from_address,
        web_email_from_name: dp.web_email_from_name || r.client_name,
      },
      central_gate: {
        supabase_url: central.supabaseUrl,
        supabase_publishable_key: centralKey,
        validate_rpc: "cc_contact_r3_validate_package",
        preflight_rpc: "cc_contact_r3_record_preflight",
      },
      security: {
        secret_values_included: false,
        required_secret_names: secretNames(r),
        existing_secret_names_are_preserved: true,
        contact_encryption_key_generated_only_when_missing: true,
        central_package_gate_required: true,
        target_db_preflight_required_before_cloudflare_deploy: true,
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
      CONTACT_PACKAGE_FINGERPRINT: p.package_fingerprint,
      CONTACT_PACKAGE_REVISION: String(p.config_revision),
      TIMEZONE: "Asia/Tokyo",
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
      vars.WEB_EMAIL_INBOUND_ENABLED = "false";
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
    return `-- DPRO CONTACT R3 / READ-ONLY TARGET DB CHECK\n-- Tenant: ${p.contact.tenant_code}\n-- Expected base: ${DB_VERSION}\n-- Expected attachment extension: ${ATTACHMENT_DB_VERSION}\n-- This file is for manual confirmation only. R3 CMD runs a local preflight before Cloudflare Deploy.\n\nselect\n  to_regclass('public.dpro_contact_module_meta') is not null as module_meta_exists,\n  to_regclass('public.dpro_contact_channels') is not null as channels_exists,\n  to_regclass('public.dpro_contact_threads') is not null as threads_exists,\n  to_regclass('public.dpro_contact_messages') is not null as messages_exists,\n  to_regclass('public.dpro_contact_delivery_logs') is not null as delivery_logs_exists,\n  to_regclass('public.dpro_contact_web_rate_limits') is not null as web_rate_limits_exists,\n  to_regclass('public.dpro_contact_attachments') is not null as attachments_exists,\n  to_regclass('public.dpro_contact_retention_settings') is not null as retention_settings_exists,\n  to_regprocedure('public.dpro_contact_retention_prune(text,text)') is not null as retention_prune_exists;\n\nselect module_code, module_version, design_version\nfrom public.dpro_contact_module_meta\nwhere module_code = 'DPRO_CONTACT';\n`;
  }

  function psSingle(value) {
    return String(value ?? "").replaceAll("'", "''");
  }

  function packageGatePs1(p) {
    const centralUrl = psSingle(p.central_gate.supabase_url.replace(/\/$/, ""));
    const centralKey = psSingle(p.central_gate.supabase_publishable_key);
    const projectId = psSingle(p.project.id);
    const fingerprint = psSingle(p.package_fingerprint);
    const expires = psSingle(p.expires_at);
    return `$ErrorActionPreference = 'Stop'\n$CentralUrl = '${centralUrl}'\n$CentralKey = '${centralKey}'\n$ProjectId = '${projectId}'\n$Fingerprint = '${fingerprint}'\n$ExpiresAt = [DateTimeOffset]::Parse('${expires}')\n\nfunction ApiHeaders([string]$key) {\n  $h = @{ apikey = $key; 'Content-Type' = 'application/json' }\n  if ($key -notmatch '^sb_(publishable|secret)_') { $h.Authorization = 'Bearer ' + $key }\n  return $h\n}\n\nif ([DateTimeOffset]::UtcNow -ge $ExpiresAt) {\n  Write-Host '[STOP] R3 ZIP expired. Regenerate in CONTROL CENTER.' -ForegroundColor Red\n  exit 3\n}\n\ntry {\n  $body = @{ p_project_id=$ProjectId; p_fingerprint=$Fingerprint } | ConvertTo-Json\n  $gate = Invoke-RestMethod -Uri ($CentralUrl + '/rest/v1/rpc/cc_contact_r3_validate_package') -Method Post -Headers (ApiHeaders $CentralKey) -Body $body -TimeoutSec 20\n} catch {\n  Write-Host '[STOP] CONTROL CENTER R3 package gate unreachable. Deploy cancelled.' -ForegroundColor Red\n  exit 4\n}\n\nif (-not $gate.ok) {\n  $code = if ($gate.code) { [string]$gate.code } else { 'PACKAGE_NOT_CURRENT' }\n  Write-Host ('[STOP] R3 package gate: ' + $code) -ForegroundColor Red\n  exit 5\n}\nWrite-Host 'R3 PACKAGE GATE PASS' -ForegroundColor Green\nexit 0\n`;
  }

  function preflightPs1(p) {
    const centralUrl = psSingle(p.central_gate.supabase_url.replace(/\/$/, ""));
    const centralKey = psSingle(p.central_gate.supabase_publishable_key);
    const targetUrl = psSingle(p.connection.supabase_url.replace(/\/$/, ""));
    const projectId = psSingle(p.project.id);
    const fingerprint = psSingle(p.package_fingerprint);
    const expectedDb = psSingle(DB_VERSION);
    const expectedDesign = psSingle(DESIGN_VERSION);
    const expires = psSingle(p.expires_at);
    const checkAttachments = p.contact.features.attachments ? "$true" : "$false";
    const checkWeb = p.contact.features.web ? "$true" : "$false";

    return `$ErrorActionPreference = 'Stop'\n$CentralUrl = '${centralUrl}'\n$CentralKey = '${centralKey}'\n$TargetUrl = '${targetUrl}'\n$ProjectId = '${projectId}'\n$Fingerprint = '${fingerprint}'\n$ExpectedDb = '${expectedDb}'\n$ExpectedDesign = '${expectedDesign}'\n$ExpiresAt = [DateTimeOffset]::Parse('${expires}')\n$CheckAttachments = ${checkAttachments}\n$CheckWeb = ${checkWeb}\n$ResultFile = Join-Path $PSScriptRoot 'DPRO_CONTACT_PREFLIGHT_RESULT.json'\n\nfunction ApiHeaders([string]$key) {\n  $h = @{ apikey = $key; 'Content-Type' = 'application/json' }\n  if ($key -notmatch '^sb_(publishable|secret)_') { $h.Authorization = 'Bearer ' + $key }\n  return $h\n}\n\nfunction SaveResult([bool]$ok, [string]$code, [string]$message) {\n  @{ ok=$ok; code=$code; message=$message; checkedAt=[DateTimeOffset]::UtcNow.ToString('o'); projectId=$ProjectId; fingerprint=$Fingerprint } |\n    ConvertTo-Json -Depth 5 | Set-Content -Encoding UTF8 $ResultFile\n}\n\nfunction RecordPreflight([bool]$ok, [string]$code) {\n  try {\n    $body = @{ p_project_id=$ProjectId; p_fingerprint=$Fingerprint; p_ok=$ok; p_code=$code } | ConvertTo-Json\n    Invoke-RestMethod -Uri ($CentralUrl + '/rest/v1/rpc/cc_contact_r3_record_preflight') -Method Post -Headers (ApiHeaders $CentralKey) -Body $body -TimeoutSec 20 | Out-Null\n  } catch { }\n}\n\nfunction StopPreflight([string]$code, [string]$message) {\n  RecordPreflight $false $code\n  SaveResult $false $code $message\n  Write-Host ('[STOP] ' + $message) -ForegroundColor Red\n  exit 2\n}\n\nWrite-Host '============================================================'\nWrite-Host 'DPRO CONTACT R3 PRE-FLIGHT'\nWrite-Host '============================================================'\nWrite-Host '1) CONTROL CENTER package gate'\n\nif ([DateTimeOffset]::UtcNow -ge $ExpiresAt) {\n  SaveResult $false 'PACKAGE_EXPIRED_LOCAL' 'このR3 ZIPは有効期限切れです。CONTROL CENTERで再生成してください。'\n  Write-Host '[STOP] このR3 ZIPは有効期限切れです。' -ForegroundColor Red\n  exit 3\n}\n\ntry {\n  $gateBody = @{ p_project_id=$ProjectId; p_fingerprint=$Fingerprint } | ConvertTo-Json\n  $gate = Invoke-RestMethod -Uri ($CentralUrl + '/rest/v1/rpc/cc_contact_r3_validate_package') -Method Post -Headers (ApiHeaders $CentralKey) -Body $gateBody -TimeoutSec 20\n} catch {\n  SaveResult $false 'PACKAGE_GATE_UNREACHABLE' 'CONTROL CENTERのR3安全ゲートへ接続できません。Deployしません。'\n  Write-Host '[STOP] CONTROL CENTER安全ゲートへ接続できません。' -ForegroundColor Red\n  exit 4\n}\n\nif (-not $gate.ok) {\n  $code = if ($gate.code) { [string]$gate.code } else { 'PACKAGE_NOT_CURRENT' }\n  SaveResult $false $code 'このZIPは現在の設定と一致しないため使用できません。CONTROL CENTERで再生成してください。'\n  Write-Host ('[STOP] R3 package gate: ' + $code) -ForegroundColor Red\n  exit 5\n}\nWrite-Host 'PASS' -ForegroundColor Green\n\nWrite-Host ''\nWrite-Host '2) Target Supabase DPRO CONTACT DB check'\nWrite-Host 'SUPABASE_SECRET_KEY / legacy service_role key を入力してください。'\nWrite-Host '値はファイルへ保存しません。確認処理のメモリ内だけで使用します。'\n$secure = Read-Host 'Secret Key' -AsSecureString\n$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)\n$secret = ''\ntry {\n  $secret = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)\n  if ([string]::IsNullOrWhiteSpace($secret)) { StopPreflight 'TARGET_SECRET_EMPTY' 'Supabase Secret Keyが空です。' }\n  $headers = ApiHeaders $secret\n\n  try {\n    $module = Invoke-RestMethod -Uri ($TargetUrl + '/rest/v1/dpro_contact_module_meta?select=module_version,design_version&module_code=eq.DPRO_CONTACT&limit=1') -Method Get -Headers $headers -TimeoutSec 25\n  } catch {\n    StopPreflight 'CONTACT_DB_MISSING' '対象SupabaseでDPRO CONTACT DBを確認できません。DB導入後に再実行してください。'\n  }\n\n  $rows = @($module)\n  if ($rows.Count -lt 1) { StopPreflight 'CONTACT_DB_MISSING' 'dpro_contact_module_meta にDPRO_CONTACTがありません。' }\n  if ([string]$rows[0].module_version -ne $ExpectedDb) {\n    StopPreflight 'CONTACT_DB_VERSION_MISMATCH' ('CONTACT DB Version不一致: ' + [string]$rows[0].module_version + ' / expected ' + $ExpectedDb)\n  }\n  if ([string]$rows[0].design_version -ne $ExpectedDesign) {\n    StopPreflight 'CONTACT_DESIGN_VERSION_MISMATCH' ('CONTACT Design Version不一致: ' + [string]$rows[0].design_version)\n  }\n\n  Write-Host ''\n  Write-Host '3) Retention / lightweight inbox check'\n  try {\n    $retentionRows = Invoke-RestMethod -Uri ($TargetUrl + '/rest/v1/dpro_contact_retention_settings?select=scope_key,enabled,max_threads,extension_version&scope_key=eq.default&limit=1') -Method Get -Headers $headers -TimeoutSec 20\n  } catch {\n    StopPreflight 'CONTACT_RETENTION_R1_MISSING' '大量件数対応R1が未導入です。ZIP内 DPRO_CONTACT_RETENTION_R1.sql を対象Supabaseで先に実行してください。'\n  }\n  $retention = @($retentionRows)\n  if ($retention.Count -lt 1) { StopPreflight 'CONTACT_RETENTION_R1_MISSING' '大量件数対応R1のdefault設定がありません。' }\n  if ($retention[0].enabled -ne $true) { Write-Host 'NOTE: この契約先は自動整理OFFです（保持優先モード）。' -ForegroundColor Yellow }\n  if ($retention[0].enabled -eq $true -and [int]$retention[0].max_threads -gt 200) { StopPreflight 'CONTACT_RETENTION_LIMIT_TOO_HIGH' '自動整理基準は200件以下にしてください。' }\n  if ([string]$retention[0].extension_version -ne 'DPRO-CONTACT-RETENTION-R1-20260815') { StopPreflight 'CONTACT_RETENTION_VERSION_MISMATCH' '大量件数対応R1のVersionが一致しません。' }\n  Write-Host 'PASS' -ForegroundColor Green\n\n  if ($CheckWeb) {\n    try {\n      Invoke-RestMethod -Uri ($TargetUrl + '/rest/v1/dpro_contact_web_rate_limits?select=id&limit=1') -Method Get -Headers $headers -TimeoutSec 20 | Out-Null\n    } catch { StopPreflight 'CONTACT_WEB_DB_MISSING' 'WEB問い合わせ用DB拡張を確認できません。' }\n  }\n\n  if ($CheckAttachments) {\n    try {\n      Invoke-RestMethod -Uri ($TargetUrl + '/rest/v1/dpro_contact_attachments?select=id&limit=1') -Method Get -Headers $headers -TimeoutSec 20 | Out-Null\n    } catch { StopPreflight 'CONTACT_ATTACHMENTS_TABLE_MISSING' '添付テーブルを確認できません。' }\n    try {\n      $bucket = Invoke-RestMethod -Uri ($TargetUrl + '/storage/v1/bucket/dpro-contact-attachments') -Method Get -Headers $headers -TimeoutSec 20\n      if ($null -eq $bucket) { throw 'bucket missing' }\n      if ($bucket.public -eq $true) { StopPreflight 'CONTACT_ATTACHMENTS_BUCKET_PUBLIC' '添付Storage bucketがpublicです。privateへ戻してから再実行してください。' }\n    } catch { StopPreflight 'CONTACT_ATTACHMENTS_BUCKET_MISSING' 'private添付Storage bucketを確認できません。' }\n  }\n\n  try {\n    $gateBody2 = @{ p_project_id=$ProjectId; p_fingerprint=$Fingerprint } | ConvertTo-Json\n    $gate2 = Invoke-RestMethod -Uri ($CentralUrl + '/rest/v1/rpc/cc_contact_r3_validate_package') -Method Post -Headers (ApiHeaders $CentralKey) -Body $gateBody2 -TimeoutSec 20\n  } catch {\n    StopPreflight 'PACKAGE_GATE_RECHECK_UNREACHABLE' 'DB確認後の中央安全ゲート再確認に失敗しました。Deployしません。'\n  }\n  if (-not $gate2.ok) {\n    $gateCode2 = if ($gate2.code) { [string]$gate2.code } else { 'PACKAGE_CHANGED_DURING_PREFLIGHT' }\n    StopPreflight $gateCode2 'Preflight中に設定が変更されました。CONTROL CENTERでR3 ZIPを再生成してください。'\n  }\n\n  RecordPreflight $true 'PASS'\n  SaveResult $true 'PASS' '中央パッケージ・対象CONTACT DBともにDeploy前確認PASS。'\n  Write-Host 'PASS' -ForegroundColor Green\n} finally {\n  if ($ptr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }\n  $secret = $null\n}\n\nWrite-Host ''\nWrite-Host 'R3 PRE-FLIGHT PASS' -ForegroundColor Green\nexit 0\n`;
  }

  function setupCmd(p) {
    const required = p.security.required_secret_names.filter((x) => x !== "CONTACT_ENCRYPTION_KEY");
    const worker = p.contact.worker_name;
    const health = `${p.contact.worker_url.replace(/\/$/, "")}/api/health`;
    const prompts = required.map((name) => `\ncall :ensure_secret ${name}\nif errorlevel 1 goto :fail_keep\n`).join("");

    return `@echo off\nsetlocal EnableExtensions EnableDelayedExpansion\nchcp 65001 >nul\ncd /d "%~dp0"\ntitle DPRO CONTACT R3 SAFE SETUP - ${worker}\n\nset "WRANGLER=npx --yes wrangler@4"\nset "WORKER_NAME=${worker}"\nset "HEALTH_URL=${health}"\nset "SECRET_LIST_FILE=%TEMP%\\dpro_contact_%RANDOM%_%RANDOM%_secrets.json"\n\necho.\necho ============================================================\necho DPRO CONTACT 新規案件 最終安全化 R3\necho ============================================================\necho Tenant   : ${p.contact.tenant_code}\necho System   : ${p.contact.system_code}\necho Worker   : %WORKER_NAME%\necho Revision : ${p.config_revision}\necho.\necho [0/7] R3安全Preflight（中央ZIP照合 + 対象CONTACT DB）...\npowershell -NoProfile -ExecutionPolicy Bypass -File "DPRO_CONTACT_PREFLIGHT.ps1"\nif errorlevel 1 (\n  echo [STOP] R3 Preflightで停止しました。Cloudflare Deployは実行していません。\n  pause\n  exit /b 10\n)\necho PASS\n\nwhere node >nul 2>nul\nif errorlevel 1 (\n  echo [STOP] Node.js が見つかりません。\n  goto :fail\n)\nwhere npx >nul 2>nul\nif errorlevel 1 goto :fail\n\necho.\necho [1/7] Cloudflareログイン確認...\n%WRANGLER% whoami --json >nul 2>nul\nif errorlevel 1 (\n  %WRANGLER% login\n  if errorlevel 1 goto :fail\n  %WRANGLER% whoami --json >nul 2>nul\n  if errorlevel 1 goto :fail\n)\necho PASS\n\necho.\necho [2/7] Deploy直前 R3 PACKAGE CURRENT再確認...\npowershell -NoProfile -ExecutionPolicy Bypass -File "DPRO_CONTACT_PACKAGE_GATE.ps1"\nif errorlevel 1 (\n  echo [STOP] 設定変更・期限切れ・中央ゲート不通のためDeployしません。\n  pause\n  exit /b 11\n)\necho PASS\n\necho.\necho [3/7] WorkerコードとVariablesをDeploy...\n%WRANGLER% deploy --config wrangler.jsonc\nif errorlevel 1 goto :fail\necho PASS\n\necho.\necho [4/7] 既存Secret名を確認...\n%WRANGLER% secret list --name "%WORKER_NAME%" --format json > "%SECRET_LIST_FILE%" 2>nul\nif errorlevel 1 echo []> "%SECRET_LIST_FILE%"\necho PASS\n${prompts}\ncall :ensure_encryption_key\nif errorlevel 1 goto :fail_keep\n\necho.\necho [5/7] Health確認...\npowershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $r=Invoke-RestMethod -Uri '%HEALTH_URL%' -Method Get -TimeoutSec 30; $r | ConvertTo-Json -Depth 10 | Set-Content -Encoding UTF8 'DPRO_CONTACT_HEALTH_RESULT.json'; if($r.ok -eq $false){exit 2}"\nif errorlevel 1 goto :fail_keep\necho PASS\n\necho.\necho [6/7] 結果保存...\n(\n  echo DPRO CONTACT R3 SAFE SETUP PASS\n  echo Worker=%WORKER_NAME%\n  echo Revision=${p.config_revision}\n  echo Fingerprint=${p.package_fingerprint}\n  echo Health=%HEALTH_URL%\n  echo Completed=%DATE% %TIME%\n) > DPRO_CONTACT_DEPLOY_RESULT.txt\necho PASS\n\necho.\necho [7/7] 完了\ndel /q "%SECRET_LIST_FILE%" >nul 2>nul\necho ============================================================\necho DPRO CONTACT R3 SAFE DEPLOY PASS\necho ============================================================\necho 次はCONTROL CENTERでsystem-check / 本番送受信を確認してください。\npause\nexit /b 0\n\n:ensure_secret\nset "SECRET_NAME=%~1"\nfindstr /i /c:"\\"name\\": \\"%SECRET_NAME%\\"" "%SECRET_LIST_FILE%" >nul 2>nul\nif not errorlevel 1 (\n  echo [Secret] %SECRET_NAME% : 既存値を維持\n  exit /b 0\n)\necho.\necho [Secret] %SECRET_NAME% が未登録です。\necho Wranglerの安全な入力プロンプトへ値を入力してください。\n%WRANGLER% secret put %SECRET_NAME% --name "%WORKER_NAME%"\nif errorlevel 1 exit /b 1\n%WRANGLER% secret list --name "%WORKER_NAME%" --format json > "%SECRET_LIST_FILE%" 2>nul\nexit /b 0\n\n:ensure_encryption_key\nset "SECRET_NAME=CONTACT_ENCRYPTION_KEY"\nfindstr /i /c:"\\"name\\": \\"%SECRET_NAME%\\"" "%SECRET_LIST_FILE%" >nul 2>nul\nif not errorlevel 1 (\n  echo [Secret] CONTACT_ENCRYPTION_KEY : 既存値を維持\n  exit /b 0\n)\necho [Secret] CONTACT_ENCRYPTION_KEY : 未登録のため自動生成\npowershell -NoProfile -ExecutionPolicy Bypass -Command "$b=New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Fill($b); [Convert]::ToBase64String($b)" | %WRANGLER% secret put CONTACT_ENCRYPTION_KEY --name "%WORKER_NAME%"\nif errorlevel 1 exit /b 1\n%WRANGLER% secret list --name "%WORKER_NAME%" --format json > "%SECRET_LIST_FILE%" 2>nul\nexit /b 0\n\n:fail\ndel /q "%SECRET_LIST_FILE%" >nul 2>nul\necho [STOP] セットアップを停止しました。既存DPRO CONTACT R6-PRODは変更していません。\npause\nexit /b 1\n\n:fail_keep\ndel /q "%SECRET_LIST_FILE%" >nul 2>nul\necho [STOP] Deploy後の工程で停止しました。Worker/既存Secretの削除は行っていません。\npause\nexit /b 2\n`;
  }

  function setupInfo(p) {
    return [
      "DPRO CONTACT / 新規案件 最終安全化 R3",
      `PACKAGE: ${PACKAGE_VERSION}`,
      `REVISION: ${p.config_revision}`,
      `FINGERPRINT: ${p.package_fingerprint}`,
      `VALID_UNTIL: ${p.expires_at}`,
      `WORKER: ${WORKER_VERSION}`,
      `DB_EXPECTED: ${DB_VERSION}`,
      `ATTACHMENT_DB: ${ATTACHMENT_DB_VERSION}`,
      `RETENTION: ${RETENTION_EXTENSION_VERSION} / 自動整理基準 ${RETENTION_TARGET}件`,
      "",
      `契約先: ${p.project.client_name}`,
      `TENANT_CODE: ${p.contact.tenant_code}`,
      `SYSTEM_CODE: ${p.contact.system_code}`,
      `Worker: ${p.contact.worker_name}`,
      `Supabase Project Ref: ${p.connection.supabase_project_ref}`,
      "",
      "【R3安全順序】",
      "1. 中央CONTROL CENTERでこのZIPがCURRENTか照合",
      "2. 対象SupabaseのCONTACT DB Version / DesignをSecret Keyでローカル確認",
      "3. 大量件数対応R1（自動整理基準200件）を確認",
      "   未導入ならZIP内 DPRO_CONTACT_RETENTION_R1.sql を対象Supabaseで先に実行",
      "4. WEB利用時はWEB DB拡張を確認",
      "5. 添付利用時は添付テーブル + private Storage bucketを確認",
      "6. Cloudflareログイン後、Deploy直前に中央PACKAGE CURRENTをもう一度確認",
      "7. 上記PASS後にのみCloudflareへDeploy",
      "8. 不足SecretだけWranglerの安全入力で登録",
      "9. /api/health確認",
      "",
      "【重要】",
      "- 設定変更後は中央DBが旧ZIPをSTALEにします。旧R3 ZIPはPreflightで停止します。",
      `- このZIPの有効期限は生成から${PACKAGE_TTL_HOURS}時間です。期限切れは再生成してください。`,
      "- Secret値はZIP / GitHub / CONTROL CENTERへ保存しません。",
      "- 既存R6-PROD Workerを上書きするためのパッケージではありません。",
      "",
      "【必要Secret名】",
      ...p.security.required_secret_names.map((x) => `- ${x}`),
      "",
    ].join("\r\n");
  }

  function packageName(p) {
    const clean = (v, max) => String(v || "").replace(/[^A-Z0-9_-]/gi, "_").slice(0, max);
    return `DPRO_CONTACT_SETUP_${clean(p.contact.tenant_code, 32)}_${clean(p.contact.system_code, 24)}_R3_REV${p.config_revision}_20260815.zip`;
  }

  function suppressLegacyPackage() {
    const old = $("contactR23Package");
    if (old) {
      old.dataset.r3Suppressed = "true";
      const btn = old.querySelector("#contactR23Generate");
      if (btn) btn.disabled = true;
    }
  }

  function renderR3Block() {
    const r = state.readiness || {};
    const missing = Array.isArray(r.missing_r3_config) ? r.missing_r3_config.filter(Boolean) : [];
    const ready = Boolean(r.ready_for_r3_package);
    const current = Boolean(r.current_package_valid);
    const packageStatus = r.package_status || "none";
    const packageLabel = current ? "CURRENT" : packageStatus === "current" ? "EXPIRED" : packageStatus.toUpperCase();
    const preflight = r.preflight_status || "not_run";

    const button = ready && canWrite()
      ? `<button id="contactR3Generate" class="btn primary" type="button">R3安全Deploy ZIP生成</button>`
      : `<button class="btn secondary" type="button" disabled>R3 READY後に生成</button>`;

    return `
      <div id="contactR3Package" class="contact-r3-card" data-project-id="${esc(r.project_id || state.projectId)}">
        <div>
          <strong>R3｜新規案件 最終安全化ゲート</strong>
          <p>案件固有TENANT/Worker → R1保存 → R2設定 → ZIP CURRENT照合 → 対象CONTACT DB Preflight → Deploy直前CURRENT再照合 → Cloudflare Deploy の順で固定します。</p>
          <div class="contact-r3-meta">
            <span class="${ready ? "green" : "amber"}">${ready ? "R3 READY" : "GUARD STOP"}</span>
            <span>REV ${esc(r.config_revision || 1)}</span>
            <span class="${current ? "green" : packageStatus === "stale" ? "red" : "amber"}">ZIP ${esc(packageLabel)}</span>
            <span class="${preflight === "pass" ? "green" : preflight === "fail" ? "red" : "amber"}">Preflight ${esc(preflight.toUpperCase())}</span>
            <span>Tenant衝突 ${Number(r.tenant_collision_count || 0)}</span>
            <span>Worker衝突 ${Number(r.worker_collision_count || 0)}</span>
          </div>
          ${missing.length ? `<div class="contact-r3-missing">不足: ${missing.map(esc).join(" / ")}</div>` : ""}
          ${packageStatus === "stale" ? '<div class="contact-r3-warning">以前のZIPは設定変更によりSTALEです。必ずR3 ZIPを再生成してください。</div>' : ""}
        </div>
        ${button}
      </div>
    `;
  }

  function injectBlock() {
    suppressLegacyPackage();
    const r2 = $("contactOnboardingR2");
    if (!r2 || !state.readiness) return;
    $("contactR3Package")?.remove();
    const actions = r2.querySelector(".contact-r2-actions");
    if (actions) actions.insertAdjacentHTML("beforebegin", renderR3Block());
    else r2.insertAdjacentHTML("beforeend", renderR3Block());
    $("contactR3Generate")?.addEventListener("click", generate);
  }

  function injectError(message) {
    suppressLegacyPackage();
    const r2 = $("contactOnboardingR2") || $("contactOnboardingR1");
    if (!r2) return;
    $("contactR3Package")?.remove();
    r2.insertAdjacentHTML("afterend", `
      <div id="contactR3Package" class="contact-r3-card">
        <div><strong>R3｜安全化DB未確認</strong><p>${esc(message)}</p><div class="contact-r3-warning">R3 DB SQLを適用するまで旧R2 ZIP生成は使用しないでください。</div></div>
        <button class="btn secondary" type="button" disabled>R3 DB適用待ち</button>
      </div>`);
  }

  async function loadData(projectId) {
    const { data: readiness, error: readinessError } = await state.supabase
      .from("cc_v_contact_r3_readiness")
      .select("*")
      .eq("project_id", projectId)
      .maybeSingle();
    if (readinessError) throw readinessError;
    if (!readiness) throw new Error("R3対象案件を確認できません。");

    const [deployResult, authResult] = await Promise.all([
      state.supabase.from("cc_contact_deploy_profiles").select("*").eq("project_id", projectId).maybeSingle(),
      readiness.system_code
        ? state.supabase.from("cc_contact_system_auth_profiles").select("*").eq("system_code", readiness.system_code).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);
    if (deployResult.error) throw deployResult.error;
    if (authResult.error) throw authResult.error;
    return { readiness, deploy: deployResult.data || {}, auth: authResult.data || {} };
  }

  async function generate() {
    const button = $("contactR3Generate");
    if (!canWrite() || !state.projectId) return;
    if (button) { button.disabled = true; button.textContent = "R3 ZIP安全確認中…"; }

    let lockedProjectId = "";
    let lockedFingerprint = "";
    let packageLocked = false;

    try {
      const latest = await loadData(state.projectId);
      const r = latest.readiness;
      const dp = latest.deploy;
      const ap = latest.auth;
      if (!r.ready_for_r3_package) {
        throw new Error(`R3 READYではありません。${(r.missing_r3_config || []).filter(Boolean).join(" / ")}`);
      }

      assertPublishableKey(dp.supabase_publishable_key);
      const central = state.centralConfig || {};
      if (!central.supabaseUrl) throw new Error("CONTROL CENTER Supabase URLを確認できません。");
      assertPublishableKey(central.supabasePublishableKey || central.supabaseAnonKey || "");
      if (!["supabase_staff", "supabase_user"].includes(ap.auth_mode)) throw new Error("CONTACT認証プロファイルが未確認です。");
      if (!effectiveOrigins(r, dp).length) throw new Error("ALLOWED_ORIGINSが空です。");
      if (!r.tenant_code || !r.worker_name || !r.worker_url_candidate) throw new Error("R3 identityが未完成です。");
      if (Number(r.tenant_collision_count || 0) > 0 || Number(r.worker_collision_count || 0) > 0) throw new Error("TENANT_CODEまたはWorker名が重複しています。");

      const workerResponse = await fetch(WORKER_ASSET, { cache: "no-store" });
      if (!workerResponse.ok) throw new Error(`共通Workerを取得できませんでした。HTTP ${workerResponse.status}`);
      const workerBytes = new Uint8Array(await workerResponse.arrayBuffer());
      const workerHash = await sha256Hex(workerBytes);
      if (workerHash !== WORKER_SHA256) throw new Error("共通Worker SHA256が正式R6-PRODと一致しないため停止しました。");

      const fpPayload = fingerprintPayload(r, dp, ap);
      const fingerprint = await sha256Hex(new TextEncoder().encode(canonicalJson(fpPayload)));
      const generated = new Date();
      const expires = new Date(generated.getTime() + PACKAGE_TTL_HOURS * 60 * 60 * 1000);
      const generatedAt = generated.toISOString();
      const expiresAt = expires.toISOString();
      const p = buildProfile(r, dp, ap, fingerprint, generatedAt, expiresAt);
      const filename = packageName(p);
      const files = [
        { name: "worker.js", data: workerBytes },
        { name: "wrangler.jsonc", data: wranglerJson(p) },
        { name: "DPRO_CONTACT_SETUP_PROFILE_R3.json", data: JSON.stringify(p, null, 2) + "\n" },
        { name: "DPRO_CONTACT_SETUP_INFO.txt", data: setupInfo(p) },
        { name: "DPRO_CONTACT_DB_CHECK.sql", data: dbCheckSql(p) },
        { name: "DPRO_CONTACT_RETENTION_R1.sql", data: RETENTION_SQL },
        { name: "DPRO_CONTACT_PACKAGE_GATE.ps1", data: packageGatePs1(p) },
        { name: "DPRO_CONTACT_PREFLIGHT.ps1", data: preflightPs1(p) },
        { name: "DPRO_CONTACT_SETUP.cmd", data: setupCmd(p) },
      ];
      const blob = zipStored(files);

      // Optimistic lock: any R1/R2/auth/system/client config mutation increments config_revision.
      const { data: locked, error: lockError } = await state.supabase
        .from("cc_contact_deploy_profiles")
        .update({
          package_revision: Number(r.config_revision || 1),
          package_fingerprint: fingerprint,
          package_status: "current",
          package_generated_at: generatedAt,
          package_expires_at: expiresAt,
          preflight_status: "not_run",
          preflight_checked_at: null,
          preflight_code: null,
          deploy_status: "package_generated",
          updated_by: state.staff.id,
        })
        .eq("project_id", r.project_id)
        .eq("config_revision", Number(r.config_revision || 1))
        .select("project_id,config_revision,package_status,package_fingerprint")
        .maybeSingle();
      if (lockError) throw lockError;
      if (!locked || locked.package_fingerprint !== fingerprint) {
        throw new Error("生成直前に設定が変更されました。画面を更新して再生成してください。");
      }
      lockedProjectId = r.project_id;
      lockedFingerprint = fingerprint;
      packageLocked = true;

      const { error: onboardingError } = await state.supabase
        .from("cc_contact_onboarding")
        .update({
          setup_package_version: PACKAGE_VERSION,
          setup_package_name: filename,
          setup_package_generated_at: generatedAt,
          updated_by: state.staff.id,
        })
        .eq("project_id", r.project_id);
      if (onboardingError) throw onboardingError;

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);

      packageLocked = false;
      notify(`R3安全Deploy ZIPを生成しました。REV ${p.config_revision} / 有効期限 ${PACKAGE_TTL_HOURS}時間。`);
      await load(r.project_id, true);
    } catch (error) {
      console.error(BUILD, error);
      if (packageLocked && lockedProjectId && lockedFingerprint && state.supabase) {
        try {
          await state.supabase
            .from("cc_contact_deploy_profiles")
            .update({
              package_status: "stale",
              preflight_status: "not_run",
              preflight_checked_at: null,
              preflight_code: "PACKAGE_GENERATION_ABORTED",
              deploy_status: "needs_config",
              updated_by: state.staff?.id || null,
            })
            .eq("project_id", lockedProjectId)
            .eq("package_fingerprint", lockedFingerprint);
        } catch (_) { }
      }
      notify(error.message || "R3安全Deploy ZIPを生成できませんでした。", true);
      if (button) { button.disabled = false; button.textContent = "R3安全Deploy ZIP生成"; }
    }
  }

  async function load(projectId, force = false) {
    if (!projectId) return;
    if (state.loading && !force) return;
    state.loading = true;
    const token = ++state.token;
    try {
      const ok = await initSupabase();
      if (!ok || token !== state.token) return;
      const loaded = await loadData(projectId);
      if (token !== state.token) return;
      state.projectId = projectId;
      state.readiness = loaded.readiness;
      state.deploy = loaded.deploy;
      state.auth = loaded.auth;
      injectBlock();
    } catch (error) {
      console.error(BUILD, error);
      injectError(error.message || "R3 DB / Viewを確認してください。");
    } finally {
      state.loading = false;
    }
  }

  function currentProjectId() {
    const r2 = $("contactOnboardingR2");
    const r1 = $("contactOnboardingR1");
    return r2?.dataset?.projectId || r1?.dataset?.projectId || state.projectId || "";
  }

  function schedule() {
    suppressLegacyPackage();
    const projectId = currentProjectId();
    if (!projectId) return;
    const existing = $("contactR3Package");
    if (existing?.dataset?.projectId === projectId && state.projectId === projectId) return;
    setTimeout(() => load(projectId), 0);
  }

  function captureProject() {
    document.addEventListener("click", (event) => {
      const button = event.target.closest?.("[data-open-project]");
      if (!button?.dataset.openProject) return;
      state.projectId = button.dataset.openProject;
      state.readiness = null;
      state.deploy = null;
      state.auth = null;
      state.token += 1;
      $("contactR3Package")?.remove();
      suppressLegacyPackage();
    }, true);
  }

  function observe() {
    const detail = $("detailContent");
    if (!detail) return;
    const observer = new MutationObserver(schedule);
    observer.observe(detail, { childList: true, subtree: true });
    schedule();
  }

  async function boot() {
    installStyle();
    suppressLegacyPackage();
    captureProject();
    observe();
    try {
      await initSupabase();
      schedule();
    } catch (error) {
      console.error(BUILD, error);
      injectError(error.message || "R3初期化に失敗しました。");
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
