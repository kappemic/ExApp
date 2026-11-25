/**
 * Tenká vrstva pro Strava propojení (Fáze 4, Krok 1).
 *
 * Kontrakt (`src/shared/api-types.ts` §15):
 * - `GET {VITE_API_BASE_URL}/api/strava/auth-url` (USER, credentials) → `{ url }`
 *   na Strava authorize. `state` a httpOnly cookie vydá server.
 * - `DELETE {VITE_API_BASE_URL}/api/strava/odpojit` (USER, credentials)
 *   → `{ ok: true }` (idempotentní).
 * - Stav propojení čte `GET /api/me` (`ApiUser.stravaId`) — žádný nový
 *   endpoint, žádný token v klientovi.
 * V klientovi smí být jen `VITE_*` (veřejné CLIENT_ID). Tajné klíče
 * serveru sem nikdy nepatří — výměna code→tokens běží jen na serveru.
 */

import { apiBaseUrl } from "./api-base";
import { OBECNA_CHYBA, ctiJsonTelo, jeRecord } from "./api-odpoved";
import { CTENI_BEZ_SPOJENI, ZAPIS_BEZ_SPOJENI } from "./spojeni";
import {
  ME_PATH,
  STRAVA_CALLBACK_DUVOD_ZPRAVY,
  STRAVA_NENI_NASTAVENA_ZPRAVA,
  jeApiChyba,
  jeNeparovaneAktivityOdpoved,
  jeOdpojAktivituOdpoved,
  jeSparujAktivituOdpoved,
  jeStravaCallbackDuvod,
  jeStravaStavResponse,
  neparovaneAktivityUrl,
  stravaParovaniPath,
  type ApiErrorCode,
  type ApiUser,
  type NeparovanaAktivita,
  type NeparovaneAktivityQuery,
  type NeparovaneAktivityResponse,
  type OdpojAktivituResponse,
  type SparujAktivituResponse,
  type StravaCallbackDuvod,
  type StravaStavResponse,
} from "../shared/api-types";

export type { NeparovanaAktivita };

export type StravaVysledek<T> =
  | { ok: true; data: T }
  | { ok: false; chyba: string; kod?: ApiErrorCode };

/**
 * Druh chyby pro rozlišení větví v UI (Step 3, staví na Step 2 kontraktu
 * `502 STRAVA_NEDOSTUPNA` + `ApiErrorCode`).
 * Každá větev má v `StravaParovani` vlastní text i akci.
 */
export type StravaChybaDruh =
  | "validace"
  | "strava-nedostupna"
  | "neprihlasen"
  | "zakazano"
  | "konflikt"
  | "obecna";

/**
 * Mapuje `ApiErrorCode` na druh pro UI.
 * - 422 `VALIDATION_ERROR` → `validace` (inline hláška, bez retry).
 * - 502 `STRAVA_NEDOSTUPNA` → `strava-nedostupna` (Propoj Stravu + retry).
 * - 401 (`NEPRIHLASEN`, `KOD_NEPLATNY`, `SPATNE_HESLO`) → `neprihlasen`.
 * - 403 `ZAKAZANO` → `zakazano`.
 * - 409 (`VYPRAVA_UZAVRENA`, `UZ_PRIHLASEN`, `KAPACITA_PLNA`,
 *   `EMAIL_OBSAZEN`) → `konflikt` (bez slepého retry).
 * - Zbytek včetně chybějícího kódu → `obecna`.
 */
export function druhStravaChyby(kod?: ApiErrorCode): StravaChybaDruh {
  switch (kod) {
    case "VALIDATION_ERROR":
      return "validace";
    case "STRAVA_NEDOSTUPNA":
      return "strava-nedostupna";
    case "NEPRIHLASEN":
    case "KOD_NEPLATNY":
    case "SPATNE_HESLO":
      return "neprihlasen";
    case "ZAKAZANO":
      return "zakazano";
    case "UZ_PRIHLASEN":
    case "KAPACITA_PLNA":
    case "VYPRAVA_UZAVRENA":
    case "EMAIL_OBSAZEN":
    case "PISEN_UZ_JE":
      return "konflikt";
    default:
      return "obecna";
  }
}

/**
 * Ruční retry (tlačítko „Zkusit znovu") má smysl jen u výpadku:
 * 502 `STRAVA_NEDOSTUPNA`, chybějící kód (network fail / BFF mimo)
 * a 500 `VNITRNI_CHYBA`. U validace, 401/403 ani 409 retry nikdy —
 * slepé opakování by nepomohlo. Žádný auto-retry: volá jen UI po kliku.
 */
export function muzeOpakovatStravaChybu(kod?: ApiErrorCode): boolean {
  return (
    kod === undefined ||
    kod === "STRAVA_NEDOSTUPNA" ||
    kod === "VNITRNI_CHYBA"
  );
}

/**
 * Sdílená větev „nedostupná" (Step 2 + Step 3):
 * 502 `STRAVA_NEDOSTUPNA` i network fail (fetch reject → bez kódu)
 * ukazují stejnou větev — „Propoj Stravu" v profilu + ruční retry.
 */
export function jeStravaNedostupnaVetev(kod?: ApiErrorCode): boolean {
  return kod === "STRAVA_NEDOSTUPNA" || kod === undefined;
}

export interface StravaStavPropojeni {
  propojeno: boolean;
  stravaId: string | null;
}

export type { StravaStavResponse };

/**
 * Rozšířený stav propojení z `GET /api/strava/stav` (Step 5, tenký slice).
 * Nese `stravaId` (atlet), `scope` a `expirace` (ISO) — nikdy tokeny.
 * Backend mimo / bez session → `{ ok: false }` (tab ukáže chybu).
 */
export async function nactiStravaStavRozsireny(moznosti?: {
  obnovit?: boolean;
}): Promise<StravaVysledek<StravaStavResponse>> {
  const zaklad = apiBaseUrl();
  if (zaklad.length === 0) return { ok: false, chyba: OBECNA_CHYBA };
  const obnovit = moznosti?.obnovit === true ? "?obnovit=1" : "";
  let odpoved: Response;
  try {
    odpoved = await fetch(`${zaklad}/api/strava/stav${obnovit}`, {
      headers: { Accept: "application/json" },
      credentials: "include",
    });
  } catch {
    return { ok: false, chyba: CTENI_BEZ_SPOJENI };
  }
  const telo = await ctiJsonTelo(odpoved);
  if (!odpoved.ok) {
    if (jeApiChyba(telo)) {
      return { ok: false, chyba: telo.error.message, kod: telo.error.code };
    }
    return { ok: false, chyba: OBECNA_CHYBA };
  }
  if (!jeStravaStavResponse(telo)) return { ok: false, chyba: OBECNA_CHYBA };
  return { ok: true, data: telo };
}

/** Veřejné Strava CLIENT_ID pro OAuth redirect (není tajné). "" = není. */
export function verejneStravaClientId(): string {
  const raw: unknown = import.meta.env.VITE_STRAVA_CLIENT_ID;
  if (typeof raw !== "string") return "";
  return raw.trim();
}

function jeUrlOdpoved(hodnota: unknown): hodnota is { url: string } {
  if (!jeRecord(hodnota)) return false;
  const url = hodnota["url"];
  return (
    typeof url === "string" &&
    url.startsWith("https://www.strava.com/oauth/authorize?")
  );
}

/**
 * Guard reálného CLIENT_ID (Krok 7b, klientská strana).
 * Strava app id je vždy decimální číslo — mock (`mock-client-id`),
 * prázdné i nečíselné hodnoty znamenají „chybí reálné ID".
 * Nikdy se z nich nestaví redirect do prohlížeče (Strava 400 invalid).
 */
export function jeRealneStravaClientId(hodnota: string): boolean {
  return /^\d+$/.test(hodnota.trim());
}

/**
 * Podrobný výsledek authorize URL (Krok 7b).
 * `nenastavena=true` = backend vrátil 503 STRAVA_NENI_NASTAVENA, nebo
 * lokální CLIENT_ID není reálné číselné — UI místo redirectu ukáže
 * vysvětlující hlášku + návod (STRAVA_CLIENT_ID / vypni MOCK).
 */
export type StravaAuthUrlVysledek =
  | { ok: true; url: string }
  | { ok: false; nenastavena: boolean; zprava: string; kod?: ApiErrorCode };

/**
 * Authorize URL pro tlačítko Připojit: nejdřív backend
 * (`GET /api/strava/auth-url`, session cookie). The server issues `state`
 * and the matching httpOnly cookie — a client-built authorize URL is not used.
 * Rozpozná 503 STRAVA_NENI_NASTAVENA a nese `nenastavena` pro UI.
 */
export async function getStravaAuthUrlPodrobne(
  state = "",
): Promise<StravaAuthUrlVysledek> {
  // The server binds state to the session. A caller-supplied value is ignored.
  void state;
  const zaklad = apiBaseUrl();
  if (zaklad.length > 0) {
    try {
      const url = `${zaklad}/api/strava/auth-url`;
      const odpoved = await fetch(url, {
        headers: { Accept: "application/json" },
        credentials: "include",
      });
      if (odpoved.ok) {
        const telo = await ctiJsonTelo(odpoved);
        if (jeUrlOdpoved(telo)) return { ok: true, url: telo.url };
      } else {
        const telo = await ctiJsonTelo(odpoved);
        if (
          odpoved.status === 503 &&
          jeApiChyba(telo) &&
          telo.error.code === "STRAVA_NENI_NASTAVENA"
        ) {
          return {
            ok: false,
            nenastavena: true,
            zprava: telo.error.message,
            kod: telo.error.code,
          };
        }
        if (jeApiChyba(telo)) {
          return {
            ok: false,
            nenastavena: false,
            zprava: telo.error.message,
            kod: telo.error.code,
          };
        }
      }
    } catch {
      // The OAuth cookie is only set by the server, so there is no local URL.
    }
  }
  const verejneId = verejneStravaClientId();
  if (!jeRealneStravaClientId(verejneId)) {
    return { ok: false, nenastavena: true, zprava: STRAVA_NENI_NASTAVENA_ZPRAVA };
  }
  return { ok: false, nenastavena: false, zprava: OBECNA_CHYBA };
}

/**
 * Authorize URL pro tlačítko Připojit (zpětně kompatibilní obálka).
 * Null = propojení teď nejde sestavit (chybí konfigurace / backend).
 * Kdo potřebuje rozlišit 503, použije `getStravaAuthUrlPodrobne`.
 */
export async function getStravaAuthUrl(state = ""): Promise<string | null> {
  const vysledek = await getStravaAuthUrlPodrobne(state);
  if (vysledek.ok) return vysledek.url;
  return null;
}

/**
 * Společný Strava connect handler (required fix 7 — jediný zdroj pravdy
 * pro „Připojit Stravu": sestav URL přes `getStravaAuthUrlPodrobne` a při
 * úspěchu přesměruj prohlížeč na Strava authorize. Vrací výsledek pro UI
 * (ProfilPage mapuje `nenastavena` / chybu na stav + hlášku, redirect se
 * už stal). Bez `window` jen vrátí URL bez redirectu (testy / SSR safe).
 */
export async function presmerujNaStravuAutorizaci(
  state = "",
): Promise<StravaAuthUrlVysledek> {
  const vysledek = await getStravaAuthUrlPodrobne(state);
  if (!vysledek.ok) return vysledek;
  if (typeof window !== "undefined") {
    window.location.href = vysledek.url;
  }
  return vysledek;
}

function jeApiUser(hodnota: unknown): hodnota is ApiUser {
  if (!jeRecord(hodnota)) return false;
  if (typeof hodnota["id"] !== "string") return false;
  const stravaId: unknown = hodnota["stravaId"];
  return typeof stravaId === "string" || stravaId === null;
}

/**
 * Stav propojení z `GET /api/me` (session cookie, USER).
 * Backend mimo / bez session → `{ ok: false }` (ProfilPage ukáže chybu,
 * nikdy nevyhazuje).
 */
export async function nactiStravaStav(): Promise<
  StravaVysledek<StravaStavPropojeni>
> {
  const zaklad = apiBaseUrl();
  if (zaklad.length === 0) return { ok: false, chyba: OBECNA_CHYBA };
  let odpoved: Response;
  try {
    odpoved = await fetch(`${zaklad}${ME_PATH}`, {
      headers: { Accept: "application/json" },
      credentials: "include",
    });
  } catch {
    return { ok: false, chyba: CTENI_BEZ_SPOJENI };
  }
  const telo = await ctiJsonTelo(odpoved);
  if (!odpoved.ok) {
    if (jeApiChyba(telo)) {
      return { ok: false, chyba: telo.error.message, kod: telo.error.code };
    }
    return { ok: false, chyba: OBECNA_CHYBA };
  }
  if (!jeApiUser(telo)) return { ok: false, chyba: OBECNA_CHYBA };
  return {
    ok: true,
    data: {
      propojeno: telo.stravaId !== null,
      stravaId: telo.stravaId,
    },
  };
}

/** Odpojení Stravy (`DELETE /api/strava/odpojit`, USER). */
export async function odpojStravu(): Promise<StravaVysledek<{ ok: true }>> {
  const zaklad = apiBaseUrl();
  if (zaklad.length === 0) return { ok: false, chyba: OBECNA_CHYBA };
  let odpoved: Response;
  try {
    odpoved = await fetch(`${zaklad}/api/strava/odpojit`, {
      method: "DELETE",
      headers: { Accept: "application/json" },
      credentials: "include",
    });
  } catch {
    return { ok: false, chyba: ZAPIS_BEZ_SPOJENI };
  }
  const telo = await ctiJsonTelo(odpoved);
  if (!odpoved.ok) {
    if (jeApiChyba(telo)) {
      return { ok: false, chyba: telo.error.message, kod: telo.error.code };
    }
    return { ok: false, chyba: OBECNA_CHYBA };
  }
  return { ok: true, data: { ok: true } };
}

/**
 * Všechny moje aktivity (`GET /api/strava/neparovane`, USER, Krok 13).
 * Server vrací VŠECHNY aktivity s `sparovano` + `celkem`
 * (před stránkováním `?page&per_page`, default 1/30, max 100).
 * Prázdné pole = nic k párování / bez propojení.
 */
export async function nactiNeparovaneAktivity(
  query: NeparovaneAktivityQuery = {},
): Promise<StravaVysledek<NeparovaneAktivityResponse>> {
  const zaklad = apiBaseUrl();
  if (zaklad.length === 0) return { ok: false, chyba: OBECNA_CHYBA };
  let odpoved: Response;
  try {
    odpoved = await fetch(`${zaklad}${neparovaneAktivityUrl(query)}`, {
      headers: { Accept: "application/json" },
      credentials: "include",
    });
  } catch {
    return { ok: false, chyba: CTENI_BEZ_SPOJENI };
  }
  const telo = await ctiJsonTelo(odpoved);
  if (!odpoved.ok) {
    if (jeApiChyba(telo)) {
      return { ok: false, chyba: telo.error.message, kod: telo.error.code };
    }
    return { ok: false, chyba: OBECNA_CHYBA };
  }
  if (!jeNeparovaneAktivityOdpoved(telo)) {
    return { ok: false, chyba: OBECNA_CHYBA };
  }
  return { ok: true, data: telo };
}

/**
 * Confirm párování (`POST /api/expeditions/:id/strava-parovani`, dual-guard).
 * Jen `proběhlá` (jinak 409 `VYPRAVA_UZAVRENA`), duplicita → 409,
 * USER bez práva → 403. Zapíše `km / prevyseni / polyline / activityId`.
 */
export async function sparujAktivitu(
  expeditionId: string,
  activityId: string,
): Promise<StravaVysledek<SparujAktivituResponse>> {
  const zaklad = apiBaseUrl();
  if (zaklad.length === 0) return { ok: false, chyba: OBECNA_CHYBA };
  let odpoved: Response;
  try {
    odpoved = await fetch(`${zaklad}${stravaParovaniPath(expeditionId)}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      credentials: "include",
      body: JSON.stringify({ activityId }),
    });
  } catch {
    return { ok: false, chyba: ZAPIS_BEZ_SPOJENI };
  }
  const telo = await ctiJsonTelo(odpoved);
  if (!odpoved.ok) {
    if (jeApiChyba(telo)) {
      return { ok: false, chyba: telo.error.message, kod: telo.error.code };
    }
    return { ok: false, chyba: OBECNA_CHYBA };
  }
  if (!jeSparujAktivituOdpoved(telo)) {
    return { ok: false, chyba: OBECNA_CHYBA };
  }
  return { ok: true, data: telo };
}

/**
 * Odpojení aktivity od výpravy
 * (`DELETE /api/expeditions/:id/strava-parovani`, dual-guard, Krok 13).
 * Jen `proběhlá` (jinak 409 `VYPRAVA_UZAVRENA`), nic připojeno → 404,
 * USER bez práva → 403. Vymaže 4 sloupce → statistiky klesnou.
 */
export async function odpojAktivitu(
  expeditionId: string,
): Promise<StravaVysledek<OdpojAktivituResponse>> {
  const zaklad = apiBaseUrl();
  if (zaklad.length === 0) return { ok: false, chyba: OBECNA_CHYBA };
  let odpoved: Response;
  try {
    odpoved = await fetch(`${zaklad}${stravaParovaniPath(expeditionId)}`, {
      method: "DELETE",
      headers: { Accept: "application/json" },
      credentials: "include",
    });
  } catch {
    return { ok: false, chyba: ZAPIS_BEZ_SPOJENI };
  }
  const telo = await ctiJsonTelo(odpoved);
  if (!odpoved.ok) {
    if (jeApiChyba(telo)) {
      return { ok: false, chyba: telo.error.message, kod: telo.error.code };
    }
    return { ok: false, chyba: OBECNA_CHYBA };
  }
  if (!jeOdpojAktivituOdpoved(telo)) {
    return { ok: false, chyba: OBECNA_CHYBA };
  }
  return { ok: true, data: telo };
}

/**
 * Příznak z URL po návratu ze Stravy (`/profil?strava=propojeno|chyba`).
 * Čte jen vlastní query — nikdy tokeny (ty zůstávají na serveru).
 */
export function ctiStravaPriznakZUrl(): "propojeno" | "chyba" | null {
  if (typeof window === "undefined") return null;
  const priznak = new URLSearchParams(window.location.search).get("strava");
  if (priznak === "propojeno" || priznak === "chyba") return priznak;
  return null;
}

/**
 * Důvod chyby z URL (`?strava=chyba&duvod=odepreno|neplatny-kod|…`).
 * Jen allowlist (`jeStravaCallbackDuvod`) — cokoliv jiného → null
 * (volající pak ukáže obecnou hlášku, nikdy raw query).
 */
export function ctiStravaDuvodZUrl(): StravaCallbackDuvod | null {
  if (typeof window === "undefined") return null;
  const duvod = new URLSearchParams(window.location.search).get("duvod");
  if (jeStravaCallbackDuvod(duvod)) return duvod;
  return null;
}

/**
 * Český překlad důvodu pro ProfilPage (Krok 9).
 * Neznámý / prázdný vstup → obecná hláška (nikdy raw query do UI).
 */
export function prelozStravaDuvod(duvod: string | null): string {
  if (jeStravaCallbackDuvod(duvod)) return STRAVA_CALLBACK_DUVOD_ZPRAVY[duvod];
  return "Propojení se nepovedlo. Zkus to prosím znovu.";
}
