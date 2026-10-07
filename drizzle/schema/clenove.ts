/**
 * drizzle/schema/clenove.ts — Krok 3: read + PATCH model členů (server-only).
 *
 * Autoritativní Neon (větev krok4-migrace-seed): 14 řádků (c01–c14).
 * Tabulka je záměrně minimalistická — `id TEXT, jmeno TEXT (plné jméno),
 * role TEXT[], created_at`. Nemá prijmeni / email / telefon / discordNick
 * ani updated_at. Server proto:
 * - čte plné `jmeno` + `role[]` (GET /api/clenove),
 * - u PATCH persistuje jen `jmeno` (složené z jmeno + prijmeni) a `role[]`,
 *   kontakty se validují na hranici, ale nemají kam se uložit — vědomě
 *   se zahazují (stejný precedent jako `poznamka` u POST /api/admin/codes),
 * - `updatedAt` v API odpovědích mapuje z `created_at` (sloupec updated_at
 *   v DB neexistuje).
 */

import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const clenove = pgTable("clenove", {
  id: text("id").primaryKey(),
  /** Plné jméno („Anna Nováková") — PATCH ho skládá z jmeno + prijmeni. */
  jmeno: text("jmeno").notNull(),
  /** Kombinace rolí z `src/config/roles.ts` (TEXT[]). */
  role: text("role").array().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type ClenRow = typeof clenove.$inferSelect;
export type NewClenRow = typeof clenove.$inferInsert;
