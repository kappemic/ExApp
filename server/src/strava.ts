/**
 * server/src/strava.ts — Strava OAuth + správa tokenů (Fáze 4, Krok 1, server-only).
 *
 * Flow (localhost): ProfilPage → GET /api/strava/auth-url (USER, session)
 * → redirect na Strava authorize → Strava redirectne
 * na GET /api/strava/callback?code= (USER, session + state cookie) → výměna
 * POUZE na serveru → upsert `strava_tokens` + `users.strava_id` → 302 zpět
 * na profil. Odpojení: DELETE /api/strava/odpojit (USER).
 *
 * BEZPEČNOST (skill security-and-hardening):
 * - `client_secret`, `access_token` i `refresh_token` žijí jen tady a v DB
 *   `strava_tokens` — nikdy se nevracejí klientovi (veřejný stav nese jen
 *   `StravaTokens` z kontraktu §15: stravaId / scope / expirace).
 * - Vstup (`code`/`state`) validuje `validujStravaCallback` na hranici;
 *   vnitřní kód typům věří. Tokeny se nikdy nelogují.
 * - `STRAVA_MOCK=1` je fixture pro testy / localhost bez reálného
 *   CLIENT_ID: výměna proběhne bez HTTP a bez secretu.
 */

import { eq } from "drizzle-orm";
import { stravaTokens } from "../../drizzle/schema/strava_tokens";
import { users } from "../../drizzle/schema/users";
import type { Db } from "./db";
import { lzeDoplnitArchiv } from "./vyprava-termin";
import { ctiEnv } from "./prostredi";


/** Udělený OAuth scope (čtení + čtení aktivit pro párování k výpravám). */
export const STRAVA_SCOPE_DEFAULT = "read,activity:read" as const;

/** Veřejný Strava authorize endpoint (žádný secret v query). */
export const STRAVA_AUTH_URL_ZAKLAD =
  "https://www.strava.com/oauth/authorize" as const;

/** Token endpoint pro výměnu i refresh (server → Strava, server-only). */
const STRAVA_TOKEN_URL = "https://www.strava.com/api/v3/oauth/token" as const;

/**
 * Timeout odchozích volání na Stravu (Krok 9, DoS obrana).
 * Bez něj by visící Strava držela BFF request navždy.
 */
export const STRAVA_FETCH_TIMEOUT_MS = 10_000;

/**
 * Strava vrací nový klíč, jen když současnému zbývá hodina nebo méně.
 * Dřív vrátí stejný access token i stejné expires_at.
 */
const REFRESH_REZERVA_MS = 60 * 60 * 1000;

/** Mock tokeny platí 6 hodin (stejně jako reálné Strava expirace řádově). */
const MOCK_PLATNOST_MS = 6 * 60 * 60 * 1000;

/** Neplatný / Stravou odmítnutý kód — route složí 422 (ne 500). */
export class StravaVymenaChyba extends Error {
  constructor(
    zprava = "Neplatný nebo expirovaný kód ze Stravy. Zkus propojení znovu.",
  ) {
    super(zprava);
    this.name = "StravaVymenaChyba";
  }
}

/**
 * Strava je nedostupná (timeout / síť / 5xx) — route složí 502
 * `STRAVA_NEDOSTUPNA` (ne 500). Zpráva je sdílená s kontraktem
 * (`STRAVA_NEDOSTUPNA_ZPRAVA`), nikdy nenese secret ani tělo odpovědi.
 */
export class StravaNedostupnaChyba extends Error {
  constructor(zprava: string = STRAVA_NEDOSTUPNA_ZPRAVA) {
    super(zprava);
    this.name = "StravaNedostupnaChyba";
  }
}

/** Type-guard pro rozlišení výpadku Stravy od vnitřní chyby (bez any). */
export function jeStravaNedostupnaChyba(
  hodnota: unknown,
): hodnota is StravaNedostupnaChyba {
  return hodnota instanceof StravaNedostupnaChyba;
}

/** Výsledek výměny `code → tokens` (vše server-only kromě scope). */
export interface StravaVymenaVysledek {
  accessToken: string;
  refreshToken: string;
  /** Strava athlete id → `users.strava_id`. */
  athleteId: string;
  scope: string;
  expirace: Date;
}

/** Výsledek refreshe (athlete se nemění — zůstává v `users.strava_id`). */
export interface StravaObnoveniVysledek {
  accessToken: string;
  refreshToken: string;
  scope: string;
  expirace: Date;
}

function jeMock(): boolean {
  return ctiEnv("STRAVA_MOCK") === "1";
}

/**
 * Veřejné CLIENT_ID (není secret — smí i do bundlu jako VITE_STRAVA_CLIENT_ID).
 * Pořadí: serverové STRAVA_CLIENT_ID, pak veřejné VITE_ (stejná hodnota).
 * V mock režimu fallback na fixture id (flow jde projet bez registrace appky).
 * Pozor (Krok 7b): fixture `mock-client-id` se smí použít jen pro mock
 * výměnu code→tokens na callbacku — GET /api/strava/auth-url ho do
 * prohlížeče nikdy nevrací (guard `jeRealneClientId` → 503).
 */
export function ctiStravaClientId(): string {
  const kandidat =
    ctiEnv("STRAVA_CLIENT_ID") ?? ctiEnv("VITE_STRAVA_CLIENT_ID") ?? "";
  const ciste = kandidat.trim();
  if (ciste.length > 0) return ciste;
  return jeMock() ? "mock-client-id" : "";
}

/**
 * Guard reálného CLIENT_ID pro GET /api/strava/auth-url (Krok 7b).
 * Strava app id je vždy decimální číslo (`/^\d+$/`) — mock fixture
 * (`mock-client-id`), prázdné i jinak nečíselné hodnoty znamenají
 * „chybí reálné STRAVA_CLIENT_ID" → route vrátí 503 STRAVA_NENI_NASTAVENA
 * a nikdy 200 s nepoužitelným mock URL (Strava by vrátila 400 invalid).
 */
export function jeRealneClientId(hodnota: string): boolean {
  return /^\d+$/.test(hodnota.trim());
}

/** Server-only secret — nikdy VITE_, nikdy do bundlu, nikdy do odpovědi. */
function ctiStravaSecret(): string {
  return (ctiEnv("STRAVA_CLIENT_SECRET") ?? "").trim();
}

/**
 * Kam má Strava redirectnout po souhlasu (serverový callback, ne frontend).
 * Default pro localhost: `http://localhost:{PORT}/api/strava/callback`.
 */
export function ctiStravaRedirectUri(): string {
  const kandidat = (ctiEnv("STRAVA_REDIRECT_URI") ?? "").trim();
  if (kandidat.length > 0) return kandidat;
  const port = Number.parseInt(ctiEnv("PORT") ?? "3001", 10);
  const cislo = Number.isFinite(port) && port > 0 ? port : 3001;
  return `http://localhost:${String(cislo)}/api/strava/callback`;
}

/** První povolený původ klienta (cíl 302 po callbacku — profil). */
export function ctiKlientskyPuvod(): string {
  const raw = (ctiEnv("CLIENT_URL") ?? "").trim();
  if (raw.length === 0) return "http://localhost:5173";
  const prvni = raw
    .split(",")
    .map((cast) => cast.trim())
    .filter((cast) => cast.length > 0)[0];
  return prvni === undefined || prvni.length === 0
    ? "http://localhost:5173"
    : prvni;
}

export interface StravaAuthUrlVstup {
  clientId: string;
  redirectUri: string;
  /** Opaque passthrough (typicky userId) — CSRF vazba na session. */
  state?: string;
  scope?: string;
}

/**
 * Staví Strava authorize URL POUZE z veřejných údajů.
 * Secret se do URL nikdy nedostane (ani jako parametr, ani jako fragment).
 */
export function sestavStravaAuthUrl(vstup: StravaAuthUrlVstup): string {
  const params = new URLSearchParams();
  params.set("client_id", vstup.clientId);
  params.set("response_type", "code");
  params.set("redirect_uri", vstup.redirectUri);
  params.set("approval_prompt", "force");
  const scope = (vstup.scope ?? "").trim();
  params.set("scope", scope.length > 0 ? scope : STRAVA_SCOPE_DEFAULT);
  const state = (vstup.state ?? "").trim();
  if (state.length > 0) params.set("state", state);
  return `${STRAVA_AUTH_URL_ZAKLAD}?${params.toString()}`;
}

/** True, když do expirace zbývá nejvýš hodina, nebo už vypršela. */
export function jeTokenExpirovany(expirace: Date, ted: Date = new Date()): boolean {
  return expirace.getTime() - ted.getTime() <= REFRESH_REZERVA_MS;
}

/** Query `?obnovit=1` na stavu propojení — vyměň klíč hned, i když ještě platí. */
export function chceVynutitObnoveni(query: unknown): boolean {
  if (typeof query !== "object" || query === null) return false;
  const hodnota = (query as Record<string, unknown>)["obnovit"];
  return hodnota === "1" || hodnota === "true";
}

/** Deterministické mock athlete id z kódu (DB `strava_id` je UNIQUE). */
function mockAtletIdZKodu(code: string): string {
  let hash = 5381;
  for (let i = 0; i < code.length; i += 1) {
    hash = ((hash << 5) + hash + code.charCodeAt(i)) | 0;
  }
  return `mock-atlet-${String(Math.abs(hash))}`;
}

function mockVysledek(code: string): StravaVymenaVysledek {
  return {
    accessToken: `mock-access-${code}`,
    refreshToken: `mock-refresh-${code}`,
    athleteId: mockAtletIdZKodu(code),
    scope: STRAVA_SCOPE_DEFAULT,
    expirace: new Date(Date.now() + MOCK_PLATNOST_MS),
  };
}

function jeRecord(hodnota: unknown): hodnota is Record<string, unknown> {
  return typeof hodnota === "object" && hodnota !== null && !Array.isArray(hodnota);
}

interface SurovaTokenOdpoved {
  accessToken: string;
  refreshToken: string;
  athleteId: string;
  scope: string;
  expirace: Date;
}

function ctiAtletId(hodnota: Record<string, unknown>): string {
  const atlet: unknown = hodnota["athlete"];
  if (!jeRecord(atlet)) return "";
  const id: unknown = atlet["id"];
  if (typeof id === "number" && Number.isFinite(id)) return String(id);
  if (typeof id === "string" && id.length > 0) return id;
  return "";
}

/**
 * Shared fields of a Strava token response. `athlete` is optional:
 * the authorization_code grant includes it, the refresh_token grant does not.
 */
function ctiSurovaTokenPole(hodnota: unknown): SurovaTokenOdpoved | null {
  if (!jeRecord(hodnota)) return null;
  const access: unknown = hodnota["access_token"];
  const expires: unknown = hodnota["expires_at"];
  if (typeof access !== "string" || access.length === 0) return null;
  if (typeof expires !== "number" || !Number.isFinite(expires) || expires <= 0)
    return null;
  const refresh: unknown = hodnota["refresh_token"];
  const scopeRaw: unknown = hodnota["scope"];
  return {
    accessToken: access,
    refreshToken: typeof refresh === "string" ? refresh : "",
    athleteId: ctiAtletId(hodnota),
    scope:
      typeof scopeRaw === "string" && scopeRaw.length > 0
        ? scopeRaw
        : STRAVA_SCOPE_DEFAULT,
    expirace: new Date(expires * 1000),
  };
}

/** Authorization-code exchange — athlete id is required. */
function ctiTokenOdpoved(hodnota: unknown): SurovaTokenOdpoved | null {
  const pole = ctiSurovaTokenPole(hodnota);
  if (pole === null || pole.athleteId.length === 0) return null;
  return pole;
}

/** Refresh grant — Strava omits `athlete`; a missing athlete is still success. */
function ctiRefreshOdpoved(
  hodnota: unknown,
): Omit<SurovaTokenOdpoved, "athleteId"> | null {
  const pole = ctiSurovaTokenPole(hodnota);
  if (pole === null) return null;
  return {
    accessToken: pole.accessToken,
    refreshToken: pole.refreshToken,
    scope: pole.scope,
    expirace: pole.expirace,
  };
}

/**
 * Fetch s timeoutem (AbortController) — nikdy nevisí déle než
 * `STRAVA_FETCH_TIMEOUT_MS`. Secret se nikdy neloguje (ani tělo).
 */
async function fetchSeTimeoutem(url: string, init: RequestInit): Promise<Response> {
  const rizeni = new AbortController();
  const casovac = setTimeout(() => rizeni.abort(), STRAVA_FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: rizeni.signal });
  } finally {
    clearTimeout(casovac);
  }
}

async function postNaStravu(telo: URLSearchParams): Promise<unknown> {
  let odpoved: Response;
  try {
    odpoved = await fetchSeTimeoutem(STRAVA_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: telo.toString(),
    });
  } catch {
    throw new StravaNedostupnaChyba();
  }
  // 5xx / výpadek token endpointu není odpojení účtu ani 401 aplikace.
  // 4xx (invalid_grant, odvolané oprávnění) zůstává chyba výměny.
  if (odpoved.status >= 500) throw new StravaNedostupnaChyba();
  if (!odpoved.ok) throw new StravaVymenaChyba();
  try {
    return (await odpoved.json()) as unknown;
  } catch {
    throw new StravaVymenaChyba();
  }
}

/**
 * Výměna `code → tokens` (server → Strava). Secret nikdy neopustí server.
 * Mock režim (`STRAVA_MOCK=1`): fixture bez HTTP; kód `strava-odmita`
 * simuluje odmítnutí Stravou (route složí 422).
 */
export async function vymenCodeZaTokeny(code: string): Promise<StravaVymenaVysledek> {
  if (jeMock()) {
    if (code === "strava-odmita") throw new StravaVymenaChyba();
    return mockVysledek(code);
  }
  const clientId = ctiStravaClientId();
  const secret = ctiStravaSecret();
  if (clientId.length === 0 || secret.length === 0) {
    throw new Error("Chybí STRAVA_CLIENT_ID / STRAVA_CLIENT_SECRET v server env.");
  }
  const telo = new URLSearchParams();
  telo.set("client_id", clientId);
  telo.set("client_secret", secret);
  telo.set("code", code);
  telo.set("grant_type", "authorization_code");
  const surova = await postNaStravu(telo);
  const cista = ctiTokenOdpoved(surova);
  if (cista === null || cista.refreshToken.length === 0) throw new StravaVymenaChyba();
  return {
    accessToken: cista.accessToken,
    refreshToken: cista.refreshToken,
    athleteId: cista.athleteId,
    scope: cista.scope,
    expirace: cista.expirace,
  };
}

/**
 * Refresh access tokenu (server → Strava). Volá se automaticky před každým
 * voláním Stravy, když `jeTokenExpirovany` — bez odhlášení uživatele
 * (session cookie se tím nikdy nemaže ani nemění).
 */
export async function obnovStravaToken(
  refreshToken: string,
): Promise<StravaObnoveniVysledek> {
  if (jeMock()) {
    return {
      accessToken: `mock-access-obnoveno-${String(Date.now())}`,
      refreshToken,
      scope: STRAVA_SCOPE_DEFAULT,
      expirace: new Date(Date.now() + MOCK_PLATNOST_MS),
    };
  }
  const clientId = ctiStravaClientId();
  const secret = ctiStravaSecret();
  if (clientId.length === 0 || secret.length === 0) {
    throw new Error("Chybí STRAVA_CLIENT_ID / STRAVA_CLIENT_SECRET v server env.");
  }
  const telo = new URLSearchParams();
  telo.set("client_id", clientId);
  telo.set("client_secret", secret);
  telo.set("grant_type", "refresh_token");
  telo.set("refresh_token", refreshToken);
  const surova = await postNaStravu(telo);
  const cista = ctiRefreshOdpoved(surova);
  if (cista === null) throw new StravaVymenaChyba();
  return {
    accessToken: cista.accessToken,
    refreshToken:
      cista.refreshToken.length > 0 ? cista.refreshToken : refreshToken,
    scope: cista.scope,
    expirace: cista.expirace,
  };
}

/**
 * Uloží tokeny po callbacku: upsert `strava_tokens` + `users.strava_id`.
 * Idempotentní — opakovaný callback se stejným účtem jen přepíše.
 */
export async function ulozStravaTokeny(
  db: Db,
  userId: string,
  vysledek: StravaVymenaVysledek,
): Promise<void> {
  await db
    .insert(stravaTokens)
    .values({
      userId,
      accessToken: vysledek.accessToken,
      refreshToken: vysledek.refreshToken,
      expirace: vysledek.expirace,
      scope: vysledek.scope,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: stravaTokens.userId,
      set: {
        accessToken: vysledek.accessToken,
        refreshToken: vysledek.refreshToken,
        expirace: vysledek.expirace,
        scope: vysledek.scope,
        updatedAt: new Date(),
      },
    });
  await db
    .update(users)
    .set({ stravaId: vysledek.athleteId, updatedAt: new Date() })
    .where(eq(users.id, userId));
}

/** Drops Strava tokens and clears `users.strava_id`. Both disconnect routes call this. */
export async function odpojStravu(db: Db, userId: string): Promise<void> {
  await db.delete(stravaTokens).where(eq(stravaTokens.userId, userId));
  await db
    .update(users)
    .set({ stravaId: null, updatedAt: new Date() })
    .where(eq(users.id, userId));
}

/* ------------------------------------------------------------------ */
/* Krok 2 Fáze 4 — Párování aktivit k uzavřené výpravě (server-only).    */
/* `GET /athlete/activities?per_page=10` + filtr                        */
/* `strava_activity_id IS NULL` (jen nespárované). Tokeny se nikdy       */
/* nevracejí klientovi — jen normalizovaný návrh                        */
/* (`NeparovanaAktivita` z kontraktu §15b). Mock (`STRAVA_MOCK=1`) je     */
/* deterministická fixture bez HTTP a bez secretu.                       */
/* ------------------------------------------------------------------ */

import {
  STRAVA_NEDOSTUPNA_ZPRAVA,
  jeStravaCallbackDuvod,
  type ApiErrorCode,
  type NeparovanaAktivita,
  type StravaCallbackDuvod,
} from "../../src/shared/api-types";

/**
 * Staví callback redirect na profil (Krok 9).
 * `propojeno` nikdy nenese důvod; `chyba` vždy nese allowlistovaný
 * `duvod` (neznámý / nebezpečný vstup → `neznama-chyba`). Původy se
 * nevalidují tady — volající předává `ctiKlientskyPuvod()`.
 */
export function sestavStravaCallbackRedirect(
  puvod: string,
  priznak: "propojeno" | "chyba",
  duvod?: string,
): string {
  const zaklad = puvod.replace(/\/+$/, "");
  if (priznak === "propojeno") return `${zaklad}/profil?strava=propojeno`;
  const cisty: StravaCallbackDuvod = jeStravaCallbackDuvod(duvod)
    ? duvod
    : "neznama-chyba";
  return `${zaklad}/profil?strava=chyba&duvod=${cisty}`;
}

/** Normalizovaný návrh aktivity pro `GET /api/strava/neparovane`. */
export type StravaAktivita = NeparovanaAktivita;

/** Strava athlete endpoint (seznam aktivit přihlášeného atleta). */
const STRAVA_AKTIVITY_URL =
  "https://www.strava.com/api/v3/athlete/activities" as const;

/** Kolik posledních aktivit taháme (kontrakt: per_page=10). */
export const STRAVA_AKTIVITY_PER_PAGE = 10;

/**
 * Deterministická mock fixture (Krok 13: 12 aktivit, aby šla ověřit
 * paginace `?page&per_page` i příznak `sparovano` bez reálné Stravy).
 */
export const MOCK_NEPAROVANE_AKTIVITY: readonly StravaAktivita[] = [
  {
    id: "987654321",
    nazev: "Ranní Šumava",
    datum: "2026-10-10T07:30:00.000Z",
    km: 14.2,
    prevyseniM: 380,
    trasaPolyline: "abcABC123",
  },
  {
    id: "987654322",
    nazev: "Večerní Brdy",
    datum: "2026-10-08T17:15:00.000Z",
    km: 8.5,
    prevyseniM: 210,
    trasaPolyline: null,
  },
  {
    id: "987654323",
    nazev: "Podyjí vyhlídky",
    datum: "2026-10-05T09:00:00.000Z",
    km: 21.7,
    prevyseniM: 540,
    trasaPolyline: "polyline_ukazka_3",
  },
  {
    id: "987654324",
    nazev: "Křivoklát okruh",
    datum: "2026-10-03T08:00:00.000Z",
    km: 12.1,
    prevyseniM: 290,
    trasaPolyline: null,
  },
  {
    id: "987654325",
    nazev: "Český ráj skály",
    datum: "2026-10-01T09:30:00.000Z",
    km: 16.8,
    prevyseniM: 420,
    trasaPolyline: "polyline_ukazka_5",
  },
  {
    id: "987654326",
    nazev: "Šumava Jezerní slať",
    datum: "2026-09-28T07:45:00.000Z",
    km: 9.4,
    prevyseniM: 180,
    trasaPolyline: null,
  },
  {
    id: "987654327",
    nazev: "Brdy Třemšín",
    datum: "2026-09-25T16:20:00.000Z",
    km: 18.3,
    prevyseniM: 510,
    trasaPolyline: "polyline_ukazka_7",
  },
  {
    id: "987654328",
    nazev: "Kokořínsko údolí",
    datum: "2026-09-22T08:10:00.000Z",
    km: 11.6,
    prevyseniM: 240,
    trasaPolyline: null,
  },
  {
    id: "987654329",
    nazev: "Beskydy Lysá",
    datum: "2026-09-19T06:55:00.000Z",
    km: 22.9,
    prevyseniM: 980,
    trasaPolyline: "polyline_ukazka_9",
  },
  {
    id: "987654330",
    nazev: "Orlík pobřeží",
    datum: "2026-09-15T17:40:00.000Z",
    km: 7.2,
    prevyseniM: 120,
    trasaPolyline: null,
  },
  {
    id: "987654331",
    nazev: "Jizera Smrk",
    datum: "2026-09-12T08:25:00.000Z",
    km: 15.5,
    prevyseniM: 460,
    trasaPolyline: "polyline_ukazka_11",
  },
  {
    id: "987654332",
    nazev: "Pálava Děvín",
    datum: "2026-09-09T09:05:00.000Z",
    km: 10.9,
    prevyseniM: 330,
    trasaPolyline: null,
  },
] as const;

/** Surová aktivita ze Stravy → normalizovaný návrh. Nevalidní → null. */
export function normalizujStravaAktivitu(
  hodnota: unknown,
): StravaAktivita | null {
  if (!jeRecord(hodnota)) return null;
  const idRaw: unknown = hodnota["id"];
  const id =
    typeof idRaw === "number" && Number.isFinite(idRaw)
      ? String(Math.trunc(idRaw))
      : typeof idRaw === "string" && idRaw.trim().length > 0
        ? idRaw.trim()
        : null;
  const nazevRaw: unknown = hodnota["name"] ?? hodnota["nazev"];
  const nazev =
    typeof nazevRaw === "string" && nazevRaw.trim().length > 0
      ? nazevRaw.trim()
      : null;
  const datumRaw: unknown =
    hodnota["start_date"] ?? hodnota["datum"] ?? hodnota["startDate"];
  const datum =
    typeof datumRaw === "string" && datumRaw.trim().length > 0
      ? datumRaw.trim()
      : null;
  const vzdalenostRaw: unknown =
    hodnota["distance"] ?? hodnota["km"] ?? hodnota["vzdalenost"];
  let km: number | null = null;
  if (typeof vzdalenostRaw === "number" && Number.isFinite(vzdalenostRaw)) {
    // Strava vrací metry; normalizovaný návrh už nese km.
    // Hodnoty < 1000 bereme jako km (klientský tvar pro testy).
    km =
      vzdalenostRaw < 0
        ? null
        : vzdalenostRaw > 1000
          ? Math.round((vzdalenostRaw / 1000) * 10) / 10
          : Math.round(vzdalenostRaw * 10) / 10;
  }
  const prevyseniRaw: unknown =
    hodnota["total_elevation_gain"] ??
    hodnota["prevyseniM"] ??
    hodnota["elev_gain"];
  const prevyseniM =
    typeof prevyseniRaw === "number" &&
    Number.isFinite(prevyseniRaw) &&
    prevyseniRaw >= 0
      ? Math.round(prevyseniRaw)
      : null;
  let trasaPolyline: string | null = null;
  const mapaRaw: unknown = hodnota["map"];
  if (jeRecord(mapaRaw)) {
    const polyRaw: unknown =
      mapaRaw["summary_polyline"] ?? mapaRaw["polyline"];
    if (typeof polyRaw === "string" && polyRaw.length > 0) {
      trasaPolyline = polyRaw;
    }
  } else {
    const polyPrimo: unknown =
      hodnota["trasaPolyline"] ?? hodnota["summary_polyline"];
    if (typeof polyPrimo === "string" && polyPrimo.length > 0) {
      trasaPolyline = polyPrimo;
    } else if (polyPrimo === null) {
      trasaPolyline = null;
    }
  }
  if (id === null || nazev === null || datum === null) return null;
  if (km === null || prevyseniM === null) return null;
  if (Number.isNaN(Date.parse(datum))) return null;
  return { id, nazev, datum, km, prevyseniM, trasaPolyline };
}

/**
 * Filtr nespárovaných: vyhodí aktivity, jejichž id už nese některá
 * výprava (`strava_activity_id IS NULL` logika v paměti).
 */
export function odfiltrujSparovane(
  aktivity: readonly StravaAktivita[],
  sparovanaIds: readonly string[],
): StravaAktivita[] {
  const sparovane = new Set(sparovanaIds);
  return aktivity.filter((aktivita) => !sparovane.has(aktivita.id));
}

/** Maximum stránek při agregaci všech aktivit (Krok 13, DoS obrana). */
export const STRAVA_MAX_STRANEK = 3;

/**
 * Tahá `perPage` aktivit atleta pro danou stránku (`GET /athlete/activities`).
 * Mock režim vrací výřez fixture bez HTTP; reálný režim posílá Bearer token
 * (server → Strava, nikdy přes klienta). Nevalidní řádky skipne.
 */
export async function nactiStravaAktivity(
  accessToken: string,
  perPage: number = STRAVA_AKTIVITY_PER_PAGE,
  page: number = 1,
): Promise<StravaAktivita[]> {
  const cistePage = Number.isInteger(page) && page > 0 ? page : 1;
  if (jeMock()) {
    const limit =
      Number.isInteger(perPage) && perPage > 0
        ? Math.min(perPage, MOCK_NEPAROVANE_AKTIVITY.length)
        : MOCK_NEPAROVANE_AKTIVITY.length;
    const start = (cistePage - 1) * limit;
    return MOCK_NEPAROVANE_AKTIVITY.slice(start, start + limit).map(
      (aktivita) => ({
        ...aktivita,
      }),
    );
  }
  if (accessToken.trim().length === 0) return [];
  const limit =
    Number.isInteger(perPage) && perPage > 0 ? Math.min(perPage, 100) : 10;
  const url = `${STRAVA_AKTIVITY_URL}?per_page=${String(limit)}&page=${String(cistePage)}`;
  let odpoved: Response;
  try {
    odpoved = await fetchSeTimeoutem(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });
  } catch {
    throw new StravaNedostupnaChyba();
  }
  if (!odpoved.ok) {
    throw new StravaNedostupnaChyba();
  }
  let surova: unknown;
  try {
    surova = (await odpoved.json()) as unknown;
  } catch {
    return [];
  }
  if (!Array.isArray(surova)) return [];
  const vysledek: StravaAktivita[] = [];
  for (const polozka of surova) {
    const cista = normalizujStravaAktivitu(polozka);
    if (cista !== null) vysledek.push(cista);
    if (vysledek.length >= limit) break;
  }
  return vysledek;
}

/**
 * Agreguje VŠECHNY moje aktivity (Krok 13): prochází stránky
 * `per_page` (cap 100) do prázdna, nejvýš `maxStran` (default 3).
 * Mock režim stránkuje fixture stejně jako reálná Strava.
 */
export async function nactiVsechnyStravaAktivity(
  accessToken: string,
  perPage: number = 30,
  maxStran: number = STRAVA_MAX_STRANEK,
): Promise<StravaAktivita[]> {
  const limit =
    Number.isInteger(perPage) && perPage > 0 ? Math.min(perPage, 100) : 30;
  const stran =
    Number.isInteger(maxStran) && maxStran > 0
      ? Math.min(maxStran, STRAVA_MAX_STRANEK)
      : STRAVA_MAX_STRANEK;
  const vysledek: StravaAktivita[] = [];
  for (let strana = 1; strana <= stran; strana += 1) {
    const davka = await nactiStravaAktivity(accessToken, limit, strana);
    if (davka.length === 0) break;
    vysledek.push(...davka);
    if (davka.length < limit) break;
  }
  return vysledek;
}

/**
 * Krok 13: označí VŠECHNY aktivity příznakem `sparovano` (nefiltruje —
 * seznam ukazuje i připojené s odznakem). Spárované id = výpravy
 * se `strava_activity_id IS NOT NULL`.
 */
export function oznacSparovane(
  aktivity: readonly StravaAktivita[],
  sparovanaIds: readonly string[],
): (StravaAktivita & { sparovano: boolean })[] {
  const sparovane = new Set(sparovanaIds);
  return aktivity.map((aktivita) => ({
    ...aktivita,
    sparovano: sparovane.has(aktivita.id),
  }));
}

export interface RozhodnutiParovaniVstup {
  /** Aktuální stav výpravy (`stav` z DB). */
  stav: string;
  /** When set with `datum`, a past end date counts like `proběhlá`. */
  datum?: string;
  datumDo?: string | null;
  /** Výprava už má `strava_activity_id` (jiný confirm proběhl). */
  expediceSparovana: boolean;
  /** Aktivita už je spárovaná k jiné výpravě (UNIQUE). */
  aktivitaUzSparovana: boolean;
}

export type RozhodnutiParovani =
  | { ok: true }
  | { ok: false; kod: ApiErrorCode; zprava: string };

function smiDoplnitArchiv(vstup: {
  stav: string;
  datum?: string;
  datumDo?: string | null;
}): boolean {
  if (vstup.datum === undefined) return vstup.stav === "proběhlá";
  return lzeDoplnitArchiv({
    stav: vstup.stav,
    datum: vstup.datum,
    datumDo: vstup.datumDo ?? null,
  });
}

/**
 * Čisté rozhodnutí pro `POST :id/strava-parovani` (bez DB — testovatelné).
 * `proběhlá`, or a trip whose end date already passed, may pair
 * (otherwise 409 `VYPRAVA_UZAVRENA`). A duplicate expedition or activity
 * is 409 `UZ_PRIHLASEN`. The route sends the error via `posliChybu`.
 */
export function rozhodniParovani(
  vstup: RozhodnutiParovaniVstup,
): RozhodnutiParovani {
  if (!smiDoplnitArchiv(vstup)) {
    return {
      ok: false,
      kod: "VYPRAVA_UZAVRENA",
      zprava: "Párovat jde až po skončení výpravy.",
    };
  }
  if (vstup.expediceSparovana) {
    return {
      ok: false,
      kod: "UZ_PRIHLASEN",
      zprava: "Tahle výprava už má spárovanou aktivitu.",
    };
  }
  if (vstup.aktivitaUzSparovana) {
    return {
      ok: false,
      kod: "UZ_PRIHLASEN",
      zprava: "Tahle aktivita už je spárovaná k jiné výpravě.",
    };
  }
  return { ok: true };
}

export interface RozhodnutiOdpojeniVstup {
  /** Aktuální stav výpravy (`stav` z DB). */
  stav: string;
  /** When set with `datum`, a past end date counts like `proběhlá`. */
  datum?: string;
  datumDo?: string | null;
  /** Výprava má `strava_activity_id` nebo km/převýšení/polyline. */
  expediceSparovana: boolean;
}

export type RozhodnutiOdpojeni =
  | { ok: true }
  | { ok: false; kod: ApiErrorCode; zprava: string };

/**
 * Čisté rozhodnutí pro `DELETE :id/strava-parovani` (bez DB — testovatelné).
 * `proběhlá`, or a trip whose end date already passed, may disconnect
 * (otherwise 409 `VYPRAVA_UZAVRENA`). Nothing attached → 404 `NENALEZENO`.
 */
export function rozhodniOdpojeni(
  vstup: RozhodnutiOdpojeniVstup,
): RozhodnutiOdpojeni {
  if (!smiDoplnitArchiv(vstup)) {
    return {
      ok: false,
      kod: "VYPRAVA_UZAVRENA",
      zprava: "Odpojit jde až po skončení výpravy.",
    };
  }
  if (!vstup.expediceSparovana) {
    return {
      ok: false,
      kod: "NENALEZENO",
      zprava: "Tahle výprava nemá připojenou žádnou aktivitu.",
    };
  }
  return { ok: true };
}

/**
 * Vrátí platný access token pro volání Stravy — před expirací ho tiše
 * obnoví (refresh), session uživatele tím netrpí. Bez propojení → null.
 */
export async function zajistiPlatnyAccessToken(
  db: Db,
  userId: string,
  moznosti?: { vynutit?: boolean },
): Promise<string | null> {
  const radky = await db
    .select()
    .from(stravaTokens)
    .where(eq(stravaTokens.userId, userId))
    .limit(1);
  const radek = radky[0];
  if (radek === undefined) return null;
  const vynutit = moznosti?.vynutit === true;
  if (!vynutit && !jeTokenExpirovany(radek.expirace, new Date())) {
    return radek.accessToken;
  }
  try {
    const obnovene = await obnovStravaToken(radek.refreshToken);
    await db
      .update(stravaTokens)
      .set({
        accessToken: obnovene.accessToken,
        refreshToken: obnovene.refreshToken,
        expirace: obnovene.expirace,
        scope: obnovene.scope,
        updatedAt: new Date(),
      })
      .where(eq(stravaTokens.userId, userId));
    return obnovene.accessToken;
  } catch (chyba) {
    // Rozlišení příčiny (root-cause STRAVA_NEDOSTUPNA při párování):
    // - výpadek Stravy (timeout/síť/5xx) → propaguj Nedostupna (volající složí 502),
    // - odmítnutý refresh (invalid_grant/odvolané oprávnění) → null (volající
    //   vrátí [] / 422 s návodem do profilu, ne matoucí 502 ze stale tokenu),
    // - misconfig (chybí CLIENT_ID/SECRET) → propaguj (volající složí 500, ne 502).
    // Vracet prošlý token by vedlo jen k 401 od Stravy → 502 NEDOSTUPNA.
    // Session uživatele tím nikdy netrpí (žádné mazání cookie).
    if (jeStravaNedostupnaChyba(chyba)) throw chyba;
    if (chyba instanceof StravaVymenaChyba) return null;
    throw chyba;
  }
}
