/**
 * Extra photo albums (`vlastni`). Expedition albums are not rows here —
 * their id is `expeditions.id` and their files stay in `photos`.
 * `users.id` is uuid. Migration: drizzle/migrations/0013_alba.sql.
 */
import { boolean, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users";

export const alba = pgTable("alba", {
  id: uuid("id").primaryKey().defaultRandom(),
  nazev: text("nazev").notNull(),
  createdBy: uuid("created_by").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const albaFotky = pgTable("alba_fotky", {
  id: uuid("id").primaryKey().defaultRandom(),
  albumId: uuid("album_id")
    .notNull()
    .references(() => alba.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  jeNahled: boolean("je_nahled").notNull().default(false),
  uploadedBy: uuid("uploaded_by").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  /** NULL = visible; NOT NULL = in admin trash (Koš). */
  smazanoAt: timestamp("smazano_at", { withTimezone: true }),
  /** Pixel size of the stored file after orientation is baked in. Null on older rows. */
  sirka: integer("sirka"),
  vyska: integer("vyska"),
});

export type Album = typeof alba.$inferSelect;
export type NewAlbum = typeof alba.$inferInsert;
export type AlbaFotka = typeof albaFotky.$inferSelect;
export type NewAlbaFotka = typeof albaFotky.$inferInsert;
