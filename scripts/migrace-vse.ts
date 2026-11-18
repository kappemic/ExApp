/**
 * scripts/migrace-vse.ts — sets up the full schema on an empty Postgres.
 *
 * `expeditions` and `clenove` predate the migrations (no migration creates
 * them), so the script first creates them with the columns no later migration
 * adds. Then it runs 0001–NNNN in order. 0000 is skipped: it is a
 * non-idempotent drizzle snapshot that 0001 covers with IF NOT EXISTS.
 *
 * Each file is sent as one simple query, so `DO $$ … $$` blocks stay intact
 * and the file runs in one implicit transaction. All migrations are
 * idempotent, so a repeated run is safe.
 *
 * Prints only the database host, never the connection string.
 *
 *   npx tsx scripts/migrace-vse.ts --jen-cil   # host + existing tables, writes nothing
 *   npx tsx scripts/migrace-vse.ts             # runs the migrations
 */
import { Client } from "pg";
import dotenv from "dotenv";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

dotenv.config({ path: resolve(process.cwd(), ".env.local") });
dotenv.config();

const ZAKLAD = `
CREATE TABLE IF NOT EXISTS clenove (
  id TEXT PRIMARY KEY,
  jmeno TEXT NOT NULL,
  role TEXT[] NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS expeditions (
  id TEXT PRIMARY KEY,
  nazev TEXT NOT NULL,
  datum DATE NOT NULL,
  sraz TEXT NOT NULL,
  popis TEXT NOT NULL DEFAULT '',
  kapacita_celkem INTEGER NOT NULL,
  kapacita_prihlaseno INTEGER NOT NULL DEFAULT 0,
  stav TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;

function hostZUrl(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "(nečitelná URL)";
  }
}

async function main(): Promise<void> {
  const dbUrl = process.env["DATABASE_URL"];
  if (dbUrl === undefined || dbUrl.trim().length === 0) {
    throw new Error("Chybí DATABASE_URL.");
  }
  const jenCil = process.argv.includes("--jen-cil");
  const slozka = resolve(process.cwd(), "drizzle/migrations");
  const soubory = readdirSync(slozka)
    .filter((nazev) => /^\d{4}_.+\.sql$/.test(nazev) && !nazev.startsWith("0000_"))
    .sort();

  const klient = new Client({ connectionString: dbUrl });
  await klient.connect();
  try {
    const tabulky = await klient.query(
      "SELECT count(*)::int AS pocet FROM information_schema.tables WHERE table_schema = 'public'",
    );
    const pocet = (tabulky.rows[0] as { pocet?: number } | undefined)?.pocet ?? 0;
    console.log(`Cíl: ${hostZUrl(dbUrl)}. Tabulek v public: ${String(pocet)}.`);
    if (jenCil) return;

    await klient.query(ZAKLAD);
    console.log("Základ expeditions + clenove je hotový.");
    for (const soubor of soubory) {
      await klient.query(readFileSync(resolve(slozka, soubor), "utf8"));
      console.log(`  ${soubor} OK`);
    }
    const po = await klient.query(
      "SELECT count(*)::int AS pocet FROM information_schema.tables WHERE table_schema = 'public'",
    );
    const pocetPo = (po.rows[0] as { pocet?: number } | undefined)?.pocet ?? 0;
    console.log(`Hotovo, ${String(soubory.length)} migrací. Tabulek v public: ${String(pocetPo)}.`);
  } finally {
    await klient.end();
  }
}

main().catch((chyba: unknown) => {
  const zprava = chyba instanceof Error ? chyba.message : "Migrace selhala.";
  console.error(zprava);
  process.exitCode = 1;
});
