/**
 * Tenká read vrstva pro výpravy (Krok 4 – klient s BFF fallbackem).
 *
 * Kontrakt (contract-first, viz skill api-and-interface-design):
 * - `getExpeditionsSync()` – synchronní čtení pro stávající UI (VypravyPage).
 *   Čte POUZE build-time snapshot, nikdy fetch.
 * - `getExpeditions()` – asynchronní varianta se STEJNÝM návratovým typem:
 *   nejdřív zkusí živý BFF (`VITE_API_BASE_URL` + `/api/expeditions`,
 *   veřejné, žádný secret), při jakémkoliv selhání padá zpět na
 *   `getExpeditionsSync()` (one-version rule – konzumenti se nemění).
 * - Nikdy nevyhazuje: při chybě vrací fallback + `errorCode` (konzistentní
 *   chybová sémantika). Žádný write, žádný secret v klientovi
 *   (do bundlu smí jen `VITE_*`, nikdy `DATABASE_URL`).
 *
 * Fallback pravidlo:
 * 1. Živý BFF dle kontraktu `src/shared/api-types.ts` (`ExpediceListResponse`).
 *    Odpověď je nedůvěryhodný vstup → validuj na hranici (type-guardy).
 * 2. Backend mimo / chyba / nevalidní tvar → `getExpeditionsSync()`.
 * 3. Sync vrstva: build-time snapshot `src/data/expeditions.generated.json`
 *    (server-only script `scripts/sync-readmodel.ts`), jinak mocky.
 *
 * Mapování UI stavů (vzhled se nemění, komponenty už existují):
 * - loading  → `ExpeditionSkeleton`
 * - DB down (fallback s `errorCode`) → normální list + `source` k dispozici
 *   pro budoucí badge (zatím se badge nezobrazuje)
 * - prázdno (`data.length === 0`) → `ExpeditionEmpty`
 */

import generatedSnapshot from "../data/expeditions.generated.json";
import { expediceListUrl, jeVolitelneNahledFotkaId } from "../shared/api-types";
import type { ExpediceListQuery, Strankovani } from "../shared/api-types";
import type { Expedition } from "./mock-expeditions";
import { mockExpeditions } from "./mock-expeditions";

/** Odkud data skutečně pocházejí. Rozšiřitelné přidáním hodnoty, nikdy přejmenováním. */
export type ExpeditionSource = "db" | "db-snapshot" | "mock-fallback";

/**
 * Strojově čitelný důvod fallbacku. `undefined` = živá data byla platná.
 * `BACKEND_*` = BFF selhal a vrátil se sync snapshot / mocky.
 */
export type ExpeditionsErrorCode =
  | "SNAPSHOT_NEVALIDNI"
  | "SNAPSHOT_PRAZDNY"
  | "BACKEND_NEDOSTUPNY"
  | "BACKEND_CHYBA";

/** Jediný návratový tvar read vrstvy. Neměnit tvar – jen přidávat volitelná pole. */
export interface ExpeditionsResult {
  data: Expedition[];
  source: ExpeditionSource;
  /** ISO čas generování snapshotu, `null` u mock fallbacku bez metadat. */
  generatedAt: string | null;
  /** Nastaveno pouze při fallbacku na mocky. */
  errorCode?: ExpeditionsErrorCode;
  /** Stránkování ze serveru (`GET /api/expeditions?page&pageSize`). Bez query chybí. */
  pagination?: Strankovani;
}

/** Stav pro budoucí async UI (Krok 6+). Dnes ho konzumuje jen `useExpeditions`. */
export type ExpeditionsUiStav = "loading" | "ready" | "prazdno" | "nedostupny";

const PLATNE_STAVY: readonly string[] = ["volno", "skoro plno", "proběhlá"];
const ISO_DATUM = /^\d{4}-\d{2}-\d{2}$/;

function jeRecord(hodnota: unknown): hodnota is Record<string, unknown> {
  return typeof hodnota === "object" && hodnota !== null && !Array.isArray(hodnota);
}

function jeExpedice(hodnota: unknown): hodnota is Expedition {
  if (!jeRecord(hodnota)) return false;
  if (typeof hodnota["id"] !== "string" || hodnota["id"].length === 0) return false;
  if (typeof hodnota["nazev"] !== "string" || hodnota["nazev"].length === 0) return false;
  if (typeof hodnota["datum"] !== "string" || !ISO_DATUM.test(hodnota["datum"])) return false;
  // Starší snapshot bez datumDo projde — normalizuje se na null.
  const datumDo = hodnota["datumDo"];
  if (
    datumDo !== undefined &&
    datumDo !== null &&
    (typeof datumDo !== "string" || !ISO_DATUM.test(datumDo))
  )
    return false;
  if (typeof hodnota["sraz"] !== "string") return false;
  if (typeof hodnota["popis"] !== "string") return false;
  // Starší snapshot bez trasaOdkaz projde — normalizuje se na "".
  if (
    hodnota["trasaOdkaz"] !== undefined &&
    typeof hodnota["trasaOdkaz"] !== "string"
  )
    return false;
  if (typeof hodnota["stav"] !== "string" || !PLATNE_STAVY.includes(hodnota["stav"])) return false;
  const kapacita = hodnota["kapacita"];
  if (!jeRecord(kapacita)) return false;
  if (typeof kapacita["prihlaseno"] !== "number" || !Number.isInteger(kapacita["prihlaseno"])) return false;
  if (typeof kapacita["celkem"] !== "number" || !Number.isInteger(kapacita["celkem"])) return false;
  if ((kapacita["prihlaseno"] as number) < 0 || (kapacita["celkem"] as number) < 0) return false;
  if (!jeVolitelneNahledFotkaId(hodnota["nahledFotkaId"])) return false;
  return true;
}

function normalizujExpedici(hodnota: Expedition): Expedition {
  return {
    ...hodnota,
    trasaOdkaz: hodnota.trasaOdkaz ?? "",
    datumDo: hodnota.datumDo ?? null,
  };
}

interface ParsedSnapshot {
  expedice: Expedition[];
  generatedAt: string | null;
  zdroj: string | null;
}

function parseSnapshot(neznamySnapshot: unknown): ParsedSnapshot | null {
  if (!jeRecord(neznamySnapshot)) return null;
  const expediceRaw = neznamySnapshot["expedice"];
  if (!Array.isArray(expediceRaw)) return null;
  const expedice: Expedition[] = [];
  for (const polozka of expediceRaw) {
    if (!jeExpedice(polozka)) return null;
    expedice.push(normalizujExpedici(polozka));
  }
  const meta = neznamySnapshot["_meta"];
  let generatedAt: string | null = null;
  let zdroj: string | null = null;
  if (jeRecord(meta)) {
    if (typeof meta["generatedAt"] === "string") generatedAt = meta["generatedAt"];
    if (typeof meta["zdroj"] === "string") zdroj = meta["zdroj"];
  }
  return { expedice, generatedAt, zdroj };
}

/**
 * Základ BFF z veřejného `VITE_API_BASE_URL` (nikdy secret).
 * Prázdný řetězec = statický režim bez backendu → rovnou sync fallback.
 */
function apiBase(): string {
  const raw: unknown = import.meta.env.VITE_API_BASE_URL;
  if (typeof raw !== "string") return "";
  return raw.trim().replace(/\/+$/, "");
}

function jeCeleKladne(
  hodnota: unknown,
  max?: number,
): boolean {
  if (typeof hodnota !== "number" || !Number.isInteger(hodnota)) return false;
  if (hodnota < 1) return false;
  if (max !== undefined && hodnota > max) return false;
  return true;
}

/** Guard kontraktu `Strankovani` (server: page ≥ 1, pageSize 1–100). */
function jeStrankovani(hodnota: unknown): hodnota is Strankovani {
  if (!jeRecord(hodnota)) return false;
  if (!jeCeleKladne(hodnota["page"])) return false;
  if (!jeCeleKladne(hodnota["pageSize"], 100)) return false;
  const totalItems = hodnota["totalItems"];
  if (
    typeof totalItems !== "number" ||
    !Number.isInteger(totalItems) ||
    totalItems < 0
  )
    return false;
  if (!jeCeleKladne(hodnota["totalPages"])) return false;
  return true;
}

/** Validace živé odpovědi BFF (`ExpediceListResponse`) na hranici. */
function parseExpediceList(telo: unknown): Expedition[] | null {
  if (!jeRecord(telo)) return null;
  const raw = telo["expedice"];
  if (!Array.isArray(raw)) return null;
  const vysledek: Expedition[] = [];
  for (const polozka of raw) {
    if (!jeExpedice(polozka)) return null;
    vysledek.push(polozka);
  }
  return vysledek;
}

/**
 * Volitelné `pagination` z BFF (`ExpediceListResponse.pagination`).
 * Chybí = seznam bez stránkování (platné). Nevalidní tvar = celá odpověď
 * neplatná (stejně jako nevalidní expedice) → fallback.
 */
function parsePagination(telo: unknown): Strankovani | undefined | null {
  if (!jeRecord(telo)) return null;
  const pagination = telo["pagination"];
  if (pagination === undefined) return undefined;
  if (!jeStrankovani(pagination)) return null;
  return pagination;
}

function fallback(
  errorCode: ExpeditionsErrorCode,
): ExpeditionsResult {
  return {
    data: mockExpeditions.map(normalizujExpedici),
    source: "mock-fallback",
    generatedAt: null,
    errorCode,
  };
}

/**
 * Fallback na sync vrstvu při selhání BFF. Nese-li už sync výsledek
 * vlastní `errorCode` (nevalidní snapshot), necháváme ho – je přesnější.
 */
function fallbackNaSync(
  kod: "BACKEND_NEDOSTUPNY" | "BACKEND_CHYBA",
): ExpeditionsResult {
  const sync = getExpeditionsSync();
  if (sync.errorCode !== undefined) return sync;
  return { ...sync, errorCode: kod };
}

/**
 * Synchronní read pro stávající UI. Vrací snapshot, jinak mock fallback.
 * UI vzhled nemění – stejných 7 položek jako dosud, když je snapshot čerstvý.
 */
export function getExpeditionsSync(): ExpeditionsResult {
  const parsed = parseSnapshot(generatedSnapshot);
  if (parsed === null) {
    return fallback("SNAPSHOT_NEVALIDNI");
  }
  if (parsed.expedice.length === 0) {
    return fallback("SNAPSHOT_PRAZDNY");
  }
  const jeDbSnapshot = parsed.zdroj === "db-snapshot";
  return {
    data: parsed.expedice,
    source: jeDbSnapshot ? "db-snapshot" : "mock-fallback",
    generatedAt: parsed.generatedAt,
    ...(jeDbSnapshot ? {} : { errorCode: "SNAPSHOT_NEVALIDNI" as const }),
  };
}

/**
 * Asynchronní varianta kontraktu: nejdřív živý BFF
 * (`GET {VITE_API_BASE_URL}/api/expeditions`, veřejné, bez secretu),
 * při jakémkoliv selhání padá zpět na `getExpeditionsSync()`.
 * Nikdy nevyhazuje. Prázdná DB vrátí prázdné pole se `source: "db"`
 * (UI pak ukáže `ExpeditionEmpty` – zdrojem pravdy je server).
 * Volitelný `query` staví `?stav&page&pageSize` dle kontraktu
 * (`expediceListUrl`); bez něj chování beze změny. `pagination` z
 * odpovědi se předává dál, jinak chybí (aditivní).
 */
export async function getExpeditions(
  query?: ExpediceListQuery,
): Promise<ExpeditionsResult> {
  const zaklad = apiBase();
  if (zaklad.length === 0) {
    return getExpeditionsSync();
  }
  let odpoved: Response;
  try {
    odpoved = await fetch(`${zaklad}${expediceListUrl(query ?? {})}`, {
      headers: { Accept: "application/json" },
    });
  } catch {
    return fallbackNaSync("BACKEND_NEDOSTUPNY");
  }
  if (!odpoved.ok) {
    return fallbackNaSync("BACKEND_CHYBA");
  }
  let telo: unknown = null;
  try {
    telo = await odpoved.json();
  } catch {
    return fallbackNaSync("BACKEND_CHYBA");
  }
  const expedice = parseExpediceList(telo);
  if (expedice === null) {
    return fallbackNaSync("BACKEND_CHYBA");
  }
  const pagination = parsePagination(telo);
  if (pagination === null) {
    return fallbackNaSync("BACKEND_CHYBA");
  }
  return {
    data: expedice.map(normalizujExpedici),
    source: "db",
    generatedAt: new Date().toISOString(),
    ...(pagination === undefined ? {} : { pagination }),
  };
}

/** Odvození UI stavu z výsledku – jediná pravda pro loading / DB down / prázdno. */
export function toUiStav(
  faze: "loading" | "hotovo",
  vysledek: ExpeditionsResult | null,
): ExpeditionsUiStav {
  if (faze === "loading" || vysledek === null) return "loading";
  if (vysledek.data.length === 0) return "prazdno";
  // Fallback sice zobrazí mocky (nedostupnost DB), ale list zůstává plný,
  // takže "nedostupny" znamená jen: prázdno + zároveň chyba snapshotu.
  // Dnes snapshot nikdy není prázdný bez fallback dat, větev je pro úplnost.
  if (vysledek.source === "mock-fallback" && vysledek.errorCode !== undefined && vysledek.data.length === 0) {
    return "nedostupny";
  }
  return "ready";
}
