/// <reference types="vite/client" />

interface ImportMetaEnv {
  // OAuth client id for the Google Drive cloud-backup provider. Optional: when
  // unset, the cloud-backup feature stays hidden (e.g. on forks).
  readonly VITE_GOOGLE_CLIENT_ID?: string;
}

declare module "*.vue" {
  import type { DefineComponent } from "vue";

  // biome-ignore lint/complexity/noBannedTypes: standard Vue SFC type shim
  const component: DefineComponent<{}, {}, any>;
  export default component;
}
