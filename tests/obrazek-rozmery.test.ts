/**
 * Pixel cap for photo uploads. A normal raster passes. A header that
 * claims a huge bitmap does not, without decoding the full image.
 */
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  bajtyPlneFotky,
  maBezpecneRozmery,
  OBRAZEK_MAX_PIXELU,
  rozmeryUlozenychBajtu,
} from "../server/src/obrazek-nahled";

describe("maBezpecneRozmery", () => {
  it("pustí malý PNG", async () => {
    const png = await sharp({
      create: { width: 8, height: 8, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .png()
      .toBuffer();
    expect(await maBezpecneRozmery(png)).toBe(true);
  });

  it("čte rozměry uloženého WebP až po otočení", async () => {
    const jpeg = await sharp({
      create: { width: 30, height: 10, channels: 3, background: { r: 10, g: 20, b: 30 } },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const plna = await bajtyPlneFotky(jpeg, "image/jpeg");
    expect(plna).not.toBeNull();
    const rozmery = await rozmeryUlozenychBajtu(plna?.bajty ?? Buffer.alloc(0));
    expect(rozmery).toEqual({ sirka: 10, vyska: 30 });
  });

  it("chybějící metadata nehodí výjimku", async () => {
    expect(await rozmeryUlozenychBajtu(Buffer.from("neni obrazek"))).toBeNull();
  });

  it("odmítne hlavičku s obřími rozměry", async () => {
    const sirka = 0x0fffffff;
    const vyska = 0x0fffffff;
    expect(sirka * vyska).toBeGreaterThan(OBRAZEK_MAX_PIXELU);
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(sirka, 0);
    ihdr.writeUInt32BE(vyska, 4);
    ihdr[8] = 8;
    ihdr[9] = 2;
    const delka = Buffer.alloc(4);
    delka.writeUInt32BE(13, 0);
    const typ = Buffer.from("IHDR");
    const podpis = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const png = Buffer.concat([podpis, delka, typ, ihdr, Buffer.alloc(4)]);
    expect(await maBezpecneRozmery(png)).toBe(false);
  });
});
