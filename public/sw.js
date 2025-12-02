// Aloya service worker — push notifications + basic navigation cache.
// Kept tiny on purpose: NetworkFirst for HTML so new deploys reach users.

const CACHE = "aloya-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

// Network-first for navigations. Never serve a stale HTML shell.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          return fresh;
        } catch (e) {
          const cache = await caches.open(CACHE);
          const cached = await cache.match("/offline");
          return cached || new Response("Offline", { status: 503 });
        }
      })(),
    );
  }
});

// ----- Push notifications -----

self.addEventListener("push", (event) => {
  let payload = { title: "Aloya", body: "" };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    if (event.data) payload.body = event.data.text();
  }

  const {
    title = "Aloya",
    body = "",
    tag,
    url = "/",
    badge = "/icon-192.png",
    icon = "/icon-192.png",
    requireInteraction = false,
    silent = false,
    vibrate,
  } = payload;

  event.waitUntil(
    (async () => {
      // Speak the alert via any open client (SW has no speechSynthesis).
      try {
        const clients = await self.clients.matchAll({
          type: "window",
          includeUncontrolled: true,
        });
        const spoken = [title, body].filter(Boolean).join(". ");
        for (const c of clients) {
          c.postMessage({ type: "aloya-speak", text: spoken });
        }
      } catch {}

      await self.registration.showNotification(title, {
        body,
        tag,
        icon,
        badge,
        data: { url },
        requireInteraction,
        silent,
        vibrate,
      });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of all) {
        try {
          const url = new URL(client.url);
          if (url.origin === self.location.origin) {
            await client.focus();
            if ("navigate" in client) await client.navigate(targetUrl);
            return;
          }
        } catch {}
      }
      await self.clients.openWindow(targetUrl);
    })(),
  );
});
