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

/** Kanonický tvar původu (`https://a.cz/` → `https://a.cz`). Neplatný nebo `null` → null. */
export function normalizujPuvod(raw: string): string | null {
  try {
    const puvod = new URL(raw).origin;
    return puvod === "null" ? null : puvod;
  } catch {
    return null;
  }
}

/** http://localhost, 127.0.0.1 nebo ::1 na libovolném portu. */
export function jeSmyckovyHttpPuvod(raw: string): boolean {
  const puvod = normalizujPuvod(raw);
  if (puvod === null) return false;
  const url = new URL(puvod);
  if (url.protocol !== "http:") return false;
  return url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1";
}

/**
 * Dev Vite may move off 5173 when that port is taken. When the allow-list
 * already contains a loopback origin, any other loopback http origin is the
 * same machine. Production lists without loopback stay exact.
 */
export function puvodJePovoleny(
  raw: string,
  povolene: ReadonlySet<string>,
  lokalniPorty: boolean,
): boolean {
  const puvod = normalizujPuvod(raw);
  if (puvod === null) return false;
  if (povolene.has(puvod)) return true;
  if (!lokalniPorty || !jeSmyckovyHttpPuvod(puvod)) return false;
  for (const povoleny of povolene) {
    if (jeSmyckovyHttpPuvod(povoleny)) return true;
  }
  return false;
}

/**
 * Přidá veřejný původ hostingu (Railway / Render), aby CORS seděl
 * na stejnou adresu, ze které se servíruje i web.
 * Lokální seznam se nemění, když ty proměnné nejsou nastavené.
 */
export function doplnHostovanyPuvod(
  povolene: readonly string[],
  env: { railwayPublicDomain?: string | undefined; renderExternalUrl?: string | undefined },
): string[] {
  const vysledek = [...povolene];
  const pridat: string[] = [];
  const railway = env.railwayPublicDomain?.trim() ?? "";
  if (railway.length > 0) pridat.push(`https://${railway}`);
  const render = (env.renderExternalUrl ?? "").trim().replace(/\/+$/, "");
  if (render.length > 0) pridat.push(render);
  for (const puvod of pridat) {
    if (!vysledek.includes(puvod)) vysledek.push(puvod);
  }
  return vysledek;
}
