/**
 * scripts/seed-test-uzivatele.ts — Krok 18: testovací přihlášení (DEV ONLY).
 *
 * Vytvoří/aktualizuje 3 testovací účty v DEV DB (DATABASE_URL z .env.local):
 * - test-vedouci@example.cz — vedoucí + admin (aktivni_clen, vedeni, isAdmin)
 * - test-aktivni@example.cz — aktivní člen (aktivni_clen, bez funkce) + účast
 *   v historii (participants.status = 'ucastnil_se' u proběhlé výpravy)
 * - test-clen@example.cz    — běžný člen (clen, bez funkce, bez účasti)
 *
 * Hesla: z env TEST_SEED_HESLO_VEDOUCI / _AKTIVNI / _CLEN (min. 8 znaků).
 * Chybí-li proměnná, vygeneruje se náhodné heslo (crypto) a vypíše se JEDNOU
 * na stdout — nikdy se nezapisuje do souborů ani do gitu. Hesla z env se
 * nikdy netisknou (jen název proměnné). Hash bcryptjs (cost 10, jako server).
 *
 * BEZPEČNOST:
 * - Nikdy nespouštět proti produkci: při NODE_ENV=production skript odmítne.
 * - Vypisuje jen maily + role, nikdy hashe ani hesla z env.
 * - Idempotentní: opakovaný běh účty jen aktualizuje (podle e-mailu).
 *
 * Spuštění:  npm run seed:test-uzivatele
 * Přihlášení: POST /api/login { email, heslo } (viz docs/testovaci-ucty.md).
 */

import { neon } from "@neondatabase/serverless";
import bcrypt from "bcryptjs";
import dotenv from "dotenv";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import { expeditions } from "../drizzle/schema/expeditions";
import { participants } from "../drizzle/schema/participants";
import { users } from "../drizzle/schema/users";

dotenv.config({ path: resolve(process.cwd(), ".env.local") });
dotenv.config();

type Clenstvi = "clen" | "aktivni_clen";
type Funkce = "vedeni" | "rada" | null;

interface SeedUcet {
  email: string;
  jmeno: string;
  clenstvi: Clenstvi;
  funkce: Funkce;
  isAdmin: boolean;
  envHeslo: string;
}

/** Stejné pořadí jako trioNaRoli v server/src/auth.ts (normativní mirror). */
function mirrorRole(profil: {
  clenstvi: Clenstvi;
  funkce: Funkce;
  isAdmin: boolean;
}): string {
  if (profil.isAdmin) return "admin";
  if (profil.clenstvi === "aktivni_clen" && profil.funkce === "vedeni")
    return "vedeni";
  if (profil.clenstvi === "aktivni_clen" && profil.funkce === "rada")
    return "clen-rady";
  if (profil.clenstvi === "aktivni_clen") return "aktivni-clen";
  return "clen";
}

const UCTY: readonly SeedUcet[] = [
  {
    email: "test-vedouci@example.cz",
    jmeno: "Test Vedoucí",
    clenstvi: "aktivni_clen",
    funkce: "vedeni",
    isAdmin: true,
    envHeslo: "TEST_SEED_HESLO_VEDOUCI",
  },
  {
    email: "test-aktivni@example.cz",
    jmeno: "Test Aktivní",
    clenstvi: "aktivni_clen",
    funkce: null,
    isAdmin: false,
    envHeslo: "TEST_SEED_HESLO_AKTIVNI",
  },
  {
    email: "test-clen@example.cz",
    jmeno: "Test Člen",
    clenstvi: "clen",
    funkce: null,
    isAdmin: false,
    envHeslo: "TEST_SEED_HESLO_CLEN",
  },
];

/** Censored host z DATABASE_URL pro bezpečný výpis (bez credentials). */
function maskovanyHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "(nečitelná URL)";
  }
}

async function main(): Promise<void> {
  if (process.env["NODE_ENV"] === "production") {
    throw new Error(
      "Seed testovacích uživatelů je DEV-ONLY — v produkci odmítnut.",
    );
  }
  const dbUrl = process.env["DATABASE_URL"];
  if (dbUrl === undefined || dbUrl.trim().length === 0) {
    throw new Error("Chybí DATABASE_URL (server-only, z .env.local).");
  }
  process.stdout.write(
    `seed:test-uzivatele → cílová DB: ${maskovanyHost(dbUrl)} (dev only)\n`,
  );

  const db = drizzle(neon(dbUrl), { schema: { users, expeditions, participants } });

  for (const ucet of UCTY) {
    const zEnv = process.env[ucet.envHeslo];
    let heslo: string;
    let hesloZdroj: string;
    if (zEnv !== undefined && zEnv.length >= 8) {
      heslo = zEnv;
      hesloZdroj = `env ${ucet.envHeslo}`;
    } else {
      // Jednorázově vygenerované — vypíše se níže, nikam se neukládá.
      heslo = randomBytes(18).toString("base64url");
      hesloZdroj = "GENEROVÁNO (viz níže, ulož si ho)";
    }
    const hash = await bcrypt.hash(heslo, 10);
    const role = mirrorRole(ucet);

    const stavajici = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, ucet.email))
      .limit(1);
    const prvni = stavajici[0];
    if (prvni === undefined) {
      await db.insert(users).values({
        email: ucet.email,
        jmeno: ucet.jmeno,
        passwordHash: hash,
        role,
        clenstvi: ucet.clenstvi,
        funkce: ucet.funkce,
        isAdmin: ucet.isAdmin,
      });
    } else {
      await db
        .update(users)
        .set({
          jmeno: ucet.jmeno,
          passwordHash: hash,
          role,
          clenstvi: ucet.clenstvi,
          funkce: ucet.funkce,
          isAdmin: ucet.isAdmin,
        })
        .where(eq(users.email, ucet.email));
    }

    // Aktivní člen: účast v historii (proběhlá výprava, status ucastnil_se).
    if (ucet.email === "test-aktivni@example.cz") {
      try {
        const uzivatel = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.email, ucet.email))
          .limit(1);
        const idUzivatele = uzivatel[0]?.id;
        const probehle = await db
          .select({ id: expeditions.id })
          .from(expeditions)
          .limit(1);
        // Ber první výpravu jako historickou kulisu (stav se nemění).
        const idVypravy = probehle[0]?.id;
        if (idUzivatele !== undefined && idVypravy !== undefined) {
          await db
            .insert(participants)
            .values({
              expeditionId: idVypravy,
              userId: idUzivatele,
              status: "ucastnil_se",
            })
            .onConflictDoNothing();
        } else {
          process.stdout.write(
            "pozn.: nenašla se žádná výprava pro historickou účast — trio zůstává aktivni_clen.\n",
          );
        }
      } catch {
        process.stdout.write(
          "pozn.: historickou účast se nepodařilo zapsat — trio zůstává aktivni_clen.\n",
        );
      }
    }

    // Vypisujeme jen mail + roli + zdroj hesla. Heslo z env NIKDY netiskneme.
    process.stdout.write(
      `ok - ${ucet.email} (role ${role}, heslo: ${hesloZdroj})\n`,
    );
    if (hesloZdroj.startsWith("GENEROVÁNO")) {
      process.stdout.write(
        `  !! jednorázové heslo pro ${ucet.email}: ${heslo}\n` +
          `  Ulož si ho / nastav ${ucet.envHeslo} v .env.local (git-ignorováno).\n`,
      );
    }
  }
  process.stdout.write("seed:test-uzivatele hotovo (3 účty).\n");
}

main().catch((chyba: unknown) => {
  const zprava = chyba instanceof Error ? chyba.message : "neznámá chyba";
  process.stderr.write(`seed:test-uzivatele SELHALO: ${zprava}\n`);
  process.exitCode = 1;
});
