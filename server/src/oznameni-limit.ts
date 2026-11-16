/**
 * Announcement rate limit — 5 posts per hour per account.
 * Separate from chat and sign-in so a busy thread does not block a notice.
 */

export const OZNAMENI_LIMIT_ZA_HODINU = 5;
export const OZNAMENI_OKNO_MS = 60 * 60 * 1000;

const odeslanaZaUcet = new Map<string, number[]>();

/** Clears the in-memory counters (tests). */
export function resetOznameniLimitu(): void {
  odeslanaZaUcet.clear();
}

/** True when this account may post another announcement. */
export function smiPoslatOznameni(ucetId: string, ted: number = Date.now()): boolean {
  const klic = ucetId.trim().length > 0 ? ucetId : "neznamy";
  const minule = odeslanaZaUcet.get(klic) ?? [];
  const cerstve = minule.filter((cas) => ted - cas <= OZNAMENI_OKNO_MS);
  if (cerstve.length >= OZNAMENI_LIMIT_ZA_HODINU) {
    odeslanaZaUcet.set(klic, cerstve);
    return false;
  }
  cerstve.push(ted);
  odeslanaZaUcet.set(klic, cerstve);
  return true;
}
