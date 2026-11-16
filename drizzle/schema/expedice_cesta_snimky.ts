/**
 * Screenshots of the journey to an expedition and back.
 * Bytes live in R2. This row stores the public URL and the direction.
 * Migration: drizzle/migrations/0021_expedice_cesta_snimky.sql
 */
import { integer, pgTable, text, timestamp, uuid, index } from "drizzle-orm/pg-core";
import { users } from "./users";

export const SMERY_CESTY = ["tam", "zpet"] as const;
export type SmerCesty = (typeof SMERY_CESTY)[number];

export const expediceCestaSnimky = pgTable(
  "expedice_cesta_snimky",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** FK → expeditions(id) in SQL (TEXT slug). */
    expeditionId: text("expedition_id").notNull(),
    /** `tam` outbound, `zpet` return. CHECK in migration 0021. */
    smer: text("smer").notNull(),
    /** Public R2 URL. */
    url: text("url").notNull(),
    /** Pixel size of the stored file after orientation is baked in. Null on older rows. */
    sirka: integer("sirka"),
    vyska: integer("vyska"),
    uploadedBy: uuid("uploaded_by").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (tabulka) => [
    index("idx_expedice_cesta_snimky_expedice_smer").on(tabulka.expeditionId, tabulka.smer),
  ],
);

export type ExpediceCestaSnimek = typeof expediceCestaSnimky.$inferSelect;
export type NovaExpediceCestaSnimek = typeof expediceCestaSnimky.$inferInsert;
