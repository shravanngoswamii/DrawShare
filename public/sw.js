const CACHE = "drawshare-v5";

self.addEventListener("install", (event) => {
  // Pre-cache the app shell so navigate requests can be served offline.
  // Failure (e.g. no network during SW update) is non-fatal.
  event.waitUntil(caches.open(CACHE).then((cache) => cache.add("./").catch(() => {})));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  if (new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, clone));
        }
        return response;
      });
      if (cached) {
        networkFetch.catch(() => {});
        return cached;
      }
      // Navigate requests that aren't cached yet fall back to the app root
      // (the SPA handles all routes client-side).
      if (request.mode === "navigate") {
        return networkFetch.catch(() => caches.match("./").then((r) => r ?? Response.error()));
      }
      return networkFetch.catch(() => Response.error());
    }),
  );
});
