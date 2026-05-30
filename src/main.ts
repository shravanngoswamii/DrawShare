import { createApp } from "vue";
import { createPinia } from "pinia";
import App from "./App.vue";
import { router } from "./router";
import { storage } from "./adapters/storage/indexedDB";
import "./styles/tokens.css";
import "./styles/base.css";

if ("serviceWorker" in navigator) {
  // PR previews live under /pr-previews/<n>/ on the same origin as production.
  // A cached service worker there serves stale builds and throws FetchEvent
  // network errors, so never run the SW on previews — unregister any existing
  // one and drop its caches so each preview build loads fresh.
  if (location.pathname.includes("/pr-previews/")) {
    navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister()));
    if (window.caches) caches.keys().then((keys) => keys.forEach((k) => caches.delete(k)));
  } else {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
  }
}

async function bootstrap() {
  await storage.init();
  const app = createApp(App);
  app.use(createPinia());
  app.use(router);
  app.mount("#app");
}

bootstrap();
