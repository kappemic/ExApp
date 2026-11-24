import { useSyncExternalStore } from "react";
import { nactiFotky, urlSouboruFotky, type ApiFotka } from "./expedition-fotky";

/** A photo borrowed only for display. It is never saved on the trip that shows it. */
export interface ZdrojZastupneFotky {
  idVypravy: string;
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

function hashId(idVypravy: string): number {
  let hash = 0;
  for (const znak of idVypravy) {
    hash = (hash * 33 + znak.charCodeAt(0)) >>> 0;
  }
  return hash;
}

function klicFotky(fotka: ZdrojZastupneFotky): string {
  return `${fotka.idVypravy}\n${fotka.fotkaId}`;
}

/**
 * One foreign photo per trip. A trip keeps the photo it already had (`drivejsi`)
 * while that photo is in the pool, so a change of the list does not swap pictures.
 * Two trips do not share one while the pool still has an unused photo.
 */
export function priradZastupne(
  idVyprav: readonly string[],
  bazen: readonly ZdrojZastupneFotky[],
  drivejsi: ReadonlyMap<string, ZdrojZastupneFotky> = new Map(),
): ReadonlyMap<string, ZdrojZastupneFotky> {
  const poradi = [...new Set(idVyprav)].filter((id) => id.length > 0).sort();
  const serazeny = [...bazen].sort(
    (a, b) => a.idVypravy.localeCompare(b.idVypravy) || a.fotkaId.localeCompare(b.fotkaId),
  );
  const volne = new Set(serazeny.map(klicFotky));
  const prirazeni = new Map<string, ZdrojZastupneFotky>();
  for (const id of poradi) {
    const puvodni = drivejsi.get(id);
    if (puvodni === undefined || puvodni.idVypravy === id || !volne.has(klicFotky(puvodni))) continue;
    volne.delete(klicFotky(puvodni));
    prirazeni.set(id, puvodni);
  }
  for (const id of poradi) {
    if (prirazeni.has(id)) continue;
    const mozne = serazeny.filter(
      (fotka) => fotka.idVypravy !== id && volne.has(klicFotky(fotka)),
    );
    const vybrana = mozne[hashId(id) % mozne.length];
    if (vybrana === undefined) continue;
    volne.delete(klicFotky(vybrana));
    prirazeni.set(id, vybrana);
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
let bazen: readonly ZdrojZastupneFotky[] = [];
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

function prepocti(): void {
  prirazeni = priradZastupne(zadatele, bazen, ukazane);
  for (const [id, zdroj] of prirazeni) ukazane.set(id, zdroj);
}

function prihlas(posluchac: () => void): () => void {
  posluchaci.add(posluchac);
  return () => {
    posluchaci.delete(posluchac);
  };
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
        sesbirane.push(...bazen.filter((fotka) => fotka.idVypravy === dalsi[index]));
        continue;
      }
      for (const fotka of fotkyMimoNahled(vysledek.data.fotky)) {
        sesbirane.push({ idVypravy: fotka.expeditionId, fotkaId: fotka.id });
      }
    }
    bazen = sesbirane;
    prepocti();
    oznam();
  });
}

/** Trips that are still showing a stand-in. Each one receives a different photo. */
export function nastavZadateleZastupnych(idVyprav: readonly string[]): void {
  const nove = [...new Set(idVyprav)].filter((id) => id.length > 0).sort();
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
  return urlSouboruFotky(zdroj.idVypravy, zdroj.fotkaId);
}
