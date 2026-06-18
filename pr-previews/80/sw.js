// CACHE and PRECACHE are rewritten at build time by the `sw-precache` plugin in
// vite.config.ts: CACHE gets a per-build id (so every deploy installs a fresh
// worker and purges old caches) and PRECACHE is filled with the build's real
// asset URLs. The defaults below are only used by the dev server.
const CACHE = "drawshare-43afca59";
const PRECACHE = ["/DrawShare/pr-previews/80/","/DrawShare/pr-previews/80/apple-touch-icon.png","/DrawShare/pr-previews/80/assets/EditorView-CcDB_xDy.js","/DrawShare/pr-previews/80/assets/HelpPanel-DPqM88wJ.js","/DrawShare/pr-previews/80/assets/LandingView-e8-pS72L.js","/DrawShare/pr-previews/80/assets/NewProjectDialog--1UYn9of.js","/DrawShare/pr-previews/80/assets/NotFoundView-C93YXqhs.js","/DrawShare/pr-previews/80/assets/ProjectsView-CaxHUYwh.js","/DrawShare/pr-previews/80/assets/SnapshotView-Xl4DQcoZ.js","/DrawShare/pr-previews/80/assets/ViewerView-CoJfUyod.js","/DrawShare/pr-previews/80/assets/_plugin-vue_export-helper-BDNMzG2s.js","/DrawShare/pr-previews/80/assets/canvas2d-k8-tnVbt.js","/DrawShare/pr-previews/80/assets/index-BXs5p91z.js","/DrawShare/pr-previews/80/assets/ink-D4uo6uAn.js","/DrawShare/pr-previews/80/assets/live-r6NyDjBi.js","/DrawShare/pr-previews/80/assets/style-DBmz9AO4.css","/DrawShare/pr-previews/80/assets/useSnapshot-igPqZI0q.js","/DrawShare/pr-previews/80/assets/useStackRenderer-DIx3YF8b.js","/DrawShare/pr-previews/80/assets/useThumbnails-X-QHsYok.js","/DrawShare/pr-previews/80/favicon.svg","/DrawShare/pr-previews/80/icon-192.png","/DrawShare/pr-previews/80/icon-512.png","/DrawShare/pr-previews/80/index.html","/DrawShare/pr-previews/80/manifest.webmanifest","/DrawShare/pr-previews/80/og-image.png"];

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
