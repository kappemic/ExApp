import { describe, expect, it } from "vitest";
import { ctiExif, nazevZAdresy, radkyUdaju, sestavUdaje, type ExifCteni } from "../src/lib/exif-fotky";

describe("sestavUdaje", () => {
  it("formátuje údaje jako u snímku z telefonu", () => {
    const exif: ExifCteni = {
      datumRaw: "2026:10:10 10:56:59",
      offset: "+02:00",
      make: "samsung",
      model: "Galaxy S23 FE",
      expozice: { citatel: 1, jmenovatel: 180 },
      iso: 160,
      clona: { citatel: 180, jmenovatel: 100 },
      ohnisko: { citatel: 554, jmenovatel: 100 },
      sirka: 4000,
      vyska: 3000,
    };
    const radky = radkyUdaju(
      sestavUdaje({
        exif,
        sirka: 4000,
        vyska: 3000,
        bajty: Math.round(6.6 * 1024 * 1024),
        nazevSouboru: "20261010_105659.jpg",
        zalozniCas: null,
      }),
    );
    expect(radky[0]).toBe("10. 10. 2026");
    expect(radky[1]).toBe("so 10:56:59, GMT+02:00");
    expect(radky).toContain("20261010_105659.jpg");
    expect(radky).toContain("12 MP");
    expect(radky).toContain("4000 × 3000");
    expect(radky).toContain("6,6 MiB");
    expect(radky).toContain("samsung Galaxy S23 FE");
    expect(radky).toContain("1/180 s");
    expect(radky).toContain("ISO 160");
    expect(radky).toContain("ƒ/1,8");
    expect(radky).toContain("5,54 mm");
  });

  it("přeskočí vygenerovaný uuid název souboru", () => {
    expect(nazevZAdresy("/api/alba/x/fotky/11111111-1111-1111-1111-111111111111.jpg")).toBeNull();
    expect(nazevZAdresy("/soubory/20261010_105659.jpg")).toBe("20261010_105659.jpg");
  });
});

describe("ctiExif", () => {
  it("přečte model z APP1", () => {
    const tiff = new Uint8Array([
      0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x0f, 0x01, 0x02, 0x00, 0x04,
      0x00, 0x00, 0x00, 0x53, 0x4d, 0x47, 0x00, 0x00, 0x00, 0x00, 0x00,
    ]);
    const delka = 2 + 6 + tiff.length;
    const jpeg = new Uint8Array(2 + 2 + delka);
    jpeg[0] = 0xff;
    jpeg[1] = 0xd8;
    jpeg[2] = 0xff;
    jpeg[3] = 0xe1;
    jpeg[4] = delka >> 8;
    jpeg[5] = delka & 0xff;
    jpeg.set([0x45, 0x78, 0x69, 0x66, 0x00, 0x00], 6);
    jpeg.set(tiff, 12);
    expect(ctiExif(jpeg).make).toBe("SMG");
  });
});
