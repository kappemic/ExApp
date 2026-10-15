/**
 * drizzle/schema/photos.ts — Fáze 1: fotografie k proběhlé výpravě.
 *
 * Vazba na existující data (BEZ přepisu):
 * - `expeditions(id)` — 7 řádků na Neon větvi `br-icy-boat-b58qwqgx` (TEXT slug,
 *   např. `sumava-trijezerska-slat`) — se NEMAZE ani nemění. Proto je
 *   `photos.expedition_id` prosté TEXT (bez drizzle `.references()` — tabulka
 *   `expeditions` není v drizzle schématu) a FK `REFERENCES expeditions(id)
 *   ON DELETE CASCADE` vzniká až v SQL migraci.
 * - Soubor ukládá pouze URL (Cloudinary / Supabase Storage / S3), nikdy blob.
 *   Mazání výpravy maže i její fotky (CASCADE), smazání uživatele jen
 *   odpojí autora (SET NULL) — fotka zůstává jako klubová paměť.
 */
import {
  boolean,
  pgTable,
  uuid,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { users } from "./users";

export const photos = pgTable("photos", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** FK → expeditions(id) v SQL migraci (TEXT slug). Povinné. */
  expeditionId: text("expedition_id").notNull(),
  /** Veřejná URL v Cloudinary / Supabase Storage / S3. */
  url: text("url").notNull(),
  popis: text("popis").notNull().default(""),
  /**
   * Single highlight for the expedition card. At most one true per
   * expedition_id, enforced when a member picks a highlight (clear the
   * rest, then set this row). Default false keeps existing rows.
   */
  jeNahled: boolean("je_nahled").notNull().default(false),
  /** Kdo fotku nahrál (admin). SET NULL při smazání uživatele. */
  uploadedBy: uuid("uploaded_by").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  /** NULL = visible; NOT NULL = in admin trash (Koš). */
  smazanoAt: timestamp("smazano_at", { withTimezone: true }),
});

export type Photo = typeof photos.$inferSelect;
export type NewPhoto = typeof photos.$inferInsert;
