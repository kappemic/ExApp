import { describe, expect, it } from "vitest";
import { krokKolecka, PAUZA_KOLECKA_MS } from "../src/lib/lightbox-pas";

describe("kolečko v lightboxu", () => {
  it("dolů jde na další fotku a nahoru na předchozí", () => {
    expect(krokKolecka(100, 1000)).toBe(1);
    expect(krokKolecka(-100, 1000)).toBe(-1);
  });

  it("setrvačnost ani chvění touchpadu nelistují dál", () => {
    expect(krokKolecka(100, PAUZA_KOLECKA_MS - 1)).toBe(0);
    expect(krokKolecka(3, 1000)).toBe(0);
  });
});
