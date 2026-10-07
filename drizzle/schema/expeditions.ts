/**
 * drizzle/schema/expeditions.ts — Krok 3: read model výprav (server-only).
 *
 * Autoritativní Neon (větev krok4-migrace-seed): 7 řádků, TEXT slug id.
 * Tabulka se NEMAZE ani nemění — server z ní pouze čte (GET /api/expeditions).
 * Sloupce kopírují živé DB schéma (kapacita_celkem / kapacita_prihlaseno,
 * stav 'volno' | 'skoro plno' | 'proběhlá', datum DATE).
 */

import { date, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const expeditions = pgTable("expeditions", {
  id: text("id").primaryKey(),
  nazev: text("nazev").notNull(),
  /** DATE → drizzle vrací string YYYY-MM-DD (připraveno pro API). */
  datum: date("datum").notNull(),
  sraz: text("sraz").notNull(),
  popis: text("popis").notNull().default(""),
  kapacitaCelkem: integer("kapacita_celkem").notNull(),
  kapacitaPrihlaseno: integer("kapacita_prihlaseno").notNull().default(0),
  stav: text("stav").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type ExpeditionRow = typeof expeditions.$inferSelect;
export type NewExpeditionRow = typeof expeditions.$inferInsert;
