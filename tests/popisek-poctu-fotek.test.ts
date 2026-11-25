import { describe, expect, it } from "vitest";
import { popisekPoctuFotek } from "../src/lib/alba-api";

describe("popisekPoctuFotek", () => {
  it.each([
    [0, "0 fotek"],
    [1, "1 fotka"],
    [2, "2 fotky"],
    [4, "4 fotky"],
    [5, "5 fotek"],
    [12, "12 fotek"],
    [21, "21 fotek"],
    [62, "62 fotek"],
    [104, "104 fotek"],
  ])("%i", (pocet, popisek) => {
    expect(popisekPoctuFotek(pocet)).toBe(popisek);
  });
});
