import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function cti(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
}

describe("Fotky master–detail layout", () => {
  it("propojí Složky seznam s FotkyPage a označením Složky", () => {
    const page = cti("src/pages/FotkyPage.tsx");
    expect(page).toContain("SlozkySeznam");
    expect(page).toContain("data-fotky-master-detail");

    const slozky = cti("src/components/fotky/SlozkySeznam.tsx");
    expect(slozky).toContain("Složky");
    expect(slozky).toContain('aria-label="Složky"');
  });

  it("AlbumFotky má horní lištu s mazáním a stahováním", () => {
    const album = cti("src/components/fotky/AlbumFotky.tsx");
    expect(album).toContain("data-fotky-album-toolbar");
    expect(album).not.toContain("IntersectionObserver");
    expect(album).toContain("data-fotky-album-akce-row");
    expect(album).toContain("fotkyAlbumToolbarZaklad");
    expect(album).toContain("FotkyMazaciHlavicka");
    expect(album).toContain("FotkyStahovaciHlavicka");

    const ui = cti("src/components/fotky/fotky-ui.ts");
    expect(ui).toMatch(/fotkyAlbumToolbarZaklad[\s\S]*top-16/);
  });

  it("AlbumFotky používá zelenou vrstvu pro stahování", () => {
    const album = cti("src/components/fotky/AlbumFotky.tsx");
    expect(album).toContain("StahovaniVyberVrstva");
    expect(album).toMatch(/stahovani\.stahovaciRezim[\s\S]*StahovaniVyberVrstva/);
    const stahovani = cti("src/components/fotky/StahovaniVyberVrstva.tsx");
    expect(stahovani).toContain("bg-smrk/45");
  });

  it("AlbumFotky grid a náhled mají 44px+ a klávesnicový focus", () => {
    const album = cti("src/components/fotky/AlbumFotky.tsx");
    const ui = cti("src/components/fotky/fotky-ui.ts");
    expect(album).toContain("fotkyMrizkaDlazdice");
    expect(ui).toContain("min-h-[44px]");
    expect(album).toContain("aria-label={popisek}");
    expect(ui).toContain("focus-visible:outline-smrk");
    expect(album).toContain("motion-reduce:animate-none");
    expect(album).toContain("aria-pressed={vybrana}");
  });

  it("nahrávací panel je sbalený; detail má mobilní zpět bez staré lišty", () => {
    const page = cti("src/pages/FotkyPage.tsx");
    expect(page).toContain("FotkyNahravaciPanel");
    expect(page).not.toContain("data-fotky-nahrat-do-alba");
    expect(page).not.toContain("data-fotky-nav-zpet");
    expect(page).toContain("data-fotky-nav-prephed-alb");
    expect(page).toMatch(/data-fotky-nav-prephed-alb[\s\S]*lg:hidden/);
    expect(page).toContain("fotkyTlacitkoZaklad");
    expect(page).toContain('to="/fotky"');
    expect(page).toContain("rozbalNahravani");
    expect(page).not.toMatch(/sticky top-0[\s\S]*data-fotky-nahrat-do-alba/);

    const panel = cti("src/components/fotky/FotkyNahravaciPanel.tsx");
    expect(panel).toContain("data-fotky-nahravaci-panel");
    expect(panel).toContain("data-fotky-nahravaci-sbaleno");
    expect(panel).toContain("data-fotky-rozbal-nahravani");
    expect(panel).toContain("aria-expanded");
    expect(panel).toContain("Nahrát fotky");
    expect(panel).toContain("data-fotky-rozbal-nove-album");
    expect(panel).toContain("data-fotky-nove-album-blok");
    expect(panel).toContain("Nové album");
    expect(panel).toContain("fotkyDisclosureSpoustec");
    expect(panel).toContain("fotkyDisclosureObsah");
    expect(panel).toContain("fotkyDisclosurePopover");
    expect(panel).toContain("fotkyNahravaciSpoustice");
    expect(panel).toContain("data-fotky-nahravaci-spoustice");
    expect(panel).toContain("fotkyNahravaciObalSbaleny");
    expect(panel).not.toMatch(/flex min-w-0 flex-col items-start[\s\S]*data-fotky-rozbal-nahravani/);

    const form = cti("src/components/fotky/NoveAlbumForm.tsx");
    expect(form).toContain("Založit album");
  });

  it("admin maže vlastní album diskrétně u nahrávání s potvrzením", () => {
    const panel = cti("src/components/fotky/FotkyNahravaciPanel.tsx");
    expect(panel).toContain('data-smazat-album');
    expect(panel).toContain('albumKeSmazani.druh === "vlastni"');
    expect(panel).toContain("fotkySmazatAlbumDiscreet");
    expect(panel).toContain('id="fotky-nahravani"');

    const page = cti("src/pages/FotkyPage.tsx");
    expect(page).toContain("albumKeSmazani");
    expect(page).toContain('potvrditPopisek="Ano, smazat album"');
    expect(page).toContain("navratElement");

    const slozky = cti("src/components/fotky/SlozkySeznam.tsx");
    expect(slozky).not.toContain("data-smazat-album");

    const albumFotky = cti("src/components/fotky/AlbumFotky.tsx");
    expect(albumFotky).not.toContain("Smazat album");

    const karta = cti("src/components/fotky/AlbumKarta.tsx");
    expect(karta).not.toContain("data-smazat-album");
  });

  it("lightbox navigace používá sdílené SVG ovládání", () => {
    const nav = cti("src/components/fotky/FotkyLightboxNav.tsx");
    expect(nav).toContain("fotkyLightboxNavTlacitko");
    expect(nav).toContain('stroke="currentColor"');
    expect(nav).not.toContain("‹");

    const dialog = cti("src/components/fotky/FotkaDialog.tsx");
    expect(dialog).toContain("FotkyLightboxNav");

    const lightbox = cti("src/components/expeditions/FotkyLightbox.tsx");
    expect(lightbox).toContain("FotkyLightboxNav");
    expect(lightbox).not.toContain("‹");
  });
});
