/**
 * DPRO CONTACT COMMON WORKER
 * Step: CONTACT-V1-5
 * Version: DPRO-CONTACT-1-WORKER-20260824-MULTI-STORE-R7.2-MAIL-GATEWAY-STAGED
 * Design: DPRO-CONTACT-1.0-DESIGN-20260808
 * Database: DPRO-CONTACT-1-DB-20260814-WEB-R1
 * WEB Extension: DPRO-CONTACT-WEB-1.0-20260814
 *
 * Shared LINE + WEB inquiry transport for DPRO systems.
 * The existing LINE webhook/reply route is preserved; WEB is an additive channel.
 *
 * Required Variables:
 *   SUPABASE_URL
 *   SUPABASE_PUBLISHABLE_KEY
 *   ALLOWED_ORIGINS
 *   TENANT_CODE
 *   SYSTEM_CODE
 *   LINE_CHANNEL_CODE
 *   LINE_CHANNEL_DISPLAY_NAME
 *   CONTACT_AUTH_MODE=supabase_staff | supabase_user
 *
 * Feature Flags (optional; defaults shown):
 *   CONTACT_ENABLED=true
 *   CONTACT_LINE_ENABLED=true
 *   CONTACT_LINE_REPLY_ENABLED=true
 *   CONTACT_SEARCH_ENABLED=true
 *   CONTACT_STATUS_ENABLED=true
 *   CONTACT_ATTACHMENTS_ENABLED=false  (R6 staged; enable only after UI deploy)
 *   CONTACT_TEMPLATES_ENABLED=false
 *   CONTACT_ASSIGNMENT_ENABLED=false
 *   CONTACT_AI_SUGGESTIONS_ENABLED=false
 *   CONTACT_EMAIL_ENABLED=false
 *   CONTACT_WEB_ENABLED=false
 *   CONTACT_SYSTEM_CHECK_ENABLED=true
 *
 * WEB email reply (optional; independent from LINE):
 *   WEB_EMAIL_REPLY_ENABLED=false
 *   WEB_EMAIL_FROM_ADDRESS=required sender address on a verified mail domain
 *   WEB_EMAIL_FROM_NAME=store / organization display name
 *   WEB_EMAIL_INBOUND_ENABLED=false
 *   WEB_EMAIL_FORWARD_TO=optional operational mailbox
 *   WEB_EMAIL_SENT_COPY_ENABLED=false
 *   WEB_EMAIL_SENT_COPY_TO=optional archive mailbox (falls back to WEB_EMAIL_FORWARD_TO)
 *
 * R3 shared mail gateway (optional; replaces per-store Resend / Email Routing):
 *   MAIL_GATEWAY_ENABLED=false
 *   MAIL_GATEWAY_URL=https://<shared-gateway-worker>
 *   MAIL_GATEWAY_ROUTE_TOKEN=<16-char base32 route token>
 *   MAIL_GATEWAY_MAIL_DOMAIN=<shared verified mail domain>
 *   MAIL_GATEWAY_REPLY_LOCAL=r
 *   MAIL_GATEWAY_SIGNING_PUBLIC_JWK=<ECDSA P-256 public JWK JSON>
 *   Secret: MAIL_GATEWAY_CLIENT_SECRET
 *
 * WEB Variables (required only when CONTACT_WEB_ENABLED=true):
 *   WEB_CHANNEL_CODE
 *   WEB_CHANNEL_DISPLAY_NAME
 *   WEB_FORM_ALLOWED_ORIGINS
 *   WEB_TURNSTILE_SITE_KEY
 *   WEB_TURNSTILE_HOSTNAMES
 * Optional WEB Variables:
 *   WEB_RATE_LIMIT_MAX=3            (valid submissions per email / window)
 *   WEB_RATE_LIMIT_IP_MAX=10        (valid submissions per IP / window)
 *   WEB_RATE_LIMIT_ATTEMPT_MAX=30   (all form attempts per IP / window)
 *   WEB_RATE_LIMIT_WINDOW_SECONDS=600
 *
 * Attachment option:
 *   CONTACT_ATTACHMENT_LINK_TTL_SECONDS=2592000  (30 days; LINE file links)
 *
 * Internal system-check:
 *   CONTACT_SYSTEM_CHECK_ROLES=technical_admin,support,owner_admin
 *
 * Required Secrets:
 *   SUPABASE_SECRET_KEY
 *   LINE_CHANNEL_SECRET
 *   LINE_CHANNEL_ACCESS_TOKEN
 *   CONTACT_ENCRYPTION_KEY
 *   WEB_TURNSTILE_SECRET_KEY (when CONTACT_WEB_ENABLED=true)
 *   RESEND_API_KEY (direct CUSTOM_DOMAIN mode only)\n *   MAIL_GATEWAY_CLIENT_SECRET (R3 shared gateway mode only)
 *
 * For CONTACT_AUTH_MODE=supabase_staff:
 *   CONTACT_STAFF_TABLE
 *   CONTACT_STAFF_ID_COLUMN
 *   CONTACT_STAFF_USER_COLUMN
 *   CONTACT_STAFF_DISPLAY_COLUMN
 *   CONTACT_STAFF_ROLE_COLUMN
 *   CONTACT_STAFF_STATUS_COLUMN
 *   CONTACT_STAFF_ACTIVE_VALUE
 *   CONTACT_ALLOWED_ROLES
 * Optional:
 *   CONTACT_STAFF_TENANT_COLUMN
 *   CONTACT_READ_ONLY_ROLES
 *
 * Public:
 *   GET  /api/health
 *   POST /webhook/line
 *   GET  /api/public/contact/web-config
 *   POST /api/public/contact/web
 *
 * Authenticated:
 *   GET  /api/contact/summary
 *   GET  /api/contact/threads
 *   GET  /api/contact/threads/:id/messages
 *   POST /api/contact/threads/:id/read
 *   POST /api/contact/threads/:id/status
 *   POST /api/contact/threads/:id/reply         (LINE only, unchanged)
 *   POST /api/contact/threads/:id/email-reply   (WEB only)
 *   POST /api/contact/threads/:id/attachments   (LINE / WEB multipart)
 *   GET  /api/contact/attachments/:id           (authenticated download)
 *   GET  /api/public/contact/attachments/:id    (signed LINE delivery link)
 *
 * Internal authenticated:
 *   GET /api/contact/system-check
 */

const VERSION = "DPRO-CONTACT-1-WORKER-20260824-MULTI-STORE-R7.2-MAIL-GATEWAY-STAGED";
const DB_VERSION = "DPRO-CONTACT-1-DB-20260814-WEB-R1";
const DESIGN_VERSION = "DPRO-CONTACT-1.0-DESIGN-20260808";
const WEB_EXTENSION_VERSION = "DPRO-CONTACT-WEB-1.0-20260814";
const ATTACHMENT_EXTENSION_VERSION = "DPRO-CONTACT-ATTACHMENTS-DB-20260815-R1";
const ATTACHMENT_BUCKET = "dpro-contact-attachments";

const MAX_BODY_BYTES = 256 * 1024;
const MAX_REPLY_CHARS = 5000;
const MAX_THREAD_LIMIT = 200;
const MAX_MESSAGE_LIMIT = 500;
const MAX_WEB_NAME_CHARS = 80;
const MAX_WEB_EMAIL_CHARS = 254;
const MAX_WEB_COMPANY_CHARS = 120;
const MAX_WEB_PHONE_CHARS = 30;
const MAX_WEB_INDUSTRY_CHARS = 80;
const MAX_WEB_MESSAGE_CHARS = 3000;
const MAX_TURNSTILE_TOKEN_CHARS = 2048;
const MAX_WEB_EMAIL_INBOUND_CHARS = 10000;
const MAX_WEB_EMAIL_RAW_PARSE_BYTES = 8 * 1024 * 1024;
const MAX_WEB_EMAIL_RAW_PARSE_BYTES_WITH_ATTACHMENTS = 32 * 1024 * 1024;
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const MAX_ATTACHMENT_COUNT = 3;
const MAX_ATTACHMENT_TOTAL_BYTES = 20 * 1024 * 1024;
const DEFAULT_ATTACHMENT_LINK_TTL_SECONDS = 30 * 24 * 60 * 60;
const MAIL_GATEWAY_VERSION = "DPRO-CONTACT-MAIL-GATEWAY-R3-20260824-STAGED";
const MAIL_GATEWAY_ROUTE_TOKEN_RE = /^[a-z2-7]{16}$/;
const MAIL_GATEWAY_MAX_META_HEADER_CHARS = 8192;
const MAIL_GATEWAY_MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = normalizePath(url.pathname);

    try {
      validateCommonEnv(env);
      const features = featureState(env);

      if (request.method === "OPTIONS") {
        return new Response(null, {
          status: 204,
          headers:
            path === "/api/public/contact/web-config"
              ? publicConfigCorsHeaders()
              : isWebPublicPath(path)
                ? webCorsHeaders(request, env)
                : corsHeaders(request, env),
        });
      }

      if (request.method === "GET" && path === "/api/health") {
        return withCors(request, env, await health(env));
      }

      if (request.method === "POST" && path === "/webhook/line") {
        if (!features.contactEnabled || !features.lineEnabled) {
          return json({
            ok: true,
            ignored: true,
            reason: !features.contactEnabled ? "contact_disabled" : "line_disabled"
          });
        }
        return handleLineWebhook(request, env, ctx);
      }

      if (request.method === "GET" && path === "/api/public/contact/web-config") {
        // Public bootstrap config contains no secrets. Do not require an Origin
        // header here because some browser/navigation paths may omit it.
        // CORS response headers remain restricted to WEB_FORM_ALLOWED_ORIGINS,
        // and the actual inquiry POST below still enforces the exact Origin.
        validateWebEnv(env);
        return withPublicConfigCors(json(publicWebConfig(env)));
      }

      if (request.method === "POST" && path === "/api/public/contact/web") {
        validateWebEnv(env);
        enforceWebOrigin(request, env);
        return withWebCors(request, env, json(await handleWebInquiry(request, env)));
      }

      const publicAttachmentMatch = path.match(
        /^\/api\/public\/contact\/attachments\/([0-9a-f-]{36})$/i
      );
      if (request.method === "GET" && publicAttachmentMatch) {
        return servePublicAttachment(request, env, publicAttachmentMatch[1]);
      }

      if (request.method === "POST" && path === "/api/internal/contact/mail-gateway/inbound") {
        requireFeature(env, "webEnabled", "web_feature_disabled");
        requireFeature(env, "webEmailInboundEnabled", "web_email_inbound_disabled");
        if (!featureState(env).mailGatewayEnabled) {
          return json({ ok: false, error: "mail_gateway_disabled" }, 403);
        }
        return json(await handleMailGatewayInboundRequest(request, env));
      }

      if (!path.startsWith("/api/contact/")) {
        return withCors(request, env, json({ ok: false, error: "not_found" }, 404));
      }

      enforceOrigin(request, env);
      const operator = await requireOperator(request, env);

      if (request.method === "GET" && path === "/api/contact/system-check") {
        requireSystemCheckAccess(env, operator);
        return withCors(request, env, json(await runSystemCheck(request, env, operator)));
      }

      requireFeature(env, "contactEnabled", "contact_disabled");

      const attachmentMatch = path.match(
        /^\/api\/contact\/attachments\/([0-9a-f-]{36})$/i
      );
      if (request.method === "GET" && attachmentMatch) {
        requireFeature(env, "attachmentsEnabled", "attachments_disabled");
        return withCors(
          request,
          env,
          await serveAuthenticatedAttachment(request, env, attachmentMatch[1])
        );
      }

      if (request.method === "GET" && path === "/api/contact/summary") {
        return withCors(request, env, json(await contactSummary(env)));
      }

      if (request.method === "GET" && path === "/api/contact/threads") {
        return withCors(request, env, json(await listThreads(env, url)));
      }

      const match = path.match(/^\/api\/contact\/threads\/([0-9a-f-]{36})(?:\/(messages|read|status|reply|email-reply|attachments))?$/i);
      if (!match) {
        return withCors(request, env, json({ ok: false, error: "not_found" }, 404));
      }

      const threadId = match[1];
      const action = match[2] || "";

      if (request.method === "GET" && action === "messages") {
        return withCors(request, env, json(await listMessages(env, threadId)));
      }

      if (request.method === "POST" && action === "read") {
        return withCors(request, env, json(await markRead(env, threadId, operator)));
      }

      if (request.method === "POST" && action === "status") {
        requireFeature(env, "statusEnabled", "status_feature_disabled");
        denyReadOnly(operator);
        const body = await readJson(request);
        return withCors(request, env, json(await setThreadStatus(env, threadId, body, operator)));
      }

      if (request.method === "POST" && action === "reply") {
        requireFeature(env, "lineEnabled", "line_feature_disabled");
        requireFeature(env, "lineReplyEnabled", "line_reply_disabled");
        denyReadOnly(operator);
        const body = await readJson(request);
        return withCors(request, env, json(await sendReply(env, threadId, body, operator)));
      }

      if (request.method === "POST" && action === "email-reply") {
        requireFeature(env, "webEnabled", "web_feature_disabled");
        validateWebEmailReplyEnv(env);
        denyReadOnly(operator);
        const body = await readJson(request);
        return withCors(request, env, json(await sendWebEmailReply(env, threadId, body, operator)));
      }

      if (request.method === "POST" && action === "attachments") {
        requireFeature(env, "attachmentsEnabled", "attachments_disabled");
        denyReadOnly(operator);
        return withCors(
          request,
          env,
          json(
            await sendAttachmentBatch(
              request,
              env,
              threadId,
              operator,
              new URL(request.url).origin
            )
          )
        );
      }

      return withCors(request, env, json({ ok: false, error: "method_not_allowed" }, 405));
    } catch (error) {
      const status = Number(error?.status || 500);
      const publicError = status >= 500 ? "server_error" : String(error?.message || "request_error");
      console.error("DPRO_CONTACT_API_ERROR", {
        path,
        status,
        detail: String(error?.message || error),
      });
      const response = json({ ok: false, error: publicError }, status);
      return isWebPublicPath(path)
        ? withWebCors(request, env, response)
        : withCors(request, env, response);
    }
  },

  async email(message, env, ctx) {
    const forwardTo = value(env, "WEB_EMAIL_FORWARD_TO");
    let processError = null;

    try {
      if (featureState(env).webEmailInboundEnabled) {
        validateCommonEnv(env);
        validateWebEmailInboundEnv(env);
        await handleWebEmailInbound(message, env);
      }
    } catch (error) {
      processError = error;
      console.error("DPRO_CONTACT_EMAIL_INBOUND_ERROR", {
        to: String(message?.to || ""),
        detail: String(error?.message || error),
      });
    }

    // Preserve the operational Gmail mailbox even if CONTROL CENTER import fails.
    if (forwardTo) {
      try {
        await message.forward(forwardTo);
        return;
      } catch (error) {
        console.error("DPRO_CONTACT_EMAIL_FORWARD_ERROR", {
          to: String(message?.to || ""),
          detail: String(error?.message || error),
        });
        throw error;
      }
    }

    if (processError) throw processError;
  },
};

function normalizePath(path) {
  const value = String(path || "/").replace(/\/+/g, "/");
  return value.length > 1 ? value.replace(/\/$/, "") : value;
}

function value(env, key, fallback = "") {
  const v = String(env[key] ?? "").trim();
  return v || fallback;
}

function tenantCode(env) {
  return value(env, "TENANT_CODE");
}

function systemCode(env) {
  return value(env, "SYSTEM_CODE");
}

function channelCode(env) {
  return value(env, "LINE_CHANNEL_CODE");
}

function channelDisplayName(env) {
  return value(env, "LINE_CHANNEL_DISPLAY_NAME", channelCode(env));
}

function webChannelCode(env) {
  return value(env, "WEB_CHANNEL_CODE", `${systemCode(env)}_WEB`);
}

function webChannelDisplayName(env) {
  return value(env, "WEB_CHANNEL_DISPLAY_NAME", webChannelCode(env));
}

function webEmailFromAddress(env) {
  return value(env, "WEB_EMAIL_FROM_ADDRESS").toLowerCase();
}

function webEmailFromName(env) {
  return value(
    env,
    "WEB_EMAIL_FROM_NAME",
    webChannelDisplayName(env) || systemCode(env) || tenantCode(env) || "DPRO CONTACT"
  )
    .replace(/[\r\n]+/g, " ")
    .trim()
    .slice(0, 120) || "DPRO CONTACT";
}

function webEmailTenantTag(env) {
  return tenantCode(env)
    .replace(/[^A-Za-z0-9_-]+/g, "_")
    .slice(0, 256) || "tenant";
}

function webEmailForwardTo(env) {
  return value(env, "WEB_EMAIL_FORWARD_TO").toLowerCase();
}

function webEmailSentCopyTo(env) {
  const configured = value(env, "WEB_EMAIL_SENT_COPY_TO") || webEmailForwardTo(env);
  return configured ? normalizeWebEmail(configured) : "";
}

function webEmailSentCopyBcc(env) {
  if (!featureState(env).webEmailSentCopyEnabled) return null;
  const address = webEmailSentCopyTo(env);
  return address ? [address] : null;
}

function mailGatewayUrl(env) {
  const raw = value(env, "MAIL_GATEWAY_URL");
  let url;
  try { url = new URL(raw); } catch (_) {
    const e = new Error("invalid_MAIL_GATEWAY_URL");
    e.status = 503;
    throw e;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    const e = new Error("invalid_MAIL_GATEWAY_URL");
    e.status = 503;
    throw e;
  }
  return url.origin;
}

function mailGatewayRouteToken(env) {
  const token = value(env, "MAIL_GATEWAY_ROUTE_TOKEN").toLowerCase();
  if (!MAIL_GATEWAY_ROUTE_TOKEN_RE.test(token)) {
    const e = new Error("invalid_MAIL_GATEWAY_ROUTE_TOKEN");
    e.status = 503;
    throw e;
  }
  return token;
}

function mailGatewayMailDomain(env) {
  const domain = value(env, "MAIL_GATEWAY_MAIL_DOMAIN").toLowerCase().replace(/^@+/, "");
  if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)) {
    const e = new Error("invalid_MAIL_GATEWAY_MAIL_DOMAIN");
    e.status = 503;
    throw e;
  }
  return domain;
}

function mailGatewayReplyLocal(env) {
  const local = value(env, "MAIL_GATEWAY_REPLY_LOCAL", "r").toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{0,15}$/.test(local)) {
    const e = new Error("invalid_MAIL_GATEWAY_REPLY_LOCAL");
    e.status = 503;
    throw e;
  }
  return local;
}

function webEmailReplyTo(env, threadId) {
  if (featureState(env).mailGatewayEnabled) {
    const local = `${mailGatewayReplyLocal(env)}+${mailGatewayRouteToken(env)}.${String(threadId).toLowerCase()}`;
    if (local.length > 64) {
      const e = new Error("MAIL_GATEWAY_reply_local_part_too_long");
      e.status = 503;
      throw e;
    }
    return `${local}@${mailGatewayMailDomain(env)}`;
  }

  const base = normalizeWebEmail(webEmailFromAddress(env));
  if (!featureState(env).webEmailInboundEnabled) return base;
  const [local, domain] = base.split("@");
  return `${local}+${String(threadId).toLowerCase()}@${domain}`;
}

function isWebPublicPath(path) {
  return path === "/api/public/contact/web" || path === "/api/public/contact/web-config";
}

function authMode(env) {
  return value(env, "CONTACT_AUTH_MODE").toLowerCase();
}

function flag(env, key, defaultValue = false) {
  const raw = value(env, key);
  if (!raw) return Boolean(defaultValue);
  return ["1", "true", "yes", "on", "enabled"].includes(raw.toLowerCase());
}

function featureState(env) {
  return {
    contactEnabled: flag(env, "CONTACT_ENABLED", true),
    lineEnabled: flag(env, "CONTACT_LINE_ENABLED", true),
    lineReplyEnabled: flag(env, "CONTACT_LINE_REPLY_ENABLED", true),
    searchEnabled: flag(env, "CONTACT_SEARCH_ENABLED", true),
    statusEnabled: flag(env, "CONTACT_STATUS_ENABLED", true),
    attachmentsEnabled: flag(env, "CONTACT_ATTACHMENTS_ENABLED", false),
    templatesEnabled: flag(env, "CONTACT_TEMPLATES_ENABLED", false),
    assignmentEnabled: flag(env, "CONTACT_ASSIGNMENT_ENABLED", false),
    aiSuggestionsEnabled: flag(env, "CONTACT_AI_SUGGESTIONS_ENABLED", false),
    emailEnabled: flag(env, "CONTACT_EMAIL_ENABLED", false),
    webEnabled: flag(env, "CONTACT_WEB_ENABLED", false),
    webEmailReplyEnabled: flag(env, "WEB_EMAIL_REPLY_ENABLED", false),
    webEmailInboundEnabled: flag(env, "WEB_EMAIL_INBOUND_ENABLED", false),
    webEmailSentCopyEnabled: flag(env, "WEB_EMAIL_SENT_COPY_ENABLED", false),
    mailGatewayEnabled: flag(env, "MAIL_GATEWAY_ENABLED", false),
    systemCheckEnabled: flag(env, "CONTACT_SYSTEM_CHECK_ENABLED", true),
  };
}

function requireFeature(env, key, message = "feature_disabled") {
  const features = featureState(env);
  if (!features[key]) {
    const e = new Error(message);
    e.status = 403;
    throw e;
  }
  return features;
}

function csvValues(raw) {
  return String(raw || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function validateIdentifier(name, label) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(String(name || ""))) {
    const e = new Error(`invalid_${label}`);
    e.status = 500;
    throw e;
  }
  return String(name);
}

function validateCommonEnv(env) {
  const required = [
    "SUPABASE_URL",
    "SUPABASE_PUBLISHABLE_KEY",
    "ALLOWED_ORIGINS",
    "TENANT_CODE",
    "SYSTEM_CODE",
    "LINE_CHANNEL_CODE",
    "LINE_CHANNEL_SECRET",
    "LINE_CHANNEL_ACCESS_TOKEN",
    "CONTACT_ENCRYPTION_KEY",
    "CONTACT_AUTH_MODE",
  ];

  const missing = required.filter((key) => !value(env, key));

  if (!value(env, "SUPABASE_SECRET_KEY") && !value(env, "SUPABASE_SERVICE_ROLE_KEY")) {
    missing.push("SUPABASE_SECRET_KEY");
  }

  if (missing.length) {
    const e = new Error(`missing_env:${[...new Set(missing)].join(",")}`);
    e.status = 500;
    throw e;
  }

  if (value(env, "CONTACT_ENCRYPTION_KEY").length < 32) {
    const e = new Error("CONTACT_ENCRYPTION_KEY_must_be_at_least_32_chars");
    e.status = 500;
    throw e;
  }

  const origins = allowedOrigins(env);
  if (!origins.length || origins.includes("*")) {
    const e = new Error("ALLOWED_ORIGINS_must_be_explicit");
    e.status = 500;
    throw e;
  }

  const mode = authMode(env);
  if (!["supabase_staff", "supabase_user"].includes(mode)) {
    const e = new Error("invalid_CONTACT_AUTH_MODE");
    e.status = 500;
    throw e;
  }

  if (mode === "supabase_staff") {
    const staffRequired = [
      "CONTACT_STAFF_TABLE",
      "CONTACT_STAFF_ID_COLUMN",
      "CONTACT_STAFF_USER_COLUMN",
      "CONTACT_STAFF_DISPLAY_COLUMN",
      "CONTACT_STAFF_ROLE_COLUMN",
      "CONTACT_STAFF_STATUS_COLUMN",
      "CONTACT_STAFF_ACTIVE_VALUE",
      "CONTACT_ALLOWED_ROLES",
    ];
    const staffMissing = staffRequired.filter((key) => !value(env, key));
    if (staffMissing.length) {
      const e = new Error(`missing_env:${staffMissing.join(",")}`);
      e.status = 500;
      throw e;
    }

    [
      ["CONTACT_STAFF_TABLE", "staff_table"],
      ["CONTACT_STAFF_ID_COLUMN", "staff_id_column"],
      ["CONTACT_STAFF_USER_COLUMN", "staff_user_column"],
      ["CONTACT_STAFF_DISPLAY_COLUMN", "staff_display_column"],
      ["CONTACT_STAFF_ROLE_COLUMN", "staff_role_column"],
      ["CONTACT_STAFF_STATUS_COLUMN", "staff_status_column"],
    ].forEach(([key, label]) => validateIdentifier(value(env, key), label));

    if (value(env, "CONTACT_STAFF_TENANT_COLUMN")) {
      validateIdentifier(value(env, "CONTACT_STAFF_TENANT_COLUMN"), "staff_tenant_column");
    }

    if (!csvValues(value(env, "CONTACT_ALLOWED_ROLES")).length) {
      const e = new Error("CONTACT_ALLOWED_ROLES_must_not_be_empty");
      e.status = 500;
      throw e;
    }
  }
}

function validateWebEnv(env) {
  const features = featureState(env);
  if (!features.contactEnabled || !features.webEnabled) {
    const e = new Error(!features.contactEnabled ? "contact_disabled" : "web_disabled");
    e.status = 403;
    throw e;
  }

  const required = [
    "WEB_CHANNEL_CODE",
    "WEB_CHANNEL_DISPLAY_NAME",
    "WEB_FORM_ALLOWED_ORIGINS",
    "WEB_TURNSTILE_SITE_KEY",
    "WEB_TURNSTILE_HOSTNAMES",
    "WEB_TURNSTILE_SECRET_KEY",
  ];
  const missing = required.filter((key) => !value(env, key));
  if (missing.length) {
    const e = new Error(`missing_web_env:${missing.join(",")}`);
    e.status = 503;
    throw e;
  }

  const origins = webAllowedOrigins(env);
  if (!origins.length || origins.includes("*")) {
    const e = new Error("WEB_FORM_ALLOWED_ORIGINS_must_be_explicit");
    e.status = 503;
    throw e;
  }
  if (!csvValues(value(env, "WEB_TURNSTILE_HOSTNAMES")).length) {
    const e = new Error("WEB_TURNSTILE_HOSTNAMES_must_be_explicit");
    e.status = 503;
    throw e;
  }

  if (webChannelCode(env) === channelCode(env)) {
    const e = new Error("WEB_CHANNEL_CODE_must_differ_from_LINE_CHANNEL_CODE");
    e.status = 503;
    throw e;
  }
}

function validateMailGatewayBaseEnv(env, requireInbound = false) {
  const required = [
    "MAIL_GATEWAY_URL",
    "MAIL_GATEWAY_ROUTE_TOKEN",
    "MAIL_GATEWAY_MAIL_DOMAIN",
    "MAIL_GATEWAY_CLIENT_SECRET",
    "WEB_EMAIL_FROM_NAME",
  ];
  if (requireInbound) required.push("MAIL_GATEWAY_SIGNING_PUBLIC_JWK");

  const missing = required.filter((key) => !value(env, key));
  if (missing.length) {
    const e = new Error(`missing_mail_gateway_env:${missing.join(",")}`);
    e.status = 503;
    throw e;
  }

  mailGatewayUrl(env);
  mailGatewayRouteToken(env);
  mailGatewayMailDomain(env);
  mailGatewayReplyLocal(env);

  if (value(env, "MAIL_GATEWAY_CLIENT_SECRET").length < 24) {
    const e = new Error("invalid_MAIL_GATEWAY_CLIENT_SECRET");
    e.status = 503;
    throw e;
  }

  if (requireInbound) {
    try {
      const jwk = JSON.parse(value(env, "MAIL_GATEWAY_SIGNING_PUBLIC_JWK"));
      if (jwk?.kty !== "EC" || jwk?.crv !== "P-256" || !jwk?.x || !jwk?.y || jwk?.d) {
        throw new Error("invalid_public_jwk");
      }
    } catch (_) {
      const e = new Error("invalid_MAIL_GATEWAY_SIGNING_PUBLIC_JWK");
      e.status = 503;
      throw e;
    }
  }
}

function validateWebEmailReplyEnv(env) {
  if (!featureState(env).webEmailReplyEnabled) {
    const e = new Error("web_email_reply_disabled");
    e.status = 403;
    throw e;
  }

  if (featureState(env).mailGatewayEnabled) {
    validateMailGatewayBaseEnv(env, featureState(env).webEmailInboundEnabled);

    if (featureState(env).webEmailSentCopyEnabled) {
      const archiveTo = value(env, "WEB_EMAIL_SENT_COPY_TO") || value(env, "WEB_EMAIL_FORWARD_TO");
      if (!archiveTo) {
        const e = new Error("missing_WEB_EMAIL_SENT_COPY_TO_or_WEB_EMAIL_FORWARD_TO");
        e.status = 503;
        throw e;
      }
      normalizeWebEmail(archiveTo);
    }
    return;
  }

  const required = [
    "RESEND_API_KEY",
    "WEB_EMAIL_FROM_ADDRESS",
    "WEB_EMAIL_FROM_NAME",
  ];
  const missing = required.filter((key) => !value(env, key));
  if (missing.length) {
    const e = new Error(`missing_web_email_env:${missing.join(",")}`);
    e.status = 503;
    throw e;
  }

  normalizeWebEmail(webEmailFromAddress(env));
  if (!value(env, "RESEND_API_KEY").startsWith("re_")) {
    const e = new Error("invalid_RESEND_API_KEY");
    e.status = 503;
    throw e;
  }

  if (featureState(env).webEmailSentCopyEnabled) {
    const archiveTo = value(env, "WEB_EMAIL_SENT_COPY_TO") || value(env, "WEB_EMAIL_FORWARD_TO");
    if (!archiveTo) {
      const e = new Error("missing_WEB_EMAIL_SENT_COPY_TO_or_WEB_EMAIL_FORWARD_TO");
      e.status = 503;
      throw e;
    }
    normalizeWebEmail(archiveTo);
  }
}

function validateWebEmailInboundEnv(env) {
  const features = featureState(env);
  if (!features.contactEnabled || !features.webEnabled || !features.webEmailInboundEnabled) {
    const e = new Error("web_email_inbound_disabled");
    e.status = 403;
    throw e;
  }

  if (features.mailGatewayEnabled) {
    validateMailGatewayBaseEnv(env, true);
    return;
  }

  const required = [
    "WEB_CHANNEL_CODE",
    "WEB_EMAIL_FROM_ADDRESS",
    "WEB_EMAIL_FORWARD_TO",
  ];
  const missing = required.filter((key) => !value(env, key));
  if (missing.length) {
    const e = new Error(`missing_web_email_inbound_env:${missing.join(",")}`);
    e.status = 503;
    throw e;
  }

  normalizeWebEmail(webEmailFromAddress(env));
  normalizeWebEmail(webEmailForwardTo(env));
}

function allowedOrigins(env) {
  return csvValues(value(env, "ALLOWED_ORIGINS"));
}

function webAllowedOrigins(env) {
  return csvValues(value(env, "WEB_FORM_ALLOWED_ORIGINS"));
}

function corsHeaders(request, env) {
  const origin = request.headers.get("origin") || "";
  const allowed = allowedOrigins(env);
  const responseOrigin = allowed.includes(origin) ? origin : allowed[0];
  return {
    "access-control-allow-origin": responseOrigin,
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "authorization,content-type",
    "access-control-max-age": "86400",
    "vary": "Origin",
  };
}

function withCors(request, env, response) {
  const headers = new Headers(response.headers);
  for (const [key, val] of Object.entries(corsHeaders(request, env))) {
    headers.set(key, val);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function webCorsHeaders(request, env) {
  const origin = request.headers.get("origin") || "";
  const allowed = webAllowedOrigins(env);
  const responseOrigin = allowed.includes(origin) ? origin : (allowed[0] || "null");
  return {
    "access-control-allow-origin": responseOrigin,
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
    "vary": "Origin",
  };
}

function withWebCors(request, env, response) {
  const headers = new Headers(response.headers);
  for (const [key, val] of Object.entries(webCorsHeaders(request, env))) {
    headers.set(key, val);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function publicConfigCorsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
  };
}

function withPublicConfigCors(response) {
  const headers = new Headers(response.headers);
  for (const [key, val] of Object.entries(publicConfigCorsHeaders())) {
    headers.set(key, val);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function enforceOrigin(request, env) {
  const origin = request.headers.get("origin");
  if (!origin) return;
  if (!allowedOrigins(env).includes(origin)) {
    const e = new Error("origin_not_allowed");
    e.status = 403;
    throw e;
  }
}

function enforceWebOrigin(request, env) {
  const origin = request.headers.get("origin") || "";
  if (!origin || !webAllowedOrigins(env).includes(origin)) {
    const e = new Error("origin_not_allowed");
    e.status = 403;
    throw e;
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

async function readJson(request) {
  const len = Number(request.headers.get("content-length") || 0);
  if (len > MAX_BODY_BYTES) {
    const e = new Error("payload_too_large");
    e.status = 413;
    throw e;
  }
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) {
    const e = new Error("payload_too_large");
    e.status = 413;
    throw e;
  }
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    const e = new Error("invalid_json");
    e.status = 400;
    throw e;
  }
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function sb(env, path, options = {}) {
  const url = `${value(env, "SUPABASE_URL").replace(/\/$/, "")}${path}`;
  const adminKey = value(env, "SUPABASE_SECRET_KEY") || value(env, "SUPABASE_SERVICE_ROLE_KEY");

  const headers = {
    apikey: adminKey,
    "content-type": "application/json",
    ...(adminKey.startsWith("sb_secret_") ? {} : { authorization: `Bearer ${adminKey}` }),
    ...(options.headers || {}),
  };

  const response = await fetch(url, { ...options, headers });
  const text = await response.text();
  const data = text ? safeJson(text) : null;

  if (!response.ok) {
    const e = new Error(
      data?.message ||
      data?.error_description ||
      data?.error ||
      `supabase_${response.status}`
    );
    e.status = 500;
    throw e;
  }

  return data;
}

async function health(env) {
  let databaseReady = false;
  let channelReady = false;
  let channelStatus = null;

  try {
    const meta = await sb(
      env,
      `/rest/v1/dpro_contact_module_meta?select=module_version,design_version&module_code=eq.DPRO_CONTACT&limit=1`
    );

    databaseReady =
      Array.isArray(meta) &&
      meta[0]?.module_version === DB_VERSION &&
      meta[0]?.design_version === DESIGN_VERSION;

    if (databaseReady) {
      const channel = await ensureChannel(env, "");
      channelReady = Boolean(channel?.id);
      channelStatus = channel?.status || null;
    }
  } catch (error) {
    console.error("DPRO_CONTACT_HEALTH_DB", String(error?.message || error));
  }

  const features = featureState(env);
  let attachmentExtensionReady = null;

  if (features.attachmentsEnabled) {
    try {
      await sb(env, "/rest/v1/dpro_contact_attachments?select=id&limit=1");
      attachmentExtensionReady = true;
    } catch (error) {
      attachmentExtensionReady = false;
      console.error("DPRO_CONTACT_HEALTH_ATTACHMENTS", String(error?.message || error));
    }
  }

  const webEmailSentCopyReady =
    !features.webEmailSentCopyEnabled ||
    Boolean(value(env, "WEB_EMAIL_SENT_COPY_TO") || value(env, "WEB_EMAIL_FORWARD_TO"));

  let mailGatewayReady = true;
  if (features.mailGatewayEnabled) {
    try {
      validateMailGatewayBaseEnv(env, features.webEmailInboundEnabled);
      mailGatewayReady = true;
    } catch (_) {
      mailGatewayReady = false;
    }
  }

  const ok =
    databaseReady &&
    channelReady &&
    (features.attachmentsEnabled ? attachmentExtensionReady === true : true) &&
    webEmailSentCopyReady &&
    mailGatewayReady;

  return json({
    ok,
    service: "DPRO CONTACT API",
    version: VERSION,
    expectedDatabaseVersion: DB_VERSION,
    designVersion: DESIGN_VERSION,
    attachmentExtensionVersion: ATTACHMENT_EXTENSION_VERSION,
    attachmentExtensionReady,
    databaseReady,
    channelReady,
    channelStatus,
    webEmailSentCopyReady,
    mailGatewayReady,
    mailGatewayVersion: features.mailGatewayEnabled ? MAIL_GATEWAY_VERSION : null,
    mailGatewayRouteToken: features.mailGatewayEnabled ? value(env, "MAIL_GATEWAY_ROUTE_TOKEN") || null : null,
    tenantCode: tenantCode(env),
    systemCode: systemCode(env),
    channelCode: channelCode(env),
    authMode: authMode(env),
    features,
    checkedAt: new Date().toISOString(),
  }, ok ? 200 : 503);
}

async function requireOperator(request, env) {
  const auth = request.headers.get("authorization") || "";
  const token = auth.toLowerCase().startsWith("bearer ")
    ? auth.slice(7).trim()
    : "";

  if (!token) {
    const e = new Error("authentication_required");
    e.status = 401;
    throw e;
  }

  const userResponse = await fetch(
    `${value(env, "SUPABASE_URL").replace(/\/$/, "")}/auth/v1/user`,
    {
      headers: {
        apikey: value(env, "SUPABASE_PUBLISHABLE_KEY"),
        authorization: `Bearer ${token}`,
      },
    }
  );

  if (!userResponse.ok) {
    const e = new Error("invalid_session");
    e.status = 401;
    throw e;
  }

  const user = await userResponse.json();
  const mode = authMode(env);

  if (mode === "supabase_user") {
    const readOnly =
      value(env, "CONTACT_SUPABASE_USER_READ_ONLY", "false").toLowerCase() === "true";

    return {
      staffKey: String(user.id),
      displayName: String(user.email || user.phone || "Authenticated User"),
      roleKey: "authenticated",
      readOnly,
      authUserId: String(user.id),
    };
  }

  const table = validateIdentifier(value(env, "CONTACT_STAFF_TABLE"), "staff_table");
  const idCol = validateIdentifier(value(env, "CONTACT_STAFF_ID_COLUMN"), "staff_id_column");
  const userCol = validateIdentifier(value(env, "CONTACT_STAFF_USER_COLUMN"), "staff_user_column");
  const displayCol = validateIdentifier(value(env, "CONTACT_STAFF_DISPLAY_COLUMN"), "staff_display_column");
  const roleCol = validateIdentifier(value(env, "CONTACT_STAFF_ROLE_COLUMN"), "staff_role_column");
  const statusCol = validateIdentifier(value(env, "CONTACT_STAFF_STATUS_COLUMN"), "staff_status_column");
  const tenantCol = value(env, "CONTACT_STAFF_TENANT_COLUMN")
    ? validateIdentifier(value(env, "CONTACT_STAFF_TENANT_COLUMN"), "staff_tenant_column")
    : "";

  const select = [...new Set([idCol, userCol, displayCol, roleCol, statusCol, tenantCol].filter(Boolean))].join(",");

  let path =
    `/rest/v1/${table}?select=${encodeURIComponent(select)}` +
    `&${userCol}=eq.${encodeURIComponent(user.id)}&limit=1`;

  if (tenantCol) {
    path += `&${tenantCol}=eq.${encodeURIComponent(tenantCode(env))}`;
  }

  const rows = await sb(env, path);
  const staff = rows?.[0];

  if (!staff || String(staff[statusCol]) !== value(env, "CONTACT_STAFF_ACTIVE_VALUE")) {
    const e = new Error("staff_access_denied");
    e.status = 403;
    throw e;
  }

  const role = String(staff[roleCol] || "");
  const allowedRoles = csvValues(value(env, "CONTACT_ALLOWED_ROLES"));

  if (!allowedRoles.includes(role)) {
    const e = new Error("role_access_denied");
    e.status = 403;
    throw e;
  }

  const readOnlyRoles = csvValues(value(env, "CONTACT_READ_ONLY_ROLES", "read_only"));

  return {
    staffKey: String(staff[idCol]),
    displayName: String(staff[displayCol] || ""),
    roleKey: role,
    readOnly: readOnlyRoles.includes(role),
    authUserId: String(user.id),
  };
}

function denyReadOnly(operator) {
  if (operator?.readOnly) {
    const e = new Error("forbidden");
    e.status = 403;
    throw e;
  }
}

async function handleLineWebhook(request, env, ctx) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-line-signature") || "";

  if (!signature || !(await verifyLineSignature(rawBody, signature, value(env, "LINE_CHANNEL_SECRET")))) {
    return json({ ok: false, error: "invalid_signature" }, 401);
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const events = Array.isArray(payload.events) ? payload.events : [];
  ctx.waitUntil(processLineEvents(env, String(payload.destination || ""), events));

  return json({ ok: true });
}

async function verifyLineSignature(rawBody, signature, channelSecret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(channelSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signed = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(rawBody)
  );
  return timingSafeEqual(base64(signed), signature);
}

function timingSafeEqual(a, b) {
  const left = new TextEncoder().encode(String(a || ""));
  const right = new TextEncoder().encode(String(b || ""));
  if (left.length !== right.length) return false;

  let diff = 0;
  for (let i = 0; i < left.length; i += 1) {
    diff |= left[i] ^ right[i];
  }
  return diff === 0;
}

async function processLineEvents(env, destination, events) {
  const channel = await ensureChannel(env, destination);
  const now = new Date().toISOString();

  await sb(env, `/rest/v1/dpro_contact_channels?id=eq.${encodeURIComponent(channel.id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      status: "active",
      last_webhook_at: now,
      last_error_at: null,
      last_error_code: null,
      updated_at: now,
    }),
  });

  for (const event of events) {
    try {
      if (event?.type !== "message") continue;
      if (event?.source?.type !== "user" || !event.source.userId) continue;
      await storeInboundMessage(env, channel, event);
    } catch (error) {
      console.error("DPRO_CONTACT_LINE_EVENT_ERROR", String(error?.message || error));
      await markChannelError(env, channel.id, String(error?.message || "line_event_error")).catch(() => {});
    }
  }
}

async function ensureChannel(env, destination) {
  const tenant = tenantCode(env);
  const code = channelCode(env);

  const rows = await sb(
    env,
    `/rest/v1/dpro_contact_channels?select=*&tenant_code=eq.${encodeURIComponent(tenant)}` +
    `&channel_code=eq.${encodeURIComponent(code)}&limit=1`
  );

  let channel = rows?.[0];

  if (!channel) {
    const created = await sb(env, "/rest/v1/dpro_contact_channels", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        tenant_code: tenant,
        system_code: systemCode(env),
        channel_code: code,
        channel_type: "line",
        display_name: channelDisplayName(env),
        status: destination ? "active" : "preparing",
        provider_destination: destination || null,
        settings: {
          moduleVersion: VERSION,
          designVersion: DESIGN_VERSION,
        },
      }),
    });
    channel = created?.[0];
  } else {
    const patch = {};
    if (systemCode(env) && channel.system_code !== systemCode(env)) {
      patch.system_code = systemCode(env);
    }
    if (channel.display_name !== channelDisplayName(env)) {
      patch.display_name = channelDisplayName(env);
    }
    if (destination && channel.provider_destination !== destination) {
      patch.provider_destination = destination;
      patch.status = "active";
    }

    if (Object.keys(patch).length) {
      patch.updated_at = new Date().toISOString();
      const updated = await sb(
        env,
        `/rest/v1/dpro_contact_channels?id=eq.${encodeURIComponent(channel.id)}`,
        {
          method: "PATCH",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify(patch),
        }
      );
      channel = updated?.[0] || { ...channel, ...patch };
    }
  }

  if (!channel?.id) {
    const e = new Error("channel_prepare_failed");
    e.status = 500;
    throw e;
  }

  return channel;
}

async function markChannelError(env, channelId, message) {
  await sb(
    env,
    `/rest/v1/dpro_contact_channels?id=eq.${encodeURIComponent(channelId)}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        status: "error",
        last_error_at: new Date().toISOString(),
        last_error_code: String(message || "error").slice(0, 120),
        updated_at: new Date().toISOString(),
      }),
    }
  );
}

async function storeInboundMessage(env, channel, event) {
  const userId = String(event.source.userId);
  const providerMessageId = event.message?.id ? String(event.message.id) : null;

  if (providerMessageId) {
    const duplicate = await sb(
      env,
      `/rest/v1/dpro_contact_messages?select=id&provider_message_id=eq.${encodeURIComponent(providerMessageId)}&limit=1`
    );
    if (duplicate?.length) return;
  }

  const userKey = await identityHash(env, userId);
  const occurredAt = event.timestamp
    ? new Date(event.timestamp).toISOString()
    : new Date().toISOString();

  const messageType = String(event.message?.type || "unknown");
  const body = inboundBody(event.message);

  let threadRows = await sb(
    env,
    `/rest/v1/dpro_contact_threads?select=*&channel_id=eq.${encodeURIComponent(channel.id)}` +
    `&external_user_key=eq.${encodeURIComponent(userKey)}&limit=1`
  );

  let thread = threadRows?.[0];

  if (!thread) {
    let profileName = "";

    try {
      const profile = await lineApi(
        env,
        `/v2/bot/profile/${encodeURIComponent(userId)}`,
        { method: "GET" }
      );
      profileName = String(profile?.displayName || "");
    } catch (error) {
      console.warn("DPRO_CONTACT_LINE_PROFILE_ERROR", String(error?.message || error));
    }

    const inserted = await sb(env, "/rest/v1/dpro_contact_threads", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        channel_id: channel.id,
        external_user_key: userKey,
        external_user_ciphertext: await encrypt(env, userId),
        profile_name_ciphertext: profileName ? await encrypt(env, profileName) : null,
        status: "open",
        unread_count: 0,
        metadata: {
          tenantCode: tenantCode(env),
          systemCode: systemCode(env),
        },
      }),
    });

    thread = inserted?.[0];
  }

  if (!thread?.id) {
    throw new Error("thread_create_failed");
  }

  const bodyCipher = await encrypt(env, body);

  await sb(env, "/rest/v1/dpro_contact_messages", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      thread_id: thread.id,
      direction: "inbound",
      message_type: messageType,
      body_ciphertext: bodyCipher,
      provider_message_id: providerMessageId,
      delivery_status: "received",
      occurred_at: occurredAt,
      metadata: {
        provider: "line",
        sourceType: event.source.type,
        webhookEventId: event.webhookEventId || null,
        redelivery: Boolean(event.deliveryContext?.isRedelivery),
      },
    }),
  });

  await sb(
    env,
    `/rest/v1/dpro_contact_threads?id=eq.${encodeURIComponent(thread.id)}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        unread_count: Number(thread.unread_count || 0) + 1,
        status: thread.status === "spam" ? "spam" : "open",
        last_message_ciphertext: bodyCipher,
        last_message_direction: "inbound",
        last_message_type: messageType,
        last_message_at: occurredAt,
        last_inbound_at: occurredAt,
        updated_at: new Date().toISOString(),
      }),
    }
  );

  if (
    featureState(env).attachmentsEnabled &&
    providerMessageId &&
    ["image", "file", "video", "audio"].includes(messageType)
  ) {
    try {
      const saved = await sb(
        env,
        `/rest/v1/dpro_contact_messages?select=id&provider_message_id=eq.${encodeURIComponent(providerMessageId)}&limit=1`
      );
      await captureLineInboundAttachment(
        env,
        thread.id,
        saved?.[0]?.id || null,
        event.message
      );
    } catch (error) {
      console.error("DPRO_CONTACT_LINE_ATTACHMENT_ERROR", String(error?.message || error));
      await deliveryLog(env, {
        thread_id: thread.id,
        message_id: null,
        operation: "line_attachment_receive",
        success: false,
        provider: "line",
        http_status: Number(error?.upstreamStatus || error?.status || 500),
        error_code: String(error?.code || ""),
        error_message: String(error?.message || error).slice(0, 500),
        request_id: providerMessageId,
        metadata: { messageType },
      }).catch(() => {});
    }
  }
}

function inboundBody(message) {
  if (!message) return "【内容を取得できませんでした】";
  if (message.type === "text") return String(message.text || "");

  const labels = {
    image: "【画像を受信しました】",
    video: "【動画を受信しました】",
    audio: "【音声を受信しました】",
    file: `【ファイルを受信しました${message.fileName ? `：${message.fileName}` : ""}】`,
    location: `【位置情報を受信しました${message.address ? `：${message.address}` : ""}】`,
    sticker: "【スタンプを受信しました】",
  };

  return labels[message.type] ||
    `【${String(message.type || "不明")}メッセージを受信しました】`;
}

function publicWebConfig(env) {
  const enabled = featureState(env).contactEnabled && featureState(env).webEnabled;
  return {
    ok: true,
    enabled,
    version: WEB_EXTENSION_VERSION,
    siteKey: enabled ? value(env, "WEB_TURNSTILE_SITE_KEY") : "",
    action: "dpro_contact_web",
    limits: {
      name: MAX_WEB_NAME_CHARS,
      email: MAX_WEB_EMAIL_CHARS,
      company: MAX_WEB_COMPANY_CHARS,
      phone: MAX_WEB_PHONE_CHARS,
      industry: MAX_WEB_INDUSTRY_CHARS,
      message: MAX_WEB_MESSAGE_CHARS,
    },
    categories: [
      { value: "line", label: "LINE公式" },
      { value: "website", label: "ホームページ" },
      { value: "dpro", label: "DPROシステム" },
      { value: "price", label: "料金" },
      { value: "other", label: "その他" },
    ],
  };
}

function cleanWebText(input, maxChars) {
  const text = String(input ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim();
  if (text.length > maxChars) {
    const e = new Error("validation_failed");
    e.status = 400;
    throw e;
  }
  return text;
}

function normalizeWebEmail(input) {
  const email = cleanWebText(input, MAX_WEB_EMAIL_CHARS).toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    const e = new Error("invalid_email");
    e.status = 400;
    throw e;
  }
  return email;
}

function webCategoryLabel(code) {
  const labels = {
    line: "LINE公式",
    website: "ホームページ",
    dpro: "DPROシステム",
    price: "料金",
    other: "その他",
  };
  return labels[code] || "未選択";
}

function validateWebInquiry(body) {
  const name = cleanWebText(body?.name, MAX_WEB_NAME_CHARS);
  const email = normalizeWebEmail(body?.email);
  const company = cleanWebText(body?.company, MAX_WEB_COMPANY_CHARS);
  const phone = cleanWebText(body?.phone, MAX_WEB_PHONE_CHARS);
  const industry = cleanWebText(body?.industry, MAX_WEB_INDUSTRY_CHARS);
  const message = cleanWebText(body?.message, MAX_WEB_MESSAGE_CHARS);
  const category = cleanWebText(body?.category, 32).toLowerCase();
  const submissionId = cleanWebText(body?.submissionId, 64);
  const turnstileToken = cleanWebText(body?.turnstileToken, MAX_TURNSTILE_TOKEN_CHARS);

  if (!name || !message) {
    const e = new Error("required_fields_missing");
    e.status = 400;
    throw e;
  }

  if (category && !["line", "website", "dpro", "price", "other"].includes(category)) {
    const e = new Error("invalid_category");
    e.status = 400;
    throw e;
  }

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(submissionId)) {
    const e = new Error("invalid_submission_id");
    e.status = 400;
    throw e;
  }

  if (!turnstileToken) {
    const e = new Error("turnstile_required");
    e.status = 400;
    throw e;
  }

  return { name, email, company, phone, industry, message, category, submissionId, turnstileToken };
}

function clampInt(valueInput, fallback, min, max) {
  const n = Number(valueInput);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}

async function consumeWebRateLimit(env, rateKey, scope = "email") {
  const maxRequests = scope === "attempt"
    ? clampInt(value(env, "WEB_RATE_LIMIT_ATTEMPT_MAX", "30"), 30, 1, 120)
    : scope === "ip"
      ? clampInt(value(env, "WEB_RATE_LIMIT_IP_MAX", "10"), 10, 1, 60)
      : clampInt(value(env, "WEB_RATE_LIMIT_MAX", "3"), 3, 1, 30);
  const windowSeconds = clampInt(value(env, "WEB_RATE_LIMIT_WINDOW_SECONDS", "600"), 600, 60, 86400);
  const result = await sb(env, "/rest/v1/rpc/dpro_contact_web_rate_limit", {
    method: "POST",
    body: JSON.stringify({
      p_rate_key: rateKey,
      p_window_seconds: windowSeconds,
      p_max_requests: maxRequests,
    }),
  });
  const data = Array.isArray(result) ? result[0] : result;
  if (data?.allowed === false) {
    const e = new Error("rate_limited");
    e.status = 429;
    e.retryAfter = Number(data?.retryAfterSeconds || windowSeconds);
    throw e;
  }
  return data || { allowed: true };
}

async function verifyWebTurnstile(env, token, remoteIp, submissionId) {
  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      secret: value(env, "WEB_TURNSTILE_SECRET_KEY"),
      response: token,
      ...(remoteIp ? { remoteip: remoteIp } : {}),
      idempotency_key: submissionId,
    }),
  });

  const data = await response.json().catch(() => ({}));
  const hosts = csvValues(value(env, "WEB_TURNSTILE_HOSTNAMES"));
  const actionOk = String(data?.action || "") === "dpro_contact_web";
  const hostOk = hosts.includes(String(data?.hostname || ""));

  if (!response.ok || data?.success !== true || !actionOk || !hostOk) {
    console.warn("DPRO_CONTACT_WEB_TURNSTILE_REJECT", {
      httpStatus: response.status,
      success: Boolean(data?.success),
      hostname: String(data?.hostname || ""),
      action: String(data?.action || ""),
      errorCodes: Array.isArray(data?.["error-codes"]) ? data["error-codes"] : [],
    });
    const e = new Error("turnstile_failed");
    e.status = 400;
    throw e;
  }
  return data;
}

async function ensureWebChannel(env) {
  const tenant = tenantCode(env);
  const code = webChannelCode(env);
  const rows = await sb(
    env,
    `/rest/v1/dpro_contact_channels?select=*&tenant_code=eq.${encodeURIComponent(tenant)}` +
    `&channel_code=eq.${encodeURIComponent(code)}&limit=1`
  );
  let channel = rows?.[0];

  if (channel && channel.channel_type !== "web") {
    const e = new Error("web_channel_code_conflicts_with_existing_channel");
    e.status = 409;
    throw e;
  }

  if (!channel) {
    const created = await sb(env, "/rest/v1/dpro_contact_channels", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        tenant_code: tenant,
        system_code: systemCode(env),
        channel_code: code,
        channel_type: "web",
        display_name: webChannelDisplayName(env),
        status: "active",
        settings: {
          moduleVersion: VERSION,
          designVersion: DESIGN_VERSION,
          webExtensionVersion: WEB_EXTENSION_VERSION,
        },
      }),
    });
    channel = created?.[0];
  } else {
    const patch = {};
    if (channel.system_code !== systemCode(env)) patch.system_code = systemCode(env);
    if (channel.display_name !== webChannelDisplayName(env)) patch.display_name = webChannelDisplayName(env);
    if (channel.status !== "active") patch.status = "active";
    if (Object.keys(patch).length) {
      patch.updated_at = new Date().toISOString();
      const updated = await sb(env, `/rest/v1/dpro_contact_channels?id=eq.${encodeURIComponent(channel.id)}`, {
        method: "PATCH",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(patch),
      });
      channel = updated?.[0] || { ...channel, ...patch };
    }
  }

  if (!channel?.id) {
    const e = new Error("web_channel_prepare_failed");
    e.status = 500;
    throw e;
  }
  return channel;
}

function webMessageBody(input) {
  const lines = [
    "【WEB問い合わせ】",
    `お名前: ${input.name}`,
    `店舗名 / 会社名: ${input.company || "未入力"}`,
    `メールアドレス: ${input.email}`,
    `電話番号: ${input.phone || "未入力"}`,
    `業種: ${input.industry || "未入力"}`,
    `相談カテゴリー: ${webCategoryLabel(input.category)}`,
    "",
    "相談内容:",
    input.message,
  ];
  return lines.join("\n");
}

async function handleWebInquiry(request, env) {
  requireFeature(env, "contactEnabled", "contact_disabled");
  requireFeature(env, "webEnabled", "web_disabled");

  const body = await readJson(request);
  const honeypot = cleanWebText(body?.website, 200);
  if (honeypot) {
    return { ok: true, received: true };
  }

  const input = validateWebInquiry(body);
  const providerMessageId = `web:${input.submissionId}`;

  const duplicate = await sb(
    env,
    `/rest/v1/dpro_contact_messages?select=id&provider_message_id=eq.${encodeURIComponent(providerMessageId)}&limit=1`
  );
  if (duplicate?.length) {
    return { ok: true, received: true, duplicate: true, reference: input.submissionId };
  }

  const remoteIp = String(request.headers.get("cf-connecting-ip") || "").trim();

  // Coarse per-IP attempt cap protects the Siteverify endpoint from flooding.
  // It is intentionally much higher than the valid-submission caps below.
  if (remoteIp) {
    await consumeWebRateLimit(env, await identityHash(env, `web-attempt-ip:${remoteIp}`), "attempt");
  }

  await verifyWebTurnstile(env, input.turnstileToken, remoteIp, input.submissionId);

  // Valid-submission quotas are separate, so invalid bot attempts cannot exhaust
  // a customer's email quota.
  if (remoteIp) {
    await consumeWebRateLimit(env, await identityHash(env, `web-ip:${remoteIp}`), "ip");
  }
  await consumeWebRateLimit(env, await identityHash(env, `web-email:${input.email}`), "email");

  const channel = await ensureWebChannel(env);
  const externalId = input.email;
  const userKey = await identityHash(env, `web:${externalId}`);
  const occurredAt = new Date().toISOString();
  // The inbox list stays concise: use company/store name when supplied,
  // otherwise use the person's name. Full contact details remain in the
  // encrypted message body.
  const displayName = input.company || input.name;
  const displayCipher = await encrypt(env, displayName);

  const threadRows = await sb(
    env,
    `/rest/v1/dpro_contact_threads?select=*&channel_id=eq.${encodeURIComponent(channel.id)}` +
    `&external_user_key=eq.${encodeURIComponent(userKey)}&limit=1`
  );
  let thread = threadRows?.[0];

  if (!thread) {
    const inserted = await sb(env, "/rest/v1/dpro_contact_threads", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        channel_id: channel.id,
        external_user_key: userKey,
        external_user_ciphertext: await encrypt(env, externalId),
        profile_name_ciphertext: displayCipher,
        status: "open",
        unread_count: 0,
        metadata: {
          tenantCode: tenantCode(env),
          systemCode: systemCode(env),
          source: "web",
        },
      }),
    });
    thread = inserted?.[0];
  }

  if (!thread?.id) throw new Error("thread_create_failed");

  const messageBody = webMessageBody(input);
  const bodyCipher = await encrypt(env, messageBody);
  const previewCipher = await encrypt(env, input.message);
  const insertedMessage = await sb(env, "/rest/v1/dpro_contact_messages", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      thread_id: thread.id,
      direction: "inbound",
      message_type: "text",
      body_ciphertext: bodyCipher,
      provider_message_id: providerMessageId,
      delivery_status: "received",
      occurred_at: occurredAt,
      metadata: {
        provider: "web",
        formVersion: WEB_EXTENSION_VERSION,
        category: input.category || "other",
        submissionId: input.submissionId,
      },
    }),
  });
  const messageRow = insertedMessage?.[0] || null;

  await sb(env, `/rest/v1/dpro_contact_threads?id=eq.${encodeURIComponent(thread.id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      profile_name_ciphertext: displayCipher,
      unread_count: Number(thread.unread_count || 0) + 1,
      status: thread.status === "spam" ? "spam" : "open",
      last_message_ciphertext: previewCipher,
      last_message_direction: "inbound",
      last_message_type: "text",
      last_message_at: occurredAt,
      last_inbound_at: occurredAt,
      updated_at: occurredAt,
    }),
  });

  await deliveryLog(env, {
    thread_id: thread.id,
    message_id: messageRow?.id || null,
    operation: "web_form_receive",
    success: true,
    provider: "web",
    http_status: 200,
    request_id: input.submissionId,
    metadata: { formVersion: WEB_EXTENSION_VERSION },
  });

  return { ok: true, received: true, reference: input.submissionId };
}

async function tenantChannels(env) {
  const typeFilter = featureState(env).webEnabled
    ? "&channel_type=in.(line,web)"
    : "&channel_type=eq.line";
  const rows = await sb(
    env,
    `/rest/v1/dpro_contact_channels?select=id,channel_type,channel_code,display_name,status` +
    `&tenant_code=eq.${encodeURIComponent(tenantCode(env))}${typeFilter}`
  );
  return rows || [];
}

async function tenantChannelIds(env) {
  return (await tenantChannels(env)).map((row) => String(row.id)).filter(Boolean);
}

function channelFilter(ids) {
  if (!ids.length) return "";
  return `channel_id=in.(${ids.map((id) => encodeURIComponent(id)).join(",")})`;
}


function requireSystemCheckAccess(env, operator) {
  if (!featureState(env).systemCheckEnabled) {
    const e = new Error("system_check_disabled");
    e.status = 403;
    throw e;
  }

  const roles = csvValues(
    value(
      env,
      "CONTACT_SYSTEM_CHECK_ROLES",
      "technical_admin,support,owner_admin"
    )
  );

  if (!roles.includes(String(operator?.roleKey || ""))) {
    const e = new Error("system_check_access_denied");
    e.status = 403;
    throw e;
  }
}

function bearerToken(request) {
  const auth = request.headers.get("authorization") || "";
  return auth.toLowerCase().startsWith("bearer ")
    ? auth.slice(7).trim()
    : "";
}

function envPresence(env) {
  const requiredVariables = [
    "SUPABASE_URL",
    "SUPABASE_PUBLISHABLE_KEY",
    "ALLOWED_ORIGINS",
    "TENANT_CODE",
    "SYSTEM_CODE",
    "LINE_CHANNEL_CODE",
    "CONTACT_AUTH_MODE",
  ];

  const requiredSecrets = [
    "LINE_CHANNEL_SECRET",
    "LINE_CHANNEL_ACCESS_TOKEN",
    "CONTACT_ENCRYPTION_KEY",
  ];

  if (featureState(env).webEnabled) {
    requiredVariables.push(
      "WEB_CHANNEL_CODE",
      "WEB_CHANNEL_DISPLAY_NAME",
      "WEB_FORM_ALLOWED_ORIGINS",
      "WEB_TURNSTILE_SITE_KEY",
      "WEB_TURNSTILE_HOSTNAMES"
    );
    requiredSecrets.push("WEB_TURNSTILE_SECRET_KEY");
  }

  if (featureState(env).webEmailReplyEnabled) {
    requiredVariables.push(
      "WEB_EMAIL_FROM_ADDRESS",
      "WEB_EMAIL_FROM_NAME"
    );
    requiredSecrets.push("RESEND_API_KEY");
  }

  if (featureState(env).webEmailInboundEnabled) {
    requiredVariables.push(
      "WEB_EMAIL_INBOUND_ENABLED",
      "WEB_EMAIL_FORWARD_TO"
    );
  }

  const variables = Object.fromEntries(
    requiredVariables.map((key) => [key, Boolean(value(env, key))])
  );

  const secrets = Object.fromEntries(
    requiredSecrets.map((key) => [key, Boolean(value(env, key))])
  );

  secrets.SUPABASE_SECRET_KEY = Boolean(
    value(env, "SUPABASE_SECRET_KEY") ||
    value(env, "SUPABASE_SERVICE_ROLE_KEY")
  );

  return { variables, secrets };
}

async function directTableAccessCheck(env, userToken = "") {
  const url =
    `${value(env, "SUPABASE_URL").replace(/\/$/, "")}` +
    "/rest/v1/dpro_contact_threads?select=id&limit=1";

  const headers = {
    apikey: value(env, "SUPABASE_PUBLISHABLE_KEY"),
    accept: "application/json",
  };

  if (userToken) headers.authorization = `Bearer ${userToken}`;

  const response = await fetch(url, {
    method: "GET",
    headers,
    cache: "no-store",
  });

  const text = await response.text().catch(() => "");
  return {
    blocked: response.status === 401 || response.status === 403,
    httpStatus: response.status,
    responseSample: text ? text.slice(0, 160) : "",
  };
}

async function databaseSystemCheck(env) {
  const result = await sb(env, "/rest/v1/rpc/dpro_contact_system_check", {
    method: "POST",
    body: "{}",
  });

  const data = Array.isArray(result) ? result[0] : result;
  return data || {};
}

async function channelSystemCheck(env) {
  const rows = await sb(
    env,
    `/rest/v1/dpro_contact_channels?select=id,tenant_code,system_code,channel_code,display_name,status,` +
    `provider_destination,last_webhook_at,last_error_at,last_error_code,updated_at` +
    `&tenant_code=eq.${encodeURIComponent(tenantCode(env))}` +
    `&channel_code=eq.${encodeURIComponent(channelCode(env))}&limit=1`
  );

  const channel = rows?.[0] || null;
  if (!channel) {
    return {
      exists: false,
      status: "missing",
      webhookState: "never",
      lastWebhookAt: null,
      lastErrorAt: null,
      lastErrorCode: null,
    };
  }

  const lastWebhookAt = channel.last_webhook_at || null;
  let webhookState = "never";
  let webhookAgeMinutes = null;

  if (lastWebhookAt) {
    webhookAgeMinutes = Math.max(
      0,
      Math.floor((Date.now() - new Date(lastWebhookAt).getTime()) / 60000)
    );
    webhookState = webhookAgeMinutes <= 1440 ? "recent" : "stale";
  }

  return {
    exists: true,
    id: channel.id,
    tenantCode: channel.tenant_code,
    systemCode: channel.system_code,
    channelCode: channel.channel_code,
    displayName: channel.display_name,
    status: channel.status,
    destinationKnown: Boolean(channel.provider_destination),
    lastWebhookAt,
    webhookAgeMinutes,
    webhookState,
    lastErrorAt: channel.last_error_at || null,
    lastErrorCode: channel.last_error_code || null,
    updatedAt: channel.updated_at || null,
  };
}

async function lineCredentialCheck(env) {
  if (!featureState(env).lineEnabled) {
    return {
      checked: false,
      ok: true,
      skipped: true,
      reason: "line_disabled",
    };
  }

  try {
    const data = await lineApi(env, "/v2/bot/info", { method: "GET" });
    return {
      checked: true,
      ok: true,
      skipped: false,
      displayName: String(data?.displayName || ""),
      basicId: String(data?.basicId || ""),
      premiumId: String(data?.premiumId || ""),
    };
  } catch (error) {
    return {
      checked: true,
      ok: false,
      skipped: false,
      error: String(error?.message || error),
      httpStatus: Number(error?.upstreamStatus || error?.status || 0),
    };
  }
}

async function encryptionSelfCheck(env) {
  try {
    const sample = `DPRO_CONTACT_SYSTEM_CHECK:${crypto.randomUUID()}`;
    const ciphertext = await encrypt(env, sample);
    const restored = await decrypt(env, ciphertext);
    return {
      ok: restored === sample,
      cipherVersion: String(ciphertext).split(".")[0] || "",
    };
  } catch (error) {
    return {
      ok: false,
      error: String(error?.message || error),
    };
  }
}

async function deliverySystemCheck(env) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const rows = await sb(
    env,
    `/rest/v1/dpro_contact_delivery_logs?select=id,operation,http_status,error_code,error_message,created_at` +
    `&success=eq.false&created_at=gte.${encodeURIComponent(since)}` +
    `&order=created_at.desc&limit=20`
  );

  return {
    failedLast24h: Array.isArray(rows) ? rows.length : 0,
    recentFailures: (rows || []).map((row) => ({
      operation: row.operation,
      httpStatus: row.http_status,
      errorCode: row.error_code,
      errorMessage: row.error_message,
      createdAt: row.created_at,
    })),
  };
}

function tableSecurityPass(dbCheck) {
  const tables = Array.isArray(dbCheck?.tables) ? dbCheck.tables : [];
  const expected = [
    "dpro_contact_module_meta",
    "dpro_contact_channels",
    "dpro_contact_threads",
    "dpro_contact_messages",
    "dpro_contact_delivery_logs",
    "dpro_contact_web_rate_limits",
  ];

  return expected.every((name) => {
    const row = tables.find((t) => t?.tableName === name);
    return Boolean(
      row &&
      row.rlsEnabled === true &&
      row.anonSelect === false &&
      row.authenticatedSelect === false &&
      row.serviceRoleSelect === true
    );
  });
}

async function runSystemCheck(request, env, operator) {
  const userToken = bearerToken(request);

  const [
    dbCheck,
    channelCheck,
    anonAccess,
    authenticatedAccess,
    encryptionCheck,
    lineCheck,
    deliveryCheck,
  ] = await Promise.all([
    databaseSystemCheck(env).catch((error) => ({ ok: false, error: String(error?.message || error) })),
    channelSystemCheck(env).catch((error) => ({ exists: false, error: String(error?.message || error) })),
    directTableAccessCheck(env).catch((error) => ({ blocked: false, error: String(error?.message || error) })),
    directTableAccessCheck(env, userToken).catch((error) => ({ blocked: false, error: String(error?.message || error) })),
    encryptionSelfCheck(env),
    lineCredentialCheck(env),
    deliverySystemCheck(env).catch((error) => ({ failedLast24h: null, error: String(error?.message || error) })),
  ]);

  const envCheck = envPresence(env);
  const allVarsPresent = Object.values(envCheck.variables).every(Boolean);
  const allSecretsPresent = Object.values(envCheck.secrets).every(Boolean);
  const explicitCors =
    allowedOrigins(env).length > 0 &&
    !allowedOrigins(env).includes("*");

  const dbVersionOk =
    dbCheck?.meta?.moduleVersion === DB_VERSION &&
    dbCheck?.meta?.designVersion === DESIGN_VERSION;

  const checks = {
    workerVersion: true,
    databaseVersion: dbVersionOk,
    tableSecurity: tableSecurityPass(dbCheck),
    anonDirectAccessBlocked: anonAccess.blocked === true,
    authenticatedDirectAccessBlocked: authenticatedAccess.blocked === true,
    environmentComplete: allVarsPresent && allSecretsPresent,
    corsExplicit: explicitCors,
    encryptionRoundTrip: encryptionCheck.ok === true,
    channelExists: channelCheck.exists === true,
    lineCredential: lineCheck.ok === true,
  };

  const criticalPass = Object.values(checks).every(Boolean);

  const warnings = [];
  if (channelCheck.webhookState === "never") {
    warnings.push("LINE Webhookの実受信履歴がまだありません。");
  } else if (channelCheck.webhookState === "stale") {
    warnings.push("LINE Webhookの最終受信が24時間以上前です。");
  }
  if (Number(deliveryCheck.failedLast24h || 0) > 0) {
    warnings.push(`直近24時間に送信失敗が${deliveryCheck.failedLast24h}件あります。`);
  }

  return {
    ok: criticalPass,
    service: "DPRO CONTACT SYSTEM CHECK",
    systemCheckVersion: "DPRO-CONTACT-1-SYSTEM-CHECK-20260814-WEB-R1",
    worker: {
      service: "DPRO CONTACT API",
      version: VERSION,
      expectedDatabaseVersion: DB_VERSION,
      designVersion: DESIGN_VERSION,
    },
    operator: {
      staffKey: operator?.staffKey || null,
      roleKey: operator?.roleKey || null,
      displayName: operator?.displayName || "",
    },
    tenant: {
      tenantCode: tenantCode(env),
      systemCode: systemCode(env),
      channelCode: channelCode(env),
    },
    features: featureState(env),
    checks,
    environment: envCheck,
    database: dbCheck,
    channel: channelCheck,
    directAccess: {
      anon: anonAccess,
      authenticated: authenticatedAccess,
    },
    encryption: encryptionCheck,
    line: lineCheck,
    delivery: deliveryCheck,
    cors: {
      explicit: explicitCors,
      origins: allowedOrigins(env),
      webOrigins: featureState(env).webEnabled ? webAllowedOrigins(env) : [],
    },
    warnings,
    checkedAt: new Date().toISOString(),
  };
}

async function contactSummary(env) {
  const ids = await tenantChannelIds(env);
  if (!ids.length) {
    return {
      ok: true,
      unread: 0,
      openThreads: 0,
      closedThreads: 0,
      todayThreads: 0,
    };
  }

  const rows = await sb(
    env,
    `/rest/v1/dpro_contact_threads?select=status,unread_count,last_message_at&${channelFilter(ids)}`
  );

  const today = dateKeyInTimezone(new Date(), value(env, "TIMEZONE", "Asia/Tokyo"));

  return {
    ok: true,
    unread: (rows || []).reduce((n, t) => n + Number(t.unread_count || 0), 0),
    openThreads: (rows || []).filter((t) => t.status === "open").length,
    closedThreads: (rows || []).filter((t) => t.status === "closed").length,
    todayThreads: (rows || []).filter(
      (t) =>
        t.last_message_at &&
        dateKeyInTimezone(new Date(t.last_message_at), value(env, "TIMEZONE", "Asia/Tokyo")) === today
    ).length,
  };
}

async function listThreads(env, url) {
  const channels = await tenantChannels(env);
  const ids = channels.map((row) => String(row.id)).filter(Boolean);
  if (!ids.length) return { ok: true, threads: [] };
  const channelMap = new Map(channels.map((row) => [String(row.id), row]));

  const status = String(url.searchParams.get("status") || "all");
  const unreadOnly = url.searchParams.get("unread") === "1";
  const requestedLimit = Number(url.searchParams.get("limit") || MAX_THREAD_LIMIT);
  const limit = Math.max(1, Math.min(MAX_THREAD_LIMIT, Number.isFinite(requestedLimit) ? requestedLimit : MAX_THREAD_LIMIT));

  let path =
    `/rest/v1/dpro_contact_threads?select=*&${channelFilter(ids)}` +
    `&order=last_message_at.desc.nullslast&limit=${limit}`;

  if (["open", "closed", "spam"].includes(status)) {
    path += `&status=eq.${encodeURIComponent(status)}`;
  }

  if (unreadOnly) {
    path += "&unread_count=gt.0";
  }

  const rows = await sb(env, path);
  const result = [];

  for (const row of rows || []) {
    const channel = channelMap.get(String(row.channel_id)) || {};
    result.push({
      id: row.id,
      status: row.status,
      channelType: channel.channel_type || "line",
      channelCode: channel.channel_code || "",
      channelName: channel.display_name || "",
      unreadCount: Number(row.unread_count || 0),
      assignedStaffId: row.assigned_staff_key || null,
      assignedStaffKey: row.assigned_staff_key || null,
      displayName: row.profile_name_ciphertext
        ? await decrypt(env, row.profile_name_ciphertext).catch(() => "")
        : "",
      userKey: String(row.external_user_key || "").slice(0, 10),
      lastMessage: row.last_message_ciphertext
        ? await decrypt(env, row.last_message_ciphertext).catch(() => "【復号できません】")
        : "",
      lastMessageDirection: row.last_message_direction || null,
      lastMessageType: row.last_message_type || null,
      lastMessageAt: row.last_message_at || null,
      lastInboundAt: row.last_inbound_at || null,
      lastOutboundAt: row.last_outbound_at || null,
    });
  }

  return { ok: true, threads: result };
}

async function listMessages(env, threadId) {
  await assertTenantThread(env, threadId);

  const rows = await sb(
    env,
    `/rest/v1/dpro_contact_messages?select=id,direction,message_type,body_ciphertext,` +
    `sent_by_staff_key,delivery_status,occurred_at,metadata` +
    `&thread_id=eq.${encodeURIComponent(threadId)}` +
    `&order=occurred_at.asc&limit=${MAX_MESSAGE_LIMIT}`
  );

  const attachmentMap = new Map();
  if (featureState(env).attachmentsEnabled) {
    const attachmentRows = await sb(
      env,
      `/rest/v1/dpro_contact_attachments?select=id,message_id,direction,channel_type,` +
      `file_name_ciphertext,content_type,size_bytes,status,metadata,created_at` +
      `&thread_id=eq.${encodeURIComponent(threadId)}` +
      `&order=created_at.asc&limit=${MAX_MESSAGE_LIMIT}`
    );

    for (const row of attachmentRows || []) {
      const key = String(row.message_id || "");
      if (!key) continue;
      const item = await attachmentViewModel(env, row);
      const list = attachmentMap.get(key) || [];
      list.push(item);
      attachmentMap.set(key, list);
    }
  }

  const messages = [];

  for (const row of rows || []) {
    messages.push({
      id: row.id,
      direction: row.direction,
      messageType: row.message_type,
      body: await decrypt(env, row.body_ciphertext).catch(() => "【復号できません】"),
      sentByStaffId: row.sent_by_staff_key || null,
      sentByStaffKey: row.sent_by_staff_key || null,
      deliveryStatus: row.delivery_status,
      occurredAt: row.occurred_at,
      metadata: row.metadata || {},
      attachments: attachmentMap.get(String(row.id)) || [],
    });
  }

  return { ok: true, messages };
}

async function assertTenantThread(env, threadId) {
  const rows = await sb(
    env,
    `/rest/v1/dpro_contact_threads?select=*&id=eq.${encodeURIComponent(threadId)}&limit=1`
  );

  const thread = rows?.[0];

  if (!thread) {
    const e = new Error("thread_not_found");
    e.status = 404;
    throw e;
  }

  const channels = await sb(
    env,
    `/rest/v1/dpro_contact_channels?select=id,channel_type,channel_code,display_name&` +
    `id=eq.${encodeURIComponent(thread.channel_id)}` +
    `&tenant_code=eq.${encodeURIComponent(tenantCode(env))}&limit=1`
  );

  if (!channels?.[0]?.id) {
    const e = new Error("thread_not_found");
    e.status = 404;
    throw e;
  }

  return { ...thread, _channel: channels[0] };
}

async function markRead(env, threadId, operator) {
  await assertTenantThread(env, threadId);

  await sb(
    env,
    `/rest/v1/dpro_contact_threads?id=eq.${encodeURIComponent(threadId)}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        unread_count: 0,
        updated_at: new Date().toISOString(),
      }),
    }
  );

  return {
    ok: true,
    threadId,
    readBy: operator.staffKey,
  };
}

async function setThreadStatus(env, threadId, body, operator) {
  const status = String(body?.status || "");

  if (!["open", "closed", "spam"].includes(status)) {
    const e = new Error("invalid_status");
    e.status = 400;
    throw e;
  }

  await assertTenantThread(env, threadId);

  await sb(
    env,
    `/rest/v1/dpro_contact_threads?id=eq.${encodeURIComponent(threadId)}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        status,
        updated_at: new Date().toISOString(),
      }),
    }
  );

  return {
    ok: true,
    threadId,
    status,
    updatedBy: operator.staffKey,
  };
}

async function sendReply(env, threadId, body, operator) {
  const text = String(body?.text || "").trim();

  if (!text || text.length > MAX_REPLY_CHARS) {
    const e = new Error("reply_text_must_be_1_to_5000_chars");
    e.status = 400;
    throw e;
  }

  const thread = await assertTenantThread(env, threadId);
  if (String(thread?._channel?.channel_type || "line") !== "line") {
    const e = new Error("reply_not_supported_for_channel");
    e.status = 409;
    throw e;
  }
  const userId = await decrypt(env, thread.external_user_ciphertext);
  const occurredAt = new Date().toISOString();
  const cipher = await encrypt(env, text);

  let messageRow = null;

  try {
    const lineResult = await lineApi(env, "/v2/bot/message/push", {
      method: "POST",
      body: JSON.stringify({
        to: userId,
        messages: [{ type: "text", text }],
      }),
    });

    const providerMessageId =
      lineResult?.sentMessages?.[0]?.id
        ? String(lineResult.sentMessages[0].id)
        : null;

    const inserted = await sb(env, "/rest/v1/dpro_contact_messages", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        thread_id: threadId,
        direction: "outbound",
        message_type: "text",
        body_ciphertext: cipher,
        provider_message_id: providerMessageId,
        sent_by_staff_key: operator.staffKey,
        delivery_status: "sent",
        occurred_at: occurredAt,
        metadata: {
          provider: "line",
          transport: "line_push",
          operatorRole: operator.roleKey,
        },
      }),
    });

    messageRow = inserted?.[0] || null;

    await sb(
      env,
      `/rest/v1/dpro_contact_threads?id=eq.${encodeURIComponent(threadId)}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          unread_count: 0,
          status: thread.status === "spam" ? "spam" : "open",
          last_message_ciphertext: cipher,
          last_message_direction: "outbound",
          last_message_type: "text",
          last_message_at: occurredAt,
          last_outbound_at: occurredAt,
          updated_at: occurredAt,
        }),
      }
    );

    await deliveryLog(env, {
      thread_id: threadId,
      message_id: messageRow?.id || null,
      operation: "line_push_reply",
      success: true,
      provider: "line",
      http_status: 200,
      request_id: lineResult?.sentMessages?.[0]?.id || null,
      metadata: {
        staffKey: operator.staffKey,
        roleKey: operator.roleKey,
      },
    });

    return {
      ok: true,
      sentAt: occurredAt,
      transport: "line_push",
    };
  } catch (error) {
    await deliveryLog(env, {
      thread_id: threadId,
      message_id: messageRow?.id || null,
      operation: "line_push_reply",
      success: false,
      provider: "line",
      http_status: Number(error?.upstreamStatus || error?.status || 500),
      error_code: String(error?.code || ""),
      error_message: String(error?.message || error).slice(0, 500),
      metadata: {
        staffKey: operator.staffKey,
        roleKey: operator.roleKey,
      },
    }).catch(() => {});

    throw error;
  }
}



// ============================================================
// DPRO CONTACT ATTACHMENTS R6
// Private Supabase Storage + LINE / WEB mail transport.
// The feature is staged behind CONTACT_ATTACHMENTS_ENABLED.
// ============================================================

function attachmentLinkTtlSeconds(env) {
  const requested = Number(value(env, "CONTACT_ATTACHMENT_LINK_TTL_SECONDS", DEFAULT_ATTACHMENT_LINK_TTL_SECONDS));
  if (!Number.isFinite(requested)) return DEFAULT_ATTACHMENT_LINK_TTL_SECONDS;
  return Math.max(3600, Math.min(30 * 24 * 60 * 60, Math.floor(requested)));
}

function supabaseAdminKey(env) {
  const key = value(env, "SUPABASE_SECRET_KEY") || value(env, "SUPABASE_SERVICE_ROLE_KEY");
  if (!key) {
    const e = new Error("missing_supabase_admin_key");
    e.status = 503;
    throw e;
  }
  return key;
}

function storageAuthHeaders(env, extra = {}) {
  const key = supabaseAdminKey(env);
  return {
    apikey: key,
    ...(key.startsWith("sb_secret_") ? {} : { authorization: `Bearer ${key}` }),
    ...extra,
  };
}

function storageObjectUrl(env, kind, bucket, storagePath) {
  const base = value(env, "SUPABASE_URL").replace(/\/$/, "");
  const safeBucket = encodeURIComponent(String(bucket || ""));
  const safePath = String(storagePath || "")
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  return `${base}/storage/v1/${kind}/${safeBucket}/${safePath}`;
}

async function storageUpload(env, storagePath, bytes, contentType) {
  const response = await fetch(
    storageObjectUrl(env, "object", ATTACHMENT_BUCKET, storagePath),
    {
      method: "POST",
      headers: storageAuthHeaders(env, {
        "content-type": String(contentType || "application/octet-stream"),
        "x-upsert": "false",
        "cache-control": "3600",
      }),
      body: bytes,
    }
  );

  const bodyText = await response.text().catch(() => "");
  if (!response.ok) {
    const data = bodyText ? safeJson(bodyText) : {};
    const e = new Error(
      data?.message ||
      data?.error ||
      data?.statusCode ||
      `storage_upload_${response.status}`
    );
    e.status = response.status === 413 ? 413 : 500;
    e.upstreamStatus = response.status;
    throw e;
  }
}

async function storageDownload(env, bucket, storagePath) {
  const response = await fetch(
    storageObjectUrl(env, "object/authenticated", bucket, storagePath),
    {
      method: "GET",
      headers: storageAuthHeaders(env),
      cache: "no-store",
    }
  );

  if (!response.ok) {
    const bodyText = await response.text().catch(() => "");
    const data = bodyText ? safeJson(bodyText) : {};
    const e = new Error(
      data?.message ||
      data?.error ||
      `storage_download_${response.status}`
    );
    e.status = response.status === 404 ? 404 : 500;
    e.upstreamStatus = response.status;
    throw e;
  }

  return response;
}

async function sha256Hex(bytes) {
  const source = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const digest = await crypto.subtle.digest("SHA-256", source);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function safeAttachmentFileName(input, fallback = "attachment") {
  const name = String(input || "")
    .replace(/[\r\n\0]/g, " ")
    .replace(/[\\/:*?"<>|]/g, "_")
    .trim()
    .slice(0, 180);
  return name || fallback;
}

function extensionForContentType(contentType) {
  const type = String(contentType || "").split(";")[0].trim().toLowerCase();
  const map = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "application/pdf": ".pdf",
    "text/plain": ".txt",
    "text/csv": ".csv",
    "application/zip": ".zip",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
    "application/msword": ".doc",
    "application/vnd.ms-excel": ".xls",
    "application/vnd.ms-powerpoint": ".ppt",
  };
  return map[type] || "";
}

function attachmentMimeType(file) {
  return String(file?.type || "application/octet-stream")
    .split(";")[0]
    .trim()
    .toLowerCase() || "application/octet-stream";
}

function rejectDangerousAttachment(fileName, contentType) {
  const lower = String(fileName || "").toLowerCase();
  const blockedExtensions = [
    ".exe", ".com", ".bat", ".cmd", ".scr", ".msi", ".ps1", ".vbs",
    ".js", ".jse", ".jar", ".apk", ".dmg", ".iso", ".sh", ".command",
  ];
  const blockedTypes = [
    "application/x-msdownload",
    "application/x-msdos-program",
    "application/x-sh",
    "application/x-executable",
  ];

  if (blockedExtensions.some((ext) => lower.endsWith(ext)) || blockedTypes.includes(String(contentType || "").toLowerCase())) {
    const e = new Error("attachment_file_type_not_allowed");
    e.status = 400;
    throw e;
  }
}


async function createStoredAttachment(env, {
  threadId,
  messageId = null,
  direction,
  channelType,
  provider,
  providerAttachmentId = null,
  fileName,
  contentType,
  bytes,
  staffKey = null,
  metadata = {},
}) {
  const source = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (!source.byteLength || source.byteLength > MAX_ATTACHMENT_BYTES) {
    const e = new Error(source.byteLength ? "attachment_too_large" : "attachment_empty");
    e.status = source.byteLength ? 413 : 400;
    throw e;
  }

  const safeName = safeAttachmentFileName(
    fileName,
    `attachment${extensionForContentType(contentType)}`
  );
  rejectDangerousAttachment(safeName, contentType);

  const attachmentId = crypto.randomUUID();
  const safeTenant = String(tenantCode(env) || "tenant")
    .replace(/[^A-Za-z0-9_-]/g, "_")
    .slice(0, 80);
  const storagePath = `${safeTenant}/${String(threadId).toLowerCase()}/${attachmentId}`;
  const digest = await sha256Hex(source);

  await storageUpload(env, storagePath, source, contentType);

  try {
    const inserted = await sb(env, "/rest/v1/dpro_contact_attachments", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        id: attachmentId,
        thread_id: threadId,
        message_id: messageId,
        direction,
        channel_type: channelType,
        provider,
        provider_attachment_id: providerAttachmentId,
        file_name_ciphertext: await encrypt(env, safeName),
        content_type: String(contentType || "application/octet-stream").slice(0, 200),
        size_bytes: source.byteLength,
        sha256: digest,
        storage_bucket: ATTACHMENT_BUCKET,
        storage_path: storagePath,
        status: "stored",
        created_by_staff_key: staffKey,
        metadata: {
          attachmentExtensionVersion: ATTACHMENT_EXTENSION_VERSION,
          ...metadata,
        },
      }),
    });

    return inserted?.[0] || {
      id: attachmentId,
      thread_id: threadId,
      message_id: messageId,
      file_name_ciphertext: await encrypt(env, safeName),
      content_type: contentType,
      size_bytes: source.byteLength,
      storage_bucket: ATTACHMENT_BUCKET,
      storage_path: storagePath,
      status: "stored",
    };
  } catch (error) {
    console.error("DPRO_CONTACT_ATTACHMENT_DB_INSERT_ERROR", String(error?.message || error));
    throw error;
  }
}

async function attachmentViewModel(env, row) {
  const name = row?.file_name_ciphertext
    ? await decrypt(env, row.file_name_ciphertext).catch(() => "attachment")
    : "attachment";
  const contentType = String(row?.content_type || "application/octet-stream");
  return {
    id: row.id,
    name,
    contentType,
    sizeBytes: Number(row?.size_bytes || 0),
    status: String(row?.status || "stored"),
    direction: String(row?.direction || ""),
    channelType: String(row?.channel_type || ""),
    image: /^image\/(jpeg|png|webp|gif)$/i.test(contentType),
    downloadable: ["stored", "sent"].includes(String(row?.status || "")),
    createdAt: row?.created_at || null,
    metadata: row?.metadata || {},
  };
}

async function getAttachmentRow(env, attachmentId) {
  const rows = await sb(
    env,
    `/rest/v1/dpro_contact_attachments?select=*&id=eq.${encodeURIComponent(attachmentId)}&limit=1`
  );
  const row = rows?.[0] || null;
  if (!row) {
    const e = new Error("attachment_not_found");
    e.status = 404;
    throw e;
  }
  await assertTenantThread(env, row.thread_id);
  return row;
}

function attachmentContentDisposition(fileName, inline = false) {
  const safe = safeAttachmentFileName(fileName, "attachment").replace(/"/g, "");
  const ascii = safe.replace(/[^\x20-\x7E]/g, "_").slice(0, 120) || "attachment";
  return `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}

async function serveAuthenticatedAttachment(request, env, attachmentId) {
  const row = await getAttachmentRow(env, attachmentId);
  if (!["stored", "sent"].includes(String(row.status || ""))) {
    const e = new Error("attachment_unavailable");
    e.status = 409;
    throw e;
  }

  const name = await decrypt(env, row.file_name_ciphertext).catch(() => "attachment");
  const stored = await storageDownload(env, row.storage_bucket, row.storage_path);
  const wantsDownload = new URL(request.url).searchParams.get("download") === "1";
  const headers = new Headers(stored.headers);
  headers.set("content-type", row.content_type || "application/octet-stream");
  headers.set(
    "content-disposition",
    attachmentContentDisposition(name, !wantsDownload && /^image\//i.test(row.content_type || ""))
  );
  headers.set("cache-control", "private, no-store");
  headers.set("x-content-type-options", "nosniff");

  return new Response(stored.body, {
    status: 200,
    headers,
  });
}

function base64Url(buffer) {
  return base64(buffer)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function attachmentLinkSignature(env, attachmentId, expiresAt) {
  const key = await deriveHmacKey(
    `ATTACHMENT_LINK:${value(env, "CONTACT_ENCRYPTION_KEY")}`
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${String(attachmentId).toLowerCase()}|${Number(expiresAt)}`)
  );
  return base64Url(sig);
}

async function publicAttachmentUrl(env, origin, attachmentId) {
  const expiresAt = Math.floor(Date.now() / 1000) + attachmentLinkTtlSeconds(env);
  const token = await attachmentLinkSignature(env, attachmentId, expiresAt);
  return `${String(origin).replace(/\/$/, "")}/api/public/contact/attachments/${encodeURIComponent(attachmentId)}` +
    `?e=${expiresAt}&t=${encodeURIComponent(token)}`;
}

async function servePublicAttachment(request, env, attachmentId) {
  const url = new URL(request.url);
  const expiresAt = Number(url.searchParams.get("e") || 0);
  const token = String(url.searchParams.get("t") || "");
  const now = Math.floor(Date.now() / 1000);

  if (!Number.isFinite(expiresAt) || expiresAt < now || expiresAt > now + (31 * 24 * 60 * 60) || !token) {
    return json({ ok: false, error: "attachment_link_expired" }, 403);
  }

  const expected = await attachmentLinkSignature(env, attachmentId, expiresAt);
  if (!timingSafeEqual(token, expected)) {
    return json({ ok: false, error: "attachment_link_invalid" }, 403);
  }

  const row = await getAttachmentRow(env, attachmentId);
  if (
    String(row.direction || "") !== "outbound" ||
    String(row.channel_type || "") !== "line" ||
    !["stored", "sent"].includes(String(row.status || ""))
  ) {
    return json({ ok: false, error: "attachment_not_public" }, 403);
  }

  const name = await decrypt(env, row.file_name_ciphertext).catch(() => "attachment");
  const stored = await storageDownload(env, row.storage_bucket, row.storage_path);
  const contentType = row.content_type || "application/octet-stream";
  const headers = new Headers(stored.headers);
  headers.set("content-type", contentType);
  headers.set(
    "content-disposition",
    attachmentContentDisposition(name, /^image\/(jpeg|png)$/i.test(contentType))
  );
  headers.set("cache-control", "private, no-store");
  headers.set("x-content-type-options", "nosniff");

  return new Response(stored.body, { status: 200, headers });
}

async function captureLineInboundAttachment(env, threadId, messageId, message) {
  const providerMessageId = String(message?.id || "");
  if (!providerMessageId) return { ok: false, skipped: true, reason: "no_message_id" };

  if (message?.contentProvider?.type && message.contentProvider.type !== "line") {
    return { ok: false, skipped: true, reason: "external_content_provider" };
  }

  const declaredSize = Number(message?.fileSize || 0);
  if (declaredSize > MAX_ATTACHMENT_BYTES) {
    return { ok: false, skipped: true, reason: "attachment_too_large" };
  }

  const response = await fetch(
    `https://api-data.line.me/v2/bot/message/${encodeURIComponent(providerMessageId)}/content`,
    {
      method: "GET",
      headers: {
        authorization: `Bearer ${value(env, "LINE_CHANNEL_ACCESS_TOKEN")}`,
      },
      cache: "no-store",
    }
  );

  if (response.status === 202) {
    return { ok: false, skipped: true, reason: "line_content_processing" };
  }

  if (!response.ok) {
    const e = new Error(`line_content_${response.status}`);
    e.status = response.status >= 500 ? 502 : 400;
    e.upstreamStatus = response.status;
    throw e;
  }

  const headerSize = Number(response.headers.get("content-length") || 0);
  if (headerSize > MAX_ATTACHMENT_BYTES) {
    return { ok: false, skipped: true, reason: "attachment_too_large" };
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > MAX_ATTACHMENT_BYTES) {
    return { ok: false, skipped: true, reason: "attachment_too_large" };
  }

  const contentType = String(
    response.headers.get("content-type") ||
    (message?.type === "image" ? "image/jpeg" : "application/octet-stream")
  ).split(";")[0].trim().toLowerCase();

  const fallbackName = `LINE_${String(message?.type || "file")}_${providerMessageId}${extensionForContentType(contentType)}`;
  const row = await createStoredAttachment(env, {
    threadId,
    messageId,
    direction: "inbound",
    channelType: "line",
    provider: "line",
    providerAttachmentId: providerMessageId,
    fileName: message?.fileName || fallbackName,
    contentType,
    bytes,
    metadata: {
      lineMessageType: String(message?.type || ""),
      lineContentProvider: String(message?.contentProvider?.type || "line"),
    },
  });

  await deliveryLog(env, {
    thread_id: threadId,
    message_id: messageId,
    operation: "line_attachment_receive",
    success: true,
    provider: "line",
    http_status: 200,
    request_id: providerMessageId,
    metadata: {
      attachmentId: row?.id || null,
      sizeBytes: bytes.byteLength,
      contentType,
    },
  }).catch(() => {});

  return { ok: true, attachmentId: row?.id || null };
}

function isFileLike(value) {
  return Boolean(
    value &&
    typeof value === "object" &&
    typeof value.arrayBuffer === "function" &&
    typeof value.size === "number"
  );
}

async function attachmentFormInput(request) {
  const contentType = String(request.headers.get("content-type") || "");
  if (!contentType.toLowerCase().startsWith("multipart/form-data")) {
    const e = new Error("multipart_form_data_required");
    e.status = 400;
    throw e;
  }

  const form = await request.formData();
  const textValue = String(form.get("text") || "").trim();
  const clientRequestId = validateClientRequestId(form.get("clientRequestId"));
  const files = form.getAll("files").filter(isFileLike);

  if (textValue.length > MAX_REPLY_CHARS) {
    const e = new Error("reply_text_too_long");
    e.status = 400;
    throw e;
  }

  if (!files.length || files.length > MAX_ATTACHMENT_COUNT) {
    const e = new Error("attachment_count_must_be_1_to_3");
    e.status = 400;
    throw e;
  }

  let total = 0;
  for (const file of files) {
    const fileName = safeAttachmentFileName(file.name, "attachment");
    const contentTypeValue = attachmentMimeType(file);
    if (!file.size || file.size > MAX_ATTACHMENT_BYTES) {
      const e = new Error(file.size ? "attachment_too_large" : "attachment_empty");
      e.status = file.size ? 413 : 400;
      throw e;
    }
    rejectDangerousAttachment(fileName, contentTypeValue);
    total += file.size;
  }

  if (total > MAX_ATTACHMENT_TOTAL_BYTES) {
    const e = new Error("attachments_total_too_large");
    e.status = 413;
    throw e;
  }

  return { text: textValue, clientRequestId, files };
}

async function markAttachmentRows(env, attachmentIds, patch) {
  for (const id of attachmentIds) {
    await sb(
      env,
      `/rest/v1/dpro_contact_attachments?id=eq.${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify(patch),
      }
    ).catch(() => {});
  }
}

async function sendAttachmentBatch(request, env, threadId, operator, origin) {
  const input = await attachmentFormInput(request);
  const thread = await assertTenantThread(env, threadId);
  const channelType = String(thread?._channel?.channel_type || "line");
  if (!["line", "web"].includes(channelType)) {
    const e = new Error("attachment_not_supported_for_channel");
    e.status = 409;
    throw e;
  }

  if (channelType === "line") {
    requireFeature(env, "lineEnabled", "line_feature_disabled");
    requireFeature(env, "lineReplyEnabled", "line_reply_disabled");
  } else {
    requireFeature(env, "webEnabled", "web_feature_disabled");
    validateWebEmailReplyEnv(env);
  }

  const syntheticProviderId = `attachment-batch:${channelType}:${threadId}:${input.clientRequestId}`;
  const existing = await sb(
    env,
    `/rest/v1/dpro_contact_messages?select=id,delivery_status,metadata&provider_message_id=eq.${encodeURIComponent(syntheticProviderId)}&limit=1`
  );
  if (existing?.[0]) {
    if (existing[0].delivery_status === "sent") {
      return {
        ok: true,
        duplicate: true,
        transport: channelType === "web" ? "email_resend" : "line_push",
        sentAt: existing[0]?.metadata?.sentAt || null,
      };
    }
    const e = new Error("attachment_request_already_exists");
    e.status = 409;
    throw e;
  }

  const storedRows = [];
  try {
    for (const file of input.files) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const row = await createStoredAttachment(env, {
        threadId,
        messageId: null,
        direction: "outbound",
        channelType,
        provider: channelType === "web" ? "resend" : "line",
        providerAttachmentId: `${input.clientRequestId}:${storedRows.length + 1}`,
        fileName: file.name,
        contentType: attachmentMimeType(file),
        bytes,
        staffKey: operator.staffKey,
        metadata: {
          clientRequestId: input.clientRequestId,
          operatorRole: operator.roleKey,
        },
      });
      storedRows.push({ row, bytes, fileName: safeAttachmentFileName(file.name), contentType: attachmentMimeType(file) });
    }

    if (channelType === "web") {
      return await sendWebAttachmentBatch(
        env,
        thread,
        threadId,
        input,
        operator,
        syntheticProviderId,
        storedRows
      );
    }

    return await sendLineAttachmentBatch(
      env,
      thread,
      threadId,
      input,
      operator,
      syntheticProviderId,
      storedRows,
      origin
    );
  } catch (error) {
    await markAttachmentRows(
      env,
      storedRows.map((item) => item.row?.id).filter(Boolean),
      {
        status: "failed",
        metadata: {
          failedAt: new Date().toISOString(),
          clientRequestId: input.clientRequestId,
          error: String(error?.message || error).slice(0, 300),
        },
      }
    );
    throw error;
  }
}

async function sendWebAttachmentBatch(
  env,
  thread,
  threadId,
  input,
  operator,
  syntheticProviderId,
  storedRows
) {
  const recipient = normalizeWebEmail(await decrypt(env, thread.external_user_ciphertext));
  const occurredAt = new Date().toISOString();
  const names = storedRows.map((item) => item.fileName);
  const bodyText = input.text || `【添付ファイルを送信しました：${names.join("、")}】`;
  const cipher = await encrypt(env, bodyText);

  let messageRow = null;
  const inserted = await sb(env, "/rest/v1/dpro_contact_messages", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      thread_id: threadId,
      direction: "outbound",
      message_type: "attachment",
      body_ciphertext: cipher,
      provider_message_id: syntheticProviderId,
      sent_by_staff_key: operator.staffKey,
      delivery_status: "sending",
      occurred_at: occurredAt,
      metadata: {
        provider: "resend",
        transport: "email",
        clientRequestId: input.clientRequestId,
        operatorRole: operator.roleKey,
        attachmentCount: storedRows.length,
        subject: webEmailSubject(env),
      },
    }),
  });
  messageRow = inserted?.[0] || null;

  await markAttachmentRows(
    env,
    storedRows.map((item) => item.row.id),
    { message_id: messageRow?.id || null }
  );

  try {
    const resendResult = await mailTransportApi(
      env,
      {
        from: `${webEmailFromName(env)} <${webEmailFromAddress(env)}>`,
        to: [recipient],
        ...(webEmailSentCopyBcc(env) ? { bcc: webEmailSentCopyBcc(env) } : {}),
        subject: webEmailSubject(env),
        text: webEmailBody(env, bodyText),
        reply_to: webEmailReplyTo(env, threadId),
        attachments: storedRows.map((item) => ({
          content: base64(item.bytes),
          filename: item.fileName,
        })),
        tags: [
          { name: "channel", value: "web_reply" },
          { name: "tenant", value: webEmailTenantTag(env) },
        ],
      },
      `dpro-contact-web-attachment/${threadId}/${input.clientRequestId}`,
      threadId
    );

    const resendId = String(resendResult?.id || "");
    await sb(
      env,
      `/rest/v1/dpro_contact_messages?id=eq.${encodeURIComponent(messageRow?.id || "")}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          delivery_status: "sent",
          metadata: {
            provider: "resend",
            transport: "email",
            clientRequestId: input.clientRequestId,
            operatorRole: operator.roleKey,
            attachmentCount: storedRows.length,
            subject: webEmailSubject(env),
            replyTo: webEmailReplyTo(env, threadId),
            gmailSentCopy: Boolean(webEmailSentCopyBcc(env)),
            resendId,
            sentAt: occurredAt,
          },
        }),
      }
    );

    await markAttachmentRows(
      env,
      storedRows.map((item) => item.row.id),
      {
        status: "sent",
        metadata: {
          clientRequestId: input.clientRequestId,
          resendId,
          sentAt: occurredAt,
        },
      }
    );

    await updateThreadAfterOutbound(env, thread, threadId, cipher, "attachment", occurredAt);
    await deliveryLog(env, {
      thread_id: threadId,
      message_id: messageRow?.id || null,
      operation: "web_email_attachment_reply",
      success: true,
      provider: "resend",
      http_status: 200,
      request_id: resendId || input.clientRequestId,
      metadata: {
        staffKey: operator.staffKey,
        roleKey: operator.roleKey,
        attachmentCount: storedRows.length,
      },
    });

    return {
      ok: true,
      sentAt: occurredAt,
      transport: "email_resend",
      providerMessageId: resendId || null,
      attachmentCount: storedRows.length,
    };
  } catch (error) {
    if (messageRow?.id) {
      await sb(
        env,
        `/rest/v1/dpro_contact_messages?id=eq.${encodeURIComponent(messageRow.id)}`,
        {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ delivery_status: "failed" }),
        }
      ).catch(() => {});
    }
    throw error;
  }
}

async function sendLineAttachmentBatch(
  env,
  thread,
  threadId,
  input,
  operator,
  syntheticProviderId,
  storedRows,
  origin
) {
  const userId = await decrypt(env, thread.external_user_ciphertext);
  const occurredAt = new Date().toISOString();
  const names = storedRows.map((item) => item.fileName);
  const bodyText = input.text || `【添付ファイルを送信しました：${names.join("、")}】`;
  const cipher = await encrypt(env, bodyText);

  const messages = [];
  if (input.text) {
    messages.push({ type: "text", text: input.text });
  }

  for (const item of storedRows) {
    const link = await publicAttachmentUrl(env, origin, item.row.id);
    if (
      /^image\/(jpeg|png)$/i.test(item.contentType) &&
      item.bytes.byteLength <= 1024 * 1024
    ) {
      messages.push({
        type: "image",
        originalContentUrl: link,
        previewImageUrl: link,
      });
    } else {
      messages.push({
        type: "text",
        text: `📎 ${item.fileName}\n${link}`,
      });
    }
  }

  if (!messages.length) {
    messages.push({ type: "text", text: bodyText });
  }

  if (messages.length > 5) {
    const e = new Error("too_many_line_message_objects");
    e.status = 400;
    throw e;
  }

  let messageRow = null;
  const inserted = await sb(env, "/rest/v1/dpro_contact_messages", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      thread_id: threadId,
      direction: "outbound",
      message_type: "attachment",
      body_ciphertext: cipher,
      provider_message_id: syntheticProviderId,
      sent_by_staff_key: operator.staffKey,
      delivery_status: "sending",
      occurred_at: occurredAt,
      metadata: {
        provider: "line",
        transport: "line_push",
        clientRequestId: input.clientRequestId,
        operatorRole: operator.roleKey,
        attachmentCount: storedRows.length,
      },
    }),
  });
  messageRow = inserted?.[0] || null;

  await markAttachmentRows(
    env,
    storedRows.map((item) => item.row.id),
    { message_id: messageRow?.id || null }
  );

  try {
    const lineResult = await lineApi(env, "/v2/bot/message/push", {
      method: "POST",
      body: JSON.stringify({ to: userId, messages }),
    });

    const sentIds = Array.isArray(lineResult?.sentMessages)
      ? lineResult.sentMessages.map((row) => String(row?.id || "")).filter(Boolean)
      : [];

    if (messageRow?.id) {
      await sb(
        env,
        `/rest/v1/dpro_contact_messages?id=eq.${encodeURIComponent(messageRow.id)}`,
        {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({
            delivery_status: "sent",
            metadata: {
              provider: "line",
              transport: "line_push",
              clientRequestId: input.clientRequestId,
              operatorRole: operator.roleKey,
              attachmentCount: storedRows.length,
              sentMessageIds: sentIds,
              sentAt: occurredAt,
            },
          }),
        }
      );
    }

    await markAttachmentRows(
      env,
      storedRows.map((item) => item.row.id),
      {
        status: "sent",
        metadata: {
          clientRequestId: input.clientRequestId,
          sentMessageIds: sentIds,
          sentAt: occurredAt,
          publicLinkTtlSeconds: attachmentLinkTtlSeconds(env),
        },
      }
    );

    await updateThreadAfterOutbound(env, thread, threadId, cipher, "attachment", occurredAt);
    await deliveryLog(env, {
      thread_id: threadId,
      message_id: messageRow?.id || null,
      operation: "line_attachment_reply",
      success: true,
      provider: "line",
      http_status: 200,
      request_id: sentIds[0] || input.clientRequestId,
      metadata: {
        staffKey: operator.staffKey,
        roleKey: operator.roleKey,
        attachmentCount: storedRows.length,
      },
    });

    return {
      ok: true,
      sentAt: occurredAt,
      transport: "line_push",
      attachmentCount: storedRows.length,
      sentMessageIds: sentIds,
    };
  } catch (error) {
    if (messageRow?.id) {
      await sb(
        env,
        `/rest/v1/dpro_contact_messages?id=eq.${encodeURIComponent(messageRow.id)}`,
        {
          method: "PATCH",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ delivery_status: "failed" }),
        }
      ).catch(() => {});
    }
    throw error;
  }
}

async function updateThreadAfterOutbound(env, thread, threadId, cipher, messageType, occurredAt) {
  await sb(
    env,
    `/rest/v1/dpro_contact_threads?id=eq.${encodeURIComponent(threadId)}`,
    {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        unread_count: 0,
        status: thread.status === "spam" ? "spam" : "open",
        last_message_ciphertext: cipher,
        last_message_direction: "outbound",
        last_message_type: messageType,
        last_message_at: occurredAt,
        last_outbound_at: occurredAt,
        updated_at: occurredAt,
      }),
    }
  );
}

function decodeMimeHeaderWords(value) {
  return String(value || "").replace(
    /=\?([^?]+)\?([bqBQ])\?([^?]*)\?=/g,
    (_, charset, encoding, payload) => {
      try {
        let bytes;
        if (String(encoding).toUpperCase() === "B") {
          bytes = decodeBase64Bytes(payload);
        } else {
          const q = String(payload).replace(/_/g, " ");
          bytes = decodeQuotedPrintableBytes(q);
        }
        try {
          return new TextDecoder(String(charset || "utf-8"), { fatal: false }).decode(bytes);
        } catch (_) {
          return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
        }
      } catch (_) {
        return _;
      }
    }
  );
}

function mimeExtendedParam(headerValue, name) {
  const raw = String(headerValue || "");
  const re = new RegExp(`(?:^|;)\\s*${name}\\*\\s*=\\s*(?:"([^"]*)"|([^;\\s]*))`, "i");
  const match = re.exec(raw);
  const valueRaw = String(match?.[1] ?? match?.[2] ?? "").trim();
  if (!valueRaw) return "";
  const parts = valueRaw.match(/^([^']*)'[^']*'(.*)$/);
  const encoded = parts ? parts[2] : valueRaw;
  try {
    return decodeURIComponent(encoded);
  } catch (_) {
    return encoded;
  }
}

function mimeFileName(headers) {
  const disposition = String(headers?.["content-disposition"] || "");
  const contentType = String(headers?.["content-type"] || "");
  const valueRaw =
    mimeExtendedParam(disposition, "filename") ||
    mimeParam(disposition, "filename") ||
    mimeExtendedParam(contentType, "name") ||
    mimeParam(contentType, "name");
  return safeAttachmentFileName(decodeMimeHeaderWords(valueRaw), "attachment");
}

function bytesToLatin1String(bytes) {
  const source = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const chunkSize = 8192;
  let out = "";
  for (let i = 0; i < source.length; i += chunkSize) {
    const chunk = source.subarray(i, Math.min(source.length, i + chunkSize));
    out += String.fromCharCode(...chunk);
  }
  return out;
}

function latin1Bytes(input) {
  const raw = String(input || "");
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i) & 0xff;
  return out;
}

function decodeMimeBodyBytes(body, transferEncoding) {
  const encoding = String(transferEncoding || "").trim().toLowerCase();
  if (encoding === "base64") return decodeBase64Bytes(body);
  if (encoding === "quoted-printable") return decodeQuotedPrintableBytes(body);
  return latin1Bytes(body);
}

function mimeAttachmentCandidates(raw, depth = 0, out = []) {
  if (depth > 8 || out.length >= MAX_ATTACHMENT_COUNT) return out;
  const { headers, body } = splitMimeEntity(raw);
  const contentTypeHeader = String(headers["content-type"] || "text/plain");
  const type = contentTypeHeader.split(";")[0].trim().toLowerCase();
  const disposition = String(headers["content-disposition"] || "").toLowerCase();

  if (type.startsWith("multipart/")) {
    const boundary = mimeParam(contentTypeHeader, "boundary");
    if (!boundary) return out;
    const marker = `--${boundary}`;
    const parts = String(body || "").split(marker);
    for (const part of parts.slice(1)) {
      if (part.startsWith("--") || out.length >= MAX_ATTACHMENT_COUNT) break;
      const cleaned = part.replace(/^\r?\n/, "").replace(/\r?\n$/, "");
      mimeAttachmentCandidates(cleaned, depth + 1, out);
    }
    return out;
  }

  const filename = mimeFileName(headers);
  const looksLikeAttachment =
    disposition.startsWith("attachment") ||
    (filename && filename !== "attachment" && !type.startsWith("text/")) ||
    (disposition.startsWith("inline") && filename && !type.startsWith("text/"));

  if (!looksLikeAttachment) return out;

  try {
    const bytes = decodeMimeBodyBytes(body, headers["content-transfer-encoding"]);
    out.push({
      fileName: filename || `attachment${extensionForContentType(type)}`,
      contentType: type || "application/octet-stream",
      bytes,
      disposition: disposition.split(";")[0] || "",
    });
  } catch (error) {
    console.warn("DPRO_CONTACT_EMAIL_ATTACHMENT_PARSE_ERROR", String(error?.message || error));
  }

  return out;
}

function validateClientRequestId(input) {
  const id = String(input || "").trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    const e = new Error("invalid_client_request_id");
    e.status = 400;
    throw e;
  }
  return id.toLowerCase();
}

function webEmailSubject(env) {
  return `【${webEmailFromName(env)}】お問い合わせへのご返信`;
}

function webEmailBody(env, text) {
  return [
    text,
    "",
    "――――――――――",
    webEmailFromName(env),
    "このメールはWEBお問い合わせへの返信です。",
    "ご返信はこのメールへそのままお送りください。",
  ].join("\n");
}

async function sendWebEmailReply(env, threadId, body, operator) {
  const replyText = String(body?.text || "").trim();
  if (!replyText || replyText.length > MAX_REPLY_CHARS) {
    const e = new Error("reply_text_must_be_1_to_5000_chars");
    e.status = 400;
    throw e;
  }

  const clientRequestId = validateClientRequestId(body?.clientRequestId);
  const thread = await assertTenantThread(env, threadId);
  if (String(thread?._channel?.channel_type || "") !== "web") {
    const e = new Error("email_reply_not_supported_for_channel");
    e.status = 409;
    throw e;
  }

  const recipient = normalizeWebEmail(await decrypt(env, thread.external_user_ciphertext));
  const occurredAt = new Date().toISOString();
  const cipher = await encrypt(env, replyText);
  const providerRequestId = `web-email:${threadId}:${clientRequestId}`;
  const idempotencyKey = `dpro-contact-web-reply/${threadId}/${clientRequestId}`;

  let messageRow = null;
  const existing = await sb(
    env,
    `/rest/v1/dpro_contact_messages?select=id,delivery_status,metadata&provider_message_id=eq.${encodeURIComponent(providerRequestId)}&limit=1`
  );

  if (existing?.[0]) {
    messageRow = existing[0];
    if (messageRow.delivery_status === "sent") {
      return {
        ok: true,
        sentAt: messageRow.metadata?.sentAt || occurredAt,
        transport: "email_resend",
        duplicate: true,
      };
    }
  } else {
    const inserted = await sb(env, "/rest/v1/dpro_contact_messages", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        thread_id: threadId,
        direction: "outbound",
        message_type: "text",
        body_ciphertext: cipher,
        provider_message_id: providerRequestId,
        sent_by_staff_key: operator.staffKey,
        delivery_status: "sending",
        occurred_at: occurredAt,
        metadata: {
          provider: "resend",
          transport: "email",
          clientRequestId,
          operatorRole: operator.roleKey,
          subject: webEmailSubject(env),
        },
      }),
    });
    messageRow = inserted?.[0] || null;
  }

  try {
    const resendResult = await mailTransportApi(
      env,
      {
        from: `${webEmailFromName(env)} <${webEmailFromAddress(env)}>`,
        to: [recipient],
        ...(webEmailSentCopyBcc(env) ? { bcc: webEmailSentCopyBcc(env) } : {}),
        subject: webEmailSubject(env),
        text: webEmailBody(env, replyText),
        reply_to: webEmailReplyTo(env, threadId),
        tags: [
          { name: "channel", value: "web_reply" },
          { name: "tenant", value: webEmailTenantTag(env) },
        ],
      },
      idempotencyKey,
      threadId
    );

    const resendId = String(resendResult?.id || "");
    const sentMeta = {
      provider: "resend",
      transport: "email",
      clientRequestId,
      operatorRole: operator.roleKey,
      subject: webEmailSubject(env),
      replyTo: webEmailReplyTo(env, threadId),
      gmailSentCopy: Boolean(webEmailSentCopyBcc(env)),
      resendId,
      sentAt: occurredAt,
    };

    if (messageRow?.id) {
      await sb(env, `/rest/v1/dpro_contact_messages?id=eq.${encodeURIComponent(messageRow.id)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          body_ciphertext: cipher,
          sent_by_staff_key: operator.staffKey,
          delivery_status: "sent",
          metadata: sentMeta,
        }),
      });
    }

    await sb(
      env,
      `/rest/v1/dpro_contact_threads?id=eq.${encodeURIComponent(threadId)}`,
      {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          unread_count: 0,
          status: thread.status === "spam" ? "spam" : "open",
          last_message_ciphertext: cipher,
          last_message_direction: "outbound",
          last_message_type: "text",
          last_message_at: occurredAt,
          last_outbound_at: occurredAt,
          updated_at: occurredAt,
        }),
      }
    );

    await deliveryLog(env, {
      thread_id: threadId,
      message_id: messageRow?.id || null,
      operation: "web_email_reply",
      success: true,
      provider: "resend",
      http_status: 200,
      request_id: resendId || clientRequestId,
      metadata: {
        staffKey: operator.staffKey,
        roleKey: operator.roleKey,
        clientRequestId,
      },
    });

    return {
      ok: true,
      sentAt: occurredAt,
      transport: "email_resend",
      providerMessageId: resendId || null,
    };
  } catch (error) {
    if (messageRow?.id) {
      await sb(env, `/rest/v1/dpro_contact_messages?id=eq.${encodeURIComponent(messageRow.id)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({
          delivery_status: "failed",
          metadata: {
            provider: "resend",
            transport: "email",
            clientRequestId,
            operatorRole: operator.roleKey,
            subject: webEmailSubject(env),
            failedAt: new Date().toISOString(),
          },
        }),
      }).catch(() => {});
    }

    await deliveryLog(env, {
      thread_id: threadId,
      message_id: messageRow?.id || null,
      operation: "web_email_reply",
      success: false,
      provider: "resend",
      http_status: Number(error?.upstreamStatus || error?.status || 500),
      error_code: String(error?.code || ""),
      error_message: String(error?.message || error).slice(0, 500),
      request_id: clientRequestId,
      metadata: {
        staffKey: operator.staffKey,
        roleKey: operator.roleKey,
        clientRequestId,
      },
    }).catch(() => {});

    throw error;
  }
}


function webReplyThreadIdFromRecipient(env, recipient) {
  const target = String(recipient || "").trim().toLowerCase();

  if (featureState(env).mailGatewayEnabled) {
    const local = mailGatewayReplyLocal(env);
    const token = mailGatewayRouteToken(env);
    const domain = mailGatewayMailDomain(env);
    const escapedLocal = local.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const escapedToken = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const escapedDomain = domain.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = new RegExp(`^${escapedLocal}\\+${escapedToken}\\.([0-9a-f-]{36})@${escapedDomain}$`, "i").exec(target);
    if (!match) return "";
    const id = match[1].toLowerCase();
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) ? id : "";
  }

  const base = normalizeWebEmail(webEmailFromAddress(env));
  const [local, domain] = base.split("@");
  const escapedLocal = local.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const escapedDomain = domain.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`^${escapedLocal}\\+([0-9a-f-]{36})@${escapedDomain}$`, "i").exec(target);
  if (!match) return "";
  const id = match[1].toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
    ? id
    : "";
}

function parseMimeHeaders(headerText) {
  const unfolded = String(headerText || "").replace(/\r?\n[ \t]+/g, " ");
  const headers = {};
  for (const line of unfolded.split(/\r?\n/)) {
    const index = line.indexOf(":");
    if (index <= 0) continue;
    const key = line.slice(0, index).trim().toLowerCase();
    const val = line.slice(index + 1).trim();
    if (!headers[key]) headers[key] = val;
  }
  return headers;
}

function splitMimeEntity(raw) {
  const match = /\r?\n\r?\n/.exec(String(raw || ""));
  if (!match) return { headers: {}, body: String(raw || "") };
  const index = match.index;
  return {
    headers: parseMimeHeaders(String(raw).slice(0, index)),
    body: String(raw).slice(index + match[0].length),
  };
}

function mimeParam(contentType, name) {
  const raw = String(contentType || "");
  const re = new RegExp(`(?:^|;)\\s*${name}\\s*=\\s*(?:"([^"]*)"|([^;\\s]*))`, "i");
  const match = re.exec(raw);
  return String(match?.[1] ?? match?.[2] ?? "").trim();
}

function decodeBase64Bytes(input) {
  const clean = String(input || "").replace(/\s+/g, "");
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function decodeQuotedPrintableBytes(input) {
  const soft = String(input || "").replace(/=\r?\n/g, "");
  const bytes = [];
  for (let i = 0; i < soft.length; i++) {
    if (soft[i] === "=" && /^[0-9A-Fa-f]{2}$/.test(soft.slice(i + 1, i + 3))) {
      bytes.push(parseInt(soft.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      const encoded = new TextEncoder().encode(soft[i]);
      for (const b of encoded) bytes.push(b);
    }
  }
  return new Uint8Array(bytes);
}

function decodeMimeBody(body, transferEncoding, charset) {
  const encoding = String(transferEncoding || "").trim().toLowerCase();
  let bytes;
  try {
    if (encoding === "base64") bytes = decodeBase64Bytes(body);
    else if (encoding === "quoted-printable") bytes = decodeQuotedPrintableBytes(body);
    else bytes = new TextEncoder().encode(String(body || ""));
  } catch (_) {
    return String(body || "");
  }

  const label = String(charset || "utf-8").trim().toLowerCase() || "utf-8";
  try {
    return new TextDecoder(label, { fatal: false }).decode(bytes);
  } catch (_) {
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  }
}

function htmlToPlainText(html) {
  return String(html || "")
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h[1-6])\s*>/gi, "\n")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

function mimeTextCandidates(raw, depth = 0) {
  if (depth > 8) return { plain: [], html: [] };
  const { headers, body } = splitMimeEntity(raw);
  const contentType = String(headers["content-type"] || "text/plain");
  const type = contentType.split(";")[0].trim().toLowerCase();
  const disposition = String(headers["content-disposition"] || "").toLowerCase();
  if (disposition.startsWith("attachment")) return { plain: [], html: [] };

  if (type.startsWith("multipart/")) {
    const boundary = mimeParam(contentType, "boundary");
    if (!boundary) return { plain: [], html: [] };
    const marker = `--${boundary}`;
    const parts = String(body || "").split(marker);
    const result = { plain: [], html: [] };
    for (const part of parts.slice(1)) {
      if (part.startsWith("--")) break;
      const cleaned = part.replace(/^\r?\n/, "").replace(/\r?\n$/, "");
      const child = mimeTextCandidates(cleaned, depth + 1);
      result.plain.push(...child.plain);
      result.html.push(...child.html);
    }
    return result;
  }

  if (type !== "text/plain" && type !== "text/html") return { plain: [], html: [] };
  const decoded = decodeMimeBody(
    body,
    headers["content-transfer-encoding"],
    mimeParam(contentType, "charset") || "utf-8"
  );
  return type === "text/plain"
    ? { plain: [decoded], html: [] }
    : { plain: [], html: [decoded] };
}

function trimQuotedEmailReply(input) {
  const normalized = String(input || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\u00a0/g, " ")
    .trim();

  const cutPatterns = [
    /^On .+wrote:\s*$/im,
    /^-----Original Message-----\s*$/im,
    /^_{5,}\s*$/m,
    /^-{5,}\s*$/m,
    /^From:\s.+$/im,
    /^差出人:\s.+$/im,
    /^送信元:\s.+$/im,
  ];
  let cut = normalized.length;
  for (const pattern of cutPatterns) {
    const match = pattern.exec(normalized);
    if (match && match.index > 0) cut = Math.min(cut, match.index);
  }

  const lines = normalized.slice(0, cut).split("\n");
  while (lines.length && /^\s*>/.test(lines[lines.length - 1])) lines.pop();

  return lines
    .filter((line, index, arr) => {
      if (!/^\s*>/.test(line)) return true;
      const priorQuoted = index > 0 && /^\s*>/.test(arr[index - 1]);
      return !priorQuoted && index < 2;
    })
    .join("\n")
    .replace(/\n{4,}/g, "\n\n")
    .trim();
}

function extractInboundEmailText(raw) {
  const candidates = mimeTextCandidates(raw);
  const plain = candidates.plain.map(trimQuotedEmailReply).find((v) => v);
  if (plain) return plain.slice(0, MAX_WEB_EMAIL_INBOUND_CHARS);
  const html = candidates.html.map((v) => trimQuotedEmailReply(htmlToPlainText(v))).find((v) => v);
  return (html || "【本文なし／添付ファイルのみのメールです。Gmailで内容を確認してください。】")
    .slice(0, MAX_WEB_EMAIL_INBOUND_CHARS);
}

async function webEmailProviderId(message) {
  const messageId = String(message?.headers?.get("message-id") || "").trim().toLowerCase();
  const basis = messageId || [message?.from, message?.to, message?.headers?.get("date"), message?.rawSize].join("|");
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(basis));
  const hex = [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `web-email:${hex}`;
}

async function handleWebEmailInbound(message, env, forcedThreadId = "") {
  const threadId = forcedThreadId || webReplyThreadIdFromRecipient(env, message?.to);
  if (!threadId) {
    console.log("DPRO_CONTACT_EMAIL_INBOUND_IGNORED", { reason: "no_thread_token", to: String(message?.to || "") });
    return { ok: true, ignored: true, reason: "no_thread_token" };
  }

  const thread = await assertTenantThread(env, threadId);
  if (String(thread?._channel?.channel_type || "") !== "web") {
    const e = new Error("email_inbound_not_supported_for_channel");
    e.status = 409;
    throw e;
  }

  const expectedSender = normalizeWebEmail(await decrypt(env, thread.external_user_ciphertext));
  const actualSender = normalizeWebEmail(message?.from);
  if (actualSender !== expectedSender) {
    await deliveryLog(env, {
      thread_id: threadId,
      message_id: null,
      operation: "web_email_receive",
      success: false,
      provider: "cloudflare_email_routing",
      http_status: 403,
      error_code: "sender_mismatch",
      error_message: "Inbound email sender does not match the WEB thread customer.",
      request_id: String(message?.headers?.get("message-id") || "").slice(0, 240),
      metadata: { rawSize: Number(message?.rawSize || 0) },
    }).catch(() => {});
    const e = new Error("email_sender_mismatch");
    e.status = 403;
    throw e;
  }

  const providerMessageId = await webEmailProviderId(message);
  const existing = await sb(
    env,
    `/rest/v1/dpro_contact_messages?select=id&provider_message_id=eq.${encodeURIComponent(providerMessageId)}&limit=1`
  );
  if (existing?.[0]?.id) {
    return { ok: true, duplicate: true, threadId };
  }

  const occurredAt = new Date().toISOString();
  const rawSize = Number(message?.rawSize || 0);
  let replyText = "";
  let parseSkipped = false;
  let inboundAttachments = [];

  const emailParseLimit = featureState(env).attachmentsEnabled
    ? MAX_WEB_EMAIL_RAW_PARSE_BYTES_WITH_ATTACHMENTS
    : MAX_WEB_EMAIL_RAW_PARSE_BYTES;

  if (rawSize > emailParseLimit) {
    parseSkipped = true;
    replyText = "【大きなメールを受信しました。本文・添付ファイルはGmailで確認してください。】";
  } else {
    const rawBytes = new Uint8Array(await new Response(message.raw).arrayBuffer());
    const rawText = bytesToLatin1String(rawBytes);
    replyText = extractInboundEmailText(rawText);

    if (featureState(env).attachmentsEnabled) {
      inboundAttachments = mimeAttachmentCandidates(rawText)
        .filter((item) => item?.bytes?.byteLength > 0)
        .slice(0, MAX_ATTACHMENT_COUNT);

      if (
        inboundAttachments.length &&
        replyText.startsWith("【本文なし／添付ファイルのみのメールです。")
      ) {
        const names = inboundAttachments
          .map((item) => safeAttachmentFileName(item.fileName, "attachment"))
          .join("、");
        replyText = `【添付ファイルを受信しました：${names}】`;
      }
    }
  }

  const cipher = await encrypt(env, replyText);
  const previewCipher = await encrypt(env, replyText.slice(0, 800));
  const subject = String(message?.headers?.get("subject") || "").replace(/[\r\n]+/g, " ").trim().slice(0, 300);
  const originalMessageId = String(message?.headers?.get("message-id") || "").trim().slice(0, 500);

  const inserted = await sb(env, "/rest/v1/dpro_contact_messages", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      thread_id: threadId,
      direction: "inbound",
      message_type: "text",
      body_ciphertext: cipher,
      provider_message_id: providerMessageId,
      delivery_status: "received",
      occurred_at: occurredAt,
      metadata: {
        provider: "cloudflare_email_routing",
        transport: "email",
        source: "customer_reply",
        subject,
        originalMessageId,
        rawSize,
        parseSkipped,
      },
    }),
  });
  const messageRow = inserted?.[0] || null;

  let storedAttachmentCount = 0;
  let skippedAttachmentCount = 0;
  if (featureState(env).attachmentsEnabled && inboundAttachments.length) {
    for (let index = 0; index < inboundAttachments.length; index += 1) {
      const item = inboundAttachments[index];
      try {
        if (item.bytes.byteLength > MAX_ATTACHMENT_BYTES) {
          skippedAttachmentCount += 1;
          continue;
        }
        await createStoredAttachment(env, {
          threadId,
          messageId: messageRow?.id || null,
          direction: "inbound",
          channelType: "web",
          provider: "cloudflare_email_routing",
          providerAttachmentId: `${providerMessageId}:${index + 1}`,
          fileName: item.fileName,
          contentType: item.contentType,
          bytes: item.bytes,
          metadata: {
            source: "customer_reply",
            disposition: item.disposition,
            rawSize,
          },
        });
        storedAttachmentCount += 1;
      } catch (error) {
        skippedAttachmentCount += 1;
        console.error("DPRO_CONTACT_EMAIL_ATTACHMENT_STORE_ERROR", String(error?.message || error));
      }
    }
  }

  await sb(env, `/rest/v1/dpro_contact_threads?id=eq.${encodeURIComponent(threadId)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      unread_count: Number(thread.unread_count || 0) + 1,
      status: thread.status === "spam" ? "spam" : "open",
      last_message_ciphertext: previewCipher,
      last_message_direction: "inbound",
      last_message_type: "text",
      last_message_at: occurredAt,
      last_inbound_at: occurredAt,
      updated_at: occurredAt,
    }),
  });

  await deliveryLog(env, {
    thread_id: threadId,
    message_id: messageRow?.id || null,
    operation: "web_email_receive",
    success: true,
    provider: "cloudflare_email_routing",
    http_status: 200,
    request_id: originalMessageId || providerMessageId,
    metadata: {
      rawSize,
      parseSkipped,
      storedAttachmentCount,
      skippedAttachmentCount,
    },
  });

  return {
    ok: true,
    threadId,
    messageId: messageRow?.id || null,
    storedAttachmentCount,
    skippedAttachmentCount,
  };
}


function base64UrlToBytes(input) {
  const raw = String(input || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = raw + "=".repeat((4 - (raw.length % 4 || 4)) % 4);
  let binary;
  try { binary = atob(padded); }
  catch (_) {
    const e = new Error("invalid_mail_gateway_base64url");
    e.status = 401;
    throw e;
  }
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function base64UrlToUtf8(input) {
  try { return new TextDecoder().decode(base64UrlToBytes(input)); }
  catch (_) {
    const e = new Error("invalid_mail_gateway_meta");
    e.status = 401;
    throw e;
  }
}

async function sha256HexBytes(bytes) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function importMailGatewayPublicKey(env) {
  let jwk;
  try { jwk = JSON.parse(value(env, "MAIL_GATEWAY_SIGNING_PUBLIC_JWK")); }
  catch (_) {
    const e = new Error("invalid_MAIL_GATEWAY_SIGNING_PUBLIC_JWK");
    e.status = 503;
    throw e;
  }

  if (jwk?.kty !== "EC" || jwk?.crv !== "P-256" || !jwk?.x || !jwk?.y || jwk?.d) {
    const e = new Error("invalid_MAIL_GATEWAY_SIGNING_PUBLIC_JWK");
    e.status = 503;
    throw e;
  }

  try {
    return await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"]
    );
  } catch (_) {
    const e = new Error("invalid_MAIL_GATEWAY_SIGNING_PUBLIC_JWK");
    e.status = 503;
    throw e;
  }
}

async function verifyMailGatewayInboundSignature(env, request, rawBytes) {
  validateMailGatewayBaseEnv(env, true);

  const timestamp = String(request.headers.get("x-dpro-mail-timestamp") || "").trim();
  const routeToken = String(request.headers.get("x-dpro-mail-route-token") || "").trim().toLowerCase();
  const threadId = String(request.headers.get("x-dpro-mail-thread-id") || "").trim().toLowerCase();
  const metaB64 = String(request.headers.get("x-dpro-mail-meta") || "").trim();
  const signatureB64 = String(request.headers.get("x-dpro-mail-signature") || "").trim();
  const gatewayVersion = String(request.headers.get("x-dpro-mail-version") || "").trim();

  if (!timestamp || !routeToken || !threadId || !metaB64 || !signatureB64) {
    const e = new Error("mail_gateway_signature_headers_missing");
    e.status = 401;
    throw e;
  }
  if (metaB64.length > MAIL_GATEWAY_MAX_META_HEADER_CHARS) {
    const e = new Error("mail_gateway_meta_too_large");
    e.status = 401;
    throw e;
  }
  if (routeToken !== mailGatewayRouteToken(env)) {
    const e = new Error("mail_gateway_route_mismatch");
    e.status = 403;
    throw e;
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(threadId)) {
    const e = new Error("invalid_mail_gateway_thread_id");
    e.status = 400;
    throw e;
  }

  const when = Number(timestamp);
  if (!Number.isFinite(when) || Math.abs(Date.now() - when) > MAIL_GATEWAY_MAX_CLOCK_SKEW_MS) {
    const e = new Error("mail_gateway_signature_expired");
    e.status = 401;
    throw e;
  }

  const bodyHash = await sha256HexBytes(rawBytes);
  const canonical = [
    "DPRO-MAIL-R3",
    timestamp,
    routeToken,
    threadId,
    bodyHash,
    metaB64,
  ].join("\n");

  const key = await importMailGatewayPublicKey(env);
  const signature = base64UrlToBytes(signatureB64);
  const ok = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    signature,
    new TextEncoder().encode(canonical)
  );
  if (!ok) {
    const e = new Error("mail_gateway_signature_invalid");
    e.status = 401;
    throw e;
  }

  let meta;
  try { meta = JSON.parse(base64UrlToUtf8(metaB64)); }
  catch (_) {
    const e = new Error("invalid_mail_gateway_meta");
    e.status = 400;
    throw e;
  }

  return { timestamp, routeToken, threadId, meta, gatewayVersion };
}

async function handleMailGatewayInboundRequest(request, env) {
  const len = Number(request.headers.get("content-length") || 0);
  const max = featureState(env).attachmentsEnabled
    ? MAX_WEB_EMAIL_RAW_PARSE_BYTES_WITH_ATTACHMENTS
    : MAX_WEB_EMAIL_RAW_PARSE_BYTES;
  if (len > max) {
    const e = new Error("mail_gateway_inbound_too_large");
    e.status = 413;
    throw e;
  }

  const rawBytes = new Uint8Array(await request.arrayBuffer());
  if (rawBytes.byteLength > max) {
    const e = new Error("mail_gateway_inbound_too_large");
    e.status = 413;
    throw e;
  }

  const verified = await verifyMailGatewayInboundSignature(env, request, rawBytes);
  const meta = verified.meta || {};
  const headers = new Headers();
  if (meta.subject) headers.set("subject", String(meta.subject));
  if (meta.date) headers.set("date", String(meta.date));
  if (meta.messageId) headers.set("message-id", String(meta.messageId));

  const pseudoMessage = {
    from: String(meta.from || ""),
    to: String(meta.to || webEmailReplyTo(env, verified.threadId)),
    headers,
    raw: new Blob([rawBytes]).stream(),
    rawSize: rawBytes.byteLength,
  };

  const result = await handleWebEmailInbound(pseudoMessage, env, verified.threadId);
  return {
    ...result,
    mailGateway: true,
    gatewayVersion: verified.gatewayVersion || MAIL_GATEWAY_VERSION,
  };
}

async function mailTransportApi(env, payload, idempotencyKey, threadId) {
  if (!featureState(env).mailGatewayEnabled) {
    return resendApi(env, payload, idempotencyKey);
  }

  validateMailGatewayBaseEnv(env, featureState(env).webEmailInboundEnabled);

  const response = await fetch(`${mailGatewayUrl(env)}/v1/send`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${value(env, "MAIL_GATEWAY_CLIENT_SECRET")}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      routeToken: mailGatewayRouteToken(env),
      tenantCode: tenantCode(env),
      systemCode: systemCode(env),
      threadId: String(threadId || "").toLowerCase(),
      to: Array.isArray(payload?.to) ? payload.to : [payload?.to].filter(Boolean),
      subject: String(payload?.subject || ""),
      text: String(payload?.text || ""),
      attachments: Array.isArray(payload?.attachments) ? payload.attachments : [],
      idempotencyKey: String(idempotencyKey || ""),
    }),
  });

  const bodyText = await response.text();
  const data = bodyText ? safeJson(bodyText) : {};
  if (!response.ok || data?.ok === false) {
    const e = new Error(data?.error || `mail_gateway_${response.status}`);
    e.status = response.status === 429 ? 429 : response.status >= 500 ? 502 : response.status || 502;
    e.upstreamStatus = response.status;
    throw e;
  }
  return data;
}

async function resendApi(env, payload, idempotencyKey) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${value(env, "RESEND_API_KEY")}`,
      "content-type": "application/json",
      "idempotency-key": idempotencyKey,
    },
    body: JSON.stringify(payload),
  });

  const bodyText = await response.text();
  const data = bodyText ? safeJson(bodyText) : {};

  if (!response.ok) {
    const e = new Error(
      data?.message ||
      data?.error?.message ||
      data?.name ||
      `resend_api_${response.status}`
    );
    e.status = response.status === 429 ? 429 : response.status >= 500 ? 502 : 400;
    e.upstreamStatus = response.status;
    e.code = String(data?.name || data?.error?.name || "");
    throw e;
  }

  return data;
}

async function deliveryLog(env, row) {
  await sb(env, "/rest/v1/dpro_contact_delivery_logs", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(row),
  });
}

async function lineApi(env, path, options = {}) {
  const response = await fetch(`https://api.line.me${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${value(env, "LINE_CHANNEL_ACCESS_TOKEN")}`,
      "content-type": "application/json",
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  const data = text ? safeJson(text) : {};

  if (!response.ok) {
    const e = new Error(data?.message || `line_api_${response.status}`);
    e.status = response.status >= 500 ? 502 : 400;
    e.upstreamStatus = response.status;
    throw e;
  }

  return data;
}

function dateKeyInTimezone(date, timezone) {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  }
}

async function deriveAesKey(secret) {
  const material = new TextEncoder().encode(`DPRO_CONTACT_AES_V1:${secret}`);
  const digest = await crypto.subtle.digest("SHA-256", material);
  return crypto.subtle.importKey(
    "raw",
    digest,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encrypt(env, plainValue) {
  const key = await deriveAesKey(value(env, "CONTACT_ENCRYPTION_KEY"));
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(String(plainValue))
  );

  return `v1.${base64(iv)}.${base64(encrypted)}`;
}

async function decrypt(env, payload) {
  const [version, iv64, data64] = String(payload || "").split(".");

  if (version !== "v1" || !iv64 || !data64) {
    throw new Error("invalid_ciphertext");
  }

  const key = await deriveAesKey(value(env, "CONTACT_ENCRYPTION_KEY"));

  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(iv64) },
    key,
    fromBase64(data64)
  );

  return new TextDecoder().decode(plain);
}

async function deriveHmacKey(secret) {
  const seed = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`DPRO_CONTACT_HMAC_V1:${secret}`)
  );

  return crypto.subtle.importKey(
    "raw",
    seed,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

async function identityHash(env, externalUserId) {
  const key = await deriveHmacKey(value(env, "CONTACT_ENCRYPTION_KEY"));
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(String(externalUserId))
  );

  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function base64(buffer) {
  const bytes = buffer instanceof Uint8Array
    ? buffer
    : new Uint8Array(buffer);

  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function fromBase64(value) {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}
