/**
 * Tenká read vrstva pro osobní statistiky (Fáze 4, Krok 3).
 *
 * Kontrakt (`src/shared/api-types.ts` §15 + `STATISTIKY_MOJE_PATH`):
 * - `getMojeStatistiky()` — `GET {VITE_API_BASE_URL}/api/statistiky/moje`
 *   (USER, `credentials: include`); agregace z DB (COUNT ucastnil_se,
 *   SUM km/prevyseni, seznam aktivit) — žádná live Strava při renderu.
 * - Při jakémkoliv selhání (bez base, offline, 401 PUBLIC, nevalidní tvar)
 *   vrací fallback nuly + `[]` (stejný vzor jako `getSchuzky` — profil pak
 *   ukazuje prázdný stav, nikdy nevyhazuje).
 * Žádný secret v klientovi (jen `VITE_*`).
 */

import {
  STATISTIKY_MOJE_PATH,
  jeStatistikyOdpoved,
  type StatistikyResponse,
  type UserId,
} from "../shared/api-types";

export type { StatistikyResponse };

export type StatistikyErrorCode = "BACKEND_NEDOSTUPNY" | "BACKEND_CHYBA";

export interface StatistikyResult {
  data: StatistikyResponse;
  source: "db" | "fallback";
  errorCode?: StatistikyErrorCode;
}

function apiBase(): string {
  const raw: unknown = import.meta.env.VITE_API_BASE_URL;
  if (typeof raw !== "string") return "";
  return raw.trim().replace(/\/+$/, "");
}

async function ctiTelo(odpoved: Response): Promise<unknown> {
  try {
    return await odpoved.json();
  } catch {
    return null;
  }
}

/** Prázdné statistiky pro nováčka / fallback (nuly + [], nikdy nevyhazuje). */
export function prazdneStatistiky(): StatistikyResponse {
  return {
    userId: "" as UserId,
    jmeno: "",
    vypravy: 0,
    kmCelkem: 0,
    prevyseniCelkem: 0,
    aktivity: [],
  };
}

/**
 * Osobní statistiky přihlášeného. Nikdy nevyhazuje — při selhání BFF
 * vrací prázdné statistiky (profil ukazuje prázdný stav).
 */
export async function getMojeStatistiky(): Promise<StatistikyResult> {
  const zaklad = apiBase();
  if (zaklad.length === 0) {
    return { data: prazdneStatistiky(), source: "fallback" };
  }
  let odpoved: Response;
  try {
    odpoved = await fetch(`${zaklad}${STATISTIKY_MOJE_PATH}`, {
      headers: { Accept: "application/json" },
      credentials: "include",
    });
  } catch {
    return {
      data: prazdneStatistiky(),
      source: "fallback",
      errorCode: "BACKEND_NEDOSTUPNY",
    };
  }
  if (!odpoved.ok) {
    return {
      data: prazdneStatistiky(),
      source: "fallback",
      errorCode: "BACKEND_CHYBA",
    };
  }
  const telo = await ctiTelo(odpoved);
  if (!jeStatistikyOdpoved(telo)) {
    return {
      data: prazdneStatistiky(),
      source: "fallback",
      errorCode: "BACKEND_CHYBA",
    };
  }
  return { data: telo, source: "db" };
}
