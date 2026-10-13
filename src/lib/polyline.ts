/**
 * Dekodér Strava `summary_polyline` (Google Polyline Algorithm, precision 5).
 *
 * Vlastní implementace bez další těžké závislosti — Leaflet zůstává
 * jedinou mapovou závislostí a je lazy (`import("leaflet")`), aby PWA
 * bundle nerostl na prvním paintu. Nikdy nevyhazuje: prázdný /
 * poškozený vstup → `[]` (volající pak ukáže prázdný stav).
 * Strict TS, žádný `any`.
 */

export interface Souradnice {
  lat: number;
  lng: number;
}

export interface Hranice {
  jih: number;
  zapad: number;
  sever: number;
  vychod: number;
}

const PRECISION = 1e5;
const MAX_DELKA_VSTUPU = 100_000;

/** Prázdný / whitespace vstup → `[]` bez práce. */
function jePrazdny(vstup: string): boolean {
  return vstup.trim().length === 0;
}

/**
 * Dekóduje polyline na seznam souřadnic.
 * Neplatné znaky (< 63) nebo useknutý vstup → vrátí to, co se stihlo
 * dekódovat (typicky `[]`), nikdy nevyhodí.
 */
export function dekodujPolyline(encoded: string): Souradnice[] {
  if (typeof encoded !== "string" || jePrazdny(encoded)) return [];
  if (encoded.length > MAX_DELKA_VSTUPU) return [];

  const body: Souradnice[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    const posunLat = dekodujCislo(encoded, { index });
    if (posunLat === null) break;
    index = posunLat.dalsiIndex;
    lat += posunLat.hodnota;

    if (index >= encoded.length) break;
    const posunLng = dekodujCislo(encoded, { index });
    if (posunLng === null) break;
    index = posunLng.dalsiIndex;
    lng += posunLng.hodnota;

    const bod: Souradnice = {
      lat: lat / PRECISION,
      lng: lng / PRECISION,
    };
    if (jePlatnaSouradnice(bod)) body.push(bod);
  }

  return body;
}

interface DekodovaneCislo {
  hodnota: number;
  dalsiIndex: number;
}

/** Dekóduje jedno varint číslo od `index`; `null` = poškozený vstup. */
function dekodujCislo(
  encoded: string,
  pozice: { index: number },
): DekodovaneCislo | null {
  let vysledek = 0;
  let posun = 0;
  let index = pozice.index;

  for (;;) {
    if (index >= encoded.length) return null;
    const kod: number = encoded.charCodeAt(index) - 63;
    index += 1;
    // Polyline abeceda je 63..126; cokoliv jiného = poškozená data.
    if (kod < 0 || kod > 63) return null;
    vysledek |= (kod & 0x1f) << posun;
    posun += 5;
    if (posun > 30) return null;
    if ((kod & 0x20) === 0) break;
  }

  const zaporne = (vysledek & 1) !== 0;
  const hodnota = zaporne ? ~(vysledek >> 1) : vysledek >> 1;
  return { hodnota, dalsiIndex: index };
}

/** Zeměpisné meze WGS84 (obrana proti poškozenému vstupu). */
export function jePlatnaSouradnice(bod: Souradnice): boolean {
  return (
    Number.isFinite(bod.lat) &&
    Number.isFinite(bod.lng) &&
    bod.lat >= -90 &&
    bod.lat <= 90 &&
    bod.lng >= -180 &&
    bod.lng <= 180
  );
}

/**
 * Ohraničení pro `map.fitBounds` — `null` pro prázdný vstup
 * (volající nechá výchozí pohled na ČR).
 */
export function spocitejHranice(
  body: readonly Souradnice[],
): Hranice | null {
  if (body.length === 0) return null;
  let jih = 90;
  let sever = -90;
  let zapad = 180;
  let vychod = -180;
  for (const bod of body) {
    if (!jePlatnaSouradnice(bod)) continue;
    if (bod.lat < jih) jih = bod.lat;
    if (bod.lat > sever) sever = bod.lat;
    if (bod.lng < zapad) zapad = bod.lng;
    if (bod.lng > vychod) vychod = bod.lng;
  }
  if (jih > sever || zapad > vychod) return null;
  return { jih, zapad, sever, vychod };
}

/** Sloučí hranice více tras do jedné (fitBounds přes celou heatmapu). */
export function slucHranice(
  hranice: readonly (Hranice | null)[],
): Hranice | null {
  let vysledek: Hranice | null = null;
  for (const h of hranice) {
    if (h === null) continue;
    if (vysledek === null) {
      vysledek = { ...h };
      continue;
    }
    if (h.jih < vysledek.jih) vysledek.jih = h.jih;
    if (h.zapad < vysledek.zapad) vysledek.zapad = h.zapad;
    if (h.sever > vysledek.sever) vysledek.sever = h.sever;
    if (h.vychod > vysledek.vychod) vysledek.vychod = h.vychod;
  }
  return vysledek;
}
