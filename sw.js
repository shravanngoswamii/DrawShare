// CACHE and PRECACHE are rewritten at build time by the `sw-precache` plugin in
// vite.config.ts: CACHE gets a per-build id (so every deploy installs a fresh
// worker and purges old caches) and PRECACHE is filled with the build's real
// asset URLs. The defaults below are only used by the dev server.
const CACHE = "drawshare-ca2d876a";
const PRECACHE = ["/DrawShare/","/DrawShare/apple-touch-icon.png","/DrawShare/assets/EditorView-LfDpzKle.js","/DrawShare/assets/HelpPanel-DljHGbQ2.js","/DrawShare/assets/LandingView-BnnN3our.js","/DrawShare/assets/NewProjectDialog-Bd-E_HZ0.js","/DrawShare/assets/NotFoundView-BCKdOp-i.js","/DrawShare/assets/PrivacyView-DJcLFEnM.js","/DrawShare/assets/ProjectsView-BVBC-UAc.js","/DrawShare/assets/SnapshotView-DRWgaY4x.js","/DrawShare/assets/ViewerView-Bovwy8CD.js","/DrawShare/assets/index-BTEOkT6T.js","/DrawShare/assets/ink-DuT3z4up.js","/DrawShare/assets/live-hb9-jk1G.js","/DrawShare/assets/shareLinks-Cpm1XWlc.js","/DrawShare/assets/style-CazIVgFo.css","/DrawShare/assets/useSnapshot-igPqZI0q.js","/DrawShare/assets/useStackRenderer-Dj1dfGNP.js","/DrawShare/assets/useThumbnails-DCtjH6Yn.js","/DrawShare/favicon.svg","/DrawShare/icon-192.png","/DrawShare/icon-512.png","/DrawShare/index.html","/DrawShare/manifest.webmanifest","/DrawShare/og-image.png"];

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
