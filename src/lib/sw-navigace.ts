/**
 * Page navigations in the service worker, wired up in `vite.config.ts`.
 *
 * workbox-build copies both functions into `sw.js` with `toString()`. They must
 * not use imports or anything else from this file.
 */

/**
 * Pages only. `/api/*` (Strava return, files opened in a new window) matches no
 * route, so the browser sends it straight to the server and nothing is stored.
 */
export const jeNavigaceNaStranku = ({ request, url }: { request: Request; url: URL }): boolean =>
  request.mode === "navigate" && !url.pathname.startsWith("/api");

/**
 * The server goes first, so a deploy shows on the next start. Without a network,
 * after 3 s of silence (same as `CEKANI_NA_SIT_MS`) or on a 5xx from the proxy,
 * the precached shell is used. Pages are not stored one by one: an older copy
 * would point to assets the precache has already dropped.
 */
export const strankaZeSite = async ({ request }: { request: Request }): Promise<Response> => {
  const sit = fetch(request).catch(() => null);
  const odpoved = await Promise.race([
    sit,
    new Promise<null>((hotovo) => setTimeout(() => hotovo(null), 3000)),
  ]);
  if (odpoved !== null && odpoved.status < 500) return odpoved;
  // ignoreSearch: the precache key carries `?__WB_REVISION__=`.
  const shell = await caches.match("/index.html", { ignoreSearch: true, ignoreVary: true });
  return shell ?? (await sit) ?? Response.error();
};
