import { defineConfig } from "vite";
import { resolve } from "node:path";

// Multi-page build: without an explicit rollup input, vite only bundles the
// root index.html — about.html and guide.html (nav links on the game page)
// were missing from dist/, so the Pages navbar reloaded the game instead of
// navigating (Cloudflare served the SPA fallback for them).
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        about: resolve(__dirname, "about.html"),
        guide: resolve(__dirname, "guide.html"),
      },
    },
  },
});
