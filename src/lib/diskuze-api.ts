/**
 * Klient vlákna diskuze k výpravě (Fáze 5, Krok 4).
 * Tenký BFF fetch-first: `VITE_API_BASE_URL` + kontrakt `src/shared/api-types.ts` § Diskuze.
 * Žádný secret v klientovi (jen `VITE_*`). Chyby česky, nikdy nevyhazuje
 * síťovou výjimku ven — vrací `{ ok: false, chyba }`.
 * Matice: GET vlákna = PUBLIC (čte i anonym), POST = USER,
 * DELETE detailu = autor nebo dual-guard. Text se ukládá raw (trimnutý),
 * escapuje se až při renderu (`escapujHtml`), aby XSS payload zůstal
 * v DB čitelný, ale v DOM se vykreslil jako text.
 */

import {
  jeApiChyba,
  jeApiZprava,
  jePosliZpravuOdpoved,
  jeZpravyOdpoved,
  zpravaDetailPath,
  zpravyListUrl,
  zpravyPath,
  type ApiErrorCode,
  type ApiZprava,
  type PosliZpravuResponse,
  type SmazatZpravuResponse,
  type ZpravyListQuery,
  type ZpravyListResponse,
} from "../shared/api-types";

export type { ApiZprava };

/** Sjednocený výsledek — úspěch nese data, chyba českou hlášku. */
export type DiskuzeVysledek<T> =
  | { ok: true; data: T }
  | { ok: false; chyba: string; kod?: ApiErrorCode; chybyPoli?: Record<string, string> };

const OBECNA_CHYBA = "Něco se pokazilo. Zkus to prosím později.";
const OFFLINE_CTENI = "Zprávy jsou bez připojení nedostupné.";
const OFFLINE_ZAPIS = "Bez připojení zprávu poslat nejde. Zkus to později.";
const OFFLINE_MAZANI = "Bez připojení smazat nejde. Zkus to později.";

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

function chybaZTela(telo: unknown): DiskuzeVysledek<never> {
  if (jeApiChyba(telo)) {
    return { ok: false, chyba: telo.error.message, kod: telo.error.code };
  }
  return { ok: false, chyba: OBECNA_CHYBA };
}

/** Guard jedné zprávy vlákna (stejná pravidla jako kontrakt `jeApiZprava`). */
export function jeZprava(hodnota: unknown): hodnota is ApiZprava {
  return jeApiZprava(hodnota);
}

/**
 * Escapuje text zprávy pro bezpečný render (ukládá se raw, renderuje jako text).
 * Pořadí je záměrně `&` první, aby se nezdvojovalo escapování.
 */
export function escapujHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Vlákno zpráv výpravy (PUBLIC — čte i anonym), řazeno created_at ASC. */
export async function getZpravy(
  idVypravy: string,
  query: ZpravyListQuery = {},
): Promise<DiskuzeVysledek<ZpravyListResponse>> {
  const zaklad: string = apiBase();
  if (zaklad.length === 0) return { ok: true, data: { zpravy: [], nextCursor: null } };
  const cesta: string =
    query.limit === undefined && query.cursor === undefined
      ? zpravyPath(idVypravy)
      : zpravyListUrl(idVypravy, query);
  try {
    const odpoved: Response = await fetch(`${zaklad}${cesta}`, {
      headers: { Accept: "application/json" },
    });
    const telo: unknown = await ctiTelo(odpoved);
    if (odpoved.ok && jeZpravyOdpoved(telo)) {
      return { ok: true, data: telo };
    }
    return chybaZTela(telo);
  } catch {
    return { ok: false, chyba: OFFLINE_CTENI };
  }
}

/** Poslání zprávy (USER, rate-limit 10/min/ip hlídá server 429 MOC_POZADAVKU). */
export async function posliZpravu(
  idVypravy: string,
  text: string,
): Promise<DiskuzeVysledek<PosliZpravuResponse>> {
  const zaklad: string = apiBase();
  if (zaklad.length === 0) {
    return { ok: false, chyba: OFFLINE_ZAPIS };
  }
  try {
    const odpoved: Response = await fetch(`${zaklad}${zpravyPath(idVypravy)}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ text: text.trim() }),
    });
    const telo: unknown = await ctiTelo(odpoved);
    if (odpoved.status === 201 && jePosliZpravuOdpoved(telo)) {
      return { ok: true, data: telo };
    }
    if (jeApiChyba(telo) && telo.error.code === "VALIDATION_ERROR") {
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
    return { ok: false, chyba: OFFLINE_ZAPIS };
  }
}

/** Smazání zprávy (autor nebo dual-guard, soft-delete). */
export async function smazZpravu(
  idVypravy: string,
  zpravaId: string,
): Promise<DiskuzeVysledek<SmazatZpravuResponse>> {
  const zaklad: string = apiBase();
  if (zaklad.length === 0) {
    return { ok: false, chyba: OFFLINE_MAZANI };
  }
  try {
    const odpoved: Response = await fetch(
      `${zaklad}${zpravaDetailPath(idVypravy, zpravaId)}`,
      {
        method: "DELETE",
        credentials: "include",
        headers: { Accept: "application/json" },
      },
    );
    const telo: unknown = await ctiTelo(odpoved);
    if (
      odpoved.ok &&
      typeof telo === "object" &&
      telo !== null &&
      (telo as Record<string, unknown>)["ok"] === true
    ) {
      return { ok: true, data: { ok: true } };
    }
    return chybaZTela(telo);
  } catch {
    return { ok: false, chyba: OFFLINE_MAZANI };
  }
}
