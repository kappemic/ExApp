/**
 * scripts/seed-test-vypravy.ts — a few test trips for an empty database.
 *
 * Inserts 6 trips with fixed `test-…` ids: 2 past (`proběhlá`, with km and
 * elevation), 3 open (`volno`) and 1 almost full (`skoro plno`). Dates are
 * relative to today, so the calendar always shows something.
 * Idempotent: an existing id is skipped (ON CONFLICT DO NOTHING).
 * Refuses to run with NODE_ENV=production. Prints only the database host.
 *
 *   npx tsx scripts/seed-test-vypravy.ts
 */
import { Pool } from "pg";
import dotenv from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { resolve } from "node:path";
import { expeditions, type NewExpeditionRow } from "../drizzle/schema/expeditions";

dotenv.config({ path: resolve(process.cwd(), ".env.local") });
dotenv.config();

function hostZUrl(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "(nečitelná URL)";
  }
}

/** YYYY-MM-DD posunuté o `dny` od dneška (UTC). */
function den(dny: number): string {
  const datum = new Date();
  datum.setUTCDate(datum.getUTCDate() + dny);
  return datum.toISOString().slice(0, 10);
}

const VYPRAVY: NewExpeditionRow[] = [
  {
    id: "test-krkonose-snezka",
    nazev: "Krkonoše: Sněžka",
    datum: den(-40),
    sraz: "Hlavní nádraží, 7:00",
    popis: "Testovací proběhlá výprava na nejvyšší horu Česka.",
    kapacitaCelkem: 15,
    kapacitaPrihlaseno: 0,
    stav: "proběhlá",
    km: 18.4,
    prevyseniM: 1050,
  },
  {
    id: "test-cesky-raj-skaly",
    nazev: "Český ráj: Prachovské skály",
    datum: den(-12),
    sraz: "Autobusové nádraží, 8:00",
    popis: "Testovací proběhlá výprava skalním městem.",
    kapacitaCelkem: 20,
    kapacitaPrihlaseno: 0,
    stav: "proběhlá",
    km: 12.1,
    prevyseniM: 380,
  },
  {
    id: "test-sumava-plechy",
    nazev: "Šumava: Plechý a Plešné jezero",
    datum: den(10),
    datumDo: den(11),
    sraz: "Hlavní nádraží, 6:30",
    popis: "Testovací dvoudenní výprava s přespáním.",
    kapacitaCelkem: 12,
    kapacitaPrihlaseno: 0,
    stav: "volno",
  },
  {
    id: "test-jeseniky-praded",
    nazev: "Jeseníky: Praděd",
    datum: den(24),
    sraz: "Hlavní nádraží, 6:00",
    popis: "Testovací výprava na Praděd.",
    kapacitaCelkem: 15,
    kapacitaPrihlaseno: 0,
    stav: "volno",
  },
  {
    id: "test-beskydy-lysa-hora",
    nazev: "Beskydy: Lysá hora",
    datum: den(38),
    sraz: "Hlavní nádraží, 6:15",
    popis: "Testovací výprava na Lysou horu.",
    kapacitaCelkem: 10,
    kapacitaPrihlaseno: 0,
    stav: "volno",
  },
  {
    id: "test-palava-devin",
    nazev: "Pálava: Děvín",
    datum: den(52),
    sraz: "Autobusové nádraží, 7:30",
    popis: "Testovací výprava skoro plná, ověří stav obsazenosti.",
    kapacitaCelkem: 8,
    kapacitaPrihlaseno: 0,
    stav: "skoro plno",
  },
];

async function main(): Promise<void> {
  if (process.env["NODE_ENV"] === "production") {
    throw new Error("Skript s testovacími daty se při NODE_ENV=production nespouští.");
  }
  const dbUrl = process.env["DATABASE_URL"];
  if (dbUrl === undefined || dbUrl.trim().length === 0) {
    throw new Error("Chybí DATABASE_URL.");
  }
  const pool = new Pool({ connectionString: dbUrl });
  try {
    const db = drizzle(pool);
    const vlozene = await db
      .insert(expeditions)
      .values(VYPRAVY)
      .onConflictDoNothing({ target: expeditions.id })
      .returning({ id: expeditions.id });
    console.log(
      `Výpravy na ${hostZUrl(dbUrl)}: vloženo ${String(vlozene.length)}, ` +
        `přeskočeno ${String(VYPRAVY.length - vlozene.length)} (už existují).`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((chyba: unknown) => {
  const zprava = chyba instanceof Error ? chyba.message : "Seed výprav selhal.";
  console.error(zprava);
  process.exitCode = 1;
});
