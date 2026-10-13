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
  | "STRAVA_NENI_NASTAVENA"
  | "MOC_POZADAVKU"
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
    /**
     * Společné ušlé kilometry celé výpravy (Krok 20, aditivně optional).
     * Přebírají se z `expeditions.km` (expedice-level — platí pro VŠECHNY,
     * kdo na výpravě byli, nejen pro konkrétního člověka). null = nezapsáno.
     * Nachází se jen veřejném detailu (`GET /api/expeditions/:id`).
     */
    km?: number | null;
    /**
     * Společné ušlé převýšení v metrech (Krok 20, aditivně optional).
     */
    prevyseniM?: number | null;
    /**
     * Zakódovaná trasa výpravy (Krok 20, aditivně optional, veřejná).
     * Mini-mapa čáry legendy funguje i pro někoho, kdo na výpravě nebyl.
     * null = bez trasy.
     */
    trasaPolyline?: string | null;
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
  schuzkaNazevMinDelka: 3,
  schuzkaNazevMaxDelka: 120,
  schuzkaMistnostMaxDelka: 120,
  schuzkaPopisMaxDelka: 2000,
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
  oznameniNazevMinDelka: 3,
  oznameniNazevMaxDelka: 120,
  oznameniTextMinDelka: 1,
  oznameniTextMaxDelka: 2000,
  rucniKmMax: 1000,
  rucniPrevyseniMax: 20000,
  skolaMaxDelka: 120,
  tridaMaxDelka: 120,
  zpravaTextMinDelka: 1,
  zpravaTextMaxDelka: 1000,
  zpravyLimitDefault: 50,
  zpravyLimitMax: 100,
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
  oznameniNazevPovinny: "Zadej název oznámení.",
  oznameniNazevKratky: "Název oznámení musí mít aspoň 3 znaky.",
  oznameniNazevDlouhy: "Název oznámení může mít nejvýš 120 znaků.",
  oznameniTextPovinny: "Zadej text oznámení.",
  oznameniTextDlouhy: "Text oznámení může mít nejvýš 2000 znaků.",
  rucniKmNeplatne: "Zadej kilometry jako číslo větší než 0 (nejvýš 1000).",
  rucniPrevyseniNeplatne: "Převýšení zadej jako celé číslo v metrech (0 a víc).",
  rucniDatumNeplatne: "Datum musí být ve tvaru RRRR-MM-DD.",
  rucniDatumBudoucnost: "Datum aktivity nesmí být v budoucnosti — zapisuje se zpětně.",
  dochazkaPrazdna: "Vyber aspoň jednoho účastníka docházky.",
  dochazkaNeznamyUcastnik: "Docházka obsahuje neznámého účastníka.",
  ucastnikIdentitaChybi: "Vyber člena — zadej userId, nebo clenId.",
  ucastnikIdentitaOboji: "Zadej právě jednu identitu — userId, nebo clenId, ne obojí.",
  ucastnikStatusNeplatny: "Status musí být „ucastnil_se“, nebo „omluven“.",
  skolaDlouha: "Škola může mít nejvýš 120 znaků.",
  tridaDlouha: "Třída může mít nejvýš 120 znaků.",
  schuzkaNazevPovinny: "Zadej název schůzky.",
  schuzkaNazevKratky: "Název schůzky musí mít aspoň 3 znaky.",
  schuzkaNazevDlouhy: "Název schůzky může mít nejvýš 120 znaků.",
  schuzkaDatumPovinne: "Zadej datum schůzky.",
  schuzkaDatumNeplatne: "Datum musí být ve tvaru RRRR-MM-DD.",
  schuzkaMistnostDlouha: "Místnost může mít nejvýš 120 znaků.",
  schuzkaPopisDlouhy: "Popis může mít nejvýš 2000 znaků.",
  schuzkaOpakovaniNeplatne: "Opakování musí být „jednorázová“, nebo „týdenní“.",
  zpravaTextPovinny: "Napiš zprávu.",
  zpravaTextDlouhy: "Zpráva může mít nejvýš 1000 znaků.",
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
  STRAVA_NENI_NASTAVENA: 503,
  MOC_POZADAVKU: 429,
  VNITRNI_CHYBA: 500,
} as const;

/**
 * Česká zpráva pro 503 STRAVA_NENI_NASTAVENA (Krok 7b, aditivně).
 * Jediný zdroj pravdy — server i klient ji sdílí, aby UI radilo stejně.
 * Neobsahuje žádný secret, jen názvy env proměnných.
 */
export const STRAVA_NENI_NASTAVENA_ZPRAVA =
  "Strava propojení není na serveru nastavené (chybí číselné STRAVA_CLIENT_ID). Zkontroluj STRAVA_CLIENT_ID v server env a pro reálný flow vypni MOCK." as const;

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
  /** Škola — "" = nevyplněna (DB NOT NULL DEFAULT "", server mapuje s fallbackem ''). */
  skola: string;
  /** Třída — "" = nevyplněna (DB NOT NULL DEFAULT "", server mapuje s fallbackem ''). */
  trida: string;
  /** Discord nick — null = nevyplněn (DB `discord_nick` nullable, server mapuje string → string, jinak null). */
  discordNick: string | null;
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

/* ------------------------------------------------------------------ */
/* 14) Fáze 3 — Schůzky (opakované schůzky + kalendář, PRD 2.4)          */
/* CRUD nad tabulkou `meetings` (id UUID, nazev, datum DATE,             */
/* mistnost NULL = venku/neurčeno, popis, opakovani                      */
/* `jednorazova` | `tydenni`, created_by, created_at). Kalendář           */
/* sjednocuje `meetings` + `expeditions` až v read vrstvě                */
/* (klient `src/lib/kalendar.ts`) — žádný FK na expeditions.             */
/* Matice: GET seznam i detail = PUBLIC (kalendář čte každý);            */
/* POST + PATCH + DELETE = dual-guard (ADMIN nebo aktivní člen —         */
/* stejný `vyzadujSpravceVyprav` jako výpravy, ROLE_DOC §5). Fotky        */
/* zůstávají jen ADMIN (precedent se nemění). Minulost data je            */
/* povolena i při vytvoření (opakovaná schůzka mohla začít dřív;         */
/* na rozdíl od výprav, kde minulost vzniká jen uzavřením).               */
/* Týdenní rozpad na výskyty řeší čistě klient (kalendář), server         */
/* ukládá jen hlavičku (první výskyt + `opakovani`).                     */
/* Chyby vždy jen `ApiErrorResponse`. Aditivní, nic se nepřejmenovává.   */
/* ------------------------------------------------------------------ */

export const MEETINGS_PATH = "/api/meetings" as const;
export const MEETING_DETAIL_VZOR = "/api/meetings/:id" as const;

/** Opakování schůzky — kopie DB CHECK (meetings.opakovani). */
export type OpakovaniSchuzky = "jednorazova" | "tydenni";

/** Jedna schůzka — kopie řádku `meetings` (datum YYYY-MM-DD). */
export interface ApiSchuzka {
  id: string;
  nazev: string;
  /** První / jednorázový výskyt YYYY-MM-DD (DB DATE → ISO slice). */
  datum: string;
  /** Třída / místnost (PRD 2.4). null = venku / neurčeno. */
  mistnost: string | null;
  popis: string;
  opakovani: OpakovaniSchuzky;
  /** B4 — vynechané výskyty týdenní řady (YYYY-MM-DD). Jen u `tydenni`. */
  vynecheneVyskyty?: string[];
}

export interface SchuzkyListResponse {
  schuzky: ApiSchuzka[];
  /** Stránkování (B5, aditivně optional). Bez něj = všechny schůzky. */
  pagination?: Strankovani;
}

export interface SchuzkaDetailResponse {
  schuzka: ApiSchuzka;
}

/**
 * Vytvoření schůzky (dual-guard). Minulost povolena.
 * `mistnost`: prázdný řetězec hranice normalizuje na null.
 */
export interface VytvoritSchuzkuRequest {
  /** 3–120 znaků. */
  nazev: string;
  /** Datum YYYY-MM-DD (i minulost — opakovaná schůzka mohla začít dřív). */
  datum: string;
  /** Nepovinná; max 120 znaků. "" = venku / neurčeno (null). */
  mistnost?: string | null;
  /** Nepovinný; max 2000 znaků. "" = bez popisu. */
  popis?: string;
  /** Nepovinné; default `jednorazova`. */
  opakovani?: OpakovaniSchuzky;
}

export interface VytvoritSchuzkuResponse {
  schuzka: ApiSchuzka;
}

/** Parciální update (dual-guard, PATCH sémantika). */
export interface UpravitSchuzkuRequest {
  nazev?: string;
  datum?: string;
  mistnost?: string | null;
  popis?: string;
  opakovani?: OpakovaniSchuzky;
}

export interface UpravitSchuzkuResponse {
  schuzka: ApiSchuzka;
}

/** Smazání schůzky (dual-guard). Opakovaný DELETE → 404. */
export interface SmazatSchuzkuResponse {
  ok: true;
}

/** Rozsah mazání opakované schůzky (B4 — výjimka pro jeden výskyt). */
export type RozsahMazaniSchuzky = "vyskyt" | "rada";

/**
 * Smazání jednoho výskytu týdenní schůzky (B4).
 * Vloží záznam do `meeting_exceptions`; řada zůstává.
 */
export interface SmazatVyskytSchuzkyResponse {
  ok: true;
}

/** Staví URL výjimky schůzky: `/api/meetings/uuid/occurrence`. */
export function schuzkaOccurrencePath(
  id: string,
): `/api/meetings/${string}/occurrence` {
  return `/api/meetings/${id}/occurrence`;
}

/** Volitelný dotaz pro `getSchuzky` (B5 — stránkování). */
export interface SchuzkyListQuery {
  page?: number;
  pageSize?: number;
}

/** Staví URL seznamu schůzek s volitelnými query parametry (B5). */
export function schuzkyListUrl(query: SchuzkyListQuery): string {
  const params = new URLSearchParams();
  if (query.page !== undefined) params.set("page", String(query.page));
  if (query.pageSize !== undefined)
    params.set("pageSize", String(query.pageSize));
  const qs = params.toString();
  return qs.length > 0 ? `${MEETINGS_PATH}?${qs}` : MEETINGS_PATH;
}

/** Staví URL detailu schůzky: `/api/meetings/uuid`. */
export function schuzkaDetailPath(id: string): `/api/meetings/${string}` {
  return `/api/meetings/${id}`;
}

/** Vzory cest schůzek pro matici oprávnění (odděleně jako Krok 2 / Krok 6). */
export type SchuzkyCesta = typeof MEETINGS_PATH | typeof MEETING_DETAIL_VZOR;

export interface MaticeRadekSchuzky {
  metoda: ExpediceMetoda;
  cesta: string;
  kdo: AuthRole | "PUBLIC";
  uspech: string;
}

/**
 * Matice oprávnění schůzek (metoda + cesta → kdo smí).
 * GET = PUBLIC (kalendář čte každý); zápis = dual-guard
 * (ADMIN nebo aktivní člen — server hlídá `vyzadujSpravceVyprav`).
 */
export const MATICE_SCHUZKY: readonly MaticeRadekSchuzky[] = [
  {
    metoda: "GET",
    cesta: MEETINGS_PATH,
    kdo: "PUBLIC",
    uspech: "200 + SchuzkyListResponse (řazeno datem)",
  },
  {
    metoda: "POST",
    cesta: MEETINGS_PATH,
    kdo: "ADMIN",
    uspech: "201 + VytvoritSchuzkuResponse (dual-guard: ADMIN nebo aktivní člen)",
  },
  {
    metoda: "GET",
    cesta: MEETING_DETAIL_VZOR,
    kdo: "PUBLIC",
    uspech: "200 + SchuzkaDetailResponse",
  },
  {
    metoda: "PATCH",
    cesta: MEETING_DETAIL_VZOR,
    kdo: "ADMIN",
    uspech: "200 + UpravitSchuzkuResponse (dual-guard)",
  },
  {
    metoda: "DELETE",
    cesta: MEETING_DETAIL_VZOR,
    kdo: "ADMIN",
    uspech: "200 + SmazatSchuzkuResponse (dual-guard)",
  },
] as const;

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

/* ------------------------------------------------------------------ */
/* 15) Fáze 4 — Strava + osobní statistiky + žebříček (PRD 2.3)         */
/* OAuth start v profilu, párování poslední nepárované aktivity          */
/* k uzavřené výpravě (km / převýšení / trasa), statistiky a             */
/* leaderboard. Aditivní, nic se nepřejmenovává.                         */
/*                                                                       */
/* BEZPEČNOST (AGENTS.md §2.4): kontrakt nenosí ŽÁDNÉ secrety.            */
/* `access_token` / `refresh_token` / `client_secret` žijí jen v DB       */
/* `strava_tokens` (drizzle/schema/strava_tokens.ts, server-only)        */
/* a v `.env.local` (STRAVA_CLIENT_SECRET). `StravaTokens` níže je       */
/* jen VEŘEJNÝ stav propojení — guard `jeStravaTokens` odpověď           */
/* obsahující klíč secretu výslovně odmítne (stejný vzor jako            */
/* `jeSkolyTridyOdpoved` odmítající cizí klíče).                         */
/*                                                                       */
/* Matice: OAuth start + callback + osobní statistiky = USER             */
/* (přihlášený); žebříček = PUBLIC (stejný precedent jako seznam         */
/* výprav). Párování aktivity k výpravě řeší až další krok Fáze 4        */
/* (ADMIN zápis do `km / prevyseni_m / strava_activity_id /              */
/* trasa_polyline`) — tento krok zavádí jen kontrakt + DB základ.        */
/* Chyby vždy jen `ApiErrorResponse`.                                    */
/* ------------------------------------------------------------------ */

export const STRAVA_AUTH_PATH = "/api/strava/auth" as const;
export const STRAVA_CALLBACK_PATH = "/api/strava/callback" as const;
export const STATISTIKY_VZOR = "/api/statistiky/:userId" as const;
export const ZEBRICEK_PATH = "/api/zebricek" as const;

/** Staví URL osobních statistik: `/api/statistiky/uuid`. */
export function statistikyPath(userId: string): `/api/statistiky/${string}` {
  return `/api/statistiky/${userId}`;
}

/**
 * Veřejný stav Strava propojení — kopie BEZ secretů.
 * `access_token` / `refresh_token` sem NIKDY nepatří (viz hlavička §15).
 */
export interface StravaTokens {
  userId: UserId;
  /** Strava athlete id (z `users.strava_id`). null = nepropojeno. */
  stravaId: string | null;
  /** Udělený OAuth scope (např. `"read,activity:read"`). */
  scope: string;
  /** Expirace access tokenu (ISO) — jen pro rozhodnutí o refreshi. */
  expirace: string;
  updatedAt: string;
}

/**
 * Spárovaná aktivita k výpravě — kopie sloupců `expeditions`
 * (`km / prevyseni_m / strava_activity_id / trasa_polyline`).
 * Vše null = výprava zatím nespárována.
 */
export interface ApiAktivita {
  id: string;
  expeditionId: string;
  /** Ujeté/ušlé km ze Stravy. null = nespárováno. */
  km: number | null;
  /** Nastoupané metry ze Stravy. null = nespárováno. */
  prevyseniM: number | null;
  /** Strava aktivita (UNIQUE — jedna aktivita = jedna výprava). */
  stravaActivityId: string | null;
  /** Zakódovaná trasa (polyline) pro heatmapu. null = bez trasy. */
  trasaPolyline: string | null;
  /** Název výpravy pro seznam v profilu (aditivně optional). */
  nazev?: string;
  /** Datum výpravy YYYY-MM-DD pro seznam v profilu (aditivně optional). */
  datum?: string;
  /**
   * Stav mojí docházky na této výpravě (Krok 20, aditivně optional).
   * `ucastnil_se` = navštívil jsem, `prihlasen` = přihlášen na budoucí,
   * `omluven` = neúčast. Chybí-li, jde o starší payload.
   */
  status?: StatusUcasti;
}

/** Osobní statistiky uživatele pro profil (PRD 2.3). */
export interface StatistikyResponse {
  userId: UserId;
  jmeno: string;
  /** Počet absolvovaných výprav (docházka `ucastnil_se`). */
  vypravy: number;
  kmCelkem: number;
  prevyseniCelkem: number;
  aktivity: ApiAktivita[];
}

/** Jeden řádek žebříčku nejaktivnějších členů. */
export interface ZebricekRadek {
  userId: UserId;
  jmeno: string;
  vypravy: number;
  km: number;
}

/** Žebříček — řazeno km sestupně (řeší server v SQL). */
export interface ZebricekResponse {
  zebricek: ZebricekRadek[];
}

/**
 * Osobní statistiky přihlášeného (Krok 3 Fáze 4, aditivně nad §15).
 * Session-scoped varianta `STATISTIKY_VZOR` — userId čte server ze session,
 * klient žádné id neposílá. USER (bez session → 401 NEPRIHLASEN).
 */
export const STATISTIKY_MOJE_PATH = "/api/statistiky/moje" as const;

/** Vzory cest Fáze 4 pro matici oprávnění (odděleně jako Krok 2 / Krok 6). */
export type StravaCesta =
  | typeof STRAVA_AUTH_PATH
  | typeof STRAVA_CALLBACK_PATH
  | typeof STATISTIKY_VZOR
  | typeof STATISTIKY_MOJE_PATH
  | typeof ZEBRICEK_PATH;

/** Hranice Fáze 4: OAuth + statistiky jen přihlášený, žebříček PUBLIC. */
export const PRISTUP_STRAVA: Record<StravaCesta, AuthRole | "PUBLIC"> = {
  [STRAVA_AUTH_PATH]: "USER",
  [STRAVA_CALLBACK_PATH]: "USER",
  [STATISTIKY_VZOR]: "USER",
  [STATISTIKY_MOJE_PATH]: "USER",
  [ZEBRICEK_PATH]: "PUBLIC",
} as const;

export interface MaticeRadekStrava {
  metoda: ExpediceMetoda;
  cesta: string;
  kdo: AuthRole | "PUBLIC";
  uspech: string;
}

/**
 * Matice oprávnění Fáze 4 (metoda + cesta → kdo smí).
 * Párovací zápis (ADMIN) sem zatím NEPATŘÍ — přijde s dalším krokem.
 */
export const MATICE_STRAVA: readonly MaticeRadekStrava[] = [
  {
    metoda: "GET",
    cesta: STRAVA_AUTH_PATH,
    kdo: "USER",
    uspech: "302 na Strava OAuth (state = userId)",
  },
  {
    metoda: "GET",
    cesta: STRAVA_CALLBACK_PATH,
    kdo: "USER",
    uspech: "302 zpět do profilu + uložené strava_tokens",
  },
  {
    metoda: "GET",
    cesta: STATISTIKY_VZOR,
    kdo: "USER",
    uspech: "200 + StatistikyResponse",
  },
  {
    metoda: "GET",
    cesta: STATISTIKY_MOJE_PATH,
    kdo: "USER",
    uspech: "200 + StatistikyResponse (session-scoped, jeden JOIN ucastnil_se)",
  },
  {
    metoda: "GET",
    cesta: ZEBRICEK_PATH,
    kdo: "PUBLIC",
    uspech: "200 + ZebricekResponse (řazeno km sestupně)",
  },
] as const;

/**
 * Klíče secretů, které se v žádné odpovědi §15 nesmí objevit.
 * Seznam je záměrně i pro camelCase tvary (obrana proti přejmenování).
 */
const ZAKAZANE_KLICE_SEKRETU: readonly string[] = [
  "access_token",
  "refresh_token",
  "client_secret",
  "accessToken",
  "refreshToken",
  "clientSecret",
] as const;

/**
 * Guard stavu propojení: `true` jen pro veřejná pole
 * (`userId / stravaId / scope / expirace / updatedAt`).
 * Přítomnost JAKÉHOKOLIV klíče secretu → `false`.
 */
export function jeStravaTokens(hodnota: unknown): hodnota is StravaTokens {
  if (typeof hodnota !== "object" || hodnota === null || Array.isArray(hodnota)) {
    return false;
  }
  const zaznam = hodnota as Record<string, unknown>;
  for (const klic of ZAKAZANE_KLICE_SEKRETU) {
    if (klic in zaznam) return false;
  }
  if (typeof zaznam["userId"] !== "string") return false;
  const stravaId: unknown = zaznam["stravaId"];
  if (typeof stravaId !== "string" && stravaId !== null) return false;
  if (typeof zaznam["scope"] !== "string") return false;
  if (typeof zaznam["expirace"] !== "string") return false;
  if (typeof zaznam["updatedAt"] !== "string") return false;
  return true;
}

/** Guard spárované aktivity (`km / prevyseniM` číslo, nebo null). */
/**
 * Guard pro `ApiExpedice` — minimální tvar potřebný pro read-only komponenty
 * (Krok 20: přehled „Ušlé na výpravě"). Volitelná pole `km` / `prevyseniM` /
 * `trasaPolyline` kontroluje jen typ (null = nezapsáno), nikdy přítomnost.
 */
export function jeApiExpedice(hodnota: unknown): hodnota is ApiExpedice {
  if (typeof hodnota !== "object" || hodnota === null || Array.isArray(hodnota)) {
    return false;
  }
  const zaznam = hodnota as Record<string, unknown>;
  if (typeof zaznam["id"] !== "string") return false;
  if (typeof zaznam["nazev"] !== "string") return false;
  if (typeof zaznam["datum"] !== "string") return false;
  const datumDo: unknown = zaznam["datumDo"];
  if (typeof datumDo !== "string" && datumDo !== null) return false;
  const stav: unknown = zaznam["stav"];
  if (typeof stav !== "string") return false;
  const kapacita: unknown = zaznam["kapacita"];
  if (typeof kapacita !== "object" || kapacita === null) return false;
  const km: unknown = zaznam["km"];
  if (typeof km !== "number" && km !== null && km !== undefined) return false;
  const prevyseniM: unknown = zaznam["prevyseniM"];
  if (
    typeof prevyseniM !== "number" &&
    prevyseniM !== null &&
    prevyseniM !== undefined
  ) {
    return false;
  }
  const trasaPolyline: unknown = zaznam["trasaPolyline"];
  if (
    typeof trasaPolyline !== "string" &&
    trasaPolyline !== null &&
    trasaPolyline !== undefined
  ) {
    return false;
  }
  return true;
}

export function jeApiAktivita(hodnota: unknown): hodnota is ApiAktivita {
  if (typeof hodnota !== "object" || hodnota === null || Array.isArray(hodnota)) {
    return false;
  }
  const zaznam = hodnota as Record<string, unknown>;
  if (typeof zaznam["id"] !== "string") return false;
  if (typeof zaznam["expeditionId"] !== "string") return false;
  const km: unknown = zaznam["km"];
  if (typeof km !== "number" && km !== null) return false;
  const prevyseniM: unknown = zaznam["prevyseniM"];
  if (typeof prevyseniM !== "number" && prevyseniM !== null) return false;
  const stravaActivityId: unknown = zaznam["stravaActivityId"];
  if (typeof stravaActivityId !== "string" && stravaActivityId !== null) {
    return false;
  }
  const trasaPolyline: unknown = zaznam["trasaPolyline"];
  if (typeof trasaPolyline !== "string" && trasaPolyline !== null) return false;
  return true;
}

function jeNezaporneCislo(hodnota: unknown): boolean {
  return typeof hodnota === "number" && Number.isFinite(hodnota) && hodnota >= 0;}

/** Guard osobních statistik (každá aktivita přes `jeApiAktivita`). */
export function jeStatistikyOdpoved(
  hodnota: unknown,
): hodnota is StatistikyResponse {
  if (typeof hodnota !== "object" || hodnota === null || Array.isArray(hodnota)) {
    return false;
  }
  const zaznam = hodnota as Record<string, unknown>;
  if (typeof zaznam["userId"] !== "string") return false;
  if (typeof zaznam["jmeno"] !== "string") return false;
  if (!jeNezaporneCislo(zaznam["vypravy"])) return false;
  if (!jeNezaporneCislo(zaznam["kmCelkem"])) return false;
  if (!jeNezaporneCislo(zaznam["prevyseniCelkem"])) return false;
  const aktivity: unknown = zaznam["aktivity"];
  if (!Array.isArray(aktivity)) return false;
  for (const aktivita of aktivity) {
    if (!jeApiAktivita(aktivita)) return false;
  }
  return true;
}

function jeZebricekRadek(hodnota: unknown): boolean {
  if (typeof hodnota !== "object" || hodnota === null || Array.isArray(hodnota)) {
    return false;
  }
  const zaznam = hodnota as Record<string, unknown>;
  if (typeof zaznam["userId"] !== "string") return false;
  if (typeof zaznam["jmeno"] !== "string") return false;
  if (!jeNezaporneCislo(zaznam["vypravy"])) return false;
  if (!jeNezaporneCislo(zaznam["km"])) return false;
  return true;
}

/* ------------------------------------------------------------------ */
/* 15b) Krok 2 Fáze 4 — Párování aktivit k uzavřené výpravě (aditivní).   */
/* Auto-návrh poslední nepárované aktivity + admin confirm.               */
/* - `GET /api/strava/neparovane` (USER, jen vlastní token, per_page=10,  */
/*   filtr `strava_activity_id IS NULL` — jen nespárované).               */
/* - `POST /api/expeditions/:id/strava-parovani { activityId }`           */
/*   (dual-guard `vyzadujSpravceVyprav`, jen `stav=proběhlá`, jinak 409   */
/*   `VYPRAVA_UZAVRENA`; duplicita aktivity / už spárovaná výprava → 409  */
/*   `UZ_PRIHLASEN`; USER bez práva → 403 `ZAKAZANO`).                    */
/* Po confirmu se zapíše `km / prevyseni_m / trasa_polyline /             */
/* strava_activity_id` (kopie `ApiAktivita`). Chyby jen `ApiErrorResponse`.*/
/* Žádné secrety v odpovědích (stejný zákaz jako §15).                    */
/* ------------------------------------------------------------------ */

export const STRAVA_NEPAROVANE_PATH = "/api/strava/neparovane" as const;
export const EXPEDICE_STRAVA_PAROVANI_VZOR =
  "/api/expeditions/:id/strava-parovani" as const;

/** Staví URL párování: `/api/expeditions/xxx/strava-parovani`. */
export function stravaParovaniPath(
  id: string,
): `/api/expeditions/${string}/strava-parovani` {
  return `/api/expeditions/${id}/strava-parovani`;
}

/**
 * Nepárovaná Strava aktivita (návrh k potvrzení).
 * Veřejná podmnožina — nikdy secrety (access/refresh token).
 */
export interface NeparovanaAktivita {
  /** Strava id aktivity jako řetězec (Strava vrací číslo). */
  id: string;
  /** Název aktivity ze Stravy. */
  nazev: string;
  /** Start aktivity (ISO). */
  datum: string;
  /** Km (distance / 1000, zaokrouhleno na 1 desetinné). */
  km: number;
  /** Nastoupané metry. */
  prevyseniM: number;
  /** Polyline trasy; null = bez mapy. */
  trasaPolyline: string | null;
  /**
   * Krok 13 (aditivně optional): true = aktivita už je spárovaná
   * k některé výpravě (`strava_activity_id IS NOT NULL`).
   * Seznam vrací VŠECHNY moje aktivity s odznakem připojeno/nepřipojeno.
   */
  sparovano?: boolean;
}

export interface NeparovaneAktivityResponse {
  aktivity: NeparovanaAktivita[];
  /**
   * Krok 13 (aditivně optional): celkový počet mých aktivit
   * (před stránkováním `?page&per_page`).
   */
  celkem?: number;
}

/**
 * Krok 13 (aditivně): query pro `GET /api/strava/neparovane`.
 * `page` default 1, `per_page` default 30, max 100.
 */
export interface NeparovaneAktivityQuery {
  page?: number;
  per_page?: number;
}

/** Staví URL seznamu aktivit s volitelnými query parametry (Krok 13). */
export function neparovaneAktivityUrl(query: NeparovaneAktivityQuery): string {
  const params = new URLSearchParams();
  if (query.page !== undefined) params.set("page", String(query.page));
  if (query.per_page !== undefined)
    params.set("per_page", String(query.per_page));
  const qs = params.toString();
  return qs.length > 0 ? `${STRAVA_NEPAROVANE_PATH}?${qs}` : STRAVA_NEPAROVANE_PATH;
}

/** Vstup confirmu párování — Strava id aktivity. */
export interface SparujAktivituRequest {
  activityId: string;
}

export interface SparujAktivituResponse {
  expedice: ApiExpedice;
  aktivita: ApiAktivita;
}

/** Hranice párování: čtení návrhů USER, zápis dual-guard (ADMIN nebo aktivní). */
export const PRISTUP_PAROVANI = {
  [STRAVA_NEPAROVANE_PATH]: "USER",
  [EXPEDICE_STRAVA_PAROVANI_VZOR]: "ADMIN",
} as const;

function jeNezaporneKonecneCislo(hodnota: unknown): boolean {
  return typeof hodnota === "number" && Number.isFinite(hodnota) && hodnota >= 0;
}

/**
 * Guard návrhu: `true` jen pro veřejná pole
 * (`id / nazev / datum / km / prevyseniM / trasaPolyline`).
 * Přítomnost JAKÉHOKOLIV klíče secretu → `false` (vzor §15).
 */
export function jeNeparovanaAktivita(
  hodnota: unknown,
): hodnota is NeparovanaAktivita {
  if (typeof hodnota !== "object" || hodnota === null || Array.isArray(hodnota)) {
    return false;
  }
  const zaznam = hodnota as Record<string, unknown>;
  for (const klic of [
    "access_token",
    "refresh_token",
    "client_secret",
    "accessToken",
    "refreshToken",
    "clientSecret",
  ]) {
    if (klic in zaznam) return false;
  }
  if (typeof zaznam["id"] !== "string" || (zaznam["id"] as string).length === 0)
    return false;
  if (typeof zaznam["nazev"] !== "string") return false;
  if (typeof zaznam["datum"] !== "string") return false;
  if (!jeNezaporneKonecneCislo(zaznam["km"])) return false;
  const prevyseni: unknown = zaznam["prevyseniM"];
  if (typeof prevyseni !== "number" || !Number.isFinite(prevyseni) || prevyseni < 0)
    return false;
  const polyline: unknown = zaznam["trasaPolyline"];
  if (typeof polyline !== "string" && polyline !== null) return false;
  // Krok 13 (aditivně optional): příznak sparovano, když je přítomen, musí být boolean.
  if ("sparovano" in zaznam && typeof zaznam["sparovano"] !== "boolean")
    return false;
  return true;
}

/** Guard seznamu návrhů (prázdný seznam je platný). */
export function jeNeparovaneAktivityOdpoved(
  hodnota: unknown,
): hodnota is NeparovaneAktivityResponse {
  if (typeof hodnota !== "object" || hodnota === null || Array.isArray(hodnota)) {
    return false;
  }
  const zaznam = hodnota as Record<string, unknown>;
  const aktivity: unknown = zaznam["aktivity"];
  if (!Array.isArray(aktivity)) return false;
  for (const polozka of aktivity) {
    if (!jeNeparovanaAktivita(polozka)) return false;
  }
  // Krok 13 (aditivně optional): celkem, když je přítomno, musí být nezáporné celé číslo.
  if ("celkem" in zaznam) {
    const celkem: unknown = zaznam["celkem"];
    if (
      typeof celkem !== "number" ||
      !Number.isInteger(celkem) ||
      celkem < 0
    )
      return false;
  }
  return true;
}

/** Guard confirm odpovědi (expedice + zapsaná aktivita). */
export function jeSparujAktivituOdpoved(
  hodnota: unknown,
): hodnota is SparujAktivituResponse {
  if (typeof hodnota !== "object" || hodnota === null || Array.isArray(hodnota)) {
    return false;
  }
  const zaznam = hodnota as Record<string, unknown>;
  const expedice: unknown = zaznam["expedice"];
  const aktivita: unknown = zaznam["aktivita"];
  if (typeof expedice !== "object" || expedice === null) return false;
  return jeApiAktivita(aktivita);
}

/* ------------------------------------------------------------------ */
/* 15b2) Krok 13 — Odpojení aktivity od výpravy (aditivní).              */
/* DELETE /api/expeditions/:id/strava-parovani (dual-guard, jen          */
/* `stav=proběhlá`, jinak 409 `VYPRAVA_UZAVRENA`; nic připojeno → 404    */
/* `NENALEZENO`; USER bez práva → 403 `ZAKAZANO`). Vymaže 4 sloupce      */
/* (`km / prevyseni_m / strava_activity_id / trasa_polyline → NULL`),    */
/* takže statistiky klesnou. Stejná cesta jako POST confirm             */
/* (`stravaParovaniPath`), jiná metoda. Chyby jen `ApiErrorResponse`.    */
/* ------------------------------------------------------------------ */

/** Odpověď odpojení — expedice + vynulovaná aktivita (vše null). */
export interface OdpojAktivituResponse {
  expedice: ApiExpedice;
  aktivita: ApiAktivita;
}

/** Guard odpovědi odpojení (expedice + aktivita, bez secretů). */
export function jeOdpojAktivituOdpoved(
  hodnota: unknown,
): hodnota is OdpojAktivituResponse {
  if (typeof hodnota !== "object" || hodnota === null || Array.isArray(hodnota)) {
    return false;
  }
  const zaznam = hodnota as Record<string, unknown>;
  for (const klic of [
    "access_token",
    "refresh_token",
    "client_secret",
    "accessToken",
    "refreshToken",
    "clientSecret",
  ]) {
    if (klic in zaznam) return false;
  }
  const expedice: unknown = zaznam["expedice"];
  const aktivita: unknown = zaznam["aktivita"];
  if (typeof expedice !== "object" || expedice === null) return false;
  if (typeof aktivita !== "object" || aktivita === null) return false;
  const zaznamAktivity = aktivita as Record<string, unknown>;
  for (const klic of [
    "access_token",
    "refresh_token",
    "client_secret",
    "accessToken",
    "refreshToken",
    "clientSecret",
  ]) {
    if (klic in zaznamAktivity) return false;
  }
  return jeApiAktivita(aktivita);
}

/** Guard žebříčku (prázdný žebříček je platný). */
export function jeZebricekOdpoved(
  hodnota: unknown,
): hodnota is ZebricekResponse {
  if (typeof hodnota !== "object" || hodnota === null || Array.isArray(hodnota)) {
    return false;
  }
  const zaznam = hodnota as Record<string, unknown>;
  const zebricek: unknown = zaznam["zebricek"];
  if (!Array.isArray(zebricek)) return false;
  for (const radek of zebricek) {
    if (!jeZebricekRadek(radek)) return false;
  }
  return true;
}

/* ------------------------------------------------------------------ */
/* 15c) Krok 5 Fáze 4 — Veřejný žebříček účast > km (aditivní).          */
/* GET /api/zebricky?obdobi=celkem|YYYY — PUBLIC (stejný precedent jako  */
/* seznam výprav). Řazení `vypravy DESC, km DESC`, tie-break `jmeno ASC`  */
/* (deterministické pořadí), `LIMIT 50`, bez PII kromě `jmeno`            */
/* (žádný e-mail / telefon / secrety — guard odmítne známé PII klíče).   */
/* `obdobi=celkem` = vše; `obdobi=YYYY` = jen výpravy daného roku         */
/* (server filtruje rozsahem `datum >= YYYY-01-01 AND datum < YYYY+1`,    */
/* aby mohl použít index `expeditions(datum)`). Nevalidní obdobi → 422    */
/* VALIDATION_ERROR (`obdobi: [česká hláška]`). Staré `ZEBRICEK_PATH`      */
/* (`/api/zebricek`) se NEMAZE — nový plural endpoint je vedle něj.       */
/* Chyby vždy jen `ApiErrorResponse`.                                    */
/* ------------------------------------------------------------------ */

/** Plural cesta žebříčku s filtrem období (Krok 5). */
export const ZEBRICKY_PATH = "/api/zebricky" as const;

/** Jeden řádek plural žebříčku — jen veřejné údaje (bez PII kromě jmeno). */
export interface ZebrickyRadek {
  userId: UserId;
  jmeno: string;
  /** Počet absolvovaných výprav (docházka `ucastnil_se`). */
  vypravy: number;
  /** Součet km (null = nespárováno → 0, zaokrouhleno na 1 desetinné). */
  km: number;
}

/** Odpověď plural žebříčku — řazeno vypravy DESC, km DESC, jmeno ASC. */
export interface ZebrickyResponse {
  zebricky: ZebrickyRadek[];
  /** Normalizované období (`celkem`, nebo `YYYY`). */
  obdobi: string;
}

/** Query plural žebříčku (`celkem` = vše, jinak rok `YYYY`). */
export interface ZebrickyQuery {
  obdobi?: string;
}

/** Staví URL žebříčku: `/api/zebricky` nebo `/api/zebricky?obdobi=2026`. */
export function zebrickyListUrl(query: ZebrickyQuery): string {
  const params = new URLSearchParams();
  if (query.obdobi !== undefined) params.set("obdobi", query.obdobi);
  const qs = params.toString();
  return qs.length > 0 ? `${ZEBRICKY_PATH}?${qs}` : ZEBRICKY_PATH;
}

/** Hranice plural žebříčku: čtení PUBLIC. */
export const PRISTUP_ZEBRICKY = {
  [ZEBRICKY_PATH]: "PUBLIC",
} as const;

/** PII klíče, které plural žebříček nikdy nevrací (kromě `jmeno`). */
const ZAKAZANE_KLICE_ZEBRICKY: readonly string[] = [
  "email",
  "telefon",
  "discordNick",
  "passwordHash",
  "access_token",
  "refresh_token",
  "client_secret",
  "accessToken",
  "refreshToken",
  "clientSecret",
] as const;

function jeZebrickyRadek(hodnota: unknown): boolean {
  if (typeof hodnota !== "object" || hodnota === null || Array.isArray(hodnota)) {
    return false;
  }
  const zaznam = hodnota as Record<string, unknown>;
  for (const klic of ZAKAZANE_KLICE_ZEBRICKY) {
    if (klic in zaznam) return false;
  }
  if (typeof zaznam["userId"] !== "string") return false;
  if (typeof zaznam["jmeno"] !== "string") return false;
  if (!jeNezaporneCislo(zaznam["vypravy"])) return false;
  if (!jeNezaporneCislo(zaznam["km"])) return false;
  return true;
}

/** Guard plural žebříčku (prázdný žebříček je platný). */
export function jeZebrickyOdpoved(
  hodnota: unknown,
): hodnota is ZebrickyResponse {
  if (typeof hodnota !== "object" || hodnota === null || Array.isArray(hodnota)) {
    return false;
  }
  const zaznam = hodnota as Record<string, unknown>;
  if (typeof zaznam["obdobi"] !== "string") return false;
  const zebricky: unknown = zaznam["zebricky"];
  if (!Array.isArray(zebricky)) return false;
  for (const radek of zebricky) {
    if (!jeZebrickyRadek(radek)) return false;
  }
  return true;
}

/* ------------------------------------------------------------------ */
/* 15d) Krok 7c — Ruční zadání aktivity bez Stravy (aditivní).            */
/* DŮLEŽITÉ PRO UŽIVATELE BEZ PŘEDPLATNÉHO: čtení Strava API (`read`,    */
/* `activity:read`) je ZDARMA — Summit ani žádné předplatné není potřeba */
/* (předplatné odemyká jen prémiové funkce Stravy, ne API pro čtení      */
/* vlastních aktivit). Přesto jde výpravu uzavřít s kilometry i zcela    */
/* bez Stravy: správce výpravy zapíše                                    */
/* `POST /api/expeditions/:id/aktivita-ruchne { km, prevyseni_m }`*/
/* a `km / prevyseni_m` se uloží do stejných DB sloupců jako ze Stravy.  */
/* Statistiky / heatmapa / leaderboard čtou jen DB (`agregujStatistiky`),*/
/* takže fungují i s `stravaActivityId: null` a `trasaPolyline: null`.   */
/* Matice: zápis = dual-guard (`vyzadujSpravceVyprav`, USER bez práva →   */
/* 403 ZAKAZANO); jen `stav=proběhlá`, jinak 409 `VYPRAVA_UZAVRENA`       */
/* (stejný kód jako přihláška na proběhlou). Opakovaný zápis je           */
/* idempotentní (poslední zápis vyhrává, Strava id zůstává null).         */
/* Chyby vždy jen `ApiErrorResponse`. Žádné secrety v odpovědích.         */
/* ------------------------------------------------------------------ */

export const EXPEDICE_AKTIVITA_RUCNE_VZOR =
  "/api/expeditions/:id/aktivita-ruchne" as const;

/** Staví URL ručního zápisu: `/api/expeditions/xxx/aktivita-ruchne`. */
export function aktivitaRucnePath(
  id: string,
): `/api/expeditions/${string}/aktivita-ruchne` {
  return `/api/expeditions/${id}/aktivita-ruchne`;
}

/**
 * Ruční zápis aktivity k uzavřené výpravě (bez Stravy).
 * `km` povinné (číslo > 0, nejvýš `VALIDACE.rucniKmMax`, zaokrouhlí se
 * na 1 desetinné jako Strava normalizace); `prevyseniM` nepovinné
 * (default 0, celé metry). Datum se neposílá — bere se z expedice
 * (statistikám stačí DB sloupce km / prevyseni_m). Tělo přijímá
 * i snake_case `prevyseni_m` (alias pro formulář dle zadání),
 * kontrakt je camelCase.
 */
export interface UlozAktivituRucneRequest {
  km: number;
  prevyseniM?: number;
}

export interface UlozAktivituRucneResponse {
  expedice: ApiExpedice;
  aktivita: ApiAktivita;
}

/** Hranice ručního zápisu: dual-guard (ADMIN nebo aktivní člen). */
export const PRISTUP_AKTIVITA_RUCNE = {
  [EXPEDICE_AKTIVITA_RUCNE_VZOR]: "ADMIN",
} as const;

/** Guard odpovědi ručního zápisu (expedice + zapsaná aktivita, bez secretů). */
export function jeUlozAktivituOdpoved(
  hodnota: unknown,
): hodnota is UlozAktivituRucneResponse {
  if (typeof hodnota !== "object" || hodnota === null || Array.isArray(hodnota)) {
    return false;
  }
  const zaznam = hodnota as Record<string, unknown>;
  for (const klic of [
    "access_token",
    "refresh_token",
    "client_secret",
    "accessToken",
    "refreshToken",
    "clientSecret",
  ]) {
    if (klic in zaznam) return false;
  }
  const expedice: unknown = zaznam["expedice"];
  const aktivita: unknown = zaznam["aktivita"];
  if (typeof expedice !== "object" || expedice === null) return false;
  if (typeof aktivita !== "object" || aktivita === null) return false;
  const zaznamAktivity = aktivita as Record<string, unknown>;
  for (const klic of [
    "access_token",
    "refresh_token",
    "client_secret",
    "accessToken",
    "refreshToken",
    "clientSecret",
  ]) {
    if (klic in zaznamAktivity) return false;
  }
  return jeApiAktivita(aktivita);
}

/* ------------------------------------------------------------------ */
/* 15f) Krok 9 — Strava OAuth end-to-end audit (aditivní).                */
/* - `GET /api/strava/auth-url` (PUBLIC) → `{ url }` (jen veřejné        */
/*   CLIENT_ID, scope `read,activity:read`, approval_prompt=force).       */
/* - Callback redirecty nesou `?strava=propojeno` nebo                    */
/*   `?strava=chyba&duvod=<allowlist>` (české hlášky níže).               */
/* - Žádné secrety v URL / logu / bundlu (jen číselné client_id).         */
/* ------------------------------------------------------------------ */

/** Veřejná cesta authorize URL (PUBLIC, jen `{ url }`). */
export const STRAVA_AUTH_URL_PATH = "/api/strava/auth-url" as const;

/** Odpojení Stravy (USER, idempotentní `{ ok: true }`). */
export const STRAVA_ODPOJIT_PATH = "/api/strava/odpojit" as const;

/** Odpověď `GET /api/strava/auth-url` — jen veřejné URL. */
export interface StravaAuthUrlResponse {
  url: string;
}

/** Povolené důvody callback chyby (allowlist do `?duvod=`). */
export type StravaCallbackDuvod =
  | "odepreno"
  | "neplatny-kod"
  | "strava-odmitla"
  | "neznama-chyba";

/** České hlášky důvodů pro ProfilPage (nikdy secrety). */
export const STRAVA_CALLBACK_DUVOD_ZPRAVY: Record<StravaCallbackDuvod, string> = {
  odepreno:
    "Propojení jsi na Stravě zamítl. Když to zkusíš znovu, klikni na Stravě na Povolit.",
  "neplatny-kod":
    "Kód ze Stravy je neplatný nebo vypršel. Zkus propojení znovu.",
  "strava-odmitla":
    "Strava kód odmítla (neplatný nebo expirovaný). Zkus propojení znovu.",
  "neznama-chyba": "Propojení se nepovedlo. Zkus to prosím znovu.",
} as const;

/** Guard důvodu (allowlist — vše ostatní → `neznama-chyba`). */
export function jeStravaCallbackDuvod(
  hodnota: unknown,
): hodnota is StravaCallbackDuvod {
  return (
    hodnota === "odepreno" ||
    hodnota === "neplatny-kod" ||
    hodnota === "strava-odmitla" ||
    hodnota === "neznama-chyba"
  );
}

/* ------------------------------------------------------------------ */
/* 16) Fáze 5 — Discord notifikace + důležitá oznámení (PRD §2.5)        */
/* Nová výprava (POST /api/expeditions → 201) posílá embed na Discord    */
/* fire-and-forget (fail-open — mrtvý Discord nikdy neshodí 201).        */
/* `POST /api/oznameni` je dual-guard (ADMIN nebo aktivní člen — stejný  */
/* `vyzadujSpravceVyprav` jako výpravy) pro „důležitá oznámení":         */
/* validuje `nazev` 3–120 a `text` 1–2000, pak pošle embed stejným       */
/* fail-open kanálem a vrátí 201 + `{ ok: true }`. Žádný secret           */
/* v kontraktu (webhook URL žije jen v serverovém env, nikdy v těle      */
/* požadavku ani odpovědi). Chyby vždy jen `ApiErrorResponse`.           */
/* Aditivní, nic se nepřejmenovává.                                      */
/* ------------------------------------------------------------------ */

/** Cesta důležitých oznámení (dual-guard, viz PRISTUP_OZNAMENI). */
export const OZNAMENI_PATH = "/api/oznameni" as const;

/**
 * Vstup důležitého oznámení.
 * `nazev` 3–120 znaků, `text` 1–2000 znaků (hranice trimuje).
 */
export interface VytvoritOznameniRequest {
  nazev: string;
  text: string;
}

/** Úspěch → 201. Samotný text už je na Discordu, server nic neukládá. */
export interface VytvoritOznameniResponse {
  ok: true;
}

/** Hranice oznámení: zápis jen dual-guard (ADMIN nebo aktivní člen). */
export const PRISTUP_OZNAMENI = {
  [OZNAMENI_PATH]: "ADMIN",
} as const;

/** Guard odpovědi oznámení (právě `{ ok: true }`, žádné secrety). */
export function jeVytvoritOznameniOdpoved(
  hodnota: unknown,
): hodnota is VytvoritOznameniResponse {
  if (typeof hodnota !== "object" || hodnota === null || Array.isArray(hodnota)) {
    return false;
  }
  const zaznam = hodnota as Record<string, unknown>;
  if (zaznam["ok"] !== true) return false;
  for (const klic of [
    "access_token",
    "refresh_token",
    "client_secret",
    "accessToken",
    "refreshToken",
    "clientSecret",
  ]) {
    if (klic in zaznam) return false;
  }
  return true;
}

/* ------------------------------------------------------------------ */
/* 17) Fáze 5, Krok 4 — Diskuze k výpravě (vlákno zpráv, PRD §2.5)      */
/* Jedna tabulka `zpravy` (drizzle/schema/zpravy.ts, migrace 0009):     */
/* id UUID, expedice_id TEXT → expeditions(id) CASCADE, autor_id UUID   */
/* → users(id) SET NULL (odchod uživatele vlákno nemaže), text 1–1000   */
/* (SQL CHECK), created_at, smazano_at NULL = viditelná (soft-delete).  */
/* Matice: GET vlákna = PUBLIC (čte i anonym — modal ukazuje diskuzi    */
/* každému); POST = USER (přihlášený, rate-limit 10/min/ip); DELETE      */
/* detailu = autor NEBO dual-guard (ADMIN nebo aktivní člen — stejný     */
/* `vyzadujSpravceVyprav` jako výpravy; cizí mazání → 403 ZAKAZANO).     */
/* Mazání je soft-delete (UPDATE smazano_at, nikdy hard DELETE —         */
/* klubová paměť zůstává, GET filtruje smazano_at IS NULL). Smazání      */
/* výpravy maže celé vlákno (CASCADE v DB).                              */
/* Paginace: ?limit (default 50, cap 100) & cursor (opaque id poslední   */
/* zprávy), řazeno created_at ASC (+ id ASC jako tie-break). Odpověď     */
/* nese `nextCursor` (id poslední zprávy, nebo null = konec).            */
/* XSS: server ukládá raw (trimnutý) text bez escapování — escapuje se   */
/* až při renderu v klientovi (`escapujHtml` v src/lib/diskuze-api.ts).  */
/* Chyby vždy jen `ApiErrorResponse`. Aditivní, nic se nepřejmenovává.   */
/* ------------------------------------------------------------------ */

/** Vlákno zpráv výpravy (GET = PUBLIC). */
export const EXPEDICE_ZPRAVY_VZOR = "/api/expeditions/:id/zpravy" as const;
/** Jedna zpráva vlákna (DELETE = autor nebo dual-guard). */
export const EXPEDICE_ZPRAVA_DETAIL_VZOR =
  "/api/expeditions/:id/zpravy/:zpravaId" as const;

/** Staví URL vlákna: `/api/expeditions/xxx/zpravy`. */
export function zpravyPath(id: string): `/api/expeditions/${string}/zpravy` {
  return `/api/expeditions/${id}/zpravy`;
}

/** Staví URL jedné zprávy: `/api/expeditions/xxx/zpravy/yyy`. */
export function zpravaDetailPath(
  id: string,
  zpravaId: string,
): `/api/expeditions/${string}/zpravy/${string}` {
  return `/api/expeditions/${id}/zpravy/${zpravaId}`;
}

/** Jedna zpráva vlákna — kopie řádku `zpravy` (text raw, bez escapování). */
export interface ApiZprava {
  id: string;
  expeditionId: string;
  /** Autor zprávy; null = účet mezitím smazán (SET NULL, vlákno zůstává). */
  autorId: string | null;
  /** Tělo zprávy raw (trimnuté, 1–1000 znaků) — escapuje až render. */
  text: string;
  createdAt: string;
}

/** Query vlákna (`limit` default 50 / cap 100, `cursor` = id poslední zprávy). */
export interface ZpravyListQuery {
  limit?: number;
  cursor?: string;
}

/** Staví URL vlákna s volitelnými query parametry (?limit&cursor). */
export function zpravyListUrl(id: string, query: ZpravyListQuery = {}): string {
  const params = new URLSearchParams();
  if (query.limit !== undefined) params.set("limit", String(query.limit));
  if (query.cursor !== undefined) params.set("cursor", query.cursor);
  const qs = params.toString();
  return qs.length > 0 ? `${zpravyPath(id)}?${qs}` : zpravyPath(id);
}

/** Seznam zpráv vlákna (PUBLIC — čte i anonym), řazeno created_at ASC. */
export interface ZpravyListResponse {
  zpravy: ApiZprava[];
  /** Id poslední zprávy stránky, nebo null = konec vlákna. */
  nextCursor: string | null;
}

/** Poslání zprávy (USER). `text` se na hranici trimuje (1–1000). */
export interface PosliZpravuRequest {
  text: string;
}

export interface PosliZpravuResponse {
  zprava: ApiZprava;
}

/** Smazání zprávy (autor nebo dual-guard, soft-delete). */
export interface SmazatZpravuResponse {
  ok: true;
}

/** Vzory cest diskuze pro matici oprávnění (odděleně jako Krok 2 / Krok 6). */
export type DiskuzeCesta =
  | typeof EXPEDICE_ZPRAVY_VZOR
  | typeof EXPEDICE_ZPRAVA_DETAIL_VZOR;

/** Hranice diskuze: čtení PUBLIC, zápis přihlášený (DELETE hlídá autora). */
export const PRISTUP_DISKUZE: Record<DiskuzeCesta, AuthRole | "PUBLIC"> = {
  [EXPEDICE_ZPRAVY_VZOR]: "PUBLIC",
  [EXPEDICE_ZPRAVA_DETAIL_VZOR]: "USER",
} as const;

export interface MaticeRadekDiskuze {
  metoda: ExpediceMetoda;
  cesta: string;
  kdo: AuthRole | "PUBLIC";
  uspech: string;
}

/**
 * Matice oprávnění diskuze (metoda + cesta → kdo smí).
 * GET = PUBLIC (čte i anonym); POST = USER (rate-limit 10/min/ip);
 * DELETE = autor NEBO dual-guard (ADMIN nebo aktivní člen — cizí → 403).
 */
export const MATICE_DISKUZE: readonly MaticeRadekDiskuze[] = [
  {
    metoda: "GET",
    cesta: EXPEDICE_ZPRAVY_VZOR,
    kdo: "PUBLIC",
    uspech: "200 + ZpravyListResponse (?limit default 50, cap 100 & cursor)",
  },
  {
    metoda: "POST",
    cesta: EXPEDICE_ZPRAVY_VZOR,
    kdo: "USER",
    uspech: "201 + PosliZpravuResponse (rate-limit 10/min/ip)",
  },
  {
    metoda: "DELETE",
    cesta: EXPEDICE_ZPRAVA_DETAIL_VZOR,
    kdo: "USER",
    uspech: "200 + SmazatZpravuResponse (autor nebo dual-guard, soft-delete)",
  },
] as const;

/** Guard jedné zprávy (text raw — escapuje až render v klientovi). */
export function jeApiZprava(hodnota: unknown): hodnota is ApiZprava {
  if (typeof hodnota !== "object" || hodnota === null || Array.isArray(hodnota)) {
    return false;
  }
  const zaznam = hodnota as Record<string, unknown>;
  if (typeof zaznam["id"] !== "string" || zaznam["id"].length === 0) {
    return false;
  }
  if (
    typeof zaznam["expeditionId"] !== "string" ||
    zaznam["expeditionId"].length === 0
  ) {
    return false;
  }
  const autorId: unknown = zaznam["autorId"];
  if (typeof autorId !== "string" && autorId !== null) return false;
  if (typeof zaznam["text"] !== "string") return false;
  if (typeof zaznam["createdAt"] !== "string") return false;
  return true;
}

/** Guard seznamu vlákna (prázdné vlákno je platné). */
export function jeZpravyOdpoved(
  hodnota: unknown,
): hodnota is ZpravyListResponse {
  if (typeof hodnota !== "object" || hodnota === null || Array.isArray(hodnota)) {
    return false;
  }
  const zaznam = hodnota as Record<string, unknown>;
  const zpravy: unknown = zaznam["zpravy"];
  if (!Array.isArray(zpravy)) return false;
  for (const polozka of zpravy) {
    if (!jeApiZprava(polozka)) return false;
  }
  const nextCursor: unknown = zaznam["nextCursor"];
  if (typeof nextCursor !== "string" && nextCursor !== null) return false;
  return true;
}

/** Guard odpovědi po odeslání zprávy. */
export function jePosliZpravuOdpoved(
  hodnota: unknown,
): hodnota is PosliZpravuResponse {
  if (typeof hodnota !== "object" || hodnota === null || Array.isArray(hodnota)) {
    return false;
  }
  const zaznam = hodnota as Record<string, unknown>;
  return jeApiZprava(zaznam["zprava"]);
}
