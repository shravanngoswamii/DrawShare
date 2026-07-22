// CACHE and PRECACHE are rewritten at build time by the `sw-precache` plugin in
// vite.config.ts: CACHE gets a per-build id (so every deploy installs a fresh
// worker and purges old caches) and PRECACHE is filled with the build's real
// asset URLs. The defaults below are only used by the dev server.
const CACHE = "drawshare-36015a4b";
const PRECACHE = ["/DrawShare/","/DrawShare/apple-touch-icon.png","/DrawShare/assets/EditorView-D3zDzxaq.js","/DrawShare/assets/EmojiPicker-CBFWr1Bl.js","/DrawShare/assets/ImageLightbox-C8QHETlY.js","/DrawShare/assets/LandingView-DPZXEGvH.js","/DrawShare/assets/NewProjectDialog-BFLt3AVK.js","/DrawShare/assets/NotFoundView-BjpXRt4S.js","/DrawShare/assets/PrivacyView-BWIgPX0u.js","/DrawShare/assets/ProjectsView-CZUBMqHZ.js","/DrawShare/assets/SettingsPanel-W1rBjfla.js","/DrawShare/assets/SnapshotView-BJ_cD0JR.js","/DrawShare/assets/html2canvas-CE_K4sQQ.js","/DrawShare/assets/index-Dfnc9X9b.js","/DrawShare/assets/index.es-C1hzncyg.js","/DrawShare/assets/ink-BgSgfyuK.js","/DrawShare/assets/module-DzZxRChD.js","/DrawShare/assets/native-Cqs-2kTC.js","/DrawShare/assets/notiflix-aio-3.2.8.min-Cw2xstXC.js","/DrawShare/assets/purify.es-adlwq8Pz.js","/DrawShare/assets/shareLinks-CdagvYeN.js","/DrawShare/assets/style-DwtSkUsm.css","/DrawShare/assets/typeof-B5XbjTb1.js","/DrawShare/assets/useThumbnails-5vSqLVXo.js","/DrawShare/favicon.svg","/DrawShare/icon-192.png","/DrawShare/icon-512.png","/DrawShare/index.html","/DrawShare/manifest.webmanifest","/DrawShare/og-image.png"];

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
