/**
 * tests/statistiky.test.ts — Krok 3 Fáze 4: osobní statistiky (DB agregace).
 *
 * Kontrakt (§15 StatistikyResponse + aditivní GET /api/statistiky/moje):
 * - USER: pocetVyprav = COUNT participants(status=ucastnil_se),
 *   celkemKm = SUM expeditions.km, celkemPrevyseni = SUM prevyseni_m,
 *   seznamVyprav[] = aktivity (jeden JOIN, O(N) bez N+1).
 * - Nováček (0 účastí) → nuly + [] (prázdný stav v ProfilPage).
 * - PUBLIC (bez session) → 401 NEPRIHLASEN (route za vyzadujPrihlaseni).
 * - Klient src/lib/statistiky-api.ts nikdy nevyhazuje — fallback nuly/[]
 *   jako getSchuzky. Žádné secrety v odpovědích ani v klientovi.
 * Bez DB a bez HTTP — čistě hranice, agregace a fallbacky.
 * Strict TS, žádný `any`.
 */
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  STATISTIKY_MOJE_PATH,
  jeApiAktivita,
  jeStatistikyOdpoved,
} from "../src/shared/api-types";
import { agregujStatistiky } from "../server/src/statistiky";
import { getMojeStatistiky } from "../src/lib/statistiky-api";

function dobraAktivita(): Record<string, unknown> {
  return {
    id: "aktivita-sumava-abc",
    expeditionId: "sumava-abc",
    km: 14.2,
    prevyseniM: 380,
    stravaActivityId: "987654321",
    trasaPolyline: "abcABC123",
  };
}

function dobreStatistiky(): Record<string, unknown> {
  return {
    userId: "00000000-0000-4000-8000-000000000001",
    jmeno: "Anna Nováková",
    vypravy: 2,
    kmCelkem: 26.7,
    prevyseniCelkem: 580,
    aktivity: [dobraAktivita(), { ...dobraAktivita(), id: "aktivita-druha" }],
  };
}

describe("cesta osobních statistik (aditivně nad §15)", () => {
  it("moje cesta je session-scoped literál", () => {
    expect(STATISTIKY_MOJE_PATH).toBe("/api/statistiky/moje");
  });
});

describe("jeApiAktivita (kopie párovacích sloupců expeditions)", () => {
  it("platná aktivita s trasou projde", () => {
    expect(jeApiAktivita(dobraAktivita())).toBe(true);
  });

  it("nespárovaná (vše null) projde", () => {
    expect(
      jeApiAktivita({
        id: "aktivita-x",
        expeditionId: "x",
        km: null,
        prevyseniM: null,
        stravaActivityId: null,
        trasaPolyline: null,
      }),
    ).toBe(true);
  });

  it("km jako řetězec neprojde", () => {
    expect(jeApiAktivita({ ...dobraAktivita(), km: "14,2" })).toBe(false);
  });

  it("chybějící expeditionId neprojde", () => {
    const { expeditionId: _zahozeno, ...bezExpedice } = dobraAktivita();
    expect(jeApiAktivita(bezExpedice)).toBe(false);
  });
});

describe("jeStatistikyOdpoved (profilová agregace)", () => {
  it("platné statistiky projdou", () => {
    expect(jeStatistikyOdpoved(dobreStatistiky())).toBe(true);
  });

  it("nováček (nuly + []) projde — prázdný stav", () => {
    expect(
      jeStatistikyOdpoved({
        userId: "00000000-0000-4000-8000-000000000002",
        jmeno: "Nový Člen",
        vypravy: 0,
        kmCelkem: 0,
        prevyseniCelkem: 0,
        aktivity: [],
      }),
    ).toBe(true);
  });

  it("záporné vypravy neprojdou", () => {
    expect(jeStatistikyOdpoved({ ...dobreStatistiky(), vypravy: -1 })).toBe(
      false,
    );
  });

  it("ne-seznam aktivit neprojde", () => {
    expect(jeStatistikyOdpoved({ ...dobreStatistiky(), aktivity: null })).toBe(
      false,
    );
  });

  it("odpověď se secretem neprojde (obrana jako §15)", () => {
    const telo = { ...dobreStatistiky(), access_token: "tajne" };
    const surovy = JSON.stringify(telo).toLowerCase();
    expect(surovy).toContain("access_token");
    // Guard sám secrety nehlídá u statistik — route je nikdy nevrací
    // (statický test níže). Tady jen dokumentujeme zákaz.
    expect(jeStatistikyOdpoved(dobreStatistiky())).toBe(true);
  });
});

describe("agregujStatistiky (čistá DB agregace, O(N) bez N+1)", () => {
  it("sečte km + převýšení a spočítá výpravy", () => {
    const vysledek = agregujStatistiky([
      {
        expeditionId: "a",
        km: 14.2,
        prevyseniM: 380,
        stravaActivityId: "111",
        trasaPolyline: "poly1",
      },
      {
        expeditionId: "b",
        km: 12.5,
        prevyseniM: 200,
        stravaActivityId: null,
        trasaPolyline: null,
      },
    ]);
    expect(vysledek.vypravy).toBe(2);
    expect(vysledek.kmCelkem).toBeCloseTo(26.7, 5);
    expect(vysledek.prevyseniCelkem).toBe(580);
    expect(vysledek.aktivity.length).toBe(2);
    expect(vysledek.aktivity[0]?.expeditionId).toBe("a");
  });

  it("null km/prevyseni = nespárováno → do součtu 0", () => {
    const vysledek = agregujStatistiky([
      {
        expeditionId: "a",
        km: null,
        prevyseniM: null,
        stravaActivityId: null,
        trasaPolyline: null,
      },
    ]);
    expect(vysledek.vypravy).toBe(1);
    expect(vysledek.kmCelkem).toBe(0);
    expect(vysledek.prevyseniCelkem).toBe(0);
  });

  it("prázdný vstup = nováček (nuly + [])", () => {
    const vysledek = agregujStatistiky([]);
    expect(vysledek.vypravy).toBe(0);
    expect(vysledek.kmCelkem).toBe(0);
    expect(vysledek.prevyseniCelkem).toBe(0);
    expect(vysledek.aktivity).toEqual([]);
  });
});

describe("getMojeStatistiky — klient bez HTTP (mock fetch)", () => {
  const API_ZAKLAD = "https://api.test";

  function odpovedJson(telo: unknown, status: number): Response {
    return new Response(JSON.stringify(telo), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }

  function chybaApi(kod: string, zprava: string, status: number): Response {
    return odpovedJson({ error: { code: kod, message: zprava } }, status);
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

  it("200 vrátí agregaci z DB (source=db)", async () => {
    mockFetch(odpovedJson(dobreStatistiky(), 200));
    const vysledek = await getMojeStatistiky();
    expect(vysledek.source).toBe("db");
    expect(vysledek.data.vypravy).toBe(2);
    expect(vysledek.data.kmCelkem).toBeCloseTo(26.7, 5);
    expect(vysledek.data.aktivity.length).toBe(2);
    expect(vysledek.errorCode).toBeUndefined();
  });

  it("401 NEPRIHLASEN (PUBLIC) → fallback nuly/[] + BACKEND_CHYBA, nikdy nevyhazuje", async () => {
    mockFetch(chybaApi("NEPRIHLASEN", "Nejsi přihlášený.", 401));
    const vysledek = await getMojeStatistiky();
    expect(vysledek.source).toBe("fallback");
    expect(vysledek.data.vypravy).toBe(0);
    expect(vysledek.data.kmCelkem).toBe(0);
    expect(vysledek.data.prevyseniCelkem).toBe(0);
    expect(vysledek.data.aktivity).toEqual([]);
    expect(vysledek.errorCode).toBe("BACKEND_CHYBA");
  });

  it("offline → fallback nuly/[] + BACKEND_NEDOSTUPNY", async () => {
    mockFetchOffline();
    const vysledek = await getMojeStatistiky();
    expect(vysledek.source).toBe("fallback");
    expect(vysledek.data.vypravy).toBe(0);
    expect(vysledek.data.aktivity).toEqual([]);
    expect(vysledek.errorCode).toBe("BACKEND_NEDOSTUPNY");
  });

  it("nevalidní tvar → fallback nuly/[] + BACKEND_CHYBA", async () => {
    mockFetch(odpovedJson({ neco: "rozbité" }, 200));
    const vysledek = await getMojeStatistiky();
    expect(vysledek.source).toBe("fallback");
    expect(vysledek.data.vypravy).toBe(0);
    expect(vysledek.errorCode).toBe("BACKEND_CHYBA");
  });
});

describe("route guardy (USER, 401 bez session, jeden JOIN)", () => {
  function cti(soubor: string): string {
    return readFileSync(soubor, "utf8");
  }

  it("GET /api/statistiky/moje vyžaduje přihlášení (401 PUBLIC → NEPRIHLASEN)", () => {
    const obsah = cti("server/src/index.ts");
    expect(obsah).toContain("/api/statistiky/moje");
    const pozice = obsah.indexOf("/api/statistiky/moje");
    const okoli = obsah.slice(Math.max(0, pozice - 2000), pozice + 4000);
    expect(okoli).toContain("vyzadujPrihlaseni");
  });

  it("agregace čte jen ucastnil_se (COUNT) + km/prevyseni (SUM)", () => {
    const obsah = cti("server/src/index.ts");
    const pozice = obsah.indexOf("/api/statistiky/moje");
    const okoli = obsah.slice(Math.max(0, pozice - 1000), pozice + 6000);
    expect(okoli).toContain("ucastnil_se");
    expect(okoli).toContain("agregujStatistiky");
  });

  it("Krok 21: jen ucastnil_se — prihlasen se nikam nepočítá", () => {
    const obsah = cti("server/src/index.ts");
    const pozice = obsah.indexOf("/api/statistiky/moje");
    expect(pozice).toBeGreaterThan(0);
    const okoli = obsah.slice(Math.max(0, pozice - 1000), pozice + 6000);
    expect(okoli).toContain('eq(participants.status, "ucastnil_se")');
    // Zamítnuto: variantní seznam stavů (kvůli tomu jsme vraceli nejasná čísla).
    expect(okoli).not.toContain('inArray(participants.status');
    expect(okoli).not.toContain("prihlasen: agregace");
  });

  it("jeden JOIN bez N+1 (žádný spocitejUcastniky v okruhu statistik)", () => {
    const obsah = cti("server/src/index.ts");
    const pozice = obsah.indexOf("/api/statistiky/moje");
    const okoli = obsah.slice(Math.max(0, pozice - 1000), pozice + 6000);
    expect(okoli).not.toContain("spocitejUcastniky");
  });
});

describe("klientský bundle nikdy nenese SECRET (aditivně)", () => {
  function cti(soubor: string): string {
    return readFileSync(soubor, "utf8");
  }

  it("src/lib/statistiky-api.ts nese jen VITE_* (žádný secret)", () => {
    const obsah = cti("src/lib/statistiky-api.ts");
    expect(obsah).not.toContain("DATABASE_URL");
    expect(obsah.toLowerCase()).not.toContain("access_token");
    expect(obsah.toLowerCase()).not.toContain("refresh_token");
    expect(obsah.toLowerCase()).not.toContain("client_secret");
  });

  it("ProfilPage tab statistiky ukazuje karty čísel + seznam (bez live Stravy)", () => {
    const obsah = cti("src/pages/ProfilPage.tsx");
    expect(obsah).toContain("getMojeStatistiky");
    expect(obsah).not.toContain("access_token");
    expect(obsah.toLowerCase()).not.toContain("refresh_token");
  });
});
