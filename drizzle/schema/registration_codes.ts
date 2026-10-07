/**
 * drizzle/schema/registration_codes.ts — Fáze 1: 10minutové pozvánkové kódy.
 *
 * Pravidlo expirace (PRD 2.1): kód platí 10 minut od vytvoření.
 * - `expires_at = created_at + interval '10 minutes'` (nastavuje API při INSERT).
 * - Platný kód: `used_at IS NULL AND expires_at > now()`.
 * - CHECK `expires_at > created_at` brání záporné/nulové platnosti.
 * - Kód je jednorázový: po úspěšné registraci API nastaví `used_at` + `used_by`.
 */
import {
  pgTable,
  uuid,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { users } from "./users";

export const registrationCodes = pgTable("registration_codes", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Lidsky přepisovatelný kód (8 znaků, bez 0/O/1/I). Unikátní. */
  code: text("code").notNull().unique(),
  /** Kdo kód vygeneroval (admin). SET NULL při smazání admina. */
  createdBy: uuid("created_by").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  /** created_at + 10 minut. Povinné — nikdy nespoléhat na default. */
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  /** Jednorázovost: NULL = nepoužit. */
  usedAt: timestamp("used_at", { withTimezone: true }),
  usedBy: uuid("used_by").references(() => users.id, {
    onDelete: "set null",
  }),
});

export type RegistrationCode = typeof registrationCodes.$inferSelect;
export type NewRegistrationCode = typeof registrationCodes.$inferInsert;
