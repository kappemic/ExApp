/**
 * tests/r2-fotky.test.ts — file upload to Cloudflare R2.
 * Pure helpers only: no network, no secrets.
 */
import type { Response } from "express";
import sharp from "sharp";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ctiR2Nastaveni,
  klicCestaSnimku,
  klicFotky,
  klicAvataru,
  klicAvataruZVerejneUrl,
  klicNahledu,
  contentTypeZKlice,
  klicZVerejneUrl,
  posliObrazekZKlice,
  pripravObrazekKUlozeni,
  rozpoznajObrazek,
  rozdelMultipart,
  ulozFotkuDoR2,
  verejnaUrlFotky,
  type R2Nastaveni,
} from "../server/src/r2-fotky";
import { posliUlozenouPrilohu } from "../server/src/zprava-prilohy";

const ENV_OK: NodeJS.ProcessEnv = {
  R2_ACCOUNT_ID: "account",
  R2_ACCESS_KEY_ID: "access",
  R2_SECRET_ACCESS_KEY: "secret",
  R2_BUCKET: "exapp-fotky",
  R2_PUBLIC_BASE_URL: "https://pub-example.r2.dev",
};

const UUID = "11111111-1111-4111-8111-111111111111";

function multipart(popis: string, soubor: Buffer, filename = "foto.jpg"): { telo: Buffer; typ: string } {
  const hranice = "----exapp";
  const telo = Buffer.from(
    `--${hranice}\r\nContent-Disposition: form-data; name="popis"\r\n\r\n${popis}\r\n` +
      `--${hranice}\r\nContent-Disposition: form-data; name="soubor"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`,
    "utf8",
  );
  const konec = Buffer.from(`\r\n--${hranice}--\r\n`, "utf8");
  return {
    telo: Buffer.concat([telo, soubor, konec]),
    typ: `multipart/form-data; boundary=${hranice}`,
  };
}

describe("ctiR2Nastaveni", () => {
  it("přijme kompletní https nastavení", () => {
    const nastaveni = ctiR2Nastaveni(ENV_OK);
    expect(nastaveni?.bucket).toBe("exapp-fotky");
    expect(nastaveni?.publicBaseUrl).toBe("https://pub-example.r2.dev");
  });

  it("chybějící klíč vrátí null", () => {
    expect(ctiR2Nastaveni({ ...ENV_OK, R2_BUCKET: "" })).toBeNull();
  });

  it("http veřejná adresa neprojde", () => {
    expect(ctiR2Nastaveni({ ...ENV_OK, R2_PUBLIC_BASE_URL: "http://pub-example.r2.dev" })).toBeNull();
  });
});

describe("rozpoznajObrazek", () => {
  it("pozná jpeg, png a webp", () => {
    expect(rozpoznajObrazek(Buffer.from([0xff, 0xd8, 0xff, 0x00]))).toBe("jpg");
    expect(rozpoznajObrazek(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("png");
    const webp = Buffer.alloc(12);
    webp.write("RIFF", 0, "ascii");
    webp.write("WEBP", 8, "ascii");
    expect(rozpoznajObrazek(webp)).toBe("webp");
  });

  it("odmítne gif", () => {
    expect(rozpoznajObrazek(Buffer.from("GIF89a"))).toBeNull();
  });
});

describe("klíč a veřejná adresa", () => {
  it("neskládá klíč z původního jména souboru", () => {
    const klic = klicFotky("sumava-modrava", "jpg", UUID);
    expect(klic).toBe(`vypravy/sumava-modrava/${UUID}.jpg`);
    expect(klic).not.toContain("tajne jmeno");
  });

  it("odmítne nebezpečné id", () => {
    expect(klicFotky("../etc", "jpg", UUID)).toBeNull();
  });

  it("skládá klíč avatara jen z uuid uživatele", () => {
    const klic = klicAvataru(UUID, "jpg", UUID);
    expect(klic).toBe(`avatary/${UUID}/${UUID}.jpg`);
    expect(klicAvataru("../etc", "jpg", UUID)).toBeNull();
    const url = verejnaUrlFotky("https://pub-example.r2.dev", klic ?? "");
    expect(klicAvataruZVerejneUrl(url, "https://pub-example.r2.dev", UUID)).toBe(klic);
    expect(klicAvataruZVerejneUrl(url, "https://pub-example.r2.dev", "00000000-0000-4000-8000-000000000000")).toBeNull();
  });

  it("složí veřejnou URL a pozná náš objekt", () => {
    const klic = `vypravy/sumava-modrava/${UUID}.png`;
    const url = verejnaUrlFotky("https://pub-example.r2.dev/", klic);
    expect(url).toBe(`https://pub-example.r2.dev/${klic}`);
    expect(klicZVerejneUrl(url, "https://pub-example.r2.dev")).toBe(klic);
  });

  it("klíč snímku cesty je ve složce směru", () => {
    const klic = klicCestaSnimku("sumava-modrava", "tam", "jpg", UUID);
    expect(klic).toBe(`vypravy/sumava-modrava/cesta-tam/${UUID}.jpg`);
    expect(klicCestaSnimku("../etc", "zpet", "png", UUID)).toBeNull();
    const url = verejnaUrlFotky("https://pub-example.r2.dev", klic ?? "");
    expect(klicZVerejneUrl(url, "https://pub-example.r2.dev")).toBe(klic);
  });

  it("cizí odkaz nemaže z R2", () => {
    expect(klicZVerejneUrl("https://example.cz/foto.jpg", "https://pub-example.r2.dev")).toBeNull();
  });

  it("staré jpg png i webp klíče pořád patří k plné fotce, náhledový sourozenec ne", () => {
    const zaklad = "https://pub-example.r2.dev";
    for (const pripona of ["jpg", "png", "webp"] as const) {
      const klic = `vypravy/sumava-modrava/${UUID}.${pripona}`;
      expect(klicZVerejneUrl(verejnaUrlFotky(zaklad, klic), zaklad)).toBe(klic);
      expect(klicNahledu(klic)).toBe(`vypravy/sumava-modrava/${UUID}.nahled.webp`);
    }
    const nahled = `alba/${UUID}/${UUID}.nahled.webp`;
    expect(klicNahledu(nahled)).toBeNull();
    expect(klicZVerejneUrl(verejnaUrlFotky(zaklad, nahled), zaklad)).toBeNull();
    expect(klicNahledu(`vypravy/sumava-modrava/cesta-zpet/${UUID}.jpg`)).toBe(
      `vypravy/sumava-modrava/cesta-zpet/${UUID}.nahled.webp`,
    );
    const avatarNahled = `avatary/${UUID}/${UUID}.nahled.webp`;
    expect(klicAvataruZVerejneUrl(verejnaUrlFotky(zaklad, avatarNahled), zaklad, UUID)).toBeNull();
  });

  it("typ souboru bere z přípony klíče", () => {
    const klic = `vypravy/sumava-modrava/${UUID}.webp`;
    expect(contentTypeZKlice(klic)).toBe("image/webp");
    expect(contentTypeZKlice(klic.replace(".webp", ".png"))).toBe("image/png");
    expect(contentTypeZKlice(klic.replace(".webp", ".jpg"))).toBe("image/jpeg");
  });
});

describe("překódování před uložením", () => {
  async function raster(format: "jpeg" | "png"): Promise<Buffer> {
    const obrazek = sharp({
      create: { width: 1200, height: 800, channels: 3, background: "#224466" },
    });
    return format === "jpeg" ? obrazek.jpeg().toBuffer() : obrazek.png().toBuffer();
  }

  it("nový jpeg i png skončí jako image/webp s klíčem .webp a náhledem", async () => {
    const jpeg = await raster("jpeg");
    const png = await raster("png");
    const zJpeg = await pripravObrazekKUlozeni(
      jpeg,
      "image/jpeg",
      "jpg",
      "plna",
      (ext) => `vypravy/sumava-modrava/${UUID}.${ext}`,
    );
    const zPng = await pripravObrazekKUlozeni(
      png,
      "image/png",
      "png",
      "plna",
      (ext) => `alba/${UUID}/${UUID}.${ext}`,
    );
    expect(zJpeg?.klic).toBe(`vypravy/sumava-modrava/${UUID}.webp`);
    expect(zJpeg?.contentType).toBe("image/webp");
    expect(zJpeg?.nahled?.klic).toBe(`vypravy/sumava-modrava/${UUID}.nahled.webp`);
    expect(zJpeg?.nahled?.contentType).toBe("image/webp");
    expect(zPng?.klic).toBe(`alba/${UUID}/${UUID}.webp`);
    expect(zPng?.contentType).toBe("image/webp");
    expect(zPng?.nahled?.klic).toBe(`alba/${UUID}/${UUID}.nahled.webp`);
    const meta = await sharp(zJpeg?.bajty).metadata();
    const nahled = await sharp(zJpeg?.nahled?.bajty).metadata();
    expect(meta.format).toBe("webp");
    expect(nahled.format).toBe("webp");
    expect(Math.max(nahled.width ?? 0, nahled.height ?? 0)).toBeLessThanOrEqual(960);
  });

  it("gif a heic zůstanou původní bajty bez náhledového souboru", async () => {
    const gif = Buffer.from("GIF89a");
    const vysledek = await pripravObrazekKUlozeni(
      gif,
      "image/gif",
      "gif",
      "plna",
      (ext) => `chat-prilohy/${UUID}.${ext}`,
    );
    expect(vysledek?.klic).toBe(`chat-prilohy/${UUID}.gif`);
    expect(vysledek?.contentType).toBe("image/gif");
    expect(vysledek?.bajty.equals(gif)).toBe(true);
    expect(vysledek?.nahled).toBeNull();
    const heic = await pripravObrazekKUlozeni(
      gif,
      "image/heic",
      "heic",
      "plna",
      (ext) => `chat-prilohy/${UUID}.${ext}`,
    );
    expect(heic?.klic).toBe(`chat-prilohy/${UUID}.heic`);
    expect(heic?.nahled).toBeNull();
  });

  it("avatar a zpěvník jsou jedno webp bez sourozence", async () => {
    const jpeg = await sharp({
      create: { width: 1800, height: 900, channels: 3, background: "#224466" },
    })
      .jpeg()
      .toBuffer();
    const avatar = await pripravObrazekKUlozeni(
      jpeg,
      "image/jpeg",
      "jpg",
      "avatar",
      (ext) => `avatary/${UUID}/${UUID}.${ext}`,
    );
    const zpevnik = await pripravObrazekKUlozeni(
      jpeg,
      "image/jpeg",
      "jpg",
      "zpevnik",
      (ext) => `zpevnik/navrhy/${UUID}.${ext}`,
    );
    expect(avatar?.klic).toBe(`avatary/${UUID}/${UUID}.webp`);
    expect(avatar?.contentType).toBe("image/webp");
    expect(avatar?.nahled).toBeNull();
    expect(zpevnik?.klic).toBe(`zpevnik/navrhy/${UUID}.webp`);
    expect(zpevnik?.contentType).toBe("image/webp");
    expect(zpevnik?.nahled).toBeNull();
    const metaAvatar = await sharp(avatar?.bajty).metadata();
    const metaZpevnik = await sharp(zpevnik?.bajty).metadata();
    expect(Math.max(metaAvatar.width ?? 0, metaAvatar.height ?? 0)).toBeLessThanOrEqual(256);
    expect(Math.max(metaZpevnik.width ?? 0, metaZpevnik.height ?? 0)).toBeLessThanOrEqual(1600);
  });
});

describe("rozdelMultipart", () => {
  it("vybere jpeg a popis", () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0x01, 0x02]);
    const { telo, typ } = multipart("  Západ  ", jpeg, "../../tajne.jpg");
    const vysledek = rozdelMultipart(telo, typ);
    expect(vysledek.ok).toBe(true);
    if (vysledek.ok) {
      expect(vysledek.fotka.popis).toBe("Západ");
      expect(vysledek.fotka.bajty.equals(jpeg)).toBe(true);
    }
  });

  it("odmítne textový soubor", () => {
    const { telo, typ } = multipart("", Buffer.from("hello"));
    const vysledek = rozdelMultipart(telo, typ);
    expect(vysledek.ok).toBe(false);
    if (!vysledek.ok) expect(vysledek.duvod).toBe("format");
  });

  it("odmítne příliš dlouhý popis", () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff]);
    const { telo, typ } = multipart("x".repeat(501), jpeg);
    const vysledek = rozdelMultipart(telo, typ);
    expect(vysledek.ok).toBe(false);
    if (!vysledek.ok) expect(vysledek.duvod).toBe("popis");
  });
});

interface ZachycenaOdpoved {
  telo?: Buffer;
  hlavicky: Map<string, string>;
  status: (kod: number) => ZachycenaOdpoved;
  setHeader: (nazev: string, hodnota: string | number) => ZachycenaOdpoved;
  end: (chunk?: Buffer) => void;
}

function zachytOdpoved(): ZachycenaOdpoved {
  const hlavicky = new Map<string, string>();
  const res: ZachycenaOdpoved = {
    hlavicky,
    status() {
      return res;
    },
    setHeader(nazev, hodnota) {
      hlavicky.set(nazev, String(hodnota));
      return res;
    },
    end(chunk) {
      res.telo = chunk;
    },
  };
  return res;
}

function jakoExpress(res: ZachycenaOdpoved): Response {
  return res as unknown as Response;
}

describe("náhled z R2 a cache na PUT", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function nastaveni(): R2Nastaveni {
    const nactene = ctiR2Nastaveni(ENV_OK);
    if (nactene === null) throw new Error("nastaveni");
    return nactene;
  }

  it("PUT podepíše Cache-Control, protože klíč s UUID se nepřepisuje", async () => {
    // Unsigned Cache-Control breaks SigV4. Songbook uses the same PUT helper.
    const volani: { method: string; headers: Headers }[] = [];
    vi.stubGlobal("fetch", (vstup: RequestInfo | URL, init?: RequestInit) => {
      volani.push({ method: init?.method ?? "GET", headers: new Headers(init?.headers) });
      return Promise.resolve(new Response(null, { status: 200 }));
    });
    await ulozFotkuDoR2(
      nastaveni(),
      `zpevnik/navrhy/${UUID}.webp`,
      Buffer.from("webp"),
      "image/webp",
    );
    expect(volani).toHaveLength(1);
    const hlavicky = volani[0]?.headers;
    expect(hlavicky?.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(hlavicky?.get("authorization")).toContain(
      "SignedHeaders=cache-control;content-type;host;x-amz-content-sha256;x-amz-date",
    );
  });

  it("nahled=1 nečte plný objekt, když sourozenec v R2 existuje", async () => {
    const nahled = await sharp({
      create: { width: 8, height: 8, channels: 3, background: "#112233" },
    })
      .webp()
      .toBuffer();
    const url: string[] = [];
    vi.stubGlobal("fetch", (vstup: RequestInfo | URL, init?: RequestInit) => {
      const adresa = String(vstup);
      url.push(adresa);
      expect(init?.method ?? "GET").toBe("GET");
      if (adresa.includes(".nahled.webp")) {
        return Promise.resolve(new Response(new Uint8Array(nahled), { status: 200 }));
      }
      return Promise.resolve(new Response("full", { status: 500 }));
    });
    const res = zachytOdpoved();
    await posliObrazekZKlice(
      jakoExpress(res),
      nastaveni(),
      `vypravy/sumava-modrava/${UUID}.webp`,
      true,
    );
    expect(url).toHaveLength(1);
    expect(url[0]).toContain(`${UUID}.nahled.webp`);
    expect(res.telo?.equals(nahled)).toBe(true);
    expect(res.hlavicky.get("Content-Type")).toBe("image/webp");
    expect(res.hlavicky.get("Cache-Control")).toBe("private, max-age=2592000");
  });

  it("chybějící náhled překóduje plný objekt a nic neukládá zpět", async () => {
    const jpeg = await sharp({
      create: { width: 1200, height: 800, channels: 3, background: "#224466" },
    })
      .jpeg()
      .toBuffer();
    const metody: string[] = [];
    vi.stubGlobal("fetch", (vstup: RequestInfo | URL, init?: RequestInit) => {
      metody.push(init?.method ?? "GET");
      if (String(vstup).includes(".nahled.webp")) {
        return Promise.resolve(new Response("missing", { status: 404 }));
      }
      return Promise.resolve(new Response(new Uint8Array(jpeg), { status: 200 }));
    });
    const res = zachytOdpoved();
    await posliObrazekZKlice(
      jakoExpress(res),
      nastaveni(),
      `vypravy/sumava-modrava/${UUID}.jpg`,
      true,
    );
    expect(metody).toEqual(["GET", "GET"]);
    expect(res.hlavicky.get("Content-Type")).toBe("image/webp");
    expect(res.hlavicky.get("Cache-Control")).toBe("private, max-age=2592000");
    expect(res.telo?.equals(jpeg)).toBe(false);
    const meta = await sharp(res.telo).metadata();
    expect(meta.format).toBe("webp");
    expect(Math.max(meta.width ?? 0, meta.height ?? 0)).toBeLessThanOrEqual(960);
  });

  it("bez nahled=1 vrátí uložené bajty beze změny", async () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x11]);
    const url: string[] = [];
    vi.stubGlobal("fetch", (vstup: RequestInfo | URL, init?: RequestInit) => {
      url.push(String(vstup));
      expect(init?.method ?? "GET").toBe("GET");
      return Promise.resolve(new Response(new Uint8Array(jpeg), { status: 200 }));
    });
    const res = zachytOdpoved();
    await posliObrazekZKlice(
      jakoExpress(res),
      nastaveni(),
      `alba/${UUID}/${UUID}.jpg`,
      false,
    );
    expect(url).toHaveLength(1);
    expect(url[0]).not.toContain(".nahled.webp");
    expect(res.telo?.equals(jpeg)).toBe(true);
    expect(res.hlavicky.get("Content-Type")).toBe("image/jpeg");
    expect(res.hlavicky.get("Cache-Control")).toBe("private, max-age=2592000");
  });

  it("gif bez sourozence zůstane gif a neukládá se zpět", async () => {
    const gif = Buffer.from("GIF89a");
    const metody: string[] = [];
    vi.stubGlobal("fetch", (vstup: RequestInfo | URL, init?: RequestInit) => {
      metody.push(init?.method ?? "GET");
      if (String(vstup).includes(".nahled.webp")) {
        return Promise.resolve(new Response("missing", { status: 404 }));
      }
      return Promise.resolve(new Response(new Uint8Array(gif), { status: 200 }));
    });
    const res = zachytOdpoved();
    await posliUlozenouPrilohu(
      jakoExpress(res),
      nastaveni(),
      {
        id: UUID,
        nazev: "anim.gif",
        klic: `chat-prilohy/${UUID}.gif`,
        contentType: "image/gif",
      },
      true,
    );
    expect(metody).toEqual(["GET", "GET"]);
    expect(res.telo?.equals(gif)).toBe(true);
    expect(res.hlavicky.get("Content-Type")).toBe("image/gif");
    expect(res.hlavicky.get("Cache-Control")).toBe("private, max-age=2592000");
  });
});
