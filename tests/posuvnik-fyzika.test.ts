import { describe, expect, it } from "vitest";
import { bezGumy, cilPrichyceni, guma, krokPruziny, sGumou, sousedniZarazka } from "../src/lib/posuvnik-fyzika";

describe("guma za krajem", () => {
  it("uvnitř mezí drží polohu 1:1 a za krajem klade rostoucí odpor", () => {
    expect(sGumou(120, 500, 375)).toBe(120);
    const malo = guma(40, 375);
    const hodne = guma(400, 375);
    expect(malo).toBeGreaterThan(0);
    expect(malo).toBeLessThan(40);
    expect(hodne).toBeLessThan(400);
    expect(hodne / 400).toBeLessThan(malo / 40);
    expect(sGumou(-40, 500, 375)).toBeCloseTo(-malo);
    expect(sGumou(540, 500, 375)).toBeCloseTo(500 + malo);
  });

  it("jde chytit za krajem bez skoku", () => {
    for (const prst of [-180, -5, 0, 250, 500, 505, 760]) {
      expect(bezGumy(sGumou(prst, 500, 375), 500, 375)).toBeCloseTo(prst, 4);
    }
  });
});

describe("cilPrichyceni", () => {
  const zarazky = [0, 310, 632, 954];

  it("pomalé puštění jde na nejbližší kartu", () => {
    expect(cilPrichyceni(140, 0, zarazky)).toBe(0);
    expect(cilPrichyceni(170, 0, zarazky)).toBe(310);
  });

  it("švih posune aspoň o kartu, i když prst ujel málo", () => {
    expect(cilPrichyceni(40, 0.5, zarazky)).toBe(310);
    expect(cilPrichyceni(600, -0.5, zarazky)).toBe(310);
  });

  it("za krajem se vrací na krajní kartu", () => {
    expect(cilPrichyceni(-60, -1.5, zarazky)).toBe(0);
    expect(cilPrichyceni(1010, 1.5, zarazky)).toBe(954);
    expect(cilPrichyceni(80, 1, [])).toBe(0);
  });
});

describe("krokPruziny", () => {
  function dojed(poloha: number, rychlost: number, cil: number): { konec: number; ms: number; max: number } {
    let stav = { poloha, rychlost, hotovo: false };
    let ms = 0;
    let max = poloha;
    while (!stav.hotovo && ms < 3000) {
      stav = krokPruziny(stav.poloha, stav.rychlost, cil, 16);
      max = Math.max(max, stav.poloha);
      ms += 16;
    }
    return { konec: stav.poloha, ms, max };
  }

  it("dojede přesně na cíl do tři čtvrtě sekundy", () => {
    const vysledek = dojed(0, 0, 310);
    expect(vysledek.konec).toBe(310);
    expect(vysledek.ms).toBeLessThan(750);
  });

  it("švih do kraje ho lehce přejede a vrátí se", () => {
    const vysledek = dojed(900, 2, 954);
    expect(vysledek.max).toBeGreaterThan(965);
    expect(vysledek.konec).toBe(954);
  });

  it("dlouhá pauza mezi snímky pružinu nerozbije", () => {
    const stav = krokPruziny(0, 3, 310, 5000);
    expect(Number.isFinite(stav.poloha)).toBe(true);
    expect(Math.abs(stav.poloha)).toBeLessThan(1000);
  });
});

describe("sousední zarážka pro šipky", () => {
  const zarazky = [0, 310, 620, 700];

  it("jde o jednu kartu, i z mezipolohy nebo neceločíselné zarážky", () => {
    expect(sousedniZarazka(0, 1, zarazky)).toBe(310);
    expect(sousedniZarazka(309.6, 1, zarazky)).toBe(620);
    expect(sousedniZarazka(310.4, -1, zarazky)).toBe(0);
    expect(sousedniZarazka(450, -1, zarazky)).toBe(310);
  });

  it("na kraji zůstane a prázdný posuvník nespadne", () => {
    expect(sousedniZarazka(700, 1, zarazky)).toBe(700);
    expect(sousedniZarazka(0, -1, zarazky)).toBe(0);
    expect(sousedniZarazka(0, 1, [])).toBe(0);
  });
});
