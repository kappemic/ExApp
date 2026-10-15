import { describe, expect, it } from "vitest";
import {
  idsFotekKeSmazani,
  nadpisPotvrzeniMazaniFotek,
  popisPotvrzeniMazaniFotek,
} from "../src/lib/fotky-mazani";

const FOTKY = [{ id: "a" }, { id: "b" }, { id: "c" }];

describe("idsFotekKeSmazani", () => {
  it("vrátí všechna id při potvrzení vše", () => {
    expect(idsFotekKeSmazani(FOTKY, new Set(), "vse")).toEqual(["a", "b", "c"]);
  });

  it("vrátí jen vybraná id při potvrzení vybrané", () => {
    expect(idsFotekKeSmazani(FOTKY, new Set(["b", "c"]), "vybrane")).toEqual(["b", "c"]);
  });

  it("prázdný výběr při vybrané vrátí prázdné pole", () => {
    expect(idsFotekKeSmazani(FOTKY, new Set(), "vybrane")).toEqual([]);
  });
});

describe("potvrzovací texty mazání fotek", () => {
  it("liší nadpis pro vše a vybrané", () => {
    expect(nadpisPotvrzeniMazaniFotek("vse", false)).toBe("Smazat všechny fotky?");
    expect(nadpisPotvrzeniMazaniFotek("vybrane", false)).toBe("Smazat vybrané fotky?");
    expect(nadpisPotvrzeniMazaniFotek("aktualni", true)).toBe("Jsi si jistý?");
  });

  it("popis pro jednu vybranou fotku", () => {
    expect(popisPotvrzeniMazaniFotek("vybrane", 1, false)).toContain("jednu");
    expect(popisPotvrzeniMazaniFotek("vybrane", 1, true)).toContain("koše");
  });

  it("vrátí aktuální id při potvrzení aktualni", () => {
    expect(idsFotekKeSmazani(FOTKY, new Set(), "aktualni", "b")).toEqual(["b"]);
  });
});
