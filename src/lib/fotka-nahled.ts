/**
 * Preview query for our file streams (`/soubor`, `/avatar`).
 * Download, save, blob previews and foreign https URLs stay unchanged.
 */
export function urlNahleduFotky(src: string): string {
  if (src.length === 0) return src;
  if (src.startsWith("blob:") || src.startsWith("data:")) return src;
  const hash = src.indexOf("#");
  const bezHash = hash === -1 ? src : src.slice(0, hash);
  const zbytek = hash === -1 ? "" : src.slice(hash);
  if (!/\/(?:soubor|avatar|prilohy)(?:\/|\?|$)/.test(bezHash)) return src;
  if (/(?:^|[?&])nahled=1(?:&|$)/.test(bezHash)) return src;
  const spoj = bezHash.includes("?") ? "&" : "?";
  return `${bezHash}${spoj}nahled=1${zbytek}`;
}
