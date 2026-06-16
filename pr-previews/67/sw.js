// CACHE and PRECACHE are rewritten at build time by the `sw-precache` plugin in
// vite.config.ts: CACHE gets a per-build id (so every deploy installs a fresh
// worker and purges old caches) and PRECACHE is filled with the build's real
// asset URLs. The defaults below are only used by the dev server.
const CACHE = "drawshare-656ee834";
const PRECACHE = ["/DrawShare/pr-previews/67/","/DrawShare/pr-previews/67/apple-touch-icon.png","/DrawShare/pr-previews/67/assets/EditorView-B7FDr1QB.js","/DrawShare/pr-previews/67/assets/LandingView-C6iI1LrU.js","/DrawShare/pr-previews/67/assets/ProjectsView-DOMkBAUF.js","/DrawShare/pr-previews/67/assets/SnapshotView-B35oXvTR.js","/DrawShare/pr-previews/67/assets/ViewerView-DTICPCju.js","/DrawShare/pr-previews/67/assets/_plugin-vue_export-helper-CXasqrKq.js","/DrawShare/pr-previews/67/assets/images-CjNWycI3.js","/DrawShare/pr-previews/67/assets/index-D6BVgW12.js","/DrawShare/pr-previews/67/assets/ink-Df8t6LnF.js","/DrawShare/pr-previews/67/assets/live-CBpLbJFd.js","/DrawShare/pr-previews/67/assets/style-BZzcZCkp.css","/DrawShare/pr-previews/67/assets/useSnapshot-igPqZI0q.js","/DrawShare/pr-previews/67/assets/useStackRenderer-CJatySET.js","/DrawShare/pr-previews/67/assets/useThumbnails-BGCT7Mpe.js","/DrawShare/pr-previews/67/favicon.svg","/DrawShare/pr-previews/67/icon-192.png","/DrawShare/pr-previews/67/icon-512.png","/DrawShare/pr-previews/67/index.html","/DrawShare/pr-previews/67/manifest.webmanifest"];

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
