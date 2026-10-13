/**
 * Tenká vrstva pro ruční zápis aktivity bez Stravy (Krok 7c).
 *
 * Kontrakt (`src/shared/api-types.ts` §15d):
 * - `POST {VITE_API_BASE_URL}/api/expeditions/:id/aktivita-ruchne`
 *   (dual-guard, jen `stav=proběhlá`, jinak 409 `VYPRAVA_UZAVRENA`)
 *   `{ km, prevyseni_m }` → `{ expedice, aktivita }` (datum se neposílá —
 *   bere se z expedice).
 * Proč existuje: čtení Strava API (`read`, `activity:read`) je ZDARMA —
 * Summit ani žádné předplatné není potřeba. Kdo Stravu vůbec nechce,
 * zapíše kilometry ručně a statistiky / heatmapa / leaderboard fungují
 * stejně (čtou jen DB sloupce `km / prevyseni_m`).
 * V klientovi smí být jen `VITE_*`. Tajné klíče serveru sem nikdy
 * nepatří — přihlašovací údaje Stravy žijí jen na serveru a v DB.
 */

import {
  aktivitaRucnePath,
  jeApiChyba,
  jeUlozAktivituOdpoved,
  type ApiErrorCode,
  type UlozAktivituRucneResponse,
} from "../shared/api-types";
import { apiBaseUrl } from "./strava-api";

export interface RucniAktivitaVstup {
  km: number;
  /** Nepovinné, default 0 (krátká procházka bez kopců). */
  prevyseniM?: number;
}

export type RucniAktivitaVysledek =
  | { ok: true; data: UlozAktivituRucneResponse }
  | {
      ok: false;
      chyba: string;
      kod?: ApiErrorCode;
      details?: Record<string, string[]>;
    };

const OBECNA_CHYBA = "Něco se pokazilo. Zkus to prosím později.";

function jeRecord(hodnota: unknown): hodnota is Record<string, unknown> {
  return typeof hodnota === "object" && hodnota !== null && !Array.isArray(hodnota);
}

async function ctiTelo(odpoved: Response): Promise<unknown> {
  try {
    return await odpoved.json();
  } catch {
    return null;
  }
}

function ctiDetails(telo: unknown): Record<string, string[]> | undefined {
  if (!jeRecord(telo)) return undefined;
  const chyba: unknown = telo["error"];
  if (!jeRecord(chyba)) return undefined;
  const details: unknown = chyba["details"];
  if (!jeRecord(details)) return undefined;
  const ciste: Record<string, string[]> = {};
  for (const [klic, hodnota] of Object.entries(details)) {
    if (
      Array.isArray(hodnota) &&
      hodnota.every((polozka): polozka is string => typeof polozka === "string")
    ) {
      ciste[klic] = [...hodnota];
    }
  }
  return Object.keys(ciste).length > 0 ? ciste : undefined;
}

/**
 * Ruční zápis kilometrů k proběhlé výpravě (bez Stravy).
 * Ne-proběhlá → 409 `VYPRAVA_UZAVRENA`, bez práva → 403.
 */
export async function ulozAktivituRucne(
  expeditionId: string,
  vstup: RucniAktivitaVstup,
): Promise<RucniAktivitaVysledek> {
  const zaklad = apiBaseUrl();
  if (zaklad.length === 0) return { ok: false, chyba: OBECNA_CHYBA };
  let odpoved: Response;
  try {
    odpoved = await fetch(`${zaklad}${aktivitaRucnePath(expeditionId)}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      credentials: "include",
      body: JSON.stringify({
        km: vstup.km,
        prevyseni_m: vstup.prevyseniM ?? 0,
      }),
    });
  } catch {
    return { ok: false, chyba: OBECNA_CHYBA };
  }
  const telo = await ctiTelo(odpoved);
  if (!odpoved.ok) {
    if (jeApiChyba(telo)) {
      return {
        ok: false,
        chyba: telo.error.message,
        kod: telo.error.code,
        details: ctiDetails(telo),
      };
    }
    return { ok: false, chyba: OBECNA_CHYBA };
  }
  if (!jeUlozAktivituOdpoved(telo)) {
    return { ok: false, chyba: OBECNA_CHYBA };
  }
  return { ok: true, data: telo };
}
