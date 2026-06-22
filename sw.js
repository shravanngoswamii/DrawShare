// CACHE and PRECACHE are rewritten at build time by the `sw-precache` plugin in
// vite.config.ts: CACHE gets a per-build id (so every deploy installs a fresh
// worker and purges old caches) and PRECACHE is filled with the build's real
// asset URLs. The defaults below are only used by the dev server.
const CACHE = "drawshare-d25e9f56";
const PRECACHE = ["/DrawShare/","/DrawShare/apple-touch-icon.png","/DrawShare/assets/EditorView-D8E3EImU.js","/DrawShare/assets/HelpPanel-CBFbRYYd.js","/DrawShare/assets/LandingView-CgrTbxl1.js","/DrawShare/assets/NewProjectDialog-HlIx1pyP.js","/DrawShare/assets/NotFoundView-D9YOLeSd.js","/DrawShare/assets/PrivacyView-CzYMPaaf.js","/DrawShare/assets/ProjectsView-CySFSTLu.js","/DrawShare/assets/SnapshotView-GRQI4biF.js","/DrawShare/assets/ThemeMenu-CuO8obI-.js","/DrawShare/assets/ViewerView-C8i19vw3.js","/DrawShare/assets/canvas2d-CHRm9y_G.js","/DrawShare/assets/index-DPPOd6De.js","/DrawShare/assets/ink-BFFsbHr7.js","/DrawShare/assets/shareLinks-I7cwXGYX.js","/DrawShare/assets/style-OMiwZb3q.css","/DrawShare/assets/useStackRenderer-DbESqRQp.js","/DrawShare/assets/useThumbnails-CSZaBvl1.js","/DrawShare/favicon.svg","/DrawShare/icon-192.png","/DrawShare/icon-512.png","/DrawShare/index.html","/DrawShare/manifest.webmanifest","/DrawShare/og-image.png"];

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
