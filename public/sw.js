// Aloya service worker — push notifications + offline resilient PWA cache.
// NetworkFirst for HTML with Cache fallback to keep new deploys fresh,
// StaleWhileRevalidate for assets so scripts and styles load offline.

const CACHE = "aloya-v2";
const SCHEDULE_CACHE = "aloya-schedule-v1"; // preserved across SW updates
const PRECACHE_URLS = ["/offline.html", "/manifest.webmanifest", "/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE_URLS).catch(() => {})),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((n) => n !== CACHE && n !== SCHEDULE_CACHE).map((n) => caches.delete(n)),
      );
      await self.clients.claim();
    })(),
  );
});

// Cache-first for offline schedule shards. The downloader pre-populates the
// cache; this listener serves cached responses immediately and falls back to
// network if missing.
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // 1. Static schedule shards
  if (url.origin === self.location.origin && url.pathname.startsWith("/data/schedule/")) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(SCHEDULE_CACHE);
        const cached = await cache.match(req);
        if (cached) return cached;
        try {
          const fresh = await fetch(req);
          return fresh;
        } catch {
          return new Response("Offline", { status: 503 });
        }
      })(),
    );
    return;
  }

  // 1b. Scanner engines (OCR core, language data, QR wasm): cache-first so the
  // card scanner works offline after its first use.
  if (url.origin === self.location.origin && url.pathname.startsWith("/ocr/")) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const cached = await cache.match(req);
        if (cached) return cached;
        const fresh = await fetch(req);
        if (fresh && fresh.status === 200) cache.put(req, fresh.clone());
        return fresh;
      })(),
    );
    return;
  }

  // 2. Production assets & static media: Stale-While-Revalidate
  if (
    url.origin === self.location.origin &&
    (url.pathname.startsWith("/assets/") ||
      /\.(js|css|woff2|woff|ttf|png|jpg|jpeg|svg|webp|ico)$/i.test(url.pathname))
  ) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const cached = await cache.match(req);
        const fetchPromise = fetch(req)
          .then((networkRes) => {
            if (networkRes && networkRes.status === 200) {
              cache.put(req, networkRes.clone());
            }
            return networkRes;
          })
          .catch(() => null);

        return cached || (await fetchPromise) || new Response("Asset offline", { status: 503 });
      })(),
    );
    return;
  }

  // 3. Navigation requests: Network-first, fallback to cached route, root shell, or offline.html
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(req);
          if (fresh && fresh.status === 200) {
            const cache = await caches.open(CACHE);
            cache.put(req, fresh.clone());
            if (url.pathname === "/") {
              cache.put("/index.html", fresh.clone());
            }
          }
          return fresh;
        } catch (e) {
          const cache = await caches.open(CACHE);
          const cached = await cache.match(req);
          if (cached) return cached;
          const rootCached = await cache.match("/");
          if (rootCached) return rootCached;
          const offlinePage = await cache.match("/offline.html");
          return (
            offlinePage ||
            new Response("Offline — please reconnect to the internet.", {
              status: 503,
              headers: { "Content-Type": "text/plain; charset=utf-8" },
            })
          );
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
