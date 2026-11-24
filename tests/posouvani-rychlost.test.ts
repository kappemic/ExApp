import { describe, expect, it } from "vitest";
import { dalsiRychlost, MAX_RYCHLOST, MIN_RYCHLOST, popisRychlosti } from "../src/lib/zpevnik-cteni";

describe("rychlost posouvání písně", () => {
  it("projde celé rozpětí nahoru a stejnou cestou zpátky", () => {
    const nahoru = [MIN_RYCHLOST];
    for (let r = MIN_RYCHLOST; r < MAX_RYCHLOST; ) nahoru.push((r = dalsiRychlost(r, 1)));
    const dolu = [MAX_RYCHLOST];
    for (let r = MAX_RYCHLOST; r > MIN_RYCHLOST; ) dolu.push((r = dalsiRychlost(r, -1)));

    expect(nahoru).toContain(1);
    expect(dolu.reverse()).toEqual(nahoru);
  });

  it("na krajích zůstane stát", () => {
    expect(dalsiRychlost(MAX_RYCHLOST, 1)).toBe(MAX_RYCHLOST);
    expect(dalsiRychlost(MIN_RYCHLOST, -1)).toBe(MIN_RYCHLOST);
  });

  it("popisek píše česky", () => {
    expect([0.1, 1, 1.25].map(popisRychlosti)).toEqual(["0,1×", "1,0×", "1,25×"]);
  });
});
