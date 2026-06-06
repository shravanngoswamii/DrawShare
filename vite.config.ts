/// <reference types="vitest/config" />
import { fileURLToPath, URL } from "node:url";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  base: process.env.BASE_PATH ?? (mode === "production" ? "/drawshare/" : "/"),
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    // Bundle all component CSS into one stylesheet linked in <head> instead of
    // per-route CSS chunks. Lazy routes (EditorView etc.) otherwise load their
    // scoped CSS a beat after the component starts painting on reload, causing
    // a brief flash of unstyled content (e.g. the right sidebar). A single
    // render-blocking stylesheet (~9 KB gzipped) removes the flash entirely;
    // JS chunks stay split, so initial JS is unaffected.
    cssCodeSplit: false,
  },
  plugins: [vue()],
  test: {
    globals: false,
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
}));
