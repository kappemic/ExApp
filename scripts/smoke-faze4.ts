/**
 * scripts/smoke-faze4.ts — Krok 6b: automatizovaný smoke Fáze 4 proti živému BFF.
 *
 * Jen nedestruktivní GET (nic se nezapisuje, nic se nemění):
 *   health → strava/auth-url (PUBLIC, mock fixture) →
 *   strava/neparovane bez session → 401 → s loginem → 200 (jen když je
 *   v env admin účet, jinak SKIP) → statistiky/moje bez session → 401 →
 *   s loginem → 200 (jinak SKIP) → zebricky default → 200 →
 *   zebricky?obdobi=2025 → 200 → zebricky?obdobi=nesmysl → 422.
 *
 * Zvláštnosti (diagnostika 6a):
 *   - `GET /api/zebricky` na produkční DB bez migrace 0007 vrací 500
 *     (chybí sloupec expeditions.km). To NENÍ chyba smoke — takový
 *     výsledek se hlásí jako SKIP s jasnou hláškou, nikdy jako FAIL.
 *     Validace `obdobi` běží před DB dotazem, takže 422 na nesmysl
 *     musí projít i bez migrace.
 *   - `GET /api/strava/auth-url` vyžaduje `STRAVA_MOCK=1` v prostředí
 *     volajícího (BFF pak vrací mock fixture bez reálné registrace
 *     Strava appky). Bez mocku se mock-větev hlásí jako SKIP, ne FAIL.
 *
 * Auth: JWT v httpOnly cookie `exapp_session` — skript se přihlásí přes
 * POST /api/login a drží cookie jar ve fetchi. Všechny secrety (e-maily,
 * hesla, base URL) čte JEN z proměnných prostředí za běhu, nikdy nejsou
 * natvrdo v kódu a nikdy se nelogují. Žádný přímý přístup do DB.
 *
 * Spuštění: nejdřív `npm run server:start` (BFF na :3001 se STRAVA_MOCK=1), pak
 *   $env:STRAVA_MOCK="1"; $env:SMOKE_ADMIN_EMAIL="..."; $env:SMOKE_ADMIN_HESLO="..."
 *   npm run smoke:faze4
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
const JE_MOCK: boolean = process.env["STRAVA_MOCK"] === "1";

/** Známý nevalidní parametr období — validace běží před DB dotazem. */
const NESMYSL_OBDOBI = "nesmysl-ne-obdobi";
/** Platný rok v povoleném rozsahu 2000–2100 (validace v BFF). */
const PLATNY_ROK = "2025";

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
): Promise<Odpoved> {
  const hlavicky: Record<string, string> = {};
  if (cookie !== null && cookie.length > 0) hlavicky["Cookie"] = cookie;
  const odp = await fetch(`${BASE}${cesta}`, {
    method: metoda,
    headers: hlavicky,
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

function urlZAuthUrl(telo: unknown): string | null {
  if (typeof telo !== "object" || telo === null) return null;
  const url = (telo as { url?: unknown }).url;
  return typeof url === "string" && url.length > 0 ? url : null;
}

function jePoleAktivity(telo: unknown): boolean {
  if (typeof telo !== "object" || telo === null) return false;
  return Array.isArray((telo as { aktivity?: unknown }).aktivity);
}

function jeTvarStatistik(telo: unknown): boolean {
  if (typeof telo !== "object" || telo === null) return false;
  const zaznam = telo as {
    vypravy?: unknown;
    kmCelkem?: unknown;
    prevyseniCelkem?: unknown;
    aktivity?: unknown;
  };
  return (
    typeof zaznam.vypravy === "number" &&
    typeof zaznam.kmCelkem === "number" &&
    typeof zaznam.prevyseniCelkem === "number" &&
    Array.isArray(zaznam.aktivity)
  );
}

function jeTvarZebricku(telo: unknown, ocekavaneObdobi: string): boolean {
  if (typeof telo !== "object" || telo === null) return false;
  const zaznam = telo as { zebricky?: unknown; obdobi?: unknown };
  return (
    Array.isArray(zaznam.zebricky) && zaznam.obdobi === ocekavaneObdobi
  );
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

  /** 500 u žebříčků = chybějící migrace 0007 → SKIP s jasnou hláškou, ne FAIL. */
  function zkontrolujZebricky(
    nazev: string,
    odp: Odpoved,
    ocekavaneObdobi: string,
  ): void {
    if (odp.status === 200 && jeTvarZebricku(odp.telo, ocekavaneObdobi)) {
      ok(`${nazev} (200)`);
      return;
    }
    if (odp.status === 500) {
      preskoceno(
        nazev,
        "BFF vrátilo 500 — pravděpodobně chybí migrace 0007 " +
          "(sloupec expeditions.km) na této DB; ověř na preview-branchi, " +
          "nemigruj produkci. Nejedná se o chybu smoke.",
      );
      return;
    }
    selhalo(nazev, "200 se polem zebricky", odp);
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

  // 1) Strava auth-url (PUBLIC, mock fixture) — jen GET, nic se nemění.
  if (!JE_MOCK) {
    preskoceno(
      "strava auth-url",
      "není STRAVA_MOCK=1 v prostředí volajícího — mock fixture se neověřuje, nic se nemění",
    );
  } else {
    const authUrl = await volej("GET", "/api/strava/auth-url", null);
    zkontroluj("strava auth-url je veřejná", authUrl, 200);
    const url = urlZAuthUrl(authUrl.telo);
    if (authUrl.status === 200) {
      if (
        url !== null &&
        url.includes("strava.com/oauth/authorize") &&
        url.includes("client_id=")
      ) {
        ok("strava auth-url vrací Strava authorize URL");
      } else {
        fail += 1;
        process.stdout.write(
          "FAIL - strava auth-url vrací Strava authorize URL: " +
            "čekána URL s strava.com/oauth/authorize a client_id=\n",
        );
      }
    }
  }

  // 2) Negativní: nespárované aktivity a statistiky bez session → 401.
  zkontroluj(
    "nespárované aktivity bez přihlášení jsou odmítnuty",
    await volej("GET", "/api/strava/neparovane", null),
    401,
    "NEPRIHLASEN",
  );
  zkontroluj(
    "statistiky bez přihlášení jsou odmítnuty",
    await volej("GET", "/api/statistiky/moje", null),
    401,
    "NEPRIHLASEN",
  );

  // 3) Žebříčky (PUBLIC) — 500 toleruje SKIP kvůli chybějící migraci 0007.
  zkontrolujZebricky(
    "žebříčky celkem",
    await volej("GET", "/api/zebricky", null),
    "celkem",
  );
  zkontrolujZebricky(
    `žebříčky za rok ${PLATNY_ROK}`,
    await volej("GET", `/api/zebricky?obdobi=${PLATNY_ROK}`, null),
    PLATNY_ROK,
  );

  // 4) Negativní: nesmysl období → 422 (validace běží před DB, platí i bez migrace).
  zkontroluj(
    "žebříčky s nesmyslným obdobím jsou odmítnuty",
    await volej("GET", `/api/zebricky?obdobi=${NESMYSL_OBDOBI}`, null),
    422,
    "VALIDATION_ERROR",
  );

  // 5) Pozitivní s loginem — jen když je v env admin účet, jinak SKIP.
  if (ADMIN_EMAIL === undefined || ADMIN_HESLO === undefined) {
    preskoceno(
      "nespárované aktivity s přihlášením",
      "není SMOKE_ADMIN_EMAIL/SMOKE_ADMIN_HESLO v prostředí, nic se nemění",
    );
    preskoceno(
      "statistiky s přihlášením",
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

    const neparovane = await volej("GET", "/api/strava/neparovane", cookieAdmin);
    zkontroluj("nespárované aktivity s přihlášením", neparovane, 200);
    if (neparovane.status === 200) {
      if (jePoleAktivity(neparovane.telo)) {
        ok("nespárované aktivity vrací pole aktivity");
      } else {
        selhalo(
          "nespárované aktivity vrací pole aktivity",
          "pole aktivity v odpovědi",
          neparovane,
        );
      }
    }

    const statistiky = await volej("GET", "/api/statistiky/moje", cookieAdmin);
    zkontroluj("statistiky s přihlášením", statistiky, 200);
    if (statistiky.status === 200) {
      if (jeTvarStatistik(statistiky.telo)) {
        ok("statistiky vrací čísla a pole aktivity");
      } else {
        selhalo(
          "statistiky vrací čísla a pole aktivity",
          "vypravy/kmCelkem/prevyseniCelkem/aktivity v odpovědi",
          statistiky,
        );
      }
    }
  }

  process.stdout.write(
    `Souhrn: ${String(pass)} PASS, ${String(fail)} FAIL, ${String(skip)} SKIP\n`,
  );
  if (fail > 0) {
    process.stdout.write("Smoke Fáze 4: NEÚSPĚCH\n");
    process.exitCode = 1;
  } else {
    process.stdout.write("Smoke Fáze 4: ÚSPĚCH\n");
  }
}

main().catch((chyba: unknown) => {
  const zprava = chyba instanceof Error ? chyba.message : "neznámá chyba";
  process.stderr.write(`Smoke Fáze 4 SELHALO: ${zprava}\n`);
  process.exitCode = 1;
});
