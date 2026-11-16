import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { meniEmail, potrebujeSoucasneHeslo } from "../src/lib/profil-heslo";
import {
  PROFIL_LIMIT_ZA_MINUTU,
  PROFIL_OKNO_MS,
  resetProfilLimitu,
  smiUpravitProfil,
} from "../server/src/profil-limit";
import { validujProfilUpdate } from "../server/src/validace";

describe("validace soucasneHeslo", () => {
  it("změna e-mailu projde validací, povinnost hlídá routa proti DB", () => {
    const vysledek = validujProfilUpdate({ email: "novy@example.cz" });
    expect(vysledek.uspech).toBe(true);
    expect(vysledek.data?.soucasneHeslo).toBeUndefined();
  });

  it("heslo poslané s e-mailem se předá routě", () => {
    const vysledek = validujProfilUpdate({ email: "novy@example.cz", soucasneHeslo: "puvodni123" });
    expect(vysledek.data?.soucasneHeslo).toBe("puvodni123");
  });

  it("neplatný typ neprojde ani bez změny hesla", () => {
    const vysledek = validujProfilUpdate({ email: "novy@example.cz", soucasneHeslo: 123 });
    expect(vysledek.uspech).toBe(false);
    expect(vysledek.chybyPoli["soucasneHeslo"]).toBeDefined();
  });

  it("prázdné heslo při změně hesla neprojde", () => {
    const vysledek = validujProfilUpdate({ heslo: "noveheslo123", soucasneHeslo: "" });
    expect(vysledek.chybyPoli["soucasneHeslo"]).toBeDefined();
  });
});

describe("pořadí v PATCH /api/me", () => {
  const zdroj = readFileSync("server/src/ucty-routes.ts", "utf8");
  const start = zdroj.indexOf('app.patch("/api/me"');
  const blok = zdroj.slice(start, zdroj.indexOf("/* POST /api/me/avatar", start));

  it("limit je před validací", () => {
    expect(blok.indexOf("smiUpravitProfil(")).toBeGreaterThan(-1);
    expect(blok.indexOf("smiUpravitProfil(")).toBeLessThan(blok.indexOf("validujProfilUpdate("));
  });

  it("heslo se ověří před kolizí e-mailu, jinak by šlo zjišťovat cizí e-maily", () => {
    expect(blok.indexOf("overHeslo(")).toBeGreaterThan(-1);
    expect(blok.indexOf("overHeslo(")).toBeLessThan(blok.indexOf('"EMAIL_OBSAZEN"'));
  });

  it("změna e-mailu i hesla spouští stejné ověření", () => {
    expect(blok).toContain("novyEmail !== undefined || vstup.heslo !== undefined");
  });
});

describe("limit úpravy profilu", () => {
  beforeEach(() => resetProfilLimitu());

  it("po limitu odmítne a po okně zase pustí", () => {
    const ted = 1_000_000;
    for (let i = 0; i < PROFIL_LIMIT_ZA_MINUTU; i += 1) {
      expect(smiUpravitProfil("ucet-a", ted)).toBe(true);
    }
    expect(smiUpravitProfil("ucet-a", ted)).toBe(false);
    expect(smiUpravitProfil("ucet-a", ted + PROFIL_OKNO_MS + 1)).toBe(true);
  });

  it("účty se navzájem neblokují", () => {
    for (let i = 0; i < PROFIL_LIMIT_ZA_MINUTU; i += 1) smiUpravitProfil("ucet-a", 1);
    expect(smiUpravitProfil("ucet-b", 1)).toBe(true);
  });
});

describe("kdy formulář chce současné heslo", () => {
  const zaklad = {
    email: "jan@example.cz",
    puvodniEmail: "jan@example.cz",
    noveHeslo: "",
    potvrzeniHesla: "",
  };

  it("stejný e-mail (velikost písmen, mezery) heslo nechce", () => {
    expect(meniEmail(" JAN@example.cz ", "jan@example.cz")).toBe(false);
    expect(potrebujeSoucasneHeslo({ ...zaklad, email: " JAN@example.cz " })).toBe(false);
  });

  it("nový e-mail nebo rozepsané nové heslo ho chce", () => {
    expect(potrebujeSoucasneHeslo({ ...zaklad, email: "novy@example.cz" })).toBe(true);
    expect(potrebujeSoucasneHeslo({ ...zaklad, noveHeslo: "x" })).toBe(true);
    expect(potrebujeSoucasneHeslo({ ...zaklad, potvrzeniHesla: "x" })).toBe(true);
  });
});
