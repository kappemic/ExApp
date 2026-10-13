/**
 * tests/strava-expanding.test.ts — Krok 15: kompaktní expanding výběr
 * aktivit + odpojení v Upravit.
 *
 * TDD: RED = expanding box v StravaParovani neexistoval (seznam vždy
 * rozbalený); GREEN = zdroj-kontrakt testy nad .tsx (repo nemá jsdom,
 * viz tests/modal-confirm.test.ts — bez rendereru, čteme src jako text).
 *
 * Kontrakt:
 * - collapsed = 1 řádek: <button aria-expanded> „Vybrat Strava aktivitu (N)".
 * - expand = seznam v boxu s max-height + scroll (overflow-y-auto).
 * - po potvrzení se sbalí zpět (collapse v potvrdit).
 * - ruční km + „Odpojit aktivitu" vždy viditelné MIMO box.
 * - Upravit (ExpeditionModal) předává onSparovano i onOdpojeno → refresh.
 * - klient odpojuje přes DELETE (odpojAktivitu).
 *
 * Strict TS, žádný `any`. Small testy, bez I/O kromě čtení src.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function cti(soubor: string): string {
  return readFileSync(soubor, "utf8");
}

const PAROVANI = "src/components/expeditions/StravaParovani.tsx";
const MODAL = "src/components/expeditions/ExpeditionModal.tsx";
const API = "src/lib/strava-api.ts";

describe("expanding box (collapsed 1 řádek → expand seznam)", () => {
  it("collapsed tlačítko nese aria-expanded + počet (Vybrat Strava aktivitu)", () => {
    const obsah = cti(PAROVANI);
    expect(obsah).toContain("aria-expanded");
    expect(obsah).toContain("Vybrat Strava aktivitu");
  });

  it("expand seznam má max-height + scroll (max-h-* + overflow-y-auto)", () => {
    const obsah = cti(PAROVANI);
    expect(obsah).toMatch(/max-h-\S+/);
    expect(obsah).toContain("overflow-y-auto");
  });

  it("seznam je za expanding přepínačem (button s aria-expanded řídí box)", () => {
    const obsah = cti(PAROVANI);
    const poziceTlacitka = obsah.indexOf("aria-expanded");
    expect(poziceTlacitka).toBeGreaterThan(-1);
    const zaTlacitkem = obsah.slice(poziceTlacitka, poziceTlacitka + 6000);
    expect(zaTlacitkem).toContain("overflow-y-auto");
  });

  it("po potvrzení se box sbalí zpět (collapse v potvrdit)", () => {
    const obsah = cti(PAROVANI);
    const pozice = obsah.indexOf("async function potvrdit");
    expect(pozice).toBeGreaterThan(-1);
    const okoli = obsah.slice(pozice, pozice + 2500);
    // úspěšné spárování zavře box (rozbaleno → false)
    expect(okoli).toMatch(/setRozbaleno\(false\)|rozbaleno.*false/i);
  });

  it("nativní <button> = klávesnice (Enter/Space) i myš zdarma", () => {
    const obsah = cti(PAROVANI);
    // přepínač musí být nativní button, ne div-onClick
    expect(obsah).toMatch(/<button[^>]*aria-expanded/);
    expect(obsah).not.toMatch(/<div[^>]*aria-expanded/);
  });
});

describe("ruční km + odpojit vždy viditelné MIMO box", () => {
  it("„Odpojit aktivitu\" existuje a je mimo expanding seznam", () => {
    const obsah = cti(PAROVANI);
    expect(obsah).toContain("Odpojit aktivitu");
    const poziceBoxu = obsah.indexOf("overflow-y-auto");
    const poziceOdpojeni = obsah.indexOf("Odpojit aktivitu");
    expect(poziceOdpojeni).toBeGreaterThan(-1);
    // odpojit je PŘED boxem (připojená aktivita nahoře) nebo mimo něj —
    // v žádném případě uvnitř scrollovatelného seznamu
    if (poziceBoxu > -1) {
      const boxUsek = obsah.slice(
        Math.max(0, poziceBoxu - 200),
        poziceBoxu + 4000,
      );
      expect(boxUsek).not.toContain("Odpojit aktivitu");
    }
  });

  it("ruční zadání (Bez Stravy) je mimo box, vždy viditelné", () => {
    const obsah = cti(PAROVANI);
    expect(obsah).toContain("Bez Stravy");
    const poziceBoxu = obsah.indexOf("overflow-y-auto");
    const poziceRucni = obsah.indexOf("Bez Stravy");
    expect(poziceRucni).toBeGreaterThan(-1);
    if (poziceBoxu > -1) {
      // ruční sekce je až ZA boxem (mimo scrollovatelný seznam)
      expect(poziceRucni).toBeGreaterThan(poziceBoxu + 500);
    }
  });
});

describe("odpojení v Upravit (Krok 15: refresh po přesunu z detailu)", () => {
  it("StravaParovani volá DELETE přes odpojAktivitu + onOdpojeno callback", () => {
    const obsah = cti(PAROVANI);
    expect(obsah).toContain("odpojAktivitu");
    expect(obsah).toContain("onOdpojeno");
    expect(cti(API)).toContain('method: "DELETE"');
  });

  it("ExpeditionModal v Upravit předává onSparovano i onOdpojeno", () => {
    const obsah = cti(MODAL);
    const pozice = obsah.indexOf("<StravaParovani");
    expect(pozice).toBeGreaterThan(-1);
    const okoli = obsah.slice(pozice, pozice + 1200);
    expect(okoli).toContain("onSparovano");
    expect(okoli).toContain("onOdpojeno");
  });

  it("odpojení v Upravit refreshne (nacistiUcastniky po onOdpojeno)", () => {
    const obsah = cti(MODAL);
    const pozice = obsah.indexOf("onOdpojeno");
    expect(pozice).toBeGreaterThan(-1);
    const okoli = obsah.slice(Math.max(0, pozice - 300), pozice + 600);
    expect(okoli).toContain("nacistiUcastniky");
  });
});
