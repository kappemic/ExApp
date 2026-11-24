import type { BodMapy } from "../shared/odkazy";

const DLAZDICE = 256;
const VYCHOZI_ZOOM = 13;

export interface DlazdiceMapy {
  src: string;
  /** Posun levého horního rohu od středu výřezu v px. */
  x: number;
  y: number;
}

/** Dlaždice OSM pokrývající výřez se středem v bodě (Web Mercator). */
export function dlazdiceKolem(
  bod: BodMapy,
  sirka: number,
  vyska: number,
): { dlazdice: DlazdiceMapy[]; zoom: number } {
  // Hodně přiblížená mapa je v malém výřezu jen pár domů, oddálená celá Evropa.
  const zoom = Math.min(15, Math.max(6, bod.zoom ?? VYCHOZI_ZOOM));
  const pocet = 2 ** zoom;
  const sin = Math.sin((bod.lat * Math.PI) / 180);
  const svetX = ((bod.lon + 180) / 360) * pocet * DLAZDICE;
  const svetY = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * pocet * DLAZDICE;
  const dlazdice: DlazdiceMapy[] = [];
  const odX = Math.floor((svetX - sirka / 2) / DLAZDICE);
  const doX = Math.floor((svetX + sirka / 2) / DLAZDICE);
  const odY = Math.floor((svetY - vyska / 2) / DLAZDICE);
  const doY = Math.floor((svetY + vyska / 2) / DLAZDICE);
  for (let y = odY; y <= doY; y += 1) {
    if (y < 0 || y >= pocet) continue;
    for (let x = odX; x <= doX; x += 1) {
      const naKouli = ((x % pocet) + pocet) % pocet;
      dlazdice.push({
        src: `https://tile.openstreetmap.org/${zoom}/${naKouli}/${y}.png`,
        x: Math.round(x * DLAZDICE - svetX),
        y: Math.round(y * DLAZDICE - svetY),
      });
    }
  }
  return { dlazdice, zoom };
}
