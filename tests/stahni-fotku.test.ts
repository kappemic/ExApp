import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  idsFotekKeStazeni,
} from "../src/lib/fotky-stahovani";
import {
  lzeSdiletSoubory,
  nazevSouboruAlba,
  nazevSouboruVypravy,
  nazevZipAlba,
  priponaZTypuObsahu,
  rozhodniMetoduStahnuti,
  segmentDoNazvu,
  stahniFotkyPostupne,
  upravPriponuNazvu,
} from "../src/lib/stahni-fotku";

function cti(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
}

describe("stahni-fotku helpers", () => {
  it("builds expedition and album filenames", () => {
    expect(nazevSouboruVypravy("exp-1", "f-2")).toBe("vyprava-exp-1-f-2.jpg");
    expect(nazevSouboruAlba("alb-9", "f-2", "png")).toBe("album-alb-9-f-2.png");
    expect(segmentDoNazvu("bad/id")).toBe("bad-id");
  });

  it("builds album ZIP archive names", () => {
    expect(nazevZipAlba("uuid-1")).toBe("album-uuid-1.zip");
    expect(nazevZipAlba("uuid-1", "Výprava / léto")).toBe("album-V-prava-l-to.zip");
    expect(nazevZipAlba("uuid-1", "   ")).toBe("album-uuid-1.zip");
  });

  it("maps content types and replaces extensions", () => {
    expect(priponaZTypuObsahu("image/png")).toBe("png");
    expect(priponaZTypuObsahu("image/jpeg; charset=binary")).toBe("jpg");
    expect(upravPriponuNazvu("vyprava-a-b.jpg", "webp")).toBe("vyprava-a-b.webp");
  });

  it("prefers share when file sharing is supported", () => {
    expect(rozhodniMetoduStahnuti(true)).toBe("share");
    expect(rozhodniMetoduStahnuti(false)).toBe("download");
  });

  it("detects share support via canShare(files)", () => {
    const bez = { canShare: undefined } as Navigator;
    expect(lzeSdiletSoubory(bez)).toBe(false);

    const s = {
      canShare: (data: ShareData) =>
        Array.isArray(data.files) && data.files.length > 0,
    } as Navigator;
    expect(lzeSdiletSoubory(s)).toBe(true);
  });

  it("stahniFotkyPostupne returns empty success for no items", async () => {
    await expect(stahniFotkyPostupne([])).resolves.toEqual({ ok: true, pocet: 0 });
  });
});

describe("idsFotekKeStazeni", () => {
  const fotky = [{ id: "a" }, { id: "b" }, { id: "c" }];

  it("returns all ids for vse", () => {
    expect(idsFotekKeStazeni(fotky, new Set(["a"]), "vse")).toEqual(["a", "b", "c"]);
  });

  it("returns selected ids for vybrane", () => {
    expect(idsFotekKeStazeni(fotky, new Set(["a", "c"]), "vybrane")).toEqual(["a", "c"]);
  });
});

describe("Stáhnout jen v albech", () => {
  it("AlbumFotky má stahovací hlavičku a režim výběru", () => {
    const album = cti("src/components/fotky/AlbumFotky.tsx");
    expect(album).toContain("FotkyStahovaciHlavicka");
    expect(album).toContain("useFotkyStahovani");
    expect(album).toContain("FotkyStavPanel");
    expect(album).toContain("nazevZipAlba");
    expect(album).toContain("Vyber fotky ke stažení");
    expect(album).toContain("Vybrat fotku ke stažení");
  });

  it("AlbumFotky vylučuje mazání a stažení v toolbaru", () => {
    const album = cti("src/components/fotky/AlbumFotky.tsx");
    expect(album).not.toMatch(/!stahovani\.stahovaciRezim\s*\?\s*hlavickaStahovani/);
    expect(album).not.toMatch(/!mazani\.mazaciRezim\s*\?\s*hlavickaMazani\s*:\s*null/);
    expect(album).toMatch(
      /mazani\.mazaciRezim\s*\?\s*\(\s*[\s\S]*?hlavickaMazani[\s\S]*?\)\s*:\s*stahovani\.stahovaciRezim/,
    );
    expect(album).toMatch(
      /stahovani\.stahovaciRezim\s*\?\s*\(\s*[\s\S]*?hlavickaStahovani[\s\S]*?\)\s*:\s*\(/,
    );
    expect(album).toContain("resetMazani");
    expect(album).toContain("resetStahovani");
  });

  it("FotkaDialog stahuje jen aktuální fotku, ne režim výběru", () => {
    const dialog = cti("src/components/fotky/FotkaDialog.tsx");
    expect(dialog).toContain("StahniFotkuTlacitko");
    expect(dialog).not.toContain("FotkyStahovaciHlavicka");
    expect(dialog).not.toContain("stahovaciRezim");
    expect(dialog).toContain("urlSouboruAlba");
  });

  it("FotkyLightbox nemá stahování", () => {
    const lightbox = cti("src/components/expeditions/FotkyLightbox.tsx");
    expect(lightbox).not.toContain("StahniFotkuTlacitko");
    expect(lightbox).not.toContain("Stáhnout");
  });

  it("stahovací hlavička je ve sloupci: Zrušit nahoře", () => {
    const hlavicka = cti("src/components/fotky/FotkyStahovaciHlavicka.tsx");
    expect(hlavicka).toContain("data-fotky-stahovaci-akce");
    expect(hlavicka).toContain("flex-col");
    const akce = hlavicka.slice(hlavicka.indexOf("data-fotky-stahovaci-akce"));
    const zrusIdx = akce.indexOf("Zrušit");
    const vseIdx = akce.indexOf("Stáhnout vše");
    const vybraneIdx = akce.indexOf("Stáhnout vybrané");
    expect(zrusIdx).toBeGreaterThan(-1);
    expect(vseIdx).toBeGreaterThan(zrusIdx);
    expect(vybraneIdx).toBeGreaterThan(vseIdx);
  });
});
