/**
 * server/src/vypravy.ts — read model výprav nad autoritativním Neonem.
 *
 * GET /api/expeditions čte živou tabulku `expeditions` (7 řádků),
 * nikdy mocky ani build-time snapshot. Nevalidní DB řádek se přeskočí
 * (stejný fail-safe jako scripts/sync-readmodel.ts) — prázdný snapshot
 * by znamenal ExpeditionEmpty, proto radši méně než pád.
 *
 * Krok 3b: write cesty (POST/PATCH/DELETE, účast, uzavření) sdílí
 * `vytvorSlugExpedice`, `toApiUcastnik` a počítání obsazenosti
 * (`spocitejUcastniky` + `synchronizujPocet`) — kapacita je vždy
 * `kapacita_celkem` vs COUNT řádků v `participants`.
 */

import { count, eq, inArray } from "drizzle-orm";
import type {
  ApiExpedice,
  ApiUcastnik,
  StatusUcasti,
  StavVypravy,
  UserId,
} from "../../src/shared/api-types";
import type { ExpeditionRow } from "../../drizzle/schema/expeditions";
import type { Participant } from "../../drizzle/schema/participants";
import { expeditions } from "../../drizzle/schema/expeditions";
import { participants } from "../../drizzle/schema/participants";
import { photos } from "../../drizzle/schema/photos";
import type { Db } from "./db";

const PLATNE_STAVY: readonly StavVypravy[] = ["volno", "skoro plno", "proběhlá"];

function jePlatnyStav(hodnota: string): hodnota is StavVypravy {
  return (PLATNE_STAVY as readonly string[]).includes(hodnota);
}

/** DB DATE (drizzle `date` → string YYYY-MM-DD, defensive i Date). */
function normalizujDatum(hodnota: string | Date): string | null {
  if (hodnota instanceof Date) {
    if (Number.isNaN(hodnota.getTime())) return null;
    return hodnota.toISOString().slice(0, 10);
  }
  const den = hodnota.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(den) ? den : null;
}

/**
 * DB řádek → veřejná `ApiExpedice`. Nevalidní řádek → null (volající skipne).
 * Vnitřní kód po této hranici typům věří.
 */
export function toApiExpedice(radek: ExpeditionRow): ApiExpedice | null {
  if (radek.id.length === 0 || radek.nazev.length === 0) return null;
  const datum = normalizujDatum(radek.datum);
  if (datum === null) return null;
  // datum_do je NULLable (jednodenní); nevalidní tvar → null (skip řádku).
  let datumDo: string | null = null;
  if (radek.datumDo !== null) {
    datumDo = normalizujDatum(radek.datumDo);
    if (datumDo === null) return null;
  }
  if (!jePlatnyStav(radek.stav)) return null;
  if (!Number.isInteger(radek.kapacitaPrihlaseno) || radek.kapacitaPrihlaseno < 0)
    return null;
  if (!Number.isInteger(radek.kapacitaCelkem) || radek.kapacitaCelkem < 0)
    return null;
  return {
    id: radek.id,
    nazev: radek.nazev,
    datum,
    datumDo,
    sraz: radek.sraz,
    popis: radek.popis,
    trasaOdkaz: typeof radek.trasaOdkaz === "string" ? radek.trasaOdkaz : "",
    kapacita: {
      prihlaseno: radek.kapacitaPrihlaseno,
      celkem: radek.kapacitaCelkem,
    },
    stav: radek.stav,
  };
}

/* ------------------------------------------------------------------ */
/* Krok 3b — slug, účastníci, obsazenost.                              */
/* ------------------------------------------------------------------ */

const PLATNE_STATUSY_UCASTI: readonly StatusUcasti[] = [
  "prihlasen",
  "ucastnil_se",
  "omluven",
];

function jePlatnyStatusUcasti(hodnota: string): hodnota is StatusUcasti {
  return (PLATNE_STATUSY_UCASTI as readonly string[]).includes(hodnota);
}

const DIAKRITIKA = /[\u0300-\u036f]/g;

/**
 * Slug nového ID výpravy: `nazev` bez diakritiky + krátká náhodná přípona
 * (kolize řeší volající retry na 23505). Prázdný základ → "vyprava".
 */
export function vytvorSlugExpedice(nazev: string, pripona: string): string {
  const zaklad = nazev
    .normalize("NFD")
    .replace(DIAKRITIKA, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-")
    .slice(0, 60)
    .replace(/^-+|-+$/g, "");
  const cistaPripona = pripona
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 8);
  const bezpecnyZaklad = zaklad.length > 0 ? zaklad : "vyprava";
  const bezpecnaPripona = cistaPripona.length > 0 ? cistaPripona : "x";
  return `${bezpecnyZaklad}-${bezpecnaPripona}`;
}

/**
 * DB řádek → veřejný `ApiUcastnik`. Nevalidní řádek → null (volající
 * skipne, stejně jako u výprav). `jmeno` je denormalizované — volající
 * ho doplní z `users` (vlastní účet), resp. z `clenove` (můstek).
 */
export function toApiUcastnik(
  radek: Participant,
  jmeno: string,
): ApiUcastnik | null {
  if (radek.id.length === 0 || radek.expeditionId.length === 0) return null;
  if (jmeno.trim().length === 0) return null;
  if (!jePlatnyStatusUcasti(radek.status)) return null;
  if (radek.userId === null && radek.clenId === null) return null;
  if (radek.userId !== null && radek.clenId !== null) return null;
  return {
    id: radek.id,
    expeditionId: radek.expeditionId,
    userId: radek.userId as UserId | null,
    clenId: radek.clenId,
    jmeno,
    status: radek.status,
    createdAt: radek.createdAt.toISOString(),
  };
}

/** Počet přihlášek výpravy (všechny statusy — obsazenost kapacity). */
export async function spocitejUcastniky(
  db: Db,
  expeditionId: string,
): Promise<number> {
  const vysledek = await db
    .select({ pocet: count() })
    .from(participants)
    .where(eq(participants.expeditionId, expeditionId));
  return vysledek[0]?.pocet ?? 0;
}

/**
 * Srovná cache `expeditions.kapacita_prihlaseno` se skutečným COUNTem.
 * Cache čte build-time snapshot script; živé endpointy (list i detail)
 * počítají COUNT čerstvě. Vrací čerstvý počet.
 */
export async function synchronizujPocet(
  db: Db,
  expeditionId: string,
): Promise<number> {
  const pocet = await spocitejUcastniky(db, expeditionId);
  await db
    .update(expeditions)
    .set({ kapacitaPrihlaseno: pocet })
    .where(eq(expeditions.id, expeditionId));
  return pocet;
}

/** One photo row used to pick a card cover. Oldest `createdAt` first when unflagged. */
export interface NahledKandidat {
  id: string;
  expeditionId: string;
  jeNahled: boolean;
  createdAt: Date;
}

/**
 * One cover id per expedition. A flagged row wins; otherwise the oldest
 * photo (tie-break: id). Empty input → empty map.
 */
export function sestavMapuNahledu(
  radky: readonly NahledKandidat[],
): ReadonlyMap<string, string> {
  const nejlepsi = new Map<string, NahledKandidat>();
  for (const radek of radky) {
    const stavajici = nejlepsi.get(radek.expeditionId);
    if (stavajici === undefined || jeLepsiNahled(radek, stavajici)) {
      nejlepsi.set(radek.expeditionId, radek);
    }
  }
  const mapa = new Map<string, string>();
  for (const [expeditionId, radek] of nejlepsi) {
    mapa.set(expeditionId, radek.id);
  }
  return mapa;
}

function jeLepsiNahled(kandidat: NahledKandidat, stavajici: NahledKandidat): boolean {
  if (kandidat.jeNahled !== stavajici.jeNahled) return kandidat.jeNahled;
  const rozdilCasu = kandidat.createdAt.getTime() - stavajici.createdAt.getTime();
  if (rozdilCasu !== 0) return rozdilCasu < 0;
  return kandidat.id < stavajici.id;
}

/**
 * Cover ids for the expedition list in one query (not one query per card).
 * Omit `expeditionIds` to scan every photo row's id columns only.
 */
export async function nactiMapuNahledu(
  db: Db,
  expeditionIds?: readonly string[],
): Promise<ReadonlyMap<string, string>> {
  if (expeditionIds !== undefined && expeditionIds.length === 0) {
    return new Map();
  }
  const sloupce = {
    id: photos.id,
    expeditionId: photos.expeditionId,
    jeNahled: photos.jeNahled,
    createdAt: photos.createdAt,
  };
  const radky =
    expeditionIds === undefined
      ? await db.select(sloupce).from(photos)
      : await db
          .select(sloupce)
          .from(photos)
          .where(inArray(photos.expeditionId, [...expeditionIds]));
  return sestavMapuNahledu(radky);
}

/** Attaches `nahledFotkaId` (`null` when the expedition has no photo). */
export function sNahledFotkaId(
  expedice: ApiExpedice,
  mapa: ReadonlyMap<string, string>,
): ApiExpedice {
  return { ...expedice, nahledFotkaId: mapa.get(expedice.id) ?? null };
}
