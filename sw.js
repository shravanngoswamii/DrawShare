// CACHE and PRECACHE are rewritten at build time by the `sw-precache` plugin in
// vite.config.ts: CACHE gets a per-build id (so every deploy installs a fresh
// worker and purges old caches) and PRECACHE is filled with the build's real
// asset URLs. The defaults below are only used by the dev server.
const CACHE = "drawshare-065011e5";
const PRECACHE = ["/DrawShare/","/DrawShare/apple-touch-icon.png","/DrawShare/assets/EditorView-BKrCD7CZ.js","/DrawShare/assets/EmojiPicker-rs22w9Nd.js","/DrawShare/assets/ImageLightbox-Q_RKm5sO.js","/DrawShare/assets/LandingView-JP7A49r3.js","/DrawShare/assets/NewProjectDialog-KAef-c5t.js","/DrawShare/assets/NotFoundView-D98IOwmB.js","/DrawShare/assets/PrivacyView-BbDFnK0N.js","/DrawShare/assets/ProjectsView-BmN_X9oP.js","/DrawShare/assets/SettingsPanel-C7Fcd_Dq.js","/DrawShare/assets/SnapshotView-Ci__wv3t.js","/DrawShare/assets/html2canvas-BniRt46B.js","/DrawShare/assets/index-BJpW8Z_T.js","/DrawShare/assets/index.es-LKFndABK.js","/DrawShare/assets/ink-CSGgdkxX.js","/DrawShare/assets/module-DzZxRChD.js","/DrawShare/assets/native-Cqs-2kTC.js","/DrawShare/assets/notiflix-aio-3.2.8.min-C8svMiil.js","/DrawShare/assets/purify.es-adlwq8Pz.js","/DrawShare/assets/shareLinks-Dm4UIKxt.js","/DrawShare/assets/style-BFsZeIIQ.css","/DrawShare/assets/typeof-B5XbjTb1.js","/DrawShare/assets/useThumbnails-CYnQKUFr.js","/DrawShare/favicon.svg","/DrawShare/icon-192.png","/DrawShare/icon-512.png","/DrawShare/index.html","/DrawShare/manifest.webmanifest","/DrawShare/og-image.png"];

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
