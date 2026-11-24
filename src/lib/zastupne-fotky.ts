import { useSyncExternalStore } from "react";
import { nactiFotkyAlba, urlSouboruAlba } from "./alba-api";
import { nactiFotky, urlSouboruFotky, type ApiFotka } from "./expedition-fotky";
import { ALBUM_NAHLEDY_ID, ALBUM_NAHLEDY_MIN_FOTEK } from "../shared/fotky-nahledy";

/** A photo borrowed only for display. It is never saved on the trip that shows it. */
export interface ZdrojZastupneFotky {
  /** Expedition id, or `ALBUM_NAHLEDY_ID` for a photo from the cover album. */
  idAlba: string;
  fotkaId: string;
}

/**
 * Photos that are not the trip's highlight. A lone photo is the highlight.
 * When none is flagged, the first one is, matching the cover picker.
 */
export function fotkyMimoNahled(fotky: readonly ApiFotka[]): ApiFotka[] {
  if (fotky.length <= 1) return [];
  const nahled = fotky.find((fotka) => fotka.jeNahled) ?? fotky[0];
  if (nahled === undefined) return [];
  return fotky.filter((fotka) => fotka.id !== nahled.id);
}

/** FNV-1a. */
function hashTextu(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193);
  }
  return hash;
}

/** Final mix from MurmurHash3, so close inputs get unrelated numbers. */
function zamichej(cislo: number): number {
  let hash = cislo;
  hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b);
  hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35);
  return (hash ^ (hash >>> 16)) >>> 0;
}

function klicFotky(fotka: ZdrojZastupneFotky): string {
  return `${fotka.idAlba}\n${fotka.fotkaId}`;
}

interface Kandidat {
  klic: string;
  hash: number;
  fotka: ZdrojZastupneFotky;
}

/** Allowed candidate with the lowest mixed number for this trip. */
function vyberKandidata(
  idVypravy: string,
  kandidati: readonly Kandidat[],
  zakazane: ReadonlySet<string | null>,
): Kandidat | null {
  const hashVypravy = hashTextu(idVypravy);
  let nejlepsi: Kandidat | null = null;
  let nejmensi = Infinity;
  for (const kandidat of kandidati) {
    if (kandidat.fotka.idAlba === idVypravy || zakazane.has(kandidat.klic)) continue;
    const cislo = zamichej(hashVypravy ^ kandidat.hash);
    if (cislo < nejmensi) {
      nejmensi = cislo;
      nejlepsi = kandidat;
    }
  }
  return nejlepsi;
}

/** Longest run of neighbouring trips without a repeat. Never over half the pool: a longer run would turn into a fixed rotation. */
const OKNO_BEZ_OPAKOVANI = 3;

/**
 * One foreign photo per trip. `idVyprav` is in the order the trips follow each other.
 *
 * The pick looks random but depends only on the trip and the photo, so every member
 * sees the same picture and a new photo in the pool does not reshuffle the others.
 * Two trips in a row never share a photo. With too small a pool the second one
 * stays without it. A trip keeps the photo it already showed (`drivejsi`) while
 * that photo is in the pool and does not clash with the trip before it.
 */
export function priradZastupne(
  idVyprav: readonly string[],
  bazen: readonly ZdrojZastupneFotky[],
  drivejsi: ReadonlyMap<string, ZdrojZastupneFotky> = new Map(),
): ReadonlyMap<string, ZdrojZastupneFotky> {
  const poradi = [...new Set(idVyprav)].filter((id) => id.length > 0);
  const podleKlice = new Map<string, Kandidat>();
  for (const fotka of bazen) {
    const klicKandidata = klicFotky(fotka);
    podleKlice.set(klicKandidata, {
      klic: klicKandidata,
      hash: hashTextu(klicKandidata),
      fotka,
    });
  }
  // Pevné pořadí, aby při shodě čísel nerozhodovalo, v jakém pořadí fotky přišly.
  const kandidati = [...podleKlice.values()].sort((a, b) => (a.klic < b.klic ? -1 : 1));
  const udrzene = poradi.map((id): Kandidat | null => {
    const puvodni = drivejsi.get(id);
    if (puvodni === undefined || puvodni.idAlba === id) return null;
    return podleKlice.get(klicFotky(puvodni)) ?? null;
  });
  const nejdelsiOkno = Math.max(1, Math.min(OKNO_BEZ_OPAKOVANI, Math.floor(kandidati.length / 2)));
  const vybrane: (Kandidat | null)[] = [];
  const prirazeni = new Map<string, ZdrojZastupneFotky>();
  const klicNa = (seznam: readonly (Kandidat | null)[]): (string | null)[] =>
    seznam.map((kandidat) => kandidat?.klic ?? null);

  for (const [index, id] of poradi.entries()) {
    const predchozi = klicNa(vybrane.slice(-1));
    let vybrany = udrzene[index] ?? null;
    if (vybrany !== null && predchozi.includes(vybrany.klic)) vybrany = null;
    for (let okno = nejdelsiOkno; okno >= 1 && vybrany === null; okno -= 1) {
      vybrany = vyberKandidata(
        id,
        kandidati,
        new Set([
          ...klicNa(vybrane.slice(-okno)),
          ...klicNa(udrzene.slice(index + 1, index + 1 + okno)),
        ]),
      );
    }
    vybrany ??= vyberKandidata(id, kandidati, new Set(predchozi));
    vybrane.push(vybrany);
    if (vybrany !== null) prirazeni.set(id, vybrany.fotka);
  }
  return prirazeni;
}

/** Stable pick for one trip. */
export function vyberZastupnou(
  idVypravy: string,
  bazen: readonly ZdrojZastupneFotky[],
): ZdrojZastupneFotky | null {
  return priradZastupne([idVypravy], bazen).get(idVypravy) ?? null;
}

const posluchaci = new Set<() => void>();
let fotkyVyprav: readonly ZdrojZastupneFotky[] = [];
let fotkyNahledu: readonly ZdrojZastupneFotky[] = [];
let nacitaniNahledu: Promise<boolean> | null = null;
let zadatele: readonly string[] = [];
let prirazeni: ReadonlyMap<string, ZdrojZastupneFotky> = new Map();
/** Co už která výprava ukázala. Přežije i odchod ze stránky. */
const ukazane = new Map<string, ZdrojZastupneFotky>();
let snimek = { prirazeni };
let klic = "";

function oznam(): void {
  snimek = { prirazeni };
  for (const posluchac of posluchaci) posluchac();
}

/** The cover album wins. Trip photos fill in until it has enough pictures of its own. */
function aktualniBazen(): readonly ZdrojZastupneFotky[] {
  return fotkyNahledu.length >= ALBUM_NAHLEDY_MIN_FOTEK
    ? fotkyNahledu
    : [...fotkyNahledu, ...fotkyVyprav];
}

function prepocti(): void {
  prirazeni = priradZastupne(zadatele, aktualniBazen(), ukazane);
  for (const [id, zdroj] of prirazeni) ukazane.set(id, zdroj);
}

function prihlas(posluchac: () => void): () => void {
  posluchaci.add(posluchac);
  return () => {
    posluchaci.delete(posluchac);
  };
}

/**
 * Load the cover album. True when it alone covers the stand-ins, so the photos
 * of finished trips are not needed. A failed load is tried again next time.
 */
export function nactiBazenNahledu(): Promise<boolean> {
  if (nacitaniNahledu !== null) return nacitaniNahledu;
  const slib: Promise<boolean> = nactiFotkyAlba(ALBUM_NAHLEDY_ID).then((vysledek) => {
    if (nacitaniNahledu === slib) {
      if (vysledek.ok) {
        fotkyNahledu = vysledek.data.map((fotka) => ({
          idAlba: ALBUM_NAHLEDY_ID,
          fotkaId: fotka.id,
        }));
        prepocti();
        oznam();
      } else {
        nacitaniNahledu = null;
      }
    }
    return fotkyNahledu.length >= ALBUM_NAHLEDY_MIN_FOTEK;
  });
  nacitaniNahledu = slib;
  return slib;
}

/** After an upload or a delete in albums. The next visit of the trips page loads the pool again. */
export function zneplatniBazenZastupnych(): void {
  nacitaniNahledu = null;
  klic = "";
}

/** Load non-highlight photos from finished trips. Later calls with the same ids do nothing. */
export function zajistiBazenZastupnych(idVyprav: readonly string[]): void {
  const dalsi = [...new Set(idVyprav)].filter((id) => id.length > 0).sort();
  const novyKlic = dalsi.join("\n");
  if (novyKlic.length === 0 || novyKlic === klic) return;
  klic = novyKlic;
  void Promise.all(dalsi.map((id) => nactiFotky(id))).then((vysledky) => {
    if (klic !== novyKlic) return;
    const sesbirane: ZdrojZastupneFotky[] = [];
    for (const [index, vysledek] of vysledky.entries()) {
      if (!vysledek.ok) {
        // Výpadek jednoho alba nesmí přeházet fotky, které už jsou vidět.
        sesbirane.push(...fotkyVyprav.filter((fotka) => fotka.idAlba === dalsi[index]));
        continue;
      }
      for (const fotka of fotkyMimoNahled(vysledek.data.fotky)) {
        sesbirane.push({ idAlba: fotka.expeditionId, fotkaId: fotka.id });
      }
    }
    fotkyVyprav = sesbirane;
    prepocti();
    oznam();
  });
}

/**
 * All trips from the oldest, past ones included: the nearest trip must not repeat
 * the picture of the one that has just ended. Only trips that are allowed to show
 * a stand-in read it.
 */
export function nastavZadateleZastupnych(idVyprav: readonly string[]): void {
  const nove = [...new Set(idVyprav)].filter((id) => id.length > 0);
  if (nove.join("\n") === zadatele.join("\n")) return;
  zadatele = nove;
  prepocti();
  oznam();
}

/** Null when the stand-in is not allowed, or no unused foreign photo is left. */
export function useZastupnaFotka(
  idVypravy: string,
  povolit: boolean,
): ZdrojZastupneFotky | null {
  const aktualni = useSyncExternalStore(prihlas, () => snimek, () => snimek);
  if (!povolit) return null;
  return aktualni.prirazeni.get(idVypravy) ?? null;
}

export function urlZastupneFotky(zdroj: ZdrojZastupneFotky): string {
  if (zdroj.idAlba === ALBUM_NAHLEDY_ID) {
    return urlSouboruAlba({ id: zdroj.idAlba, druh: "vlastni", expeditionId: null }, zdroj.fotkaId);
  }
  return urlSouboruFotky(zdroj.idAlba, zdroj.fotkaId);
}
