/**
 * Zpěvník step 1: pure chord normalization, paste seating, pair keys, sort.
 * No API, database, or UI.
 */
import { describe, expect, it } from "vitest";
import {
  jeStejnyPar,
  klicParu,
  maAkordy,
  normalizujAkord,
  parsujVlozeni,
  prvniAkord,
  seradPisne,
  textZTela,
  type TeloPisne,
} from "../src/shared/zpevnik";

describe("normalizujAkord", () => {
  it("nechá B a Bb tak, jak jsou napsané", () => {
    expect(normalizujAkord("B")).toBe("B");
    expect(normalizujAkord("Bm")).toBe("Bm");
    expect(normalizujAkord("B7")).toBe("B7");
    expect(normalizujAkord("Bmaj7")).toBe("Bmaj7");
    expect(normalizujAkord("B#")).toBe("B#");
    expect(normalizujAkord("B/D")).toBe("B/D");
    expect(normalizujAkord("C/B")).toBe("C/B");
    expect(normalizujAkord("Bb")).toBe("Bb");
    expect(normalizujAkord("Bbm")).toBe("Bbm");
    expect(normalizujAkord("Bb7")).toBe("Bb7");
    expect(normalizujAkord("Bbmaj7")).toBe("Bbmaj7");
    expect(normalizujAkord("Bb/F#")).toBe("Bb/F#");
    expect(normalizujAkord("Am/C")).toBe("Am/C");
  });

  it("nechá české H beze změny", () => {
    expect(normalizujAkord("H")).toBe("H");
    expect(normalizujAkord("Hm")).toBe("Hm");
    expect(normalizujAkord("H7")).toBe("H7");
  });

  it("sjednotí mollové synonymy min, mi a pomlčku na m", () => {
    expect(normalizujAkord("Amin")).toBe("Am");
    expect(normalizujAkord("Ami")).toBe("Am");
    expect(normalizujAkord("A-")).toBe("Am");
    expect(normalizujAkord("Emin7")).toBe("Em7");
    expect(normalizujAkord("D-")).toBe("Dm");
  });

  it("nechá běžné akordy projít, včetně křížku a sus", () => {
    expect(normalizujAkord("C")).toBe("C");
    expect(normalizujAkord("Am")).toBe("Am");
    expect(normalizujAkord("D7")).toBe("D7");
    expect(normalizujAkord("F#m")).toBe("F#m");
    expect(normalizujAkord("Csus4")).toBe("Csus4");
    expect(normalizujAkord("Eb")).toBe("Eb");
    expect(normalizujAkord("Abm")).toBe("Abm");
  });

  it("vrátí null pro token, který není akord, a nesežere pomlčku ve slově", () => {
    expect(normalizujAkord("Ahoj")).toBeNull();
    expect(normalizujAkord("kamarádi")).toBeNull();
    expect(normalizujAkord("Hello")).toBeNull();
    expect(normalizujAkord("A-dur")).toBeNull();
    expect(normalizujAkord("rock-n-roll")).toBeNull();
    expect(normalizujAkord("pre-chorus")).toBeNull();
    expect(normalizujAkord("C-D")).toBeNull();
    expect(normalizujAkord("min")).toBeNull();
    expect(normalizujAkord("")).toBeNull();
    expect(normalizujAkord("   ")).toBeNull();
    expect(normalizujAkord("H7!")).toBeNull();
  });
});

/** Typ bloku a texty jeho řádků. */
function tvar(vysledek: ReturnType<typeof parsujVlozeni>): string[][] {
  if (!vysledek.ok) return [];
  return vysledek.telo.bloky.map((blok) => [
    blok.typ,
    ...blok.radky.map((radek) => radek.slabiky.map((slabika) => slabika.text).join("")),
  ]);
}

describe("parsujVlozeni", () => {
  it("posadí akord na grafém ve sloupci začátku tokenu a nechá B být", () => {
    const lyric = "Ahoj kamarádi";
    const sloupecK = lyric.indexOf("k");
    const akordovyRadek = `${"H".padEnd(sloupecK, " ")}B`;
    const vysledek = parsujVlozeni(`${akordovyRadek}\n${lyric}`);

    expect(vysledek).toEqual({
      ok: true,
      telo: {
        bloky: [
          {
            typ: "sloka",
            radky: [
              {
                slabiky: [
                  { text: "A", akord: "H" },
                  { text: "h" },
                  { text: "o" },
                  { text: "j" },
                  { text: " " },
                  { text: "k", akord: "B" },
                  { text: "a" },
                  { text: "m" },
                  { text: "a" },
                  { text: "r" },
                  { text: "á" },
                  { text: "d" },
                  { text: "i" },
                ],
              },
            ],
          },
        ],
      },
    });
  });

  it("mapuje sloupec v kódových jednotkách na grafémový cluster", () => {
    const lyric = "e\u0301X";
    const naZacatkuANaDalsim = parsujVlozeni(`C D\n${lyric}`);
    const doprostredClusteru = parsujVlozeni(` D\n${lyric}`);

    expect(naZacatkuANaDalsim).toEqual({
      ok: true,
      telo: {
        bloky: [
          {
            typ: "sloka",
            radky: [
              {
                slabiky: [
                  { text: "e\u0301", akord: "C" },
                  { text: "X", akord: "D" },
                ],
              },
            ],
          },
        ],
      },
    });
    expect(doprostredClusteru).toEqual({
      ok: true,
      telo: {
        bloky: [
          {
            typ: "sloka",
            radky: [
              {
                slabiky: [
                  { text: "e\u0301", akord: "D" },
                  { text: "X" },
                ],
              },
            ],
          },
        ],
      },
    });
  });

  it("udělá z textu bez řádku akordů jednu slabiku s celým řádkem", () => {
    expect(parsujVlozeni("Ahoj kamarádi")).toEqual({
      ok: true,
      telo: {
        bloky: [
          {
            typ: "sloka",
            radky: [{ slabiky: [{ text: "Ahoj kamarádi" }] }],
          },
        ],
      },
    });
    expect(parsujVlozeni("Hello")).toEqual({
      ok: true,
      telo: {
        bloky: [
          {
            typ: "sloka",
            radky: [{ slabiky: [{ text: "Hello" }] }],
          },
        ],
      },
    });
    expect(parsujVlozeni("H Ahoj")).toEqual({
      ok: true,
      telo: {
        bloky: [
          {
            typ: "sloka",
            radky: [{ slabiky: [{ text: "H Ahoj" }] }],
          },
        ],
      },
    });
  });

  it("složí víc dvojic bez prázdného řádku do jednoho bloku", () => {
    const vysledek = parsujVlozeni("H\nAhoj\nC\nDruhý řádek");
    expect(tvar(vysledek)).toEqual([["sloka", "Ahoj", "Druhý řádek"]]);
  });

  it("prázdný řádek oddělí sloku a R: otevře refrén", () => {
    const text = "H\nAhoj\nDruhý\n\nR: G   D\nRefrén první\ndalší\n\nSloka\ntext\n\nR:";
    expect(tvar(parsujVlozeni(text))).toEqual([
      ["sloka", "Ahoj", "Druhý"],
      ["refren", "Refrén první", "další"],
      ["sloka", "Sloka", "text"],
      ["refren"],
    ]);
  });

  it("značku před textem odřízne a akord posune na jeho slabiku", () => {
    const vysledek = parsujVlozeni("   C  D\nR: Ahoj\nverš\n2. druhá");
    expect(tvar(vysledek)).toEqual([["refren", "Ahoj", "verš"], ["sloka", "2. druhá"]]);
    expect(vysledek.ok && vysledek.telo.bloky[0]?.radky[0]?.slabiky).toEqual([
      { text: "A", akord: "C" },
      { text: "h" },
      { text: "o" },
      { text: "j", akord: "D" },
    ]);
  });

  it("text prokládaný prázdnými řádky zůstane jednou slokou", () => {
    expect(tvar(parsujVlozeni("a a\n\nb b\n\nc c\n\nd d"))).toEqual([["sloka", "a a", "b b", "c c", "d d"]]);
  });

  it("sloky, refrén, předehra i opakování přežijí úpravu ve formuláři", () => {
    const vysledek = parsujVlozeni("G  D\n\nC\nAhoj\nA  H\nC\nVerš\n\nR:\nG\nRefrén tu\ndál\n\nKonec\npísně\n\nR:");
    expect(vysledek.ok).toBe(true);
    if (!vysledek.ok) return;
    expect(parsujVlozeni(textZTela(vysledek.telo))).toEqual(vysledek);
  });

  it("akord za koncem textu přidá jako slabiku s prázdným textem", () => {
    const lyric = "AB";
    const akordovyRadek = `${"C".padEnd(4, " ")}D`;
    expect(parsujVlozeni(`${akordovyRadek}\n${lyric}`)).toEqual({
      ok: true,
      telo: {
        bloky: [
          {
            typ: "sloka",
            radky: [
              {
                slabiky: [
                  { text: "A", akord: "C" },
                  { text: "B" },
                  { text: "", akord: "D" },
                ],
              },
            ],
          },
        ],
      },
    });
  });

  it("selže typovaně na prázdném nebo bílém vstupu a nevyhodí výjimku", () => {
    expect(() => parsujVlozeni("")).not.toThrow();
    expect(parsujVlozeni("")).toEqual({ ok: false, duvod: "chybi_text" });
    expect(parsujVlozeni("   ")).toEqual({ ok: false, duvod: "chybi_text" });
    expect(parsujVlozeni(" \n\t\n ")).toEqual({ ok: false, duvod: "chybi_text" });
  });
});

describe("klicParu a jeStejnyPar", () => {
  it("sjednotí název a autora bez diakritiky, mezer a velikosti písmen", () => {
    expect(klicParu("Píseň", "Dvořák")).toBe(klicParu("pisen", "dvorak"));
    expect(klicParu("  Píseň  ", "  Dvořák  ")).toBe("pisen\u001fdvorak");
    expect(klicParu("Píseň", "Dvořák")).not.toBe(klicParu("Píseň", "Novák"));
  });

  it("porovná pár podle stejného klíče", () => {
    expect(jeStejnyPar("Píseň", "Dvořák", "pisen", "dvorak")).toBe(true);
    expect(jeStejnyPar("Píseň", "Dvořák", "Jiná", "dvorak")).toBe(false);
    expect(jeStejnyPar("Píseň", "Dvořák", "pisen", "Novák")).toBe(false);
  });
});

describe("seradPisne", () => {
  it("řadí česky tak, že ch je mezi h a i", () => {
    const serazene = seradPisne([
      { nazev: "Idea", autor: "A" },
      { nazev: "Had", autor: "A" },
      { nazev: "Chata", autor: "A" },
    ]);

    expect(serazene.map((pisen) => pisen.nazev)).toEqual(["Had", "Chata", "Idea"]);
  });

  it("při stejném názvu řadí autora stejným českým řazením a vstup nemění", () => {
    const vstup = [
      { nazev: "Had", autor: "Ivan" },
      { nazev: "Had", autor: "Chata" },
      { nazev: "Had", autor: "Honza" },
    ];
    const puvodni = vstup.map((pisen) => pisen.autor);

    expect(seradPisne(vstup).map((pisen) => pisen.autor)).toEqual([
      "Honza",
      "Chata",
      "Ivan",
    ]);
    expect(vstup.map((pisen) => pisen.autor)).toEqual(puvodni);
  });
});

describe("prvniAkord a maAkordy", () => {
  it("vrátí první akord v pořadí bloků, řádků a slabik", () => {
    const telo: TeloPisne = {
      bloky: [
        {
          typ: "sloka",
          radky: [{ slabiky: [{ text: "bez" }] }],
        },
        {
          typ: "refren",
          radky: [
            { slabiky: [{ text: "pořád nic" }] },
            {
              slabiky: [
                { text: "C", akord: "D7" },
                { text: "x", akord: "Am" },
              ],
            },
          ],
        },
      ],
    };

    expect(prvniAkord(telo)).toBe("D7");
    expect(maAkordy(telo)).toBe(true);
  });

  it("vrátí null a false, když v těle žádný akord není", () => {
    const telo: TeloPisne = {
      bloky: [{ typ: "sloka", radky: [{ slabiky: [{ text: "jen text" }] }] }],
    };

    expect(prvniAkord({ bloky: [] })).toBeNull();
    expect(maAkordy({ bloky: [] })).toBe(false);
    expect(prvniAkord(telo)).toBeNull();
    expect(maAkordy(telo)).toBe(false);
  });
});
