// CACHE and PRECACHE are rewritten at build time by the `sw-precache` plugin in
// vite.config.ts: CACHE gets a per-build id (so every deploy installs a fresh
// worker and purges old caches) and PRECACHE is filled with the build's real
// asset URLs. The defaults below are only used by the dev server.
const CACHE = "drawshare-18591a0b";
const PRECACHE = ["/DrawShare/","/DrawShare/apple-touch-icon.png","/DrawShare/assets/ChatPanel-In6Hqs5Z.js","/DrawShare/assets/EditorView-D19Vh-6W.js","/DrawShare/assets/HelpPanel-CNbwhJWk.js","/DrawShare/assets/LandingView-Ce7idnXc.js","/DrawShare/assets/NewProjectDialog-CPjFggfL.js","/DrawShare/assets/NotFoundView-CzOonNXq.js","/DrawShare/assets/PrivacyView-OppjyfyX.js","/DrawShare/assets/ProjectsView-fENBsucv.js","/DrawShare/assets/SnapshotView-C6WYrRYb.js","/DrawShare/assets/ThemeMenu-D20GvsHh.js","/DrawShare/assets/ViewerView-DN4SHnvQ.js","/DrawShare/assets/canvas2d-B9De44Ev.js","/DrawShare/assets/index-DEpuZ2_F.js","/DrawShare/assets/ink-OlhCXqj6.js","/DrawShare/assets/shareLinks-I7cwXGYX.js","/DrawShare/assets/style-D2TL_lDk.css","/DrawShare/assets/useThumbnails-Bi2jqcuz.js","/DrawShare/favicon.svg","/DrawShare/icon-192.png","/DrawShare/icon-512.png","/DrawShare/index.html","/DrawShare/manifest.webmanifest","/DrawShare/og-image.png"];

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
