import { describe, expect, it } from "vitest";
import { klicParu, navrhZeStranky } from "../src/shared/zpevnik";

describe("návrh ze stránky", () => {
  it("vezme název, autora a jednu sloku", () => {
    const navrh = navrhZeStranky("Had\nAutor: Lidová\nH\nAhoj", []);
    expect(navrh.nazev).toBe("Had");
    expect(navrh.autor).toBe("Lidová");
    expect(navrh.problem).toBeNull();
    expect(navrh.telo.bloky[0]?.typ).toBe("sloka");
    expect(navrh.telo.bloky[0]?.radky[0]?.slabiky[0]?.akord).toBe("H");
  });

  it("nechá stránku bez autora ve frontě a ostatní se tím nezastaví", () => {
    const bezAutora = navrhZeStranky("Had\n\nAhoj kamarádi", []);
    const dobra = navrhZeStranky("Chata\nNovák\nText", []);
    expect(bezAutora.problem).toBe("chybi_autor");
    expect(dobra.problem).toBeNull();
  });

  it("označí duplicitu a špatně sedící akord", () => {
    const klic = klicParu("Had", "Lidová");
    expect(navrhZeStranky("Had\nLidová\nAhoj", [klic]).problem).toBe("duplicita");
    expect(navrhZeStranky("Had\nLidová\nH G\n", []).problem).toBe("spatne_akordy");
  });

  it("prázdná stránka nemá text", () => {
    expect(navrhZeStranky("   \n", []).problem).toBe("chybi_text");
  });
});
