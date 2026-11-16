import { describe, expect, it } from "vitest";
import { maAkordy, posunAkord, posunTelo, textZTela, type TeloPisne } from "../src/shared/zpevnik";
import { ctiPosun, zapisPosun } from "../src/lib/zpevnik-transpozice";
import { ctiKnihu, KLIC_KNIHY, smazKnihu, ulozKnihu } from "../src/lib/zpevnik-offline";

describe("posun akordu", () => {
  it("jde po půltónech v české řadě", () => {
    expect(posunAkord("A", 1)).toBe("B");
    expect(posunAkord("B", 1)).toBe("H");
    expect(posunAkord("H", 1)).toBe("C");
    expect(posunAkord("Hm", 1)).toBe("Cm");
    expect(posunAkord("Am", -1)).toBe("G#m");
  });

  it("posune tělo a píseň bez akordu nechá být", () => {
    const telo: TeloPisne = {
      bloky: [{ typ: "sloka", radky: [{ slabiky: [{ text: "A", akord: "H" }] }] }],
    };
    expect(posunTelo(telo, 1).bloky[0]?.radky[0]?.slabiky[0]?.akord).toBe("C");
    expect(maAkordy({ bloky: [{ typ: "sloka", radky: [{ slabiky: [{ text: "jen" }] }] }] })).toBe(false);
  });
});

describe("posun v telefonu", () => {
  it("pamatuje offset podle id a jinou píseň nechá na nule", () => {
    const pamet = new Map<string, string>();
    const uloziste = {
      getItem: (klic: string) => pamet.get(klic) ?? null,
      setItem: (klic: string, hodnota: string) => {
        pamet.set(klic, hodnota);
      },
    };
    zapisPosun(uloziste, "pisen-1", 2);
    expect(ctiPosun(uloziste, "pisen-1")).toBe(2);
    expect(ctiPosun(uloziste, "pisen-2")).toBe(0);
  });
});

describe("offline kniha", () => {
  it("uloží vydané písně a návrh do klíče knihy nedává", () => {
    const pamet = new Map<string, string>();
    const uloziste = {
      getItem: (klic: string) => pamet.get(klic) ?? null,
      setItem: (klic: string, hodnota: string) => {
        pamet.set(klic, hodnota);
      },
      removeItem: (klic: string) => {
        pamet.delete(klic);
      },
    };
    ulozKnihu(uloziste, [
      {
        id: "a",
        nazev: "Had",
        autor: "Lidová",
        telo: { bloky: [] },
        schvalenoAt: null,
      },
    ]);
    expect(pamet.has(KLIC_KNIHY)).toBe(true);
    expect(pamet.has("exapp:zpevnik:transpozice:a")).toBe(false);
    expect(ctiKnihu(uloziste)?.[0]?.nazev).toBe("Had");
    smazKnihu(uloziste);
    expect(ctiKnihu(uloziste)).toBeNull();
  });
});

describe("text z těla", () => {
  it("vrátí řádek akordů nad text", () => {
    const telo: TeloPisne = {
      bloky: [
        {
          typ: "sloka",
          radky: [{ slabiky: [{ text: "A", akord: "H" }, { text: "hoj" }] }],
        },
      ],
    };
    expect(textZTela(telo)).toBe("H\nAhoj");
  });
});
