/**
 * Tenká read vrstva pro veřejný žebříček (Fáze 4, Krok 5).
 *
 * Kontrakt (`src/shared/api-types.ts` §15c + `ZEBRICKY_PATH`):
 * - `getZebricek(obdobi?)` — `GET {VITE_API_BASE_URL}/api/zebricky?obdobi=…`
 *   (PUBLIC, bez credentials); řazení účast DESC > km DESC + tie-break
 *   jmeno řeší server v SQL (`LIMIT 50`, bez PII kromě `jmeno`).
 * - Při jakémkoliv selhání (bez base, offline, nevalidní tvar)
 *   vrací fallback prázdný žebříček + `[]` (stejný vzor jako
 *   `getMojeStatistiky` — stránka pak ukazuje prázdný stav,
 *   nikdy nevyhazuje).
 * Žádný secret v klientovi (jen `VITE_*`).
 */

import {
  jeZebrickyOdpoved,
  zebrickyListUrl,
  type ZebrickyResponse,
} from "../shared/api-types";

export type { ZebrickyResponse };

export type ZebrickyErrorCode = "BACKEND_NEDOSTUPNY" | "BACKEND_CHYBA";

export interface ZebrickyResult {
  data: ZebrickyResponse;
  source: "db" | "fallback";
  errorCode?: ZebrickyErrorCode;
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

/** Prázdný žebříček pro fallback (nikdy nevyhazuje). */
export function prazdnyZebricek(obdobi: string): ZebrickyResponse {
  return { zebricky: [], obdobi };
}

/**
 * Veřejný žebříček. Nikdy nevyhazuje — při selhání BFF
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
  const telo = await ctiTelo(odpoved);
  if (!jeZebrickyOdpoved(telo)) {
    return {
      data: prazdnyZebricek(obdobi),
      source: "fallback",
      errorCode: "BACKEND_CHYBA",
    };
  }
  return { data: telo, source: "db" };
}
