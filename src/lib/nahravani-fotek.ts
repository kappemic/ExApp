/**
 * Nahrávání fotek do alb na pozadí. Žije mimo komponenty, takže pokračuje po
 * zavření okna i při přechodu na jinou stránku. Album si svůj průběh čte přes
 * `useNahravaniAlba`.
 */
import { useSyncExternalStore } from "react";
import { nahrajFotku, nastavNahledAlba, popisekPoctuFotek } from "./alba-api";
import type { StavPolozkyFotek } from "./fotky-operace-stav";
import { zneplatniBazenZastupnych } from "./zastupne-fotky";

export interface NahravanaFotka {
  id: string;
  soubor: File;
  stav: StavPolozkyFotek;
  chyba?: string;
  /** Výprava, které se fotka po nahrání nastaví jako náhled. */
  nahledVypravy?: string;
}

export interface NahravaniAlba {
  fotky: readonly NahravanaFotka[];
  probiha: boolean;
  /** Fotky jsou nahrané, jen se nepovedlo nastavit náhled alba. */
  chybaNahledu: string | null;
}

type Posluchac = () => void;

/** Jak dlouho zůstane po úspěchu vidět „Nahráno“. */
const DOZNIVANI_MS = 2500;

const stavy = new Map<string, NahravaniAlba>();
const doznivani = new Map<string, ReturnType<typeof setTimeout>>();
const posluchaci = new Set<Posluchac>();
const poNahrani = new Set<(albumId: string) => void>();
let poradi = 0;

function nastav(albumId: string, stav: NahravaniAlba | null): void {
  if (stav === null) stavy.delete(albumId);
  else stavy.set(albumId, stav);
  for (const posluchac of [...posluchaci]) posluchac();
}

function upravFotku(albumId: string, id: string, zmena: Partial<NahravanaFotka>): void {
  const stav = stavy.get(albumId);
  if (stav === undefined) return;
  nastav(albumId, {
    ...stav,
    fotky: stav.fotky.map((fotka) => (fotka.id === id ? { ...fotka, ...zmena } : fotka)),
  });
}

function zastavDoznivani(albumId: string): void {
  clearTimeout(doznivani.get(albumId));
  doznivani.delete(albumId);
}

/** Zavřením záložky by se rozdělané nahrávání ztratilo. */
function varujPredZavrenim(udalost: BeforeUnloadEvent): void {
  udalost.preventDefault();
}

function hlidejZavreni(): void {
  if (typeof window === "undefined") return;
  window.removeEventListener("beforeunload", varujPredZavrenim);
  if ([...stavy.values()].some((stav) => stav.probiha)) {
    window.addEventListener("beforeunload", varujPredZavrenim);
  }
}

async function zpracuj(albumId: string): Promise<void> {
  let nahrano = 0;
  for (;;) {
    const fotka = stavy.get(albumId)?.fotky.find((polozka) => polozka.stav === "ceka");
    if (fotka === undefined) break;
    upravFotku(albumId, fotka.id, { stav: "probiha" });
    const vysledek = await nahrajFotku(albumId, fotka.soubor);
    if (!vysledek.ok) {
      upravFotku(albumId, fotka.id, { stav: "chyba", chyba: vysledek.chyba });
      continue;
    }
    nahrano += 1;
    upravFotku(albumId, fotka.id, { stav: "hotovo" });
    if (fotka.nahledVypravy !== undefined && vysledek.data !== null) {
      const nahled = await nastavNahledAlba(fotka.nahledVypravy, vysledek.data);
      const stav = stavy.get(albumId);
      if (!nahled.ok && stav !== undefined) nastav(albumId, { ...stav, chybaNahledu: nahled.chyba });
    }
    for (const posluchac of [...poNahrani]) posluchac(albumId);
  }
  const stav = stavy.get(albumId);
  if (stav === undefined) return;
  nastav(albumId, { ...stav, probiha: false });
  hlidejZavreni();
  if (nahrano > 0) zneplatniBazenZastupnych();
  if (stav.chybaNahledu === null && stav.fotky.every((fotka) => fotka.stav === "hotovo")) {
    doznivani.set(
      albumId,
      setTimeout(() => zavriNahravani(albumId), DOZNIVANI_MS),
    );
  }
}

/** Přidá fotky do fronty alba. Další výběr za běhu se zařadí na konec. */
export function nahrajDoAlba(
  albumId: string,
  soubory: readonly File[],
  volby: { prvniJakoNahledVypravy?: string | null } = {},
): void {
  if (soubory.length === 0) return;
  zastavDoznivani(albumId);
  const stav = stavy.get(albumId);
  const bezi = stav?.probiha === true;
  const drive = bezi ? stav.fotky : (stav?.fotky ?? []).filter((fotka) => fotka.stav !== "hotovo");
  const nahledVypravy = volby.prvniJakoNahledVypravy ?? null;
  const nove = soubory.map((soubor, index): NahravanaFotka => {
    poradi += 1;
    return {
      id: `nahravana-${poradi}`,
      soubor,
      stav: "ceka",
      ...(index === 0 && nahledVypravy !== null ? { nahledVypravy } : {}),
    };
  });
  nastav(albumId, { fotky: [...drive, ...nove], probiha: true, chybaNahledu: null });
  hlidejZavreni();
  if (!bezi) void zpracuj(albumId);
}

/** Znovu zařadí jen fotky, které se nepovedly. */
export function zkusNahratZnovu(albumId: string): void {
  const stav = stavy.get(albumId);
  if (stav === undefined || stav.probiha) return;
  const znovu = stav.fotky.filter((fotka) => fotka.stav === "chyba");
  if (znovu.length === 0) return;
  nastav(albumId, {
    fotky: znovu.map((fotka) => ({ ...fotka, stav: "ceka", chyba: undefined })),
    probiha: true,
    chybaNahledu: null,
  });
  hlidejZavreni();
  void zpracuj(albumId);
}

/** Skryje dokončené nahrávání. Běžící nechá být. */
export function zavriNahravani(albumId: string): void {
  zastavDoznivani(albumId);
  if (stavy.get(albumId)?.probiha !== false) return;
  nastav(albumId, null);
}

export function ctiNahravani(albumId: string): NahravaniAlba | null {
  return stavy.get(albumId) ?? null;
}

function sleduj(posluchac: Posluchac): () => void {
  posluchaci.add(posluchac);
  return () => {
    posluchaci.delete(posluchac);
  };
}

/** Zavolá se po každé nahrané fotce, album ji může hned ukázat. */
export function poNahraniFotek(posluchac: (albumId: string) => void): () => void {
  poNahrani.add(posluchac);
  return () => {
    poNahrani.delete(posluchac);
  };
}

export function useNahravaniAlba(albumId: string): NahravaniAlba | null {
  return useSyncExternalStore(
    sleduj,
    () => ctiNahravani(albumId),
    () => null,
  );
}

/** „Nahrát 1 fotku“, „Nahrát 3 fotky“, bez výběru „Nahrát fotky“. */
export function popisekNahrat(pocet: number): string {
  if (pocet === 0) return "Nahrát fotky";
  return pocet === 1 ? "Nahrát 1 fotku" : `Nahrát ${popisekPoctuFotek(pocet)}`;
}
