/**
 * tests/admin-clenove.test.ts — TDD RED: PATCH users 3D role (bez DB, bez HTTP).
 *
 * Spec (normativní):
 * - PATCH users přijímá `clenstvi?/funkce?/isAdmin?/skola?/trida?`
 *   (parciální) NEBO staré `{ role }` — nikdy obojí najednou (obojí → 422).
 * - Pravidlo 3D: funkce jen s aktivni_clen; isAdmin ortogonální.
 *
 * RED stav: `validujUpravuUzivatele` v `server/src/validace.ts` zatím
 * neexistuje (collection chyba = red). Původní `validujUpravuRoleUzivatele`
 * existuje a staré `{ role }` přes něj dál prochází (kontrakt se neláme).
 * Ne-admin zamítnutí se na route úrovni bez DB netestuje (záměrně vynecháno).
 * Produkční kód se nemění — jen testy.
 */
import { describe, expect, it } from "vitest";
import { HTTP_STATUS_PRO_KOD } from "../src/shared/api-types";
import {
  validujUpravuRoleUzivatele,
  validujUpravuUzivatele,
} from "../server/src/validace";

describe("PATCH users — parciální 3D trio (clenstvi/funkce/isAdmin/skola/trida)", () => {
  it("samotné clenstvi projde", () => {
    const vysledek = validujUpravuUzivatele({ clenstvi: "aktivni_clen" });
    expect(vysledek.uspech).toBe(true);
    expect(vysledek.data).toMatchObject({ clenstvi: "aktivni_clen" });
  });

  it("celé trio clenstvi + funkce + isAdmin projde", () => {
    const vysledek = validujUpravuUzivatele({
      clenstvi: "aktivni_clen",
      funkce: "vedeni",
      isAdmin: false,
    });
    expect(vysledek.uspech).toBe(true);
  });

  it("samotné isAdmin projde (ortogonální příznak)", () => {
    const vysledek = validujUpravuUzivatele({ isAdmin: true });
    expect(vysledek.uspech).toBe(true);
    expect(vysledek.data).toMatchObject({ isAdmin: true });
  });

  it("parciální skola + trida projdou (trim, max 120)", () => {
    const vysledek = validujUpravuUzivatele({
      skola: "  ZŠ Lesní  ",
      trida: "  5.A  ",
    });
    expect(vysledek.uspech).toBe(true);
    expect(vysledek.data).toMatchObject({ skola: "ZŠ Lesní", trida: "5.A" });
  });
});

describe("PATCH users — zpětná kompatibilita starého {role}", () => {
  it("původní validátor přijme {role} (stávající kontrakt se neláme)", () => {
    const vysledek = validujUpravuRoleUzivatele({ role: "clen" });
    expect(vysledek.uspech).toBe(true);
  });

  it("nový validátor přijme i samotné staré {role}", () => {
    const vysledek = validujUpravuUzivatele({ role: "clen" });
    expect(vysledek.uspech).toBe(true);
  });
});

describe("PATCH users — exkluzivita (nikdy obojí najednou → 422)", () => {
  it("VALIDATION_ERROR mapuje na 422 (kontrakt)", () => {
    expect(HTTP_STATUS_PRO_KOD["VALIDATION_ERROR"]).toBe(422);
  });

  it("role + clenstvi najednou neprojde", () => {
    const vysledek = validujUpravuUzivatele({
      role: "clen",
      clenstvi: "clen",
    });
    expect(vysledek.uspech).toBe(false);
    expect(Object.keys(vysledek.chybyPoli).length).toBeGreaterThan(0);
  });

  it("role + isAdmin najednou neprojde", () => {
    const vysledek = validujUpravuUzivatele({ role: "clen", isAdmin: true });
    expect(vysledek.uspech).toBe(false);
    expect(Object.keys(vysledek.chybyPoli).length).toBeGreaterThan(0);
  });

  it("clen + funkce neprojde (3D pravidlo i na PATCH úrovni)", () => {
    const vysledek = validujUpravuUzivatele({
      clenstvi: "clen",
      funkce: "vedeni",
    });
    expect(vysledek.uspech).toBe(false);
    expect(Object.keys(vysledek.chybyPoli).length).toBeGreaterThan(0);
  });
});
