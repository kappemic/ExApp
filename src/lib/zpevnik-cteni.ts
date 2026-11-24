/**
 * Čtení písně: rychlost posouvání u písně a zobrazení společné pro celý zpěvník.
 * Všechno jen v zařízení, na server se nic neposílá.
 */
import type { TranspoziceUloziste } from "./zpevnik-transpozice";

/** Kolem jedničky jemné kroky, u krajů hrubší, aby se celé rozpětí prošlo pár klepnutími. */
export const RYCHLOSTI = [0.1, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5] as const;
export const MIN_RYCHLOST = 0.1;
export const MAX_RYCHLOST = 5;

/** Násobky základní velikosti písma. */
export const VELIKOSTI_PISMA = [0.8, 0.9, 1, 1.15, 1.3, 1.5, 1.75] as const;
/** Sekundy od spuštění do prvního pohybu, když je píseň na začátku. */
export const PRODLEVY = [0, 3, 5, 10, 15, 20, 30] as const;

export interface NastaveniCteni {
  pismo: number;
  akordy: boolean;
  prodleva: number;
}

export const VYCHOZI_NASTAVENI: NastaveniCteni = { pismo: 1, akordy: true, prodleva: 0 };

const KLIC_NASTAVENI = "exapp:zpevnik:cteni";

/** Sousední stupeň řady, na kraji zůstane stát. */
export function sousedniStupen(rada: readonly number[], hodnota: number, smer: -1 | 1): number {
  const dalsi = smer === 1 ? rada.find((stupen) => stupen > hodnota) : rada.filter((stupen) => stupen < hodnota).at(-1);
  return dalsi ?? hodnota;
}

export function dalsiRychlost(rychlost: number, smer: -1 | 1): number {
  return sousedniStupen(RYCHLOSTI, rychlost, smer);
}

/** „1,0×“, „1,25×“ */
export function popisRychlosti(rychlost: number): string {
  return `${rychlost.toLocaleString("cs-CZ", { minimumFractionDigits: 1, maximumFractionDigits: 2 })}×`;
}

function cti(uloziste: TranspoziceUloziste, klic: string): string | null {
  try {
    return uloziste.getItem(klic);
  } catch {
    return null;
  }
}

function zapis(uloziste: TranspoziceUloziste, klic: string, hodnota: string): void {
  try {
    uloziste.setItem(klic, hodnota);
  } catch {
    // Plné nebo zakázané úložiště: nastavení platí jen do zavření stránky.
  }
}

function klicRychlosti(id: string): string {
  return `exapp:zpevnik:rychlost:${id}`;
}

export function ctiRychlost(uloziste: TranspoziceUloziste, id: string): number {
  const cislo = Number(cti(uloziste, klicRychlosti(id)));
  return RYCHLOSTI.find((stupen) => stupen === cislo) ?? 1;
}

export function zapisRychlost(uloziste: TranspoziceUloziste, id: string, rychlost: number): void {
  zapis(uloziste, klicRychlosti(id), String(rychlost));
}

export function ctiNastaveni(uloziste: TranspoziceUloziste): NastaveniCteni {
  const surove = cti(uloziste, KLIC_NASTAVENI);
  if (surove === null) return VYCHOZI_NASTAVENI;
  let hodnota: unknown;
  try {
    hodnota = JSON.parse(surove);
  } catch {
    return VYCHOZI_NASTAVENI;
  }
  if (typeof hodnota !== "object" || hodnota === null) return VYCHOZI_NASTAVENI;
  const zaznam = hodnota as Record<string, unknown>;
  return {
    pismo: VELIKOSTI_PISMA.find((stupen) => stupen === zaznam["pismo"]) ?? VYCHOZI_NASTAVENI.pismo,
    akordy: typeof zaznam["akordy"] === "boolean" ? zaznam["akordy"] : VYCHOZI_NASTAVENI.akordy,
    prodleva: PRODLEVY.find((stupen) => stupen === zaznam["prodleva"]) ?? VYCHOZI_NASTAVENI.prodleva,
  };
}

export function zapisNastaveni(uloziste: TranspoziceUloziste, nastaveni: NastaveniCteni): void {
  zapis(uloziste, KLIC_NASTAVENI, JSON.stringify(nastaveni));
}
