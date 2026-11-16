/**
 * Custom chat groups with per-role read/write.
 * System channels (dulezite, general) stay outside this table.
 * Migration: drizzle/migrations/0017_chat_skupiny.sql
 */
import {
  boolean,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./users";

export const chatSkupiny = pgTable("chat_skupiny", {
  id: uuid("id").primaryKey().defaultRandom(),
  nazev: text("nazev").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const chatSkupinaPrava = pgTable(
  "chat_skupina_prava",
  {
    skupinaId: uuid("skupina_id")
      .notNull()
      .references(() => chatSkupiny.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    cist: boolean("cist").notNull(),
    psat: boolean("psat").notNull(),
  },
  (tabulka) => [
    primaryKey({
      name: "chat_skupina_prava_pkey",
      columns: [tabulka.skupinaId, tabulka.role],
    }),
  ],
);

export const skupinaZpravy = pgTable("skupina_zpravy", {
  id: uuid("id").primaryKey().defaultRandom(),
  skupinaId: uuid("skupina_id")
    .notNull()
    .references(() => chatSkupiny.id, { onDelete: "cascade" }),
  autorId: uuid("autor_id").references(() => users.id, { onDelete: "set null" }),
  autorJmeno: text("autor_jmeno").notNull().default(""),
  text: text("text").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  smazanoAt: timestamp("smazano_at", { withTimezone: true }),
});
