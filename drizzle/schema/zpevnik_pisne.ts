/**
 * Club songbook: one row is either a pending proposal or a published song.
 * Rejection deletes the row. There is no "rejected" state.
 * Migration: drizzle/migrations/0022_zpevnik.sql
 */
import { sql } from "drizzle-orm";
import { jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import type { ProblemPisne, TeloPisne } from "../../src/shared/zpevnik";
import { users } from "./users";

export const STAVY_ZPEVNIKU = ["navrh", "schvalena"] as const;
export type StavZpevniku = (typeof STAVY_ZPEVNIKU)[number];

export const zpevnikPisne = pgTable(
  "zpevnik_pisne",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    nazev: text("nazev").notNull().default(""),
    autor: text("autor").notNull().default(""),
    /** Normalized title+author key. Unique only among published songs. */
    parKlic: text("par_klic").notNull(),
    telo: jsonb("telo").$type<TeloPisne>().notNull(),
    /** `navrh` until an approver publishes it. */
    stav: text("stav").notNull().default("navrh"),
    navrhovatelId: uuid("navrhovatel_id").references(() => users.id, {
      onDelete: "set null",
    }),
    schvalilId: uuid("schvalil_id").references(() => users.id, {
      onDelete: "set null",
    }),
    schvalenoAt: timestamp("schvaleno_at", { withTimezone: true }),
    /** Page preview for an import proposal. Cleared on publish and delete. */
    nahledUrl: text("nahled_url"),
    /** Why an import still needs a human. Null on a clean proposal. */
    problem: text("problem").$type<ProblemPisne | null>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (tabulka) => [
    uniqueIndex("zpevnik_pisne_par_schvalena")
      .on(tabulka.parKlic)
      .where(sql`${tabulka.stav} = 'schvalena'`),
  ],
);

export type ZpevnikPisen = typeof zpevnikPisne.$inferSelect;
export type NovaZpevnikPisen = typeof zpevnikPisne.$inferInsert;
