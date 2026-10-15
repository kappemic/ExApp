/**
 * drizzle/schema/zpravy.ts — Fáze 5, Krok 3 + Step 1 (kanály, DB kontrakt).
 *
 * Vlákno výpravy + globální kanály — jedna tabulka `zpravy`:
 * - `kanal` TEXT NOT NULL DEFAULT 'expedice' — 'expedice' | 'dulezite' | 'general'.
 *   CHECK `zpravy_kanal_check` hlídá právě tyto 3 hodnoty (migrace 0011).
 * - `expedice_id` TEXT → `expeditions(id)` ON DELETE CASCADE.
 *   Od migrace 0011 NULLABLE: NULL = globální kanál (`dulezite` / `general`),
 *   NOT NULL = vlákno výpravy (`kanal = 'expedice'`). CHECK `zpravy_kanal_expedice_check`
 *   vymáhá právě tuto vazbu. Existující řádky (vše `expedice` + NOT NULL slug)
 *   procházejí bez změny — BEZ přepisu dat.
 * - `autor_id` UUID → `users(id)` ON DELETE SET NULL (odchod uživatele
 *   vlákno nemaže — zpráva zůstává jako klubová paměť, stejně jako fotky).
 * - `autor_jmeno` TEXT NOT NULL DEFAULT '' — denormalizovaný snapshot zobrazovaného
 *   jména v čase zápisu (`jmeno + prijmeni`, fallback `discordNick`, pak `email`).
 *   Důvod: po SET NULL by jinak jméno autora zmizelo; snapshot paměť drží.
 *   Odvozovací pravidlo patří na hranici API (budoucí krok), DB drží jen text.
 * - `text` 1–1000 znaků (meze hlídá SQL CHECK v migraci
 *   `0009_faze5_diskuze.sql`, trim na hranici API).
 * - `smazano_at` NULL = viditelná zpráva; NOT NULL = soft-smazáno (admin).
 * - Složený index (expedice_id, created_at) pro řazení vlákna výpravy;
 *   index (kanal, created_at) pro globální kanály (migrace 0011).
 *
 * Role (BEZE změny users — potvrzeno):
 * - DB `users.role` je jedna z 5 hodnot `Role` (src/config/roles.ts:
 *   `admin | clen | aktivni-clen | clen-rady | vedeni`, default `clen`)
 *   + trio `clenstvi` / `funkce` / `isAdmin` (migrace 0005).
 * - Žádný `displayName` sloupec — zobrazované jméno se skládá
 *   z `users.jmeno + users.prijmeni` (fallback `discordNick`, pak `email`);
 *   trvalý otisk nese právě `zpravy.autor_jmeno`.
 * - Právo psát `dulezite`: `funkce = 'vedeni' | 'rada'` NEBO `isAdmin = true`
 *   (pokrývá Role `vedeni` / `clen-rady` / `admin`); číst smí všichni (GET PUBLIC).
 * - Právo psát `general`: každý přihlášený (USER). Vymáhání patří
 *   na hranici API (budoucí krok), NIKDY do DB triggerů.
 *
 * Idempotentní migrace: `drizzle/migrations/0009_faze5_diskuze.sql`
 * + `drizzle/migrations/0011_kanaly_jmeno_autora.sql`
 * (pouze ADD COLUMN IF NOT EXISTS / ALTER DROP NOT NULL / DO $$ re-assert
 * CHECK / CREATE INDEX IF NOT EXISTS, žádný DROP / DELETE / UPDATE —
 * existující data nedotčena).
 */
import {
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { expeditions } from "./expeditions";
import { users } from "./users";

/** Kanál zprávy — `expedice` = vlákno výpravy, zbytek = globál (expedice_id NULL). */
export const KANALY_ZPRAVY = ["expedice", "dulezite", "general"] as const;

/** Kanál zprávy (kopie DB CHECK `zpravy_kanal_check`). */
export type KanalZpravy = (typeof KANALY_ZPRAVY)[number];

/** Guard kanálu (hranice API ho použije při validaci budoucích route). */
export function jeKanalZpravy(hodnota: string): hodnota is KanalZpravy {
  return (KANALY_ZPRAVY as readonly string[]).includes(hodnota);
}

export const zpravy = pgTable(
  "zpravy",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /**
     * FK → expeditions(id) v SQL migraci (TEXT slug). NULLABLE od 0011:
     * NULL = globální kanál (`dulezite` / `general`), string = vlákno výpravy.
     * CASCADE: smazání výpravy maže její vlákno; globálů se nedotkne (NULL).
     */
    expediceId: text("expedice_id").references(() => expeditions.id, {
      onDelete: "cascade",
    }),
    /** Kanál zprávy. Default 'expedice' = dnešní chování beze změny. */
    kanal: text("kanal").notNull().default("expedice"),
    /** Autor zprávy. SET NULL při smazání uživatele — vlákno zůstává. */
    autorId: uuid("autor_id").references(() => users.id, {
      onDelete: "set null",
    }),
    /**
     * Snapshot zobrazovaného jména v čase zápisu (složené
     * `jmeno + prijmeni`, fallback `discordNick`, pak `email`).
     * "" = zapsáno před migrací 0011 (historie bez otisku).
     */
    autorJmeno: text("autor_jmeno").notNull().default(""),
    /** Tělo zprávy (trim na hranici; 1–1000 znaků hlídá SQL CHECK). */
    text: text("text").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** Soft-delete adminem. NULL = viditelná zpráva. */
    smazanoAt: timestamp("smazano_at", { withTimezone: true }),
  },
  (tabulka) => [
    index("idx_zpravy_expedice_created").on(
      tabulka.expediceId,
      tabulka.createdAt,
    ),
    index("idx_zpravy_kanal_created").on(tabulka.kanal, tabulka.createdAt),
  ],
);

export type Zprava = typeof zpravy.$inferSelect;
export type NovaZprava = typeof zpravy.$inferInsert;
