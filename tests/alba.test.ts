/**
 * tests/alba.test.ts — album name, kind split, list order, extra-album object keys.
 * Pure helpers only: no database, no network, no secrets.
 */
import { describe, expect, it } from "vitest";
import {
  rozhodniSmazaniAlba,
  sestavSeznamAlb,
  seznamPoSmazaniAlba,
  urciDruhAlba,
  validujNazevAlba,
  type AlbumFotkaZdroj,
} from "../server/src/alba";
import { klicAlbaFotky, klicZVerejneUrl, rozdelMultipartSoubory } from "../server/src/r2-fotky";

const UUID = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-8222-222222222222";

describe("validujNazevAlba", () => {
  it("ořízne mezery a přijme název v rozsahu 2–80 znaků", () => {
    const vysledek = validujNazevAlba({ nazev: "  Letní tábor  " });
    expect(vysledek.ok).toBe(true);
    if (vysledek.ok) expect(vysledek.nazev).toBe("Letní tábor");
  });

  it("přijme přesně 2 a přesně 80 znaků", () => {
    const kratky = validujNazevAlba({ nazev: "AB" });
    const dlouhy = validujNazevAlba({ nazev: "á".repeat(80) });
    expect(kratky.ok).toBe(true);
    expect(dlouhy.ok).toBe(true);
  });

  it("odmítne název kratší než 2 znaky", () => {
    const vysledek = validujNazevAlba({ nazev: " A " });
    expect(vysledek.ok).toBe(false);
    if (!vysledek.ok) expect(vysledek.zprava).toBe("Název alba musí mít aspoň 2 znaky.");
  });

  it("odmítne název delší než 80 znaků", () => {
    const vysledek = validujNazevAlba({ nazev: "x".repeat(81) });
    expect(vysledek.ok).toBe(false);
    if (!vysledek.ok) expect(vysledek.zprava).toBe("Název alba může mít nejvýš 80 znaků.");
  });

  it("odmítne chybějící nebo ne-textový název", () => {
    const chybi = validujNazevAlba({});
    const cislo = validujNazevAlba({ nazev: 12 });
    const telo = validujNazevAlba(null);
    expect(chybi.ok).toBe(false);
    expect(cislo.ok).toBe(false);
    expect(telo.ok).toBe(false);
    if (!chybi.ok) expect(chybi.zprava).toBe("Zadej název alba.");
    if (!cislo.ok) expect(cislo.zprava).toBe("Zadej název alba.");
    if (!telo.ok) expect(telo.zprava).toBe("Zadej název alba.");
  });
});

describe("urciDruhAlba", () => {
  it("id výpravy je druh vyprava, i když stejné id leží i mezi vlastními", () => {
    expect(urciDruhAlba("sumava", ["sumava"], ["sumava", UUID])).toBe("vyprava");
  });

  it("id jen z tabulky alba je druh vlastni", () => {
    expect(urciDruhAlba(UUID, ["sumava"], [UUID])).toBe("vlastni");
  });

  it("neznámé id nepatří do žádného alba", () => {
    expect(urciDruhAlba("nikde", ["sumava"], [UUID])).toBeNull();
  });
});

describe("sestavSeznamAlb", () => {
  const fotka = (
    id: string,
    parentId: string,
    createdAt: string,
    jeNahled = false,
  ): AlbumFotkaZdroj => ({
    id,
    parentId,
    jeNahled,
    createdAt: new Date(createdAt),
  });

  it("dává nejdřív výpravy podle data a názvu, potom vlastní alba podle vzniku", () => {
    const alba = sestavSeznamAlb(
      [
        { id: "brdy", nazev: "Brdy", datum: "2024-05-01", stav: "proběhlá" },
        { id: "alpy", nazev: "Alpy", datum: "2024-06-01", stav: "proběhlá" },
        { id: "beskydy", nazev: "Beskydy", datum: "2024-06-01", stav: "proběhlá" },
      ],
      [
        { id: UUID_B, nazev: "Druhé", createdAt: new Date("2025-02-01T00:00:00.000Z") },
        { id: UUID, nazev: "První", createdAt: new Date("2025-01-01T00:00:00.000Z") },
      ],
      [],
      [],
    );
    expect(alba.map((album) => album.id)).toEqual(["brdy", "alpy", "beskydy", UUID, UUID_B]);
    expect(alba.map((album) => album.druh)).toEqual([
      "vyprava",
      "vyprava",
      "vyprava",
      "vlastni",
      "vlastni",
    ]);
    expect(alba[0]).toMatchObject({
      nazev: "Brdy",
      expeditionId: "brdy",
      pocetFotek: 0,
      nahledFotkaId: null,
    });
    expect(alba[3]).toMatchObject({
      nazev: "První",
      expeditionId: null,
      pocetFotek: 0,
      nahledFotkaId: null,
    });
  });

  it("u výpravy bere označený náhled, jinak nejstarší fotku", () => {
    const sNahledem = sestavSeznamAlb(
      [{ id: "sumava", nazev: "Šumava", datum: "2024-06-01", stav: "proběhlá" }],
      [],
      [
        fotka("stara", "sumava", "2024-06-01T10:00:00.000Z"),
        fotka("vlajka", "sumava", "2024-06-02T10:00:00.000Z", true),
      ],
      [],
    );
    expect(sNahledem[0]?.pocetFotek).toBe(2);
    expect(sNahledem[0]?.nahledFotkaId).toBe("vlajka");

    const bezVlajky = sestavSeznamAlb(
      [{ id: "sumava", nazev: "Šumava", datum: "2024-06-01", stav: "proběhlá" }],
      [],
      [
        fotka("nova", "sumava", "2024-06-03T10:00:00.000Z"),
        fotka("stara", "sumava", "2024-06-01T10:00:00.000Z"),
      ],
      [],
    );
    expect(bezVlajky[0]?.nahledFotkaId).toBe("stara");
  });

  it("vynechá výpravy, které ještě neproběhly, a nechá proběhlou i vlastní album", () => {
    const alba = sestavSeznamAlb(
      [
        { id: "plan", nazev: "Plánovaná", datum: "2024-04-01", stav: "volno" },
        { id: "skoro", nazev: "Skoro plná", datum: "2024-04-02", stav: "skoro plno" },
        { id: "hotovo", nazev: "Už proběhla", datum: "2024-04-03", stav: "proběhlá" },
      ],
      [{ id: UUID, nazev: "Tábor", createdAt: new Date("2025-01-01T00:00:00.000Z") }],
      [fotka("skryta", "plan", "2024-04-01T10:00:00.000Z", true)],
      [fotka("moje", UUID, "2025-01-02T00:00:00.000Z")],
    );
    expect(alba.map((album) => album.id)).toEqual(["hotovo", UUID]);
    expect(alba.map((album) => album.druh)).toEqual(["vyprava", "vlastni"]);
    expect(alba[0]).toMatchObject({
      nazev: "Už proběhla",
      expeditionId: "hotovo",
      pocetFotek: 0,
    });
    expect(alba[1]).toMatchObject({ nazev: "Tábor", expeditionId: null, pocetFotek: 1 });
  });

  it("u vlastního alba počítá jen jeho fotky", () => {
    const alba = sestavSeznamAlb(
      [],
      [{ id: UUID, nazev: "Tábor", createdAt: new Date("2025-01-01T00:00:00.000Z") }],
      [fotka("cizi", "sumava", "2024-06-01T10:00:00.000Z", true)],
      [fotka("moje", UUID, "2025-01-02T00:00:00.000Z")],
    );
    expect(alba).toEqual([
      {
        id: UUID,
        nazev: "Tábor",
        druh: "vlastni",
        expeditionId: null,
        pocetFotek: 1,
        nahledFotkaId: "moje",
      },
    ]);
  });
});

describe("rozhodniSmazaniAlba", () => {
  it("vlastní album jde smazat", () => {
    expect(rozhodniSmazaniAlba(UUID, ["sumava"], [UUID])).toBe("smazat");
  });

  it("id výpravy nesmaže, ani když stejné id leží mezi vlastními", () => {
    expect(rozhodniSmazaniAlba("sumava", ["sumava"], ["sumava", UUID])).toBe("nenalezeno");
  });

  it("neznámé nebo prázdné id je nenalezeno", () => {
    expect(rozhodniSmazaniAlba("nikde", ["sumava"], [UUID])).toBe("nenalezeno");
    expect(rozhodniSmazaniAlba("  ", [], [UUID])).toBe("nenalezeno");
  });
});

describe("seznamPoSmazaniAlba", () => {
  it("odebere smazané vlastní album a výpravu se stejným textem nechá", () => {
    const pred = sestavSeznamAlb(
      [{ id: UUID, nazev: "Šumava", datum: "2024-06-01", stav: "proběhlá" }],
      [
        { id: UUID, nazev: "Tábor", createdAt: new Date("2025-01-01T00:00:00.000Z") },
        { id: UUID_B, nazev: "Zůstane", createdAt: new Date("2025-02-01T00:00:00.000Z") },
      ],
      [],
      [],
    );
    const po = seznamPoSmazaniAlba(pred, UUID);
    expect(po.map((album) => `${album.druh}:${album.id}`)).toEqual([
      `vyprava:${UUID}`,
      `vlastni:${UUID_B}`,
    ]);
  });
});

describe("klíč vlastního alba", () => {
  it("skládá prefix alba a odmítne cizí cestu", () => {
    const klic = klicAlbaFotky(UUID, "jpg", UUID_B);
    expect(klic).toBe(`alba/${UUID}/${UUID_B}.jpg`);
    expect(klicAlbaFotky("../etc", "jpg", UUID_B)).toBeNull();
    const url = `https://pub-example.r2.dev/${klic}`;
    expect(klicZVerejneUrl(url, "https://pub-example.r2.dev")).toBe(klic);
  });
});

describe("rozdelMultipartSoubory", () => {
  it("vrátí opakované pole soubor", () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0x01]);
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const hranice = "----exapp";
    const cast = (data: Buffer): Buffer =>
      Buffer.concat([
        Buffer.from(
          `--${hranice}\r\nContent-Disposition: form-data; name="soubor"; filename="x.jpg"\r\n\r\n`,
          "utf8",
        ),
        data,
        Buffer.from("\r\n", "utf8"),
      ]);
    const telo = Buffer.concat([cast(jpeg), cast(png), Buffer.from(`--${hranice}--\r\n`, "utf8")]);
    const vysledek = rozdelMultipartSoubory(telo, `multipart/form-data; boundary=${hranice}`);
    expect(vysledek.ok).toBe(true);
    if (vysledek.ok) {
      expect(vysledek.fotky).toHaveLength(2);
      expect(vysledek.fotky[0]?.bajty.equals(jpeg)).toBe(true);
      expect(vysledek.fotky[1]?.bajty.equals(png)).toBe(true);
    }
  });
});
