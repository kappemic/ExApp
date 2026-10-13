/**
 * tests/strava-parovani.test.ts — Krok 2 Fáze 4: párování aktivit k uzavřené výpravě.
 *
 * Auto-návrh poslední nepárované aktivity + admin confirm:
 * - `GET /api/strava/neparovane` (USER, jen vlastní token)
 * - `POST /api/expeditions/:id/strava-parovani { activityId }`
 *   (dual-guard `vyzadujSpravceVyprav`, jen `stav=proběhlá`, jinak 409
 *   `VYPRAVA_UZAVRENA`; duplicita → 409; USER bez práva → 403).
 * Bez DB a bez HTTP — čistě hranice, normalizace a rozhodnutí.
 * Strict TS, žádný `any`. STRAVA_MOCK=1 fixture pro testy.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  EXPEDICE_STRAVA_PAROVANI_VZOR,
  STRAVA_NEPAROVANE_PATH,
  jeNeparovanaAktivita,
  jeNeparovaneAktivityOdpoved,
  stravaParovaniPath,
} from "../src/shared/api-types";
import {
  MOCK_NEPAROVANE_AKTIVITY,
  nactiStravaAktivity,
  normalizujStravaAktivitu,
  odfiltrujSparovane,
  rozhodniParovani,
} from "../server/src/strava";
import { validujParovaniAktivitu } from "../server/src/validace";

describe("cesty párování (§15 aditivně)", () => {
  it("literály cest odpovídají REST vzoru", () => {
    expect(STRAVA_NEPAROVANE_PATH).toBe("/api/strava/neparovane");
    expect(EXPEDICE_STRAVA_PAROVANI_VZOR).toBe(
      "/api/expeditions/:id/strava-parovani",
    );
  });

  it("stravaParovaniPath staví URL pro danou výpravu", () => {
    expect(stravaParovaniPath("sumava-abc123")).toBe(
      "/api/expeditions/sumava-abc123/strava-parovani",
    );
  });
});

describe("jeNeparovanaAktivita (návrh k potvrzení)", () => {
  function dobra(): Record<string, unknown> {
    return {
      id: "987654321",
      nazev: "Ranní Šumava",
      datum: "2026-10-10T07:30:00.000Z",
      km: 14.2,
      prevyseniM: 380,
      trasaPolyline: "abcABC123",
    };
  }

  it("platný návrh s trasou projde", () => {
    expect(jeNeparovanaAktivita(dobra())).toBe(true);
  });

  it("návrh bez trasy (null) projde", () => {
    expect(jeNeparovanaAktivita({ ...dobra(), trasaPolyline: null })).toBe(
      true,
    );
  });

  it("km jako řetězec neprojde", () => {
    expect(jeNeparovanaAktivita({ ...dobra(), km: "14,2" })).toBe(false);
  });

  it("chybějící id neprojde", () => {
    const { id: _zahozeno, ...bezId } = dobra();
    expect(jeNeparovanaAktivita(bezId)).toBe(false);
  });

  it("odpověď se secretem neprojde", () => {
    expect(
      jeNeparovanaAktivita({ ...dobra(), access_token: "tajne" }),
    ).toBe(false);
    expect(
      jeNeparovaneAktivityOdpoved({
        aktivity: [{ ...dobra(), refreshToken: "tajne" }],
      }),
    ).toBe(false);
  });

  it("seznam návrhů projde, ne-seznam neprojde", () => {
    expect(jeNeparovaneAktivityOdpoved({ aktivity: [dobra()] })).toBe(true);
    expect(jeNeparovaneAktivityOdpoved({ aktivity: [] })).toBe(true);
    expect(jeNeparovaneAktivityOdpoved({ aktivity: [{ km: "hodně" }] })).toBe(
      false,
    );
    expect(jeNeparovaneAktivityOdpoved(null)).toBe(false);
  });
});

describe("normalizujStravaAktivitu (surová Strava → návrh)", () => {
  it("převede distance (m) na km a vytáhne polyline", () => {
    const surova: Record<string, unknown> = {
      id: 987654321,
      name: "Ranní Šumava",
      distance: 14200,
      total_elevation_gain: 380,
      start_date: "2026-10-10T07:30:00Z",
      map: { summary_polyline: "abcABC123" },
    };
    const vysledek = normalizujStravaAktivitu(surova);
    expect(vysledek).not.toBeNull();
    expect(vysledek?.id).toBe("987654321");
    expect(vysledek?.nazev).toBe("Ranní Šumava");
    expect(vysledek?.km).toBeCloseTo(14.2, 5);
    expect(vysledek?.prevyseniM).toBe(380);
    expect(vysledek?.trasaPolyline).toBe("abcABC123");
  });

  it("chybějící map → polyline null (stále platné)", () => {
    const vysledek = normalizujStravaAktivitu({
      id: "1",
      name: "Bez mapy",
      distance: 5000,
      total_elevation_gain: 50,
      start_date: "2026-10-11T08:00:00Z",
    });
    expect(vysledek?.trasaPolyline).toBeNull();
  });

  it("nevalidní surovina → null (route ji skipne)", () => {
    expect(normalizujStravaAktivitu(null)).toBeNull();
    expect(normalizujStravaAktivitu({})).toBeNull();
    expect(
      normalizujStravaAktivitu({ id: "1", name: "x", distance: -5 }),
    ).toBeNull();
  });
});

describe("odfiltrujSparovane (strava_activity_id IS NULL logika)", () => {
  it("odfiltruje aktivity už spárované k výpravám", () => {
    const aktivity = [
      {
        id: "111",
        nazev: "A",
        datum: "2026-10-10T07:00:00.000Z",
        km: 10,
        prevyseniM: 100,
        trasaPolyline: null,
      },
      {
        id: "222",
        nazev: "B",
        datum: "2026-10-11T07:00:00.000Z",
        km: 20,
        prevyseniM: 200,
        trasaPolyline: null,
      },
    ];
    const vysledek = odfiltrujSparovane(aktivity, ["222"]);
    expect(vysledek.map((a) => a.id)).toEqual(["111"]);
  });

  it("bez spárovaných vrací vše", () => {
    const aktivity = [
      {
        id: "111",
        nazev: "A",
        datum: "2026-10-10T07:00:00.000Z",
        km: 10,
        prevyseniM: 100,
        trasaPolyline: null,
      },
    ];
    expect(odfiltrujSparovane(aktivity, []).length).toBe(1);
  });
});

describe("mock aktivity (STRAVA_MOCK=1)", () => {
  it("fixture má km, převýšení i datum (bez secretů)", async () => {
    process.env["STRAVA_MOCK"] = "1";
    try {
      // Krok 13: 6+ fixture pro ověření paginace (?page&per_page) a příznaku.
      expect(MOCK_NEPAROVANE_AKTIVITY.length).toBeGreaterThanOrEqual(6);
      for (const aktivita of MOCK_NEPAROVANE_AKTIVITY) {
        expect(jeNeparovanaAktivita(aktivita)).toBe(true);
      }
      const surovy = JSON.stringify(MOCK_NEPAROVANE_AKTIVITY).toLowerCase();
      expect(surovy).not.toContain("access_token");
      expect(surovy).not.toContain("refresh_token");
      expect(surovy).not.toContain("client_secret");

      const nactene = await nactiStravaAktivity("mock-access", 10);
      expect(nactene.length).toBeGreaterThan(0);
      expect(nactene.length).toBeLessThanOrEqual(10);
      // Krok 13: druhá stránka mocku vrací zbytek fixture (paginace).
      const druha = await nactiStravaAktivity("mock-access", 10, 2);
      expect(druha.length).toBe(
        MOCK_NEPAROVANE_AKTIVITY.length - nactene.length,
      );
    } finally {
      delete process.env["STRAVA_MOCK"];
    }
  });
});

describe("validujParovaniAktivitu (hranice POST :id/strava-parovani)", () => {
  it("platné activityId projde (trim)", () => {
    const vysledek = validujParovaniAktivitu({ activityId: "  987654321  " });
    expect(vysledek.uspech).toBe(true);
    expect(vysledek.data?.activityId).toBe("987654321");
  });

  it("chybějící activityId neprojde s polem activityId", () => {
    const vysledek = validujParovaniAktivitu({});
    expect(vysledek.uspech).toBe(false);
    expect(vysledek.chybyPoli["activityId"]?.length).toBeGreaterThan(0);
  });

  it("prázdné activityId neprojde", () => {
    const vysledek = validujParovaniAktivitu({ activityId: "   " });
    expect(vysledek.uspech).toBe(false);
    expect(vysledek.chybyPoli["activityId"]?.length).toBeGreaterThan(0);
  });

  it("netělo (non-object) neprojde", () => {
    const vysledek = validujParovaniAktivitu(null);
    expect(vysledek.uspech).toBe(false);
    expect(vysledek.data).toBeNull();
  });

  it("příliš dlouhé activityId neprojde", () => {
    const vysledek = validujParovaniAktivitu({
      activityId: "9".repeat(129),
    });
    expect(vysledek.uspech).toBe(false);
    expect(vysledek.chybyPoli["activityId"]?.length).toBeGreaterThan(0);
  });
});

describe("rozhodniParovani (stav + duplicita → 409, bez párování → ok)", () => {
  it("proběhlá bez kolize smí párovat", () => {
    expect(
      rozhodniParovani({
        stav: "proběhlá",
        expediceSparovana: false,
        aktivitaUzSparovana: false,
      }).ok,
    ).toBe(true);
  });

  it("ne-proběhlá → 409 VYPRAVA_UZAVRENA", () => {
    const vysledek = rozhodniParovani({
      stav: "volno",
      expediceSparovana: false,
      aktivitaUzSparovana: false,
    });
    expect(vysledek.ok).toBe(false);
    if (!vysledek.ok) {
      expect(vysledek.kod).toBe("VYPRAVA_UZAVRENA");
      expect(vysledek.zprava.length).toBeGreaterThan(0);
    }
  });

  it("už spárovaná výprava → 409 duplicita", () => {
    const vysledek = rozhodniParovani({
      stav: "proběhlá",
      expediceSparovana: true,
      aktivitaUzSparovana: false,
    });
    expect(vysledek.ok).toBe(false);
    if (!vysledek.ok) expect(vysledek.kod).toBe("UZ_PRIHLASEN");
  });

  it("aktivita už spárovaná jinde → 409 duplicita", () => {
    const vysledek = rozhodniParovani({
      stav: "proběhlá",
      expediceSparovana: false,
      aktivitaUzSparovana: true,
    });
    expect(vysledek.ok).toBe(false);
    if (!vysledek.ok) expect(vysledek.kod).toBe("UZ_PRIHLASEN");
  });
});

describe("route guardy (dual-guard + 409/403, staticky nad index.ts)", () => {
  function cti(soubor: string): string {
    return readFileSync(soubor, "utf8");
  }

  it("POST :id/strava-parovani stojí za vyzadujSpravceVyprav (403 pro USER bez práva)", () => {
    const obsah = cti("server/src/index.ts");
    const pozice = obsah.indexOf("strava-parovani");
    expect(pozice).toBeGreaterThan(-1);
    const okoli = obsah.slice(Math.max(0, pozice - 2000), pozice + 2000);
    expect(okoli).toContain("vyzadujSpravceVyprav");
  });

  it("ne-proběhlá vrací 409 VYPRAVA_UZAVRENA", () => {
    const obsah = cti("server/src/index.ts");
    const pozice = obsah.indexOf("strava-parovani");
    expect(pozice).toBeGreaterThan(-1);
    const okoli = obsah.slice(Math.max(0, pozice - 2000), pozice + 4000);
    expect(okoli).toContain("VYPRAVA_UZAVRENA");
  });

  it("GET /api/strava/neparovane vyžaduje přihlášení (401 bez session)", () => {
    const obsah = cti("server/src/index.ts");
    expect(obsah).toContain("/api/strava/neparovane");
    const pozice = obsah.indexOf("/api/strava/neparovane");
    const okoli = obsah.slice(Math.max(0, pozice - 2000), pozice + 2000);
    expect(okoli).toContain("vyzadujPrihlaseni");
  });
});

describe("klientský bundle nikdy nenese SECRET (aditivně)", () => {
  function cti(soubor: string): string {
    return readFileSync(soubor, "utf8");
  }

  it("src/lib/strava-api.ts a StravaParovani.tsx nenesou SECRET", () => {
    for (const soubor of [
      "src/lib/strava-api.ts",
      "src/components/expeditions/StravaParovani.tsx",
    ]) {
      const obsah = cti(soubor);
      expect(obsah).not.toContain("STRAVA_CLIENT_SECRET");
      expect(obsah.toLowerCase()).not.toContain("strava_client_secret");
      expect(obsah.toLowerCase()).not.toContain("access_token");
      expect(obsah.toLowerCase()).not.toContain("refresh_token");
    }
  });
});
