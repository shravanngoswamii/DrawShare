// CACHE and PRECACHE are rewritten at build time by the `sw-precache` plugin in
// vite.config.ts: CACHE gets a per-build id (so every deploy installs a fresh
// worker and purges old caches) and PRECACHE is filled with the build's real
// asset URLs. The defaults below are only used by the dev server.
const CACHE = "drawshare-8550186b";
const PRECACHE = ["/DrawShare/","/DrawShare/apple-touch-icon.png","/DrawShare/assets/EditorView-B86zra9f.js","/DrawShare/assets/EmojiPicker-DIui89Cc.js","/DrawShare/assets/ImageLightbox-B-cMc_dv.js","/DrawShare/assets/LandingView-DUc0-ZI8.js","/DrawShare/assets/NewProjectDialog-BcC05UuG.js","/DrawShare/assets/NotFoundView-DPhFCkUH.js","/DrawShare/assets/PrivacyView-Cvp6FnYe.js","/DrawShare/assets/ProjectsView-DydLH8NX.js","/DrawShare/assets/SettingsPanel-DD9k8DSs.js","/DrawShare/assets/SnapshotView-Imob6tPl.js","/DrawShare/assets/html2canvas-yayFPmJa.js","/DrawShare/assets/index-B7o2hGHD.js","/DrawShare/assets/index.es-PK1YvPz-.js","/DrawShare/assets/ink-CkAd7yoL.js","/DrawShare/assets/module-DzZxRChD.js","/DrawShare/assets/native-Cqs-2kTC.js","/DrawShare/assets/notiflix-aio-3.2.8.min-BZ9wKHgM.js","/DrawShare/assets/purify.es-adlwq8Pz.js","/DrawShare/assets/shareLinks-DkA95Ff8.js","/DrawShare/assets/style-DjlIsZir.css","/DrawShare/assets/typeof-B5XbjTb1.js","/DrawShare/assets/useThumbnails-D2j7TQrT.js","/DrawShare/favicon.svg","/DrawShare/icon-192.png","/DrawShare/icon-512.png","/DrawShare/index.html","/DrawShare/manifest.webmanifest","/DrawShare/og-image.png"];

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
