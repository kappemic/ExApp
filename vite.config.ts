import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import demoApi from "./demo/plugin.ts";

// `npm run dev:demo`: ukázková data bez databáze (demo/plugin.ts), jen ve vývoji.
export default defineConfig(({ mode }) => ({
  define:
    mode === "demo" ? { "import.meta.env.VITE_API_BASE_URL": JSON.stringify("/__demo") } : {},
  plugins: [
    mode === "demo" ? demoApi() : null,
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
        importScripts: ["/push-sw.js"],
        // A document navigation asks the server first. The saved copy is
        // only for offline. A cache-first shell kept the previous design
        // after a deploy, even when the server already had the new files.
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === "navigate",
            handler: "NetworkFirst",
            options: {
              cacheName: "dokumenty",
              cacheableResponse: { statuses: [200] },
              expiration: { maxEntries: 16 },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
}));
