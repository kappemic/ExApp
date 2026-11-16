import { apiBase } from "./api-base";
import { ctiJsonTelo } from "./api-odpoved";
/**
 * Tenká read vrstva pro žebříček přihlášených (Fáze 4, Krok 5).
 *
 * Kontrakt (`src/shared/api-types.ts` §15c + `ZEBRICKY_PATH`):
 * - `getZebricek(obdobi?)` — `GET {VITE_API_BASE_URL}/api/zebricky?obdobi=…`
 *   (USER, `credentials: "include"`); řazení účast DESC > km DESC + tie-break
 *   jmeno řeší server v SQL (`LIMIT 50`, bez PII kromě `jmeno`).
 * - Při jakémkoliv selhání (bez base, offline, nevalidní tvar)
 *   vrací fallback prázdný žebříček + `[]` (stejný vzor jako
 *   `getMojeStatistiky` — stránka pak ukazuje prázdný stav,
 *   nikdy nevyhazuje).
 * Žádný secret v klientovi (jen `VITE_*`).
 */

import {
  jeZebrickyOdpoved,
  jeZebrickyTrasyOdpoved,
  ZEBRICKY_TRASY_PATH,
  zebrickyListUrl,
  type ZebrickyResponse,
  type ZebrickyTrasyResponse,
} from "../shared/api-types";

export type { ZebrickyResponse };

export type ZebrickyErrorCode = "BACKEND_NEDOSTUPNY" | "BACKEND_CHYBA";

export interface ZebrickyResult {
  data: ZebrickyResponse;
  source: "db" | "fallback";
  errorCode?: ZebrickyErrorCode;
}



/** Prázdný žebříček pro fallback (nikdy nevyhazuje). */
export function prazdnyZebricek(obdobi: string): ZebrickyResponse {
  return { zebricky: [], obdobi };
}

/**
 * Žebříček přihlášeného. Nikdy nevyhazuje — při selhání BFF
 * vrací prázdný žebříček (stránka ukazuje prázdný stav).
 */
export async function getZebricek(
  obdobi: string = "celkem",
): Promise<ZebrickyResult> {
  const zaklad = apiBase();
  if (zaklad.length === 0) {
    return { data: prazdnyZebricek(obdobi), source: "fallback" };
  }
  const cesta = `${zaklad}${zebrickyListUrl({ obdobi })}`;
  let odpoved: Response;
  try {
    odpoved = await fetch(cesta, {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
  } catch {
    return {
      data: prazdnyZebricek(obdobi),
      source: "fallback",
      errorCode: "BACKEND_NEDOSTUPNY",
    };
  }
  if (!odpoved.ok) {
    return {
      data: prazdnyZebricek(obdobi),
      source: "fallback",
      errorCode: "BACKEND_CHYBA",
    };
  }
  const telo = await ctiJsonTelo(odpoved);
  if (!jeZebrickyOdpoved(telo)) {
    return {
      data: prazdnyZebricek(obdobi),
      source: "fallback",
      errorCode: "BACKEND_CHYBA",
    };
  }
  return { data: telo, source: "db" };
}

export interface ZebrickyTrasyResult {
  data: ZebrickyTrasyResponse;
  source: "db" | "fallback";
  errorCode?: ZebrickyErrorCode;
}

function prazdneTrasy(obdobi: string): ZebrickyTrasyResponse {
  return { obdobi, trasy: [] };
}

/** Uskutečněné výpravy klubu (ne jen docházka přihlášeného). */
export async function getTrasyZebricku(
  obdobi: string = "celkem",
): Promise<ZebrickyTrasyResult> {
  const zaklad = apiBase();
  if (zaklad.length === 0) {
    return { data: prazdneTrasy(obdobi), source: "fallback" };
  }
  const param = new URLSearchParams({ obdobi });
  let odpoved: Response;
  try {
    odpoved = await fetch(`${zaklad}${ZEBRICKY_TRASY_PATH}?${param.toString()}`, {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
  } catch {
    return {
      data: prazdneTrasy(obdobi),
      source: "fallback",
      errorCode: "BACKEND_NEDOSTUPNY",
    };
  }
  if (!odpoved.ok) {
    return {
      data: prazdneTrasy(obdobi),
      source: "fallback",
      errorCode: "BACKEND_CHYBA",
    };
  }
  const telo = await ctiJsonTelo(odpoved);
  if (!jeZebrickyTrasyOdpoved(telo)) {
    return {
      data: prazdneTrasy(obdobi),
      source: "fallback",
      errorCode: "BACKEND_CHYBA",
    };
  }
  return { data: telo, source: "db" };
}
