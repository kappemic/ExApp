/**
 * Klient pro fotky k proběhlé výpravě (Krok 6, minimum Fáze 2: URL režim).
 * Tenký BFF fetch-first: `VITE_API_BASE_URL` + kontrakt `src/shared/api-types.ts`.
 * Žádný secret v klientovi (jen `VITE_*`). Chyby česky, nikdy nevyhazuje
 * síťovou výjimku ven — vrací `{ ok: false, chyba }`.
 * Matice: GET = PUBLIC (čte každý), POST + DELETE = ADMIN.
 */

import {
  fotkaDetailPath,
  fotkaNahledPath,
  fotkaSouborPath,
  fotkyPath,
  jeApiChyba,
  type ApiErrorCode,
  type ApiFotka,
  type FotkyListResponse,
  type NastavitNahledResponse,
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

/** Missing flag from an older response counts as not highlighted. */
function sJeNahledem(fotka: ApiFotka): ApiFotka {
  return { ...fotka, jeNahled: fotka.jeNahled === true };
}

function normalizujFotky(fotky: ApiFotka[]): ApiFotka[] {
  return fotky.map(sJeNahledem);
}

/**
 * Highlight for the closed card. The list must be oldest `createdAt` first.
 * Exactly one `jeNahled` wins; when none is flagged, the first photo does.
 */
export function vyberNahledFotky<T extends { jeNahled: boolean }>(
  fotky: readonly T[],
): T | null {
  const oznacena = fotky.find((fotka) => fotka.jeNahled);
  if (oznacena !== undefined) return oznacena;
  return fotky[0] ?? null;
}

/** `<img src>` for a photo. Uses the app stream, not the raw R2 URL. */
export function urlSouboruFotky(idVypravy: string, fotkaId: string): string {
  return `${apiBase()}${fotkaSouborPath(idVypravy, fotkaId)}`;
}

/**
 * Cover id for snapshots that omit `nahledFotkaId`. One in-flight promise
 * per expedition so a card grid does not stampede the photo list.
 */
const nahledCache = new Map<string, Promise<string | null>>();

export function nactiNahledFotkaId(idVypravy: string): Promise<string | null> {
  const hotovo = nahledCache.get(idVypravy);
  if (hotovo !== undefined) return hotovo;
  const slib = nactiFotky(idVypravy).then((vysledek) => {
    if (!vysledek.ok) return null;
    return vyberNahledFotky(vysledek.data.fotky)?.id ?? null;
  });
  nahledCache.set(idVypravy, slib);
  return slib;
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
      return { ok: true, data: { fotky: normalizujFotky(telo.fotky) } };
    }
    return chybaZTela(telo);
  } catch {
    return { ok: false, chyba: "Fotky jsou bez připojení nedostupné." };
  }
}

/** Nahrání souboru (JPEG/PNG/WebP) + popis. Přihlášený uživatel, jen proběhlá výprava. */
export async function pridejFotkuSouborem(
  idVypravy: string,
  soubor: File,
  popis: string,
): Promise<FotkyVysledek<PridatFotkuResponse>> {
  const zaklad: string = apiBase();
  if (zaklad.length === 0) {
    return { ok: false, chyba: "Bez připojení fotku přidat nejde. Zkus to později." };
  }
  const telo = new FormData();
  telo.append("soubor", soubor);
  telo.append("popis", popis);
  try {
    const odpoved: Response = await fetch(`${zaklad}${fotkyPath(idVypravy)}`, {
      method: "POST",
      credentials: "include",
      headers: { Accept: "application/json" },
      body: telo,
    });
    const json: unknown = await ctiTelo(odpoved);
    if (odpoved.status === 201 && jePridatOdpoved(json)) {
      return { ok: true, data: { fotka: sJeNahledem(json.fotka) } };
    }
    if (odpoved.status === 422 && jeApiChyba(json) && json.error.code === "VALIDATION_ERROR") {
      const detaily: Record<string, string[]> = json.error.details ?? {};
      const chybyPoli: Record<string, string> = {};
      for (const [pole, seznam] of Object.entries(detaily)) {
        const prvni: string | undefined = seznam[0];
        if (prvni !== undefined) chybyPoli[pole] = prvni;
      }
      return { ok: false, chyba: json.error.message, kod: json.error.code, chybyPoli };
    }
    return chybaZTela(json);
  } catch {
    return { ok: false, chyba: "Bez připojení fotku přidat nejde. Zkus to později." };
  }
}

/** Přidání fotky URL + popis (starší cesta, jen JSON). */
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
      return { ok: true, data: { fotka: sJeNahledem(telo.fotka) } };
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

function jeNahledOdpoved(telo: unknown): telo is NastavitNahledResponse {
  if (typeof telo !== "object" || telo === null) return false;
  const radek = telo as Record<string, unknown>;
  return typeof radek["fotkaId"] === "string" && Array.isArray(radek["fotky"]);
}

/** Sets the single highlight (logged-in, finished expedition only). */
export async function nastavNahledFotky(
  idVypravy: string,
  fotkaId: string,
): Promise<FotkyVysledek<NastavitNahledResponse>> {
  const zaklad: string = apiBase();
  if (zaklad.length === 0) {
    return { ok: false, chyba: "Bez připojení náhled vybrat nejde. Zkus to později." };
  }
  try {
    const odpoved: Response = await fetch(`${zaklad}${fotkaNahledPath(idVypravy, fotkaId)}`, {
      method: "POST",
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    const telo: unknown = await ctiTelo(odpoved);
    if (odpoved.ok && jeNahledOdpoved(telo)) {
      return {
        ok: true,
        data: { fotkaId: telo.fotkaId, fotky: normalizujFotky(telo.fotky) },
      };
    }
    return chybaZTela(telo);
  } catch {
    return { ok: false, chyba: "Bez připojení náhled vybrat nejde. Zkus to později." };
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
