/**
 * scripts/smoke-faze5-discord.ts — Krok 2 Fáze 5: smoke Discordu proti živému BFF.
 *
 * Ověřuje napojení notifikací bez reálného Discordu (fail-open):
 *   health → POST /api/oznameni bez session → 401 NEPRIHLASEN →
 *   POST /api/expeditions bez session → 401 NEPRIHLASEN →
 *   nesmysl bez session → 401 (guard před validací, ne 422) →
 *   s loginem: POST /api/oznameni → 201 + { ok: true } (projde i při
 *   mrtvém Discordu i bez DISCORD_WEBHOOK_URL — tichý skip na serveru) →
 *   nesmysl s loginem → 422 → POST /api/expeditions → 201 (fail-open) →
 *   odpověď bez secretu → DELETE úklid.
 *
 * Auth: JWT v httpOnly cookie `exapp_session` — skript se přihlásí přes
 * POST /api/login a drží cookie jar ve fetchi. Všechny secrety (e-maily,
 * hesla, base URL) čte JEN z proměnných prostředí za běhu, nikdy nejsou
 * natvrdo v kódu a nikdy se nelogují (ani webhook URL). Žádný přímý
 * přístup do DB.
 *
 * Spuštění: nejdřív `npm run server:start` (BFF na :3001), pak
 *   $env:SMOKE_ADMIN_EMAIL="..."; $env:SMOKE_ADMIN_HESLO="..."
 *   npm run smoke:faze5-discord
 * Výstup: české řádky PASS/FAIL/SKIP + souhrn, exit kód 0/1.
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
  telo?: Record<string, unknown>,
): Promise<Odpoved> {
  const hlavicky: Record<string, string> = {};
  if (cookie !== null && cookie.length > 0) hlavicky["Cookie"] = cookie;
  let zadani: string | undefined = undefined;
  if (telo !== undefined) {
    hlavicky["Content-Type"] = "application/json";
    zadani = JSON.stringify(telo);
  }
  const odp = await fetch(`${BASE}${cesta}`, {
    method: metoda,
    headers: hlavicky,
    body: zadani,
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

/** Datum o 30 dní v budoucnosti v lokálním YYYY-MM-DD (tvorba výpravy). */
function budouciDatum(): string {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  const rok = d.getFullYear();
  const mesic = String(d.getMonth() + 1).padStart(2, "0");
  const den = String(d.getDate()).padStart(2, "0");
  return `${rok}-${mesic}-${den}`;
}

function idExpediceZTela(telo: unknown): string | null {
  if (typeof telo !== "object" || telo === null) return null;
  const expedice = (telo as { expedice?: unknown }).expedice;
  if (typeof expedice !== "object" || expedice === null) return null;
  const id = (expedice as { id?: unknown }).id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

/** Odpověď nesmí nést secret ani webhook URL (povolená slova se nevyskytnou). */
function bezSecretu(telo: unknown): boolean {
  const text = JSON.stringify(telo ?? null).toLowerCase();
  return (
    !text.includes("webhook") &&
    !text.includes("token") &&
    !text.includes("secret")
  );
}

function jeOznameniOdpoved(telo: unknown): boolean {
  if (typeof telo !== "object" || telo === null) return false;
  return (telo as { ok?: unknown }).ok === true;
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

  const zdravi = await volej("GET", "/api/health", null);
  if (zdravi.status !== 200) {
    process.stderr.write(
      `FAIL - Server neběží na ${BASE}. Nejdřív spusť BFF (npm run server:start).\n`,
    );
    process.exitCode = 1;
    return;
  }
  ok("server běží");

  const oznameniTelo: Record<string, unknown> = {
    nazev: "Smoke test — ignoruj",
    text: "Automatický smoke Fáze 5, nic se neděje.",
  };

  // 1) Guard: bez session vždy 401 NEPRIHLASEN (i nesmysl — guard před validací).
  zkontroluj(
    "oznámení bez přihlášení je odmítnuto",
    await volej("POST", "/api/oznameni", null, oznameniTelo),
    401,
    "NEPRIHLASEN",
  );
  zkontroluj(
    "vytvoření výpravy bez přihlášení je odmítnuto",
    await volej("POST", "/api/expeditions", null, {
      nazev: "Smoke výprava",
      datum: budouciDatum(),
      sraz: "Praha 8:00",
      kapacitaCelkem: 0,
    }),
    401,
    "NEPRIHLASEN",
  );
  zkontroluj(
    "nesmysl bez přihlášení hlídá guard, ne validace",
    await volej("POST", "/api/oznameni", null, { nesmysl: 1 }),
    401,
    "NEPRIHLASEN",
  );

  // 2) Pozitivní s loginem — jen když je v env admin účet, jinak SKIP.
  if (ADMIN_EMAIL === undefined || ADMIN_HESLO === undefined) {
    preskoceno(
      "oznámení s přihlášením (201, fail-open)",
      "není SMOKE_ADMIN_EMAIL/SMOKE_ADMIN_HESLO v prostředí, nic se nemění",
    );
    preskoceno(
      "výprava s přihlášením (201, fail-open)",
      "není SMOKE_ADMIN_EMAIL/SMOKE_ADMIN_HESLO v prostředí, nic se nemění",
    );
  } else {
    const cookieAdmin = await prihlasitPresLogin(ADMIN_EMAIL, ADMIN_HESLO);
    if (cookieAdmin === null) {
      process.stderr.write("FAIL - Přihlášení admina selhalo (zkontroluj env).\n");
      process.exitCode = 1;
      return;
    }
    ok("přihlášení admina");

    // 2a) Oznámení projde i při mrtvém Discordu (fail-open) / bez webhooku (skip).
    const oznameni = await volej("POST", "/api/oznameni", cookieAdmin, oznameniTelo);
    zkontroluj("oznámení s přihlášením (Discord mock)", oznameni, 201);
    if (oznameni.status === 201) {
      if (jeOznameniOdpoved(oznameni.telo) && bezSecretu(oznameni.telo)) {
        ok("oznámení vrací { ok: true } bez secretu");
      } else {
        selhalo(
          "oznámení vrací { ok: true } bez secretu",
          "{ ok: true } bez webhook/token/secret",
          oznameni,
        );
      }
    }

    // 2b) Nevalidní oznámení s loginem → 422 (guard prošel, chytá validace).
    zkontroluj(
      "prázdné oznámení je odmítnuto",
      await volej("POST", "/api/oznameni", cookieAdmin, { nazev: "Ne", text: "" }),
      422,
      "VALIDATION_ERROR",
    );

    // 2c) Výprava projde i při mrtvém Discordu (fail-open) → 201.
    const nazevVypravy = `Smoke Discord ${String(Date.now()).slice(-8)}`;
    const vyprava = await volej("POST", "/api/expeditions", cookieAdmin, {
      nazev: nazevVypravy,
      datum: budouciDatum(),
      sraz: "Praha, Hlavní nádraží 8:00",
      kapacitaCelkem: 0,
    });
    zkontroluj("výprava s přihlášením (Discord mock)", vyprava, 201);
    const idVypravy = idExpediceZTela(vyprava.telo);
    if (vyprava.status === 201) {
      if (bezSecretu(vyprava.telo)) {
        ok("výprava vrací tělo bez secretu");
      } else {
        selhalo(
          "výprava vrací tělo bez secretu",
          "tělo bez webhook/token/secret",
          vyprava,
        );
      }
    }

    // 2d) Úklid smoke výpravy (best-effort, nemaskuje výsledek).
    if (idVypravy !== null) {
      const smazani = await volej(
        "DELETE",
        `/api/expeditions/${idVypravy}`,
        cookieAdmin,
      );
      if (smazani.status === 200) {
        ok("úklid smoke výpravy (200)");
      } else {
        preskoceno(
          "úklid smoke výpravy",
          `BFF vrátilo ${String(smazani.status)} — smaž ručně výpravu „${nazevVypravy}"`,
        );
      }
    } else if (vyprava.status === 201) {
      preskoceno(
        "úklid smoke výpravy",
        "z odpovědi nešlo přečíst id — zkontroluj seznam výprav",
      );
    }
  }

  process.stdout.write(
    `Souhrn: ${String(pass)} PASS, ${String(fail)} FAIL, ${String(skip)} SKIP\n`,
  );
  if (fail > 0) {
    process.stdout.write("Smoke Fáze 5 Discord: NEÚSPĚCH\n");
    process.exitCode = 1;
  } else {
    process.stdout.write("Smoke Fáze 5 Discord: ÚSPĚCH\n");
  }
}

main().catch((chyba: unknown) => {
  const zprava = chyba instanceof Error ? chyba.message : "neznámá chyba";
  process.stderr.write(`Smoke Fáze 5 Discord SELHALO: ${zprava}\n`);
  process.exitCode = 1;
});
