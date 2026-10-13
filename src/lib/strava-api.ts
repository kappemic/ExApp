/**
 * Tenká vrstva pro Strava propojení (Fáze 4, Krok 1).
 *
 * Kontrakt (`src/shared/api-types.ts` §15):
 * - `GET {VITE_API_BASE_URL}/api/strava/auth-url` (PUBLIC) → `{ url }`
 *   na Strava authorize; lokální fallback staví stejnou URL z veřejného
 *   `VITE_STRAVA_CLIENT_ID` (prohlížeč → Strava → serverový callback).
 * - `DELETE {VITE_API_BASE_URL}/api/strava/odpojit` (USER, credentials)
 *   → `{ ok: true }` (idempotentní).
 * - Stav propojení čte `GET /api/me` (`ApiUser.stravaId`) — žádný nový
 *   endpoint, žádný token v klientovi.
 * V klientovi smí být jen `VITE_*` (veřejné CLIENT_ID). Tajné klíče
 * serveru sem nikdy nepatří — výměna code→tokens běží jen na serveru.
 */

import {
  ME_PATH,
  STRAVA_CALLBACK_DUVOD_ZPRAVY,
  STRAVA_NENI_NASTAVENA_ZPRAVA,
  jeApiChyba,
  jeNeparovaneAktivityOdpoved,
  jeOdpojAktivituOdpoved,
  jeSparujAktivituOdpoved,
  jeStravaCallbackDuvod,
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
} from "../shared/api-types";

export type { NeparovanaAktivita };

export type StravaVysledek<T> =
  | { ok: true; data: T }
  | { ok: false; chyba: string; kod?: ApiErrorCode };

export interface StravaStavPropojeni {
  propojeno: boolean;
  stravaId: string | null;
}

const OBECNA_CHYBA = "Něco se pokazilo. Zkus to prosím později.";
const STRAVA_AUTHORIZE_ZAKLAD = "https://www.strava.com/oauth/authorize";
const STRAVA_SCOPE = "read,activity:read";

function jeRecord(hodnota: unknown): hodnota is Record<string, unknown> {
  return typeof hodnota === "object" && hodnota !== null && !Array.isArray(hodnota);
}

/** Základ BFF (`VITE_API_BASE_URL`), bez koncového lomítka. "" = není. */
export function apiBaseUrl(): string {
  const raw: unknown = import.meta.env.VITE_API_BASE_URL;
  if (typeof raw !== "string") return "";
  return raw.trim().replace(/\/+$/, "");
}

/** Veřejné Strava CLIENT_ID pro OAuth redirect (není tajné). "" = není. */
export function verejneStravaClientId(): string {
  const raw: unknown = import.meta.env.VITE_STRAVA_CLIENT_ID;
  if (typeof raw !== "string") return "";
  return raw.trim();
}

async function ctiTelo(odpoved: Response): Promise<unknown> {
  try {
    return await odpoved.json();
  } catch {
    return null;
  }
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
 * Lokální authorize URL bez volání backendu (redirect_uri míří na
 * serverový callback `{apiBase}/api/strava/callback`). Null = chybí
 * reálné číselné CLIENT_ID nebo apiBase (mock URL se nikdy nestaví).
 */
export function sestavLokalniStravaUrl(state = ""): string | null {
  const clientId = verejneStravaClientId();
  const zaklad = apiBaseUrl();
  if (!jeRealneStravaClientId(clientId) || zaklad.length === 0) return null;
  const params = new URLSearchParams();
  params.set("client_id", clientId);
  params.set("response_type", "code");
  params.set("redirect_uri", `${zaklad}/api/strava/callback`);
  params.set("approval_prompt", "force");
  params.set("scope", STRAVA_SCOPE);
  const cistyState = state.trim();
  if (cistyState.length > 0) params.set("state", cistyState.slice(0, 256));
  return `${STRAVA_AUTHORIZE_ZAKLAD}?${params.toString()}`;
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
 * (`GET /api/strava/auth-url`, PUBLIC), při selhání lokální fallback
 * (jen s reálným číselným CLIENT_ID — mock URL se nikdy nevrací).
 * Rozpozná 503 STRAVA_NENI_NASTAVENA a nese `nenastavena` pro UI.
 */
export async function getStravaAuthUrlPodrobne(
  state = "",
): Promise<StravaAuthUrlVysledek> {
  const zaklad = apiBaseUrl();
  if (zaklad.length > 0) {
    try {
      const params = new URLSearchParams();
      if (state.trim().length > 0) params.set("state", state.trim().slice(0, 256));
      const qs = params.toString();
      const url =
        qs.length > 0
          ? `${zaklad}/api/strava/auth-url?${qs}`
          : `${zaklad}/api/strava/auth-url`;
      const odpoved = await fetch(url, { headers: { Accept: "application/json" } });
      if (odpoved.ok) {
        const telo = await ctiTelo(odpoved);
        if (jeUrlOdpoved(telo)) return { ok: true, url: telo.url };
      } else {
        const telo = await ctiTelo(odpoved);
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
      // Fallback níže — backend mimo.
    }
  }
  const lokalni = sestavLokalniStravaUrl(state);
  if (lokalni !== null) return { ok: true, url: lokalni };
  // Fallback taky nejde sestavit — rozliš příčinu pro návod v UI.
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
    return { ok: false, chyba: OBECNA_CHYBA };
  }
  const telo = await ctiTelo(odpoved);
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
    return { ok: false, chyba: OBECNA_CHYBA };
  }
  const telo = await ctiTelo(odpoved);
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
    return { ok: false, chyba: OBECNA_CHYBA };
  }
  const telo = await ctiTelo(odpoved);
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
    return { ok: false, chyba: OBECNA_CHYBA };
  }
  const telo = await ctiTelo(odpoved);
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
    return { ok: false, chyba: OBECNA_CHYBA };
  }
  const telo = await ctiTelo(odpoved);
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
