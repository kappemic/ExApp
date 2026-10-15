import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function cti(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
}

describe("ExpeditionPhotos delete-mode gallery header", () => {
  const expedition = cti("src/components/expeditions/ExpeditionPhotos.tsx");
  const album = cti("src/components/fotky/AlbumFotky.tsx");
  const lightbox = cti("src/components/expeditions/FotkyLightbox.tsx");

  it("skryje Zavřít v mazacím režimu galerie a nechá Zrušit v hlavičce", () => {
    expect(expedition).toContain("!mazani.mazaciRezim");
    expect(expedition).toContain('aria-label="Zavřít galerii"');
    expect(expedition).toContain("FotkyMazaciHlavicka");
    expect(expedition).toContain("zrusMazaniRef");
  });

  it("sdílí mazací hlavičku a potvrzení s AlbumFotky", () => {
    expect(expedition).toContain("FotkyMazaciHlavicka");
    expect(expedition).toContain("nadpisPotvrzeniMazaniFotek");
    expect(expedition).toContain("popisPotvrzeniMazaniFotek");
    expect(expedition).toContain("useFotkyMazani");
    expect(album).toContain("FotkyMazaciHlavicka");
    expect(album).toContain("nadpisPotvrzeniMazaniFotek");
    expect(album).toContain("useFotkyMazani");
  });

  it("mřížka má 44px+, focus a výběr jako AlbumFotky", () => {
    expect(expedition).toContain("fotkyMrizkaDlazdice");
    expect(expedition).toContain("fotkyTlacitkoZaklad");
    expect(expedition).toContain("aria-pressed={vybrana}");
    expect(expedition).toContain("MazaniVyberVrstva");
    expect(expedition).toContain("fotkyMrizkaDlazdice");
    expect(expedition).toContain("fotka.jeNahled");
    expect(expedition).toContain("aria-label={popisekFotky");
    expect(album).toContain("fotkyMrizkaDlazdice");
    expect(album).toContain("aria-pressed={vybrana}");
    expect(album).toContain("MazaniVyberVrstva");
    expect(album).toContain("fotka.jeNahled");
  });

  it("MazaniVyberVrstva zobrazí výběr jen overlayem, bez středového odznaku", () => {
    const vrstva = cti("src/components/fotky/MazaniVyberVrstva.tsx");
    expect(vrstva).toContain("bg-jantar/45");
    expect(vrstva).not.toContain("left-1/2");
    expect(vrstva).not.toContain("✓");
    expect(vrstva).not.toContain("rounded-full");
  });

  it("mazací hlavička je ve sloupci: Zrušit nahoře", () => {
    const hlavicka = cti("src/components/fotky/FotkyMazaciHlavicka.tsx");
    expect(hlavicka).toContain("data-fotky-mazaci-akce");
    expect(hlavicka).toContain("flex-col");
    const akce = hlavicka.slice(hlavicka.indexOf("data-fotky-mazaci-akce"));
    const zrusIdx = akce.indexOf("Zrušit");
    const vseIdx = akce.indexOf("Smazat vše");
    const vybraneIdx = akce.indexOf("Smazat vybrané");
    expect(zrusIdx).toBeGreaterThan(-1);
    expect(vseIdx).toBeGreaterThan(zrusIdx);
    expect(vybraneIdx).toBeGreaterThan(vseIdx);
  });

  it("lightbox má navigaci a mazací hlavičku bez Zavřít v mazání", () => {
    const nav = cti("src/components/fotky/FotkyLightboxNav.tsx");
    expect(lightbox).toContain("FotkyLightboxNav");
    expect(nav).toContain('aria-label="Předchozí fotka"');
    expect(nav).toContain('aria-label="Další fotka"');
    expect(lightbox).toContain("FotkyMazaciHlavicka");
    expect(lightbox).toContain("!mazaciRezim");
    expect(lightbox).toContain("onZrusMazaniRef");
    expect(expedition).toContain("onZacniMazani");
  });

  it("prázdný stav a obálka používají PapirObal", () => {
    expect(expedition).toContain("PapirObal");
    expect(expedition).toContain("role=\"status\"");
    expect(expedition).toContain("Zatím tu není žádná fotka");
  });
});
