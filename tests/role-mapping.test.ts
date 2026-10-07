/**
 * tests/role-mapping.test.ts — smoke role mapping + kody + CORS (bez DB).
 * - roles.ts: isKnownRole / jeAdmin / chybaKombinaceRole
 * - api-types normalizujKod + kody nahodnyKod (tvar 8, bez 0/O/1/I)
 * - CORS: parseAllowedOrigins pro produkci (CLIENT_URL, vice originu)
 */
import { describe, expect, it } from "vitest";
import {
  chybaKombinaceRole,
  isKnownRole,
  jeAdmin,
} from "../src/config/roles";
import { normalizujKod } from "../src/shared/api-types";
import { KOD_DELKA, KOD_ZNAKY, nahodnyKod } from "../server/src/kody";
import { parseAllowedOrigins } from "../server/src/cors";

describe("role mapping — binarni auth (ROLE_DOC.md)", () => {
  it("zna 5 roli", () => {
    expect(isKnownRole("admin")).toBe(true);
    expect(isKnownRole("clen")).toBe(true);
    expect(isKnownRole("aktivni-clen")).toBe(true);
    expect(isKnownRole("clen-rady")).toBe(true);
    expect(isKnownRole("vedeni")).toBe(true);
    expect(isKnownRole("superadmin")).toBe(false);
  });

  it("jeAdmin je true jen pro admina", () => {
    expect(jeAdmin(["admin"])).toBe(true);
    expect(jeAdmin(["clen"])).toBe(false);
    expect(jeAdmin(["aktivni-clen", "vedeni"])).toBe(false);
  });

  it("samotny admin je validni kombinace", () => {
    expect(chybaKombinaceRole(["admin"])).toBeNull();
  });

  it("baze je prave jedna z clen XOR aktivni-clen", () => {
    expect(chybaKombinaceRole(["clen"])).toBeNull();
    expect(chybaKombinaceRole(["aktivni-clen"])).toBeNull();
    expect(chybaKombinaceRole(["clen", "aktivni-clen"])).not.toBeNull();
  });

  it("nadstavba vyzaduje aktivniho clena", () => {
    expect(chybaKombinaceRole(["aktivni-clen", "vedeni"])).toBeNull();
    expect(chybaKombinaceRole(["clen", "vedeni"])).not.toBeNull();
  });
});

describe("kody — tvar dle kontraktu", () => {
  it("nahodny kod ma 8 znaku z povolone abecedy", () => {
    const kod = nahodnyKod();
    expect(kod).toHaveLength(KOD_DELKA);
    for (const znak of kod) {
      expect(KOD_ZNAKY.includes(znak)).toBe(true);
    }
  });

  it("abeceda neobsahuje 0/O/1/I", () => {
    for (const znak of ["0", "O", "1", "I"]) {
      expect(KOD_ZNAKY.includes(znak)).toBe(false);
    }
  });

  it("normalizujKod prevede na uppercase a stripne balast", () => {
    expect(normalizujKod(" abcd-efgh ")).toBe("ABCDEFGH");
    expect(normalizujKod("abcdefgh")).toBe("ABCDEFGH");
  });
});

describe("CORS — parseAllowedOrigins pro produkci", () => {
  it("prazdny vstup vrati lokalni default", () => {
    expect(parseAllowedOrigins(undefined)).toEqual(["http://localhost:5173"]);
    expect(parseAllowedOrigins("")).toEqual(["http://localhost:5173"]);
  });

  it("jeden origin projde", () => {
    expect(parseAllowedOrigins("https://app.example.cz")).toEqual([
      "https://app.example.cz",
    ]);
  });

  it("vice originu oddelenych carkou, trim a bez prazdnych", () => {
    expect(
      parseAllowedOrigins(
        "https://app.example.cz, https://admin.example.cz,, ",
      ),
    ).toEqual(["https://app.example.cz", "https://admin.example.cz"]);
  });
});
