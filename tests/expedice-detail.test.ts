/**
 * tests/expedice-detail.test.ts — Krok 14: pairing patri do Upravit,
 * detail je jen prehled usleho (read-only, bez editace).
 *
 * Staticke guardy nad zdrojaky (vzor strava-parovani.test.ts route guardy)
 * + zadny novy endpoint, zadny reload, zadny Leaflet v mini-mape.
 * Strict TS, zadny `any`.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function cti(soubor: string): string {
  return readFileSync(soubor, "utf8");
}

describe("detail vs upravit (ExpeditionModal)", () => {
  it("prehled neobsahuje zadne pairing UI", () => {
    const obsah = cti("src/components/expeditions/ExpeditionModal.tsx");
    const startPrehled = obsah.indexOf('{rezim === "prehled"');
    const startUpravy = obsah.indexOf('{rezim === "upravy"');
    expect(startPrehled).toBeGreaterThan(-1);
    expect(startUpravy).toBeGreaterThan(-1);
    expect(startUpravy).toBeGreaterThan(startPrehled);
    const prehled = obsah.slice(startPrehled, startUpravy);
    expect(prehled).not.toContain("StravaParovani");
    expect(prehled).not.toContain("Parovani aktivity");
    expect(prehled).not.toContain("Rucni zadani");
    expect(prehled).not.toContain("Bez Stravy");
  });

  it("upravy obsahuji plne funkcni pairing (StravaParovani)", () => {
    const obsah = cti("src/components/expeditions/ExpeditionModal.tsx");
    const startUpravy = obsah.indexOf('{rezim === "upravy"');
    expect(startUpravy).toBeGreaterThan(-1);
    const upravy = obsah.slice(startUpravy);
    expect(upravy).toContain("StravaParovani");
  });

  it("detail ukazuje prehled usleho (km, prevyseni, ucastnici)", () => {
    const modal = cti("src/components/expeditions/ExpeditionModal.tsx");
    expect(modal).toContain("ExpeditionTrasaPrehled");
    const prehled = cti(
      "src/components/expeditions/ExpeditionTrasaPrehled.tsx",
    );
    expect(prehled).toContain("Ušlé na výpravě");
    expect(prehled).toContain("Převýšení");
  });

  it("proklikavani je bez reloadu (zadny reload v modalu)", () => {
    const obsah = cti("src/components/expeditions/ExpeditionModal.tsx");
    expect(obsah).not.toContain(".reload()");
    expect(obsah).not.toContain("location.reload");
  });
});

describe("stavova brana Usle (Krok 17)", () => {
  it("neprobehla vyprava: zadny Usle blok (ani nezapsany text)", () => {
    const modal = cti("src/components/expeditions/ExpeditionModal.tsx");
    // Brana musi byt v modalu: TrasaPrehled jen kdyz probehla.
    expect(modal).toMatch(/\{probehla\s*&&\s*\(?\s*<ExpeditionTrasaPrehled/);
    const prehled = cti(
      "src/components/expeditions/ExpeditionTrasaPrehled.tsx",
    );
    // Defence in depth: komponenta sama pri !probehla nic nerenderuje.
    expect(prehled).toMatch(/if\s*\(\s*!probehla\s*\)\s*return\s*null/);
    // Zadny text pro neukoncenou nesmi zustat.
    expect(prehled).not.toContain("Kilometry se zapisují až po uzavření");
  });

  it("ukoncena vyprava: blok s km/ucastniky zustava", () => {
    const prehled = cti(
      "src/components/expeditions/ExpeditionTrasaPrehled.tsx",
    );
    expect(prehled).toContain("Ušlé na výpravě");
    expect(prehled).toContain("pocetUcastniku");
    // Krok 20: km chybějí → stavová hláška (ne konkrétní „nezapsány").
    expect(prehled).toContain("kilometry");
    // Stav docházky čtený z kontraktu (status).
    expect(prehled).toContain("Navštívil jsem");
  });

  it("search v kronice je s diakritikou (NFD normalizace)", () => {
    const modal = cti("src/components/expeditions/ExpeditionModal.tsx");
    expect(modal).toContain('normalize("NFD")');
  });
});

describe("mini-mapa prehledu (ExpeditionTrasaPrehled)", () => {
  it("bez Leafletu a bez reloadu, s pristupnou SVG carou", () => {
    const obsah = cti(
      "src/components/expeditions/ExpeditionTrasaPrehled.tsx",
    );
    expect(obsah).not.toContain('from "leaflet"');
    expect(obsah).not.toContain("import(\"leaflet\")");
    expect(obsah).not.toContain(".reload()");
    expect(obsah).toContain('role="img"');
    expect(obsah).toContain("Trasová čára");
  });

  it("krome verejneho detailu cte i vlastni stav (statistiky/moje)", () => {
    const obsah = cti(
      "src/components/expeditions/ExpeditionTrasaPrehled.tsx",
    );
    expect(obsah).toContain("getMojeStatistiky");
    expect(obsah).not.toContain("/api/expeditions/:id/aktivita");
  });
});

describe("Usle vidí i cizi (Krok 20): km jsou expedition-level", () => {
  it("prehled cte verejny detail vypravy, ne osobni statistiky", () => {
    const obsah = cti(
      "src/components/expeditions/ExpeditionTrasaPrehled.tsx",
    );
    expect(obsah).toContain("expediceDetailPath");
    // Kilometry přicházejí z veřejného detailu (platí pro všechny).
    expect(obsah).toContain("nactiUsle");
    // Osobní status se čte jen pro odznak „Navštívil jsem".
    expect(obsah).toContain("mujStav");
  });

  it("kontrakt nese expediceDetailPath + jeApiExpedice", () => {
    const obsah = cti("src/shared/api-types.ts");
    expect(obsah).toContain("expediceDetailPath");
    // Guard umožňuje starý payload bez nových polí.
    expect(obsah).toContain("jeApiExpedice");
  });

  it("server ve verejnem detailu doplni km/prevyseni/polyline", () => {
    const obsah = cti("server/src/index.ts");
    const pozice = obsah.indexOf("nactiExpediciSDetailem");
    expect(pozice).toBeGreaterThan(0);
    const okol = obsah.slice(pozice, pozice + 4000);
    expect(okol).toContain("expedice.km");
    expect(okol).toContain("expedice.prevyseniM");
    expect(okol).toContain("expedice.trasaPolyline");
  });

  it("verejny GET detailu nenavadi session", () => {
    const obsah = cti("server/src/index.ts");
    const pozice = obsah.indexOf('app.get("/api/expeditions/:id"');
    expect(pozice).toBeGreaterThan(0);
    const route = obsah.slice(pozice, pozice + 700);
    expect(route).not.toContain("vyzadujPrihlaseni");
    expect(route).not.toContain("vyzadujAdmina");
  });
});
