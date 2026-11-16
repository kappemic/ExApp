import { readFileSync } from "node:fs";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { vyprazdniFrontuFotek, zaradNacteniFotky } from "../src/lib/fotka-fronta";
import { urlNahleduFotky } from "../src/lib/fotka-nahled";
import {
  AVATAR_DLOUHA_HRANA,
  NAHLED_DLOUHA_HRANA,
  ZPEVNIK_DLOUHA_HRANA,
  bajtyAvataru,
  bajtyNahledu,
  bajtyPlneFotky,
  bajtyZpevniku,
  chceNahled,
} from "../server/src/obrazek-nahled";

function cti(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
}

describe("urlNahleduFotky", () => {
  it("adds nahled=1 and leaves downloads on the original url", () => {
    expect(urlNahleduFotky("/api/alba/a/fotky/b/soubor")).toBe(
      "/api/alba/a/fotky/b/soubor?nahled=1",
    );
    expect(urlNahleduFotky("/api/expeditions/a/fotky/b/soubor?x=1")).toBe(
      "/api/expeditions/a/fotky/b/soubor?x=1&nahled=1",
    );
    expect(urlNahleduFotky("/soubor?nahled=1")).toBe("/soubor?nahled=1");
    expect(urlNahleduFotky("/api/users/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/avatar?v=1")).toBe(
      "/api/users/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/avatar?v=1&nahled=1",
    );
    expect(urlNahleduFotky("/api/diskuze/prilohy/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")).toBe(
      "/api/diskuze/prilohy/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee?nahled=1",
    );
    expect(urlNahleduFotky("https://cdn.test/avatar.jpg")).toBe("https://cdn.test/avatar.jpg");
    expect(urlNahleduFotky("blob:http://local/1")).toBe("blob:http://local/1");
    expect(urlNahleduFotky("")).toBe("");
  });
});

describe("bajtyNahledu", () => {
  it("shrinks a large raster to webp with a long edge of at most 960", async () => {
    const zdroj = await sharp({
      create: { width: 1400, height: 900, channels: 3, background: "#336699" },
    })
      .jpeg()
      .toBuffer();
    const nahled = await bajtyNahledu(zdroj, "image/jpeg");
    expect(nahled).not.toBeNull();
    if (nahled === null) return;
    expect(nahled.contentType).toBe("image/webp");
    expect(nahled.bajty.length).toBeLessThan(zdroj.length);
    const meta = await sharp(nahled.bajty).metadata();
    expect(meta.format).toBe("webp");
    const dlouha = Math.max(meta.width ?? 0, meta.height ?? 0);
    expect(dlouha).toBeLessThanOrEqual(NAHLED_DLOUHA_HRANA);
    expect(dlouha).toBe(960);
    expect(meta.exif).toBeUndefined();
  });

  it("leaves gif and heic bytes unconverted", async () => {
    const zdroj = await sharp({
      create: { width: 32, height: 32, channels: 3, background: "#336699" },
    })
      .png()
      .toBuffer();
    expect(await bajtyNahledu(zdroj, "image/gif")).toBeNull();
    expect(await bajtyNahledu(zdroj, "image/heic")).toBeNull();
    expect(await bajtyPlneFotky(zdroj, "image/heif")).toBeNull();
  });

  it("bakes orientation into a full webp and does not downscale", async () => {
    const zdroj = await sharp({
      create: { width: 40, height: 20, channels: 3, background: "#336699" },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const plna = await bajtyPlneFotky(zdroj, "image/jpeg");
    expect(plna).not.toBeNull();
    if (plna === null) return;
    expect(plna.contentType).toBe("image/webp");
    const meta = await sharp(plna.bajty).metadata();
    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(20);
    expect(meta.height).toBe(40);
    expect(meta.orientation).toBeUndefined();
    expect(meta.exif).toBeUndefined();
  });

  it("caps avatar and songbook derivatives on the long edge", async () => {
    const zdroj = await sharp({
      create: { width: 2000, height: 1000, channels: 3, background: "#336699" },
    })
      .jpeg()
      .toBuffer();
    const avatar = await bajtyAvataru(zdroj, "image/jpeg");
    const zpevnik = await bajtyZpevniku(zdroj, "image/jpeg");
    expect(avatar).not.toBeNull();
    expect(zpevnik).not.toBeNull();
    if (avatar === null || zpevnik === null) return;
    const metaAvatar = await sharp(avatar.bajty).metadata();
    const metaZpevnik = await sharp(zpevnik.bajty).metadata();
    expect(Math.max(metaAvatar.width ?? 0, metaAvatar.height ?? 0)).toBe(AVATAR_DLOUHA_HRANA);
    expect(Math.max(metaZpevnik.width ?? 0, metaZpevnik.height ?? 0)).toBe(ZPEVNIK_DLOUHA_HRANA);
    expect(avatar.contentType).toBe("image/webp");
    expect(zpevnik.contentType).toBe("image/webp");
  });

  it("ignores the flag unless the query is exactly 1", () => {
    expect(chceNahled({ query: { nahled: "1" } } as never)).toBe(true);
    expect(chceNahled({ query: { nahled: "0" } } as never)).toBe(false);
    expect(chceNahled({ query: {} } as never)).toBe(false);
  });
});

describe("fotka fronta", () => {
  it("starts the top row left to right, then the next row, and lets a priority photo cut in", async () => {
    vyprazdniFrontuFotek();
    let uvolni: () => void = () => {};
    const brana = new Promise<void>((resolve) => {
      uvolni = resolve;
    });
    const start: number[] = [];
    const pust = (poradi: number, y: number, x: number, prednost = false): void => {
      zaradNacteniFotky(
        () => {
          start.push(poradi);
          return brana;
        },
        prednost,
        prednost ? undefined : { y, x },
      );
    };
    pust(2, 0, 200);
    pust(0, 0, 0);
    pust(1, 0, 100);
    pust(3, 40, 0);
    pust(4, 40, 80);
    pust(5, 80, 0);
    pust(6, 80, 40);
    pust(7, 120, 0);
    pust(99, 0, 0, true);
    expect(start).toEqual([99]);
    await Promise.resolve();
    expect(start).toEqual([99, 0, 1, 2, 3, 4]);
    uvolni();
    await brana;
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    expect(start).toEqual([99, 0, 1, 2, 3, 4, 5, 6, 7]);
  });
});

describe("photo surfaces use the preview first", () => {
  it("grids, covers and lightboxes render PostupnaFotka", () => {
    for (const soubor of [
      "src/components/fotky/AlbumFotky.tsx",
      "src/components/fotky/FotkaDialog.tsx",
      "src/components/fotky/PapirObal.tsx",
      "src/components/expeditions/ExpeditionPhotos.tsx",
      "src/components/expeditions/FotkyLightbox.tsx",
      "src/components/expeditions/VypravaNahled.tsx",
      "src/components/AvatarKruh.tsx",
      "src/components/clen/ClenProfil.tsx",
      "src/components/profil/AvatarUpload.tsx",
    ]) {
      expect(cti(soubor)).toContain("PostupnaFotka");
    }
    expect(cti("server/src/obrazek-nahled.ts")).toContain('res.setHeader("Cache-Control", "private, max-age=2592000");');
    expect(cti("server/src/zprava-prilohy.ts")).toContain('res.setHeader("Cache-Control", "private, max-age=2592000");');
    for (const soubor of [
      "server/src/fotky-routes.ts",
      "server/src/alba-routes.ts",
      "server/src/cesta-snimky-routes.ts",
      "server/src/ucty-routes.ts",
    ]) {
      expect(cti(soubor)).toContain("posliObrazekZKlice(");
    }
    const stahovani = cti("src/lib/stahni-fotku.ts");
    expect(stahovani).not.toContain("nahled=1");
  });
});
