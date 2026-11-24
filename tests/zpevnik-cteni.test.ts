import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TeloPisnePohled } from "../src/components/zpevnik/TeloPisnePohled";
import { ctiNastaveni, ctiRychlost, VYCHOZI_NASTAVENI, zapisNastaveni, zapisRychlost } from "../src/lib/zpevnik-cteni";
import { parsujVlozeni } from "../src/shared/zpevnik";

function uloziste(): { getItem(klic: string): string | null; setItem(klic: string, hodnota: string): void } {
  const mapa = new Map<string, string>();
  return { getItem: (klic) => mapa.get(klic) ?? null, setItem: (klic, hodnota) => void mapa.set(klic, hodnota) };
}

function html(text: string, akordy = true): string {
  const vlozeni = parsujVlozeni(text);
  if (!vlozeni.ok) throw new Error("text se nepřečetl");
  return renderToStaticMarkup(createElement(TeloPisnePohled, { telo: vlozeni.telo, akordy }));
}

describe("nastavení čtení", () => {
  it("rychlost se pamatuje zvlášť u každé písně", () => {
    const u = uloziste();
    zapisRychlost(u, "a", 2.5);
    expect(ctiRychlost(u, "a")).toBe(2.5);
    expect(ctiRychlost(u, "b")).toBe(1);
  });

  it("nesmyslná hodnota spadne na výchozí", () => {
    const u = uloziste();
    u.setItem("exapp:zpevnik:rychlost:a", "999");
    u.setItem("exapp:zpevnik:cteni", '{"pismo":40,"akordy":"ano","prodleva":5}');
    expect(ctiRychlost(u, "a")).toBe(1);
    expect(ctiNastaveni(u)).toEqual({ ...VYCHOZI_NASTAVENI, prodleva: 5 });
    u.setItem("exapp:zpevnik:cteni", "{");
    expect(ctiNastaveni(u)).toEqual(VYCHOZI_NASTAVENI);
  });

  it("nastavení přežije uložení a zakázané úložiště nic neshodí", () => {
    const u = uloziste();
    const nastaveni = { pismo: 1.3, akordy: false, prodleva: 10 };
    zapisNastaveni(u, nastaveni);
    expect(ctiNastaveni(u)).toEqual(nastaveni);
    const zakazane = {
      getItem: (): string => {
        throw new Error("zakázáno");
      },
      setItem: (): void => {
        throw new Error("zakázáno");
      },
    };
    expect(() => zapisNastaveni(zakazane, nastaveni)).not.toThrow();
    expect(ctiNastaveni(zakazane)).toEqual(VYCHOZI_NASTAVENI);
  });
});

describe("vykreslení písně", () => {
  it("refrén má viditelný popisek, sloka jen pro čtečky", () => {
    const vystup = html("Sloka tu\ndál\n\nR:\nrefrén tu");
    expect(vystup).toMatch(/<h3 class="sr-only">Sloka<\/h3>/);
    expect(vystup).toMatch(/<h3 class="(?!sr-only)[^"]*">Refrén<\/h3>/);
  });

  it("krátké slovo pod širokým akordem se spojí s dalším", () => {
    expect(html("F#m7\na kdo ví")).toContain("<span>a kdo </span>");
  });

  it("bez akordů zůstane text a předehra zmizí", () => {
    const vystup = html("G  D\n\nC\nAhoj světe\ndál", false);
    expect(vystup).not.toContain("text-okr");
    expect(vystup).toContain("Ahoj světe");
    expect(vystup.match(/<section/g)).toHaveLength(1);
  });
});
