/**
 * tests/strava-odpojeni-rozliseni.test.ts — Step 4: rozlišit odpojení.
 *
 * - Ruční km → „Smazat ruční zápis" + confirm() před smazáním.
 * - Strava aktivita → „Odpojit aktivitu".
 * - Účet → jen v profilu („Odpojit účet"), v expedici jen hint.
 * Bez DB a bez HTTP — čistě rozhodnutí + statické popisky. Strict TS.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  POTVRZENI_ODPOJENI_STRAVA,
  POTVRZENI_SMAZANI_RUCNIHO,
  rozhodniZdrojPripojeni,
} from "../src/components/expeditions/StravaParovani";

function cti(soubor: string): string {
  return readFileSync(soubor, "utf8");
}

describe("rozhodniZdrojPripojeni (Step 4)", () => {
  it("místní Strava id → strava", () => {
    expect(
      rozhodniZdrojPripojeni({
        sparovanoId: "123",
        jeSparovano: false,
        stravaActivityId: null,
        rucneSparovano: false,
        potlacenoOdpojenim: false,
      }),
    ).toBe("strava");
  });

  it("Strava id z props (po refreshi) → strava", () => {
    expect(
      rozhodniZdrojPripojeni({
        sparovanoId: null,
        jeSparovano: true,
        stravaActivityId: "999",
        rucneSparovano: false,
        potlacenoOdpojenim: false,
      }),
    ).toBe("strava");
  });

  it("ruční zápis (místní příznak) → rucni", () => {
    expect(
      rozhodniZdrojPripojeni({
        sparovanoId: null,
        jeSparovano: false,
        stravaActivityId: null,
        rucneSparovano: true,
        potlacenoOdpojenim: false,
      }),
    ).toBe("rucni");
  });

  it("ruční zápis po refreshi (jeSparovano bez Strava id) → rucni", () => {
    expect(
      rozhodniZdrojPripojeni({
        sparovanoId: null,
        jeSparovano: true,
        stravaActivityId: null,
        rucneSparovano: false,
        potlacenoOdpojenim: false,
      }),
    ).toBe("rucni");
  });

  it("nic připojeno → nic", () => {
    expect(
      rozhodniZdrojPripojeni({
        sparovanoId: null,
        jeSparovano: false,
        stravaActivityId: null,
        rucneSparovano: false,
        potlacenoOdpojenim: false,
      }),
    ).toBe("nic");
  });

  it("potlačení odpojením přebije oba zdroje", () => {
    expect(
      rozhodniZdrojPripojeni({
        sparovanoId: "123",
        jeSparovano: true,
        stravaActivityId: "123",
        rucneSparovano: true,
        potlacenoOdpojenim: true,
      }),
    ).toBe("nic");
    expect(
      rozhodniZdrojPripojeni({
        sparovanoId: null,
        jeSparovano: true,
        stravaActivityId: null,
        rucneSparovano: true,
        potlacenoOdpojenim: true,
      }),
    ).toBe("nic");
  });
});

describe("popisky a confirmy (Step 4, staticky)", () => {
  it("StravaParovani má oba popisky i oba confirmy", () => {
    const obsah = cti("src/components/expeditions/StravaParovani.tsx");
    expect(obsah).toContain("Odpojit aktivitu");
    expect(obsah).toContain("Smazat ruční zápis");
    expect(obsah).toContain("POTVRZENI_ODPOJENI_STRAVA");
    expect(obsah).toContain("POTVRZENI_SMAZANI_RUCNIHO");
    expect(POTVRZENI_ODPOJENI_STRAVA.length).toBeGreaterThan(10);
    expect(POTVRZENI_SMAZANI_RUCNIHO.length).toBeGreaterThan(10);
    // Oba mazací handlery volají confirm — ruční km nemizí bez confirmu.
    const confirMy = obsah.match(/window\.confirm/g) ?? [];
    expect(confirMy.length).toBeGreaterThanOrEqual(2);
  });

  it("stav trasy rozlišuje zdroj (Strava vs ruční)", () => {
    const obsah = cti("src/components/expeditions/StravaParovani.tsx");
    expect(obsah).toContain("připojeno – Strava aktivita");
    expect(obsah).toContain("připojeno – ruční zápis");
  });

  it('expedice nenabizi tlacitko Odpojit ucet, jen hint do profilu', () => {
    const obsah = cti("src/components/expeditions/StravaParovani.tsx");
    expect(obsah).toContain("Odpojit účet");
    // Hint vede do profilu, tlačítko s tímto popiskem v expedici není.
    expect(obsah).toContain("v profilu");
    expect(obsah).not.toContain(">Odpojit účet<");
  });

  it("ExpeditionModal dokumentuje Step 4 a předává zdrojová props", () => {
    const obsah = cti("src/components/expeditions/ExpeditionModal.tsx");
    expect(obsah).toContain("Odpojit aktivitu");
    expect(obsah).toContain("Smazat ruční zápis");
    expect(obsah).toContain("Odpojit účet");
    expect(obsah).toContain("stravaActivityId");
    expect(obsah).toContain("jeSparovano");
  });
});
