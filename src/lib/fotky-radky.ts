/**
 * Justified rows in the Google Photos / Immich sense.
 * Full rows fill the container. The last row stays at the target height
 * and aligns to the start. Aspect ratios are clamped so one panorama
 * cannot swallow the row or leave a tile under the touch target.
 */

export const FOTKY_RADEK_MEZERA_PX = 4;
export const FOTKY_RADEK_MIN_POMER = 0.4;
export const FOTKY_RADEK_MAX_POMER = 2.5;
export const FOTKY_RADEK_MIN_SIRKA_PX = 44;
export const FOTKY_RADEK_VYSKA_MOBIL_PX = 180;
export const FOTKY_RADEK_VYSKA_TABLET_PX = 220;
export const FOTKY_RADEK_VYSKA_DESKTOP_PX = 260;
export const FOTKY_RADEK_ZLOM_PX = 640;
export const FOTKY_RADEK_ZLOM_DESKTOP_PX = 900;

export interface VstupFotkyRadku {
  id: string;
  /** Width / height. Unknown or invalid values become a square. */
  pomer: number;
}

export interface DlazdiceRadku {
  id: string;
  sirka: number;
  vyska: number;
}

export interface RadekFotek {
  vyska: number;
  /** True when the row was scaled to the container width. */
  plny: boolean;
  dlazdice: DlazdiceRadku[];
}

export function cilovaVyskaRadku(sirkaKontejneru: number): number {
  if (sirkaKontejneru >= FOTKY_RADEK_ZLOM_DESKTOP_PX) return FOTKY_RADEK_VYSKA_DESKTOP_PX;
  return sirkaKontejneru >= FOTKY_RADEK_ZLOM_PX ? FOTKY_RADEK_VYSKA_TABLET_PX : FOTKY_RADEK_VYSKA_MOBIL_PX;
}

export function orezPomerFotky(pomer: number): number {
  if (!Number.isFinite(pomer) || pomer <= 0) return 1;
  return Math.min(FOTKY_RADEK_MAX_POMER, Math.max(FOTKY_RADEK_MIN_POMER, pomer));
}

function sirkaPriVysce(pomer: number, vyska: number): number {
  return orezPomerFotky(pomer) * vyska;
}

function prirozenaSirka(
  polozky: readonly VstupFotkyRadku[],
  vyska: number,
  mezera: number,
): number {
  const soucet = polozky.reduce((suma, polozka) => suma + sirkaPriVysce(polozka.pomer, vyska), 0);
  return soucet + Math.max(0, polozky.length - 1) * mezera;
}

function rozdelCelouSirku(surove: readonly number[], cil: number): number[] {
  if (surove.length === 0) return [];
  const soucet = surove.reduce((suma, sirka) => suma + sirka, 0);
  const presne =
    soucet <= 0 ? surove.map(() => cil / surove.length) : surove.map((sirka) => (sirka / soucet) * cil);
  const dolu = presne.map((sirka) => Math.floor(sirka));
  let zbytek = cil - dolu.reduce((suma, sirka) => suma + sirka, 0);
  const poradi = presne
    .map((sirka, index) => ({ index, zbytek: sirka - Math.floor(sirka) }))
    .sort((a, b) => b.zbytek - a.zbytek || a.index - b.index);
  const vysledek = [...dolu];
  for (let krok = 0; krok < zbytek; krok += 1) {
    const index = poradi[krok]?.index;
    if (index === undefined) break;
    vysledek[index] = (vysledek[index] ?? 0) + 1;
  }
  return vysledek;
}

function sestavRadek(
  polozky: readonly VstupFotkyRadku[],
  vyska: number,
  sirkaKontejneru: number,
  mezera: number,
  plny: boolean,
): RadekFotek {
  const zaokrouhlenaVyska = Math.max(1, Math.round(vyska));
  const surove = polozky.map((polozka) => sirkaPriVysce(polozka.pomer, zaokrouhlenaVyska));
  const mezery = Math.max(0, polozky.length - 1) * mezera;
  const sirky = plny
    ? rozdelCelouSirku(surove, Math.max(0, sirkaKontejneru - mezery))
    : surove.map((sirka) => Math.max(1, Math.round(sirka)));
  return {
    vyska: zaokrouhlenaVyska,
    plny,
    dlazdice: polozky.map((polozka, index) => ({
      id: polozka.id,
      sirka: sirky[index] ?? 1,
      vyska: zaokrouhlenaVyska,
    })),
  };
}

function lzeVyplnit(
  polozky: readonly VstupFotkyRadku[],
  sirkaKontejneru: number,
  mezera: number,
): boolean {
  const pomery = polozky.map((polozka) => orezPomerFotky(polozka.pomer));
  const soucet = pomery.reduce((suma, pomer) => suma + pomer, 0);
  if (soucet <= 0) return false;
  const mezery = Math.max(0, polozky.length - 1) * mezera;
  const vyska = (sirkaKontejneru - mezery) / soucet;
  const nejmensi = Math.min(...pomery.map((pomer) => pomer * vyska));
  return nejmensi >= FOTKY_RADEK_MIN_SIRKA_PX - 0.5;
}

/**
 * Pack photos into rows. `sirkaKontejneru` is the content box in CSS pixels.
 * An empty list or a non-positive width returns no rows.
 */
export function slozRadkyFotek(
  fotky: readonly VstupFotkyRadku[],
  sirkaKontejneru: number,
  cilovaVyska: number,
  mezera: number = FOTKY_RADEK_MEZERA_PX,
): RadekFotek[] {
  if (fotky.length === 0 || sirkaKontejneru <= 0 || cilovaVyska <= 0) return [];

  const radky: RadekFotek[] = [];
  let aktualni: VstupFotkyRadku[] = [];

  const uzavri = (polozky: readonly VstupFotkyRadku[], plny: boolean): void => {
    if (polozky.length === 0) return;
    const prirozena = prirozenaSirka(polozky, cilovaVyska, mezera);
    const vyplnit = plny && prirozena >= sirkaKontejneru - 0.5;
    let vyska = cilovaVyska;
    if (vyplnit && prirozena > sirkaKontejneru + 0.5) {
      const soucet = polozky.reduce((suma, polozka) => suma + orezPomerFotky(polozka.pomer), 0);
      const mezery = Math.max(0, polozky.length - 1) * mezera;
      vyska = (sirkaKontejneru - mezery) / soucet;
    }
    radky.push(sestavRadek(polozky, vyska, sirkaKontejneru, mezera, vyplnit));
  };

  const ulozSamaPokudPlna = (fotka: VstupFotkyRadku): boolean => {
    const sama = prirozenaSirka([fotka], cilovaVyska, mezera);
    if (sama < sirkaKontejneru) return false;
    uzavri([fotka], true);
    return true;
  };

  for (const fotka of fotky) {
    if (aktualni.length === 0) {
      if (!ulozSamaPokudPlna(fotka)) aktualni = [fotka];
      continue;
    }
    const kandidat = [...aktualni, fotka];
    const prirozena = prirozenaSirka(kandidat, cilovaVyska, mezera);
    if (prirozena < sirkaKontejneru) {
      aktualni = kandidat;
      continue;
    }
    if (lzeVyplnit(kandidat, sirkaKontejneru, mezera)) {
      uzavri(kandidat, true);
      aktualni = [];
      continue;
    }
    uzavri(aktualni, prirozenaSirka(aktualni, cilovaVyska, mezera) >= sirkaKontejneru - 0.5);
    if (!ulozSamaPokudPlna(fotka)) aktualni = [fotka];
  }

  if (aktualni.length > 0) {
    const prirozena = prirozenaSirka(aktualni, cilovaVyska, mezera);
    uzavri(aktualni, prirozena >= sirkaKontejneru - 0.5);
  }

  return radky;
}
