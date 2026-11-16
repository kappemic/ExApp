import type { ExpediceMetoda, Strankovani } from "./expedice";
import type { AuthRole } from "./spolecne";
import type { SkolyTridyResponse } from "./uzivatele";


/**
 * Meeting contracts.
 */



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
  /** HH:MM. null or omitted = the meeting stays visible the whole day. */
  cas?: string | null;
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
  /** Nepovinný čas HH:MM. null nebo "" = bez času. */
  cas?: string | null;
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
  cas?: string | null;
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
