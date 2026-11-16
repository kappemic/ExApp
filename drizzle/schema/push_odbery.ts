/**
 * One browser push subscription per endpoint.
 * A later login on the same browser takes the row over.
 * Migration: drizzle/migrations/0024_push_odbery.sql
 */
import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users";

export const pushOdbery = pgTable(
  "push_odbery",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (tabulka) => [index("idx_push_odbery_user").on(tabulka.userId)],
);
