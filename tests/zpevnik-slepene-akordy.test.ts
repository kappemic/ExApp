import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { textZeSouradnic } from "../server/src/zpevnik-rozlozeni";
import { TeloPisnePohled } from "../src/components/zpevnik/TeloPisnePohled";
import {
  opravRozpadleAkordy,
  parsujVlozeni,
  posunTelo,
  textZTela,
  type Radek,
  type TeloPisne,
} from "../src/shared/zpevnik";

function akordy(radek: Radek | undefined): string[] {
  return (radek?.slabiky ?? []).flatMap((slabika) => (slabika.akord === undefined ? [] : [slabika.akord]));
}

function prvniRadek(text: string): Radek | undefined {
  const vlozeni = parsujVlozeni(text);
  if (!vlozeni.ok) throw new Error("nečekaně prázdné");
  return vlozeni.telo.bloky[0]?.radky[0];
}

const ULOZENA: TeloPisne = {
  bloky: [
    {
      typ: "sloka",
      radky: [{ slabiky: [{ text: "  F  AmGAmG" }] }, { slabiky: [{ text: "a zpět" }] }],
    },
  ],
};

describe("slepené akordy z PDF", () => {
  it("import nechá mezi akordy nad krátkým slovem mezeru", () => {
    const polozka = (str: string, x: number, y: number) => ({ str, x, y, width: str.length * 10, fontSize: 12 });
    const text = textZeSouradnic([
      polozka("a zpět", 0, 100),
      polozka("F", 20, 116),
      polozka("Am", 50, 116),
      polozka("G", 70, 116),
      polozka("Am", 80, 116),
      polozka("G", 100, 116),
    ]);
    expect(akordy(prvniRadek(text))).toEqual(["F", "Am", "G", "Am", "G"]);
  });

  it("parser rozloží slepený řádek a text nechá pod ním", () => {
    const radek = prvniRadek("  F  AmGAmG\na zpět");
    expect(akordy(radek)).toEqual(["F", "Am", "G", "Am", "G"]);
    expect(radek?.slabiky.map((slabika) => slabika.text).join("")).toBe("a zpět");
  });

  it("text písně zůstane textem", () => {
    for (const lyric of ["AHA", "ACH", "A-A-A", "Ada a Ema", "Hej"]) {
      expect(akordy(prvniRadek(lyric))).toEqual([]);
    }
  });

  it("odsazené holé akordy se rozloží", () => {
    expect(akordy(prvniRadek("  FG\nslovo"))).toEqual(["F", "G"]);
  });

  it("uložená píseň se opraví, transponuje a originál se nemění", () => {
    const puvodni = JSON.stringify(ULOZENA);
    const opravena = opravRozpadleAkordy(ULOZENA);
    expect(opravena.bloky[0]?.radky).toHaveLength(1);
    expect(akordy(posunTelo(opravena, 2).bloky[0]?.radky[0])).toEqual(["G", "Hm", "A", "Hm", "A"]);
    expect(JSON.stringify(ULOZENA)).toBe(puvodni);
  });

  it("úprava v editoru slepený řádek po uložení spraví", () => {
    expect(akordy(prvniRadek(textZTela(ULOZENA)))).toEqual(["F", "Am", "G", "Am", "G"]);
  });

  it("akordy za koncem textu se vykreslí každý zvlášť a nepřekryjí se", () => {
    const html = renderToStaticMarkup(createElement(TeloPisnePohled, { telo: opravRozpadleAkordy(ULOZENA) }));
    const vykreslene = [...html.matchAll(/text-okr[^>]*>([^<]*)</g)].map((m) => (m[1] ?? "").trim()).filter((a) => a.length > 0);
    expect(vykreslene).toEqual(["F", "Am", "G", "Am", "G"]);
    expect(html).not.toContain("AmGAmG");
  });
});

describe("slovo a akord na jednom řádku", () => {
  function opravene(...radky: Radek[]): Radek[] {
    return opravRozpadleAkordy({ bloky: [{ typ: "sloka", radky }] }).bloky[0]?.radky ?? [];
  }
  const text = (radek: Radek | undefined): string =>
    (radek?.slabiky ?? []).map((slabika) => slabika.text).join("");
  const radek = (hodnota: string): Radek => ({ slabiky: [{ text: hodnota }] });

  it("slovo zůstane a akord se posadí na stejný sloupec dalšího řádku", () => {
    const [slovo, verse] = opravene(radek("musil   G#m"), radek("A tak říkám, že tady mám"));
    expect(text(slovo)).toBe("musil");
    expect(akordy(slovo)).toEqual([]);
    expect(akordy(verse)).toEqual(["G#m"]);
    const naSloupci = verse?.slabiky.slice(0, 8).map((slabika) => slabika.text).join("");
    expect(naSloupci).toBe("A tak ří");
    expect(verse?.slabiky[8]?.akord).toBe("G#m");
  });

  it("víc akordů i existující akord na dalším řádku se zachová", () => {
    const dalsi: Radek = { slabiky: [{ text: "n", akord: "C" }, { text: "ěco dlouhého tady" }] };
    const [, verse] = opravene(radek("slovo  G  Am"), dalsi);
    expect(akordy(verse)).toEqual(["C", "G", "Am"]);
  });

  it("bez dalšího řádku akord nezmizí", () => {
    const vysledek = opravene(radek("konec   G"));
    expect(text(vysledek[0])).toBe("konec");
    expect(akordy(vysledek[1])).toEqual(["G"]);
  });

  it("holé slepené akordy vedle dalšího akordu se rozloží", () => {
    expect(akordy(prvniRadek("E DG\nslovo"))).toEqual(["E", "D", "G"]);
    expect(akordy(opravene(radek("H       E DGA"), radek("dlouhý verš písně tady"))[0])).toEqual([
      "H",
      "E",
      "D",
      "G",
      "A",
    ]);
  });

  it("akord před textem se posadí nad začátek textu", () => {
    const [verse] = opravene(radek("D       řekni, kdo by se vracel"));
    expect(text(verse)).toBe("řekni, kdo by se vracel");
    expect(verse?.slabiky[0]).toEqual({ text: "ř", akord: "D" });
  });

  it("verš začínající velkým písmenem s jednou mezerou se nezmění", () => {
    const vstup = [radek("A tak říkám, že tady mám")];
    expect(opravene(...vstup)).toEqual(vstup);
  });

  it("obyčejný text s dvojitou mezerou se nezmění", () => {
    const vstup = [radek("Ty si pěkný dezolát,  řekla halí belí"), radek("Další verš")];
    expect(opravene(...vstup)).toEqual(vstup);
  });
});
