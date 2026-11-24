/**
 * Náhled odkazu ze zprávy: projde přesměrování, přečte Open Graph a u map bod.
 * Chodí jen na weby z `maNahled`, každé přesměrování se ověřuje znovu.
 */
import type { NahledOdkazu } from "../../src/shared/api-typy/odkazy";
import { maNahled, rozparsujMapu, webOdkazu } from "../../src/shared/odkazy";

const LIMIT_MS = 5_000;
const LIMIT_BAJTU = 400_000;
const PRESMEROVANI_MAX = 5;

const PLATNOST_MS = 24 * 60 * 60_000;
const PLATNOST_PRAZDNEHO_MS = 10 * 60_000;
const CACHE_MAX = 500;
const cache = new Map<string, { vyprsi: number; nahled: NahledOdkazu | null }>();

export const NAHLEDY_ZA_MINUTU = 60;
const dotazyUzivatelu = new Map<string, number[]>();

/** Vyčistí paměť (testy). */
export function resetNahledu(): void {
  cache.clear();
  dotazyUzivatelu.clear();
}

/** Kolik náhledů smí jeden člověk za minutu vyžádat. */
export function smiNahled(uzivatelId: string, ted: number = Date.now()): boolean {
  const cerstve = (dotazyUzivatelu.get(uzivatelId) ?? []).filter((cas) => ted - cas < 60_000);
  const smi = cerstve.length < NAHLEDY_ZA_MINUTU;
  if (smi) cerstve.push(ted);
  dotazyUzivatelu.set(uzivatelId, cerstve);
  return smi;
}

const ENTITY: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

function znak(kod: number): string {
  return Number.isInteger(kod) && kod > 0 && kod <= 0x10ffff ? String.fromCodePoint(kod) : "";
}

function dekoduj(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => znak(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => znak(Number(dec)))
    .replace(/&([a-z]+);/gi, (cele, jmeno: string) => ENTITY[jmeno.toLowerCase()] ?? cele)
    .replace(/\s+/g, " ")
    .trim();
}

/** Open Graph z HTML. Bez závislosti, stačí hlavička stránky. */
export function prectiOpenGraph(html: string): { titulek: string | null; popis: string | null; obrazek: string | null } {
  const hodnoty = new Map<string, string>();
  for (const shoda of html.matchAll(/<meta\b[^>]*>/gi)) {
    const znacka = shoda[0];
    const klic = /\b(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(znacka)?.[1]?.toLowerCase();
    const obsah = /\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(znacka);
    const text = obsah?.[1] ?? obsah?.[2];
    if (klic === undefined || text === undefined || hodnoty.has(klic)) continue;
    hodnoty.set(klic, dekoduj(text));
  }
  const prvni = (...klice: string[]): string | null => {
    for (const klic of klice) {
      const hodnota = hodnoty.get(klic);
      if (hodnota !== undefined && hodnota.length > 0) return hodnota;
    }
    return null;
  };
  const nadpis = /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1];
  const zNadpisu = nadpis === undefined ? "" : dekoduj(nadpis);
  return {
    titulek: prvni("og:title", "twitter:title") ?? (zNadpisu.length > 0 ? zNadpisu : null),
    popis: prvni("og:description", "twitter:description", "description"),
    obrazek: prvni("og:image:secure_url", "og:image", "twitter:image"),
  };
}

function zkrat(text: string | null, limit: number): string | null {
  if (text === null) return null;
  return text.length > limit ? `${text.slice(0, limit - 1).trimEnd()}…` : text;
}

/** Další krok přesměrování. Google posílá z EU přes souhlas s cookies, cíl je v `continue`. */
export function cilPresmerovani(umisteni: string, odkud: string): string | null {
  let cil: URL;
  try {
    cil = new URL(umisteni, odkud);
  } catch {
    return null;
  }
  if (cil.hostname === "consent.google.com") {
    const pokracovani = cil.searchParams.get("continue");
    return pokracovani !== null && maNahled(pokracovani) ? pokracovani : null;
  }
  if (cil.protocol === "http:") cil.protocol = "https:";
  return maNahled(cil.href) ? cil.href : null;
}

async function prectiZacatek(odpoved: Response): Promise<string> {
  const ctecka = odpoved.body?.getReader();
  if (ctecka === undefined) return "";
  const dekoder = new TextDecoder();
  let html = "";
  let bajtu = 0;
  for (;;) {
    const { done, value } = await ctecka.read();
    if (done) break;
    bajtu += value.byteLength;
    html += dekoder.decode(value, { stream: true });
    if (bajtu > LIMIT_BAJTU || /<\/head>/i.test(html)) {
      await ctecka.cancel().catch(() => undefined);
      break;
    }
  }
  return html;
}

async function stahni(puvodni: string, fetchFn: typeof fetch): Promise<NahledOdkazu | null> {
  const signal = AbortSignal.timeout(LIMIT_MS);
  let adresa = puvodni;
  for (let krok = 0; krok <= PRESMEROVANI_MAX; krok += 1) {
    const mapa = rozparsujMapu(adresa);
    const zaklad: NahledOdkazu = {
      url: puvodni,
      druh: mapa === null ? "web" : "mapa",
      web: webOdkazu(puvodni),
      titulek: mapa?.nazev ?? null,
      popis: mapa?.poskytovatel ?? null,
      obrazekUrl: null,
      bod: mapa?.bod ?? null,
    };
    // Bod stačí na náhled mapy, stránku už netřeba stahovat.
    if (mapa !== null && mapa.bod !== null) return zaklad;
    const odpoved = await fetchFn(adresa, {
      redirect: "manual",
      signal,
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "cs",
        "User-Agent": "Mozilla/5.0 (compatible; NahledOdkazu/1.0)",
      },
    });
    if (odpoved.status >= 300 && odpoved.status < 400) {
      const umisteni = odpoved.headers.get("location");
      await odpoved.body?.cancel().catch(() => undefined);
      const dalsi = umisteni === null ? null : cilPresmerovani(umisteni, adresa);
      if (dalsi === null) return mapa === null ? null : zaklad;
      adresa = dalsi;
      continue;
    }
    if (!odpoved.ok || !(odpoved.headers.get("content-type") ?? "").includes("html")) {
      await odpoved.body?.cancel().catch(() => undefined);
      return mapa === null ? null : zaklad;
    }
    const og = prectiOpenGraph(await prectiZacatek(odpoved));
    let obrazekUrl: string | null = null;
    if (og.obrazek !== null) {
      try {
        const obrazek = new URL(og.obrazek, adresa);
        if (obrazek.protocol === "https:" && obrazek.href.length <= 1000) obrazekUrl = obrazek.href;
      } catch {
        obrazekUrl = null;
      }
    }
    if (og.titulek === null && mapa === null) return null;
    return {
      ...zaklad,
      titulek: zkrat(zaklad.titulek ?? og.titulek, 160),
      popis: zkrat(mapa === null ? og.popis : mapa.poskytovatel, 240),
      obrazekUrl,
    };
  }
  return null;
}

/** Náhled s pamětí: úspěch drží den, prázdný výsledek deset minut. */
export async function nahledOdkazu(
  url: string,
  fetchFn: typeof fetch = fetch,
  ted: number = Date.now(),
): Promise<NahledOdkazu | null> {
  if (!maNahled(url)) return null;
  const ulozeny = cache.get(url);
  if (ulozeny !== undefined && ulozeny.vyprsi > ted) return ulozeny.nahled;
  let nahled: NahledOdkazu | null = null;
  try {
    nahled = await stahni(url, fetchFn);
  } catch {
    nahled = null;
  }
  cache.delete(url);
  cache.set(url, { vyprsi: ted + (nahled === null ? PLATNOST_PRAZDNEHO_MS : PLATNOST_MS), nahled });
  if (cache.size > CACHE_MAX) {
    const nejstarsi = cache.keys().next().value;
    if (nejstarsi !== undefined) cache.delete(nejstarsi);
  }
  return nahled;
}
