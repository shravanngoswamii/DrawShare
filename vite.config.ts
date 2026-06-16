import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, URL } from "node:url";
import vue from "@vitejs/plugin-vue";
import { defineConfig, type Plugin } from "vite";

// Rewrites the hand-written dist/sw.js after build: fills PRECACHE with every
// real asset URL (app shell + all hashed JS/CSS, incl. lazy route chunks) and
// stamps CACHE with a per-build id. This makes the SW precache the whole build
// atomically (so all routes work offline) and guarantees a fresh worker installs
// on every deploy without a hand-bumped version string.
function swPrecache(base: string): Plugin {
  return {
    name: "sw-precache",
    apply: "build",
    closeBundle() {
      const distDir = fileURLToPath(new URL("./dist", import.meta.url));
      const swPath = join(distDir, "sw.js");
      if (!existsSync(swPath)) return;
      const urls = new Set<string>([base]); // base path → index.html (navigation)
      const precachable = /\.(js|css|html|webmanifest|svg|png|ico|woff2?)$/;
      const walk = (dir: string, rel: string) => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          if (entry.name === "sw.js") continue;
          const r = rel ? `${rel}/${entry.name}` : entry.name;
          if (entry.isDirectory()) walk(join(dir, entry.name), r);
          else if (precachable.test(entry.name)) urls.add(base + r);
        }
      };
      walk(distDir, "");
      const buildId = process.env.GITHUB_SHA?.slice(0, 8) || Date.now().toString(36);
      const src = readFileSync(swPath, "utf8")
        .replace('const CACHE = "drawshare-dev";', `const CACHE = "drawshare-${buildId}";`)
        .replace('const PRECACHE = ["./"];', `const PRECACHE = ${JSON.stringify([...urls])};`);
      writeFileSync(swPath, src);
    },
  };
}

export default defineConfig(({ mode }) => {
  const base = process.env.BASE_PATH ?? (mode === "production" ? "/drawshare/" : "/");
  return {
    base,
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
    plugins: [vue(), swPrecache(base)],
  };
});
