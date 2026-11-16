import { apiBase } from "./api-base";
import { chybaZApiTela, ctiJsonTelo } from "./api-odpoved";
/**
 * Klient pro číselník škol a tříd (GET /api/meta/skoly-tridy, PUBLIC).
 * Tenký BFF fetch-first: `VITE_API_BASE_URL` + kontrakt `src/shared/api-types.ts`.
 * Žádný secret v klientovi (jen `VITE_*`). Chyby česky, nikdy nevyhazuje
 * síťovou výjimku ven — vrací `{ ok: false, chyba }`.
 * Volný text povolen: nová hodnota z registrace se objeví v budoucím
 * našeptávání (server čte distinct z users).
 */

import {
  META_SKOLY_TRIDY_PATH,
  jeSkolyTridyOdpoved,
  type SkolyTridyResponse,
} from "../shared/api-types";

/** Sjednocený výsledek — úspěch nese číselník, chyba českou hlášku. */
export type SkolyTridyVysledek =
  | { ok: true; data: SkolyTridyResponse }
  | { ok: false; chyba: string };

const OFFLINE_CHYBA = "Seznam škol a tříd je bez připojení nedostupný.";

/**
 * Načte číselník škol a tříd pro našeptávání (PUBLIC — i bez přihlášení).
 * Bez backendu / při pádu sítě vrací českou offline hlášku (volající drží
 * tichý fallback na prázdné seznamy — formulář funguje i bez našeptávání).
 */
export async function nactiSkolyTridy(): Promise<SkolyTridyVysledek> {
  const zaklad: string = apiBase();
  if (zaklad.length === 0) return { ok: false, chyba: OFFLINE_CHYBA };
  try {
    const odpoved: Response = await fetch(`${zaklad}${META_SKOLY_TRIDY_PATH}`, {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    const telo: unknown = await ctiJsonTelo(odpoved);
    if (odpoved.ok && jeSkolyTridyOdpoved(telo)) {
      return { ok: true, data: telo };
    }
    return { ok: false, chyba: chybaZApiTela(telo).chyba };
  } catch {
    return { ok: false, chyba: OFFLINE_CHYBA };
  }
}
