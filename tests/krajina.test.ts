import { describe, expect, it } from "vitest";
import {
  cestaVrstvy,
  obdobiProMesic,
  paletaVypravy,
  profilyVrstev,
  rozdilDni,
  textOdpoctu,
  trasaPoHrebeni,
} from "../src/lib/krajina";
import { nejblizsiAgenda } from "../src/lib/agenda";

describe("krajina výpravy", () => {
  it("roční období podle měsíce", () => {
    expect(obdobiProMesic(1)).toBe("zima");
    expect(obdobiProMesic(12)).toBe("zima");
    expect(obdobiProMesic(4)).toBe("jaro");
    expect(obdobiProMesic(7)).toBe("leto");
    expect(obdobiProMesic(11)).toBe("podzim");
  });

  it("paleta je stabilní pro stejné ID a odpovídá období", () => {
    const a = paletaVypravy("krkonose-2026", "2026-11-20");
    const b = paletaVypravy("krkonose-2026", "2026-11-20");
    expect(a.id).toBe(b.id);
    expect(a.obdobi).toBe("podzim");
    expect(paletaVypravy("x", "2027-01-09").obdobi).toBe("zima");
  });

  it("neplatné datum spadne do podzimu", () => {
    expect(paletaVypravy("x", "nesmysl").obdobi).toBe("podzim");
  });

  it("profily jsou deterministické a v mezích", () => {
    const p1 = profilyVrstev("abc");
    const p2 = profilyVrstev("abc");
    expect(p1).toEqual(p2);
    expect(p1).toHaveLength(4);
    for (const vrstva of p1) {
      for (const [x, y] of vrstva) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(1);
        expect(y).toBeGreaterThanOrEqual(0.2);
        expect(y).toBeLessThanOrEqual(0.95);
      }
    }
    expect(profilyVrstev("jine")).not.toEqual(p1);
  });

  it("cesta vrstvy je uzavřená plocha a trasa má tři zastávky", () => {
    const p = profilyVrstev("abc");
    expect(cestaVrstvy(p[0]!, 400, 300, false)).toMatch(/^M.*Z$/);
    const trasa = trasaPoHrebeni(p[1]!, 400, 300);
    expect(trasa.cesta.startsWith("M")).toBe(true);
    expect(trasa.zastavky).toHaveLength(3);
  });

  it("odpočet v češtině", () => {
    expect(rozdilDni("2026-11-15", "2026-11-20")).toBe(5);
    expect(textOdpoctu("2026-11-15", "2026-11-15", false)).toBe("Dnes");
    expect(textOdpoctu("2026-11-16", "2026-11-15", false)).toBe("Zítra");
    expect(textOdpoctu("2026-11-18", "2026-11-15", false)).toBe("Za 3 dny");
    expect(textOdpoctu("2026-11-20", "2026-11-15", false)).toBe("Za 5 dní");
    expect(textOdpoctu("2026-11-14", "2026-11-15", true)).toBe("Právě probíhá");
  });
});

describe("nejbližší agenda", () => {
  const vstup = {
    expedice: [
      { id: "krk", nazev: "Krkonoše", datum: "2026-11-20", datumDo: "2026-11-22", sraz: "Hlavní nádraží" },
      { id: "stara", nazev: "Stará", datum: "2026-10-01", datumDo: null, sraz: "x" },
    ],
    schuzky: [
      { id: "s1", nazev: "Schůzka", datum: "2026-11-04", mistnost: "204", opakovani: "tydenni" as const, vynecheneVyskyty: [] },
    ],
  };

  it("vícedenní výprava jen jednou, schůzky se opakují, staré výpravy ne", () => {
    const agenda = nejblizsiAgenda(vstup, "2026-11-15", 14, 10);
    const vypravy = agenda.filter((p) => p.udalost.typ === "vyprava");
    expect(vypravy).toHaveLength(1);
    expect(vypravy[0]!.datum).toBe("2026-11-20");
    const schuzky = agenda.filter((p) => p.udalost.typ === "schuzka").map((p) => p.datum);
    expect(schuzky).toEqual(["2026-11-18", "2026-11-25"]);
    const dnesni = {
      ...vstup,
      schuzky: [
        {
          id: "s1",
          nazev: "Schůzka",
          datum: "2026-11-15",
          cas: "09:00",
          mistnost: "204",
          opakovani: "jednorazova" as const,
        },
      ],
    };
    expect(
      nejblizsiAgenda(dnesni, "2026-11-15", 14, 10, "08:59").some(
        (polozka) => polozka.udalost.id === "s1",
      ),
    ).toBe(true);
    expect(
      nejblizsiAgenda(dnesni, "2026-11-15", 14, 10, "09:01").some(
        (polozka) => polozka.udalost.id === "s1",
      ),
    ).toBe(false);
    expect(agenda.map((p) => p.datum)).toEqual([...agenda.map((p) => p.datum)].sort());
  });

  it("limit a neplatné datum", () => {
    expect(nejblizsiAgenda(vstup, "2026-11-15", 14, 1)).toHaveLength(1);
    expect(nejblizsiAgenda(vstup, "x")).toEqual([]);
  });
});
