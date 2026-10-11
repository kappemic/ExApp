/**
 * tests/role-mapping.test.ts — smoke role mapping + kody + CORS (bez DB).
 * - roles.ts: isKnownRole / jeAdmin / chybaKombinaceRole
 * - api-types normalizujKod + kody nahodnyKod (tvar 8, bez 0/O/1/I)
 * - CORS: parseAllowedOrigins pro produkci (CLIENT_URL, vice originu)
 */
import { describe, expect, it } from "vitest";
import {
  chybaKombinace3D,
  chybaKombinaceRole,
  isKnownRole,
  jeAdmin,
  mapujRoliNaProfil,
  smiNaVypravy,
} from "../src/config/roles";
import type {
  ClenskyProfil,
  Clenstvi,
  Funkce,
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

/* ------------------------------------------------------------------ */
/* 3D model (spec): Clenstvi / Funkce / ClenskyProfil + mapování +      */
/* práva. TDD RED — `Clenstvi`, `Funkce`, `ClenskyProfil`,              */
/* `mapujRoliNaProfil`, `chybaKombinace3D` a `smiNaVypravy` v            */
/* `src/config/roles.ts` zatím neexistují (collection chyba = red).     */
/* Stávající testy výše se nemění, jen se přidává.                      */
/* ------------------------------------------------------------------ */

/** Pomocný konstruktor — zároveň spotřebuje importované 3D typy. */
function profil3D(
  clenstvi: Clenstvi,
  funkce: Funkce,
  isAdmin: boolean,
): ClenskyProfil {
  return { clenstvi, funkce, isAdmin };
}

describe("3D role — mapování stará→nová (spec)", () => {
  it("clen → (clen, null, false)", () => {
    expect(mapujRoliNaProfil("clen")).toEqual({
      clenstvi: "clen",
      funkce: null,
      isAdmin: false,
    });
  });

  it("aktivni-clen → (aktivni_clen, null, false)", () => {
    expect(mapujRoliNaProfil("aktivni-clen")).toEqual({
      clenstvi: "aktivni_clen",
      funkce: null,
      isAdmin: false,
    });
  });

  it("clen-rady → (aktivni_clen, rada, false)", () => {
    expect(mapujRoliNaProfil("clen-rady")).toEqual({
      clenstvi: "aktivni_clen",
      funkce: "rada",
      isAdmin: false,
    });
  });

  it("vedeni → (aktivni_clen, vedeni, false)", () => {
    expect(mapujRoliNaProfil("vedeni")).toEqual({
      clenstvi: "aktivni_clen",
      funkce: "vedeni",
      isAdmin: false,
    });
  });

  it("admin → (aktivni_clen, null, true)", () => {
    expect(mapujRoliNaProfil("admin")).toEqual({
      clenstvi: "aktivni_clen",
      funkce: null,
      isAdmin: true,
    });
  });

  it("USER → (clen, null, false)", () => {
    expect(mapujRoliNaProfil("USER")).toEqual({
      clenstvi: "clen",
      funkce: null,
      isAdmin: false,
    });
  });

  it("ADMIN → (aktivni_clen, null, true)", () => {
    expect(mapujRoliNaProfil("ADMIN")).toEqual({
      clenstvi: "aktivni_clen",
      funkce: null,
      isAdmin: true,
    });
  });

  it("neznámý string → (clen, null, false)", () => {
    expect(mapujRoliNaProfil("superadmin")).toEqual({
      clenstvi: "clen",
      funkce: null,
      isAdmin: false,
    });
    expect(mapujRoliNaProfil("")).toEqual({
      clenstvi: "clen",
      funkce: null,
      isAdmin: false,
    });
  });
});

describe("chybaKombinace3D — funkce jen s aktivni_clen", () => {
  it("clen + vedení je nevalidní", () => {
    expect(chybaKombinace3D(profil3D("clen", "vedeni", false))).not.toBeNull();
  });

  it("clen + rada je nevalidní", () => {
    expect(chybaKombinace3D(profil3D("clen", "rada", false))).not.toBeNull();
  });

  it("clen bez funkce je validní", () => {
    expect(chybaKombinace3D(profil3D("clen", null, false))).toBeNull();
  });

  it("aktivni_clen bez funkce je validní", () => {
    expect(chybaKombinace3D(profil3D("aktivni_clen", null, false))).toBeNull();
  });

  it("aktivni_clen + rada je validní", () => {
    expect(chybaKombinace3D(profil3D("aktivni_clen", "rada", false))).toBeNull();
  });

  it("aktivni_clen + vedení je validní", () => {
    expect(
      chybaKombinace3D(profil3D("aktivni_clen", "vedeni", false)),
    ).toBeNull();
  });

  it("isAdmin je ortogonální (nevaliduje se)", () => {
    expect(chybaKombinace3D(profil3D("clen", null, true))).toBeNull();
    expect(
      chybaKombinace3D(profil3D("aktivni_clen", "vedeni", true)),
    ).toBeNull();
    expect(chybaKombinace3D(profil3D("clen", "vedeni", true))).not.toBeNull();
  });
});

describe("smiNaVypravy — jen aktivni_clen", () => {
  it("aktivni_clen smí", () => {
    expect(smiNaVypravy(profil3D("aktivni_clen", null, false))).toBe(true);
  });

  it("aktivni_clen s radou smí", () => {
    expect(smiNaVypravy(profil3D("aktivni_clen", "rada", false))).toBe(true);
  });

  it("aktivni_clen s vedením smí", () => {
    expect(smiNaVypravy(profil3D("aktivni_clen", "vedeni", false))).toBe(true);
  });

  it("clen nesmí", () => {
    expect(smiNaVypravy(profil3D("clen", null, false))).toBe(false);
  });

  it("admin bez aktivni_clen NESMÍ (isAdmin se nečte)", () => {
    expect(smiNaVypravy(profil3D("clen", null, true))).toBe(false);
  });
});

describe("isAdmin — odvozen z příznaku (mapování)", () => {
  it("admin a ADMIN mapují na isAdmin true", () => {
    expect(mapujRoliNaProfil("admin").isAdmin).toBe(true);
    expect(mapujRoliNaProfil("ADMIN").isAdmin).toBe(true);
  });

  it("ostatní staré role mapují na isAdmin false", () => {
    const stare: readonly string[] = [
      "clen",
      "aktivni-clen",
      "clen-rady",
      "vedeni",
      "USER",
    ];
    for (const role of stare) {
      expect(mapujRoliNaProfil(role).isAdmin).toBe(false);
    }
  });
});

describe("dual-guard výprav — isAdmin NEBO smiNaVypravy (server/src/auth.ts)", () => {
  it("aktivní člen projde (bez admina)", () => {
    const profil = profil3D("aktivni_clen", null, false);
    expect(profil.isAdmin || smiNaVypravy(profil)).toBe(true);
  });

  it("vedení projde", () => {
    const profil = profil3D("aktivni_clen", "vedeni", false);
    expect(profil.isAdmin || smiNaVypravy(profil)).toBe(true);
  });

  it("rada projde", () => {
    const profil = profil3D("aktivni_clen", "rada", false);
    expect(profil.isAdmin || smiNaVypravy(profil)).toBe(true);
  });

  it("člen bez admina je blokován", () => {
    const profil = profil3D("clen", null, false);
    expect(profil.isAdmin || smiNaVypravy(profil)).toBe(false);
  });

  it("admin s (clen, null, true) projde díky isAdmin", () => {
    const profil = profil3D("clen", null, true);
    expect(smiNaVypravy(profil)).toBe(false);
    expect(profil.isAdmin || smiNaVypravy(profil)).toBe(true);
  });
});
