// CACHE and PRECACHE are rewritten at build time by the `sw-precache` plugin in
// vite.config.ts: CACHE gets a per-build id (so every deploy installs a fresh
// worker and purges old caches) and PRECACHE is filled with the build's real
// asset URLs. The defaults below are only used by the dev server.
const CACHE = "drawshare-2743d505";
const PRECACHE = ["/DrawShare/pr-previews/77/","/DrawShare/pr-previews/77/apple-touch-icon.png","/DrawShare/pr-previews/77/assets/EditorView-OLn1EI4B.js","/DrawShare/pr-previews/77/assets/LandingView-Dw2TrFBp.js","/DrawShare/pr-previews/77/assets/ProjectsView-c-aW_D3W.js","/DrawShare/pr-previews/77/assets/SnapshotView-CEkQ6ilO.js","/DrawShare/pr-previews/77/assets/ViewerView-Cva91r9O.js","/DrawShare/pr-previews/77/assets/_plugin-vue_export-helper-B1RzTrr_.js","/DrawShare/pr-previews/77/assets/canvas2d-j-s2RDKe.js","/DrawShare/pr-previews/77/assets/index-D74-U6xU.js","/DrawShare/pr-previews/77/assets/ink-Dfh4FB4e.js","/DrawShare/pr-previews/77/assets/live-BVzLp--7.js","/DrawShare/pr-previews/77/assets/style-Csyp9Sw3.css","/DrawShare/pr-previews/77/assets/sync-Cmrce1cQ.js","/DrawShare/pr-previews/77/assets/useSnapshot-igPqZI0q.js","/DrawShare/pr-previews/77/assets/useStackRenderer-BuFqQO8J.js","/DrawShare/pr-previews/77/assets/useThumbnails-BU5NM29b.js","/DrawShare/pr-previews/77/favicon.svg","/DrawShare/pr-previews/77/icon-192.png","/DrawShare/pr-previews/77/icon-512.png","/DrawShare/pr-previews/77/index.html","/DrawShare/pr-previews/77/manifest.webmanifest"];

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
