/**
 * drizzle/schema/meetings.ts — Fáze 3 (předpříprava ve Fázi 1): opakované schůzky.
 *
 * Kalendář sjednocuje `meetings` + `expeditions` až v read vrstvě (UNION),
 * proto zde ŽÁDNÝ FK na `expeditions`. Pole `mistnost` = třída / klubovna /
 * oddíl z PRD 2.4. Opakování jako enum-text (`jednorazova` | `tydenni`),
 * rozpad na konkrétní výskyty řeší až Fáze 3 (zatím se ukládá hlavička).
 */
import {
  pgTable,
  uuid,
  text,
  date,
  timestamp,
} from "drizzle-orm/pg-core";
import { users } from "./users";

export const meetings = pgTable("meetings", {
  id: uuid("id").primaryKey().defaultRandom(),
  nazev: text("nazev").notNull(),
  /** První / jednorázový výskyt (YYYY-MM-DD). */
  datum: date("datum").notNull(),
  /** Třída / místnost (PRD 2.4). NULL = venku / neurčeno. */
  mistnost: text("mistnost"),
  popis: text("popis").notNull().default(""),
  /** `jednorazova` | `tydenni`. Rozšiřitelné aditivně. */
  opakovani: text("opakovani").notNull().default("jednorazova"),
  createdBy: uuid("created_by").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Meeting = typeof meetings.$inferSelect;
export type NewMeeting = typeof meetings.$inferInsert;

/**
 * Výjimky pro týdenní řady schůzek (B4).
 * Mazání jednoho výskytu vloží řádek místo DELETE — řada zůstává.
 * Klient (`src/lib/kalendar.ts:vyskytySchuzky`) pak výskyty ze seznamu
 * odečte. Prázdné výjimky (jednorázová schůzka) se nikdy nevytvářejí.
 */
export const meetingExceptions = pgTable("meeting_exceptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  seriesId: uuid("series_id")
    .references(() => meetings.id, { onDelete: "cascade" })
    .notNull(),
  /** Vynechaný výskyt (YYYY-MM-DD, DATE). */
  occurrenceDate: date("occurrence_date").notNull(),
  createdBy: uuid("created_by").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type MeetingException = typeof meetingExceptions.$inferSelect;
export type NewMeetingException = typeof meetingExceptions.$inferInsert;
