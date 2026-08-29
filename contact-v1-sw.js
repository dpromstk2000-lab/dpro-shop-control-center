const DPRO_CONTACT_SW_VERSION = "DPRO-CONTACT-PWA-SW-R1-20260830";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

async function setBadge(count) {
  try {
    const n = Number(count);
    if (Number.isFinite(n) && n > 0 && self.navigator && "setAppBadge" in self.navigator) {
      await self.navigator.setAppBadge(n);
    } else if (self.navigator && "clearAppBadge" in self.navigator) {
      await self.navigator.clearAppBadge();
    }
  } catch (_) {
    // Badge API differs by browser/OS.
  }
}

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type !== "DPRO_CONTACT_BADGE") return;
  event.waitUntil(setBadge(data.count || 0));
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_) {
    data = { body: event.data ? event.data.text() : "" };
  }

  const count = Number(data.badgeCount ?? data.count ?? 1);
  const title = data.title || "DPRO CONTACT";
  const options = {
    body: data.body || "先方から新しい返信があります。",
    icon: "./dpro-contact-icon-192.png",
    badge: "./dpro-contact-icon-192.png",
    tag: data.tag || "dpro-contact-reply",
    renotify: true,
    data: {
      url: data.url || "./contact-v1.html"
    }
  };

  event.waitUntil(Promise.all([
    self.registration.showNotification(title, options),
    setBadge(count)
  ]));
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
