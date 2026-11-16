import { apiBase } from "./api-base";
import { chybaZApiTela, ctiJsonTelo } from "./api-odpoved";
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
  GLOBALNI_ZPRAVY_PATH,
  KONVERZACE_PATH,
  diskuzeMetaPath,
  diskuzeReadPath,
  jeApiChyba,
  jeApiZprava,
  jeDiskuzeMetaOdpoved,
  jeKonverzaceOdpoved,
  jeOznacPrecteniOdpoved,
  jePosliGlobalZpravuOdpoved,
  jePosliZpravuOdpoved,
  jeZpravyOdpoved,
  konverzaceReadPath,
  zpravaDetailPath,
  zpravyListUrl,
  zpravyPath,
  type ApiErrorCode,
  type ApiZprava,
  type DiskuzeMetaResponse,
  type KanalDiskuze,
  type KonverzaceListResponse,
  type OznacPrecteniResponse,
  type PosliGlobalZpravuResponse,
  type PosliZpravuResponse,
  type SmazatZpravuResponse,
  type ZpravyListQuery,
  type ZpravyListResponse,
} from "../shared/api-types";
import type { PravoSkupiny, SkupinyListResponse } from "./skupiny-pristup";

export type { ApiZprava };
export type { DiskuzeMetaResponse, OznacPrecteniResponse };

/** Sjednocený výsledek — úspěch nese data, chyba českou hlášku. */
export type DiskuzeVysledek<T> =
  | { ok: true; data: T }
  | { ok: false; chyba: string; kod?: ApiErrorCode; chybyPoli?: Record<string, string> };

const OFFLINE_CTENI = "Zprávy jsou bez připojení nedostupné.";
const OFFLINE_ZAPIS = "Bez připojení zprávu poslat nejde. Zkus to později.";
const OFFLINE_MAZANI = "Bez připojení smazat nejde. Zkus to později.";
const OFFLINE_META = "Přečtení je bez připojení nedostupné.";
const OFFLINE_READ = "Bez připojení označit jako přečtené nejde. Zkus to později.";
const OFFLINE_KONVERZACE = "Přehled konverzací je bez připojení nedostupný.";

/**
 * Optimistic cache klíč — POUZE cache pro okamžité zhasnutí tečky.
 * Pravdou je vždy server (`GET meta` po reloadu); localStorage se nikdy
 * nečte jako `unread`, jen se do něj zapisuje čas po úspěšném POST read
 * a po načtení meta (aby UI neblikalo při přechodu mezi výpravami).
 */
export const DISKUZE_LAST_READ_CACHE_KLIC = "exapp:discussion-lastRead-v1" as const;

function klicCacheProVypravu(idVypravy: string): string {
  return `${DISKUZE_LAST_READ_CACHE_KLIC}:${idVypravy}`;
}

/** Zapíše optimistic čas do cache (best-effort, chyby úložiště ignoruje). */
export function ulozLastReadDoCache(idVypravy: string, lastReadAt: string): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(klicCacheProVypravu(idVypravy), lastReadAt);
  } catch {
    // Cache je nepovinná — pád úložiště nesmí shodit UI.
  }
}

/** Přečte optimistic čas z cache; null = žádná cache (není to pravda o unread). */
export function ctiLastReadZCache(idVypravy: string): string | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw: string | null = localStorage.getItem(klicCacheProVypravu(idVypravy));
    if (raw === null || raw.trim().length === 0) return null;
    if (Number.isNaN(Date.parse(raw))) return null;
    return raw;
  } catch {
    return null;
  }
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

/** Expedition thread. Logged-in members only. Ordered by created_at ASC. */
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
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    const telo: unknown = await ctiJsonTelo(odpoved);
    if (odpoved.ok && jeZpravyOdpoved(telo)) {
      return { ok: true, data: telo };
    }
    return chybaZApiTela(telo);
  } catch {
    return { ok: false, chyba: OFFLINE_CTENI };
  }
}

/**
 * JSON when there are no files. Multipart (`text` + repeated `soubor`) otherwise.
 * Content-Type for FormData is left to the browser so the boundary stays intact.
 */
async function odesliZpravuNaCestu(
  cesta: string,
  pole: Record<string, string>,
  soubory: readonly File[] | undefined,
): Promise<{ odpoved: Response; telo: unknown } | { chyba: string }> {
  const zaklad: string = apiBase();
  if (zaklad.length === 0) return { chyba: OFFLINE_ZAPIS };
  const headers: Record<string, string> = { Accept: "application/json" };
  let body: BodyInit;
  if (soubory !== undefined && soubory.length > 0) {
    const form = new FormData();
    for (const [klic, hodnota] of Object.entries(pole)) form.append(klic, hodnota);
    for (const soubor of soubory) form.append("soubor", soubor, soubor.name);
    body = form;
  } else {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(pole);
  }
  try {
    const odpoved: Response = await fetch(`${zaklad}${cesta}`, {
      method: "POST",
      credentials: "include",
      headers,
      body,
    });
    const telo: unknown = await ctiJsonTelo(odpoved);
    return { odpoved, telo };
  } catch {
    return { chyba: OFFLINE_ZAPIS };
  }
}

function jeOdpovedFetch(
  hodnota: { odpoved: Response; telo: unknown } | { chyba: string },
): hodnota is { odpoved: Response; telo: unknown } {
  return "odpoved" in hodnota;
}

function chybyValidace(telo: unknown): DiskuzeVysledek<never> | null {
  if (!jeApiChyba(telo) || telo.error.code !== "VALIDATION_ERROR") return null;
  const detaily: Record<string, string[]> = telo.error.details ?? {};
  const chybyPoli: Record<string, string> = {};
  for (const [pole, seznam] of Object.entries(detaily)) {
    const prvni: string | undefined = seznam[0];
    if (prvni !== undefined) chybyPoli[pole] = prvni;
  }
  return { ok: false, chyba: telo.error.message, kod: telo.error.code, chybyPoli };
}

/** Poslání zprávy (USER, rate-limit 10/min/ip hlídá server 429 MOC_POZADAVKU). */
export async function posliZpravu(
  idVypravy: string,
  text: string,
  soubory?: readonly File[],
): Promise<DiskuzeVysledek<PosliZpravuResponse>> {
  const odeslano = await odesliZpravuNaCestu(
    zpravyPath(idVypravy),
    { text: text.trim() },
    soubory,
  );
  if (!jeOdpovedFetch(odeslano)) return { ok: false, chyba: odeslano.chyba };
  const { odpoved, telo } = odeslano;
  if (odpoved.status === 201 && jePosliZpravuOdpoved(telo)) {
    return { ok: true, data: telo };
  }
  const validace = chybyValidace(telo);
  if (validace !== null) return validace;
  return chybaZApiTela(telo);
}

/** Meta vlákna pro badge (PUBLIC — anonym: lastReadAt null, unread false). */
export async function getDiscussionMeta(
  idVypravy: string,
): Promise<DiskuzeVysledek<DiskuzeMetaResponse>> {
  const zaklad: string = apiBase();
  if (zaklad.length === 0) {
    return {
      ok: true,
      data: { latestMessageAt: null, lastReadAt: null, unread: false },
    };
  }
  try {
    const odpoved: Response = await fetch(`${zaklad}${diskuzeMetaPath(idVypravy)}`, {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    const telo: unknown = await ctiJsonTelo(odpoved);
    if (odpoved.ok && jeDiskuzeMetaOdpoved(telo)) {
      // Cache je jen optimistic — pravdu drží server, reload čte znovu meta.
      if (telo.lastReadAt !== null) ulozLastReadDoCache(idVypravy, telo.lastReadAt);
      return { ok: true, data: telo };
    }
    return chybaZApiTela(telo);
  } catch {
    return { ok: false, chyba: OFFLINE_META };
  }
}

/**
 * Označení vlákna jako přečteného (USER, idempotentní POST read).
 * Po úspěchu zapíše čas i do optimistic cache (tečka zhasne hned,
 * reload potvrdí stav ze serveru).
 */
export async function markAsRead(
  idVypravy: string,
): Promise<DiskuzeVysledek<OznacPrecteniResponse>> {
  const zaklad: string = apiBase();
  if (zaklad.length === 0) {
    return { ok: false, chyba: OFFLINE_READ };
  }
  try {
    const odpoved: Response = await fetch(`${zaklad}${diskuzeReadPath(idVypravy)}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({}),
    });
    const telo: unknown = await ctiJsonTelo(odpoved);
    if (odpoved.ok && jeOznacPrecteniOdpoved(telo)) {
      ulozLastReadDoCache(idVypravy, telo.lastReadAt);
      return { ok: true, data: telo };
    }
    return chybaZApiTela(telo);
  } catch {
    return { ok: false, chyba: OFFLINE_READ };
  }
}

/**
 * Přehled konverzací Step 2 (PUBLIC — čte i anonym, unreadCount anonym 0).
 * Jména jsou přímo v `lastMessage.authorName` — žádný extra fetch.
 */
export async function getKonverzace(): Promise<
  DiskuzeVysledek<KonverzaceListResponse>
> {
  const zaklad: string = apiBase();
  if (zaklad.length === 0) return { ok: true, data: { konverzace: [] } };
  try {
    const odpoved: Response = await fetch(`${zaklad}${KONVERZACE_PATH}`, {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    const telo: unknown = await ctiJsonTelo(odpoved);
    if (odpoved.ok && jeKonverzaceOdpoved(telo)) {
      return { ok: true, data: telo };
    }
    return chybaZApiTela(telo);
  } catch {
    return { ok: false, chyba: OFFLINE_KONVERZACE };
  }
}

/** Soukromé vlákno dvou účtů (jen účastník). */
export async function getSoukromeZpravy(
  klic: string,
): Promise<DiskuzeVysledek<ZpravyListResponse>> {
  const zaklad: string = apiBase();
  if (zaklad.length === 0) return { ok: true, data: { zpravy: [], nextCursor: null } };
  const params = new URLSearchParams();
  params.set("klic", klic);
  try {
    const odpoved: Response = await fetch(
      `${zaklad}/api/diskuze/soukrome?${params.toString()}`,
      { credentials: "include", headers: { Accept: "application/json" } },
    );
    const telo: unknown = await ctiJsonTelo(odpoved);
    if (odpoved.ok && jeZpravyOdpoved(telo)) return { ok: true, data: telo };
    return chybaZApiTela(telo);
  } catch {
    return { ok: false, chyba: OFFLINE_CTENI };
  }
}

/** Zpráva jen jednomu členovi. Soubory jdou jako opakované pole `soubor`. */
export async function posliSoukromouZpravu(
  partnerId: string,
  text: string,
  soubory?: readonly File[],
): Promise<DiskuzeVysledek<PosliZpravuResponse>> {
  const odeslano = await odesliZpravuNaCestu(
    "/api/diskuze/soukrome",
    { partnerId, text: text.trim() },
    soubory,
  );
  if (!jeOdpovedFetch(odeslano)) return { ok: false, chyba: odeslano.chyba };
  const { odpoved, telo } = odeslano;
  if (odpoved.status === 201 && jePosliZpravuOdpoved(telo)) {
    return { ok: true, data: telo };
  }
  return chybaZApiTela(telo);
}

/** Global thread (dulezite / general). Logged-in members only. */
export async function getGlobalZpravy(
  channel: KanalDiskuze,
  query: ZpravyListQuery = {},
): Promise<DiskuzeVysledek<ZpravyListResponse>> {
  const zaklad: string = apiBase();
  if (zaklad.length === 0) return { ok: true, data: { zpravy: [], nextCursor: null } };
  const params = new URLSearchParams();
  params.set("channel", channel);
  if (query.limit !== undefined) params.set("limit", String(query.limit));
  if (query.cursor !== undefined) params.set("cursor", query.cursor);
  if (query.tail === true) params.set("tail", "1");
  try {
    const odpoved: Response = await fetch(
      `${zaklad}${GLOBALNI_ZPRAVY_PATH}?${params.toString()}`,
      { credentials: "include", headers: { Accept: "application/json" } },
    );
    const telo: unknown = await ctiJsonTelo(odpoved);
    if (odpoved.ok && jeZpravyOdpoved(telo)) {
      return { ok: true, data: telo };
    }
    return chybaZApiTela(telo);
  } catch {
    return { ok: false, chyba: OFFLINE_CTENI };
  }
}

/**
 * Zápis do globálu (USER + serverový guard kanálu).
 * `dulezite` bez vedení/rada/admin → 403 ZAKAZANO; `general` projde každý
 * přihlášený. Text se posílá otrimovaný, ukládá se raw.
 */
export async function posliGlobalZpravu(
  channel: "dulezite" | "general",
  text: string,
  soubory?: readonly File[],
): Promise<DiskuzeVysledek<PosliGlobalZpravuResponse>> {
  const odeslano = await odesliZpravuNaCestu(
    GLOBALNI_ZPRAVY_PATH,
    { channel, text: text.trim() },
    soubory,
  );
  if (!jeOdpovedFetch(odeslano)) return { ok: false, chyba: odeslano.chyba };
  const { odpoved, telo } = odeslano;
  if (odpoved.status === 201 && jePosliGlobalZpravuOdpoved(telo)) {
    return { ok: true, data: telo };
  }
  const validace = chybyValidace(telo);
  if (validace !== null) return validace;
  return chybaZApiTela(telo);
}

/**
 * Označení konverzace jako přečtené (USER, idempotentní POST read).
 * Key: `dulezite` | `general` | `expedice:<slug>` (čas razí server).
 */
export async function oznacKonverzaciJakoPrectenou(
  key: string,
): Promise<DiskuzeVysledek<OznacPrecteniResponse>> {
  const zaklad: string = apiBase();
  if (zaklad.length === 0) {
    return { ok: false, chyba: OFFLINE_READ };
  }
  try {
    const odpoved: Response = await fetch(`${zaklad}${konverzaceReadPath()}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ key }),
    });
    const telo: unknown = await ctiJsonTelo(odpoved);
    if (odpoved.ok && jeOznacPrecteniOdpoved(telo)) {
      return { ok: true, data: telo };
    }
    return chybaZApiTela(telo);
  } catch {
    return { ok: false, chyba: OFFLINE_READ };
  }
}

/** Soft-delete. Server decides the 10 minute window and the admin bypass. */
async function smazNaCeste(cesta: string): Promise<DiskuzeVysledek<SmazatZpravuResponse>> {
  const zaklad: string = apiBase();
  if (zaklad.length === 0) {
    return { ok: false, chyba: OFFLINE_MAZANI };
  }
  try {
    const odpoved: Response = await fetch(`${zaklad}${cesta}`, {
      method: "DELETE",
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    const telo: unknown = await ctiJsonTelo(odpoved);
    if (
      odpoved.ok &&
      typeof telo === "object" &&
      telo !== null &&
      (telo as Record<string, unknown>)["ok"] === true
    ) {
      return { ok: true, data: { ok: true } };
    }
    return chybaZApiTela(telo);
  } catch {
    return { ok: false, chyba: OFFLINE_MAZANI };
  }
}

/** Smazání zprávy výpravy (autor do 10 minut, nebo admin). */
export async function smazZpravu(
  idVypravy: string,
  zpravaId: string,
): Promise<DiskuzeVysledek<SmazatZpravuResponse>> {
  return smazNaCeste(zpravaDetailPath(idVypravy, zpravaId));
}

/** Smazání zprávy v Důležitém nebo Generalu. */
export async function smazGlobalZpravu(
  zpravaId: string,
): Promise<DiskuzeVysledek<SmazatZpravuResponse>> {
  return smazNaCeste(`${GLOBALNI_ZPRAVY_PATH}/${encodeURIComponent(zpravaId)}`);
}

/** Smazání soukromé zprávy. Účastník vlákna, autor do 10 minut nebo admin. */
export async function smazSoukromouZpravu(
  zpravaId: string,
): Promise<DiskuzeVysledek<SmazatZpravuResponse>> {
  return smazNaCeste(`/api/diskuze/soukrome/${encodeURIComponent(zpravaId)}`);
}

/** Smazání zprávy ve vlastní skupině. */
export async function smazSkupinaZpravu(
  idSkupiny: string,
  zpravaId: string,
): Promise<DiskuzeVysledek<SmazatZpravuResponse>> {
  return smazNaCeste(
    `/api/diskuze/skupiny/${encodeURIComponent(idSkupiny)}/zpravy/${encodeURIComponent(zpravaId)}`,
  );
}

function jeSkupinyOdpoved(hodnota: unknown): hodnota is SkupinyListResponse {
  if (typeof hodnota !== "object" || hodnota === null) return false;
  const zaznam = hodnota as Record<string, unknown>;
  return Array.isArray(zaznam["skupiny"]) && typeof zaznam["muzeSpravovat"] === "boolean";
}

/** Custom groups the caller may see, plus whether they may manage them. */
export async function getSkupiny(): Promise<DiskuzeVysledek<SkupinyListResponse>> {
  const zaklad: string = apiBase();
  if (zaklad.length === 0) return { ok: true, data: { skupiny: [], muzeSpravovat: false } };
  try {
    const odpoved: Response = await fetch(`${zaklad}/api/diskuze/skupiny`, {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    const telo: unknown = await ctiJsonTelo(odpoved);
    if (odpoved.ok && jeSkupinyOdpoved(telo)) return { ok: true, data: telo };
    return chybaZApiTela(telo);
  } catch {
    return { ok: false, chyba: OFFLINE_KONVERZACE };
  }
}

/** Create or replace a group's name and role permissions. */
export async function ulozSkupinu(
  id: string | null,
  nazev: string,
  prava: readonly PravoSkupiny[],
): Promise<DiskuzeVysledek<{ id: string }>> {
  const zaklad: string = apiBase();
  if (zaklad.length === 0) return { ok: false, chyba: OFFLINE_ZAPIS };
  try {
    const odpoved: Response = await fetch(
      id === null ? `${zaklad}/api/diskuze/skupiny` : `${zaklad}/api/diskuze/skupiny/${id}`,
      {
        method: id === null ? "POST" : "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ nazev, prava }),
      },
    );
    const telo: unknown = await ctiJsonTelo(odpoved);
    if (
      (odpoved.status === 201 || odpoved.ok) &&
      typeof telo === "object" &&
      telo !== null &&
      typeof (telo as { id?: unknown }).id === "string"
    ) {
      return { ok: true, data: { id: (telo as { id: string }).id } };
    }
    return chybaZApiTela(telo);
  } catch {
    return { ok: false, chyba: OFFLINE_ZAPIS };
  }
}

export async function smazSkupinu(id: string): Promise<DiskuzeVysledek<{ ok: true }>> {
  const zaklad: string = apiBase();
  if (zaklad.length === 0) return { ok: false, chyba: OFFLINE_MAZANI };
  try {
    const odpoved: Response = await fetch(`${zaklad}/api/diskuze/skupiny/${id}`, {
      method: "DELETE",
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    const telo: unknown = await ctiJsonTelo(odpoved);
    if (odpoved.ok) return { ok: true, data: { ok: true } };
    return chybaZApiTela(telo);
  } catch {
    return { ok: false, chyba: OFFLINE_MAZANI };
  }
}

export async function getSkupinaZpravy(
  id: string,
): Promise<DiskuzeVysledek<ZpravyListResponse>> {
  const zaklad: string = apiBase();
  if (zaklad.length === 0) return { ok: true, data: { zpravy: [], nextCursor: null } };
  try {
    const odpoved: Response = await fetch(`${zaklad}/api/diskuze/skupiny/${id}/zpravy`, {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
    const telo: unknown = await ctiJsonTelo(odpoved);
    if (odpoved.ok && jeZpravyOdpoved(telo)) return { ok: true, data: telo };
    return chybaZApiTela(telo);
  } catch {
    return { ok: false, chyba: OFFLINE_CTENI };
  }
}

export async function posliSkupinaZpravu(
  id: string,
  text: string,
  soubory?: readonly File[],
): Promise<DiskuzeVysledek<PosliZpravuResponse>> {
  const odeslano = await odesliZpravuNaCestu(
    `/api/diskuze/skupiny/${encodeURIComponent(id)}/zpravy`,
    { text: text.trim() },
    soubory,
  );
  if (!jeOdpovedFetch(odeslano)) return { ok: false, chyba: odeslano.chyba };
  const { odpoved, telo } = odeslano;
  if (odpoved.status === 201 && jePosliZpravuOdpoved(telo)) {
    return { ok: true, data: telo };
  }
  return chybaZApiTela(telo);
}
