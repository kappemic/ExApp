/**
 * scripts/smoke-faze3.ts — Krok 1: automatizovaný smoke Fáze 3 proti živému BFF.
 *
 * Tok na TESTOVACÍ schůzce (na konci se smaže přes API):
 *   create → detail → seznam obsahuje → upravit → smazat → detail po smazání.
 * Negativní větve:
 *   USER na zápis (POST/PATCH) → 403 (jen když je v env i ne-admin účet,
 *     jinak SKIP — uživatelé se přes API nemažou, nic se nevytváří),
 *   nevalidní tělo (POST/PATCH) → 422 VALIDATION_ERROR (nic se nezapíše),
 *   zápis bez session → 401 NEPRIHLASEN,
 *   detail neexistující schůzky → 404 NENALEZENO.
 *
 * Auth: JWT v httpOnly cookie `exapp_session` — skript se přihlásí přes
 * POST /api/login a drží cookie jar ve fetchi. Všechny secrety (e-maily,
 * hesla, base URL) čte JEN z proměnných prostředí za běhu, nikdy nejsou
 * natvrdo v kódu a nikdy se nelogují. Žádný přímý přístup do DB.
 *
 * Spuštění: nejdřív `npm run server:start` (BFF na :3001), pak
 *   $env:SMOKE_ADMIN_EMAIL="..."; $env:SMOKE_ADMIN_HESLO="..."
 *   npm run smoke:faze3
 * Výstup: české řádky PASS/FAIL/SKIP + souhrn, exit kód 0/1, bez dumpu DB.
 */

import dotenv from "dotenv";
import { resolve } from "node:path";

dotenv.config({ path: resolve(process.cwd(), ".env.local") });
dotenv.config();

const PORT: number = Number.parseInt(process.env["PORT"] ?? "3001", 10);
const BASE: string =
  process.env["SMOKE_BASE_URL"] ??
  process.env["VITE_API_BASE_URL"] ??
  `http://localhost:${Number.isFinite(PORT) && PORT > 0 ? PORT : 3001}`;
const ADMIN_EMAIL: string | undefined = process.env["SMOKE_ADMIN_EMAIL"];
const ADMIN_HESLO: string | undefined = process.env["SMOKE_ADMIN_HESLO"];
const USER_EMAIL: string | undefined = process.env["SMOKE_USER_EMAIL"];
const USER_HESLO: string | undefined = process.env["SMOKE_USER_HESLO"];

/** Neexistující id pro 404 větev (platné UUID, v DB nikdy není). */
const NEEXISTUJICI_ID = "00000000-0000-4000-8000-ffffffffffff";

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

/** Z Set-Cookie vytáhne `exapp_session=…` (jen hodnotu cookie, ne secret do logu). */
function sessionCookieZOff(odp: Response): string | null {
  const raw: string[] = odp.headers.getSetCookie();
  const session = raw.find((radek) => radek.startsWith("exapp_session="));
  if (session === undefined) return null;
  const konec = session.indexOf(";");
  return konec === -1 ? session : session.slice(0, konec);
}

async function prihlasitPresLogin(email: string, heslo: string): Promise<string | null> {
  const odp = await fetch(`${BASE}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, heslo }),
  });
  if (odp.status !== 200) return null;
  return sessionCookieZOff(odp);
}

function idZSchuzky(telo: unknown): string | null {
  if (typeof telo !== "object" || telo === null) return null;
  const schuzka = (telo as { schuzka?: { id?: unknown } }).schuzka;
  return typeof schuzka?.id === "string" && schuzka.id.length > 0
    ? schuzka.id
    : null;
}

function nazevZSchuzky(telo: unknown): string | null {
  if (typeof telo !== "object" || telo === null) return null;
  const schuzka = (telo as { schuzka?: { nazev?: unknown } }).schuzka;
  return typeof schuzka?.nazev === "string" ? schuzka.nazev : null;
}

function seznamObsahujeSchuzku(telo: unknown, id: string): boolean {
  if (typeof telo !== "object" || telo === null) return false;
  const schuzky = (telo as { schuzky?: unknown }).schuzky;
  if (!Array.isArray(schuzky)) return false;
  return (schuzky as Array<{ id?: unknown }>).some((radek) => radek.id === id);
}

async function main(): Promise<void> {
  let pass = 0;
  let fail = 0;
  let skip = 0;

  function ok(nazev: string): void {
    pass += 1;
    process.stdout.write(`PASS - ${nazev}\n`);
  }

  function selhalo(nazev: string, ocekavano: string, odp: Odpoved): void {
    fail += 1;
    const kod = kodChyby(odp.telo);
    process.stdout.write(
      `FAIL - ${nazev}: čekáno ${ocekavano}, ` +
        `dostáno ${String(odp.status)}${kod === null ? "" : `/${kod}`}\n`,
    );
  }

  function preskoceno(nazev: string, duvod: string): void {
    skip += 1;
    process.stdout.write(`SKIP - ${nazev}: ${duvod}\n`);
  }

  function zkontroluj(nazev: string, odp: Odpoved, status: number, kod?: string): void {
    const skutecnyKod = kodChyby(odp.telo);
    const jeOk =
      odp.status === status && (kod === undefined || skutecnyKod === kod);
    if (jeOk) {
      ok(`${nazev} (${String(status)})`);
    } else {
      selhalo(
        nazev,
        `${String(status)}${kod === undefined ? "" : `/${kod}`}`,
        odp,
      );
    }
  }

  if (ADMIN_EMAIL === undefined || ADMIN_HESLO === undefined) {
    process.stderr.write(
      "FAIL - Chybí SMOKE_ADMIN_EMAIL nebo SMOKE_ADMIN_HESLO v prostředí. " +
        "Nastav je a spusť znovu.\n",
    );
    process.exitCode = 1;
    return;
  }
  const adminEmail: string = ADMIN_EMAIL;
  const adminHeslo: string = ADMIN_HESLO;

  const zdravi = await volej("GET", "/api/health", null);
  if (zdravi.status !== 200) {
    process.stderr.write(
      `FAIL - Server neběží na ${BASE}. Nejdřív spusť BFF (npm run server:start).\n`,
    );
    process.exitCode = 1;
    return;
  }
  ok("server běží");

  const cookieAdmin = await prihlasitPresLogin(adminEmail, adminHeslo);
  if (cookieAdmin === null) {
    process.stderr.write("FAIL - Přihlášení admina selhalo (zkontroluj env).\n");
    process.exitCode = 1;
    return;
  }
  ok("přihlášení admina");

  let cookieUser: string | null = null;
  if (USER_EMAIL !== undefined && USER_HESLO !== undefined) {
    cookieUser = await prihlasitPresLogin(USER_EMAIL, USER_HESLO);
    if (cookieUser === null) {
      preskoceno(
        "negativní větev USER → 403",
        "přihlášení ne-admin účtu selhalo, nic se nemění",
      );
    } else {
      ok("přihlášení ne-admin uživatele");
    }
  } else {
    preskoceno(
      "negativní větev USER → 403",
      "není SMOKE_USER_EMAIL/SMOKE_USER_HESLO v prostředí, nic se nemění",
    );
  }

  const znacka = String(Date.now());
  let idSchuzky = "";

  try {
    // 1) CREATE testovací schůzky (dual-guard → 201).
    const vytvorena = await volej("POST", "/api/meetings", cookieAdmin, {
      nazev: `SMOKE Fáze 3 ${znacka}`,
      datum: zitraYmd(),
      mistnost: "Klubovna",
      popis: "Automatizovaný smoke Fáze 3 (smaže se).",
      opakovani: "jednorazova",
    });
    zkontroluj("vytvoření schůzky", vytvorena, 201);
    const noveId = idZSchuzky(vytvorena.telo);
    if (noveId === null) throw new Error("tvorba nevrátila id schůzky");
    idSchuzky = noveId;

    // 2) Detail a seznam (PUBLIC → 200).
    const detail = await volej("GET", `/api/meetings/${idSchuzky}`, null);
    zkontroluj("detail schůzky", detail, 200);
    if (idZSchuzky(detail.telo) === idSchuzky) {
      ok("detail vrací správné id");
    } else {
      selhalo("detail vrací správné id", "id schůzky v GET detail", detail);
    }
    const seznam = await volej("GET", "/api/meetings", null);
    zkontroluj("seznam schůzek", seznam, 200);
    if (seznamObsahujeSchuzku(seznam.telo, idSchuzky)) {
      ok("schůzka je v seznamu");
    } else {
      selhalo("schůzka je v seznamu", "id schůzky v GET /api/meetings", seznam);
    }

    // 3) Negativní: USER na zápis → 403 (guard před validací, prázdné tělo stačí).
    if (cookieUser !== null) {
      zkontroluj(
        "USER nesmí vytvořit schůzku",
        await volej("POST", "/api/meetings", cookieUser, {}),
        403,
        "ZAKAZANO",
      );
      zkontroluj(
        "USER nesmí upravit schůzku",
        await volej(
          "PATCH",
          `/api/meetings/${idSchuzky}`,
          cookieUser,
          { nazev: `SMOKE Fáze 3 pokus ${znacka}` },
        ),
        403,
        "ZAKAZANO",
      );
    }

    // 4) Negativní: zápis bez session → 401.
    zkontroluj(
      "vytvoření bez přihlášení je odmítnuto",
      await volej("POST", "/api/meetings", null, {
        nazev: `SMOKE Fáze 3 ${znacka}`,
        datum: zitraYmd(),
      }),
      401,
      "NEPRIHLASEN",
    );
    zkontroluj(
      "úprava bez přihlášení je odmítnuta",
      await volej(
        "PATCH",
        `/api/meetings/${idSchuzky}`,
        null,
        { nazev: `SMOKE Fáze 3 pokus ${znacka}` },
      ),
      401,
      "NEPRIHLASEN",
    );

    // 5) Negativní: nevalidní tělo → 422 (nic se nezapíše).
    zkontroluj(
      "nevalidní vytvoření je odmítnuto",
      await volej("POST", "/api/meetings", cookieAdmin, {
        nazev: "X",
        datum: "ne-datum",
      }),
      422,
      "VALIDATION_ERROR",
    );
    zkontroluj(
      "nevalidní úprava je odmítnuta",
      await volej("PATCH", `/api/meetings/${idSchuzky}`, cookieAdmin, {
        nazev: "XX",
      }),
      422,
      "VALIDATION_ERROR",
    );

    // 6) PATCH platnou změnou (dual-guard → 200).
    const novyNazev = `SMOKE Fáze 3 upraveno ${znacka}`;
    const upravena = await volej(
      "PATCH",
      `/api/meetings/${idSchuzky}`,
      cookieAdmin,
      { nazev: novyNazev, mistnost: "Klubovna 2" },
    );
    zkontroluj("úprava schůzky", upravena, 200);
    if (nazevZSchuzky(upravena.telo) === novyNazev) {
      ok("úprava se propsala");
    } else {
      selhalo("úprava se propsala", "nový název v PATCH odpovědi", upravena);
    }

    // 7) Negativní: detail neexistující schůzky → 404.
    zkontroluj(
      "detail neexistující schůzky",
      await volej("GET", `/api/meetings/${NEEXISTUJICI_ID}`, null),
      404,
      "NENALEZENO",
    );

    // 8) DELETE testovací schůzky → 200, pak → 404.
    zkontroluj(
      "smazání testovací schůzky",
      await volej("DELETE", `/api/meetings/${idSchuzky}`, cookieAdmin),
      200,
    );
    idSchuzky = "";
    zkontroluj(
      "smazaná schůzka už neexistuje",
      await volej("GET", `/api/meetings/${noveId}`, null),
      404,
      "NENALEZENO",
    );
    zkontroluj(
      "opakované smazání končí 404",
      await volej("DELETE", `/api/meetings/${noveId}`, cookieAdmin),
      404,
      "NENALEZENO",
    );
  } catch (chyba: unknown) {
    fail += 1;
    const zprava = chyba instanceof Error ? chyba.message : "neznámá chyba";
    process.stdout.write(`FAIL - neočekávaná chyba: ${zprava}\n`);
  } finally {
    // Úklid přes API — best effort.
    if (idSchuzky.length > 0 && cookieAdmin !== null) {
      try {
        await volej("DELETE", `/api/meetings/${idSchuzky}`, cookieAdmin);
      } catch {
        // Úklid nesmí překrýt výsledek — chyba už je započítaná.
      }
    }
  }

  process.stdout.write(
    `Souhrn: ${String(pass)} PASS, ${String(fail)} FAIL, ${String(skip)} SKIP\n`,
  );
  if (fail > 0) {
    process.stdout.write("Smoke Fáze 3: NEÚSPĚCH\n");
    process.exitCode = 1;
  } else {
    process.stdout.write("Smoke Fáze 3: ÚSPĚCH\n");
  }
}

main().catch((chyba: unknown) => {
  const zprava = chyba instanceof Error ? chyba.message : "neznámá chyba";
  process.stderr.write(`Smoke Fáze 3 SELHALO: ${zprava}\n`);
  process.exitCode = 1;
});
