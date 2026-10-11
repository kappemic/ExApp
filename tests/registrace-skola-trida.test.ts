/**
 * tests/registrace-skola-trida.test.ts — TDD RED: škola/třída v registraci
 * + meta kontrakt (bez DB, bez HTTP).
 *
 * Spec (normativní):
 * - Škola/třída validace: nepovinné, trim, max 120 znaků, prázdné/whitespace
 *   → '' (platné); delší než 120 → chyba pole.
 * - Meta endpoint kontrakt: `GET /api/meta/skoly-tridy`
 *   → `{ skoly: string[]; tridy: string[] }` (jen názvy, žádné osobní údaje).
 *
 * RED stav: `validujRegistraci` dnes `skola`/`trida` nezná (data je nenese)
 * a `META_SKOLY_TRIDY_PATH` / `jeSkolyTridyOdpoved` / `SkolyTridyResponse`
 * v `src/shared/api-types.ts` zatím neexistují (collection chyba = red).
 * Produkční kód se nemění — jen testy.
 */
import { describe, expect, it } from "vitest";
import { validujRegistraci } from "../server/src/validace";
import {
  META_SKOLY_TRIDY_PATH,
  jeSkolyTridyOdpoved,
} from "../src/shared/api-types";
import type { SkolyTridyResponse } from "../src/shared/api-types";

const DOBRY_KOD = "ABCDEFGH";

function dobraRegistrace(
  over: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    jmeno: "Anna",
    email: "anna@example.cz",
    heslo: "tajneheslo123",
    kod: DOBRY_KOD,
    ...over,
  };
}

describe("validujRegistraci — skola/trida nepovinné", () => {
  it("bez skola/trida projde", () => {
    const vysledek = validujRegistraci(dobraRegistrace());
    expect(vysledek.uspech).toBe(true);
  });

  it("prázdné a whitespace → '' (platné)", () => {
    for (const hodnota of ["", "   ", "\t\n "]) {
      const vysledek = validujRegistraci(
        dobraRegistrace({ skola: hodnota, trida: hodnota }),
      );
      expect(vysledek.uspech).toBe(true);
      expect(vysledek.data).toMatchObject({ skola: "", trida: "" });
    }
  });

  it("trimuje okraje", () => {
    const vysledek = validujRegistraci(
      dobraRegistrace({ skola: "  ZŠ Lesní  ", trida: "  5.A  " }),
    );
    expect(vysledek.uspech).toBe(true);
    expect(vysledek.data).toMatchObject({ skola: "ZŠ Lesní", trida: "5.A" });
  });

  it("120 znaků projde (skola i trida)", () => {
    const vysledek = validujRegistraci(
      dobraRegistrace({ skola: "x".repeat(120), trida: "y".repeat(120) }),
    );
    expect(vysledek.uspech).toBe(true);
    expect(vysledek.data).toMatchObject({
      skola: "x".repeat(120),
      trida: "y".repeat(120),
    });
  });

  it("121 znaků u skola neprojde s chybou pole", () => {
    const vysledek = validujRegistraci(
      dobraRegistrace({ skola: "x".repeat(121) }),
    );
    expect(vysledek.uspech).toBe(false);
    expect(vysledek.chybyPoli["skola"]?.length).toBeGreaterThan(0);
  });

  it("121 znaků u trida neprojde s chybou pole", () => {
    const vysledek = validujRegistraci(
      dobraRegistrace({ trida: "y".repeat(121) }),
    );
    expect(vysledek.uspech).toBe(false);
    expect(vysledek.chybyPoli["trida"]?.length).toBeGreaterThan(0);
  });

  it("data nesou vyčištěné skola/trida", () => {
    const vysledek = validujRegistraci(
      dobraRegistrace({ skola: "ZŠ Lesní", trida: "5.A" }),
    );
    expect(vysledek.uspech).toBe(true);
    expect(vysledek.data).toMatchObject({ skola: "ZŠ Lesní", trida: "5.A" });
  });

  it("bez skola/trida jsou data prázdná (''), ne undefined chaos", () => {
    const vysledek = validujRegistraci(dobraRegistrace());
    expect(vysledek.uspech).toBe(true);
    expect(vysledek.data).toMatchObject({ skola: "", trida: "" });
  });
});

describe("meta kontrakt — GET /api/meta/skoly-tridy", () => {
  it("cesta je /api/meta/skoly-tridy", () => {
    expect(META_SKOLY_TRIDY_PATH).toBe("/api/meta/skoly-tridy");
  });

  it("platná odpověď (pole stringů) guardem projde", () => {
    const odpoved: SkolyTridyResponse = {
      skoly: ["ZŠ Lesní", "Gymnázium Luh"],
      tridy: ["5.A", "9.B"],
    };
    expect(jeSkolyTridyOdpoved(odpoved)).toBe(true);
  });

  it("prázdné seznamy jsou platné", () => {
    expect(jeSkolyTridyOdpoved({ skoly: [], tridy: [] })).toBe(true);
  });

  it("ne-pole a ne-stringové položky guardem neprojdou", () => {
    expect(jeSkolyTridyOdpoved({ skoly: "ZŠ", tridy: [] })).toBe(false);
    expect(jeSkolyTridyOdpoved({ skoly: [42], tridy: [] })).toBe(false);
    expect(jeSkolyTridyOdpoved({ skoly: [], tridy: [null] })).toBe(false);
    expect(jeSkolyTridyOdpoved(null)).toBe(false);
  });

  it("osobní údaje (user_id, e-maily) guardem neprojdou", () => {
    expect(
      jeSkolyTridyOdpoved({ skoly: ["ZŠ"], tridy: ["5.A"], user_id: "u1" }),
    ).toBe(false);
    expect(
      jeSkolyTridyOdpoved({
        skoly: ["ZŠ"],
        tridy: ["5.A"],
        email: "anna@example.cz",
      }),
    ).toBe(false);
  });
});
