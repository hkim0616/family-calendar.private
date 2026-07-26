/*
 * Family Hub service worker.
 *
 * Three jobs: make the app installable, give it a friendly screen when the
 * phone is offline, and receive push notifications. It does NOT cache pages or
 * data.
 *
 * Why so conservative: cached HTML is how PWAs end up showing one person's
 * signed-in screen to someone else, or yesterday's grocery list as if it were
 * current. Family data is always fetched live; only the shell assets and an
 * offline notice are stored.
 *
 * Bump CACHE_VERSION to force every phone to drop its old cache.
 */
const CACHE_VERSION = "family-hub-v2";
const OFFLINE_URL = "/offline";

const PRECACHE = [OFFLINE_URL, "/manifest.webmanifest", "/icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      // Individually, so one failure doesn't abort the whole install.
      await Promise.allSettled(PRECACHE.map((url) => cache.add(url)));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

/** Build assets are content-hashed, so they're safe to serve from cache. */
function isImmutableAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/")
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only GETs are cacheable, and only on our own origin. Everything else —
  // including every Supabase call and every sign-in request — goes straight
  // to the network, untouched.
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (isImmutableAsset(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE_VERSION);
        const hit = await cache.match(request);
        if (hit) return hit;

        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      })(),
    );
    return;
  }

  // Page loads: always live. If the network is gone, show the offline notice.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch {
          const cache = await caches.open(CACHE_VERSION);
          return (
            (await cache.match(OFFLINE_URL)) ||
            new Response("You are offline.", {
              status: 503,
              headers: { "Content-Type": "text/plain" },
            })
          );
        }
      })(),
    );
  }
});


/* ═══════════════════════════════════════════════════════════════════════════
 * PUSH NOTIFICATIONS
 * ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Turns a push payload into the arguments for showNotification.
 *
 * Kept tolerant on purpose: a push that arrives with no body, or with something
 * that isn't JSON, must still produce a visible notification. iOS terminates the
 * service worker — and can revoke the push permission — if a push event ends
 * without one being shown.
 */
function notificationFromPayload(rawText) {
  const fallback = {
    title: "Family Hub",
    options: {
      body: "You have a new reminder.",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: "/" },
    },
  };

  if (!rawText) return fallback;

  let payload;
  try {
    payload = JSON.parse(rawText);
  } catch {
    // Not JSON — show the raw text rather than nothing.
    return {
      title: "Family Hub",
      options: { ...fallback.options, body: String(rawText).slice(0, 200) },
    };
  }

  if (!payload || typeof payload !== "object") return fallback;

  return {
    title: payload.title || fallback.title,
    options: {
      body: payload.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      // Same tag replaces an earlier notification instead of stacking.
      tag: payload.tag || undefined,
      data: { url: payload.url || "/" },
    },
  };
}

self.addEventListener("push", (event) => {
  const raw = (() => {
    try {
      return event.data ? event.data.text() : "";
    } catch {
      return "";
    }
  })();

  const { title, options } = notificationFromPayload(raw);
  // waitUntil keeps the worker alive until the notification is on screen.
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url || "/";

  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      // Reuse an open window if there is one, rather than piling up tabs.
      for (const client of clientList) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client) {
            try {
              await client.navigate(target);
            } catch {
              // Navigation can be refused; a focused window is still better
              // than nothing.
            }
          }
          return;
        }
      }

      if (self.clients.openWindow) await self.clients.openWindow(target);
    })(),
  );
});

/**
 * Fired when the push service rotates a subscription out from under us. The
 * app re-subscribes next time it is opened; this just clears the stale one so
 * the settings screen doesn't claim notifications are on when they aren't.
 */
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({ type: "window" });
      for (const client of clientList) {
        client.postMessage({ type: "push-subscription-expired" });
      }
    })(),
  );
});

// Exposed for unit tests; harmless in the browser.
if (typeof module !== "undefined" && module.exports) {
  module.exports = { notificationFromPayload };
}
