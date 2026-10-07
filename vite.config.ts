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
      includeAssets: ["favicon.svg", "manifest.webmanifest", "icons/*.svg"],
      manifest: false,
      workbox: {
        globPatterns: [],
        cleanupOutdatedCaches: false,
      },
      devOptions: { enabled: false },
    }),
  ],
});
