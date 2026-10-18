/**
 * drizzle/schema/users.ts — Fáze 1: identita uživatele (auth + profil).
 *
 * Vazba na existující data (BEZ přepisu):
 * - `clenove(id)` — 14 řádků na Neon větvi `br-icy-boat-b58qwqgx` — se NEMAZE
 *   ani nemění. `users.clen_id` je volitelný můstek (SET NULL) pro migraci
 *   mocků (`src/data/mockClenove.ts`, id `c01`–`c14`) na DB identitu.
 * - Role: jediný zdroj pravdy `src/config/roles.ts` (union `Role`).
 *   DB CHECK kopíruje stejných 5 hodnot, validace kombinací zůstává
 *   v TS (`chybaKombinaceRole`), DB hlídá jen jednotlivou hodnotu.
 *   Potvrzeno pro Step 1 (kanály, BEZE změny sloupců):
 *   `role` TEXT NOT NULL DEFAULT 'clen' + trio `clenstvi` / `funkce` /
 *   `isAdmin` (migrace 0005) zůstává jediným zdrojem práv —
 *   `dulezite` smí psát `funkce = 'vedeni' | 'rada'` NEBO `isAdmin`,
 *   `general` každý přihlášený, čtení PUBLIC. Žádný displayName
 *   sloupec — zobrazované jméno = `jmeno + prijmeni` (fallback
 *   `discordNick`, pak `email`); otisk drží `zpravy.autor_jmeno`.
 *
 * Vyžaduje: `npm i drizzle-orm` + `npm i -D drizzle-kit`
 * (`pgcrypto` pro `gen_random_uuid()` — na Neonu dostupné by default).
 */
import {
  boolean,
  date,
  pgTable,
  uuid,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** Volitelný můstek na existující `clenove(id)`. NULL = čistě nový účet. */
  clenId: text("clen_id"),
  email: text("email").notNull().unique(),
  jmeno: text("jmeno").notNull(),
  /** Příjmení (Krok 2). NOT NULL s default '' kvůli existujícím řádkům. */
  prijmeni: text("prijmeni").notNull().default(""),
  /** Telefon (Krok 2). NULL = nevyplněno. */
  telefon: text("telefon"),
  /** Discord přezdívka (Krok 2). NULL = nevyplněno. */
  discordNick: text("discord_nick"),
  /**
   * Hash hesla (Krok 2, server-only). Nikdy se nevrací klientovi —
   * API mapuje řádek na `ApiUser` bez tohoto pole.
   * Default '' jen kvůli existujícím řádkům bez hesla; nové účty
   * zapisují vždy reálný bcrypt hash.
   */
  passwordHash: text("password_hash").notNull().default(""),
  /**
   * Jednotlivá primární role (5 hodnot z `roles.ts`).
   * Kombinace rolí (pole `Role[]`) řeší až Fáze 3 tabulka `user_roles`
   * — dnes stačí jedna hodnota, admin UI zapisuje tu nejvyšší.
   */
  role: text("role").notNull().default("clen"),
  /**
   * 3D členství (aditivní). CHECK žije jen v SQL migraci 0005
   * (stejně jako dosud u `role`).
   */
  clenstvi: text("clenstvi").notNull().default("clen"),
  /** 3D funkce (nullable, bez defaultu — NULL = bez funkce). */
  funkce: text("funkce"),
  /** Ortogonální admin příznak. */
  isAdmin: boolean("is_admin").notNull().default(false),
  /** Škola (trim na hranici; "" = nevyplněno). */
  skola: text("skola").notNull().default(""),
  /** Třída (trim na hranici; "" = nevyplněno). */
  trida: text("trida").notNull().default(""),
  /** Strava OAuth subject (Fáze 4). NULL = nepropojeno. */
  stravaId: text("strava_id").unique(),
  /**
   * Avatar (Step 3 — POUZE URL, migrace 0015). NULL = nevyplněno.
   * Upload (binární soubor) přijde až ve Stepu 4 přes stejné
   * `PATCH /api/me { avatarUrl }` — kontrakt se nemění.
   * Server validuje jen tvar https:// URL (max 2048), nikdy blob.
   */
  avatarUrl: text("avatar_url"),
  /** Krátké představení (Step 3, migrace 0015). "" = nevyplněno. */
  bio: text("bio").notNull().default(""),
  /** Narozeniny (Step 3, migrace 0015, DATE YYYY-MM-DD). NULL = nevyplněno. */
  narozeniny: date("narozeniny"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
