/**
 * Applies drizzle/migrations/0025_schuzka_cas.sql. Idempotent.
 * Prints only the database host, never the connection string.
 */
import { Client } from "pg";
import dotenv from "dotenv";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

dotenv.config({ path: resolve(process.cwd(), ".env.local") });
dotenv.config();

function hostZUrl(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "(nečitelná URL)";
  }
}

function prikazy(sql: string): string[] {
  return sql
    .split(";")
    .map((cast) =>
      cast
        .split(/\r?\n/)
        .filter((radek) => !radek.trim().startsWith("--"))
        .join("\n")
        .trim(),
    )
    .filter((cast) => cast.length > 0);
}

async function main(): Promise<void> {
  const dbUrl = process.env["DATABASE_URL"];
  if (dbUrl === undefined || dbUrl.trim().length === 0) {
    throw new Error("Chybí DATABASE_URL.");
  }
  const soubor = readFileSync(
    resolve(process.cwd(), "drizzle/migrations/0025_schuzka_cas.sql"),
    "utf8",
  );
  const klient = new Client({ connectionString: dbUrl });
  await klient.connect();
  try {
    for (const prikaz of prikazy(soubor)) {
      await klient.query(prikaz);
    }
    const kontrola = await klient.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'meetings' AND column_name = 'cas'
    `);
    const radek = kontrola.rows[0] as { column_name?: string } | undefined;
    if (radek?.column_name !== "cas") {
      throw new Error("Sloupec meetings.cas po migraci chybí.");
    }
  } finally {
    await klient.end();
  }
  console.log(`Migrace 0025 je na ${hostZUrl(dbUrl)}. Sloupec meetings.cas existuje.`);
}

main().catch((chyba: unknown) => {
  const zprava = chyba instanceof Error ? chyba.message : "Migrace selhala.";
  console.error(zprava);
  process.exitCode = 1;
});
