/**
 * tests/vypravy-vyhledavani.test.ts — Krok 14: vyhledavani podle jmena.
 *
 * Klientsky filtr existujiciho seznamu (zadny novy endpoint):
 * search input, debounce, case + diakritika pres filtr helper,
 * prazdny stav „Nic jsme nenasli", pocet vysledku.
 * Strict TS, zadny `any`.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function cti(soubor: string): string {
  return readFileSync(soubor, "utf8");
}

describe("vyhledavani podle jmena (VypravyPage)", () => {
  it("ma search input s ceskym labelem", () => {
    const obsah = cti("src/pages/VypravyPage.tsx");
    expect(obsah).toContain('type="search"');
    expect(obsah).toContain("Hledat");
  });

  it("filtruje klientsky pres filtr helper (zadny novy endpoint)", () => {
    const obsah = cti("src/pages/VypravyPage.tsx");
    expect(obsah).toContain("filtrujExpedicePodleJmena");
    expect(obsah).not.toContain("/api/expeditions?hledat");
    expect(obsah).not.toContain("/api/vypravy/hledat");
  });

  it("debounceuje vstup (setTimeout + cleanup)", () => {
    const obsah = cti("src/pages/VypravyPage.tsx");
    expect(obsah).toContain("setTimeout");
    expect(obsah).toContain("clearTimeout");
  });

  it("prazdny stav a pocet vysledku (aria-live)", () => {
    const obsah = cti("src/pages/VypravyPage.tsx");
    expect(obsah).toContain("Nic jsme nenašli");
    expect(obsah).toContain('aria-live="polite"');
  });
});
