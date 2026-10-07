/**
 * tests/validace.test.ts — smoke validace na hranici (bez DB, bez HTTP).
 * Server i formulare sdili pravidla z kontraktu; testy drzi hlaseni cesky
 * a tvar kodu 8 znaku bez 0/O/1/I.
 */
import { describe, expect, it } from "vitest";
import {
  validujPoznamkuKodu,
  validujPrihlaseni,
  validujRegistraci,
  validujUpravuClena,
} from "../server/src/validace";

const DOBRY_KOD = "ABCDEFGH";

function dobraRegistrace(over: Record<string, unknown> = {}) {
  return {
    jmeno: "Anna",
    email: "anna@example.cz",
    heslo: "tajneheslo123",
    kod: DOBRY_KOD,
    ...over,
  };
}

describe("validujRegistraci — kod povinny", () => {
  it("projde s platnym vstupem", () => {
    const vysledek = validujRegistraci(dobraRegistrace());
    expect(vysledek.uspech).toBe(true);
    expect(vysledek.data?.kod).toBe(DOBRY_KOD);
  });

  it("bez kodu neprojde (kod povinny)", () => {
    const vysledek = validujRegistraci(dobraRegistrace({ kod: "" }));
    expect(vysledek.uspech).toBe(false);
    expect(vysledek.chybyPoli["kod"]?.length).toBeGreaterThan(0);
  });

  it("spatny tvar kodu neprojde", () => {
    const vysledek = validujRegistraci(dobraRegistrace({ kod: "ABC" }));
    expect(vysledek.uspech).toBe(false);
    expect(vysledek.chybyPoli["kod"]).toBeDefined();
  });

  it("kod normalizuje na uppercase a strihne formatovani", () => {
    const vysledek = validujRegistraci(dobraRegistrace({ kod: " abcd-efgh " }));
    expect(vysledek.uspech).toBe(true);
    expect(vysledek.data?.kod).toBe(DOBRY_KOD);
  });

  it("kratke heslo neprojde", () => {
    const vysledek = validujRegistraci(dobraRegistrace({ heslo: "kratke" }));
    expect(vysledek.uspech).toBe(false);
    expect(vysledek.chybyPoli["heslo"]?.length).toBeGreaterThan(0);
  });

  it("neplatny e-mail neprojde", () => {
    const vysledek = validujRegistraci(
      dobraRegistrace({ email: "neni-email" }),
    );
    expect(vysledek.uspech).toBe(false);
    expect(vysledek.chybyPoli["email"]?.length).toBeGreaterThan(0);
  });

  it("non-objekt vrati chybu tela", () => {
    const vysledek = validujRegistraci(null);
    expect(vysledek.uspech).toBe(false);
    expect(vysledek.chybyPoli["telo"]?.length).toBeGreaterThan(0);
  });
});

describe("validujPrihlaseni", () => {
  it("projde s e-mailem a heslem", () => {
    const vysledek = validujPrihlaseni({
      email: "anna@example.cz",
      heslo: "tajneheslo123",
    });
    expect(vysledek.uspech).toBe(true);
  });

  it("prazdne heslo neprojde", () => {
    const vysledek = validujPrihlaseni({ email: "anna@example.cz", heslo: "" });
    expect(vysledek.uspech).toBe(false);
    expect(vysledek.chybyPoli["heslo"]?.length).toBeGreaterThan(0);
  });
});

describe("validujPoznamkuKodu", () => {
  it("prazdny vstup je OK (poznamka nepovinna)", () => {
    expect(validujPoznamkuKodu(undefined).uspech).toBe(true);
    expect(validujPoznamkuKodu(null).uspech).toBe(true);
    expect(validujPoznamkuKodu({}).uspech).toBe(true);
  });

  it("dlouha poznamka neprojde (max 120)", () => {
    const vysledek = validujPoznamkuKodu({ poznamka: "x".repeat(121) });
    expect(vysledek.uspech).toBe(false);
    expect(vysledek.chybyPoli["poznamka"]?.length).toBeGreaterThan(0);
  });
});

describe("validujUpravuClena — kombinace roli", () => {
  it("neplatna kombinace clen + aktivni-clen neprojde s details.role", () => {
    const vysledek = validujUpravuClena({ role: ["clen", "aktivni-clen"] });
    expect(vysledek.uspech).toBe(false);
    expect(vysledek.chybyPoli["role"]?.length).toBeGreaterThan(0);
  });

  it("nadstavba bez aktivniho clena neprojde", () => {
    const vysledek = validujUpravuClena({ role: ["clen", "vedeni"] });
    expect(vysledek.uspech).toBe(false);
    expect(vysledek.chybyPoli["role"]?.length).toBeGreaterThan(0);
  });

  it("platna kombinace projde", () => {
    const vysledek = validujUpravuClena({ role: ["aktivni-clen", "vedeni"] });
    expect(vysledek.uspech).toBe(true);
  });

  it("neznama role neprojde", () => {
    const vysledek = validujUpravuClena({ role: ["superadmin"] });
    expect(vysledek.uspech).toBe(false);
    expect(vysledek.chybyPoli["role"]?.length).toBeGreaterThan(0);
  });
});
