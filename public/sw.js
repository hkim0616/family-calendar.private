/*
 * Family Hub service worker.
 *
 * Its job is narrow on purpose: make the app installable and give it a
 * friendly screen when the phone is offline. It does NOT cache pages or data.
 *
 * Why so conservative: cached HTML is how PWAs end up showing one person's
 * signed-in screen to someone else, or yesterday's grocery list as if it were
 * current. Family data is always fetched live; only the shell assets and an
 * offline notice are stored.
 *
 * Bump CACHE_VERSION to force every phone to drop its old cache.
 */
const CACHE_VERSION = "family-hub-v1";
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
