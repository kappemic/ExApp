import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { overHesloNeboAtrapa } from "../server/src/auth";
import {
  resetPrihlaseniLimitu,
  smiPokusOUcet,
} from "../server/src/prihlaseni-limit";
import { sediStravaState, vytvorStravaState } from "../server/src/strava-state";

describe("limit přihlášení a registrace", () => {
  it("pustí 10 pokusů a jedenáctý ve stejném okně odmítne", () => {
    resetPrihlaseniLimitu();
    for (let i = 0; i < 10; i += 1) {
      expect(smiPokusOUcet("10.0.0.1", 1_000_000 + i)).toBe(true);
    }
    expect(smiPokusOUcet("10.0.0.1", 1_000_000 + 10)).toBe(false);
    expect(smiPokusOUcet("10.0.0.2", 1_000_000 + 10)).toBe(true);
  });

  it("po minutě zase pustí stejnou IP", () => {
    resetPrihlaseniLimitu();
    expect(smiPokusOUcet("10.0.0.3", 0)).toBe(true);
    expect(smiPokusOUcet("10.0.0.3", 60_001)).toBe(true);
  });
});

describe("stejná práce pro špatný e-mail i heslo", () => {
  it("chybějící účet je vždy false", async () => {
    await expect(overHesloNeboAtrapa("heslo-heslo", undefined)).resolves.toBe(false);
    await expect(overHesloNeboAtrapa("heslo-heslo", "")).resolves.toBe(false);
    await expect(overHesloNeboAtrapa("heslo-heslo", null)).resolves.toBe(false);
  });
});

describe("kódy jen pro admina a Strava state", () => {
  const ucty = readFileSync("server/src/ucty-routes.ts", "utf8");
  const strava = readFileSync("server/src/strava-routes.ts", "utf8");

  it("POST /api/admin/codes už neotevírá bootstrap bez admina", () => {
    const start = ucty.indexOf('app.post("/api/admin/codes"');
    const konec = ucty.indexOf('app.post("/api/register"', start);
    const blok = ucty.slice(start, konec);
    expect(blok).not.toContain("jeSystemBezAdmina");
    expect(blok).toContain("vyzadujAdmina");
  });

  it("login i registrace počítají pokus dřív než sáhnou do databáze", () => {
    for (const cesta of ['app.post("/api/login"', 'app.post("/api/register"']) {
      const start = ucty.indexOf(cesta);
      const konec = ucty.indexOf("app.post(", start + cesta.length);
      const blok = ucty.slice(start, konec === -1 ? undefined : konec);
      expect(blok.indexOf("odmitniKdyzMocPokusu")).toBeGreaterThan(-1);
      expect(blok.indexOf("odmitniKdyzMocPokusu")).toBeLessThan(blok.indexOf("validuj"));
      expect(blok.indexOf("odmitniKdyzMocPokusu")).toBeLessThan(blok.indexOf("getDb()"));
      expect(blok).not.toContain("jeSystemBezAdmina");
    }
  });

  it("callback nevymění kód, dokud state nesedí na cookie", () => {
    const start = strava.indexOf('app.get("/api/strava/callback"');
    const konec = strava.indexOf("app.get(", start + 20);
    const blok = strava.slice(start, konec);
    expect(blok.indexOf("sediStravaState")).toBeLessThan(blok.indexOf("vymenCodeZaTokeny"));
  });

  it("state z cookie sedí jen pro stejného uživatele a stejný nonce", () => {
    const vydane = vytvorStravaState("11111111-1111-1111-1111-111111111111");
    expect(
      sediStravaState(vydane.cookie, vydane.state, "11111111-1111-1111-1111-111111111111"),
    ).toBe(true);
    expect(
      sediStravaState(vydane.cookie, vydane.state, "22222222-2222-2222-2222-222222222222"),
    ).toBe(false);
    expect(
      sediStravaState(vydane.cookie, "jiny-nonce-ktery-ma-jinou-delku", "11111111-1111-1111-1111-111111111111"),
    ).toBe(false);
    expect(sediStravaState(undefined, vydane.state, "11111111-1111-1111-1111-111111111111")).toBe(
      false,
    );
  });
});
