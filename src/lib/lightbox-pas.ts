/** Nejmenší výchylka kolečka, která přelistne. Pod ní je to jen dotyk touchpadu. */
const PRAH_KOLECKA = 8;
/** Pauza mezi kroky, aby setrvačnost touchpadu neprolétla celé album. */
export const PAUZA_KOLECKA_MS = 320;

/** O kolik fotek posune kolečko. `odKroku` je čas od posledního kroku v ms. */
export function krokKolecka(deltaY: number, odKroku: number): -1 | 0 | 1 {
  if (Math.abs(deltaY) < PRAH_KOLECKA || odKroku < PAUZA_KOLECKA_MS) return 0;
  return deltaY > 0 ? 1 : -1;
}
