// CACHE and PRECACHE are rewritten at build time by the `sw-precache` plugin in
// vite.config.ts: CACHE gets a per-build id (so every deploy installs a fresh
// worker and purges old caches) and PRECACHE is filled with the build's real
// asset URLs. The defaults below are only used by the dev server.
const CACHE = "drawshare-ca2d876a";
const PRECACHE = ["/DrawShare/pr-previews/83/","/DrawShare/pr-previews/83/apple-touch-icon.png","/DrawShare/pr-previews/83/assets/EditorView-tTf_01El.js","/DrawShare/pr-previews/83/assets/HelpPanel-C5AwK1Pv.js","/DrawShare/pr-previews/83/assets/LandingView-DEH1aw5n.js","/DrawShare/pr-previews/83/assets/NewProjectDialog-COv4KmEV.js","/DrawShare/pr-previews/83/assets/NotFoundView-2Q8-8nEV.js","/DrawShare/pr-previews/83/assets/PrivacyView-Db5-wlv1.js","/DrawShare/pr-previews/83/assets/ProjectsView-HtlgMqb3.js","/DrawShare/pr-previews/83/assets/SnapshotView-IoPZ-f28.js","/DrawShare/pr-previews/83/assets/ViewerView-C4wWfPvZ.js","/DrawShare/pr-previews/83/assets/index-D1Rorxqu.js","/DrawShare/pr-previews/83/assets/ink-gTYvlPyV.js","/DrawShare/pr-previews/83/assets/live-D-VQNwTI.js","/DrawShare/pr-previews/83/assets/shareLinks-DOL2_eRj.js","/DrawShare/pr-previews/83/assets/style-CX8zHCU9.css","/DrawShare/pr-previews/83/assets/useSnapshot-igPqZI0q.js","/DrawShare/pr-previews/83/assets/useStackRenderer-jlijLaUO.js","/DrawShare/pr-previews/83/assets/useThumbnails-DH9AICvq.js","/DrawShare/pr-previews/83/favicon.svg","/DrawShare/pr-previews/83/icon-192.png","/DrawShare/pr-previews/83/icon-512.png","/DrawShare/pr-previews/83/index.html","/DrawShare/pr-previews/83/manifest.webmanifest","/DrawShare/pr-previews/83/og-image.png"];

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
