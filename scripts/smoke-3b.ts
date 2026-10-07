/**
 * scripts/smoke-3b.ts — Krok 3b: smoke test endpointů expedice.
 *
 * Ověřuje matici dle kontraktu (src/shared/api-types.ts §8):
 * 201/200/401/403/404/409/410/422, hlídání kapacity a odmítnutí
 * přihlášení na uzavřenou výpravu (409 VYPRAVA_UZAVRENA).
 *
 * Spuštění: nejdřív `npm run server:dev` (nebo server:start),
 * pak `npx tsx scripts/smoke-3b.ts`.
 * Setup (kódy) i cleanup (výprava, uživatelé, kódy) jde přímo přes
 * DATABASE_URL — po běhu nezůstane nic. Secrety nikdy neloguje.
 */

import { neon } from "@neondatabase/serverless";
import dotenv from "dotenv";
import { inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { randomInt } from "node:crypto";
import { resolve } from "node:path";
import { expeditions } from "../drizzle/schema/expeditions";
import { registrationCodes } from "../drizzle/schema/registration_codes";
import { users } from "../drizzle/schema/users";

dotenv.config({ path: resolve(process.cwd(), ".env.local") });
dotenv.config();

const PORT = Number.parseInt(process.env["PORT"] ?? "3001", 10);
const BASE = process.env["SMOKE_BASE_URL"] ?? `http://localhost:${PORT}`;
const HESLO = "SmokeHeslo123";

function vytvorDb() {
  const url = process.env["DATABASE_URL"];
  if (url === undefined || url.trim().length === 0) {
    throw new Error("Chybí DATABASE_URL (server-only, z .env.local).");
  }
  return drizzle(neon(url), {
    schema: { users, registrationCodes, expeditions },
  });
}

/** Náhodný kód ve tvaru dle kontraktu (8 znaků, bez 0/O/1/I). */
function nahodnyKodSmoke(): string {
  const abeceda = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let kod = "";
  for (let i = 0; i < 8; i += 1) {
    kod += abeceda[randomInt(abeceda.length)];
  }
  return kod;
}

function zitraYmd(): string {
  const zitra = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const rok = zitra.getFullYear();
  const mesic = String(zitra.getMonth() + 1).padStart(2, "0");
  const den = String(zitra.getDate()).padStart(2, "0");
  return `${rok}-${mesic}-${den}`;
}

interface Odpoved {
  status: number;
  telo: unknown;
}

function kodChyby(telo: unknown): string | null {
  if (typeof telo !== "object" || telo === null) return null;
  const error = (telo as { error?: unknown }).error;
  if (typeof error !== "object" || error === null) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

async function volej(
  metoda: string,
  cesta: string,
  cookie: string | null,
  telo?: unknown,
): Promise<Odpoved> {
  const hlavicky: Record<string, string> = {};
  if (cookie !== null && cookie.length > 0) hlavicky["Cookie"] = cookie;
  let body: string | undefined;
  if (telo !== undefined) {
    hlavicky["Content-Type"] = "application/json";
    body = JSON.stringify(telo);
  }
  const odp = await fetch(`${BASE}${cesta}`, {
    method: metoda,
    headers: hlavicky,
    body,
  });
  let parsed: unknown = null;
  try {
    parsed = (await odp.json()) as unknown;
  } catch {
    parsed = null;
  }
  return { status: odp.status, telo: parsed };
}

/** Vytáhne session cookie z registrace/přihlášení. */
async function cookieZRegistrace(email: string, kod: string): Promise<string> {
  const odp = await fetch(`${BASE}/api/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jmeno: "Smoke",
      email,
      heslo: HESLO,
      kod,
    }),
  });
  if (odp.status !== 201) {
    const telo = (await odp.json().catch(() => null)) as unknown;
    throw new Error(
      `registrace ${email} selhala (${String(odp.status)} ${kodChyby(telo) ?? ""})`,
    );
  }
  const raw = odp.headers.getSetCookie();
  const session = raw.find((radek) => radek.startsWith("exapp_session="));
  if (session === undefined) throw new Error("chybí session cookie");
  const konec = session.indexOf(";");
  return konec === -1 ? session : session.slice(0, konec);
}

async function main(): Promise<void> {
  const zdravi = await volej("GET", "/api/health", null);
  if (zdravi.status !== 200) {
    throw new Error(`server neběží na ${BASE} — spusť npm run server:dev`);
  }

  const db = vytvorDb();
  const znacka = String(Date.now());
  const email1 = `smoke3b-${znacka}-1@example.cz`;
  const email2 = `smoke3b-${znacka}-2@example.cz`;
  const email3 = `smoke3b-${znacka}-3@example.cz`;
  const kodExpirovany = nahodnyKodSmoke();
  const kodPlatny = nahodnyKodSmoke();
  let idVypravy = "";
  let selhani = 0;

  function zkontroluj(
    nazev: string,
    odp: Odpoved,
    status: number,
    kod?: string,
  ): void {
    const skutecnyKod = kodChyby(odp.telo);
    const ok =
      odp.status === status && (kod === undefined || skutecnyKod === kod);
    if (ok) {
      process.stdout.write(`ok - ${nazev} (${String(odp.status)})\n`);
    } else {
      selhani += 1;
      process.stdout.write(
        `SELHALO - ${nazev}: čekáno ${String(status)}${kod === undefined ? "" : `/${kod}`}, ` +
          `dostáno ${String(odp.status)}${skutecnyKod === null ? "" : `/${skutecnyKod}`}\n`,
      );
    }
  }

  try {
    // 1) Veřejné čtení + query hranice
    zkontroluj(
      "GET list je veřejný",
      await volej("GET", "/api/expeditions", null),
      200,
    );
    zkontroluj(
      "GET detail neznámé → 404",
      await volej("GET", "/api/expeditions/sem-nic-neni", null),
      404,
      "NENALEZENO",
    );
    zkontroluj(
      "GET list ?stav=nesmysl → 422",
      await volej("GET", "/api/expeditions?stav=nesmysl", null),
      422,
      "VALIDATION_ERROR",
    );
    zkontroluj(
      "GET list ?stav=proběhlá + stránkování → 200",
      await volej(
        "GET",
        "/api/expeditions?stav=prob%C4%9Bhl%C3%A1&page=1&pageSize=5",
        null,
      ),
      200,
    );

    // 2) Bez session → 401 (i na neexistujícím id — auth je první)
    zkontroluj(
      "POST expedice bez session → 401",
      await volej("POST", "/api/expeditions", null, {}),
      401,
      "NEPRIHLASEN",
    );
    zkontroluj(
      "PATCH expedice bez session → 401",
      await volej("PATCH", "/api/expeditions/x", null, {}),
      401,
      "NEPRIHLASEN",
    );
    zkontroluj(
      "DELETE expedice bez session → 401",
      await volej("DELETE", "/api/expeditions/x", null),
      401,
      "NEPRIHLASEN",
    );
    zkontroluj(
      "GET účastníci bez session → 401",
      await volej("GET", "/api/expeditions/x/ucastnici", null),
      401,
      "NEPRIHLASEN",
    );
    zkontroluj(
      "POST přihlásit bez session → 401",
      await volej("POST", "/api/expeditions/x/prihlasit", null),
      401,
      "NEPRIHLASEN",
    );
    zkontroluj(
      "DELETE odhlásit bez session → 401",
      await volej("DELETE", "/api/expeditions/x/odhlasit", null),
      401,
      "NEPRIHLASEN",
    );
    zkontroluj(
      "PATCH uzavřít bez session → 401",
      await volej("PATCH", "/api/expeditions/x/uzavrit", null, {}),
      401,
      "NEPRIHLASEN",
    );

    // 3) Expirovaný kód → 410 (jediná 410 v kontraktu).
    // DB CHECK (expires_at > created_at) brání vložit expirovaný kód
    // s čerstvým created_at — proto posuneme obojí do minulosti.
    await db.insert(registrationCodes).values({
      code: kodExpirovany,
      createdBy: null,
      createdAt: new Date(Date.now() - 20 * 60_000),
      expiresAt: new Date(Date.now() - 10 * 60_000),
    });
    zkontroluj(
      "register s expirovaným kódem → 410",
      await volej("POST", "/api/register", null, {
        jmeno: "Smoke",
        email: email1,
        heslo: HESLO,
        kod: kodExpirovany,
      }),
      410,
      "KOD_EXPIROVANY",
    );

    // 4) USER (registrace platným multi-use kódem) → ADMIN cesty 403
    await db.insert(registrationCodes).values({
      code: kodPlatny,
      createdBy: null,
      expiresAt: new Date(Date.now() + 10 * 60_000),
    });
    const cookieUser = await cookieZRegistrace(email1, kodPlatny);
    zkontroluj(
      "POST expedice jako USER → 403",
      await volej("POST", "/api/expeditions", cookieUser, {}),
      403,
      "ZAKAZANO",
    );
    zkontroluj(
      "PATCH uzavřít jako USER → 403",
      await volej("PATCH", "/api/expeditions/x/uzavrit", cookieUser, {}),
      403,
      "ZAKAZANO",
    );

    // 5) Povýšení na ADMINa (role se čte čerstvě z DB — cookie platí dál)
    await db
      .update(users)
      .set({ role: "admin" })
      .where(inArray(users.email, [email1]));
    const cookieAdmin = cookieUser;

    // 6) Validace na hranici → 422 (prázdné tělo, stav v PATCHi)
    zkontroluj(
      "POST expedice s prázdným tělem → 422",
      await volej("POST", "/api/expeditions", cookieAdmin, {}),
      422,
      "VALIDATION_ERROR",
    );
    zkontroluj(
      "POST expedice s minulým datem → 422",
      await volej("POST", "/api/expeditions", cookieAdmin, {
        nazev: "Smoke výprava",
        datum: "2000-01-01",
        sraz: "Klubovna 18:00",
        kapacitaCelkem: 5,
      }),
      422,
      "VALIDATION_ERROR",
    );

    // 7) Vytvoření → 201
    const vytvorena = await volej("POST", "/api/expeditions", cookieAdmin, {
      nazev: `Smoke výprava ${znacka}`,
      datum: zitraYmd(),
      sraz: "Klubovna 18:00",
      popis: "Smoke test Kroku 3b.",
      kapacitaCelkem: 5,
    });
    zkontroluj("POST expedice → 201", vytvorena, 201);
    const noveId: unknown = (vytvorena.telo as { expedice?: { id?: unknown } })
      .expedice?.id;
    if (typeof noveId !== "string" || noveId.length === 0) {
      throw new Error("tvorba nevrátila id výpravy");
    }
    idVypravy = noveId;

    zkontroluj(
      "PATCH stav napřímo → 422",
      await volej("PATCH", `/api/expeditions/${idVypravy}`, cookieAdmin, {
        stav: "proběhlá",
      }),
      422,
      "VALIDATION_ERROR",
    );
    zkontroluj(
      "GET detail → 200",
      await volej("GET", `/api/expeditions/${idVypravy}`, null),
      200,
    );
    zkontroluj(
      "PATCH neznámé id → 404",
      await volej("PATCH", "/api/expeditions/sem-nic-neni", cookieAdmin, {
        nazev: "Xyz Abc",
      }),
      404,
      "NENALEZENO",
    );

    // 8) Účast: přihlášení → 201, duplicita → 409
    const cookieUser2 = await cookieZRegistrace(email2, kodPlatny);
    const prihlaska = await volej(
      "POST",
      `/api/expeditions/${idVypravy}/prihlasit`,
      cookieUser,
      {},
    );
    zkontroluj("POST přihlásit → 201", prihlaska, 201);
    zkontroluj(
      "POST přihlásit znovu → 409 UZ_PRIHLASEN",
      await volej("POST", `/api/expeditions/${idVypravy}/prihlasit`, cookieUser, {}),
      409,
      "UZ_PRIHLASEN",
    );
    zkontroluj(
      "POST přihlásit na neznámou → 404",
      await volej("POST", "/api/expeditions/sem-nic-neni/prihlasit", cookieUser, {}),
      404,
      "NENALEZENO",
    );

    // 9) Kapacita: 2 přihlášení, snížení pod ně → 422, plná → 409
    zkontroluj(
      "druhé přihlášení → 201",
      await volej("POST", `/api/expeditions/${idVypravy}/prihlasit`, cookieUser2, {}),
      201,
    );
    zkontroluj(
      "PATCH kapacita pod přihlášené → 422",
      await volej("PATCH", `/api/expeditions/${idVypravy}`, cookieAdmin, {
        kapacitaCelkem: 1,
      }),
      422,
      "VALIDATION_ERROR",
    );
    zkontroluj(
      "PATCH kapacita na 2 → 200",
      await volej("PATCH", `/api/expeditions/${idVypravy}`, cookieAdmin, {
        kapacitaCelkem: 2,
      }),
      200,
    );
    const cookieUser3 = await cookieZRegistrace(email3, kodPlatny);
    zkontroluj(
      "přihlášení do plné → 409 KAPACITA_PLNA",
      await volej("POST", `/api/expeditions/${idVypravy}/prihlasit`, cookieUser3, {}),
      409,
      "KAPACITA_PLNA",
    );

    // 10) Odhlášení: idempotentní 200 bez přihlášky, pak reálné
    zkontroluj(
      "odhlášení bez přihlášky → 200 (idempotentní)",
      await volej("DELETE", `/api/expeditions/${idVypravy}/odhlasit`, cookieUser3),
      200,
    );
    zkontroluj(
      "odhlášení s přihláškou → 200",
      await volej("DELETE", `/api/expeditions/${idVypravy}/odhlasit`, cookieUser2),
      200,
    );

    // 11) Uzavření: prázdná a cizí docházka → 422, pak 200
    zkontroluj(
      "uzavřít s prázdnou docházkou → 422",
      await volej("PATCH", `/api/expeditions/${idVypravy}/uzavrit`, cookieAdmin, {
        dochazka: [],
      }),
      422,
      "VALIDATION_ERROR",
    );
    zkontroluj(
      "uzavřít s cizím účastníkem → 422",
      await volej("PATCH", `/api/expeditions/${idVypravy}/uzavrit`, cookieAdmin, {
        dochazka: [
          {
            ucastnikId: "00000000-0000-0000-0000-000000000000",
            status: "ucastnil_se",
          },
        ],
      }),
      422,
      "VALIDATION_ERROR",
    );
    const seznam = await volej(
      "GET",
      `/api/expeditions/${idVypravy}/ucastnici`,
      cookieAdmin,
    );
    zkontroluj("GET účastníci → 200", seznam, 200);
    const ucastnici: unknown = (
      seznam.telo as { ucastnici?: unknown }
    ).ucastnici;
    const prvniId: unknown =
      Array.isArray(ucastnici) &&
      typeof (ucastnici[0] as { id?: unknown } | undefined)?.id === "string"
        ? (ucastnici[0] as { id: string }).id
        : null;
    if (prvniId === null) throw new Error("chybí účastník pro docházku");
    zkontroluj(
      "uzavřít s docházkou → 200",
      await volej("PATCH", `/api/expeditions/${idVypravy}/uzavrit`, cookieAdmin, {
        dochazka: [{ ucastnikId: prvniId, status: "ucastnil_se" }],
      }),
      200,
    );
    zkontroluj(
      "opakované uzavření → 409 VYPRAVA_UZAVRENA",
      await volej("PATCH", `/api/expeditions/${idVypravy}/uzavrit`, cookieAdmin, {
        dochazka: [{ ucastnikId: prvniId, status: "ucastnil_se" }],
      }),
      409,
      "VYPRAVA_UZAVRENA",
    );
    zkontroluj(
      "přihlášení na uzavřenou → 409 VYPRAVA_UZAVRENA",
      await volej("POST", `/api/expeditions/${idVypravy}/prihlasit`, cookieUser2, {}),
      409,
      "VYPRAVA_UZAVRENA",
    );

    // 12) Smazání → 200, opakovaně → 404
    zkontroluj(
      "DELETE expedice → 200",
      await volej("DELETE", `/api/expeditions/${idVypravy}`, cookieAdmin),
      200,
    );
    idVypravy = "";
    zkontroluj(
      "GET smazané → 404",
      await volej("GET", `/api/expeditions/${noveId}`, null),
      404,
      "NENALEZENO",
    );
  } finally {
    // Cleanup — po běhu nezůstane nic (best effort, bez logování secretů).
    try {
      if (idVypravy.length > 0) {
        await db.delete(expeditions).where(inArray(expeditions.id, [idVypravy]));
      }
      await db
        .delete(users)
        .where(inArray(users.email, [email1, email2, email3]));
      await db
        .delete(registrationCodes)
        .where(inArray(registrationCodes.code, [kodExpirovany, kodPlatny]));
    } catch (chyba) {
      process.stderr.write(
        `cleanup varování: ${chyba instanceof Error ? chyba.message : "neznámá chyba"}\n`,
      );
    }
  }

  if (selhani > 0) {
    throw new Error(`smoke 3b: ${String(selhani)} kontrol selhalo`);
  }
  process.stdout.write("smoke 3b: vše prošlo\n");
}

main().catch((chyba: unknown) => {
  const zprava = chyba instanceof Error ? chyba.message : "neznámá chyba";
  process.stderr.write(`smoke 3b SELHALO: ${zprava}\n`);
  process.exitCode = 1;
});
