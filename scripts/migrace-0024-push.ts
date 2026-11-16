/**
 * Applies drizzle/migrations/0024_push_odbery.sql. Idempotent.
 * Prints only the database host, never the connection string.
 */
import { neon } from "@neondatabase/serverless";
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
  const sql = neon(dbUrl);
  const soubor = readFileSync(resolve(process.cwd(), "drizzle/migrations/0024_push_odbery.sql"), "utf8");
  for (const prikaz of prikazy(soubor)) {
    await sql.query(prikaz);
  }
  const kontrola = await sql`SELECT to_regclass('public.push_odbery') AS tabulka`;
  const radek = kontrola[0] as { tabulka?: string | null } | undefined;
  if (radek?.tabulka !== "push_odbery") {
    throw new Error("Tabulka push_odbery po migraci chybí.");
  }
  console.log(`Migrace 0024 je na ${hostZUrl(dbUrl)}. Tabulka push_odbery existuje.`);
}

main().catch((chyba: unknown) => {
  const zprava = chyba instanceof Error ? chyba.message : "Migrace selhala.";
  console.error(zprava);
  process.exitCode = 1;
});
