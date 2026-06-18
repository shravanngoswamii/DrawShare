// CACHE and PRECACHE are rewritten at build time by the `sw-precache` plugin in
// vite.config.ts: CACHE gets a per-build id (so every deploy installs a fresh
// worker and purges old caches) and PRECACHE is filled with the build's real
// asset URLs. The defaults below are only used by the dev server.
const CACHE = "drawshare-749d637f";
const PRECACHE = ["/DrawShare/pr-previews/82/","/DrawShare/pr-previews/82/apple-touch-icon.png","/DrawShare/pr-previews/82/assets/EditorView-CgPN1vnL.js","/DrawShare/pr-previews/82/assets/HelpPanel-CW_ygdeI.js","/DrawShare/pr-previews/82/assets/LandingView-Cyx1miNc.js","/DrawShare/pr-previews/82/assets/NewProjectDialog-By7nFZJR.js","/DrawShare/pr-previews/82/assets/NotFoundView-VlhqB6bz.js","/DrawShare/pr-previews/82/assets/PrivacyView-Bw-ZU1P9.js","/DrawShare/pr-previews/82/assets/ProjectsView-G9lzcgjJ.js","/DrawShare/pr-previews/82/assets/SnapshotView-k0HjlrgZ.js","/DrawShare/pr-previews/82/assets/ViewerView-BaDZo0JZ.js","/DrawShare/pr-previews/82/assets/index-ZZgkHU9R.js","/DrawShare/pr-previews/82/assets/ink-ZWIdNhXF.js","/DrawShare/pr-previews/82/assets/live-DsiQJ_Vc.js","/DrawShare/pr-previews/82/assets/shareLinks-wuIJKuND.js","/DrawShare/pr-previews/82/assets/style-SlfN-uW8.css","/DrawShare/pr-previews/82/assets/useSnapshot-igPqZI0q.js","/DrawShare/pr-previews/82/assets/useStackRenderer-CnhzuNBT.js","/DrawShare/pr-previews/82/assets/useThumbnails-DR929b2I.js","/DrawShare/pr-previews/82/favicon.svg","/DrawShare/pr-previews/82/icon-192.png","/DrawShare/pr-previews/82/icon-512.png","/DrawShare/pr-previews/82/index.html","/DrawShare/pr-previews/82/manifest.webmanifest","/DrawShare/pr-previews/82/og-image.png"];

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
