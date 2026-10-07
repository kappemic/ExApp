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

import type { Role } from "../config/roles";

/* ------------------------------------------------------------------ */
/* Branded ID — zabrání prohození UserId vs RegistrationCodeId.        */
/* ------------------------------------------------------------------ */

export type UserId = string & { readonly __brand: "UserId" };
export type RegistrationCodeId = string & {
  readonly __brand: "RegistrationCodeId";
};

/** Binární auth role pro hranici admin vs user. */
export type AuthRole = "USER" | "ADMIN";

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
  /** Odvozená auth role pro hranici ADMIN vs USER. */
  authRole: AuthRole;
  stravaId: string | null;
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
 * - 404 NENALEZENO — uživatel / člen / API cesta nenalezena
 * - 409 EMAIL_OBSAZEN — e-mail obsazen
 * - 410 KOD_EXPIROVANY — kód expiroval (vypršel čas 10 min)
 * - 422 VALIDATION_ERROR — vstup neprošel validací na hranici
 * - 500 VNITRNI_CHYBA — neočekávaná chyba (bez interních detailů)
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
/* 1) POST /api/admin/codes — jen ADMIN                                 */
/* Hranice: vyžaduje session s authRole === "ADMIN".                   */
/* Jinak 401 NEPRIHLASEN (bez session) / 403 ZAKAZANO (USER).          */
/* ------------------------------------------------------------------ */

export const ADMIN_CODES_PATH = "/api/admin/codes" as const;

/** Vstup je záměrně prázdný: expirace je fixně 10 minut (PRD 2.1). */
export interface VytvoritKodRequest {
  /** Volitelná poznámka pro admina. Max 120 znaků. Nikdy povinná. */
  poznamka?: string;
}

export interface VytvoritKodResponse {
  id: RegistrationCodeId;
  /** 8 znaků, bez 0/O/1/I — lidsky přepisovatelný. */
  kod: string;
  createdAt: string;
  /** createdAt + 10 minut. Klient odpočítává podle této hodnoty. */
  expiresAt: string;
}

/* ------------------------------------------------------------------ */
/* 2) POST /api/register — veřejné, platný kód povinný                  */
/* Platný kód = expires_at > now() (sdílený, opakovaně použitelný).    */
/* Po úspěchu se kód nespotřebovává — mizí jen expirací (purge).       */
/* Krok 5 zámek (multi-use): DB sloupce used_at / used_by jsou legacy   */
/* jednorázového návrhu (drizzle/schema/registration_codes.ts, migrace */
/* 0001) — kontrakt je nezavazuje, server ani klient je nečtou          */
/* ani nezapisují. Jediné pravidlo platnosti je expires_at > now().    */
/* ------------------------------------------------------------------ */

export const REGISTER_PATH = "/api/register" as const;

export interface RegistraceRequest {
  jmeno: string;
  /** Příjmení — nově aditivně (optional, aby starší klienti procházeli). */
  prijmeni?: string;
  email: string;
  heslo: string;
  /** Telefon — nepovinný; prázdný řetězec hranice normalizuje na null. */
  telefon?: string | null;
  /** Discord nick — nepovinný; prázdný řetězec hranice normalizuje na null. */
  discordNick?: string | null;
  /** Pozvánkový kód z POST /api/admin/codes. Trim + uppercase na hranici. */
  kod: string;
}

export interface RegistraceResponse {
  user: ApiUser;
}

/* ------------------------------------------------------------------ */
/* 3) POST /api/login — veřejné                                        */
/* ------------------------------------------------------------------ */

export const LOGIN_PATH = "/api/login" as const;

export interface PrihlaseniRequest {
  email: string;
  heslo: string;
}

export interface PrihlaseniResponse {
  user: ApiUser;
}

/* ------------------------------------------------------------------ */
/* 4) GET /api/me — vyžaduje session (USER i ADMIN)                     */
/* Bez session → 401 NEPRIHLASEN. Nikdy nevrací 404 pro „sebe".        */
/* ------------------------------------------------------------------ */

export const ME_PATH = "/api/me" as const;

export type MeResponse = ApiUser;

/* ------------------------------------------------------------------ */
/* 5) PATCH /api/clenove/:id — úprava člena (jen ADMIN, Krok 4b)        */
/* Kontrakt před implementací: UI (ClenDetailModal) dnes ukládá        */
/* lokálně nad mockem přes onSave; až přijde Neon, pošle stejný        */
/* `UpravitClenaRequest` na `clenDetailPath(id)`.                      */
/* Hranice: vyžaduje session s authRole === "ADMIN".                   */
/* Jinak 401 NEPRIHLASEN (bez session) / 403 ZAKAZANO (USER).          */
/* Úspěch → 200 + `UpravitClenaResponse`. Neznámé id → 404 NENALEZENO. */
/* Nevalidní pole/kombinace rolí → 422 VALIDATION_ERROR                */
/* s `details` ve tvaru pole → seznam českých hlášek                   */
/* (role: [chybaKombinaceRole(...)], viz src/config/roles.ts).         */
/* Idempotence: opakovaný PATCH se stejným tělem je bezpečný           */
/* (přepíše stejné hodnoty, `updatedAt` se obnoví).                    */
/* ------------------------------------------------------------------ */

export const CLENOVE_PATH = "/api/clenove" as const;
export const CLEN_DETAIL_VZOR = "/api/clenove/:id" as const;

/** Staví konkrétní URL detailu člena: `/api/clenove/c01`. */
export function clenDetailPath(id: string): `/api/clenove/${string}` {
  return `/api/clenove/${id}`;
}

/**
 * Parciální update — jen poslaná pole se mění (PATCH sémantika).
 * Prázdný řetězec u nepovinných kontaktů hranice normalizuje na null.
 * `role` je celé nové pole rolí (ne delta); validuje `chybaKombinaceRole`.
 */
export interface UpravitClenaRequest {
  jmeno?: string;
  prijmeni?: string;
  email?: string;
  /** Nepovinný; prázdný řetězec → null. Max 32 znaků. */
  telefon?: string | null;
  /** Nepovinný; prázdný řetězec → null. Max 32 znaků. */
  discordNick?: string | null;
  /** Celé nové pole rolí; exkluzivita clen XOR aktivni-clen (viz roles.ts). */
  role?: Role[];
}

/**
 * Plný člen pro admina — na rozdíl od `ApiUser` nese celé `role[]`
 * (zdroj pravdy pro UI) místo jedné primární role.
 */
export interface AdminClen {
  id: UserId;
  jmeno: string;
  prijmeni: string;
  email: string;
  telefon: string | null;
  discordNick: string | null;
  role: Role[];
  updatedAt: string;
}

export interface UpravitClenaResponse {
  clen: AdminClen;
}

/* ------------------------------------------------------------------ */
/* 6) GET /api/expeditions — seznam výprav z Neon DB (Krok 3)          */
/* Veřejné (vypisuje i VypravyPage bez session). Řazeno datem vzestupně.*/
/* Tvar kopíruje build-time snapshot (expeditions-api) — UI se nemění.  */
/* Nevalidní DB řádek se přeskočí (stejně jako sync-readmodel).        */
/* ------------------------------------------------------------------ */

export const EXPEDITIONS_PATH = "/api/expeditions" as const;

/** Stav výpravy — kopie DB CHECK (expeditions_stav_check). */
export type StavVypravy = "volno" | "skoro plno" | "proběhlá";

export interface ApiExpedice {
  id: string;
  nazev: string;
  /** Datum YYYY-MM-DD (DB DATE → ISO slice). */
  datum: string;
  /** Místo a čas srazu. */
  sraz: string;
  popis: string;
  kapacita: {
    prihlaseno: number;
    celkem: number;
  };
  stav: StavVypravy;
}

export interface ExpediceListResponse {
  expedice: ApiExpedice[];
}

/* ------------------------------------------------------------------ */
/* 7) GET /api/clenove — seznam členů z Neon DB (jen ADMIN, Krok 3)    */
/* DB `clenove` je minimalistická: id TEXT (c01–c14), jmeno TEXT        */
/* (PLNÉ jméno „Anna Nováková"), role TEXT[], created_at. Nemá         */
/* prijmeni / email / telefon / discordNick ani updated_at — proto     */
/* list vrací `ClenPrehled` (DB-realistický), zatímco PATCH vrací      */
/* plný `AdminClen` (split jména + kontakty z požadavku, updatedAt      */
/* mapováno z created_at). Aditivní, nic se nepřejmenovává.            */
/* ------------------------------------------------------------------ */

/**
 * DB-realistický přehled člena pro GET /api/clenove.
 * `jmeno` je plné jméno z DB (split na jmeno + prijmeni řeší až AdminClen).
 */
export interface ClenPrehled {
  id: string;
  /** Plné jméno z DB („Anna Nováková"). */
  jmeno: string;
  role: Role[];
  /** Mapováno z DB `created_at` (sloupec updated_at neexistuje). */
  updatedAt: string;
}

export interface ClenoveListResponse {
  clenove: ClenPrehled[];
}

/* ------------------------------------------------------------------ */
/* Validační pravidla hranice (server i formulář je sdílí).            */
/* Vnitřní kód po této validaci typům věří — nevaliduje znovu.        */
/* ------------------------------------------------------------------ */

export const VALIDACE = {
  jmenoMinDelka: 2,
  jmenoMaxDelka: 80,
  prijmeniMinDelka: 2,
  prijmeniMaxDelka: 80,
  telefonMaxDelka: 32,
  discordNickMaxDelka: 32,
  hesloMinDelka: 8,
  hesloMaxDelka: 128,
  kodDelka: 8,
  poznamkaMaxDelka: 120,
} as const;

/** České hlášky validace pro sdílení mezi API a formuláři. */
export const VALIDACNI_ZPRAVY = {
  jmenoPovinne: "Zadej jméno.",
  jmenoKratke: "Jméno musí mít aspoň 2 znaky.",
  jmenoDlouhe: "Jméno může mít nejvýš 80 znaků.",
  prijmeniKratke: "Příjmení musí mít aspoň 2 znaky.",
  prijmeniDlouhe: "Příjmení může mít nejvýš 80 znaků.",
  telefonNeplatny: "Telefon nemá platný formát.",
  telefonDlouhy: "Telefon může mít nejvýš 32 znaků.",
  discordNickDlouhy: "Discord nick může mít nejvýš 32 znaků.",
  emailPovinny: "Zadej e-mail.",
  emailNeplatny: "E-mail nemá platný formát.",
  hesloPovinne: "Zadej heslo.",
  hesloKratke: "Heslo musí mít aspoň 8 znaků.",
  hesloDlouhe: "Heslo může mít nejvýš 128 znaků.",
  kodPovinny: "Zadej pozvánkový kód.",
  kodNeplatnyTvar: "Kód musí mít 8 znaků (bez 0, O, 1, I).",
} as const;

/**
 * Normalizace pozvánkového kódu na hranici (formulář i validace).
 * Uppercase + strip všeho mimo A–Z, 0–9 — chytí i zero-width znaky
 * a formátování z copy-paste, nejen mezery.
 */
export function normalizujKod(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/* ------------------------------------------------------------------ */
/* Krok 5 zámek pravidla kódů + HTTP mapování (aditivně, nemazat).     */
/* Kontrakt je zdrojem pravdy; server/src/chyby.ts ho zrcadlí 1:1.     */
/* ------------------------------------------------------------------ */

/** Expirace kódu v minutách (PRD 2.1, POST /api/admin/codes +10 minut). */
export const KOD_EXPIRACE_MINUT = 10 as const;

/**
 * Zamčené pravidlo kódů: opakovaně použitelné do expirace (multi-use).
 * Kód mizí jen expirací (purge), po registraci se nespotřebovává.
 * DB used_at / used_by jsou legacy a kontrakt je nezavazuje.
 */
export const KOD_PRAVIDLO = "MULTI_USE_DO_EXPIRACE" as const;

export type KodPravidlo = typeof KOD_PRAVIDLO;

/**
 * Zamčené HTTP mapování pro ApiErrorCode (nikdy jiný tvar).
 * Zrcadlí server/src/chyby.ts: KOD_NEPLATNY i SPATNE_HESLO → 401,
 * KOD_EXPIROVANY → 410 (jediná 410 v kontraktu).
 */
export const HTTP_STATUS_PRO_KOD: Record<ApiErrorCode, number> = {
  VALIDATION_ERROR: 422,
  BAD_REQUEST: 400,
  NEPRIHLASEN: 401,
  ZAKAZANO: 403,
  NENALEZENO: 404,
  EMAIL_OBSAZEN: 409,
  KOD_NEPLATNY: 401,
  KOD_EXPIROVANY: 410,
  SPATNE_HESLO: 401,
  VNITRNI_CHYBA: 500,
} as const;

/* ------------------------------------------------------------------ */
/* Hranice admin vs user — jediná definice pro middleware i UI.        */
/* ------------------------------------------------------------------ */

/** Endpointy Fáze 1 + Krok 3/4b a kdo je smí volat. */
export type ChranenaCesta =
  | typeof ADMIN_CODES_PATH
  | typeof REGISTER_PATH
  | typeof LOGIN_PATH
  | typeof ME_PATH
  | typeof EXPEDITIONS_PATH
  | typeof CLENOVE_PATH
  | typeof CLEN_DETAIL_VZOR;

export const PRISTUP: Record<ChranenaCesta, AuthRole | "PUBLIC"> = {
  [ADMIN_CODES_PATH]: "ADMIN",
  [REGISTER_PATH]: "PUBLIC",
  [LOGIN_PATH]: "PUBLIC",
  [ME_PATH]: "USER",
  [EXPEDITIONS_PATH]: "PUBLIC",
  [CLENOVE_PATH]: "ADMIN",
  [CLEN_DETAIL_VZOR]: "ADMIN",
} as const;

/**
 * Rozhodne přístup: ADMIN smí vše, USER smí vše kromě ADMIN-only,
 * nepřihlášený jen PUBLIC. Validace patří na hranici (middleware).
 */
export function smiNaEndpoint(
  authRole: AuthRole | null,
  cesta: ChranenaCesta,
): boolean {
  const pozadavek: AuthRole | "PUBLIC" = PRISTUP[cesta];
  if (pozadavek === "PUBLIC") return true;
  if (authRole === null) return false;
  if (pozadavek === "USER") return true;
  return authRole === "ADMIN";
}
