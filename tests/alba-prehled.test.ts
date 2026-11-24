import { describe, expect, it } from "vitest";
import type { ApiAlbum } from "../src/lib/alba-api";
import { velikostiAlb } from "../src/lib/alba-prehled";

function album(id: string, nahled: string | null = "f"): ApiAlbum {
  return {
    id,
    nazev: id,
    druh: "vyprava",
    expeditionId: id,
    pocetFotek: nahled === null ? 0 : 1,
    nahledFotkaId: nahled,
  };
}

describe("velikostiAlb", () => {
  it("velké je první album, i když ještě nemá fotky", () => {
    const velikosti = velikostiAlb([album("a", null), album("b"), album("c"), album("d")], true);
    expect([...velikosti]).toEqual([
      ["a", "velka"],
      ["b", "vedle"],
      ["c", "vedle"],
    ]);
  });

  it("při filtru a pod tři alba zůstane běžná mřížka", () => {
    const tri = [album("a"), album("b"), album("c")];
    expect(velikostiAlb(tri, false).size).toBe(0);
    expect(velikostiAlb(tri.slice(0, 2), true).size).toBe(0);
  });
});
