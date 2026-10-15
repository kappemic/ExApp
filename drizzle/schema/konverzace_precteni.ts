/**
 * drizzle/schema/konverzace_precteni.ts — Step 1: značky přečtení konverzací (server-only).
 *
 * Sjednocený klíč konverzace pro unread badge napříč kanály:
 * - `conversation_key` TEXT NOT NULL — `expedice:<slug>` | `dulezite` | `general`.
 *   Formát `expedice:<slug>` navazuje na TEXT slug `expeditions(id)`
 *   (stejný vzor jako `zpravy.expedice_id`, `participants`, `photos`).
 * - `user_id` UUID → `users(id)` ON DELETE CASCADE (odchod uživatele maže jeho značky).
 * - `last_read_at` TIMESTAMPTZ NOT NULL (čas serverového POST read).
 * - PK `(user_id, conversation_key)` — jeden řádek na uživatele a konverzaci,
 *   POST read je idempotentní upsert (stejný vzor jako `diskuze_precteni`).
 *
 * Vztah k `diskuze_precteni` (migrace 0010): ta zůstává NEDOTČENA
 * (per-výprava značka `(user_id, expedice_id)` pro 5 existujících rout
 * `meta/read` + `zpravy` list/post/delete). Nová tabulka je ADITIVNÍ —
 * budoucí globální kanály (`dulezite`, `general`) a sjednocené
 * `conversationKey` API ji použijí bez přepisu historie. Žádná migrace
 * dat mezi tabulkami se nekoná (BEZ UPDATE/DELETE — čistě CREATE).
 *
 * Idempotentní migrace: `drizzle/migrations/0011_kanaly_jmeno_autora.sql`
 * (pouze CREATE TABLE IF NOT EXISTS + DO $$ re-assert FK/PK,
 * žádný DROP / DELETE / UPDATE).
 */
import { pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users";

/** Sjednocený klíč konverzace pro unread (kopie budoucího API kontraktu). */
export const KONVERZACE_KLICE_GLOBALNI = ["dulezite", "general"] as const;

export type GlobalniKonverzaceKlic =
  (typeof KONVERZACE_KLICE_GLOBALNI)[number];

/**
 * Staví klíč vláknové konverzace výpravy: `expedice:<slug>`.
 * Prefix brání kolizi slugu výpravy s globálním klíčem (`dulezite` / `general`).
 */
export function konverzaceKlicExpedice(expediceId: string): string {
  return `expedice:${expediceId}`;
}

/**
 * Guard klíče konverzace: `dulezite` | `general` | `expedice:<neprázdný slug>`.
 * Prázdný slug (`expedice:`) a cizí prefixy odmítne.
 */
export function jeKonverzaceKlic(hodnota: string): boolean {
  if (hodnota === "dulezite" || hodnota === "general") return true;
  if (!hodnota.startsWith("expedice:")) return false;
  return hodnota.slice("expedice:".length).length > 0;
}

export const konverzacePrecteni = pgTable(
  "konverzace_precteni",
  {
    /** Vlastník značky — vždy ze session (`uzivatel.id`), nikdy z body/query. */
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /**
     * Sjednocený klíč: `expedice:<slug>` | `dulezite` | `general`.
     * Bez FK na expeditions (logický klíč — globály expedici nemají).
     */
    conversationKey: text("conversation_key").notNull(),
    /** Čas posledního POST read (serverový čas, ISO v API). */
    lastReadAt: timestamp("last_read_at", { withTimezone: true }).notNull(),
  },
  (tabulka) => [
    primaryKey({
      name: "konverzace_precteni_pkey",
      columns: [tabulka.userId, tabulka.conversationKey],
    }),
  ],
);

export type KonverzacePrecteni = typeof konverzacePrecteni.$inferSelect;
export type NovaKonverzacePrecteni = typeof konverzacePrecteni.$inferInsert;
