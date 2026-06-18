// CACHE and PRECACHE are rewritten at build time by the `sw-precache` plugin in
// vite.config.ts: CACHE gets a per-build id (so every deploy installs a fresh
// worker and purges old caches) and PRECACHE is filled with the build's real
// asset URLs. The defaults below are only used by the dev server.
const CACHE = "drawshare-1a284f8a";
const PRECACHE = ["/DrawShare/pr-previews/81/","/DrawShare/pr-previews/81/apple-touch-icon.png","/DrawShare/pr-previews/81/assets/EditorView-DVHE8d0q.js","/DrawShare/pr-previews/81/assets/LandingView-BxU-vywu.js","/DrawShare/pr-previews/81/assets/NewProjectDialog-CJ8J3sel.js","/DrawShare/pr-previews/81/assets/NotFoundView-9-Gav51g.js","/DrawShare/pr-previews/81/assets/ProjectsView-BGaeLvjp.js","/DrawShare/pr-previews/81/assets/SnapshotView-BPNKRpJo.js","/DrawShare/pr-previews/81/assets/ThemeMenu-CT3HNb9q.js","/DrawShare/pr-previews/81/assets/ViewerView-BoMSs2bw.js","/DrawShare/pr-previews/81/assets/index-LdJEzlaq.js","/DrawShare/pr-previews/81/assets/ink-B9sSelC1.js","/DrawShare/pr-previews/81/assets/live-smivzE40.js","/DrawShare/pr-previews/81/assets/shareLinks-B1wD7yCt.js","/DrawShare/pr-previews/81/assets/style-Ct9G90sF.css","/DrawShare/pr-previews/81/assets/useSnapshot-igPqZI0q.js","/DrawShare/pr-previews/81/assets/useStackRenderer-CZf7sCPn.js","/DrawShare/pr-previews/81/assets/useThumbnails-aX9rf2vG.js","/DrawShare/pr-previews/81/favicon.svg","/DrawShare/pr-previews/81/icon-192.png","/DrawShare/pr-previews/81/icon-512.png","/DrawShare/pr-previews/81/index.html","/DrawShare/pr-previews/81/manifest.webmanifest","/DrawShare/pr-previews/81/og-image.png"];

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
