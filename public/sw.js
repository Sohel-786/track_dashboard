/* TrackDash service worker — network-first navigations, safe offline fallback */
const CACHE = "trackdash-v2";
const PRECACHE = [
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

function offlineFallback() {
  return new Response(
    "<!DOCTYPE html><html><head><meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1'><title>TrackDash Offline</title></head><body style='font-family:system-ui;display:grid;place-items:center;min-height:100dvh;margin:0;background:#0f172a;color:#e2e8f0'><div style='text-align:center;padding:1.5rem'><h1 style='margin:0 0 .5rem'>You're offline</h1><p style='margin:0;opacity:.8'>Reconnect and open TrackDash again.</p></div></body></html>",
    {
      status: 503,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    }
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  // HTML navigations: always prefer network so login/auth redirects stay fresh.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => response)
        .catch(() =>
          caches.match(request).then((cached) => cached || offlineFallback())
        )
    );
    return;
  }

  // Static assets: cache-first with network refresh; never resolve undefined.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.ok && response.type === "basic") {
            const clone = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => cached || offlineFallback());

      return cached || network;
    })
  );
});
