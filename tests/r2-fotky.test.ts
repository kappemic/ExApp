/**
 * tests/r2-fotky.test.ts — file upload to Cloudflare R2.
 * Pure helpers only: no network, no secrets.
 */
import { describe, expect, it } from "vitest";
import {
  ctiR2Nastaveni,
  klicFotky,
  contentTypeZKlice,
  klicZVerejneUrl,
  rozpoznajObrazek,
  rozdelMultipart,
  verejnaUrlFotky,
} from "../server/src/r2-fotky";

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

  it("složí veřejnou URL a pozná náš objekt", () => {
    const klic = `vypravy/sumava-modrava/${UUID}.png`;
    const url = verejnaUrlFotky("https://pub-example.r2.dev/", klic);
    expect(url).toBe(`https://pub-example.r2.dev/${klic}`);
    expect(klicZVerejneUrl(url, "https://pub-example.r2.dev")).toBe(klic);
  });

  it("cizí odkaz nemaže z R2", () => {
    expect(klicZVerejneUrl("https://example.cz/foto.jpg", "https://pub-example.r2.dev")).toBeNull();
  });

  it("typ souboru bere z přípony klíče", () => {
    const klic = `vypravy/sumava-modrava/${UUID}.webp`;
    expect(contentTypeZKlice(klic)).toBe("image/webp");
    expect(contentTypeZKlice(klic.replace(".webp", ".png"))).toBe("image/png");
    expect(contentTypeZKlice(klic.replace(".webp", ".jpg"))).toBe("image/jpeg");
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
