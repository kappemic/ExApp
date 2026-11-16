import { describe, expect, it } from "vitest";
import {
  rozdelAlbaSidebar,
  rozdelViditelne,
  type AlbumDoSbaleni,
} from "../src/lib/sbaleny-seznam";

function album(id: string, druh: AlbumDoSbaleni["druh"]): AlbumDoSbaleni {
  return { id, druh };
}

describe("rozdelViditelne", () => {
  it("nechá krátký seznam celý", () => {
    expect(rozdelViditelne(["a", "b", "c"])).toEqual({
      viditelne: ["a", "b", "c"],
      skryte: [],
    });
    expect(rozdelViditelne([])).toEqual({ viditelne: [], skryte: [] });
  });

  it("schová položky za třetí", () => {
    expect(rozdelViditelne(["a", "b", "c", "d"])).toEqual({
      viditelne: ["a", "b", "c"],
      skryte: ["d"],
    });
  });
});

describe("rozdelAlbaSidebar", () => {
  const alba: AlbumDoSbaleni[] = [
    album("v1", "vyprava"),
    album("v2", "vyprava"),
    album("v3", "vyprava"),
    album("v4", "vyprava"),
    album("a1", "vlastni"),
    album("a2", "vlastni"),
    album("kos", "kos"),
  ];

  it("koš a vlastní alba nikdy neschová", () => {
    const vysledek = rozdelAlbaSidebar(alba, undefined);
    expect(vysledek.vlastni.map((polozka) => polozka.id)).toEqual(["a1", "a2"]);
    expect(vysledek.kos.map((polozka) => polozka.id)).toEqual(["kos"]);
    expect(vysledek.vypravySkryte.map((polozka) => polozka.id)).toEqual(["v4"]);
    expect(
      [...vysledek.vypravySkryte, ...vysledek.vypravyViditelne].some(
        (polozka) => polozka.druh !== "vyprava",
      ),
    ).toBe(false);
  });

  it("připne otevřenou výpravu mimo první tři", () => {
    const vysledek = rozdelAlbaSidebar(alba, "v4");
    expect(vysledek.vypravyViditelne.map((polozka) => polozka.id)).toEqual([
      "v1",
      "v2",
      "v3",
      "v4",
    ]);
    expect(vysledek.vypravySkryte).toEqual([]);
    expect(vysledek.vlastni).toHaveLength(2);
    expect(vysledek.kos).toHaveLength(1);
  });

  it("při třech výpravách nic neschová", () => {
    const kratke = alba.filter((polozka) => polozka.id !== "v4");
    const vysledek = rozdelAlbaSidebar(kratke, undefined);
    expect(vysledek.vypravySkryte).toEqual([]);
    expect(vysledek.vypravyViditelne).toHaveLength(3);
  });
});
