/**
 * tests/strava-odpojeni.test.ts — Krok 13: odpojení aktivity + všechny moje aktivity.
 *
 * - DELETE /api/expeditions/:id/strava-parovani (dual-guard, jen proběhlá
 *   jinak 409; vymaže 4 sloupce → NULL; nic připojeno → 404; audit bez secretů).
 * - GET /api/strava/neparovane vrací VŠECHNY moje aktivity: ?page&per_page
 *   (default 1/30, max 100), paginovaný fetch Stravy (max 3 stránky),
 *   příznak sparovano + celkový počet; MOCK 6+ fixture.
 * Bez DB a bez HTTP — čistě hranice, normalizace a rozhodnutí. Strict TS.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  jeNeparovanaAktivita,
  jeNeparovaneAktivityOdpoved,
  jeOdpojAktivituOdpoved,
  neparovaneAktivityUrl,
  stravaParovaniPath,
} from "../src/shared/api-types";
import {
  MOCK_NEPAROVANE_AKTIVITY,
  nactiVsechnyStravaAktivity,
  oznacSparovane,
  rozhodniOdpojeni,
} from "../server/src/strava";
import { validujNeparovaneQuery } from "../server/src/validace";

describe("kontrakt odpojení (aditivně §15b)", () => {
  it("stejná cesta pro POST (párovat) i DELETE (odpojit)", () => {
    expect(stravaParovaniPath("sumava-abc")).toBe(
      "/api/expeditions/sumava-abc/strava-parovani",
    );
  });

  it("neparovaneAktivityUrl staví ?page&per_page", () => {
    expect(neparovaneAktivityUrl({})).toBe("/api/strava/neparovane");
    expect(neparovaneAktivityUrl({ page: 2, per_page: 30 })).toBe(
      "/api/strava/neparovane?page=2&per_page=30",
    );
  });

  it("odpověď odpojení nese expedici + vynulovanou aktivitu (bez secretů)", () => {
    const dobra: Record<string, unknown> = {
      expedice: { id: "x" },
      aktivita: {
        id: "aktivita-x",
        expeditionId: "x",
        km: null,
        prevyseniM: null,
        stravaActivityId: null,
        trasaPolyline: null,
      },
    };
    expect(jeOdpojAktivituOdpoved(dobra)).toBe(true);
    expect(
      jeOdpojAktivituOdpoved({
        ...dobra,
        aktivita: { ...(dobra["aktivita"] as object), accessToken: "x" },
      }),
    ).toBe(false);
  });

  it("neparovaná aktivita smí nést příznak sparovano (aditivně optional)", () => {
    expect(
      jeNeparovanaAktivita({
        id: "1",
        nazev: "A",
        datum: "2026-10-10T07:00:00.000Z",
        km: 10,
        prevyseniM: 100,
        trasaPolyline: null,
        sparovano: true,
      }),
    ).toBe(true);
  });

  it("seznam s celkem projde (aditivně optional)", () => {
    expect(
      jeNeparovaneAktivityOdpoved({
        aktivity: [],
        celkem: 12,
      }),
    ).toBe(true);
  });
});

describe("validujNeparovaneQuery (?page&per_page, default 1/30, max 100)", () => {
  it("prázdné → default 1/30", () => {
    const vysledek = validujNeparovaneQuery({});
    expect(vysledek.uspech).toBe(true);
    expect(vysledek.data).toEqual({ page: 1, per_page: 30 });
  });

  it("platné hodnoty projdou", () => {
    const vysledek = validujNeparovaneQuery({ page: "2", per_page: "50" });
    expect(vysledek.uspech).toBe(true);
    expect(vysledek.data).toEqual({ page: 2, per_page: 50 });
  });

  it("per_page nad 100 neprojde", () => {
    const vysledek = validujNeparovaneQuery({ per_page: "101" });
    expect(vysledek.uspech).toBe(false);
    expect(vysledek.chybyPoli["per_page"]?.length).toBeGreaterThan(0);
  });

  it("page 0 neprojde", () => {
    const vysledek = validujNeparovaneQuery({ page: "0" });
    expect(vysledek.uspech).toBe(false);
  });
});

describe("rozhodniOdpojeni (jen proběhlá, nic → 404)", () => {
  it("proběhlá + připojeno → ok", () => {
    expect(
      rozhodniOdpojeni({ stav: "proběhlá", expediceSparovana: true }).ok,
    ).toBe(true);
  });

  it("ne-proběhlá → 409 VYPRAVA_UZAVRENA", () => {
    const vysledek = rozhodniOdpojeni({
      stav: "volno",
      expediceSparovana: true,
    });
    expect(vysledek.ok).toBe(false);
    if (!vysledek.ok) expect(vysledek.kod).toBe("VYPRAVA_UZAVRENA");
  });

  it("nic připojeno → 404 NENALEZENO", () => {
    const vysledek = rozhodniOdpojeni({
      stav: "proběhlá",
      expediceSparovana: false,
    });
    expect(vysledek.ok).toBe(false);
    if (!vysledek.ok) expect(vysledek.kod).toBe("NENALEZENO");
  });
});

describe("mock fixture 6+ a stránkovaný fetch", () => {
  it("MOCK má aspoň 6 aktivit bez secretů", () => {
    expect(MOCK_NEPAROVANE_AKTIVITY.length).toBeGreaterThanOrEqual(6);
    for (const aktivita of MOCK_NEPAROVANE_AKTIVITY) {
      expect(jeNeparovanaAktivita(aktivita)).toBe(true);
    }
    const surovy = JSON.stringify(MOCK_NEPAROVANE_AKTIVITY).toLowerCase();
    expect(surovy).not.toContain("access_token");
    expect(surovy).not.toContain("refresh_token");
    expect(surovy).not.toContain("client_secret");
  });

  it("nactiVsechnyStravaAktivity v mocku vrátí >10 při per_page 5 (paginace)", async () => {
    process.env["STRAVA_MOCK"] = "1";
    try {
      const vsechny = await nactiVsechnyStravaAktivity("mock-access", 5, 3);
      expect(vsechny.length).toBeGreaterThan(10);
    } finally {
      delete process.env["STRAVA_MOCK"];
    }
  });

  it("oznacSparovane přidá příznak, nefilturje", () => {
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
    const vysledek = oznacSparovane(aktivity, ["222"]);
    expect(vysledek.length).toBe(2);
    expect(vysledek.find((a) => a.id === "222")?.sparovano).toBe(true);
    expect(vysledek.find((a) => a.id === "111")?.sparovano).toBe(false);
  });
});

describe("route guardy odpojení (staticky nad index.ts)", () => {
  function cti(): string {
    return readFileSync("server/src/index.ts", "utf8");
  }

  it("DELETE strava-parovani stojí za vyzadujSpravceVyprav (403)", () => {
    const obsah = cti();
    expect(obsah).toContain('app.delete("/api/expeditions/:id/strava-parovani"');
    const pozice = obsah.indexOf('app.delete("/api/expeditions/:id/strava-parovani"');
    const okoli = obsah.slice(Math.max(0, pozice - 500), pozice + 3000);
    expect(okoli).toContain("vyzadujSpravceVyprav");
  });

  it("odpojení hlídá proběhlou (409) i nic-připojeno (404) a nuluje 4 sloupce", () => {
    const obsah = cti();
    const pozice = obsah.indexOf('app.delete("/api/expeditions/:id/strava-parovani"');
    expect(pozice).toBeGreaterThan(-1);
    const okoli = obsah.slice(pozice, pozice + 4000);
    expect(okoli).toContain("VYPRAVA_UZAVRENA");
    expect(okoli).toContain("NENALEZENO");
    expect(okoli).toContain("stravaActivityId: null");
    expect(okoli).toContain("trasaPolyline: null");
  });

  it("audit log bez secretů (event + expeditionId, nikdy token)", () => {
    const obsah = cti();
    const pozice = obsah.indexOf('app.delete("/api/expeditions/:id/strava-parovani"');
    const okoli = obsah.slice(pozice, pozice + 4000);
    expect(okoli).toContain("strava_odpojeno");
    expect(okoli.toLowerCase()).not.toContain("access_token");
  });

  it("GET neparovane čte ?page&per_page a vrací celkem", () => {
    const obsah = cti();
    const pozice = obsah.indexOf("/api/strava/neparovane");
    expect(pozice).toBeGreaterThan(-1);
    const okoli = obsah.slice(Math.max(0, pozice - 500), pozice + 3500);
    expect(okoli).toContain("validujNeparovaneQuery");
    expect(okoli).toContain("celkem");
  });
});

describe("klient nikdy nenese SECRET (aditivně)", () => {
  function cti(soubor: string): string {
    return readFileSync(soubor, "utf8");
  }

  it("strava-api + StravaParovani bez secretů, s odpojit", () => {
    for (const soubor of [
      "src/lib/strava-api.ts",
      "src/components/expeditions/StravaParovani.tsx",
    ]) {
      const obsah = cti(soubor);
      expect(obsah.toLowerCase()).not.toContain("access_token");
      expect(obsah.toLowerCase()).not.toContain("refresh_token");
      expect(obsah.toLowerCase()).not.toContain("client_secret");
    }
    expect(cti("src/lib/strava-api.ts")).toContain("odpojAktivitu");
    expect(cti("src/components/expeditions/StravaParovani.tsx")).toContain(
      "Odpojit aktivitu",
    );
  });
});
