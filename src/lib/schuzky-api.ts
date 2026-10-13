/**
 * Tenká read + write vrstva pro schůzky (Fáze 3).
 *
 * Kontrakt (`src/shared/api-types.ts` §14):
 * - `getSchuzky()` — `GET {VITE_API_BASE_URL}/api/meetings` (PUBLIC);
 *   při jakémkoliv selhání vrací prázdné pole + `errorCode`
 *   (kalendář pak ukazuje jen výpravy — nikdy nevyhazuje).
 * - Mutace (`vytvorSchuzku` / `upravSchuzku` / `smazSchuzku`) —
 *   dual-guard (ADMIN nebo aktivní člen); chyby česky z `ApiErrorResponse`.
 * Žádný secret v klientovi (jen `VITE_*`).
 */

import {
  MEETINGS_PATH,
  jeApiChyba,
  schuzkaDetailPath,
  schuzkaOccurrencePath,
  schuzkyListUrl,
  type ApiErrorCode,
  type ApiSchuzka,
  type RozsahMazaniSchuzky,
  type SchuzkyListResponse,
  type UpravitSchuzkuRequest,
  type UpravitSchuzkuResponse,
  type VytvoritSchuzkuRequest,
  type VytvoritSchuzkuResponse,
} from "../shared/api-types";


/** Chyby polí formuláře schůzky (podmnožina ChybyExpedice). */
export type ChybySchuzky = Partial<
  Record<"nazev" | "datum" | "mistnost" | "popis" | "opakovani", string>
>;

export type SchuzkyErrorCode = "BACKEND_NEDOSTUPNY" | "BACKEND_CHYBA";

export interface SchuzkyResult {
  data: ApiSchuzka[];
  source: "db" | "fallback";
  errorCode?: SchuzkyErrorCode;
}

export type SchuzkaVysledek<T> =
  | { ok: true; data: T }
  | { ok: false; chyba: string; kod?: ApiErrorCode; chybyPoli?: ChybySchuzky };

const OBECNA_CHYBA = "Něco se pokazilo. Zkus to prosím později.";
const ISO_DATUM = /^\d{4}-\d{2}-\d{2}$/;
const PLATNA_OPAKOVANI: readonly string[] = ["jednorazova", "tydenni"];

function jeRecord(hodnota: unknown): hodnota is Record<string, unknown> {
  return typeof hodnota === "object" && hodnota !== null && !Array.isArray(hodnota);
}

function apiBase(): string {
  const raw: unknown = import.meta.env.VITE_API_BASE_URL;
  if (typeof raw !== "string") return "";
  return raw.trim().replace(/\/+$/, "");
}

export function jeSchuzka(hodnota: unknown): hodnota is ApiSchuzka {
  if (!jeRecord(hodnota)) return false;
  if (typeof hodnota["id"] !== "string" || hodnota["id"].length === 0)
    return false;
  if (typeof hodnota["nazev"] !== "string" || hodnota["nazev"].length === 0)
    return false;
  if (typeof hodnota["datum"] !== "string" || !ISO_DATUM.test(hodnota["datum"]))
    return false;
  const mistnost = hodnota["mistnost"];
  if (mistnost !== null && mistnost !== undefined && typeof mistnost !== "string")
    return false;
  if (typeof hodnota["popis"] !== "string") return false;
  if (
    typeof hodnota["opakovani"] !== "string" ||
    !PLATNA_OPAKOVANI.includes(hodnota["opakovani"])
  )
    return false;
  return true;
}

function jeSchuzkyOdpoved(hodnota: unknown): hodnota is SchuzkyListResponse {
  if (!jeRecord(hodnota)) return false;
  const raw = hodnota["schuzky"];
  if (!Array.isArray(raw)) return false;
  for (const polozka of raw) {
    if (!jeSchuzka(polozka)) return false;
  }
  return true;
}

async function ctiTelo(odpoved: Response): Promise<unknown> {
  try {
    return await odpoved.json();
  } catch {
    return null;
  }
}

function chybaZTela(telo: unknown): SchuzkaVysledek<never> {
  if (jeApiChyba(telo)) {
    return { ok: false, chyba: telo.error.message, kod: telo.error.code };
  }
  return { ok: false, chyba: OBECNA_CHYBA };
}

function mapujChybyPoli(telo: unknown): ChybySchuzky {
  if (!jeApiChyba(telo)) return {};
  if (telo.error.code !== "VALIDATION_ERROR") return {};
  const detaily: Record<string, string[]> = telo.error.details ?? {};
  const vysledek: ChybySchuzky = {};
  const pole: Array<keyof ChybySchuzky> = [
    "nazev",
    "datum",
    "mistnost",
    "popis",
    "opakovani",
  ];
  for (const klic of pole) {
    const seznam = detaily[klic];
    const hlaska = Array.isArray(seznam) ? seznam[0] : undefined;
    if (typeof hlaska === "string" && hlaska.length > 0) vysledek[klic] = hlaska;
  }
  return vysledek;
}

/**
 * Seznam schůzek pro kalendář. Nikdy nevyhazuje — při selhání BFF
 * vrací prázdné pole (kalendář ukazuje jen výpravy).
 * Volitelné `pagination` (?page&pageSize) — stejně jako u expeditions.
 */
export async function getSchuzky(
  query: { page?: number; pageSize?: number } = {},
): Promise<SchuzkyResult> {
  const zaklad = apiBase();
  if (zaklad.length === 0) return { data: [], source: "fallback" };
  const url =
    query.page !== undefined || query.pageSize !== undefined
      ? schuzkyListUrl(query)
      : `${zaklad}${MEETINGS_PATH}`;
  let odpoved: Response;
  try {
    odpoved = await fetch(url, {
      headers: { Accept: "application/json" },
    });
  } catch {
    return { data: [], source: "fallback", errorCode: "BACKEND_NEDOSTUPNY" };
  }
  if (!odpoved.ok) {
    return { data: [], source: "fallback", errorCode: "BACKEND_CHYBA" };
  }
  const telo = await ctiTelo(odpoved);
  if (!jeSchuzkyOdpoved(telo)) {
    return { data: [], source: "fallback", errorCode: "BACKEND_CHYBA" };
  }
  return { data: telo.schuzky, source: "db" };
}

export async function vytvorSchuzku(
  payload: VytvoritSchuzkuRequest,
): Promise<SchuzkaVysledek<VytvoritSchuzkuResponse>> {
  const zaklad = apiBase();
  if (zaklad.length === 0) return { ok: false, chyba: OBECNA_CHYBA };
  let odpoved: Response;
  try {
    odpoved = await fetch(`${zaklad}${MEETINGS_PATH}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    });
  } catch {
    return { ok: false, chyba: OBECNA_CHYBA };
  }
  const telo = await ctiTelo(odpoved);
  if (!odpoved.ok) {
    if (jeApiChyba(telo) && telo.error.code === "VALIDATION_ERROR") {
      return {
        ok: false,
        chyba: telo.error.message,
        kod: telo.error.code,
        chybyPoli: mapujChybyPoli(telo),
      };
    }
    return chybaZTela(telo);
  }
  if (!jeRecord(telo) || !jeSchuzka(telo["schuzka"])) {
    return { ok: false, chyba: OBECNA_CHYBA };
  }
  return {
    ok: true,
    data: { schuzka: telo["schuzka"] },
  };
}

export async function upravSchuzku(
  id: string,
  payload: UpravitSchuzkuRequest,
): Promise<SchuzkaVysledek<UpravitSchuzkuResponse>> {
  const zaklad = apiBase();
  if (zaklad.length === 0 || id.length === 0)
    return { ok: false, chyba: OBECNA_CHYBA };
  let odpoved: Response;
  try {
    odpoved = await fetch(`${zaklad}${schuzkaDetailPath(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    });
  } catch {
    return { ok: false, chyba: OBECNA_CHYBA };
  }
  const telo = await ctiTelo(odpoved);
  if (!odpoved.ok) {
    if (jeApiChyba(telo) && telo.error.code === "VALIDATION_ERROR") {
      return {
        ok: false,
        chyba: telo.error.message,
        kod: telo.error.code,
        chybyPoli: mapujChybyPoli(telo),
      };
    }
    return chybaZTela(telo);
  }
  if (!jeRecord(telo) || !jeSchuzka(telo["schuzka"])) {
    return { ok: false, chyba: OBECNA_CHYBA };
  }
  return { ok: true, data: { schuzka: telo["schuzka"] } };
}

export async function smazSchuzku(
  id: string,
  rozsah: RozsahMazaniSchuzky = "rada",
  datum?: string,
): Promise<SchuzkaVysledek<{ ok: true }>> {
  const zaklad = apiBase();
  if (zaklad.length === 0 || id.length === 0)
    return { ok: false, chyba: OBECNA_CHYBA };
  let odpoved: Response;
  try {
    let url: string;
    if (rozsah === "vyskyt") {
      const params = new URLSearchParams();
      params.set("rozvrhem", "vyskyt");
      if (datum !== undefined && ISO_DATUM.test(datum)) {
        params.set("datum", datum);
      }
      url = `${zaklad}${schuzkaOccurrencePath(id)}?${params.toString()}`;
    } else {
      url = `${zaklad}${schuzkaDetailPath(id)}`;
    }
    odpoved = await fetch(url, {
      method: "DELETE",
      headers: { Accept: "application/json" },
      credentials: "include",
    });
  } catch {
    return { ok: false, chyba: OBECNA_CHYBA };
  }
  const telo = await ctiTelo(odpoved);
  if (!odpoved.ok) return chybaZTela(telo);
  return { ok: true, data: { ok: true } };
}
