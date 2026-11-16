/**
 * Expedition, attendance, and photo contracts.
 */

import type { Clenstvi, Funkce, Role } from "../../config/roles";
import type { AuthRole, UserId, ApiErrorCode } from "./spolecne";
import { CLEN_DETAIL_VZOR, CLENOVE_PATH, ME_PATH, LOGIN_PATH, REGISTER_PATH, ADMIN_CODES_PATH } from "./ucty";
import { jeAuthAdmin } from "./spolecne";




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
    /**
     * Strava id připojené aktivity (Krok 16 fix, aditivně optional).
     * Kopie `expeditions.strava_activity_id` z detailu
     * (`GET /api/expeditions/:id/ucastnici` → `expedice`).
     * string = připojeno přes Stravu, null/undefined = bez Strava id
     * (ruční zápis nese jen `km`, nespárováno nese nic).
     */
    stravaActivityId?: string | null;
    /**
     * Id náhledové fotky pro obálku karty a hlavičku detailu.
     * Aditivní: string = fotka (`je_nahled`, jinak nejstarší), null = výprava
     * fotku nemá. Chybí-li pole (starší snapshot), klient si náhled smí
     * dohledat sám a nesmí na to čekat celá stránka.
     */
    nahledFotkaId?: string | null;
    /**
     * Uživatel, který výpravu vytvořil (organizátor).
     * string = userId organizátora, null = neevidováno (staré řádky).
     */
    organizatorId?: string | null;
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

/** Běžné barvy pro výběr oblíbené barvy. Prázdný řetězec = nevyplněno. */
export const OBLIBENE_BARVY = [
  { nazev: "červená", hex: "#c1121f" },
  { nazev: "oranžová", hex: "#e85d04" },
  { nazev: "žlutá", hex: "#e6b325" },
  { nazev: "zelená", hex: "#2d6a4f" },
  { nazev: "modrá", hex: "#1d4e89" },
  { nazev: "fialová", hex: "#6a4c93" },
  { nazev: "růžová", hex: "#e56b8a" },
  { nazev: "hnědá", hex: "#7a4e2d" },
  { nazev: "černá", hex: "#1a1a1a" },
  { nazev: "bílá", hex: "#fbf8f1" },
  { nazev: "šedá", hex: "#8d8d8d" },
] as const;

export type OblibenaBarva = (typeof OBLIBENE_BARVY)[number]["nazev"];

export function jeOblibenaBarva(hodnota: string): hodnota is OblibenaBarva {
  return OBLIBENE_BARVY.some((barva) => barva.nazev === hodnota);
}

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
  avatarUrlMaxDelka: 2048,
  bioMaxDelka: 500,
  zpravaTextMinDelka: 1,
  zpravaTextMaxDelka: 1000,
  zpravyLimitDefault: 50,
  zpravyLimitMax: 100,
  /** Největší jedna příloha zprávy (10 MiB). */
  prilohaMaxBajtu: 10 * 1024 * 1024,
  /** Nejvíc příloh na jednu zprávu. */
  prilohyMaxPocet: 5,
  /** Povolené přípony přílohy, bez tečky, malá písmena. */
  prilohaPovolenePripony: [
    "pdf",
    "png",
    "jpg",
    "jpeg",
    "webp",
    "gif",
    "txt",
    "csv",
    "gpx",
    "zip",
    "doc",
    "docx",
    "xls",
    "xlsx",
    "ppt",
    "pptx",
    "odt",
    "ods",
    "heic",
  ],
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
  dochazkaNeuplna: "Docházka musí obsahovat každého přihlášeného právě jednou.",
  ucastnikIdentitaChybi: "Vyber člena — zadej userId, nebo clenId.",
  ucastnikIdentitaOboji: "Zadej právě jednu identitu — userId, nebo clenId, ne obojí.",
  ucastnikStatusNeplatny: "Status musí být „ucastnil_se“, nebo „omluven“.",
  skolaDlouha: "Škola může mít nejvýš 120 znaků.",
  tridaDlouha: "Třída může mít nejvýš 120 znaků.",
  avatarUrlNeplatny: "Avatar musí být veřejný odkaz (https://).",
  avatarUrlDlouhy: "Odkaz na avatar je moc dlouhý (nejvýš 2048 znaků).",
  bioDlouhe: "Představení může mít nejvýš 500 znaků.",
  oblibenaBarvaNeplatna: "Vyber barvu ze seznamu.",
  narozeninyNeplatne: "Datum narození musí být ve tvaru RRRR-MM-DD.",
  narozeninyMimoRozsah: "Datum narození musí být mezi rokem 1900 a dneškem.",
  schuzkaNazevPovinny: "Zadej název schůzky.",
  schuzkaNazevKratky: "Název schůzky musí mít aspoň 3 znaky.",
  schuzkaNazevDlouhy: "Název schůzky může mít nejvýš 120 znaků.",
  schuzkaDatumPovinne: "Zadej datum schůzky.",
  schuzkaDatumNeplatne: "Datum musí být ve tvaru RRRR-MM-DD.",
  schuzkaCasNeplatny: "Čas musí být ve tvaru HH.MM.",
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
  STRAVA_NEDOSTUPNA: 502,
  STRAVA_NENI_NASTAVENA: 503,
  FOTKY_NEJSOU_NASTAVENE: 503,
  MOC_POZADAVKU: 429,
  PISEN_UZ_JE: 409,
  PUSH_NENI_NASTAVENY: 503,
  VNITRNI_CHYBA: 500,
} as const;

/**
 * Česká zpráva pro 503 STRAVA_NENI_NASTAVENA (Krok 7b, aditivně).
 * Jediný zdroj pravdy — server i klient ji sdílí, aby UI radilo stejně.
 * Neobsahuje žádný secret, jen názvy env proměnných.
 */
export const STRAVA_NENI_NASTAVENA_ZPRAVA =
  "Strava propojení není na serveru nastavené (chybí číselné STRAVA_CLIENT_ID). Zkontroluj STRAVA_CLIENT_ID v server env a pro reálný flow vypni MOCK." as const;

/**
 * Česká zpráva pro 502 STRAVA_NEDOSTUPNA (aditivně).
 * Jediný zdroj pravdy — server ji posílá v `ApiErrorResponse`,
 * klient podle `code` ukáže opakování. Bez secretů a bez detailů Stravy.
 */
export const STRAVA_NEDOSTUPNA_ZPRAVA =
  "Strava je teď nedostupná. Zkus to prosím později." as const;

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
  /**
   * Avatar přihlášeného účtu (`users.avatar_url`). null = bez fotky
   * nebo účastník bez účtu (jen `clenId`).
   */
  avatarUrl?: string | null;
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

/** One journey screenshot. `url` is an app path, not the storage address. */
export interface ApiCestaSnimek {
  id: string;
  url: string;
  /** Pixel size of the stored file. Absent on older responses and older rows. */
  sirka?: number;
  vyska?: number;
}

/** Detail výpravy pro modal (PUBLIC — čte i nepřihlášený). */
export interface ExpediceDetailResponse {
  expedice: ApiExpedice;
  /** Screenshots of the trip there. Empty when nobody uploaded any. */
  cestaTam: ApiCestaSnimek[];
  /** Screenshots of the trip back. */
  cestaZpet: ApiCestaSnimek[];
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
 * Chybějící nebo duplicitní přihláška → 422 (`dochazka: [dochazkaNeuplna]`).
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
  if (pozadavek === "ADMIN") return jeAuthAdmin(authRole);
  return authRole === "SUPERADMIN";
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
  /** One highlight per expedition. False until someone picks it. */
  jeNahled: boolean;
  /** Pixel size of the stored file. Absent on older responses and older rows. */
  sirka?: number;
  vyska?: number;
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

/** Streams the stored object through the app. A foreign URL is not redirected. */
export function fotkaSouborPath(
  id: string,
  fotkaId: string,
): `/api/expeditions/${string}/fotky/${string}/soubor` {
  return `/api/expeditions/${id}/fotky/${fotkaId}/soubor`;
}

/** Logged-in member sets the highlight on a finished expedition. */
export function fotkaNahledPath(
  id: string,
  fotkaId: string,
): `/api/expeditions/${string}/fotky/${string}/nahled` {
  return `/api/expeditions/${id}/fotky/${fotkaId}/nahled`;
}

/** Highlight update. `fotky` is the expedition list, oldest first. */
export interface NastavitNahledResponse {
  fotkaId: string;
  fotky: ApiFotka[];
}

/** Vzory cest Kroku 6 pro matici oprávnění (odděleně jako Krok 2). */
export type Krok6Cesta =
  | typeof EXPEDICE_FOTKY_VZOR
  | typeof EXPEDICE_FOTKA_DETAIL_VZOR;

/** Hranice Kroku 6: čtení i zápis přihlášený, mazání ADMIN. */
export const PRISTUP_KROK6: Record<Krok6Cesta, AuthRole | "PUBLIC"> = {
  [EXPEDICE_FOTKY_VZOR]: "USER",
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
