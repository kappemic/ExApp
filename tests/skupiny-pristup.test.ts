import { describe, expect, it } from "vitest";
import {
  idZeKliceSkupiny,
  muzeCistSkupinu,
  muzeMenitPristupSkupiny,
  muzePsatDoSkupiny,
  muzeSpravovatSkupiny,
  normalizujPravaSkupiny,
  roleZProfilu,
  souhrnPrav,
  vychoziPravaSkupiny,
} from "../src/lib/skupiny-pristup";

describe("přístup ke skupinám podle rolí", () => {
  const prava = normalizujPravaSkupiny([
    { role: "clen", cist: true, psat: false },
    { role: "aktivni-clen", cist: true, psat: true },
    { role: "vedeni", cist: false, psat: false },
    { role: "clen-rady", cist: false, psat: true },
    { role: "admin", cist: false, psat: false },
  ]);

  it("psaní zapne čtení a rada s psaním skupinu vidí", () => {
    expect(prava).not.toBeNull();
    if (prava === null) return;
    expect(prava.find((pravo) => pravo.role === "clen-rady")).toEqual({
      role: "clen-rady",
      cist: true,
      psat: true,
    });
    expect(muzeCistSkupinu(["clen"], prava)).toBe(true);
    expect(muzePsatDoSkupiny(["clen"], prava)).toBe(false);
    expect(muzePsatDoSkupiny(["aktivni-clen"], prava)).toBe(true);
    expect(muzeCistSkupinu(["vedeni"], prava)).toBe(false);
  });

  it("bez jediné čtenářské role práva spadnou", () => {
    expect(
      normalizujPravaSkupiny([
        { role: "clen", cist: false, psat: false },
      ]),
    ).toBeNull();
  });

  it("správu mají vedení, rada a admin", () => {
    expect(
      muzeSpravovatSkupiny({ clenstvi: "aktivni_clen", funkce: "vedeni", isAdmin: false }),
    ).toBe(true);
    expect(
      muzeSpravovatSkupiny({ clenstvi: "aktivni_clen", funkce: "rada", isAdmin: false }),
    ).toBe(true);
    expect(
      muzeSpravovatSkupiny({ clenstvi: "clen", funkce: null, isAdmin: true }),
    ).toBe(true);
    expect(
      muzeSpravovatSkupiny({ clenstvi: "aktivni_clen", funkce: null, isAdmin: false }),
    ).toBe(false);
  });

  it("oprávnění skupiny mění jen admin", () => {
    expect(
      muzeMenitPristupSkupiny({ clenstvi: "aktivni_clen", funkce: "vedeni", isAdmin: false }),
    ).toBe(false);
    expect(
      muzeMenitPristupSkupiny({ clenstvi: "aktivni_clen", funkce: "rada", isAdmin: false }),
    ).toBe(false);
    expect(
      muzeMenitPristupSkupiny({ clenstvi: "clen", funkce: null, isAdmin: true }),
    ).toBe(true);
  });

  it("profil složí role a klíč skupiny", () => {
    expect(
      roleZProfilu({ clenstvi: "aktivni_clen", funkce: "rada", isAdmin: true }),
    ).toEqual(["admin", "clen-rady", "aktivni-clen"]);
    expect(idZeKliceSkupiny("skupina:11111111-1111-1111-1111-111111111111")).toBe(
      "11111111-1111-1111-1111-111111111111",
    );
    expect(idZeKliceSkupiny("general")).toBeNull();
  });

  it("souhrn do přehledu oprávnění oddělí psaní a čtení", () => {
    expect(prava === null ? null : souhrnPrav(prava)).toEqual({
      pise: "Aktivní člen, Člen rady",
      cte: "Člen",
    });
    expect(souhrnPrav(vychoziPravaSkupiny())).toEqual({ pise: "všichni", cte: null });
    expect(souhrnPrav([{ role: "clen", cist: true, psat: false }]).pise).toBe("nikdo");
  });
});
