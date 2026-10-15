/**
 * drizzle/schema/diskuze_precteni.ts — Step 1: značky přečtení diskuze (server-only).
 *
 * Per-user značka `(user_id, expedice_id) → last_read_at`:
 * - `user_id` UUID → `users(id)` ON DELETE CASCADE (odchod uživatele maže jeho značky).
 * - `expedice_id` TEXT → `expeditions(id)` ON DELETE CASCADE (smazání výpravy maže značky).
 * - `last_read_at` TIMESTAMPTZ NOT NULL (čas serverového POST read).
 * - PK `(user_id, expedice_id)` — jeden řádek na uživatele a výpravu, POST read je upsert.
 *
 * Idempotentní migrace: `drizzle/migrations/0010_diskuze_precteni.sql`
 * (pouze CREATE TABLE IF NOT EXISTS + DO $$ re-assert FK/PK, žádný DROP / DELETE / UPDATE).
 */
import { pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { expeditions } from "./expeditions";
import { users } from "./users";

export const diskuzePrecteni = pgTable(
  "diskuze_precteni",
  {
    /** Vlastník značky — vždy ze session (`uzivatel.id`), nikdy z body/query. */
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** Vlákno výpravy — TEXT slug jako u zpravy/participants/photos. */
    expediceId: text("expedice_id")
      .notNull()
      .references(() => expeditions.id, { onDelete: "cascade" }),
    /** Čas posledního POST read (serverový čas, ISO v API). */
    lastReadAt: timestamp("last_read_at", { withTimezone: true }).notNull(),
  },
  (tabulka) => [
    primaryKey({
      name: "diskuze_precteni_pkey",
      columns: [tabulka.userId, tabulka.expediceId],
    }),
  ],
);

export type DiskuzePrecteni = typeof diskuzePrecteni.$inferSelect;
export type NoveDiskuzePrecteni = typeof diskuzePrecteni.$inferInsert;
