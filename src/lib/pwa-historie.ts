/**
 * Offline cache for historical READ data (Phase 6).
 *
 * Only GET /api/expeditions, /api/expeditions/:id, /api/meetings,
 * /api/meetings/:id and /api/zebricky (query string is part of the key).
 * Writes, auth, Strava, discussion and extra path segments are never stored.
 * The storage backend is injected so tests do not touch localStorage.
 */

export const HISTORIE_PREFIX = "exapp:historie:";
export const MAX_ZNAKU_ZAZNAMU = 350_000;
export const MAX_ZNAKU_CELKEM = 1_500_000;
export const OFFLINE_HLAVICKA = "X-ExApp-Offline";

/** Marker so StrictMode / double module init cannot wrap fetch twice. */
const ZNACKA_ZAPNUTI = "__exappZapnutaOfflineHistorie";

const ID_SEGMENT = /^[A-Za-z0-9_-]{1,80}$/;

export interface HistorieUloziste {
  getItem(klic: string): string | null;
  setItem(klic: string, hodnota: string): void;
  removeItem(klic: string): void;
  key(index: number): string | null;
  readonly length: number;
}

interface UlozenyZaznam {
  telo: string;
  ulozeno: number;
}

interface PolozkaHistorie {
  klic: string;
  ulozeno: number;
  znaku: number;
}

type GlobalSeZnackou = typeof globalThis & {
  [ZNACKA_ZAPNUTI]?: boolean;
};

/** True only for the historical GET allow-list. Query string does not widen it. */
export function jeHistorickeCteni(method: string, url: string): boolean {
  if (method.toUpperCase() !== "GET") return false;
  const pathname = cestaBezKonce(url);
  if (pathname === null) return false;
  const casti = pathname.split("/").filter((cast) => cast.length > 0);
  if (casti.length < 2 || casti[0] !== "api") return false;
  const zdroj = casti[1];
  if (zdroj === "zebricky") return casti.length === 2;
  if (zdroj !== "expeditions" && zdroj !== "meetings") return false;
  if (casti.length === 2) return true;
  if (casti.length !== 3) return false;
  return ID_SEGMENT.test(casti[2] ?? "");
}

/** Cache key keeps the query string and drops the fragment. */
export function klicHistorickeCache(url: string): string {
  const bezHashe = url.split("#")[0] ?? url;
  return `${HISTORIE_PREFIX}${bezHashe}`;
}

/**
 * Persist a JSON body. Returns false when the body is not JSON, too large,
 * or the quota cannot be satisfied even after evicting older entries.
 */
export function ulozHistorii(
  uloziste: HistorieUloziste,
  klic: string,
  telo: string,
  ted: number = Date.now(),
): boolean {
  if (!klic.startsWith(HISTORIE_PREFIX)) return false;
  if (!jeJsonTelo(telo)) return false;
  if (telo.length > MAX_ZNAKU_ZAZNAMU) return false;
  const serial = JSON.stringify({ telo, ulozeno: ted } satisfies UlozenyZaznam);
  if (serial.length > MAX_ZNAKU_CELKEM) return false;
  uvolniMisto(uloziste, klic, serial.length);
  return zapisSVyklizenim(uloziste, klic, serial);
}

/** Load a previously stored JSON body, or null when missing / corrupt. */
export function nactiHistorii(
  uloziste: HistorieUloziste,
  klic: string,
): string | null {
  let raw: string | null;
  try {
    raw = uloziste.getItem(klic);
  } catch {
    return null;
  }
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!jeUlozenyZaznam(parsed)) return null;
    return parsed.telo;
  } catch {
    return null;
  }
}

/**
 * Historical GET: store a 200 JSON clone on network success.
 * On network failure return the cached body as 200 + X-ExApp-Offline: 1.
 * Anything else is forwarded untouched and never written.
 */
export async function obsluzHistorickeVolani(
  vstup: RequestInfo | URL,
  init: RequestInit | undefined,
  puvodni: typeof fetch,
  uloziste: HistorieUloziste,
): Promise<Response> {
  const { url, method } = adresaAMetoda(vstup, init);
  if (!jeHistorickeCteni(method, url)) {
    return puvodni(vstup, init);
  }
  const klic = klicHistorickeCache(url);
  try {
    const odpoved = await puvodni(vstup, init);
    if (odpoved.status === 200) {
      try {
        const text = await odpoved.clone().text();
        ulozHistorii(uloziste, klic, text);
      } catch {
        // A cache write must not hide a successful response.
      }
    }
    return odpoved;
  } catch (chyba) {
    const telo = nactiHistorii(uloziste, klic);
    if (telo === null) throw chyba;
    return new Response(telo, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        [OFFLINE_HLAVICKA]: "1",
      },
    });
  }
}

/** Idempotent fetch wrapper. Safe to call again from React StrictMode. */
export function zapniOfflineHistorii(uloziste?: HistorieUloziste): void {
  const g = globalThis as GlobalSeZnackou;
  if (g[ZNACKA_ZAPNUTI] === true) return;
  const cil = uloziste ?? vychoziUloziste();
  g[ZNACKA_ZAPNUTI] = true;
  if (cil === null) return;
  const puvodni = globalThis.fetch.bind(globalThis);
  globalThis.fetch = (vstup: RequestInfo | URL, init?: RequestInit) =>
    obsluzHistorickeVolani(vstup, init, puvodni, cil);
}

function vychoziUloziste(): HistorieUloziste | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

function cestaBezKonce(url: string): string | null {
  try {
    const parsed = new URL(url, "http://exapp.local");
    let pathname = parsed.pathname;
    if (pathname.length > 1 && pathname.endsWith("/")) {
      pathname = pathname.slice(0, -1);
    }
    return pathname;
  } catch {
    return null;
  }
}

function jeJsonTelo(telo: string): boolean {
  const orez = telo.trimStart();
  return orez.startsWith("{") || orez.startsWith("[");
}

function jeUlozenyZaznam(hodnota: unknown): hodnota is UlozenyZaznam {
  if (typeof hodnota !== "object" || hodnota === null) return false;
  if (!("telo" in hodnota) || !("ulozeno" in hodnota)) return false;
  const telo = hodnota.telo;
  const ulozeno = hodnota.ulozeno;
  return typeof telo === "string" && typeof ulozeno === "number";
}

function jeKvota(chyba: unknown): boolean {
  if (typeof chyba !== "object" || chyba === null) return false;
  return "name" in chyba && chyba.name === "QuotaExceededError";
}

function polozky(uloziste: HistorieUloziste): PolozkaHistorie[] {
  const vystup: PolozkaHistorie[] = [];
  for (let i = 0; i < uloziste.length; i += 1) {
    const klic = uloziste.key(i);
    if (klic === null || !klic.startsWith(HISTORIE_PREFIX)) continue;
    let raw: string | null = null;
    try {
      raw = uloziste.getItem(klic);
    } catch {
      raw = null;
    }
    if (raw === null) continue;
    let ulozeno = 0;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (jeUlozenyZaznam(parsed)) ulozeno = parsed.ulozeno;
    } catch {
      ulozeno = 0;
    }
    vystup.push({ klic, ulozeno, znaku: raw.length });
  }
  return vystup;
}

/** Drop oldest entries (other than the key being replaced) until `potreba` fits. */
function uvolniMisto(
  uloziste: HistorieUloziste,
  klic: string,
  potreba: number,
): void {
  const vse = polozky(uloziste);
  const existujici = vse.find((polozka) => polozka.klic === klic);
  let soucet = 0;
  for (const polozka of vse) {
    if (polozka.klic !== klic) soucet += polozka.znaku;
  }
  if (existujici !== undefined) {
    // Replacing a key frees its previous bytes before the new write.
  }
  const ostatni = vse
    .filter((polozka) => polozka.klic !== klic)
    .sort((a, b) => a.ulozeno - b.ulozeno || (a.klic < b.klic ? -1 : 1));
  while (soucet + potreba > MAX_ZNAKU_CELKEM && ostatni.length > 0) {
    const nejstarsi = ostatni.shift();
    if (nejstarsi === undefined) break;
    try {
      uloziste.removeItem(nejstarsi.klic);
    } catch {
      break;
    }
    soucet -= nejstarsi.znaku;
  }
}

function nejstarsiKlic(
  uloziste: HistorieUloziste,
  krome: string,
): string | null {
  const ostatni = polozky(uloziste)
    .filter((polozka) => polozka.klic !== krome)
    .sort((a, b) => a.ulozeno - b.ulozeno || (a.klic < b.klic ? -1 : 1));
  return ostatni[0]?.klic ?? null;
}

function zapisSVyklizenim(
  uloziste: HistorieUloziste,
  klic: string,
  serial: string,
): boolean {
  for (let pokus = 0; pokus < 40; pokus += 1) {
    try {
      uloziste.setItem(klic, serial);
      return true;
    } catch (chyba) {
      if (!jeKvota(chyba)) return false;
      const obet = nejstarsiKlic(uloziste, klic);
      if (obet === null) return false;
      try {
        uloziste.removeItem(obet);
      } catch {
        return false;
      }
    }
  }
  return false;
}

function adresaAMetoda(
  vstup: RequestInfo | URL,
  init: RequestInit | undefined,
): { url: string; method: string } {
  if (typeof vstup === "string") {
    return { url: vstup, method: (init?.method ?? "GET").toUpperCase() };
  }
  if (vstup instanceof URL) {
    return { url: vstup.toString(), method: (init?.method ?? "GET").toUpperCase() };
  }
  return {
    url: vstup.url,
    method: (init?.method ?? vstup.method ?? "GET").toUpperCase(),
  };
}
