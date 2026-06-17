// CACHE and PRECACHE are rewritten at build time by the `sw-precache` plugin in
// vite.config.ts: CACHE gets a per-build id (so every deploy installs a fresh
// worker and purges old caches) and PRECACHE is filled with the build's real
// asset URLs. The defaults below are only used by the dev server.
const CACHE = "drawshare-3ccb2ee9";
const PRECACHE = ["/DrawShare/pr-previews/71/","/DrawShare/pr-previews/71/apple-touch-icon.png","/DrawShare/pr-previews/71/assets/EditorView-Cc5JAwuC.js","/DrawShare/pr-previews/71/assets/LandingView-B0F4_y1e.js","/DrawShare/pr-previews/71/assets/ProjectsView-Bq2WCEoO.js","/DrawShare/pr-previews/71/assets/SnapshotView-uXsgNnMt.js","/DrawShare/pr-previews/71/assets/ViewerView-Ec936llY.js","/DrawShare/pr-previews/71/assets/_plugin-vue_export-helper-C1uLxhjc.js","/DrawShare/pr-previews/71/assets/images-CjNWycI3.js","/DrawShare/pr-previews/71/assets/index-QMwuxtDa.js","/DrawShare/pr-previews/71/assets/ink-2kJDSl6R.js","/DrawShare/pr-previews/71/assets/live-CrRYUbD7.js","/DrawShare/pr-previews/71/assets/style-Bbj8JDtk.css","/DrawShare/pr-previews/71/assets/sync-Cmrce1cQ.js","/DrawShare/pr-previews/71/assets/useSnapshot-igPqZI0q.js","/DrawShare/pr-previews/71/assets/useStackRenderer-CJatySET.js","/DrawShare/pr-previews/71/assets/useThumbnails-CwVRBWbO.js","/DrawShare/pr-previews/71/favicon.svg","/DrawShare/pr-previews/71/icon-192.png","/DrawShare/pr-previews/71/icon-512.png","/DrawShare/pr-previews/71/index.html","/DrawShare/pr-previews/71/manifest.webmanifest"];

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
