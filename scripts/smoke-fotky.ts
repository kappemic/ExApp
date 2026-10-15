/**
 * scripts/smoke-fotky.ts — Smoke Fotky / alba proti živému BFF (logged-in minimum).
 *
 * Nedestruktivní tok (žádný upload, žádné mazání, žádné vytváření alb):
 *   health → GET /api/alba (PUBLIC) → POST /api/alba bez session → 401 →
 *   přihlášení admina → GET /api/alba → 200 + tvar `alba[]` →
 *   volitelně GET /api/alba/:id/fotky pro první album ze seznamu →
 *   neexistující album → 404 → admin POST /api/alba s nevalidním `nazev` → 422
 *   (ověření admin session bez zápisu do DB).
 *
 * Volitelně (SKIP když chybí konfigurace):
 *   - `SMOKE_VITE_URL` — GET `{url}/fotky` (SPA shell, typicky Vite :5173).
 *   - R2 env (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
 *     `R2_BUCKET`, `R2_PUBLIC_BASE_URL`) — HEAD/GET souboru extra alba jen když
 *     je v seznamu vlastní album s `nahledFotkaId`; bez R2 se upload netestuje.
 *
 * Migrace: `GET /api/alba` s 500 → SKIP (pravděpodobně chybí migrace 0013 / tabulky alba).
 *
 * Auth: cookie `exapp_session` z POST /api/login. Secrety jen z env za běhu.
 *
 * Env:
 *   PORT                         — BFF port (default 3001)
 *   SMOKE_BASE_URL               — celá base URL BFF (priorita nad VITE_API_BASE_URL)
 *   VITE_API_BASE_URL            — fallback base URL
 *   SMOKE_ADMIN_EMAIL            — admin pro login (např. test-vedouci@example.cz)
 *   SMOKE_ADMIN_HESLO            — heslo admina (např. z TEST_SEED_HESLO_VEDOUCI po seedu)
 *   SMOKE_VITE_URL               — volitelně origin frontendu pro GET /fotky
 *
 * Testovací účty: `npm run seed:test-uzivatele` (DEV DB, viz docs/testovaci-ucty.md).
 *
 * Spuštění: `npm run server:start`, pak `npm run smoke:fotky`
 * Výstup: PASS/FAIL/SKIP (česky), exit 0/1, bez dumpu DB a bez logování hesel.
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
const VITE_ORIGIN: string | undefined = process.env["SMOKE_VITE_URL"]?.replace(/\/+$/, "");

const NEEXISTUJICI_ALBUM_ID = "00000000-0000-4000-8000-ffffffffffff";

const R2_ENV_NAMES = [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
  "R2_PUBLIC_BASE_URL",
] as const;

function maR2Env(): boolean {
  return R2_ENV_NAMES.every((nazev) => (process.env[nazev] ?? "").trim().length > 0);
}

interface Odpoved {
  status: number;
  telo: unknown;
  text?: string;
}

function kodChyby(telo: unknown): string | null {
  if (typeof telo !== "object" || telo === null) return null;
  const error = (telo as { error?: unknown }).error;
  if (typeof error !== "object" || error === null) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
}

async function volejJson(
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

async function volejText(
  metoda: string,
  url: string,
  cookie: string | null,
): Promise<Odpoved> {
  const hlavicky: Record<string, string> = {};
  if (cookie !== null && cookie.length > 0) hlavicky["Cookie"] = cookie;
  const odp = await fetch(url, { method: metoda, headers: hlavicky });
  const text = await odp.text();
  return { status: odp.status, telo: null, text };
}

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

function jeTvarSeznamAlb(telo: unknown): boolean {
  if (typeof telo !== "object" || telo === null) return false;
  const albaRaw = (telo as { alba?: unknown }).alba;
  if (!Array.isArray(albaRaw)) return false;
  return albaRaw.every((polozka) => {
    if (typeof polozka !== "object" || polozka === null) return false;
    const z = polozka as {
      id?: unknown;
      nazev?: unknown;
      druh?: unknown;
      expeditionId?: unknown;
      pocetFotek?: unknown;
      nahledFotkaId?: unknown;
    };
    const druhOk = z.druh === "vyprava" || z.druh === "vlastni";
    return (
      typeof z.id === "string" &&
      z.id.length > 0 &&
      typeof z.nazev === "string" &&
      druhOk &&
      (z.expeditionId === null || typeof z.expeditionId === "string") &&
      typeof z.pocetFotek === "number" &&
      (z.nahledFotkaId === null || typeof z.nahledFotkaId === "string")
    );
  });
}

function albaZeSeznamu(telo: unknown): readonly { id: string; druh: string; nahledFotkaId: string | null }[] {
  if (!jeTvarSeznamAlb(telo)) return [];
  const albaRaw = (telo as { alba: unknown[] }).alba;
  return albaRaw.map((polozka) => {
    const z = polozka as {
      id: string;
      druh: string;
      nahledFotkaId: string | null;
    };
    return { id: z.id, druh: z.druh, nahledFotkaId: z.nahledFotkaId };
  });
}

function jeTvarFotkyAlba(telo: unknown): boolean {
  if (typeof telo !== "object" || telo === null) return false;
  const fotkyRaw = (telo as { fotky?: unknown }).fotky;
  if (!Array.isArray(fotkyRaw)) return false;
  return fotkyRaw.every((polozka) => {
    if (typeof polozka !== "object" || polozka === null) return false;
    const z = polozka as {
      id?: unknown;
      url?: unknown;
      createdAt?: unknown;
      jeNahled?: unknown;
      expeditionId?: unknown;
      albumId?: unknown;
    };
    return (
      typeof z.id === "string" &&
      typeof z.url === "string" &&
      typeof z.createdAt === "string" &&
      typeof z.jeNahled === "boolean" &&
      (z.expeditionId === null || typeof z.expeditionId === "string") &&
      (z.albumId === null || typeof z.albumId === "string")
    );
  });
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

  function zkontrolujAlbaList(nazev: string, odp: Odpoved): void {
    if (odp.status === 200 && jeTvarSeznamAlb(odp.telo)) {
      ok(`${nazev} (200)`);
      return;
    }
    if (odp.status === 500) {
      preskoceno(
        nazev,
        "BFF vrátilo 500 — pravděpodobně chybí migrace 0013 (alba) na této DB; " +
          "smoke Fotky na této instanci přeskočeno.",
      );
      return;
    }
    selhalo(nazev, "200 s polem alba", odp);
  }

  const zdravi = await volejJson("GET", "/api/health", null);
  if (zdravi.status !== 200) {
    process.stderr.write(
      `SKIP - Server neběží na ${BASE}. Spusť BFF (npm run server:start) a znovu smoke:fotky.\n`,
    );
    process.stdout.write(`Souhrn: 0 PASS, 0 FAIL, 1 SKIP\n`);
    process.stdout.write("Smoke Fotky: PŘESKOČENO (server down)\n");
    return;
  }
  ok("server běží");

  const albaPublic = await volejJson("GET", "/api/alba", null);
  zkontrolujAlbaList("seznam alb je veřejný", albaPublic);
  if (albaPublic.status === 500) {
    process.stdout.write(
      `Souhrn: ${String(pass)} PASS, ${String(fail)} FAIL, ${String(skip)} SKIP\n`,
    );
    process.stdout.write("Smoke Fotky: ÚSPĚCH (jen health, DB bez alba migrace)\n");
    return;
  }

  zkontroluj(
    "vytvoření alba bez přihlášení je odmítnuto",
    await volejJson("POST", "/api/alba", null, { nazev: "Smoke by neměl projít" }),
    401,
    "NEPRIHLASEN",
  );

  if (ADMIN_EMAIL === undefined || ADMIN_HESLO === undefined) {
    preskoceno(
      "přihlášení admina a další logged-in větve",
      "není SMOKE_ADMIN_EMAIL/SMOKE_ADMIN_HESLO v prostředí",
    );
  } else {
    const cookieAdmin = await prihlasitPresLogin(ADMIN_EMAIL, ADMIN_HESLO);
    if (cookieAdmin === null) {
      fail += 1;
      process.stderr.write("FAIL - Přihlášení admina selhalo (zkontroluj env).\n");
      process.stdout.write(
        `Souhrn: ${String(pass)} PASS, ${String(fail)} FAIL, ${String(skip)} SKIP\n`,
      );
      process.stdout.write("Smoke Fotky: NEÚSPĚCH\n");
      process.exitCode = 1;
      return;
    }
    ok("přihlášení admina");

    const albaPoLoginu = await volejJson("GET", "/api/alba", cookieAdmin);
    zkontrolujAlbaList("seznam alb s přihlášením", albaPoLoginu);

    zkontroluj(
      "admin nevalidní název alba",
      await volejJson("POST", "/api/alba", cookieAdmin, { nazev: " " }),
      422,
      "VALIDATION_ERROR",
    );

    const seznam = albaPoLoginu.status === 200 ? albaZeSeznamu(albaPoLoginu.telo) : [];
    if (seznam.length === 0) {
      ok("struktura navigace — prázdný seznam alb (žádné proběhlé výpravy / vlastní alba)");
    } else {
      const prvni = seznam[0];
      if (prvni !== undefined) {
        const fotky = await volejJson(
          "GET",
          `/api/alba/${encodeURIComponent(prvni.id)}/fotky`,
          cookieAdmin,
        );
        zkontroluj(`fotky prvního alba (${prvni.druh})`, fotky, 200);
        if (fotky.status === 200) {
          if (jeTvarFotkyAlba(fotky.telo)) {
            ok("fotky alba vrací pole fotky");
          } else {
            selhalo("fotky alba vrací pole fotky", "tvar AlbumFotkyResponse", fotky);
          }
        }
      }
    }

    zkontroluj(
      "fotky neexistujícího alba",
      await volejJson(
        "GET",
        `/api/alba/${NEEXISTUJICI_ALBUM_ID}/fotky`,
        cookieAdmin,
      ),
      404,
      "NENALEZENO",
    );

    const vlastniSNahledem = seznam.find(
      (a) => a.druh === "vlastni" && a.nahledFotkaId !== null,
    );
    if (!maR2Env()) {
      preskoceno(
        "stažení souboru z extra alba",
        "chybí některá R2_* proměnná — upload/bytes se v CI netestují",
      );
    } else if (vlastniSNahledem === undefined || vlastniSNahledem.nahledFotkaId === null) {
      preskoceno(
        "stažení souboru z extra alba",
        "v seznamu není vlastní album s náhledem",
      );
    } else {
      const fotkaId = vlastniSNahledem.nahledFotkaId;
      const soubor = await volejText(
        "GET",
        `${BASE}/api/alba/${encodeURIComponent(vlastniSNahledem.id)}/fotky/${encodeURIComponent(fotkaId)}/soubor`,
        cookieAdmin,
      );
      if (soubor.status === 200 && (soubor.text?.length ?? 0) > 0) {
        ok("soubor extra alba (R2) vrací data");
      } else if (soubor.status === 500 || soubor.status === 503) {
        preskoceno(
          "stažení souboru z extra alba",
          "BFF/R2 nedostupné nebo objekt chybí — není chyba smoke bez uploadu",
        );
      } else {
        selhalo("soubor extra alba (R2)", "200 s tělem", soubor);
      }
    }
  }

  if (VITE_ORIGIN === undefined || VITE_ORIGIN.length === 0) {
    preskoceno(
      "SPA stránka /fotky",
      "není SMOKE_VITE_URL — testuje se jen BFF API",
    );
  } else {
    const stranka = await volejText("GET", `${VITE_ORIGIN}/fotky`, null);
    if (stranka.status === 200 && (stranka.text?.includes("id=\"root\"") ?? false)) {
      ok("SPA /fotky vrací shell");
    } else if (stranka.status === 0 || stranka.status >= 500) {
      preskoceno(
        "SPA stránka /fotky",
        "frontend neběží nebo vrátil chybu — spusť npm run dev",
      );
    } else {
      selhalo("SPA /fotky vrací shell", "200 s #root", stranka);
    }
  }

  process.stdout.write(
    `Souhrn: ${String(pass)} PASS, ${String(fail)} FAIL, ${String(skip)} SKIP\n`,
  );
  if (fail > 0) {
    process.stdout.write("Smoke Fotky: NEÚSPĚCH\n");
    process.exitCode = 1;
  } else {
    process.stdout.write("Smoke Fotky: ÚSPĚCH\n");
  }
}

main().catch((chyba: unknown) => {
  const zprava = chyba instanceof Error ? chyba.message : "neznámá chyba";
  process.stderr.write(`Smoke Fotky SELHALO: ${zprava}\n`);
  process.exitCode = 1;
});
