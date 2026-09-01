/* TrackDash service worker — network-first navigations + Namaz push reminders */
/**
 * Bumping this name is what triggers the purge in `activate` below. It matters
 * more than it looks: `trackdash-v1` precached "/" and answered *every* GET
 * cache-first, including navigations — back when "/" rendered the Dashboard.
 * Any browser from that era can still hold that HTML, which is why the app
 * appeared to keep landing on the Dashboard long after the route moved.
 */
const CACHE = "trackdash-v5";
const PRECACHE = [
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

const HOME_PATH = "/namaz";

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
      // Drop any HTML an older worker stored, including its precached "/".
      .then(() =>
        caches.open(CACHE).then((cache) =>
          cache.keys().then((requests) =>
            Promise.all(
              requests
                .filter((r) => r.mode === "navigate" || r.url.endsWith("/"))
                .map((r) => cache.delete(r))
            )
          )
        )
      )
      .then(() => self.clients.claim())
  );
});

/** Lets a waiting worker take over as soon as the page asks it to. */
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
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

  /**
   * HTML navigations: network only.
   *
   * Nothing here ever *writes* a navigation into the cache, so a cache hit
   * could only be a stale page left by an older service worker — exactly what
   * pinned the app to the old Dashboard "/" for so long. Falling back to the
   * offline notice instead means a redirect can never be answered from a cache.
   */
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => offlineFallback()));
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

/* ------------------------------------------------------------------ push */

function parsePush(event) {
  if (!event.data) return null;
  try {
    return event.data.json();
  } catch {
    return { title: "TrackDash", body: event.data.text(), url: HOME_PATH };
  }
}

self.addEventListener("push", (event) => {
  const payload = parsePush(event) || {
    title: "TrackDash",
    body: "You have a prayer waiting to be marked.",
    url: HOME_PATH,
  };

  event.waitUntil(
    self.registration.showNotification(payload.title || "TrackDash", {
      body: payload.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: payload.tag || "trackdash",
      renotify: Boolean(payload.renotify),
      requireInteraction: Boolean(payload.requireInteraction),
      // Vibration is what makes it feel like a normal phone notification.
      vibrate: [180, 80, 180],
      timestamp: Date.now(),
      actions: Array.isArray(payload.actions) ? payload.actions.slice(0, 2) : [],
      data: {
        url: payload.url || HOME_PATH,
        ...(payload.data || {}),
      },
    })
  );
});

/** Open the app at `path`, reusing an already-open tab when there is one. */
async function openApp(path) {
  const clientList = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });

  for (const client of clientList) {
    if (new URL(client.url).origin === self.location.origin) {
      await client.focus();
      if ("navigate" in client) {
        try {
          await client.navigate(path);
        } catch {
          /* focus alone is enough */
        }
      }
      return;
    }
  }

  await self.clients.openWindow(path);
}

/** Record the prayer straight from the notification, without opening the app. */
async function markPrayed(data) {
  const response = await fetch("/api/namaz", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      prayer: data.prayer,
      prayed: true,
      date: data.date,
    }),
  });

  if (!response.ok) throw new Error(`Mark failed (${response.status})`);

  // Tell any open tab to refresh so its checklist matches.
  const clientList = await self.clients.matchAll({ type: "window" });
  for (const client of clientList) {
    client.postMessage({ type: "namaz-updated", prayer: data.prayer });
  }

  await self.registration.showNotification("Recorded", {
    body: "Marked as prayed on time.",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: `namaz-done-${data.date}-${data.prayer}`,
    vibrate: [90],
  });
}

self.addEventListener("notificationclick", (event) => {
  const data = event.notification.data || {};
  const target = data.url || HOME_PATH;
  event.notification.close();

  if (event.action === "prayed" && data.prayer && data.date) {
    event.waitUntil(
      markPrayed(data).catch(() =>
        // Session expired or offline — fall back to opening the checklist.
        openApp(target)
      )
    );
    return;
  }

  event.waitUntil(openApp(target));
});

/**
 * Push services rotate endpoints. When that happens the old subscription stops
 * working silently, so re-subscribe and hand the new endpoint to the server.
 */
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const response = await fetch("/api/push", { credentials: "include" });
        if (!response.ok) return;
        const payload = await response.json();
        const key = payload?.data?.vapidPublicKey;
        if (!key) return;

        const subscription = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: key,
        });

        await fetch("/api/push", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(subscription.toJSON()),
        });
      } catch {
        /* nothing useful to do here — the app re-registers on next open */
      }
    })()
  );
});
