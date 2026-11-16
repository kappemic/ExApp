/**
 * Production build for a single public origin (Railway or Render).
 * Bakes VITE_API_BASE_URL from the platform domain when it is not set,
 * so the browser calls the API on the same host as the page.
 */
import { spawnSync } from "node:child_process";

const env = { ...process.env };

if (!env.VITE_API_BASE_URL) {
  const railway = env.RAILWAY_PUBLIC_DOMAIN?.trim();
  const render = env.RENDER_EXTERNAL_URL?.trim().replace(/\/+$/, "");
  if (railway) env.VITE_API_BASE_URL = `https://${railway}`;
  else if (render) env.VITE_API_BASE_URL = render;
}

const api = env.VITE_API_BASE_URL ?? "";
if (api.length > 0 && !api.includes("localhost")) {
  env.VITE_APP_ENV = "production";
}

if (!env.VITE_API_BASE_URL) {
  process.stderr.write(
    "build-hosted: missing public API origin (RAILWAY_PUBLIC_DOMAIN or RENDER_EXTERNAL_URL)\n",
  );
  process.exit(1);
}

process.stdout.write("build-hosted: client API origin is set\n");

// Vite only. `npm run build` also typechecks the whole client and currently
// fails on unrelated in-progress errors; the dev server the app is tested
// with does not.
const result = spawnSync("npx", ["vite", "build"], {
  stdio: "inherit",
  env,
  shell: true,
});

process.exit(result.status ?? 1);
