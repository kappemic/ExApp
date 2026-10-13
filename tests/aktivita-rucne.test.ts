/**
 * tests/aktivita-rucne.test.ts — Krok 7c: ruční zadání aktivity bez Stravy.
 *
 * Proč existuje (bez předplatného!): čtení Strava API (`read`,
 * `activity:read`) je ZDARMA — Summit/předplatné není potřeba. Přesto jde
 * výpravu uzavřít s kilometry i zcela bez Stravy: správce výpravy zapíše
 * `POST /api/expeditions/:id/aktivita-ruchne { km, prevyseni_m }`
 * (datum se neposílá — bere se z expedice) a statistiky / heatmapa /
 * leaderboard už čtou jen DB sloupce (`km / prevyseni_m`), takže fungují
 * i bez `strava_activity_id`.
 * Bez DB a bez HTTP — čistě hranice, kontrakt a rozhodnutí. Strict TS,
 * žádný `any`, žádné secrety.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  EXPEDICE_AKTIVITA_RUCNE_VZOR,
  aktivitaRucnePath,
  jeUlozAktivituOdpoved,
} from "../src/shared/api-types";
import { validujRucniAktivitu } from "../server/src/validace";

describe("cesta ruční aktivity (§15d aditivně)", () => {
  it("literál cesty odpovídá REST vzoru", () => {
    expect(EXPEDICE_AKTIVITA_RUCNE_VZOR).toBe(
      "/api/expeditions/:id/aktivita-ruchne",
    );
  });

  it("aktivitaRucnePath staví URL pro danou výpravu", () => {
    expect(aktivitaRucnePath("sumava-abc123")).toBe(
      "/api/expeditions/sumava-abc123/aktivita-ruchne",
    );
  });
});

describe("validujRucniAktivitu (hranice POST :id/aktivita-ruchne)", () => {
  it("platné km + převýšení projde (bez data)", () => {
    const vysledek = validujRucniAktivitu({
      km: 14.2,
      prevyseni_m: 380,
    });
    expect(vysledek.uspech).toBe(true);
    expect(vysledek.data?.km).toBeCloseTo(14.2, 5);
    expect(vysledek.data?.prevyseniM).toBe(380);
  });

  it("camelCase alias prevyseniM projde stejně jako prevyseni_m", () => {
    const vysledek = validujRucniAktivitu({
      km: 5,
      prevyseniM: 120,
    });
    expect(vysledek.uspech).toBe(true);
    expect(vysledek.data?.prevyseniM).toBe(120);
  });

  it("bez převýšení projde s defaultem 0 (krátká procházka bez kopců)", () => {
    const vysledek = validujRucniAktivitu({ km: 3 });
    expect(vysledek.uspech).toBe(true);
    expect(vysledek.data?.prevyseniM).toBe(0);
  });

  it("datum se ignoruje — ruční jde bez data (km + převýšení only)", () => {
    const vysledek = validujRucniAktivitu({
      km: 10,
      prevyseni_m: 100,
      datum: "2026-10-10",
    });
    expect(vysledek.uspech).toBe(true);
    expect(vysledek.data).toEqual({ km: 10, prevyseniM: 100 });
  });

  it("chybějící km neprojde s polem km", () => {
    const vysledek = validujRucniAktivitu({});
    expect(vysledek.uspech).toBe(false);
    expect(vysledek.chybyPoli["km"]?.length).toBeGreaterThan(0);
  });

  it("nulové a záporné km neprojde", () => {
    for (const km of [0, -5]) {
      const vysledek = validujRucniAktivitu({ km });
      expect(vysledek.uspech).toBe(false);
      expect(vysledek.chybyPoli["km"]?.length).toBeGreaterThan(0);
    }
  });

  it("km jako řetězec neprojde", () => {
    const vysledek = validujRucniAktivitu({
      km: "14,2",
    });
    expect(vysledek.uspech).toBe(false);
    expect(vysledek.chybyPoli["km"]?.length).toBeGreaterThan(0);
  });

  it("nesmyslně velké km neprojde", () => {
    const vysledek = validujRucniAktivitu({ km: 5000 });
    expect(vysledek.uspech).toBe(false);
    expect(vysledek.chybyPoli["km"]?.length).toBeGreaterThan(0);
  });

  it("záporné převýšení neprojde", () => {
    const vysledek = validujRucniAktivitu({
      km: 10,
      prevyseni_m: -20,
    });
    expect(vysledek.uspech).toBe(false);
    expect(vysledek.chybyPoli["prevyseniM"]?.length).toBeGreaterThan(0);
  });

  it("neceločíselné převýšení neprojde", () => {
    const vysledek = validujRucniAktivitu({
      km: 10,
      prevyseni_m: 12.5,
    });
    expect(vysledek.uspech).toBe(false);
    expect(vysledek.chybyPoli["prevyseniM"]?.length).toBeGreaterThan(0);
  });

  it("netělo (non-object) neprojde", () => {
    const vysledek = validujRucniAktivitu(null);
    expect(vysledek.uspech).toBe(false);
    expect(vysledek.data).toBeNull();
  });
});

describe("jeUlozAktivituOdpoved (guard odpovědi bez secretů)", () => {
  function dobra(): Record<string, unknown> {
    return {
      expedice: { id: "sumava-abc123" },
      aktivita: {
        id: "aktivita-sumava-abc123",
        expeditionId: "sumava-abc123",
        km: 14.2,
        prevyseniM: 380,
        stravaActivityId: null,
        trasaPolyline: null,
      },
    };
  }

  it("ručně zapsaná aktivita (bez Strava id i trasy) projde", () => {
    expect(jeUlozAktivituOdpoved(dobra())).toBe(true);
  });

  it("odpověď se secretem neprojde", () => {
    expect(
      jeUlozAktivituOdpoved({ ...dobra(), access_token: "tajne" }),
    ).toBe(false);
    expect(
      jeUlozAktivituOdpoved({
        expedice: { id: "x" },
        aktivita: { ...dobra()["aktivita"], refreshToken: "tajne" },
      }),
    ).toBe(false);
  });

  it("bez aktivity neprojde", () => {
    expect(jeUlozAktivituOdpoved({ expedice: { id: "x" } })).toBe(false);
    expect(jeUlozAktivituOdpoved(null)).toBe(false);
  });
});

describe("route guardy (dual-guard + jen proběhlá, staticky nad index.ts)", () => {
  function cti(soubor: string): string {
    return readFileSync(soubor, "utf8");
  }

  it("POST :id/aktivita-ruchne stojí za vyzadujSpravceVyprav", () => {
    const obsah = cti("server/src/index.ts");
    const pozice = obsah.indexOf("aktivita-ruchne");
    expect(pozice).toBeGreaterThan(-1);
    const okoli = obsah.slice(Math.max(0, pozice - 2000), pozice + 2000);
    expect(okoli).toContain("vyzadujSpravceVyprav");
  });

  it("ne-proběhlá vrací 409 VYPRAVA_UZAVRENA", () => {
    const obsah = cti("server/src/index.ts");
    const pozice = obsah.indexOf("aktivita-ruchne");
    expect(pozice).toBeGreaterThan(-1);
    const okoli = obsah.slice(Math.max(0, pozice - 2000), pozice + 4000);
    expect(okoli).toContain("VYPRAVA_UZAVRENA");
  });

  it("žádná routa strava-odkaz neexistuje (odkaz flow odebrán)", () => {
    const obsah = cti("server/src/index.ts");
    expect(obsah).not.toContain("strava-odkaz");
  });

  it("komentář vysvětluje, že Strava read API je zdarma bez předplatného", () => {
    const obsah = cti("server/src/index.ts");
    const pozice = obsah.indexOf("aktivita-ruchne");
    expect(pozice).toBeGreaterThan(-1);
    const okoli = obsah
      .slice(Math.max(0, pozice - 3000), pozice + 1000)
      .toLowerCase();
    expect(okoli).toContain("zdarma");
  });
});

describe("klientský bundle nikdy nenese SECRET (aditivně)", () => {
  function cti(soubor: string): string {
    return readFileSync(soubor, "utf8");
  }

  it("src/lib/expedice-aktivita.ts a StravaParovani.tsx nenesou SECRET", () => {
    for (const soubor of [
      "src/lib/expedice-aktivita.ts",
      "src/components/expeditions/StravaParovani.tsx",
    ]) {
      const obsah = cti(soubor);
      expect(obsah).not.toContain("STRAVA_CLIENT_SECRET");
      expect(obsah.toLowerCase()).not.toContain("strava_client_secret");
      expect(obsah.toLowerCase()).not.toContain("access_token");
      expect(obsah.toLowerCase()).not.toContain("refresh_token");
    }
  });

  it("UI nemá pole pro odkaz ani datum (jen km + převýšení)", () => {
    const obsah = cti("src/components/expeditions/StravaParovani.tsx");
    expect(obsah.toLowerCase()).not.toContain("strava-odkaz");
    expect(obsah).not.toContain('type="date"');
    expect(obsah).not.toContain("vychoziDatum");
  });
});
