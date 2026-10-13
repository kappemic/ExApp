/**
 * drizzle/schema/zpravy.ts — Fáze 5, Krok 3: diskuze k výpravě (server-only).
 *
 * Vlákno výpravy — jedna tabulka `zpravy`:
 * - `expedice_id` TEXT NOT NULL → `expeditions(id)` ON DELETE CASCADE
 *   (smazání výpravy maže celé vlákno; TEXT slug jako u participants/photos).
 * - `autor_id` UUID → `users(id)` ON DELETE SET NULL (odchod uživatele
 *   vlákno nemaže — zpráva zůstává jako klubová paměť, stejně jako fotky).
 * - `text` 1–1000 znaků (meze hlídá SQL CHECK v migraci
 *   `0009_faze5_diskuze.sql`, trim na hranici API).
 * - `smazano_at` NULL = viditelná zpráva; NOT NULL = soft-smazáno (admin).
 * - Složený index (expedice_id, created_at) pro řazení vlákna.
 *
 * Idempotentní migrace: `drizzle/migrations/0009_faze5_diskuze.sql`
 * (pouze CREATE TABLE / INDEX IF NOT EXISTS + DO $$ re-assert FK/CHECK,
 * žádný DROP / DELETE / UPDATE — existující data nedotčena).
 */
import {
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { expeditions } from "./expeditions";
import { users } from "./users";

export const zpravy = pgTable(
  "zpravy",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** FK → expeditions(id) v SQL migraci (TEXT slug). Povinné, CASCADE. */
    expediceId: text("expedice_id")
      .notNull()
      .references(() => expeditions.id, { onDelete: "cascade" }),
    /** Autor zprávy. SET NULL při smazání uživatele — vlákno zůstává. */
    autorId: uuid("autor_id").references(() => users.id, {
      onDelete: "set null",
    }),
    /** Tělo zprávy (trim na hranici; 1–1000 znaků hlídá SQL CHECK). */
    text: text("text").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** Soft-delete adminem. NULL = viditelná zpráva. */
    smazanoAt: timestamp("smazano_at", { withTimezone: true }),
  },
  (tabulka) => [
    index("idx_zpravy_expedice_created").on(
      tabulka.expediceId,
      tabulka.createdAt,
    ),
  ],
);

export type Zprava = typeof zpravy.$inferSelect;
export type NovaZprava = typeof zpravy.$inferInsert;
