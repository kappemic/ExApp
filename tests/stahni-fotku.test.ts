import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  idsFotekKeStazeni,
  jeVybranoVse,
  prepniIdVeVyberu,
  prepniVyberVsech,
} from "../src/lib/fotky-stahovani";
import {
  lzeSdiletSoubory,
  maStahnoutDoGalerie,
  nazevSouboruAlba,
  nazevSouboruVypravy,
  nazevZipAlba,
  priponaZTypuObsahu,
  rozhodniMetoduStahnuti,
  segmentDoNazvu,
  stahniFotkyDoGalerie,
  stahniFotkyDoSlozky,
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

  it("sends a phone batch to the gallery and keeps a computer on the zip path", () => {
    expect(maStahnoutDoGalerie(true, true, 3)).toBe(true);
    expect(maStahnoutDoGalerie(true, false, 3)).toBe(false);
    expect(maStahnoutDoGalerie(false, true, 3)).toBe(false);
    expect(maStahnoutDoGalerie(true, true, 0)).toBe(false);
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

describe("stahniFotkyDoGalerie", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shares every fetched photo instead of packing a zip", async () => {
    const sdilene: File[][] = [];
    vi.stubGlobal(
      "fetch",
      async () => new Response(new Blob(["img"], { type: "image/jpeg" }), { status: 200 }),
    );
    const nav = {
      onLine: true,
      canShare: () => true,
      share: async (data: ShareData) => {
        sdilene.push([...(data.files ?? [])]);
      },
    } as Navigator;

    const vysledek = await stahniFotkyDoGalerie(
      [
        { url: "/a", nazevSouboru: "a.jpg" },
        { url: "/b", nazevSouboru: "b.jpg" },
      ],
      undefined,
      nav,
    );

    expect(vysledek).toEqual({ ok: true, pocet: 2 });
    expect(sdilene).toHaveLength(1);
    expect(sdilene[0]?.map((soubor) => soubor.name)).toEqual(["a.jpg", "b.jpg"]);
    expect(sdilene[0]?.every((soubor) => soubor.type === "image/jpeg")).toBe(true);
  });

  it("keeps the files when the share sheet needs a fresh tap", async () => {
    vi.stubGlobal(
      "fetch",
      async () => new Response(new Blob(["img"], { type: "image/jpeg" }), { status: 200 }),
    );
    const nav = {
      onLine: true,
      canShare: () => true,
      share: async () => {
        throw new DOMException("gesture", "NotAllowedError");
      },
    } as Navigator;

    const vysledek = await stahniFotkyDoGalerie(
      [{ url: "/a", nazevSouboru: "a.jpg" }],
      undefined,
      nav,
    );

    expect(vysledek.ok).toBe(false);
    if (vysledek.ok) return;
    expect(vysledek.soubory).toHaveLength(1);
  });
});

describe("stahniFotkyDoSlozky", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates each file before fetching and writes the bytes", async () => {
    const poradi: string[] = [];
    const zapisy: { nazev: string; text: string }[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      poradi.push(`fetch:${url}`);
      return new Response(new Blob(["img"], { type: "image/jpeg" }), { status: 200 });
    });

    const slozka = {
      getFileHandle: async (nazev: string, volby: { create: true }) => {
        poradi.push(`soubor:${nazev}:${String(volby.create)}`);
        return {
          createWritable: async () => {
            poradi.push(`proud:${nazev}`);
            return {
              write: async (data: ArrayBuffer) => {
                zapisy.push({ nazev, text: new TextDecoder().decode(data) });
              },
              close: async () => {
                poradi.push(`zavreno:${nazev}`);
              },
            };
          },
        };
      },
    };

    const vysledek = await stahniFotkyDoSlozky(
      [
        { url: "/a", nazevSouboru: "a.jpg" },
        { url: "/b", nazevSouboru: "b.jpg" },
      ],
      slozka,
      undefined,
      { onLine: true } as Navigator,
    );

    expect(vysledek).toEqual({ ok: true, pocet: 2 });
    expect(poradi.slice(0, 4)).toEqual([
      "soubor:a.jpg:true",
      "proud:a.jpg",
      "soubor:b.jpg:true",
      "proud:b.jpg",
    ]);
    expect(poradi.indexOf("fetch:/a")).toBeGreaterThan(poradi.indexOf("proud:b.jpg"));
    expect(zapisy).toEqual([
      { nazev: "a.jpg", text: "img" },
      { nazev: "b.jpg", text: "img" },
    ]);
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

describe("výběr fotek ke stažení", () => {
  const fotky = [{ id: "a" }, { id: "b" }];

  it("označí a odznačí jednu fotku beze změny původní sady", () => {
    const puvodni = new Set(["a"]);
    expect([...prepniIdVeVyberu(puvodni, "b")]).toEqual(["a", "b"]);
    expect([...prepniIdVeVyberu(puvodni, "a")]).toEqual([]);
    expect([...puvodni]).toEqual(["a"]);
  });

  it("vybere vše, a když je vybráno vše, výběr zruší", () => {
    expect([...prepniVyberVsech(fotky, new Set(["a"]))]).toEqual(["a", "b"]);
    expect([...prepniVyberVsech(fotky, new Set(["a", "b"]))]).toEqual([]);
    expect(jeVybranoVse([], new Set())).toBe(false);
  });

  it("hlavička alba pouští do režimu výběru a uložení do galerie je v lepivé liště", () => {
    const page = cti("src/pages/FotkyPage.tsx");
    expect(page).toContain("data-fotky-vybrat-ke-stazeni");
    expect(page).toContain("vyberFotky()");
    const hlavicka = cti("src/components/fotky/FotkyStahovaciHlavicka.tsx");
    expect(hlavicka).toContain("Vybrat vše");
    expect(hlavicka).toContain("Zrušit výběr");
    expect(hlavicka).toContain("Uložit do galerie");
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

  it("stahovací hlavička je v řádku: Zrušit, pak vybrané, nakonec vše", () => {
    const hlavicka = cti("src/components/fotky/FotkyStahovaciHlavicka.tsx");
    expect(hlavicka).toContain("data-fotky-stahovaci-akce");
    expect(hlavicka).toContain("grid-cols-2");
    const akce = hlavicka.slice(hlavicka.indexOf("data-fotky-stahovaci-akce"));
    const zrusIdx = akce.indexOf("Zrušit");
    const vybraneIdx = akce.indexOf("Stáhnout vybrané");
    const vseIdx = akce.indexOf("Stáhnout vše");
    expect(zrusIdx).toBeGreaterThan(-1);
    expect(vybraneIdx).toBeGreaterThan(zrusIdx);
    expect(vseIdx).toBeGreaterThan(vybraneIdx);
  });
});
