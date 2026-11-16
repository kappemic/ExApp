/**
 * Profile update rate limit — 5 attempts per minute per account.
 * Keyed by account, not IP, so saving a profile never locks sign-in.
 * Limits current-password guessing with a stolen session and bcrypt CPU cost.
 */

export const PROFIL_LIMIT_ZA_MINUTU = 5;
export const PROFIL_OKNO_MS = 60_000;

const pokusyZaUcet = new Map<string, number[]>();

/** Clears the in-memory counters (tests). */
export function resetProfilLimitu(): void {
  pokusyZaUcet.clear();
}

/** True when this account may attempt another profile update. */
export function smiUpravitProfil(ucetId: string, ted: number = Date.now()): boolean {
  const minule = pokusyZaUcet.get(ucetId) ?? [];
  const cerstve = minule.filter((cas) => ted - cas <= PROFIL_OKNO_MS);
  if (cerstve.length >= PROFIL_LIMIT_ZA_MINUTU) {
    pokusyZaUcet.set(ucetId, cerstve);
    return false;
  }
  cerstve.push(ted);
  pokusyZaUcet.set(ucetId, cerstve);
  return true;
}
