/**
 * tests/overeni-kodu.test.ts — pen redesign, vstup.
 * Neznámý kód na ověření je 422 s českou hláškou a řádek se nemaže.
 * Login bez `zustat` zůstává platný (starý klient) a cookie je jen na session.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { volbySessionCookie } from "../server/src/auth";
import { rozhodniOvereniKodu } from "../server/src/overeni-kodu";
import { validujOvereniKodu, validujPrihlaseni } from "../server/src/validace";
import { VALIDACNI_ZPRAVY } from "../src/shared/api-types";

const ADRESAR = dirname(fileURLToPath(import.meta.url));

describe("validujOvereniKodu", () => {
  it("neznámý tvar kódu je 422 hláška z VALIDACNI_ZPRAVY", () => {
    const vysledek = validujOvereniKodu({ kod: "xyz" });
    expect(vysledek.uspech).toBe(false);
    expect(vysledek.chybyPoli["kod"]).toContain(VALIDACNI_ZPRAVY.kodNeplatnyTvar);
  });
});

describe("rozhodniOvereniKodu", () => {
  const ted = Date.parse("2026-11-18T12:00:00.000Z");
  const radek = {
    code: "ABCDEFGH",
    expiresAt: new Date("2026-11-18T12:10:00.000Z"),
  };

  it("neznámý kód vrátí českou hlášku a seznam řádků nechá být", () => {
    const radky = [radek];
    const vysledek = rozhodniOvereniKodu(radky, "ZZZZZZZZ", ted);
    expect(vysledek).toEqual({
      platny: false,
      chyba: VALIDACNI_ZPRAVY.kodNeznamy,
    });
    expect(radky).toHaveLength(1);
    expect(radky[0]).toBe(radek);
  });

  it("platný kód vrátí expiresAt a řádek nesmaže", () => {
    const radky = [radek];
    const vysledek = rozhodniOvereniKodu(radky, "ABCDEFGH", ted);
    expect(vysledek).toEqual({
      platny: true,
      expiresAt: "2026-11-18T12:10:00.000Z",
    });
    expect(radky).toEqual([radek]);
  });
});

describe("validujPrihlaseni — zustat je aditivní", () => {
  it("starý klient bez zustat projde a cookie nebude trvalá", () => {
    const vysledek = validujPrihlaseni({
      email: "anna@example.cz",
      heslo: "tajneheslo",
    });
    expect(vysledek.uspech).toBe(true);
    expect(vysledek.data?.zustat).toBe(false);
    expect(volbySessionCookie(false)).toEqual({});
  });

  it("zustat true drží sedmidenní maxAge", () => {
    const vysledek = validujPrihlaseni({
      email: "anna@example.cz",
      heslo: "tajneheslo",
      zustat: true,
    });
    expect(vysledek.uspech).toBe(true);
    expect(vysledek.data?.zustat).toBe(true);
    expect(volbySessionCookie(true)).toEqual({ maxAge: 7 * 24 * 60 * 60 * 1000 });
  });
});

describe("POST /api/kody/overit nemaže řádek", () => {
  it("route existuje a v jejím bloku není delete", () => {
    const zdroj = readFileSync(join(ADRESAR, "../server/src/ucty-routes.ts"), "utf8");
    const start = zdroj.indexOf('app.post("/api/kody/overit"');
    expect(start).toBeGreaterThan(-1);
    const dalsi = zdroj.indexOf("app.post(", start + 20);
    const blok = zdroj.slice(start, dalsi === -1 ? undefined : dalsi);
    expect(blok).toContain("VALIDATION_ERROR");
    expect(blok).toContain("rozhodniOvereniKodu");
    expect(blok).not.toContain(".delete(");
  });
});
