const DPRO_CONTACT_SW_VERSION = "DPRO-CONTACT-PWA-SW-R3-20260909-BADGE-SYNC";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
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

  if (data?.clearThread && data?.threadId) {
    await clearThreadNotification(data.threadId);
  }

  if (count <= 0) {
    const notifications = await contactNotifications();
    notifications.forEach((item) => item.close());
  }

  // Tell any open CONTACT windows to refresh immediately instead of waiting
  // for their normal refresh interval.
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
    const count = await setBadge(data.count || 0);
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
    // R3 encrypted payload: state-only pushes never create a false notification.
    if (data?.type === "DPRO_CONTACT_STATE_SYNC" || data?.kind === "sync") {
      await applyStateSync(data);
      return;
    }

    // R3 new-message payload (or a future payload with a badge count).
    if (data?.type === "DPRO_CONTACT_NEW_MESSAGE" || data?.kind === "new_message") {
      const count = await setBadge(data?.badgeCount ?? data?.count ?? 0);
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
      if (count <= 0) await setBadge(1);
      return;
    }

    // Backward compatibility during deployment: the existing R2 Worker used
    // empty Web Push payloads. Continue showing those as genuine new-message
    // notifications until the R3 Worker is deployed.
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
      await setBadge(data?.badgeCount ?? data?.count ?? 0);
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
