/** Author may delete their own message only inside this window. */
export const OKNO_SMAZANI_ZPRAVY_MS: number = 10 * 60 * 1000;

export const HLASKA_OKNO_SMAZANI = "Vlastní zprávu jde smazat jen do 10 minut." as const;
export const HLASKA_ZAKAZ_SMAZANI = "Tuhle zprávu smazat nemůžeš." as const;

export interface PravoSmazatZpravu {
  /** Admin or superadmin. Bypasses the 10 minute window and authorship. */
  jeAdmin: boolean;
  jeAutor: boolean;
  createdAt: string | Date;
  ted?: Date;
}

/** Superadmin counts as admin for deleting any message. */
export function jeAdminUcet(ucet: { isAdmin: boolean; isSuperadmin?: boolean }): boolean {
  return ucet.isAdmin || ucet.isSuperadmin === true;
}

/**
 * Admin deletes any message. Everyone else deletes only their own message,
 * and only while it is at most 10 minutes old. A timestamp slightly in the
 * future still counts as fresh.
 */
export function smiSmazatZpravu(vstup: PravoSmazatZpravu): boolean {
  if (vstup.jeAdmin) return true;
  if (!vstup.jeAutor) return false;
  const cas: Date = vstup.createdAt instanceof Date ? vstup.createdAt : new Date(vstup.createdAt);
  if (Number.isNaN(cas.getTime())) return false;
  const ted: Date = vstup.ted ?? new Date();
  return ted.getTime() - cas.getTime() <= OKNO_SMAZANI_ZPRAVY_MS;
}

/** Czech refusal when `smiSmazatZpravu` is false. Null when delete is allowed. */
export function hlaskaZakazuSmazani(vstup: PravoSmazatZpravu): string | null {
  if (smiSmazatZpravu(vstup)) return null;
  if (vstup.jeAutor) return HLASKA_OKNO_SMAZANI;
  return HLASKA_ZAKAZ_SMAZANI;
}
