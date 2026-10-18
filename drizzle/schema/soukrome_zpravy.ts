/**
 * Private messages between two accounts. The key is `soukrome:<lowUuid>:<highUuid>`.
 * Only those two may read or write the thread. Soft-delete matches `zpravy`.
 */
import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users";

export const soukromeZpravy = pgTable(
  "soukrome_zpravy",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    klic: text("klic").notNull(),
    autorId: uuid("autor_id").references(() => users.id, { onDelete: "set null" }),
    autorJmeno: text("autor_jmeno").notNull().default(""),
    text: text("text").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    smazanoAt: timestamp("smazano_at", { withTimezone: true }),
  },
  (tabulka) => [
    index("idx_soukrome_zpravy_klic_created").on(tabulka.klic, tabulka.createdAt),
  ],
);

export type SoukromaZprava = typeof soukromeZpravy.$inferSelect;
