/**
 * server/src/db.ts — server-only Drizzle klient nad Postgresem.
 *
 * DATABASE_URL se čte POUZE na serveru (nikdy VITE_*, nikdy do bundlu).
 * Standardní TCP driver (`pg` + drizzle-orm/node-postgres) s poolem spojení,
 * funguje s libovolným Postgresem (Railway, Neon i lokální).
 * SSL se řídí parametrem `sslmode` v URL.
 */

import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { clenove } from "../../drizzle/schema/clenove";
import { diskuzePrecteni } from "../../drizzle/schema/diskuze_precteni";
import { konverzacePrecteni } from "../../drizzle/schema/konverzace_precteni";
import { expeditions } from "../../drizzle/schema/expeditions";
import { participants } from "../../drizzle/schema/participants";
import { registrationCodes } from "../../drizzle/schema/registration_codes";
import { stravaTokens } from "../../drizzle/schema/strava_tokens";
import { users } from "../../drizzle/schema/users";
import { soukromeZpravy } from "../../drizzle/schema/soukrome_zpravy";
import {
  chatSkupinaPrava,
  chatSkupiny,
  skupinaZpravy,
} from "../../drizzle/schema/chat_skupiny";
import { zpravy } from "../../drizzle/schema/zpravy";
import { zpravaPrilohy } from "../../drizzle/schema/zprava_prilohy";
import { expediceCestaSnimky } from "../../drizzle/schema/expedice_cesta_snimky";
import { zpevnikPisne } from "../../drizzle/schema/zpevnik_pisne";
import { ctiEnv } from "./prostredi";


const schema = {
  users,
  registrationCodes,
  expeditions,
  clenove,
  participants,
  stravaTokens,
  zpravy,
  zpravaPrilohy,
  expediceCestaSnimky,
  zpevnikPisne,
  soukromeZpravy,
  chatSkupiny,
  chatSkupinaPrava,
  skupinaZpravy,
  diskuzePrecteni,
  konverzacePrecteni,
};

export type Db = NodePgDatabase<typeof schema>;

let db: Db | null = null;

function vytvorDb(): Db {
  const url = ctiEnv("DATABASE_URL");
  if (url === undefined || url.trim().length === 0) {
    throw new Error(
      "Chybí DATABASE_URL. Nastav ji v .env.local (server-only, nikdy s prefixem VITE_).",
    );
  }
  const pool = new Pool({ connectionString: url, max: 10 });
  // Chyba nečinného spojení (restart DB, výpadek sítě) nesmí shodit proces.
  // Pool vadné spojení zahodí a další dotaz otevře nové. URL se nikdy neloguje.
  pool.on("error", (chyba: Error) => {
    console.error("Postgres pool: chyba nečinného spojení:", chyba.message);
  });
  logujSelhaneDotazy(pool);
  return drizzle(pool, { schema });
}

/**
 * Routy odpovídají na chybu DB obecnou 500 bez logu, takže by příčina
 * (nedostupná DB, chybějící tabulka) zůstala neviditelná. Selhaný dotaz
 * proto zapíše kód a text chyby a chybu pošle dál beze změny.
 * Neloguje se SQL, parametry ani URL.
 */
function logujSelhaneDotazy(pool: Pool): void {
  type Dotaz = (...args: unknown[]) => Promise<unknown>;
  const puvodni = pool.query.bind(pool) as Dotaz;
  const obaleny: Dotaz = async (...args) => {
    try {
      return await puvodni(...args);
    } catch (chyba: unknown) {
      const kod =
        typeof chyba === "object" && chyba !== null && "code" in chyba
          ? String((chyba as { code: unknown }).code)
          : "neznámý";
      const text = chyba instanceof Error ? chyba.message.slice(0, 200) : "neznámá chyba";
      console.error(JSON.stringify({ event: "db_dotaz_selhal", kod, text }));
      throw chyba;
    }
  };
  (pool as unknown as { query: Dotaz }).query = obaleny;
}

/** Lazily vytvořený singleton — spojení vzniká až při prvním dotazu. */
export function getDb(): Db {
  if (db === null) db = vytvorDb();
  return db;
}
