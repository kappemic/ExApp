/**
 * Attachments for chat messages.
 *
 * One table covers all three threads. `druh` picks the parent:
 * `zprava` → `zpravy`, `soukroma` → `soukrome_zpravy`, `skupina` → `skupina_zpravy`.
 * All three parents use UUID ids, but there is no foreign key: the parent
 * table depends on `druh`. The object bytes live in R2; `klic` is the object key.
 *
 * Migration: drizzle/migrations/0020_zprava_prilohy.sql
 */
import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/** Which message table `zprava_id` points at. Copy of CHECK `zprava_prilohy_druh_check`. */
export const DRUHY_ZPRAVA_PRILOHY = ["zprava", "soukroma", "skupina"] as const;

export type DruhZpravaPrilohy = (typeof DRUHY_ZPRAVA_PRILOHY)[number];

export function jeDruhZpravaPrilohy(hodnota: string): hodnota is DruhZpravaPrilohy {
  return (DRUHY_ZPRAVA_PRILOHY as readonly string[]).includes(hodnota);
}

export const zpravaPrilohy = pgTable(
  "zprava_prilohy",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** `zprava` | `soukroma` | `skupina`. CHECK in migration 0020. */
    druh: text("druh").notNull(),
    /** Id in the table named by `druh`. No FK — the parent table varies. */
    zpravaId: uuid("zprava_id").notNull(),
    /** Display name, 1–120 characters (CHECK in migration 0020). */
    nazev: text("nazev").notNull(),
    /** R2 object key. Unique. */
    klic: text("klic").notNull().unique("zprava_prilohy_klic_key"),
    bajty: integer("bajty").notNull(),
    contentType: text("content_type").notNull(),
    vytvoreno: timestamp("vytvoreno", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (tabulka) => [
    index("idx_zprava_prilohy_druh_zprava").on(tabulka.druh, tabulka.zpravaId),
  ],
);

export type ZpravaPriloha = typeof zpravaPrilohy.$inferSelect;
export type NovaZpravaPriloha = typeof zpravaPrilohy.$inferInsert;
