/**
 * server/src/db.ts — server-only Drizzle klient nad Neonem.
 *
 * DATABASE_URL se čte POUZE na serveru (nikdy VITE_*, nikdy do bundlu).
 * Používá HTTP driver (@neondatabase/serverless + drizzle-orm/neon-http),
 * takže nepotřebuje trvalé TCP spojení ani nativní `pg` binding.
 */

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import type { NeonHttpDatabase } from "drizzle-orm/neon-http";
import { clenove } from "../../drizzle/schema/clenove";
import { expeditions } from "../../drizzle/schema/expeditions";
import { participants } from "../../drizzle/schema/participants";
import { registrationCodes } from "../../drizzle/schema/registration_codes";
import { users } from "../../drizzle/schema/users";

const schema = { users, registrationCodes, expeditions, clenove, participants };

export type Db = NeonHttpDatabase<typeof schema>;

let db: Db | null = null;

function vytvorDb(): Db {
  const url = process.env["DATABASE_URL"];
  if (url === undefined || url.trim().length === 0) {
    throw new Error(
      "Chybí DATABASE_URL. Nastav ji v .env.local (server-only, nikdy s prefixem VITE_).",
    );
  }
  const sql = neon(url);
  return drizzle(sql, { schema });
}

/** Lazily vytvořený singleton — spojení vzniká až při prvním dotazu. */
export function getDb(): Db {
  if (db === null) db = vytvorDb();
  return db;
}
