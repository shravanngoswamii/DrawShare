// CACHE and PRECACHE are rewritten at build time by the `sw-precache` plugin in
// vite.config.ts: CACHE gets a per-build id (so every deploy installs a fresh
// worker and purges old caches) and PRECACHE is filled with the build's real
// asset URLs. The defaults below are only used by the dev server.
const CACHE = "drawshare-83a5d1db";
const PRECACHE = ["/DrawShare/","/DrawShare/apple-touch-icon.png","/DrawShare/assets/EditorView-TmPhtB2l.js","/DrawShare/assets/EmojiPicker-CnQI97_c.js","/DrawShare/assets/HelpPanel-BoGOeitr.js","/DrawShare/assets/ImageLightbox-Cvrjv3Aa.js","/DrawShare/assets/LandingView-PC4lyEDD.js","/DrawShare/assets/NewProjectDialog-ZoNYOGFq.js","/DrawShare/assets/NotFoundView-BApjX6BY.js","/DrawShare/assets/PrivacyView-CLMy7EwG.js","/DrawShare/assets/ProjectsView-DYYQbQ7k.js","/DrawShare/assets/SnapshotView-B2HPlmnA.js","/DrawShare/assets/html2canvas-BKfVIFKg.js","/DrawShare/assets/index-nQS2tjb5.js","/DrawShare/assets/index.es-BQ1p6OAU.js","/DrawShare/assets/ink-D4qmSGfN.js","/DrawShare/assets/module-DzZxRChD.js","/DrawShare/assets/native-Cqs-2kTC.js","/DrawShare/assets/notiflix-aio-3.2.8.min-B5b4ecrD.js","/DrawShare/assets/purify.es-adlwq8Pz.js","/DrawShare/assets/shareLinks-T8Y26_nb.js","/DrawShare/assets/style-BurLOUUv.css","/DrawShare/assets/typeof-B5XbjTb1.js","/DrawShare/assets/useThumbnails-Db9wAF3a.js","/DrawShare/favicon.svg","/DrawShare/icon-192.png","/DrawShare/icon-512.png","/DrawShare/index.html","/DrawShare/manifest.webmanifest","/DrawShare/og-image.png"];

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
