import { describe, expect, it } from "vitest";
import { navrhZeStranky, parsujVlozeni } from "../src/shared/zpevnik";
import { spojHlavickySTextem } from "../server/src/zpevnik-import";
import { textZeSouradnic, type TextovaPolozka } from "../server/src/zpevnik-rozlozeni";

function polozka(
  str: string,
  x: number,
  y: number,
  sirkaZnaku = 10,
): TextovaPolozka {
  return { str, x, y, width: str.length * sirkaZnaku, fontSize: 12 };
}

describe("stránky PDF", () => {
  it("strana jen s názvem a autorem se spojí s textem na další straně", () => {
    const texty = spojHlavickySTextem(["Mlýny\nSpirituál Kvintet", "G\nslyším kámen", "Jiná\nAutor\nText"]);
    expect(texty).toEqual(["Mlýny\nSpirituál Kvintet\nG\nslyším kámen", "Jiná\nAutor\nText"]);
  });

  it("celá píseň ani poslední strana se nespojí", () => {
    expect(spojHlavickySTextem(["A\nB\nC", "D\nE\nF"])).toHaveLength(2);
    expect(spojHlavickySTextem(["A\nB\nC", "Jen název"])).toEqual(["A\nB\nC", "Jen název"]);
  });
});

describe("PDF souřadnice akordů", () => {
  it("posadí akord nad stejné písmeno jako na stránce", () => {
    const text = textZeSouradnic([
      polozka("Ahoj", 0, 100),
      polozka("kamarádi", 80, 100),
      polozka("H", 0, 116),
      polozka("Am", 80, 116),
    ]);
    const vlozeni = parsujVlozeni(text);
    expect(vlozeni.ok).toBe(true);
    if (!vlozeni.ok) return;
    const slabiky = vlozeni.telo.bloky[0]?.radky[0]?.slabiky ?? [];
    const naA = slabiky.find((slabika) => slabika.text === "A");
    const naK = slabiky.find((slabika) => slabika.text === "k");
    expect(naA?.akord).toBe("H");
    expect(naK?.akord).toBe("Am");
    const textRadku = slabiky.map((slabika) => slabika.text).join("");
    expect(textRadku).toBe("Ahoj    kamarádi");
  });

  it("pravý sloupec neodsadí a akord zůstane nad svým písmenem", () => {
    const text = textZeSouradnic([
      polozka("Ahoj", 0, 140),
      polozka("H", 0, 156),
      polozka("Slovo", 400, 140),
      polozka("Am", 400, 156),
      polozka("Dalsi", 0, 100),
      polozka("C", 0, 116),
      polozka("Radek", 400, 100),
      polozka("G", 400, 116),
    ]);
    const casti = text.split(/\n\n/);
    const pravy = casti[1] ?? "";
    expect(pravy.startsWith(" ")).toBe(false);
    const vlozeni = parsujVlozeni(pravy);
    expect(vlozeni.ok).toBe(true);
    if (!vlozeni.ok) return;
    expect(vlozeni.telo.bloky[0]?.radky[0]?.slabiky[0]).toEqual({ text: "S", akord: "Am" });
  });

  it("akord před veršem pravého sloupce patří levému", () => {
    const text = textZeSouradnic([
      polozka("Levy jedna", 0, 300),
      polozka("Vpravo prvni verš", 500, 300),
      polozka("Levy dva", 0, 260),
      polozka("Vpravo druhy verš", 500, 260),
      polozka("Levy tri", 0, 220),
      polozka("Vpravo treti verš", 500, 220),
      polozka("C", 410, 196),
      polozka("pro", 500, 196),
      polozka("jedno", 540, 196),
      polozka("kvítí", 600, 196),
      polozka("Levy ctyri dlouhy", 0, 180),
      polozka("Vpravo ctvrty verš", 500, 180),
    ]);
    const [levy, pravy] = text.split(/\n\n/);
    expect(pravy).not.toMatch(/^C /m);
    expect(pravy).toContain("pro jedno kvítí");
    expect(levy).toMatch(/^\s*C\s*$/m);
  });

  it("slovo A na začátku verše pravého sloupce není akord", () => {
    const text = textZeSouradnic([
      polozka("Levy jedna", 0, 300),
      polozka("Vpravo prvni", 500, 300),
      polozka("Levy dva", 0, 260),
      polozka("A", 500, 260),
      polozka("přijde něco dalšího", 515, 260),
      polozka("Levy tri", 0, 220),
      polozka("Vpravo treti", 500, 220),
      polozka("Levy ctyri", 0, 180),
      polozka("Vpravo ctvrty", 500, 180),
    ]);
    const [levy, pravy] = text.split(/\n\n/);
    expect(levy).not.toMatch(/\bA\b/);
    expect(pravy).toContain("A přijde něco dalšího");
  });

  it("akord pravého sloupce na výšce levého verše zůstane vpravo", () => {
    const text = textZeSouradnic([
      polozka("Spici sopky", 0, 300),
      polozka("A", 500, 300),
      polozka("Dlouhy levy vers az pres stred stranky", 0, 284, 15),
      polozka("Levy dva", 0, 260),
      polozka("Vpravo druhy", 500, 260),
      polozka("Levy tri", 0, 220),
      polozka("Vpravo treti", 500, 220),
      polozka("Levy ctyri", 0, 180),
      polozka("Vpravo ctvrty", 500, 180),
    ]);
    const [levy] = text.split(/\n\n/);
    expect(levy).toContain("Spici sopky");
    expect(levy).not.toMatch(/Spici sopky\s+A/);
  });

  it("mezihra bez textu se zachová a nepřilepí se k dalšímu verši", () => {
    const text = textZeSouradnic([
      polozka("Prvni", 0, 300),
      polozka("verš", 60, 300),
      polozka("D", 0, 270),
      polozka("A", 20, 270),
      polozka("D", 40, 270),
      polozka("C", 0, 236),
      polozka("Druhy", 0, 220),
      polozka("verš", 60, 220),
    ]);
    const vlozeni = parsujVlozeni(text);
    expect(vlozeni.ok).toBe(true);
    if (!vlozeni.ok) return;
    const radky = vlozeni.telo.bloky[0]?.radky ?? [];
    const akordy = radky.map((radek) => radek.slabiky.flatMap((s) => (s.akord === undefined ? [] : [s.akord])));
    expect(akordy).toEqual([[], ["D", "A", "D"], ["C"]]);
    expect(radky[1]?.slabiky.map((s) => s.text).join("")).toBe("");
    expect(navrhZeStranky(`Název\nAutor\n${text}`, []).problem).toBeNull();
  });

  it("závěrečný akord hned za koncem levého verše patří levému sloupci", () => {
    const text = textZeSouradnic([
      polozka("Levy", 0, 340),
      polozka("Vpravo", 500, 340),
      polozka("Levy", 0, 310),
      polozka("Vpravo", 500, 310),
      polozka("Levy", 0, 280),
      polozka("Vpravo", 500, 280),
      polozka("Am", 0, 250),
      polozka("E", 300, 250),
      polozka("Am", 500, 250),
      polozka("Levy", 0, 234),
      polozka("konec", 250, 234),
      polozka("Vpravo", 500, 234),
    ]);
    const [levy, pravy] = text.split(/\n\n/);
    expect(levy).toMatch(/Am\s+E/);
    expect(pravy).not.toContain("E");
  });

  it("odsazené akordy v pravém sloupci neposunou jeho hranici", () => {
    const text = textZeSouradnic([
      polozka("Levy jedna", 0, 300),
      polozka("Dm", 530, 316),
      polozka("Ti", 500, 300),
      polozka("muzi byli", 530, 300),
      polozka("Levy dva", 0, 260),
      polozka("Dm", 530, 276),
      polozka("A", 500, 260),
      polozka("proudy", 530, 260),
      polozka("Levy tri", 0, 220),
      polozka("F", 530, 236),
      polozka("Tu", 500, 220),
      polozka("jeden", 530, 220),
      polozka("Levy ctyri", 0, 180),
      polozka("Dm", 530, 196),
      polozka("Tak", 500, 180),
      polozka("dale", 540, 180),
    ]);
    const [levy, pravy] = text.split(/\n\n/);
    expect(levy).not.toContain("Ti");
    expect(levy).not.toContain("proudy");
    expect(pravy).toContain("Ti");
    expect(pravy).toContain("muzi byli");
  });

  it("konec dlouhého verše a jeho akord zůstanou v levém sloupci", () => {
    const text = textZeSouradnic([
      polozka("Prvni", 0, 300),
      polozka("Vpravo", 500, 300),
      polozka("Druhy", 0, 260),
      polozka("Tady", 500, 260),
      polozka("C#m", 0, 236),
      polozka("Cm", 392, 236),
      polozka("ususim", 500, 236),
      polozka("tenkrat jsem ještě neznal svět a spíš jsem sem", 0, 220, 8.5),
      polozka("musil", 392, 220),
      polozka("G#m", 500, 220),
      polozka("A tak", 500, 204),
      polozka("Treti", 0, 180),
      polozka("Dale", 500, 180),
      polozka("Ctvrty", 0, 140),
      polozka("Konec", 500, 140),
    ]);
    const [levy, pravy] = text.split(/\n\n/);
    expect(pravy).not.toContain("musil");
    expect(pravy).not.toContain("Cm");
    expect(levy).toContain("sem");
    expect(levy).toContain("musil");
    expect(levy).toContain("Cm");
    expect(pravy).toContain("G#m");
    const vlozeni = parsujVlozeni(levy ?? "");
    expect(vlozeni.ok).toBe(true);
    if (!vlozeni.ok) return;
    const verse = vlozeni.telo.bloky[0]?.radky.find((radek) =>
      radek.slabiky.map((slabika) => slabika.text).join("").includes("musil"),
    );
    const akordy = verse?.slabiky.flatMap((slabika) => (slabika.akord === undefined ? [] : [slabika.akord]));
    expect(akordy).toEqual(["C#m", "Cm"]);
  });
});
