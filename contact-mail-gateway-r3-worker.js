/**
 * DPRO CONTACT COMMON MAIL GATEWAY
 * Version: DPRO-CONTACT-MAIL-GATEWAY-R3-A1-OWNER-DOMAIN-FIRST-20260824-STAGED
 * Purpose:
 *   One shared outbound/inbound mail transport for all DPRO CONTACT tenants.
 *   Canonical conversation data stays in each tenant's DPRO CONTACT database.
 *   The gateway stores routing metadata only in Workers KV.
 *
 * Required bindings / vars:
 *   MAIL_ROUTES                         Workers KV binding
 *   MAIL_FALLBACK_DOMAIN                optional DPRO shared fallback mail domain
 *   MAIL_FROM_LOCAL=contact             envelope/header From local part
 *   MAIL_REPLY_LOCAL=r                  Reply-To local prefix
 *
 * Required secrets:
 *   RESEND_API_KEY
 *   MAIL_GATEWAY_SIGNING_PRIVATE_JWK    ECDSA P-256 private JWK (JSON string)
 *
 * Route KV record key:
 *   route:<routeToken>
 *
 * Route record value:
 *   {
 *     "version":"DPRO-CONTACT-MAIL-ROUTE-R3-20260824",
 *     "active":true,
 *     "route_token":"abcdefghijklmnop",
 *     "tenant_code":"TENANT_CODE",
 *     "system_code":"SYSTEM_CODE",
 *     "worker_url":"https://...workers.dev",
 *     "display_name":"Store Name",
 *     "domain_mode":"OWNER_DOMAIN",
 *     "owner_domain":"example.jp",
 *     "mail_domain":"contact.example.jp",
 *     "from_local":"contact",
 *     "mail_dns_verified":true,
 *     "resend_domain_verified":true,
 *     "cloudflare_email_routing_verified":true,
 *     "archive_enabled":false,
 *     "archive_email":"",
 *     "client_secret_sha256":"<64 lower hex>",
 *     "updated_at":"..."
 *   }
 *
 * Security:
 *   - Outbound store -> gateway uses a unique per-route Bearer secret.
 *     Only SHA-256(secret) is stored in KV.
 *   - Inbound gateway -> store is signed with gateway ECDSA private key.
 *     Stores receive only the public JWK.
 *   - No conversation body is persisted in MAIL_ROUTES KV.
 */

const VERSION = "DPRO-CONTACT-MAIL-GATEWAY-R3-A1-OWNER-DOMAIN-FIRST-20260824-STAGED";
const ROUTE_VERSION = "DPRO-CONTACT-MAIL-ROUTE-R3-A1-20260824";
const MAX_JSON_BYTES = 36 * 1024 * 1024;
const MAX_RAW_BYTES = 32 * 1024 * 1024;
const MAX_TEXT_CHARS = 20000;
const MAX_SUBJECT_CHARS = 300;
const MAX_ATTACHMENTS = 3;
const MAX_ATTACHMENT_BASE64_CHARS = 12 * 1024 * 1024;
const MAX_ATTACHMENT_TOTAL_BASE64_CHARS = 28 * 1024 * 1024;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const ROUTE_TOKEN_RE = /^[a-z2-7]{16}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEX64_RE = /^[0-9a-f]{64}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = normalizePath(url.pathname);

    try {
      if (request.method === "GET" && path === "/api/health") {
        return json(await health(env));
      }

      if (request.method === "POST" && path === "/v1/send") {
        validateRuntime(env);
        return json(await handleSend(request, env));
      }

      return json({ ok: false, error: "not_found" }, 404);
    } catch (error) {
      const status = Number(error?.status || 500);
      console.error("DPRO_MAIL_GATEWAY_FETCH_ERROR", {
        path,
        status,
        detail: String(error?.message || error),
      });
      return json({
        ok: false,
        error: status >= 500 ? "server_error" : String(error?.message || "request_error"),
      }, status);
    }
  },

  async email(message, env) {
    validateRuntime(env);

    const parsed = parseReplyRecipient(env, message?.to);
    if (!parsed) {
      message?.setReject?.("Unknown DPRO CONTACT mail route");
      return;
    }

    const route = await loadRoute(env, parsed.routeToken);
    if (!route || !route.active) {
      message?.setReject?.("Inactive DPRO CONTACT mail route");
      return;
    }
    if (parsed.domain !== route.mail_domain) {
      message?.setReject?.("DPRO CONTACT mail domain mismatch");
      return;
    }
    if (!route.mail_ready) {
      message?.setReject?.("DPRO CONTACT mail domain is not ready");
      return;
    }

    let importError = null;

    try {
      await deliverInboundToStore(message, env, route, parsed);
    } catch (error) {
      importError = error;
      console.error("DPRO_MAIL_GATEWAY_INBOUND_IMPORT_ERROR", {
        routeToken: parsed.routeToken,
        tenantCode: route.tenant_code,
        threadId: parsed.threadId,
        detail: String(error?.message || error),
      });
    }

    // Preserve an operational archive even if the store import fails.
    if (route.archive_enabled && route.archive_email) {
      try {
        await message.forward(route.archive_email);
        return;
      } catch (error) {
        console.error("DPRO_MAIL_GATEWAY_ARCHIVE_FORWARD_ERROR", {
          routeToken: parsed.routeToken,
          tenantCode: route.tenant_code,
          detail: String(error?.message || error),
        });
        throw error;
      }
    }

    if (importError) throw importError;
  },
};

function normalizePath(path) {
  const s = String(path || "/").replace(/\/+/g, "/");
  return s.length > 1 ? s.replace(/\/$/, "") : s;
}

function value(env, key, fallback = "") {
  const s = String(env?.[key] ?? "").trim();
  return s || fallback;
}

function flagValue(v) {
  if (typeof v === "boolean") return v;
  return ["1", "true", "yes", "on", "enabled"].includes(String(v || "").trim().toLowerCase());
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

function fail(message, status = 400) {
  const e = new Error(message);
  e.status = status;
  throw e;
}

function normalizeDomain(raw, label = "mail_domain", status = 503) {
  const domain = String(raw || "").trim().toLowerCase().replace(/^@+/, "");
  if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)) {
    fail(`invalid_${label}`, status);
  }
  return domain;
}

function normalizeLocal(raw, fallback) {
  const local = String(raw || fallback || "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{0,31}$/.test(local)) fail("invalid_mail_local_part", 503);
  return local;
}

function normalizeEmail(raw, label = "email") {
  const email = String(raw || "").trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) fail(`invalid_${label}`, 400);
  return email;
}

function normalizeWorkerUrl(raw) {
  const text = String(raw || "").trim();
  let url;
  try { url = new URL(text); } catch (_) { fail("invalid_worker_url", 503); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    fail("invalid_worker_url", 503);
  }
  return url.origin;
}

function sanitizeDisplayName(raw, fallback = "DPRO CONTACT") {
  return String(raw || fallback)
    .replace(/[\r\n<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || fallback;
}

function tagValue(raw, fallback = "value") {
  const s = String(raw || "").replace(/[^A-Za-z0-9_-]+/g, "_").slice(0, 256);
  return s || fallback;
}

function validateRuntime(env) {
  if (!env?.MAIL_ROUTES || typeof env.MAIL_ROUTES.get !== "function") fail("missing_MAIL_ROUTES_binding", 503);
  normalizeLocal(value(env, "MAIL_FROM_LOCAL", "contact"), "contact");
  normalizeLocal(value(env, "MAIL_REPLY_LOCAL", "r"), "r");
  const fallback = value(env, "MAIL_FALLBACK_DOMAIN");
  if (fallback) normalizeDomain(fallback, "MAIL_FALLBACK_DOMAIN");

  const resend = value(env, "RESEND_API_KEY");
  if (!resend || !resend.startsWith("re_")) fail("invalid_RESEND_API_KEY", 503);

  const rawJwk = value(env, "MAIL_GATEWAY_SIGNING_PRIVATE_JWK");
  if (!rawJwk) fail("missing_MAIL_GATEWAY_SIGNING_PRIVATE_JWK", 503);
  try {
    const jwk = JSON.parse(rawJwk);
    if (jwk?.kty !== "EC" || jwk?.crv !== "P-256" || !jwk?.d || !jwk?.x || !jwk?.y) throw new Error("bad_jwk");
  } catch (_) {
    fail("invalid_MAIL_GATEWAY_SIGNING_PRIVATE_JWK", 503);
  }
}

async function health(env) {
  const checks = {
    routesKv: Boolean(env?.MAIL_ROUTES && typeof env.MAIL_ROUTES.get === "function"),
    mailLocals: false,
    fallbackDomain: true,
    resendSecret: value(env, "RESEND_API_KEY").startsWith("re_"),
    signingPrivateKey: false,
  };

  try {
    normalizeLocal(value(env, "MAIL_FROM_LOCAL", "contact"), "contact");
    normalizeLocal(value(env, "MAIL_REPLY_LOCAL", "r"), "r");
    checks.mailLocals = true;
  } catch (_) {}
  try {
    const fallback = value(env, "MAIL_FALLBACK_DOMAIN");
    if (fallback) normalizeDomain(fallback, "MAIL_FALLBACK_DOMAIN");
  } catch (_) { checks.fallbackDomain = false; }
  try {
    const jwk = JSON.parse(value(env, "MAIL_GATEWAY_SIGNING_PRIVATE_JWK"));
    checks.signingPrivateKey = jwk?.kty === "EC" && jwk?.crv === "P-256" && Boolean(jwk?.d && jwk?.x && jwk?.y);
  } catch (_) {}

  const ok = Object.values(checks).every(Boolean);
  return {
    ok,
    service: "DPRO CONTACT MAIL GATEWAY",
    version: VERSION,
    routeVersion: ROUTE_VERSION,
    domainPolicy: "OWNER_DOMAIN_FIRST",
    fallbackMailDomain: value(env, "MAIL_FALLBACK_DOMAIN") || null,
    fromLocal: value(env, "MAIL_FROM_LOCAL", "contact"),
    replyLocal: value(env, "MAIL_REPLY_LOCAL", "r"),
    checks,
    storesConversationBody: false,
    checkedAt: new Date().toISOString(),
  };
}

async function readJsonLimited(request) {
  const len = Number(request.headers.get("content-length") || 0);
  if (len > MAX_JSON_BYTES) fail("request_too_large", 413);
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_JSON_BYTES) fail("request_too_large", 413);
  try { return JSON.parse(text); } catch (_) { fail("invalid_json", 400); }
}

function bearerSecret(request) {
  const auth = String(request.headers.get("authorization") || "");
  if (!/^Bearer\s+/i.test(auth)) fail("unauthorized", 401);
  const secret = auth.replace(/^Bearer\s+/i, "").trim();
  if (secret.length < 24 || secret.length > 256) fail("unauthorized", 401);
  return secret;
}

function validateRouteToken(raw) {
  const token = String(raw || "").trim().toLowerCase();
  if (!ROUTE_TOKEN_RE.test(token)) fail("invalid_route_token", 400);
  return token;
}

function validateThreadId(raw) {
  const id = String(raw || "").trim().toLowerCase();
  if (!UUID_RE.test(id)) fail("invalid_thread_id", 400);
  return id;
}

async function sha256Hex(input) {
  const bytes = input instanceof Uint8Array
    ? input
    : new TextEncoder().encode(String(input ?? ""));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(a, b) {
  const left = String(a || "");
  const right = String(b || "");
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}

async function loadRoute(env, routeToken) {
  const raw = await env.MAIL_ROUTES.get(`route:${routeToken}`);
  if (!raw) return null;
  let route;
  try { route = JSON.parse(raw); } catch (_) { fail("invalid_route_record", 503); }

  if (String(route?.route_token || "").toLowerCase() !== routeToken) fail("route_token_mismatch", 503);
  if (!route?.tenant_code || !route?.system_code) fail("route_identity_missing", 503);
  route.worker_url = normalizeWorkerUrl(route.worker_url);
  route.display_name = sanitizeDisplayName(route.display_name, route.tenant_code);
  route.archive_enabled = flagValue(route.archive_enabled);
  route.archive_email = route.archive_email ? normalizeEmail(route.archive_email, "archive_email") : "";
  if (route.archive_enabled && !route.archive_email) fail("route_archive_email_missing", 503);
  if (!HEX64_RE.test(String(route.client_secret_sha256 || "").toLowerCase())) fail("route_client_secret_hash_invalid", 503);
  route.client_secret_sha256 = String(route.client_secret_sha256).toLowerCase();

  route.domain_mode = String(route.domain_mode || "OWNER_DOMAIN").trim().toUpperCase();
  if (!["OWNER_DOMAIN", "DPRO_SHARED"].includes(route.domain_mode)) fail("route_domain_mode_invalid", 503);
  route.mail_domain = normalizeDomain(route.mail_domain, "route_mail_domain");
  route.from_local = normalizeLocal(route.from_local || value(env, "MAIL_FROM_LOCAL", "contact"), "contact");
  route.mail_dns_verified = flagValue(route.mail_dns_verified);
  route.resend_domain_verified = flagValue(route.resend_domain_verified);
  route.cloudflare_email_routing_verified = flagValue(route.cloudflare_email_routing_verified);

  if (route.domain_mode === "OWNER_DOMAIN") {
    route.owner_domain = normalizeDomain(route.owner_domain, "route_owner_domain");
    if (route.mail_domain === route.owner_domain || !route.mail_domain.endsWith(`.${route.owner_domain}`)) {
      fail("route_owner_mail_domain_must_be_subdomain", 503);
    }
  } else {
    route.owner_domain = route.owner_domain ? normalizeDomain(route.owner_domain, "route_owner_domain") : "";
    const fallback = value(env, "MAIL_FALLBACK_DOMAIN");
    if (!fallback) fail("MAIL_FALLBACK_DOMAIN_not_configured", 503);
    const fallbackDomain = normalizeDomain(fallback, "MAIL_FALLBACK_DOMAIN");
    if (route.mail_domain !== fallbackDomain) fail("route_fallback_domain_mismatch", 503);
  }

  route.mail_ready =
    route.mail_dns_verified &&
    route.resend_domain_verified &&
    route.cloudflare_email_routing_verified;
  return route;
}

function requireRouteMailReady(route) {
  if (!route?.mail_ready) fail("route_mail_domain_not_ready", 409);
}

function validateAttachments(raw) {
  const list = Array.isArray(raw) ? raw : [];
  if (list.length > MAX_ATTACHMENTS) fail("too_many_attachments", 413);
  let total = 0;
  return list.map((item, index) => {
    const content = String(item?.content || "");
    const filename = String(item?.filename || `attachment-${index + 1}`)
      .replace(/[\r\n\\/<>:"|?*]/g, "_")
      .slice(0, 180) || `attachment-${index + 1}`;
    if (!/^[A-Za-z0-9+/]*={0,2}$/.test(content) || content.length > MAX_ATTACHMENT_BASE64_CHARS) {
      fail("invalid_attachment_content", 413);
    }
    total += content.length;
    if (total > MAX_ATTACHMENT_TOTAL_BASE64_CHARS) fail("attachments_too_large", 413);
    return { content, filename };
  });
}

async function handleSend(request, env) {
  const secret = bearerSecret(request);
  const body = await readJsonLimited(request);
  const routeToken = validateRouteToken(body?.routeToken);
  const threadId = validateThreadId(body?.threadId);
  const route = await loadRoute(env, routeToken);
  if (!route || !route.active) fail("route_not_found", 404);

  const secretHash = await sha256Hex(secret);
  if (!constantTimeEqual(secretHash, route.client_secret_sha256)) fail("unauthorized", 401);

  const tenantCode = String(body?.tenantCode || "").trim();
  const systemCode = String(body?.systemCode || "").trim();
  if (tenantCode !== String(route.tenant_code) || systemCode !== String(route.system_code)) {
    fail("route_identity_mismatch", 403);
  }

  const to = Array.isArray(body?.to) ? body.to : [body?.to];
  const recipients = to.filter(Boolean).map((email) => normalizeEmail(email, "recipient"));
  if (recipients.length !== 1) fail("single_recipient_required", 400);

  const subject = String(body?.subject || "").replace(/[\r\n]+/g, " ").trim().slice(0, MAX_SUBJECT_CHARS);
  const text = String(body?.text || "").slice(0, MAX_TEXT_CHARS);
  if (!subject) fail("subject_required", 400);
  if (!text) fail("text_required", 400);

  const idempotencyKey = String(body?.idempotencyKey || "").trim();
  if (!idempotencyKey || idempotencyKey.length > 220) fail("invalid_idempotency_key", 400);

  const attachments = validateAttachments(body?.attachments);
  requireRouteMailReady(route);
  const mailDomain = route.mail_domain;
  const fromLocal = route.from_local;
  const replyLocal = normalizeLocal(value(env, "MAIL_REPLY_LOCAL", "r"), "r");
  const replyLocalPart = `${replyLocal}+${routeToken}.${threadId}`;
  if (replyLocalPart.length > 64) fail("reply_local_part_too_long", 503);

  const fromAddress = `${fromLocal}@${mailDomain}`;
  const replyTo = `${replyLocalPart}@${mailDomain}`;

  const payload = {
    from: `${route.display_name} <${fromAddress}>`,
    to: recipients,
    ...(route.archive_enabled && route.archive_email ? { bcc: [route.archive_email] } : {}),
    subject,
    text,
    reply_to: replyTo,
    ...(attachments.length ? { attachments } : {}),
    tags: [
      { name: "channel", value: "web_reply" },
      { name: "tenant", value: tagValue(route.tenant_code, "tenant") },
      { name: "system", value: tagValue(route.system_code, "system") },
    ],
  };

  const resend = await resendApi(env, payload, idempotencyKey);
  return {
    ok: true,
    id: String(resend?.id || ""),
    provider: "resend",
    gatewayVersion: VERSION,
    routeVersion: ROUTE_VERSION,
    domainMode: route.domain_mode,
    mailDomain: route.mail_domain,
    replyTo,
    archiveCopy: Boolean(route.archive_enabled && route.archive_email),
  };
}

function parseReplyRecipient(env, recipient) {
  const target = String(recipient || "").trim().toLowerCase();
  const at = target.lastIndexOf("@");
  if (at <= 0) return null;
  const localPart = target.slice(0, at);
  let domain;
  try { domain = normalizeDomain(target.slice(at + 1), "recipient_domain", 400); }
  catch (_) { return null; }

  const replyLocal = normalizeLocal(value(env, "MAIL_REPLY_LOCAL", "r"), "r");
  const prefix = `${replyLocal}+`;
  if (!localPart.startsWith(prefix)) return null;
  const rest = localPart.slice(prefix.length);
  const dot = rest.indexOf(".");
  if (dot <= 0) return null;

  const routeToken = rest.slice(0, dot).toLowerCase();
  const threadId = rest.slice(dot + 1).toLowerCase();
  if (!ROUTE_TOKEN_RE.test(routeToken) || !UUID_RE.test(threadId)) return null;
  return { routeToken, threadId, domain };
}

function bytesToBase64Url(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function utf8ToBase64Url(text) {
  return bytesToBase64Url(new TextEncoder().encode(String(text || "")));
}

async function importSigningPrivateKey(env) {
  let jwk;
  try { jwk = JSON.parse(value(env, "MAIL_GATEWAY_SIGNING_PRIVATE_JWK")); }
  catch (_) { fail("invalid_MAIL_GATEWAY_SIGNING_PRIVATE_JWK", 503); }
  try {
    return await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign"],
    );
  } catch (_) {
    fail("invalid_MAIL_GATEWAY_SIGNING_PRIVATE_JWK", 503);
  }
}

async function signInbound(env, canonical) {
  const key = await importSigningPrivateKey(env);
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(canonical),
  );
  return bytesToBase64Url(new Uint8Array(sig));
}

async function deliverInboundToStore(message, env, route, parsed) {
  const rawSize = Number(message?.rawSize || 0);
  if (rawSize > MAX_RAW_BYTES) fail("inbound_message_too_large", 413);

  const rawBytes = new Uint8Array(await new Response(message.raw).arrayBuffer());
  if (rawBytes.byteLength > MAX_RAW_BYTES) fail("inbound_message_too_large", 413);

  const meta = {
    version: VERSION,
    from: String(message?.from || "").slice(0, 320),
    to: String(message?.to || "").slice(0, 320),
    subject: String(message?.headers?.get("subject") || "").replace(/[\r\n]+/g, " ").slice(0, 500),
    date: String(message?.headers?.get("date") || "").replace(/[\r\n]+/g, " ").slice(0, 200),
    messageId: String(message?.headers?.get("message-id") || "").replace(/[\r\n]+/g, " ").slice(0, 600),
    rawSize: rawBytes.byteLength,
  };

  const metaB64 = utf8ToBase64Url(JSON.stringify(meta));
  const bodyHash = await sha256Hex(rawBytes);
  const timestamp = String(Date.now());
  const canonical = [
    "DPRO-MAIL-R3",
    timestamp,
    parsed.routeToken,
    parsed.threadId,
    bodyHash,
    metaB64,
  ].join("\n");
  const signature = await signInbound(env, canonical);

  const target = `${route.worker_url}/api/internal/contact/mail-gateway/inbound`;
  const response = await fetch(target, {
    method: "POST",
    headers: {
      "content-type": "message/rfc822",
      "x-dpro-mail-version": VERSION,
      "x-dpro-mail-timestamp": timestamp,
      "x-dpro-mail-route-token": parsed.routeToken,
      "x-dpro-mail-thread-id": parsed.threadId,
      "x-dpro-mail-meta": metaB64,
      "x-dpro-mail-signature": signature,
    },
    body: rawBytes,
  });

  const text = await response.text();
  const data = text ? safeJson(text) : {};
  if (!response.ok || data?.ok === false) {
    const e = new Error(data?.error || `store_inbound_${response.status}`);
    e.status = response.status >= 500 ? 502 : 409;
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
  const text = await response.text();
  const data = text ? safeJson(text) : {};
  if (!response.ok) {
    const e = new Error(data?.message || data?.error?.message || data?.name || `resend_api_${response.status}`);
    e.status = response.status === 429 ? 429 : response.status >= 500 ? 502 : 400;
    throw e;
  }
  return data;
}

function safeJson(text) {
  try { return JSON.parse(text); } catch (_) { return {}; }
}
