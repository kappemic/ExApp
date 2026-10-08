/**
 * tests/ucastnici-po-uzavreni.test.ts — Krok 6: dodatečná správa účastníků
 * po uzavření (varianta A, jen ADMIN, i po proběhlá).
 * Bez DB, bez HTTP — čistě hranice (validace.ts + kontrakt api-types).
 * TDD GREEN: validujPridaniUcastnikaPoUzavreni + guard matice nových endpointů.
 */
import { describe, expect, it } from "vitest";
import {
  EXPEDICE_UCASTNICI_VZOR,
  EXPEDICE_UCASTNIK_DETAIL_VZOR,
  HTTP_STATUS_PRO_KOD,
  MATICE_EXPEDICE,
  PRISTUP_KROK2,
  VALIDACNI_ZPRAVY,
  odebratUcastnikaPath,
  pridatUcastnikaPoUzavreniPath,
  smiNaEndpoint,
} from "../src/shared/api-types";
import { validujPridaniUcastnikaPoUzavreni } from "../server/src/validace";

/* ------------------------------------------------------------------ */
/* Validace přidání (XOR, status default, neznámý status)                */
/* ------------------------------------------------------------------ */

describe("validujPridaniUcastnikaPoUzavreni — XOR identit", () => {
  it("projde s userId (status default ucastnil_se)", () => {
    const vysledek = validujPridaniUcastnikaPoUzavreni({
      userId: "11111111-1111-1111-1111-111111111111",
    });
    expect(vysledek.uspech).toBe(true);
    expect(vysledek.data?.userId).toBe(
      "11111111-1111-1111-1111-111111111111",
    );
    expect(vysledek.data?.clenId).toBeNull();
    expect(vysledek.data?.status).toBe("ucastnil_se");
  });

  it("projde s clenId + explicitní omluven", () => {
    const vysledek = validujPridaniUcastnikaPoUzavreni({
      clenId: "c01",
      status: "omluven",
    });
    expect(vysledek.uspech).toBe(true);
    expect(vysledek.data?.clenId).toBe("c01");
    expect(vysledek.data?.status).toBe("omluven");
  });

  it("bez identity neprojde (ucastnikIdentitaChybi)", () => {
    const vysledek = validujPridaniUcastnikaPoUzavreni({});
    expect(vysledek.uspech).toBe(false);
    expect(vysledek.chybyPoli["ucastnik"]).toContain(
      VALIDACNI_ZPRAVY.ucastnikIdentitaChybi,
    );
  });

  it("obojí (userId + clenId) neprojde (ucastnikIdentitaOboji)", () => {
    const vysledek = validujPridaniUcastnikaPoUzavreni({
      userId: "u1",
      clenId: "c01",
    });
    expect(vysledek.uspech).toBe(false);
    expect(vysledek.chybyPoli["ucastnik"]).toContain(
      VALIDACNI_ZPRAVY.ucastnikIdentitaOboji,
    );
  });

  it("prázdné identity se berou jako chybějící", () => {
    const vysledek = validujPridaniUcastnikaPoUzavreni({
      userId: "   ",
      clenId: "  ",
    });
    expect(vysledek.uspech).toBe(false);
    expect(vysledek.chybyPoli["ucastnik"]).toContain(
      VALIDACNI_ZPRAVY.ucastnikIdentitaChybi,
    );
  });

  it("neznámý status (prihlasen) neprojde (ucastnikStatusNeplatny)", () => {
    const vysledek = validujPridaniUcastnikaPoUzavreni({
      userId: "u1",
      status: "prihlasen",
    });
    expect(vysledek.uspech).toBe(false);
    expect(vysledek.chybyPoli["status"]).toContain(
      VALIDACNI_ZPRAVY.ucastnikStatusNeplatny,
    );
  });

  it("non-objekt vrátí chybu těla", () => {
    const vysledek = validujPridaniUcastnikaPoUzavreni(null);
    expect(vysledek.uspech).toBe(false);
    expect(vysledek.chybyPoli["telo"]?.length).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ */
/* Guard matice nových endpointů (ADMIN; USER 403, bez session 401)     */
/* ------------------------------------------------------------------ */

describe("guard — dodatečná správa po uzavření je ADMIN", () => {
  it("matice: POST ucastnici i DELETE detail je ADMIN", () => {
    const najdi = (metoda: string, cesta: string) =>
      MATICE_EXPEDICE.find((r) => r.metoda === metoda && r.cesta === cesta);
    expect(najdi("POST", EXPEDICE_UCASTNICI_VZOR)?.kdo).toBe("ADMIN");
    expect(najdi("DELETE", EXPEDICE_UCASTNIK_DETAIL_VZOR)?.kdo).toBe("ADMIN");
  });

  it("vzor detailu účastníka je v PRISTUP_KROK2 ADMIN", () => {
    expect(PRISTUP_KROK2[EXPEDICE_UCASTNIK_DETAIL_VZOR]).toBe("ADMIN");
  });

  it("USER na ADMIN-only nesmí (smiNaEndpoint → false = 403 ZAKAZANO)", () => {
    expect(smiNaEndpoint("USER", "/api/admin/codes")).toBe(false);
    expect(HTTP_STATUS_PRO_KOD["ZAKAZANO"]).toBe(403);
  });

  it("bez session nesmí nikam kromě PUBLIC (→ 401 NEPRIHLASEN)", () => {
    expect(smiNaEndpoint(null, "/api/admin/codes")).toBe(false);
    expect(HTTP_STATUS_PRO_KOD["NEPRIHLASEN"]).toBe(401);
  });

  it("path helpery staví URL dodatečné správy", () => {
    expect(pridatUcastnikaPoUzavreniPath("abc")).toBe(
      "/api/expeditions/abc/ucastnici",
    );
    expect(odebratUcastnikaPath("abc", "u1")).toBe(
      "/api/expeditions/abc/ucastnici/u1",
    );
  });
});
