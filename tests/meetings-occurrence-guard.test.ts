/**
 * tests/meetings-occurrence-guard.test.ts — Krok 3-oprava-2 (hardening).
 *
 * Strážci DELETE /api/meetings/:id/occurrence:
 * - bez `?rozvrhem=vyskyt` → 422, řada zůstává (místo tichého smazání řady),
 * - výskyt na jednorázové → 422, žádný řádek v meeting_exceptions.
 * Čisté predikáty + HTTP mapování z kontraktu (chyby.ts).
 */
import { describe, expect, it } from "vitest";
import { jeRozvrhemVyskyt, smiSmazatVyskyt } from "../server/src/schuzky";
import { httpStatusProKod } from "../server/src/chyby";

describe("jeRozvrhemVyskyt — bez rozvrhem=vyskyt se nic nemaže", () => {
  it("jen přesné 'vyskyt' projde", () => {
    expect(jeRozvrhemVyskyt("vyskyt")).toBe(true);
  });

  it("chybějící / prázdné / 'rada' neprojde", () => {
    expect(jeRozvrhemVyskyt(undefined)).toBe(false);
    expect(jeRozvrhemVyskyt("")).toBe(false);
    expect(jeRozvrhemVyskyt("rada")).toBe(false);
  });
});

describe("smiSmazatVyskyt — jen týdenní řada", () => {
  it("tydenni projde", () => {
    expect(smiSmazatVyskyt("tydenni")).toBe(true);
  });

  it("jednorazova neprojde (422, bez insertu)", () => {
    expect(smiSmazatVyskyt("jednorazova")).toBe(false);
  });
});

describe("HTTP mapování strážců (kontrakt api-types §14)", () => {
  it("VALIDATION_ERROR → 422", () => {
    expect(httpStatusProKod("VALIDATION_ERROR")).toBe(422);
  });

  it("NENALEZENO → 404 (opakovaný DELETE)", () => {
    expect(httpStatusProKod("NENALEZENO")).toBe(404);
  });
});
