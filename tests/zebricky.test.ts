/**
 * tests/zebricky.test.ts — Krok 5 Fáze 4: veřejný žebříček (účast > km).
 *
 * Kontrakt (aditivně nad §15, nic se nepřejmenovává):
 * - GET /api/zebricky?obdobi=celkem|YYYY — PUBLIC (bez session),
 *   řazení `ucastnil_se DESC, km DESC`, tie-break `jmeno ASC`
 *   (deterministické pořadí), `LIMIT 50`, bez PII kromě `jmeno`
 *   (žádný e-mail / telefon / secrety).
 * - Filtr roku počítá jen výpravy daného roku (rozsah datum od–do).
 * - Odhlášený vidí tabulku + CTA (stávající /login + /register).
 * - Výkon: jeden GROUP BY dotaz + index
 *   `participants(status, user_id)` a `expeditions(datum)` —
 *   EXPLAIN bez seq-scanu na 1000+ participants.
 * Bez DB a bez HTTP — čistě hranice, agregace a fallbacky.
 * Strict TS, žádný `any`.
 */
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ZEBRICKY_PATH,
  jeZebrickyOdpoved,
  zebrickyListUrl,
} from "../src/shared/api-types";
import { agregujZebricek } from "../server/src/zebricky";
import { getZebricek } from "../src/lib/zebricky-api";

function dobryRadek(
  prepis: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    userId: "00000000-0000-4000-8000-000000000001",
    jmeno: "Anna Nováková",
    vypravy: 3,
    km: 42.5,
    ...prepis,
  };
}

function dobraOdpoved(): Record<string, unknown> {
  return {
    zebricky: [
      dobryRadek(),
      dobryRadek({
        userId: "00000000-0000-4000-8000-000000000002",
        jmeno: "Cyril Nový",
        vypravy: 2,
        km: 50,
      }),
    ],
    obdobi: "celkem",
  };
}

describe("kontrakt žebříčku (aditivně nad §15)", () => {
  it("cesta je plural /api/zebricky", () => {
    expect(ZEBRICKY_PATH).toBe("/api/zebricky");
  });

  it("URL staví ?obdobi (celkem i rok)", () => {
    expect(zebrickyListUrl({})).toBe("/api/zebricky");
    expect(zebrickyListUrl({ obdobi: "celkem" })).toBe(
      "/api/zebricky?obdobi=celkem",
    );
    expect(zebrickyListUrl({ obdobi: "2026" })).toBe(
      "/api/zebricky?obdobi=2026",
    );
  });
});

describe("jeZebrickyOdpoved (bez PII kromě jmeno)", () => {
  it("platná odpověď projde", () => {
    expect(jeZebrickyOdpoved(dobraOdpoved())).toBe(true);
  });

  it("prázdný žebříček je platný (nový klub)", () => {
    expect(jeZebrickyOdpoved({ zebricky: [], obdobi: "celkem" })).toBe(true);
  });

  it("řádek s e-mailem neprojde (PII zákaz)", () => {
    expect(
      jeZebrickyOdpoved({
        zebricky: [{ ...dobryRadek(), email: "anna@example.cz" }],
        obdobi: "celkem",
      }),
    ).toBe(false);
  });

  it("řádek se secretem neprojde", () => {
    expect(
      jeZebrickyOdpoved({
        zebricky: [{ ...dobryRadek(), access_token: "tajne" }],
        obdobi: "celkem",
      }),
    ).toBe(false);
  });

  it("záporné vypravy neprojdou", () => {
    expect(
      jeZebrickyOdpoved({
        zebricky: [{ ...dobryRadek(), vypravy: -1 }],
        obdobi: "celkem",
      }),
    ).toBe(false);
  });

  it("ne-seznam neprojde", () => {
    expect(
      jeZebrickyOdpoved({ zebricky: null, obdobi: "celkem" }),
    ).toBe(false);
  });
});

describe("agregujZebricek (čistá agregace, deterministické pořadí)", () => {
  function vstup(
    userId: string,
    jmeno: string,
    km: number | null,
    datum: string,
    pocet: number,
  ): Array<{ userId: string; jmeno: string; km: number | null; datum: string }> {
    const radky: Array<{
      userId: string;
      jmeno: string;
      km: number | null;
      datum: string;
    }> = [];
    for (let i = 0; i < pocet; i += 1) {
      radky.push({ userId, jmeno, km, datum });
    }
    return radky;
  }

  it("řadí účast DESC před km DESC (účast > km)", () => {
    const vysledek = agregujZebricek(
      [
        ...vstup("u1", "Bára", 100, "2026-05-01", 1),
        ...vstup("u2", "Anna", 10, "2026-05-01", 2),
      ],
      "celkem",
    );
    expect(vysledek.length).toBe(2);
    expect(vysledek[0]?.jmeno).toBe("Anna");
    expect(vysledek[0]?.vypravy).toBe(2);
    expect(vysledek[1]?.jmeno).toBe("Bára");
  });

  it("při rovnosti účastí rozhodují km DESC", () => {
    const vysledek = agregujZebricek(
      [
        ...vstup("u1", "Bára", 10, "2026-05-01", 2),
        ...vstup("u2", "Anna", 99.9, "2026-05-01", 2),
      ],
      "celkem",
    );
    expect(vysledek[0]?.jmeno).toBe("Anna");
    expect(vysledek[0]?.km).toBeCloseTo(199.8, 5);
  });

  it("tie-break jmeno ASC = deterministické pořadí", () => {
    const vysledek = agregujZebricek(
      [
        ...vstup("u1", "Cyril", 10, "2026-05-01", 1),
        ...vstup("u2", "Anna", 10, "2026-05-01", 1),
        ...vstup("u3", "Bára", 10, "2026-05-01", 1),
      ],
      "celkem",
    );
    expect(vysledek.map((radek) => radek.jmeno)).toEqual([
      "Anna",
      "Bára",
      "Cyril",
    ]);
  });

  it("filtr roku počítá jen výpravy daného roku", () => {
    const vysledek = agregujZebricek(
      [
        ...vstup("u1", "Anna", 10, "2025-06-01", 2),
        ...vstup("u1", "Anna", 10, "2026-06-01", 1),
        ...vstup("u2", "Bára", 5, "2026-06-01", 1),
      ],
      "2026",
    );
    const anna = vysledek.find((radek) => radek.jmeno === "Anna");
    expect(anna?.vypravy).toBe(1);
    expect(anna?.km).toBeCloseTo(10, 5);
    // Oba mají 1 účast v 2026 — Bára má méně km, Anna první.
    expect(vysledek[0]?.jmeno).toBe("Anna");
  });

  it("null km = nespárováno → do součtu 0", () => {
    const vysledek = agregujZebricek(
      vstup("u1", "Anna", null, "2026-05-01", 2),
      "celkem",
    );
    expect(vysledek[0]?.vypravy).toBe(2);
    expect(vysledek[0]?.km).toBe(0);
  });

  it("prázdný vstup = prázdný žebříček", () => {
    expect(agregujZebricek([], "celkem")).toEqual([]);
  });

  it("LIMIT 50 (nejvýš 50 řádků)", () => {
    const radky: Array<{
      userId: string;
      jmeno: string;
      km: number | null;
      datum: string;
    }> = [];
    for (let i = 0; i < 60; i += 1) {
      radky.push({
        userId: `u${i}`,
        jmeno: `Člen ${String(i).padStart(2, "0")}`,
        km: 1,
        datum: "2026-05-01",
      });
    }
    expect(agregujZebricek(radky, "celkem").length).toBe(50);
  });
});

describe("getZebricek — klient bez HTTP (mock fetch)", () => {
  const API_ZAKLAD = "https://api.test";

  function odpovedJson(telo: unknown, status: number): Response {
    return new Response(JSON.stringify(telo), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }

  beforeEach(() => {
    vi.stubEnv("VITE_API_BASE_URL", API_ZAKLAD);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  function mockFetch(odpoved: Response): void {
    const mock: typeof fetch = () => Promise.resolve(odpoved);
    vi.stubGlobal("fetch", mock);
  }

  function mockFetchOffline(): void {
    const mock: typeof fetch = () => Promise.reject(new Error("offline"));
    vi.stubGlobal("fetch", mock);
  }

  it("200 vrátí žebříček z DB (source=db, nikdy nevyhazuje)", async () => {
    mockFetch(odpovedJson(dobraOdpoved(), 200));
    const vysledek = await getZebricek("celkem");
    expect(vysledek.source).toBe("db");
    expect(vysledek.data.zebricky.length).toBe(2);
    expect(vysledek.data.zebricky[0]?.jmeno).toBe("Anna Nováková");
    expect(vysledek.errorCode).toBeUndefined();
  });

  it("offline → fallback [] + BACKEND_NEDOSTUPNY", async () => {
    mockFetchOffline();
    const vysledek = await getZebricek("celkem");
    expect(vysledek.source).toBe("fallback");
    expect(vysledek.data.zebricky).toEqual([]);
    expect(vysledek.errorCode).toBe("BACKEND_NEDOSTUPNY");
  });

  it("nevalidní tvar → fallback [] + BACKEND_CHYBA", async () => {
    mockFetch(odpovedJson({ neco: "rozbité" }, 200));
    const vysledek = await getZebricek("celkem");
    expect(vysledek.source).toBe("fallback");
    expect(vysledek.data.zebricky).toEqual([]);
    expect(vysledek.errorCode).toBe("BACKEND_CHYBA");
  });
});

describe("route GET /api/zebricky (PUBLIC, jeden GROUP BY, LIMIT 50)", () => {
  function cti(soubor: string): string {
    return readFileSync(soubor, "utf8");
  }

  function okoliZebricky(): string {
    const obsah = cti("server/src/index.ts");
    const pozice = obsah.indexOf("/api/zebricky");
    expect(pozice).toBeGreaterThan(-1);
    return obsah.slice(Math.max(0, pozice - 1000), pozice + 6000);
  }

  it("route existuje a je PUBLIC (žádný login/admin guard v okruhu)", () => {
    const okoli = okoliZebricky();
    expect(okoli).not.toContain("vyzadujPrihlaseni");
    expect(okoli).not.toContain("vyzadujAdmina");
  });

  it("agreguje jen ucastnil_se jedním GROUP BY (bez N+1)", () => {
    const okoli = okoliZebricky();
    expect(okoli).toContain("ucastnil_se");
    expect(okoli).toContain("GROUP BY");
    expect(okoli).not.toContain("spocitejUcastniky");
  });

  it("řadí vypravy DESC, km DESC, jmeno ASC s LIMIT 50", () => {
    const okoli = okoliZebricky();
    expect(okoli).toContain("LIMIT 50");
    expect(okoli).toContain("vypravy");
    expect(okoli).toContain("DESC");
    expect(okoli).toContain("ASC");
  });

  it("filtr roku omezuje rozsahem data (jen výpravy daného roku)", () => {
    const okoli = okoliZebricky();
    expect(okoli).toContain("obdobi");
    expect(okoli).toContain("datum");
  });

  it("nevalidní obdobi → 422 VALIDATION_ERROR", () => {
    const okoli = okoliZebricky();
    expect(okoli).toContain("VALIDATION_ERROR");
  });
});

describe("výkon: index pro žebříček (bez seq-scanu na 1000+ participants)", () => {
  function cti(soubor: string): string {
    return readFileSync(soubor, "utf8");
  }

  it("migrace má složený index participants(status, user_id)", () => {
    const obsah = cti("drizzle/migrations/0008_zebricky_index.sql");
    expect(obsah).toContain("participants");
    expect(obsah).toContain("status");
    expect(obsah).toContain("user_id");
    expect(obsah).toContain("CREATE INDEX IF NOT EXISTS");
  });

  it("migrace má index expeditions(datum) pro filtr roku", () => {
    const obsah = cti("drizzle/migrations/0008_zebricky_index.sql");
    expect(obsah).toContain("expeditions");
    expect(obsah).toContain("datum");
  });
});

describe("ZebrickyPage (tabulka + filtr období + zvýraznění sebe + CTA)", () => {
  function cti(soubor: string): string {
    return readFileSync(soubor, "utf8");
  }

  it("tabulka pořadí s popiskem a záhlavím", () => {
    const obsah = cti("src/pages/ZebrickyPage.tsx");
    expect(obsah).toContain("<table");
    expect(obsah).toContain("Pořadí");
    expect(obsah).toContain("getZebricek");
  });

  it("filtr období (celkem + rok) volá API s obdobi", () => {
    const obsah = cti("src/pages/ZebrickyPage.tsx");
    expect(obsah).toContain("obdobi");
    expect(obsah).toContain("celkem");
    expect(obsah).toContain("<select");
  });

  it("zvýrazní přihlášeného (aria-current)", () => {
    const obsah = cti("src/pages/ZebrickyPage.tsx");
    expect(obsah).toContain("aria-current");
    expect(obsah).toContain("user");
  });

  it("odhlášený vidí CTA (stávající /login + /register)", () => {
    const obsah = cti("src/pages/ZebrickyPage.tsx");
    expect(obsah).toContain('to="/login"');
    expect(obsah).toContain('to="/register"');
  });

  it("stav načítání přes role=status, žádné PII ani secrety", () => {
    const obsah = cti("src/pages/ZebrickyPage.tsx");
    expect(obsah).toContain('role="status"');
    expect(obsah).not.toContain("access_token");
    expect(obsah.toLowerCase()).not.toContain("client_secret");
    expect(obsah).not.toContain("email");
  });
});

describe("klientský bundle nikdy nenese SECRET (aditivně)", () => {
  function cti(soubor: string): string {
    return readFileSync(soubor, "utf8");
  }

  it("src/lib/zebricky-api.ts nese jen VITE_* (žádný secret)", () => {
    const obsah = cti("src/lib/zebricky-api.ts");
    expect(obsah).not.toContain("DATABASE_URL");
    expect(obsah.toLowerCase()).not.toContain("access_token");
    expect(obsah.toLowerCase()).not.toContain("refresh_token");
    expect(obsah.toLowerCase()).not.toContain("client_secret");
  });
});
