import { readFileSync } from "node:fs";
import type { Request } from "express";
import { describe, expect, it } from "vitest";
import { ctiIpZRequestu, slozZobrazovaneJmeno } from "../server/src/diskuze";
import { resetOznameniLimitu, smiPoslatOznameni } from "../server/src/oznameni-limit";
import { klicZVerejneUrl } from "../server/src/r2-fotky";
import { validujProfilUpdate } from "../server/src/validace";
import { SKOLY, TRIDY } from "../src/shared/skoly-tridy-seznam";

describe("zbývající bezpečnost", () => {
  it("limit bere jen req.ip", () => {
    const req = {
      ip: "203.0.113.8",
      headers: { "x-forwarded-for": "198.51.100.4, 203.0.113.8" },
    } as unknown as Request;
    expect(ctiIpZRequestu(req)).toBe("203.0.113.8");
  });

  it("bez jména i Discordu je Člen", () => {
    expect(
      slozZobrazovaneJmeno({
        jmeno: "  ",
        prijmeni: "",
        discordNick: null,
        email: "tajny@example.cz",
      }),
    ).toBe("Člen");
  });

  it("oznámení pustí 5 za hodinu a šesté ne", () => {
    resetOznameniLimitu();
    for (let i = 0; i < 5; i += 1) {
      expect(smiPoslatOznameni("ucet-1", 1_000 + i)).toBe(true);
    }
    expect(smiPoslatOznameni("ucet-1", 2_000)).toBe(false);
    expect(smiPoslatOznameni("ucet-2", 2_000)).toBe(true);
  });

  it("cizí https není klíč našeho úložiště", () => {
    const zaklad = "https://pub-example.r2.dev";
    expect(klicZVerejneUrl("https://evil.example/foto.jpg", zaklad)).toBeNull();
    expect(
      klicZVerejneUrl(
        `${zaklad}/vypravy/sumava/11111111-1111-1111-1111-111111111111.jpg`,
        zaklad,
      ),
    ).not.toBeNull();
  });

  it("nové heslo bez současného neprojde", () => {
    const vysledek = validujProfilUpdate({ heslo: "noveheslo123" });
    expect(vysledek.uspech).toBe(false);
    expect(vysledek.chybyPoli["soucasneHeslo"]).toBeDefined();
  });

  it("našeptávání nečte uživatele a třídy jsou pevné", () => {
    const index = readFileSync("server/src/schuzky-routes.ts", "utf8");
    const start = index.indexOf('app.get("/api/meta/skoly-tridy"');
    const blok = index.slice(start, start + 500);
    expect(blok).not.toContain("users.skola");
    expect(SKOLY).toEqual([]);
    expect(TRIDY).toContain("5.B");
    expect(TRIDY).toHaveLength(27);
  });

  it("snímek cesty jde přes aplikaci a koš se nestahuje", () => {
    const cesta = readFileSync("server/src/cesta-snimky-routes.ts", "utf8");
    expect(cesta).toContain("/cesta-snimky/${radek.id}/soubor");
    expect(cesta).not.toContain("res.redirect");
    const index = readFileSync("server/src/fotky-routes.ts", "utf8");
    const start = index.indexOf('app.get("/api/expeditions/:id/fotky/:fotkaId/soubor"');
    const blok = index.slice(start, start + 900);
    expect(blok).toContain("isNull(photos.smazanoAt)");
    expect(blok).not.toContain("redirect");
  });
});
