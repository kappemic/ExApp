/**
 * scripts/smoke-krok7.ts — Krok 7: živý smoke Fáze 2 proti běžícímu serveru.
 *
 * Cyklus: vytvoř test výpravu → přihlas → odhlas → znovu přihlas →
 * uzavři s docházkou → fotky (422/403/201/200/404) → smaž.
 * Setup (kódy) i cleanup (výprava, uživatelé, kódy) jde přímo přes
 * DATABASE_URL z .env.local — po běhu nezůstane nic. Secrety se nelogují.
 *
 * Spuštění: nejdřív `npm run server:dev`, pak `npx tsx scripts/smoke-krok7.ts`.
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
const HESLO = "SmokeKrok7Heslo123";

function vytvorDb(): ReturnType<typeof drizzle> {
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

/** Vytáhne session cookie z registrace. */
async function cookieZRegistrace(email: string, kod: string): Promise<string> {
  const odp = await fetch(`${BASE}/api/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jmeno: "Krok7", email, heslo: HESLO, kod }),
  });
  if (odp.status !== 201) {
    const telo = (await odp.json().catch(() => null)) as unknown;
    throw new Error(
      `registrace selhala (${String(odp.status)} ${kodChyby(telo) ?? ""})`,
    );
  }
  const raw = odp.headers.getSetCookie();
  const session = raw.find((radek) => radek.startsWith("exapp_session="));
  if (session === undefined) throw new Error("chybí session cookie");
  const konec = session.indexOf(";");
  return konec === -1 ? session : session.slice(0, konec);
}

function idZExpedice(telo: unknown): string | null {
  if (typeof telo !== "object" || telo === null) return null;
  const expedice = (telo as { expedice?: { id?: unknown } }).expedice;
  return typeof expedice?.id === "string" && expedice.id.length > 0
    ? expedice.id
    : null;
}

function prvniUcastnikId(telo: unknown): string | null {
  if (typeof telo !== "object" || telo === null) return null;
  const ucastnici = (telo as { ucastnici?: unknown }).ucastnici;
  if (!Array.isArray(ucastnici) || ucastnici.length === 0) return null;
  const prvni = ucastnici[0] as { id?: unknown };
  return typeof prvni.id === "string" ? prvni.id : null;
}

function idZFotky(telo: unknown): string | null {
  if (typeof telo !== "object" || telo === null) return null;
  const fotka = (telo as { fotka?: { id?: unknown } }).fotka;
  return typeof fotka?.id === "string" && fotka.id.length > 0 ? fotka.id : null;
}

async function main(): Promise<void> {
  const zdravi = await volej("GET", "/api/health", null);
  if (zdravi.status !== 200) {
    throw new Error(`server neběží na ${BASE} — spusť npm run server:dev`);
  }

  const db = vytvorDb();
  const znacka = String(Date.now());
  const emailAdmin = `krok7-${znacka}-admin@example.cz`;
  const emailUser = `krok7-${znacka}-user@example.cz`;
  const kodPlatny = nahodnyKodSmoke();
  const fotkaUrl = `https://example.cz/krok7-${znacka}.jpg`;
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
    // 1) Registrace + povýšení na ADMINa (role se čte čerstvě z DB).
    await db.insert(registrationCodes).values({
      code: kodPlatny,
      createdBy: null,
      expiresAt: new Date(Date.now() + 10 * 60_000),
    });
    const cookieAdmin = await cookieZRegistrace(emailAdmin, kodPlatny);
    const cookieUser = await cookieZRegistrace(emailUser, kodPlatny);
    await db
      .update(users)
      .set({ role: "admin" })
      .where(inArray(users.email, [emailAdmin]));

    // 2) Vytvoř test výpravu (ADMIN → 201).
    const vytvorena = await volej("POST", "/api/expeditions", cookieAdmin, {
      nazev: `Krok7 výprava ${znacka}`,
      datum: zitraYmd(),
      sraz: "Klubovna 18:00",
      popis: "Smoke test Kroku 7.",
      kapacitaCelkem: 5,
    });
    zkontroluj("POST expedice → 201", vytvorena, 201);
    const noveId = idZExpedice(vytvorena.telo);
    if (noveId === null) throw new Error("tvorba nevrátila id výpravy");
    idVypravy = noveId;

    // 3) Přihlas (USER → 201), duplicita → 409.
    zkontroluj(
      "POST přihlásit → 201",
      await volej(
        "POST",
        `/api/expeditions/${idVypravy}/prihlasit`,
        cookieUser,
        {},
      ),
      201,
    );
    zkontroluj(
      "POST přihlásit znovu → 409 UZ_PRIHLASEN",
      await volej(
        "POST",
        `/api/expeditions/${idVypravy}/prihlasit`,
        cookieUser,
        {},
      ),
      409,
      "UZ_PRIHLASEN",
    );

    // 4) Odhlas (USER → 200) + znovu přihlas (→ 201).
    zkontroluj(
      "DELETE odhlásit → 200",
      await volej(
        "DELETE",
        `/api/expeditions/${idVypravy}/odhlasit`,
        cookieUser,
      ),
      200,
    );
    zkontroluj(
      "POST přihlásit po odhlášení → 201",
      await volej(
        "POST",
        `/api/expeditions/${idVypravy}/prihlasit`,
        cookieUser,
        {},
      ),
      201,
    );

    // 5) Uzavři s docházkou (ADMIN → 200), opakovaně → 409.
    const seznam = await volej(
      "GET",
      `/api/expeditions/${idVypravy}/ucastnici`,
      cookieAdmin,
    );
    zkontroluj("GET účastníci → 200", seznam, 200);
    const ucastnikId = prvniUcastnikId(seznam.telo);
    if (ucastnikId === null) throw new Error("chybí účastník pro docházku");
    zkontroluj(
      "PATCH uzavřít → 200",
      await volej(
        "PATCH",
        `/api/expeditions/${idVypravy}/uzavrit`,
        cookieAdmin,
        { dochazka: [{ ucastnikId, status: "ucastnil_se" }] },
      ),
      200,
    );
    zkontroluj(
      "opakované uzavření → 409 VYPRAVA_UZAVRENA",
      await volej(
        "PATCH",
        `/api/expeditions/${idVypravy}/uzavrit`,
        cookieAdmin,
        { dochazka: [{ ucastnikId, status: "ucastnil_se" }] },
      ),
      409,
      "VYPRAVA_UZAVRENA",
    );

    // 6) Fotky k proběhlé: hranice + CRUD.
    zkontroluj(
      "GET fotky je veřejný → 200",
      await volej("GET", `/api/expeditions/${idVypravy}/fotky`, null),
      200,
    );
    zkontroluj(
      "POST fotka http → 422",
      await volej(
        "POST",
        `/api/expeditions/${idVypravy}/fotky`,
        cookieAdmin,
        { url: "http://example.cz/foto.jpg" },
      ),
      422,
      "VALIDATION_ERROR",
    );
    zkontroluj(
      "POST fotka jako USER → 403",
      await volej(
        "POST",
        `/api/expeditions/${idVypravy}/fotky`,
        cookieUser,
        { url: fotkaUrl },
      ),
      403,
      "ZAKAZANO",
    );
    const pridana = await volej(
      "POST",
      `/api/expeditions/${idVypravy}/fotky`,
      cookieAdmin,
      { url: fotkaUrl, popis: "Krok7 památka" },
    );
    zkontroluj("POST fotka → 201", pridana, 201);
    const fotkaId = idZFotky(pridana.telo);
    if (fotkaId === null) throw new Error("přidání nevrátilo id fotky");
    zkontroluj(
      "DELETE fotka jako USER → 403",
      await volej(
        "DELETE",
        `/api/expeditions/${idVypravy}/fotky/${fotkaId}`,
        cookieUser,
      ),
      403,
      "ZAKAZANO",
    );
    zkontroluj(
      "DELETE fotka → 200",
      await volej(
        "DELETE",
        `/api/expeditions/${idVypravy}/fotky/${fotkaId}`,
        cookieAdmin,
      ),
      200,
    );
    zkontroluj(
      "DELETE fotka znovu → 404",
      await volej(
        "DELETE",
        `/api/expeditions/${idVypravy}/fotky/${fotkaId}`,
        cookieAdmin,
      ),
      404,
      "NENALEZENO",
    );

    // 7) Smaž výpravu (ADMIN → 200), pak → 404.
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
    // Cleanup — po běhu nezůstane nic (best effort, bez secretů).
    try {
      if (idVypravy.length > 0) {
        await db.delete(expeditions).where(inArray(expeditions.id, [idVypravy]));
      }
      await db
        .delete(users)
        .where(inArray(users.email, [emailAdmin, emailUser]));
      await db
        .delete(registrationCodes)
        .where(inArray(registrationCodes.code, [kodPlatny]));
    } catch (chyba) {
      process.stderr.write(
        `cleanup varování: ${chyba instanceof Error ? chyba.message : "neznámá chyba"}\n`,
      );
    }
  }

  if (selhani > 0) {
    throw new Error(`smoke krok7: ${String(selhani)} kontrol selhalo`);
  }
  process.stdout.write("smoke krok7: vše prošlo\n");
}

main().catch((chyba: unknown) => {
  const zprava = chyba instanceof Error ? chyba.message : "neznámá chyba";
  process.stderr.write(`smoke krok7 SELHALO: ${zprava}\n`);
  process.exitCode = 1;
});
