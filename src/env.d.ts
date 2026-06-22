/// <reference types="vite/client" />

interface ImportMetaEnv {
  // wss:// URL of the Cloudflare live relay. When unset, live sharing is hidden.
  readonly VITE_LIVE_RELAY_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "*.vue" {
  import type { DefineComponent } from "vue";

  // biome-ignore lint/complexity/noBannedTypes: standard Vue SFC type shim
  const component: DefineComponent<{}, {}, any>;
  export default component;
}
