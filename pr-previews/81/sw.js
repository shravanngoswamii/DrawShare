// CACHE and PRECACHE are rewritten at build time by the `sw-precache` plugin in
// vite.config.ts: CACHE gets a per-build id (so every deploy installs a fresh
// worker and purges old caches) and PRECACHE is filled with the build's real
// asset URLs. The defaults below are only used by the dev server.
const CACHE = "drawshare-1a284f8a";
const PRECACHE = ["/DrawShare/pr-previews/81/","/DrawShare/pr-previews/81/apple-touch-icon.png","/DrawShare/pr-previews/81/assets/EditorView-CdyAmQxN.js","/DrawShare/pr-previews/81/assets/HelpPanel-Co6BbMSo.js","/DrawShare/pr-previews/81/assets/LandingView-Dry8ttin.js","/DrawShare/pr-previews/81/assets/NewProjectDialog-BFAInP5f.js","/DrawShare/pr-previews/81/assets/NotFoundView-DqeqTJ2m.js","/DrawShare/pr-previews/81/assets/ProjectsView-D_hWmW9G.js","/DrawShare/pr-previews/81/assets/SnapshotView-l_saNeCS.js","/DrawShare/pr-previews/81/assets/ViewerView-D-uMneT5.js","/DrawShare/pr-previews/81/assets/index-BoQ8EBMT.js","/DrawShare/pr-previews/81/assets/ink-erg3CDYj.js","/DrawShare/pr-previews/81/assets/live-C5YVkO3D.js","/DrawShare/pr-previews/81/assets/shareLinks-C_qBr_vI.js","/DrawShare/pr-previews/81/assets/style-L-wfceS3.css","/DrawShare/pr-previews/81/assets/useSnapshot-igPqZI0q.js","/DrawShare/pr-previews/81/assets/useStackRenderer-LaTvX6Wn.js","/DrawShare/pr-previews/81/assets/useThumbnails-DodDxdum.js","/DrawShare/pr-previews/81/favicon.svg","/DrawShare/pr-previews/81/icon-192.png","/DrawShare/pr-previews/81/icon-512.png","/DrawShare/pr-previews/81/index.html","/DrawShare/pr-previews/81/manifest.webmanifest","/DrawShare/pr-previews/81/og-image.png"];

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
