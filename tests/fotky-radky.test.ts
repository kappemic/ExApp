import { describe, expect, it } from "vitest";
import {
  FOTKY_RADEK_MEZERA_PX,
  FOTKY_RADEK_MIN_SIRKA_PX,
  cilovaVyskaRadku,
  orezPomerFotky,
  slozRadkyFotek,
} from "../src/lib/fotky-radky";
import { pomerZRozmeru } from "../src/lib/fotky-rozmery";

function soucetRadku(sirky: number[]): number {
  return sirky.reduce((suma, sirka) => suma + sirka, 0) + Math.max(0, sirky.length - 1) * FOTKY_RADEK_MEZERA_PX;
}

describe("slozRadkyFotek", () => {
  it("vrátí prázdný seznam pro prázdný vstup i nulovou šířku", () => {
    expect(slozRadkyFotek([], 360, 128)).toEqual([]);
    expect(slozRadkyFotek([{ id: "a", pomer: 1 }], 0, 128)).toEqual([]);
  });

  it("nechá jednu fotku v cílové výšce a zarovnanou na začátek", () => {
    const radky = slozRadkyFotek([{ id: "a", pomer: 1.5 }], 800, 180);
    expect(radky).toHaveLength(1);
    expect(radky[0]?.plny).toBe(false);
    expect(radky[0]?.vyska).toBe(180);
    expect(radky[0]?.dlazdice[0]?.sirka).toBe(270);
  });

  it("vyplní plný řádek na šířku kontejneru v toleranci 1 px", () => {
    const fotky = ["a", "b", "c", "d", "e", "f"].map((id, index) => ({
      id,
      pomer: index % 2 === 0 ? 1.4 : 0.8,
    }));
    const sirka = 640;
    const radky = slozRadkyFotek(fotky, sirka, 180);
    const plne = radky.filter((radek) => radek.plny);
    expect(plne.length).toBeGreaterThan(0);
    for (const radek of plne) {
      const soucet = soucetRadku(radek.dlazdice.map((dlazdice) => dlazdice.sirka));
      expect(Math.abs(soucet - sirka)).toBeLessThanOrEqual(1);
      for (const dlazdice of radek.dlazdice) {
        expect(dlazdice.sirka).toBeGreaterThanOrEqual(FOTKY_RADEK_MIN_SIRKA_PX);
      }
    }
  });

  it("poslední řádek nenatahuje", () => {
    const radky = slozRadkyFotek(
      [
        { id: "a", pomer: 1 },
        { id: "b", pomer: 1 },
        { id: "c", pomer: 1 },
        { id: "d", pomer: 1 },
      ],
      360,
      128,
    );
    const posledni = radky[radky.length - 1];
    expect(posledni?.plny).toBe(false);
    expect(posledni?.vyska).toBe(128);
    expect(posledni?.dlazdice[0]?.sirka).toBe(128);
    expect(soucetRadku(posledni?.dlazdice.map((dlazdice) => dlazdice.sirka) ?? [])).toBeLessThan(360);
  });

  it("ořízne panorama a nenechá dlaždici užší než 44 px", () => {
    expect(orezPomerFotky(8)).toBe(2.5);
    expect(orezPomerFotky(0.1)).toBe(0.4);
    const panorama = slozRadkyFotek([{ id: "pano", pomer: 8 }], 300, 128);
    expect(panorama[0]?.plny).toBe(true);
    expect(panorama[0]?.dlazdice[0]?.sirka).toBe(300);

    const uzke = slozRadkyFotek(
      [
        { id: "a", pomer: 0.4 },
        { id: "b", pomer: 0.4 },
      ],
      80,
      128,
    );
    expect(uzke).toHaveLength(2);
    for (const radek of uzke) {
      expect(radek.dlazdice[0]?.sirka).toBeGreaterThanOrEqual(FOTKY_RADEK_MIN_SIRKA_PX);
    }
  });

  it("volí nižší řádek na telefonu a vyšší od zlomu", () => {
    expect(cilovaVyskaRadku(390)).toBe(180);
    expect(cilovaVyskaRadku(640)).toBe(220);
    expect(cilovaVyskaRadku(900)).toBe(260);
  });
});

describe("pomerZRozmeru", () => {
  it("bez rozměrů zůstane čtverec a s rozměry drží poměr", () => {
    expect(pomerZRozmeru(undefined, undefined)).toBe(1);
    expect(pomerZRozmeru(null, 900)).toBe(1);
    expect(pomerZRozmeru(1600, 900)).toBeCloseTo(1600 / 900);
  });
});
