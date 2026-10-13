/**
 * server/src/zebricky.ts — čistá agregace veřejného žebříčku (Krok 5 Fáze 4).
 *
 * Vstupem je výsledek JEDNOHO GROUP BY dotazu
 * (`participants(status=ucastnil_se) ⋈ expeditions ⋈ users`)
 * — server řadí v SQL (`vypravy DESC, km DESC, jmeno ASC, LIMIT 50`),
 * tahle čistá funkce drží STEJNOU sémantiku pro unit testy bez DB:
 * - `vypravy` = COUNT účastí ve filtru období.
 * - `km` = SUM expeditions.km (null = nespárováno → 0, na 1 desetinné).
 * - `obdobi=celkem` = vše; `obdobi=YYYY` = jen datum daného roku.
 * - Řazení účast DESC > km DESC, tie-break jmeno ASC (deterministické).
 * - LIMIT 50.
 */

import type { UserId, ZebrickyRadek } from "../../src/shared/api-types";

export const ZEBRICKY_LIMIT = 50 as const;

export interface ZebrickyVstup {
  userId: string;
  jmeno: string;
  km: number | null;
  /** Datum výpravy YYYY-MM-DD (DB DATE → ISO slice). */
  datum: string;
}

function jeNezaporneKonecne(hodnota: unknown): hodnota is number {
  return typeof hodnota === "number" && Number.isFinite(hodnota) && hodnota >= 0;
}

/**
 * Čistá agregace řádků JOINu → seřazený žebříček (max 50).
 * Prázdný vstup = prázdný žebříček (nový klub).
 */
export function agregujZebricek(
  radky: ZebrickyVstup[],
  obdobi: string,
): ZebrickyRadek[] {
  const jeRok = /^\d{4}$/.test(obdobi);
  const filtrovane =
    obdobi === "celkem"
      ? radky
      : jeRok
        ? radky.filter(
            (radek) =>
              typeof radek.datum === "string" &&
              radek.datum.slice(0, 4) === obdobi,
          )
        : [];
  const skupiny = new Map<string, { jmeno: string; vypravy: number; km: number }>();
  for (const radek of filtrovane) {
    if (typeof radek.userId !== "string" || radek.userId.length === 0) continue;
    if (typeof radek.jmeno !== "string" || radek.jmeno.length === 0) continue;
    const stavajici = skupiny.get(radek.userId);
    const prirustekKm = jeNezaporneKonecne(radek.km) ? radek.km : 0;
    if (stavajici === undefined) {
      skupiny.set(radek.userId, {
        jmeno: radek.jmeno,
        vypravy: 1,
        km: prirustekKm,
      });
    } else {
      stavajici.vypravy += 1;
      stavajici.km += prirustekKm;
    }
  }
  const vysledek: ZebrickyRadek[] = [];
  for (const [userId, skupina] of skupiny) {
    vysledek.push({
      userId: userId as UserId,
      jmeno: skupina.jmeno,
      vypravy: skupina.vypravy,
      km: Math.round(skupina.km * 10) / 10,
    });
  }
  vysledek.sort((a, b) => {
    if (b.vypravy !== a.vypravy) return b.vypravy - a.vypravy;
    if (b.km !== a.km) return b.km - a.km;
    return a.jmeno < b.jmeno ? -1 : a.jmeno > b.jmeno ? 1 : 0;
  });
  return vysledek.slice(0, ZEBRICKY_LIMIT);
}
