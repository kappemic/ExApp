/**
 * drizzle/schema/participants.ts — Fáze 1: přihlášení na výpravu + docházka.
 *
 * Vazby na existující data (BEZ přepisu):
 * - `expeditions(id)` — 7 řádků na Neon větvi `br-icy-boat-b58qwqgx` (TEXT slug)
 *   — se NEMAZE ani nemění. `participants.expedition_id` je proto prosté TEXT
 *   a FK `REFERENCES expeditions(id) ON DELETE CASCADE` vzniká až v SQL migraci.
 * - `clenove(id)` — 14 řádků (`c01`–`c14`, viz `src/data/mockClenove.ts`) —
 *   se NEMAZE ani nemění. `participants.clen_id` je volitelný můstek (SET NULL)
 *   pro období, kdy člen ještě nemá účet v `users`.
 * - `users(id)` — drizzle FK s `ON DELETE CASCADE` (odchod uživatele ruší
 *   jeho přihlášky, ne celou výpravu).
 *
 * Pravidlo: právě jedna identita — `user_id` XOR `clen_id` (hlídá SQL CHECK
 * v migraci). Status: `prihlasen` (před akcí) → `ucastnil_se` / `omluven`
 * (uzavření výpravy adminem). Duplicitní přihláška je zakázána UNIQUE
 * dvojicí `(expedition_id, user_id)` a `(expedition_id, clen_id)` v migraci.
 *
 * Krok 6 — ověření schématu (2026-10-07): migrace NENÍ potřeba.
 * `0001_faze1.sql` + `0002_krok3_ucast_fotky_probehla.sql` už obsahují
 * `participants_xor_check` (XOR), `uq_participants_expedition_user/clen`
 * (UNIQUE dvojice) i `ON DELETE CASCADE` (expedition_id, user_id).
 * Dodatečná správa po uzavření (POST/DELETE ucastnici/:id, varianta A)
 * proto jen čte/píše tato pravidla — žádné ALTER TABLE.
 */
import {
  pgTable,
  uuid,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { users } from "./users";

export const participants = pgTable("participants", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** FK → expeditions(id) v SQL migraci (TEXT slug). Povinné. */
  expeditionId: text("expedition_id").notNull(),
  /** Nová identita (účet v users). NULL = legacy záznam jen s clen_id. */
  userId: uuid("user_id").references(() => users.id, {
    onDelete: "cascade",
  }),
  /** Volitelný můstek na existující `clenove(id)` (`c01`–`c14`). */
  clenId: text("clen_id"),
  /**
   * `prihlasen` | `ucastnil_se` | `omluven`.
   * Hodnotu hlídá SQL CHECK v migraci, kombinace rolí zůstává v TS.
   */
  status: text("status").notNull().default("prihlasen"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Participant = typeof participants.$inferSelect;
export type NewParticipant = typeof participants.$inferInsert;
