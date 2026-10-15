/**
 * tests/fotky-nahled.test.ts — highlight rule + gallery source contract.
 * No DB, no HTTP, no secrets. Strict TypeScript.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { photos } from "../drizzle/schema/photos";
import { vyberNahledFotky, urlSouboruFotky } from "../src/lib/expedition-fotky";
import { fotkaNahledPath, fotkaSouborPath } from "../src/shared/api-types";

function cti(rel: string): string {
  return readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");
}

interface Fotka {
  id: string;
  jeNahled: boolean;
  createdAt: string;
}

describe("vyberNahledFotky", () => {
  const nejstarsi: Fotka = { id: "a", jeNahled: false, createdAt: "2026-01-01T00:00:00.000Z" };
  const prostredni: Fotka = { id: "b", jeNahled: false, createdAt: "2026-02-01T00:00:00.000Z" };
  const nejnovejsi: Fotka = { id: "c", jeNahled: false, createdAt: "2026-03-01T00:00:00.000Z" };

  it("bez příznaku bere nejstarší fotku", () => {
    expect(vyberNahledFotky([nejstarsi, prostredni, nejnovejsi])?.id).toBe("a");
  });

  it("právě jeden příznak vyhrává, i když není první", () => {
    const sVlajkou: Fotka[] = [
      nejstarsi,
      { ...prostredni, jeNahled: true },
      nejnovejsi,
    ];
    expect(vyberNahledFotky(sVlajkou)?.id).toBe("b");
  });

  it("prázdný seznam nemá náhled", () => {
    expect(vyberNahledFotky([])).toBeNull();
  });
});

describe("adresa souboru v aplikaci", () => {
  it("skládá cestu streamu, ne veřejnou R2 adresu", () => {
    expect(fotkaSouborPath("sumava", "f1")).toBe("/api/expeditions/sumava/fotky/f1/soubor");
    expect(fotkaNahledPath("sumava", "f1")).toBe("/api/expeditions/sumava/fotky/f1/nahled");
    expect(urlSouboruFotky("sumava", "f1").endsWith("/api/expeditions/sumava/fotky/f1/soubor")).toBe(
      true,
    );
  });
});

describe("ExpeditionPhotos — zdroj", () => {
  const zdroj = cti("src/components/expeditions/ExpeditionPhotos.tsx");

  it("obrázek bere aplikační URL a velký náhled neotevírá lightbox", () => {
    expect(zdroj).toContain("urlSouboruFotky");
    expect(zdroj).toContain("Všechny fotky");
    expect(zdroj).toContain("aria-label={popisekFotky}");
    expect(zdroj).not.toContain("Vybrat jako náhled");
    expect(zdroj).not.toContain('aria-label="Zvětšit náhledovou fotku"');
    expect(zdroj).not.toContain('aria-label="Smazat fotku"');
    expect(zdroj).toContain("FotkyMazaciHlavicka");
    expect(zdroj).toContain("Ano, smazat");
    expect(zdroj).toContain("!mazani.mazaciRezim");
    expect(zdroj).toContain("Fotku se nepodařilo načíst.");
    expect(zdroj).not.toContain("src={fotka.url}");
    expect(zdroj).not.toContain("fotka.popis");
  });
});

describe("FotkaDialog — a11y a mazací režim", () => {
  it("dialog má focus-trap, Esc, safe-area a skryté Zavřít v mazání", () => {
    const dialog = cti("src/components/fotky/FotkaDialog.tsx");
    expect(dialog).toContain('role="dialog"');
    expect(dialog).toContain('aria-modal="true"');
    expect(dialog).toContain("FOCUSOVATELNE");
    expect(dialog).toContain('udalost.key === "Escape"');
    expect(dialog).toContain("stopPropagation");
    expect(dialog).toContain("overscroll-contain");
    expect(dialog).toContain("safe-area-inset");
    expect(dialog).toContain("FotkyLightboxNav");
    expect(dialog).toContain("fotkyTlacitkoZaklad");
    const ui = cti("src/components/fotky/fotky-ui.ts");
    expect(ui).toContain("fotkyLightboxNavTlacitko");
    expect(ui).toContain("motion-reduce:active:scale-100");
    expect(ui).toContain("focus-visible:outline-smrk");
    expect(dialog).toContain("onSmazatAktualni");
    expect(dialog).not.toContain("FotkyMazaciHlavicka");
  });
});

describe("highlight a mazání jen pro admina", () => {
  it("lightbox nabízí nastavení náhledu jen adminovi", () => {
    const lightbox = cti("src/components/expeditions/FotkyLightbox.tsx");
    expect(lightbox).toContain("Nastavit náhled");
    expect(lightbox).toContain("isAdmin && !aktualni.jeNahled");
  });

  it("lightbox sdílí focus-trap, Esc capture a reduced-motion tlačítka", () => {
    const lightbox = cti("src/components/expeditions/FotkyLightbox.tsx");
    expect(lightbox).toContain("FOCUSOVATELNE");
    expect(lightbox).toContain("addEventListener(\"keydown\", naStiskKlavesy, true)");
    expect(lightbox).toContain("overscroll-contain");
    expect(lightbox).toContain("safe-area-inset");
    expect(lightbox).toContain("FotkyLightboxNav");
    const ui = cti("src/components/fotky/fotky-ui.ts");
    expect(ui).toContain("fotkyLightboxNavTlacitko");
    expect(ui).toContain("motion-reduce:active:scale-100");
  });

  it("POST náhledu i DELETE fotky hlídá vyzadujAdmina, nahrání zůstává přihlášeným", () => {
    const server = cti("server/src/index.ts");
    const nahrani = usek(
      server,
      "/* POST /api/expeditions/:id/fotky —",
      "/* DELETE /api/expeditions/:id/fotky/:fotkaId",
    );
    expect(nahrani).toContain("vyzadujPrihlaseni");
    expect(nahrani).not.toContain("vyzadujAdmina");

    const mazani = usek(
      server,
      "/* DELETE /api/expeditions/:id/fotky/:fotkaId",
      "/* GET /api/expeditions/:id/fotky/:fotkaId/soubor",
    );
    expect(mazani).toContain("vyzadujAdmina");

    const nahled = usek(
      server,
      "/* POST /api/expeditions/:id/fotky/:fotkaId/nahled",
      "GET /api/meta/skoly-tridy",
    );
    expect(nahled).toContain("vyzadujAdmina");
    expect(nahled).not.toContain("vyzadujPrihlaseni");
  });
});

function usek(zdroj: string, od: string, po: string): string {
  const start = zdroj.indexOf(od);
  if (start < 0) throw new Error(`missing marker: ${od}`);
  const konec = zdroj.indexOf(po, start + od.length);
  if (konec < 0) throw new Error(`missing marker: ${po}`);
  return zdroj.slice(start, konec);
}

describe("photos.je_nahled", () => {
  it("sloupec je boolean NOT NULL s výchozí false", () => {
    const sloupce = new Map(
      getTableConfig(photos).columns.map((sloupec) => [sloupec.name, sloupec]),
    );
    const nahled = sloupce.get("je_nahled");
    expect(nahled?.notNull).toBe(true);
    expect(nahled?.hasDefault).toBe(true);
  });

  it("migrace 0012 jen přidává sloupec", () => {
    const obsah = cti("drizzle/migrations/0012_photos_je_nahled.sql");
    expect(obsah).toContain(
      "ALTER TABLE photos ADD COLUMN IF NOT EXISTS je_nahled BOOLEAN NOT NULL DEFAULT false",
    );
    const bezKomentaru = obsah
      .split("\n")
      .filter((radek) => !radek.trimStart().startsWith("--"))
      .join("\n");
    expect(bezKomentaru).not.toMatch(/\bDROP\b/i);
    expect(bezKomentaru).not.toMatch(/\bDELETE\b/i);
    expect(bezKomentaru).not.toMatch(/\bUPDATE\b/i);
  });
});
