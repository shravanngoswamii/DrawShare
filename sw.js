// CACHE and PRECACHE are rewritten at build time by the `sw-precache` plugin in
// vite.config.ts: CACHE gets a per-build id (so every deploy installs a fresh
// worker and purges old caches) and PRECACHE is filled with the build's real
// asset URLs. The defaults below are only used by the dev server.
const CACHE = "drawshare-e26791f9";
const PRECACHE = ["/DrawShare/","/DrawShare/apple-touch-icon.png","/DrawShare/assets/CloudSyncMenu-4yes6ogy.js","/DrawShare/assets/EditorView-DA0cB9-Z.js","/DrawShare/assets/LandingView-BwDrdU6d.js","/DrawShare/assets/NewProjectDialog-DO-BNp4f.js","/DrawShare/assets/NotFoundView-8RLKQyA7.js","/DrawShare/assets/PrivacyView-CMkZVK5-.js","/DrawShare/assets/ProjectsView-BqLDHAyQ.js","/DrawShare/assets/SnapshotView-CTFg0Sv1.js","/DrawShare/assets/ViewerView-UrAqJG7T.js","/DrawShare/assets/index-BXrQwfmz.js","/DrawShare/assets/ink-fQ-d3Wvi.js","/DrawShare/assets/live-CRbbSLFX.js","/DrawShare/assets/shareLinks-BLyIZXuJ.js","/DrawShare/assets/style-D4dV0p3m.css","/DrawShare/assets/useSnapshot-igPqZI0q.js","/DrawShare/assets/useStackRenderer-DFFfB-2T.js","/DrawShare/assets/useThumbnails-nDuS6GUn.js","/DrawShare/favicon.svg","/DrawShare/icon-192.png","/DrawShare/icon-512.png","/DrawShare/index.html","/DrawShare/manifest.webmanifest","/DrawShare/og-image.png"];

self.addEventListener("install", (event) => {
  // Precache the whole current build — app shell + every hashed JS/CSS chunk
  // (including lazy route chunks) — so all routes work offline immediately,
  // versioned atomically by the build id. Non-fatal if the network is down.
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE).catch(() => {})));
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

  // App-shell navigations: network-first so a new deploy is picked up on the very
  // next load; fall back to the cached shell (the SPA routes client-side) offline.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() =>
          caches
            .match(request)
            .then((r) => r ?? caches.match("./"))
            .then((r) => r ?? Response.error()),
        ),
    );
    return;
  }

  // Everything else is content-hashed and immutable: cache-first, then network.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => Response.error());
    }),
  );
});
