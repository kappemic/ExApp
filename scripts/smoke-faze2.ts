/**
 * scripts/smoke-faze2.ts — Krok 7: automatizovaný smoke Fáze 2 proti živému BFF.
 *
 * Tok na TESTOVACÍ výpravě (na konci se smaže přes API, CASCADE):
 *   create → fotka na neproběhlou (409) → prihlasit → odhlasit → znovu
 *   prihlasit → uzavrit s docházkou → POST/DELETE účastník po uzavření →
 *   POST/GET/DELETE fotka → DELETE výprava.
 * Negativní větve:
 *   USER na ADMIN routu → 403 (jen když je v env i ne-admin účet,
 *     jinak SKIP — uživatelé se přes API nemažou, nic se nevytváří),
 *   přihláška na proběhlou → 409 (pokus na existující proběhlé výpravě,
 *     409 nic nezapíše),
 *   fotka na neproběhlou → 409 (POST na testovací výpravu před uzavřením).
 *
 * Auth: JWT v httpOnly cookie `exapp_session` — skript se přihlásí přes
 * POST /api/login a drží cookie jar ve fetchi. Všechny secrety (e-maily,
 * hesla, base URL) čte JEN z proměnných prostředí za běhu, nikdy nejsou
 * natvrdo v kódu a nikdy se nelogují. Žádný přímý přístup do DB.
 *
 * Spuštění: nejdřív `npm run server:start` (BFF na :3001), pak
 *   $env:SMOKE_ADMIN_EMAIL="..."; $env:SMOKE_ADMIN_HESLO="..."
 *   npm run smoke:faze2
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

function idZPridanehoUcastnika(telo: unknown): string | null {
  if (typeof telo !== "object" || telo === null) return null;
  const ucastnik = (telo as { ucastnik?: { id?: unknown } }).ucastnik;
  return typeof ucastnik?.id === "string" && ucastnik.id.length > 0
    ? ucastnik.id
    : null;
}

/** Ze seznamu proběhlých vybere přednostně Křivoklátsko, jinak první. */
function vyberProbehlou(telo: unknown): string | null {
  if (typeof telo !== "object" || telo === null) return null;
  const expedice = (telo as { expedice?: unknown }).expedice;
  if (!Array.isArray(expedice) || expedice.length === 0) return null;
  const radky = expedice as Array<{ id?: unknown }>;
  const preferovana = radky.find((radek) => radek.id === "krivoklatsko-berounka");
  const vybrana = preferovana ?? radky[0];
  if (vybrana === undefined) return null;
  return typeof vybrana.id === "string" ? vybrana.id : null;
}

function prvniClenId(telo: unknown): string | null {
  if (typeof telo !== "object" || telo === null) return null;
  const clenove = (telo as { clenove?: unknown }).clenove;
  if (!Array.isArray(clenove) || clenove.length === 0) return null;
  const prvni = clenove[0] as { id?: unknown };
  return typeof prvni.id === "string" ? prvni.id : null;
}

/** Vlastní id z GET /api/me (odpověď je přímo ApiUser, ne obálka). */
function idZMe(telo: unknown): string | null {
  if (typeof telo !== "object" || telo === null) return null;
  const id = (telo as { id?: unknown }).id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

/** První uživatel z GET /api/users, který nejsem já (fallback za prázdné clenove). */
function prvniCiziUzivatel(telo: unknown, mojeId: string | null): string | null {
  if (typeof telo !== "object" || telo === null) return null;
  const seznam = (telo as { users?: unknown }).users;
  if (!Array.isArray(seznam)) return null;
  for (const radek of seznam as Array<{ id?: unknown }>) {
    if (typeof radek.id === "string" && radek.id.length > 0 && radek.id !== mojeId) {
      return radek.id;
    }
  }
  return null;
}

function fotkaObsahujeId(telo: unknown, fotkaId: string): boolean {
  if (typeof telo !== "object" || telo === null) return false;
  const fotky = (telo as { fotky?: unknown }).fotky;
  if (!Array.isArray(fotky)) return false;
  return (fotky as Array<{ id?: unknown }>).some(
    (fotka) => fotka.id === fotkaId,
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
  let idVypravy = "";

  try {
    // 1) CREATE testovací výpravy (ADMIN → 201).
    const vytvorena = await volej("POST", "/api/expeditions", cookieAdmin, {
      nazev: `SMOKE Fáze 2 ${znacka}`,
      datum: zitraYmd(),
      sraz: "Klubovna 18:00",
      popis: "Automatizovaný smoke Fáze 2 (smaže se).",
      kapacitaCelkem: 5,
    });
    zkontroluj("vytvoření výpravy", vytvorena, 201);
    const noveId = idZExpedice(vytvorena.telo);
    if (noveId === null) throw new Error("tvorba nevrátila id výpravy");
    idVypravy = noveId;

    // 2) Negativní: USER na ADMIN routu → 403.
    if (cookieUser !== null) {
      zkontroluj(
        "USER nesmí vytvořit výpravu",
        await volej("POST", "/api/expeditions", cookieUser, {}),
        403,
        "ZAKAZANO",
      );
    }

    // 3) Negativní: fotka na neproběhlou → 409 (před uzavřením).
    zkontroluj(
      "fotka na neproběhlou je odmítnuta",
      await volej("POST", `/api/expeditions/${idVypravy}/fotky`, cookieAdmin, {
        url: `https://example.cz/smoke-faze2-${znacka}.jpg`,
        popis: "Pokus před uzavřením",
      }),
      409,
      "VYPRAVA_UZAVRENA",
    );

    // 4) Přihlásit → 201, duplicita → 409, odhlásit → 200, znovu → 201.
    zkontroluj(
      "přihlášení na výpravu",
      await volej("POST", `/api/expeditions/${idVypravy}/prihlasit`, cookieAdmin, {}),
      201,
    );
    zkontroluj(
      "duplicitní přihláška je odmítnuta",
      await volej("POST", `/api/expeditions/${idVypravy}/prihlasit`, cookieAdmin, {}),
      409,
      "UZ_PRIHLASEN",
    );
    zkontroluj(
      "odhlášení z výpravy",
      await volej("DELETE", `/api/expeditions/${idVypravy}/odhlasit`, cookieAdmin),
      200,
    );
    zkontroluj(
      "přihlášení po odhlášení",
      await volej("POST", `/api/expeditions/${idVypravy}/prihlasit`, cookieAdmin, {}),
      201,
    );

    // 5) Uzavřít s docházkou (ADMIN → 200), opakovaně → 409.
    const seznam = await volej(
      "GET",
      `/api/expeditions/${idVypravy}/ucastnici`,
      cookieAdmin,
    );
    zkontroluj("seznam účastníků", seznam, 200);
    const ucastnikId = prvniUcastnikId(seznam.telo);
    if (ucastnikId === null) throw new Error("chybí účastník pro docházku");
    zkontroluj(
      "uzavření s docházkou",
      await volej("PATCH", `/api/expeditions/${idVypravy}/uzavrit`, cookieAdmin, {
        dochazka: [{ ucastnikId, status: "ucastnil_se" }],
      }),
      200,
    );
    zkontroluj(
      "opakované uzavření je odmítnuto",
      await volej("PATCH", `/api/expeditions/${idVypravy}/uzavrit`, cookieAdmin, {
        dochazka: [{ ucastnikId, status: "ucastnil_se" }],
      }),
      409,
      "VYPRAVA_UZAVRENA",
    );

    // 6) Negativní: přihláška na proběhlou → 409 (existující výprava, bez zápisu).
    const historie = await volej(
      "GET",
      "/api/expeditions?stav=prob%C4%9Bhl%C3%A1&page=1&pageSize=5",
      null,
    );
    const probehlaId = vyberProbehlou(historie.telo);
    if (probehlaId === null) {
      preskoceno(
        "přihláška na proběhlou je odmítnuta",
        "nenašla se žádná proběhlá výprava",
      );
    } else {
      zkontroluj(
        "přihláška na proběhlou je odmítnuta",
        await volej("POST", `/api/expeditions/${probehlaId}/prihlasit`, cookieAdmin, {}),
        409,
        "VYPRAVA_UZAVRENA",
      );
    }

    // 7) Dodatečná správa účastníků po uzavření (ADMIN → 201 → 200 → 404).
    // Primárně reálný člen (clenId); když je číselník členů prázdný,
    // fallback na jiného existujícího uživatele (jen účast na TEST výpravě,
    // kterou úklid smaže CASCADE — účet se nemění). Jinak SKIP.
    const clenoveOdp = await volej("GET", "/api/clenove", cookieAdmin);
    zkontroluj("seznam členů pro selektor", clenoveOdp, 200);
    let identita: Record<string, string> | null = null;
    const clenId = prvniClenId(clenoveOdp.telo);
    if (clenId !== null) {
      identita = { clenId };
    } else {
      const meOdp = await volej("GET", "/api/me", cookieAdmin);
      const mojeId = idZMe(meOdp.telo);
      const usersOdp = await volej("GET", "/api/users", cookieAdmin);
      zkontroluj("seznam uživatelů pro selektor", usersOdp, 200);
      const ciziId = prvniCiziUzivatel(usersOdp.telo, mojeId);
      if (ciziId !== null) identita = { userId: ciziId };
    }
    if (identita === null) {
      preskoceno(
        "dodatečná správa účastníků po uzavření",
        "není žádný člen ani jiný uživatel",
      );
    } else {
      const pridan = await volej(
        "POST",
        `/api/expeditions/${idVypravy}/ucastnici`,
        cookieAdmin,
        { ...identita, status: "ucastnil_se" },
      );
      zkontroluj("dodatečné přidání účastníka po uzavření", pridan, 201);
      const novyUcastnikId = idZPridanehoUcastnika(pridan.telo);
      if (novyUcastnikId === null) throw new Error("přidání nevrátilo id účastníka");
      zkontroluj(
        "odebrání dodatečného účastníka",
        await volej(
          "DELETE",
          `/api/expeditions/${idVypravy}/ucastnici/${novyUcastnikId}`,
          cookieAdmin,
        ),
        200,
      );
      zkontroluj(
        "opakované odebrání končí 404",
        await volej(
          "DELETE",
          `/api/expeditions/${idVypravy}/ucastnici/${novyUcastnikId}`,
          cookieAdmin,
        ),
        404,
        "NENALEZENO",
      );
    }

    // 8) Fotky k proběhlé: POST → 201, GET obsahuje → 200, DELETE → 200 → 404.
    const fotkaUrl = `https://example.cz/smoke-faze2-${znacka}.jpg`;
    if (cookieUser !== null) {
      zkontroluj(
        "USER nesmí přidat fotku",
        await volej("POST", `/api/expeditions/${idVypravy}/fotky`, cookieUser, {
          url: fotkaUrl,
        }),
        403,
        "ZAKAZANO",
      );
    }
    const pridana = await volej(
      "POST",
      `/api/expeditions/${idVypravy}/fotky`,
      cookieAdmin,
      { url: fotkaUrl, popis: "Smoke Fáze 2" },
    );
    zkontroluj("přidání fotky k proběhlé", pridana, 201);
    const fotkaId = idZFotky(pridana.telo);
    if (fotkaId === null) throw new Error("přidání nevrátilo id fotky");
    const fotky = await volej("GET", `/api/expeditions/${idVypravy}/fotky`, null);
    zkontroluj("veřejný seznam fotek", fotky, 200);
    if (fotkaObsahujeId(fotky.telo, fotkaId)) {
      ok("fotka je v seznamu");
    } else {
      selhalo("fotka je v seznamu", "id fotky v GET /fotky", fotky);
    }
    zkontroluj(
      "smazání fotky",
      await volej(
        "DELETE",
        `/api/expeditions/${idVypravy}/fotky/${fotkaId}`,
        cookieAdmin,
      ),
      200,
    );
    zkontroluj(
      "opakované smazání fotky končí 404",
      await volej(
        "DELETE",
        `/api/expeditions/${idVypravy}/fotky/${fotkaId}`,
        cookieAdmin,
      ),
      404,
      "NENALEZENO",
    );

    // 9) DELETE testovací výpravy (CASCADE) → 200, pak → 404.
    zkontroluj(
      "smazání testovací výpravy",
      await volej("DELETE", `/api/expeditions/${idVypravy}`, cookieAdmin),
      200,
    );
    idVypravy = "";
    zkontroluj(
      "smazaná výprava už neexistuje",
      await volej("GET", `/api/expeditions/${noveId}`, null),
      404,
      "NENALEZENO",
    );
  } catch (chyba: unknown) {
    fail += 1;
    const zprava = chyba instanceof Error ? chyba.message : "neznámá chyba";
    process.stdout.write(`FAIL - neočekávaná chyba: ${zprava}\n`);
  } finally {
    // Úklid přes API (CASCADE smaže i účastníky a fotky) — best effort.
    if (idVypravy.length > 0 && cookieAdmin !== null) {
      try {
        await volej("DELETE", `/api/expeditions/${idVypravy}`, cookieAdmin);
      } catch {
        // Úklid nesmí překrýt výsledek — chyba už je započítaná.
      }
    }
  }

  process.stdout.write(
    `Souhrn: ${String(pass)} PASS, ${String(fail)} FAIL, ${String(skip)} SKIP\n`,
  );
  if (fail > 0) {
    process.stdout.write("Smoke Fáze 2: NEÚSPĚCH\n");
    process.exitCode = 1;
  } else {
    process.stdout.write("Smoke Fáze 2: ÚSPĚCH\n");
  }
}

main().catch((chyba: unknown) => {
  const zprava = chyba instanceof Error ? chyba.message : "neznámá chyba";
  process.stderr.write(`Smoke Fáze 2 SELHALO: ${zprava}\n`);
  process.exitCode = 1;
});
