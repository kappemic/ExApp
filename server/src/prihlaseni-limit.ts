/**
 * Login and registration rate limit — 10 attempts per minute per IP.
 * Separate from the chat limiter so a busy thread does not lock sign-in.
 */

export const PRIHLASENI_LIMIT_ZA_MINUTU = 10;
export const PRIHLASENI_OKNO_MS = 60_000;

const pokusyZaIp = new Map<string, number[]>();

/** Clears the in-memory counters (tests). */
export function resetPrihlaseniLimitu(): void {
  pokusyZaIp.clear();
}

/**
 * True when this attempt may proceed (the timestamp is recorded).
 * False when the window is already full.
 */
export function smiPokusOUcet(ip: string, ted: number = Date.now()): boolean {
  const klic = ip.trim().length > 0 ? ip : "neznama";
  const minule = pokusyZaIp.get(klic) ?? [];
  const cerstve = minule.filter((cas) => ted - cas <= PRIHLASENI_OKNO_MS);
  if (cerstve.length >= PRIHLASENI_LIMIT_ZA_MINUTU) {
    pokusyZaIp.set(klic, cerstve);
    return false;
  }
  cerstve.push(ted);
  pokusyZaIp.set(klic, cerstve);
  return true;
}
