/**
 * server/src/cors.ts — parsování CLIENT_URL pro CORS (testovatelné bez serveru).
 *
 * Produkce: CLIENT_URL je čárkou oddělený seznam povolených originů
 * (např. "https://app.example.cz,https://admin.example.cz").
 * Prázdný vstup → lokální default pro vývoj.
 */

export const VYCHOZI_CLIENT_URL = "http://localhost:5173";

/** "a, b,, " → ["a", "b"] — trim + filtr prázdných. */
export function parseAllowedOrigins(raw: string | undefined): string[] {
  if (raw === undefined) return [VYCHOZI_CLIENT_URL];
  const cista = raw.trim();
  if (cista.length === 0) return [VYCHOZI_CLIENT_URL];
  const vysledek = cista
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return vysledek.length > 0 ? vysledek : [VYCHOZI_CLIENT_URL];
}
