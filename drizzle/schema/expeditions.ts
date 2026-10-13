/**
 * drizzle/schema/expeditions.ts — Krok 3: read model výprav (server-only).
 *
 * Autoritativní Neon (větev krok4-migrace-seed): 7 řádků, TEXT slug id.
 * Tabulka se NEMAZE ani nemění — server z ní pouze čte (GET /api/expeditions).
 * Sloupce kopírují živé DB schéma (kapacita_celkem / kapacita_prihlaseno,
 * stav 'volno' | 'skoro plno' | 'proběhlá', datum DATE).
 */

import { date, integer, pgTable, real, text, timestamp } from "drizzle-orm/pg-core";

export const expeditions = pgTable("expeditions", {
  id: text("id").primaryKey(),
  nazev: text("nazev").notNull(),
  /** DATE → drizzle vrací string YYYY-MM-DD (připraveno pro API). */
  datum: date("datum").notNull(),
  /** Konec vícedenní výpravy (od–do); NULL = jednodenní. */
  datumDo: date("datum_do"),
  sraz: text("sraz").notNull(),
  popis: text("popis").notNull().default(""),
  /** Nepovinný odkaz na naplánovanou trasu (mapy.com) — "" = bez odkazu. */
  trasaOdkaz: text("trasa_odkaz").notNull().default(""),
  kapacitaCelkem: integer("kapacita_celkem").notNull(),
  kapacitaPrihlaseno: integer("kapacita_prihlaseno").notNull().default(0),
  stav: text("stav").notNull(),
  /** Ujeté/ušlé km ze spárované Strava aktivity (Fáze 4). NULL = nespárováno. */
  km: real("km"),
  /** Nastoupané metry ze spárované Strava aktivity. NULL = nespárováno. */
  prevyseniM: integer("prevyseni_m"),
  /** Strava aktivita spárovaná k výpravě (UNIQUE — jedna aktivita = jedna výprava). NULL = nespárováno. */
  stravaActivityId: text("strava_activity_id").unique(),
  /** Zakódovaná trasa (Strava polyline) pro heatmapu. NULL = bez trasy. */
  trasaPolyline: text("trasa_polyline"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type ExpeditionRow = typeof expeditions.$inferSelect;
export type NewExpeditionRow = typeof expeditions.$inferInsert;
