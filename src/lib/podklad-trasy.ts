import type { Souradnice } from "./polyline";

/** Same tiles as the profile heatmap. CARTO's light set renders blank here. */
const DLAZDICE = "https://tile.openstreetmap.org";
const VELIKOST_DLAZDICE = 256;
const NEJVYSSI_ZOOM = 17;
const NEJNIZSI_ZOOM = 3;

export interface DlazdicePodkladu {
  src: string;
  left: number;
  top: number;
}

export interface PodkladTrasy {
  sirka: number;
  vyska: number;
  /** SVG polyline in the same pixel space as the tiles. */
  body: string;
  dlazdice: DlazdicePodkladu[];
}

interface Svet {
  x: number;
  y: number;
}

/** Web Mercator in 0..1. Y grows south, matching map tiles. */
export function naMercator(bod: Souradnice): Svet {
  const sinus = Math.sin((bod.lat * Math.PI) / 180);
  const sevreny = Math.min(0.9999, Math.max(-0.9999, sinus));
  return {
    x: (bod.lng + 180) / 360,
    y: 0.5 - Math.log((1 + sevreny) / (1 - sevreny)) / (4 * Math.PI),
  };
}

/**
 * Fits the route into `sirka`×`vyska` without squashing latitude against longitude.
 * Returns null when the box or the track is too small to draw.
 */
export function sestavPodkladTrasy(
  body: readonly Souradnice[],
  sirka: number,
  vyska: number,
): PodkladTrasy | null {
  if (body.length < 2 || sirka < 32 || vyska < 32) return null;
  const svet = body.map(naMercator);
  let minX = svet[0]?.x ?? 0;
  let maxX = minX;
  let minY = svet[0]?.y ?? 0;
  let maxY = minY;
  for (const bod of svet) {
    if (bod.x < minX) minX = bod.x;
    if (bod.x > maxX) maxX = bod.x;
    if (bod.y < minY) minY = bod.y;
    if (bod.y > maxY) maxY = bod.y;
  }
  const rozX = Math.max(maxX - minX, 1e-4);
  const rozY = Math.max(maxY - minY, 1e-4);
  const stredX = (minX + maxX) / 2;
  const stredY = (minY + maxY) / 2;
  const rozpetiX = rozX * 1.45;
  const rozpetiY = rozY * 1.45;

  let zoom = NEJNIZSI_ZOOM;
  for (let kandidat = NEJVYSSI_ZOOM; kandidat >= NEJNIZSI_ZOOM; kandidat -= 1) {
    const meritko = VELIKOST_DLAZDICE * 2 ** kandidat;
    if (rozpetiX * meritko <= sirka && rozpetiY * meritko <= vyska) {
      zoom = kandidat;
      break;
    }
  }
  const meritko = VELIKOST_DLAZDICE * 2 ** zoom;
  const puvodX = stredX * meritko - sirka / 2;
  const puvodY = stredY * meritko - vyska / 2;
  const pocet = 2 ** zoom;
  const odX = Math.floor(puvodX / VELIKOST_DLAZDICE);
  const doX = Math.floor((puvodX + sirka) / VELIKOST_DLAZDICE);
  const odY = Math.floor(puvodY / VELIKOST_DLAZDICE);
  const doY = Math.floor((puvodY + vyska) / VELIKOST_DLAZDICE);
  const dlazdice: DlazdicePodkladu[] = [];
  for (let x = odX; x <= doX; x += 1) {
    for (let y = odY; y <= doY; y += 1) {
      if (y < 0 || y >= pocet) continue;
      const sloupec = ((x % pocet) + pocet) % pocet;
      dlazdice.push({
        src: `${DLAZDICE}/${String(zoom)}/${String(sloupec)}/${String(y)}.png`,
        left: x * VELIKOST_DLAZDICE - puvodX,
        top: y * VELIKOST_DLAZDICE - puvodY,
      });
    }
  }
  const cara = svet
    .map((bod) => {
      const x = bod.x * meritko - puvodX;
      const y = bod.y * meritko - puvodY;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return { sirka, vyska, body: cara, dlazdice };
}
