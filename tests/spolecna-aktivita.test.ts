/**
 * tests/spolecna-aktivita.test.ts — Krok 10: odkaz flow ODEBRÁN, sdílení PONECHÁNO.
 *
 * Uživatel: „odkaz pryč". Takže `POST :id/strava-odkaz` + `parseStravaOdkaz` +
 * `validujStravaOdkaz` + typy §15e jsou pryč. PONECHÁNO: expedition-level
 * sdílení — JEDNA aktivita zapsaná na expedici (ručně `km / prevyseni_m`
 * nebo OAuth párováním) se přes JOIN participants(ucastnil_se) × expeditions
 * započítá VŠEM účastníkům, ne každý vlastní Stravu.
 * Bez DB a bez HTTP — čistě hranice, kontrakt a agregace. Strict TS,
 * žádný `any`, žádné secrety.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { jeUlozAktivituOdpoved } from "../src/shared/api-types";
import { agregujStatistiky } from "../server/src/statistiky";
import { validujRucniAktivitu } from "../server/src/validace";

function cti(soubor: string): string {
  return readFileSync(soubor, "utf8");
}

describe("odkaz flow je odebrán (žádná routa strava-odkaz)", () => {
  it("server nemá routu POST :id/strava-odkaz (404 přes fallback)", () => {
    expect(cti("server/src/index.ts")).not.toContain("strava-odkaz");
  });

  it("kontrakt nemá §15e (žádný stravaOdkazPath ani UlozStravaOdkaz)", () => {
    const kontrakt = cti("src/shared/api-types.ts");
    expect(kontrakt).not.toContain("strava-odkaz");
    expect(kontrakt).not.toContain("stravaOdkazPath");
    expect(kontrakt).not.toContain("UlozStravaOdkaz");
    expect(kontrakt).not.toContain("PRISTUP_STRAVA_ODKAZ");
    expect(kontrakt).not.toContain("jeUlozStravaOdkazOdpoved");
  });

  it("validace nemá validujStravaOdkaz, strava nemá parseStravaOdkaz", () => {
    expect(cti("server/src/validace.ts")).not.toContain("validujStravaOdkaz");
    expect(cti("server/src/validace.ts")).not.toContain("parseStravaOdkaz");
    expect(cti("server/src/strava.ts")).not.toContain("parseStravaOdkaz");
  });

  it("klient nemá ulozStravaOdkaz ani pole pro odkaz", () => {
    expect(cti("src/lib/expedice-aktivita.ts")).not.toContain("ulozStravaOdkaz");
    expect(cti("src/lib/expedice-aktivita.ts")).not.toContain("strava-odkaz");
    const ui = cti("src/components/expeditions/StravaParovani.tsx");
    expect(ui.toLowerCase()).not.toContain("strava-odkaz");
    expect(ui.toLowerCase()).not.toContain("společný odkaz");
  });
});

describe("ruční zápis jede bez data (km + převýšení only)", () => {
  it("km + převýšení projde, datum se ignoruje", () => {
    const vysledek = validujRucniAktivitu({ km: 14.2, prevyseni_m: 380 });
    expect(vysledek.uspech).toBe(true);
    expect(vysledek.data).toEqual({ km: 14.2, prevyseniM: 380 });
  });

  it("guard ruční odpovědi projde pro expedition-level zápis bez secretů", () => {
    expect(
      jeUlozAktivituOdpoved({
        expedice: { id: "sumava-abc123" },
        aktivita: {
          id: "aktivita-sumava-abc123",
          expeditionId: "sumava-abc123",
          km: 14.2,
          prevyseniM: 380,
          stravaActivityId: null,
          trasaPolyline: null,
        },
      }),
    ).toBe(true);
  });
});

describe("expedition-level sdílení: 2 účastníci, 1 aktivita → oba stejné km", () => {
  it("oba ucastnil_se mají ve statistikách stejné km (ruční zápis bez Stravy)", () => {
    const spolecnyRadek = {
      expeditionId: "sumava-abc",
      status: "ucastnil_se" as const,
      km: 14.2,
      prevyseniM: 380,
      stravaActivityId: null,
      trasaPolyline: null,
      nazev: "Šumava",
      datum: "2026-10-10",
    };
    const prvni = agregujStatistiky([spolecnyRadek]);
    const druhy = agregujStatistiky([{ ...spolecnyRadek }]);
    expect(prvni.vypravy).toBe(1);
    expect(druhy.vypravy).toBe(1);
    expect(prvni.kmCelkem).toBeCloseTo(14.2, 5);
    expect(druhy.kmCelkem).toBeCloseTo(14.2, 5);
    expect(prvni.prevyseniCelkem).toBe(380);
    expect(druhy.prevyseniCelkem).toBe(380);
    expect(prvni.aktivity[0]?.stravaActivityId).toBeNull();
  });
});

describe("UI StravaParovani: společná aktivita pro celou výpravu (bez odkazu)", () => {
  it("vysvětluje expedition-level sdílení všem účastníkům", () => {
    const obsah = cti("src/components/expeditions/StravaParovani.tsx");
    expect(obsah).toContain("Jedna aktivita pro celou výpravu");
    expect(obsah).toContain("všem");
  });

  it("klientská vrstva nese jen VITE_* (žádný secret)", () => {
    for (const soubor of [
      "src/lib/expedice-aktivita.ts",
      "src/components/expeditions/StravaParovani.tsx",
    ]) {
      const obsah = cti(soubor);
      expect(obsah).not.toContain("STRAVA_CLIENT_SECRET");
      expect(obsah.toLowerCase()).not.toContain("access_token");
      expect(obsah.toLowerCase()).not.toContain("refresh_token");
    }
  });
});
