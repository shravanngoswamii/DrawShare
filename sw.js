// CACHE and PRECACHE are rewritten at build time by the `sw-precache` plugin in
// vite.config.ts: CACHE gets a per-build id (so every deploy installs a fresh
// worker and purges old caches) and PRECACHE is filled with the build's real
// asset URLs. The defaults below are only used by the dev server.
const CACHE = "drawshare-73f6d683";
const PRECACHE = ["/DrawShare/","/DrawShare/apple-touch-icon.png","/DrawShare/assets/ChatPanel-BbzPginv.js","/DrawShare/assets/EditorView-ibLnO-FZ.js","/DrawShare/assets/HelpPanel-3cVCaSxW.js","/DrawShare/assets/LandingView-Cl1jJdd7.js","/DrawShare/assets/NewProjectDialog-DPSNHKfI.js","/DrawShare/assets/NotFoundView-CQBxzVV6.js","/DrawShare/assets/PrivacyView-DeBuAfdX.js","/DrawShare/assets/ProjectsView-BfMWL1N4.js","/DrawShare/assets/SnapshotView-DxbJlmEW.js","/DrawShare/assets/ThemeMenu-D3J3z6DW.js","/DrawShare/assets/ViewerView-D91SbYa4.js","/DrawShare/assets/canvas2d-C7VIp5cB.js","/DrawShare/assets/index--6fLsnCv.js","/DrawShare/assets/ink-BnaOfZge.js","/DrawShare/assets/shareLinks-I7cwXGYX.js","/DrawShare/assets/style-BxGEZklM.css","/DrawShare/assets/useThumbnails-B4-EIVgn.js","/DrawShare/favicon.svg","/DrawShare/icon-192.png","/DrawShare/icon-512.png","/DrawShare/index.html","/DrawShare/manifest.webmanifest","/DrawShare/og-image.png"];

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
