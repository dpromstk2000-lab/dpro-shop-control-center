const DPRO_CONTACT_SW_VERSION = "DPRO-CONTACT-PWA-SW-R2-20260830-WEB-PUSH";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

async function setBadge(count) {
  const n = Math.max(0, Math.floor(Number(count) || 0));

  try {
    if (n > 0 && self.navigator && "setAppBadge" in self.navigator) {
      await self.navigator.setAppBadge(n);
    } else if (n <= 0 && self.navigator && "clearAppBadge" in self.navigator) {
      await self.navigator.clearAppBadge();
    }
  } catch (_) {
    // Android launchers normally derive their badge/dot from active notifications.
  }

  // Keep Android's notification-backed launcher badge aligned when the app
  // later learns the authoritative pending-thread count.
  try {
    const notifications = await self.registration.getNotifications();
    if (notifications.length > n) {
      notifications.slice(n).forEach((item) => item.close());
    }
  } catch (_) {}
}

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type !== "DPRO_CONTACT_BADGE") return;

  event.waitUntil((async () => {
    await setBadge(data.count || 0);
    try {
      event.source?.postMessage?.({
        type: "DPRO_CONTACT_BADGE_ACK",
        count: Number(data.count || 0),
        version: DPRO_CONTACT_SW_VERSION,
      });
    } catch (_) {}
  })());
});

self.addEventListener("push", (event) => {
  let data = {};
  let hasPayload = false;

  try {
    if (event.data) {
      hasPayload = true;
      data = event.data.json();
    }
  } catch (_) {
    hasPayload = Boolean(event.data);
    data = { body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "先方から返信があります";
  const options = {
    body: data.body || "DPRO CONTACTに新しい返信があります。",
    icon: "./dpro-contact-icon-192.png",
    badge: "./dpro-contact-icon-192.png",
    tag: data.tag || `dpro-contact-reply-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    renotify: true,
    timestamp: Date.now(),
    data: {
      url: data.url || "./contact-v1.html"
    }
  };

  event.waitUntil((async () => {
    await self.registration.showNotification(title, options);

    // Encrypted-payload support can supply an authoritative count in the future.
    // R2 intentionally uses empty Web Push payloads so the Cloudflare Worker
    // needs VAPID signing only; Android still receives a real OS notification.
    if (hasPayload && (data.badgeCount != null || data.count != null)) {
      await setBadge(Number(data.badgeCount ?? data.count ?? 0));
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
