import type { AuthRole, UserId } from "./spolecne";
import type { ApiExpedice, ExpediceMetoda, StatusUcasti } from "./expedice";

/**
 * Strava, personal stats, and leaderboard contracts.
 */



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
  const stravaActivityId: unknown = zaznam["stravaActivityId"];
  if (
    typeof stravaActivityId !== "string" &&
    stravaActivityId !== null &&
    stravaActivityId !== undefined
  ) {
    return false;
  }
  if (!jeVolitelneNahledFotkaId(zaznam["nahledFotkaId"])) return false;
  const organizatorId: unknown = zaznam["organizatorId"];
  if (
    organizatorId !== undefined &&
    organizatorId !== null &&
    typeof organizatorId !== "string"
  ) {
    return false;
  }
  return true;
}

/** `nahledFotkaId` smí chybět, být null, nebo neprázdný string. */
export function jeVolitelneNahledFotkaId(
  hodnota: unknown,
): hodnota is string | null | undefined {
  if (hodnota === undefined || hodnota === null) return true;
  return typeof hodnota === "string" && hodnota.length > 0;
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
/* 15c) Krok 5 Fáze 4 — Žebříček účast > km (aditivní, jen přihlášený).  */
/* GET /api/zebricky?obdobi=celkem|YYYY — USER (bez session → 401).      */
/* Řazení `vypravy DESC, km DESC`, tie-break `jmeno ASC`                  */
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

/** Trasy uskutečněných výprav pro heatmapu na žebříčku (USER). */
export const ZEBRICKY_TRASY_PATH = "/api/zebricky/trasy" as const;

export interface ZebrickyTrasa {
  id: string;
  nazev: string;
  /** YYYY-MM-DD */
  datum: string;
  km: number | null;
  trasaPolyline: string | null;
}

export interface ZebrickyTrasyResponse {
  obdobi: string;
  trasy: ZebrickyTrasa[];
}

export function jeZebrickyTrasyOdpoved(hodnota: unknown): hodnota is ZebrickyTrasyResponse {
  if (typeof hodnota !== "object" || hodnota === null || Array.isArray(hodnota)) {
    return false;
  }
  const zaznam = hodnota as Record<string, unknown>;
  if (typeof zaznam["obdobi"] !== "string") return false;
  if (!Array.isArray(zaznam["trasy"])) return false;
  return zaznam["trasy"].every((polozka) => {
    if (typeof polozka !== "object" || polozka === null || Array.isArray(polozka)) {
      return false;
    }
    const trasa = polozka as Record<string, unknown>;
    if (typeof trasa["id"] !== "string" || trasa["id"].length === 0) return false;
    if (typeof trasa["nazev"] !== "string") return false;
    if (typeof trasa["datum"] !== "string") return false;
    if (typeof trasa["km"] !== "number" && trasa["km"] !== null) return false;
    return typeof trasa["trasaPolyline"] === "string" || trasa["trasaPolyline"] === null;
  });
}

/** Staví URL žebříčku: `/api/zebricky` nebo `/api/zebricky?obdobi=2026`. */
export function zebrickyListUrl(query: ZebrickyQuery): string {
  const params = new URLSearchParams();
  if (query.obdobi !== undefined) params.set("obdobi", query.obdobi);
  const qs = params.toString();
  return qs.length > 0 ? `${ZEBRICKY_PATH}?${qs}` : ZEBRICKY_PATH;
}

/** Hranice plural žebříčku: čtení jen přihlášený. */
export const PRISTUP_ZEBRICKY = {
  [ZEBRICKY_PATH]: "USER",
  [ZEBRICKY_TRASY_PATH]: "USER",
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
/* - `GET /api/strava/auth-url` (USER, state v httpOnly cookie) → `{ url }` */
/*   (CLIENT_ID, scope `read,activity:read`, approval_prompt=force).       */
/* - Callback redirecty nesou `?strava=propojeno` nebo                    */
/*   `?strava=chyba&duvod=<allowlist>` (české hlášky níže).               */
/* - Žádné secrety v URL / logu / bundlu (jen číselné client_id).         */
/* ------------------------------------------------------------------ */

/** Authorize URL (USER). Server vydá `state` a httpOnly cookie. */
export const STRAVA_AUTH_URL_PATH = "/api/strava/auth-url" as const;

/** Odpojení Stravy (USER, idempotentní `{ ok: true }`). */
export const STRAVA_ODPOJIT_PATH = "/api/strava/odpojit" as const;

/** Stav propojení (USER) — veřejný stav bez secretů (Step 5, tenký slice). */
export const STRAVA_STAV_PATH = "/api/strava/stav" as const;

/** Alias `GET /api/strava/connect` → stejné jako auth-url (Step 5). */
export const STRAVA_CONNECT_PATH = "/api/strava/connect" as const;

/** Alias `DELETE /api/strava/disconnect` → stejné jako odpojit (Step 5). */
export const STRAVA_DISCONNECT_PATH = "/api/strava/disconnect" as const;

/** Odpověď `GET /api/strava/auth-url` — jen veřejné URL. */
export interface StravaAuthUrlResponse {
  url: string;
}

/**
 * Veřejný stav propojení pro tab Strava (Step 5, tenký slice).
 * Žádné secrety — jen `stravaId` (atlet), `scope` a `expirace` (ISO).
 * `scope`/`expirace` null = nepropojeno (nebo bez řádku tokenů).
 */
export interface StravaStavResponse {
  propojeno: boolean;
  stravaId: string | null;
  scope: string | null;
  expirace: string | null;
}

/** Guard `StravaStavResponse` — odmítne secrety v odpovědi. */
export function jeStravaStavResponse(hodnota: unknown): hodnota is StravaStavResponse {
  if (typeof hodnota !== "object" || hodnota === null) return false;
  const zaznam = hodnota as Record<string, unknown>;
  if (typeof zaznam["propojeno"] !== "boolean") return false;
  const stravaId: unknown = zaznam["stravaId"];
  if (typeof stravaId !== "string" && stravaId !== null) return false;
  const scope: unknown = zaznam["scope"];
  if (typeof scope !== "string" && scope !== null) return false;
  const expirace: unknown = zaznam["expirace"];
  if (typeof expirace !== "string" && expirace !== null) return false;
  if ("access_token" in zaznam || "refresh_token" in zaznam) return false;
  if ("accessToken" in zaznam || "refreshToken" in zaznam) return false;
  return true;
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
