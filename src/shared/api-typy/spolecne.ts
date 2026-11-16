/**
 * src/shared/api-types.ts — Fáze 1: API kontrakty (kontrakt jako první).
 *
 * Pokrývá 7 endpointů:
 * - POST /api/admin/codes — generování 10minutového kódu (jen ADMIN)
 * - POST /api/register    — registrace s platným kódem (veřejné, kód povinný)
 * - POST /api/login       — přihlášení e-mailem + heslem (veřejné)
 * - GET  /api/me          — aktuální uživatel (vyžaduje session/JWT)
 * - GET  /api/expeditions — seznam výprav z Neon DB (veřejné, Krok 3)
 * - GET  /api/clenove     — seznam členů z Neon DB (jen ADMIN, Krok 3)
 * - PATCH /api/clenove/:id — úprava člena (jen ADMIN, Krok 4b)
 *
 * Zásady (skill api-and-interface-design):
 * - Kontrakt před implementací; implementace se řídí těmito typy.
 * - Jednotný tvar chyby `ApiError` + HTTP mapování (nikdy jiný tvar).
 * - Validace patří na hranici (API route / formulář), vnitřní kód typům věří.
 * - Aditivní rozšiřování: nová pole vždy optional, nic se nepřejmenovává.
 * - Názvy: camelCase, plural podstatná jména v URL, boolean is/has.
 * - Krok 5 zámek: VALIDACE, VALIDACNI_ZPRAVY, normalizujKod, PRISTUP /
 *   smiNaEndpoint, jeApiChyba, HTTP_STATUS_PRO_KOD a KOD_PRAVIDLO jsou
 *   zamčené — měnit jen aditivně (nové optional pole / nové kódy).
 *   Server (server/src/validace.ts, server/src/chyby.ts) i formulář
 *   (src/hooks/useAuth.ts) sdílí tyto konstanty a hlášky.
 *
 * Auth model:
 * - DB `users.role` je jedna z 5 hodnot `Role` (src/config/roles.ts).
 * - API auth je binární: `jeAdmin(role[]) → ADMIN`, jinak `USER`
 *   (viz ROLE_DOC.md — Mapování na auth). Hranice admin vs user níže.
 * - Session: Better Auth cookie-session, případně JWT v Authorization.
 *   Transport se v typech neřeší — řeší ho serverový middleware.
 */

import type { Role } from "../../config/roles";
import type { Clenstvi, Funkce } from "../../config/roles";

/**
 * @deprecated Starý model rolí (`Role` union) — ponechán pro zpětnou
 * kompatibilitu. Nový kód používá 3D trio `Clenstvi` / `Funkce` / `isAdmin`
 * (viz `src/config/roles.ts`: `ClenskyProfil`, `mapujRoliNaProfil`).
 */
export type ZastaralaRole = Role;

/* ------------------------------------------------------------------ */
/* Branded ID — zabrání prohození UserId vs RegistrationCodeId.        */
/* ------------------------------------------------------------------ */

export type UserId = string & { readonly __brand: "UserId" };
export type RegistrationCodeId = string & {
  readonly __brand: "RegistrationCodeId";
};

/** Auth role pro hranici user / admin / superadmin. */
export type AuthRole = "USER" | "ADMIN" | "SUPERADMIN";

/** ADMIN i SUPERADMIN smějí na admin hranici (výpravy, kódy, fotky). */
export function jeAuthAdmin(authRole: AuthRole | null): boolean {
  return authRole === "ADMIN" || authRole === "SUPERADMIN";
}

/** Veřejný profil uživatele — nikdy neobsahuje hash hesla. */
export interface ApiUser {
  id: UserId;
  email: string;
  jmeno: string;
  /** Příjmení — nově aditivně, zatím optional kvůli zpětné kompatibilitě. */
  prijmeni?: string;
  /** Telefon — nepovinný, null = nevyplněn. */
  telefon?: string | null;
  /** Discord nick — nepovinný, null = nevyplněn. */
  discordNick?: string | null;
  /** Primární DB role (nejvyšší z role[]). Detail kombinací viz roles.ts. */
  role: Role;
  /** Odvozená auth role: SUPERADMIN, jinak ADMIN, jinak USER. */
  authRole: AuthRole;
  /** 3D členství — aditivně optional (detail viz roles.ts ClenskyProfil). */
  clenstvi?: Clenstvi;
  /** 3D funkce — aditivně optional (null = bez funkce). */
  funkce?: Funkce;
  /** Ortogonální admin příznak — aditivně optional. */
  isAdmin?: boolean;
  /**
   * Hlavní admin (DB `users.is_superadmin`). Server ho posílá vždy.
   * true vynucuje i isAdmin. Chybí-li ve starší odpovědi, klient bere false.
   */
  isSuperadmin: boolean;
  /**
   * Škola (Step 4, aditivně optional — DB `users.skola` NOT NULL DEFAULT '').
   * "" = nevyplněna. Chybí-li pole (starší odpověď), klient bere "".
   */
  skola?: string;
  /**
   * Třída / klubovna (Step 4, aditivně optional — DB `users.trida`).
   * "" = nevyplněna.
   */
  trida?: string;
  stravaId: string | null;
  /**
   * Avatar (Step 3, aditivně optional — DB sloupec `users.avatar_url` beze změny).
   * Veřejná https:// URL, null = nevyplněno. UI URL input odebrán
   * (jen náhled + Odebrat/Zahodit); API validace URL beze změny.
   */
  avatarUrl?: string | null;
  /** Krátké představení (Step 3, aditivně optional — DB `users.bio`). */
  bio?: string;
  /** Oblíbená barva (osobní údaje, DB `users.oblibena_barva`). "" = nevyplněno. */
  oblibenaBarva?: string;
  /**
   * Datum narození YYYY-MM-DD (Step 3, aditivně optional — DB sloupec `users.narozeniny` beze změny).
   * null = nevyplněno.
   */
  narozeniny?: string | null;
  createdAt: string;
  updatedAt: string;
}

/* ------------------------------------------------------------------ */
/* Jednotná chyba — jediný povolený tvar chybové odpovědi.             */
/* ------------------------------------------------------------------ */

/**
 * Strojově čitelné kódy (UPPER_SNAKE). Zprávy vždy česky pro UI.
 * HTTP mapování (zamčeno v HTTP_STATUS_PRO_KOD, server ho zrcadlí 1:1):
 * - 400 BAD_REQUEST — poškozený požadavek (nevalidní JSON, chybí body)
 * - 401 NEPRIHLASEN — bez session; KOD_NEPLATNY — kód nenalezen;
 *   SPATNE_HESLO — špatný e-mail / heslo (záměrně nerozlišeno)
 * - 403 ZAKAZANO — přihlášen, ale bez práva (není ADMIN)
 * - 404 NENALEZENO — uživatel / člen / výprava / API cesta nenalezena
 * - 409 EMAIL_OBSAZEN — e-mail obsazen; UZ_PRIHLASEN — duplicitní přihláška;
 *   KAPACITA_PLNA — výprava je plná; VYPRAVA_UZAVRENA — akce na proběhlé výpravě
 * - 410 KOD_EXPIROVANY — kód expiroval (vypršel čas 10 min)
 * - 422 VALIDATION_ERROR — vstup neprošel validací na hranici
 * - 500 VNITRNI_CHYBA — neočekávaná chyba (bez interních detailů)
 * - 502 STRAVA_NEDOSTUPNA — Strava API je nedostupné (timeout / síť / 5xx)
 *   (aditivně: GET /api/strava/neparovane místo slepé 500)
 * - 503 STRAVA_NENI_NASTAVENA — chybí reálné STRAVA_CLIENT_ID
 *   (Krok 7b, aditivně: GET /api/strava/auth-url nikdy nevrací mock URL)
 */
export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "BAD_REQUEST"
  | "NEPRIHLASEN"
  | "ZAKAZANO"
  | "NENALEZENO"
  | "EMAIL_OBSAZEN"
  | "KOD_NEPLATNY"
  | "KOD_EXPIROVANY"
  | "SPATNE_HESLO"
  | "UZ_PRIHLASEN"
  | "KAPACITA_PLNA"
  | "VYPRAVA_UZAVRENA"
  | "STRAVA_NEDOSTUPNA"
  | "STRAVA_NENI_NASTAVENA"
  | "FOTKY_NEJSOU_NASTAVENE"
  | "MOC_POZADAVKU"
  | "PISEN_UZ_JE"
  | "PUSH_NENI_NASTAVENY"
  | "VNITRNI_CHYBA";

export interface ApiErrorBody {
  code: ApiErrorCode;
  /** Česky, vhodné k přímému zobrazení v UI. */
  message: string;
  /** Pole → seznam českých hlášek. Jen u VALIDATION_ERROR. */
  details?: Record<string, string[]>;
}

export interface ApiErrorResponse {
  error: ApiErrorBody;
}

/** Úspěšná obálka se nemíchá s chybovou — buď data, nebo { error }. */
export type ApiResult<T> = T | ApiErrorResponse;

/** Type-guard pro rozlišení úspěch vs chyba bez any. */
export function jeApiChyba(value: unknown): value is ApiErrorResponse {
  if (typeof value !== "object" || value === null) return false;
  const kandidat = value as { error?: unknown };
  if (typeof kandidat.error !== "object" || kandidat.error === null)
    return false;
  const chyba = kandidat.error as { code?: unknown; message?: unknown };
  return typeof chyba.code === "string" && typeof chyba.message === "string";
}

/* ------------------------------------------------------------------ */
