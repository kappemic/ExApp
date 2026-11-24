/**
 * Pevné id alba, ze kterého se berou obrázky nadcházejících výprav. Album je
 * v seznamu vždy; řádek v `alba` vznikne až s první fotkou (bez migrace).
 */
export const ALBUM_NAHLEDY_ID = "00000000-0000-4000-8000-6e61686c6564" as const;

export const ALBUM_NAHLEDY_NAZEV = "Náhledy výprav";

/** Dvě výpravy po sobě nesmějí mít stejný obrázek, jedna fotka proto nestačí. */
export const ALBUM_NAHLEDY_MIN_FOTEK = 2;

export function jeAlbumNahledu(albumId: string): boolean {
  return albumId.trim().toLowerCase() === ALBUM_NAHLEDY_ID;
}
