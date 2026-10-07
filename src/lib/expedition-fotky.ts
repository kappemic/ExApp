/**
 * Klient pro fotky k proběhlé výpravě (Krok 6, minimum Fáze 2: URL režim).
 * Tenký BFF fetch-first: `VITE_API_BASE_URL` + kontrakt `src/shared/api-types.ts`.
 * Žádný secret v klientovi (jen `VITE_*`). Chyby česky, nikdy nevyhazuje
 * síťovou výjimku ven — vrací `{ ok: false, chyba }`.
 * Matice: GET = PUBLIC (čte každý), POST + DELETE = ADMIN.
 */

import {
  fotkaDetailPath,
  fotkyPath,
  jeApiChyba,
  type ApiErrorCode,
  type ApiFotka,
  type FotkyListResponse,
  type PridatFotkuResponse,
  type SmazatFotkuResponse,
} from "../shared/api-types";

export type { ApiFotka };

/** Sjednocený výsledek — úspěch nese data, chyba českou hlášku. */
export type FotkyVysledek<T> =
  | { ok: true; data: T }
  | { ok: false; chyba: string; kod?: ApiErrorCode; chybyPoli?: Record<string, string> };

const OBECNA_CHYBA = "Něco se pokazilo. Zkus to prosím později.";

function apiBase(): string {
  const raw: unknown = import.meta.env.VITE_API_BASE_URL;
  if (typeof raw !== "string") return "";
  return raw.trim().replace(/\/+$/, "");
}

/** Bezpečné čtení JSON — prázdné / ne-JSON tělo → null. */
async function ctiTelo(odpoved: Response): Promise<unknown> {
  try {
    return await odpoved.json();
  } catch {
    return null;
  }
}

function chybaZTela(telo: unknown): FotkyVysledek<never> {
  if (jeApiChyba(telo)) {
    return { ok: false, chyba: telo.error.message, kod: telo.error.code };
  }
  return { ok: false, chyba: OBECNA_CHYBA };
}

function jeFotkyOdpoved(telo: unknown): telo is FotkyListResponse {
  if (typeof telo !== "object" || telo === null) return false;
  return Array.isArray((telo as Record<string, unknown>)["fotky"]);
}

function jePridatOdpoved(telo: unknown): telo is PridatFotkuResponse {
  if (typeof telo !== "object" || telo === null) return false;
  return typeof (telo as Record<string, unknown>)["fotka"] === "object";
}

/** Seznam fotek pro modal/historii (PUBLIC — i bez přihlášení). */
export async function nactiFotky(
  idVypravy: string,
): Promise<FotkyVysledek<{ fotky: ApiFotka[] }>> {
  const zaklad: string = apiBase();
  if (zaklad.length === 0) return { ok: true, data: { fotky: [] } };
  try {
    const odpoved: Response = await fetch(`${zaklad}${fotkyPath(idVypravy)}`, {
      headers: { Accept: "application/json" },
    });
    const telo: unknown = await ctiTelo(odpoved);
    if (odpoved.ok && jeFotkyOdpoved(telo)) {
      return { ok: true, data: { fotky: telo.fotky } };
    }
    return chybaZTela(telo);
  } catch {
    return { ok: false, chyba: "Fotky jsou bez připojení nedostupné." };
  }
}

/** Přidání fotky URL + popis (jen ADMIN, jen proběhlá). */
export async function pridejFotku(
  idVypravy: string,
  url: string,
  popis: string,
): Promise<FotkyVysledek<PridatFotkuResponse>> {
  const zaklad: string = apiBase();
  if (zaklad.length === 0) {
    return { ok: false, chyba: "Bez připojení fotku přidat nejde. Zkus to později." };
  }
  try {
    const odpoved: Response = await fetch(`${zaklad}${fotkyPath(idVypravy)}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ url, popis }),
    });
    const telo: unknown = await ctiTelo(odpoved);
    if (odpoved.status === 201 && jePridatOdpoved(telo)) {
      return { ok: true, data: telo };
    }
    if (odpoved.status === 422 && jeApiChyba(telo) && telo.error.code === "VALIDATION_ERROR") {
      const detaily: Record<string, string[]> = telo.error.details ?? {};
      const chybyPoli: Record<string, string> = {};
      for (const [pole, seznam] of Object.entries(detaily)) {
        const prvni: string | undefined = seznam[0];
        if (prvni !== undefined) chybyPoli[pole] = prvni;
      }
      return { ok: false, chyba: telo.error.message, kod: telo.error.code, chybyPoli };
    }
    return chybaZTela(telo);
  } catch {
    return { ok: false, chyba: "Bez připojení fotku přidat nejde. Zkus to později." };
  }
}

/** Smazání fotky (jen ADMIN). */
export async function smazFotku(
  idVypravy: string,
  fotkaId: string,
): Promise<FotkyVysledek<SmazatFotkuResponse>> {
  const zaklad: string = apiBase();
  if (zaklad.length === 0) {
    return { ok: false, chyba: "Bez připojení smazat nejde. Zkus to později." };
  }
  try {
    const odpoved: Response = await fetch(`${zaklad}${fotkaDetailPath(idVypravy, fotkaId)}`, {
      method: "DELETE",
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    const telo: unknown = await ctiTelo(odpoved);
    if (odpoved.ok && typeof telo === "object" && telo !== null && (telo as Record<string, unknown>)["ok"] === true) {
      return { ok: true, data: { ok: true } };
    }
    return chybaZTela(telo);
  } catch {
    return { ok: false, chyba: "Bez připojení smazat nejde. Zkus to později." };
  }
}
