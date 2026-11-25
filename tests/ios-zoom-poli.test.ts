import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** Typy, do kterých se nepíše, takže iOS nepřibližuje. */
const BEZ_PISMA = new Set(["checkbox", "radio", "file", "range", "hidden", "button", "submit", "color"]);

function soubory(slozka: string): string[] {
  return readdirSync(slozka, { withFileTypes: true }).flatMap((polozka) => {
    const cesta = join(slozka, polozka.name);
    if (polozka.isDirectory()) return soubory(cesta);
    return cesta.endsWith(".tsx") ? [cesta] : [];
  });
}

/** Otevírací tagy polí. Závorky se počítají, aby tag neskončil na `=>`. */
function poleVeZdroji(zdroj: string): string[] {
  const tagy: string[] = [];
  for (const shoda of zdroj.matchAll(/<(?:input|textarea|select)\b/g)) {
    let i = shoda.index + shoda[0].length;
    let hloubka = 0;
    while (i < zdroj.length && !(zdroj[i] === ">" && hloubka === 0)) {
      if (zdroj[i] === "{") hloubka += 1;
      if (zdroj[i] === "}") hloubka -= 1;
      i += 1;
    }
    tagy.push(zdroj.slice(shoda.index, i));
  }
  return tagy;
}

describe("psaní do pole na iPhonu nepřiblíží stránku", () => {
  it("každé pole má vlastní písmo aspoň 16 px", () => {
    const chyby: string[] = [];
    let celkem = 0;
    for (const soubor of soubory("src")) {
      for (const tag of poleVeZdroji(readFileSync(soubor, "utf8"))) {
        const typ = /type="(\w+)"/.exec(tag)?.[1];
        if (typ !== undefined && BEZ_PISMA.has(typ)) continue;
        // Třídy z konstant hlídá druhý test.
        const trida = /className="([^"]*)"/.exec(tag)?.[1];
        if (trida === undefined) continue;
        celkem += 1;
        const slova = trida.split(/\s+/);
        // Hledání alb v hlavičce je jen na počítači.
        if (soubor.includes("FotkyPage") && slova.includes("h-[46px]")) continue;
        if (!slova.includes("text-base") && !slova.includes("text-xl")) chyby.push(`${soubor}: ${trida}`);
      }
    }
    expect(celkem).toBeGreaterThan(5);
    expect(chyby).toEqual([]);
  });

  it("sdílené třídy polí zmenší písmo až na počítači", () => {
    const zdroje = ["src/components/formular-tridy.ts", "src/components/Auth/authVstupy.tsx"]
      .flatMap((soubor) => readFileSync(soubor, "utf8").split("\n"))
      .filter((radek) => radek.includes("w-full rounded-[11px] border"));
    expect(zdroje.length).toBeGreaterThanOrEqual(4);
    for (const radek of zdroje) {
      expect(radek).toContain(" text-base ");
      expect(radek).not.toMatch(/ (?:sm|md|lg|xl):text-\[1[0-5]/);
    }
  });

  it("pojistka platí jen na iOS", () => {
    expect(readFileSync("src/index.css", "utf8")).toContain("@supports (-webkit-touch-callout: none)");
  });
});
