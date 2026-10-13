/**
 * drizzle/schema/strava_tokens.ts — Fáze 4, Krok 0: Strava OAuth tokeny (server-only).
 *
 * Jeden řádek na uživatele (PK = FK na `users.id`, CASCADE — smazání
 * uživatele maže i tokeny). Secrety (`access_token` / `refresh_token`)
 * čte jen server (refresh + tahání aktivit); API kontrakt §15
 * (`StravaTokens` v `src/shared/api-types.ts`) nese záměrně jen veřejný
 * stav propojení — secrety se do odpovědí nikdy nevracejí.
 * Idempotentní migrace: `drizzle/migrations/0007_faze4_strava.sql`.
 */
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users";

export const stravaTokens = pgTable("strava_tokens", {
  /** Jeden řádek na uživatele; smazání uživatele maže i tokeny. */
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  /** Server-only secret — nikdy do API odpovědi (kontrakt §15). */
  accessToken: text("access_token").notNull(),
  /** Server-only secret pro refresh — nikdy do API odpovědi. */
  refreshToken: text("refresh_token").notNull(),
  /** Expirace access tokenu (Strava vrací `expires_at` v sekundách). */
  expirace: timestamp("expirace", { withTimezone: true }).notNull(),
  /** Udělený OAuth scope (např. `"read,activity:read"`). */
  scope: text("scope").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type StravaTokensRow = typeof stravaTokens.$inferSelect;
export type NewStravaTokensRow = typeof stravaTokens.$inferInsert;
