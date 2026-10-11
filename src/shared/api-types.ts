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
import type { Clenstvi, Funkce } from "../config/roles";

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
  /** 3D členství — aditivně optional (detail viz roles.ts ClenskyProfil). */
  clenstvi?: Clenstvi;
  /** 3D funkce — aditivně optional (null = bez funkce). */
  funkce?: Funkce;
  /** Ortogonální admin příznak — aditivně optional. */
  isAdmin?: boolean;
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
 * - 404 NENALEZENO — uživatel / člen / výprava / API cesta nenalezena
 * - 409 EMAIL_OBSAZEN — e-mail obsazen; UZ_PRIHLASEN — duplicitní přihláška;
 *   KAPACITA_PLNA — výprava je plná; VYPRAVA_UZAVRENA — akce na proběhlé výpravě
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
  | "UZ_PRIHLASEN"
  | "KAPACITA_PLNA"
  | "VYPRAVA_UZAVRENA"
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
  /** Škola — nepovinná; prázdná se normalizuje na "". Max 120 znaků. */
  skola?: string;
  /** Třída — nepovinná; prázdná se normalizuje na "". Max 120 znaků. */
  trida?: string;
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
  /** 3D členství — aditivně optional. */
  clenstvi?: Clenstvi;
  /** 3D funkce — aditivně optional (null = bez funkce). */
  funkce?: Funkce;
  /** Ortogonální admin příznak — aditivně optional. */
  isAdmin?: boolean;
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
  /** Konec vícedenní výpravy (od–do); null = jednodenní. */
  datumDo: string | null;
  /** Místo a čas srazu. */
  sraz: string;
  popis: string;
  /** Odkaz na naplánovanou trasu (mapy.com) — "" = bez odkazu. */
  trasaOdkaz: string;
  kapacita: {
    prihlaseno: number;
    /** Celkem míst; 0 = bez omezení. */
    celkem: number;
  };
  stav: StavVypravy;
}

export interface ExpediceListResponse {
  expedice: ApiExpedice[];
  /** Stránkování pro historii (Krok 2, aditivně optional). Bez něj = vše. */
  pagination?: Strankovani;
}

/** Stránkování list endpointů (skill: paginuj od začátku). */
export interface Strankovani {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
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
  /** 3D členství — aditivně optional. */
  clenstvi?: Clenstvi;
  /** 3D funkce — aditivně optional (null = bez funkce). */
  funkce?: Funkce;
  /** Ortogonální admin příznak — aditivně optional. */
  isAdmin?: boolean;
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
  expediceNazevMinDelka: 3,
  expediceNazevMaxDelka: 120,
  expediceSrazMinDelka: 3,
  expediceSrazMaxDelka: 120,
  expedicePopisMaxDelka: 2000,
  expediceTrasaOdkazMaxDelka: 2048,
  expediceKapacitaMin: 0,
  expediceKapacitaMax: 100,
  skolaMaxDelka: 120,
  tridaMaxDelka: 120,
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
  expediceNazevPovinny: "Zadej název výpravy.",
  expediceNazevKratky: "Název výpravy musí mít aspoň 3 znaky.",
  expediceNazevDlouhy: "Název výpravy může mít nejvýš 120 znaků.",
  expediceDatumPovinne: "Zadej datum výpravy.",
  expediceDatumNeplatne: "Datum musí být ve tvaru RRRR-MM-DD.",
  expediceDatumMinulost: "Datum nesmí být v minulosti — historie vzniká jen uzavřením.",
  expediceDatumDoNeplatne: "Koncové datum musí být ve tvaru RRRR-MM-DD.",
  expediceDatumDoPredZacatkem: "Konec výpravy nesmí být před jejím začátkem.",
  expediceSrazPovinny: "Zadej místo a čas srazu.",
  expediceSrazKratky: "Sraz musí mít aspoň 3 znaky.",
  expediceSrazDlouhy: "Sraz může mít nejvýš 120 znaků.",
  expedicePopisDlouhy: "Popis může mít nejvýš 2000 znaků.",
  expediceTrasaOdkazDlouhy: "Odkaz na trasu může mít nejvýš 2048 znaků.",
  expediceTrasaOdkazNeplatny: "Odkaz na trasu musí začínat https://.",
  expediceKapacitaNeplatna: "Kapacita musí být číslo od 0 do 100 (0 = bez omezení).",
  dochazkaPrazdna: "Vyber aspoň jednoho účastníka docházky.",
  dochazkaNeznamyUcastnik: "Docházka obsahuje neznámého účastníka.",
  ucastnikIdentitaChybi: "Vyber člena — zadej userId, nebo clenId.",
  ucastnikIdentitaOboji: "Zadej právě jednu identitu — userId, nebo clenId, ne obojí.",
  ucastnikStatusNeplatny: "Status musí být „ucastnil_se“, nebo „omluven“.",
  skolaDlouha: "Škola může mít nejvýš 120 znaků.",
  tridaDlouha: "Třída může mít nejvýš 120 znaků.",
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
  UZ_PRIHLASEN: 409,
  KAPACITA_PLNA: 409,
  VYPRAVA_UZAVRENA: 409,
  VNITRNI_CHYBA: 500,
} as const;

/* ------------------------------------------------------------------ */
/* 8) Krok 2 — Expedice CRUD + účast + uzavření (NÁVRH, neimplementováno) */
/* Kontrakt před implementací. Server (server/src/index.ts) se zatím    */
/* NEMĚNÍ — routy níže neexistují, dokud je Krok 3+ nezavede 1:1.       */
/* Rozhodnutí k rolím (AGENTS Fáze 2): vytvářet / upravovat / mazat /    */
/* uzavírat smí jen ADMIN; přihlásit / odhlásit smí přihlášený USER;     */
/* docházku zapisuje ADMIN. Nesrovnalost PRD 2.1 (aktivní člen vytváří)  */
/* je odložena jako follow-up — kontrakt ji nezavazuje.                 */
/*                                                                       */
/* REST poznámka (skill §5): akční sufixy /prihlasit, /odhlasit,         */
/* /uzavrit jsou vědomá výjimka z „bez sloves v URL" — jde o BFF akce    */
/* nad sub-zdrojem účast (stejný vzor jako POST /api/login). Zdroje      */
/* zůstávají plural (`/api/expeditions`, `/api/expeditions/:id/ucastnici`).*/
/* Idempotence: PATCH se stejným tělem je bezpečný; DELETE /odhlasit    */
/* bez přihlášky vrací 200 `{ ok: true }` (ne 404).                     */
/* Chyby vždy jen `ApiErrorResponse` — nikdy jiný tvar.                  */
/* ------------------------------------------------------------------ */

export const EXPEDICE_DETAIL_VZOR = "/api/expeditions/:id" as const;
export const EXPEDICE_UCASTNICI_VZOR =
  "/api/expeditions/:id/ucastnici" as const;
export const EXPEDICE_PRIHLASIT_VZOR =
  "/api/expeditions/:id/prihlasit" as const;
export const EXPEDICE_ODHLASIT_VZOR =
  "/api/expeditions/:id/odhlasit" as const;
export const EXPEDICE_UZAVRIT_VZOR = "/api/expeditions/:id/uzavrit" as const;
/** Detail jednoho účastníka pro dodatečnou správu po uzavření (varianta A, aditivní). */
export const EXPEDICE_UCASTNIK_DETAIL_VZOR =
  "/api/expeditions/:id/ucastnici/:ucastnikId" as const;

/** Staví URL detailu: `/api/expeditions/sumava-trijezerska-slat`. */
export function expediceDetailPath(id: string): `/api/expeditions/${string}` {
  return `/api/expeditions/${id}`;
}

/** Staví URL seznamu účastníků dané výpravy. */
export function ucastniciPath(id: string): `/api/expeditions/${string}/ucastnici` {
  return `/api/expeditions/${id}/ucastnici`;
}

/** Staví URL přihlášení na výpravu. */
export function prihlasitPath(id: string): `/api/expeditions/${string}/prihlasit` {
  return `/api/expeditions/${id}/prihlasit`;
}

/** Staví URL odhlášení z výpravy. */
export function odhlasitPath(id: string): `/api/expeditions/${string}/odhlasit` {
  return `/api/expeditions/${id}/odhlasit`;
}

/** Staví URL uzavření výpravy (včetně docházky). */
export function uzavritPath(id: string): `/api/expeditions/${string}/uzavrit` {
  return `/api/expeditions/${id}/uzavrit`;
}

/**
 * Staví URL seznamu s filtrem historie:
 * `/api/expeditions?stav=prob%C4%9Bhl%C3%A1` nebo s `page` / `pageSize`.
 */
export function expediceListUrl(query: ExpediceListQuery): string {
  const params = new URLSearchParams();
  if (query.stav !== undefined) params.set("stav", query.stav);
  if (query.page !== undefined) params.set("page", String(query.page));
  if (query.pageSize !== undefined)
    params.set("pageSize", String(query.pageSize));
  const qs = params.toString();
  return qs.length > 0 ? `${EXPEDITIONS_PATH}?${qs}` : EXPEDITIONS_PATH;
}

/** Status účasti — kopie DB CHECK (participants.status). */
export type StatusUcasti = "prihlasen" | "ucastnil_se" | "omluven";

/** Docházkový status zapisovaný při uzavření (jen ADMIN). */
export type DochazkovyStatus = "ucastnil_se" | "omluven";

/**
 * Účastník výpravy pro modal (seznam přihlášených + docházka).
 * Právě jedna identita: `userId` XOR `clenId` (hlídá DB CHECK
 * v migraci participants). `jmeno` je denormalizované pro seznam.
 */
export interface ApiUcastnik {
  id: string;
  expeditionId: string;
  userId: UserId | null;
  clenId: string | null;
  jmeno: string;
  status: StatusUcasti;
  createdAt: string;
}

/** Query pro GET /api/expeditions (seznam + historie, vše PUBLIC). */
export interface ExpediceListQuery {
  /** `stav=proběhlá` = historie; bez filtru = nadcházející + proběhlé. */
  stav?: StavVypravy;
  page?: number;
  pageSize?: number;
}

/** Vytvoření výpravy (jen ADMIN). Expirace ani stav se neposílají. */
export interface VytvoritExpediciRequest {
  /** 3–120 znaků. */
  nazev: string;
  /** Datum YYYY-MM-DD. Minulost → 422 (historie vzniká jen uzavřením). */
  datum: string;
  /** Konec vícedenní výpravy (od–do); prázdné/null = jednodenní. Musí být >= datum. */
  datumDo?: string | null;
  /** Místo a čas srazu. 3–120 znaků. */
  sraz: string;
  /** Nepovinný; max 2000 znaků. Prázdný řetězec hranice normalizuje na "". */
  popis?: string;
  /** Nepovinný odkaz na trasu (mapy.com); max 2048, https://. "" = bez odkazu. */
  trasaOdkaz?: string;
  /** 0–100, 0 = bez omezení (prázdné se normalizuje na 0). */
  kapacitaCelkem: number;
}

export interface VytvoritExpediciResponse {
  expedice: ApiExpedice;
}

/**
 * Parciální update (jen ADMIN, PATCH sémantika — jen poslaná pole se mění).
 * Snížení `kapacitaCelkem` pod aktuální `prihlaseno` → 422 VALIDATION_ERROR
 * (kromě 0 = bez omezení).
 * Změna `stav` tudy NEJDE — proběhlá vzniká jen PATCH /uzavrit.
 */
export interface UpravitExpediciRequest {
  nazev?: string;
  datum?: string;
  /** Konec od–do; null/"" = zrušit konec (jednodenní). */
  datumDo?: string | null;
  sraz?: string;
  popis?: string;
  trasaOdkaz?: string;
  kapacitaCelkem?: number;
}

export interface UpravitExpediciResponse {
  expedice: ApiExpedice;
}

/** Smazání maže i účastníky (CASCADE). Idempotentní: opakovaný DELETE → 404. */
export interface SmazatExpediciResponse {
  ok: true;
}

/** Detail výpravy pro modal (PUBLIC — čte i nepřihlášený). */
export interface ExpediceDetailResponse {
  expedice: ApiExpedice;
}

/** Seznam účastníků (USER i ADMIN). Bez session → 401 NEPRIHLASEN. */
export interface UcastniciListResponse {
  ucastnici: ApiUcastnik[];
  /** Snapshot hlavičky pro modal (kapacita + stav bez druhého volání). */
  expedice: ApiExpedice;
}

/** Přihlášení sebe (USER). Plná výprava → 409 KAPACITA_PLNA. */
export interface PrihlasitNaVypravuResponse {
  ucastnik: ApiUcastnik;
  expedice: ApiExpedice;
}

/** Odhlášení sebe (USER). Idempotentní — bez přihlášky stále 200. */
export interface OdhlasitResponse {
  ok: true;
  expedice: ApiExpedice;
}

/** Jeden řádek docházky při uzavření. Jen stavy po akci. */
export interface DochazkaZaznam {
  ucastnikId: string;
  status: DochazkovyStatus;
}

/**
 * Uzavření výpravy (jen ADMIN).
 * Nastaví `stav: "proběhlá"` + zapíše docházku. Neznámé `ucastnikId`
 * → 422 VALIDATION_ERROR (`dochazka: [dochazkaNeznamyUcastnik]`).
 * Prázdná docházka → 422 (`dochazka: [dochazkaPrazdna]`).
 * Opakované uzavření již proběhlé → 409 VYPRAVA_UZAVRENA.
 * Fotky a Strava párování sem NEPATŘÍ — samostatné kroky Fáze 2/4.
 */
export interface UzavritVypravuRequest {
  dochazka: DochazkaZaznam[];
}

export interface UzavritVypravuResponse {
  expedice: ApiExpedice;
  ucastnici: ApiUcastnik[];
}

/* ------------------------------------------------------------------ */
/* Hranice admin vs user — jediná definice pro middleware i UI.        */
/* Fáze 1 cesty zamčeny v PRISTUP; Krok 2 cesty v PRISTUP_KROK2         */
/* (odděleně, protože POST /api/expeditions je ADMIN, zatímco          */
/* GET /api/expeditions je PUBLIC — klíč je metoda + cesta, viz        */
/* MATICE_EXPEDICE níže).                                              */
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

/** Vzory cest Kroku 2 (detail, účast, uzavření + dodatečná správa po uzavření). */
export type Krok2Cesta =
  | typeof EXPEDICE_DETAIL_VZOR
  | typeof EXPEDICE_UCASTNICI_VZOR
  | typeof EXPEDICE_PRIHLASIT_VZOR
  | typeof EXPEDICE_ODHLASIT_VZOR
  | typeof EXPEDICE_UZAVRIT_VZOR
  | typeof EXPEDICE_UCASTNIK_DETAIL_VZOR;

/**
 * Hranice pro vzory Kroku 2 (bez rozlišení metody — přísnější z dvojice).
 * Přesná metoda + cesta viz MATICE_EXPEDICE (POST/PATCH/DELETE detailu
 * je ADMIN, GET detailu je PUBLIC).
 * Výjimka s rozlišením metody: `EXPEDICE_UCASTNICI_VZOR` je GET = USER,
 * ale POST na stejné cestě (dodatečné přidání po uzavření, varianta A)
 * je ADMIN — viz MATICE_EXPEDICE. Zápis do vzoru se proto řídí metodou.
 */
export const PRISTUP_KROK2: Record<Krok2Cesta, AuthRole | "PUBLIC"> = {
  [EXPEDICE_DETAIL_VZOR]: "PUBLIC",
  [EXPEDICE_UCASTNICI_VZOR]: "USER",
  [EXPEDICE_PRIHLASIT_VZOR]: "USER",
  [EXPEDICE_ODHLASIT_VZOR]: "USER",
  [EXPEDICE_UZAVRIT_VZOR]: "ADMIN",
  [EXPEDICE_UCASTNIK_DETAIL_VZOR]: "ADMIN",
} as const;

export type ExpediceMetoda = "GET" | "POST" | "PATCH" | "DELETE";

export interface MaticeRadek {
  metoda: ExpediceMetoda;
  cesta: string;
  kdo: AuthRole | "PUBLIC";
  uspech: string;
}

/**
 * Matice oprávnění Kroku 2 (metoda + cesta → kdo smí).
 * ADMIN smí vše; USER jen čtení detailu/seznamu + vlastní účast;
 * nepřihlášený jen PUBLIC. Middleware kontroluje metodu i vzor.
 */
export const MATICE_EXPEDICE: readonly MaticeRadek[] = [
  {
    metoda: "GET",
    cesta: EXPEDITIONS_PATH,
    kdo: "PUBLIC",
    uspech: "200 + ExpediceListResponse (?stav=proběhlá = historie)",
  },
  {
    metoda: "POST",
    cesta: EXPEDITIONS_PATH,
    kdo: "ADMIN",
    uspech: "201 + VytvoritExpediciResponse",
  },
  {
    metoda: "GET",
    cesta: EXPEDICE_DETAIL_VZOR,
    kdo: "PUBLIC",
    uspech: "200 + ExpediceDetailResponse",
  },
  {
    metoda: "PATCH",
    cesta: EXPEDICE_DETAIL_VZOR,
    kdo: "ADMIN",
    uspech: "200 + UpravitExpediciResponse",
  },
  {
    metoda: "DELETE",
    cesta: EXPEDICE_DETAIL_VZOR,
    kdo: "ADMIN",
    uspech: "200 + SmazatExpediciResponse",
  },
  {
    metoda: "GET",
    cesta: EXPEDICE_UCASTNICI_VZOR,
    kdo: "USER",
    uspech: "200 + UcastniciListResponse",
  },
  {
    metoda: "POST",
    cesta: EXPEDICE_PRIHLASIT_VZOR,
    kdo: "USER",
    uspech: "201 + PrihlasitNaVypravuResponse",
  },
  {
    metoda: "DELETE",
    cesta: EXPEDICE_ODHLASIT_VZOR,
    kdo: "USER",
    uspech: "200 + OdhlasitResponse (idempotentní)",
  },
  {
    metoda: "PATCH",
    cesta: EXPEDICE_UZAVRIT_VZOR,
    kdo: "ADMIN",
    uspech: "200 + UzavritVypravuResponse (stav → proběhlá)",
  },
  {
    metoda: "POST",
    cesta: EXPEDICE_UCASTNICI_VZOR,
    kdo: "ADMIN",
    uspech:
      "201 + PridatUcastnikaPoUzavreniResponse (funguje i po proběhlá, kapacita se nekontroluje)",
  },
  {
    metoda: "DELETE",
    cesta: EXPEDICE_UCASTNIK_DETAIL_VZOR,
    kdo: "ADMIN",
    uspech:
      "200 + OdebratUcastnikaResponse (funguje i po proběhlá, opakovaný DELETE → 404)",
  },
] as const;

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

/* ------------------------------------------------------------------ */
/* 9) Krok 6 — Fotky k uzavřené výpravě (minimum Fáze 2: URL režim).    */
/* Storage rozhodnutí (src/config/storage.ts): žádný Cloudinary /      */
/* Supabase klíč není → admin vkládá veřejnou https:// URL + popis,     */
/* server ukládá jen URL do `photos` (nikdy blob). Binární upload       */
/* (Neon Object Storage, bucket `expedition-photos`) přijde později     */
/* přes stejné `PhotkyPath` endpointy — kontrakt se nemění, jen         */
/* `zdroj` přibude `"upload"`.                                          */
/* Matice: GET = PUBLIC (náhled v modalu/historii čte každý),           */
/* POST + DELETE detailu = ADMIN. Zápis jen u `stav: "proběhlá"`,       */
/* jinak 409 VYPRAVA_UZAVRENA (stejný kód jako přihláška na proběhlou). */
/* Chyby vždy jen `ApiErrorResponse`. Aditivní, nic se nepřejmenovává.  */
/* ------------------------------------------------------------------ */

export const EXPEDICE_FOTKY_VZOR = "/api/expeditions/:id/fotky" as const;
export const EXPEDICE_FOTKA_DETAIL_VZOR =
  "/api/expeditions/:id/fotky/:fotkaId" as const;

/** Staví URL seznamu / přidání fotky: `/api/expeditions/xxx/fotky`. */
export function fotkyPath(id: string): `/api/expeditions/${string}/fotky` {
  return `/api/expeditions/${id}/fotky`;
}

/** Staví URL smazání jedné fotky. */
export function fotkaDetailPath(
  id: string,
  fotkaId: string,
): `/api/expeditions/${string}/fotky/${string}` {
  return `/api/expeditions/${id}/fotky/${fotkaId}`;
}

/** Jedna fotka v kronice — kopie řádku `photos` (url, ne blob). */
export interface ApiFotka {
  id: string;
  expeditionId: string;
  /** Veřejná https:// URL (dnes vložená adminem, později z bucketu). */
  url: string;
  popis: string;
  createdAt: string;
}

/** Seznam fotek pro modal/historii (PUBLIC — čte i nepřihlášený). */
export interface FotkyListResponse {
  fotky: ApiFotka[];
}

/** Přidání fotky (jen ADMIN, jen proběhlá). Úspěch → 201. */
export interface PridatFotkuRequest {
  url: string;
  /** Nepovinný; max 500 znaků. Prázdný řetězec → "". */
  popis?: string;
}

export interface PridatFotkuResponse {
  fotka: ApiFotka;
}

/** Smazání fotky (jen ADMIN). Idempotentní: opakovaný DELETE → 404. */
export interface SmazatFotkuResponse {
  ok: true;
}

/** Vzory cest Kroku 6 pro matici oprávnění (odděleně jako Krok 2). */
export type Krok6Cesta =
  | typeof EXPEDICE_FOTKY_VZOR
  | typeof EXPEDICE_FOTKA_DETAIL_VZOR;

/** Hranice Kroku 6: čtení PUBLIC, zápis ADMIN. */
export const PRISTUP_KROK6: Record<Krok6Cesta, AuthRole | "PUBLIC"> = {
  [EXPEDICE_FOTKY_VZOR]: "PUBLIC",
  [EXPEDICE_FOTKA_DETAIL_VZOR]: "ADMIN",
} as const;

/* ------------------------------------------------------------------ */
/* 10) Dodatečná správa účastníků po uzavření — varianta A (aditivní)   */
/* Jen ADMIN. Funguje i u `stav: "proběhlá"` (na rozdíl od             */
/* POST /prihlasit, který proběhlou odmítá 409 VYPRAVA_UZAVRENA).       */
/* Kapacita se po uzavření NEKONTROLUJE — nikdy 409 KAPACITA_PLNA.      */
/* Nic se nepřejmenovává; stávající vzory, matice i hlášky zůstávají.   */
/* Chyby vždy jen `ApiErrorResponse`. Validace na hranici (API route),  */
/* vnitřní kód typům věří (skill api-and-interface-design §3).          */
/* ------------------------------------------------------------------ */

/**
 * Dodatečné přidání účastníka po uzavření (jen ADMIN).
 * Právě jedna identita: `userId` XOR `clenId` (stejně jako ApiUcastnik
 * a DB CHECK participants). Bez identity / obojí → 422 VALIDATION_ERROR
 * (`ucastnik: [ucastnikIdentitaChybi | ucastnikIdentitaOboji]`).
 * `status` je nepovinný, default `ucastnil_se`; jiná hodnota než
 * DochazkovyStatus → 422 (`status: [ucastnikStatusNeplatny]`).
 * Duplicita (stejná identita už evidována) → 409 UZ_PRIHLASEN.
 * Neznámá výprava → 404 NENALEZENO. Bez session → 401 NEPRIHLASEN,
 * USER → 403 ZAKAZANO. Úspěch → 201.
 */
export interface PridatUcastnikaPoUzavreniRequest {
  userId?: UserId;
  clenId?: string;
  /** Nepovinný; default `ucastnil_se`. */
  status?: DochazkovyStatus;
}

export interface PridatUcastnikaPoUzavreniResponse {
  ucastnik: ApiUcastnik;
  /** Snapshot hlavičky pro modal (kapacita + stav bez druhého volání). */
  expedice: ApiExpedice;
}

/**
 * Odebrání účastníka po uzavření (jen ADMIN).
 * Neznámá výprava / neznámé `ucastnikId` → 404 NENALEZENO
 * (není idempotentní na 200 — opakovaný DELETE stejného id → 404,
 * stejný vzor jako SmazatFotkuResponse).
 * Bez session → 401 NEPRIHLASEN, USER → 403 ZAKAZANO. Úspěch → 200.
 */
export interface OdebratUcastnikaResponse {
  ok: true;
  /** Snapshot hlavičky pro modal po odebrání. */
  expedice: ApiExpedice;
}

/** Staví URL dodatečného přidání: `/api/expeditions/xxx/ucastnici` (POST, ADMIN). */
export function pridatUcastnikaPoUzavreniPath(
  id: string,
): `/api/expeditions/${string}/ucastnici` {
  return `/api/expeditions/${id}/ucastnici`;
}

/** Staví URL odebrání: `/api/expeditions/xxx/ucastnici/yyy` (DELETE, ADMIN). */
export function odebratUcastnikaPath(
  id: string,
  ucastnikId: string,
): `/api/expeditions/${string}/ucastnici/${string}` {
  return `/api/expeditions/${id}/ucastnici/${ucastnikId}`;
}

/* ------------------------------------------------------------------ */
/* 11) GET /api/users — seznam uživatelů pro selektor (jen ADMIN, Krok 4) */
/* Implementováno v server/src/index.ts 1:1 dle kontraktu.              */
/* Důvod: POST /api/expeditions/:id/ucastnici { userId | clenId } už    */
/* funguje (varianta A, §10), ale admin UI nemá odkud brát `userId` —   */
/* chybí jen list uživatelů pro selektor. Aditivní, nic se nepřejmenovává.*/
/* Hranice: vyžaduje session s authRole === "ADMIN" (stejný guard jako  */
/* GET /api/clenove — `vyzadujAdmina`). Jinak 401 NEPRIHLASEN (bez       */
/* session) / 403 ZAKAZANO (USER). Úspěch → 200 + `UsersListResponse`.   */
/* Tvar je záměrně úzký `UserListItem { id, jmeno, email }` — nikdy      */
/* hesla ani hashe (stejně jako `ApiUser` nenosí `passwordHash`).        */
/* `jmeno` je složené z DB `users.jmeno + users.prijmeni` (trim +        */
/* collapse whitespace, fallback prázdné → email — stejný vzor jako      */
/* denormalizace v `nactiExpediciSDetailem`). Řazeno e-mailem vzestupně  */
/* (deterministický selektor, 5 reálných users — bez stránkování;        */
/* `pagination?: Strankovani` se přidá aditivně, až bude potřeba).       */
/* Chyby vždy jen `ApiErrorResponse` — nikdy jiný tvar. Validace na      */
/* hranici není potřeba (GET bez query/body); vnitřní kód typům věří.    */
/* Idempotence: čisté GET, opakovatelné bez vedlejších účinků.           */
/* ------------------------------------------------------------------ */

export const USERS_PATH = "/api/users" as const;

/**
 * Úzký řádek pro admin selektor účastníků.
 * Na rozdíl od `ApiUser` nenese kontakty / stravaId / čas —
 * jen to, co selektor a správa členů potřebuje.
 * `role` je primární DB role (jedna hodnota dle users.role CHECK) —
 * aditivně přidáno pro AdminClenovePage (filtry tabů + editace).
 */
export interface UserListItem {
  id: UserId;
  /** Složené „Jméno Příjmení" z DB (fallback prázdné → email). */
  jmeno: string;
  email: string;
  /** Primární DB role — jediná hodnota z `Role` (users.role CHECK). */
  role: Role;
  /** 3D členství — aditivně optional. */
  clenstvi?: Clenstvi;
  /** 3D funkce — aditivně optional (null = bez funkce). */
  funkce?: Funkce;
  /** Ortogonální admin příznak — aditivně optional. */
  isAdmin?: boolean;
}

export interface UsersListResponse {
  users: UserListItem[];
}

/* ------------------------------------------------------------------ */
/* 12) PATCH /api/users/:id — úprava role uživatele (jen ADMIN)         */
/* Aditivně nad §11: seznam users už nese `role`, tenhle endpoint ji    */
/* umí změnit. `role` je jedna hodnota (ne pole — DB users.role je      */
/* TEXT s CHECK na 5 hodnot z roles.ts). Hranice: session s authRole     */
/* ADMIN, jinak 401 NEPRIHLASEN / 403 ZAKAZANO. Neznámé id → 404         */
/* NENALEZENO. Neznámá role → 422 VALIDATION_ERROR                      */
/* s `details` ve tvaru role: [česká hláška]. Úspěch → 200 +            */
/* `UpravitUzivateleResponse`. Idempotentní: opakovaný PATCH se stejnou */
/* rolí přepíše stejnou hodnotu. Chyby vždy jen `ApiErrorResponse`.     */
/* ------------------------------------------------------------------ */

export const USERS_DETAIL_VZOR = "/api/users/:id" as const;

/** Staví konkrétní URL detailu uživatele: `/api/users/uuid`. */
export function userDetailPath(id: string): `/api/users/${string}` {
  return `/api/users/${id}`;
}

/** Vstup editace role — právě jedna primární role.
 * @deprecated Starý tvar `{ role }` — ponechán pro zpětnou kompatibilitu.
 * Nové trio `clenstvi` / `funkce` / `isAdmin` (+ `skola` / `trida`)
 * validuje `validujUpravuUzivatele` (server/src/validace.ts).
 */
export interface UpravitUzivateleRequest {
  role: Role;
}

export interface UpravitUzivateleResponse {
  user: UserListItem;
}

/** Vzory cest uživatelského listu + detailu (odděleně jako Krok 2 / Krok 6). */
export type UsersCesta = typeof USERS_PATH | typeof USERS_DETAIL_VZOR;

/** Hranice správy uživatelů: list i editace role jen ADMIN. */
export const PRISTUP_USERS: Record<UsersCesta, AuthRole | "PUBLIC"> = {
  [USERS_PATH]: "ADMIN",
  [USERS_DETAIL_VZOR]: "ADMIN",
} as const;

/* ------------------------------------------------------------------ */
/* 13) GET /api/meta/skoly-tridy — číselník škol a tříd (PUBLIC)        */
/* Vrací jen názvy (žádné osobní údaje — nikdy user_id / e-maily).      */
/* Aditivní, nic se nepřejmenovává.                                     */
/* ------------------------------------------------------------------ */

/** Cesta meta číselníku škol a tříd. */
export const META_SKOLY_TRIDY_PATH = "/api/meta/skoly-tridy" as const;

/** Odpověď číselníku — jen seznamy názvů, žádné osobní údaje. */
export interface SkolyTridyResponse {
  skoly: string[];
  tridy: string[];
}

/**
 * Guard odpovědi číselníku: `true` jen pro přesně
 * `{ skoly: string[], tridy: string[] }` (žádné cizí klíče —
 * např. `user_id` / `email` — odpověď odmítnou).
 */
export function jeSkolyTridyOdpoved(hodnota: unknown): hodnota is SkolyTridyResponse {
  if (typeof hodnota !== "object" || hodnota === null || Array.isArray(hodnota)) {
    return false;
  }
  const zaznam = hodnota as Record<string, unknown>;
  const klice = Object.keys(zaznam).sort();
  if (klice.length !== 2 || klice[0] !== "skoly" || klice[1] !== "tridy") {
    return false;
  }
  const skoly: unknown = zaznam["skoly"];
  const tridy: unknown = zaznam["tridy"];
  if (!Array.isArray(skoly) || !Array.isArray(tridy)) return false;
  for (const polozka of skoly) {
    if (typeof polozka !== "string") return false;
  }
  for (const polozka of tridy) {
    if (typeof polozka !== "string") return false;
  }
  return true;
}
