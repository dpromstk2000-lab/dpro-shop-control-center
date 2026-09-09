const DPRO_CONTACT_SW_VERSION = "DPRO-CONTACT-PWA-SW-R3.1-20260909-AUTHORITATIVE-BADGE";
const DPRO_CONTACT_BADGE_CACHE = "dpro-contact-badge-state-r3";
const DPRO_CONTACT_BADGE_STATE_URL = new URL("./__dpro-contact-badge-state__", self.location.href).href;
const DPRO_CONTACT_AUTHORITATIVE_GUARD_MS = 120000;

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    await self.clients.claim();
    const saved = await readAuthoritativeBadge();
    if (saved) await setBadge(saved.count);
  })());
});

const countValue = (value) => Math.max(0, Math.floor(Number(value) || 0));

async function setBadge(count) {
  const n = countValue(count);
  try {
    if (n > 0 && self.navigator && "setAppBadge" in self.navigator) {
      await self.navigator.setAppBadge(n);
    } else if (n <= 0 && self.navigator && "clearAppBadge" in self.navigator) {
      await self.navigator.clearAppBadge();
    }
  } catch (_) {
    // Android launchers may derive badges from active notifications instead.
  }
  return n;
}

async function storeAuthoritativeBadge(count, meta = {}) {
  try {
    const cache = await caches.open(DPRO_CONTACT_BADGE_CACHE);
    await cache.put(DPRO_CONTACT_BADGE_STATE_URL, new Response(JSON.stringify({
      count: countValue(count),
      at: Date.now(),
      reason: String(meta?.reason || "worker_push"),
      version: DPRO_CONTACT_SW_VERSION,
    }), {
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
      },
    }));
  } catch (_) {}
}

async function readAuthoritativeBadge() {
  try {
    const cache = await caches.open(DPRO_CONTACT_BADGE_CACHE);
    const response = await cache.match(DPRO_CONTACT_BADGE_STATE_URL);
    if (!response) return null;
    const data = await response.json();
    const at = Number(data?.at || 0);
    if (!Number.isFinite(at) || at <= 0) return null;
    return {
      count: countValue(data?.count),
      at,
      reason: String(data?.reason || ""),
    };
  } catch (_) {
    return null;
  }
}

async function resolvePageBadge(data) {
  const requested = countValue(data?.count);
  const pageVersion = String(data?.version || "");
  if (!pageVersion.includes("R2")) return requested;

  const authoritative = await readAuthoritativeBadge();
  if (!authoritative) return requested;
  if (Date.now() - authoritative.at > DPRO_CONTACT_AUTHORITATIVE_GUARD_MS) return requested;

  // The current R2 page can re-send a stale lastBadgeCount during pagehide.
  // For a short period after an R3 Worker push, the Worker-confirmed value wins.
  return authoritative.count;
}

async function contactNotifications() {
  try {
    return await self.registration.getNotifications();
  } catch (_) {
    return [];
  }
}

async function clearThreadNotification(threadId) {
  if (!threadId) return;
  const target = String(threadId);
  const notifications = await contactNotifications();
  notifications.forEach((item) => {
    const itemThread = String(item?.data?.threadId || "");
    if (itemThread === target || item.tag === `dpro-contact-${target}`) item.close();
  });
}

async function applyStateSync(data) {
  const count = await setBadge(data?.badgeCount ?? data?.count ?? 0);
  await storeAuthoritativeBadge(count, { reason: data?.reason || "state_sync" });

  if (data?.clearThread && data?.threadId) {
    await clearThreadNotification(data.threadId);
  }

  if (count <= 0) {
    const notifications = await contactNotifications();
    notifications.forEach((item) => item.close());
  }

  try {
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    clients.forEach((client) => client.postMessage({
      type: "DPRO_CONTACT_STATE_SYNC",
      badgeCount: count,
      threadId: data?.threadId || null,
      reason: data?.reason || "push_sync",
      version: DPRO_CONTACT_SW_VERSION,
    }));
  } catch (_) {}
}

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type !== "DPRO_CONTACT_BADGE") return;

  event.waitUntil((async () => {
    const count = await resolvePageBadge(data);
    await setBadge(count);
    if (count <= 0) {
      const notifications = await contactNotifications();
      notifications.forEach((item) => item.close());
    }
    try {
      event.source?.postMessage?.({
        type: "DPRO_CONTACT_BADGE_ACK",
        count,
        version: DPRO_CONTACT_SW_VERSION,
      });
    } catch (_) {}
  })());
});

self.addEventListener("push", (event) => {
  let data = null;
  let hasPayload = false;

  try {
    if (event.data) {
      hasPayload = true;
      data = event.data.json();
    }
  } catch (_) {
    try {
      data = event.data ? { body: event.data.text() } : null;
      hasPayload = Boolean(event.data);
    } catch (_) {
      data = null;
      hasPayload = false;
    }
  }

  event.waitUntil((async () => {
    if (data?.type === "DPRO_CONTACT_STATE_SYNC" || data?.kind === "sync") {
      await applyStateSync(data);
      return;
    }

    if (data?.type === "DPRO_CONTACT_NEW_MESSAGE" || data?.kind === "new_message") {
      const count = await setBadge(data?.badgeCount ?? data?.count ?? 0);
      const finalCount = count > 0 ? count : 1;
      if (finalCount !== count) await setBadge(finalCount);
      await storeAuthoritativeBadge(finalCount, { reason: data?.reason || "new_message" });

      const threadId = data?.threadId ? String(data.threadId) : "reply";
      await self.registration.showNotification(data.title || "先方から返信があります", {
        body: data.body || "DPRO CONTACTに新しい返信があります。",
        icon: "./dpro-contact-icon-192.png",
        badge: "./dpro-contact-icon-192.png",
        tag: `dpro-contact-${threadId}`,
        renotify: true,
        timestamp: Date.now(),
        data: {
          url: data.url || "./contact-v1.html",
          threadId: data?.threadId || null,
        },
      });
      return;
    }

    // Backward compatibility while the existing R2 Worker still sends empty pushes.
    const title = data?.title || "先方から返信があります";
    await self.registration.showNotification(title, {
      body: data?.body || "DPRO CONTACTに新しい返信があります。",
      icon: "./dpro-contact-icon-192.png",
      badge: "./dpro-contact-icon-192.png",
      tag: data?.tag || `dpro-contact-legacy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      renotify: true,
      timestamp: Date.now(),
      data: { url: data?.url || "./contact-v1.html", threadId: data?.threadId || null },
    });

    if (hasPayload && (data?.badgeCount != null || data?.count != null)) {
      const count = await setBadge(data?.badgeCount ?? data?.count ?? 0);
      await storeAuthoritativeBadge(count, { reason: data?.reason || "legacy_payload" });
    }
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification?.data?.url || "./contact-v1.html", self.location.href).href;

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of windows) {
      if ("focus" in client) {
        if ("navigate" in client) {
          try { await client.navigate(targetUrl); } catch (_) {}
        }
        return client.focus();
      }
    }
    if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    return undefined;
  })());
});
