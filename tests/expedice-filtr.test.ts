/**
 * tests/expedice-filtr.test.ts — Krok 14: vyhledávání výprav podle jména.
 *
 * Klientský filtr existujícího seznamu (žádný nový endpoint):
 * case-insensitive, diakritika-insensitive, debounce řeší UI,
 * prázdný stav „Nic jsme nenašli" řeší VypravyPage.
 * Strict TS, žádný `any`.
 */
import { describe, expect, it } from "vitest";
import {
  filtrujExpedicePodleJmena,
  normalizujProVyhledavani,
} from "../src/lib/expedice-filtr";

function seznam(): Array<{ nazev: string }> {
  return [
    { nazev: "Podzimní Šumava – Tříjezerní slať" },
    { nazev: "Český ráj – Prachovské skály" },
    { nazev: "Krkonoše – Sněžka přes Obří důl" },
  ];
}

describe("normalizujProVyhledavani", () => {
  it("odstraní diakritiku a sníží case", () => {
    expect(normalizujProVyhledavani("Šumava")).toBe("sumava");
    expect(normalizujProVyhledavani("TŘÍJEZERNÍ SLAŤ")).toBe("trijezerni slat");
  });

  it("ořízne mezery", () => {
    expect(normalizujProVyhledavani("  Krkonoše  ")).toBe("krkonose");
  });
});

describe("filtrujExpedicePodleJmena", () => {
  it("prázdný dotaz vrací celý seznam", () => {
    expect(filtrujExpedicePodleJmena(seznam(), "").length).toBe(3);
    expect(filtrujExpedicePodleJmena(seznam(), "   ").length).toBe(3);
  });

  it("filtruje case-insensitive", () => {
    const vysledek = filtrujExpedicePodleJmena(seznam(), "krkonose");
    expect(vysledek.map((e) => e.nazev)).toEqual([
      "Krkonoše – Sněžka přes Obří důl",
    ]);
  });

  it("filtruje diakritika-insensitive (sumava najde Šumava)", () => {
    const vysledek = filtrujExpedicePodleJmena(seznam(), "sumava");
    expect(vysledek.length).toBe(1);
    expect(vysledek[0]?.nazev).toContain("Šumava");
  });

  it("dotaz s diakritikou najde i bez-diakritický základ", () => {
    const vysledek = filtrujExpedicePodleJmena(seznam(), "Šumava");
    expect(vysledek.length).toBe(1);
  });

  it("podřetězec uprostřed jména (raj najde Český ráj)", () => {
    const vysledek = filtrujExpedicePodleJmena(seznam(), "ráj");
    expect(vysledek.length).toBe(1);
    expect(vysledek[0]?.nazev).toContain("Český ráj");
  });

  it("bez shody vraci prazdne pole", () => {
    expect(filtrujExpedicePodleJmena(seznam(), "tatry").length).toBe(0);
  });

  it("zachovává pořadí seznamu", () => {
    const vstup = [...seznam(), { nazev: "Šumava – Modrava" }];
    const vysledek = filtrujExpedicePodleJmena(vstup, "sumava");
    expect(vysledek.map((e) => e.nazev)).toEqual([
      "Podzimní Šumava – Tříjezerní slať",
      "Šumava – Modrava",
    ]);
  });
});
