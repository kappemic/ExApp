/**
 * Session secret must not be the public placeholder from .env.example.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { jePouzitelneJwtTajnemstvi } from "../server/src/auth";

const PRIKLAD = "zamen-za-minimalne-32-znaku-nahodny-retezec";

describe("jePouzitelneJwtTajnemstvi", () => {
  it("odmítne prázdné, krátké a ukázku z .env.example", () => {
    expect(jePouzitelneJwtTajnemstvi(undefined)).toBe(false);
    expect(jePouzitelneJwtTajnemstvi("kratke")).toBe(false);
    expect(jePouzitelneJwtTajnemstvi(PRIKLAD)).toBe(false);
  });

  it("přijme vlastní řetězec dlouhý aspoň 32 znaků", () => {
    expect(jePouzitelneJwtTajnemstvi("a".repeat(32))).toBe(true);
  });
});

describe("skupinový chat — limit před čtením příloh", () => {
  it("smiPoslatZpravu je před nactiTeloZpravy", () => {
    const zdroj = readFileSync("server/src/skupiny.ts", "utf8");
    const start = zdroj.indexOf('app.post("/api/diskuze/skupiny/:id/zpravy"');
    expect(start).toBeGreaterThan(-1);
    const blok = zdroj.slice(start, start + 1200);
    expect(blok.indexOf("smiPoslatZpravu")).toBeGreaterThan(-1);
    expect(blok.indexOf("smiPoslatZpravu")).toBeLessThan(blok.indexOf("nactiTeloZpravy"));
  });
});
