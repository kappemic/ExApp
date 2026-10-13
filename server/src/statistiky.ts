/**
 * server/src/statistiky.ts — čistá agregace osobních statistik (Krok 3 Fáze 4).
 *
 * Vstupem je výsledek JEDNOHO JOINu
 * (`participants(status=ucastnil_se, user_id=moje) ⋈ expeditions`)
 * — O(N) bez N+1 (žádný COUNT na řádek, žádná live Strava).
 * - `vypravy` = COUNT účastí (délka vstupu).
 * - `kmCelkem` = SUM expeditions.km (null = nespárováno → 0).
 * - `prevyseniCelkem` = SUM prevyseni_m (null → 0).
 * - `aktivity` = seznam navštívených ve tvaru `ApiAktivita`
 *   (id `aktivita-<expeditionId>`, volitelně nazev/datum/status).
 * Km se sčítá na 1 desetinné (stejně jako Strava normalizace).
 * Krok 21: počítají se JEN proběhlé — přihlášené na budoucí výpravu se
 * nikam nepočítají (statistiky, žebříček i profil ukazují jen absolvované).
 */

import type { ApiAktivita, StatusUcasti } from "../../src/shared/api-types";

export interface StatistikaRadek {
  expeditionId: string;
  km: number | null;
  prevyseniM: number | null;
  stravaActivityId: string | null;
  trasaPolyline: string | null;
  /** Stav docházky uživatele na té výpravě. */
  status?: StatusUcasti;
  nazev?: string;
  datum?: string;
}

export interface AgregovaneStatistiky {
  vypravy: number;
  kmCelkem: number;
  prevyseniCelkem: number;
  aktivity: ApiAktivita[];
}

function jeNezaporneKonecne(hodnota: unknown): hodnota is number {
  return typeof hodnota === "number" && Number.isFinite(hodnota) && hodnota >= 0;
}

/**
 * Čistá agregace řádků JOINu → čísla + seznam pro `StatistikyResponse`.
 * Prázdný vstup = nováček (nuly + []).
 */
export function agregujStatistiky(radky: StatistikaRadek[]): AgregovaneStatistiky {
  let kmSoucet = 0;
  let prevyseniSoucet = 0;
  const aktivity: ApiAktivita[] = radky.map((radek) => {
    if (jeNezaporneKonecne(radek.km)) kmSoucet += radek.km;
    if (
      typeof radek.prevyseniM === "number" &&
      Number.isInteger(radek.prevyseniM) &&
      radek.prevyseniM >= 0
    ) {
      prevyseniSoucet += radek.prevyseniM;
    }
    const aktivita: ApiAktivita = {
      id: `aktivita-${radek.expeditionId}`,
      expeditionId: radek.expeditionId,
      km: jeNezaporneKonecne(radek.km) ? radek.km : null,
      prevyseniM:
        typeof radek.prevyseniM === "number" &&
        Number.isInteger(radek.prevyseniM) &&
        radek.prevyseniM >= 0
          ? radek.prevyseniM
          : null,
      stravaActivityId: radek.stravaActivityId,
      trasaPolyline: radek.trasaPolyline,
    };
    if (radek.status !== undefined) aktivita.status = radek.status;
    if (typeof radek.nazev === "string" && radek.nazev.length > 0) {
      aktivita.nazev = radek.nazev;
    }
    if (typeof radek.datum === "string" && radek.datum.length > 0) {
      aktivita.datum = radek.datum;
    }
    return aktivita;
  });
  return {
    vypravy: radky.length,
    kmCelkem: Math.round(kmSoucet * 10) / 10,
    prevyseniCelkem: prevyseniSoucet,
    aktivity,
  };
}
