import { describe, expect, it } from "vitest";
import { cislaStranek, stranka } from "../src/lib/strankovani";

describe("stranka", () => {
  const cisla = Array.from({ length: 23 }, (_, i) => i + 1);

  it("vrátí 10 položek a počet stránek", () => {
    const s = stranka(cisla, 1, 10);
    expect(s.polozky).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(s.pocet).toBe(3);
    expect(s.cislo).toBe(1);
  });

  it("poslední stránka je zkrácená", () => {
    expect(stranka(cisla, 3, 10).polozky).toEqual([21, 22, 23]);
  });

  it("číslo mimo rozsah se ořízne", () => {
    expect(stranka(cisla, 9, 10).cislo).toBe(3);
    expect(stranka(cisla, 0, 10).cislo).toBe(1);
  });

  it("prázdný seznam má jednu prázdnou stránku", () => {
    expect(stranka([], 1, 10)).toEqual({ polozky: [], cislo: 1, pocet: 1 });
  });
});

describe("cislaStranek", () => {
  it("do sedmi stránek ukáže všechna čísla", () => {
    expect(cislaStranek(2, 3)).toEqual([1, 2, 3]);
    expect(cislaStranek(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("u mnoha stránek zkracuje mezerami", () => {
    expect(cislaStranek(1, 12)).toEqual([1, 2, 3, 4, "…", 12]);
    expect(cislaStranek(6, 12)).toEqual([1, "…", 5, 6, 7, "…", 12]);
    expect(cislaStranek(12, 12)).toEqual([1, "…", 9, 10, 11, 12]);
  });
});
