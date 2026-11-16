/**
 * Public BFF origin. Empty string means the offline/demo client.
 * A hosting page can set `window.__EXAPP_API_BASE__` so a domain change
 * does not keep calling the origin baked in at build time.
 */

function orez(hodnota: string): string {
  return hodnota.trim().replace(/\/+$/, "");
}

export function apiBase(): string {
  const runtime = (globalThis as { __EXAPP_API_BASE__?: unknown }).__EXAPP_API_BASE__;
  if (typeof runtime === "string" && runtime.trim().length > 0) {
    return orez(runtime);
  }
  const raw: unknown = import.meta.env.VITE_API_BASE_URL;
  if (typeof raw !== "string") return "";
  return orez(raw);
}

/** BFF origin without a trailing slash. Empty string means it is not configured. */
export function apiBaseUrl(): string {
  return apiBase();
}
