import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // PWA minimum: registrace SW, bez plné offline cache.
      // Manifest se servíruje staticky z public/manifest.webmanifest.
      registerType: "autoUpdate",
      includeAssets: ["favicon.png", "logo-klubu.png", "manifest.webmanifest", "icons/*.png"],
      manifest: false,
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2,webmanifest}"],
        cleanupOutdatedCaches: true,
        // SPA fallback: navigace (/, /vypravy, ...) servíruj index.html.
        // index.html MUSÍ být v precache, jinak workbox padá na
        // "Resource was not cached" / "Content unavailable".
        navigateFallback: "index.html",
        navigateFallbackDenylist: [/^\/api\//],
        importScripts: ["/push-sw.js"],
      },
      devOptions: { enabled: false },
    }),
  ],
});
