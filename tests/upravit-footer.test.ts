/**
 * tests/upravit-footer.test.ts — Krok 16: Zrušit/Uložit na spodek Upravit
 * + viditelnost „Odpojit aktivitu".
 *
 * TDD: RED = (1) footer Zrušit/Uložit je uvnitř ExpeditionForm (hned za poli,
 * PŘED StravaParovani + docházkou), (2) StravaParovani ukazuje Odpojit jen
 * když prop jeSparovano/stravaActivityId (ExpeditionModal je nepředává →
 * uživatel Odpojit nevidí) a nemá vždy viditelný stavový řádek.
 * GREEN = sticky footer na spodku + fallback z API + „Stav trasy:" vždy.
 *
 * Zdroj-kontrakt testy nad .tsx (repo nemá jsdom — viz
 * tests/strava-expanding.test.ts). Strict TS, žádný `any`. Small testy.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function cti(soubor: string): string {
  return readFileSync(soubor, "utf8");
}

const MODAL = "src/components/expeditions/ExpeditionModal.tsx";
const PAROVANI = "src/components/expeditions/StravaParovani.tsx";
const FORM = "src/components/expeditions/ExpeditionForm.tsx";

describe("Upravit: Zrušit/Uložit na úplném spodku (za Strava + docházkou)", () => {
  it("ExpeditionForm umí skrýt interní akce (skrytAkce) pro externí footer", () => {
    const obsah = cti(FORM);
    expect(obsah).toContain("skrytAkce");
  });

  it("Upravit předává ExpeditionForm skrytý footer + form id", () => {
    const obsah = cti(MODAL);
    const pozice = obsah.indexOf('{rezim === "upravy"');
    expect(pozice).toBeGreaterThan(-1);
    const usek = obsah.slice(pozice, pozice + 12000);
    expect(usek).toContain("<ExpeditionForm");
    expect(usek).toContain("skrytAkce");
    expect(usek).toMatch(/id="upravit-expedici-form"|"upravit-expedici-form"/);
  });

  it("Zrušit/Uložit (externí footer) je AŽ za StravaParovani i docházkou", () => {
    const obsah = cti(MODAL);
    const poziceUpravy = obsah.indexOf('{rezim === "upravy"');
    expect(poziceUpravy).toBeGreaterThan(-1);
    const usek = obsah.slice(poziceUpravy);
    const poziceStrava = usek.indexOf("<StravaParovani");
    const poziceDochazka = usek.indexOf("Správa docházky");
    // Externí footer nese submit přes form= (mimo <form>), text Uložit změny.
    const poziceFooteru = usek.search(/form="upravit-expedici-form"/);
    expect(poziceFooteru).toBeGreaterThan(-1);
    // Když sekce existují, footer je za nimi (sticky spodek).
    if (poziceStrava > -1) expect(poziceFooteru).toBeGreaterThan(poziceStrava);
    if (poziceDochazka > -1)
      expect(poziceFooteru).toBeGreaterThan(poziceDochazka);
    expect(usek.slice(poziceFooteru, poziceFooteru + 2000)).toContain(
      "Uložit změny",
    );
  });

  it("externí footer je sticky (dlouhý formulář) a nese Zrušit", () => {
    const obsah = cti(MODAL);
    const poziceUpravy = obsah.indexOf('{rezim === "upravy"');
    const usek = obsah.slice(poziceUpravy, poziceUpravy + 20000);
    expect(usek).toContain("sticky");
    const poziceFooteru = usek.search(/form="upravit-expedici-form"/);
    const okoli = usek.slice(Math.max(0, poziceFooteru - 1500), poziceFooteru + 2000);
    expect(okoli).toContain("Zrušit");
  });
});

describe("Odpojit aktivitu: viditelnost + fallback + stavový řádek", () => {
  it('stavovy radek Stav trasy je vzdy viditelny (pripojeno / nepripojeno)', () => {
    const obsah = cti(PAROVANI);
    expect(obsah).toContain("Stav trasy:");
    expect(obsah).toContain("nepřipojeno");
    // Stavový řádek má role=status (screen reader) a není podmíněn pripojeno.
    const poziceStavu = obsah.indexOf("Stav trasy:");
    expect(poziceStavu).toBeGreaterThan(-1);
    const okoli = obsah.slice(Math.max(0, poziceStavu - 800), poziceStavu + 800);
    expect(okoli).toContain('role="status"');
  });

  it("fallback: když prop je false, stav se dočte z API (getMojeStatistiky)", () => {
    const obsah = cti(PAROVANI);
    expect(obsah).toContain("getMojeStatistiky");
    // Fallback hledá záznam expedice (expeditionId) a vytahuje km / activityId.
    expect(obsah).toContain("expeditionId");
    expect(obsah).toMatch(/stravaActivityId|dbMaZaznam|fallback/i);
  });

  it('Odpojit aktivitu se ukaze i pro DB zaznam (km / activityId), nejen pro prop', () => {
    const obsah = cti(PAROVANI);
    expect(obsah).toContain("Odpojit aktivitu");
    const pozicePripojeno = obsah.indexOf("const pripojeno");
    expect(pozicePripojeno).toBeGreaterThan(-1);
    const okoli = obsah.slice(pozicePripojeno, pozicePripojeno + 600);
    // pripojeno nesmí záviset JEN na props — musí zahrnout DB fallback.
    expect(okoli).not.toMatch(/=\s*sparovanoId\s*!==\s*null\s*\|\|\s*jeSparovano\s*;/);
  });

  it("Upravit stále prop-drilluje expeditionId + onOdpojeno (refresh)", () => {
    const obsah = cti(MODAL);
    const pozice = obsah.indexOf("<StravaParovani");
    expect(pozice).toBeGreaterThan(-1);
    const okoli = obsah.slice(pozice, pozice + 1200);
    expect(okoli).toContain("expeditionId");
    expect(okoli).toContain("onOdpojeno");
  });
});
