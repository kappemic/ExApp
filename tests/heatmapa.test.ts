/**
 * tests/heatmapa.test.ts — Krok 4 Fáze 4: heatmapa tras (Leaflet + OSM).
 *
 * Bez DOM mapy (jsdom/Leaflet se neinicializuje): čistě decode polyline
 * + bounds + kontrakt souborů. Mapová vrstva je lazy `import("leaflet")`,
 * takže unit testy nikdy netahají Leaflet ani dlaždice.
 * Strict TS, žádný `any`.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  dekodujPolyline,
  jePlatnaSouradnice,
  slucHranice,
  spocitejHranice,
} from "../src/lib/polyline";

function cti(soubor: string): string {
  return readFileSync(soubor, "utf8");
}

describe("dekodujPolyline (vlastní, bez těžké deps)", () => {
  it("klasický Google příklad → 3 body", () => {
    const body = dekodujPolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@");
    expect(body.length).toBe(3);
    expect(body[0]?.lat).toBeCloseTo(38.5, 4);
    expect(body[0]?.lng).toBeCloseTo(-120.2, 4);
    expect(body[1]?.lat).toBeCloseTo(40.7, 4);
    expect(body[1]?.lng).toBeCloseTo(-120.95, 4);
    expect(body[2]?.lat).toBeCloseTo(43.252, 4);
    expect(body[2]?.lng).toBeCloseTo(-126.453, 4);
  });

  it("prázdný / whitespace vstup → [] (prázdný stav mapy)", () => {
    expect(dekodujPolyline("")).toEqual([]);
    expect(dekodujPolyline("   ")).toEqual([]);
  });

  it("poškozený vstup nikdy nevyhazuje → []", () => {
    expect(() => dekodujPolyline("!!!")).not.toThrow();
    expect(dekodujPolyline("!!!")).toEqual([]);
    expect(() => dekodujPolyline("_p~iF")).not.toThrow();
    // Useknutý pár (jen lat bez lng) → nic úplného
    expect(dekodujPolyline("_p~iF").length).toBeLessThanOrEqual(1);
  });

  it("jeden pár lat+lng zaokrouhlí na 1e5", () => {
    // "??" = (0,0): dva nulové varinty
    const body = dekodujPolyline("??");
    expect(body.length).toBe(1);
    expect(body[0]).toEqual({ lat: 0, lng: 0 });
  });

  it("mimo WGS84 se filtruje (obrana proti poškozené trase)", () => {
    expect(jePlatnaSouradnice({ lat: 49.2, lng: 16.6 })).toBe(true);
    expect(jePlatnaSouradnice({ lat: 91, lng: 0 })).toBe(false);
    expect(jePlatnaSouradnice({ lat: 0, lng: 181 })).toBe(false);
    expect(jePlatnaSouradnice({ lat: NaN, lng: 0 })).toBe(false);
  });
});

describe("spocitejHranice + slucHranice (fitBounds)", () => {
  it("prázdný vstup → null (výchozí pohled na ČR)", () => {
    expect(spocitejHranice([])).toBeNull();
    expect(slucHranice([])).toBeNull();
    expect(slucHranice([null, null])).toBeNull();
  });

  it("jeden bod → nulová plocha se stejnými rohy", () => {
    const hranice = spocitejHranice([{ lat: 50, lng: 14 }]);
    expect(hranice).toEqual({ jih: 50, zapad: 14, sever: 50, vychod: 14 });
  });

  it("tři body z Google příkladu → správné rohy", () => {
    const body = dekodujPolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@");
    const hranice = spocitejHranice(body);
    expect(hranice?.jih).toBeCloseTo(38.5, 4);
    expect(hranice?.sever).toBeCloseTo(43.252, 4);
    expect(hranice?.zapad).toBeCloseTo(-126.453, 4);
    expect(hranice?.vychod).toBeCloseTo(-120.2, 4);
  });

  it("sloučí dvě trasy do jedné obálky", () => {
    const vysledek = slucHranice([
      { jih: 48, zapad: 12, sever: 49, vychod: 14 },
      { jih: 50, zapad: 15, sever: 51, vychod: 17 },
    ]);
    expect(vysledek).toEqual({ jih: 48, zapad: 12, sever: 51, vychod: 17 });
  });

  it("null trasy přeskočí, platnou nechá", () => {
    const vysledek = slucHranice([
      null,
      { jih: 48, zapad: 12, sever: 49, vychod: 14 },
    ]);
    expect(vysledek).toEqual({ jih: 48, zapad: 12, sever: 49, vychod: 14 });
  });
});

describe("kontrakt souborů Kroku 4 (statický, bez DOM)", () => {
  it("Heatmapa.tsx: lazy leaflet, OSM bez klíče, prázdný + offline stav", () => {
    const obsah = cti("src/components/profil/Heatmapa.tsx");
    expect(obsah).toContain('import("leaflet")');
    expect(obsah).not.toContain("react-leaflet");
    expect(obsah).toContain("tile.openstreetmap.org");
    expect(obsah.toLowerCase()).not.toContain("api_key");
    expect(obsah.toLowerCase()).not.toContain("apikey");
    expect(obsah).toContain("Mapa je zatím čistá");
    expect(obsah).toContain("Jsi offline");
    expect(obsah).toContain("fitBounds");
    expect(obsah).toContain("dekodujPolyline");
    expect(obsah).toContain("min-h-[44px]");
    expect(obsah).toContain("role=\"application\"");
  });

  it("Heatmapa.tsx: deníkové barvy smrk + jantar, žádný secret", () => {
    const obsah = cti("src/components/profil/Heatmapa.tsx");
    expect(obsah).toContain("#2d6a4f");
    expect(obsah).toContain("#a05e0c");
    expect(obsah.toLowerCase()).not.toContain("access_token");
    expect(obsah.toLowerCase()).not.toContain("client_secret");
  });

  it("index.css: leaflet CSS + 44px zoom + touch-action pro mapu", () => {
    const obsah = cti("src/index.css");
    expect(obsah).toContain("leaflet/dist/leaflet.css");
    expect(obsah).toContain("heatmapa-plocha");
    expect(obsah).toContain("pan-x pan-y");
    expect(obsah).toContain("44px");
  });

  it("ProfilPage: tab heatmapa líně montuje Heatmapu (PWA split)", () => {
    const obsah = cti("src/pages/ProfilPage.tsx");
    expect(obsah).toContain("../components/profil/Heatmapa");
    expect(obsah).toContain("lazy");
    expect(obsah).toContain("Suspense");
    expect(obsah).toContain('aktivniTab === "heatmapa"');
  });

  it("package.json: leaflet runtime + typy, žádný react-leaflet", () => {
    const obsah = cti("package.json");
    expect(obsah).toContain('"leaflet"');
    expect(obsah).toContain('"@types/leaflet"');
    expect(obsah).not.toContain("react-leaflet");
  });
});
