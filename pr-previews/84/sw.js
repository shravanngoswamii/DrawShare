// CACHE and PRECACHE are rewritten at build time by the `sw-precache` plugin in
// vite.config.ts: CACHE gets a per-build id (so every deploy installs a fresh
// worker and purges old caches) and PRECACHE is filled with the build's real
// asset URLs. The defaults below are only used by the dev server.
const CACHE = "drawshare-af92420e";
const PRECACHE = ["/DrawShare/pr-previews/84/","/DrawShare/pr-previews/84/apple-touch-icon.png","/DrawShare/pr-previews/84/assets/EditorView-CoEs548t.js","/DrawShare/pr-previews/84/assets/HelpPanel-pNLYq-Yh.js","/DrawShare/pr-previews/84/assets/LandingView-DWhBe-1r.js","/DrawShare/pr-previews/84/assets/NewProjectDialog-GejUSNqF.js","/DrawShare/pr-previews/84/assets/NotFoundView-C3syMW9I.js","/DrawShare/pr-previews/84/assets/PrivacyView-CcnhRwYh.js","/DrawShare/pr-previews/84/assets/ProjectsView-DWv9nEnK.js","/DrawShare/pr-previews/84/assets/SnapshotView-DpVSLKR-.js","/DrawShare/pr-previews/84/assets/ThemeMenu-BGy-zA-z.js","/DrawShare/pr-previews/84/assets/Toolbar-D6ugF2Cz.js","/DrawShare/pr-previews/84/assets/ViewerView--AxYZLws.js","/DrawShare/pr-previews/84/assets/canvas2d-CBAcoGM0.js","/DrawShare/pr-previews/84/assets/index-DT87ZNfj.js","/DrawShare/pr-previews/84/assets/ink-WtBgXcHP.js","/DrawShare/pr-previews/84/assets/shareLinks-xeizHSgI.js","/DrawShare/pr-previews/84/assets/style-DKJ5fO95.css","/DrawShare/pr-previews/84/assets/useThumbnails-CkUV3m1q.js","/DrawShare/pr-previews/84/favicon.svg","/DrawShare/pr-previews/84/icon-192.png","/DrawShare/pr-previews/84/icon-512.png","/DrawShare/pr-previews/84/index.html","/DrawShare/pr-previews/84/manifest.webmanifest","/DrawShare/pr-previews/84/og-image.png"];

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
