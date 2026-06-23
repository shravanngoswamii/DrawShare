// CACHE and PRECACHE are rewritten at build time by the `sw-precache` plugin in
// vite.config.ts: CACHE gets a per-build id (so every deploy installs a fresh
// worker and purges old caches) and PRECACHE is filled with the build's real
// asset URLs. The defaults below are only used by the dev server.
const CACHE = "drawshare-809d3a95";
const PRECACHE = ["/DrawShare/","/DrawShare/apple-touch-icon.png","/DrawShare/assets/EditorView-BdxVuaj1.js","/DrawShare/assets/EmojiPicker-DJWOumjI.js","/DrawShare/assets/HelpPanel-DizrWYIv.js","/DrawShare/assets/LandingView-ziyWsi-t.js","/DrawShare/assets/NewProjectDialog-PGqoKIhy.js","/DrawShare/assets/NotFoundView-Bz3asmzh.js","/DrawShare/assets/PrivacyView-CDn5h_jD.js","/DrawShare/assets/ProjectsView-B7Q46Plc.js","/DrawShare/assets/SnapshotView-DIy2o84E.js","/DrawShare/assets/ThemeMenu-_tk1KHSe.js","/DrawShare/assets/Toolbar-BkwZAzll.js","/DrawShare/assets/ViewerView-Bgmz13CE.js","/DrawShare/assets/canvas2d-BQ8rgUtd.js","/DrawShare/assets/index-DXTM4UVn.js","/DrawShare/assets/ink-DUbDZJzq.js","/DrawShare/assets/module-DzZxRChD.js","/DrawShare/assets/native-Cqs-2kTC.js","/DrawShare/assets/shareLinks-I7cwXGYX.js","/DrawShare/assets/style-PwTYccxq.css","/DrawShare/assets/useThumbnails-DpaciC7L.js","/DrawShare/favicon.svg","/DrawShare/icon-192.png","/DrawShare/icon-512.png","/DrawShare/index.html","/DrawShare/manifest.webmanifest","/DrawShare/og-image.png"];

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
