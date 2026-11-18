/**
 * scripts/seed-superadmin.ts — one-off first superadmin.
 *
 * POST /api/admin/codes no longer works when the database has no admin.
 * Run this once with SEED_SUPERADMIN_EMAIL and SEED_SUPERADMIN_HESLO
 * (at least 8 characters). The password is never printed.
 * If an admin already exists, the script exits without writing.
 *
 * Usage: npm run seed:superadmin
 */

import { Pool } from "pg";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { resolve } from "node:path";
import { users } from "../drizzle/schema/users";

dotenv.config({ path: resolve(process.cwd(), ".env.local") });
dotenv.config();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function maskovanyHost(url: string): string {
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
  const email = (process.env["SEED_SUPERADMIN_EMAIL"] ?? "").trim().toLowerCase();
  const heslo = process.env["SEED_SUPERADMIN_HESLO"] ?? "";
  const jmeno = (process.env["SEED_SUPERADMIN_JMENO"] ?? "Hlavní admin").trim();
  if (!EMAIL_REGEX.test(email)) {
    throw new Error("Nastav SEED_SUPERADMIN_EMAIL na platný e-mail.");
  }
  if (heslo.length < 8) {
    throw new Error("Nastav SEED_SUPERADMIN_HESLO (aspoň 8 znaků). Heslo se netiskne.");
  }
  if (jmeno.length === 0) {
    throw new Error("SEED_SUPERADMIN_JMENO je prázdné.");
  }

  process.stdout.write(`seed:superadmin → ${maskovanyHost(dbUrl)}\n`);
  const db = drizzle(new Pool({ connectionString: dbUrl }), { schema: { users } });
  const admini = await db
    .select({ id: users.id })
    .from(users)
    .where(sql`${users.isAdmin} = TRUE`)
    .limit(1);
  if (admini.length > 0) {
    process.stdout.write("Admin už v databázi je. Nic nezakládám.\n");
    return;
  }

  const hash = await bcrypt.hash(heslo, 10);
  const profil = {
    jmeno,
    prijmeni: "",
    passwordHash: hash,
    role: "admin",
    clenstvi: "aktivni_clen" as const,
    funkce: null,
    isAdmin: true,
    isSuperadmin: true,
    skola: "",
    trida: "",
  };
  const stavajici = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (stavajici[0] === undefined) {
    await db.insert(users).values({ email, ...profil });
  } else {
    await db.update(users).set(profil).where(eq(users.email, email));
  }
  process.stdout.write(`ok - ${email} je hlavní admin. Heslo se netiskne.\n`);
}

main().catch((chyba: unknown) => {
  const zprava = chyba instanceof Error ? chyba.message : "neznámá chyba";
  process.stderr.write(`seed:superadmin SELHALO: ${zprava}\n`);
  process.exitCode = 1;
}).finally(() => {
  // Pool spojení drží proces naživu, po doběhnutí ho ukončíme.
  process.exit();
});
