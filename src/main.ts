import { createPinia } from "pinia";
import { createApp } from "vue";
import App from "./App.vue";
import { storage } from "./adapters/storage/indexedDB";
import { router } from "./router";
import "./styles/tokens.css";
import "./styles/base.css";

if ("serviceWorker" in navigator) {
  // PR previews live under /pr-previews/<n>/ on the same origin as production.
  // A cached service worker there serves stale builds and throws FetchEvent
  // network errors, so never run the SW on previews — unregister any existing
  // one and drop its caches so each preview build loads fresh.
  if (location.pathname.includes("/pr-previews/")) {
    navigator.serviceWorker.getRegistrations().then((regs) => {
      for (const r of regs) r.unregister();
    });
    if (window.caches) {
      caches.keys().then((keys) => {
        for (const k of keys) caches.delete(k);
      });
    }
  } else {
    // Reload once when a freshly-deployed worker takes control, so the running
    // tab swaps to the new build's assets before it can request a stale lazy
    // chunk. Guard against the initial first-install claim and reload loops.
    const hadController = !!navigator.serviceWorker.controller;
    let reloading = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (!hadController || reloading) return;
      reloading = true;
      location.reload();
    });
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
  }
}

// A lazy route chunk can 404 if its content-hashed name changed in a deploy that
// landed while this tab was open. Reload once (guarded) to fetch the current
// build instead of dying on a failed dynamic import.
router.onError((err) => {
  const msg = String((err as Error)?.message ?? "");
  if (/dynamically imported module|Importing a module script|ChunkLoadError/i.test(msg)) {
    if (!sessionStorage.getItem("ds-chunk-reload")) {
      sessionStorage.setItem("ds-chunk-reload", "1");
      location.reload();
    }
  }
});

// Size the app to the visual viewport (which excludes the on-screen keyboard)
// so the layout shrinks to the visible area instead of the browser scrolling
// the page up and leaving a stuck gap below it on iPad Chrome. See base.css.
function trackViewportHeight() {
  const vv = window.visualViewport;
  if (!vv) return;
  const apply = () =>
    document.documentElement.style.setProperty("--app-height", `${Math.round(vv.height)}px`);
  apply();
  vv.addEventListener("resize", apply);
  vv.addEventListener("scroll", apply);
}

async function bootstrap() {
  trackViewportHeight();
  await storage.init();
  const app = createApp(App);
  app.use(createPinia());
  app.use(router);
  app.mount("#app");
}

bootstrap();
